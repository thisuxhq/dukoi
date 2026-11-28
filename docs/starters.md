# Templates

This doc describes the nine templates (the folders in `starters/`), how people start from one, and the rules every template follows.

**The promise:** every template deploys with **zero edits**, and you change **one file** to make it yours.

---

## How people start

| From | How | What happens |
| --- | --- | --- |
| A computer | `dukoi init` (a numbered list) or `dukoi init notes-api` | Copies the template into a new folder and, if the computer is paired, deploys it and prints the file to edit |
| The phone | **Try a template** on the empty Home screen | Deploys the template's archive from the APK, with no computer. The app page then shows the `init` command to get the code |

The CLI ships the template folders next to its bundle (`dist/starters`). The APK ships them packed, as `assets/templates/<id>.tgz`, built by `scripts/pack-templates.ts` the same way `dukoi deploy` packs an app (see `scripts/prepare-android.sh`). The list itself is `TEMPLATES` in `shared/src/api.ts`.

A template app deployed from the phone remembers it (`AppInfo.template`); the next deploy from a computer clears it.

---

## The nine templates

| Template | What you see when it's live | The file to edit |
| --- | --- | --- |
| `static-site` | A one-page site with your name on it | `index.html` |
| `notes-api` | A JSON API that lists its routes; notes in SQLite | `server.js` |
| `file-drop` | An upload page; drop a file, get a link | `server.js` (`MAX_MB`) |
| `mcp-server` | A JSON page with the command to connect your assistant; tools `save_note` and `list_notes` | `tools.js` |
| `telegram-bot` | A bot that replies to `/start` and echoes messages | `bot.js` |
| `webhook-inbox` | A page that shows every request to `/hook` as it arrives | `handle.js` |
| `uptime-watch` | A status page for a few sites, checked every minute, with push alerts | `sites.js` |
| `cron-jobs` | A page of scheduled jobs with their next run and last result | `jobs.js` |
| `door-cam` | The phone's camera: the newest photo, a `/live` view, motion events with photos and a daily timelapse | `settings.js` |

### Notes

- **`telegram-bot`** needs `TELEGRAM_BOT_TOKEN`. `init` asks for it, and the phone's sheet has a field for it. Either way it's saved on the phone as a setting (`dukoi env set TELEGRAM_BOT_TOKEN=...`), never in the folder. It uses long polling, so it needs no public URL, and its `dukoi.json` turns the health check off. Without a token it stays up and logs what to do; with a bad one, the deploy fails with Telegram's reason.
- **`file-drop`** keeps files in `DATA_DIR/files` and sends them with `Content-Security-Policy: sandbox`, so uploaded HTML can't run scripts. Cloudflare's free plan stops public uploads at 100 MB. Anyone who can reach the page can upload; the README says to add a check before making it public.
- **`mcp-server`** is hand-written, about 60 lines, with no MCP SDK: JSON-RPC over HTTP at `/mcp`, with the `initialize` handshake (protocol 2025-11-25 and earlier), which today's assistants use.
- **`static-site`** has no `package.json`, so Dukoi serves the folder as it is.
- **`webhook-inbox`** saves any method on `/hook` and `/hook/*` (last 200, bodies cut at 64 KB) and then calls `handle()`, whose return value is the reply. The page polls every two seconds. It shows headers, which can hold secrets, so the README says not to share the URL. It needs `dukoi expose` to receive webhooks from the internet.
- **`uptime-watch`** checks each site every minute (10 s timeout, status below 400 is up). A site is down after 2 failed checks in a row, worked out from the saved checks so a restart doesn't alert twice. Alerts go to `https://ntfy.sh/<topic>`: the topic is made up on first run and kept in `DATA_DIR`, or set with `NTFY_TOPIC`. Checks are kept for 7 days.
- **`door-cam`** uses the phone's camera with no change to the phone app. Chrome on the phone opens `http://localhost:<port>/camera` (browsers only allow the camera on `localhost` or HTTPS), keeps the screen awake and black with the Wake Lock API, and sends JPEGs over one WebSocket to `/camera/feed`, so photos don't fill the request inspector. It sends 1 photo a second, or 8 while someone has `/live` open; `/live.mjpeg` is MJPEG, which any `<img>` plays. Motion is found in the browser by comparing 64×48 grey frames with a slow-moving average, and sent as a message; the server waits `motionCooldown` between alerts. Only the phone can send photos: `/camera` answers only to a loopback `x-forwarded-for` with no `cf-connecting-ip`, and only that page gets the camera key (kept in `DATA_DIR`) that the socket must send first. The proxy doesn't set `x-forwarded-for` on WebSocket upgrades, which is why the key is needed. No photo for 30 seconds counts as off and sends an alert. Alerts go to ntfy like `uptime-watch`, with the photo attached. Motion photos keep the last 200 events; timelapse photos (every 60 s) keep 7 days. It's the first template with a third package, `ws`, which `@hono/node-server` needs for WebSockets; it's plain JavaScript.
- **`cron-jobs`** reads standard 5-part cron schedules (plus `@hourly`, `@daily`, `@weekly`, `@monthly`) with its own 70-line `schedule.js`, so there's no extra package. It wakes at the start of each minute, skips a job that's still running, and keeps the last 50 runs per job. Times use the phone's time zone, which Node finds on Android by itself.

---

## Rules every template follows

1. **No native modules.** Everything installs on a phone with no compiler.
2. **Hono with `@hono/node-server`** for anything that opens a port.
3. **`node:sqlite`** (built into Node 24) for data. No ORM.
4. **Listen on `process.env.PORT`.**
5. **Store data in `DATA_DIR`**, which Dukoi points at the app's `data/` folder so it survives deploys.
6. **Read secrets from settings** (environment variables) and say clearly what's missing.
7. **Readable in five minutes.** A few files at the top level, one of them the file to edit, and a short README.
8. **A `GET /` or `/health` that returns 200**, so the health check passes.

--- | --- |
| `PORT` | The app's assigned port |
| `DATA_DIR` | Absolute path to the app's persistent `data/` folder |
| `NODE_ENV` | `production` |
| `DUKOI_APP` | The app's name |

---

Environment variables Dukoi sets for every app, on top of its own settings:

| Variable | Value |
| --- | --- |
| `PORT` | The port to listen on |
| `HOST` | `127.0.0.1` |
| `DATA_DIR` | Absolute path to the app's persistent `data/` folder |
| `NODE_ENV` | `production` |
| `DUKOI_APP` | The app's name |

---

## Adding a template

A new template must:

- Deploy with zero edits on all four device lab phones.
- Follow every rule above.
- Fill a real gap. Five great templates beat twenty average ones.
- Be added to `TEMPLATES` in `shared/src/api.ts` (with the one file to edit), and get a page under `site/src/routes/docs/templates/`.
