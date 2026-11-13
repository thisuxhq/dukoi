import { afterAll, beforeAll, expect, test } from 'bun:test'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AppInfo, DomainStatus } from '@dukoi/shared'
import { Agent } from './agent.ts'

// A fake cloudflared and a fake Cloudflare API, so the whole domain flow runs
// without a real account.

const home = mkdtempSync(join(tmpdir(), 'dukoi-domains-'))
const TUNNEL_ID = '11111111-2222-3333-4444-555555555555'
const cert = Buffer.from(
  JSON.stringify({ zoneID: 'z1', accountID: 'a1', apiToken: 't1' }),
).toString('base64')

const fake = join(home, 'cloudflared')
writeFileSync(
  fake,
  `#!/usr/bin/env node
const fs = require('node:fs'), path = require('node:path')
const dir = path.join(process.env.HOME, '.cloudflared')
fs.mkdirSync(dir, { recursive: true })
const args = process.argv.slice(2).filter((a) => a !== 'tunnel' && a !== '--no-autoupdate')
if (args[0] === 'login') {
  console.log('Please open the following URL and log in with your Cloudflare account:\\n')
  console.log('https://dash.cloudflare.com/argotunnel?aud=&callback=https%3A%2F%2Fexample')
  setTimeout(() => {
    fs.writeFileSync(path.join(dir, 'cert.pem'), '-----BEGIN ARGO TUNNEL TOKEN-----\\n${cert}\\n-----END ARGO TUNNEL TOKEN-----\\n')
  }, 300)
} else if (args[0] === 'create') {
  fs.writeFileSync(path.join(dir, '${TUNNEL_ID}.json'), '{}')
  console.log('Created tunnel ' + args[1] + ' with id ${TUNNEL_ID}')
} else if (args[0] === 'delete') {
  fs.rmSync(path.join(dir, '${TUNNEL_ID}.json'), { force: true })
  fs.writeFileSync(path.join(process.env.HOME, 'deleted'), args[args.length - 1])
} else if (args.includes('run')) {
  console.log('INF Registered tunnel connection connIndex=0')
  setInterval(() => {}, 1000)
}
`,
)
chmodSync(fake, 0o755)

interface Record {
  id: string
  type: string
  name: string
  content: string
  proxied: boolean
  comment?: string | null
}
const records: Record[] = []
let nextId = 1
const api: Server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://cf')
  let body = ''
  req.on('data', (c) => {
    body += c
  })
  req.on('end', () => {
    const send = (result: unknown) => res.end(JSON.stringify({ success: true, result }))
    if (req.headers.authorization !== 'Bearer t1')
      return res.end(JSON.stringify({ success: false, errors: [{ message: 'bad token' }] }))
    if (url.pathname === '/zones/z1') return send({ name: 'example.com' })
    const recordId = url.pathname.match(/^\/zones\/z1\/dns_records\/(.+)$/)?.[1]
    if (url.pathname === '/zones/z1/dns_records' && req.method === 'GET') {
      return send(records.filter((r) => r.name === url.searchParams.get('name')))
    }
    if (url.pathname === '/zones/z1/dns_records' && req.method === 'POST') {
      const r = { id: String(nextId++), ...JSON.parse(body) }
      records.push(r)
      return send(r)
    }
    if (recordId && req.method === 'PUT') {
      const i = records.findIndex((r) => r.id === recordId)
      records[i] = { id: recordId, ...JSON.parse(body) }
      return send(records[i])
    }
    if (recordId && req.method === 'DELETE') {
      records.splice(
        records.findIndex((r) => r.id === recordId),
        1,
      )
      return send({ id: recordId })
    }
    res.statusCode = 404
    res.end(JSON.stringify({ success: false, errors: [{ message: 'not found' }] }))
  })
})

const port = 18070 + Math.floor(Math.random() * 1000)
let agent: Agent
const base = `http://127.0.0.1:${port}`
const post = (path: string, body?: unknown) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  })

beforeAll(async () => {
  await new Promise<void>((r) => api.listen(0, '127.0.0.1', () => r()))
  const address = api.address()
  const apiPort = typeof address === 'object' && address ? address.port : 0
  agent = new Agent({
    home,
    adminPort: port,
    nodePath: process.execPath,
    cloudflaredPath: fake,
    valkeyPath: null,
    postgresScript: null,
    cloudflareApi: `http://127.0.0.1:${apiPort}`,
    templatesDir: '/nonexistent',
    phone: { name: 'test-phone', model: 'Test', android: '16' },
  })
  agent.store.state.apps.push({
    name: 'web',
    port: 3999,
    release: null,
    wanted: false,
    createdAt: new Date().toISOString(),
  })
  agent.store.state.apps.push({
    name: 'blog',
    port: 3998,
    release: null,
    wanted: false,
    createdAt: new Date().toISOString(),
  })
  await agent.start()
})
afterAll(async () => {
  await agent.stop()
  api.close()
  rmSync(home, { recursive: true, force: true })
})

