# Changelog

## v0.1.1 (unreleased)
- Artifact detectors (clawscore-deep): scan the installed OpenClaw package's shipped `dist/` bundles for the two known CVE patterns, version-agnostically.
  - `artifact-gatewayurl-exfil` (CVE-2026-25253 / GHSA-g8p2-7wf7-98mq): Control UI reads `gatewayUrl` from a URL param with no pending/confirmation guard.
  - `artifact-exec-path-injection` (CVE-2026-24763 / GHSA-mc68-q9jw-2h3v): exec approvals allowlist commands without resolving the binary to a real path.
  - Derived from a clean-room REA comparison of open-source OpenClaw releases; see docs/clawscore-deep.md. All current shipping releases (2026.1.29, 2026.10.2-4) pass with no finding.
- `fix` now loudly warns that the inserted sender placeholder (`REPLACE_WITH_YOUR_SENDER_ID`) blocks ALL incoming messages until it is replaced with real sender IDs.

## 0.1.0

Initial public release of clawscore: an offline TypeScript CLI that scores a local OpenClaw install 0–100 and prints evidence plus reversible fixes.

- Scan `~/.openclaw` (or `--path`) for gateway bind/auth/origins, plaintext secrets, sandbox/exec policy, installed-skill patterns, open messaging senders, file modes, and verified CVEs.
- Reports: terminal, `--json`, `--markdown`, `--badge`.
- `clawscore fix` writes a verified backup, edits JSON5 in place (comments kept), and applies only with `--yes`. `clawscore fix --restore <backupDir>` puts the config back byte-for-byte.
- `clawscore skill <path>` and a reusable GitHub Action.
- Offline by default. `--update-advisories` is the only network path.
