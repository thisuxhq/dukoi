// rollback, releases, start, stop, restart, remove
import { createInterface } from 'node:readline/promises'
import type { AppInfo, DeployResult, ReleaseInfo } from '@dukoi/shared'
import { readAppFolder } from '../app-folder.ts'
import { call, pickPhone } from '../client.ts'
import { CliError, c, info, ok, table } from '../output.ts'

/** The app to act on: the argument, else the app in the current folder. */
export function appName(arg: string | undefined): string {
  if (arg) return arg
  try {
    return readAppFolder('.').name
  } catch {
    throw new CliError(
      'NO_APP',
      'Which app?',
      'Name it (dukoi logs my-api), or run this in the app’s folder.',
    )
  }
}

export async function control(
  action: 'start' | 'stop' | 'restart',
  arg: string | undefined,
  device: string | undefined,
  json: boolean,
): Promise<void> {
  const name = appName(arg)
  const app = await call<AppInfo>(
    pickPhone(device),
    `/apps/${encodeURIComponent(name)}/${action}`,
    { method: 'POST', timeoutMs: 30_000 },
  )
  if (json) return void console.log(JSON.stringify({ ok: true, app }))
  const word = { start: 'Started', stop: 'Stopped', restart: 'Restarted' }[action]
  ok(`${word} ${name}${action === 'stop' ? '' : ` (${app.localUrl})`}`)
}

export async function rollback(
  arg: string | undefined,
  to: string | undefined,
  device: string | undefined,
  json: boolean,
): Promise<void> {
  const name = appName(arg)
  const result = await call<DeployResult>(
    pickPhone(device),
    `/apps/${encodeURIComponent(name)}/rollback`,
    {
      method: 'POST',
      body: to ? { to } : {},
      timeoutMs: 60_000,
    },
  )
  if (json) return void console.log(JSON.stringify({ ok: true, ...result }))
  ok(`${name} is back on release ${result.release} (${(result.tookMs / 1000).toFixed(1)}s)`)
}

export async function releases(
  arg: string | undefined,
  device: string | undefined,
  json: boolean,
): Promise<void> {
  const name = appName(arg)
  const list = await call<ReleaseInfo[]>(
    pickPhone(device),
    `/apps/${encodeURIComponent(name)}/releases`,
  )
  if (json) return void console.log(JSON.stringify({ ok: true, releases: list }))
  const rows = [['', 'RELEASE', 'CREATED', 'SIZE'].map((h) => c.dim(h))]
  for (const r of [...list].reverse()) {
    rows.push([
      r.live ? c.green('●') : ' ',
      r.id,
      r.createdAt.replace('T', ' ').slice(0, 19),
      `${Math.round(r.sizeBytes / 1024)} KB`,
    ])
  }
  info(table(rows))
}

export async function remove(
  arg: string | undefined,
  yes: boolean,
  device: string | undefined,
  json: boolean,
): Promise<void> {
  const name = appName(arg)
  if (!yes) {
    if (json || !process.stdin.isTTY) {
      throw new CliError(
        'NEEDS_YES',
        `Removing ${name} deletes its releases, data and logs.`,
        'Add --yes to confirm.',
      )
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const answer = await rl.question(
      `Delete ${c.bold(name)} from the phone, with its releases, data and logs? [y/N] `,
    )
    rl.close()
    if (!/^y(es)?$/i.test(answer.trim())) return void info('Nothing removed.')
  }
  await call(pickPhone(device), `/apps/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    timeoutMs: 30_000,
  })
  if (json) return void console.log(JSON.stringify({ ok: true, removed: name }))
  ok(`Removed ${name}`)
}
