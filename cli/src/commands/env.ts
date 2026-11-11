// droidhost env: an app's settings, like a bot token. They're kept on the
// phone and passed to the app as environment variables. Values never come back.
import type { EnvChange, EnvNames } from '@droidhost/shared'
import { call, pickPhone } from '../client.ts'
import { CliError, c, info, ok } from '../output.ts'
import { appName } from './apps.ts'

export function setEnv(app: string, change: EnvChange, device?: string): Promise<EnvNames> {
  return call<EnvNames>(pickPhone(device), `/apps/${encodeURIComponent(app)}/env`, {
    method: 'PUT',
    body: change,
    timeoutMs: 30_000,
  })
}

export async function env(
  action: string | undefined,
  args: string[],
  opts: { app?: string; device?: string; json: boolean },
): Promise<void> {
  const name = appName(opts.app)
  const path = `/apps/${encodeURIComponent(name)}/env`

  if (action === 'set') {
    const set: Record<string, string> = {}
    for (const pair of args) {
      const at = pair.indexOf('=')
      if (at < 1)
        throw new CliError(
          'BAD_ARGS',
          `"${pair}" isn't KEY=value.`,
          'Like this: droidhost env set API_KEY=abc123',
        )
      set[pair.slice(0, at)] = pair.slice(at + 1)
    }
    if (!args.length)
      throw new CliError('BAD_ARGS', 'Set what?', 'Like this: droidhost env set API_KEY=abc123')
    const { names } = await setEnv(name, { set }, opts.device)
    if (opts.json) return void console.log(JSON.stringify({ ok: true, app: name, names }))
    return void ok(
      `Saved ${Object.keys(set).join(', ')} for ${name}. It restarted with the new settings.`,
    )
  }

  if (action === 'unset') {
    if (!args.length)
      throw new CliError(
        'BAD_ARGS',
        'Remove which setting?',
        'Like this: droidhost env unset API_KEY',
      )
    const { names } = await setEnv(name, { unset: args }, opts.device)
    if (opts.json) return void console.log(JSON.stringify({ ok: true, app: name, names }))
    return void ok(`Removed ${args.join(', ')} from ${name}`)
  }

  if (action === undefined || action === 'list') {
    const { names } = await call<EnvNames>(pickPhone(opts.device), path)
    if (opts.json) return void console.log(JSON.stringify({ ok: true, app: name, names }))
    if (!names.length)
      return void info(`${name} has no settings. Add one: droidhost env set KEY=value`)
    info(names.map((n) => `${n}  ${c.dim('(set)')}`).join('\n'))
    return
  }

  throw new CliError(
    'BAD_ARGS',
    `There's no "env ${action}".`,
    'Use droidhost env set, unset or list.',
  )
}
