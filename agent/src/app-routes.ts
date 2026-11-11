// Admin API routes for apps. Computers need to be paired; the phone app
// itself reads and controls apps through the same handlers under /local.
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

  // Paired computers and the phone app (on 127.0.0.1) share these.
  const both: typeof r.on = (method, path, _access, handler) => {
    r.on(method, path, 'paired', handler)
    r.on(method, `/local${path}`, 'local', handler)
  }

  both('GET', '/apps', 'paired', () => apps.list())
  both('GET', '/apps/:name', 'paired', (ctx) => apps.get(ctx.params.name ?? ''))
  r.on('GET', '/apps/:name/releases', 'paired', (ctx) => apps.releases(ctx.params.name ?? ''))
  both('POST', '/apps/:name/start', 'paired', (ctx) => apps.start(ctx.params.name ?? ''))
  both('POST', '/apps/:name/stop', 'paired', (ctx) => apps.stop(ctx.params.name ?? ''))
  both('POST', '/apps/:name/restart', 'paired', (ctx) => apps.restart(ctx.params.name ?? ''))
  both('POST', '/apps/:name/rollback', 'paired', (ctx) => {
    const { to } = ctx.body.length ? ctx.json<{ to?: string }>() : {}
    return apps.rollback(ctx.params.name ?? '', to)
  })
  // Public URLs: a quick tunnel, or a custom domain on the phone's named tunnel.
  both('POST', '/apps/:name/expose', 'paired', (ctx) => agent.tunnels.expose(ctx.params.name ?? ''))
  both('DELETE', '/apps/:name/expose', 'paired', async (ctx) => {
    await agent.domains.remove(ctx.params.name ?? '')
    return agent.tunnels.unexpose(ctx.params.name ?? '')
  })
  both('GET', '/domain', 'paired', () => agent.domains.status())
  both('POST', '/domain/login', 'paired', () => agent.domains.startLogin())
  both('DELETE', '/domain', 'paired', () => agent.domains.logout())
  both('POST', '/apps/:name/domain', 'paired', (ctx) => {
    const { hostname } = ctx.json<{ hostname?: string }>()
    return agent.domains.add(ctx.params.name ?? '', hostname ?? '')
  })
  r.on('DELETE', '/apps/:name', 'paired', async (ctx) => {
    await agent.domains.remove(ctx.params.name ?? '')
    await agent.tunnels.unexpose(ctx.params.name ?? '')
    return apps.remove(ctx.params.name ?? '')
  })
}
