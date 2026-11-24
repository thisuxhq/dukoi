import { afterAll, beforeAll, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type AppAuthResult, type AppInfo, generateKeyPair, signRequest } from '@dukoi/shared'
import { Agent } from './agent.ts'
import { freePort, StablePort } from './proxy.ts'
import {
  AUTH_COOKIE,
  AUTH_PATH,
  generateAuthToken,
  LOGOUT_PATH,
  makeSessionCookie,
  safeNextPath,
  verifySessionCookie,
} from './proxy-auth.ts'

test('safeNextPath rejects open redirects and auth loops', () => {
  expect(safeNextPath('/notes?q=1')).toBe('/notes?q=1')
  expect(safeNextPath('//evil.example/steal')).toBe('/')
  expect(safeNextPath('https://evil.example')).toBe('/')
  expect(safeNextPath('/\\evil.example')).toBe('/')
  expect(safeNextPath('/_dukoi/auth')).toBe('/')
  expect(safeNextPath('/_dukoi/logout')).toBe('/')
  expect(safeNextPath(null)).toBe('/')
})

test('session cookies are bound to app name, token and expiry', () => {
  const token = generateAuthToken()
  const now = 1_700_000_000_000
  const setCookie = makeSessionCookie('notes', token, true, now)
  expect(setCookie).toContain('HttpOnly')
  expect(setCookie).toContain('SameSite=Lax')
  expect(setCookie).toContain('Secure')

  const cookiePair = setCookie.split(';')[0] as string
  expect(verifySessionCookie('notes', token, cookiePair, now + 1000)).toBe(true)
  // Different app name fails
  expect(verifySessionCookie('other', token, cookiePair, now + 1000)).toBe(false)
  // Rotated token invalidates existing cookie immediately
  expect(verifySessionCookie('notes', generateAuthToken(), cookiePair, now + 1000)).toBe(false)
  // Expired cookie fails
  expect(verifySessionCookie('notes', token, cookiePair, now + 8 * 24 * 60 * 60 * 1000)).toBe(false)
})

let upstream: Server
let upstreamPort = 0
let stable: StablePort
let stablePortNum = 0
let lastHeaders: Record<string, string | string[] | undefined> = {}

beforeAll(async () => {
  upstreamPort = await freePort()
  upstream = createServer((req, res) => {
    lastHeaders = req.headers
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, path: req.url }))
  })
  upstream.on('upgrade', (_req, socket) => {
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n',
    )
    socket.end()
  })
  await new Promise<void>((resolve) => upstream.listen(upstreamPort, '127.0.0.1', resolve))

  stablePortNum = await freePort()
  stable = new StablePort(stablePortNum, 'notes')
  stable.target = upstreamPort
  await stable.listen()
})

afterAll(async () => {
  await stable.close()
  await new Promise<void>((resolve) => upstream.close(() => resolve()))
})

test('StablePort gates HTTP and WebSocket traffic when authToken is set', async () => {
  const token = generateAuthToken()
  stable.authToken = token
  stable.requests.clear()

  // API request without token → 401 JSON
  const unauthApi = await fetch(`http://127.0.0.1:${stablePortNum}/api/notes`)
  expect(unauthApi.status).toBe(401)
  expect(unauthApi.headers.get('www-authenticate')).toContain('Bearer')
  expect(((await unauthApi.json()) as { error: string }).error).toBe('AUTH_REQUIRED')

  // Browser request without token → 401 HTML sign-in form
  const unauthHtml = await fetch(`http://127.0.0.1:${stablePortNum}/`, {
    headers: { accept: 'text/html' },
  })
  expect(unauthHtml.status).toBe(401)
  const html = await unauthHtml.text()
  expect(html).toContain('Enter the access token')
  expect(html).toContain(AUTH_PATH)

  // Bearer token passes and is stripped before reaching upstream app
  const authed = await fetch(`http://127.0.0.1:${stablePortNum}/api/notes`, {
    headers: { authorization: `Bearer ${token}` },
  })
  expect(authed.status).toBe(200)
  expect(await authed.json()).toEqual({ ok: true, path: '/api/notes' })
  expect(lastHeaders.authorization).toBeUndefined()

  // One-click sign-in link sets cookie and redirects cleanly without entering RequestLog
  const beforeCount = stable.requests.list().length
  const login = await fetch(
    `http://127.0.0.1:${stablePortNum}${AUTH_PATH}?token=${encodeURIComponent(token)}&next=/secret`,
    { redirect: 'manual' },
  )
  expect(login.status).toBe(303)
  expect(login.headers.get('location')).toBe('/secret')
  const setCookie = login.headers.get('set-cookie') ?? ''
  expect(setCookie).toContain(`${AUTH_COOKIE}=`)
  // Login route never leaked into RequestLog
  expect(stable.requests.list().length).toBe(beforeCount)

  // Session cookie works on subsequent requests and is stripped from upstream cookies
  const cookiePair = setCookie.split(';')[0] as string
  const withCookie = await fetch(`http://127.0.0.1:${stablePortNum}/secret`, {
    headers: { cookie: `${cookiePair}; theme=dark` },
  })
  expect(withCookie.status).toBe(200)
  expect(lastHeaders.cookie).toBe('theme=dark')

  // WebSocket upgrade without auth is rejected with 401
  const wsRejected = await rawUpgrade(stablePortNum, '/ws')
  expect(wsRejected).toContain('401 Unauthorized')

  // WebSocket upgrade with cookie succeeds (101)
  const wsAccepted = await rawUpgrade(stablePortNum, '/ws', { cookie: cookiePair })
  expect(wsAccepted).toContain('101 Switching Protocols')

  // Logout clears cookie
  const logout = await fetch(`http://127.0.0.1:${stablePortNum}${LOGOUT_PATH}`, {
    method: 'POST',
    redirect: 'manual',
  })
  expect(logout.status).toBe(303)
  expect(logout.headers.get('set-cookie')).toContain('Max-Age=0')

  // Replay still works while auth is enabled
  const lastAuthedId = stable.requests.list().at(-1)?.id ?? ''
  const replayed = await stable.replay(lastAuthedId)
  expect(replayed.status).toBe(200)
  expect(replayed.replayedFrom).toBe(lastAuthedId)
})

