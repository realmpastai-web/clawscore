import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Finding, Install } from "../types.js";

// clawscore-deep (v0.1.1): version-agnostic artifact detectors derived from a
// clean-room REA comparison of OpenClaw releases (see docs/clawscore-deep.md).
// These scan the SHIPPED JavaScript bundles for the presence/absence of the
// hardening the two known CVE fixes introduced, instead of trusting the
// version string alone. All real shipping releases carry the fix markers, so a
// correctly-patched install produces no finding; a build with the guard
// stripped (or a genuinely pre-fix build) is flagged.

const MAX_BYTES = 8 * 1024 * 1024; // skip very large single files defensively
const MAX_FILES = 6000;

interface DistScan {
  // CVE-2026-25253: Control UI reads gatewayUrl from a URL param.
  gatewayUrlFromParam: boolean;
  // ...and gates it behind a pending/confirmation guard before connecting.
  gatewayUrlGuard: boolean;
  // CVE-2026-24763: exec approvals maintain a command allowlist.
  execAllowlist: boolean;
  // ...and resolve the binary to a real path before matching it.
  execResolvedPath: boolean;
}

function distRoots(root: string): string[] {
  const candidates = [
    join(root, "dist"),
    join(root, "package", "dist"),
    join(root, "node_modules", "openclaw", "dist"),
    join(root, "node_modules", "clawdbot", "dist"),
    join(root, "node_modules", "moltbot", "dist"),
  ];
  return candidates.filter((p) => {
    try {
      return statSync(p).isDirectory();
    } catch {
      return false;
    }
  });
}

function walkJs(dir: string, out: string[], budget: { files: number }): void {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (budget.files <= 0) return;
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walkJs(p, out, budget);
    } else if (/\.(mjs|cjs|js)$/.test(name) && !name.endsWith(".map")) {
      if (st.size <= MAX_BYTES) {
        out.push(p);
        budget.files -= 1;
      }
    }
  }
}

function scanDist(roots: string[]): DistScan {
  const result: DistScan = {
    gatewayUrlFromParam: false,
    gatewayUrlGuard: false,
    execAllowlist: false,
    execResolvedPath: false,
  };
  const files: string[] = [];
  const budget = { files: MAX_FILES };
  for (const r of roots) walkJs(r, files, budget);
  for (const f of files) {
    let text = "";
    try {
      text = readFileSync(f, "utf8");
    } catch {
      continue;
    }
    const isControlUi = f.includes("control-ui");
    if (isControlUi) {
      if (/delete\(["']gatewayUrl["']\)/.test(text) || (/gatewayUrl/.test(text) && /URLSearchParams|searchParams|\.get\(["']gatewayUrl["']\)/.test(text))) {
        result.gatewayUrlFromParam = true;
      }
      if (/pendingGatewayUrl|pendingPlacement|onPendingPlacementReset|confirmGatewayUrl/.test(text)) {
        result.gatewayUrlGuard = true;
      }
    }
    if (/allowlist|allowList/i.test(text) && /\bexec\b|execApproval|exec-approval|execDefault/i.test(text)) {
      result.execAllowlist = true;
    }
    if (/resolveExecutable|resolvedPath|realpathSync|resolveBinary/.test(text)) {
      result.execResolvedPath = true;
    }
  }
  return result;
}

export function checkArtifacts(install: Install): Finding[] {
  const roots = distRoots(install.root);
  if (roots.length === 0) return [];
  const s = scanDist(roots);
  const findings: Finding[] = [];
  const where = roots.join(", ");

  // R1 — CVE-2026-25253 (GHSA-g8p2-7wf7-98mq): Control UI gatewayUrl token exfiltration.
  if (s.gatewayUrlFromParam && !s.gatewayUrlGuard) {
    findings.push({
      id: "artifact-gatewayurl-exfil",
      title: "Shipped Control UI accepts gatewayUrl from URL params with no confirmation guard",
      severity: "high",
      weight: 7,
      evidence:
        `Control UI bundle reads gatewayUrl from a URL parameter but carries no pending/confirmation guard ` +
        `(no pendingGatewayUrl/pendingPlacement). This is the CVE-2026-25253 pattern: a crafted link can repoint ` +
        `the authenticated gateway WebSocket (with its token) at an attacker origin. Scanned: ${where}`,
      fix: "Upgrade to an OpenClaw build whose Control UI confirms a URL-supplied gatewayUrl before connecting (2026.1.29 or later). See https://github.com/advisories/GHSA-g8p2-7wf7-98mq",
    });
  }

  // R2 — CVE-2026-24763 (GHSA-mc68-q9jw-2h3v): sandbox exec PATH command injection.
  if (s.execAllowlist && !s.execResolvedPath) {
    findings.push({
      id: "artifact-exec-path-injection",
      title: "Shipped exec approvals allowlist commands without resolving the binary path",
      severity: "high",
      weight: 7,
      evidence:
        `Exec-approval bundle maintains a command allowlist but shows no resolved-binary-path matching ` +
        `(no resolveExecutable/resolvedPath/realpathSync). This is the CVE-2026-24763 pattern: a PATH-hijacked ` +
        `or relative binary matching an allowlisted name can run inside the sandbox. Scanned: ${where}`,
      fix: "Upgrade to an OpenClaw build whose exec approvals match the resolved binary path (2026.1.29 or later). See https://github.com/advisories/GHSA-mc68-q9jw-2h3v",
    });
  }

  return findings;
}
