# Architecture

This doc explains how Dukoi's parts fit together in phase 1, with one phone and one or more paired computers.

**The one rule:** visitors only ever reach app ports. Everything that controls the phone stays private.

---

## The big picture

```
 Your computer                 Android phone (Dukoi APK)                          Internet
┌───────────────┐  signed     ┌───────────────────────────────────────────────────┐
│ CLI           │  requests   │ Phone app (Kotlin): setup, pairing approval, NSD  │
│ dukoi ... │──(LAN)─────▶│ ┌───────────────────────────────────────────────┐ │
└───────────────┘   :7070     │ │ Foreground service (specialUse)               │ │
                              │ │  keeps one process alive ↓                    │ │
                              │ └───────────────────────┬───────────────────────┘ │
                              │ ┌───────────────────────▼───────────────────────┐ │
                              │ │ Agent (TypeScript on bundled Node 24)         │ │
                              │ │  admin API :7070 · process manager · proxies  │ │
                              │ └───────┬─────────────────────────┬─────────────┘ │
                              │  spawns │                  spawns │               │
                              │ ┌───────▼───────┐        ┌────────▼─────┐         │
       Wi-Fi visitors ───────▶│ │ :3000 → my-api │◀──────│ cloudflared  │◀────────┼── Cloudflare ◀── Visitors
                              │ │ :3001 → site   │        │ (outbound)   │         │     edge       (HTTPS)
                              │ └───────────────┘        └──────────────┘         │
                              │ Storage: state.json, apps/<name>/releases, data   │
                              └───────────────────────────────────────────────────┘
```
| Part | One-line job |
| --- | --- |
| **CLI** | Packs your folder and sends signed commands to the phone. |
| **Phone app** | Kotlin and Compose. Onboarding (one screen per setup step), pairing approval, your apps with live logs, settings, Wi-Fi discovery (NSD) and the notification. Reads the agent through its `/local` endpoints. |
| **Foreground service** | Keeps one process alive, the agent. Android protects it. A killed agent is back in about a second. |
| **Agent** | TypeScript on the bundled Node (`agent/`). The admin API: checks signatures, signs answers, runs deploys, streams logs. |
| **Process manager** | Part of the agent. Starts, watches and restarts apps (at once after a kill, with backoff after crashes) and writes logs. |
| **Stable ports** | Part of the agent. Each app keeps one port (3000, 3001…) that forwards to the live release, so deploys and rollbacks don't change URLs. |
| **Node 24** | Runs your apps. Bundled in the APK. |
| **cloudflared** | Opens an outbound tunnel so apps get a public HTTPS URL. |
| **Storage** | App folders, releases, logs, encrypted secrets and the agent's own state. |

The agent is a TypeScript program on the bundled Node, kept alive by the Kotlin service (D-107). It shares its protocol code with the CLI (`shared/`).

---

## Key flows

### 1. Setup (on the phone)

