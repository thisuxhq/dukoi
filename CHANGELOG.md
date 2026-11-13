# Changelog

All notable changes to Dukoi are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/thisuxhq/dukoi/compare/v0.4.0...main
[0.4.0]: https://github.com/thisuxhq/dukoi/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/thisuxhq/dukoi/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/thisuxhq/dukoi/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/thisuxhq/dukoi/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/thisuxhq/dukoi/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/thisuxhq/dukoi/releases/tag/v0.1.0
