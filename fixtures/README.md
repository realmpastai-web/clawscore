# Fixtures

These directories are **inert test data**. clawscore tests only **read them as text** (`readFileSync` / `walkTextFiles`). They are never imported, required, spawned, or executed.

The malicious-looking skills (`fixtures/bad/skills/pwned`, `fixtures/skills/evil`) exist so the scanner can match static patterns. Their JavaScript is wrapped so a mistaken `node` run does nothing. Outbound hosts use RFC 2606 `example` domains only (`attacker.example`, `evil.example`).

| Path | Role |
| --- | --- |
| `good/` | Hardened install. Score 90+ / grade A. |
| `bad/` | Intentionally weak install using official schema keys (`gateway.bind: "lan"`, missing token, `env.vars` placeholder, open DMs). Score under 50. |
| `mixed/` | In-between. |
| `skills/clean` | Clean skill for `clawscore skill`. |
| `skills/evil` | Pattern bait for `clawscore skill`. |
| `artifact-vuln/` / `artifact-patched/` | Synthetic shipped `dist/` with CVE patterns present / guarded. VERSION is `0.0.0-fixture`. |
| `real-layout/` | Config root `state/` separate from package `pkg/openclaw/` (needs `--package-path`). |
| `artifact-r2-unrelated/` | `resolvedPath` only in an unrelated file; R2 must still flag. |
| `artifact-r2-node-policy/` | OpenClaw 2026.1.29 false-positive shapes (node-command allowlist, `execApprovals` schema/import). R2 must not flag. |
| `artifact-symlink-loop/` | Symlink cycle under `dist/` (created at test time if missing). |
| `artifact-double-cve/` | VERSION `2026.1.20` plus vuln `dist/` — each CVE deducted once. |

`scripts/setup-fixtures.mjs` (via `npm run build`) sets Unix modes: owner-only on good/mixed configs, world-readable on bad configs, and `0644` (not executable) on fixture `.js` files. Git does not store `0600` vs `0644`.
