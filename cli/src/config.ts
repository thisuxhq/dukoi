// What the CLI remembers: this computer's key and the phones it's paired with.
// Stored in ~/.config/dukoi (or $DUKOI_CONFIG), readable only by you.
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir, hostname, userInfo } from 'node:os'
import { join } from 'node:path'
import { generateKeyPair, type KeyPair } from '@dukoi/shared'

export interface SavedPhone {
  name: string
  /** The address that worked last */
  host: string
  /** Every address the phone has answered on, newest first (Wi-Fi, Tailscale) */
  hosts?: string[]
  port: number
  /** Pinned at pairing; every response must be signed by it */
  publicKey: string
  model: string
  pairedAt: string
}

interface Phones {
  phones: SavedPhone[]
  lastUsed: string | null
}

export function configDir(): string {
  if (process.env.DUKOI_CONFIG) return process.env.DUKOI_CONFIG
  const base = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
  const dir = join(base, 'dukoi')
  // Dukoi used to be called DroidHost. Keep the key and paired phones from then.
  const old = join(base, 'droidhost')
  if (!existsSync(dir) && existsSync(old)) renameSync(old, dir)
  return dir
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return null
  }
}

function writePrivate(file: string, value: unknown): void {
  mkdirSync(configDir(), { recursive: true, mode: 0o700 })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 })
  renameSync(tmp, file)
  chmodSync(file, 0o600)
}

/** This computer's key, made on first use. */
export function computerKey(): KeyPair {
  const file = join(configDir(), 'key.json')
  const existing = readJson<KeyPair>(file)
  if (existing?.publicKey && existing.privateKeyPem) return existing
  const key = generateKeyPair()
  writePrivate(file, key)
  return key
}

export function computerName(): string {
  const user = (() => {
    try {
      return userInfo().username
    } catch {
      return ''
    }
  })()
  const host = hostname().replace(/\.local$/, '')
  return user ? `${user} on ${host}` : host
}

const phonesFile = () => join(configDir(), 'phones.json')

export function loadPhones(): Phones {
  return readJson<Phones>(phonesFile()) ?? { phones: [], lastUsed: null }
}

export function savePhone(phone: SavedPhone): void {
  const data = loadPhones()
  data.phones = data.phones.filter((p) => p.publicKey !== phone.publicKey && p.name !== phone.name)
  data.phones.push(phone)
  data.lastUsed = phone.name
  writePrivate(phonesFile(), data)
}

export function removePhone(name: string): boolean {
  const data = loadPhones()
  const before = data.phones.length
  data.phones = data.phones.filter((p) => p.name !== name)
  if (data.lastUsed === name) data.lastUsed = data.phones[0]?.name ?? null
  writePrivate(phonesFile(), data)
  return data.phones.length < before
}

/** The phone moved: use this address from now on, and keep the old ones to try later. */
export function rememberHost(publicKey: string, host: string): void {
  const data = loadPhones()
  const phone = data.phones.find((p) => p.publicKey === publicKey)
  if (!phone) return
  phone.hosts = [...new Set([host, phone.host, ...(phone.hosts ?? [])])].slice(0, 6)
  phone.host = host
  writePrivate(phonesFile(), data)
}

export function markUsed(name: string): void {
  const data = loadPhones()
  if (data.lastUsed !== name) {
    data.lastUsed = name
    writePrivate(phonesFile(), data)
  }
}
