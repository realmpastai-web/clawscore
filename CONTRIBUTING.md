# Contributing to clawscore

Thanks for helping harden OpenClaw setups. This repo is a **read-only scanner** plus a small set of **reversible** fixes. It is not affiliated with OpenClaw.

## Development

Requirements: Node.js 20+.

```bash
npm ci
npm run build
npm test
```

Tests must use **fixture configs only** (`fixtures/good`, `fixtures/bad`, `fixtures/mixed`, `fixtures/skills/*`). Never point the test suite at a real `~/.openclaw` install.

## Adding a check

1. Give it a stable `id`, a `severity`, a `weight` (points subtracted from 100), `evidence`, and `fix` text.
2. **Never print secret values.** Run evidence through `redactSecrets` and use `[REDACTED]`.
3. Keep the scanner offline. Network I/O belongs only behind `--update-advisories`.
4. Cover the check with a fixture (good path and fail path).

## Advisories

`data/advisories.json` may include an entry only after you verify it against an authoritative source:

- NVD (`https://nvd.nist.gov/vuln/detail/CVE-…`)
- GitHub Security Advisories (`https://github.com/advisories/GHSA-…`)
- The OpenClaw repository’s own advisories (`https://github.com/openclaw/openclaw/security/advisories`)

If you cannot verify a candidate CVE, leave it out and mention it in the PR.

## Safe fixes

`clawscore fix` may only apply reversible hardening (bind loopback, file modes, sender allow-list stub, origin allow-list). It must **refuse if the backup cannot be written**, print the backup path and `clawscore fix --restore <backupDir>`, print a diff, and require `--yes`. Edits must be **in-place JSON5** (comments stay). Never delete skills, invent tokens, or enable sandbox.

Config keys must match official OpenClaw docs/source. See [docs/CONFIG-SOURCES.md](docs/CONFIG-SOURCES.md).

## Pull requests

- Target `main`.
- Keep the PR focused. Include fixture updates with check changes.
- Do not commit secrets, live installs, or `node_modules`.

## Responsible disclosure

If you find a vulnerability **in OpenClaw**, report it through [OpenClaw’s security advisories](https://github.com/openclaw/openclaw/security/advisories/new) — not by opening a public clawscore issue that includes an exploit.

If you find a vulnerability **in clawscore**, open a private GitHub security advisory on this repository.
