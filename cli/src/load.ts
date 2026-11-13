// A small HTTP load generator for `dukoi bench`: a fixed number of keep-alive
// connections, each sending the next request as soon as the last one answers.
// Every request's time is kept, so p50 and p99 are exact.
import { Agent as HttpAgent, request as httpRequest } from 'node:http'
import { Agent as HttpsAgent, request as httpsRequest } from 'node:https'
import type { LookupFunction } from 'node:net'

export interface LoadOptions {
  url: string
  connections: number
  seconds: number
  /** Connect to this IP address instead of looking the host up (see publicAddress) */
  address?: string
  /** Called about once a second with the requests so far, for a progress line */
  onTick?: (done: number, elapsedS: number) => void
  signal?: AbortSignal
}

export interface LoadResult {
  requests: number
  errors: number
  rps: number
  p50Ms: number
  p99Ms: number
  errorRate: number
  /** Share of one core this process used. Near 1 means the computer was the limit. */
  cpuShare: number
}

export async function runLoad(opts: LoadOptions): Promise<LoadResult> {
  const url = new URL(opts.url)
  const https = url.protocol === 'https:'
  const agent = new (https ? HttpsAgent : HttpAgent)({
    keepAlive: true,
    maxSockets: opts.connections,
    ...(opts.address ? { lookup: pinned(opts.address) } : {}),
  })
  const send = https ? httpsRequest : httpRequest
  const times: number[] = []
  let errors = 0
  const start = performance.now()
  const cpuStart = process.cpuUsage()
  const end = start + opts.seconds * 1000
  const stopped = () => performance.now() >= end || opts.signal?.aborted === true

  const once = () =>
    new Promise<boolean>((resolve) => {
      const t0 = performance.now()
      const req = send(url, { agent, method: 'GET', timeout: 10_000 }, (res) => {
        res.resume()
        res.on('end', () => {
          const ok = (res.statusCode ?? 0) < 400
          if (ok) times.push(performance.now() - t0)
          resolve(ok)
        })
        res.on('error', () => resolve(false))
      })
      req.on('timeout', () => req.destroy(new Error('timed out')))
      req.on('error', () => resolve(false))
      req.end()
    })

  const worker = async () => {
    while (!stopped()) {
      if (!(await once())) {
        errors++
        // Don't spin when the phone is down: a refused connection fails at once.
        await new Promise((r) => setTimeout(r, 50))
      }
    }
  }

  const ticker = opts.onTick
    ? setInterval(
        () => opts.onTick?.(times.length + errors, (performance.now() - start) / 1000),
        1000,
      )
    : null
  try {
    await Promise.all(Array.from({ length: opts.connections }, worker))
  } finally {
    if (ticker) clearInterval(ticker)
    agent.destroy()
  }

  const elapsedMs = performance.now() - start
  const cpu = process.cpuUsage(cpuStart)
  const requests = times.length + errors
  return {
    requests,
    errors,
    rps: Math.round((times.length / elapsedMs) * 1000),
    ...percentiles(times),
    errorRate: requests ? errors / requests : 0,
    cpuShare: (cpu.user + cpu.system) / 1000 / elapsedMs,
  }
}

/** p50 and p99 of request times, rounded to 0.1 ms. */
export function percentiles(times: number[]): { p50Ms: number; p99Ms: number } {
  if (times.length === 0) return { p50Ms: 0, p99Ms: 0 }
  const sorted = Float64Array.from(times).sort()
  const at = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] ?? 0
  const round = (n: number) => Math.round(n * 10) / 10
  return { p50Ms: round(at(0.5)), p99Ms: round(at(0.99)) }
}

/** A DNS lookup that always answers with this address. TLS still checks the real hostname. */
export function pinned(address: string): LookupFunction {
  const family = address.includes(':') ? 6 : 4
  return (_hostname, options, callback) => {
    if (options.all) callback(null, [{ address, family }])
    else callback(null, address, family)
  }
}

/**
 * The address of a brand new hostname, from Cloudflare's DNS over HTTPS.
 * A new quick link takes a few seconds to exist, and if the computer asks
 * too early it remembers "no such name" for minutes. Asking over HTTPS
 * skips that memory. Null until the name exists.
 */
export async function publicAddress(hostname: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`,
      { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(5000) },
    )
    const answer = (await res.json()) as { Answer?: { type: number; data: string }[] }
    return answer.Answer?.find((a) => a.type === 1)?.data ?? null
  } catch {
    return null
  }
}

/** One GET, connecting to `address` when given. True on a 2xx or 3xx answer. */
export function answers(url: string, address?: string): Promise<boolean> {
  const u = new URL(url)
  const send = u.protocol === 'https:' ? httpsRequest : httpRequest
  return new Promise((resolve) => {
    const req = send(
      u,
      { method: 'GET', timeout: 5000, ...(address ? { lookup: pinned(address) } : {}) },
      (res) => {
        res.resume()
        resolve((res.statusCode ?? 0) < 400)
      },
    )
    req.on('timeout', () => req.destroy(new Error('timed out')))
    req.on('error', () => resolve(false))
    req.end()
  })
}
