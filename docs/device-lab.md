# Device lab

This doc explains how we test DroidHost on real phones, what "done" means for a requirement, and how we benchmark.

**The rule:** a requirement is done only when its acceptance check passes on **all four** lab phones.

---

## The phones

| Phone | Why it's in the lab | Android |
| --- | --- | --- |
| Nothing Phone (3) | Best-case flagship, and our future AI node | Latest Nothing OS |
| Pixel 10a | Clean Android and first to get new versions | Latest stable, plus the beta |
| Mid-range Redmi | MIUI / HyperOS, the strictest app killers | Exact model to be decided |
| Mid-range or budget Oppo | ColorOS, a big share of Indian phones | Exact model to be decided |

The exact Redmi and Oppo models are an open question. See [decisions.md](decisions.md#open-questions). Pick models that are common in India and two to three years old, since that's what's in drawers.

---

## What we test

### On every release candidate

| Test | Pass when |
| --- | --- |
| Fresh install | A Node app runs with no other app installed |
| Setup checklist | Each tick appears only after the system confirms it |
| Pair | Phone found in under 3 seconds. A denied pairing fails. |
| Deploy `hono-api` | Live in under 2 minutes |
| Every starter | Deploys with zero edits |
| Redeploy | No failed requests during the switch |
| Rollback | Done in about 1 second |
| Kill test | `kill -9` on an app, and it's back within 5 seconds |
| Reboot test | All running apps return after a reboot |
| Wi-Fi drop | The public URL works again within 10 seconds |
| External port scan | Finds only app ports |
| Thermal | Low apps pause above 43 °C and resume below 40 °C |
| Unplug | Power cut alert within 30 seconds |

### Tools

Run every test with the [Android CLI](android-cli.md):

- `android run` to install the build under test.
- `android screen capture -o <file>` for screenshots in reports.
- `android layout` to check what's on screen, for example that the setup checklist shows green ticks.

Use `adb` only for what the CLI can't do: `adb shell kill -9` for the kill test, `adb reboot` for the reboot test, and `adb shell input` for taps.

### Soak test (the phase 1 gate)

- Run `hono-api`, `telegram-bot` and `static-site` on each phone for **7 days**.
- Allow **no manual fixes**.
- Track unexpected kills (the target is under 1 per device per day) and recovery time (the target is 99% within 5 seconds).

### Android betas

Run the release candidate suite on each Android beta as it comes out, on the Pixel. Android changes are one of our biggest risks.

---

## Benchmarks

Each phone runs the same `hono-api` under [`oha`](https://github.com/hatoo/oha) load in three settings:

1. **Local**, from a computer on the same Wi-Fi.
2. **Through the tunnel**, from outside.
3. **Hot**, after 10 minutes of sustained load.

```bash
oha -z 60s -c 50 http://<phone-ip>:3000/
```

Record requests per second, p50 and p99 latency, error rate and the phone's temperature. Results go on the README's benchmark page.

### Expected performance

These are planning estimates from the PRD, **not benchmarks**. The lab replaces them with real numbers.

| Phone class | RAM | Simple API through tunnel (req/s) | Apps at once | Fit |
| --- | --- | --- | --- | --- |
| Nothing Phone (3) | 12 to 16 GB | 1,500 to 3,000 | 15 to 25 | Best server, also the AI node |
| Pixel 10a | about 8 GB | 1,000 to 2,000 | 8 to 12 | Reliable software, runs warm |
| Mid-range Redmi or Oppo | 6 to 8 GB | 800 to 1,500 | 6 to 10 | Good, needs vendor setup |
| Budget Redmi or Oppo | 3 to 4 GB | 300 to 600 | 2 to 4 | Bots and small APIs only |

For context, an app with 10,000 daily users peaks at about 20 to 50 requests per second. Home upload speed is usually the real limit, not the phone.

---

## Lab hygiene

- Factory reset each phone before a soak test.
- Keep the phones in open air on good chargers, the same way we tell users to.
- Log each phone's model, OS version and security patch with every result.
- Turn on Protect battery during soak tests, because these phones charge all day, every day.
