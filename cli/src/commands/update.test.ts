import { describe, expect, test } from 'bun:test'
import { isNewer } from './update.ts'

describe('isNewer', () => {
  test('compares each part as a number', () => {
    expect(isNewer('0.5.0', '0.4.1')).toBe(true)
    expect(isNewer('0.10.0', '0.9.9')).toBe(true)
    expect(isNewer('1.0.0', '0.99.99')).toBe(true)
  })

  test('is false for the same or an older version', () => {
    expect(isNewer('0.4.1', '0.4.1')).toBe(false)
    expect(isNewer('0.4.0', '0.4.1')).toBe(false)
  })
})
