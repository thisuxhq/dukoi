// A line from an app's or a database's log, as the pages show it.
export interface LogLine {
  /** "09:12:01" */
  time: string
  stream: 'out' | 'err' | 'agent'
  text: string
}

/** "2026-11-11T04:13:10.495Z agent  App killed…" → { time, stream, text }, in this computer's time. */
export function parseLogLine(line: string): LogLine {
  const m = line.match(/^(\S+) (\S+)\s+(.*)$/)
  if (!m) return { time: '', stream: 'out', text: line }
  const date = new Date(m[1] as string)
  const time = Number.isNaN(date.getTime()) ? '' : date.toTimeString().slice(0, 8)
  const stream = m[2] === 'err' || m[2] === 'agent' ? m[2] : 'out'
  return { time, stream, text: m[3] as string }
}