test('Agent /apps/:name/auth routes persist, rotate and disable auth', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dukoi-auth-agent-'))
  const port = 17070 + Math.floor(Math.random() * 1000)
  const agent = new Agent({
    home,
    adminPort: port,
    nodePath: process.execPath,
    cloudflaredPath: null,
    valkeyPath: null,
    postgresScript: null,
    cloudflareApi: 'http://127.0.0.1:9',
    templatesDir: '/nonexistent',
    phone: { name: 'test-phone', model: 'Test', android: '16' },
  })
  const computer = generateKeyPair()
  agent.store.state.computers.push({
    publicKey: computer.publicKey,
    name: 'Test Mac',
    pairedAt: new Date().toISOString(),
  })
  agent.store.state.apps.push({
    name: 'demo',
    port: await freePort(),
    release: null,
    wanted: false,
    createdAt: new Date().toISOString(),
  })
  agent.store.save()
  await agent.start()

  const callAdmin = async <T>(method: string, path: string, body = ''): Promise<T> => {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...signRequest({ method, path, body }, computer),
      },
      body: body || undefined,
    })
    expect(res.ok).toBe(true)
    return (await res.json()) as T
  }

  try {
    // Initially off
    const before = await callAdmin<AppAuthResult>('GET', '/apps/demo/auth')
    expect(before).toEqual({ app: 'demo', auth: false, token: null })

    // Enable creates a token; GET /apps shows auth: true without exposing the token
    const enabled = await callAdmin<AppAuthResult>('POST', '/apps/demo/auth', '{}')
    expect(enabled.auth).toBe(true)
    expect(enabled.token).toMatch(/^dk_/)
    const apps = await callAdmin<AppInfo[]>('GET', '/apps')
    expect(apps[0]?.auth).toBe(true)
    expect(JSON.stringify(apps)).not.toContain(enabled.token as string)

    // Idempotent enable keeps same token
    const again = await callAdmin<AppAuthResult>('POST', '/apps/demo/auth', '{}')
    expect(again.token).toBe(enabled.token)

    // Rotate changes token
    const rotated = await callAdmin<AppAuthResult>(
      'POST',
      '/apps/demo/auth',
      JSON.stringify({ rotate: true }),
    )
    expect(rotated.token).not.toBe(enabled.token)

    // Disable clears token
    const disabled = await callAdmin<AppAuthResult>('DELETE', '/apps/demo/auth')
    expect(disabled).toEqual({ app: 'demo', auth: false, token: null })
  } finally {
    await agent.stop()
    rmSync(home, { recursive: true, force: true })
  }
})

function rawUpgrade(
  port: number,
  path: string,
  extraHeaders: Record<string, string> = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const sock = connect(port, '127.0.0.1', () => {
      const lines = [
        `GET ${path} HTTP/1.1`,
        `Host: 127.0.0.1:${port}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
        'Sec-WebSocket-Version: 13',
        ...Object.entries(extraHeaders).map(([k, v]) => `${k}: ${v}`),
      ]
      sock.write(`${lines.join('\r\n')}\r\n\r\n`)
    })
    let out = ''
    sock.on('data', (chunk) => {
      out += chunk.toString('utf8')
      if (out.includes('\r\n\r\n')) {
        sock.destroy()
        resolve(out)
      }
    })
    sock.on('end', () => resolve(out))
    sock.on('error', reject)
  })
}
