import { describe, expect, test } from 'bun:test'
import { classifyExit, describeExit, nextRestart } from './restart-policy.ts'

const crash = { code: 1, signal: null }
const kill = { code: null, signal: 'SIGKILL' as const }

describe('nextRestart', () => {
  test('crashes back off 1, 2, 4, 8, 16, then 30 seconds', () => {
    let crashes = 0
    const delays: number[] = []
    for (let i = 0; i < 7; i++) {
      const d = nextRestart(crash, crashes, 500)
      delays.push(d.delayMs)
      crashes = d.crashes
    }
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000])
  })

  test('a kill restarts at once, even after crashes', () => {
    expect(nextRestart(kill, 4, 500)).toEqual({ delayMs: 0, crashes: 4 })
  })

  test('a long healthy run resets the crash count', () => {
    expect(nextRestart(crash, 5, 120_000)).toEqual({ delayMs: 1000, crashes: 1 })
  })
})

describe('exits', () => {
  test('are classified and described in plain words', () => {
    expect(classifyExit(kill)).toBe('killed')
    expect(describeExit(kill)).toBe('killed (SIGKILL, usually Android)')
    expect(describeExit(crash)).toBe('crashed with code 1')
    expect(describeExit({ code: 0, signal: null })).toBe('exited cleanly')
  })
})
