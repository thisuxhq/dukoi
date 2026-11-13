import { afterAll, beforeAll, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type AppInfo,
  type DeployResult,
  type EnvNames,
  MANIFEST_PATH,
  pack,
  type ReleaseManifest,
  type TemplateInfo,
} from '@dukoi/shared'
import { Agent } from './agent.ts'

const home = mkdtempSync(join(tmpdir(), 'dukoi-templates-'))
const templatesDir = join(home, 'bundled')
const port = 18070 + Math.floor(Math.random() * 1000)
const agent = new Agent({
  home,
  adminPort: port,
  nodePath: process.execPath,
  cloudflaredPath: null,
  valkeyPath: null,
  postgresScript: null,
  cloudflareApi: 'http://127.0.0.1:9',
  templatesDir,
  phone: { name: 'test-phone', model: 'Test', android: '16' },
})
const base = `http://127.0.0.1:${port}`

/** A template archive, packed the way scripts/pack-templates.ts does it. */
function bundle(
  id: string,
  files: Record<string, string>,
  manifest: Omit<ReleaseManifest, 'source'>,
) {
  const dir = join(home, 'src', id)
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true })
    writeFileSync(join(dir, name), text)
  }
  mkdirSync(join(dir, '.dukoi'), { recursive: true })
  const full: ReleaseManifest = { ...manifest, source: { files: 1, bytes: 0, cli: 'test' } }
  writeFileSync(join(dir, MANIFEST_PATH), JSON.stringify(full))
  writeFileSync(join(templatesDir, `${id}.tgz`), pack(dir).data)
}

const post = (path: string, body: unknown) =>
  fetch(`${base}${path}`, { method: 'POST', body: JSON.stringify(body) })
const put = (path: string, body: unknown) =>
  fetch(`${base}${path}`, { method: 'PUT', body: JSON.stringify(body) })

beforeAll(async () => {
  mkdirSync(templatesDir, { recursive: true })
  bundle(
    'notes-api',
    {
      'server.js':
        "require('node:http').createServer((q, r) => r.end('<h1>Hi</h1>')).listen(process.env.PORT)",
    },
    { kind: 'node', start: ['server.js'], healthCheck: '/' },
  )
  // Prints its setting, so the test can see what the app was started with.
  bundle(
    'telegram-bot',
    {
      'bot.js':
        "console.log('token=' + process.env.TELEGRAM_BOT_TOKEN); setInterval(() => {}, 1e9)",
    },
    { kind: 'node', start: ['bot.js'], healthCheck: null },
  )
  await agent.start()
})
afterAll(async () => {
  await agent.stop()
  rmSync(home, { recursive: true, force: true })
})

test('the phone lists only the templates it has archives for', async () => {
  const list = (await (await fetch(`${base}/local/templates`)).json()) as TemplateInfo[]
  expect(list.map((t) => t.id)).toEqual(['notes-api', 'telegram-bot'])
  expect(list[1]?.secret).toBe('TELEGRAM_BOT_TOKEN')
  // Paired computers can too (the dashboard), but only with a signed request.
  expect((await fetch(`${base}/templates`)).status).toBe(401)
})

test('Try a template deploys it and remembers where it came from', async () => {
  const res = await post('/local/templates/notes-api/deploy', {})
  expect(res.status).toBe(200)
  const result = (await res.json()) as DeployResult
  expect(result.app.name).toBe('notes-api')
  expect(result.app.template).toBe('notes-api')
  const page = await fetch(`http://127.0.0.1:${result.app.port}/`)
  expect(await page.text()).toContain('<h1>Hi</h1>')
})

test('a template that needs a setting refuses to deploy without it', async () => {
  const res = await post('/local/templates/telegram-bot/deploy', {})
  expect(res.status).toBe(400)
  expect(((await res.json()) as { code: string }).code).toBe('NEEDS_SETTING')
  // No empty app left behind.
  const apps = (await (await fetch(`${base}/local/apps`)).json()) as AppInfo[]
  expect(apps.map((a) => a.name)).toEqual(['notes-api'])
})

test('settings reach the app, and only their names come back', async () => {
  const res = await post('/local/templates/telegram-bot/deploy', {
    env: { TELEGRAM_BOT_TOKEN: 'first' },
  })
  expect(res.status).toBe(200)
  const names = (await (await fetch(`${base}/local/apps/telegram-bot/env`)).json()) as EnvNames
  expect(names).toEqual({ names: ['TELEGRAM_BOT_TOKEN'] })

  // Changing a setting restarts the app with the new value.
  const changed = await put('/local/apps/telegram-bot/env', {
    set: { TELEGRAM_BOT_TOKEN: 'second' },
  })
  expect(JSON.stringify(await changed.json())).not.toContain('second')
  await Bun.sleep(500)
  const log = (await agent.apps.logFile('telegram-bot')).tail(20).join('\n')
  expect(log).toContain('token=first')
  expect(log).toContain('token=second')
})

test('a setting name has to look like one', async () => {
  const res = await put('/local/apps/telegram-bot/env', { set: { 'bad name': 'x' } })
  expect(res.status).toBe(400)
  expect(((await res.json()) as { code: string }).code).toBe('BAD_SETTING')
})
