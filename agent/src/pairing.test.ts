import { afterAll, beforeAll, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateKeyPair, type PairStatus, pairingCode, signRequest } from '@droidhost/shared'
import { Agent } from './agent.ts'

const home = mkdtempSync(join(tmpdir(), 'droidhost-pair-'))
const port = 18070 + Math.floor(Math.random() * 1000)
const agent = new Agent({
  home,
  adminPort: port,
  nodePath: process.execPath,
  phone: { name: 'p', model: 'Test', android: '16' },
})
const base = `http://127.0.0.1:${port}`
const computer = generateKeyPair()
const post = (path: string, body?: unknown) =>
  fetch(base + path, { method: 'POST', body: body ? JSON.stringify(body) : undefined })

beforeAll(async () => {
  await agent.start()
})
afterAll(async () => {
  await agent.stop()
  rmSync(home, { recursive: true, force: true })
})

test('signed calls fail before pairing', async () => {
  const res = await fetch(`${base}/computers`, {
    headers: signRequest({ method: 'GET', path: '/computers' }, computer),
  })
  expect(res.status).toBe(401)
  expect(((await res.json()) as { code: string }).code).toBe('NOT_PAIRED')
})

test('request, see the code on the phone, approve, then signed calls work', async () => {
  const requested = (await (
    await post('/pair/request', { publicKey: computer.publicKey, name: 'Mac' })
  ).json()) as PairStatus
  expect(requested.state).toBe('pending')
  expect(requested.code).toBe(pairingCode(computer.publicKey, agent.store.state.identity.publicKey))

  const onPhone = (await (await fetch(`${base}/local/pairing`)).json()) as {
    pending: { publicKey: string; code: string; name: string }[]
  }
  expect(onPhone.pending).toEqual([
    { publicKey: computer.publicKey, name: 'Mac', code: requested.code },
  ])

  expect((await post(`/local/pairing/${computer.publicKey}/approve`)).status).toBe(200)

  const status = (await (
    await fetch(`${base}/pair/status?key=${computer.publicKey}`)
  ).json()) as PairStatus
  expect(status.state).toBe('approved')

  const res = await fetch(`${base}/computers`, {
    headers: signRequest({ method: 'GET', path: '/computers' }, computer),
  })
  expect(res.status).toBe(200)
})

test('a denied request stays denied and is not paired', async () => {
  const other = generateKeyPair()
  await post('/pair/request', { publicKey: other.publicKey, name: 'Stranger' })
  await post(`/local/pairing/${other.publicKey}/deny`)
  const status = (await (
    await fetch(`${base}/pair/status?key=${other.publicKey}`)
  ).json()) as PairStatus
  expect(status.state).toBe('denied')
  expect(agent.store.isPaired(other.publicKey)).toBe(false)
})

test('a computer can unpair itself, and its key stops working at once', async () => {
  const del = await fetch(`${base}/computers/self`, {
    method: 'DELETE',
    headers: signRequest({ method: 'DELETE', path: '/computers/self' }, computer),
  })
  expect(del.status).toBe(200)
  const res = await fetch(`${base}/computers`, {
    headers: signRequest({ method: 'GET', path: '/computers' }, computer),
  })
  expect(res.status).toBe(401)
})
