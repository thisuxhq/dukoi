// dukoi logs, inspect, replay and status.
import { statfsSync } from 'node:fs'
import { availableParallelism, freemem, loadavg, totalmem, uptime } from 'node:os'
import type { PhoneStatus, ReplayResult } from '@dukoi/shared'
import type { Agent } from './agent.ts'
import { HttpError } from './http.ts'
import { formatLine } from './log-file.ts'
import { MAX_REQUESTS } from './request-log.ts'

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

  r.on('GET', '/apps/:name/requests', 'paired', async (ctx) => {
    const log = await agent.apps.requestLog(ctx.params.name ?? '')
    const limit = Math.min(
      MAX_REQUESTS,
      Math.max(0, Number(ctx.query.get('limit') ?? MAX_REQUESTS)),
    )
    const recent = log.list(limit)
    if (ctx.query.get('follow') !== '1') return { requests: recent }

    // Follow: one JSON summary per line, kept open until the computer disconnects.
    const { res, req } = ctx
    res.writeHead(200, {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-cache',
    })
    for (const item of recent) res.write(`${JSON.stringify(item)}\n`)
    const stop = log.subscribe((item) => res.write(`${JSON.stringify(item)}\n`))
    const stopClear = log.subscribeClear(() => res.write('{"clear":true}\n'))
    const keepAlive = setInterval(() => res.write(':\n'), 15_000)
    await new Promise<void>((resolve) => req.on('close', resolve))
    clearInterval(keepAlive)
    stop()
    stopClear()
    res.end()
  })

  r.on('GET', '/local/apps/:name/requests', 'local', async (ctx) => {
    const log = await agent.apps.requestLog(ctx.params.name ?? '')
    const limit = Math.min(
      MAX_REQUESTS,
      Math.max(0, Number(ctx.query.get('limit') ?? MAX_REQUESTS)),
    )
    return { requests: log.list(limit) }
  })

  r.on('GET', '/apps/:name/requests/:id', 'paired', async (ctx) => {
    const name = ctx.params.name ?? ''
    const id = ctx.params.id ?? ''
    const log = await agent.apps.requestLog(name)
    const detail = log.get(id)
    if (!detail) {
      throw new HttpError(
        404,
        'NO_SUCH_REQUEST',
        `There's no captured request "${id}" for ${name}.`,
        `Dukoi keeps the last ${MAX_REQUESTS} requests in memory. Run \`dukoi inspect ${name}\` to see them.`,
      )
    }
    return detail
  })

  r.on('POST', '/apps/:name/requests/:id/replay', 'paired', async (ctx) => {
    const request = await agent.apps.replayRequest(ctx.params.name ?? '', ctx.params.id ?? '')
    return { request } satisfies ReplayResult
  })

  r.on('DELETE', '/apps/:name/requests', 'paired', async (ctx) => {
    const log = await agent.apps.requestLog(ctx.params.name ?? '')
    log.clear()
    return { cleared: true }
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
      maker: agent.config.phone.maker ?? null,
      chip: agent.config.phone.chip ?? null,
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
