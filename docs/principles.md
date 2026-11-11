# Product principles

**The goal is a frictionless experience.** Each screen, command and message should feel effortless, like the product already knew what you wanted.

These principles apply to everyone who touches DroidHost: the phone app, the CLI, the dashboard, the docs and the error messages.

---

## 0. Fewer details, each one perfect

> Make every detail perfect and limit the number of details to perfect.

Before anything goes on a screen, in a command's output or in a doc, ask: **is it worth it?** If the screen still works without it, delete it.

- One fact per place. Don't join facts with mid-dots (·).
- No eyebrow text and no subtext under headlines. The headline and the action carry the meaning.
- Plain one-colour headlines. No highlighted keywords or trailing full stops.
- Short, direct words: "Pair", "Skip", "Public link".
- No decoration that doesn't do a job.

---

## 1. One obvious path

There is one right way to do each thing, and it's the first thing you see.

- Deploying is `droidhost deploy`. There's no "advanced deploy" and no choice between three methods.
- Setup is a checklist with one next step at a time. Users never see a settings page full of switches.
- When we're tempted to add an option, we pick a good default instead.

## 2. Zero to URL in two minutes

Time to first URL is the number that matters most. Each step we add costs us users.

- Don't ask for anything we can detect, such as the phone brand, Android version, app type, port or start command.
- Don't ask for anything we can generate, such as keys, app names or tunnel config.
- If a step can happen in the background, it happens in the background.

## 3. We fight Android so users don't have to

Android's app killers are our problem, not the user's.

- The setup checklist only shows a green tick once the system confirms the setting really took effect. Tapping a button isn't enough.
- Each phone brand gets its own exact steps, with screenshots for that maker.
- When Android kills something, we bring it back within 5 seconds and say **why** it died in plain words.

## 4. Never a silent failure

If something is wrong, the user finds out where they're already looking: the phone, the CLI or the dashboard.

- Unfinished setup shows a warning in all three places.
- Crashes, kills, overheating and power cuts trigger an alert.
- Each problem comes with the fix.

## 5. Plain words

Write as if you're explaining it to a smart friend who has never used Android Studio.

| Instead of | Say |
| --- | --- |
| "Process terminated by PhantomProcessKiller (signal 9)" | "Android stopped your app to save battery. We restarted it. Fix this for good →" |
| "ENOENT: node-gyp rebuild failed" | "`sharp` needs native code, which phones can't build yet. Try `jimp` instead, which is pure JavaScript." |
| "Health check timeout exceeded" | "Your app started but didn't answer on port 3000 within 10 seconds." |

## 6. Safe by default

The safe choice is the default, so users don't have to think about security to be secure.

- The admin API is never exposed to the internet. Only app ports are.
- There are no passwords anywhere. Pairing uses a code you approve on the phone.
- Secrets are encrypted and masked in every output.
- Apps use private storage unless the user opts in.

## 7. Respect the phone

It's a real device with a real battery, so we treat it with care.

- A thermal guard pauses low-priority apps when the phone gets hot.
- Battery protection stops charging at 80% where the phone allows it.
- We tell users to keep the phone in open air, and we warn them if they're running DroidHost on their daily phone.

## 8. Undo is always one step away

People try things more often when mistakes are cheap.

- Every deploy is a release, and rollback takes about a second.
- Redeploys swap traffic only after the new version passes its health check.
- Removing a paired computer takes effect at once.

## 9. Fewer, better things

Phase 1 is small on purpose. We'd rather do five things that never break than twenty that sometimes do.

- A new phase starts only after the current one meets its reliability target.
- Each feature has to justify the complexity it adds.

---

## The quick test

Before shipping anything, ask:

1. Could a new user do this without reading the docs?
2. Does it add a step, a question or a setting? Can we remove it?
3. If it fails, will the user know what happened and what to do?
4. Can I explain it in one sentence?

If any answer is "no", it isn't ready.
