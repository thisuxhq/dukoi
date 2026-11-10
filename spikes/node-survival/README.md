# Node survival spike

This is a throwaway Android app that answers the two questions the whole DroidHost plan depends on:

1. **Does Node run from the APK?** A Node binary shipped as `libnode.so` and run from `nativeLibraryDir` on Android 10+.
2. **Does it stay alive?** Can a `specialUse` foreground service keep Node running through crashes, kills, reboots and a night with the screen off?

The spike's code isn't reused. What carries over is what we learn, which goes in [Results](#results).

---

## What's inside

| File | Job |
| --- | --- |
| `NodeService.kt` | Foreground service (`specialUse`) with a wake lock and Wi-Fi lock. Logs why Android killed the app last time. |
| `NodeSupervisor.kt` | Starts Node, waits for it to exit, restarts it with backoff (1, 2, 4, 8, 16, then 30 s). Clears orphaned Node processes. |
| `BootReceiver.kt` | Starts the server again after a reboot, if it was running. |
| `MainActivity.kt` | Status, start/stop, battery optimization and notification buttons, and the event log. |
| `assets/server.js` | A dependency-free server with a SQLite hit counter, `/gaps` for freezes and `/crash` to test restarts. |
| `scripts/install-node.sh` | Puts an arm64 Node binary into `jniLibs/arm64-v8a/libnode.so`. |

---

## Run it

```bash
../../scripts/build-node-android.sh            # builds Node 24 from source in a Linux container, about 1 hour
scripts/install-node.sh ../../build/node-android/v24.22.2/node
./gradlew assembleDebug
android run --apks=app/build/outputs/apk/debug/app-debug.apk
```

On the phone, tap **Allow notifications**, **Turn off battery optimization**, then **Start server**. Open the URL it shows from your computer.

The created project was made with `android create empty-activity --minSdk=29`. See [docs/android-cli.md](../../docs/android-cli.md).

---

## Tests

Use `android layout` and `android screen capture` to check the screen. Use `adb` only for kill, reboot and taps.

| # | Test | How | Pass when |
| --- | --- | --- | --- |
| 1 | Node runs | Start server | Status shows `Running` and the Node version. `GET /` answers. |
| 2 | SQLite works | `GET /` | `"sqlite": "ok"` and `hits` goes up |
| 3 | Crash restart | `GET /crash` | Back within 2 s. The restart count goes up. |
| 4 | Kill restart | `adb shell kill -9 <pid>` (pid from the app) | Back within 5 s. The event shows `killed (SIGKILL)`. |
| 5 | Crash loop backoff | Hit `/crash` 6 times quickly | Waits grow to 30 s and the state shows `Failed` |
| 6 | Orphan cleanup | `adb shell am kill com.example.droidhostspike`, reopen the app | No `EADDRINUSE`. The event shows "stopped leftover node" if one survived. |
| 7 | Reboot | `adb reboot` | Server answers again after boot without opening the app |
| 8 | Screen off overnight | Start, lock the phone, leave it plugged in for 8+ hours | `GET /gaps` shows no gaps, or we learn which killer caused them |
| 9 | Without exemptions | Repeat test 8 with battery optimization **on** | Shows how much the setup checklist matters |

Logs on the phone: `files/logs/events.log` (supervisor) and `files/logs/server.log` (Node output).

---

## Results

_Fill in per phone: model, Android version, Node build, and pass or fail with notes for each test._

| Phone | Android | Node build | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | | | | | |

### Notes

- `WIFI_MODE_FULL_HIGH_PERF` is deprecated on Android 14+. Check whether the Wi-Fi lock still stops sleep there.
- `ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE` only exists on Android 14+. Older versions start with no type.
