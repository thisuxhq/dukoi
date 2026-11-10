# Contributing

This doc covers how to set up the repo, make a change and get it merged. It's aimed at making your first PR feel easy.

> The repo doesn't exist yet. This doc describes the setup we're aiming for, so build the repo to match it.

---

## What you need

| Tool | For |
| --- | --- |
| Node.js 22+ and pnpm | CLI, dashboard, starters |
| [Android CLI](android-cli.md) (`android`), plus a JDK 17+ | The phone app: create, build, run, screenshots |
| An arm64 Android phone, Android 10+ | Running it for real. An emulator works for UI only. |

## Set up

```bash
git clone <repo>
cd droidhost
pnpm install
pnpm fetch-binaries   # downloads Node + cloudflared into android/app/src/main/jniLibs
```

## Run it

```bash
pnpm dev              # CLI + dashboard in watch mode
pnpm test             # all JS/TS tests
```

```bash
cd android
android run              # build, install and launch on a connected phone
./gradlew test           # Kotlin unit tests
```

Use the Android CLI for all phone work: running the app, screenshots (`android screen capture`) and finding UI elements (`android layout`). Use `adb` only where the CLI has no command. See [android-cli.md](android-cli.md).

Then pair with the phone and try a starter:

```bash
pnpm cli pair
pnpm cli init hono-api && cd hono-api && pnpm cli deploy
```

---

## Where things live

```
android/     Control app, foreground service, agent, process manager (Kotlin)
cli/         droidhost CLI (TypeScript)
dashboard/   Web dashboard (SvelteKit, static)
shared/      Admin API types, shared by cli and dashboard
starters/    The five starters
scripts/     Binary fetch and pack scripts
docs/        These docs
```

More detail is in [architecture.md](architecture.md).

---

## Making a change

1. **Small PRs.** One idea per PR.
2. **Update the docs** in the same PR if the behaviour changes.
3. **Add tests** for logic such as packing, backoff, signing and release switching.
4. **Device-lab check** if the change touches process lifecycle, setup, networking or the service. Say which phones you tested on.
5. **Run** `pnpm test` and `./gradlew test` before pushing.

### Style

- Biome formats and lints JS and TS. ktlint handles Kotlin. Don't argue with the formatter.
- Name things for what they are. No abbreviations.
- Write boring code. See [dx-principles.md](dx-principles.md#part-2-building-droidhost).
- User-facing text follows [writing-style.md](writing-style.md).
- Icons: Hugeicons stroke-rounded SVGs, copied into the repo. No other icon set.

### Commits and PRs

- Commit messages use the imperative mood and stay short: "Add rollback command" rather than "Added rollback command".
- A PR description says **what** changed, **why**, and **how you tested it**.

---

## PR checklist

- [ ] Someone new could understand this change in five minutes
- [ ] Errors say what happened and what to do
- [ ] No new setting or step that could be a default instead
- [ ] No secrets in logs or output
- [ ] Docs updated
- [ ] Tests pass, and the device lab was checked if needed

## Decisions

If your change makes a choice that's hard to undo, add an entry to [decisions.md](decisions.md).

## Security issues

Don't open a public issue. See [security.md](security.md#reporting-a-vulnerability).
