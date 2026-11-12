// Run jobs on a schedule and see how each run went.
// You don't need to touch this file: the jobs are in jobs.js.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { jobs } from './jobs.js'
import { matches, next, parse } from './schedule.js'

// Each job keeps this many runs.
const KEEP = 50
// Output longer than this is cut short.
const MAX_OUTPUT = 10_000

// A bad schedule stops the app here, with a message that says which one.
const schedules = jobs.map((job) => parse(job.schedule))

// Dukoi sets DATA_DIR to a folder that survives deploys and rollbacks.
const db = new DatabaseSync(join(process.env.DATA_DIR ?? '.', 'runs.db'))
db.exec(`CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY,
  job TEXT NOT NULL,
  ok INTEGER NOT NULL,
  ms INTEGER NOT NULL,
  output TEXT NOT NULL,
  started_at TEXT NOT NULL
)`)

const running = new Set()

async function run(job) {
  if (running.has(job.name)) {
    console.log(`${job.name}: still running from last time, so this run is skipped.`)
    return
  }
  running.add(job.name)
  const started = new Date()
  let ok = 1
  let output
  try {
    output = String((await job.run()) ?? '')
  } catch (err) {
    ok = 0
    output = err.message
  }
  running.delete(job.name)
  const ms = Date.now() - started
  console.log(`${job.name}: ${ok ? 'worked' : 'failed'} in ${ms} ms. ${output.split('\n')[0]}`)
  db.prepare('INSERT INTO runs (job, ok, ms, output, started_at) VALUES (?, ?, ?, ?, ?)').run(
    job.name,
    ok,
    ms,
    output.length > MAX_OUTPUT ? `${output.slice(0, MAX_OUTPUT)}\n… cut short` : output,
    started.toISOString(),
  )
  db.prepare(
    'DELETE FROM runs WHERE job = ? AND id NOT IN (SELECT id FROM runs WHERE job = ? ORDER BY id DESC LIMIT ?)',
  ).run(job.name, job.name, KEEP)
}

// Wake up at the start of every minute and run what's due.
function tick() {
  // Timers can wake a few milliseconds early, so round to the nearest minute.
  const now = new Date(Math.round(Date.now() / 60_000) * 60_000)
  jobs.forEach((job, i) => {
    if (matches(schedules[i], now)) run(job)
  })
  setTimeout(tick, 60_000 - (Date.now() % 60_000))
}

const page = readFileSync(new URL('./public/index.html', import.meta.url), 'utf8')

const app = new Hono()

app.get('/', (c) => c.html(page))

app.get('/jobs', (c) =>
  c.json({
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    jobs: jobs.map((job, i) => ({
      id: i,
      name: job.name,
      schedule: job.schedule,
      next: next(schedules[i])?.toISOString() ?? null,
      running: running.has(job.name),
      last:
        db
          .prepare(
            'SELECT ok, ms, output, started_at FROM runs WHERE job = ? ORDER BY id DESC LIMIT 1',
          )
          .get(job.name) ?? null,
    })),
  }),
)

app.post('/jobs/:id/run', (c) => {
  const job = jobs[Number(c.req.param('id'))]
  if (!job) return c.json({ error: 'No such job' }, 404)
  run(job)
  return c.json({ started: job.name }, 202)
})

const port = Number(process.env.PORT ?? 3000)
serve({ fetch: app.fetch, port, hostname: process.env.HOST ?? '0.0.0.0' }, () => {
  console.log(
    `cron-jobs listening on ${port}. ${jobs.length} jobs, times in ${Intl.DateTimeFormat().resolvedOptions().timeZone}.`,
  )
})

setTimeout(tick, 60_000 - (Date.now() % 60_000))
