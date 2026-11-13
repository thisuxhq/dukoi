# Databases

This doc explains how Dukoi runs Redis and Postgres on the phone, next to the apps, and how apps get to them.

**The promise:** pick Redis or Postgres, tick the apps that need it, and they get a working URL as `REDIS_URL` or `DATABASE_URL`. Nothing to install, configure or copy by hand.

---

## What runs

| Kind | Engine | Process | Default port |
| --- | --- | --- | --- |
| Redis | Valkey 9.1 (BSD-licensed Redis, same protocol) | `libvalkey.so` from the APK | 6380 |
| Postgres | PGlite 0.5 (Postgres 18 compiled to WebAssembly) | Node running `postgres.mjs` | 5433 |

- **Valkey, not Redis 8.** Redis 8 is AGPL/SSPL, which we'd have to ship with its source and licence. Valkey is BSD, made from Redis 7.2 by the Linux Foundation, and every Redis client works with it (D-120).
- **PGlite, not native Postgres.** Postgres needs System V shared memory, which Android doesn't have. PGlite runs on the Node we already ship, so there's no native build (D-121).
- **Ports start at 6380 and 5433**, one above the usual ones, so a phone that already runs something on 6379 or 5432 doesn't clash. Each database keeps its port for good, and a second one gets the next free port.

## Where it lives

```
<home>/databases/<name>/
├── data/        # Valkey's append-only file and snapshots, or PGlite's data folder
├── logs/db.log  # the database's own output and Dukoi's notes, rotated at 5 MB
└── run/
    ├── db.pid
    └── valkey.conf  # Redis only: port, bind, password. Mode 600, so it's private
```

The list itself is `databases` in `state.json`: name, kind, port, password, Wi-Fi on or off, connected apps and whether it should be running.

## Passwords, always

Every database has a password, even when only the phone's apps use it. Any Android app on the phone can reach `127.0.0.1`, so "local only" isn't private on its own.

- The agent makes a 24-character URL-safe password when it creates the database, so the URL needs no escaping.
- **Redis:** Valkey's own `requirepass`, written to `valkey.conf`, so it's not in the process list. URLs use the `default` user (`redis://default:<password>@…`), which both `valkey-cli` and the Node clients accept.
- **Postgres:** PGlite has no logins, so `postgres.mjs` checks the password first. It reads the client's startup message, asks for a plain password (Postgres's `AuthenticationCleartextPassword`), compares it and only then hands the connection to PGlite. Nothing else listens: PGlite's own socket server never opens a port, so nothing can skip the check. Wrong passwords get Postgres's usual `28P01` error.
- **New password** makes a fresh one, restarts the database with it and gives connected apps the new URL. The old one stops working at once.

## Connecting apps

Connecting an app sets its `REDIS_URL` or `DATABASE_URL` setting, exactly like `dukoi env set`, which restarts it once. Disconnecting or deleting the database removes that setting. Removing an app drops it from every database's list.

URLs always point at `127.0.0.1`, so they keep working when the phone's Wi-Fi address changes.

## Wi-Fi access

Off by default. Turned on, the database listens on `0.0.0.0` instead of `127.0.0.1`, and Dukoi shows a second URL with the phone's current Wi-Fi address, worked out each time it's read. It's the same password. Databases never go through a tunnel, so there's no public URL.

Passwords cross the Wi-Fi in plain text (Redis `AUTH` and Postgres's plain password both do), so turn it on only on a network you trust.

## Lifecycle

- **Create** starts the process and waits until its port takes connections, up to 60 seconds, because PGlite's first start sets up its files and that's slow on an old phone. If it doesn't come up, the database is removed again and the error shows its last log lines.
- **Keep alive:** the same process supervisor as apps, with the same restart backoff.
- **Agent restart:** databases start before apps, so apps find them up. A database left running by an agent that was killed is found by its pid file and stopped first. Valkey runs with `set-proc-title no` so its command line still names the binary we check for.
- **Wi-Fi and password changes** restart the database. Apps reconnect by themselves.

## Memory

| Kind | Idle | Notes |
| --- | --- | --- |
| Redis | about 10 MB | Grows with your data |
| Postgres | about 400 MB | PGlite reserves WebAssembly memory up front. The create panel says so |

## The API

All on the admin API, signed by a paired computer, and under `/local` for the phone app.

| Method and path | Does |
| --- | --- |
| `GET /database-kinds` | Redis and Postgres, and whether this build can run each |
| `GET /databases` | All of them, with URLs (passwords included) |
| `POST /databases` | `{ kind, name?, apps?, wifi? }` |
| `GET /databases/:name` | One |
| `PATCH /databases/:name` | `{ wifi?, newPassword?, connect?, disconnect? }` |
| `DELETE /databases/:name` | Stops it, deletes its data, takes its URL from the apps |
| `POST /databases/:name/start`, `stop`, `restart` | |
| `GET /databases/:name/logs` | `?lines=` and `?follow=1`, like an app's logs |

URLs with passwords go only to paired computers, over signed requests. `dukoi db` and the dashboard show them masked, and only `dukoi db url` and the copy buttons give the full one.

## Building the binaries

- **Valkey:** `scripts/build-valkey-android.sh` builds it with the Android NDK on a Mac (about a minute) and `scripts/fetch-valkey.sh` downloads the published build from the `valkey-9.1.3-android-arm64` GitHub Release. Three small changes make it build against Android's C library; the script explains each.
- **Postgres:** `bun run build` in `agent/` bundles `src/postgres-server.ts` into `dist/postgres/postgres.mjs` and copies PGlite's `.wasm` and `.data` files next to it. `scripts/prepare-android.sh` puts the folder in the APK as `assets/postgres/`, and the phone app copies it out after each install or update and passes its path in `DUKOI_POSTGRES`.
- PGlite and its socket package are pinned exactly, because `postgres.mjs` uses PGlite's connection handler without its listener.
