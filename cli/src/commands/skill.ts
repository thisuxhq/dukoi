// dukoi skill: teaches the coding agents on this computer how to use Dukoi.
//
// Copies skills/dukoi/SKILL.md into the skills folder of each agent that's
// installed (we look for its home folder), so "deploy this to my phone" just
// works in Claude Code, Codex, Cursor and the rest. The install script runs it
// after every install, so the skill always matches the CLI. The same skill is
// on skills.sh: npx skills add thisuxhq/dukoi
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { installedPath } from '../installed.ts'
import { CliError, info, ok } from '../output.ts'

const SKILL = 'dukoi'

interface Agent {
  name: string
  /** Installed if this folder exists */
  home: string
  /** Where it reads global skills */
  skills: string
}

/** Agents and where they read skills, from the skills CLI's list (vercel-labs/skills). */
export function agents(home = homedir(), env = process.env): Agent[] {
  const config = env.XDG_CONFIG_HOME || join(home, '.config')
  const shared = join(home, '.agents', 'skills')
  return [
    { name: 'Claude Code', home: join(home, '.claude'), skills: join(home, '.claude', 'skills') },
    // Codex reads the shared folder, and so does anything installed by `npx skills`
    { name: 'Codex', home: join(home, '.codex'), skills: shared },
    { name: 'Cursor', home: join(home, '.cursor'), skills: join(home, '.cursor', 'skills') },
    { name: 'Gemini CLI', home: join(home, '.gemini'), skills: join(home, '.gemini', 'skills') },
    {
      name: 'OpenCode',
      home: join(config, 'opencode'),
      skills: join(config, 'opencode', 'skills'),
    },
    { name: 'Other agents', home: join(home, '.agents'), skills: shared },
  ]
}

export interface SkillOptions {
  off: boolean
  /** For the install script: print one line, or nothing when no agent is found */
  quiet: boolean
  json: boolean
}

export function skill(opts: SkillOptions, home = homedir()): void {
  const found = agents(home).filter((a) => existsSync(a.home))
  const folders = [...new Set(found.map((a) => join(a.skills, SKILL)))]
  const names = found.map((a) => a.name).filter((n) => n !== 'Other agents')

  if (opts.off) {
    for (const dir of folders) rmSync(dir, { recursive: true, force: true })
    if (opts.json) return void console.log(JSON.stringify({ ok: true, removed: folders }))
    return void ok('Removed the Dukoi skill')
  }

  if (folders.length === 0) {
    if (opts.json) return void console.log(JSON.stringify({ ok: true, agents: [], folders: [] }))
    if (opts.quiet) return
    throw new CliError(
      'NO_AGENTS',
      "Couldn't find a coding agent on this computer.",
      'Install one with the skills CLI instead: npx skills add thisuxhq/dukoi',
    )
  }

  const text = readFileSync(skillFile(), 'utf8')
  for (const dir of folders) {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'SKILL.md'), text)
  }

  if (opts.json) return void console.log(JSON.stringify({ ok: true, agents: names, folders }))
  const who = names.length > 0 ? list(names) : 'your coding agents'
  if (opts.quiet) return void info(`  Taught ${who} to use Dukoi`)
  ok(`Taught ${who} to use Dukoi`)
  info('\n  Ask your agent: "Build a notes API and deploy it to my phone"')
}

/** "Claude Code, Codex and Cursor" */
const list = (names: string[]) =>
  names.length === 1 ? (names[0] as string) : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`

/** In ~/.dukoi, next to the bundled CLI, or in the repo when running from source. */
function skillFile(): string {
  const candidates = [
    installedPath('skills', SKILL, 'SKILL.md'),
    fileURLToPath(new URL(`./skills/${SKILL}/SKILL.md`, import.meta.url)),
    fileURLToPath(new URL(`../../../skills/${SKILL}/SKILL.md`, import.meta.url)),
  ]
  const file = candidates.find((f): f is string => f !== null && existsSync(f))
  if (!file) {
    throw new CliError(
      'NO_SKILL',
      "This copy of dukoi doesn't include the skill.",
      'Install it again: curl -fsSL https://dukoi.com/install | sh',
    )
  }
  return file
}
