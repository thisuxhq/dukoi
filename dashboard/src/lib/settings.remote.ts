// The Settings page: the phone, paired computers and Cloudflare, plus the
// actions a paired computer may take. Removing other computers happens on the
// phone, so it isn't here.
import type { AppInfo, DomainStatus, PairedComputer, PhoneStatus } from '@dukoi/shared'
import { computerKey, removePhone } from 'dukoi/config'
import type { Problem } from '#lib/problem.js'
import { fail, phone, problem, signed } from '#lib/server/phone.js'
import { command, query } from '$app/server'

export interface Settings {
  address: string
  status: PhoneStatus | null
  computers: (PairedComputer & { self: boolean })[]
  cloudflare: DomainStatus | null
  problem: Problem | null
}

export const getSettings = query(async (): Promise<Settings> => {
  const p = phone()
  const address = `${p.host}:${p.port}`
  try {
    const [status, computers, cloudflare] = await Promise.all([
      signed<PhoneStatus>('/status'),
      signed<PairedComputer[]>('/computers'),
      signed<DomainStatus>('/domain'),
    ])
    const me = computerKey().publicKey
    return {
      address,
      status,
      computers: computers.map((c) => ({ ...c, self: c.publicKey === me })),
      cloudflare,
      problem: null,
    }
  } catch (err) {
    return { address, status: null, computers: [], cloudflare: null, problem: problem(err) }
  }
})

/** Removes every domain, its DNS record, the tunnel and the login. */
export const disconnectCloudflare = command(async () => {
  try {
    await signed('/domain', { method: 'DELETE', timeoutMs: 60_000 })
  } catch (err) {
    fail(err)
  }
  getSettings().refresh()
})

/** Stops every app. They stay stopped after a reboot. */
export const stopAll = command(async () => {
  let apps: AppInfo[]
  try {
    apps = await signed<AppInfo[]>('/apps')
  } catch (err) {
    fail(err)
  }
  const results = await Promise.allSettled(
    apps.map((a) => signed(`/apps/${a.name}/stop`, { method: 'POST', timeoutMs: 30_000 })),
  )
  return { total: apps.length, failed: results.filter((r) => r.status === 'rejected').length }
})

/**
 * Forgets the phone on this computer and asks the phone to forget this
 * computer, like `dukoi unpair`. The dashboard stops working after this.
 */
export const unpair = command(async () => {
  const p = phone()
  let phoneForgot = true
  try {
    await signed('/computers/self', { method: 'DELETE', timeoutMs: 4000 })
  } catch {
    phoneForgot = false
  }
  removePhone(p.name)
  return { phone: p.name, phoneForgot }
})
