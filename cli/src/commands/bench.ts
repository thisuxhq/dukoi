// dukoi bench: how fast is this phone? Deploys the notes API as dukoi-bench,
// loads it over Wi-Fi, through a quick tunnel and again once it's warm, then
// removes it. --share sends the numbers to dukoi.com/bench. See docs/benchmarks.md.
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type AppInfo,
  type BenchNumbers,
  type BenchResult,
  type BenchSample,
  type BenchSignature,
  DUKOI_VERSION,
  type ExposeResult,
  type PhoneStatus,
} from '@dukoi/shared'
import { call, pickPhone } from '../client.ts'
import { answers, type LoadResult, publicAddress, runLoad } from '../load.ts'
import { CliError, c, info, ok, warn } from '../output.ts'
import { deploy } from './deploy.ts'
import { source } from './init.ts'

export const BENCH_APP = 'dukoi-bench'
const CONNECTIONS = 50
// DUKOI_BENCH_SECONDS shortens every step, for trying changes to this file.
const SECONDS = Number(process.env.DUKOI_BENCH_SECONDS ?? 60)
// 9 minutes of load before the 1-minute hot test
const HEAT_SECONDS = SECONDS * 9
const SAMPLE_EVERY_MS = 5000
const MIN_BATTERY = 15
const SHARE_URL = process.env.DUKOI_BENCH_API ?? 'https://dukoi.com/api/bench'

type Phone = ReturnType<typeof pickPhone>

export interface BenchOptions {
  device?: string
  quick: boolean
  share: boolean
  json: boolean
}

export async function bench(opts: BenchOptions): Promise<BenchResult> {
  const phone = pickPhone(opts.device)
  const say = (line: string) => !opts.json && info(line)
  const step = (line: string) => !opts.json && ok(line)
  const note = (line: string) => !opts.json && warn(line)

  const status = await call<PhoneStatus>(phone, '/status')
  const first = await sample(phone)
  const others = (await call<AppInfo[]>(phone, '/apps')).filter(
    (a) => a.name !== BENCH_APP && a.state === 'running',
  )
  const ramGb = Math.round(status.memory.totalMb / 1024)
  say(
    `Benchmarking ${c.bold(phone.name)} ${c.dim(`(${[status.model, status.chip, `${ramGb} GB`, `Android ${status.android}`].filter(Boolean).join(', ')})`)}\n`,
  )

  const battery = first?.battery
  if (battery && !battery.pluggedIn && battery.level !== null && battery.level < MIN_BATTERY)
    throw new CliError(
      'BATTERY_LOW',
      `The phone's battery is at ${battery.level}%.`,
      'Plug it in, then run `dukoi bench` again.',
    )
  if (battery && !battery.pluggedIn)
    note('The phone isn’t on charge. A bench uses a lot of battery, so plug it in if you can.')
  if (others.length)
    note(
      `${others.length} other ${others.length === 1 ? 'app is' : 'apps are'} running and will share the CPU, so the numbers may be lower.`,
    )
  if (!first)
    note('This phone’s app is older than the CLI, so the bench can’t read its temperature.')
  if ((battery && !battery.pluggedIn) || others.length || !first) say('')

  // Ctrl+C still removes the bench app.
  const abort = new AbortController()
  const onSigint = () => abort.abort()
  process.once('SIGINT', onSigint)
  const stopIfAsked = () => {
    if (abort.signal.aborted) throw new CliError('STOPPED', 'Stopped. Removed the bench app.')
  }
  let deployed = false
  try {
    const app = await deployBenchApp(opts.device)
    deployed = true
    step('Deployed the bench app')
    await seed(app.localUrl)

    // A few seconds to wake up, not counted.
    await runLoad({
      url: `${app.localUrl}/notes`,
      connections: CONNECTIONS,
      seconds: 5,
      signal: abort.signal,
    })
    stopIfAsked()
    const wifi = await measure(phone, 'On Wi-Fi', `${app.localUrl}/notes`, opts.json, abort.signal)
    stopIfAsked()

    let tunnel: Measured | null = null
    const link = await openTunnel(phone, opts.json)
    if (link)
      tunnel = await measure(
        phone,
        'Through the tunnel',
        `${link.url}/notes`,
        opts.json,
        abort.signal,
        link.address,
      )

    stopIfAsked()

    let hot: Measured | null = null
    if (!opts.quick) {
      // Warm the phone up on Wi-Fi, which loads it harder than the tunnel can.
      await runLoad({
        url: `${app.localUrl}/notes`,
        connections: CONNECTIONS,
        seconds: HEAT_SECONDS,
        signal: abort.signal,
        onTick: progress('Warming up', HEAT_SECONDS + SECONDS, opts.json),
      })
      clearProgress(opts.json)
      stopIfAsked()
      const url = link ? `${link.url}/notes` : `${app.localUrl}/notes`
      hot = await measure(phone, 'Hot, after 10 min', url, opts.json, abort.signal, link?.address)
    }
    stopIfAsked()

    const result: BenchResult = {
      version: 1,
      phone: {
        maker: status.maker ?? null,
        model: status.model,
        chip: status.chip ?? null,
        ramGb,
        android: status.android,
        cores: status.cpuCount,
      },
      versions: { dukoi: DUKOI_VERSION, node: status.nodeVersion },
      load: { connections: CONNECTIONS, seconds: SECONDS },
      wifi: wifi.numbers,
      tunnel: tunnel?.numbers ?? null,
      hot: hot?.numbers ?? null,
      otherAppsRunning: others.length,
      limitedByComputer: [wifi, tunnel, hot].some((m) => m && m.cpuShare > 0.9),
    }

    await removeBenchApp(phone)
    deployed = false
    step('Removed the bench app')

    const shared = opts.share ? await share(phone, result, opts.json) : null
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, result, shared }))
      return result
    }
    if (result.limitedByComputer)
      note(
        'This computer was the limit, not the phone. Close other programs, or try a faster computer.',
      )
    if (!opts.share && !result.limitedByComputer)
      say(`\n  Compare it with other phones: ${c.cyan('dukoi bench --share')}`)
    return result
  } finally {
    process.off('SIGINT', onSigint)
    if (deployed) await removeBenchApp(phone).catch(() => {})
  }
}

