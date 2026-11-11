import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppProcess } from './app-process.ts'
import { LogFile } from './log-file.ts'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function setup(script: string) {
  const dir = mkdtempSync(join(tmpdir(), 'dukoi-test-'))
  dirs.push(dir)
  const log = new LogFile(join(dir, 'app.log'))
  const proc = new AppProcess(
    'test',
    { command: 'node', args: ['-e', script], cwd: dir, env: { PATH: process.env.PATH ?? '' } },
    log,
    join(dir, 'app.pid'),
  )
  return { proc, log }
}

const waitFor = async (check: () => boolean, ms = 5000) => {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out')
    await Bun.sleep(20)
  }
}

test('captures output and stops cleanly', async () => {
  const { proc, log } = setup("console.log('hello'); setInterval(() => {}, 1000)")
  proc.start()
  await waitFor(() => log.tail(10).some((l) => l.includes('hello')))
  expect(proc.state).toBe('running')
  await proc.stop()
  expect(proc.state).toBe('stopped')
  expect(proc.pid).toBeNull()
})

test('a killed app comes back at once', async () => {
  const { proc } = setup('setInterval(() => {}, 1000)')
  proc.start()
  await waitFor(() => proc.pid !== null)
  const first = proc.pid as number
  const killedAt = Date.now()
  process.kill(first, 'SIGKILL')
  await waitFor(() => proc.pid !== null && proc.pid !== first)
  expect(Date.now() - killedAt).toBeLessThan(1000)
  expect(proc.lastExit).toBe('killed (SIGKILL, usually Android)')
  await proc.stop()
})

test('a crashing app restarts after a backoff', async () => {
  const { proc, log } = setup('process.exit(3)')
  proc.start()
  await waitFor(() => proc.restarts === 1)
  expect(proc.lastExit).toBe('crashed with code 3')
  expect(log.tail(5).join('\n')).toContain('Restarting in 1s')
  await proc.stop()
})

test('tail(0) returns no lines, not the whole log', () => {
  const { log } = setup('')
  log.note('one')
  log.note('two')
  expect(log.tail(0)).toEqual([])
  expect(log.tail(1)).toHaveLength(1)
})
