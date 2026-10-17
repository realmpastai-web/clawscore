import { lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import type { Finding, Install } from "../types.js";

// clawscore-deep (v0.1.1): version-agnostic artifact detectors derived from a
// clean-room REA comparison of OpenClaw releases (see docs/clawscore-deep.md).
// These scan the SHIPPED JavaScript bundles for the presence/absence of the
// hardening the two known CVE fixes introduced, instead of trusting the
// version string alone. Conservative: if in doubt, no high finding.

const MAX_BYTES = 8 * 1024 * 1024; // skip very large single files defensively
const MAX_FILES = 20_000; // 2026.10.4 ships ~10k dist JS files after rolldown split

const ADVISORY_ARTIFACT_PAIRS: Array<[advisoryId: string, artifactId: string]> = [
  ["advisory-CVE-2026-25253", "artifact-gatewayurl-exfil"],
  ["advisory-CVE-2026-24763", "artifact-exec-path-injection"],
];

interface DistFile {
  path: string;
  text: string;
}

interface WalkState {
  files: DistFile[];
  remaining: number;
  incomplete: boolean;
  visited: Set<string>;
}

function distDir(packageDir: string): string | null {
  const dist = join(packageDir, "dist");
  try {
    const real = realpathSync(dist);
    if (statSync(real).isDirectory()) return real;
  } catch {
    return null;
  }
  return null;
}

function walkJs(dir: string, state: WalkState): void {
  if (state.incomplete) return;
  let real: string;
  try {
    real = realpathSync(dir);
  } catch {
    return;
  }
  if (state.visited.has(real)) return;
  state.visited.add(real);

  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (state.incomplete) return;
    const p = join(dir, name);
    let st;
    try {
      st = lstatSync(p);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) {
      walkJs(p, state);
      continue;
    }
    if (!st.isFile()) continue;
    if (!/\.(mjs|cjs|js)$/i.test(name) || name.endsWith(".map")) continue;
    if (st.size > MAX_BYTES) continue;
    if (state.remaining <= 0) {
      state.incomplete = true;
      return;
    }
    let text = "";
    try {
      text = readFileSync(p, "utf8");
    } catch {
      continue;
    }
    state.files.push({ path: p, text });
    state.remaining -= 1;
  }
}

function scanDist(root: string): { files: DistFile[]; incomplete: boolean } {
  const state: WalkState = {
    files: [],
    remaining: MAX_FILES,
    incomplete: false,
    visited: new Set(),
  };
  walkJs(root, state);
  return { files: state.files, incomplete: state.incomplete };
}

function isControlUi(filePath: string): boolean {
  return filePath.includes("control-ui");
}

