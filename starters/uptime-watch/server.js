// Check your sites every minute and get a ping on your phone when one goes down.
// You don't need to touch this file: the sites are in sites.js.
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { sites } from './sites.js'

const EVERY_MS = 60_000
const TIMEOUT_MS = 10_000
// A site counts as down after this many failed checks in a row, so one slow answer doesn't wake you.
const FAILS_FOR_DOWN = 2

// Dukoi sets DATA_DIR to a folder that survives deploys and rollbacks.
const DATA = process.env.DATA_DIR ?? '.'
const db = new DatabaseSync(join(DATA, 'uptime.db'))
db.exec(`CREATE TABLE IF NOT EXISTS checks (
  id INTEGER PRIMARY KEY,
  url TEXT NOT NULL,
  ok INTEGER NOT NULL,
  ms INTEGER NOT NULL,
  problem TEXT,
  checked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS checks_by_url ON checks (url, id)`)

// Alerts go to ntfy (https://ntfy.sh), a free push service with an app for Android and iOS.
// The topic is made up once and kept, or set your own: dukoi env set NTFY_TOPIC=...
const topicFile = join(DATA, 'ntfy-topic.txt')
if (!process.env.NTFY_TOPIC && !existsSync(topicFile)) {
  writeFileSync(topicFile, `uptime-${randomBytes(5).toString('hex')}`)
}
const topic = process.env.NTFY_TOPIC || readFileSync(topicFile, 'utf8').trim()

// Down means the last few checks all failed. Worked out from saved checks, so a restart doesn't alert again.
function isDown(url) {
  const recent = db
    .prepare('SELECT ok FROM checks WHERE url = ? ORDER BY id DESC LIMIT ?')
    .all(url, FAILS_FOR_DOWN)
  return recent.length === FAILS_FOR_DOWN && recent.every((c) => !c.ok)
}

async function check(site) {
  const started = Date.now()
  try {
    const res = await fetch(site.url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    await res.body?.cancel()
    return {
      ok: res.status < 400,
      ms: Date.now() - started,
      problem: res.status < 400 ? null : `HTTP ${res.status}`,
    }
  } catch (err) {
    const problem =
      err.name === 'TimeoutError' ? 'No answer in 10 seconds' : (err.cause?.code ?? err.message)
    return { ok: false, ms: Date.now() - started, problem }
  }
}

async function alert(text) {
  console.log(text)
  await fetch(`https://ntfy.sh/${topic}`, { method: 'POST', body: text }).catch((err) => {
    console.error(`Couldn't send the alert to ntfy: ${err.message}`)
  })
}

async function checkAll() {
  await Promise.all(
    sites.map(async (site) => {
      const result = await check(site)
      const wasDown = isDown(site.url)
      db.prepare('INSERT INTO checks (url, ok, ms, problem) VALUES (?, ?, ?, ?)').run(
        site.url,
        result.ok ? 1 : 0,
        result.ms,
        result.problem,
      )
      if (!wasDown && isDown(site.url)) await alert(`${site.name} is down: ${result.problem}`)
      if (wasDown && result.ok) await alert(`${site.name} is back up`)
    }),
  )
  // Keep a week of checks.
  db.prepare(
    "DELETE FROM checks WHERE checked_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days')",
  ).run()
}

const page = readFileSync(new URL('./public/index.html', import.meta.url), 'utf8')

const app = new Hono()

app.get('/', (c) => c.html(page))

app.get('/status', (c) =>
  c.json({
    topic,
    every: EVERY_MS / 1000,
    sites: sites.map((site) => {
      const checks = db
        .prepare(
          'SELECT ok, ms, problem, checked_at FROM checks WHERE url = ? ORDER BY id DESC LIMIT 30',
        )
        .all(site.url)
        .reverse()
      // When it went down: the first failed check after the last good one.
      const since = db
        .prepare(
          'SELECT MIN(checked_at) AS at FROM checks WHERE url = ? AND id > COALESCE((SELECT MAX(id) FROM checks WHERE url = ? AND ok = 1), 0)',
        )
        .get(site.url, site.url).at
      return { ...site, down: isDown(site.url), since, checks }
    }),
  }),
)

const port = Number(process.env.PORT ?? 3000)
serve({ fetch: app.fetch, port, hostname: process.env.HOST ?? '0.0.0.0' }, () => {
  console.log(
    `uptime-watch listening on ${port}. Watching ${sites.length} sites. Alerts go to ntfy topic ${topic}.`,
  )
})

checkAll()
setInterval(checkAll, EVERY_MS)
