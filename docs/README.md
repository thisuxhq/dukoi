# Dukoi docs

Dukoi turns old Android phones into app servers. Install one APK, pair it with your computer, run one command and get a live URL. No root, no Termux and no cloud bill.

The source of truth for scope is the [Dukoi PRD](https://claude.ai/artifact/AFJqfWbLkvVMutpSqe4Xjq). These docs turn it into how we build.

## Start here

| Doc | Read it to learn |
| --- | --- |
| [mission.md](mission.md) | Why Dukoi exists, who it's for and what winning looks like |
| [principles.md](principles.md) | How the product should feel: frictionless and safe by default |
| [dx-principles.md](dx-principles.md) | How using and building Dukoi should feel, like walking on butter cake |
| [tech-stack.md](tech-stack.md) | What we build with and why, marked decided or proposed |
| [architecture.md](architecture.md) | How the parts fit together, the key flows and where data lives |
| [roadmap.md](roadmap.md) | Phases 1 to 4, the 90-day gates, success metrics and plans |
| [decisions.md](decisions.md) | What we decided, what we proposed and what's still open |

## How it works

| Doc | Read it to learn |
| --- | --- |
| [device-setup.md](device-setup.md) | The setup checklist, the phantom process killer and steps for each brand |
| [deploy-and-releases.md](deploy-and-releases.md) | The deploy pipeline, releases, rollback and native modules |
| [process-management.md](process-management.md) | App states, auto-restart, watchdog, limits and phone protection |
| [networking.md](networking.md) | Local URLs, quick tunnels, custom domains and limits |
| [observability.md](observability.md) | Logs, metrics, alerts and opt-in telemetry |
| [security.md](security.md) | Pairing, keys, secrets, the threat model and stated limits |

## Using and building

| Doc | Read it to learn |
| --- | --- |
| [cli-reference.md](cli-reference.md) | Every `dukoi` command and flag |
| [starters.md](starters.md) | The templates and the rules they follow |
| [device-lab.md](device-lab.md) | Test phones, acceptance checks and benchmarks |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Repo setup, making a change and the PR checklist |
| [releasing.md](releasing.md) | Versions, the release key and `scripts/release.sh` |
| [android-cli.md](android-cli.md) | How we build, run and test the phone app with `android` |
| [writing-style.md](writing-style.md) | How Dukoi sounds in errors, alerts, UI and docs |
| [glossary.md](glossary.md) | Every term in plain words |

## Writing docs here

- Start with one sentence that says what the doc is for.
- Use plain words and short sentences.
- Prefer a table or diagram to a long paragraph.
- Update the doc in the same PR as the behaviour change.
