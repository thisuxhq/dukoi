import { afterAll, beforeAll, expect, test } from 'bun:test'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseInfo, DatabaseKindStatus } from '@dukoi/shared'
import { Agent } from './agent.ts'

const home = mkdtempSync(join(tmpdir(), 'dukoi-databases-'))
const port = 19070 + Math.floor(Math.random() * 900)

// No Valkey on a Mac, so a stand-in that reads the config file, listens on its
// port and answers AUTH like Valkey does. The real one is tested on the phone.
const fakeValkey = join(home, 'valkey-server')
writeFileSync(
  fakeValkey,
  `#!${process.execPath}
const conf = require('node:fs').readFileSync(process.argv[2], 'utf8')
const get = (k) => conf.match(new RegExp('^' + k + ' (.*)$', 'm'))?.[1]
require('node:net').createServer((s) => s.on('data', (d) => {
  s.write(String(d).trim() === 'AUTH ' + get('requirepass') ? '+OK\\r\\n' : '-WRONGPASS\\r\\n')
})).listen(Number(get('port')), get('bind'), () => console.log('Ready to accept connections tcp'))
`,
)
chmodSync(fakeValkey, 0o755)

const config = {
  home,
  adminPort: port,
  nodePath: process.execPath,
  cloudflaredPath: null,
  valkeyPath: fakeValkey,
  postgresScript: join(import.meta.dir, 'postgres-server.ts'),
  cloudflareApi: 'http://127.0.0.1:9',
  templatesDir: '/nonexistent',
  phone: { name: 'test-phone', model: 'Test', android: '16' },
}
let agent = new Agent(config)
const base = `http://127.0.0.1:${port}`

