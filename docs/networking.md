# Networking

This doc explains how apps get a local URL, a public URL and a custom domain, and why the admin API stays private.

---

## Three kinds of address

| Address | Example | Reachable from | Stable? |
| --- | --- | --- | --- |
| **Local URL** | `http://192.168.1.24:3000` | The same Wi-Fi, or anywhere on your tailnet | The CLI follows the phone when its IP changes |
| **Quick tunnel** | `https://shy-river-42.trycloudflare.com` | Anywhere | **No.** It changes when the tunnel restarts. |
| **Custom domain** | `https://api.example.com` | Anywhere | Yes |

Every deploy prints the local URL. A public URL appears once you run `dukoi expose`.

---

## Local URLs

- Each app gets its own port on the phone.
- The phone builds the local URL from its Wi-Fi IP. The CLI and dashboard swap in the address they reached the phone on, so the URL they show opens from that computer.

## Finding the phone

The CLI saves every address a paired phone has answered on. Before each command it:

1. Tries the saved addresses at once (2.5 seconds each) and uses the first that answers with the phone's key.
2. If none answers, searches this Wi-Fi with mDNS and the tailnet with `tailscale status --json`, and asks each phone it finds for its key.
3. Saves the address that worked, so the next command is instant.

A phone is matched by the key pinned at pairing, never by its address, so a new address can't stand in for it. If nothing answers, the error says why: Tailscale off on this computer, the phone offline on Tailscale, or not found.

## Away from home: Tailscale

Install [Tailscale](https://tailscale.com) on the phone and the computer and sign in to the same account. The agent listens on every address, so it answers on its Tailscale address (`100.x.y.z`) with no setup, and `dukoi` reaches it from any network. Tailscale's free Personal plan is enough.

- On the phone, turn on **Always-on VPN** for Tailscale and take it out of battery optimisation, or Android may stop it.
- Phones on mobile data or a hotspot often can't take a direct connection, so Tailscale relays the traffic. It's slower (about 200 ms a round trip in our tests) but works.
- The admin API isn't public: only devices on your tailnet reach it, and it still needs a signed request. Never use Tailscale Funnel for it.

## Why tunnels

Most home connections, and nearly all Indian ISPs, use **CGNAT**, so port forwarding doesn't work and home IPs change.

`cloudflared` makes an **outbound** connection to Cloudflare, and Cloudflare sends visitors back down it. There's no port forwarding, no static IP and no router setup.

```
Visitor ──HTTPS──▶ Cloudflare edge ◀══outbound tunnel══ cloudflared (phone) ──▶ app port
```

## Quick tunnels

```bash
dukoi expose
```

- Instant, with no account needed.
- The URL is random and **changes** whenever the tunnel restarts. Cloudflare gives no uptime promise for quick tunnels.
- Good for demos, testing and webhooks you can update.
- The CLI and dashboard always show the current URL.

### Our own cloudflared build

Cloudflare's `cloudflared-linux-arm64` can't look up names on Android, because it reads `/etc/resolv.conf`, which Android doesn't have. We build `cloudflared` from Cloudflare's source with `GOOS=android` so it uses Android's resolver, publish it as a GitHub Release, and ship it in the APK as `libcloudflared.so` (`scripts/fetch-cloudflared.sh`). See `spikes/cloudflared`.

### How the agent runs tunnels

- One `cloudflared` per exposed app, pointing at the app's **stable port**. It never points at the admin port.
- It's supervised like an app. If it restarts, the quick tunnel URL changes; the agent reads the new one from `cloudflared`'s output, and `dukoi ps` shows it.
- Exposed apps get their tunnel back by themselves after the agent or phone restarts.

## Custom domains (named tunnels)

```bash
dukoi expose hono-api --domain api.example.com
```

Or on the phone: open the app, tap the edit icon next to its public link (or **Make public**), and pick **Your domain**.

1. The first time, Cloudflare's login opens (in your computer's browser, or in a tab on the phone). Pick your domain and click **Authorize**. The phone gets a certificate for that domain.
2. The phone makes its own named tunnel, once, and a DNS record for the hostname.
3. The URL stays the same across restarts, reinstalls and reboots. After a restart it's back within a few seconds.

You need a domain on Cloudflare, which can be on the free plan. Use this for anything real. See D-109.

### How it works

- **One tunnel per phone.** A single `cloudflared` serves every app with a domain, from a config with one rule per hostname (`api.example.com → 127.0.0.1:3000`) and a final 404. It never routes to the admin port.
- **The certificate stays on the phone**, in Dukoi's private `tunnels/` folder, with the tunnel's credentials.
- **DNS through Cloudflare's API**, with the token in the certificate. Records Dukoi makes carry the comment `Dukoi`. It replaces or deletes only those, and refuses a name that already points somewhere else.
- **A domain replaces a quick tunnel** for that app. `dukoi expose --off` (or **Off** on the phone) removes the route and the DNS record.
- **One domain per phone login.** Names must be under the domain picked at login, for example `*.example.com`.

### Disconnecting from Cloudflare

**Settings → Cloudflare → Disconnect** on the phone (admin API: `DELETE /domain`) undoes the login:

- Every app with a domain loses its public URL, and the DNS records Dukoi made are deleted. Records it didn't make are left alone.
- The phone's tunnel is deleted from your Cloudflare account, and the login certificate is deleted from the phone.
- The login's API token stays in your account, because a token can't delete itself. Remove it at **dash.cloudflare.com → My Profile → API Tokens**.

Adding a domain again starts a fresh login, so you can switch to a different domain this way.

### If Cloudflare says "Quota limit exceeded"

Cloudflare allows 50 API tokens per account, and each login adds one. Delete tokens you no longer use at **dash.cloudflare.com → My Profile → API Tokens**, then run the command again.

## Reconnecting

- If Wi-Fi drops or the phone switches networks, `cloudflared` reconnects.
- The public URL works again **within 10 seconds**.
- The process manager supervises `cloudflared` like any other process, with restart and backoff.

---

## The admin API is never public

- The tunnel config is built **only** from app ports.
- The agent refuses any tunnel rule that points at its own port.
- The admin API listens on the LAN with TLS and signed requests only.
- Acceptance check: a scan from outside finds only app ports.

Remote control from outside your Wi-Fi isn't part of phase 1. It arrives later with the hosted relay.

---

## Limits

| Limit | Impact | What we do |
| --- | --- | --- |
| Cloudflare's free plan caps request bodies at **100 MB** | Large uploads fail | Chunked uploads in the file-storage starter. Our own relay comes in phase 3. |
| Home upload speed | Usually the real bottleneck, not the phone | Benchmarks show local versus tunnel numbers |
| ISP terms | Some forbid running servers | Traffic is outbound only, and we mention it in the docs |
| WebSockets, SSE | Work through Cloudflare tunnels | Nothing extra needed |
