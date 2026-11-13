// dukoi ps, logs and status
import { type AppInfo, type PhoneStatus, signRequest } from '@dukoi/shared'
import { call, pickPhone, unreachable } from '../client.ts'
import { computerKey, type SavedPhone } from '../config.ts'
import { CliError, c, info, table } from '../output.ts'
import { appName } from './apps.ts'

export const STATE_COLOUR: Record<AppInfo['state'], (s: string) => string> = {
  running: c.green,
  starting: c.yellow,
  restarting: c.yellow,
  crashed: c.red,
  stopped: c.dim,
}

export async function ps(device: string | undefined, json: boolean): Promise<void> {
  const apps = await call<AppInfo[]>(pickPhone(device), '/apps')
  if (json) return void console.log(JSON.stringify({ ok: true, apps }))
  if (apps.length === 0) return void info('No apps yet. Run `dukoi deploy` in an app folder.')
  const rows = [['APP', 'STATUS', 'CPU', 'MEM', 'UPTIME', 'RESTARTS', 'URL'].map((h) => c.dim(h))]
  for (const a of apps) {
    rows.push([
      a.name,
      STATE_COLOUR[a.state](a.state),
      a.cpuPercent === null ? '–' : `${a.cpuPercent}%`,
      a.memoryMb === null ? '–' : `${a.memoryMb} MB`,
      a.startedAt ? ago(a.startedAt) : '–',
      String(a.restarts),
      a.publicUrl ?? a.localUrl,
    ])
  }
  info(table(rows))
  const troubled = apps.filter((a) => a.lastExit && a.state !== 'running')
  for (const a of troubled)
    info(c.yellow(`\n⚠ ${a.name}: ${a.lastExit}. See \`dukoi logs ${a.name}\`.`))
}

export interface LogOptions {
  app?: string
  lines: number
  follow: boolean
  device?: string
  json: boolean
}

export async function logs(opts: LogOptions): Promise<void> {
  const name = appName(opts.app)
  await printLogs(pickPhone(opts.device), `/apps/${encodeURIComponent(name)}/logs`, opts, {
    app: name,
  })
}

/** Recent lines from an app's or a database's log, then live ones when following. */
export async function printLogs(
  phone: SavedPhone,
  path: string,
  opts: { lines: number; follow: boolean; json: boolean },
  label: Record<string, string>,
): Promise<void> {
  const base = `${path}?lines=${opts.lines}`

  if (!opts.follow || opts.json) {
    const { lines } = await call<{ lines: string[] }>(phone, base)
    if (opts.json) return void console.log(JSON.stringify({ ok: true, ...label, lines }))
    for (const l of lines) info(colourLine(l))
    return
  }

  // Follow: a long-lived signed request; lines arrive as they're written.
  const followPath = `${base}&follow=1`
  let res: Response
  try {
    res = await fetch(`http://${phone.host}:${phone.port}${followPath}`, {
      headers: signRequest({ method: 'GET', path: followPath, body: '' }, computerKey()),
    })
  } catch (err) {
    throw unreachable(phone, err)
  }
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => null)) as { code: string; message: string } | null
    throw new CliError(
      body?.code ?? 'LOGS_FAILED',
      body?.message ?? `Couldn't read logs (HTTP ${res.status}).`,
    )
  }
  const decoder = new TextDecoder()
  let partial = ''
  for await (const chunk of res.body) {
    const text = partial + decoder.decode(chunk, { stream: true })
    const lines = text.split('\n')
    partial = lines.pop() ?? ''
    for (const l of lines) if (l && !l.startsWith(':')) info(colourLine(l))
  }
}

/** "2026-11-11T04:13:10.495Z agent  App killed…" → "04:13:10 ● App killed…" */
function colourLine(line: string): string {
  const m = line.match(/^(\S+) (\S+)\s+(.*)$/)
  if (!m) return line
  const [, time, stream, text] = m as unknown as [string, string, string, string]
  const clock = c.dim(time.slice(11, 19))
  if (stream === 'agent') return `${clock} ${c.cyan('●')}   ${c.cyan(text)}`
  if (stream === 'err') return `${clock} ${c.red('err')} ${text}`
  return `${clock} ${c.dim('out')} ${text}`
}

export async function status(device: string | undefined, json: boolean): Promise<void> {
  const phone = pickPhone(device)
  const s = await call<PhoneStatus>(phone, '/status')
  if (json) return void console.log(JSON.stringify({ ok: true, status: s }))
  const memUsed = 100 - Math.round((s.memory.freeMb / s.memory.totalMb) * 100)
  info(`${c.bold(phone.name)}  ${s.model}, Android ${s.android}`)
  info(
    table([
      [c.dim('Apps'), `${s.apps.running} running of ${s.apps.total}`],
      [c.dim('Memory'), `${memUsed}% used (${s.memory.freeMb} MB free of ${s.memory.totalMb} MB)`],
      [
        c.dim('Storage'),
        s.storage
          ? `${(s.storage.freeMb / 1024).toFixed(1)} GB free of ${(s.storage.totalMb / 1024).toFixed(1)} GB`
          : '–',
      ],
      [c.dim('Load'), s.load.join('  ')],
      [
        c.dim('Agent'),
        `${s.agentVersion} on Node ${s.nodeVersion}, up ${duration(s.agentUptimeSeconds)}`,
      ],
      [c.dim('Phone up'), duration(s.phoneUptimeSeconds)],
      [c.dim('Address'), `${phone.host}:${phone.port}`],
    ]),
  )
}

export function ago(iso: string): string {
  return duration(Math.round((Date.now() - Date.parse(iso)) / 1000))
}

function duration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`
}
