# Starters

This doc describes the five starter apps and the rules every starter follows.

```bash
droidhost init hono-api
cd hono-api
droidhost deploy
```

**The promise:** every starter deploys with **zero edits**.

---

## The five starters

| Starter | What it is | Opens a port? | Good for |
| --- | --- | --- | --- |
| `hono-api` | A JSON API with a SQLite table and CRUD routes | Yes | Side-project backends, personal APIs |
| `telegram-bot` | A bot that uses long polling, so it needs no public URL | No (worker) | Alerts, small tools, family bots |
| `static-site` | Plain HTML, CSS and JS | Yes | Portfolios, landing pages, docs |
| `file-storage` | Upload, list and download files stored on the phone | Yes | File drop, sharing, backups |
| `mcp-server` | A Model Context Protocol server over HTTP with one example tool | Yes | AI agents that need always-on tools |

---

## Rules every starter follows

1. **No native modules.** Everything installs on a phone with no compiler.
2. **Hono with `@hono/node-server`** for anything that opens a port.
3. **`node:sqlite`** (built into Node 24) for data. No ORM.
4. **Listen on `process.env.PORT`.**
5. **Store data in `DATA_DIR`**, which DroidHost points at the app's `data/` folder so it survives deploys.
6. **Read secrets from environment variables** and fail with a clear message if one is missing.
7. **Readable in five minutes.** One `src/` folder and a short README.
8. **A `GET /` or `/health` that returns 200**, so the health check passes.

Environment variables DroidHost sets for every app:

| Variable | Value |
| --- | --- |
| `PORT` | The app's assigned port |
| `DATA_DIR` | Absolute path to the app's persistent `data/` folder |
| `NODE_ENV` | `production` |
| `DROIDHOST_APP` | The app's name |

---

## Starter notes

### `hono-api`

```ts
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'

const db = new DatabaseSync(join(process.env.DATA_DIR ?? '.', 'app.db'))
db.exec('CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, text TEXT)')

const app = new Hono()
app.get('/', (c) => c.json({ ok: true }))
app.get('/notes', (c) => c.json(db.prepare('SELECT * FROM notes').all()))
app.post('/notes', async (c) => {
  const { text } = await c.req.json()
  db.prepare('INSERT INTO notes (text) VALUES (?)').run(text)
  return c.json({ ok: true }, 201)
})

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) })
```

That's the whole app.

### `telegram-bot`

- Needs `BOT_TOKEN`. Set it with `droidhost env set BOT_TOKEN=...`.
- Uses long polling, so it works without `droidhost expose`.
- Deploy with `--no-health-check`, or let the default worker check pass (the process stays up).

### `static-site`

- No `package.json`, so DroidHost serves the folder directly.
- Add a `package.json` with a `build` script if you use a bundler. The CLI builds on your computer before packing.

### `file-storage`

- Files go to `DATA_DIR/files`.
- Downloads are sent with `Content-Disposition: attachment`, so uploaded HTML can't run scripts. See [security.md](security.md#apps-and-uploads).
- Uploads over 100 MB through a tunnel are split into chunks because of Cloudflare's limit. See [networking.md](networking.md#limits).
- Optional `API_KEY` env var to protect uploads.

### `mcp-server`

- Exposes one example tool, `phone_status`, that returns battery and temperature from DroidHost's local status.
- Uses the official MCP TypeScript SDK with the Streamable HTTP transport.
- Expose it with a custom domain and add auth before connecting a remote agent.

---

## Adding a starter

A new starter must:

- Deploy with zero edits on all four device lab phones.
- Follow every rule above.
- Fill a real gap. Five great starters beat twenty average ones.
