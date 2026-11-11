// Turns an app folder into the archive a phone runs: build, copy, install
// production packages, check for native code, write the manifest, pack.
// Used by deploy and by scripts/pack-templates.ts for the phone's templates.
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { DUKOI_VERSION, MANIFEST_PATH, pack, type ReleaseManifest } from '@dukoi/shared'
import type { AppFolder } from './app-folder.ts'
import { CliError } from './output.ts'

export const CLI_VERSION = DUKOI_VERSION

const ALWAYS_IGNORE = ['.git', 'node_modules', '.DS_Store', '.dukoi', '.env', '.env.local']

/** Pure-JS swaps for common native modules. */
const NATIVE_ALTERNATIVES: Record<string, string> = {
  sharp: 'jimp (pure JS image processing)',
  bcrypt: 'bcryptjs',
  'better-sqlite3': 'node:sqlite (built into Node 24)',
  sqlite3: 'node:sqlite (built into Node 24)',
  canvas: '@napi-rs/canvas or do it in the browser',
  argon2: 'hash-wasm',
}

/** Packs the app. `step` reports progress; `quiet` hides npm's own output. */
export function packApp(app: AppFolder, step: (msg: string) => void, quiet = false): Buffer {
  if (app.build) {
    run('npm', ['run', 'build'], app.dir, quiet)
    step('Built on this computer')
  }

  const staging = mkdtempSync(join(tmpdir(), 'dukoi-deploy-'))
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
        quiet,
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
    mkdirSync(join(staging, '.dukoi'), { recursive: true })
    writeFileSync(join(staging, MANIFEST_PATH), JSON.stringify(manifest, null, 2))
    manifest.source.bytes = pack(staging).bytes
    writeFileSync(join(staging, MANIFEST_PATH), JSON.stringify(manifest, null, 2))
    const archive = pack(staging).data
    step(`Packed ${app.name} (${size(archive.length)})`)
    return archive
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

export const size = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`
