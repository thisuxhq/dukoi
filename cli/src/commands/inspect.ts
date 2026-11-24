// dukoi inspect and dukoi replay
import {
  REQUEST_ID_PATTERN,
  type ReplayResult,
  type RequestDetail,
  type RequestSummary,
  signRequest,
} from '@dukoi/shared'
import { call, pickPhone, unreachable } from '../client.ts'
import { computerKey } from '../config.ts'
import { CliError, c, info, ok, table } from '../output.ts'
import { reach } from '../reach.ts'
import { appName } from './apps.ts'

export interface InspectOptions {
  /** Positional args after `dukoi inspect`: [], [app], [id], or [app, id] */
  args: string[]
  app?: string
  limit: number
  follow: boolean
  clear: boolean
  device?: string
  json: boolean
}

export interface ReplayOptions {
  /** Positional args after `dukoi replay`: [id] or [app, id] */
  args: string[]
  app?: string
  device?: string
  json: boolean
}

/** Splits `[app] [r_001]` unambiguously because app names never contain underscores. */
export function resolveInspectTarget(
  args: string[],
  appFlag: string | undefined,
): { appArg: string | undefined; id: string | undefined } {
  const [first, second] = args
  if (!first) return { appArg: appFlag, id: undefined }
  if (REQUEST_ID_PATTERN.test(first)) return { appArg: appFlag, id: first }
  if (second && REQUEST_ID_PATTERN.test(second)) return { appArg: appFlag ?? first, id: second }
  if (second) {
    throw new CliError(
      'BAD_REQUEST_ID',
      `"${second}" isn't a request ID.`,
      'Request IDs look like r_001. Run `dukoi inspect` to see them.',
    )
  }
  return { appArg: appFlag ?? first, id: undefined }
}

export async function inspect(opts: InspectOptions): Promise<void> {
  const { appArg, id } = resolveInspectTarget(opts.args, opts.app)
  const name = appName(appArg)
  const phone = pickPhone(opts.device)
  const basePath = `/apps/${encodeURIComponent(name)}/requests`

  if (opts.clear) {
    await call(phone, basePath, { method: 'DELETE' })
    if (opts.json) return void console.log(JSON.stringify({ ok: true, app: name, cleared: true }))
    return void ok(`Cleared captured requests for ${name}`)
  }

  if (id) {
    const detail = await call<RequestDetail>(phone, `${basePath}/${encodeURIComponent(id)}`)
    if (opts.json) return void console.log(JSON.stringify({ ok: true, app: name, request: detail }))
    printDetail(detail)
    return
  }

  const limit = Math.min(100, Math.max(1, Number.isFinite(opts.limit) ? opts.limit : 50))
  const listPath = `${basePath}?limit=${limit}`

  if (!opts.follow || opts.json) {
    const { requests } = await call<{ requests: RequestSummary[] }>(phone, listPath)
    if (opts.json) return void console.log(JSON.stringify({ ok: true, app: name, requests }))
    if (requests.length === 0) {
      return void info(
        `No requests captured for ${name} yet. Send a request to the app, then run \`dukoi inspect ${name}\`.`,
      )
    }
    printSummaryTable(requests)
    return
  }

  // Follow mode: NDJSON stream of recent summaries, then live ones as they arrive.
  const followPath = `${listPath}&follow=1`
  await reach(phone)
  let res: Response
  try {
    res = await fetch(`http://${phone.host}:${phone.port}${followPath}`, {
      headers: signRequest({ method: 'GET', path: followPath, body: '' }, computerKey()),
    })
  } catch (err) {
    throw unreachable(phone, err)
  }
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => null)) as {
      code?: string
      message?: string
      hint?: string
    } | null
    throw new CliError(
      body?.code ?? 'INSPECT_FAILED',
      body?.message ?? `Couldn't inspect requests (HTTP ${res.status}).`,
      body?.hint,
    )
  }

  info(c.dim(`Watching ${name} (last 100 requests kept in memory; Ctrl+C to stop)`))
  const decoder = new TextDecoder()
  let partial = ''
  for await (const chunk of res.body) {
    const text = partial + decoder.decode(chunk, { stream: true })
    const lines = text.split('\n')
    partial = lines.pop() ?? ''
    for (const line of lines) {
      if (!line || line.startsWith(':')) continue
      try {
        const parsed = JSON.parse(line) as RequestSummary | { clear: true }
        if ('clear' in parsed) {
          info(c.dim('— cleared —'))
          continue
        }
        info(formatSummaryLine(parsed))
      } catch {
        // Ignore malformed keep-alive or partial frame.
      }
    }
  }
}

