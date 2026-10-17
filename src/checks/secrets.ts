import { relative } from "node:path";
import { asObject } from "../locate.js";
import { looksLikeSecretKey, REDACTED } from "../redact.js";
import type { Finding, Install, JsonObject, JsonValue } from "../types.js";
import { walkTextFiles } from "../walk.js";

const ENV_INTERP = /^\$\{[A-Z0-9_]+\}$/;

export function checkPlaintextSecrets(install: Install): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<string>();

  if (install.config && install.configPath) {
    for (const hit of walkSecrets(install.config, [])) {
      const key = `${install.configPath}:${hit.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push(secretFinding(hit.path, install.configPath, install.root));
    }
  }

  for (const dir of install.skillDirs) {
    for (const file of walkTextFiles(dir)) {
      for (const hit of findSecretsInText(file.text)) {
        const key = `${file.path}:${hit}`;
        if (seen.has(key)) continue;
        seen.add(key);
        findings.push(secretFinding(hit, file.path, install.root));
      }
    }
  }

  return findings;
}

function secretFinding(where: string, file: string, root: string): Finding {
  const rel = relative(root, file) || file;
  return {
    id: "plaintext-secret",
    title: "Plain-text API key or token in config or skill files",
    severity: "high",
    weight: 8,
    evidence: `${rel}: ${where} holds a secret-looking value ${REDACTED}`,
    fix: "Move the secret to an environment variable or OpenClaw SecretRef ({ source: \"env\", id: \"VAR_NAME\" }). Rotate the exposed value.",
    file: rel,
  };
}

interface Hit {
  path: string;
}

function isSecretRef(value: JsonObject): boolean {
  const source = value.source;
  return source === "env" || source === "store" || source === "file" || source === "exec";
}

function isGatewayAuthSecret(dotted: string): boolean {
  return /(^|\.)gateway\.auth\.(token|password)$/.test(dotted);
}

function walkSecrets(value: JsonValue, path: string[]): Hit[] {
  if (value === null || typeof value !== "object") return [];
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => walkSecrets(v, [...path, String(i)]));
  }
  const obj = value as JsonObject;
  if (isSecretRef(obj)) return [];
  const hits: Hit[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const next = [...path, k];
    if (looksLikeSecretKey(k) && typeof v === "string") {
      const trimmed = v.trim();
      const dotted = next.join(".");
      if (isGatewayAuthSecret(dotted)) {
        // Covered by gateway-auth-token (presence/strength), not a stray key.
      } else if (trimmed && !ENV_INTERP.test(trimmed) && trimmed.length >= 8) {
        hits.push({ path: dotted });
      }
    }
    hits.push(...walkSecrets(v, next));
  }
  return hits;
}

const TEXT_ASSIGN =
  /(?:api[_-]?key|auth(?:orization)?|secret|token|password)\s*[:=]\s*['"]([^'"]{8,})['"]/gi;

function findSecretsInText(text: string): string[] {
  const hits: string[] = [];
  const re = new RegExp(TEXT_ASSIGN.source, TEXT_ASSIGN.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const key = m[0].split(/[:=]/)[0]?.trim() ?? "secret";
    hits.push(`${key} (value ${REDACTED})`);
  }
  return hits;
}

export function configHasPlaintextAt(config: JsonObject | null, dotted: string): boolean {
  if (!config) return false;
  const parts = dotted.split(".");
  let cur: JsonValue = config;
  for (const p of parts) {
    const obj = asObject(cur);
    if (!obj) return false;
    cur = obj[p] ?? null;
  }
  return typeof cur === "string" && cur.length >= 8;
}
