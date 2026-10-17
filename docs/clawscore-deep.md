# clawscore-deep — REA artifact evidence (clean-room, open-source only)

_Analyst: SanFire. All inputs are MIT-licensed OpenClaw npm releases (openclaw, repo github.com/openclaw/openclaw). No DRM, no protection bypass, no cracking. Clean-room: this doc is the spec; code is written only from the observations below._

## 1. Version reality check (correcting the 1.28/1.29 assumption)
- There is **no `openclaw@2026.1.28`** on npm (404). The first non-0.x line is `2026.1.29-beta.1 … beta.7`, then `2026.1.29`, `2026.1.30`, then `2026.2.x` … up to the current `2026.10.x` (`2026.10.1 … 2026.10.4`, latest beta `2026.10.10-beta.1`).
- The in-repo advisory data (clawscore `data/advisories.json`) states both CVEs are **fixed in `2026.1.29`** (`affected: <2026.1.29`).
- **Key finding:** every OpenClaw version still fetchable from npm is already patched for both CVEs. The last pre-release build (`2026.1.29-beta.7`) and the release (`2026.1.29`) are byte-identical in the two security-relevant areas, and the fix markers are already present in both. So **no vulnerable OpenClaw artifact ships publicly** to diff against. The CVE fixes landed before the earliest surviving release.
- **Semver note:** standard semver treats `2026.1.29-beta.*` as less than `2026.1.29`, so those versions fall in the advisory range `<2026.1.29` even though the shipped JS already contains both CVE fixes. The artifact scan is the ground truth for whether a build is patched. `data/advisories.json` is unchanged (`affected: <2026.1.29`).
- Current/relevant line per Santhosh is `2026.10.x`. Confirmed `2026.10.2`, `2026.10.3`, `2026.10.4` are all patched (fix markers present, see §2–§3). The 10.x tree is heavily code-split/refactored (rolldown), so detectors must scan `dist/**/*.js` broadly rather than fixed file paths.

Artifacts examined (unpacked under this folder): v_vuln=2026.1.29-beta.7, v_fix=2026.1.29, ext_2026.10.2/3/4.

## 2. CVE-2026-25253 — Control UI gatewayUrl token exfiltration (GHSA-g8p2-7wf7-98mq)
- Vuln class: the Control UI reads a `gatewayUrl` from URL query params and would point the authenticated WebSocket (carrying the stored gateway token) at an attacker-chosen origin → 1-click token exfiltration / RCE.
- **Fix behavior observed in all shipping releases:** the URL-param `gatewayUrl` is consumed into a *pending* state and the param is stripped, requiring explicit user confirmation before connecting. Stable fix markers in the control-ui bundle:
  - `t.delete("gatewayUrl")` after reading it from the params object (1.29: `index-DFDgq9AK.js`).
  - guard token `pendingGatewayUrl` (1.29) / `pendingPlacement` + `onPendingPlacementReset` (10.3 `control-ui-boot-new-BozdUfqu.js`, `command-palette`, `control-ui-core`).
- Version-agnostic rule: an install whose control-ui bundle **reads `gatewayUrl` from URL params but carries no pending/confirmation guard token** is vulnerable.

## 3. CVE-2026-24763 — sandbox exec PATH command injection (GHSA-mc68-q9jw-2h3v)
- Vuln class: exec approvals allowlisted by raw command string, so a PATH-hijacked / relative binary matching an allowlisted name could run → authenticated command injection in Docker sandbox exec.
- **Fix behavior observed:** exec approvals resolve the executable to an absolute/real path before matching the allowlist. Stable fix markers (1.29 `dist/infra/exec-approvals.js`): `resolveExecutable` (3x), `resolvedPath` (18x), `realpathSync` (1x), alongside `allowlist` (75x) and `basename`. In 10.3 the same markers are spread across `dist/native-hook-relay/executable-path-*.mjs`, `exec-*.mjs`, `control-ui-core`, etc.
- Changelog corroboration (2026.1.29): "Exec approvals: allowlist matches resolved binary paths only…", "limit project-local `node_modules/.bin` PATH preference to debug builds (reduce PATH hijacking risk)", "Daemon: use platform PATH delimiters…".
- Version-agnostic rule: an install whose exec-approval code **allowlists commands but never resolves the binary to a real path** (`resolveExecutable`/`resolvedPath`/`realpathSync`) is vulnerable.

## 4. Detector design handed to clawscore (PR #2, v0.1.1)
Add an artifact scan over the installed package's `dist/` (version-agnostic, no network, read-only). Locate the package via `--package-path`, then the `openclaw`/`clawdbot`/`moltbot` binary on PATH, then `npm root -g/<name>`, then `dist/` candidates under `--path`. Always emit one info finding (`artifact scan: ran on <path>` or `artifact scan: skipped, OpenClaw package not found (use --package-path)`).
- **R1 (CVE-2026-25253):** flag only when a control-ui file reads `gatewayUrl` from params **and that file has no guard token**, and no other control-ui file holds the guard.
- **R2 (CVE-2026-24763):** flag only when a file has the exec allowlist indicator and neither it nor any file sharing its chunk-name prefix (incl. `exec-*` / `executable-*` family) contains `resolveExecutable`/`resolvedPath`/`realpathSync`. A `resolvedPath` in an unrelated file does not suppress the finding.
- Walker: `lstatSync`, skip symlinks, track visited realpaths. Hitting the file budget emits info `artifact scan incomplete` and **no** artifact high findings.
- Evidence for high artifact findings starts with `Heuristic pattern match:`. If a version advisory for the same CVE is already present, drop the artifact finding and append its evidence to the advisory (no double penalty).
- Conservative: if in doubt, no finding. All real shipping releases (1.29, 10.2–10.4) carry the guards → no false positive; a build with the guard stripped → flagged.
