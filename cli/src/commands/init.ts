// droidhost init: start from a template. Makes the folder, then deploys it
// when this computer is paired, so there's a live URL straight away.
import { cpSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { TEMPLATES, type TemplateInfo } from '@droidhost/shared'
import { loadPhones } from '../config.ts'
import { CliError, c, info, ok } from '../output.ts'
import { deploy } from './deploy.ts'
import { setEnv } from './env.ts'

export interface InitOptions {
  template?: string
  device?: string
}

export async function init(opts: InitOptions): Promise<void> {
  const template = opts.template ? find(opts.template) : await pick()
  const folder = template.id
  const dir = resolve(folder)
  if (existsSync(dir))
    throw new CliError(
      'FOLDER_EXISTS',
      `There's already a folder called ${folder} here.`,
      'Run init somewhere else, or remove that folder.',
    )

  cpSync(source(template.id), dir, {
    recursive: true,
    filter: (src) => !src.split(/[\\/]/).includes('node_modules'),
  })
  ok(`Created ${folder}/`)

  const makeItYours = `Make it yours: edit ${folder}/${template.edit}, then run ${c.cyan('droidhost deploy')}`
  if (loadPhones().phones.length === 0) {
    info(
      `\n  Next: ${c.cyan('npx droidhost pair')}, then ${c.cyan(`cd ${folder} && npx droidhost deploy`)}`,
    )
    return
  }

  const secret = template.secret ? await ask(template.secret) : null
  await deploy({ folder, device: opts.device, noHealthCheck: false, json: false, next: [] })
  if (template.secret && secret) {
    await setEnv(template.id, { set: { [template.secret]: secret } }, opts.device)
    ok(`Saved ${template.secret} on the phone`)
    info('')
  }
  info(`  ${makeItYours}`)
}

function find(id: string): TemplateInfo {
  const template = TEMPLATES.find((t) => t.id === id)
  if (!template)
    throw new CliError(
      'NO_SUCH_TEMPLATE',
      `There's no template called "${id}".`,
      `Pick one: ${TEMPLATES.map((t) => t.id).join(', ')}`,
    )
  return template
}

/** The numbered list. */
async function pick(): Promise<TemplateInfo> {
  if (!process.stdin.isTTY)
    throw new CliError(
      'WHICH_TEMPLATE',
      'Which template?',
      `Name one: droidhost init ${TEMPLATES[1]?.id}. Templates: ${TEMPLATES.map((t) => t.id).join(', ')}`,
    )
  info('Pick a template:')
  TEMPLATES.forEach((t, i) => {
    info(`  ${c.dim(String(i + 1))}  ${t.id.padEnd(14)} ${c.dim(t.description)}`)
  })
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    for (;;) {
      const answer = (await rl.question(`Number (1-${TEMPLATES.length}): `)).trim()
      const template = TEMPLATES[Number(answer) - 1] ?? TEMPLATES.find((t) => t.id === answer)
      if (template) return template
    }
  } finally {
    rl.close()
  }
}

/** A template's setting, like the bot token. Kept on the phone, never in the folder. */
async function ask(name: string): Promise<string | null> {
  if (!process.stdin.isTTY) {
    info(c.dim(`  Set ${name} later: droidhost env set ${name}=<value>`))
    return null
  }
  const where =
    name === 'TELEGRAM_BOT_TOKEN' ? ' (message @BotFather on Telegram, send /newbot)' : ''
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const value = (await rl.question(`Paste your ${name}${where}: `)).trim()
    return value || null
  } finally {
    rl.close()
  }
}

/** The template folders: next to the bundled CLI, or in the repo when running from source. */
function source(id: string): string {
  const candidates = [
    fileURLToPath(new URL(`./starters/${id}`, import.meta.url)),
    fileURLToPath(new URL(`../../../starters/${id}`, import.meta.url)),
  ]
  const found = candidates.find((dir) => existsSync(join(dir, 'README.md')))
  if (!found)
    throw new CliError(
      'NO_TEMPLATES',
      `This copy of the CLI is missing the ${id} template.`,
      'Reinstall it: npm i -g droidhost',
    )
  return found
}
