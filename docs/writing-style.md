# Writing style

This doc explains how DroidHost sounds, in the app, CLI, dashboard, errors, alerts and docs.

**One line:** write like a calm, helpful friend who knows Android well and never makes you feel slow.

---

## The basics

- **Plain words.** Write "Android stopped your app", not "Process terminated by system".
- **Short sentences.** Aim for one idea each.
- **Active voice.** Write "We restarted it", not "It was restarted".
- **Say what to do next.** Every problem comes with a fix or a next step.
- **No blame.** Write "Your app didn't answer on port 3000", not "You forgot to listen on PORT".
- **No jargon without help.** If a technical word is needed, explain it once or link to [glossary.md](glossary.md).
- **No hype.** Leave out "blazing", "seamless", "revolutionary" and "magic".
- **Sentence case** in headings and buttons: "Pair a computer", not "Pair A Computer".

---

## Errors

Every error answers three questions:

1. **What happened?**
2. **Why?** (if we know)
3. **What do I do now?**

| ✗ Don't | ✓ Do |
| --- | --- |
| `Error: EADDRINUSE` | "Port 3000 is already in use by `portfolio`. We'll pick another port. Make sure your app reads `process.env.PORT`." |
| `Health check failed` | "Your app started but didn't answer within 10 seconds. Check that it listens on `process.env.PORT`." |
| `Unauthorized` | "This computer isn't paired with pixel-10a any more. Run `droidhost pair` to pair again." |
| `Process killed (9)` | "Android stopped my-api to save battery. We restarted it. Fix this for good →" |

A stack trace is never the whole message. Show it only with `--verbose`.

## Success

- Keep it short. A tick and the result are enough: "✓ Started and healthy".
- Show what's useful next, like the URL or the logs command.
- No exclamation marks, apart from a first-time welcome.

## Warnings

- Explain why it matters in one line.
- Warnings should be rare. If everything warns, nothing does.

> ⚠ Setup isn't finished. Android may stop your apps. Finish setup on the phone.

## Buttons and commands

- Use verbs: **Approve**, **Deploy**, **Roll back**, **Fix this**.
- Destructive actions name what they destroy: **Delete my-api**, not **OK**.
- CLI commands are words you'd say out loud: `deploy`, `logs`, `rollback`.

---

## Alerts

Alerts can arrive at 3 a.m., so make them complete on their own:

- Start with the phone and app name.
- Say what happened, in one line.
- Give the next step.

> ⚠ **pixel-10a**: my-api crashed 5 times in 2 minutes. Last error: `Cannot find module 'hono'`. Run `droidhost logs my-api`.

---

## Docs

- Start every doc with one sentence that says what it's for.
- Use tables and diagrams where they're clearer than paragraphs.
- Show real commands and real output.
- Write for a smart developer who has never touched Android internals.

---

## Words we use

| Use | Not |
| --- | --- |
| phone | device (in UI text), handset |
| app | service, workload, container |
| deploy | push, ship (in UI text) |
| public URL | ingress, endpoint |
| pair | register, enroll |
| setup | onboarding wizard |
| Android stopped it | process was reaped |
