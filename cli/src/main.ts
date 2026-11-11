#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { PROTOCOL_VERSION } from '@droidhost/shared'
import { devices, pair, unpair } from './commands/pair.ts'
import { CliError, c, printError } from './output.ts'

const VERSION = '0.1.0'

const HELP = `${c.bold('droidhost')} — deploy real apps to old Android phones

${c.bold('Usage')}
  droidhost <command> [options]

${c.bold('Pairing')}
  pair                 Find a phone on this Wi-Fi and link it to this computer
  devices              List paired phones
  unpair [phone]       Forget a phone

${c.bold('Options')}
  --device <name>      Which phone (default: the last one used)
  --host <ip[:port]>   Skip Wi-Fi discovery and use this address
  --json               Machine-readable output
  -h, --help           Show help
  -v, --version        Show the version

${c.bold('Example')}
  droidhost pair
`

async function main(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      device: { type: 'string' },
      host: { type: 'string' },
      name: { type: 'string' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
  })
  const json = values.json ?? false
  const [command, arg] = positionals

  if (values.version) return void console.log(`droidhost ${VERSION} (protocol ${PROTOCOL_VERSION})`)
  if (values.help || !command || command === 'help') return void console.log(HELP)

  switch (command) {
    case 'pair':
      return pair({ host: values.host, name: values.name, json })
    case 'devices':
      return devices(json)
    case 'unpair':
      return unpair(arg ?? values.device, json)
    default:
      throw new CliError(
        'UNKNOWN_COMMAND',
        `There's no "${command}" command.`,
        'Run `droidhost --help` to see them all.',
      )
  }
}

main(process.argv.slice(2)).catch((err) => {
  const json = process.argv.includes('--json')
  if (err instanceof TypeError && 'code' in err && String(err.code).startsWith('ERR_PARSE_ARGS')) {
    printError(new CliError('BAD_ARGS', err.message, 'Run `droidhost --help`.'), json)
    process.exit(2)
  }
  printError(err, json)
  process.exit(1)
})
