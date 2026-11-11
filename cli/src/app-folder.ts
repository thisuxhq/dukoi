// Works out what's in an app folder: its name, kind and how to start it.
import { existsSync, readFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { APP_NAME_PATTERN } from '@droidhost/shared'
import { CliError } from './output.ts'

export interface AppFolder {
  dir: string
  name: string
  kind: 'node' | 'static'
  /** Arguments to node (node apps) or the folder to serve (static) */
  start: string[]
  healthCheck: string | null
  build: boolean
  hasDependencies: boolean
  ignore: string[]
}

interface PackageJson {
  name?: string
  main?: string
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
}

/** Optional droidhost.json, only to override a guess */
interface Overrides {
  name?: string
  start?: string
  healthCheck?: string | false
  ignore?: string[]
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return null
  }
}

export function toAppName(raw: string): string {
  return raw
    .replace(/^@[^/]+\//, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

export function readAppFolder(
  folder: string,
  opts: { name?: string; noHealthCheck?: boolean } = {},
): AppFolder {
  const dir = resolve(folder)
  if (!existsSync(dir)) throw new CliError('NO_FOLDER', `There's no folder at ${dir}.`)
  const pkg = readJson<PackageJson>(join(dir, 'package.json'))
  const overrides = readJson<Overrides>(join(dir, 'droidhost.json')) ?? {}

  const name = toAppName(opts.name ?? overrides.name ?? pkg?.name ?? basename(dir))
  if (!APP_NAME_PATTERN.test(name)) {
    throw new CliError(
      'BAD_NAME',
      `Couldn't make a valid app name from "${basename(dir)}".`,
      'Pass one: droidhost deploy --name my-api',
    )
  }

  const healthCheck =
    opts.noHealthCheck || overrides.healthCheck === false ? null : (overrides.healthCheck ?? '/')
  const ignore = overrides.ignore ?? []

  if (!pkg) {
    if (existsSync(join(dir, 'index.html'))) {
      return {
        dir,
        name,
        kind: 'static',
        start: ['.'],
        healthCheck: '/',
        build: false,
        hasDependencies: false,
        ignore,
      }
    }
    throw new CliError(
      'NOT_AN_APP',
      `${dir} has no package.json or index.html.`,
      'Run this in your app folder, or start from a starter: droidhost deploy starters/hono-api',
    )
  }

  return {
    dir,
    name,
    kind: 'node',
    start: startArgs(dir, pkg, overrides.start),
    healthCheck,
    build: Boolean(pkg.scripts?.build),
    hasDependencies: Object.keys(pkg.dependencies ?? {}).length > 0,
    ignore,
  }
}

/** Turns "node server.js --flag" (or main, or index.js) into node arguments. */
function startArgs(dir: string, pkg: PackageJson, override?: string): string[] {
  const command = override ?? pkg.scripts?.start
  if (command) {
    const parts = command.trim().split(/\s+/)
    if (parts[0] === 'node') return parts.slice(1)
    throw new CliError(
      'NO_START',
      `Your start script runs "${parts[0]}", but the phone can only run Node directly.`,
      'Make scripts.start "node <file>.js" (build TypeScript first), or set "start" in droidhost.json.',
    )
  }
  for (const file of [pkg.main, 'index.js', 'server.js', 'src/index.js']) {
    if (file && existsSync(join(dir, file))) return [file]
  }
  throw new CliError(
    'NO_START',
    'Couldn’t find how to start your app.',
    'Add "start": "node server.js" to scripts in package.json.',
  )
}
