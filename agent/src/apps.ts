// Apps: deploys, releases, the live process and the stable port.
import { createHash } from 'node:crypto'
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs'
import { readFile } from 'node:fs/promises'
import type { IncomingMessage } from 'node:http'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import {
  APP_NAME_PATTERN,
  type AppInfo,
  type DeployResult,
  ENV_NAME_PATTERN,
  type EnvChange,
  type EnvNames,
  FIRST_APP_PORT,
  MANIFEST_PATH,
  type ReleaseInfo,
  type ReleaseManifest,
  unpack,
} from '@droidhost/shared'
import type { Agent } from './agent.ts'
import { AppProcess, killLeftover, type ProcessSpec } from './app-process.ts'
import { HttpError } from './http.ts'
import { LogFile } from './log-file.ts'
import { ProcStats, type Usage } from './proc-stats.ts'
import { freePort, StablePort } from './proxy.ts'
import type { SavedApp } from './store.ts'

export const KEEP_RELEASES = 5
export const HEALTH_TIMEOUT_MS = 10_000
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024

interface Live {
  release: string
  proc: AppProcess
  port: number
}

class AppRuntime {
  live: Live | null = null
  readonly log: LogFile
  readonly stable: StablePort
  usage: Usage = { cpuPercent: null, memoryMb: null }
  publicUrl: string | null = null
  /** Deploys and rollbacks for one app run one at a time */
  busy: Promise<unknown> = Promise.resolve()

  constructor(
    readonly saved: SavedApp,
    readonly dir: string,
  ) {
    this.log = new LogFile(join(dir, 'logs', 'app.log'))
    this.stable = new StablePort(saved.port, saved.name)
  }

  serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.busy.then(work, work)
    this.busy = next.catch(() => {})
    return next
  }
}

export class Apps {
  private runtimes = new Map<string, AppRuntime>()
  private stats = new ProcStats()
  private sampler: NodeJS.Timeout

  constructor(private agent: Agent) {
    // CPU and memory for `droidhost ps`, measured every 2 seconds.
    this.sampler = setInterval(() => {
      for (const rt of this.runtimes.values())
        rt.usage = this.stats.sample(rt.live?.proc.pid ?? null)
    }, 2000)
    this.sampler.unref()
  }

  private get home() {
    return this.agent.paths.apps
  }

  private releasesDir(name: string) {
    return join(this.home, name, 'releases')
  }

  /** Starts every app that was running before. Called when the agent starts. */
  async restore(): Promise<void> {
    for (const saved of this.agent.store.state.apps) {
      const rt = await this.runtime(saved.name)
      this.clearLeftovers(rt)
      if (saved.wanted && saved.release) {
        try {
          await this.launch(rt, saved.release, { waitHealthy: false })
          rt.log.note(`Started after the agent restarted (release ${saved.release}).`)
        } catch (err) {
          rt.log.note(`Couldn't start after restart: ${(err as Error).message}`)
        }
      }
    }
  }

  private async runtime(name: string, create = false): Promise<AppRuntime> {
    const existing = this.runtimes.get(name)
    if (existing) return existing
    let saved = this.agent.store.app(name)
    if (!saved) {
      if (!create)
        throw new HttpError(
          404,
          'NO_SUCH_APP',
          `There's no app called "${name}" on this phone.`,
          'Run `droidhost ps` to see your apps.',
        )
      saved = {
        name,
        port: this.nextPort(),
        release: null,
        wanted: false,
        createdAt: new Date().toISOString(),
      }
      this.agent.store.state.apps.push(saved)
      this.agent.store.save()
    }
    const rt = new AppRuntime(saved, join(this.home, name))
    mkdirSync(join(rt.dir, 'data'), { recursive: true })
    mkdirSync(join(rt.dir, 'run'), { recursive: true })
    await rt.stable.listen().catch((err: NodeJS.ErrnoException) => {
      throw new HttpError(
        409,
        'PORT_IN_USE',
        `Port ${saved.port} for ${name} is already in use on the phone.`,
        err.code === 'EADDRINUSE'
          ? 'Another app on the phone is using it. Stop it, or remove this app and deploy again.'
          : undefined,
      )
    })
    this.runtimes.set(name, rt)
    return rt
  }

  private nextPort(): number {
    const used = new Set(this.agent.store.state.apps.map((a) => a.port))
    let port = FIRST_APP_PORT
    while (used.has(port)) port++
    return port
  }

  private clearLeftovers(rt: AppRuntime): void {
    const run = join(rt.dir, 'run')
    for (const f of existsSync(run) ? readdirSync(run) : []) {
      const killed = killLeftover(join(run, f), this.agent.config.nodePath)
      if (killed)
        rt.log.note(`Stopped a leftover process (pid ${killed}) from before the agent restarted.`)
    }
  }

