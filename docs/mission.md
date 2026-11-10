# Mission

> Deploy real apps to old Android phones. One command. No root. No cloud bill.

## Why we exist

There are millions of good phones sitting unused in drawers. Meanwhile, developers pay a monthly fee for small servers to run bots, webhooks and side projects.

A 2019 flagship phone has more compute than a $5 VPS. It draws 2 to 5 watts, and its battery works like a built-in UPS. It's free because it's already yours.

Today, running a server on a phone takes Termux, around ten manual steps and a lot of babysitting, because Android keeps killing the process. Getting a public URL is a second problem on top of that. Most home connections in India sit behind CGNAT, so port forwarding doesn't work.

DroidHost makes this easy.

## What we do

DroidHost turns an old Android phone into an app server:

1. Install one APK.
2. Pair the phone with your computer.
3. Run `droidhost deploy`.
4. Get a live URL.

That's all there is to it. No Termux and no root. You don't need to know anything about Android internals, because DroidHost handles the Android app killers for you.

## Who we serve first

**An indie developer with a spare phone who wants a working URL in under two minutes.**

We don't build for anyone else until this person is happy. AI builders, self-hosters, small shops in India and Android test teams all come later, and each of them builds on what works for this first developer.

## What winning looks like

| We care about | Not about |
| --- | --- |
| Apps still running after 30 days | GitHub stars |
| Time from install to first URL | Number of features |
| Apps that survive a week with no manual fixes | Benchmark bragging |
| Developers who come back | One-time signups |

The phase 1 bar: deploy a Hono API to a phone in under two minutes after setup, and keep it running for seven days.

## Our long-term edge

Everyone treats phones as weak servers. We treat them as **servers with superpowers no VPS has**: SMS, camera, GPS, sensors, Bluetooth, a battery and cellular data.

Once the basics are rock solid, DroidHost will give deployed apps a simple local API for this hardware, protected by a permission gate the owner controls.

## What we promise

- **The runtime stays free and open source.** We charge only for hosted parts that people can't easily run themselves, such as the relay, the hosted dashboard and backups.
- **Your phone, your data.** App code, logs and secrets never leave the phone unless you send them somewhere yourself. Telemetry is opt-in.
- **Honesty about limits.** A phone is not a data centre. We say plainly what DroidHost can't do: it has no container isolation and makes no production SaaS uptime promises, and quick tunnel URLs can change.

## How we decide

When two options compete, we pick the one that:

1. Gets a developer to a working URL with fewer steps.
2. Keeps apps alive with fewer manual fixes.
3. Is simpler to explain in one sentence.

See [principles.md](principles.md) and [dx-principles.md](dx-principles.md) for how this works day to day.
