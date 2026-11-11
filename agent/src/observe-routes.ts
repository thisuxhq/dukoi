// droidhost logs and droidhost status.
import { statfsSync } from 'node:fs'
import { availableParallelism, freemem, loadavg, totalmem, uptime } from 'node:os'
import type { PhoneStatus } from '@droidhost/shared'
import type { Agent } from './agent.ts'
import { formatLine } from './log-file.ts'

const MAX_LINES = 2000

export function observeRoutes(agent: Agent): void {
  const r = agent.router

  r.on('GET', '/apps/:name/logs', 'paired', async (ctx) => {
    const log = await agent.apps.logFile(ctx.params.name ?? '')
    const lines = Math.min(MAX_LINES, Math.max(0, Number(ctx.query.get('lines') ?? 100)))
    const recent = log.tail(lines)
    if (ctx.query.get('follow') !== '1') return { lines: recent }

    // Follow: plain text, one log line per line, kept open until the computer
    // disconnects. A comment line every 15 s keeps idle connections alive.
    const { res, req } = ctx
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-cache' })
    for (const l of recent) res.write(`${l}\n`)
    const stop = log.subscribe((line) => res.write(`${formatLine(line)}\n`))
    const keepAlive = setInterval(() => res.write(':\n'), 15_000)
    await new Promise<void>((resolve) => req.on('close', resolve))
    clearInterval(keepAlive)
    stop()
    res.end()
  })

  // The phone app shows recent lines; it doesn't follow.
  r.on('GET', '/local/apps/:name/logs', 'local', async (ctx) => {
    const log = await agent.apps.logFile(ctx.params.name ?? '')
    const lines = Math.min(MAX_LINES, Math.max(0, Number(ctx.query.get('lines') ?? 100)))
    return { lines: log.tail(lines) }
  })

  const status = async (): Promise<PhoneStatus> => {
    const info = agent.info()
    const apps = await agent.apps.list()
    let storage: PhoneStatus['storage'] = null
    try {
      const fs = statfsSync(agent.config.home)
      storage = {
        totalMb: Math.round((fs.blocks * fs.bsize) / 1024 / 1024),
        freeMb: Math.round((fs.bavail * fs.bsize) / 1024 / 1024),
      }
    } catch {}
    return {
      name: info.name,
      model: info.model,
      android: info.android,
      agentVersion: info.agentVersion,
      nodeVersion: info.nodeVersion,
      agentUptimeSeconds: Math.round((Date.now() - agent.startedAt.getTime()) / 1000),
      phoneUptimeSeconds: Math.round(uptime()),
      memory: {
        totalMb: Math.round(totalmem() / 1024 / 1024),
        freeMb: Math.round(freemem() / 1024 / 1024),
      },
      storage,
      load: loadavg().map((n) => Math.round(n * 100) / 100),
      apps: { total: apps.length, running: apps.filter((a) => a.state === 'running').length },
      // os.cpus() is empty on Android (no /proc/stat), so ask the scheduler.
      cpuCount: availableParallelism(),
    }
  }
  r.on('GET', '/status', 'paired', status)
  r.on('GET', '/local/phone', 'local', status)
}
