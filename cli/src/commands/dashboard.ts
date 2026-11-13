// dukoi dashboard: the web dashboard, on this computer only.
//
// Starts the dashboard's server (a SvelteKit app in dashboard/) on 127.0.0.1.
// Its remote functions call the phone with this computer's key, exactly like
// the other commands, so there's no second pairing and the browser never
// holds a key.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import { pickPhone } from '../client.ts'
import { installedPath } from '../installed.ts'
import { CliError, info } from '../output.ts'

export const DASHBOARD_PORT = 7071

export interface DashboardOptions {
  device?: string
  open: boolean
}

export async function dashboard(opts: DashboardOptions): Promise<void> {
  // Fails early, in plain words, if this computer isn't paired yet.
  const phone = pickPhone(opts.device)
  const entry = serverEntry()
  const port = await freePort()
  const url = `http://127.0.0.1:${port}`

  const server = spawn(process.execPath, [entry], {
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      DUKOI_DEVICE: phone.name,
      // The standalone CLI is a Bun program: this makes it run the server file
      // like `bun index.js`. Node ignores it.
      BUN_BE_BUN: '1',
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  // Stop at once. A polite stop waits for open tabs to hang up, because their
  // live updates never finish, and under Bun that wait has no time limit. The
  // server keeps nothing, so there's nothing to lose.
  const stop = () => server.kill('SIGKILL')
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)

  await waitUntilUp(url, server)
  info(`Dashboard for ${phone.name}: ${url}`)
  info('Only this computer can open it. Press Ctrl+C to stop.')
  if (opts.open) openBrowser(url)

  const code = await new Promise<number | null>((resolve) => server.on('exit', resolve))
  if (code && code !== 0) {
    throw new CliError('DASHBOARD_STOPPED', `The dashboard stopped (exit code ${code}).`)
  }
}

/** The built server: in ~/.dukoi, next to the bundled CLI, or in the repo when running from source. */
function serverEntry(): string {
  const candidates = [
    installedPath('dashboard', 'index.js'),
    fileURLToPath(new URL('./dashboard/index.js', import.meta.url)),
    fileURLToPath(new URL('../../../dashboard/build/index.js', import.meta.url)),
  ]
  const found = candidates.find((file): file is string => !!file && existsSync(file))
  if (!found) {
    throw new CliError(
      'NO_DASHBOARD',
      'The dashboard hasn’t been built.',
      'Run `bun run --filter @dukoi/dashboard build`, then try again.',
    )
  }
  return found
}

/** 7071, or the next free port after it. */
async function freePort(): Promise<number> {
  for (let port = DASHBOARD_PORT; port < DASHBOARD_PORT + 10; port++) {
    const free = await new Promise<boolean>((resolve) => {
      const probe = createServer()
      probe.once('error', () => resolve(false))
      probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)))
    })
    if (free) return port
  }
  throw new CliError(
    'PORT_BUSY',
    `Ports ${DASHBOARD_PORT} to ${DASHBOARD_PORT + 9} are all in use.`,
    'Close another dashboard, then try again.',
  )
}

async function waitUntilUp(url: string, server: ReturnType<typeof spawn>): Promise<void> {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) break
    const up = await fetch(url, { signal: AbortSignal.timeout(1000) }).then(
      () => true,
      () => false,
    )
    if (up) return
    await new Promise((r) => setTimeout(r, 200))
  }
  server.kill()
  throw new CliError(
    'DASHBOARD_START',
    'The dashboard didn’t start.',
    'Try again, or check the output above.',
  )
}

function openBrowser(url: string): void {
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]]
  spawn(command, args as string[], { stdio: 'ignore', detached: true })
    .on('error', () => {})
    .unref()
}
