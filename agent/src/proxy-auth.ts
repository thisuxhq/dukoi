// Zero-config private access for exposed apps (`dukoi expose --auth`).
//
// Enforced inside StablePort before forwarding traffic:
// - API clients pass `Authorization: Bearer <token>` or `X-Dukoi-Token: <token>`.
// - Browsers sign in once via `/_dukoi/auth?token=<token>` or the built-in form
//   and get an HMAC-signed HttpOnly session cookie valid for 7 days.
// - Rotating the token invalidates every existing cookie immediately.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http'
import { clientAddress } from './request-log.ts'

export const AUTH_COOKIE = '__dukoi_auth'
export const AUTH_PATH = '/_dukoi/auth'
export const LOGOUT_PATH = '/_dukoi/logout'
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60
const MAX_FORM_BYTES = 4096
const MAX_FAILED_PER_MINUTE = 20

export function generateAuthToken(): string {
  return `dk_${randomBytes(24).toString('base64url')}`
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

function signExpiry(appName: string, token: string, expiresAtSec: number): string {
  return createHmac('sha256', token)
    .update(`dukoi-session-v1:${appName}:${expiresAtSec}`)
    .digest('base64url')
}

export function makeSessionCookie(
  appName: string,
  token: string,
  secure: boolean,
  nowMs = Date.now(),
): string {
  const expires = Math.floor(nowMs / 1000) + SESSION_TTL_SECONDS
  const sig = signExpiry(appName, token, expires)
  const parts = [
    `${AUTH_COOKIE}=${expires}.${sig}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function clearSessionCookie(secure: boolean): string {
  const parts = [`${AUTH_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0']
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function verifySessionCookie(
  appName: string,
  token: string,
  cookieHeader: string | undefined,
  nowMs = Date.now(),
): boolean {
  if (!cookieHeader) return false
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const name = part.slice(0, eq).trim()
    if (name !== AUTH_COOKIE) continue
    const value = part.slice(eq + 1).trim()
    const dot = value.indexOf('.')
    if (dot === -1) return false
    const expires = Number(value.slice(0, dot))
    const sig = value.slice(dot + 1)
    if (!Number.isInteger(expires) || expires <= Math.floor(nowMs / 1000)) return false
    return safeEqual(sig, signExpiry(appName, token, expires))
  }
  return false
}

export type AuthMethod = 'bearer' | 'header' | 'cookie'

/** Checks whether an incoming request carries a valid token or session cookie. */
export function checkAuth(
  appName: string,
  token: string,
  headers: IncomingHttpHeaders,
  nowMs = Date.now(),
): AuthMethod | null {
  const auth = headers.authorization
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    const candidate = auth.slice(7).trim()
    if (safeEqual(candidate, token)) return 'bearer'
  }
  const xToken = headers['x-dukoi-token']
  if (typeof xToken === 'string' && safeEqual(xToken.trim(), token)) {
    return 'header'
  }
  if (verifySessionCookie(appName, token, headers.cookie, nowMs)) {
    return 'cookie'
  }
  return null
}

/** Removes Dukoi's own proxy auth credentials before forwarding to the app. */
export function stripAuthHeaders(
  headers: IncomingHttpHeaders,
  method: AuthMethod,
): IncomingHttpHeaders {
  const out: IncomingHttpHeaders = { ...headers }
  delete out['x-dukoi-token']
  if (method === 'bearer') delete out.authorization
  if (typeof out.cookie === 'string') {
    const kept = out.cookie
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith(`${AUTH_COOKIE}=`))
    if (kept.length > 0) out.cookie = kept.join('; ')
    else delete out.cookie
  }
  return out
}

/** Only allow same-origin relative paths so `/_dukoi/auth?next=...` can't open-redirect. */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw?.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/'
  if (raw.startsWith(AUTH_PATH) || raw.startsWith(LOGOUT_PATH)) return '/'
  return raw
}

export class AuthRateLimiter {
  private hits = new Map<string, number[]>()

  recordFailure(ip: string, nowMs = Date.now()): boolean {
    const cutoff = nowMs - 60_000
    const list = (this.hits.get(ip) ?? []).filter((t) => t > cutoff)
    list.push(nowMs)
    this.hits.set(ip, list)
    if (this.hits.size > 500) {
      for (const [k, v] of this.hits) {
        if (v.every((t) => t <= cutoff)) this.hits.delete(k)
      }
    }
    return list.length > MAX_FAILED_PER_MINUTE
  }

  isLimited(ip: string, nowMs = Date.now()): boolean {
    const cutoff = nowMs - 60_000
    const list = this.hits.get(ip)
    if (!list) return false
    const recent = list.filter((t) => t > cutoff)
    if (recent.length === 0) {
      this.hits.delete(ip)
      return false
    }
    return recent.length >= MAX_FAILED_PER_MINUTE
  }
}

function isHttps(headers: IncomingHttpHeaders): boolean {
  const proto = headers['x-forwarded-proto']
  return typeof proto === 'string' && proto.split(',')[0]?.trim().toLowerCase() === 'https'
}

function wantsHtml(headers: IncomingHttpHeaders): boolean {
  const accept = headers.accept ?? ''
  return accept.includes('text/html')
}

