import { expect, test } from 'bun:test'
import { formatBytes, resolveInspectTarget } from './inspect.ts'

test('resolveInspectTarget separates app names and request IDs unambiguously', () => {
  expect(resolveInspectTarget([], undefined)).toEqual({ appArg: undefined, id: undefined })
  expect(resolveInspectTarget(['my-api'], undefined)).toEqual({ appArg: 'my-api', id: undefined })
  expect(resolveInspectTarget(['r_042'], undefined)).toEqual({ appArg: undefined, id: 'r_042' })
  expect(resolveInspectTarget(['r_042'], 'my-api')).toEqual({ appArg: 'my-api', id: 'r_042' })
  expect(resolveInspectTarget(['my-api', 'r_042'], undefined)).toEqual({
    appArg: 'my-api',
    id: 'r_042',
  })
  expect(() => resolveInspectTarget(['my-api', 'not-an-id'], undefined)).toThrow()
})

test('formatBytes formats bytes, KB and MB cleanly', () => {
  expect(formatBytes(0)).toBe('0 B')
  expect(formatBytes(512)).toBe('512 B')
  expect(formatBytes(1536)).toBe('1.5 KB')
  expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB')
})
