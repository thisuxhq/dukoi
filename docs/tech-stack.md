# Tech stack

This doc lists what DroidHost is built with and why. Some choices come straight from the PRD and others are proposals.

Each choice is marked:

- **Decided** means it's fixed by the PRD.
- **Proposed** means it's our best default. Change it with a short note in the [decision log](decisions.md).

The rule for picking tools: **the fewest moving parts that do the job well.**

---

## At a glance

| Part | Runs on | Built with | Status |
| --- | --- | --- | --- |
| Control app | Phone | Kotlin, Jetpack Compose | Decided (Kotlin), Proposed (Compose) |
| Agent and admin API | Phone | Kotlin, Ktor server, inside the foreground service | Proposed |
| Process manager | Phone | Kotlin, inside the foreground service | Proposed |
| App runtime | Phone | Node.js 22, bundled as `lib*.so` | Decided |
| Tunnel | Phone | `cloudflared`, bundled as `lib*.so` | Decided |
| CLI | Computer | TypeScript on Node.js, shipped on npm | Proposed |
| Web dashboard | Computer | SvelteKit (static), shadcn-svelte, served by the CLI | Proposed |
| Starters | Phone | Hono, `@hono/node-server`, `node:sqlite` | Decided |
| Distribution | | GitHub Releases, F-Droid, then Play Store | Decided |

---

## Phone

### Android target

- **Decided:** arm64 (`arm64-v8a`) only, on Android 10 (API 29) and newer.
- The lowest version is still an open question (10 or 12). We start at 10 because it reaches more drawer phones.

### Control app: Kotlin

- **Decided:** Kotlin for the Android app.
- **Proposed:** Jetpack Compose for the UI. It's the modern default, needs less code and is easy to theme.
- This app handles the setup checklist, device health score, pairing approval, app list, logs and alerts.

### Foreground service

- **Decided:** a foreground service of type `specialUse` with a persistent notification.
- This is what Android keeps alive. Anything else we start runs as a child of this service.

### Agent and process manager: Kotlin in the same service

- **Proposed:** write the agent (admin API) and process manager in Kotlin, running inside the foreground service. Use Ktor server for HTTP and WebSocket.
- **Why:** Android protects the service, so it's the safest place for the supervisor. If the supervisor were itself a Node process, Android could kill it as a "phantom process", and nothing would be left to restart the apps. Keeping it in Kotlin also gives us direct access to battery, thermal, boot and network APIs.

### Bundled binaries

- **Decided:** Node.js 22 and `cloudflared` ship inside the APK as native libraries.
- They're packaged as `lib*.so` files in `jniLibs/arm64-v8a`, with `extractNativeLibs="true"`, and run from `nativeLibraryDir`.
- **Why:** Android 10 and newer won't run binaries from app data storage. Native libraries are the allowed way.
- `npm` runs through the bundled Node (`node npm-cli.js`).

### Storage on the phone

- App folders, releases, logs and the agent's own state live in DroidHost's private app storage.
- **Proposed:** the agent stores its own state (apps, releases, paired keys and the audit log) in SQLite through Android's built-in SQLite. We don't need an extra database.
- Secrets are encrypted with a key held in the Android Keystore.

---

## Computer

### CLI: TypeScript on Node.js

- **Proposed:** TypeScript, published to npm as `droidhost`, so `npx droidhost` works with no install.
- **Why:** our users already have Node. It shares types with the dashboard and starters, and it's easy for contributors to read.
- Keep dependencies few. Prefer Node's built-ins such as `fetch`, `node:crypto`, `node:test` and `util.parseArgs`.
- Packing uses tar plus gzip, and ignores `node_modules`, `.git` and anything in `.gitignore`.
- Phone discovery on Wi-Fi uses mDNS. The phone advertises itself with Android's NSD.

### Web dashboard: SvelteKit static

- **Proposed:** a SvelteKit app built as static files and served by `droidhost dashboard` on `localhost`.
- UI components come from shadcn-svelte. Icons are Hugeicons (stroke-rounded), copied into the repo as SVGs.
- **Why on the computer:** it keeps the admin API private. The dashboard talks to the phone through the CLI's paired channel, never through the internet. The hosted dashboard is a later Pro feature.

---

## Between them

### Pairing and auth

- **Decided:** signed device keys, approved on the phone with a matching code or QR. No passwords.
- **Proposed:**
  - The computer makes an Ed25519 key pair. The private key stays in the user's config folder.
  - The phone stores the approved public key.
  - Each admin request is signed. The phone rejects unknown or removed keys at once.
  - The channel is TLS with the phone's self-signed certificate. The CLI pins its fingerprint at pairing time.

### Admin transport

- **Proposed:** HTTPS for commands and WebSocket for live logs and metrics. One port on the local network only.
- The admin port never goes through a tunnel.

### Public URLs

- **Decided:** Cloudflare quick tunnels for instant URLs, and named tunnels for custom domains.
- `cloudflared` only makes outbound connections, so it works behind CGNAT.

---

## Starters

- **Decided:** Hono with `@hono/node-server`, and Node's built-in `node:sqlite` for data.
- **Why:** no native modules, so they install on a phone without a compiler.
- The five starters are Hono API, Telegram bot, static site, file storage API and MCP server.

---

## Repo and tooling

- **Proposed** layout. Details are in [architecture.md](architecture.md#repo-layout).
- **Proposed** JS and TS tools: pnpm workspaces, Biome for lint and format, Vitest for tests.
- **Proposed** Android tools: Gradle with Kotlin DSL, ktlint, and JUnit with Robolectric for unit tests.
- **Proposed** CI: GitHub Actions to build the APK and CLI on every PR. Device lab runs stay manual in phase 1.
- **Proposed** load testing: `oha` (from the PRD's device lab plan).

---

## Not in phase 1

To keep the stack small, these are left out on purpose. Each one returns in a later phase:

- Docker or containers
- Python, Go and Rust runtimes
- Postgres and Redis
- A hosted relay or hosted dashboard
- Phone hardware APIs (SMS, camera and so on)
