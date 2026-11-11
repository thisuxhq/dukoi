# Glossary

This doc defines the words we use in Dukoi and these docs, in plain terms.

| Term | Meaning |
| --- | --- |
| **Agent** | The part of Dukoi on the phone that accepts commands from paired computers. It's also called the admin API. |
| **Admin API** | The private API the CLI and dashboard use to control the phone. It's never exposed to the internet. |
| **App** | Something you deployed: a Node app, worker or static site. |
| **Audit log** | The phone's record of every deploy, restart, setting change and pairing. |
| **Backoff** | Waiting longer between each restart of a crashing app: 1 s, 2 s, 4 s and so on, up to 30 s. |
| **CGNAT** | When your ISP shares one public IP across many homes. It's why port forwarding doesn't work, and why we use tunnels. |
| **cloudflared** | Cloudflare's tunnel program, bundled in the APK. |
| **Control app** | The Dukoi app you see on the phone. |
| **Custom domain** | Your own hostname (like `api.example.com`) served through a named tunnel. |
| **Device key** | The key pair a computer makes when pairing. It's used to sign every command. |
| **Device lab** | Our four test phones: Nothing, Pixel, Redmi and Oppo. |
| **Doze** | Android's deep battery-saving mode, which pauses background work. |
| **Foreground service** | An Android service with a persistent notification that Android tries hard not to kill. All of Dukoi runs under one. |
| **Health check** | The test a new release must pass before it gets traffic. |
| **Local URL** | An app's address on your Wi-Fi, like `http://192.168.1.24:3000`. |
| **Named tunnel** | A Cloudflare tunnel tied to your account with a fixed hostname. |
| **Pairing** | Linking a computer to a phone by approving a matching code on the phone. |
| **Phantom process killer** | An Android 12+ feature that kills child processes it thinks use too much CPU. It's the main reason Node apps die. |
| **Priority** | Critical, Normal or Low. Low apps pause first when the phone is hot. |
| **Process manager** | The part of Dukoi that starts, watches, restarts and limits apps. |
| **Quick tunnel** | A free, instant Cloudflare tunnel with a random URL that can change. |
| **Release** | One deployed version of an app. The phone keeps the last 5. |
| **Rollback** | Switching an app back to an earlier release, which takes about a second. |
| **Setup checklist** | The steps on the phone that stop Android from killing Dukoi. |
| **Soak test** | Running apps for 7 days with no manual fixes, to prove reliability. |
| **Starter** | A ready-made app that deploys with zero edits. |
| **Thermal guard** | Pauses Low-priority apps above 43 °C and resumes them below 40 °C. |
| **Tunnel** | An outbound connection from the phone to Cloudflare that brings visitors back in. No port forwarding is needed. |
| **Vendor killer** | Extra app-killing by phone makers like Xiaomi, Oppo and Samsung, on top of Android's own. |
| **Watchdog** | Notices when Android kills an app and brings it back within 5 seconds. |
| **Worker** | An app that doesn't open a port, like a Telegram bot. |
