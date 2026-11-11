# DroidHost

DroidHost turns old Android phones into app servers. You install one APK, pair the phone with your computer, run `droidhost deploy` and get a live URL. No root, no Termux, no cloud bill.

This file is for AI coding agents and people working in this repo. `CLAUDE.md` is a symlink to it, so edit this file only.

## Start here

- `docs/README.md` is the index of every doc.
- `docs/mission.md` says what we build and who for.
- `docs/architecture.md` explains how the parts fit together.
- `docs/decisions.md` lists what's decided, what's proposed and what's still open. Add an entry when you make a choice that's hard to undo.

## Where things are

| Path | What it holds |
| --- | --- |
| `docs/` | Product and engineering docs |
| `spikes/node-survival/` | Throwaway Android app that proved Node runs and survives on a phone. Results are in its README. |
| `scripts/fetch-node.sh` | Downloads our prebuilt Node for Android (about 5 seconds). Use this. |
| `scripts/build-node-android-native.sh` | Builds Node for Android from source. Only when upgrading Node. |
| `scripts/build-node-android.sh` | The same build with Google's NDK compiler, for x86_64 Linux such as CI |
| `build/` | Local build output, ignored by git |

## Node for Android

- We bundle **Node.js 24 LTS**, built from the official source and published as a GitHub Release (`node-v24.22.2-android-arm64`).
- **Never rebuild Node for app work.** Run `scripts/fetch-node.sh`. A rebuild takes about an hour, so do it only when upgrading Node, then publish a new release.
- The binary ships inside the APK as `jniLibs/arm64-v8a/libnode.so`, because Android 10+ only runs binaries from `nativeLibraryDir`.

## Android work

- Use Google's Android CLI (`android`) for every Android task it supports: `android create`, `android run --apks=<apk>`, `android install`, `android screen capture`, `android layout`, `android emulator`, `android sdk` and `android docs`.
- `android run` doesn't build. Build with `./gradlew assembleDebug` first.
- Use `adb` only where `android` has no command, such as `adb shell input` for taps, `kill`, `reboot` and `device_config`. Say why when you do.
- See `docs/android-cli.md`.

## Running the spike

```bash
scripts/fetch-node.sh
cd spikes/node-survival
scripts/install-node.sh ../../build/node-android/v24.22.2/node
./gradlew assembleDebug
android run --apks=app/build/outputs/apk/debug/app-debug.apk
```

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
