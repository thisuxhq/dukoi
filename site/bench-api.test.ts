import { Database } from 'bun:sqlite'
import { beforeEach, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  type BenchResult,
  benchSignedText,
  generateKeyPair,
  type KeyPair,
  sha256Hex,
  signText,
} from '@dukoi/shared'
import {
  type BenchEnv,
  checkResult,
  handleBench,
  median,
  modelSlug,
  verifyRun,
} from './bench-api.ts'

/** D1's prepare/bind/first/all/run on top of SQLite. */
function fakeD1(): BenchEnv['BENCH'] {
  const db = new Database(':memory:')
  db.exec(readFileSync(join(import.meta.dir, 'migrations/0001_bench.sql'), 'utf8'))
  return {
    prepare: (sql) => ({
      bind: (...values) => {
        const stmt = db.prepare(sql)
        const args = values as never[]
        return {
          first: async <T>() => (stmt.get(...args) as T) ?? null,
          all: async <T>() => ({ results: stmt.all(...args) as T[] }),
          run: async () => stmt.run(...args),
        }
      },
    }),
  }
}

let env: BenchEnv
const lab = generateKeyPair()
beforeEach(() => {
  env = { BENCH: fakeD1(), LAB_PHONES: lab.publicKey }
})

const numbers = (rps: number) => ({
  rps,
  p50Ms: 5,
  p99Ms: 20,
  errorRate: 0,
  requests: rps * 60,
  cpuPercent: 300,
  batteryC: 39,
})

function result(model = 'Google Pixel 10a', rps = 1700): BenchResult {
  return {
    version: 1,
    phone: { maker: 'Google', model, chip: 'Tensor G4', ramGb: 8, android: '16', cores: 8 },
    versions: { dukoi: '0.4.0', node: 'v24.22.2' },
    load: { connections: 50, seconds: 60 },
    wifi: numbers(rps * 2),
    tunnel: numbers(rps),
    hot: numbers(rps - 100),
    otherAppsRunning: 0,
    limitedByComputer: false,
  }
}

/** What the CLI sends: the result text, signed by the phone the way agent/src/bench-routes.ts does. */
function signed(r: BenchResult, phone: KeyPair) {
  const text = JSON.stringify(r)
  return {
    result: text,
    phoneKey: phone.publicKey,
    signature: signText(phone.privateKeyPem, benchSignedText(sha256Hex(text))),
  }
}

const post = (body: unknown) =>
  handleBench(
    new Request('https://dukoi.com/api/bench', { method: 'POST', body: JSON.stringify(body) }),
    env,
    new URL('https://dukoi.com/api/bench'),
  )
const get = async (path: string) =>
  (
    await handleBench(
      new Request(`https://dukoi.com${path}`),
      env,
      new URL(`https://dukoi.com${path}`),
    )
  ).json() as Promise<
    // biome-ignore lint/suspicious/noExplicitAny: test reads loose JSON
    any
  >

test('the Worker accepts the phone’s signature and rejects an edited result', async () => {
  const phone = generateKeyPair()
  const body = signed(result(), phone)
  expect(await verifyRun(body.result, body.phoneKey, body.signature)).toBe(true)
  const edited = body.result.replace('3400', '9999')
  expect(await verifyRun(edited, body.phoneKey, body.signature)).toBe(false)

  const res = await post({ ...body, result: edited })
  expect(res.status).toBe(400)
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe('BAD_SIGNATURE')
})

test('a shared run is saved, and the same phone waits an hour', async () => {
  const phone = generateKeyPair()
  const first = await post(signed(result(), phone))
  expect(first.status).toBe(201)
  expect(((await first.json()) as { url: string }).url).toBe(
    'https://dukoi.com/bench#google-pixel-10a',
  )

  const again = await post(signed(result(), phone))
  expect(again.status).toBe(429)
})

test('impossible numbers are refused', () => {
  expect(() => checkResult({ ...result(), tunnel: numbers(25_000) })).toThrow('out of range')
  expect(() => checkResult({ ...result(), limitedByComputer: true })).toThrow('computer')
  expect(() => checkResult({ ...result(), load: { connections: 10, seconds: 60 } })).toThrow(
    'standard',
  )
  expect(() => checkResult({ ...result(), version: 2 })).toThrow('version')
  expect(checkResult(result()).phone.model).toBe('Google Pixel 10a')
})

test('the board needs 3 runs for a model, but lab phones show at once', async () => {
  for (let i = 0; i < 2; i++)
    await post(signed(result('Samsung SM-S911B', 2400), generateKeyPair()))
  await post(signed(result('Nothing A024', 2800), lab))
  let board = await get('/api/bench')
  expect(board.models.map((m: { slug: string }) => m.slug)).toEqual(['nothing-a024'])
  expect(board.models[0].lab).toBe(true)

  await post(signed(result('Samsung SM-S911B', 2000), generateKeyPair()))
  board = await get('/api/bench')
  expect(board.models.map((m: { slug: string }) => m.slug)).toEqual([
    'nothing-a024',
    'samsung-sm-s911b',
  ])
  // The median of 2400, 2400 and 2000
  expect(board.models[1].tunnel.rps).toBe(2400)
  expect(board.models[1].phones).toBe(3)
  expect(board.runs).toBe(4)

  const page = await get('/api/bench/samsung-sm-s911b')
  expect(page.phones).toHaveLength(3)
  expect((await get('/api/bench/no-such-phone')).error.code).toBe('NO_SUCH_MODEL')
})

test('slugs and medians', () => {
  expect(modelSlug('Nothing Phone (3)')).toBe('nothing-phone-3')
  expect(median([3, 1, 2])).toBe(2)
  expect(median([1, 2, 3, 4])).toBe(2.5)
})
