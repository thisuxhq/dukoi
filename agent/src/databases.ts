// Databases: Redis (Valkey) and Postgres (PGlite) running next to the apps.
//
// Each one is a long-lived process with its own port, data folder and log,
// kept alive like an app. Every database has a password, because any Android
// app on the phone can reach 127.0.0.1. Connected apps get the URL as a
// setting (REDIS_URL or DATABASE_URL), so they never copy it by hand.
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { connect, createServer } from 'node:net'
import { join } from 'node:path'
import {
  APP_NAME_PATTERN,
  DATABASE_KINDS,
  type DatabaseChange,
  type DatabaseCreate,
  type DatabaseInfo,
  type DatabaseKind,
  type DatabaseKindInfo,
  type DatabaseKindStatus,
} from '@dukoi/shared'
import type { Agent } from './agent.ts'
import { AppProcess, killLeftover, type ProcessSpec } from './app-process.ts'
import { wifiAddress } from './apps.ts'
import { HttpError } from './http.ts'
import { LogFile } from './log-file.ts'
import { ProcStats, type Usage } from './proc-stats.ts'
import type { SavedDatabase } from './store.ts'

/** PGlite sets up its files on the first start, which takes a while on an old phone. */
export const READY_TIMEOUT_MS = 60_000

class DbRuntime {
  proc: AppProcess | null = null
  usage: Usage = { cpuPercent: null, memoryMb: null }
  readonly log: LogFile
  /** Changes to one database run one at a time */
  busy: Promise<unknown> = Promise.resolve()

  constructor(
    readonly saved: SavedDatabase,
    readonly dir: string,
  ) {
    this.log = new LogFile(join(dir, 'logs', 'db.log'))
    mkdirSync(join(dir, 'data'), { recursive: true })
    mkdirSync(join(dir, 'run'), { recursive: true })
  }

  serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.busy.then(work, work)
    this.busy = next.catch(() => {})
    return next
  }
}

export function kindInfo(kind: DatabaseKind): DatabaseKindInfo {
  const info = DATABASE_KINDS.find((k) => k.id === kind)
  if (!info) throw new HttpError(400, 'BAD_KIND', `"${kind}" isn't a database Dukoi can run.`)
  return info
}

/** The connection URL apps use. Has the password in it. */
export function databaseUrl(db: SavedDatabase, host: string): string {
  return db.kind === 'redis'
    ? `redis://default:${db.password}@${host}:${db.port}`
    : `postgres://postgres:${db.password}@${host}:${db.port}/postgres`
}

export class Databases {
  private runtimes = new Map<string, DbRuntime>()
  private stats = new ProcStats()
  private sampler: NodeJS.Timeout

  constructor(private agent: Agent) {
    this.sampler = setInterval(() => {
      for (const rt of this.runtimes.values()) rt.usage = this.stats.sample(rt.proc?.pid ?? null)
    }, 2000)
    this.sampler.unref()
  }

  private get store() {
    return this.agent.store
  }

  // ── Kinds ───────────────────────────────────────────────────────────────

  /** Redis and Postgres, and whether this phone's build can run each. */
  kinds(): DatabaseKindStatus[] {
    return DATABASE_KINDS.map((k) => ({ ...k, available: this.binary(k.id) !== null }))
  }

