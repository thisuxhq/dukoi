# Deploy and releases

This doc explains what happens between `droidhost deploy` and a live URL, and how releases and rollback work.

**The promise:** a Hono API goes live in under 2 minutes, and a bad deploy never takes down the good one.

---

## The deploy pipeline

```
 CLI (computer)                    Agent (phone)
 ─────────────                     ─────────────
 1. Detect     ─┐
 2. Pack        │
 3. Sign        │
                └──── upload ────▶ 4. Verify key
                                   5. Unpack to releases/<id>/
                                   6. Install (npm install)
                                   7. Start on a free port
                                   8. Health check
                                   9. Switch traffic, stop old
 11. Print URLs ◀──── result ───── 10. Record in audit log
```

The CLI shows each step as it happens. If any step fails, **the old release keeps running** and the CLI says why.

---

## Step by step

### 1. Detect

| What | Rule |
| --- | --- |
| Type | Node app if `package.json` is present. Static site if there's an `index.html` and no `package.json`. |
| Name | `droidhost.json` `name`, then `package.json` `name`, then the folder name. |
| Start | `droidhost.json` `start`, then `scripts.start`, then `node <main>`, then `node index.js`. |
| Build | If `scripts.build` exists, the CLI runs it **on the computer** before packing. Phones are slow builders. |

### 2. Pack

- The folder is packed as `tar.gz`.
- Always skipped: `node_modules`, `.git`, `.env*` and anything in `.gitignore`.
- The lockfile is included, so installs are repeatable.
- Bundles over 100 MB get a warning. That's almost always `node_modules` or media by mistake.

### 3 and 4. Sign and verify

The request is signed with the computer's device key. See [security.md](security.md#pairing-and-keys).

### 5. Unpack

Each deploy becomes a numbered release:

```
apps/my-api/releases/0006/
```

### 6. Install

- Runs `npm ci` if there's a lockfile, otherwise `npm install --omit=dev`, using the bundled Node.
- **It's skipped** if `package.json` and the lockfile haven't changed since the last release. The previous `node_modules` is copied instead, which makes redeploys fast.
- Static sites skip this step.
- Native modules are caught here. See [Native modules](#native-modules).

### 7. Start

- The process manager picks a free port and passes it as `PORT`.
- Secrets are decrypted and passed as environment variables.
- `NODE_ENV=production` is set.
- Static sites are served by a small built-in static server.

### 8. Health check

| App kind | Check | Time limit |
| --- | --- | --- |
| Web app (opens a port) | `GET /` (or `healthCheck` path) returns any non-5xx | 10 seconds |
| Worker (no port) | The process stays up | 5 seconds |

### 9. Switch

- The new release passes, so local and tunnel traffic now point to its port.
- The old release gets `SIGTERM`, then `SIGKILL` after 5 seconds.
- **This gives zero-downtime redeploys.** The old one stops only after the new one is healthy.

### 10 and 11. Record and report

The audit log gets an entry. The CLI prints the local URL, the public URL if exposed, and the release ID.

---

## Releases

- The phone keeps the **last 5 releases** per app. Older ones are deleted after a successful deploy.
- `data/` lives **outside** releases, so databases and uploads survive deploys and rollbacks.

```
apps/my-api/
├── releases/
│   ├── 0006/   ← live
│   ├── 0005/
│   ├── 0004/
│   ├── 0003/
│   └── 0002/
└── data/       ← shared by all releases
```

## Rollback

```bash
droidhost rollback            # previous release
droidhost rollback --to 0004  # a specific one
```

- Points the app at the earlier release and restarts it. Its `node_modules` is already there.
- It takes **about 1 second**.
- It doesn't touch `data/`. If a release changed your database schema, rolling back the code won't undo that.

---

## Native modules

Phones can't compile native npm modules in phase 1. The phone has no compiler toolchain.

When install fails because of native code, the CLI names the module and suggests a pure-JS option:

| Native module | Try instead |
| --- | --- |
| `sharp` | `jimp` |
| `bcrypt` | `bcryptjs` |
| `better-sqlite3`, `sqlite3` | `node:sqlite` (built into Node 22) |
| `canvas` | `@napi-rs/canvas` (prebuilt arm64), or do it client side |
| `argon2` | `@node-rs/argon2` (prebuilt arm64) or `hash-wasm` |

Packages that ship **prebuilt** `linux-arm64` binaries can work, although Android isn't regular Linux, so test them on the device lab. A remote builder for native modules comes in phase 2.

---

## Errors you might see

| Error | What it means | Fix |
| --- | --- | --- |
| `NO_START` | We couldn't find how to start the app. | Add `scripts.start` to `package.json`. |
| `NATIVE_MODULE` | A dependency needs a compiler. | Use the suggested pure-JS package. |
| `HEALTH_TIMEOUT` | The app started but didn't answer on `PORT`. | Make sure the app listens on `process.env.PORT`. |
| `CRASHED_ON_START` | The app exited during the health check. | Run `droidhost logs` to see why. |
| `DISK_FULL` | The phone is out of storage. | Remove old apps, or free space on the phone. |
| `SETUP_INCOMPLETE` | The deploy worked, but the phone may kill the app. | Finish the checklist on the phone. |
