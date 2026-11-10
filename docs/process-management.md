# Process management

This doc explains how DroidHost starts apps, keeps them alive and protects the phone while it does.

The process manager is Kotlin code inside the foreground service. Android protects that service, so the thing that restarts apps is the hardest thing for Android to kill. See [tech-stack.md](tech-stack.md#agent-and-process-manager-kotlin-in-the-same-service).

---

## App states

```
          deploy / start
 stopped ─────────────────▶ starting ──healthy──▶ running
    ▲                          │                    │  │
    │ stop                     │ fails              │  │ crash / killed
    │                          ▼                    │  ▼
    └──────────────────── crashed ◀────────────────┘ restarting
                                                     │
                       paused ◀── hot phone ─────────┘ (Low priority only)
```

| State | Meaning |
| --- | --- |
| `stopped` | The user stopped it. It stays stopped after a reboot. |
| `starting` | Spawned and waiting for its health check. |
| `running` | Healthy. |
| `restarting` | Waiting out the backoff delay before the next start. |
| `crashed` | The restart rate limit was hit. It keeps retrying slowly and alerts are sent. |
| `paused` | Stopped by the thermal guard. Resumes when the phone cools. |

Phone, CLI and dashboard show the same state within 1 second.

---

## Auto-restart with backoff

When an app exits unexpectedly, it restarts with a doubling delay:

| Try | Wait before restart |
| --- | --- |
| 1 | 1 s |
| 2 | 2 s |
| 3 | 4 s |
| 4 | 8 s |
| 5 | 16 s |
| 6 and after | 30 s (the cap) |

- After 5 quick failures the app shows as `crashed` and an alert is sent. It keeps retrying every 30 seconds.
- If an app stays up for 60 seconds, the counter resets.

## The watchdog

Android sometimes kills an app without a crash, for example through the phantom process killer, the low-memory killer or a vendor battery saver.

- The process manager watches every child process and notices a death at once.
- A killed app is **back within 5 seconds**.
- Where Android tells us why (`ApplicationExitInfo`), the reason is recorded and shown to the user.

| Reason shown | Typical cause | Fix link |
| --- | --- | --- |
| "Android stopped it to save battery" | Phantom process killer or Doze | Setup step 3 |
| "The phone ran low on memory" | Too many apps, or a leak | Lower the memory limit or app count |
| "The phone maker's battery saver stopped it" | MIUI, ColorOS and similar | The brand steps in [device-setup.md](device-setup.md) |
| "Your app crashed" | A bug in the app | `droidhost logs` |

Target: **fewer than 1 unexpected kill per device per day.**

## Start on boot

- DroidHost listens for `BOOT_COMPLETED` and starts the foreground service.
- Each app that was `running` before the reboot starts again. Apps that were `stopped` stay stopped.
- Apps start in priority order: Critical, then Normal, then Low.

---

## Memory limits

- Each app has a memory limit. The default is a fair share of the phone's RAM, and you can set it with `--memory`.
- Node apps also get `--max-old-space-size` set just under the limit.
- If an app goes over its limit, it restarts and the reason is shown.

## Priority

| Priority | Use it for | When the phone is hot |
| --- | --- | --- |
| `critical` | Things that must stay up, like a bot or webhook | Never paused |
| `normal` | The default | Never paused by the thermal guard |
| `low` | Nice-to-have things, like a demo or preview | Paused first |

---

## Phone protection

### Thermal guard

- Above **43 °C** (battery temperature), Low-priority apps pause.
- Below **40 °C**, they resume.
- The gap stops apps from flapping on and off.
- An overheat alert is sent if the phone stays hot.

### Protect battery

- Charging stops at **80%** where the phone allows it, through the maker's battery protection setting or a supported API.
- Where the phone doesn't allow it, DroidHost says so and suggests a smart plug.

### Power cut mode

- When the phone is unplugged, an alert is sent **within 30 seconds**.
- Apps keep running on battery. The battery works like a UPS.

---

## Logs

- Each app's stdout and stderr is captured with a timestamp.
- Logs rotate at **5 MB per app**.
- Secrets are masked before anything is written.
- See [observability.md](observability.md).