  // ── Deploy ──────────────────────────────────────────────────────────────

  /** A deploy from a computer: the archive arrives in the request body. */
  async deploy(name: string, body: IncomingMessage, sha256: string): Promise<DeployResult> {
    return this.deployRelease(name, async (rt, release) => {
      const upload = join(rt.dir, 'run', `${release}.upload`)
      try {
        await this.receive(body, upload, sha256)
        return await readFile(upload)
      } finally {
        rmSync(upload, { force: true })
      }
    }).then((result) => {
      // Their own code now, so the phone stops offering Make it yours.
      this.clearTemplate(name)
      return { ...result, app: { ...result.app, template: null } }
    })
  }

  private clearTemplate(name: string): void {
    const saved = this.agent.store.app(name)
    if (saved?.template) {
      delete saved.template
      this.agent.store.save()
    }
  }

  /** A deploy from an archive already on the phone, like a template. */
  deployArchive(name: string, archive: Buffer): Promise<DeployResult> {
    return this.deployRelease(name, async () => archive)
  }

  private async deployRelease(
    name: string,
    archive: (rt: AppRuntime, release: string) => Promise<Buffer>,
  ): Promise<DeployResult> {
    if (!APP_NAME_PATTERN.test(name)) {
      throw new HttpError(
        400,
        'BAD_NAME',
        `"${name}" isn't a valid app name.`,
        'Use lowercase letters, numbers and dashes, up to 40 characters.',
      )
    }
    const started = Date.now()
    const rt = await this.runtime(name, true)
    return rt.serial(async () => {
      const release = this.nextReleaseId(name)
      const dir = join(this.releasesDir(name), release)
      try {
        await unpack(await archive(rt, release), dir)
      } catch (err) {
        rmSync(dir, { recursive: true, force: true })
        throw err
      }
      rt.log.note(`Deploying release ${release}.`)
      try {
        await this.launch(rt, release, { waitHealthy: true })
      } catch (err) {
        rmSync(dir, { recursive: true, force: true })
        throw err
      }
      this.prune(rt)
      return { app: this.info(rt), release, tookMs: Date.now() - started }
    })
  }

  private async receive(body: IncomingMessage, file: string, expected: string): Promise<void> {
    const hash = createHash('sha256')
    let size = 0
    body.on('data', (chunk: Buffer) => {
      size += chunk.length
      hash.update(chunk)
      if (size > MAX_UPLOAD_BYTES)
        body.destroy(
          new HttpError(
            413,
            'TOO_LARGE',
            'The upload is over 500 MB.',
            'Leave large files out of the app folder.',
          ),
        )
    })
    await pipeline(body, createWriteStream(file))
    if (hash.digest('hex') !== expected) {
      throw new HttpError(
        400,
        'BAD_UPLOAD',
        'The upload arrived damaged (its hash doesn’t match).',
        'Run the deploy again.',
      )
    }
  }

  private nextReleaseId(name: string): string {
    const ids = this.releaseIds(name).map(Number)
    return String((ids.length ? Math.max(...ids) : 0) + 1).padStart(4, '0')
  }

  private releaseIds(name: string): string[] {
    const dir = this.releasesDir(name)
    return existsSync(dir)
      ? readdirSync(dir)
          .filter((d) => /^\d{4,}$/.test(d))
          .sort()
      : []
  }

  /**
   * Starts `release` on a fresh internal port, waits for it to be healthy,
   * then points the stable port at it and stops the old one.
   */
  private async launch(
    rt: AppRuntime,
    release: string,
    opts: { waitHealthy: boolean },
  ): Promise<void> {
    const dir = join(this.releasesDir(rt.saved.name), release)
    let manifest: ReleaseManifest
    try {
      manifest = JSON.parse(readFileSync(join(dir, MANIFEST_PATH), 'utf8')) as ReleaseManifest
    } catch {
      throw new HttpError(
        422,
        'NO_MANIFEST',
        `Release ${release} has no DroidHost manifest.`,
        'Deploy with the droidhost CLI.',
      )
    }
    const port = await freePort()
    const proc = new AppProcess(
      rt.saved.name,
      this.spec(rt, dir, manifest, port),
      rt.log,
      join(rt.dir, 'run', `${release}.pid`),
    )
    proc.start()

    if (opts.waitHealthy) {
      try {
        await this.waitHealthy(proc, port, manifest.healthCheck)
      } catch (err) {
        await proc.stop(1000)
        const tail = rt.log.tail(8).join('\n')
        if (err instanceof HttpError)
          throw new HttpError(
            err.status,
            err.code,
            err.message,
            `Last lines from your app:\n${tail}`,
          )
        throw err
      }
    }

    const old = rt.live
    rt.live = { release, proc, port }
    rt.stable.target = port
    rt.saved.release = release
    rt.saved.wanted = true
    this.agent.store.save()
    if (old && old.proc !== proc) {
      rt.log.note(`Release ${release} is live. Stopping release ${old.release}.`)
      await old.proc.stop()
    }
  }

