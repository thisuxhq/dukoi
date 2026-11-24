import { spawn } from 'node:child_process'
import type { AppAuthResult, DomainStatus, ExposeResult } from '@dukoi/shared'
import { call, pickPhone } from '../client.ts'
import { CliError, c, info, ok } from '../output.ts'
import { appName } from './apps.ts'

export interface ExposeOptions {
  app?: string
  off: boolean
  domain?: string
  auth: boolean
  noAuth: boolean
  rotate: boolean
  device?: string
  json: boolean
}

type Phone = ReturnType<typeof pickPhone>

const LOGIN_WAIT_MS = 10 * 60 * 1000

export async function expose(opts: ExposeOptions): Promise<void> {
  if (opts.auth && opts.noAuth) {
    throw new CliError('BAD_ARGS', 'Use either --auth or --no-auth, not both.')
  }
  const name = appName(opts.app)
  const phone = pickPhone(opts.device)
  const basePath = `/apps/${encodeURIComponent(name)}`
  const path = `${basePath}/expose`

  if (opts.off) {
    await call(phone, path, { method: 'DELETE', timeoutMs: 45_000 })
    if (opts.json) return void console.log(JSON.stringify({ ok: true, app: name, publicUrl: null }))
    return void ok(`${name} has no public URL now`)
  }

  if (opts.noAuth && !opts.domain) {
    await call<AppAuthResult>(phone, `${basePath}/auth`, { method: 'DELETE' })
    if (opts.json) return void console.log(JSON.stringify({ ok: true, app: name, auth: false }))
    return void ok(`Private access turned off for ${name}`)
  }

  // Turn on auth *before* starting the tunnel so the app is never exposed unprotected.
  let authResult: AppAuthResult | null = null
  if (opts.auth || opts.rotate) {
    authResult = await call<AppAuthResult>(phone, `${basePath}/auth`, {
      method: 'POST',
      body: { rotate: opts.rotate },
    })
  } else if (opts.noAuth) {
    await call<AppAuthResult>(phone, `${basePath}/auth`, { method: 'DELETE' })
  }

  if (opts.domain) return exposeDomain(phone, name, opts.domain, authResult, opts.json)

  if (!opts.json) info('Asking Cloudflare for a public URL…')
  const result = await call<ExposeResult>(phone, path, { method: 'POST', timeoutMs: 45_000 })
  const loginUrl = authResult?.token
    ? `${result.publicUrl}/_dukoi/auth?token=${encodeURIComponent(authResult.token)}`
    : null

  if (opts.json) {
    return void console.log(
      JSON.stringify({
        ok: true,
        ...result,
        ...(authResult ? { auth: authResult.auth, token: authResult.token, loginUrl } : {}),
      }),
    )
  }

  ok(authResult?.auth ? `${name} is public (private access on)` : `${name} is public`)
  info(`\n  ${c.dim('Public')}   ${c.cyan(result.publicUrl)}`)
  if (authResult?.token && loginUrl) {
    info(`  ${c.dim('Sign in')}  ${c.cyan(loginUrl)}`)
    info(`  ${c.dim('Token')}    ${authResult.token}`)
    info(
      c.dim(
        '\n  Open the sign-in link in a browser, or pass Authorization: Bearer <token>. Turn off with `dukoi expose --no-auth`.',
      ),
    )
  } else {
    info('')
  }
  info(
    c.dim(
      '  Quick tunnel URLs change if the tunnel restarts. For one that never changes: dukoi expose --domain api.example.com',
    ),
  )
}

/**
 * A custom domain. The first time, the phone isn't connected to Cloudflare, so
 * this opens Cloudflare's login in the browser, waits for the phone to get its
 * certificate, then carries on.
 */
async function exposeDomain(
  phone: Phone,
  name: string,
  hostname: string,
  authResult: AppAuthResult | null,
  json: boolean,
): Promise<void> {
  const add = () =>
    call<ExposeResult>(phone, `/apps/${encodeURIComponent(name)}/domain`, {
      method: 'POST',
      body: { hostname },
      timeoutMs: 60_000,
    })

  let result: ExposeResult
  try {
    if (!json) info(`Pointing ${hostname} at ${name}…`)
    result = await add()
  } catch (err) {
    if (!(err instanceof CliError) || err.code !== 'NEEDS_LOGIN') throw err
    await connectToCloudflare(phone, hostname, json)
    if (!json) info(`Pointing ${hostname} at ${name}…`)
    result = await add()
  }

  const loginUrl = authResult?.token
    ? `${result.publicUrl}/_dukoi/auth?token=${encodeURIComponent(authResult.token)}`
    : null

  if (json) {
    return void console.log(
      JSON.stringify({
        ok: true,
        ...result,
        ...(authResult ? { auth: authResult.auth, token: authResult.token, loginUrl } : {}),
      }),
    )
  }
  ok(authResult?.auth ? `${name} is public (private access on)` : `${name} is public`)
  info(`\n  ${c.dim('Public')}   ${c.cyan(result.publicUrl)}`)
  if (authResult?.token && loginUrl) {
    info(`  ${c.dim('Sign in')}  ${c.cyan(loginUrl)}`)
    info(`  ${c.dim('Token')}    ${authResult.token}`)
    info(
      c.dim(
        '\n  Open the sign-in link in a browser, or pass Authorization: Bearer <token>. Turn off with `dukoi expose --no-auth`.',
      ),
    )
  } else {
    info('')
  }
  info(c.dim('  This URL stays the same across restarts and reboots.'))
}

async function connectToCloudflare(phone: Phone, hostname: string, json: boolean): Promise<void> {
  const started = await call<DomainStatus>(phone, '/domain/login', {
    method: 'POST',
    timeoutMs: 30_000,
  })
  if (started.loggedIn) return
  const url = started.loginUrl ?? ''
  const zone = hostname.split('.').slice(-2).join('.')
  if (!json) {
    info(
      `\nConnect the phone to Cloudflare. In the page that opens, pick ${c.bold(zone)} and click Authorize.`,
    )
    info(c.dim(`  If it doesn't open: ${url}\n`))
  }
  openBrowser(url)

  const deadline = Date.now() + LOGIN_WAIT_MS
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000))
    const status = await call<DomainStatus>(phone, '/domain').catch(() => null)
    if (status?.loggedIn) {
      if (!json) ok(`Phone connected to ${status.zone ?? 'Cloudflare'}`)
      return
    }
  }
  throw new CliError(
    'LOGIN_TIMEOUT',
    'Cloudflare login wasn’t finished within 10 minutes.',
    `Run \`dukoi expose --domain ${hostname}\` again.`,
  )
}

/** Opens a URL in the default browser. If it can't, the URL is already printed. */
function openBrowser(url: string): void {
  const [cmd, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]]
  try {
    spawn(cmd as string, args as string[], { detached: true, stdio: 'ignore' }).unref()
  } catch {}
}