interface Measured {
  numbers: BenchNumbers
  cpuShare: number
}

/** One 60-second run, with the phone's CPU and temperature read every 5 seconds. */
async function measure(
  phone: Phone,
  label: string,
  url: string,
  json: boolean,
  signal: AbortSignal,
  address?: string,
): Promise<Measured> {
  let peakCpu: number | null = null
  let batteryC: number | null = null
  const read = async () => {
    const s = await sample(phone).catch(() => null)
    const cpu = s?.app?.cpuPercent
    if (typeof cpu === 'number') peakCpu = Math.max(peakCpu ?? 0, cpu)
    if (typeof s?.battery?.temperatureC === 'number') batteryC = s.battery.temperatureC
  }
  const timer = setInterval(read, SAMPLE_EVERY_MS)
  let load: LoadResult
  try {
    load = await runLoad({
      url,
      address,
      connections: CONNECTIONS,
      seconds: SECONDS,
      signal,
      onTick: progress(label, SECONDS, json),
    })
  } finally {
    clearInterval(timer)
    clearProgress(json)
  }
  await read()
  const numbers: BenchNumbers = {
    rps: load.rps,
    p50Ms: load.p50Ms,
    p99Ms: load.p99Ms,
    errorRate: Math.round(load.errorRate * 10_000) / 10_000,
    requests: load.requests,
    cpuPercent: peakCpu,
    batteryC,
  }
  if (!json) ok(line(label, numbers))
  return { numbers, cpuShare: load.cpuShare }
}

export function line(label: string, n: BenchNumbers): string {
  const rps = `${n.rps.toLocaleString('en-US')} req/s`.padStart(12)
  const parts = [label.padEnd(19), rps, `   p99 ${formatMs(n.p99Ms)}`.padEnd(14)]
  if (n.errorRate > 0) parts.push(c.yellow(`   ${(n.errorRate * 100).toFixed(1)}% errors`))
  if (n.batteryC !== null) parts.push(c.dim(`   ${n.batteryC} °C`))
  return parts.join('')
}

const formatMs = (ms: number) => (ms < 10 ? `${ms.toFixed(1)} ms` : `${Math.round(ms)} ms`)

/** Readings from the phone, or null when its app is too old to have /bench/sample. */
async function sample(phone: Phone): Promise<BenchSample | null> {
  try {
    return await call<BenchSample>(phone, `/bench/sample?app=${BENCH_APP}`, { timeoutMs: 4000 })
  } catch (err) {
    if (err instanceof CliError && err.code === 'NOT_FOUND') return null
    throw err
  }
}

