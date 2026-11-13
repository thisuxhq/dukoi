// dukoi.com/api/bench: results people share with `dukoi bench --share`, and
// the medians for each phone model that dukoi.com/bench shows.
// The plan is in docs/benchmarks.md. The table is in migrations/0001_bench.sql.

/** The parts of D1 we use, so tests can pass a small fake. */
export interface Db {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T>(): Promise<T | null>
      all<T>(): Promise<{ results: T[] }>
      run(): Promise<unknown>
    }
  }
}

export interface BenchEnv {
  BENCH: Db
  /** Public keys of our lab phones, comma separated. Their runs get the Lab badge. */
  LAB_PHONES?: string
}

// Kept in step with BenchNumbers and BenchResult in shared/src/api.ts. The
// Worker can't import shared/, which uses node:crypto.
interface Numbers {
  rps: number
  p50Ms: number
  p99Ms: number
  errorRate: number
  requests: number
  cpuPercent: number | null
  batteryC: number | null
}

interface Result {
  version: 1
  phone: {
    maker: string | null
    model: string
    chip: string | null
    ramGb: number
    android: string
    cores: number
  }
  versions: { dukoi: string; node: string }
  load: { connections: number; seconds: number }
  wifi: Numbers
  tunnel: Numbers | null
  hot: Numbers | null
  otherAppsRunning: number
  limitedByComputer: boolean
}

/** One model on the board. */
export interface ModelSummary {
  slug: string
  maker: string | null
  model: string
  chip: string | null
  ramGb: number
  lab: boolean
  phones: number
  runs: number
  wifi: { rps: number; p99Ms: number }
  tunnel: { rps: number; p99Ms: number } | null
  hot: { rps: number; p99Ms: number; batteryC: number | null } | null
}

const MAX_BODY = 16 * 1024
const ONE_HOUR = 3600 * 1000
/** A model shows on the board once it has this many runs, unless it's a lab phone. */
export const MIN_RUNS = 3

export class BenchError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly hint?: string,
  ) {
    super(message)
  }
}

export async function handleBench(request: Request, env: BenchEnv, url: URL): Promise<Response> {
  try {
    if (url.pathname === '/api/bench' && request.method === 'POST')
      return json(await addRun(request, env), 201)
    if (url.pathname === '/api/bench' && request.method === 'GET')
      return json(await board(env), 200, true)
    const slug = url.pathname.match(/^\/api\/bench\/([a-z0-9-]+)$/)?.[1]
    if (slug && request.method === 'GET') return json(await modelPage(env, slug), 200, true)
    throw new BenchError(404, 'NOT_FOUND', 'There’s nothing at this address.')
  } catch (err) {
    const e =
      err instanceof BenchError
        ? err
        : new BenchError(500, 'UNEXPECTED', 'Something went wrong on dukoi.com. Try again soon.')
    if (!(err instanceof BenchError)) console.error(err)
    return json(
      { error: { code: e.code, message: e.message, ...(e.hint ? { hint: e.hint } : {}) } },
      e.status,
    )
  }
}

function json(body: unknown, status: number, cache = false): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cache ? 'public, max-age=600' : 'no-store',
      'access-control-allow-origin': '*',
    },
  })
}

// ── Adding a run ─────────────────────────────────────────────────────────

