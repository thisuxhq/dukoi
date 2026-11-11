# Templates

This doc describes the five templates (the folders in `starters/`), how people start from one, and the rules every template follows.

**The promise:** every template deploys with **zero edits**, and you change **one file** to make it yours.

---

## How people start

| From | How | What happens |
| --- | --- | --- |
| A computer | `npx droidhost init` (a numbered list) or `npx droidhost init notes-api` | Copies the template into a new folder and, if the computer is paired, deploys it and prints the file to edit |
| The phone | **Try a template** on the empty Home screen | Deploys the template's archive from the APK, with no computer. The app page then shows the `init` command to get the code |

The CLI ships the template folders next to its bundle (`dist/starters`). The APK ships them packed, as `assets/templates/<id>.tgz`, built by `scripts/pack-templates.ts` the same way `droidhost deploy` packs an app (see `scripts/prepare-android.sh`). The list itself is `TEMPLATES` in `shared/src/api.ts`.

A template app deployed from the phone remembers it (`AppInfo.template`); the next deploy from a computer clears it.

---

## The five templates

| Template | What you see when it's live | The file to edit |
| --- | --- | --- |
| `static-site` | A one-page site with your name on it | `index.html` |
| `notes-api` | A JSON API that lists its routes; notes in SQLite | `server.js` |
| `file-drop` | An upload page; drop a file, get a link | `server.js` (`MAX_MB`) |
| `mcp-server` | A JSON page with the command to connect your assistant; tools `save_note` and `list_notes` | `tools.js` |
| `telegram-bot` | A bot that replies to `/start` and echoes messages | `bot.js` |

### Notes

- **`telegram-bot`** needs `TELEGRAM_BOT_TOKEN`. `init` asks for it, and the phone's sheet has a field for it. Either way it's saved on the phone as a setting (`droidhost env set TELEGRAM_BOT_TOKEN=...`), never in the folder. It uses long polling, so it needs no public URL, and its `droidhost.json` turns the health check off. Without a token it stays up and logs what to do; with a bad one, the deploy fails with Telegram's reason.
- **`file-drop`** keeps files in `DATA_DIR/files` and sends them with `Content-Security-Policy: sandbox`, so uploaded HTML can't run scripts. Cloudflare's free plan stops public uploads at 100 MB. Anyone who can reach the page can upload; the README says to add a check before making it public.
- **`mcp-server`** is hand-written, about 60 lines, with no MCP SDK: JSON-RPC over HTTP at `/mcp`, with the `initialize` handshake (protocol 2025-11-25 and earlier), which today's assistants use.
- **`static-site`** has no `package.json`, so DroidHost serves the folder as it is.

---

## Rules every template follows

1. **No native modules.** Everything installs on a phone with no compiler.
2. **Hono with `@hono/node-server`** for anything that opens a port.
3. **`node:sqlite`** (built into Node 24) for data. No ORM.
4. **Listen on `process.env.PORT`.**
5. **Store data in `DATA_DIR`**, which DroidHost points at the app's `data/` folder so it survives deploys.
6. **Read secrets from settings** (environment variables) and say clearly what's missing.
7. **Readable in five minutes.** A few files at the top level, one of them the file to edit, and a short README.
8. **A `GET /` or `/health` that returns 200**, so the health check passes.

--- | --- |
| `PORT` | The app's assigned port |
| `DATA_DIR` | Absolute path to the app's persistent `data/` folder |
| `NODE_ENV` | `production` |
| `DROIDHOST_APP` | The app's name |

---

Environment variables DroidHost sets for every app, on top of its own settings:

| Variable | Value |
| --- | --- |
| `PORT` | The port to listen on |
| `HOST` | `127.0.0.1` |
| `DATA_DIR` | Absolute path to the app's persistent `data/` folder |
| `NODE_ENV` | `production` |
| `DROIDHOST_APP` | The app's name |

---

## Adding a template

A new template must:

- Deploy with zero edits on all four device lab phones.
- Follow every rule above.
- Fill a real gap. Five great templates beat twenty average ones.
- Be added to `TEMPLATES` in `shared/src/api.ts` (with the one file to edit), and get a page under `site/src/routes/docs/templates/`.