const call = async <T>(method: string, path: string, body?: unknown) => {
  const res = await fetch(`${base}/local${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, body: (await res.json()) as T }
}

/** Sends one line and returns the first reply, like a tiny Redis client. */
function say(port: number, line: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const s = connect(port, '127.0.0.1', () => s.write(`${line}\r\n`))
    s.once('data', (d) => {
      resolve(String(d).trim())
      s.destroy()
    })
    s.once('error', reject)
  })
}

/** Postgres startup and password, by hand. Resolves with the server's answer to the password. */
function pgLogin(port: number, password: string): Promise<'ok' | 'refused'> {
  return new Promise((resolve, reject) => {
    const s = connect(port, '127.0.0.1', () => {
      const params = Buffer.from('user\0postgres\0database\0postgres\0\0')
      const startup = Buffer.alloc(8)
      startup.writeInt32BE(8 + params.length, 0)
      startup.writeInt32BE(196608, 4)
      s.write(Buffer.concat([startup, params]))
    })
    let sentPassword = false
    s.on('data', (d: Buffer) => {
      if (!sentPassword && d[0] === 82 /* R */ && d.readInt32BE(5) === 3) {
        sentPassword = true
        const pw = Buffer.from(`${password}\0`)
        const msg = Buffer.alloc(5)
        msg.write('p')
        msg.writeInt32BE(4 + pw.length, 1)
        s.write(Buffer.concat([msg, pw]))
        return
      }
      // AuthenticationOk is R with code 0; an ErrorResponse starts with E.
      resolve(d[0] === 82 && d.readInt32BE(5) === 0 ? 'ok' : 'refused')
      s.destroy()
    })
    s.once('error', reject)
  })
}

beforeAll(async () => {
  await agent.start()
  // Two apps with no release, just so they can hold settings.
  await agent.apps.setEnv('web', {}, true)
  await agent.apps.setEnv('worker', {}, true)
})
afterAll(async () => {
  await agent.stop()
  rmSync(home, { recursive: true, force: true })
})

test('lists both kinds, and says which this build can run', async () => {
  const { body } = await call<DatabaseKindStatus[]>('GET', '/database-kinds')
  expect(body.map((k) => [k.id, k.available])).toEqual([
    ['redis', true],
    ['postgres', true],
  ])
})

test('creates Redis with a password and gives the URL to the chosen apps', async () => {
  const { status, body: db } = await call<DatabaseInfo>('POST', '/databases', {
    kind: 'redis',
    apps: ['web'],
  })
  expect(status).toBe(200)
  expect(db.name).toBe('redis')
  expect(db.state).toBe('running')
  expect(db.wifiUrl).toBeNull()
  expect(db.apps).toEqual(['web'])
  expect(db.url).toMatch(/^redis:\/\/default:[\w-]{24}@127\.0\.0\.1:\d+$/)
  expect(agent.store.app('web')?.env?.REDIS_URL).toBe(db.url)
  expect(agent.store.app('worker')?.env?.REDIS_URL).toBeUndefined()

  const password = db.url.split(':')[2]?.split('@')[0]
  expect(await say(db.port, `AUTH ${password}`)).toBe('+OK')
  expect(await say(db.port, 'AUTH guess')).toBe('-WRONGPASS')
  // The password is in a private file, not the process list.
  const conf = readFileSync(join(home, 'databases', 'redis', 'run', 'valkey.conf'), 'utf8')
  expect(conf).toContain('bind 127.0.0.1')
})

test('a second one gets the next name and port', async () => {
  const first = await call<DatabaseInfo>('GET', '/databases/redis')
  const { body: second } = await call<DatabaseInfo>('POST', '/databases', { kind: 'redis' })
  expect(second.name).toBe('redis-2')
  expect(second.port).toBeGreaterThan(first.body.port)
  expect((await call('DELETE', '/databases/redis-2')).status).toBe(200)
})

test('Wi-Fi on listens on every address and gives a Wi-Fi URL', async () => {
  const { body } = await call<DatabaseInfo>('PATCH', '/databases/redis', { wifi: true })
  expect(body.wifiUrl).toMatch(/^redis:\/\/default:[\w-]{24}@[\d.]+:\d+$/)
  const conf = readFileSync(join(home, 'databases', 'redis', 'run', 'valkey.conf'), 'utf8')
  expect(conf).toContain('bind 0.0.0.0')
  expect(body.state).toBe('running')
  const off = await call<DatabaseInfo>('PATCH', '/databases/redis', { wifi: false })
  expect(off.body.wifiUrl).toBeNull()
})

test('a new password reaches every connected app', async () => {
  const before = (await call<DatabaseInfo>('GET', '/databases/redis')).body
  const { body: after } = await call<DatabaseInfo>('PATCH', '/databases/redis', {
    newPassword: true,
    connect: ['worker'],
  })
  expect(after.url).not.toBe(before.url)
  expect(after.apps.sort()).toEqual(['web', 'worker'])
  expect(agent.store.app('web')?.env?.REDIS_URL).toBe(after.url)
  expect(agent.store.app('worker')?.env?.REDIS_URL).toBe(after.url)
  const password = after.url.split(':')[2]?.split('@')[0]
  expect(await say(after.port, `AUTH ${password}`)).toBe('+OK')
})

test('the phone app changes a database with POST, since it cannot send PATCH', async () => {
  const { status, body } = await call<DatabaseInfo>('POST', '/databases/redis', { wifi: false })
  expect(status).toBe(200)
  expect(body.name).toBe('redis')
})

test('disconnecting takes the setting away', async () => {
  const { body } = await call<DatabaseInfo>('PATCH', '/databases/redis', { disconnect: ['worker'] })
  expect(body.apps).toEqual(['web'])
  expect(agent.store.app('worker')?.env?.REDIS_URL).toBeUndefined()
})

test('refuses apps that are not on the phone, and bad names', async () => {
  const noApp = await call<{ code: string }>('POST', '/databases', {
    kind: 'redis',
    name: 'cache',
    apps: ['nope'],
  })
  expect(noApp.body.code).toBe('NO_SUCH_APP')
  const badName = await call<{ code: string }>('POST', '/databases', {
    kind: 'redis',
    name: 'Bad Name',
  })
  expect(badName.body.code).toBe('BAD_NAME')
  const taken = await call<{ code: string }>('POST', '/databases', { kind: 'redis', name: 'redis' })
  expect(taken.body.code).toBe('NAME_TAKEN')
})

test('Postgres (real PGlite) checks the password before letting anyone in', async () => {
  const { status, body: db } = await call<DatabaseInfo>('POST', '/databases', {
    kind: 'postgres',
    apps: ['web'],
  })
  expect(status).toBe(200)
  expect(db.url).toMatch(/^postgres:\/\/postgres:[\w-]{24}@127\.0\.0\.1:\d+\/postgres$/)
  expect(agent.store.app('web')?.env?.DATABASE_URL).toBe(db.url)
  const password = db.url.split(':')[2]?.split('@')[0] ?? ''
  expect(await pgLogin(db.port, password)).toBe('ok')
  expect(await pgLogin(db.port, 'guess')).toBe('refused')
}, 90_000)

test('databases come back after the agent restarts', async () => {
  const before = (await call<DatabaseInfo[]>('GET', '/databases')).body
  await agent.stop()
  agent = new Agent(config)
  await agent.start()
  // Restore starts them without waiting, so give them a moment.
  for (let i = 0; i < 120; i++) {
    const { body } = await call<DatabaseInfo[]>('GET', '/databases')
    const pg = body.find((d) => d.kind === 'postgres')
    if (
      pg &&
      (await pgLogin(pg.port, pg.url.split(':')[2]?.split('@')[0] ?? '').catch(() => null)) === 'ok'
    )
      break
    await new Promise((r) => setTimeout(r, 500))
  }
  const after = (await call<DatabaseInfo[]>('GET', '/databases')).body
  expect(after.map((d) => [d.name, d.url, d.state])).toEqual(
    before.map((d) => [d.name, d.url, 'running']),
  )
}, 90_000)

test('removing a database takes its setting from the apps', async () => {
  expect((await call('DELETE', '/databases/postgres')).status).toBe(200)
  expect(agent.store.app('web')?.env?.DATABASE_URL).toBeUndefined()
  expect((await call<{ code: string }>('GET', '/databases/postgres')).body.code).toBe(
    'NO_SUCH_DATABASE',
  )
})

test('removing an app drops it from the database', async () => {
  // What DELETE /apps/:name does (paired computers only, so not reachable on /local).
  agent.databases.forgetApp('web')
  await agent.apps.remove('web')
  expect((await call<DatabaseInfo>('GET', '/databases/redis')).body.apps).toEqual([])
})
