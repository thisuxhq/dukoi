// The agent: one object that owns the store, the admin API and the apps.
import type { Server } from 'node:http'
import { type PhoneInfo, PROTOCOL_VERSION } from '@droidhost/shared'
import { appRoutes } from './app-routes.ts'
import { Apps } from './apps.ts'
import { AGENT_VERSION, type Config, paths } from './config.ts'
import { Router } from './http.ts'
import { pairingRoutes } from './pairing.ts'
import { Store } from './store.ts'

export class Agent {
  readonly store: Store
  readonly router: Router
  readonly apps: Apps
  readonly paths: ReturnType<typeof paths>
  readonly startedAt = new Date()
  private server: Server | null = null

  constructor(readonly config: Config) {
    this.paths = paths(config.home)
    this.store = new Store(this.paths.state)
    this.router = new Router(this.store.state.identity.privateKeyPem, (key) =>
      this.store.isPaired(key),
    )
    this.apps = new Apps(this)
    this.routes()
  }

  info(): PhoneInfo {
    return {
      name: this.config.phone.name,
      model: this.config.phone.model,
      android: this.config.phone.android,
      publicKey: this.store.state.identity.publicKey,
      agentVersion: AGENT_VERSION,
      nodeVersion: process.version,
      protocol: PROTOCOL_VERSION,
    }
  }

  private routes(): void {
    // Anyone on the Wi-Fi can ask who this phone is. Nothing else is public.
    this.router.on('GET', '/info', 'public', () => this.info())

    // The phone app's own view of the agent.
    this.router.on('GET', '/local/status', 'local', () => ({
      ...this.info(),
      startedAt: this.startedAt.toISOString(),
      computers: this.store.state.computers.length,
      apps: this.store.state.apps.length,
    }))

    pairingRoutes(this)
    appRoutes(this)
  }

  async start(): Promise<void> {
    this.server = this.router.listen(this.config.adminPort)
    await this.apps.restore()
    console.log(
      `DroidHost agent ${AGENT_VERSION} on port ${this.config.adminPort} (Node ${process.version}, key ${this.store.state.identity.publicKey.slice(0, 8)}…)`,
    )
  }

  async stop(): Promise<void> {
    await this.apps.stopAll()
    await new Promise<void>((resolve) =>
      this.server ? this.server.close(() => resolve()) : resolve(),
    )
  }
}
