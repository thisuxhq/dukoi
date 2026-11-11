# Contributing

This doc covers how to set up the repo, make a change and get it merged. It's aimed at making your first PR feel easy.

---

## What you need

| Tool | For |
| --- | --- |
| Bun 1.4+ and Node.js 24+ | Installs, tests and bundling (Bun); the CLI and agent run on Node |
| [Android CLI](docs/android-cli.md) (`android`), plus a JDK 17+ | The phone app: create, build, run, screenshots |
| An arm64 Android phone, Android 10+ | Running it for real. An emulator works for UI only. |

## Set up

```bash
git clone https://github.com/thisuxhq/dukoi.git
cd dukoi
bun install
scripts/prepare-android.sh   # fetches Node and bundles the agent into the APK
```

## Run it

```bash
bun test             # all TypeScript tests
bun run typecheck    # TypeScript in every package
bun run lint         # Biome
bun run cli --help   # run the CLI from source
```

```bash
cd android
./gradlew assembleDebug   # build the APK
android run --apks=app/build/outputs/apk/debug/app-debug.apk   # install and launch
./gradlew test           # Kotlin unit tests
```

Use the Android CLI for all phone work: running the app, screenshots (`android screen capture`) and finding UI elements (`android layout`). Use `adb` only where the CLI has no command. See [android-cli.md](docs/android-cli.md).

Then pair with the phone and try a starter:

```bash
bun run cli pair
bun run cli deploy starters/notes-api
```

---

## Where things live

```
android/     The phone app (Kotlin): keeps the agent alive, runs setup, approves pairing
agent/       Runs on the phone on bundled Node: admin API, process manager, deploys, logs
cli/         dukoi CLI (TypeScript)
dashboard/   Web dashboard (SvelteKit 3 server with remote functions)
shared/      Admin API types, shared by agent, cli and dashboard
starters/    The five templates (dukoi init)
scripts/     Binary fetch and pack scripts
docs/        Product and engineering docs
site/        The landing page and user guide at dukoi.com
```

More detail is in [architecture.md](docs/architecture.md).

---

## Making a change

1. **Small PRs.** One idea per PR.
2. **Update the docs** in the same PR if the behaviour changes.
3. **Add tests** for logic such as packing, backoff, signing and release switching.
4. **Device-lab check** if the change touches process lifecycle, setup, networking or the service. Say which phones you tested on.
5. **Run** `bun test` and `./gradlew test` before pushing.

### Style

- Biome formats and lints JS and TS. ktlint handles Kotlin. Don't argue with the formatter.
- Name things for what they are. No abbreviations.
- Write boring code. See [dx-principles.md](docs/dx-principles.md#part-2-building-dukoi).
- User-facing text follows [writing-style.md](docs/writing-style.md).
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

If your change makes a choice that's hard to undo, add an entry to [decisions.md](docs/decisions.md).

## Security issues

Don't open a public issue. Email hello@thisux.com instead, as [SECURITY.md](SECURITY.md) explains.

## Code of conduct

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).

## License

Dukoi is under the [Apache License 2.0](LICENSE), copyright THISUX Private Limited. By sending a pull request, you agree your contribution is licensed under the same terms (section 5 of the license). You don't need to sign anything else.
