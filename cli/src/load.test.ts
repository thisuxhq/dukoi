import { afterAll, expect, test } from 'bun:test'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { answers, percentiles, runLoad } from './load.ts'

let hits = 0
const server = createServer((req, res) => {
  hits++
  if (req.url === '/hang') return // never answers
  if (req.url === '/fail') res.writeHead(500)
  res.end('{"ok":true}')
}).listen(0, '127.0.0.1')
await new Promise((r) => server.once('listening', r))
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

afterAll(() => {
  server.close()
})

test('percentiles pick the right request times', () => {
  const times = Array.from({ length: 100 }, (_, i) => i + 1) // 1..100 ms
  expect(percentiles(times)).toEqual({ p50Ms: 50, p99Ms: 99 })
  expect(percentiles([])).toEqual({ p50Ms: 0, p99Ms: 0 })
  expect(percentiles([7])).toEqual({ p50Ms: 7, p99Ms: 7 })
})

test('load runs for the time asked and counts every request', async () => {
  hits = 0
  const result = await runLoad({ url: `${base}/notes`, connections: 4, seconds: 1 })
  expect(result.errors).toBe(0)
  // Requests still in flight at the deadline are dropped: at most one per connection.
  expect(result.requests).toBeLessThanOrEqual(hits)
  expect(result.requests).toBeGreaterThanOrEqual(hits - 4)
  expect(result.rps).toBeGreaterThan(100)
  expect(result.p99Ms).toBeGreaterThanOrEqual(result.p50Ms)
})

test('error answers count as errors, not requests a second', async () => {
  const result = await runLoad({ url: `${base}/fail`, connections: 2, seconds: 0.3 })
  expect(result.rps).toBe(0)
  expect(result.errorRate).toBe(1)
})

test('a phone that isn’t there gives errors, not a crash', async () => {
  const result = await runLoad({ url: 'http://127.0.0.1:9/', connections: 2, seconds: 0.3 })
  expect(result.errorRate).toBe(1)
})

test('a pinned address skips the computer’s DNS', async () => {
  const port = (server.address() as AddressInfo).port
  // This name doesn't exist, so only the pinned address can reach the server.
  const url = `http://no-such-name.invalid:${port}/notes`
  expect(await answers(url)).toBe(false)
  expect(await answers(url, '127.0.0.1')).toBe(true)
  const result = await runLoad({ url, address: '127.0.0.1', connections: 2, seconds: 0.3 })
  expect(result.errors).toBe(0)
  expect(result.rps).toBeGreaterThan(0)
})

test('a run ends on time even when the server never answers', async () => {
  const t0 = performance.now()
  const result = await runLoad({ url: `${base}/hang`, connections: 3, seconds: 0.5 })
  expect(performance.now() - t0).toBeLessThan(2000)
  // Cut off at the deadline: neither answered nor failed.
  expect(result.requests).toBe(0)
})

test('stopping ends a run straight away', async () => {
  const stop = new AbortController()
  setTimeout(() => stop.abort(), 200)
  const t0 = performance.now()
  await runLoad({ url: `${base}/hang`, connections: 3, seconds: 30, signal: stop.signal })
  expect(performance.now() - t0).toBeLessThan(2000)
})
