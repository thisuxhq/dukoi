// A notes API on Hono, with SQLite built into Node.
// Deploy it: droidhost deploy
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'

// DroidHost sets DATA_DIR to a folder that survives deploys and rollbacks.
const db = new DatabaseSync(join(process.env.DATA_DIR ?? '.', 'notes.db'))
db.exec(`CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`)

const app = new Hono()

app.get('/', (c) =>
  c.json({
    ok: true,
    app: 'hono-api',
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    notes: db.prepare('SELECT COUNT(*) AS n FROM notes').get().n,
  }),
)

app.get('/notes', (c) => c.json(db.prepare('SELECT * FROM notes ORDER BY id DESC').all()))

app.post('/notes', async (c) => {
  const { text } = await c.req.json().catch(() => ({}))
  if (typeof text !== 'string' || !text.trim()) {
    return c.json({ error: 'Send JSON like {"text": "buy milk"}' }, 400)
  }
  const { lastInsertRowid } = db.prepare('INSERT INTO notes (text) VALUES (?)').run(text.trim())
  return c.json(db.prepare('SELECT * FROM notes WHERE id = ?').get(lastInsertRowid), 201)
})

app.delete('/notes/:id', (c) => {
  const { changes } = db.prepare('DELETE FROM notes WHERE id = ?').run(Number(c.req.param('id')))
  return changes ? c.body(null, 204) : c.json({ error: 'No such note' }, 404)
})

const port = Number(process.env.PORT ?? 3000)
serve({ fetch: app.fetch, port, hostname: process.env.HOST ?? '0.0.0.0' }, () => {
  console.log(`hono-api listening on ${port}`)
})