test('adding a domain before logging in asks for a login', async () => {
  const res = await post('/local/apps/web/domain', { hostname: 'api.example.com' })
  expect(res.status).toBe(409)
  expect(((await res.json()) as { code: string }).code).toBe('NEEDS_LOGIN')
})

test('login hands over the Cloudflare page, then the phone is connected', async () => {
  const started = (await (await post('/local/domain/login')).json()) as DomainStatus
  expect(started.loggedIn).toBe(false)
  expect(started.loginUrl).toStartWith('https://dash.cloudflare.com/argotunnel')

  const end = Date.now() + 5000
  let status: DomainStatus = started
  while (!status.loggedIn && Date.now() < end) {
    await Bun.sleep(100)
    status = (await (await fetch(`${base}/local/domain`)).json()) as DomainStatus
  }
  expect(status.loggedIn).toBe(true)
  expect(status.zone).toBe('example.com')
  expect(status.loginUrl).toBeNull()
})

test('a domain gets a proxied DNS record, a route and a stable public URL', async () => {
  const res = await post('/local/apps/web/domain', { hostname: 'https://API.example.com/' })
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ app: 'web', publicUrl: 'https://api.example.com' })

  expect(records).toHaveLength(1)
  expect(records[0]).toMatchObject({
    type: 'CNAME',
    name: 'api.example.com',
    content: `${TUNNEL_ID}.cfargotunnel.com`,
    proxied: true,
    comment: 'Dukoi',
  })
  const config = readFileSync(join(home, 'tunnels', 'config.yml'), 'utf8')
  expect(config).toContain('hostname: api.example.com')
  expect(config).toContain('service: http://127.0.0.1:3999')
  expect(config).not.toContain(`:${port}`)

  const apps = (await (await fetch(`${base}/local/apps`)).json()) as AppInfo[]
  const web = apps.find((a) => a.name === 'web')
  expect(web?.domain).toBe('api.example.com')
  expect(web?.publicUrl).toBe('https://api.example.com')
})

test('names outside the logged-in domain, or already taken, are refused', async () => {
  const outside = await post('/local/apps/blog/domain', { hostname: 'blog.other.com' })
  expect(((await outside.json()) as { code: string }).code).toBe('WRONG_ZONE')

  records.push({
    id: 'x',
    type: 'A',
    name: 'blog.example.com',
    content: '1.2.3.4',
    proxied: false,
    comment: null,
  })
  const taken = await post('/local/apps/blog/domain', { hostname: 'blog.example.com' })
  expect(((await taken.json()) as { code: string }).code).toBe('DNS_TAKEN')
  expect(records.find((r) => r.id === 'x')?.content).toBe('1.2.3.4')

  const twice = await post('/local/apps/blog/domain', { hostname: 'api.example.com' })
  expect(((await twice.json()) as { code: string }).code).toBe('DOMAIN_IN_USE')
})

test('turning the public URL off removes the route and its DNS record', async () => {
  const res = await fetch(`${base}/local/apps/web/expose`, { method: 'DELETE' })
  expect(res.status).toBe(200)
  expect(records.filter((r) => r.name === 'api.example.com')).toHaveLength(0)
  const status = (await (await fetch(`${base}/local/domain`)).json()) as DomainStatus
  expect(status.domains).toEqual([])
})

test('disconnecting removes every domain, its DNS record, the tunnel and the login', async () => {
  const added = await post('/local/apps/blog/domain', { hostname: 'news.example.com' })
  expect(added.status).toBe(200)
  expect(records.filter((r) => r.name === 'news.example.com')).toHaveLength(1)

  const res = await fetch(`${base}/local/domain`, { method: 'DELETE' })
  expect(res.status).toBe(200)
  const status = (await res.json()) as DomainStatus
  expect(status).toMatchObject({ loggedIn: false, zone: null, domains: [] })

  expect(records.filter((r) => r.name === 'news.example.com')).toHaveLength(0)
  // A record Dukoi didn't make is left alone.
  expect(records.find((r) => r.id === 'x')?.content).toBe('1.2.3.4')
  expect(readFileSync(join(home, 'tunnels', 'deleted'), 'utf8')).toBe(TUNNEL_ID)
  expect(existsSync(join(home, 'tunnels', '.cloudflared', 'cert.pem'))).toBe(false)
  expect(agent.store.state.tunnel).toBeUndefined()

  const apps = (await (await fetch(`${base}/local/apps`)).json()) as AppInfo[]
  expect(apps.find((a) => a.name === 'blog')?.publicUrl).toBeNull()
})
