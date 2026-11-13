# CLI reference

This doc lists every `dukoi` command for phase 1: what it does, its flags and what it prints.

Install it with one line (D-113). Run `dukoi update` to update it later.

```bash
curl -fsSL https://dukoi.com/install | sh        # macOS and Linux
irm https://dukoi.com/install.ps1 | iex          # Windows, in PowerShell
```

It puts everything in `~/.dukoi` and the command in `~/.dukoi/bin`, which it adds to your PATH. Then it runs `dukoi skill`, so the coding agents on your computer know how to use Dukoi.

---

## Rules for every command

- **One required argument at most.** Everything else has a default.
- **The app defaults to the current folder.** Inside `my-api/`, `dukoi logs` means `dukoi logs my-api`.
- **The device defaults to the only paired phone**, or the last one you used.
- **Exit codes:** `0` means success, `1` means the command failed and `2` means you typed it wrong.

### Global flags

| Flag | Meaning |
| --- | --- |
| `--app <name>` | Which app. Defaults to the current folder's app. |
| `--device <name>` | Which phone. Defaults to the only or last-used phone. |
| `--json` | Machine-readable output for scripts and AI agents. |
| `--verbose` | Show full detail, including stack traces. |
| `--help`, `-h` | Help with a real example. |
| `--version`, `-v` | CLI version. |

---

## Pairing

### `dukoi pair`

Finds a phone on the same Wi-Fi and links it to this computer.

```
$ dukoi pair
✓ Found pixel-10a (192.168.1.24)

  Code on your phone: 482 913
  Tap Approve on the phone if the codes match.

✓ Paired with pixel-10a
```

| Flag | Meaning |
| --- | --- |
| `--name <name>` | Nickname for the phone. Defaults to the model name. |
| `--host <ip>` | Skip discovery and connect to this address. |

### `dukoi devices`

Lists paired phones with their status, battery, temperature and number of apps.

### `dukoi unpair <device>`

Forgets a phone on this computer. To revoke access from the phone side, remove the computer in the phone app.

---

## Deploying

### `dukoi deploy [folder]`

Packs, uploads, installs, starts and health-checks an app. The folder defaults to `.`.

```
$ dukoi deploy
✓ Packed my-api (42 KB)
✓ Uploaded to pixel-10a
✓ Installed dependencies (8.1s)
✓ Started and healthy (release 0005)

  Local   http://192.168.1.24:3000
  Public  https://shy-river-42.trycloudflare.com
```

| Flag | Meaning |
| --- | --- |
| `--name <name>` | App name. Defaults to `package.json` `name`, then the folder name. |
| `--priority <level>` | `critical`, `normal` (the default) or `low`. |
| `--memory <size>` | Memory limit, for example `256mb`. Defaults to a share of the phone's RAM. |
| `--no-health-check` | Skip the HTTP check. Use this for workers that open no port. |

### `dukoi init [template]`

Copies a template into a new folder and, if this computer is paired, deploys it straight away. Run it without a name to pick from a numbered list.

```
$ dukoi init notes-api
✓ Created notes-api/
✓ Installed dependencies
✓ Packed notes-api (346 KB)
✓ Uploaded to a024
✓ Started and healthy (release 0001)

  Local   http://192.168.0.112:3000

  Make it yours: edit notes-api/server.js, then run dukoi deploy
```

Templates: `static-site`, `notes-api`, `file-drop`, `mcp-server`, `telegram-bot`, `webhook-inbox`, `uptime-watch`, `cron-jobs`. A template that needs a setting, like the bot's token, asks for it and saves it on the phone. If the computer isn't paired yet, it only makes the folder and says to pair. See [starters.md](starters.md).

### `dukoi releases [app]`

Lists the last 5 releases with their ID, time and size, and marks the one that's live.

### `dukoi rollback [app]`

Switches back to the previous release, which takes about a second. Use `--to <release>` to pick a specific one.

### `dukoi remove [app]`

Stops the app and deletes it from the phone, including its releases, data and secrets. Asks before deleting. Use `--yes` to skip the question.

---

## Running apps

| Command | What it does |
| --- | --- |
| `dukoi ps` | All apps, with status, CPU, memory, uptime and URLs |
| `dukoi start [app]` | Starts a stopped app |
| `dukoi stop [app]` | Stops an app. It stays stopped after a reboot. |
| `dukoi restart [app]` | Restarts an app |

```
$ dukoi ps
  APP        STATUS    CPU   MEM     UPTIME   URL
  my-api     running   2%    48 MB   3d 4h    https://shy-river-42.trycloudflare.com
  my-bot     running   0%    31 MB   3d 4h    (worker)
  portfolio  paused    –     –       –        http://192.168.1.24:8080   ⚠ paused: phone hot
```

---

## Settings

### `dukoi env`

```bash
dukoi env set KEY=value [KEY2=value2 ...]
dukoi env list             # names only
dukoi env unset KEY
```

Settings are saved on the phone and passed to the app as environment variables. The phone never sends their values back. Changing them restarts the app. They act on the app in this folder; `--app <name>` picks another.

---

## Databases

