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

`scripts/setup-fixtures.mjs` (via `npm run build`) sets Unix modes: owner-only on good/mixed configs, world-readable on bad configs, and `0644` (not executable) on fixture `.js` files. Git does not store `0600` vs `0644`.