1. Install the APK and open it.
2. Dukoi scores the device using chip, RAM, storage and battery health, then gives a plain verdict.
3. The checklist walks through each item: foreground service, battery optimization, child processes (the phantom process killer), and the steps for the detected brand.
4. Each item ticks green only after Android confirms it.
5. With no apps yet, Home offers **Try a template**. One tap deploys a template bundled in the APK (`assets/templates/<id>.tgz`, copied to the app's files and passed to the agent as `DUKOI_TEMPLATES`). The Telegram bot asks for its token first. The app's page then shows **Make it yours** with `dukoi init <template>` for the computer.

### 2. Pairing

```
CLI                                   Phone
 │  dukoi pair                      │
 │── mDNS: find "_dukoi._tcp" ────▶│  (< 3 s)
 │── hello + public key ───────────────▶│
 │                                      │  shows code "482 913"
 │  shows code "482 913"                │  user taps Approve
 │◀── approved + TLS cert fingerprint ──│  stores public key
 │  saves key + pinned fingerprint      │
```

- No passwords. The key pair is made on the computer and only the public key is sent.
- Removing a computer on the phone deletes its key, and the next request fails.
- The dashboard pairs the same way with a QR code that the phone scans.

### 3. Deploy

```
dukoi deploy ./my-api
```

1. **Pack.** The CLI tars the folder (skipping `node_modules`, `.git` and anything in `.gitignore`) and signs the request.
2. **Upload.** The agent verifies the key and saves the bundle.
3. **Unpack.** It becomes a new release: `apps/my-api/releases/<id>/`.
4. **Install.** `npm install` runs with the bundled Node. Static sites skip this step.
5. **Start.** The process manager starts the release on a free port and passes `PORT`.
6. **Health check.** The new release must answer HTTP on its port. Workers must stay up for a few seconds.
7. **Switch.** Traffic moves to the new release only after it passes. Then the old one stops.
8. **Report.** The CLI prints the local URL, plus the public URL if a tunnel exists.

If any step fails, the old release keeps running and the CLI shows a clear error.

### 4. Keeping apps alive

| Event | What happens |
| --- | --- |
| App crashes | Restart with doubling backoff. After 5 tries, no more than one restart every 30 seconds. |
| Android kills the app | The watchdog notices and restarts it within 5 seconds, and records the reason. |
| App passes its memory limit | Restart. |
| Phone gets hot (above 43 °C) | Pause apps marked Low. Resume them below 40 °C. |
| Phone reboots | The service starts on boot and restores every app that was running. |
| Phone unplugged | Power cut alert within 30 seconds. |
| Wi-Fi drops | `cloudflared` reconnects, and the public URL works again within 10 seconds. |

### 5. Rollback

The phone keeps the last 5 releases. A rollback points the app at an earlier release folder and restarts it, which takes about a second because there's nothing to reinstall.

---

## Ports and boundaries

| Thing | Listens on | Reachable from |
| --- | --- | --- |
| Admin API | One port on the LAN, using TLS and signed requests | Paired computers only |
| Each app | Its own port | The LAN (local URL), and the internet through the tunnel if exposed |
| Dashboard | `127.0.0.1:7071` on the computer | That computer only. It also rejects requests whose `Host` isn't `127.0.0.1` or `localhost`. |

The tunnel only ever maps to app ports. A security test from outside should find nothing else.

---

## Data on the phone

All of this lives in Dukoi's private app storage:

```
dukoi/
├── state.db                 # apps, releases, paired keys, audit log, settings
├── apps/
│   └── my-api/
│       ├── releases/
│       │   ├── 0005/        # current
│       │   ├── 0004/
│       │   └── ...          # last 5 kept
│       ├── data/            # persists across releases (SQLite files etc.)
│       ├── env.enc          # secrets, encrypted with a Keystore key
│       └── logs/            # rotated, 5 MB cap per app
└── tunnels/                 # Custom domains: Cloudflare login cert, tunnel credentials, config.yml
```

- `data/` is shared across releases, so an app's database survives a redeploy or rollback.
- Shared storage is off by default. Turning it on needs an explicit setting and the "All files access" permission.

---

## Repo layout

```
dukoi/
├── android/          # Phone app and foreground service (Kotlin)
├── agent/            # Admin API, process manager, deploys, tunnels (TypeScript on Node)
├── cli/              # dukoi CLI (TypeScript)
├── dashboard/        # Web dashboard (SvelteKit 3 server with remote functions)
├── shared/           # Admin API types and protocol, shared by agent, cli and dashboard
├── starters/         # the templates: static-site, notes-api, file-drop, mcp-server, telegram-bot, webhook-inbox, uptime-watch, cron-jobs
├── scripts/          # Fetch and pack Node + cloudflared into jniLibs
└── docs/             # You are here
```

---

## Later phases

The phase 1 shape is built to grow without a rewrite:

- **More runtimes** (phase 2): the process manager starts a different bundled binary. The rest stays the same.
- **Phone hardware API** (phase 3): a new local-only API served by the foreground service, behind a permission gate the owner controls.
- **Fleets** (phase 3): a computer can already pair with many phones. Scaling adds a coordinator and load balancing on top.
- **Hosted relay** (phase 3): an alternative to `cloudflared` in the same tunnel slot.