### `dukoi db`

```bash
dukoi db                              # your databases, URLs masked
dukoi db create redis --app my-api    # or postgres; --app takes a comma list
dukoi db create postgres --name shop --wifi
dukoi db url [db] [--wifi]            # the full URL, password and all
dukoi db connect <db> <app>           # gives the app REDIS_URL or DATABASE_URL
dukoi db disconnect <db> <app>
dukoi db wifi [db] [--off]            # let devices on your Wi-Fi connect
dukoi db password [db]                # a new password; connected apps get it
dukoi db logs [db]                    # like dukoi logs
dukoi db start|stop|restart [db]
dukoi db remove <db> [--yes]          # deletes its data
```

Redis runs Valkey and Postgres runs PGlite, on the phone next to the apps. Each database has a password. Connecting an app sets its `REDIS_URL` or `DATABASE_URL` setting and restarts it once. Where `[db]` is optional, the only database is used. `dukoi db url` prints just the URL, so `psql "$(dukoi db url postgres --wifi)"` works. See [databases.md](databases.md).

---

## Public URLs

### `dukoi expose [app]`

Gives an app a public HTTPS URL through a Cloudflare quick tunnel. Quick tunnel URLs can change, so use a custom domain for anything real.

| Flag | Meaning |
| --- | --- |
| `--domain <domain>` | Use a named tunnel on your own Cloudflare domain. Opens a browser to log in to Cloudflare the first time. |
| `--off` | Remove the public URL. |

See [networking.md](networking.md).

---

## Watching

| Command | What it does |
| --- | --- |
| `dukoi logs [app]` | Streams live logs. Use `--lines 200` for history and `--no-follow` to print and exit. |
| `dukoi status` | Phone health: memory, storage, load, agent version and uptime |
| `dukoi dashboard` | Opens the web dashboard on `127.0.0.1:7071` (or the next free port). Only this computer can reach it. `--no-open` skips the browser. |
| `dukoi bench` | Deploys `dukoi-bench`, measures it on Wi-Fi, through a quick tunnel and after 10 minutes of load, then removes it. About 13 minutes. `--quick` skips the hot test. `--share` sends the result to dukoi.com/bench. See [benchmarks.md](benchmarks.md). |
| `dukoi alerts` | Sets up crash, kill, overheat and power-cut alerts by email or Telegram |

---

## AI agents

### `dukoi skill`

Installs the Dukoi skill for the coding agents on this computer, so they know what runs on the phone and every command (D-117). The install script runs it, so you only need it after installing a new agent.

```
$ dukoi skill
✓ Taught Claude Code and Codex to use Dukoi
```

It copies `skills/dukoi/SKILL.md` into the skills folder of each agent whose home folder exists:

| Agent | Looks for | Installs to |
| --- | --- | --- |
| Claude Code | `~/.claude` | `~/.claude/skills/dukoi` |
| Codex, and any agent that reads `~/.agents` | `~/.codex` or `~/.agents` | `~/.agents/skills/dukoi` |
| Cursor | `~/.cursor` | `~/.cursor/skills/dukoi` |
| Gemini CLI | `~/.gemini` | `~/.gemini/skills/dukoi` |
| OpenCode | `~/.config/opencode` | `~/.config/opencode/skills/dukoi` |

| Flag | Meaning |
| --- | --- |
| `--off` | Remove the skill from every agent. |
| `--quiet` | Print one line, or nothing if no agent is found. The install script uses this. |

The same skill is on [skills.sh](https://skills.sh): `npx skills add thisuxhq/dukoi`. The site serves it at `dukoi.com/skill.md` for agents that read the web.

---

## This computer

### `dukoi update`

Updates the `dukoi` command to the latest release (D-119). It reads the latest version from `dukoi.com/download/VERSION`, and if it's newer, runs the install script again, so the dashboard, the templates and the agent skill update too.

```
$ dukoi update
→ Updating dukoi 0.4.1 to 0.5.0
→ Downloading dukoi-darwin-arm64.tar.gz
✓ Installed dukoi 0.5.0 in ~/.dukoi
```

It only updates this computer. To update the phone, install the new app from `dukoi.com/download/dukoi.apk`. A copy run from source (`bun run cli`) can't update itself: use `git pull`.

---

## Help

| Command | What it does |
| --- | --- |
| `dukoi help <topic>` | Short guides, for example `native-modules`, `setup` or `tunnels` |
| `dukoi doctor` | Checks pairing, setup, tunnel and clock, and says how to fix each problem |

---

## Optional config file

You don't need one. Add `dukoi.json` only to override a guess:

```json
{
  "name": "my-api",
  "start": "node dist/server.js",
  "priority": "critical",
  "memory": "256mb",
  "healthCheck": "/health"
}
```

Flags win over the file, and the file wins over detection.

---

## `--json` output

Every command supports `--json`. The output is one JSON object on stdout, and errors look like this:

```json
{ "ok": false, "error": { "code": "NATIVE_MODULE", "message": "sharp uses native code", "hint": "Try jimp" } }
```

The error codes are stable, so scripts and agents can rely on them.
