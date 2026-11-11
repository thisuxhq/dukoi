import type { ExposeResult } from '@droidhost/shared'
import { call, pickPhone } from '../client.ts'
import { CliError, c, info, ok } from '../output.ts'
import { appName } from './apps.ts'

export interface ExposeOptions {
  app?: string
  off: boolean
  domain?: string
  device?: string
  json: boolean
}

export async function expose(opts: ExposeOptions): Promise<void> {
  if (opts.domain) {
    throw new CliError(
      'NOT_YET',
      'Custom domains (named tunnels) aren’t in this version yet.',
      'Use a quick tunnel for now: droidhost expose',
    )
  }
  const name = appName(opts.app)
  const phone = pickPhone(opts.device)
  const path = `/apps/${encodeURIComponent(name)}/expose`

  if (opts.off) {
    await call(phone, path, { method: 'DELETE' })
    if (opts.json) return void console.log(JSON.stringify({ ok: true, app: name, publicUrl: null }))
    return void ok(`${name} has no public URL now`)
  }

  if (!opts.json) info('Asking Cloudflare for a public URL…')
  const result = await call<ExposeResult>(phone, path, { method: 'POST', timeoutMs: 45_000 })
  if (opts.json) return void console.log(JSON.stringify({ ok: true, ...result }))
  ok(`${name} is public`)
  info(`\n  ${c.dim('Public')}  ${c.cyan(result.publicUrl)}\n`)
  info(
    c.dim(
      '  Quick tunnel URLs change if the tunnel restarts. `droidhost ps` always shows the current one.',
    ),
  )
}