export async function replay(opts: ReplayOptions): Promise<void> {
  const { appArg, id } = resolveInspectTarget(opts.args, opts.app)
  if (!id) {
    throw new CliError(
      'MISSING_REQUEST_ID',
      'Which request should I replay?',
      'Pass a request ID, like `dukoi replay r_001`. Run `dukoi inspect` to see recent IDs.',
    )
  }
  const name = appName(appArg)
  const phone = pickPhone(opts.device)
  const { request: result } = await call<ReplayResult>(
    phone,
    `/apps/${encodeURIComponent(name)}/requests/${encodeURIComponent(id)}/replay`,
    { method: 'POST', timeoutMs: 45_000 },
  )
  if (opts.json) return void console.log(JSON.stringify({ ok: true, app: name, request: result }))

  ok(
    `Replayed ${id} as ${c.bold(result.id)}  ${result.method} ${result.path}  ${statusBadge(result.status)} ${c.dim(`(${result.durationMs}ms)`)}`,
  )
  const preview = previewBody(result.resBody, result.resBinary, result.resBytes)
  if (preview) info(`  ${c.dim(preview)}`)
}

function printSummaryTable(requests: RequestSummary[]): void {
  const rows = [['ID', 'TIME', 'METHOD', 'PATH', 'STATUS', 'TIME', 'SIZE'].map((h) => c.dim(h))]
  for (const r of requests) {
    const suffix = r.replayedFrom ? ` ${c.dim(`↻ ${r.replayedFrom}`)}` : ''
    rows.push([
      r.id,
      c.dim(clock(r.at)),
      r.method,
      r.path + suffix,
      statusBadge(r.status),
      `${r.durationMs}ms`,
      formatBytes(r.resBytes),
    ])
  }
  info(table(rows))
  info(c.dim('\nInspect one with `dukoi inspect <id>`, or replay with `dukoi replay <id>`.'))
}

function formatSummaryLine(r: RequestSummary): string {
  const suffix = r.replayedFrom ? ` ${c.dim(`↻ ${r.replayedFrom}`)}` : ''
  return [
    r.id.padEnd(6),
    c.dim(clock(r.at)),
    r.method.padEnd(6),
    statusBadge(r.status),
    `${r.durationMs}ms`.padStart(6),
    formatBytes(r.resBytes).padStart(7),
    r.path + suffix,
  ].join('  ')
}

function printDetail(r: RequestDetail): void {
  info(
    `${c.bold(`${r.method} ${r.path}`)}  ${statusBadge(r.status)} ${c.dim(`(${r.durationMs}ms)`)}`,
  )
  const meta = [
    r.id,
    r.at.replace('T', ' ').slice(0, 19),
    r.from ? `from ${r.from}` : null,
    r.replayedFrom ? `replayed from ${r.replayedFrom}` : null,
  ].filter(Boolean)
  info(c.dim(meta.join('  ·  ')))

  info(`\n${c.bold('Request headers')}`)
  printHeaders(r.reqHeaders)

  info(
    `\n${c.bold('Request body')} ${c.dim(`(${formatBytes(r.reqBytes)}${r.reqTruncated ? ', first 64 KB shown' : ''})`)}`,
  )
  printBody(r.reqBody, r.reqBinary, r.reqBytes, r.reqHeaders['content-type'])

  info(`\n${c.bold('Response headers')}`)
  printHeaders(r.resHeaders)

  info(
    `\n${c.bold('Response body')} ${c.dim(`(${formatBytes(r.resBytes)}${r.resTruncated ? ', first 64 KB shown' : ''})`)}`,
  )
  printBody(r.resBody, r.resBinary, r.resBytes, r.resHeaders['content-type'])
}

function printHeaders(headers: Record<string, string>): void {
  const entries = Object.entries(headers)
  if (entries.length === 0) return void info(c.dim('  (none)'))
  for (const [k, v] of entries) {
    info(`  ${c.dim(`${k}:`)} ${v === '[redacted]' ? c.yellow(v) : v}`)
  }
}

function printBody(
  body: string | null,
  binary: boolean,
  bytes: number,
  contentType: string | undefined,
): void {
  if (bytes === 0) return void info(c.dim('  (empty)'))
  if (binary || body === null) return void info(c.dim(`  [binary body, ${formatBytes(bytes)}]`))
  const formatted = prettyBody(body, contentType)
  for (const line of formatted.split('\n')) info(`  ${line}`)
}

function prettyBody(body: string, contentType: string | undefined): string {
  const trimmed = body.trim()
  const looksJson =
    (contentType?.toLowerCase().includes('json') ?? false) ||
    trimmed.startsWith('{') ||
    trimmed.startsWith('[')
  if (!looksJson) return body
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2)
  } catch {
    return body
  }
}

function previewBody(body: string | null, binary: boolean, bytes: number): string | null {
  if (bytes === 0) return null
  if (binary || body === null) return `[binary response, ${formatBytes(bytes)}]`
  const oneLine = body.replace(/\s+/g, ' ').trim()
  if (!oneLine) return null
  return oneLine.length > 120 ? `${oneLine.slice(0, 119)}…` : oneLine
}

function statusBadge(status: number): string {
  if (status === 0) return c.red('ERR')
  const s = String(status)
  if (status >= 500) return c.red(s)
  if (status >= 400) return c.yellow(s)
  if (status >= 300) return c.cyan(s)
  return c.green(s)
}

function clock(iso: string): string {
  return iso.slice(11, 19)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
