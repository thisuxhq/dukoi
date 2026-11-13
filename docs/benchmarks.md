# Benchmarks

This doc is the plan for measuring how fast phones run Dukoi apps, collecting the results by phone model and showing them on dukoi.com.

**Status:** proposed (D-118). Nothing here is built yet. The device lab runs `oha` by hand today (see [device-lab.md](device-lab.md#benchmarks)).

**The rule:** every number we show comes from a real run that anyone can repeat with one command. No estimates on the site.

---

## Why

People hear "phone server" and think toy. One honest number from a real phone changes that faster than any feature list. Benchmarks also answer the question every new user has: "Is my old phone good enough?"

Benchmarks aren't a goal (see [mission.md](mission.md#what-winning-looks-like)). We show them so people trust the product and pick the right phone, not to win a speed race.

---

## What we measure

Every run deploys the same small app and measures it in three settings, the same ones the lab already uses.

| Setting | How | What it tells you |
| --- | --- | --- |
| **Through the tunnel** | Load from the computer to the public quick link | What visitors get. The headline number. |
| **On Wi-Fi** | Load from the computer to the phone's local URL | What the phone can do without the internet in the way |
| **Hot** | The tunnel test again after 10 minutes of load | Whether the phone slows down when it warms up |

For each setting we record:

| Field | Example | Source |
| --- | --- | --- |
| Requests a second | 2,840 | The load generator |
| p50 and p99 latency | 6 ms, 18 ms | The load generator |
| Error rate | 0% | The load generator |
| Battery temperature at the end | 39 °C | The phone app, the same reading thermal protection uses |
| CPU and memory of the bench app | 340%, 92 MB | The agent's `/proc` reader (`agent/src/proc-stats.ts`) |

And once per run, about the phone: maker, model, chip, RAM, Android version, Dukoi version and Node version.

**The load:** 50 connections for 60 seconds, keep-alive on, against `GET /notes` on the bench app. This matches `oha -z 60s -c 50` in the lab.

---

## `dukoi bench`

One command does the whole run. Nothing to install.

```bash
dukoi bench
```

```
Benchmarking pixel-10a (Pixel 10a, Android 16)

  ✓ Deployed the bench app
  ✓ On Wi-Fi            4,120 req/s   p99 9 ms
  ✓ Through the tunnel  1,720 req/s   p99 27 ms
  ✓ Hot, after 10 min   1,610 req/s   p99 31 ms   42 °C
  ✓ Removed the bench app

Your phone is faster than a $5 server on Wi-Fi.
Share it on dukoi.com/bench with `dukoi bench --share`.
```

### What it does

1. Checks the phone is on charge and has at least 15% battery. If it isn't on charge, it warns that the hot test drains the battery, and asks before going on.
2. Deploys a built-in app called `dukoi-bench`: the `hono-api` starter with seeded data, so every phone runs exactly the same code.
3. Waits 10 seconds for the app to settle, then runs the Wi-Fi test.
4. Opens a quick link and runs the tunnel test.
5. Keeps the load going for 10 minutes, then runs the tunnel test again as the hot test. `--quick` skips the hot test.
6. Reads the phone's numbers from the agent, removes the app and its quick link, and prints the results.

Other apps keep running during a bench. The CLI says so if any are running, since they share the CPU and the results will be lower.

### Flags

| Flag | What it does |
| --- | --- |
| `--quick` | Skips the 10-minute hot test. About 3 minutes in all. |
| `--share` | Sends the results to dukoi.com/bench after the run (see [Sharing](#sharing-results)) |
| `--json` | Prints the results as JSON, like every other command |
| `--device <name>` | Picks the phone, like every other command |

### The load generator

The CLI has its own load generator, built on `node:http` with a keep-alive agent and 50 sockets. It records each request's time in a histogram, so p99 is exact, not estimated.

We don't use `oha` because people would have to install it. Before shipping, we check the built-in generator against `oha` on all four lab phones. It has to be within 5% on requests a second and p99, or we don't ship it.

If the computer is the bottleneck (its CPU stays above 90% during a run), the result is marked **limited by this computer** and isn't shared.

---

## The agent API

The bench needs one new admin API route. Like every admin route, it's signed, LAN only and never goes through a tunnel ([D-005](decisions.md#d-005-admin-api-never-goes-through-a-tunnel)).

| Route | Answer |
| --- | --- |
| `GET /bench/sample?app=dukoi-bench` | Battery temperature, the app's CPU and memory, and the phone's free memory, read now |
| `GET /status` (already there) | Maker, model, Android, agent and Node versions, total memory |

The CLI calls `/bench/sample` every 5 seconds during the load and keeps the peak and the last reading. Deploying and removing the bench app use the normal deploy and remove routes, so there's nothing else new on the phone.

`PhoneStatus` in `shared/` gains two fields, `chip` (from `Build.SOC_MODEL`, Android 12 and up) and `maker` (from `Build.MANUFACTURER`), so results can be grouped by model.

---

## Sharing results

Nothing is shared unless you pass `--share`. The first time, it shows exactly what will be sent and asks for a yes. That matches our telemetry rule ([D-006](decisions.md#d-006-telemetry-is-opt-in)).

### What's sent

```json
{
  "phone": {
    "maker": "Google",
    "model": "Pixel 10a",
    "chip": "Tensor G4",
    "ramGb": 8,
    "android": 16
  },
  "versions": { "dukoi": "0.4.0", "node": "24.22.2" },
  "wifi": { "rps": 4120, "p50Ms": 4, "p99Ms": 9, "errorRate": 0 },
  "tunnel": { "rps": 1720, "p50Ms": 11, "p99Ms": 27, "errorRate": 0 },
  "hot": { "rps": 1610, "p50Ms": 12, "p99Ms": 31, "errorRate": 0, "batteryC": 42 },
  "otherAppsRunning": 2,
  "phoneKey": "ed25519 public key of the phone",
  "signature": "the phone's signature over everything above"
}
```

**Never sent:** the phone's name, app names, URLs, IP addresses, the computer's key, logs or anything personal. The server drops the IP address on arrival.

The phone signs the result with its pairing key, so a result can't be edited between the phone and dukoi.com. This doesn't prove the phone is honest. The median and the trimming below handle that.

---

## The public API

A few routes on the dukoi.com Worker (`site/worker.ts`), with results in a D1 database called `dukoi-bench`.

| Route | What it does |
| --- | --- |
| `POST /api/bench` | Checks the signature and the limits, then saves a run |
| `GET /api/bench` | Every model with at least 3 runs: median results, run count, and whether it's a lab phone |
| `GET /api/bench/:model` | One model: medians, every run's tunnel result for a spread chart, and how results changed by Dukoi version |

Answers to `GET` are cached at the edge for 10 minutes.

### Tables

```sql
CREATE TABLE runs (
  id          TEXT PRIMARY KEY,      -- random
  created_at  INTEGER NOT NULL,
  phone_hash  TEXT NOT NULL,         -- SHA-256 of the phone's public key, never the key
  model_slug  TEXT NOT NULL,         -- "google-pixel-10a"
  maker TEXT, model TEXT, chip TEXT, ram_gb INTEGER, android INTEGER,
  dukoi TEXT, node TEXT,
  lab         INTEGER NOT NULL DEFAULT 0,
  result      TEXT NOT NULL          -- the wifi, tunnel and hot objects as JSON
);
CREATE INDEX runs_model ON runs (model_slug, created_at);
```

Medians are worked out when the answer is built. At this size a query is fine, and there's no second table to keep in step.

### Keeping it honest

| Problem | What we do |
| --- | --- |
| One phone shares 100 times | One run per phone an hour, and each phone counts once in a model's median (its own median) |
| Made-up numbers | Reject anything outside sane limits, like more than 20,000 req/s through a quick tunnel or p99 under 1 ms. Drop the top and bottom 10% of phones before taking the median. |
| A busy phone or a slow home connection | Shown as it is. The spread chart on a model's page shows the range, and the Wi-Fi number shows what the phone itself can do. |
| Old Dukoi versions | Only runs from the last 3 minor versions count in the headline numbers |
| Our own lab phones | Their keys are listed in the Worker's config, which sets `lab = 1` and shows the Lab badge |

---

## On the site

The designs are in Paper, in the `dukoi` file on the **Benchmark** page.

### Landing page section

A dark section after "Your old phone beats a $5 server":

- One big number: the best lab phone's requests a second through the tunnel.
- A bar chart of the four lab phones and a $5 server.
- How we measure, the 7-day soak result, and a link to `/bench`.

These numbers come from the lab, not from shared runs, and live in `site/src/lib/bench.ts`. The lab updates the file in a PR after each release candidate run, so every number on the landing page is reviewed. The $5 server number is our own run of `dukoi-bench` on a 1 vCPU, 1 GB server through a Cloudflare tunnel, measured the same way.

### `/bench` page

The full table of every phone model: rank, model, chip and RAM, requests a second as a bar, p99, hot temperature and run count. Tabs switch between tunnel, Wi-Fi and hot, and there's a search box. A $5 server row sits in the list where its score puts it, for comparison.

The page is static and loads `/api/bench` in the browser, so new runs show up without a release. Each model gets its own page at `/bench/<model>`, so "is my phone good enough?" has a link to share.

The docs also get a short user guide page on `dukoi bench`.

---

## Build order

Each step ships on its own.

1. **`dukoi bench` without sharing.** The load generator, `/bench/sample`, `chip` and `maker` in `PhoneStatus`, and the check against `oha` on the lab phones. Lab results go into `docs/device-lab.md`.
2. **The landing section**, with lab numbers in `site/src/lib/bench.ts`.
3. **Sharing and the public API.** D1, `POST` and `GET /api/bench`, and `--share`.
4. **The `/bench` page and model pages.**

Done means: `dukoi bench` gives the same numbers as `oha` (within 5%) on all four lab phones, and a shared run appears on `/bench` within 10 minutes.

---

## Open questions

| Question | Options |
| --- | --- |
| Which phone leads on the landing page? | The fastest lab phone, or a budget one to show that even cheap phones are enough |
| Should `dukoi bench` ask to share at the end of every run? | Ask once and remember, or always need `--share` |
| Show a model with only 1 or 2 runs? | Hide until 3, or show it marked "few runs" |
| A Pro relay later will change tunnel numbers | Keep quick-tunnel and relay results apart from the start (add a `tunnel` field), or later |
