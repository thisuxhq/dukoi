# DroidHost

Deploy real apps to old Android phones. One command. No root, no Termux, no cloud bill.

A 2019 flagship has more compute than a $5 server, draws 2 to 5 watts, and its battery works like a built-in UPS. DroidHost turns it into an app server: install one APK, pair the phone with your computer, run `droidhost deploy` and get a live URL.

## Quick start

1. Install the DroidHost APK on a spare Android phone (Android 10 or newer, arm64) and follow the four setup steps on screen.
2. On your computer, on the same Wi-Fi:

```bash
npx droidhost pair
```

3. In your app's folder:

```bash
npx droidhost deploy
```

You get a Wi-Fi URL straight away. `npx droidhost expose` adds a public HTTPS URL through Cloudflare, and `--domain api.example.com` puts it on your own domain.

> DroidHost is in early development. The APK isn't on GitHub Releases yet and the CLI isn't on npm yet, so for now build both from this repo (see below).

## What you get

- **Apps that stay up.** A foreground service, auto-restart and guided setup that beats each brand's app killer.
- **Public URLs without port forwarding.** Quick links or your own domain through Cloudflare, even behind CGNAT.
- **Releases and rollback.** Every deploy is a release; `droidhost rollback` goes back in seconds.
- **Logs and health everywhere.** On the phone, in the CLI and in the web dashboard (`droidhost dashboard`).
- **Safe by default.** Pairing with keys, no passwords, and the admin API never goes through a tunnel.

## Commands

| Command | What it does |
| --- | --- |
| `droidhost pair` | Find a phone on this Wi-Fi and link it to this computer |
| `droidhost deploy` | Ship the app in this folder |
| `droidhost expose` | Give an app a public HTTPS URL |
| `droidhost ps` | All apps: status, CPU, memory, uptime, URL |
| `droidhost logs` | Recent lines, then live |
| `droidhost rollback` | Go back to the previous release |
| `droidhost dashboard` | Open the web dashboard on this computer |

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
bun run --filter @droidhost/dashboard build && bun run cli dashboard
```

## Learn more

- [docs/mission.md](docs/mission.md): why DroidHost exists and who it's for
- [docs/architecture.md](docs/architecture.md): how the phone app, agent, CLI and dashboard fit together
- [docs/roadmap.md](docs/roadmap.md): what's next
- [docs/README.md](docs/README.md): every doc
- [AGENTS.md](AGENTS.md): for people and AI agents working in this repo
- [site/](site): the landing page and the user guide
