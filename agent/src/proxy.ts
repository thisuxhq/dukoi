// Each app's stable port. It forwards to whichever release is live, so a
// deploy or rollback switches traffic without the URL changing. It also keeps
// the last 100 HTTP requests in memory for `dukoi inspect` and `dukoi replay`,
// and enforces optional proxy-level access control (`dukoi expose --auth`).
import { randomBytes } from 'node:crypto'
import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  request,
  type Server,
  type ServerResponse,
} from 'node:http'
import { connect } from 'node:net'
import type { RequestDetail } from '@dukoi/shared'
import { HttpError } from './http.ts'
import {
  AUTH_COOKIE,
  AuthRateLimiter,
  checkAuth,
  handleAuthRoute,
  sendUnauthorized,
  stripAuthHeaders,
} from './proxy-auth.ts'
import { BodyCollector, clientAddress, RequestLog } from './request-log.ts'

const REPLAY_TOKEN_HEADER = 'x-dukoi-replay-token'
const REPLAY_TIMEOUT_MS = 30_000
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
  REPLAY_TOKEN_HEADER,
])

interface PendingReplay {
  fromId: string
  resolve: (detail: RequestDetail) => void
}

export class StablePort {
  /** Port of the live release, or null while nothing is running */
  target: number | null = null
  /** When set, visitors must present this token or a signed session cookie. */
  authToken: string | null = null
  readonly requests = new RequestLog()
  private server: Server
  private pendingReplays = new Map<string, PendingReplay>()
  private authLimiter = new AuthRateLimiter()

