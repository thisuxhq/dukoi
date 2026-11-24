import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createServer, type Server } from 'node:http'
import { HttpError } from './http.ts'
import { freePort, StablePort } from './proxy.ts'
import { BodyCollector, MAX_BODY_BYTES, MAX_REQUESTS, RequestLog } from './request-log.ts'

test('RequestLog keeps the last MAX_REQUESTS entries and redacts sensitive headers', () => {
  const log = new RequestLog()
  for (let i = 0; i < MAX_REQUESTS + 5; i++) {
    const reqCollector = new BodyCollector()
    reqCollector.push(`req-${i}`)
    const resCollector = new BodyCollector()
    resCollector.push(`res-${i}`)
    log.record({
      at: new Date(),
      method: 'POST',
      path: `/item/${i}`,
      status: 200,
      durationMs: 12,
      from: '192.168.1.5',
      replayedFrom: null,
      reqHeaders: {
        'content-type': 'text/plain',
        authorization: 'Bearer top-secret',
        'stripe-signature': 't=123,v1=abc',
        'x-api-key': 'key-123',
      },
      reqCollector,
      resHeaders: {
        'content-type': 'text/plain',
        'set-cookie': 'sid=secret-cookie',
      },
      resCollector,
    })
  }

  const list = log.list()
  expect(list.length).toBe(MAX_REQUESTS)
  expect(list[0]?.id).toBe('r_006')
  expect(list[list.length - 1]?.id).toBe('r_105')

  const detail = log.get('r_105')
  expect(detail).not.toBeNull()
  expect(detail?.reqHeaders.authorization).toBe('[redacted]')
  expect(detail?.reqHeaders['stripe-signature']).toBe('[redacted]')
  expect(detail?.reqHeaders['x-api-key']).toBe('[redacted]')
  expect(detail?.reqHeaders['content-type']).toBe('text/plain')
  expect(detail?.resHeaders['set-cookie']).toBe('[redacted]')
  expect(detail?.reqBody).toBe('req-104')
  expect(detail?.resBody).toBe('res-104')

  // Raw headers stay intact on the phone for replay.
  const raw = log.getRaw('r_105')
  expect(raw?.rawReqHeaders.authorization).toBe('Bearer top-secret')
})

test('BodyCollector caps stored bytes at 64 KB while tracking total size', () => {
  const c = new BodyCollector()
  const big = Buffer.alloc(MAX_BODY_BYTES + 2048, 0x61) // 'a'
  c.push(big)
  expect(c.totalBytes).toBe(MAX_BODY_BYTES + 2048)
  expect(c.truncated).toBe(true)
  expect(c.buffer().length).toBe(MAX_BODY_BYTES)
})

test('RequestLog marks binary bodies as null text with binary flag', () => {
  const log = new RequestLog()
  const reqCollector = new BodyCollector()
  reqCollector.push(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]))
  const resCollector = new BodyCollector()
  resCollector.push('ok')
  const detail = log.record({
    at: new Date(),
    method: 'POST',
    path: '/upload',
    status: 201,
    durationMs: 5,
    from: null,
    replayedFrom: null,
    reqHeaders: { 'content-type': 'image/png' },
    reqCollector,
    resHeaders: { 'content-type': 'text/plain' },
    resCollector,
  })
  expect(detail.reqBinary).toBe(true)
  expect(detail.reqBody).toBeNull()
  expect(detail.reqBytes).toBe(6)
  expect(detail.resBinary).toBe(false)
  expect(detail.resBody).toBe('ok')
})

let upstream: Server
let upstreamPort = 0
let stable: StablePort
let stablePortNum = 0
let failNext = true
let lastSeenAuth: string | undefined
let lastSeenTokenHeader: string | undefined

beforeAll(async () => {
  upstreamPort = await freePort()
  upstream = createServer((req, res) => {
    lastSeenAuth = req.headers.authorization
    lastSeenTokenHeader = req.headers['x-dukoi-replay-token'] as string | undefined
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8')
      if (req.url === '/webhook') {
        if (failNext) {
          failNext = false
          res.writeHead(500, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'boom', received: body }))
          return
        }
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true, received: body }))
        return
      }
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('ok')
    })
  })
  await new Promise<void>((resolve) => upstream.listen(upstreamPort, '127.0.0.1', resolve))

  stablePortNum = await freePort()
  stable = new StablePort(stablePortNum, 'demo')
  await stable.listen()
})

afterAll(async () => {
  await stable.close()
  await new Promise<void>((resolve) => upstream.close(() => resolve()))
})

test('StablePort captures requests, redacts headers, and replays cleanly', async () => {
  // Stopped app produces a captured 503.
  stable.target = null
  const down = await fetch(`http://127.0.0.1:${stablePortNum}/health`)
  expect(down.status).toBe(503)
  await down.text()
  expect(stable.requests.list().at(-1)?.status).toBe(503)

  // Point at upstream and send a failing webhook with a secret header.
  stable.target = upstreamPort
  const payload = JSON.stringify({ event: 'paid', amount: 499 })
  const first = await fetch(`http://127.0.0.1:${stablePortNum}/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer webhook-secret',
    },
    body: payload,
  })
  expect(first.status).toBe(500)
  await first.text()

  const summary = stable.requests.list().at(-1)
  expect(summary?.method).toBe('POST')
  expect(summary?.path).toBe('/webhook')
  expect(summary?.status).toBe(500)
  expect(summary?.replayedFrom).toBeNull()

  const detail = stable.requests.get(summary?.id ?? '')
  expect(detail?.reqHeaders.authorization).toBe('[redacted]')
  expect(detail?.reqBody).toBe(payload)

  // Replay it now that the upstream "bug" is fixed.
  const seen: string[] = []
  const unsub = stable.requests.subscribe((s) => seen.push(s.id))
  const replayed = await stable.replay(summary?.id ?? '')
  unsub()

  expect(replayed.status).toBe(200)
  expect(replayed.replayedFrom).toBe(summary?.id ?? null)
  expect(replayed.reqBody).toBe(payload)
  expect(JSON.parse(replayed.resBody ?? '{}')).toEqual({ ok: true, received: payload })
  // Original auth header reached the app, internal replay token did not.
  expect(lastSeenAuth).toBe('Bearer webhook-secret')
  expect(lastSeenTokenHeader).toBeUndefined()
  expect(seen).toContain(replayed.id)
})

test('StablePort refuses replay for truncated bodies or missing IDs', async () => {
  stable.target = upstreamPort
  const huge = 'x'.repeat(MAX_BODY_BYTES + 1024)
  const res = await fetch(`http://127.0.0.1:${stablePortNum}/big`, {
    method: 'POST',
    body: huge,
  })
  expect(res.status).toBe(200)
  await res.text()

  const id = stable.requests.list().at(-1)?.id ?? ''
  await expect(stable.replay(id)).rejects.toThrow(HttpError)
  await expect(stable.replay('r_99999')).rejects.toThrow(HttpError)

  let cleared = 0
  const unsub = stable.requests.subscribeClear(() => {
    cleared++
  })
  stable.requests.clear()
  unsub()
  expect(stable.requests.list()).toEqual([])
  expect(cleared).toBe(1)
})
