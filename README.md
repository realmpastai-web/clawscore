# clawscore

**One command. A 0-100 security score for your OpenClaw setup, and the fixes.**

Public MIT-licensed TypeScript CLI. Run it with `npx clawscore`. Fully offline by default.

[![clawscore](docs/demo-placeholder.svg)](docs/demo-placeholder.svg)

_Demo GIF placeholder: replace `docs/demo.gif` with a terminal recording when you have one._

```bash
npx clawscore --path ~/.openclaw
npx clawscore --json --badge clawscore.svg
npx clawscore fix --path ~/.openclaw          # dry run
npx clawscore fix --path ~/.openclaw --yes    # backup, then apply
npx clawscore skill ./my-skill
```

**Not affiliated with OpenClaw.**

## Sample report

```
clawscore 0.1.0
path     fixtures/bad
version  2026.1.24

  SCORE  13/100   GRADE F

findings  critical 4  high 16  medium 3  low 1  info 0

!! [CRITICAL] gateway-public-bind  weight 12
         Gateway bound to a public interface
         evidence: gateway.bind is "0.0.0.0" — this listens beyond loopback
         fix: Set gateway.bind to "loopback" (or 127.0.0.1)

!  [HIGH    ] gateway-auth-token  weight 10
         Missing gateway auth token
         evidence: gateway.auth.token is missing.

!  [HIGH    ] plaintext-secret  weight 8
         evidence: openclaw.json: env.vars.OPENAI_API_KEY holds a secret-looking value [REDACTED]
```

Share the Markdown form (`--markdown`) or a shields-style badge (`--badge out.svg`).

## What it checks

| Id | What |
| --- | --- |
| `advisory-*` | Installed version vs known-vulnerable ranges in `data/advisories.json` |
| `gateway-public-bind` | Gateway bound to `0.0.0.0` / `lan` / a public interface |
| `gateway-auth-token` | Missing, disabled, or weak gateway auth |
| `gateway-origin-check` | Origin allow-list is `*` or Host-header fallback is on |
| `plaintext-secret` | API keys / tokens in config or skill files (**always redacted**) |
| `sandbox-disabled` | Agent sandbox off (OpenClaw default) |
| `unrestricted-shell` | `tools.exec.mode` is `full` |
| `exec-allowlist-missing` | No exec allow-list / safeBins |
| `skill-risky-pattern` | Skills that read `~/.ssh`, keychains, `.env`, cookie stores; `curl\|sh`; eval/base64; postinstall; non-allow-listed hosts |
| `skill-unpinned` / `skill-unsigned` | Floating versions, missing checksums/signatures |
| `messaging-open-senders` | Channels with `dmPolicy: open` or `allowFrom: ["*"]` |
| `file-permissions` | Config/credential files reachable by group or other |

Locate: `--path` (default `~/.openclaw`). Reads `openclaw.json` / `openclaw.json5`. Never touches a live install from tests.

## Score methodology

Start at **100**. Each distinct check `id` subtracts its **weight** once (repeat hits are listed but not double-counted). Floor 0.

| Grade | Score |
| --- | --- |
| A | 90–100 |
| B | 80–89 |
| C | 70–79 |
| D | 40–69 |
| F | 0–39 |

Scores below 50 are **D** (40–49) or **F** (0–39). Weights are opinionated hardening points, not CVSS. A patched, loopback, sandboxed, allow-listed setup should land in A.

## Safe auto-fix

`clawscore fix` is reversible hardening only:

1. Writes a timestamped copy under `.clawscore-backup/`
2. Prints a unified diff
3. Applies **only** with `--yes`

Examples: bind the gateway to loopback, `chmod 600` on config/credentials, replace an open sender policy with an allow-list stub (`REPLACE_WITH_YOUR_SENDER_ID`). **Skills are never deleted** — they are flagged for review.

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
| CVE-2026-25253 | `<2026.1.29` | 2026.1.29 | [GHSA-g8p2-7wf7-98mq](https://github.com/advisories/GHSA-g8p2-7wf7-98mq) · [NVD](https://nvd.nist.gov/vuln/detail/CVE-2026-25253) |
| CVE-2026-24763 | `<2026.1.29` | 2026.1.29 | [GHSA-mc68-q9jw-2h3v](https://github.com/advisories/GHSA-mc68-q9jw-2h3v) · [NVD](https://nvd.nist.gov/vuln/detail/CVE-2026-24763) |

## Not affiliated with OpenClaw

clawscore is an independent scanner for local OpenClaw (Clawdbot / Moltbot) installs. It is not an official OpenClaw product, is not endorsed by the OpenClaw maintainers, and does not talk to OpenClaw infrastructure unless you pass `--update-advisories`.

## Responsible disclosure

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
