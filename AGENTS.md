# DroidHost

DroidHost turns old Android phones into app servers. You install one APK, pair the phone with your computer, run `droidhost deploy` and get a live URL. No root, no Termux, no cloud bill.

This file is for AI coding agents and people working in this repo. `CLAUDE.md` is a symlink to it, so edit this file only.

## Start here

- `README.md` is the front page for visitors: what DroidHost is and the quick start.
- `docs/README.md` is the index of every doc.
- `docs/mission.md` says what we build and who for.
- `docs/architecture.md` explains how the parts fit together.
- `docs/decisions.md` lists what's decided, what's proposed and what's still open. Add an entry when you make a choice that's hard to undo.

## Where things are

| Path | What it holds |
| --- | --- |
| `android/` | The phone app (Kotlin). Keeps the agent alive, runs setup and approves pairing. |
| `agent/` | Runs on the phone on bundled Node: admin API, process manager, deploys, logs, tunnels |
| `cli/` | The `droidhost` command |
| `dashboard/` | The web dashboard: a SvelteKit 3 server with remote functions, started by `droidhost dashboard` on `127.0.0.1` |
| `site/` | The landing page and the user guide at `/docs`: a static SvelteKit 3 site (D-110) |
| `shared/` | Admin API types, request signing and archives, used by the agent, CLI and dashboard |
| `starters/` | Apps that deploy with zero edits |
| `docs/` | Product and engineering docs |
| `spikes/` | Throwaway experiments. `node-survival` proved Node runs and survives; `cloudflared` proved public URLs work. |
| `scripts/` | Build helpers (see below) |
| `build/` | Local build output, ignored by git |

## Commands

```bash
bun install                  # once
bun test                     # all TypeScript tests
bun run typecheck            # TypeScript in every package
bun run lint                 # Biome
bun run cli <command>        # run the CLI from source, e.g. bun run cli pair
bun run --filter @droidhost/dashboard build && bun run cli dashboard   # the web dashboard
bun run --filter @droidhost/site dev        # the landing page; build/ holds the static site after `build`

scripts/prepare-android.sh   # fetch Node and bundle the agent into the APK
cd android && ./gradlew assembleDebug
android run --apks=app/build/outputs/apk/debug/app-debug.apk
```

We use Bun for installs, tests and bundling, with Bun workspaces. The agent runs on **Node** on the phone (Bun has no Android build), so agent and shared code must stick to Node APIs: no `Bun.*`. `bun run build` bundles the agent and CLI for Node with `bun build --target=node`.

## Node for Android

- We bundle **Node.js 24 LTS**, built from the official source and published as a GitHub Release (`node-v24.22.2-android-arm64`).
- **Never rebuild Node for app work.** Run `scripts/fetch-node.sh`. A rebuild takes about an hour, so do it only when upgrading Node, then publish a new release.
- The binary ships inside the APK as `jniLibs/arm64-v8a/libnode.so`, because Android 10+ only runs binaries from `nativeLibraryDir`.
- `cloudflared` works the same way: our Android build is a GitHub Release (`cloudflared-2026.10.7-android-arm64`), fetched by `scripts/fetch-cloudflared.sh`, shipped as `libcloudflared.so`. Cloudflare's own Linux build can't resolve DNS on Android.
- `scripts/prepare-android.sh` fetches both and bundles the agent. Run it before building the APK.

## Android work

- Use Google's Android CLI (`android`) for every Android task it supports: `android create`, `android run --apks=<apk>`, `android install`, `android screen capture`, `android layout`, `android emulator`, `android sdk` and `android docs`.
- `android run` doesn't build. Build with `./gradlew assembleDebug` first.
- Use `adb` only where `android` has no command, such as `adb shell input` for taps, `kill`, `reboot` and `device_config`. Say why when you do.
- See `docs/android-cli.md`.

## How we work

- **Frictionless first.** The goal is a working URL in under two minutes. Detect instead of asking, and use good defaults instead of options. See `docs/principles.md`.
- **Boring code.** Keep solutions simple enough that nobody needs a PhD to read them. See `docs/dx-principles.md`.
- **Plain words.** User-facing text, errors and docs follow `docs/writing-style.md`. Errors say what happened and what to do next.
- **Safe by default.** The admin API never goes through a tunnel, secrets are never printed, and there are no passwords. See `docs/security.md`.
- **Docs move with code.** If behaviour changes, update the doc in the same commit.

## Icons

Hugeicons stroke-rounded SVGs, copied into the repo. No other icon set.

## Things to watch out for

- Don't touch personal content on a test phone. Lock screens show notifications, so don't read or relay them.
- Don't enter a PIN or password on a device. Ask the person to unlock it.
- Reboots and other disruptive device actions need a yes first.
