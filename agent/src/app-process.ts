// Runs one app process and keeps it alive.
import { type ChildProcess, spawn } from 'node:child_process'
import { closeSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { AppState } from '@dukoi/shared'
import type { LogFile } from './log-file.ts'
import { CRASH_LOOP_AFTER, describeExit, type Exit, nextRestart } from './restart-policy.ts'

export interface ProcessSpec {
  command: string
  args: string[]
  cwd: string
  env: Record<string, string>
  /**
   * Write the output to this file instead of the log, and start the process in
   * its own group. With no pipe back to the agent, it keeps running if the agent
   * dies, so cloudflared keeps its quick link.
   */
  output?: string
}

export class AppProcess {
  state: AppState = 'stopped'
  pid: number | null = null
  restarts = 0
  lastExit: string | null = null
  startedAt: Date | null = null

  private child: ChildProcess | null = null
  private wanted = false
  private crashes = 0
  private restartTimer: NodeJS.Timeout | null = null
  private exited: Promise<void> = Promise.resolve()

  constructor(
    readonly name: string,
    private spec: ProcessSpec,
    private log: LogFile,
    private pidFile: string,
    private onChange: () => void = () => {},
  ) {}

  /** Swap what runs next time it starts (used by deploys). */
  setSpec(spec: ProcessSpec): void {
    this.spec = spec
  }

  start(): void {
    this.wanted = true
    if (this.child || this.restartTimer) return
    this.spawn()
  }

  async stop(graceMs = 5000): Promise<void> {
    this.wanted = false
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
    const child = this.child
    if (child) {
      child.kill('SIGTERM')
      const timer = setTimeout(() => child.kill('SIGKILL'), graceMs)
      await this.exited
      clearTimeout(timer)
    }
    this.state = 'stopped'
    this.onChange()
  }

  async restart(): Promise<void> {
    await this.stop()
    this.crashes = 0
    this.start()
  }

  private spawn(): void {
    this.restartTimer = null
    this.state = this.restarts > 0 ? 'restarting' : 'starting'
    const out = this.spec.output ? openSync(this.spec.output, 'a') : null
    const child = spawn(this.spec.command, this.spec.args, {
      cwd: this.spec.cwd,
      env: this.spec.env,
      stdio: out === null ? ['ignore', 'pipe', 'pipe'] : ['ignore', out, out],
      detached: out !== null,
    })
    if (out !== null) closeSync(out)
    this.child = child
    const startedAt = Date.now()
    this.startedAt = new Date(startedAt)
    this.pid = child.pid ?? null
    if (this.pid) writeFileSync(this.pidFile, String(this.pid))
    this.state = 'running'
    this.onChange()

    child.stdout?.setEncoding('utf8').on('data', (d: string) => this.log.write('out', d))
    child.stderr?.setEncoding('utf8').on('data', (d: string) => this.log.write('err', d))

    this.exited = new Promise((resolve) => {
      child.on('error', (err) => {
        this.log.note(`Couldn't start: ${err.message}`)
      })
      child.on('exit', (code, signal) => {
        this.onExit({ code, signal }, Date.now() - startedAt)
        resolve()
      })
    })
  }

  private onExit(exit: Exit, ranMs: number): void {
    this.child = null
    this.pid = null
    this.startedAt = null
    rmSync(this.pidFile, { force: true })
    this.lastExit = describeExit(exit)

    if (!this.wanted) {
      this.log.note(`Stopped (${this.lastExit}).`)
      return
    }

    const decision = nextRestart(exit, this.crashes, ranMs)
    this.crashes = decision.crashes
    this.restarts++
    this.state = this.crashes >= CRASH_LOOP_AFTER ? 'crashed' : 'restarting'
    const when = decision.delayMs === 0 ? 'now' : `in ${decision.delayMs / 1000}s`
    this.log.note(`App ${this.lastExit}. Restarting ${when}.`)
    this.onChange()
    this.restartTimer = setTimeout(() => this.spawn(), decision.delayMs)
  }
}

/**
 * If the agent was killed, its app processes can outlive it. Stop any app
 * process left from an earlier run, so the new one can use the port.
 */
export function killLeftover(pidFile: string, nodePath: string): number | null {
  let pid: number
  try {
    pid = Number(readFileSync(pidFile, 'utf8').trim())
  } catch {
    return null
  }
  rmSync(pidFile, { force: true })
  if (!pid) return null
  try {
    // Only kill it if it's still one of our Node processes.
    const cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf8')
    if (!cmdline.includes(nodePath)) return null
  } catch {
    return null
  }
  try {
    process.kill(pid, 'SIGKILL')
    return pid
  } catch {
    return null
  }
}
