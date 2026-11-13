// Finds a paired phone wherever it is now: at an address it had before, on
// this Wi-Fi under a new address, or on your tailnet (Tailscale). A phone is
// matched by its key, never by its address, so a new address is only used
// once the phone there proves it's the one you paired with.
import { execFile } from 'node:child_process'
import type { PhoneInfo } from '@dukoi/shared'
import type { Target } from './client.ts'
import { rememberHost } from './config.ts'
import { discover } from './discover.ts'
import { CliError } from './output.ts'

/** How long one address gets to answer /info. Tailscale's relays can take a second. */
const PROBE_MS = 2500

/** Asks one address who it is. Null if nothing answers in time. */
export async function probe(host: string, port: number): Promise<PhoneInfo | null> {
  try {
    const res = await fetch(`http://${host}:${port}/info`, {
      signal: AbortSignal.timeout(PROBE_MS),
    })
    if (!res.ok) return null
    const info = (await res.json()) as PhoneInfo
    return info?.publicKey ? info : null
  } catch {
    return null
  }
}

/** The first of these addresses where the phone with this key answers, or null. */
export async function firstMatch(
  hosts: string[],
  port: number,
  publicKey: string,
): Promise<string | null> {
  if (hosts.length === 0) return null
  return Promise.any(
    hosts.map(async (host) => {
      const info = await probe(host, port)
      if (info?.publicKey !== publicKey) throw new Error('not this phone')
      return host
    }),
  ).catch(() => null)
}

export interface Tailnet {
  /** missing: no Tailscale on this computer. off: installed but not connected. */
  state: 'running' | 'off' | 'missing'
  /** Android devices that are online on the tailnet, by their Tailscale IPv4 address */
  phones: string[]
  /** Tailscale addresses of devices that are on the tailnet but offline */
  offline: string[]
}

interface TailscaleStatus {
  BackendState?: string
  Peer?: Record<string, { OS?: string; Online?: boolean; TailscaleIPs?: string[] }>
}

// The Mac app doesn't always put `tailscale` on the PATH.
const TAILSCALE_BINS = ['tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale']

function run(bin: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: 2000 }, (err, stdout) => resolve(err && !stdout ? null : stdout))
  })
}

/** What this computer's Tailscale can see. Never throws. */
export async function readTailnet(): Promise<Tailnet> {
  const none: Tailnet = { state: 'missing', phones: [], offline: [] }
  for (const bin of TAILSCALE_BINS) {
    const out = await run(bin, ['status', '--json'])
    if (out === null) continue
    let status: TailscaleStatus
    try {
      status = JSON.parse(out) as TailscaleStatus
    } catch {
      return { ...none, state: 'off' }
    }
    return parseTailnet(status)
  }
  return none
}

export function parseTailnet(status: TailscaleStatus): Tailnet {
  if (status.BackendState !== 'Running') return { state: 'off', phones: [], offline: [] }
  const phones: string[] = []
  const offline: string[] = []
  for (const peer of Object.values(status.Peer ?? {})) {
    const v4 = peer.TailscaleIPs?.find((ip) => ip.includes('.'))
    if (!v4) continue
    if (!peer.Online) offline.push(v4)
    else if (peer.OS === 'android') phones.push(v4)
  }
  return { state: 'running', phones, offline }
}

const unique = (list: string[]) => [...new Set(list)]

/** Phones already found in this run. The dashboard forgets one when a call to it fails. */
const found = new WeakSet<Target>()

export function forget(target: Target): void {
  found.delete(target)
}

/**
 * Points `phone.host` at an address where the phone answers right now, and
 * saves it if it changed. Throws a plain-words error if the phone is nowhere.
 */
export async function reach(phone: Target & { name?: string }): Promise<void> {
  if (!phone.publicKey || found.has(phone)) return
  const key = phone.publicKey
  const known = unique([phone.host, ...(phone.hosts ?? [])])

  let host = await firstMatch(known, phone.port, key)
  let tailnet: Tailnet | null = null
  if (!host) {
    const [wifi, net] = await Promise.all([discover(1500), readTailnet()])
    tailnet = net
    const fresh = unique([...wifi.map((f) => f.host), ...net.phones]).filter(
      (h) => !known.includes(h),
    )
    host = await firstMatch(fresh, phone.port, key)
  }
  if (!host) throw lost(phone, tailnet ?? (await readTailnet()))

  if (host !== phone.host) {
    phone.hosts = unique([host, ...known])
    phone.host = host
    rememberHost(key, host)
  }
  found.add(phone)
}

/** Why we couldn't find the phone, in the order a person would check. */
export function lost(phone: Target & { name?: string }, tailnet: Tailnet): CliError {
  const name = phone.name ?? 'The phone'
  const known = [phone.host, ...(phone.hosts ?? [])]
  if (tailnet.state === 'off') {
    return new CliError(
      'PHONE_UNREACHABLE',
      `Couldn’t find ${name} on this Wi-Fi, and Tailscale is off on this computer.`,
      'Turn Tailscale on, or join the same Wi-Fi as the phone, then try again.',
    )
  }
  if (tailnet.offline.some((ip) => known.includes(ip))) {
    return new CliError(
      'PHONE_UNREACHABLE',
      `${name} is offline on Tailscale and isn’t on this Wi-Fi.`,
      'Open Tailscale on the phone and turn it on, then try again.',
    )
  }
  if (tailnet.state === 'running') {
    return new CliError(
      'PHONE_UNREACHABLE',
      `Couldn’t find ${name} on this Wi-Fi or your tailnet.`,
      'Check the phone is on and Dukoi is running. Away from home, sign the phone in to Tailscale.',
    )
  }
  return new CliError(
    'PHONE_UNREACHABLE',
    `Couldn’t find ${name} on this Wi-Fi.`,
    'Check the phone is on, Dukoi is running and it’s on the same Wi-Fi. Away from home, put both on Tailscale: https://dukoi.com/docs/pairing',
  )
}

/**
 * The phone builds app URLs from its own Wi-Fi address, which may not be the
 * one this computer reaches it on (a hotspot, Tailscale). Point them at the
 * address that just worked.
 */
export function pointAt<T>(value: T, host: string): T {
  if (host === 'localhost' || host.startsWith('127.')) return value
  const visit = (v: unknown): void => {
    if (Array.isArray(v)) {
      for (const item of v) visit(item)
      return
    }
    if (!v || typeof v !== 'object') return
    const o = v as Record<string, unknown>
    for (const [k, val] of Object.entries(o)) {
      if ((k === 'localUrl' || k === 'wifiUrl') && typeof val === 'string')
        o[k] = withHost(val, host)
      else visit(val)
    }
  }
  visit(value)
  return value
}

export function withHost(url: string, host: string): string {
  try {
    const u = new URL(url)
    if (!u.hostname) return url
    u.hostname = host
    return u.toString().replace(/\/$/, url.endsWith('/') ? '/' : '')
  } catch {
    return url
  }
}