  private spec(rt: AppRuntime, dir: string, manifest: ReleaseManifest, port: number): ProcessSpec {
    const env: Record<string, string> = {
      ...rt.saved.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      NODE_ENV: 'production',
      DATA_DIR: join(rt.dir, 'data'),
      DROIDHOST_APP: rt.saved.name,
      HOME: join(rt.dir, 'data'),
      TMPDIR: process.env.TMPDIR ?? '/tmp',
      PATH: process.env.PATH ?? '/system/bin',
    }
    if (manifest.kind === 'static') {
      // The agent serves static sites itself: node agent.mjs --serve-static <dir>
      const folder = join(dir, manifest.start[0] ?? '.')
      return {
        command: this.agent.config.nodePath,
        args: [process.argv[1] ?? '', '--serve-static', folder],
        cwd: dir,
        env,
      }
    }
    return { command: this.agent.config.nodePath, args: manifest.start, cwd: dir, env }
  }

  private async waitHealthy(proc: AppProcess, port: number, path: string | null): Promise<void> {
    const deadline = Date.now() + HEALTH_TIMEOUT_MS
    const startedRestarts = proc.restarts
    while (Date.now() < deadline) {
      if (proc.restarts > startedRestarts) {
        throw new HttpError(
          422,
          'CRASHED_ON_START',
          `Your app exited while starting (${proc.lastExit}).`,
        )
      }
      if (path === null) {
        // Workers: healthy if they're still running after 3 seconds.
        await sleep(3000)
        if (proc.restarts === startedRestarts) return
        continue
      }
      try {
        const res = await fetch(`http://127.0.0.1:${port}${path}`, {
          signal: AbortSignal.timeout(1000),
        })
        await res.body?.cancel()
        if (res.status < 500) return
      } catch {
        // Not listening yet.
      }
      await sleep(200)
    }
    throw new HttpError(
      422,
      'HEALTH_TIMEOUT',
      `Your app started but didn't answer on PORT within ${HEALTH_TIMEOUT_MS / 1000} seconds.`,
    )
  }

  /** Keeps the last KEEP_RELEASES, never deleting the live one. */
  private prune(rt: AppRuntime): void {
    const ids = this.releaseIds(rt.saved.name)
    const old = ids
      .slice(0, Math.max(0, ids.length - KEEP_RELEASES))
      .filter((id) => id !== rt.live?.release)
    for (const id of old)
      rmSync(join(this.releasesDir(rt.saved.name), id), { recursive: true, force: true })
  }

  // ── Settings ────────────────────────────────────────────────────────────

  /** Setting names only. Values never leave the phone. */
  async envNames(name: string): Promise<EnvNames> {
    const rt = await this.runtime(name)
    return { names: Object.keys(rt.saved.env ?? {}).sort() }
  }

  /** Changes settings, then restarts the app so it picks them up. */
  async setEnv(name: string, change: EnvChange, create = false): Promise<EnvNames> {
    for (const key of [...Object.keys(change.set ?? {}), ...(change.unset ?? [])]) {
      if (!ENV_NAME_PATTERN.test(key))
        throw new HttpError(
          400,
          'BAD_SETTING',
          `"${key}" isn't a valid setting name.`,
          'Use letters, numbers and underscores, like TELEGRAM_BOT_TOKEN.',
        )
    }
    const rt = await this.runtime(name, create)
    const env = { ...rt.saved.env, ...change.set }
    for (const key of change.unset ?? []) delete env[key]
    rt.saved.env = env
    this.agent.store.save()
    // A fresh launch, because a restart would reuse the old environment.
    const live = rt.live
    if (live) {
      rt.log.note('Settings changed. Restarting.')
      await rt.serial(() => this.launch(rt, live.release, { waitHealthy: false }))
    }
    return { names: Object.keys(env).sort() }
  }

  /** Remembers which template an app came from, for the phone's Make it yours card. */
  async setTemplate(name: string, template: string): Promise<void> {
    const rt = await this.runtime(name)
    rt.saved.template = template
    this.agent.store.save()
  }

  // ── Control ─────────────────────────────────────────────────────────────