export function sendUnauthorized(
  appName: string,
  req: IncomingMessage,
  res: ServerResponse,
  errorText?: string,
): void {
  if (wantsHtml(req.headers)) {
    const next = safeNextPath(req.url)
    res.writeHead(401, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    })
    res.end(loginPage(appName, next, errorText))
    return
  }
  res.writeHead(401, {
    'content-type': 'application/json; charset=utf-8',
    'www-authenticate': 'Bearer realm="dukoi"',
    'cache-control': 'no-store',
  })
  res.end(
    JSON.stringify({
      error: 'AUTH_REQUIRED',
      message:
        errorText ??
        'This app requires an access token. Send Authorization: Bearer <token> or sign in from a browser.',
    }),
  )
}

/** Handles `/_dukoi/auth` and `/_dukoi/logout` directly in the proxy without logging secrets. */
export async function handleAuthRoute(
  appName: string,
  token: string,
  limiter: AuthRateLimiter,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://phone')
  const secure = isHttps(req.headers)
  const ip = clientAddress(req.headers, req.socket.remoteAddress) ?? 'unknown'

  if (url.pathname === LOGOUT_PATH && req.method === 'POST') {
    res.writeHead(303, {
      'set-cookie': clearSessionCookie(secure),
      location: '/',
      'cache-control': 'no-store',
    })
    res.end()
    return true
  }

  if (url.pathname !== AUTH_PATH) return false

  if (req.method === 'GET') {
    const next = safeNextPath(url.searchParams.get('next'))
    const candidate = url.searchParams.get('token')
    if (!candidate) {
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      })
      res.end(loginPage(appName, next))
      return true
    }
    if (limiter.isLimited(ip)) {
      sendTooMany(req, res)
      return true
    }
    if (safeEqual(candidate.trim(), token)) {
      res.writeHead(303, {
        'set-cookie': makeSessionCookie(appName, token, secure),
        location: next,
        'cache-control': 'no-store',
      })
      res.end()
      return true
    }
    limiter.recordFailure(ip)
    res.writeHead(401, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    })
    res.end(loginPage(appName, next, 'That access token isn’t right.'))
    return true
  }

  if (req.method === 'POST') {
    if (limiter.isLimited(ip)) {
      sendTooMany(req, res)
      return true
    }
    const body = await readSmallBody(req)
    const form = new URLSearchParams(body)
    const next = safeNextPath(form.get('next'))
    const candidate = form.get('token')?.trim() ?? ''
    if (candidate && safeEqual(candidate, token)) {
      res.writeHead(303, {
        'set-cookie': makeSessionCookie(appName, token, secure),
        location: next,
        'cache-control': 'no-store',
      })
      res.end()
      return true
    }
    limiter.recordFailure(ip)
    res.writeHead(401, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    })
    res.end(loginPage(appName, next, 'That access token isn’t right.'))
    return true
  }

  res.writeHead(405, { 'content-type': 'text/plain' })
  res.end('Method not allowed.')
  return true
}

function sendTooMany(req: IncomingMessage, res: ServerResponse): void {
  if (wantsHtml(req.headers)) {
    res.writeHead(429, {
      'content-type': 'text/html; charset=utf-8',
      'retry-after': '60',
      'cache-control': 'no-store',
    })
    res.end(loginPage('Private app', '/', 'Too many tries. Wait a minute and try again.'))
    return
  }
  res.writeHead(429, {
    'content-type': 'application/json; charset=utf-8',
    'retry-after': '60',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify({ error: 'TOO_MANY_ATTEMPTS', message: 'Too many tries. Wait a minute.' }))
}

function readSmallBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      if (size < MAX_FORM_BYTES) {
        chunks.push(chunk.subarray(0, MAX_FORM_BYTES - size))
        size += chunk.length
      }
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', () => resolve(''))
  })
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function loginPage(appName: string, next: string, errorText?: string): string {
  const safeName = escapeHtml(appName)
  const safeNext = escapeHtml(next)
  const err = errorText ? `<p class="err">${escapeHtml(errorText)}</p>` : ''
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeName} · Sign in</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;background:#f1f0f4;color:#16161a;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif}
  main{width:100%;max-width:380px;background:#fff;padding:28px;border:1px solid #ecebf0}
  h1{margin:0 0 6px;font-size:24px;font-weight:600;letter-spacing:-0.02em;word-break:break-word}
  p{margin:0 0 20px;color:#6e6d78;font-size:14px}
  label{display:block;font-size:13px;font-weight:500;margin-bottom:6px}
  input{width:100%;height:42px;padding:0 12px;border:1px solid #dad9e0;font:14px ui-monospace,SFMono-Regular,Menlo,monospace;color:#16161a;background:#fff}
  input:focus{outline:2px solid #7b3ff2;outline-offset:-1px;border-color:#7b3ff2}
  button{margin-top:14px;width:100%;height:42px;border:0;background:#7b3ff2;color:#fff;font:600 14px inherit;cursor:pointer}
  button:hover{background:#682ee0}
  .err{margin:12px 0 0;padding:10px 12px;background:#fbe2e4;color:#c62a2f;font-size:13px}
</style>
</head>
<body>
<main>
  <h1>${safeName}</h1>
  <p>Enter the access token to open this app.</p>
  <form method="post" action="${AUTH_PATH}">
    <input type="hidden" name="next" value="${safeNext}">
    <label for="token">Access token</label>
    <input id="token" name="token" type="password" autocomplete="current-password" required autofocus placeholder="dk_…">
    <button type="submit">Continue</button>
    ${err}
  </form>
</main>
</body>
</html>`
}
