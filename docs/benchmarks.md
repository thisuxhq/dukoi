# Benchmarks

This doc is the plan for measuring how fast phones run Dukoi apps, collecting the results by phone model and showing them on dukoi.com.

**Status:** decided (D-118). Built: `dukoi bench`, the agent routes, the shared results API and the `/bench` page. Not built yet: the landing page section, which waits for real lab numbers.

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
| **Hot** | The tunnel test again after 9 more minutes of load over Wi-Fi | Whether the phone slows down when it warms up |

For each setting we record:

| Field | Example | Source |
| --- | --- | --- |
| Requests a second | 2,840 | The load generator |
| p50 and p99 latency | 6 ms, 18 ms | The load generator |
| Error rate | 0% | The load generator |
| Battery temperature at the end | 39 °C | The phone app writes `battery.json` in the agent's folder whenever Android reports a change, because Node can't ask Android |
| Peak CPU of the bench app | 340% (100% is one core) | The agent's `/proc` reader (`agent/src/proc-stats.ts`) |

And once per run, about the phone: maker, model, chip, RAM, Android version, Dukoi version and Node version.

**The load:** 50 connections for 60 seconds, keep-alive on, against `GET /notes` on the bench app. This matches `oha -z 60s -c 50` in the lab.

---

## `dukoi bench`

One command does the whole run. Nothing to install. The numbers below show the layout; they aren't a real run.

```bash
dukoi bench
```

```
Benchmarking pixel-10a (Google Pixel 10a, Tensor G4, 8 GB, Android 16)

✓ Deployed the bench app
✓ On Wi-Fi            4,120 req/s   p99 9.2 ms   37 °C
✓ Through the tunnel  1,720 req/s   p99 27 ms    38 °C
✓ Hot, after 10 min   1,610 req/s   p99 31 ms    42 °C
✓ Removed the bench app

  Compare it with other phones: dukoi bench --share
```

### What it does

1. Stops if the phone is below 15% and not on charge, and warns if it isn't on charge at all.
2. Deploys the `notes-api` template as an app called `dukoi-bench` and adds 20 notes, so every phone runs exactly the same code against a real database.
3. Loads it for 5 seconds to wake it up (not counted), then runs the Wi-Fi test.
4. Opens a quick link, waits until it answers, and runs the tunnel test. If the phone can't open one, the bench skips this test and says why.
5. Loads the phone over Wi-Fi for 9 more minutes, then runs the tunnel test again as the hot test. `--quick` skips this.
6. Removes the app and its quick link, and prints the results. Ctrl+C removes it too.

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

We don't use `oha` because people would have to install it. Checked against `oha` on a Mac (50 connections, 10 seconds, the same server): 6,217 against 6,251 requests a second, p50 7.8 against 7.8 ms, p99 15.6 against 15.6 ms. It used 18% of one core, so a laptop can drive about 30,000 requests a second before it's the limit. We repeat the check on the lab phones.

If the computer is the bottleneck (the CLI uses more than 90% of a core during a run), the result is marked **limited by this computer**, and dukoi.com refuses to take it.

---

## The agent API

Two new admin API routes, in `agent/src/bench-routes.ts`. Like every admin route, they're signed, LAN only and never go through a tunnel ([D-005](decisions.md#d-005-admin-api-never-goes-through-a-tunnel)).

| Route | Answer |
| --- | --- |
| `GET /bench/sample?app=dukoi-bench` | The battery (level, temperature, on charge), the app's CPU and memory, and the phone's memory |
| `POST /bench/sign` | The phone's signature over the result it's sent (see below) |
| `GET /status` (already there) | Now also `maker` (`Build.MANUFACTURER`) and `chip` (`Build.SOC_MODEL`, Android 12 and up) |

The CLI calls `/bench/sample` every 5 seconds during each test and keeps the peak CPU and the last temperature. Deploying and removing the bench app use the normal routes.

Phones with an older app answer `/bench/sample` with 404. The bench still runs, says it can't read the temperature, and leaves it out. The protocol version doesn't change.

---

## Sharing results

Nothing is shared unless you pass `--share`, every time. That's the yes, like our telemetry rule ([D-006](decisions.md#d-006-telemetry-is-opt-in)). The user guide lists exactly what's sent.

### What's sent

The CLI asks the phone to sign the result (`POST /bench/sign`), then sends this to `POST https://dukoi.com/api/bench`:

```json
{
  "result": "{\"version\":1,\"phone\":{\"maker\":\"Google\",\"model\":\"Google Pixel 10a\",...}}",
  "phoneKey": "the phone's Ed25519 public key",
  "signature": "the phone's signature over dukoi-bench-v1 and the SHA-256 of result"
}
```

