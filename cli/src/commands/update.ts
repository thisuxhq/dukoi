// dukoi update: brings the CLI on this computer up to the latest release.
//
// Reads the latest version from dukoi.com/download/VERSION and, if it's newer,
// runs the same install script as the first install (D-119). That keeps one
// path for checksums, the dashboard, the templates and the agent skill.
// It never touches the phone: a new phone app is a new APK.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DUKOI_VERSION } from '@dukoi/shared'
import { installedPath } from '../installed.ts'
import { CliError, info, ok } from '../output.ts'

const SITE = 'https://dukoi.com'
const INSTALL_LINE = 'curl -fsSL https://dukoi.com/install | sh'

/** True when version a is later than b. Both look like 0.4.1. */
export function isNewer(a: string, b: string): boolean {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff > 0
  }
  return false
}

async function download(url: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  } catch {
    throw new CliError(
      'OFFLINE',
      `Couldn't reach ${new URL(url).host}.`,
      'Check your internet connection and try again.',
    )
  }
  if (!res.ok)
    throw new CliError(
      'UPDATE_UNAVAILABLE',
      `Couldn't read ${url} (${res.status}).`,
      `Try again in a minute, or run the install line: ${INSTALL_LINE}`,
    )
  return res.text()
}

export async function update(opts: { json: boolean }): Promise<void> {
  const dir = installedPath()
  if (!dir)
    throw new CliError(
      'NOT_INSTALLED',
      "This dukoi wasn't set up by the install script, so it can't update itself.",
      `Running from source? Use git pull. Otherwise install it: ${INSTALL_LINE}`,
    )

  const windows = process.platform === 'win32'
  // Left over from the last update on Windows, once nothing is running it
  if (windows) {
    try {
      rmSync(join(dir, 'dukoi-old.exe'), { force: true })
    } catch {}
  }

  const base = process.env.DUKOI_DOWNLOAD ?? `${SITE}/download`
  const latest = (await download(`${base}/VERSION`)).trim()
  if (!/^\d+\.\d+\.\d+$/.test(latest))
    throw new CliError(
      'UPDATE_UNAVAILABLE',
      `dukoi.com gave an odd latest version: "${latest.slice(0, 40)}".`,
      `Try again in a minute, or run the install line: ${INSTALL_LINE}`,
    )

  if (!isNewer(latest, DUKOI_VERSION)) {
    if (opts.json)
      return void console.log(JSON.stringify({ ok: true, updated: false, version: DUKOI_VERSION }))
    return void ok(`dukoi ${DUKOI_VERSION} is the latest`)
  }

  if (!opts.json) info(`→ Updating dukoi ${DUKOI_VERSION} to ${latest}`)
  const script = await download(`${SITE}/${windows ? 'install.ps1' : 'install'}`)
  const tmp = mkdtempSync(join(tmpdir(), 'dukoi-update-'))
  const file = join(tmp, windows ? 'install.ps1' : 'install.sh')
  writeFileSync(file, script)

  // Windows can't replace a program while it runs, but it can move it aside
  const old = join(dir, 'dukoi-old.exe')
  const moved = windows && existsSync(process.execPath)
  if (moved) renameSync(process.execPath, old)

  const [cmd, args] = windows
    ? ['powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file]]
    : ['sh', [file]]
  const run = spawnSync(cmd, args, {
    // In --json mode the installer's lines go to stderr, so stdout stays one JSON answer
    stdio: ['ignore', opts.json ? 2 : 'inherit', 'inherit'],
    env: { ...process.env, DUKOI_INSTALL: resolve(dir) },
  })
  rmSync(tmp, { recursive: true, force: true })

  if (run.status !== 0) {
    // Put the old program back if the installer didn't replace it
    if (moved && !existsSync(process.execPath)) renameSync(old, process.execPath)
    throw new CliError(
      'UPDATE_FAILED',
      run.error ? `Couldn't run the installer: ${run.error.message}` : 'The update failed.',
      `Your current dukoi still works. Try again, or run the install line: ${INSTALL_LINE}`,
    )
  }
  if (opts.json)
    console.log(JSON.stringify({ ok: true, updated: true, from: DUKOI_VERSION, version: latest }))
}