async function addRun(request: Request, env: BenchEnv): Promise<{ id: string; url: string }> {
  const text = await request.text()
  if (text.length > MAX_BODY) throw new BenchError(413, 'TOO_BIG', 'That result is too big.')
  let body: { result?: unknown; phoneKey?: unknown; signature?: unknown }
  try {
    body = JSON.parse(text)
  } catch {
    throw new BenchError(400, 'BAD_RESULT', 'That isn’t JSON.')
  }
  const { result: resultText, phoneKey, signature } = body
  if (
    typeof resultText !== 'string' ||
    typeof phoneKey !== 'string' ||
    typeof signature !== 'string'
  )
    throw new BenchError(400, 'BAD_RESULT', 'Send result, phoneKey and signature.')

  if (!(await verifyRun(resultText, phoneKey, signature)))
    throw new BenchError(
      400,
      'BAD_SIGNATURE',
      'The phone’s signature doesn’t match this result.',
      'Run `dukoi bench --share` again.',
    )

  let parsed: unknown
  try {
    parsed = JSON.parse(resultText)
  } catch {
    throw new BenchError(400, 'BAD_RESULT', 'The result isn’t JSON.')
  }
  const result = checkResult(parsed)

  const phoneHash = await sha256Hex(phoneKey)
  const now = Date.now()
  const last = await env.BENCH.prepare(
    'SELECT created_at FROM runs WHERE phone_hash = ? ORDER BY created_at DESC LIMIT 1',
  )
    .bind(phoneHash)
    .first<{ created_at: number }>()
  if (last && now - last.created_at < ONE_HOUR) {
    const minutes = Math.ceil((ONE_HOUR - (now - last.created_at)) / 60_000)
    throw new BenchError(
      429,
      'TOO_SOON',
      'This phone shared a result in the last hour.',
      `Share again in ${minutes} min.`,
    )
  }

  const id = crypto.randomUUID()
  const slug = modelSlug(result.phone.model)
  const lab = labKeys(env).includes(phoneKey) ? 1 : 0
  await env.BENCH.prepare(
    `INSERT INTO runs (id, created_at, phone_hash, model_slug, maker, model, chip, ram_gb, android, dukoi, node, lab, result)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      now,
      phoneHash,
      slug,
      result.phone.maker,
      result.phone.model,
      result.phone.chip,
      result.phone.ramGb,
      result.phone.android,
      result.versions.dukoi,
      result.versions.node,
      lab,
      resultText,
    )
    .run()
  return { id, url: `https://dukoi.com/bench#${slug}` }
}

/** Ed25519, the same text the phone signs (benchSignedText in shared/src/api.ts). */
export async function verifyRun(resultText: string, phoneKey: string, signature: string) {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      fromBase64url(phoneKey),
      { name: 'Ed25519' },
      false,
      ['verify'],
    )
    const signed = new TextEncoder().encode(`dukoi-bench-v1\n${await sha256Hex(resultText)}`)
    return await crypto.subtle.verify('Ed25519', key, fromBase64url(signature), signed)
  } catch {
    return false
  }
}

/** Throws unless the result looks like a real run. */
export function checkResult(value: unknown): Result {
  const bad = (why: string) =>
    new BenchError(400, 'BAD_RESULT', `That result doesn’t look right: ${why}.`)
  const r = value as Result
  if (r?.version !== 1) throw bad('unknown version')
  const p = r.phone
  if (!p || typeof p.model !== 'string' || !p.model.trim() || p.model.length > 80)
    throw bad('no phone model')
  if (!isNum(p.ramGb, 0, 64) || !isNum(p.cores, 1, 64)) throw bad('impossible phone')
  for (const s of [p.maker, p.chip])
    if (s !== null && (typeof s !== 'string' || s.length > 80)) throw bad('bad phone')
  if (typeof p.android !== 'string' || p.android.length > 20) throw bad('bad Android version')
  if (typeof r.versions?.dukoi !== 'string' || typeof r.versions?.node !== 'string')
    throw bad('no versions')
  if (r.load?.connections !== 50 || r.load?.seconds !== 60) throw bad('not the standard load')
  if (r.limitedByComputer) throw bad('the computer was the limit, not the phone')
  checkNumbers(r.wifi, 50_000, bad)
  if (r.tunnel !== null) checkNumbers(r.tunnel, 20_000, bad)
  if (r.hot !== null) checkNumbers(r.hot, 50_000, bad)
  if (!isNum(r.otherAppsRunning, 0, 100)) throw bad('bad app count')
  return r
}

function checkNumbers(n: Numbers, maxRps: number, bad: (why: string) => BenchError): void {
  if (!n) throw bad('missing numbers')
  if (!isNum(n.rps, 1, maxRps)) throw bad('requests a second out of range')
  if (!isNum(n.p50Ms, 0.1, 10_000) || !isNum(n.p99Ms, 1, 10_000) || n.p99Ms < n.p50Ms)
    throw bad('latency out of range')
  if (!isNum(n.errorRate, 0, 0.05)) throw bad('too many errors')
  if (!isNum(n.requests, 1, 1e8)) throw bad('bad request count')
  if (n.batteryC !== null && !isNum(n.batteryC, 0, 80)) throw bad('impossible temperature')
}

const isNum = (n: unknown, min: number, max: number): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max

// ── Reading the board ────────────────────────────────────────────────────

interface Row {
  phone_hash: string
  model_slug: string
  maker: string | null
  model: string
  chip: string | null
  ram_gb: number
  lab: number
  result: string
}

async function rows(env: BenchEnv, slug?: string): Promise<Row[]> {
  const sql = `SELECT phone_hash, model_slug, maker, model, chip, ram_gb, lab, result FROM runs${slug ? ' WHERE model_slug = ?' : ''} ORDER BY created_at DESC LIMIT 20000`
  const stmt = env.BENCH.prepare(sql)
  return (await (slug ? stmt.bind(slug) : stmt.bind()).all<Row>()).results
}

