---
name: dukoi
description: Build and deploy apps to an Android phone with the Dukoi CLI (`dukoi`). Use when the user wants to host, deploy, run or expose an app, API, bot, website, webhook, cron job or MCP server on their phone, mentions Dukoi or `dukoi deploy`, or asks for a live URL without a cloud server. Covers what runs on the phone, how to write an app that deploys first time, and every command.
---

# Dukoi

Dukoi turns an Android phone into an app server. The phone runs the Dukoi app, the computer runs the `dukoi` command, and `dukoi deploy` ships the current folder to the phone and prints a live URL. No root, no cloud bill.

Docs for people: https://dukoi.com/docs. Every page has a Markdown twin (add `.md`), and https://dukoi.com/llms-full.txt has all of them.

## Before you start

1. Check the CLI: `dukoi --version`. If it's missing, ask the user to run `curl -fsSL https://dukoi.com/install | sh` (macOS, Linux) or `irm https://dukoi.com/install.ps1 | iex` (Windows PowerShell).
2. Check a phone is paired: `dukoi devices --json`. If none is, the user runs `dukoi pair` and taps **Approve** on the phone. You can't approve it for them, so ask.
3. Add `--json` to the commands you run (all but `init`, `pair` and `dashboard`). Output is one JSON object on stdout. Errors are `{ "ok": false, "error": { "code", "message", "hint" } }`. Read the `hint`: it says what to do next.

## What runs on the phone

Pick one of these two shapes. Anything else won't start.

| Kind | How Dukoi spots it | What the phone does |
| --- | --- | --- |
| Static site | No `package.json`, and an `index.html` | Serves the folder as it is |
| Node app | A `package.json` | Runs `node <file>` on Node.js 24 |

The phone has Node.js 24 and nothing else: no Python, Bun, Deno, Docker, shell scripts or compilers.

### Rules for a Node app

1. **Start with plain `node`.** `scripts.start` must be `node <file>.js`, like `"start": "node server.js"`. Without it, Dukoi tries `main`, then `index.js`, `server.js` and `src/index.js`. `tsx`, `ts-node`, `next start` and `bun` won't work.
2. **Listen on `process.env.PORT`.** Bind to `process.env.HOST` (Dukoi sets `127.0.0.1`; the phone proxies to it). Don't hard-code a port.
3. **Answer `GET /` quickly with any status below 500.** That's the health check, and it has to pass within 10 seconds of starting or the deploy fails and the old release keeps running. Use `"healthCheck": "/health"` in `dukoi.json` for another path.
4. **No native modules.** Phones can't compile them, and the deploy stops if it finds one. Use the pure JavaScript ones instead:

   | Instead of | Use |
   | --- | --- |
   | `better-sqlite3`, `sqlite3` | `node:sqlite` (built in) |
   | `bcrypt` | `bcryptjs` |
   | `sharp` | `jimp` |
   | `argon2` | `hash-wasm` |
   | `canvas` | `@napi-rs/canvas`, or draw in the browser |

5. **Keep data in `process.env.DATA_DIR`.** It's the only folder that survives deploys and rollbacks. Anything written next to the code is lost on the next deploy.
6. **Read secrets from environment variables**, set with `dukoi env set`. `.env` files are never uploaded. When a secret is missing, log what to set and keep running, so the user can see the message in `dukoi logs`.
7. **TypeScript and frameworks build on the computer.** If `package.json` has a `build` script, `dukoi deploy` runs `npm run build` first, then uploads the folder with the output. Point `start` at the built file: `node dist/server.js`, or `node build` for SvelteKit with `@sveltejs/adapter-node`.
8. **Workers that open no port** (bots, queue consumers, cron) need `"healthCheck": false` in `dukoi.json`. They count as healthy if they're still running after 3 seconds.

