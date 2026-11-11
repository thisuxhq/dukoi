# Decisions

This doc is the decision log. It records what we decided, why we decided it, and what's still open.

**How to use it:** when you make a choice that's hard to undo or that someone will ask "why?" about, add an entry. Keep it short. To change a decision, add a new entry that replaces the old one. Don't edit history.

### Entry template

```md
### D-000: Title
- **Status:** Proposed | Decided | Replaced by D-xxx
- **Date:** YYYY-MM-DD
- **Decision:** One sentence.
- **Why:** One to three sentences.
- **Trade-off:** What we give up.
```

---

## Decided (from the PRD)

### D-001: Bundle Node and cloudflared as native libraries
- **Status:** Decided
- **Date:** 2026-11-10
- **Decision:** Ship binaries as `lib*.so` in `jniLibs/arm64-v8a` with `extractNativeLibs="true"`, and run them from `nativeLibraryDir`.
- **Why:** Android 10 and newer block running binaries from app data. Native libraries are the allowed path.
- **Trade-off:** A larger APK, and arm64 only.

### D-002: Foreground service of type `specialUse`
- **Status:** Decided
- **Date:** 2026-11-10
- **Decision:** All work runs under one foreground service with a persistent notification.
- **Why:** It's the strongest protection Android gives against background kills, and it fits Android 14 and 15 service type rules.
- **Trade-off:** A notification that's always showing, and Play Store review of `specialUse` later.

### D-003: Starters use Hono and `node:sqlite`
- **Status:** Decided
- **Date:** 2026-11-10
- **Decision:** Starters use Hono with `@hono/node-server`, and Node's built-in SQLite.
- **Why:** No native modules, so they install on a phone with no compiler.
- **Trade-off:** No ORMs, and no Express-only middleware.

### D-004: Distribute through GitHub and F-Droid first
- **Status:** Decided
- **Date:** 2026-11-10
- **Decision:** No Play Store in phase 1.
- **Why:** Avoids Play policy risk on long-running services and bundled binaries while we iterate.
- **Trade-off:** Harder installs for less technical users.

### D-005: Admin API never goes through a tunnel
- **Status:** Decided
- **Date:** 2026-11-10
- **Decision:** Tunnels map only to app ports.
- **Why:** Control of the phone must never be reachable from the internet.
- **Trade-off:** No remote admin from outside Wi-Fi until the relay arrives.

### D-006: Telemetry is opt-in
- **Status:** Decided
- **Date:** 2026-11-10
- **Decision:** It's off by default and never includes code, logs or secrets.
- **Why:** Trust matters more than data.
- **Trade-off:** Metrics come from a smaller sample.

### D-007: Node.js 24 LTS, not Node 22
- **Status:** Decided
- **Date:** 2026-11-10
- **Decision:** Bundle Node.js 24 LTS. This replaces the PRD's Node 22.
- **Why:** Node 22 reaches end of life in April 2027, and Node 24 is the current LTS. `node:sqlite` works in both.
- **Trade-off:** None for phase 1. Our apps don't depend on anything specific to Node 22.

### D-008: Build Node for Android from the official source
- **Status:** Decided
- **Date:** 2026-11-10
- **Decision:** Build Node from the official nodejs.org source, checked against its SHA-256 list, once per Node version. Publish the result as a GitHub Release, and have builds fetch it (`scripts/fetch-node.sh`). Don't use community prebuilt binaries.
- **Why:** Node.js publishes no Android builds. Community builds come from unknown publishers, and this binary runs everyone's apps.
- **Trade-off:** A build takes about an hour, so we do it only when upgrading Node, and Node security updates are on us. It runs in a Linux container, because Node's Makefile passes GNU linker flags that macOS rejects. Everyday builds fetch the release in seconds.

---

## Proposed (in these docs, not yet confirmed)

### D-101: Agent and process manager in Kotlin inside the service
- **Status:** Replaced by D-107
- **Date:** 2026-11-10
- **Decision:** Write the admin API and supervisor in Kotlin (Ktor), not as a Node process.
- **Why:** Android protects the service. A Node supervisor could itself be killed as a phantom process, leaving nothing to restart apps.
- **Trade-off:** Two languages in the project, Kotlin and TypeScript.

