import { ADMIN_PORT, formatPairingCode, type PairStatus, type PhoneInfo } from '@dukoi/shared'
import { call, pickPhone, type Target } from '../client.ts'
import { computerKey, computerName, loadPhones, removePhone, savePhone } from '../config.ts'
import { discover } from '../discover.ts'
import { CliError, c, info, ok, table } from '../output.ts'
import { probe, readTailnet } from '../reach.ts'

export interface PairOptions {
  host?: string
  name?: string
  json: boolean
}

const POLL_MS = 1000
const WAIT_MS = 2 * 60 * 1000

export async function pair(opts: PairOptions): Promise<void> {
  const say = opts.json ? () => {} : info
  const target = await findPhone(opts.host, say)

  // Who is this phone? We don't know its key yet; the matching code below is
  // what proves nobody swapped it.
  const phone = await call<PhoneInfo>(target, '/info', { signed: false })
  if (!opts.json)
    ok(`Found ${phone.name} (${phone.model}, Android ${phone.android}) at ${target.host}`)
  const pinned: Target = { ...target, publicKey: phone.publicKey }

  const key = computerKey()
  let status = await call<PairStatus>(pinned, '/pair/request', {
    method: 'POST',
    signed: false,
    body: { publicKey: key.publicKey, name: computerName() },
  })

  if (status.state === 'pending' && !opts.json) {
    info(`\n  Code on your phone: ${c.bold(formatPairingCode(status.code))}`)
    info('  Tap Approve on the phone if the codes match.\n')
  }

  const deadline = Date.now() + WAIT_MS
  while (status.state === 'pending') {
    if (Date.now() > deadline) break
    await new Promise((r) => setTimeout(r, POLL_MS))
    status = await call<PairStatus>(
      pinned,
      `/pair/status?key=${encodeURIComponent(key.publicKey)}`,
      {
        signed: false,
      },
    )
  }

  if (status.state === 'denied') {
    throw new CliError('PAIRING_DENIED', 'The phone said no.', 'Run `dukoi pair` to try again.')
  }
  if (status.state !== 'approved') {
    throw new CliError(
      'PAIRING_EXPIRED',
      'Nobody tapped Approve on the phone within 2 minutes.',
      'Run `dukoi pair` again and approve on the phone.',
    )
  }

  const name = opts.name ?? phone.name
  savePhone({
    name,
    host: target.host,
    hosts: [...new Set([target.host, ...(target.hosts ?? [])])],
    port: target.port,
    publicKey: phone.publicKey,
    model: phone.model,
    pairedAt: new Date().toISOString(),
  })
  if (opts.json) {
    console.log(
      JSON.stringify({ ok: true, phone: { name, host: target.host, model: phone.model } }),
    )
  } else {
    ok(`Paired with ${c.bold(name)}`)
    info(`\n  Next: ${c.cyan('dukoi deploy')} in your app's folder`)
  }
}

async function findPhone(host: string | undefined, say: (s: string) => void): Promise<Target> {
  if (host) {
    const [h, p] = host.split(':')
    return { host: h as string, port: Number(p ?? ADMIN_PORT), publicKey: null }
  }
  say('Looking for phones on this Wi-Fi and your tailnet…')
  const found = await findAll()
  if (found.length === 0) {
    throw new CliError(
      'NO_PHONE_FOUND',
      'No Dukoi phone found on this Wi-Fi or your tailnet.',
      'Open Dukoi on the phone and check it’s on the same Wi-Fi, or signed in to Tailscale. Or pass its address: dukoi pair --host 192.168.1.24',
    )
  }
  if (found.length > 1) {
    const list = found.map((f) => `    ${f.name}  ${f.host}`).join('\n')
    throw new CliError(
      'MANY_PHONES',
      `Found ${found.length} phones. Pick one with --host:`,
      `${list}\n\n  dukoi pair --host ${found[0]?.host}`,
    )
  }
  const f = found[0] as (typeof found)[number]
  return { host: f.host, port: f.port, hosts: f.hosts, publicKey: null }
}

/** Every Dukoi phone on this Wi-Fi (mDNS) or the tailnet, one entry per phone. */
async function findAll(): Promise<{ name: string; host: string; hosts: string[]; port: number }[]> {
  const [wifi, tailnet] = await Promise.all([discover(), readTailnet()])
  const candidates = [
    ...wifi.map((f) => ({ host: f.host, port: f.port })),
    ...tailnet.phones.map((h) => ({ host: h, port: ADMIN_PORT })),
  ]
  const answers = await Promise.all(
    candidates.map(async (c) => ({ ...c, info: await probe(c.host, c.port) })),
  )
  // A phone on both the Wi-Fi and the tailnet answers twice: keep one, Wi-Fi first.
  const byKey = new Map<string, { name: string; host: string; hosts: string[]; port: number }>()
  for (const a of answers) {
    if (!a.info) continue
    const seen = byKey.get(a.info.publicKey)
    if (seen) seen.hosts.push(a.host)
    else
      byKey.set(a.info.publicKey, {
        name: a.info.name,
        host: a.host,
        hosts: [a.host],
        port: a.port,
      })
  }
  return [...byKey.values()]
}

export async function devices(json: boolean): Promise<void> {
  const { phones, lastUsed } = loadPhones()
  if (json) {
    console.log(JSON.stringify({ ok: true, phones, lastUsed }))
    return
  }
  if (phones.length === 0) {
    info('No phones paired yet. Run `dukoi pair`.')
    return
  }
  const rows = [['', 'NAME', 'MODEL', 'ADDRESS', 'PAIRED'].map((h) => c.dim(h))]
  for (const p of phones) {
    rows.push([
      p.name === lastUsed ? '●' : ' ',
      p.name,
      p.model,
      `${p.host}:${p.port}`,
      p.pairedAt.slice(0, 10),
    ])
  }
  info(table(rows))
}

export async function unpair(name: string | undefined, json: boolean): Promise<void> {
  const phone = pickPhone(name)
  // Tell the phone to forget us too, if it's reachable. Forget locally either way.
  let phoneForgot = true
  try {
    await call(phone, '/computers/self', { method: 'DELETE', timeoutMs: 4000 })
  } catch {
    phoneForgot = false
  }
  removePhone(phone.name)
  if (json) {
    console.log(JSON.stringify({ ok: true, unpaired: phone.name, phoneForgot }))
    return
  }
  ok(`Unpaired ${phone.name}`)
  if (!phoneForgot)
    info(c.dim('  The phone wasn’t reachable. Remove this computer in the Dukoi app too.'))
}