async function board(
  env: BenchEnv,
): Promise<{ models: ModelSummary[]; runs: number; phones: number }> {
  const all = await rows(env)
  const models = summarise(all)
    .filter((m) => m.lab || m.runs >= MIN_RUNS)
    .sort((a, b) => (b.tunnel?.rps ?? 0) - (a.tunnel?.rps ?? 0) || b.wifi.rps - a.wifi.rps)
  return { models, runs: all.length, phones: new Set(all.map((r) => r.phone_hash)).size }
}

async function modelPage(env: BenchEnv, slug: string) {
  const found = await rows(env, slug)
  const [model] = summarise(found)
  if (!model)
    throw new BenchError(
      404,
      'NO_SUCH_MODEL',
      'No one has shared a run from this phone yet.',
      'Run `dukoi bench --share` on one.',
    )
  return {
    model,
    // Every phone's own median through the tunnel, for the spread chart
    phones: perPhone(found).map((p) => ({ tunnelRps: p.tunnel?.rps ?? null, wifiRps: p.wifi.rps })),
  }
}

/** Groups runs by model. Each phone counts once: its own median. */
export function summarise(all: Row[]): ModelSummary[] {
  const bySlug = new Map<string, Row[]>()
  for (const r of all) bySlug.set(r.model_slug, [...(bySlug.get(r.model_slug) ?? []), r])
  return [...bySlug.entries()].map(([slug, runs]) => {
    const phones = trim(perPhone(runs))
    const latest = runs[0] as Row
    const pick = (k: 'wifi' | 'tunnel' | 'hot') =>
      phones.map((p) => p[k]).filter((n): n is Numbers => n !== null)
    const sum = (list: Numbers[]) =>
      list.length
        ? {
            rps: Math.round(median(list.map((n) => n.rps))),
            p99Ms: round1(median(list.map((n) => n.p99Ms))),
          }
        : null
    const hot = pick('hot')
    const temps = hot.map((n) => n.batteryC).filter((n): n is number => n !== null)
    const hotSum = sum(hot)
    return {
      slug,
      maker: latest.maker,
      model: latest.model,
      chip: latest.chip,
      ramGb: latest.ram_gb,
      lab: runs.some((r) => r.lab === 1),
      phones: phones.length,
      runs: runs.length,
      wifi: sum(pick('wifi')) ?? { rps: 0, p99Ms: 0 },
      tunnel: sum(pick('tunnel')),
      hot: hotSum ? { ...hotSum, batteryC: temps.length ? Math.round(median(temps)) : null } : null,
    }
  })
}

interface PhoneMedian {
  wifi: Numbers
  tunnel: Numbers | null
  hot: Numbers | null
}

function perPhone(runs: Row[]): PhoneMedian[] {
  const byPhone = new Map<string, Result[]>()
  for (const r of runs) {
    try {
      byPhone.set(r.phone_hash, [
        ...(byPhone.get(r.phone_hash) ?? []),
        JSON.parse(r.result) as Result,
      ])
    } catch {}
  }
  return [...byPhone.values()].map((results) => ({
    wifi: medianNumbers(results.map((r) => r.wifi)) as Numbers,
    tunnel: medianNumbers(results.map((r) => r.tunnel)),
    hot: medianNumbers(results.map((r) => r.hot)),
  }))
}

function medianNumbers(list: (Numbers | null)[]): Numbers | null {
  const have = list.filter((n): n is Numbers => n !== null)
  if (!have.length) return null
  const m = (k: keyof Numbers) => {
    const values = have.map((n) => n[k]).filter((v): v is number => v !== null)
    return values.length ? median(values) : null
  }
  return {
    rps: m('rps') ?? 0,
    p50Ms: m('p50Ms') ?? 0,
    p99Ms: m('p99Ms') ?? 0,
    errorRate: m('errorRate') ?? 0,
    requests: m('requests') ?? 0,
    cpuPercent: m('cpuPercent'),
    batteryC: m('batteryC'),
  }
}

/** With 10 or more phones, drop the top and bottom 10% by Wi-Fi speed. */
function trim(phones: PhoneMedian[]): PhoneMedian[] {
  if (phones.length < 10) return phones
  const sorted = [...phones].sort((a, b) => a.wifi.rps - b.wifi.rps)
  const cut = Math.floor(sorted.length / 10)
  return sorted.slice(cut, sorted.length - cut)
}

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** "Google Pixel 10a" → "google-pixel-10a" */
export function modelSlug(model: string): string {
  return (
    model
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'unknown'
  )
}

const labKeys = (env: BenchEnv) =>
  (env.LAB_PHONES ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function fromBase64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0))
}
