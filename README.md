# Dukoi

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Copyright](https://img.shields.io/badge/©-THISUX%20Private%20Limited-111111.svg)](NOTICE)

Deploy real apps to old Android phones. One command. No root, no Termux, no cloud bill.

A 2019 flagship has more compute than a $5 server, draws 2 to 5 watts, and its battery works like a built-in UPS. Dukoi turns it into an app server: install one APK, pair the phone with your computer, run `dukoi deploy` and get a live URL.

## Quick start

1. Install the Dukoi APK on a spare Android phone (Android 10 or newer, arm64) and follow the four setup steps on screen.
2. On your computer, install the CLI (on Windows: `irm https://dukoi.com/install.ps1 | iex` in PowerShell), then pair on the same Wi-Fi:

```bash
curl -fsSL https://dukoi.com/install | sh
```

```bash
dukoi pair
```

3. In your app's folder:

```bash
dukoi deploy
```

You get a Wi-Fi URL straight away. `dukoi expose` adds a public HTTPS URL through Cloudflare, and `--domain api.example.com` puts it on your own domain.

> Dukoi is in early development. Download the APK from [dukoi.com/download/dukoi.apk](https://dukoi.com/download/dukoi.apk) once the first release is out, or build it from this repo (see below).

## What you get

- **Apps that stay up.** A foreground service, auto-restart and guided setup that beats each brand's app killer.
- **Public URLs without port forwarding.** Quick links or your own domain through Cloudflare, even behind CGNAT.
- **Releases and rollback.** Every deploy is a release; `dukoi rollback` goes back in seconds.
- **Logs and health everywhere.** On the phone, in the CLI and in the web dashboard (`dukoi dashboard`).
- **Safe by default.** Pairing with keys, no passwords, and the admin API never goes through a tunnel.

## Commands

| Command | What it does |
| --- | --- |
| `dukoi pair` | Find a phone on this Wi-Fi and link it to this computer |
| `dukoi deploy` | Ship the app in this folder |
| `dukoi expose` | Give an app a public HTTPS URL |
| `dukoi ps` | All apps: status, CPU, memory, uptime, URL |
| `dukoi logs` | Recent lines, then live |
| `dukoi rollback` | Go back to the previous release |
| `dukoi dashboard` | Open the web dashboard on this computer |
| `dukoi skill` | Teach your coding agents (Claude Code, Codex, Cursor) to use Dukoi |

Every command and flag is in [docs/cli-reference.md](docs/cli-reference.md).

## Build from source

You need [Bun](https://bun.sh), and for the phone app, Android Studio's SDK and Google's [Android CLI](docs/android-cli.md).

```bash
bun install
bun test

# The phone app: fetch Node and cloudflared, bundle the agent, build and run
scripts/prepare-android.sh
cd android && ./gradlew assembleDebug
android run --apks=app/build/outputs/apk/debug/app-debug.apk

# The CLI and dashboard, from source
bun run cli pair
bun run --filter @dukoi/dashboard build && bun run cli dashboard
```

## Learn more

- [docs/mission.md](docs/mission.md): why Dukoi exists and who it's for
- [docs/architecture.md](docs/architecture.md): how the phone app, agent, CLI and dashboard fit together
- [docs/roadmap.md](docs/roadmap.md): what's next
- [docs/README.md](docs/README.md): every doc
- [AGENTS.md](AGENTS.md): for people and AI agents working in this repo
- [site/](site): the landing page and the user guide, live at [dukoi.com](https://dukoi.com)
- [CONTRIBUTING.md](CONTRIBUTING.md): set up the repo and send a pull request
- [SECURITY.md](SECURITY.md): report a vulnerability privately
- [CHANGELOG.md](CHANGELOG.md): what changed in each version

## License

Copyright © 2026 [THISUX Private Limited](https://github.com/thisuxhq).

Dukoi is released under the [Apache License 2.0](LICENSE). You can use, change and share it, for personal or commercial work, as long as you keep the copyright and license notices and the [NOTICE](NOTICE) file. The license also grants you a patent license from everyone who contributes.
