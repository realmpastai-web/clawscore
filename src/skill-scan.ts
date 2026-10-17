import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import type { Finding } from "./types.js";
import { walkTextFiles } from "./walk.js";

const ALLOWED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
]);

interface PatternRule {
  id: string;
  title: string;
  severity: Finding["severity"];
  weight: number;
  re: RegExp;
  why: string;
  fix: string;
}

const PATTERN_RULES: PatternRule[] = [
  {
    id: "skill-risky-pattern",
    title: "Skill reads SSH key material",
    severity: "critical",
    weight: 10,
    re: /(?:~|\$HOME|\$\{HOME\}|\/home\/[^/\s'"`]+)\/\.ssh\b|\.ssh\/(?:id_[a-z0-9]+|authorized_keys|known_hosts)/i,
    why: "reads ~/.ssh or private key files",
    fix: "Remove SSH key access from the skill. If needed, document an operator-owned path and never ship key reads by default.",
  },
  {
    id: "skill-risky-pattern",
    title: "Skill touches OS keychain / secret store",
    severity: "critical",
    weight: 10,
    re: /login\.keychain|keychain-access|security\s+find-generic-password|libsecret|secret-tool|gnome-keyring/i,
    why: "accesses a keychain or secret service",
    fix: "Do not read keychains from a skill. Use OpenClaw SecretRef / env injection owned by the operator.",
  },
  {
    id: "skill-risky-pattern",
    title: "Skill reads .env files",
    severity: "high",
    weight: 10,
    re: /(?:readFile(?:Sync)?|open|cat|load_dotenv)\s*\([^)]*\.env\b|\.env(?:\.local|\.production)?['"`]|\/\.env\b/i,
    why: "reads .env files",
    fix: "Stop reading .env files from the skill. Declare required env var names instead of opening credential files.",
  },
  {
    id: "skill-risky-pattern",
    title: "Skill reads browser cookie stores",
    severity: "critical",
    weight: 10,
    re: /Cookies\/Cookies|cookies\.sqlite|Network\/Cookies|Chrome.*Cookies|Firefox.*cookies|Cookie Monster|browser cookie/i,
    why: "reads browser cookie storage",
    fix: "Remove cookie-store access. Browser sessions belong to the operator, not a third-party skill.",
  },
  {
    id: "skill-risky-pattern",
    title: "Skill uses eval / base64 obfuscation",
    severity: "high",
    weight: 10,
    re: /\beval\s*\(|new Function\s*\(|Function\s*\(\s*['"]return|\batob\s*\(|Buffer\.from\s*\([^)]*['"]base64['"]|String\.fromCharCode\s*\(/i,
    why: "uses eval, Function, or base64 decode typical of obfuscation",
    fix: "Replace obfuscated code with readable source. Skills should be reviewable without decoding.",
  },
  {
    id: "skill-risky-pattern",
    title: "Skill pipes a download into a shell",
    severity: "critical",
    weight: 10,
    re: /\b(?:curl|wget)\b[^\n|;]*\|\s*(?:sh|bash|zsh)|(?:bash|sh)\s+<\s*\((?:curl|wget)/i,
    why: "pipes curl/wget into a shell",
    fix: "Never pipe remote scripts into a shell. Pin and verify artifacts instead.",
  },
];

const URL_RE =
  /(?:fetch|axios|http\.get|https\.get|curl|wget)\s*(?:\(|\s+)\s*(['"`])(https?:\/\/[^'"`\s]+)\1/gi;
const BARE_URL_FETCH =
  /(?:fetch|axios)\(\s*(['"`])(https?:\/\/[^'"`\s]+)\1/gi;

export interface SkillScanResult {
  path: string;
  findings: Finding[];
}

export function scanSkill(skillPath: string): SkillScanResult {
  const resolved = skillPath;
  const findings: Finding[] = [];
  let root = resolved;
  try {
    if (statSync(resolved).isFile()) root = dirnameSafe(resolved);
  } catch {
    return {
      path: resolved,
      findings: [
        {
          id: "skill-missing",
          title: "Skill path not found",
          severity: "high",
          weight: 8,
          evidence: `${resolved} does not exist`,
          fix: "Pass a skill directory (containing SKILL.md) or a skill source file.",
        },
      ],
    };
  }

  const files = existsSync(root) ? walkTextFiles(root) : [];
  if (statSync(resolved).isFile()) {
    files.length = 0;
    files.push({ path: resolved, text: readFileSync(resolved, "utf8") });
  }

  for (const file of files) {
    findings.push(...scanFilePatterns(file.path, file.text, root));
    findings.push(...scanRemoteHosts(file.path, file.text, root));
  }

  const pkgPath = join(root, "package.json");
  if (existsSync(pkgPath) && statSync(pkgPath).isFile()) {
    findings.push(...scanPackageJson(pkgPath, root));
  }

  findings.push(...checkPinAndSignature(root, files.map((f) => f.path)));
  return { path: root, findings: dedupe(findings) };
}

function dirnameSafe(file: string): string {
  const idx = Math.max(file.lastIndexOf("/"), file.lastIndexOf("\\"));
  return idx === -1 ? "." : file.slice(0, idx);
}

function rel(root: string, file: string): string {
  return relative(root, file) || basename(file);
}

function scanFilePatterns(file: string, text: string, root: string): Finding[] {
  const out: Finding[] = [];
  for (const rule of PATTERN_RULES) {
    if (rule.re.test(text)) {
      out.push({
        id: rule.id,
        title: rule.title,
        severity: rule.severity,
        weight: rule.weight,
        evidence: `${rel(root, file)}: ${rule.why}`,
        fix: rule.fix,
        file: rel(root, file),
      });
    }
  }
  return out;
}

function scanRemoteHosts(file: string, text: string, root: string): Finding[] {
  const hosts = new Set<string>();
  for (const re of [URL_RE, BARE_URL_FETCH]) {
    const copy = new RegExp(re.source, re.flags);
    let m: RegExpExecArray | null;
    while ((m = copy.exec(text))) {
      const url = m[2] ?? m[1];
      if (!url) continue;
      try {
        const u = new URL(url);
        if (!ALLOWED_HOSTS.has(u.hostname)) hosts.add(u.hostname);
      } catch {
        hosts.add(url);
      }
    }
  }
  if (hosts.size === 0) return [];
  return [
    {
      id: "skill-risky-pattern",
      title: "Skill contacts a non-allow-listed host",
      severity: "high",
      weight: 10,
      evidence: `${rel(root, file)}: network call to ${[...hosts].sort().join(", ")} (allow-listed: localhost only)`,
      fix: "Remove unexpected outbound HTTP. If the skill must call an API, document the host and pin it; do not fetch arbitrary URLs.",
      file: rel(root, file),
    },
  ];
}

function scanPackageJson(pkgPath: string, root: string): Finding[] {
  const findings: Finding[] = [];
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as Record<string, unknown>;
  } catch {
    return findings;
  }
  const scripts = pkg.scripts;
  if (scripts && typeof scripts === "object") {
    for (const hook of ["preinstall", "install", "postinstall", "preuninstall"]) {
      if (hook in (scripts as object)) {
        findings.push({
          id: "skill-risky-pattern",
          title: `Skill package.json ${hook} script`,
          severity: "high",
          weight: 10,
          evidence: `${rel(root, pkgPath)}: scripts.${hook} is set. Install-time scripts run with the operator's privileges.`,
          fix: `Remove scripts.${hook}. Skills must not run install-time code.`,
          file: rel(root, pkgPath),
        });
      }
    }
  }
  const deps = {
    ...(asMap(pkg.dependencies) ?? {}),
    ...(asMap(pkg.devDependencies) ?? {}),
    ...(asMap(pkg.optionalDependencies) ?? {}),
  };
  const unpinned = Object.entries(deps).filter(([, v]) => isUnpinned(v));
  if (unpinned.length > 0) {
    findings.push({
      id: "skill-unpinned",
      title: "Skill dependencies are unpinned",
      severity: "medium",
      weight: 2,
      evidence: `${rel(root, pkgPath)}: unpinned deps ${unpinned.map(([k]) => k).join(", ")}`,
      fix: "Pin exact versions (no *, latest, or bare ranges) and prefer a lockfile.",
      file: rel(root, pkgPath),
    });
  }
  return findings;
}

function asMap(v: unknown): Record<string, string> | null {
  if (!v || typeof v !== "object") return null;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as object)) {
    if (typeof val === "string") out[k] = val;
  }
  return out;
}

function isUnpinned(spec: string): boolean {
  const s = spec.trim();
  return s === "*" || s === "" || s === "latest" || s === "x" || s === "X" || s.startsWith("^") || s.startsWith("~") || s.startsWith(">") || s.startsWith("<");
}

function checkPinAndSignature(root: string, files: string[]): Finding[] {
  const findings: Finding[] = [];
  const names = new Set(files.map((f) => basename(f)));
  try {
    // also look at directory listing via walked files
  } catch {
    // ignore
  }
  const hasSig =
    names.has("SIGNATURE") ||
    names.has("SIGNATURE.asc") ||
    names.has("SHA256SUMS") ||
    names.has("checksums.txt") ||
    names.has("skill.sig") ||
    existsSync(join(root, "SIGNATURE")) ||
    existsSync(join(root, "SHA256SUMS"));
  let integrity = false;
  const pkgPath = join(root, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as Record<string, unknown>;
      if (typeof pkg.integrity === "string" && pkg.integrity.length > 0) integrity = true;
      const openclaw = pkg.openclaw;
      if (openclaw && typeof openclaw === "object") {
        const oc = openclaw as Record<string, unknown>;
        if (typeof oc.integrity === "string" || typeof oc.signature === "string") integrity = true;
        if (typeof oc.version === "string" && oc.version.length > 0) {
          // pinned metadata
        }
      }
    } catch {
      // ignore
    }
  }
  const skillMeta = join(root, "skill.json");
  let pinned = false;
  if (existsSync(skillMeta)) {
    try {
      const meta = JSON.parse(readFileSync(skillMeta, "utf8")) as Record<string, unknown>;
      if (typeof meta.version === "string" && !isUnpinned(meta.version) && meta.version !== "latest") {
        pinned = true;
      }
      if (typeof meta.integrity === "string") integrity = true;
    } catch {
      // ignore
    }
  }
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
      if (typeof pkg.version === "string" && pkg.version.length > 0 && !isUnpinned(pkg.version)) {
        pinned = true;
      }
    } catch {
      // ignore
    }
  }

  if (!pinned) {
    findings.push({
      id: "skill-unpinned",
      title: "Skill is unpinned (no exact version)",
      severity: "medium",
      weight: 2,
      evidence: `${basename(root)}: no exact version in package.json or skill.json`,
      fix: "Publish and install a pinned version (package.json version or ClawHub slug@version). Avoid floating tags.",
    });
  }
  if (!hasSig && !integrity) {
    findings.push({
      id: "skill-unsigned",
      title: "Skill is unsigned",
      severity: "low",
      weight: 2,
      evidence: `${basename(root)}: no SIGNATURE, SHA256SUMS, or integrity metadata`,
      fix: "Ship a checksum or signature next to the skill (SHA256SUMS or package integrity) and verify it before install.",
    });
  }
  return findings;
}

function dedupe(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const f of findings) {
    const k = `${f.id}|${f.title}|${f.file ?? ""}|${f.evidence}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(f);
  }
  return out;
}

export function skillExitCode(findings: Finding[]): number {
  return findings.some((f) => f.severity !== "info") ? 1 : 0;
}
