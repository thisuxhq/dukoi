# Changelog

All notable changes to Dukoi are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/thisuxhq/dukoi/commits/main
[0.1.0]: https://github.com/thisuxhq/dukoi/commits/main
