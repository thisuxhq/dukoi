# Releasing

This doc explains how a new version of Dukoi gets from `main` to people's phones and computers. Merging a changelog PR with a new version starts it: the Release workflow runs `scripts/release.sh` on GitHub (D-116).

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

1. **Write the changelog.** In `CHANGELOG.md`, move the notes under `## [Unreleased]` into a new `## [0.3.0] - 2026-12-01` section, and open a PR.
2. **Merge it.** The [Release workflow](../.github/workflows/release.yml) sees a version with no tag and runs `scripts/release.sh 0.3.0` on a macOS runner. Watch it in the repo's **Actions** tab.

A push to `main` that doesn't add a new version releases nothing. To start a release by hand, for example after adding the secrets, open **Actions → Release → Run workflow**.

### From a laptop

The same script still works on a Mac, if GitHub is down or you're fixing a release:

1. `git checkout main && git pull`, with nothing uncommitted.
2. Try it first. This builds everything and publishes nothing:

   ```bash
   scripts/release.sh 0.3.0 --dry-run
   ```

3. Release:

   ```bash
   DUKOI_KEYSTORE=~/keys/dukoi-release.jks DUKOI_KEYSTORE_PASSWORD=... scripts/release.sh 0.3.0
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

If it fails after the push, rerunning the workflow does nothing, because the tag exists. Fix the problem and run the step that failed by hand, from a laptop. Each is one command: `scripts/publish-release.sh`, `bun run --filter @dukoi/site deploy`, or `gh release create`.

## What the workflow needs

Four repository secrets. `scripts/set-release-secrets.sh` saves all four: it asks for the key's password and a Cloudflare token without showing them, checks both work, then saves them with `gh`. Run it again to replace them. They live under **Settings → Secrets and variables → Actions**:

| Secret | What it is |
| --- | --- |
| `DUKOI_KEYSTORE_BASE64` | The release key, as text: `base64 -i ~/keys/dukoi-release.jks \| pbcopy` |
| `DUKOI_KEYSTORE_PASSWORD` | The key's password |
| `CLOUDFLARE_API_TOKEN` | A token with **Workers Scripts: Edit**, **Workers R2 Storage: Edit** and, for the dukoi.com zone, **Workers Routes: Edit** |
| `CLOUDFLARE_ACCOUNT_ID` | The account that owns dukoi.com |

`gh` uses the workflow's own token to download Node and cloudflared, push the tag and create the GitHub release. The workflow checks the secrets first and names any that are missing.

## What a laptop release needs

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

- Tell people when a new version is out: the CLI could check `dukoi.com/download/SHA256SUMS`, and the phone app could do the same.
