# cloudflared spike

This spike answers one question: **can the phone give its apps a public HTTPS URL?**

It can. A Cloudflare quick tunnel from a Nothing Phone (3) on Android 16 served the Node survival server to the public internet in about 180 ms.

---

## What we tried

| # | Try | Result |
| --- | --- | --- |
| 1 | Cloudflare's official `cloudflared-linux-arm64` release | ❌ Every DNS lookup failed |
| 2 | `cloudflared` built from source for Android (`GOOS=android`, cgo) | ✅ Public URL works |

### Why the official build fails

The official build is a static Linux program. Its DNS reads `/etc/resolv.conf`, which Android doesn't have, so it falls back to `[::1]:53`, where nothing listens:

```
failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel":
dial tcp: lookup api.trycloudflare.com on [::1]:53: read: connection refused
```

### The fix

`scripts/build-cloudflared-android.sh` builds Cloudflare's own source with `GOOS=android` and cgo, so Go uses Android's resolver, as Node does. It runs in the same arm64 Linux container as the Node build and takes about two minutes.

```bash
scripts/build-cloudflared-android.sh          # → build/cloudflared-android/2026.10.7/cloudflared (25 MB)
```

---

## Results (2026-11-11)

| Check | Result |
| --- | --- |
| Starts on Android 16 | ✅ `cloudflared version 2026.10.7` |
| Gets a quick tunnel URL | ✅ `https://<random>.trycloudflare.com` |
| Connects to Cloudflare | ✅ QUIC to `maa04` (Chennai) |
| Serves the phone's Node app from the internet | ✅ HTTP 200 in 0.18 s |
| Opens in a browser | ✅ |

## Still to handle

- **Two lookups still fail and fall back.** `cfd-features.argotunnel.com` (feature flags) and the region lookup for `region1.v2.argotunnel.com` use Go's pure resolver for TXT and SRV records, which still reads `/etc/resolv.conf`. cloudflared falls back on its own and the tunnel works. A cleaner fix is to point the region lookup at known edge addresses or patch the resolver. It isn't needed for phase 1.
- **Quick tunnel URLs change** whenever the tunnel restarts. Named tunnels with a custom domain fix this (`droidhost expose --domain`).
- **Ship it like Node:** build once per cloudflared version, publish as a GitHub Release, and add it to the APK as `libcloudflared.so`.