  constructor(
    readonly port: number,
    private appName: string,
  ) {
    this.server = createServer((req, res) => {
      void this.handleHttp(req, res)
    })

    // WebSockets and other upgrades: enforce auth, then join the two sockets.
    this.server.on('upgrade', (req, socket, head) => {
      if (!this.target) return socket.destroy()
      let authMethod: ReturnType<typeof checkAuth> = null
      if (this.authToken) {
        authMethod = checkAuth(this.appName, this.authToken, req.headers)
        if (!authMethod) {
          socket.write(
            'HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Bearer realm="dukoi"\r\nConnection: close\r\n\r\n',
          )
          socket.destroy()
          return
        }
      }
      const up = connect(this.target, '127.0.0.1', () => {
        const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`]
        for (let i = 0; i < req.rawHeaders.length; i += 2) {
          const name = req.rawHeaders[i] as string
          const val = req.rawHeaders[i + 1] as string
          const lower = name.toLowerCase()
          if (lower === 'x-dukoi-token') continue
          if (authMethod === 'bearer' && lower === 'authorization') continue
          if (lower === 'cookie' && this.authToken) {
            const kept = val
              .split(';')
              .map((s) => s.trim())
              .filter((s) => s && !s.startsWith(`${AUTH_COOKIE}=`))
            if (kept.length > 0) lines.push(`${name}: ${kept.join('; ')}`)
            continue
          }
          lines.push(`${name}: ${val}`)
        }
        up.write(`${lines.join('\r\n')}\r\n\r\n`)
        if (head.length) up.write(head)
        up.pipe(socket).pipe(up)
      })
      up.on('error', () => socket.destroy())
      socket.on('error', () => up.destroy())
    })
  }

  private async handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Handle `/_dukoi/auth` and `/_dukoi/logout` directly so access tokens never enter RequestLog.
    if (this.authToken) {
      if (await handleAuthRoute(this.appName, this.authToken, this.authLimiter, req, res)) return
    }

    const startedAt = new Date()
    const startMs = Date.now()
    const method = req.method ?? 'GET'
    const path = req.url ?? '/'

    const token =
      typeof req.headers[REPLAY_TOKEN_HEADER] === 'string' ? req.headers[REPLAY_TOKEN_HEADER] : null
    const pending = token ? (this.pendingReplays.get(token) ?? null) : null
    if (token && pending) this.pendingReplays.delete(token)

    const cleanReqHeaders: IncomingHttpHeaders = { ...req.headers }
    delete cleanReqHeaders[REPLAY_TOKEN_HEADER]

    const reqCollector = new BodyCollector()
    const resCollector = new BodyCollector()
    req.on('data', (chunk: Buffer) => reqCollector.push(chunk))

    let status = 0
    let resHeaders: OutgoingHttpHeaders | IncomingHttpHeaders = {}
    let recorded = false
    const finalize = () => {
      if (recorded) return
      recorded = true
      const detail = this.requests.record({
        at: startedAt,
        method,
        path,
        status,
        durationMs: Date.now() - startMs,
        from: clientAddress(cleanReqHeaders, req.socket.remoteAddress),
        replayedFrom: pending?.fromId ?? null,
        reqHeaders: cleanReqHeaders,
        reqCollector,
        resHeaders,
        resCollector,
      })
      pending?.resolve(detail)
    }
    res.once('finish', finalize)
    res.once('close', finalize)

    let forwardHeaders = cleanReqHeaders
    if (this.authToken && !pending) {
      const ip = clientAddress(cleanReqHeaders, req.socket.remoteAddress) ?? 'unknown'
      const authMethod = checkAuth(this.appName, this.authToken, cleanReqHeaders)
      if (!authMethod) {
        const triedCredential =
          typeof cleanReqHeaders.authorization === 'string' ||
          typeof cleanReqHeaders['x-dukoi-token'] === 'string'
        if (triedCredential && this.authLimiter.recordFailure(ip)) {
          status = 429
          resHeaders = { 'content-type': 'application/json; charset=utf-8', 'retry-after': '60' }
          const msg = JSON.stringify({
            error: 'TOO_MANY_ATTEMPTS',
            message: 'Too many tries. Wait a minute.',
          })
          resCollector.push(msg)
          res.writeHead(status, resHeaders)
          res.end(msg)
          return
        }
        status = 401
        resHeaders = { 'cache-control': 'no-store' }
        sendUnauthorized(this.appName, req, res)
        return
      }
      forwardHeaders = stripAuthHeaders(cleanReqHeaders, authMethod)
    }

    if (!this.target) {
      const msg = `${this.appName} isn't running right now.`
      status = 503
      resHeaders = { 'content-type': 'text/plain', 'retry-after': '2' }
      resCollector.push(msg)
      res.writeHead(status, resHeaders)
      res.end(msg)
      return
    }

    const upstream = request(
      {
        host: '127.0.0.1',
        port: this.target,
        method,
        path,
        headers: { ...forwardHeaders, 'x-forwarded-for': req.socket.remoteAddress ?? '' },
      },
      (up) => {
        status = up.statusCode ?? 502
        resHeaders = up.headers
        up.on('data', (chunk: Buffer) => resCollector.push(chunk))
        res.writeHead(status, up.headers)
        up.pipe(res)
      },
    )
    upstream.on('error', () => {
      if (!res.headersSent) {
        const msg = `${this.appName} didn't answer.`
        status = 502
        resHeaders = { 'content-type': 'text/plain' }
        resCollector.push(msg)
        res.writeHead(status, resHeaders)
        res.end(msg)
        return
      }
      res.end()
    })
    req.pipe(upstream)
  }

  /** Re-sends a captured request through this stable port so it runs and gets captured again. */
  async replay(id: string): Promise<RequestDetail> {
    const stored = this.requests.getRaw(id)
    if (!stored) {
      throw new HttpError(
        404,
        'NO_SUCH_REQUEST',
        `There's no captured request "${id}" for ${this.appName}.`,
        `Dukoi keeps the last 100 requests in memory. Run \`dukoi inspect ${this.appName}\` to see them.`,
      )
    }
    if (!this.target) {
      throw new HttpError(
        409,
        'APP_STOPPED',
        `${this.appName} isn't running right now.`,
        `Run \`dukoi start ${this.appName}\`, then replay again.`,
      )
    }
    if (stored.reqTruncated) {
      throw new HttpError(
        422,
        'BODY_TRUNCATED',
        `Request ${id} had a body over 64 KB, so Dukoi didn't keep all of it to replay.`,
      )
    }

    const headers: Record<string, string> = {}
    for (const [k, v] of Object.entries(stored.rawReqHeaders)) {
      if (!HOP_BY_HOP.has(k.toLowerCase())) headers[k] = v
    }
    if (stored.reqBody.length > 0) headers['content-length'] = String(stored.reqBody.length)

    const token = randomBytes(16).toString('base64url')
    headers[REPLAY_TOKEN_HEADER] = token

    let resolveDetail!: (detail: RequestDetail) => void
    const detailPromise = new Promise<RequestDetail>((resolve) => {
      resolveDetail = resolve
    })
    this.pendingReplays.set(token, { fromId: id, resolve: resolveDetail })

    try {
      await new Promise<void>((resolve, reject) => {
        const req = request(
          {
            host: '127.0.0.1',
            port: this.port,
            method: stored.summary.method,
            path: stored.summary.path,
            headers,
            timeout: REPLAY_TIMEOUT_MS,
          },
          (res) => {
            res.resume()
            res.once('end', resolve)
            res.once('error', reject)
          },
        )
        req.once('timeout', () => {
          req.destroy(
            new HttpError(
              504,
              'REPLAY_TIMEOUT',
              `${this.appName} didn't answer within ${REPLAY_TIMEOUT_MS / 1000} seconds.`,
            ),
          )
        })
        req.once('error', reject)
        if (stored.reqBody.length > 0) req.write(stored.reqBody)
        req.end()
      })
      return await detailPromise
    } finally {
      this.pendingReplays.delete(token)
    }
  }

  listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(this.port, '0.0.0.0', () => resolve())
    })
  }

  close(): Promise<void> {
    return new Promise((resolve) => this.server.close(() => resolve()))
  }
}

/** A free port on 127.0.0.1 for a release to listen on. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer()
    s.once('error', reject)
    s.listen(0, '127.0.0.1', () => {
      const address = s.address()
      const port = typeof address === 'object' && address ? address.port : 0
      s.close(() => resolve(port))
    })
  })
}
