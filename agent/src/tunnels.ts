// Public URLs: one Cloudflare quick tunnel per exposed app.
//
// Tunnels only ever point at an app's stable port, never at the admin API.
// cloudflared is supervised like an app; if it restarts, the quick tunnel URL
// changes, and the new one is picked up from its output.
//
// cloudflared writes its output to a file, not a pipe to the agent, so it keeps
// running if the agent dies. When the agent comes back it picks that tunnel up
// again, with the same URL, instead of asking Cloudflare for a new one.
import { execFileSync } from 'node:child_process'
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import type { ExposeResult } from '@dukoi/shared'
import type { Agent } from './agent.ts'
import { AppProcess } from './app-process.ts'
import { HttpError } from './http.ts'
import { LogFile } from './log-file.ts'

const URL_PATTERN = /https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/
export const TUNNEL_WAIT_MS = 30_000
/** How often to read cloudflared's output, and to check a tunnel the agent picked up again */
const POLL_MS = 500
const ADOPTED_CHECK_MS = 5_000

interface Tunnel {
  url: string | null
  stop: () => Promise<void>
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
        'Run `dukoi ps`.',
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
        'This build of Dukoi has no cloudflared.',
        'Update the Dukoi app.',
      )
    }

    let tunnel = this.tunnels.get(name)
    if (!tunnel) {
      tunnel = await this.startTunnel(name, binary, saved.port)
      saved.exposed = true
      this.agent.store.save()
    }

    if (wait) {
      const deadline = Date.now() + TUNNEL_WAIT_MS
      while (!tunnel.url && Date.now() < deadline) await sleep(250)
      if (!tunnel.url) {
        throw new HttpError(
          504,
          'TUNNEL_TIMEOUT',
          'Cloudflare didn’t give a public URL within 30 seconds.',
          'Check the phone has internet, then run `dukoi expose` again.',
        )
      }
    }
    return { app: name, publicUrl: tunnel.url ?? '' }
  }

  async unexpose(name: string): Promise<{ app: string; publicUrl: null }> {
    const tunnel = this.tunnels.get(name)
    if (tunnel) {
      this.tunnels.delete(name)
      await tunnel.stop()
    } else {
      // A leftover from before an agent restart that was never picked up again
      const saved = this.agent.store.app(name)
      if (saved) killLeftover(this.pidFile(name), saved.port)
    }
    const saved = this.agent.store.app(name)
    if (saved) {
      saved.exposed = false
      delete saved.publicUrl
      this.agent.store.save()
      await this.agent.apps.setPublicUrl(name, null)
    }
    return { app: name, publicUrl: null }
  }

  /**
   * Brings back tunnels that were on before the agent restarted. One whose
   * cloudflared is still running keeps its URL; the rest get a new one.
   */
  async restore(): Promise<void> {
    for (const saved of this.agent.store.state.apps) {
      if (saved.domain) continue
      if (!saved.exposed) {
        killLeftover(this.pidFile(saved.name), saved.port)
        continue
      }
      if (this.adopt(saved.name, saved.port, saved.publicUrl)) {
        await this.agent.apps.setPublicUrl(saved.name, saved.publicUrl ?? null)
        continue
      }
      killLeftover(this.pidFile(saved.name), saved.port)
      await this.expose(saved.name, false).catch(() => {})
    }
  }

  async stopAll(): Promise<void> {
    const all = [...this.tunnels.values()]
    this.tunnels.clear()
    for (const t of all) await t.stop()
  }

  private pidFile(name: string): string {
    // Outside run/, which the app manager clears of leftover Node processes on start
    return join(this.agent.paths.app(name), 'tunnel.pid')
  }

  private async startTunnel(name: string, binary: string, port: number): Promise<Tunnel> {
    const dir = this.agent.paths.app(name)
    const output = join(dir, 'logs', 'cloudflared.log')
    mkdirSync(join(dir, 'logs'), { recursive: true })
    writeFileSync(output, '')
    const appLog = await this.agent.apps.logFile(name)
    const proc = new AppProcess(
      `${name}-tunnel`,
      {
        command: binary,
        args: ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`],
        cwd: dir,
        env: {
          HOME: join(dir, 'data'),
          TMPDIR: process.env.TMPDIR ?? '/tmp',
          PATH: process.env.PATH ?? '/system/bin',
        },
        output,
      },
      new LogFile(join(dir, 'logs', 'tunnel.log')),
      this.pidFile(name),
    )
    const tunnel: Tunnel = { url: null, stop: async () => {} }
    // cloudflared prints its URL once it has one, and a new one if it restarts.
    let offset = 0
    let tail = ''
    const watch = setInterval(() => {
      const fresh = readFrom(output, offset)
      offset = fresh.offset
      // Keep the end of the last read, so a URL split across two reads still matches
      const text = tail + fresh.text
      tail = text.slice(-200)
      const url = [...text.matchAll(new RegExp(URL_PATTERN, 'g'))].pop()?.[0]
      if (url && url !== tunnel.url) {
        tunnel.url = url
        this.rememberUrl(name, url)
        void this.agent.apps.setPublicUrl(name, url)
        appLog.note(`Public URL: ${url}`)
      }
    }, POLL_MS)
    tunnel.stop = async () => {
      clearInterval(watch)
      await proc.stop(2000)
    }
    this.tunnels.set(name, tunnel)
    proc.start()
    return tunnel
  }

  /** Picks up a cloudflared that outlived the agent, if it's ours and its URL is known. */
  private adopt(name: string, port: number, url: string | undefined): boolean {
    if (!url) return false
    const pid = ourTunnelPid(this.pidFile(name), port)
    if (pid === null) return false
    const check = setInterval(() => {
      if (isAlive(pid)) return
      // It died: start a new tunnel, which gets a new URL.
      clearInterval(check)
      this.tunnels.delete(name)
      rmSync(this.pidFile(name), { force: true })
      void this.expose(name, false).catch(() => {})
    }, ADOPTED_CHECK_MS)
    this.tunnels.set(name, {
      url,
      stop: async () => {
        clearInterval(check)
        try {
          process.kill(pid, 'SIGTERM')
        } catch {}
        rmSync(this.pidFile(name), { force: true })
      },
    })
    void this.agent.apps
      .logFile(name)
      .then((log) => log.note(`Public URL: ${url} (kept from before the agent restarted)`))
    return true
  }

  private rememberUrl(name: string, url: string): void {
    const saved = this.agent.store.app(name)
    if (!saved || saved.publicUrl === url) return
    saved.publicUrl = url
    this.agent.store.save()
  }
}

/** The pid in the file, if that process is still a cloudflared quick tunnel to this port. */
function ourTunnelPid(pidFile: string, port: number): number | null {
  let pid: number
  try {
    pid = Number(readFileSync(pidFile, 'utf8').trim())
  } catch {
    return null
  }
  if (!pid || !isAlive(pid)) return null
  const args = commandLine(pid)
  return args.includes('cloudflared') && args.includes(`http://127.0.0.1:${port}`) ? pid : null
}

/** Stops a cloudflared left from before an agent restart that won't be picked up again. */
function killLeftover(pidFile: string, port: number): void {
  const pid = ourTunnelPid(pidFile, port)
  if (pid !== null) {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {}
  }
  rmSync(pidFile, { force: true })
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** A process's command line: /proc on Android and Linux, ps elsewhere. */
function commandLine(pid: number): string {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, 'utf8').replaceAll('\0', ' ')
  } catch {}
  try {
    return execFileSync('ps', ['-p', String(pid), '-o', 'args='], { encoding: 'utf8' })
  } catch {
    return ''
  }
}

/** What was added to a file since `offset`. */
function readFrom(file: string, offset: number): { text: string; offset: number } {
  if (!existsSync(file)) return { text: '', offset }
  const fd = openSync(file, 'r')
  try {
    const buf = Buffer.alloc(64 * 1024)
    const n = readSync(fd, buf, 0, buf.length, offset)
    return { text: buf.toString('utf8', 0, n), offset: offset + n }
  } finally {
    closeSync(fd)
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
