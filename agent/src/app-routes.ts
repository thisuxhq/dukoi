// Admin API routes for apps. All need a paired computer.
import type { Agent } from './agent.ts'
import { HttpError } from './http.ts'

export function appRoutes(agent: Agent): void {
  const r = agent.router
  const apps = agent.apps

  r.on(
    'POST',
    '/apps/:name/deploy',
    'paired',
    async (ctx) => {
      const sha256 = ctx.query.get('sha256')
      if (!sha256) throw new HttpError(400, 'NO_HASH', 'The upload needs ?sha256=<hash>.')
      return apps.deploy(ctx.params.name ?? '', ctx.req, sha256)
    },
    { raw: true },
  )

  r.on('GET', '/apps', 'paired', () => apps.list())
  r.on('GET', '/apps/:name', 'paired', (ctx) => apps.get(ctx.params.name ?? ''))
  r.on('GET', '/apps/:name/releases', 'paired', (ctx) => apps.releases(ctx.params.name ?? ''))
  r.on('POST', '/apps/:name/start', 'paired', (ctx) => apps.start(ctx.params.name ?? ''))
  r.on('POST', '/apps/:name/stop', 'paired', (ctx) => apps.stop(ctx.params.name ?? ''))
  r.on('POST', '/apps/:name/restart', 'paired', (ctx) => apps.restart(ctx.params.name ?? ''))
  r.on('POST', '/apps/:name/rollback', 'paired', (ctx) => {
    const { to } = ctx.json<{ to?: string }>()
    return apps.rollback(ctx.params.name ?? '', to)
  })
  r.on('DELETE', '/apps/:name', 'paired', (ctx) => apps.remove(ctx.params.name ?? ''))
}
