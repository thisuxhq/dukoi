import { describe, expect, test } from 'bun:test'
import { HEADER, PROTOCOL_VERSION } from '@dukoi/shared'
import { checkProtocol, parseVerified } from './client.ts'
import { CliError } from './output.ts'

const phone = { host: '192.168.0.100', port: 7070, publicKey: null }

function response(protocol?: number): Response {
  const headers = new Headers({ 'content-type': 'application/json' })
  if (protocol !== undefined) headers.set(HEADER.protocol, String(protocol))
  return new Response(null, { status: 200, headers })
}

describe('checkProtocol', () => {
  test('passes when the phone speaks the same protocol', () => {
    expect(() => checkProtocol(PROTOCOL_VERSION)).not.toThrow()
  })

  test('asks to update the CLI when the phone is newer', () => {
    expect(() => checkProtocol(PROTOCOL_VERSION + 1)).toThrow(CliError)
    try {
      checkProtocol(PROTOCOL_VERSION + 1)
    } catch (err) {
      expect((err as CliError).code).toBe('CLI_OUTDATED')
    }
  })

  test('asks to update the phone app when the phone is older', () => {
    try {
      checkProtocol(PROTOCOL_VERSION - 1)
      throw new Error('expected a CliError')
    } catch (err) {
      expect((err as CliError).code).toBe('PHONE_OUTDATED')
    }
  })
})

describe('parseVerified', () => {
  test('reads the answer from a phone on the same protocol', () => {
    const value = parseVerified(phone, response(PROTOCOL_VERSION), '{"ok":true}', 'nonce')
    expect(value).toEqual({ ok: true })
  })

  test('skips the check for a phone that sends no protocol header', () => {
    expect(parseVerified(phone, response(), '{"ok":true}', 'nonce')).toEqual({ ok: true })
  })

  test('stops on a protocol mismatch', () => {
    expect(() => parseVerified(phone, response(PROTOCOL_VERSION + 1), '{}', 'nonce')).toThrow(
      CliError,
    )
  })
})
