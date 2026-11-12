import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CliError } from '../output.ts'
import { agents, skill } from './skill.ts'

let home: string
let log: ReturnType<typeof spyOn>

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'dukoi-skill-'))
  log = spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  log.mockRestore()
  rmSync(home, { recursive: true, force: true })
})

const run = (opts: Partial<Parameters<typeof skill>[0]> = {}) =>
  skill({ off: false, quiet: false, json: false, ...opts }, home)

describe('dukoi skill', () => {
  test('installs only for the agents that are on this computer', () => {
    mkdirSync(join(home, '.claude'))
    mkdirSync(join(home, '.codex'))
    run()
    const claude = join(home, '.claude', 'skills', 'dukoi', 'SKILL.md')
    expect(readFileSync(claude, 'utf8')).toStartWith('---\nname: dukoi\n')
    expect(existsSync(join(home, '.agents', 'skills', 'dukoi', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(home, '.cursor'))).toBe(false)
  })

  test('says how to get it some other way when no agent is found', () => {
    expect(() => run()).toThrow(CliError)
  })

  test('stays silent for the install script when no agent is found', () => {
    run({ quiet: true })
    expect(log).not.toHaveBeenCalled()
  })

  test('--off removes it again', () => {
    mkdirSync(join(home, '.claude'))
    run()
    run({ off: true })
    expect(existsSync(join(home, '.claude', 'skills', 'dukoi'))).toBe(false)
  })

  test('follows XDG_CONFIG_HOME for OpenCode', () => {
    const opencode = agents(home, { XDG_CONFIG_HOME: '/xdg' }).find((a) => a.name === 'OpenCode')
    expect(opencode?.skills).toBe(join('/xdg', 'opencode', 'skills'))
  })
})
