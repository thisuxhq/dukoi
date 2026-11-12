# Releasing

This doc explains how a new version of Dukoi gets from `main` to people's phones and computers. One command does it: `scripts/release.sh`.

---

## What a release ships

Every release ships the phone app, the CLI and the site together, at the same version.

| Part | Where people get it |
| --- | --- |
| Phone app (APK, with the agent inside) | `https://dukoi.com/download/dukoi.apk`, and attached to the GitHub release |
| CLI, for 5 platforms | `curl -fsSL https://dukoi.com/install \| sh` (or `install.ps1` on Windows) |
| Site and user guide | `https://dukoi.com` |

The downloads live in the `dukoi-downloads` R2 bucket. Each release goes in `<version>/` and in `latest/`, which is what `dukoi.com/download/` serves (D-115).

Node.js and cloudflared for Android aren't part of a release. They're rebuilt only when we upgrade them, and live on GitHub Releases (see `AGENTS.md`).

## Versions

- The version lives in one place: `shared/src/version.ts`. The CLI, the agent and the phone app all read it, so `dukoi --version` and the app always match.
- The app's `versionCode` comes from it: 1.2.3 becomes 10203.
- We use [Semantic Versioning](https://semver.org): patch for fixes, minor for new features, major for breaking changes.
- `PROTOCOL_VERSION` in `shared/src/index.ts` is separate. Bump it only when the admin API changes in a way older CLIs or phones can't handle. The CLI checks it on every answer from the phone and says which side to update.

## Release a version

1. **Write the changelog.** In `CHANGELOG.md`, move the notes under `## [Unreleased]` into a new `## [0.2.0] - 2026-12-01` section. Merge that to `main`.
2. **Get the latest main.** `git checkout main && git pull`, with nothing uncommitted.
3. **Try it first.** This builds everything and publishes nothing:

   ```bash
   scripts/release.sh 0.2.0 --dry-run
   ```

4. **Release:**

   ```bash
   DUKOI_KEYSTORE=~/keys/dukoi-release.jks DUKOI_KEYSTORE_PASSWORD=... scripts/release.sh 0.2.0
   ```

The script stops at the first problem and says what to fix. In order, it:

1. Checks you're on the latest `main`, the tag is new and the changelog has the section.
2. Sets the version in `shared/src/version.ts`.
3. Runs the tests, typecheck and lint.
4. Builds the signed APK and the five CLI archives into `build/release`, with `SHA256SUMS`.
5. Commits `Release v0.2.0`, tags `v0.2.0` and pushes both to `main`.
6. Uploads the downloads to R2 (`scripts/publish-release.sh`).
7. Deploys dukoi.com.
8. Creates the GitHub release with the changelog notes and the APK.

If it fails after the push, fix the problem and run the step that failed by hand. Each is one command: `scripts/publish-release.sh`, `bun run --filter @dukoi/site deploy`, or `gh release create`.

## What you need

| Thing | Why |
| --- | --- |
| A Mac with the Android SDK, Bun and the cached Node and cloudflared builds | Building the APK and CLI. The macOS binaries need `codesign`, so the CLI only builds on a Mac. |
| `wrangler login` to the Cloudflare account that owns dukoi.com | Uploading downloads and deploying the site |
| `gh auth login` with push access to `thisuxhq/dukoi` | Pushing the tag and creating the GitHub release |
| The release key | Signing the APK |

## The release key

Android only installs an update over an app signed with the **same key**. If the key is lost, nobody can update: everyone would have to uninstall Dukoi, losing their apps on the phone, and pair again. So:

- Keep the key file and its password in the team password manager, with a backup somewhere else. Never commit it.
- Make it once, with a validity long enough to outlast the project:

  ```bash
  keytool -genkeypair -v -keystore dukoi-release.jks -alias dukoi -keyalg RSA -keysize 4096 -validity 36500
  ```

- `scripts/release.sh` reads it from `DUKOI_KEYSTORE` (the file), `DUKOI_KEYSTORE_PASSWORD`, and optionally `DUKOI_KEY_ALIAS` (default `dukoi`) and `DUKOI_KEY_PASSWORD` (default: the keystore password).

Phones running a debug build from `./gradlew assembleDebug` are signed with a different key. They need to uninstall it once before installing a release APK.

## After a release

- Open `https://dukoi.com/download/dukoi.apk` and run `curl -fsSL https://dukoi.com/install | sh`, and check `dukoi --version` shows the new version.
- Add a fresh `## [Unreleased]` section to `CHANGELOG.md` if the script left none.

## Later

- Run the release from GitHub Actions instead of a laptop, with the key and the Cloudflare token as secrets.
- Tell people when a new version is out: the CLI could check `dukoi.com/download/SHA256SUMS`, and the phone app could do the same.
