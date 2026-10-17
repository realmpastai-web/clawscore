# Changelog

## 0.1.0

Initial public release of clawscore: an offline TypeScript CLI that scores a local OpenClaw install 0–100 and prints evidence plus reversible fixes.

- Scan `~/.openclaw` (or `--path`) for gateway bind/auth/origins, plaintext secrets, sandbox/exec policy, installed-skill patterns, open messaging senders, file modes, and verified CVEs.
- Reports: terminal, `--json`, `--markdown`, `--badge`.
- `clawscore fix` writes a verified backup, edits JSON5 in place (comments kept), and applies only with `--yes`. `clawscore fix --restore <backupDir>` puts the config back byte-for-byte.
- `clawscore skill <path>` and a reusable GitHub Action.
- Offline by default. `--update-advisories` is the only network path.
