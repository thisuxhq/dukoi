# Changelog

All notable changes to Dukoi are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.8.0] - 2026-11-13

### Added

- Use Dukoi away from home with [Tailscale](https://tailscale.com). Sign the phone and the computer in to the same tailnet and every command reaches the phone from any network. `dukoi pair` finds phones on your tailnet too. See [Use it away from home](https://dukoi.com/docs/pairing#away-from-home).

### Changed

- The CLI and dashboard follow the phone when its address changes, on the same Wi-Fi, a hotspot or Tailscale. They find it by its key and remember the new address, so there's no timeout and no pairing again.
- App and database URLs show the address this computer reaches the phone on, so they open from where you are.
- When the phone can't be found, the error says why: Tailscale off on this computer, the phone offline on Tailscale, or not on this Wi-Fi. It fails in seconds, not 15.

## [0.7.0] - 2026-11-13

### Added

- The phone app has Apps and Templates tabs at the bottom. Templates makes a Redis or Postgres database right on the phone, picks the apps that get its URL, and deploys any app template. Each database has its own screen with its URL, Wi-Fi access, a new password, the apps using it and its logs, and Home lists your databases under your apps.

### Changed

- The phone app's screens use narrower side margins, so more fits on a phone screen.

## [0.6.0] - 2026-11-13

### Added

- Redis and Postgres on the phone. Make one from the dashboard's new **Templates** page or with `dukoi db create redis --app my-api`, and the apps you pick get `REDIS_URL` or `DATABASE_URL` and restart. Redis is [Valkey](https://valkey.io) 9.1 and Postgres is [PGlite](https://pglite.dev) (Postgres 18). Every database has its own password, and data survives restarts and reboots. Tick **Also reachable on Wi-Fi** (or `dukoi db wifi`) to connect from your computer. Postgres uses about 400 MB of memory. Update the phone app to get it. A new [Databases](https://dukoi.com/docs/databases) page explains it.
- The dashboard has **Apps** and **Templates** tabs. Templates lists the databases and the eight app templates; pick one and it's on the phone in seconds. Each database has its own page with its URL, the apps using it and its logs.
- `dukoi db` lists, connects, opens to Wi-Fi, makes new passwords for and removes databases. See `dukoi --help`.

### Fixed

- Buttons in the dashboard work again. The server assumed `https` and turned away every action, like Restart and Roll back, as cross-site.

## [0.5.0] - 2026-11-13

### Added

- `dukoi update` updates the CLI, the dashboard, the templates and the agent skill to the latest release, on macOS, Linux and Windows. When the phone app is newer than the CLI, the error now says to run it.

### Changed

- Running the install script again to update no longer ends with "Next: dukoi pair".

## [0.4.3] - 2026-11-13

### Fixed

- Releases run on a Blacksmith Mac. The move to Blacksmith put them on a Linux runner, which has no Android SDK and can't sign the macOS CLI, so 0.4.2 never shipped. Its fix is in this release.
- Ctrl+C now stops `dukoi dashboard` straight away. With a dashboard tab open, it used to wait until you closed the tab.

## [0.4.1] - 2026-11-13

### Fixed

- Each `dukoi bench` test now ends on time. A request that never got an answer could keep a test waiting, so every request now has its own 10-second limit, and anything still waiting when time is up is dropped and not counted.
- dukoi.com/bench says "1 phone, 1 run", not "1 phones, 1 runs".

### Changed

- Our first lab phone, a Nothing Phone (3), is now on [dukoi.com/bench](https://dukoi.com/bench) with the Lab badge.

## [0.4.0] - 2026-11-13

### Added

- `dukoi bench` measures how fast your phone is. It deploys a small notes API, loads it with 50 connections over Wi-Fi, through a quick link and again after 10 minutes, then removes it and prints requests a second, p99 latency and the battery temperature. `--quick` takes about 3 minutes instead of 13. Nothing to install, but update the phone app too: the temperature and `--share` need it.
- `dukoi bench --share` adds your result to [dukoi.com/bench](https://dukoi.com/bench), which compares phone models by the median of everyone's runs. The phone signs the result, and nothing personal is sent. A new [Benchmark your phone](https://dukoi.com/docs/bench) page explains it.
- `dukoi status --json` now includes the phone's maker and chip.

## [0.3.0] - 2026-11-12

### Added

- The Dukoi skill for coding agents. Installing the CLI now teaches Claude Code, Codex, Cursor, Gemini CLI and OpenCode what runs on the phone and every command, so "build a bot and deploy it to my phone" works the first time. `dukoi skill` adds it to an agent you install later, and `npx skills add thisuxhq/dukoi` adds it without the CLI. A new [AI agents](https://dukoi.com/docs/ai-agents) page explains it, and the skill is also at dukoi.com/skill.md.

## [0.2.1] - 2026-11-12

### Fixed

- A quick link keeps its URL when the Dukoi agent restarts. Before, every restart asked Cloudflare for a new link and left the old tunnel running, which used up Cloudflare's limits faster.
- When a custom domain can't be set up, the phone now shows Cloudflare's reason, not just "cloudflared failed".

## [0.2.0] - 2026-11-12

### Added

- Three new templates. **Webhook inbox** gives you an address for webhooks and shows each one as it arrives. **Uptime watch** checks your sites every minute and sends a push through ntfy when one goes down. **Cron jobs** runs your code on a schedule and shows how each run went. Start one with `dukoi init`, or from **Try a template** on the phone.

## [0.1.1] - 2026-11-12

### Changed

- Buttons on the phone that wait on something slow, like Get quick link, Use domain, Disconnect and Deploy, now show three rippling dots beside what they're doing, and ignore taps until it's done.

### Fixed

- `dukoi` no longer gets killed on start on some Apple Silicon Macs (`zsh: killed dukoi pair`). Bun wrote the macOS binaries with a broken signature, so the build now signs them again and checks them. The installer repairs a 0.1.0 download that's already broken, and stops with a clear error if `dukoi` won't start instead of saying it installed.

## [0.1.0] - 2026-11-11

The first version. Get the phone app from [dukoi.com/download/dukoi.apk](https://dukoi.com/download/dukoi.apk) and the CLI with `curl -fsSL https://dukoi.com/install | sh`.

### Added

- The phone app: a foreground service that keeps the agent alive, guided setup past each brand's battery savers, pairing approval on the phone and Try a template.
- The agent on bundled Node.js 24: a signed admin API, a process manager with auto-restart, releases and rollback, logs and health.
- The `dukoi` CLI: `pair`, `devices`, `unpair`, `init`, `deploy`, `start`, `stop`, `restart`, `releases`, `rollback`, `remove`, `expose`, `env`, `ps`, `logs`, `status` and `dashboard`. Every command takes `--json`.
- One-line install for the CLI: `curl -fsSL https://dukoi.com/install | sh` on macOS and Linux, `irm https://dukoi.com/install.ps1 | iex` on Windows. It installs a standalone program, so static sites deploy without Node.
- Public URLs through Cloudflare quick tunnels, or your own domain with `dukoi expose --domain`.
- The web dashboard, run on your computer by `dukoi dashboard`.
- Five templates: static-site, notes-api, file-drop, mcp-server and telegram-bot.
- The landing page and user guide at [dukoi.com](https://dukoi.com).
- The Apache License 2.0, a NOTICE file, and the contributing guide, code of conduct, security policy and issue templates.

### Changed

- DroidHost is now called Dukoi. The command is `dukoi`, the app ID is `com.thisux.dukoi` and the config folder is `~/.config/dukoi`. The CLI moves an old `~/.config/droidhost` folder over by itself. Phones with DroidHost installed need the new APK and a fresh pairing.

[Unreleased]: https://github.com/thisuxhq/dukoi/compare/v0.8.0...main
[0.8.0]: https://github.com/thisuxhq/dukoi/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/thisuxhq/dukoi/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/thisuxhq/dukoi/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/thisuxhq/dukoi/compare/v0.4.3...v0.5.0
[0.4.3]: https://github.com/thisuxhq/dukoi/compare/v0.4.1...v0.4.3
[0.4.1]: https://github.com/thisuxhq/dukoi/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/thisuxhq/dukoi/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/thisuxhq/dukoi/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/thisuxhq/dukoi/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/thisuxhq/dukoi/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/thisuxhq/dukoi/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/thisuxhq/dukoi/releases/tag/v0.1.0
