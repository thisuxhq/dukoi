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
../../scripts/fetch-node.sh                     # downloads our prebuilt Node 24 (5 seconds)
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

| Phone | Android | Node build | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Nothing Phone (3), A024 | 16 (API 36), Nothing OS B4.0 | v24.22.2, native arm64 build | ✅ | ✅ | ✅ 2.9 s | ⚠️ 5.2 s | ✅ | ✅ | ⚠️ after unlock, 7.9 s | ✅ 6 h, 0 gaps (plugged in) | not yet |

### What we learned (2026-11-11)

1. **Node 24 runs from `nativeLibraryDir` on Android 16.** Shipped as `libnode.so` (89 MB, 64 MB APK). It needs only `libc`, `libm`, `libdl` and `liblog`, which every phone has. SQLite, crypto, Intl, zlib, `dns.lookup` and HTTPS `fetch` all work.
2. **Crash restart works.** `/crash` came back as a new process in 2.9 s (second crash in a row, so the backoff waited 2 s). SQLite data survived.
3. **Kills shouldn't count toward the backoff.** `kill -9` came back in 5.2 s, just over the 5 s target, because it was the third failure in a minute and the backoff waited 4 s. A kill by Android isn't the app's fault: restart at once after `SIGKILL`, and keep the backoff for real crashes. Update the process manager design.
4. **Killing the whole app is handled by Android.** After `kill -9` on the app process, Android recreated the service (`START_STICKY`) in about 2 s. Node died with it, so no orphan held the port, and the server answered at once. `ApplicationExitInfo` logged the reason as "signaled".
5. **App update restarts the server.** Reinstalling the APK fired `MY_PACKAGE_REPLACED` and the server came back without opening the app.
6. **It ran all night without a pause.** The server started at 02:56 and ran until 09:02, about 6 hours, locked with the screen off. `/gaps` showed no heartbeat gap over 2 minutes (heartbeat every 30 s). The phone was plugged in over USB, so Doze, which doesn't run while charging, wasn't tested. That matches how a DroidHost phone is used, but test 9 (on battery) is still needed.
7. **Reboot needs one unlock.** After `adb reboot` the server stayed down until the phone was unlocked, because `BOOT_COMPLETED` waits for the first unlock on a phone with a PIN. It then answered 7.9 s after unlock without opening the app, with data intact. For unattended phones: either no PIN, or direct boot support (`directBootAware`, `LOCKED_BOOT_COMPLETED`, and app data in device-protected storage).

### Notes

- `WIFI_MODE_FULL_HIGH_PERF` is deprecated on Android 14+. Check whether the Wi-Fi lock still stops sleep there.
- `ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE` only exists on Android 14+. Older versions start with no type.
- Node for Android is built once per Node version with `scripts/build-node-android-native.sh` (about an hour the first time on an M-series Mac) and published as a GitHub Release. App builds use `scripts/fetch-node.sh`, which takes seconds.