  async rollback(name: string, to?: string): Promise<DeployResult> {
    const rt = await this.runtime(name)
    return rt.serial(async () => {
      const started = Date.now()
      const ids = this.releaseIds(name)
      const current = rt.saved.release
      const target = to
        ? to.padStart(4, '0')
        : ids.filter((id) => current === null || id < current).pop()
      if (!target || !ids.includes(target)) {
        throw new HttpError(
          404,
          'NO_RELEASE',
          to ? `There's no release ${to}.` : 'There’s no earlier release to roll back to.',
          'Run `droidhost releases` to see them.',
        )
      }
      rt.log.note(`Rolling back to release ${target}.`)
      await this.launch(rt, target, { waitHealthy: true })
      return { app: this.info(rt), release: target, tookMs: Date.now() - started }
    })
  }

  async start(name: string): Promise<AppInfo> {
    const rt = await this.runtime(name)
    if (!rt.saved.release)
      throw new HttpError(
        409,
        'NOT_DEPLOYED',
        `${name} hasn't been deployed yet.`,
        'Run `droidhost deploy`.',
      )
    if (!rt.live)
      await rt.serial(() => this.launch(rt, rt.saved.release as string, { waitHealthy: true }))
    else rt.live.proc.start()
    rt.saved.wanted = true
    this.agent.store.save()
    return this.info(rt)
  }

  async stop(name: string): Promise<AppInfo> {
    const rt = await this.runtime(name)
    rt.saved.wanted = false
    this.agent.store.save()
    if (rt.live) {
      await rt.live.proc.stop()
      rt.stable.target = null
      rt.live = null
    }
    return this.info(rt)
  }

  async restart(name: string): Promise<AppInfo> {
    const rt = await this.runtime(name)
    if (!rt.live) return this.start(name)
    await rt.live.proc.restart()
    return this.info(rt)
  }

  async remove(name: string): Promise<{ removed: string }> {
    const rt = await this.runtime(name)
    if (rt.live) await rt.live.proc.stop()
    await rt.stable.close()
    this.runtimes.delete(name)
    this.agent.store.state.apps = this.agent.store.state.apps.filter((a) => a.name !== name)
    this.agent.store.save()
    rmSync(rt.dir, { recursive: true, force: true })
    return { removed: name }
  }

  async releases(name: string): Promise<ReleaseInfo[]> {
    const rt = await this.runtime(name)
    return this.releaseIds(name).map((id) => {
      const dir = join(this.releasesDir(name), id)
      let sizeBytes = 0
      try {
        const m = JSON.parse(readFileSync(join(dir, MANIFEST_PATH), 'utf8')) as ReleaseManifest
        sizeBytes = m.source.bytes
      } catch {}
      return {
        id,
        createdAt: statSync(dir).mtime.toISOString(),
        sizeBytes,
        live: rt.live?.release === id,
      }
    })
  }

  async list(): Promise<AppInfo[]> {
    const out: AppInfo[] = []
    for (const saved of this.agent.store.state.apps)
      out.push(this.info(await this.runtime(saved.name)))
    return out
  }

  async get(name: string): Promise<AppInfo> {
    return this.info(await this.runtime(name))
  }

  logFile(name: string): Promise<LogFile> {
    return this.runtime(name).then((rt) => rt.log)
  }

  setPublicUrl(name: string, url: string | null): Promise<void> {
    return this.runtime(name).then((rt) => {
      rt.publicUrl = url
    })
  }

  livePid(name: string): number | null {
    return this.runtimes.get(name)?.live?.proc.pid ?? null
  }

  private info(rt: AppRuntime): AppInfo {
    const proc = rt.live?.proc
    return {
      name: rt.saved.name,
      state: proc?.state ?? 'stopped',
      port: rt.saved.port,
      release: rt.saved.release,
      pid: proc?.pid ?? null,
      restarts: proc?.restarts ?? 0,
      lastExit: proc?.lastExit ?? null,
      startedAt: proc?.startedAt?.toISOString() ?? null,
      cpuPercent: rt.usage.cpuPercent,
      memoryMb: rt.usage.memoryMb,
      localUrl: `http://${wifiAddress()}:${rt.saved.port}`,
      publicUrl: rt.publicUrl,
      domain: rt.saved.domain ?? null,
      template: rt.saved.template ?? null,
    }
  }

  async stopAll(): Promise<void> {
    clearInterval(this.sampler)
    for (const rt of this.runtimes.values()) {
      await rt.live?.proc.stop(2000)
      await rt.stable.close()
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** The phone's Wi-Fi IPv4 address, for local URLs. */
export function wifiAddress(): string {
  const nets = networkInterfaces()
  const order = ['wlan0', 'wlan1', 'eth0', 'en0']
  const names = [
    ...order.filter((n) => nets[n]),
    ...Object.keys(nets).filter((n) => !order.includes(n)),
  ]
  for (const name of names) {
    const v4 = nets[name]?.find((a) => a.family === 'IPv4' && !a.internal)
    if (v4) return v4.address
  }
  return '127.0.0.1'
}
