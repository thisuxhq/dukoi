# Roadmap

This doc covers what we build and in what order, and the gates that decide when we move on.

**The rule:** each phase starts only when the one before it hits its reliability target.

---

## The first 90 days

Days count from the start of the build. We'll set real dates once the start date is fixed.

| Days | Focus | Work | Gate to move on |
| --- | --- | --- | --- |
| 1 to 30 | **Build the MVP** | APK, pairing, deploy, logs, quick tunnel. Talk to 20 developers. A 60-second demo video. | ◆ **7 days alive on all 4 phones** |
| 31 to 60 | **Open-source launch** | GitHub with benchmarks. Hacker News, Reddit, X and Indian dev groups. Opt-in telemetry. | ◆ **50 developers with a real app** |
| 61 to 90 | **First revenue** | Paid relay and dashboard. First 10 paying users. Find 3 surprising uses. Test a business angle. | ◆ **10 paying users and weekly growth** |
| After 90 | **Apply to YC** | A tested one-liner, a weekly growth chart, user quotes, a demo, and a Delaware C corp ready. | |

Phase 2 features start only after these gates are met.

---

## Phase 1: deploy and stay alive

**Outcome:** deploy a Hono API to a phone in under 2 minutes after setup, and keep it running for 7 days.

- One APK with Node and `cloudflared` bundled. See [tech-stack.md](tech-stack.md).
- Guided setup that beats the app killers. See [device-setup.md](device-setup.md).
- QR or code pairing. See [security.md](security.md).
- `droidhost deploy` for Node and static apps. See [deploy-and-releases.md](deploy-and-releases.md).
- Start, stop, restart, auto-restart and start on boot. See [process-management.md](process-management.md).
- Logs and health everywhere. See [observability.md](observability.md).
- Quick tunnels and custom domains. See [networking.md](networking.md).
- Releases with instant rollback.

**Not in phase 1:** Docker, Python, Go, Rust, Postgres, Redis, multi-phone clusters, hardware APIs, the hosted relay, paid plans, the Play Store and uptime promises.

### Phase 1 success metrics

| Metric | Target | Measured by |
| --- | --- | --- |
| Time to first URL | Under 2 minutes after setup | Telemetry from install to first healthy deploy |
| Setup completion | 80% finish all 4 steps | Checklist events |
| Developers with a real app | 50 | Paired devices with an app running over 24 hours |
| 30-day retention | 40% of those 50 | Daily heartbeat |
| Uptime on lab phones | 7 days with no manual fixes | Device lab |
| Unexpected kills | Under 1 per device per day | Watchdog reports |
| Auto-recovery | 99% back within 5 seconds | Watchdog logs |

---

## Phase 2: more to run

- GitHub deploys on push, with preview URLs per branch
- Python with pip, then Go and Rust binaries
- Cron jobs and background workers with failure alerts
- SQLite browser, a Redis add-on, and Litestream backups to R2 or S3
- An S3-compatible file storage API backed by phone storage
- A Postgres add-on with low connection limits
- A remote builder for native npm modules
- A DroidHost MCP server, so AI agents can deploy, restart and read logs
- Local models through bundled llama.cpp with an OpenAI-compatible endpoint

## Phase 3: phone superpowers and fleets

- A local API for SMS, calls, camera, GPS, sensors, Bluetooth, NFC, notifications and speakers
- A permission gate, so the owner approves each app's hardware access
- A fleet dashboard for many phones
- `droidhost scale`, with load balancing and failover across phones
- Leader election for cron jobs and replicated databases
- A hosted DroidHost relay with free subdomains and no upload limit

## Phase 4: the wild ideas

- Nothing Glyph lights and an always-on display showing server health
- Control by SMS, Telegram or voice
- A one-click app store for self-hosted tools
- Phones as GitHub Actions runners and Android test farms
- A community edge network and a compute marketplace
- Offline mode for shops, farms and schools
- Cloud burst when traffic passes what the phone can handle
- Live migration of apps between phones

---

## Business model

The runtime stays free and open source. Phase 1 charges nothing.

| Plan | Rough price to test | Includes |
| --- | --- | --- |
| Free | $0 | APK, CLI, one phone, local URLs, quick tunnels, named tunnels on your own Cloudflare account |
| Pro | $5 to $9 a month | Hosted dashboard, relay, free subdomains, no upload limit, cloud backups, alerts, uptime page |
| Team | $29 a month and up | Many phones, fleet controls, team access, audit log export |
| Business | Custom | Shops, schools and agencies running many devices, with support |