/** The notes API, the same code every phone runs, as dukoi-bench. */
async function deployBenchApp(device: string | undefined): Promise<AppInfo> {
  const dir = mkdtempSync(join(tmpdir(), 'dukoi-bench-'))
  try {
    cpSync(source('notes-api'), dir, {
      recursive: true,
      filter: (src) => !src.split(/[\\/]/).includes('node_modules'),
    })
    const result = await deploy({
      folder: dir,
      name: BENCH_APP,
      device,
      noHealthCheck: false,
      json: false,
      quiet: true,
    })
    return result.app
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Twenty notes, so GET /notes reads real rows from the database. */
async function seed(localUrl: string): Promise<void> {
  for (let i = 1; i <= 20; i++) {
    await fetch(`${localUrl}/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: `Benchmark note ${i}` }),
    })
  }
}

/** A quick link and its address, once it answers. Null if the phone can't open one, so the bench carries on. */
async function openTunnel(
  phone: Phone,
  json: boolean,
): Promise<{ url: string; address: string } | null> {
  let url: string
  try {
    url = (
      await call<ExposeResult>(phone, `/apps/${BENCH_APP}/expose`, {
        method: 'POST',
        timeoutMs: 45_000,
      })
    ).publicUrl
  } catch (err) {
    if (!json) warn(`Skipped the tunnel test: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
  // A new quick link takes a few seconds to exist and reach Cloudflare's edge.
  const host = new URL(url).hostname
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    const address = await publicAddress(host)
    if (address && (await answers(`${url}/notes`, address))) return { url, address }
    await new Promise((r) => setTimeout(r, 2000))
  }
  if (!json) warn('Skipped the tunnel test: the quick link didn’t answer within 2 minutes.')
  return null
}

async function removeBenchApp(phone: Phone): Promise<void> {
  await call(phone, `/apps/${BENCH_APP}`, { method: 'DELETE', timeoutMs: 30_000 })
}

/** Signs the result on the phone and sends it to dukoi.com. */
async function share(
  phone: Phone,
  result: BenchResult,
  json: boolean,
): Promise<{ url: string } | null> {
  const body = JSON.stringify(result)
  const signed = await call<BenchSignature>(phone, '/bench/sign', {
    method: 'POST',
    rawBody: body,
  }).catch((err) => {
    if (err instanceof CliError && err.code === 'NOT_FOUND')
      throw new CliError(
        'PHONE_OUTDATED',
        'The Dukoi app on the phone is too old to share a result.',
        'Install the new app from https://dukoi.com/download/dukoi.apk, then run `dukoi bench --share` again.',
      )
    throw err
  })
  let res: Response
  try {
    res = await fetch(SHARE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ result: body, ...signed }),
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    throw new CliError(
      'SHARE_FAILED',
      'Couldn’t reach dukoi.com to share the result.',
      'Check this computer is online, then run `dukoi bench --share` again.',
    )
  }
  const answer = (await res.json().catch(() => null)) as
    | { url: string }
    | { error: { code: string; message: string; hint?: string } }
    | null
  if (!res.ok || !answer || 'error' in answer) {
    const e = answer && 'error' in answer ? answer.error : null
    throw new CliError(
      e?.code ?? 'SHARE_FAILED',
      e?.message ?? `dukoi.com didn’t take the result (HTTP ${res.status}).`,
      e?.hint,
    )
  }
  if (!json) {
    ok('Shared')
    info(`\n  ${c.cyan(answer.url)}`)
  }
  return answer
}

/** "  On Wi-Fi  23s / 60s", rewritten in place each second. */
function progress(label: string, total: number, json: boolean) {
  if (json || !process.stdout.isTTY) return undefined
  return (_done: number, elapsed: number) => {
    const left = Math.max(0, Math.round(total - elapsed))
    const time = left >= 120 ? `${Math.ceil(left / 60)} min` : `${left}s`
    process.stdout.write(`\r\x1b[2K  ${c.dim(`${label}… ${time} left`)}`)
  }
}

function clearProgress(json: boolean): void {
  if (!json && process.stdout.isTTY) process.stdout.write('\r\x1b[2K')
}
