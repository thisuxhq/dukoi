import { afterAll, expect, test } from 'bun:test'
import { type ChildProcess, spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateKeyPair } from '@dukoi/shared'
import { Agent } from './agent.ts'
import type { Config } from './config.ts'

// A fake cloudflared prints a quick tunnel URL and keeps logging. The first
// agent runs in a child process and gets killed with SIGKILL, like a crash.
// The next agent should pick up the same cloudflared and keep its URL.

const home = mkdtempSync(join(tmpdir(), 'dukoi-tunnels-'))
const starts = join(home, 'starts')
const fake = join(home, 'cloudflared')
writeFileSync(
  fake,
  `#!/usr/bin/env node
const fs = require('node:fs')
fs.appendFileSync(${JSON.stringify(starts)}, process.pid + '\\n')
const n = fs.readFileSync(${JSON.stringify(starts)}, 'utf8').trim().split('\\n').length
console.log('INF |  https://fake-tunnel-' + n + '.trycloudflare.com  |')
setInterval(() => console.log('INF still connected'), 100)
`,
)
chmodSync(fake, 0o755)

const APP_PORT = 4999
writeFileSync(
  join(home, 'state.json'),
  JSON.stringify({
    identity: generateKeyPair(),
    computers: [],
    apps: [
      {
        name: 'site',
        port: APP_PORT,
        release: null,
        wanted: false,
        exposed: true,
        createdAt: new Date().toISOString(),
      },
    ],
  }),
)

const config = (adminPort: number): Config => ({
  home,
  adminPort,
  nodePath: process.execPath,
  cloudflaredPath: fake,
  cloudflareApi: 'http://127.0.0.1:9',
  templatesDir: '/nonexistent',
  phone: { name: 'test-phone', model: 'Test', android: '16' },
})

const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const savedApp = () =>
  (JSON.parse(readFileSync(join(home, 'state.json'), 'utf8')).apps as { publicUrl?: string }[])[0]

async function until<T>(check: () => T | undefined | null | false, ms = 10_000): Promise<T> {
  const deadline = Date.now() + ms
  for (;;) {
    const value = check()
    if (value) return value
    if (Date.now() > deadline) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 100))
  }
}

let first: ChildProcess | null = null
let second: Agent | null = null
const port = 18070 + Math.floor(Math.random() * 1000)

afterAll(async () => {
  first?.kill('SIGKILL')
  await second?.stop()
  for (const pid of existsSync(starts) ? readFileSync(starts, 'utf8').trim().split('\n') : []) {
    try {
      process.kill(Number(pid), 'SIGKILL')
    } catch {}
  }
  rmSync(home, { recursive: true, force: true })
})

test('a quick tunnel keeps its URL when the agent crashes and comes back', async () => {
  // The first agent, in its own process, starts the tunnel the saved state asks for.
  const script = `import { Agent } from ${JSON.stringify(join(import.meta.dir, 'agent.ts'))}
await new Agent(${JSON.stringify(config(port))}).start()`
  first = spawn(process.execPath, ['-e', script], { stdio: 'ignore' })
  const url = await until(() => savedApp()?.publicUrl)
  expect(url).toBe('https://fake-tunnel-1.trycloudflare.com')
  const pid = Number(readFileSync(starts, 'utf8').trim())

  // The agent crashes. cloudflared has no pipe back to it, so it keeps running.
  first.kill('SIGKILL')
  await until(() => first?.exitCode !== null || first?.signalCode !== null)
  await new Promise((r) => setTimeout(r, 300))
  expect(isAlive(pid)).toBe(true)

  // The next agent picks it up, with the same URL, and starts no new cloudflared.
  second = new Agent(config(port + 1))
  await second.start()
  const apps = (await (await fetch(`http://127.0.0.1:${port + 1}/local/apps`)).json()) as {
    publicUrl: string | null
  }[]
  expect(apps[0]?.publicUrl).toBe(url)
  expect(readFileSync(starts, 'utf8').trim().split('\n')).toHaveLength(1)

  // Making it private stops that cloudflared and forgets the URL.
  await second.tunnels.unexpose('site')
  await until(() => !isAlive(pid))
  expect(savedApp()?.publicUrl).toBeUndefined()
}, 30_000)
