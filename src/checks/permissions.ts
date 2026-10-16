import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { Finding, Install } from "../types.js";

const SENSITIVE_NAME = /(credential|secret|token|auth|key|password|\.pem$|\.key$)/i;

export function checkPermissions(install: Install): Finding[] {
  if (process.platform === "win32") return [];
  const findings: Finding[] = [];
  const files = collectSensitiveFiles(install);
  for (const file of files) {
    let mode: number;
    try {
      mode = statSync(file).mode & 0o777;
    } catch {
      continue;
    }
    const groupOther = mode & 0o077;
    if (groupOther === 0) continue;
    const rel = relative(install.root, file) || file;
    const oct = mode.toString(8).padStart(3, "0");
    findings.push({
      id: "file-permissions",
      title: "Loose permissions on config or credential files",
      severity: "high",
      weight: 5,
      evidence: `${rel} mode is ${oct} (group/other access). Config and credential files should be owner-only (0600).`,
      fix: `chmod 600 ${rel}`,
      file: rel,
    });
  }
  return findings;
}

function collectSensitiveFiles(install: Install): string[] {
  const files: string[] = [];
  if (install.configPath) files.push(install.configPath);
  const credDir = join(install.root, "credentials");
  if (existsSync(credDir)) {
    try {
      for (const name of readdirSync(credDir)) {
        const p = join(credDir, name);
        try {
          if (statSync(p).isFile()) files.push(p);
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  }
  try {
    for (const name of readdirSync(install.root)) {
      if (!SENSITIVE_NAME.test(name)) continue;
      const p = join(install.root, name);
      try {
        if (statSync(p).isFile()) files.push(p);
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
  return [...new Set(files)];
}
