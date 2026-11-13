// dukoi db: Redis and Postgres on the phone, next to the apps.
//
//   dukoi db                          list them
//   dukoi db create redis --app web   make one and give web REDIS_URL
//   dukoi db url redis                print the connection URL (has the password)
//   dukoi db connect redis worker     give another app the URL
//   dukoi db disconnect redis worker
//   dukoi db wifi redis [--off]       let devices on the Wi-Fi connect
//   dukoi db password redis           make a new password
//   dukoi db logs redis
//   dukoi db start|stop|restart redis
//   dukoi db remove redis
import { createInterface } from 'node:readline/promises'
import {
  DATABASE_KINDS,
  type DatabaseChange,
  type DatabaseInfo,
  type DatabaseKind,
} from '@dukoi/shared'
import { call, pickPhone } from '../client.ts'
import { CliError, c, info, ok, table } from '../output.ts'
import { ago, printLogs, STATE_COLOUR } from './observe.ts'

export interface DbOptions {
  name?: string
  app?: string
  off: boolean
  wifi: boolean
  yes: boolean
  lines: number
  follow: boolean
  device?: string
  json: boolean
}

const USAGE = 'Run `dukoi db` to see your databases, or `dukoi --help` for the db commands.'

/** "redis://:abc…xyz@127.0.0.1:6380" → "redis://:•••@127.0.0.1:6380", for lists. */
export function maskUrl(url: string): string {
  return url.replace(/:([^:@/]+)@/, ':•••@')
}

const path = (name: string) => `/databases/${encodeURIComponent(name)}`

