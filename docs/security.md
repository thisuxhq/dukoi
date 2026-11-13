# Security

This doc explains how Dukoi keeps the phone and its apps safe, and what it does **not** protect against.

**The one rule:** only deployed app ports ever reach the internet. Everything that controls the phone stays private.

---

## What we protect

| Asset | Why it matters |
| --- | --- |
| Control of the phone | Anyone with admin access can run code on it. |
| App secrets | API keys and tokens in environment variables. |
| App data | SQLite files, Redis and Postgres databases, and uploads on the phone. |
| The owner's personal data | Many "spare" phones still hold photos, accounts and SIMs. |

## Who we defend against

| Attacker | Where they are | What stops them |
| --- | --- | --- |
| Internet visitor | Through the tunnel | The tunnel maps to app ports only. The admin API isn't reachable. |
| Someone on the same Wi-Fi | LAN | The admin API needs a signed request from a paired key, over TLS. |
| A stolen or copied laptop | Holds a device key | Remove that computer on the phone, and its key stops working at once. |
| A buggy or hostile app | On the phone | Separate folders and environments. **This isn't strong isolation**, see the limits below. |

---

## Pairing and keys

- The computer makes an **Ed25519 key pair**. The private key never leaves the computer.
- The phone shows a 6-digit code, and the CLI shows the same code. The user approves on the phone, and nothing happens without that tap.
- The phone stores the computer's public key. The CLI stores the phone's public key and checks every response is signed by it, so a fake phone on the network can't answer for it.
- **There are no passwords anywhere.**
- Each request is signed with a timestamp and a nonce, and the phone rejects replays.
- The phone app lists paired computers. Removing one takes effect on the next request.

## Admin API

- Listens on one LAN port (7070). Every request must be signed by a paired computer, and every JSON response is signed by the phone. Traffic isn't encrypted in phase 1, so secrets are encrypted to the phone's key before they're sent (see D-104).
- **It never goes through a tunnel.** The tunnel config is built from app ports only, and the agent refuses to create a tunnel to its own port.
- Custom domains: the Cloudflare login certificate and tunnel credentials live only in the phone's private storage. Dukoi changes only DNS records it created itself (see D-109).
- The phone app talks to the same agent on `127.0.0.1` through `/local/...` endpoints, which answer only requests from the phone itself. They cover pairing approval, the app list, app logs, start, stop, restart, roll back and phone status. Anything running on the phone can reach loopback, including your own apps, so treat deployed apps as trusted code (see the limits below).
- Acceptance check: a port scan from outside finds only app ports.

## Secrets

- Environment variables are encrypted on the phone with a key held in the **Android Keystore**.
- They're decrypted only when the app starts, and passed in as environment variables.
- They're masked in all logs, CLI output, dashboard views and `--json`. `env list` shows names only.
- They're never included in telemetry.

## Storage

- Apps use Dukoi's private storage by default, so other phone apps can't read it.
- Shared storage is off. Turning it on needs an explicit setting **and** Android's "All files access" permission.

## Apps and uploads

- Each app has its own folder, `data/` directory, environment and port.
- The file-drop template sends uploads with `Content-Security-Policy: sandbox`, so uploaded HTML or SVG opens but its scripts never run on your domain.
- App settings (`dukoi env`) are passed to the app as environment variables. The API returns their names, never their values.

## Databases

- Every Redis and Postgres database has its own password, made by the agent, because any Android app on the phone can reach `127.0.0.1` (D-122).
- Redis keeps its password in a config file only the Dukoi app can read, not on the command line. Postgres checks the password before PGlite sees the connection; PGlite itself never listens.
- Databases listen on `127.0.0.1` unless Wi-Fi access is turned on, and never go through a tunnel.
- Connection URLs, password included, go only to paired computers over signed requests, and to connected apps as settings. The CLI and dashboard show them masked; `dukoi db url` and the copy buttons give the full URL on purpose.
- Over Wi-Fi the password crosses the network in plain text, as Redis `AUTH` and Postgres's plain password do. The docs say to turn Wi-Fi access on only on a trusted network.

## Audit log

The phone records every deploy, rollback, restart, setting change, secret change (by name, never the value), pairing and unpairing. Each entry stores the time, the computer's key name and the action. The log can be viewed on the phone and in the dashboard.

## Personal phones

- Setup suggests a factory reset before turning a used phone into a server.
- Dukoi warns when it detects signs of a daily phone, such as signed-in accounts or many installed apps.

## Telemetry

- **Opt-in only.** It's asked about clearly during setup.
- It never includes app code, logs, environment variables, URLs or IP addresses.
- See [observability.md](observability.md#telemetry) for what's sent.

---

## Limits we state plainly

We say these things in the docs and the app, not just here:

- **There's no container isolation.** Apps run as the same Android user. A hostile app could read another app's files. Only deploy code you trust.
- **This isn't a production SaaS host.** There are no uptime promises.
- **Quick tunnel URLs are public to anyone who has the link.** Add auth in your app if it needs it.
- **Your ISP's terms may forbid running servers.** Tunnels keep traffic outbound, but check your plan.
- **SMS (later phases)** is for personal alerts only. Bulk or commercial SMS from a personal SIM breaks TRAI rules in India.

## Reporting a vulnerability

Email hello@thisux.com rather than opening a public issue. [SECURITY.md](../SECURITY.md) says what to include and what happens next.