`result` is a string, so the bytes dukoi.com checks are exactly the bytes the phone signed. Inside it is a `BenchResult` (`shared/src/api.ts`):

```json
{
  "version": 1,
  "phone": { "maker": "Google", "model": "Google Pixel 10a", "chip": "Tensor G4", "ramGb": 8, "android": "16", "cores": 8 },
  "versions": { "dukoi": "0.4.0", "node": "v24.22.2" },
  "load": { "connections": 50, "seconds": 60 },
  "wifi": { "rps": 4120, "p50Ms": 4.1, "p99Ms": 9.2, "errorRate": 0, "requests": 247200, "cpuPercent": 410, "batteryC": 37 },
  "tunnel": { "...": "the same fields, or null if the tunnel test was skipped" },
  "hot": { "...": "the same fields, or null with --quick" },
  "otherAppsRunning": 2,
  "limitedByComputer": false
}
```

**Never sent:** the phone's name, app names, URLs, IP addresses, the computer's key, logs or anything personal. dukoi.com doesn't store IP addresses, and keeps only a SHA-256 of the phone's key.

The phone signs the result with its pairing key, so a result can't be edited between the phone and dukoi.com. This doesn't prove the phone is honest. The median and the trimming below handle that.

---

## The public API

A few routes on the dukoi.com Worker (`site/worker.ts` hands them to `site/bench-api.ts`), with results in a D1 database called `dukoi-bench` (created 2026-11-13, migrations applied with `wrangler d1 migrations apply dukoi-bench --remote`). The table is in `site/migrations/0001_bench.sql`.

| Route | What it does |
| --- | --- |
| `POST /api/bench` | Checks the signature and the limits, then saves a run. Answers `{ id, url }` |
| `GET /api/bench` | Every model with at least 3 runs: median results, run count, and whether it's a lab phone |
| `GET /api/bench/:model` | One model: its medians, and each phone's own median for a spread chart |

Errors look like the CLI's: `{ "error": { "code", "message", "hint" } }`. Answers to `GET` tell browsers to cache them for 10 minutes.

### Tables

One table, `runs`: an id, the time, the SHA-256 of the phone's key, the model slug (`google-pixel-10a`), the phone's maker, model, chip, RAM and Android version, the Dukoi and Node versions, a lab flag, and the result exactly as the phone signed it.

Medians are worked out when the answer is built. At this size a query is fine, and there's no second table to keep in step.

### Keeping it honest

| Problem | What we do |
| --- | --- |
| One phone shares 100 times | One run per phone an hour, and each phone counts once in a model's median (its own median) |
| Made-up numbers | Reject anything outside sane limits, like more than 20,000 req/s through a quick tunnel, more than 5% errors, a load other than 50 connections for 60 seconds, or a run the computer limited. With 10 or more phones, drop the top and bottom 10% before taking the median. |
| A busy phone or a slow home connection | Shown as it is. The spread chart on a model's page shows the range, and the Wi-Fi number shows what the phone itself can do. |
| Our own lab phones | Their public keys are in `LAB_PHONES` in `site/wrangler.jsonc`. Their runs get the Lab badge and show without waiting for 3 runs |

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

The page is static and loads `/api/bench` in the browser, so new runs show up without a release. Each model's row has an anchor (`/bench#google-pixel-10a`), which is the link `--share` prints. A page per model can come later on `GET /api/bench/:model`.

The $5 server row isn't there yet: it needs our own measured run first.

The user guide has a page on `dukoi bench` at `/docs/bench`.

---

## What's left

1. **Run it on the lab phones** with the new app, and check the numbers against `oha` on each one.
2. **Add the lab phones' keys** to `LAB_PHONES`.
3. **The landing section**, with those lab numbers in `site/src/lib/bench.ts`.
4. **Swap the example output** on `/docs/bench` for a real lab run.

---

## Open questions

| Question | Options |
| --- | --- |
| Which phone leads on the landing page? | The fastest lab phone, or a budget one to show that even cheap phones are enough |
| Show a model with only 1 or 2 runs? | Hidden until 3 for now. Could show it marked "few runs" instead |
| A Pro relay later will change tunnel numbers | Keep quick-tunnel and relay results apart from the start (add a `tunnel` field), or later |
| Android gives model codes, not names (`Nothing A024`, `Samsung SM-S911B`) | Map codes to names on dukoi.com with Google's list of Play devices, or a small list of our own |