  /** The file that runs a kind, or null when this build doesn't have it. */
  private binary(kind: DatabaseKind): string | null {
    const file = kind === 'redis' ? this.agent.config.valkeyPath : this.agent.config.postgresScript
    return file && existsSync(file) ? file : null
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  /** Starts every database that was running before. Called when the agent starts. */
  async restore(): Promise<void> {
    for (const saved of this.store.state.databases) {
      const rt = this.runtime(saved.name)
      this.clearLeftovers(rt)
      if (!saved.wanted) continue
      try {
        this.launch(rt)
        rt.log.note('Started after the agent restarted.')
      } catch (err) {
        rt.log.note(`Couldn't start after restart: ${(err as Error).message}`)
      }
    }
  }

  private runtime(name: string): DbRuntime {
    const existing = this.runtimes.get(name)
    if (existing) return existing
    const saved = this.store.database(name)
    if (!saved)
      throw new HttpError(
        404,
        'NO_SUCH_DATABASE',
        `There's no database called "${name}" on this phone.`,
        'Run `dukoi db` to see your databases.',
      )
    const rt = new DbRuntime(saved, join(this.agent.paths.databases, name))
    this.runtimes.set(name, rt)
    return rt
  }

  private clearLeftovers(rt: DbRuntime): void {
    const run = join(rt.dir, 'run')
    const binary = this.command(rt.saved.kind)
    for (const f of readdirSync(run).filter((f) => f.endsWith('.pid'))) {
      const killed = killLeftover(join(run, f), binary)
      if (killed)
        rt.log.note(`Stopped a leftover process (pid ${killed}) from before the agent restarted.`)
    }
  }

  private command(kind: DatabaseKind): string {
    return kind === 'redis' ? (this.agent.config.valkeyPath ?? '') : this.agent.config.nodePath
  }

  private spec(rt: DbRuntime): ProcessSpec {
    const { saved } = rt
    const file = this.binary(saved.kind)
    if (!file)
      throw new HttpError(
        409,
        'NOT_IN_THIS_BUILD',
        `This phone's Dukoi can't run ${kindInfo(saved.kind).name} yet.`,
        'Update the Dukoi app on the phone from dukoi.com/download.',
      )
    const data = join(rt.dir, 'data')
    const env = {
      HOME: data,
      TMPDIR: process.env.TMPDIR ?? '/tmp',
      PATH: process.env.PATH ?? '/system/bin',
    }
    const host = saved.wifi ? '0.0.0.0' : '127.0.0.1'
    if (saved.kind === 'redis') {
      // A config file, so the password isn't in the process list.
      const conf = join(rt.dir, 'run', 'valkey.conf')
      writeFileSync(
        conf,
        [
          `port ${saved.port}`,
          `bind ${host}`,
          'protected-mode no',
          `requirepass ${saved.password}`,
          `dir ${data}`,
          'appendonly yes',
          'appendfsync everysec',
          'save 300 1',
          'daemonize no',
          'logfile ""',
          // Keep the command line as started, so a leftover can be found after the agent is killed.
          'set-proc-title no',
          '',
        ].join('\n'),
        { mode: 0o600 },
      )
      return { command: file, args: [conf], cwd: data, env }
    }
    return {
      command: this.agent.config.nodePath,
      args: [file, data],
      cwd: data,
      env: {
        ...env,
        PORT: String(saved.port),
        HOST: host,
        DUKOI_DB_PASSWORD: saved.password,
      },
    }
  }

  /** Starts the process. Doesn't wait for it to answer. */
  private launch(rt: DbRuntime): AppProcess {
    if (rt.proc) return rt.proc
    const proc = new AppProcess(rt.saved.name, this.spec(rt), rt.log, join(rt.dir, 'run', 'db.pid'))
    rt.proc = proc
    proc.start()
    return proc
  }

  /** Waits until the database takes connections, or says why it didn't. */
  private async waitReady(rt: DbRuntime, proc: AppProcess): Promise<void> {
    const deadline = Date.now() + READY_TIMEOUT_MS
    const restarts = proc.restarts
    while (Date.now() < deadline) {
      if (proc.restarts > restarts || proc.state === 'stopped') {
        throw new HttpError(
          422,
          'DATABASE_DIDNT_START',
          `${rt.saved.name} stopped while starting (${proc.lastExit ?? 'no exit code'}).`,
          `Last lines from it:\n${rt.log.tail(8).join('\n')}`,
        )
      }
      if (await accepts(rt.saved.port)) return
      await sleep(250)
    }
    throw new HttpError(
      422,
      'DATABASE_TIMEOUT',
      `${rt.saved.name} didn't start taking connections within ${READY_TIMEOUT_MS / 1000} seconds.`,
      `Last lines from it:\n${rt.log.tail(8).join('\n')}`,
    )
  }

  /** Stops and starts it again with the saved settings (Wi-Fi, password). */
  private async relaunch(rt: DbRuntime): Promise<void> {
    if (rt.proc) {
      await rt.proc.stop()
      rt.proc = null
    }
    if (!rt.saved.wanted) return
    await this.waitReady(rt, this.launch(rt))
  }

  // ── Create, change, remove ──────────────────────────────────────────────

  async create(req: DatabaseCreate): Promise<DatabaseInfo> {
    const kind = kindInfo(req.kind)
    if (!this.binary(req.kind))
      throw new HttpError(
        409,
        'NOT_IN_THIS_BUILD',
        `This phone's Dukoi can't run ${kind.name} yet.`,
        'Update the Dukoi app on the phone from dukoi.com/download.',
      )
    const name = req.name?.trim() || this.freeName(req.kind)
    if (!APP_NAME_PATTERN.test(name))
      throw new HttpError(
        400,
        'BAD_NAME',
        `"${name}" isn't a valid database name.`,
        'Use lowercase letters, numbers and dashes, up to 40 characters.',
      )
    if (this.store.database(name))
      throw new HttpError(
        409,
        'NAME_TAKEN',
        `There's already a database called "${name}".`,
        'Pick another name.',
      )
    const apps = [...new Set(req.apps ?? [])]
    for (const app of apps) this.mustBeApp(app)

    const saved: SavedDatabase = {
      name,
      kind: req.kind,
      port: await this.freePort(kind.firstPort),
      password: newPassword(),
      wifi: req.wifi ?? false,
      apps: [],
      wanted: true,
      createdAt: new Date().toISOString(),
    }
    this.store.state.databases.push(saved)
    this.store.save()

    const rt = this.runtime(name)
    try {
      await rt.serial(async () => {
        rt.log.note(
          `Created ${name}. Starting ${kind.engine} on port ${saved.port}${saved.wifi ? ', reachable on Wi-Fi' : ''}.`,
        )
        await this.waitReady(rt, this.launch(rt))
        rt.log.note(`${name} is ready.`)
      })
    } catch (err) {
      // Don't leave a half-made database behind.
      await this.remove(name).catch(() => {})
      throw err
    }
    if (apps.length) await this.change(name, { connect: apps })
    return this.info(rt)
  }

  async change(name: string, change: DatabaseChange): Promise<DatabaseInfo> {
    const rt = this.runtime(name)
    const { saved } = rt
    const kind = kindInfo(saved.kind)
    for (const app of change.connect ?? []) this.mustBeApp(app)

    await rt.serial(async () => {
      let restart = false
      if (change.wifi !== undefined && change.wifi !== saved.wifi) {
        saved.wifi = change.wifi
        restart = true
        rt.log.note(
          saved.wifi
            ? `${name} is now reachable on Wi-Fi.`
            : `${name} is now for this phone's apps only.`,
        )
      }
      if (change.newPassword) {
        saved.password = newPassword()
        restart = true
        rt.log.note('Made a new password. The old one stops working now.')
      }
      this.store.save()
      if (restart) await this.relaunch(rt)
    })

    // Apps restart to pick up the URL, so do them after the database is back.
    const url = databaseUrl(saved, '127.0.0.1')
    const before = new Set(saved.apps)
    const disconnect = new Set(change.disconnect ?? [])
    const connect = (change.connect ?? []).filter((a) => !disconnect.has(a))
    const refresh = change.newPassword ? saved.apps.filter((a) => !disconnect.has(a)) : []
    for (const app of new Set([...connect, ...refresh])) {
      await this.agent.apps.setEnv(app, { set: { [kind.envName]: url } })
      if (!before.has(app)) rt.log.note(`Gave ${kind.envName} to ${app}.`)
    }
    for (const app of disconnect) {
      if (!before.has(app)) continue
      if (this.store.app(app)) await this.agent.apps.setEnv(app, { unset: [kind.envName] })
      rt.log.note(`Took ${kind.envName} away from ${app}.`)
    }
    saved.apps = [...new Set([...saved.apps, ...connect])].filter((a) => !disconnect.has(a))
    this.store.save()
    return this.info(rt)
  }

  async remove(name: string): Promise<{ removed: string }> {
    const rt = this.runtime(name)
    const kind = kindInfo(rt.saved.kind)
    await rt.serial(async () => {
      rt.saved.wanted = false
      await rt.proc?.stop()
      rt.proc = null
    })
    for (const app of rt.saved.apps)
      if (this.store.app(app))
        await this.agent.apps.setEnv(app, { unset: [kind.envName] }).catch(() => {})
    this.runtimes.delete(name)
    this.store.state.databases = this.store.state.databases.filter((d) => d.name !== name)
    this.store.save()
    rmSync(rt.dir, { recursive: true, force: true })
    return { removed: name }
  }

  /** An app was removed: stop listing it as connected. */
  forgetApp(app: string): void {
    let changed = false
    for (const db of this.store.state.databases) {
      if (db.apps.includes(app)) {
        db.apps = db.apps.filter((a) => a !== app)
        changed = true
      }
    }
    if (changed) this.store.save()
  }

  // ── Control ─────────────────────────────────────────────────────────────

  async start(name: string): Promise<DatabaseInfo> {
    const rt = this.runtime(name)
    await rt.serial(async () => {
      rt.saved.wanted = true
      this.store.save()
      if (!rt.proc) await this.waitReady(rt, this.launch(rt))
    })
    return this.info(rt)
  }

  async stop(name: string): Promise<DatabaseInfo> {
    const rt = this.runtime(name)
    await rt.serial(async () => {
      rt.saved.wanted = false
      this.store.save()
      await rt.proc?.stop()
      rt.proc = null
    })
    return this.info(rt)
  }

  async restart(name: string): Promise<DatabaseInfo> {
    const rt = this.runtime(name)
    await rt.serial(async () => {
      rt.saved.wanted = true
      this.store.save()
      await this.relaunch(rt)
    })
    return this.info(rt)
  }

  // ── Reading ─────────────────────────────────────────────────────────────

  list(): DatabaseInfo[] {
    return this.store.state.databases.map((d) => this.info(this.runtime(d.name)))
  }

  get(name: string): DatabaseInfo {
    return this.info(this.runtime(name))
  }

  logFile(name: string): LogFile {
    return this.runtime(name).log
  }

  livePid(name: string): number | null {
    return this.runtimes.get(name)?.proc?.pid ?? null
  }

  private info(rt: DbRuntime): DatabaseInfo {
    const { saved, proc } = rt
    return {
      name: saved.name,
      kind: saved.kind,
      state: proc?.state ?? 'stopped',
      port: saved.port,
      pid: proc?.pid ?? null,
      restarts: proc?.restarts ?? 0,
      lastExit: proc?.lastExit ?? null,
      startedAt: proc?.startedAt?.toISOString() ?? null,
      cpuPercent: rt.usage.cpuPercent,
      memoryMb: rt.usage.memoryMb,
      url: databaseUrl(saved, '127.0.0.1'),
      // Worked out on every read, because the phone's Wi-Fi address can change.
      wifiUrl: saved.wifi ? databaseUrl(saved, wifiAddress()) : null,
      apps: saved.apps.filter((a) => this.store.app(a)),
      envName: kindInfo(saved.kind).envName,
    }
  }

  async stopAll(): Promise<void> {
    clearInterval(this.sampler)
    for (const rt of this.runtimes.values()) await rt.proc?.stop(2000)
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private mustBeApp(app: string): void {
    if (!this.store.app(app))
      throw new HttpError(
        404,
        'NO_SUCH_APP',
        `There's no app called "${app}" on this phone.`,
        'Run `dukoi ps` to see your apps.',
      )
  }

  private freeName(kind: DatabaseKind): string {
    if (!this.store.database(kind)) return kind
    let n = 2
    while (this.store.database(`${kind}-${n}`)) n++
    return `${kind}-${n}`
  }

  /** The first port from `from` up that no app or database uses and nothing listens on. */
  private async freePort(from: number): Promise<number> {
    const used = new Set([
      ...this.store.state.apps.map((a) => a.port),
      ...this.store.state.databases.map((d) => d.port),
    ])
    for (let port = from; port < from + 1000; port++) {
      if (!used.has(port) && (await canListen(port))) return port
    }
    throw new HttpError(409, 'NO_FREE_PORT', `There's no free port near ${from} on the phone.`)
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 24 URL-safe characters, so the URL needs no escaping. */
const newPassword = () => randomBytes(18).toString('base64url')

function accepts(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(port, '127.0.0.1')
    socket.setTimeout(1000)
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
    socket.once('timeout', () => {
      socket.destroy()
      resolve(false)
    })
  })
}

function canListen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = createServer()
    s.once('error', () => resolve(false))
    s.listen(port, '0.0.0.0', () => s.close(() => resolve(true)))
  })
}