### D-102: CLI in TypeScript on npm
- **Status:** Proposed
- **Date:** 2026-11-10
- **Decision:** Publish `droidhost` on npm so `npx droidhost` works.
- **Why:** Users already have Node, and it shares types with the dashboard.
- **Trade-off:** Needs Node on the computer. A single binary could come later.

### D-103: Dashboard served locally by the CLI
- **Status:** Proposed
- **Date:** 2026-11-10
- **Decision:** `droidhost dashboard` serves a static SvelteKit app on `localhost`, built with shadcn-svelte and Hugeicons.
- **Why:** Keeps the admin API private, with no hosting needed.
- **Trade-off:** No dashboard from your phone's browser or away from home in phase 1.

### D-104: Signed requests and responses, no TLS in phase 1
- **Status:** Decided (replaces "Ed25519 keys over TLS with a pinned certificate")
- **Date:** 2026-11-11
- **Decision:** The CLI signs every admin request with its Ed25519 key, plus a timestamp and nonce. The phone signs its JSON responses with its own Ed25519 key, which the CLI pinned at pairing. Plain HTTP on the LAN. Code: `shared/src/signing.ts`.
- **Why:** It stops fake phones, tampering and replays as well as TLS with a pinned certificate would, with no certificate generation on the phone and one small file of shared code.
- **Trade-off:** Traffic on the Wi-Fi isn't encrypted, so others on the same network can read app code being uploaded and log lines. Secrets (`droidhost env`) must be encrypted to the phone's key before they're sent. Add TLS or Noise later if that's not enough.

### D-105: Build on the computer, install on the phone
- **Status:** Proposed
- **Date:** 2026-11-10
- **Decision:** If there's a `build` script, the CLI runs it before packing. The phone only runs `npm ci`.
- **Why:** Phones are slow at builds, and computers are fast.
- **Trade-off:** The build output must not depend on the computer's OS.

### D-106: Repo tooling
- **Status:** Decided
- **Date:** 2026-11-10
- **Decision:** Bun for installs, workspaces, tests and bundling, plus Biome, for JS and TS. Gradle with Kotlin DSL, ktlint and JUnit for Android.
- **Why:** One fast tool for installing, testing and bundling, with little config.
- **Trade-off:** The agent runs on Node, not Bun, on the phone, so its code can't use Bun-only APIs. Contributors used to ESLint or Prettier have to adjust.

---

### D-107: Agent in TypeScript on the bundled Node, kept alive by Kotlin
- **Status:** Decided
- **Date:** 2026-11-11
- **Decision:** The Kotlin foreground service keeps exactly one process alive: the agent, a TypeScript program running on our bundled Node. The agent runs the admin API and the process manager for apps. Kotlin handles the setup checklist, pairing approval, Wi-Fi discovery (NSD) and the notification.
- **Why:** The agent and CLI share one language and one copy of the protocol code. Node already has crypto, HTTP, streams and zlib. The survival spike showed a Kotlin service brings a crashed or killed Node process back in about a second.
- **Trade-off:** If the agent restarts, admin commands pause for a second. The agent must restore running apps on start and clear any orphaned app processes.

### D-108: Install dependencies on the computer
- **Status:** Decided
- **Date:** 2026-11-11
- **Decision:** `droidhost deploy` runs `npm install --omit=dev` on the computer and uploads the app with its `node_modules`. The phone never runs npm.
- **Why:** The phone needs no npm, registry access or compiler. Native modules are caught on the computer, before upload, with a clear error.
- **Trade-off:** Uploads are bigger, and packages with platform-specific binaries won't work. Phase 1 doesn't support those anyway.

## Open questions

| Question | Options | Decides |
| --- | --- | --- |
| Final name | DroidHost, DroidHive, something else. Sister brand to DroidClaw, or standalone? | Branding, domain, npm name |
| Solo or with a cofounder? | | Pace, YC application |
| License | Apache 2.0 (adoption) or AGPL (protects against clones) | Contributors, business |
| Device lab models | Which Redmi and Oppo | Test coverage |
| Lowest Android version | 10 (reach) or 12 (simpler) | Setup steps, test matrix |
| First business angle | AI agents with phone hardware, or offline edge compute for Indian shops | Phase 2 priorities |
| 100 MB tunnel upload limit | Is chunking enough for the file storage starter? | Starter design |
| Is DroidHost the main bet? | Main bet, or one project of several | Any YC application |
