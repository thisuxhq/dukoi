// Catch webhooks and see them on a page as they arrive.
// You don't need to touch this file: what to do with each webhook is in handle.js.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { handle } from './handle.js'

// The inbox keeps this many requests and forgets older ones.
const KEEP = 200
// Bodies bigger than this are cut short in the inbox. handle() still gets all of it.
const MAX_BODY = 64 * 1024

// Dukoi sets DATA_DIR to a folder that survives deploys and rollbacks.
const db = new DatabaseSync(join(process.env.DATA_DIR ?? '.', 'inbox.db'))
db.exec(`CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  headers TEXT NOT NULL,
  body TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
)`)

const page = readFileSync(new URL('./public/index.html', import.meta.url), 'utf8')

const app = new Hono()

app.get('/', (c) => c.html(page))

// The page asks for new requests every two seconds.
app.get('/requests', (c) => {
  const rows = db.prepare('SELECT * FROM requests ORDER BY id DESC LIMIT 50').all()
  return c.json(rows.map((row) => ({ ...row, headers: JSON.parse(row.headers) })))
})

// Any method, on /hook or anything under it.
app.all('/hook/*', receive)
app.all('/hook', receive)

async function receive(c) {
  const url = new URL(c.req.url)
  const body = await c.req.text()
  const headers = Object.fromEntries(c.req.raw.headers)
  const kept = body.length > MAX_BODY ? `${body.slice(0, MAX_BODY)}\n… cut at 64 KB` : body
  db.prepare('INSERT INTO requests (method, path, headers, body) VALUES (?, ?, ?, ?)').run(
    c.req.method,
    url.pathname + url.search,
    JSON.stringify(headers),
    kept,
  )
  db.prepare('DELETE FROM requests WHERE id <= (SELECT MAX(id) FROM requests) - ?').run(KEEP)

  try {
    const reply = await handle({
      method: c.req.method,
      path: url.pathname,
      query: url.searchParams,
      headers,
      body,
    })
    if (reply === undefined) return c.json({ ok: true })
    return typeof reply === 'string' ? c.text(reply) : c.json(reply)
  } catch (err) {
    console.error(`handle() failed: ${err.message}`)
    return c.json({ error: err.message }, 500)
  }
}

const port = Number(process.env.PORT ?? 3000)
serve({ fetch: app.fetch, port, hostname: process.env.HOST ?? '0.0.0.0' }, () => {
  console.log(`webhook-inbox listening on ${port}. Send requests to /hook.`)
})