Good defaults, which the templates use: [Hono](https://hono.dev) with `@hono/node-server` for HTTP, `node:sqlite` for data and no ORM. They're small and fast on a phone.

A minimal app:

```js
// server.js
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'

const db = new DatabaseSync(join(process.env.DATA_DIR ?? '.', 'app.db'))
db.exec('CREATE TABLE IF NOT EXISTS hits (at TEXT DEFAULT (datetime()))')

const app = new Hono()
app.get('/', (c) => {
  db.exec('INSERT INTO hits DEFAULT VALUES')
  return c.json({ hits: db.prepare('SELECT count(*) AS n FROM hits').get().n })
})

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000), hostname: process.env.HOST })
```

```json
{
  "name": "my-api",
  "type": "module",
  "scripts": { "start": "node server.js" },
  "dependencies": { "@hono/node-server": "^1", "hono": "^4" }
}
```

### Environment Dukoi sets

| Variable | Value |
| --- | --- |
| `PORT` | The port to listen on |
| `HOST` | `127.0.0.1` |
| `DATA_DIR` | The app's persistent `data/` folder |
| `NODE_ENV` | `production` |
| `DUKOI_APP` | The app's name |

### `dukoi.json` (optional)

Only add it to override a guess. Flags win over the file.

```json
{
  "name": "my-api",
  "start": "node dist/server.js",
  "healthCheck": "/health",
  "ignore": ["fixtures", "docs"]
}
```

`.git`, `node_modules`, `.env` and `.env.local` are never uploaded. Dukoi runs `npm install --omit=dev` itself, so dependencies must be in `dependencies`, not `devDependencies`.

## Commands

The app defaults to the one in the current folder, and the phone to the only or last-used one. `--app <name>` and `--device <name>` pick others.

| Command | What it does |
| --- | --- |
| `dukoi init [template]` | Copies a template into a new folder and deploys it if a phone is paired |
| `dukoi deploy [folder]` | Builds, packs, uploads, starts and health-checks the app. Prints the URLs |
| `dukoi ps` | Every app: status, CPU, memory, uptime, URL |
| `dukoi logs [app] --no-follow --lines 200` | Recent log lines. Without `--no-follow` it streams |
| `dukoi status` | Phone health: memory, storage, uptime |
| `dukoi start`, `stop`, `restart [app]` | Control an app. A stopped app stays stopped after a reboot |
| `dukoi env set KEY=value` | Save a setting on the phone. Restarts the app |
| `dukoi env list`, `env unset KEY` | Names only. Values never come back from the phone |
| `dukoi expose [app]` | A public HTTPS URL through a Cloudflare quick tunnel. It can change |
| `dukoi expose --domain api.example.com` | A URL that never changes, on the user's own Cloudflare domain. Opens a browser to log in the first time |
| `dukoi expose --off` | Remove the public URL |
| `dukoi releases [app]` | The last 5 releases |
| `dukoi rollback [app]` | Back to the previous release in about a second. `--to <id>` for another |
| `dukoi remove [app] --yes` | Delete the app, its data and its settings. Ask the user first |
| `dukoi dashboard` | The web dashboard on this computer |
| `dukoi skill` | Install or update this skill for the coding agents on this computer |

## Templates

Each one deploys with no edits. Start from the closest one and change its one file.

| Template | What it is | File to edit |
| --- | --- | --- |
| `static-site` | A one-page site | `index.html` |
| `notes-api` | A JSON API with SQLite | `server.js` |
| `file-drop` | Upload a file, get a link | `server.js` |
| `mcp-server` | Tools an AI assistant can call, over HTTP at `/mcp` | `tools.js` |
| `telegram-bot` | A bot that replies, with long polling | `bot.js` |
| `webhook-inbox` | Shows every request to `/hook` as it arrives | `handle.js` |
| `uptime-watch` | Checks sites every minute and sends push alerts | `sites.js` |
| `cron-jobs` | Scheduled jobs with their last result | `jobs.js` |

`telegram-bot` needs `TELEGRAM_BOT_TOKEN`. When `init` isn't run in a terminal it skips the question, so ask the user to run `dukoi env set TELEGRAM_BOT_TOKEN=...` themselves, or pass the token they give you straight to it.

## Working loop

1. Write the app following the rules above. Run it locally with `PORT=3000 node server.js` if Node is installed.
2. `dukoi deploy --json`. On success, give the user `app.localUrl`, and `app.publicUrl` if there is one.
3. If it fails, read `error.code` and `error.hint`, then `dukoi logs <app> --no-follow --json`. Fix and deploy again. The old release keeps serving until a new one is healthy.
4. Need it on the internet (webhooks, sharing)? `dukoi expose`. Local URLs only work on the same Wi-Fi.

Common errors:

| Code | Fix |
| --- | --- |
| `NOT_AN_APP` | Add a `package.json` or an `index.html` |
| `NO_START` | Make `scripts.start` `node <file>.js` |
| `NATIVE_MODULE` | Swap the package for the pure JavaScript one in the hint |
| `HEALTH_TIMEOUT` | Listen on `process.env.PORT` and answer `GET /`, or set `healthCheck` |
| `CRASHED_ON_START` | Read `dukoi logs <app> --no-follow` for the stack trace |

## Be careful

- Never print or commit a secret. Pass it straight to `dukoi env set`.
- `remove`, `rollback` and `expose` change what's live. Say what you'll do and get a yes first.
- A quick tunnel URL is public: anyone with it can reach the app. Add a check before exposing anything that writes data or shows private information.
- Phones have little memory. Prefer small dependencies, stream big files and don't hold large datasets in memory.
