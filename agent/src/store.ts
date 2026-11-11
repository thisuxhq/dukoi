// The agent's saved state: its key, paired computers and apps.
// One JSON file, written atomically, so a kill mid-write can't corrupt it.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { generateKeyPair, type KeyPair, type PairedComputer } from '@droidhost/shared'

export interface SavedApp {
  name: string
  /** Stable port the app is reached on */
  port: number
  /** Live release id, or null before the first deploy */
  release: string | null
  /** true = should be running; survives reboots */
  wanted: boolean
  /** true = has a quick-tunnel public URL; survives restarts */
  exposed?: boolean
  /** Custom domain, e.g. api.example.com, served by the phone's named tunnel */
  domain?: string
  /** Settings passed to the app as environment variables, like TELEGRAM_BOT_TOKEN */
  env?: Record<string, string>
  /** The template it was deployed from on the phone */
  template?: string
  createdAt: string
}

export interface State {
  identity: KeyPair
  computers: PairedComputer[]
  apps: SavedApp[]
  /** The phone's Cloudflare named tunnel, made when the first domain is added */
  tunnel?: { id: string; name: string }
}

export class Store {
  state: State

  constructor(private file: string) {
    this.state = this.load()
  }

  private load(): State {
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<State>
      if (raw.identity?.publicKey && raw.identity.privateKeyPem) {
        return {
          identity: raw.identity,
          computers: raw.computers ?? [],
          apps: raw.apps ?? [],
          ...(raw.tunnel ? { tunnel: raw.tunnel } : {}),
        }
      }
    } catch {
      // First run, or an unreadable file: start fresh with a new identity.
    }
    const fresh: State = { identity: generateKeyPair(), computers: [], apps: [] }
    this.write(fresh)
    return fresh
  }

  save(): void {
    this.write(this.state)
  }

  private write(state: State): void {
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 })
    renameSync(tmp, this.file)
  }

  isPaired(publicKey: string): boolean {
    return this.state.computers.some((c) => c.publicKey === publicKey)
  }

  app(name: string): SavedApp | undefined {
    return this.state.apps.find((a) => a.name === name)
  }
}
