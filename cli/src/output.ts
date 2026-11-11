// Terminal output: ticks and colours for people, JSON for scripts.
import type { ApiError } from '@droidhost/shared'

const tty = process.stdout.isTTY && !process.env.NO_COLOR
const paint = (code: number) => (s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s)

export const c = {
  green: paint(32),
  red: paint(31),
  yellow: paint(33),
  dim: paint(2),
  bold: paint(1),
  cyan: paint(36),
}

export const ok = (msg: string) => console.log(`${c.green('✓')} ${msg}`)
export const info = (msg: string) => console.log(msg)
export const warn = (msg: string) => console.log(`${c.yellow('⚠')} ${msg}`)

/** An error that knows what to tell the user. */
export class CliError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly hint?: string,
  ) {
    super(message)
  }

  static from(err: ApiError): CliError {
    return new CliError(err.code, err.message, err.hint)
  }
}

export function printError(err: unknown, json: boolean): void {
  const e =
    err instanceof CliError
      ? err
      : new CliError('UNEXPECTED', err instanceof Error ? err.message : String(err))
  if (json) {
    console.log(
      JSON.stringify({
        ok: false,
        error: { code: e.code, message: e.message, ...(e.hint ? { hint: e.hint } : {}) },
      }),
    )
    return
  }
  console.error(`${c.red('✗')} ${e.message}`)
  if (e.hint) console.error(`\n  ${e.hint}`)
  if (process.env.DROIDHOST_DEBUG && err instanceof Error) console.error(c.dim(err.stack ?? ''))
}

/** Lines up columns for tables like `droidhost ps`. */
export function table(rows: string[][]): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: strips ANSI colours to measure width
  const width = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '').length
  const widths: number[] = []
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, width(cell))
    })
  }
  return rows
    .map((row) =>
      row
        .map((cell, i) => cell + ' '.repeat((widths[i] ?? 0) - width(cell)))
        .join('  ')
        .trimEnd(),
    )
    .join('\n')
}
