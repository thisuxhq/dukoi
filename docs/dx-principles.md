# DX principles

Developer experience should feel **like walking on butter cake**: soft, smooth and pleasant, with nothing to trip over.

These principles cover two groups:

- **Developers who use DroidHost**, through the CLI, starters, deploys and logs.
- **Developers who build DroidHost**, through this repo, its code and docs.

The rule for both is the same: **simple, beautiful solutions that don't need a PhD to understand.**

---

## Part 1: Using DroidHost

### Your app should just work

If an app runs on your laptop with `npm start`, it should run on DroidHost with `droidhost deploy`. There's no Dockerfile, YAML or platform-specific code to write.

```bash
droidhost deploy
```

```
✓ Packed my-api (42 KB)
✓ Uploaded to pixel-10a
✓ Installed dependencies (8.1s)
✓ Started and healthy

  Local   http://192.168.1.24:3000
  Public  https://shy-river-42.trycloudflare.com

  Logs    droidhost logs my-api
```

### Detect, don't ask

The CLI works things out by itself:

| What | How we detect it |
| --- | --- |
| App name | `name` in `package.json`, or the folder name |
| App type | `package.json` means a Node app, `index.html` with no `package.json` means a static site |
| Start command | `scripts.start`, then `main` |
| Port | the `PORT` env var we pass in, which the app reads |
| Which phone | the only paired phone, or the last one you used |

A config file is **optional**. Use one only to override a guess.

### Short, guessable commands

The commands should be easy to guess, even if you've never read the docs.

```bash
droidhost pair            # link this computer to a phone
droidhost deploy          # ship the current folder
droidhost ps              # what's running
droidhost logs my-api     # live logs
droidhost restart my-api
droidhost rollback my-api
droidhost expose my-api   # get a public URL
droidhost env set my-api KEY=value
```

- Verbs are what you'd say out loud.
- No command needs more than one required argument.
- Each command has `--help` with a real example.
- Command and flag names are consistent: `--app`, `--device` and `--json` mean the same thing everywhere.

### Output is for humans first

- Show what happened, then what to do next.
- Use colour and ticks for people, and `--json` for scripts and agents.
- Show progress, not silence. If something takes more than a second, show a step.
- Never print a secret, not even partly.

### Errors teach

A good error answers three questions: **What happened? Why? What do I do now?**

```
✗ Deploy failed: sharp uses native code

  Phones can't compile native npm modules yet.

  Try instead:
    jimp        pure JS image processing
    @napi-rs/*  prebuilt for arm64 (some work)

  More: droidhost help native-modules
```

A stack trace is never the whole message. Add `--verbose` if you want one.

### Starters that deploy unchanged

Each starter (Hono API, Telegram bot, static site, file storage API and MCP server) deploys with **zero edits**. Each one is small enough to read in five minutes and uses no native modules.

### Fast feedback

- Logs stream within a second.
- `ps` shows CPU and memory at a glance.
- Redeploys are quick because unchanged dependencies aren't reinstalled.

---

## Part 2: Building DroidHost

### Boring code wins

- Choose the plain solution over the clever one.
- Readable beats short. If a reviewer has to pause and decode a line, rewrite it.
- No abstraction until the third time we need it.
- No dependency for something the standard library already does well.

### One way to do each thing

- One package manager, one formatter and one linter per language, all set up so nobody has to think about them.
- One command to set up the repo and one command to run all tests.

```bash
pnpm install
pnpm dev      # CLI and dashboard in watch mode
pnpm test
```

The Android app builds with one Gradle command, also documented in the repo README.

### Small pieces with clear edges

Each part has one job and a clear contract. See [architecture.md](architecture.md).

- **CLI** packs folders and talks to the agent.
- **Agent** receives commands and owns app lifecycles.
- **Process manager** spawns, watches and restarts.
- **Control app** handles UI, setup and the foreground service.

If you can't say what a module does in one sentence, split it.

### Types are the docs

- Shared types live in one place. The admin API's request and response shapes are defined once and used by the CLI, dashboard and agent.
- Name things for what they are: `releaseId` instead of `rid`, and `restartBackoffMs` instead of `rbo`.

### Test the scary parts

The biggest risk is Android killing work, so that's where testing is heaviest.

- Unit tests cover packing, release switching, backoff maths and key signing.
- Device lab runs on the four test phones (Nothing, Pixel, Redmi, Oppo) cover survival, reboot and thermal behaviour.
- A requirement is only done when its acceptance check passes on all four phones.

### Docs live next to the code

- Changing behaviour means updating the doc in the same PR.
- Every doc starts with one sentence that says what it's for.
- Diagrams over paragraphs where a picture is clearer.

### Write like a human

The same rules as [principles.md](principles.md): plain words, short sentences and active voice. This applies to commit messages, PR descriptions, code comments and user-facing strings.

---

## The butter cake check

Before you merge, ask:

- **First run:** could someone new set up the repo and run tests from the README alone?
- **First read:** could someone new understand this change in five minutes?
- **First failure:** if this breaks, does the error say what to do?
- **Less:** is there anything here we could delete?
