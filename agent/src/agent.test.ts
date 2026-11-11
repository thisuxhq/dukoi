import { afterAll, beforeAll, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  generateKeyPair,
  HEADER,
  type PhoneInfo,
  signRequest,
  verifyResponse,
} from '@droidhost/shared'
import { Agent } from './agent.ts'

const home = mkdtempSync(join(tmpdir(), 'droidhost-agent-'))
const port = 17070 + Math.floor(Math.random() * 1000)
const agent = new Agent({
  home,
  adminPort: port,
  nodePath: process.execPath,
  cloudflaredPath: null,
  phone: { name: 'test-phone', model: 'Test', android: '16' },
})
const base = `http://127.0.0.1:${port}`

beforeAll(async () => {
  await agent.start()
})
afterAll(async () => {
  await agent.stop()
  rmSync(home, { recursive: true, force: true })
})

test('GET /info is public and signed by the phone', async () => {
  const nonce = 'test-nonce'
  const res = await fetch(`${base}/info`, { headers: { [HEADER.nonce]: nonce } })
  const body = await res.text()
  const info = JSON.parse(body) as PhoneInfo
  expect(info.name).toBe('test-phone')
  expect(info.protocol).toBe(1)
  expect(verifyResponse(200, nonce, body, res.headers.get(HEADER.signature), info.publicKey)).toBe(
    true,
  )
})

test('the identity survives a restart', () => {
  const again = new Agent({ ...agent.config })
  expect(again.store.state.identity.publicKey).toBe(agent.store.state.identity.publicKey)
})

test('a signed request from an unpaired computer is refused', async () => {
  const stranger = generateKeyPair()
  const headers = signRequest({ method: 'GET', path: '/local/status' }, stranger)
  // /local/status is local-only, so try a paired route that doesn't exist yet:
  const res = await fetch(`${base}/nope`, { headers })
  expect(res.status).toBe(404)
  const local = await fetch(`${base}/local/status`)
  expect(local.status).toBe(200)
})

test('the phone app reads apps and phone status on /local without signing', async () => {
  const apps = await fetch(`${base}/local/apps`)
  expect(apps.status).toBe(200)
  expect(await apps.json()).toEqual([])

  const phone = await fetch(`${base}/local/phone`)
  expect(phone.status).toBe(200)
  const status = (await phone.json()) as { name: string; cpuCount: number }
  expect(status.name).toBe('test-phone')
  expect(status.cpuCount).toBeGreaterThan(0)

  // The signed twin still needs a paired computer.
  expect((await fetch(`${base}/apps`)).status).toBe(401)
})
