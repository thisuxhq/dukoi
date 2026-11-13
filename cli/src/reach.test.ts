import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { savePhone } from './config.ts'
import { firstMatch, lost, parseTailnet, pointAt, reach, withHost } from './reach.ts'

// Never touch the real ~/.config/dukoi.
const config = mkdtempSync(join(tmpdir(), 'dukoi-reach-'))
process.env.DUKOI_CONFIG = config

const KEY = 'phone-key'
let server: Server
let port: number

beforeAll(async () => {
  server = createServer((_req, res) => {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ name: 'a024', model: 'Nothing A024', publicKey: KEY }))
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  port = (server.address() as AddressInfo).port
})

afterAll(() => {
  server.close()
  rmSync(config, { recursive: true, force: true })
})

describe('parseTailnet', () => {
  test('is off unless Tailscale is running', () => {
    expect(parseTailnet({ BackendState: 'Stopped' }).state).toBe('off')
  })

  test('lists online Android devices and offline devices by IPv4 address', () => {
    const net = parseTailnet({
      BackendState: 'Running',
      Peer: {
        a: { OS: 'android', Online: true, TailscaleIPs: ['100.74.25.113', 'fd7a::1'] },
        b: { OS: 'macOS', Online: true, TailscaleIPs: ['100.1.1.1'] },
        c: { OS: 'android', Online: false, TailscaleIPs: ['100.2.2.2'] },
      },
    })
    expect(net).toEqual({ state: 'running', phones: ['100.74.25.113'], offline: ['100.2.2.2'] })
  })
})

describe('pointAt', () => {
  test('points app and database URLs at the address that worked', () => {
    const apps = pointAt(
      [{ name: 'notes', localUrl: 'http://172.20.10.2:3001', publicUrl: 'https://x.dev' }],
      '100.74.25.113',
    )
    expect(apps[0]?.localUrl).toBe('http://100.74.25.113:3001')
    expect(apps[0]?.publicUrl).toBe('https://x.dev')
    const db = pointAt({ db: { wifiUrl: 'postgres://u:p@192.168.0.5:5432/app' } }, '100.1.2.3')
    expect(db.db.wifiUrl).toBe('postgres://u:p@100.1.2.3:5432/app')
  })

  test('leaves URLs alone when talking to the phone through localhost', () => {
    expect(pointAt({ localUrl: 'http://192.168.0.5:3000' }, '127.0.0.1').localUrl).toBe(
      'http://192.168.0.5:3000',
    )
  })

  test('keeps a URL it cannot read as it is', () => {
    expect(withHost('not a url', '100.1.2.3')).toBe('not a url')
  })
})

describe('firstMatch', () => {
  test('finds the address where the phone with this key answers', async () => {
    expect(await firstMatch(['127.0.0.1'], port, KEY)).toBe('127.0.0.1')
  })

  test('ignores a phone with another key', async () => {
    expect(await firstMatch(['127.0.0.1'], port, 'someone-else')).toBeNull()
  })

  test('is null when nothing answers', async () => {
    expect(await firstMatch(['nowhere.invalid'], port, KEY)).toBeNull()
    expect(await firstMatch([], port, KEY)).toBeNull()
  })
})

describe('reach', () => {
  test('moves to another known address and saves it', async () => {
    savePhone({
      name: 'a024',
      host: 'nowhere.invalid',
      hosts: ['nowhere.invalid', '127.0.0.1'],
      port,
      publicKey: KEY,
      model: 'Nothing A024',
      pairedAt: '2026-11-13T00:00:00.000Z',
    })
    const phone = {
      name: 'a024',
      host: 'nowhere.invalid',
      hosts: ['127.0.0.1'],
      port,
      publicKey: KEY,
    }
    await reach(phone)
    expect(phone.host).toBe('127.0.0.1')
    const saved = JSON.parse(readFileSync(join(config, 'phones.json'), 'utf8'))
    expect(saved.phones[0].host).toBe('127.0.0.1')
    expect(saved.phones[0].hosts).toEqual(['127.0.0.1', 'nowhere.invalid'])
  })

  test('skips a target with no key yet (pairing)', async () => {
    const target = { host: 'nowhere.invalid', port, publicKey: null }
    await reach(target)
    expect(target.host).toBe('nowhere.invalid')
  })
})

describe('lost', () => {
  const phone = {
    name: 'a024',
    host: '192.168.0.101',
    hosts: ['100.74.25.113'],
    port: 7070,
    publicKey: KEY,
  }

  test('says when Tailscale is off on this computer', () => {
    expect(lost(phone, { state: 'off', phones: [], offline: [] }).message).toContain(
      'Tailscale is off on this computer',
    )
  })

  test('says when the phone is offline on Tailscale', () => {
    const err = lost(phone, { state: 'running', phones: [], offline: ['100.74.25.113'] })
    expect(err.message).toBe('a024 is offline on Tailscale and isn’t on this Wi-Fi.')
  })

  test('points to Tailscale when this computer has none', () => {
    expect(lost(phone, { state: 'missing', phones: [], offline: [] }).hint).toContain('Tailscale')
  })
})
