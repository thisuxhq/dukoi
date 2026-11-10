# Android CLI

This doc explains how we use Google's Android CLI (`android`) to build, run and test the DroidHost phone app.

**The rule:** use `android` for every Android task it supports. Use `adb` only where `android` has no command, and say why when you do.

---

## Install and set up

```bash
curl -fsSL https://dl.google.com/android/cli/latest/darwin_arm64/install.sh | bash
android init      # sets up config and default skills
android update    # keep it current
android info      # SDK path, connected devices, versions
```

Installers for Linux and Windows are listed in the CLI's own skill file at `~/.android/cli/skills/devtools/android-cli/SKILL.md`.

---

## What to use for each task

| Task | Command |
| --- | --- |
| Create a new project | `android create empty-activity --name="DroidHost" --output=./android` |
| See templates | `android create --list` |
| Build, install and launch | `android run` |
| Install an APK only | `android install --apks=app-debug.apk` |
| Screenshot | `android screen capture -o screen.png` |
| Screenshot with numbered elements | `android screen capture --annotate -o screen.png` |
| Find UI elements (JSON) | `android layout --pretty` |
| What changed since the last dump | `android layout --diff` |
| Turn an annotated label into coordinates | `android screen resolve --screenshot screen.png --string "#3"` |
| Emulators | `android emulator list`, `create`, `start`, `stop` |
| SDK packages | `android sdk install platforms/android-36`, `android sdk list --all` |
| Look up Android APIs | `android docs <keywords>` |
| Official Android skills | `android skills list`, `android skills install <name>` |
| Describe a project | `android describe` |

With more than one phone connected, add `--device=<serial>`.

---

## Where we still need `adb`

The Android CLI doesn't do these yet, so `adb` fills the gap:

| Task | Command | Why not `android` |
| --- | --- | --- |
| Tap, swipe, type | `adb shell input tap X Y` | `android` finds coordinates but doesn't send input |
| List device serials | `adb devices` | `android info` shows devices, but the CLI's own docs use this for serials |
| Kill an app process (kill test) | `adb shell kill -9 <pid>` | No process control |
| Reboot (reboot test) | `adb reboot` | No reboot command |
| Phantom process killer fix (Android 12 and 13) | `adb shell device_config ...` | No shell access |
| Logcat | `adb logcat` | No log command |

Combine the two to tap something:

```bash
android layout --pretty            # find the element and its "center"
adb shell input tap 540 1210       # tap that center
```

Or by label from an annotated screenshot:

```bash
android screen capture --annotate -o screen.png
adb shell input $(android screen resolve --screenshot screen.png --string "tap #12")
```

---

## Tips

- Use `android layout` first to inspect the UI. Use `screen capture` when you need to *see* it, such as images, WebViews or layout bugs.
- Look at every screenshot before acting on it.
- Content can take a moment to load. If `layout` is missing something, wait and run it again.
- If `android` gets a new command for something in the `adb` table, use it and update this doc.
