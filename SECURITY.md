# Security policy

Dukoi runs other people's code on a phone that may still hold their photos and accounts, so we take reports seriously. [docs/security.md](docs/security.md) explains what Dukoi protects, who it defends against and its stated limits.

## Supported versions

Dukoi is in early development, so only the latest code gets security fixes.

| Version | Supported |
| --- | --- |
| `main` and the latest release | Yes |
| Anything older | No |

## Reporting a vulnerability

Please don't open a public issue, pull request or discussion for a security problem.

Email **hello@thisux.com** with the subject `[security] dukoi`. Include:

- What you found and which part it's in: the phone app, the agent, the CLI, the dashboard, the install scripts or dukoi.com
- Steps to reproduce it, and the versions you used (`dukoi --version`, Android version and phone model)
- What an attacker could do with it

We'll reply within 3 working days to say we've got it, then keep you updated until it's fixed. Once a fix ships, we'll credit you in the changelog unless you'd rather we didn't.

## What counts

These are in scope, for example:

- Reaching the admin API (port 7070) without a paired key, or through a tunnel
- Pairing without the tap on the phone, or replaying a signed request
- Reading app secrets or another app's data
- Tampering with downloads from dukoi.com/install or getting past the checksum check

Problems that need someone to already control the phone or a paired computer are usually out of scope. Apps aren't strongly isolated from each other on the phone yet, as [docs/security.md](docs/security.md) says.
