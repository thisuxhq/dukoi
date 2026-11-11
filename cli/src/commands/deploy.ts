import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import {
  type DeployResult,
  HEADER,
  MANIFEST_PATH,
  pack,
  type ReleaseManifest,
  signRequest,
} from '@droidhost/shared'
import { readAppFolder } from '../app-folder.ts'
import { parseVerified, pickPhone, unreachable } from '../client.ts'
import { computerKey } from '../config.ts'
import { CliError, c, info, ok } from '../output.ts'

export const CLI_VERSION = '0.1.0'

const ALWAYS_IGNORE = ['.git', 'node_modules', '.DS_Store', '.droidhost', '.env', '.env.local']

/** Pure-JS swaps for common native modules. */
const NATIVE_ALTERNATIVES: Record<string, string> = {
  sharp: 'jimp (pure JS image processing)',
  bcrypt: 'bcryptjs',
  'better-sqlite3': 'node:sqlite (built into Node 24)',
  sqlite3: 'node:sqlite (built into Node 24)',
  canvas: '@napi-rs/canvas or do it in the browser',
  argon2: 'hash-wasm',
}

export interface DeployOptions {
  folder: string
  name?: string
  device?: string
  noHealthCheck: boolean
  json: boolean
}

export async function deploy(opts: DeployOptions): Promise<void> {
  const step = (msg: string) => !opts.json && ok(msg)
  const app = readAppFolder(opts.folder, { name: opts.name, noHealthCheck: opts.noHealthCheck })
  const phone = pickPhone(opts.device)
  const t0 = Date.now()

  if (app.build) {
    run('npm', ['run', 'build'], app.dir, opts.json)
    step('Built on this computer')
  }

  const staging = mkdtempSync(join(tmpdir(), 'droidhost-deploy-'))
  try {
    stage(app.dir, staging, app.ignore)
    if (app.hasDependencies) {
      run(
        'npm',
        [
          'install',
          '--omit=dev',
          '--ignore-scripts',
          '--no-audit',
          '--no-fund',
          '--loglevel=error',
        ],
        staging,
        opts.json,
      )
      checkNative(staging)
      step('Installed dependencies')
    }

    const files = countFiles(staging)
    const manifest: ReleaseManifest = {
      kind: app.kind,
      start: app.start,
      healthCheck: app.healthCheck,
      source: { files, bytes: 0, cli: CLI_VERSION },
    }
    mkdirSync(join(staging, '.droidhost'), { recursive: true })
    writeFileSync(join(staging, MANIFEST_PATH), JSON.stringify(manifest, null, 2))
    const packed = pack(staging)
    manifest.source.bytes = packed.bytes
    writeFileSync(join(staging, MANIFEST_PATH), JSON.stringify(manifest, null, 2))
    const upload = pack(staging).data
    step(`Packed ${app.name} (${size(upload.length)})`)

    const result = await send(phone, app.name, upload)
    step(`Uploaded to ${phone.name}`)
    step(`Started and healthy (release ${result.release})`)

    if (opts.json) {
      console.log(JSON.stringify({ ok: true, ...result, totalMs: Date.now() - t0 }))
      return
    }
    info('')
    info(`  ${c.dim('Local ')}  ${c.cyan(result.app.localUrl)}`)
    if (result.app.publicUrl) info(`  ${c.dim('Public')}  ${c.cyan(result.app.publicUrl)}`)
    info('')
    info(`  ${c.dim('Logs  ')}  droidhost logs ${app.name}`)
    if (!result.app.publicUrl) info(`  ${c.dim('Public')}  droidhost expose ${app.name}`)
    info(c.dim(`\n  Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`))
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

function stage(from: string, to: string, extraIgnore: string[]): void {
  const ignore = [...ALWAYS_IGNORE, ...extraIgnore]
  cpSync(from, to, {
    recursive: true,
    filter: (src) => {
      const rel = relative(from, src).split(sep).join('/')
      if (!rel) return true
      return !ignore.some((i) => rel === i || rel.startsWith(`${i}/`) || rel.split('/').includes(i))
    },
  })
}

function run(cmd: string, args: string[], cwd: string, quiet: boolean): void {
  const res = spawnSync(cmd, args, {
    cwd,
    stdio: quiet ? 'pipe' : ['ignore', 'ignore', 'inherit'],
    encoding: 'utf8',
  })
  if (res.error) {
    throw new CliError(
      'MISSING_TOOL',
      `Couldn't run ${cmd}: ${res.error.message}`,
      `Install Node.js (it includes ${cmd}).`,
    )
  }
  if (res.status !== 0) {
    throw new CliError(
      'COMMAND_FAILED',
      `\`${cmd} ${args.join(' ')}\` failed.`,
      quiet ? (res.stderr ?? '') : undefined,
    )
  }
}

/** Phones can't compile native modules, so catch them before uploading. */
function checkNative(staging: string): void {
  const modules = join(staging, 'node_modules')
  const found = new Set<string>()
  const walk = (dir: string, pkgName: string | null) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        const name = dir === modules || dir.endsWith(`${sep}node_modules`) ? entry.name : pkgName
        if (entry.name.startsWith('@') && dir.endsWith('node_modules')) walk(full, null)
        else walk(full, name?.startsWith('@') ? `${name}/${entry.name}` : name)
      } else if (pkgName && (entry.name === 'binding.gyp' || entry.name.endsWith('.node'))) {
        found.add(pkgName)
      }
    }
  }
  if (existsSync(modules)) walk(modules, null)
  if (found.size === 0) return
  const names = [...found]
  const tips = names
    .map((n) => `    ${n}  →  try ${NATIVE_ALTERNATIVES[n] ?? 'a pure JavaScript package'}`)
    .join('\n')
  throw new CliError(
    'NATIVE_MODULE',
    `${names.join(', ')} ${names.length === 1 ? 'uses' : 'use'} native code, which phones can't run yet.`,
    `Try instead:\n${tips}`,
  )
}

function countFiles(dir: string): number {
  return readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).length
}

async function send(
  phone: ReturnType<typeof pickPhone>,
  name: string,
  upload: Buffer,
): Promise<DeployResult> {
  const sha256 = createHash('sha256').update(upload).digest('hex')
  const path = `/apps/${encodeURIComponent(name)}/deploy?sha256=${sha256}`
  const headers = signRequest({ method: 'POST', path, body: '' }, computerKey())
  let res: Response
  try {
    res = await fetch(`http://${phone.host}:${phone.port}${path}`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/octet-stream' },
      body: upload,
      signal: AbortSignal.timeout(5 * 60 * 1000),
    })
  } catch (err) {
    throw unreachable(phone, err)
  }
  return parseVerified<DeployResult>(phone, res, await res.text(), headers[HEADER.nonce] as string)
}

const size = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`

export function readPackageName(folder: string): string | null {
  try {
    return (
      (JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')) as { name?: string }).name ??
      null
    )
  } catch {
    return null
  }
}
