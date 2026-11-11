// One app's log: lines with a time and stream, rotated at 5 MB.
// Listeners get new lines as they're written, for `dukoi logs --follow`.
import { appendFileSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs'
import { dirname } from 'node:path'

export const MAX_LOG_BYTES = 5 * 1024 * 1024

export type Stream = 'out' | 'err' | 'agent'

export interface LogLine {
  time: string
  stream: Stream
  text: string
}

export function formatLine(line: LogLine): string {
  return `${line.time} ${line.stream.padEnd(5)} ${line.text}`
}

export class LogFile {
  private listeners = new Set<(line: LogLine) => void>()
  private partial: Record<Stream, string> = { out: '', err: '', agent: '' }

  constructor(readonly file: string) {
    mkdirSync(dirname(file), { recursive: true })
  }

  /** Adds raw process output; splits it into lines. */
  write(stream: Stream, chunk: string): void {
    const text = this.partial[stream] + chunk
    const lines = text.split('\n')
    this.partial[stream] = lines.pop() ?? ''
    for (const l of lines) this.add(stream, l)
  }

  /** A Dukoi message, shown among the app's own lines. */
  note(text: string): void {
    this.add('agent', text)
  }

  private add(stream: Stream, text: string): void {
    const line = { time: new Date().toISOString(), stream, text: text.replace(/\r$/, '') }
    this.rotateIfFull()
    appendFileSync(this.file, `${formatLine(line)}\n`)
    for (const listener of this.listeners) listener(line)
  }

  private rotateIfFull(): void {
    try {
      if (statSync(this.file).size >= MAX_LOG_BYTES) renameSync(this.file, `${this.file}.1`)
    } catch {
      // No file yet.
    }
  }

  /** The last `count` lines, oldest first. */
  tail(count: number): string[] {
    if (count <= 0) return []
    const read = (f: string) => {
      try {
        return readFileSync(f, 'utf8').split('\n').filter(Boolean)
      } catch {
        return []
      }
    }
    let lines = read(this.file)
    if (lines.length < count) lines = [...read(`${this.file}.1`), ...lines]
    return lines.slice(-count)
  }

  subscribe(listener: (line: LogLine) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}