function readsGatewayUrlFromParams(text: string): boolean {
  if (/\.get\(\s*["']gatewayUrl["']\s*\)/.test(text)) return true;
  if (/gatewayUrl/.test(text) && /URLSearchParams|searchParams/.test(text)) return true;
  return false;
}

function hasGatewayGuard(text: string): boolean {
  return /pendingGatewayUrl|pendingPlacement|onPendingPlacementReset|confirmGatewayUrl/.test(text);
}

function hasExecAllowlist(text: string): boolean {
  // Synthetic CVE fixtures: execApproval() matching allowlist.has(cmd.name).
  // Do not use a bare `execApproval` / `\bexec\b` substring — OpenClaw 2026.1.29
  // (and later) mentions execApprovals config, node-command allowlists, and
  // groupPolicy "allowlist" in many unrelated files.
  if (/\bexecApproval\s*\(/.test(text) && /allowlist\.has|allowList\.has/.test(text)) return true;
  // Shipped implementation: the function that evaluates the exec allowlist.
  if (/function evaluateExecAllowlist\b|function evaluateShellAllowlist\b/.test(text)) return true;
  return false;
}

function hasResolvedPath(text: string): boolean {
  return /resolveExecutable|resolvedPath|realpathSync|resolveBinary/.test(text);
}

/** Strip a Vite/rolldown content hash (`-AbCdEfGh`) from a JS basename. */
function chunkPrefix(filePath: string): string {
  const stem = basename(filePath).replace(/\.(mjs|cjs|js)$/i, "");
  return stem.replace(/-[A-Za-z0-9]{8}$/, "");
}

function execFamily(prefix: string): boolean {
  return prefix === "exec" || prefix.startsWith("exec-") || prefix.startsWith("executable");
}

function sameChunkFamily(a: string, b: string): boolean {
  const pa = chunkPrefix(a);
  const pb = chunkPrefix(b);
  if (pa === pb) return true;
  if (pa.startsWith(`${pb}-`) || pb.startsWith(`${pa}-`)) return true;
  // OpenClaw 10.x splits exec-approvals / executable-path / exec-* across chunks.
  if (execFamily(pa) && execFamily(pb)) return true;
  return false;
}

function r1Vulnerable(files: DistFile[]): boolean {
  const controlUi = files.filter((f) => isControlUi(f.path));
  if (controlUi.length === 0) return false;
  const anyGuard = controlUi.some((f) => hasGatewayGuard(f.text));
  if (anyGuard) return false;
  const unguardedRead = controlUi.some(
    (f) => readsGatewayUrlFromParams(f.text) && !hasGatewayGuard(f.text),
  );
  return unguardedRead;
}

function r2Vulnerable(files: DistFile[]): boolean {
  for (const f of files) {
    if (!hasExecAllowlist(f.text)) continue;
    const familyHasResolve = files.some(
      (other) => sameChunkFamily(f.path, other.path) && hasResolvedPath(other.text),
    );
    if (!familyHasResolve) return true;
  }
  return false;
}

function infoFinding(evidence: string, title: string, id = "artifact-scan"): Finding {
  return {
    id,
    title,
    severity: "info",
    weight: 0,
    evidence,
    fix: "No action required. Informational only.",
  };
}

export function checkArtifacts(install: Install): Finding[] {
  const findings: Finding[] = [];
  if (!install.packageDir) {
    findings.push(
      infoFinding(
        "artifact scan: skipped, OpenClaw package not found (use --package-path)",
        "Artifact scan skipped",
      ),
    );
    return findings;
  }

  const dist = distDir(install.packageDir);
  if (!dist) {
    findings.push(
      infoFinding(
        "artifact scan: skipped, OpenClaw package not found (use --package-path)",
        "Artifact scan skipped",
      ),
    );
    return findings;
  }

  findings.push(infoFinding(`artifact scan: ran on ${dist}`, "Artifact scan"));

  const scanned = scanDist(dist);
  if (scanned.incomplete) {
    findings.push(
      infoFinding("artifact scan incomplete", "Artifact scan incomplete", "artifact-scan-incomplete"),
    );
    return findings;
  }

  if (r1Vulnerable(scanned.files)) {
    findings.push({
      id: "artifact-gatewayurl-exfil",
      title: "Shipped Control UI accepts gatewayUrl from URL params with no confirmation guard",
      severity: "high",
      weight: 7,
      evidence:
        `Heuristic pattern match: Control UI bundle reads gatewayUrl from a URL parameter but carries no pending/confirmation guard ` +
        `(no pendingGatewayUrl/pendingPlacement). This is the CVE-2026-25253 pattern: a crafted link can repoint ` +
        `the authenticated gateway WebSocket (with its token) at an attacker origin. Scanned: ${dist}`,
      fix: "Upgrade to an OpenClaw build whose Control UI confirms a URL-supplied gatewayUrl before connecting (2026.1.29 or later). See https://github.com/advisories/GHSA-g8p2-7wf7-98mq",
    });
  }

  if (r2Vulnerable(scanned.files)) {
    findings.push({
      id: "artifact-exec-path-injection",
      title: "Shipped exec approvals allowlist commands without resolving the binary path",
      severity: "high",
      weight: 7,
      evidence:
        `Heuristic pattern match: Exec-approval bundle maintains a command allowlist but shows no resolved-binary-path matching ` +
        `(no resolveExecutable/resolvedPath/realpathSync). This is the CVE-2026-24763 pattern: a PATH-hijacked ` +
        `or relative binary matching an allowlisted name can run inside the sandbox. Scanned: ${dist}`,
      fix: "Upgrade to an OpenClaw build whose exec approvals match the resolved binary path (2026.1.29 or later). See https://github.com/advisories/GHSA-mc68-q9jw-2h3v",
    });
  }

  return findings;
}

/**
 * If a version advisory already covers a CVE, drop the matching artifact finding
 * and append its evidence so the CVE is deducted once.
 */
export function reconcileArtifactFindings(findings: Finding[]): Finding[] {
  const byId = new Map<string, Finding>();
  for (const f of findings) {
    if (!byId.has(f.id)) byId.set(f.id, f);
  }
  const drop = new Set<string>();
  const extra = new Map<string, string>();
  for (const [advId, artId] of ADVISORY_ARTIFACT_PAIRS) {
    const adv = byId.get(advId);
    const art = byId.get(artId);
    if (adv && art) {
      extra.set(advId, art.evidence);
      drop.add(artId);
    }
  }
  if (drop.size === 0) return findings;
  return findings
    .filter((f) => !drop.has(f.id))
    .map((f) => {
      const appended = extra.get(f.id);
      if (!appended) return f;
      return { ...f, evidence: `${f.evidence} ${appended}` };
    });
}
