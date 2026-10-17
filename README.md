# clawscore

**One command. A 0-100 security score for your OpenClaw setup, and the fixes.**

Public MIT-licensed TypeScript CLI. Run it with `npx clawscore`. Fully offline by default.

[![clawscore](docs/demo-placeholder.svg)](docs/demo-placeholder.svg)

_Placeholder artwork until a real terminal recording exists._

**Not affiliated with OpenClaw.**

## Quickstart

```bash
npx clawscore
npx clawscore --path ~/.openclaw
npx clawscore --badge clawscore.svg
npx clawscore fix --yes
npx clawscore skill ./path-to-skill
```

```bash
npx clawscore --json --markdown
npx clawscore fix --path ~/.openclaw          # dry run
npx clawscore fix --path ~/.openclaw --yes    # verified backup, then apply
npx clawscore fix --restore ~/.openclaw/.clawscore-backup/<stamp>
```

## Sample report

```
clawscore 0.1.0
path     fixtures/bad
version  2026.1.24

  SCORE  13/100   GRADE F
  100 − 12 − 10 − 10 − 8 − 6 − 6 − 6 − 6 − 5 − 5 − 5 − 4 − 2 − 2 = 13  (repeat ids count once)

findings  critical 4  high 16  medium 3  low 1  info 0

!! [CRITICAL] gateway-public-bind  −12 pts
         Gateway bound to a public interface
         evidence: gateway.bind is "lan" — official values are loopback | lan | auto | tailnet | custom
         fix: Set gateway.bind to "loopback" (the documented local-only enum value).

!  [HIGH    ] gateway-auth-token  −10 pts
         Missing gateway auth token
         evidence: gateway.auth.token is missing.

!  [HIGH    ] plaintext-secret  −8 pts
         evidence: openclaw.json: env.vars.OPENAI_API_KEY holds a secret-looking value [REDACTED]
```

Share the Markdown form (`--markdown`) or a shields-style badge (`--badge out.svg`).

## What it checks

| Id | What |
| --- | --- |
| `advisory-*` | Installed version vs known-vulnerable ranges in `data/advisories.json` |
| `gateway-public-bind` | `gateway.bind` is `lan` / `auto` / `tailnet` / `custom` (or a legacy public host alias) |
| `gateway-auth-token` | Missing, disabled, or weak gateway auth |
| `gateway-origin-check` | `gateway.controlUi.allowedOrigins` is `*` or Host-header fallback is on |
| `plaintext-secret` | API keys / tokens in config or skill files (**always redacted**) |
| `sandbox-disabled` | `agents.defaults.sandbox.mode` is `off` (OpenClaw default) |
| `unrestricted-shell` | `tools.exec.mode` is `full` |
| `exec-allowlist-missing` | No `tools.exec.safeBins` (official) and no leftover allowlist array |
| `skill-risky-pattern` | Skills that read `~/.ssh`, keychains, `.env`, cookie stores; `curl\|sh`; eval/base64; postinstall; non-allow-listed hosts |
| `skill-unpinned` / `skill-unsigned` | Floating versions, missing checksums/signatures |
| `messaging-open-senders` | Channels with `dmPolicy: open` or `allowFrom: ["*"]` |
| `file-permissions` | Config/credential files reachable by group or other |

Locate: `--path` (default `~/.openclaw`). Reads `openclaw.json` / `openclaw.json5`. Never touches a live install from tests. Keys and values are verified in [docs/CONFIG-SOURCES.md](docs/CONFIG-SOURCES.md).

## Score methodology

Start at **100**. Each distinct check `id` subtracts its **weight once** (repeat hits are listed with their point cost but not double-counted; the max weight for that id is used). Floor 0. Terminal and Markdown reports print `−N pts` on every finding and a `100 − … = score` line so the math adds up.

| Grade | Score |
| --- | --- |
| A | 90–100 |
| B | 80–89 |
| C | 70–79 |
| D | 40–69 |
| F | 0–39 |

Scores below 50 are **D** (40–49) or **F** (0–39). Weights are opinionated hardening points, not CVSS. A patched, loopback, sandboxed, allow-listed setup should land in A.

