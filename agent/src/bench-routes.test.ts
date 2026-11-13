import { afterAll, beforeAll, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type BenchSample,
  type BenchSignature,
  benchSignedText,
  generateKeyPair,
  type PhoneStatus,
  sha256Hex,
  signRequest,
  verifyText,
} from '@dukoi/shared'
import { Agent } from './agent.ts'

const home = mkdtempSync(join(tmpdir(), 'dukoi-bench-'))
const port = 18070 + Math.floor(Math.random() * 1000)
const agent = new Agent({
  home,
  adminPort: port,
  nodePath: process.execPath,
  cloudflaredPath: null,
  valkeyPath: null,
  postgresScript: null,
  cloudflareApi: 'http://127.0.0.1:9',
  templatesDir: '/nonexistent',
  phone: {
    name: 'test-phone',
    model: 'Pixel 10a',
    android: '16',
    maker: 'Google',
    chip: 'Tensor G4',
  },
})
const computer = generateKeyPair()

async function call(method: string, path: string, body = ''): Promise<Response> {
  const headers = signRequest({ method, path, body }, computer)
  return fetch(`http://127.0.0.1:${port}${path}`, { method, headers, body: body || undefined })
}

beforeAll(async () => {
  agent.store.state.computers.push({
    publicKey: computer.publicKey,
    name: 'test',
    pairedAt: new Date().toISOString(),
  })
  await agent.start()
})
afterAll(async () => {
  await agent.stop()
  rmSync(home, { recursive: true, force: true })
})

test('status says who made the phone and its chip', async () => {
  const status = (await (await call('GET', '/status')).json()) as PhoneStatus
  expect(status.maker).toBe('Google')
  expect(status.chip).toBe('Tensor G4')
})

test('a sample has no battery until the phone app writes one', async () => {
  const sample = (await (await call('GET', '/bench/sample?app=nope')).json()) as BenchSample
  expect(sample.battery).toBeNull()
  expect(sample.app).toBeNull()
  expect(sample.memory.totalMb).toBeGreaterThan(0)
})

test('a sample reads the battery the phone app wrote', async () => {
  const at = new Date().toISOString()
  writeFileSync(
    agent.paths.battery,
    JSON.stringify({ level: 81, temperatureC: 39, pluggedIn: true, at }),
  )
  const sample = (await (await call('GET', '/bench/sample')).json()) as BenchSample
  expect(sample.battery).toEqual({ level: 81, temperatureC: 39, pluggedIn: true, at })
})

test('the phone signs a result with its own key', async () => {
  const body = JSON.stringify({ version: 1, wifi: { rps: 4120 } })
  const res = await call('POST', '/bench/sign', body)
  expect(res.status).toBe(200)
  const signed = (await res.json()) as BenchSignature
  expect(signed.phoneKey).toBe(agent.store.state.identity.publicKey)
  expect(verifyText(signed.phoneKey, benchSignedText(sha256Hex(body)), signed.signature)).toBe(true)
  // Change one number and the signature no longer fits.
  const edited = body.replace('4120', '9999')
  expect(verifyText(signed.phoneKey, benchSignedText(sha256Hex(edited)), signed.signature)).toBe(
    false,
  )
})

test('the phone refuses to sign something that isn’t a result', async () => {
  expect((await call('POST', '/bench/sign', '{"hello":1}')).status).toBe(400)
  expect((await call('POST', '/bench/sign', 'not json')).status).toBe(400)
})
