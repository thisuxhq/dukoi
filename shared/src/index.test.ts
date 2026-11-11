import { expect, test } from 'bun:test'
import { PROTOCOL_VERSION } from './index.ts'

test('protocol version is a positive integer', () => {
  expect(Number.isInteger(PROTOCOL_VERSION)).toBe(true)
  expect(PROTOCOL_VERSION).toBeGreaterThan(0)
})