| Check id | Points deducted |
| --- | ---: |
| `gateway-public-bind` | 12 |
| `gateway-auth-token` | 8–10 |
| `advisory-*` | 6 (high) / 8 (critical) |
| `plaintext-secret` | 8 |
| `sandbox-disabled` | 6 |
| `messaging-open-senders` | 6 |
| `gateway-origin-check` | 5–6 |
| `unrestricted-shell` | 5 |
| `file-permissions` | 5 |
| `exec-allowlist-missing` | 4 |
| `skill-risky-pattern` | 10 |
| `skill-unpinned` / `skill-unsigned` | 2 |
| `version-unknown` | 2 |

## Safe auto-fix

`clawscore fix` is reversible hardening only:

1. Refuses to run if a backup cannot be written
2. Writes a timestamped copy under `.clawscore-backup/` and prints `Backup:` plus `Restore: clawscore fix --restore <backupDir>`
3. Prints a unified diff
4. Applies **only** with `--yes`, using **minimal in-place JSON5 edits** (comments and unrelated formatting stay)

Examples: bind the gateway to `"loopback"`, `chmod 600` on config/credentials, replace an open sender policy with an allow-list stub (`REPLACE_WITH_YOUR_SENDER_ID`). If a key cannot be edited safely in place, it is skipped and a one-line manual change is printed.

### What fix will not do

`clawscore fix` does **not** create gateway tokens, enable the agent sandbox, or delete skills. It does not rewrite secret values. Enabling sandbox or a real exec allow-list is left to the operator.

## Skill scan and GitHub Action

Scan a skill **before** you install it:

```bash
npx clawscore skill ./path-to-skill
```

Non-zero exit if anything above `info` is found.

Reusable action (this repo):

```yaml
# .github/workflows/skill.yml
name: skill
on: pull_request
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: realmpastai-web/clawscore@main
        with:
          path: .
```

## Advisories

Bundled in `data/advisories.json` (offline). Optional network refresh:

```bash
npx clawscore --update-advisories
```

Override the URL with `CLAWSCORE_ADVISORIES_URL`. Entries are included only after verification against GitHub Security Advisories / NVD / the OpenClaw repo.

Currently shipped:

| Id | Affected | Fixed | Source |
| --- | --- | --- | --- |
| [CVE-2026-25253](https://nvd.nist.gov/vuln/detail/CVE-2026-25253) | `<2026.1.29` | 2026.1.29 | [GHSA-g8p2-7wf7-98mq](https://github.com/advisories/GHSA-g8p2-7wf7-98mq) · [OpenClaw advisory](https://github.com/openclaw/openclaw/security/advisories/GHSA-g8p2-7wf7-98mq) |
| [CVE-2026-24763](https://nvd.nist.gov/vuln/detail/CVE-2026-24763) | `<2026.1.29` | 2026.1.29 | [GHSA-mc68-q9jw-2h3v](https://github.com/advisories/GHSA-mc68-q9jw-2h3v) · [CVE record](https://www.cve.org/CVERecord?id=CVE-2026-24763) |

## Not affiliated with OpenClaw

clawscore is an independent scanner for local OpenClaw (Clawdbot / Moltbot) installs. It is not an official OpenClaw product, is not endorsed by the OpenClaw maintainers, and does not talk to OpenClaw infrastructure unless you pass `--update-advisories`.

## Responsible disclosure

See [SECURITY.md](SECURITY.md).

- **OpenClaw vulnerabilities:** report them to [OpenClaw security advisories](https://github.com/openclaw/openclaw/security/advisories/new). Do not open a public clawscore issue that includes an exploit.
- **clawscore vulnerabilities:** use a [private GitHub security advisory](https://github.com/realmpastai-web/clawscore/security/advisories/new) on this repo.
- This tool **redacts secrets** and ships **no live credentials**. Fixture values are placeholders.

## Install

```bash
npm i -g clawscore
clawscore --help
```

Node 20+. JSON reports validate against [`schemas/report.schema.json`](schemas/report.schema.json).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

```bash
git clone https://github.com/realmpastai-web/clawscore
cd clawscore
npm ci && npm run build && npm test
```

MIT — see [LICENSE](LICENSE).
