// When to restart an app after it exits.
//
// Lesson from the survival spike: a kill by Android (SIGKILL) isn't the app's
// fault, so it restarts at once. Only real crashes back off: 1, 2, 4, 8, 16,
// then 30 seconds. A run of 60 seconds or more resets the count.

export const HEALTHY_AFTER_MS = 60_000
export const MAX_BACKOFF_MS = 30_000
/** Crashes in a row before the app shows as "crashed" */
export const CRASH_LOOP_AFTER = 5

export type ExitKind = 'clean' | 'killed' | 'terminated' | 'crashed'

export interface Exit {
  code: number | null
  signal: NodeJS.Signals | null
}

export function classifyExit({ code, signal }: Exit): ExitKind {
  if (signal === 'SIGKILL') return 'killed'
  if (signal === 'SIGTERM' || signal === 'SIGINT') return 'terminated'
  if (code === 0) return 'clean'
  return 'crashed'
}

export function describeExit(exit: Exit): string {
  switch (classifyExit(exit)) {
    case 'killed':
      return 'killed (SIGKILL, usually Android)'
    case 'terminated':
      return `stopped (${exit.signal})`
    case 'clean':
      return 'exited cleanly'
    default:
      return exit.signal ? `crashed (${exit.signal})` : `crashed with code ${exit.code}`
  }
}

export interface RestartDecision {
  delayMs: number
  /** Crash count after this exit */
  crashes: number
}

/**
 * @param crashes crashes in a row before this exit
 * @param ranMs how long the process ran
 */
export function nextRestart(exit: Exit, crashes: number, ranMs: number): RestartDecision {
  const streak = ranMs >= HEALTHY_AFTER_MS ? 0 : crashes
  const kind = classifyExit(exit)
  if (kind === 'killed' || kind === 'terminated') {
    return { delayMs: 0, crashes: streak }
  }
  const next = streak + 1
  const delayMs = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** (next - 1))
  return { delayMs, crashes: next }
}
