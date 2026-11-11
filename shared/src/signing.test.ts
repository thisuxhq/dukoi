import { describe, expect, test } from 'bun:test'
import { formatPairingCode, generateKeyPair, pairingCode, publicKeyFromPrivate } from './keys.ts'
import {
  HEADER,
  NonceCache,
  signRequest,
  signResponse,
  verifyRequest,
  verifyResponse,
} from './signing.ts'

const computer = generateKeyPair()
const phone = generateKeyPair()
const req = { method: 'POST', path: '/apps/my-api/restart', body: '{"x":1}' }

describe('keys', () => {
  test('public key is 32 raw bytes in base64url', () => {
    expect(Buffer.from(computer.publicKey, 'base64url').length).toBe(32)
  })

  test('public key can be recovered from the private key', () => {
    expect(publicKeyFromPrivate(computer.privateKeyPem)).toBe(computer.publicKey)
  })
})

describe('signed requests', () => {
  test('a correctly signed request passes', () => {
    const headers = signRequest(req, computer)
    const result = verifyRequest(req, headers, new NonceCache())
    expect(result).toEqual({
      ok: true,
      publicKey: computer.publicKey,
      nonce: headers[HEADER.nonce] as string,
    })
  })

  test('a changed body fails', () => {
    const headers = signRequest(req, computer)
    const result = verifyRequest({ ...req, body: '{"x":2}' }, headers, new NonceCache())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('BAD_SIGNATURE')
  })

  test('a changed path fails', () => {
    const headers = signRequest(req, computer)
    const result = verifyRequest({ ...req, path: '/apps/other/restart' }, headers, new NonceCache())
    expect(result.ok).toBe(false)
  })

  test('another key claiming to be the computer fails', () => {
    const headers = { ...signRequest(req, phone), [HEADER.key]: computer.publicKey }
    expect(verifyRequest(req, headers, new NonceCache()).ok).toBe(false)
  })

  test('the same request twice is rejected as a replay', () => {
    const headers = signRequest(req, computer)
    const nonces = new NonceCache()
    expect(verifyRequest(req, headers, nonces).ok).toBe(true)
    const again = verifyRequest(req, headers, nonces)
    expect(again.ok).toBe(false)
    if (!again.ok) expect(again.code).toBe('REPLAY')
  })

  test('a request from 10 minutes ago is rejected', () => {
    const now = Date.now()
    const headers = signRequest(req, computer, now - 10 * 60 * 1000)
    const result = verifyRequest(req, headers, new NonceCache(), now)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('CLOCK_SKEW')
  })

  test('an unsigned request says what is missing', () => {
    const result = verifyRequest(req, {}, new NonceCache())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('NOT_SIGNED')
  })
})

describe('signed responses', () => {
  test('the pinned phone key verifies its response', () => {
    const sig = signResponse(200, 'n1', '{"ok":true}', phone.privateKeyPem)
    expect(verifyResponse(200, 'n1', '{"ok":true}', sig, phone.publicKey)).toBe(true)
  })

  test('a response from another phone fails', () => {
    const other = generateKeyPair()
    const sig = signResponse(200, 'n1', '{"ok":true}', other.privateKeyPem)
    expect(verifyResponse(200, 'n1', '{"ok":true}', sig, phone.publicKey)).toBe(false)
  })

  test('a response for a different request nonce fails', () => {
    const sig = signResponse(200, 'n1', '{"ok":true}', phone.privateKeyPem)
    expect(verifyResponse(200, 'n2', '{"ok":true}', sig, phone.publicKey)).toBe(false)
  })
})

describe('pairing code', () => {
  test('is 6 digits and the same on both sides', () => {
    const a = pairingCode(computer.publicKey, phone.publicKey)
    expect(a).toMatch(/^\d{6}$/)
    expect(pairingCode(computer.publicKey, phone.publicKey)).toBe(a)
  })

  test('changes when either key changes', () => {
    const other = generateKeyPair()
    expect(pairingCode(other.publicKey, phone.publicKey)).not.toBe(
      pairingCode(computer.publicKey, phone.publicKey),
    )
  })

  test('is shown as two groups of three', () => {
    expect(formatPairingCode('482913')).toBe('482 913')
  })
})
