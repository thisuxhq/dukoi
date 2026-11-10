# Device setup

This doc explains the phone setup checklist: what each step fixes, how DroidHost checks it, and the extra steps for each phone brand.

Android works hard to stop long-running background work, and DroidHost's setup is how we win that fight. **A step only ticks green when Android confirms it.** Tapping a button isn't enough.

---

## The checklist

| # | Step | What it fixes | How we confirm it |
| --- | --- | --- | --- |
| 1 | **Keep DroidHost running** | Starts the foreground service with a persistent notification | The service is running and its notification is showing |
| 2 | **Turn off battery optimization** | Doze and App Standby pausing DroidHost | `PowerManager.isIgnoringBatteryOptimizations()` is true |
| 3 | **Allow child processes** | The phantom process killer (Android 12+) stopping Node apps | Developer setting read back, or a test child survives |
| 4 | **Brand-specific steps** | Vendor killers like MIUI, ColorOS and One UI | Each item has its own check where the brand allows it |

The checklist stays on screen until all four steps are green. If any step is unfinished, the phone, CLI and dashboard all show a warning.

Optional steps, suggested but not required:

- **Notifications on**, so alerts can show on the phone.
- **Start on boot**, which is on by default and has a confirm step on some brands.
- **Protect battery**, which caps charging at 80% where the phone supports it.

---

## Step 3: the phantom process killer

From Android 12, the system kills child processes that it thinks use too much CPU, and limits apps to 32 children in total. Node apps are child processes, so this matters.

| Android version | Fix |
| --- | --- |
| 10 and 11 | Nothing needed. |
| 12 and 13 | Run one `adb` command from a computer. DroidHost shows it with a copy button. |
| 14 and newer | Developer options, then **Disable child process restrictions**. DroidHost links straight to it. |

The adb command for Android 12 and 13:

```bash
adb shell device_config set_sync_disabled_for_tests persistent && adb shell device_config put activity_manager max_phantom_processes 2147483647
```

`droidhost doctor` can run this for you if the phone is connected over USB with USB debugging on.

---

## Brand-specific steps

DroidHost detects the maker and shows only that brand's steps, with screenshots. The exact menu names change between OS versions, so each guide is checked on the device lab phones. See [device-lab.md](device-lab.md).

### Nothing (Nothing OS)

- Battery: **Unrestricted** for DroidHost.
- Lock DroidHost in recent apps.

### Google Pixel

- Battery: **Unrestricted**.
- Usually nothing else is needed. Pixels are the most reliable.

### Xiaomi, Redmi, POCO (MIUI / HyperOS)

The strictest brand. Every step matters:

- **Autostart**: on.
- Battery saver: **No restrictions**.
- Lock DroidHost in recent apps (pull down on its card and tap the lock).
- Turn off **MIUI optimization** in Developer options if apps still get killed.

### Oppo, Realme (ColorOS / Realme UI)

- **Allow auto launch**: on.
- **Allow background activity**: on.
- Battery: turn off **Optimize battery use** for DroidHost.
- Lock DroidHost in recent apps.

### Samsung (One UI)

- Battery: **Unrestricted**.
- Remove DroidHost from **Sleeping apps** and **Deep sleeping apps**, and add it to **Never sleeping apps**.
- Turn off **Put unused apps to sleep**.

### OnePlus (OxygenOS)

- Battery: **Don't optimize**.
- **Allow auto launch** and **Allow background activity**: on.
- Lock DroidHost in recent apps.

---

## Device health score

On first launch, DroidHost scores the phone so users know what to expect.

| Input | Source |
| --- | --- |
| Chip | SoC model and core count |
| RAM | Total memory |
| Storage | Free space |
| Battery health | Capacity and health status, where available |

Each verdict comes in plain words, for example:

- **"Great server.** Runs 15 or more apps easily."
- **"Good for bots and small APIs.** Keep it to 2 to 4 apps."
- **"Battery looks swollen or weak.** Run it unplugged only with care, or replace the battery."

Rough expectations by phone class are in [device-lab.md](device-lab.md#expected-performance).

---

## Placement tips (shown in the app)

- Keep the phone in open air, not in a drawer or a case.
- Use a good charger and cable.
- Wi-Fi is better than mobile data for a home server.
- Use a spare phone, factory reset, rather than your daily phone.

---

## When an app still gets killed

1. The watchdog brings it back within 5 seconds.
2. DroidHost records **why**, if Android says: the phantom process killer, low memory, a vendor killer or a crash.
3. The phone, CLI (`droidhost ps`) and dashboard show the reason with a link to the fix.
4. More than one unexpected kill a day on a device means setup needs another look, and `droidhost doctor` says what to check.
