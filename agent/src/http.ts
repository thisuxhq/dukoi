// A small router for the admin API, with signed requests and responses.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import {
  type ApiError,
  HEADER,
  NonceCache,
  PROTOCOL_VERSION,
  signResponse,
  verifyRequest,
} from '@dukoi/shared'

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly hint?: string,
  ) {
    super(message)
  }
}

export interface Ctx {
  req: IncomingMessage
  res: ServerResponse
  params: Record<string, string>
  query: URLSearchParams
  /** The paired computer that signed this request, if any */
  computer: string | null
  /** Reads the whole body (JSON routes). Signature was checked against it. */
  body: Buffer
  json<T>(): T
}

type Access = 'public' | 'paired' | 'local'

interface Route {
  method: string
  parts: string[]
  access: Access
  /** Stream the body to the handler instead of buffering it (uploads) */
  raw: boolean
  handler: (ctx: Ctx) => Promise<unknown> | unknown
}

const MAX_JSON_BODY = 1024 * 1024

export class Router {
  private routes: Route[] = []
  private nonces = new NonceCache()

  constructor(
    private privateKeyPem: string,
    private isPaired: (publicKey: string) => boolean,
  ) {}

  on(
    method: string,
    path: string,
    access: Access,
    handler: Route['handler'],
    opts: { raw?: boolean } = {},
  ): void {
    this.routes.push({
      method,
      parts: path.split('/').filter(Boolean),
      access,
      raw: !!opts.raw,
      handler,
    })
  }

  private match(method: string, pathname: string) {
    const parts = pathname.split('/').filter(Boolean)
    for (const route of this.routes) {
      if (route.method !== method || route.parts.length !== parts.length) continue
      const params: Record<string, string> = {}
      const ok = route.parts.every((p, i) => {
        const value = parts[i] as string
        if (p.startsWith(':')) {
          params[p.slice(1)] = decodeURIComponent(value)
          return true
        }
        return p === value
      })
      if (ok) return { route, params }
    }
    return null
  }

  listen(port: number, host = '0.0.0.0'): Server {
    const server = createServer((req, res) => {
      this.handle(req, res).catch((err) => this.fail(req, res, err))
    })
    server.listen(port, host)
    return server
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://phone')
    const found = this.match(req.method ?? 'GET', url.pathname)
    if (!found)
      throw new HttpError(404, 'NOT_FOUND', `No such endpoint: ${req.method} ${url.pathname}`)
    const { route, params } = found

    if (route.access === 'local' && !isLoopback(req)) {
      throw new HttpError(403, 'LOCAL_ONLY', 'This endpoint only answers the phone itself.')
    }

    // Uploads are streamed; their signature covers an empty body, and the
    // handler checks the upload's own hash header.
    const body = route.raw ? Buffer.alloc(0) : await readBody(req, MAX_JSON_BODY)
    let computer: string | null = null
    if (route.access === 'paired') {
      const pathWithQuery = url.pathname + url.search
      const check = verifyRequest(
        { method: req.method ?? 'GET', path: pathWithQuery, body },
        req.headers,
        this.nonces,
      )
      if (!check.ok)
        throw new HttpError(
          401,
          check.code,
          check.message,
          'Run `dukoi pair` to pair this computer again.',
        )
      if (!this.isPaired(check.publicKey)) {
        throw new HttpError(
          401,
          'NOT_PAIRED',
          'This computer isn’t paired with this phone.',
          'Run `dukoi pair`.',
        )
      }
      computer = check.publicKey
    }

    const ctx: Ctx = {
      req,
      res,
      params,
      query: url.searchParams,
      computer,
      body,
      json<T>() {
        try {
          return JSON.parse(body.toString('utf8') || '{}') as T
        } catch {
          throw new HttpError(400, 'BAD_JSON', 'The request body isn’t valid JSON.')
        }
      },
    }
    const result = await route.handler(ctx)
    if (!res.headersSent) this.send(req, res, 200, result ?? { ok: true })
  }

  /** Sends JSON, signed with the phone's key for the request's nonce. */
  send(req: IncomingMessage, res: ServerResponse, status: number, value: unknown): void {
    const body = JSON.stringify(value)
    const nonce = req.headers[HEADER.nonce]
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      [HEADER.protocol]: String(PROTOCOL_VERSION),
    }
    if (typeof nonce === 'string') {
      headers[HEADER.signature] = signResponse(status, nonce, body, this.privateKeyPem)
    }
    res.writeHead(status, headers)
    res.end(body)
  }

  private fail(req: IncomingMessage, res: ServerResponse, err: unknown): void {
    if (res.headersSent) {
      res.destroy()
      return
    }
    if (err instanceof HttpError) {
      const body: ApiError = {
        code: err.code,
        message: err.message,
        ...(err.hint ? { hint: err.hint } : {}),
      }
      this.send(req, res, err.status, body)
      return
    }
    console.error(err)
    this.send(req, res, 500, {
      code: 'INTERNAL',
      message: 'Something went wrong on the phone. Check the agent log.',
    })
  }
}

function isLoopback(req: IncomingMessage): boolean {
  const a = req.socket.remoteAddress ?? ''
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1'
}

async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > limit) throw new HttpError(413, 'TOO_LARGE', 'The request body is too large.')
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks)
}
