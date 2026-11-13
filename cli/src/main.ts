#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { DUKOI_VERSION, PROTOCOL_VERSION } from '@dukoi/shared'
import { control, releases, remove, rollback } from './commands/apps.ts'
import { bench } from './commands/bench.ts'
import { dashboard } from './commands/dashboard.ts'
import { deploy } from './commands/deploy.ts'
import { env } from './commands/env.ts'
import { expose } from './commands/expose.ts'
import { init } from './commands/init.ts'
import { logs, ps, status } from './commands/observe.ts'
import { devices, pair, unpair } from './commands/pair.ts'
import { skill } from './commands/skill.ts'
import { update } from './commands/update.ts'
import { CliError, c, printError } from './output.ts'

const HELP = `${c.bold('dukoi')} — deploy real apps to old Android phones

${c.bold('Usage')}
  dukoi <command> [options]

${c.bold('Pairing')}
  pair                 Find a phone on this Wi-Fi and link it to this computer
  devices              List paired phones
  unpair [phone]       Forget a phone

${c.bold('Apps')}
  init [template]      Start from a template and deploy it (lists them if you leave it out)
  deploy [folder]      Ship an app to the phone (default: this folder)
  start [app]          Start an app
  stop [app]           Stop an app (it stays stopped after a reboot)
  restart [app]        Restart an app
  releases [app]       List the last 5 releases
  rollback [app]       Go back to the previous release (--to <id> for another)
  remove [app]         Delete an app from the phone (asks first; --yes to skip)
  expose [app]         Give an app a public HTTPS URL (--domain api.example.com for
                       one that never changes, --off to remove it)
  env set KEY=value    Save a setting on the phone, like a bot token (also: env list,
                       env unset KEY; --app picks the app)

${c.bold('Watching')}
  ps                   All apps: status, CPU, memory, uptime, URL
  logs [app]           Recent lines, then live (--lines 200, --no-follow)
  status               Phone health: memory, storage, uptime
  dashboard            Open the web dashboard on this computer (--no-open to skip the browser)
  bench                How fast is this phone? About 13 minutes (--quick for 3, --share to
                       compare it with other phones on dukoi.com/bench)

${c.bold('AI agents')}
  skill                Teach Claude Code, Codex, Cursor and other coding agents on this
                       computer to use Dukoi (--off to remove it)

${c.bold('This computer')}
  update               Update the dukoi command to the latest release

${c.bold('Options')}
  --device <name>      Which phone (default: the last one used)
  --host <ip[:port]>   Skip Wi-Fi discovery and use this address
  --json               Machine-readable output
  -h, --help           Show help
  -v, --version        Show the version

${c.bold('Examples')}
  dukoi init
  dukoi pair
  dukoi deploy
  dukoi expose
  dukoi expose --domain api.example.com
  dukoi rollback my-api
`

async function main(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      device: { type: 'string' },
      app: { type: 'string' },
      host: { type: 'string' },
      name: { type: 'string' },
      to: { type: 'string' },
      off: { type: 'boolean', default: false },
      domain: { type: 'string' },
      lines: { type: 'string' },
      'no-follow': { type: 'boolean', default: false },
      'no-open': { type: 'boolean', default: false },
      quiet: { type: 'boolean', default: false },
      quick: { type: 'boolean', default: false },
      share: { type: 'boolean', default: false },
      yes: { type: 'boolean', default: false },
      'no-health-check': { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
  })
  const json = values.json ?? false
  const [command, arg] = positionals

  if (values.version)
    return void console.log(`dukoi ${DUKOI_VERSION} (protocol ${PROTOCOL_VERSION})`)
  if (values.help || !command || command === 'help') return void console.log(HELP)

  switch (command) {
    case 'pair':
      return pair({ host: values.host, name: values.name, json })
    case 'devices':
      return devices(json)
    case 'unpair':
      return unpair(arg ?? values.device, json)
    case 'init':
      return init({ template: arg, device: values.device })
    case 'env':
      return env(arg, positionals.slice(2), { app: values.app, device: values.device, json })
    case 'deploy':
      await deploy({
        folder: arg ?? '.',
        name: values.name,
        device: values.device,
        noHealthCheck: values['no-health-check'] ?? false,
        json,
      })
      return
    case 'start':
    case 'stop':
    case 'restart':
      return control(command, arg, values.device, json)
    case 'rollback':
      return rollback(arg, values.to, values.device, json)
    case 'ps':
      return ps(values.device, json)
    case 'status':
      return status(values.device, json)
    case 'logs':
      return logs({
        app: arg,
        lines: Number(values.lines ?? 100),
        follow: !(values['no-follow'] ?? false) && process.stdout.isTTY === true,
        device: values.device,
        json,
      })
    case 'expose':
      return expose({
        app: arg,
        off: values.off ?? false,
        domain: values.domain,
        device: values.device,
        json,
      })
    case 'bench':
      await bench({
        device: values.device,
        quick: values.quick ?? false,
        share: values.share ?? false,
        json,
      })
      return
    case 'dashboard':
      return dashboard({ device: values.device, open: !(values['no-open'] ?? false) })
    case 'skill':
      return skill({ off: values.off ?? false, quiet: values.quiet ?? false, json })
    case 'update':
      return update({ json })
    case 'releases':
      return releases(arg, values.device, json)
    case 'remove':
      return remove(arg, values.yes ?? false, values.device, json)
    default:
      throw new CliError(
        'UNKNOWN_COMMAND',
        `There's no "${command}" command.`,
        'Run `dukoi --help` to see them all.',
      )
  }
}

main(process.argv.slice(2)).catch((err) => {
  const json = process.argv.includes('--json')
  if (err instanceof TypeError && 'code' in err && String(err.code).startsWith('ERR_PARSE_ARGS')) {
    printError(new CliError('BAD_ARGS', err.message, 'Run `dukoi --help`.'), json)
    process.exit(2)
  }
  printError(err, json)
  process.exit(1)
})
