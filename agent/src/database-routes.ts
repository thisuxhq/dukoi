// Admin API routes for databases. Paired computers (the CLI and the dashboard)
// and the phone app share them, like the app routes.
import type { DatabaseChange, DatabaseCreate } from '@dukoi/shared'
import type { Agent } from './agent.ts'
import { formatLine } from './log-file.ts'

const MAX_LINES = 2000

export function databaseRoutes(agent: Agent): void {
  const r = agent.router
  const dbs = agent.databases

  const both: typeof r.on = (method, path, _access, handler) => {
    r.on(method, path, 'paired', handler)
    r.on(method, `/local${path}`, 'local', handler)
  }

  both('GET', '/database-kinds', 'paired', () => dbs.kinds())
  both('GET', '/databases', 'paired', () => dbs.list())
  both('POST', '/databases', 'paired', (ctx) => dbs.create(ctx.json<DatabaseCreate>()))
  both('GET', '/databases/:name', 'paired', (ctx) => dbs.get(ctx.params.name ?? ''))
  both('PATCH', '/databases/:name', 'paired', (ctx) =>
    dbs.change(ctx.params.name ?? '', ctx.json<DatabaseChange>()),
  )
  both('DELETE', '/databases/:name', 'paired', (ctx) => dbs.remove(ctx.params.name ?? ''))
  both('POST', '/databases/:name/start', 'paired', (ctx) => dbs.start(ctx.params.name ?? ''))
  both('POST', '/databases/:name/stop', 'paired', (ctx) => dbs.stop(ctx.params.name ?? ''))
  both('POST', '/databases/:name/restart', 'paired', (ctx) => dbs.restart(ctx.params.name ?? ''))

  // Logs work like an app's: recent lines, or ?follow=1 to keep them coming.
  both('GET', '/databases/:name/logs', 'paired', async (ctx) => {
    const log = dbs.logFile(ctx.params.name ?? '')
    const lines = Math.min(MAX_LINES, Math.max(0, Number(ctx.query.get('lines') ?? 100)))
    const recent = log.tail(lines)
    if (ctx.query.get('follow') !== '1') return { lines: recent }
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
}
