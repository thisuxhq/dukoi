// Public URLs: one Cloudflare quick tunnel per exposed app.
//
// Tunnels only ever point at an app's stable port, never at the admin API.
// cloudflared is supervised like an app; if it restarts, the quick tunnel URL
// changes, and the new one is picked up from its output.
import { join } from 'node:path'
import type { ExposeResult } from '@droidhost/shared'
import type { Agent } from './agent.ts'
import { AppProcess } from './app-process.ts'
import { HttpError } from './http.ts'
import { LogFile } from './log-file.ts'

const URL_PATTERN = /https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/
export const TUNNEL_WAIT_MS = 30_000

interface Tunnel {
  proc: AppProcess
  url: string | null
  stop: () => void
}

export class Tunnels {
  private tunnels = new Map<string, Tunnel>()

  constructor(private agent: Agent) {}

  async expose(name: string, wait = true): Promise<ExposeResult> {
    const saved = this.agent.store.app(name)
    if (!saved) {
      throw new HttpError(
        404,
        'NO_SUCH_APP',
        `There's no app called "${name}" on this phone.`,
        'Run `droidhost ps`.',
      )
    }
    if (saved.port === this.agent.config.adminPort) {
      throw new HttpError(400, 'ADMIN_PORT', 'The admin port can never be exposed.')
    }
    // An app on a custom domain already has a stable public URL.
    if (saved.domain) return { app: name, publicUrl: `https://${saved.domain}` }
    const binary = this.agent.config.cloudflaredPath
    if (!binary) {
      throw new HttpError(
        501,
        'NO_CLOUDFLARED',
        'This build of DroidHost has no cloudflared.',
        'Update the DroidHost app.',
      )
    }

    let tunnel = this.tunnels.get(name)
    if (!tunnel) {
      const dir = this.agent.paths.app(name)
      const log = new LogFile(join(dir, 'logs', 'tunnel.log'))
      const appLog = await this.agent.apps.logFile(name)
      const proc = new AppProcess(
        `${name}-tunnel`,
        {
          command: binary,
          args: ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${saved.port}`],
          cwd: dir,
          env: {
            HOME: join(dir, 'data'),
            TMPDIR: process.env.TMPDIR ?? '/tmp',
            PATH: process.env.PATH ?? '/system/bin',
          },
        },
        log,
        join(dir, 'run', 'tunnel.pid'),
      )
      const t: Tunnel = { proc, url: null, stop: () => {} }
      t.stop = log.subscribe((line) => {
        const match = line.text.match(URL_PATTERN)
        if (match && match[0] !== t.url) {
          t.url = match[0]
          void this.agent.apps.setPublicUrl(name, t.url)
          appLog.note(`Public URL: ${t.url}`)
        }
      })
      this.tunnels.set(name, t)
      tunnel = t
      proc.start()
      saved.exposed = true
      this.agent.store.save()
    }

    if (wait) {
      const deadline = Date.now() + TUNNEL_WAIT_MS
      while (!tunnel.url && Date.now() < deadline) await new Promise((r) => setTimeout(r, 250))
      if (!tunnel.url) {
        throw new HttpError(
          504,
          'TUNNEL_TIMEOUT',
          'Cloudflare didn’t give a public URL within 30 seconds.',
          'Check the phone has internet, then run `droidhost expose` again.',
        )
      }
    }
    return { app: name, publicUrl: tunnel.url ?? '' }
  }

  async unexpose(name: string): Promise<{ app: string; publicUrl: null }> {
    const tunnel = this.tunnels.get(name)
    if (tunnel) {
      tunnel.stop()
      await tunnel.proc.stop()
      this.tunnels.delete(name)
    }
    const saved = this.agent.store.app(name)
    if (saved) {
      saved.exposed = false
      this.agent.store.save()
      await this.agent.apps.setPublicUrl(name, null)
    }
    return { app: name, publicUrl: null }
  }

  /** Brings back tunnels that were on before the agent restarted. */
  async restore(): Promise<void> {
    for (const saved of this.agent.store.state.apps) {
      if (saved.exposed && !saved.domain) await this.expose(saved.name, false).catch(() => {})
    }
  }

  async stopAll(): Promise<void> {
    for (const t of this.tunnels.values()) {
      t.stop()
      await t.proc.stop(2000)
    }
    this.tunnels.clear()
  }
}
