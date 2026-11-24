# Observability

This doc explains how you see what's happening: logs, metrics, alerts and the opt-in telemetry that helps us improve Dukoi.

**The rule:** never a silent failure. If something goes wrong, it shows up wherever you're already looking: the phone, the CLI or the dashboard.

---

## Logs

```bash
dukoi logs my-api
```

- Live on the phone, CLI and dashboard. **New lines appear within 1 second.**
- Each line has a timestamp and a stream (`out` or `err`).
- Dukoi writes its own events into the same stream, so you see them next to your app's output:

```
12:04:11 out  Server listening on 3000
12:31:02 ●    Android stopped my-api to save battery. Restarted in 2.1s.
12:31:04 out  Server listening on 3000
```

- Rotation: **5 MB per app**. Older lines are dropped.
- Secrets are masked before they're written.

## Requests

```bash
dukoi inspect my-api           # live HTTP requests
dukoi inspect r_043            # headers and body for one request
dukoi replay r_043             # send it to the live app again
```

- Every app's stable port keeps the **last 100 HTTP requests** in memory. Nothing is written to disk, and restarting the agent clears the buffer.
- Request and response bodies are capped at **64 KB** each. Binary bodies store only their size.
- Sensitive headers (`authorization`, `cookie`, `set-cookie`, `*-signature`, `*-token`, `*-key`) are shown as `[redacted]` in the CLI and dashboard. The phone keeps the raw request headers in memory so `dukoi replay` (and the **Replay** button in the dashboard's **Requests** tab) can re-send webhooks and authenticated calls as they arrived.
- Requests whose body was over 64 KB can't be replayed, because only the first 64 KB was kept.

## Device metrics

| Metric | Shown where |
| --- | --- |
| CPU (whole phone) | Phone, `dukoi status`, dashboard |
| Memory used and free | Same |
| Battery temperature | Same |
| Battery level and charging state | Same |
| Storage free | Same |

- Updated **every second**, with a **40-second history** for small live charts.
- Kept in memory only. Nothing is stored long term in phase 1.

## Per-app metrics

- CPU and memory for each app, shown in `dukoi ps` and the dashboard.
- Plus uptime, restart count and the last kill reason.

---

## Alerts

```bash
dukoi alerts
```

| Alert | Fires when |
| --- | --- |
| **Crash** | An app enters the `crashed` state |
| **Kill** | Android kills an app, with the reason |
| **Overheat** | The phone stays above 43 °C |
| **Power cut** | The charger is unplugged. Sent within 30 seconds. |
| **Setup unfinished** | A checklist step stops being true, for example after an OS update |

**Channels in phase 1:**

- **Telegram.** Paste a bot token and chat ID. The phone sends the message directly.
- **Email.** Through an SMTP server you provide.

Alerts are short and say what to do:

> ⚠ **pixel-10a**: my-api crashed 5 times in 2 minutes. Last error: `Cannot find module 'hono'`. Run `dukoi logs my-api`.

The phone also shows alerts as Android notifications.

---

## Telemetry

**Off unless you turn it on.** It's asked about clearly during setup, and you can change it later in settings.

**What's sent when it's on:**

| Event | Fields |
| --- | --- |
| Setup step completed | Step number, phone brand, Android version |
| First healthy deploy | Seconds from install to first URL |
| Daily heartbeat | Number of apps running, uptime, unexpected kills (count and reason type) |
| CLI version | Version number |

**What's never sent:** app code, logs, environment variables, URLs, IP addresses, app names, file names or anything personal.

**Why we ask:** it's how we measure the phase 1 goals of time to first URL, setup completion, 30-day retention and kills per device. See [roadmap.md](roadmap.md#phase-1-success-metrics).