export async function db(action: string | undefined, args: string[], opts: DbOptions) {
  const phone = pickPhone(opts.device)
  const out = (value: Record<string, unknown>) =>
    console.log(JSON.stringify({ ok: true, ...value }))

  /** The database to act on: named, or the only one there is. */
  const target = async (arg: string | undefined): Promise<string> => {
    if (arg) return arg
    const all = await call<DatabaseInfo[]>(phone, '/databases')
    if (all.length === 1) return (all[0] as DatabaseInfo).name
    throw new CliError(
      'NO_DATABASE',
      all.length ? 'Which database?' : 'There are no databases yet.',
      all.length
        ? `Name it, like: dukoi db ${action} ${all[0]?.name}`
        : 'Make one: dukoi db create redis',
    )
  }
  const change = (name: string, body: DatabaseChange) =>
    call<DatabaseInfo>(phone, path(name), { method: 'PATCH', body, timeoutMs: 90_000 })

  switch (action) {
    case undefined:
    case 'list':
    case 'ls': {
      const all = await call<DatabaseInfo[]>(phone, '/databases')
      if (opts.json) return out({ databases: all })
      if (!all.length) return void info('No databases yet. Make one: dukoi db create redis')
      const rows = [['DATABASE', 'KIND', 'STATUS', 'MEM', 'UPTIME', 'APPS', 'URL'].map(c.dim)]
      for (const d of all)
        rows.push([
          d.name,
          kindName(d.kind),
          STATE_COLOUR[d.state](d.state),
          d.memoryMb === null ? '–' : `${d.memoryMb} MB`,
          d.startedAt ? ago(d.startedAt) : '–',
          d.apps.join(', ') || '–',
          maskUrl(d.url),
        ])
      info(table(rows))
      info(c.dim('\nSee a URL with its password: dukoi db url <name>'))
      return
    }

    case 'create':
    case 'new': {
      const kind = args[0] as DatabaseKind | undefined
      if (!kind || !DATABASE_KINDS.some((k) => k.id === kind))
        throw new CliError(
          'BAD_ARGS',
          kind ? `Dukoi can't make a "${kind}" database.` : 'Which kind?',
          'Like this: dukoi db create redis, or dukoi db create postgres',
        )
      const apps = (opts.app ?? '')
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean)
      if (!opts.json) info(c.dim(`Starting ${kindName(kind)} on ${phone.name}…`))
      const created = await call<DatabaseInfo>(phone, '/databases', {
        method: 'POST',
        body: { kind, name: opts.name, apps, wifi: opts.wifi },
        timeoutMs: 120_000,
      })
      if (opts.json) return out({ database: created })
      ok(`${created.name} is running on port ${created.port}`)
      if (created.apps.length)
        info(`  ${created.apps.join(', ')} got ${created.envName} and restarted.`)
      else
        info(
          `  Give an app the URL: dukoi db connect ${created.name} <app>   (it gets ${created.envName})`,
        )
      if (created.wifiUrl) info(`  On your Wi-Fi: dukoi db url ${created.name} --wifi`)
      return
    }

    case 'url': {
      const name = await target(args[0])
      const d = await call<DatabaseInfo>(phone, path(name))
      const url = opts.wifi ? d.wifiUrl : d.url
      if (!url)
        throw new CliError(
          'WIFI_OFF',
          `${name} isn't reachable on Wi-Fi.`,
          `Turn that on: dukoi db wifi ${name}`,
        )
      if (opts.json) return out({ database: name, url })
      // Just the URL, so it works in $(dukoi db url redis).
      return void console.log(url)
    }

    case 'connect':
    case 'disconnect': {
      const [name, ...apps] = args
      if (!name || !apps.length)
        throw new CliError('BAD_ARGS', `${action} what?`, `Like this: dukoi db ${action} redis web`)
      const d = await change(name, action === 'connect' ? { connect: apps } : { disconnect: apps })
      if (opts.json) return out({ database: d })
      return void ok(
        action === 'connect'
          ? `${apps.join(', ')} got ${d.envName} and restarted`
          : `Took ${d.envName} away from ${apps.join(', ')}`,
      )
    }

    case 'wifi': {
      const name = await target(args[0])
      const d = await change(name, { wifi: !opts.off })
      if (opts.json) return out({ database: d })
      if (!d.wifiUrl) return void ok(`${name} is for this phone's apps only again`)
      ok(`${name} is reachable on your Wi-Fi`)
      info(`  URL: dukoi db url ${name} --wifi`)
      return
    }

    case 'password': {
      const name = await target(args[0])
      const d = await change(name, { newPassword: true })
      if (opts.json) return out({ database: d })
      ok(`${name} has a new password. The old one stopped working.`)
      if (d.apps.length) info(`  ${d.apps.join(', ')} got the new URL and restarted.`)
      return
    }

    case 'logs': {
      const name = await target(args[0])
      return printLogs(phone, `${path(name)}/logs`, opts, { database: name })
    }

    case 'start':
    case 'stop':
    case 'restart': {
      const name = await target(args[0])
      const d = await call<DatabaseInfo>(phone, `${path(name)}/${action}`, {
        method: 'POST',
        timeoutMs: 90_000,
      })
      if (opts.json) return out({ database: d })
      return void ok(
        `${{ start: 'Started', stop: 'Stopped', restart: 'Restarted' }[action]} ${name}`,
      )
    }

    case 'remove':
    case 'rm': {
      const name = args[0]
      if (!name)
        throw new CliError('BAD_ARGS', 'Remove which database?', 'Like this: dukoi db remove redis')
      if (!opts.yes && !opts.json) {
        if (!process.stdin.isTTY)
          throw new CliError(
            'NEEDS_YES',
            `Removing ${name} deletes its data.`,
            'Add --yes to confirm.',
          )
        const rl = createInterface({ input: process.stdin, output: process.stdout })
        const answer = await rl.question(
          `Remove ${name} from ${phone.name}? Its data is deleted and can't be brought back. (y/N) `,
        )
        rl.close()
        if (!/^y(es)?$/i.test(answer.trim())) return void info('Nothing removed.')
      }
      await call(phone, path(name), { method: 'DELETE', timeoutMs: 60_000 })
      if (opts.json) return out({ removed: name })
      return void ok(`Removed ${name}`)
    }

    default:
      throw new CliError('BAD_ARGS', `There's no "db ${action}".`, USAGE)
  }
}

function kindName(kind: DatabaseKind): string {
  return DATABASE_KINDS.find((k) => k.id === kind)?.name ?? kind
}
