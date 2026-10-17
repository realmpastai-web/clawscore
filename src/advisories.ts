import { readFileSync, writeFileSync } from "node:fs";
import { advisoriesPath } from "./paths.js";
import type { AdvisoriesFile, Advisory, Severity } from "./types.js";

const DEFAULT_UPDATE_URL =
  "https://raw.githubusercontent.com/realmpastai-web/clawscore/main/data/advisories.json";

const SEVERITIES = new Set(["critical", "high", "medium", "low", "info"]);

export function loadAdvisories(filePath = advisoriesPath()): Advisory[] {
  const raw = JSON.parse(readFileSync(filePath, "utf8")) as AdvisoriesFile;
  return (raw.advisories ?? []).filter(isAdvisory);
}

export function isAdvisory(value: unknown): value is Advisory {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.affected === "string" &&
    typeof v.fixed === "string" &&
    typeof v.severity === "string" &&
    SEVERITIES.has(v.severity) &&
    typeof v.source === "string" &&
    /^https?:\/\//.test(v.source)
  );
}

export async function updateAdvisories(opts?: {
  url?: string;
  dest?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ count: number; dest: string }> {
  const url = opts?.url ?? process.env.CLAWSCORE_ADVISORIES_URL ?? DEFAULT_UPDATE_URL;
  const dest = opts?.dest ?? advisoriesPath();
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const res = await fetchImpl(url, {
    method: "GET",
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`advisory update failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as unknown;
  const file = normalizeAdvisoriesFile(body);
  writeFileSync(dest, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  return { count: file.advisories.length, dest };
}

function normalizeAdvisoriesFile(body: unknown): AdvisoriesFile {
  if (!body || typeof body !== "object") throw new Error("advisory update: invalid JSON");
  const rec = body as Record<string, unknown>;
  const list = Array.isArray(rec.advisories) ? rec.advisories : Array.isArray(body) ? body : null;
  if (!list) throw new Error("advisory update: missing advisories array");
  const advisories = list.filter(isAdvisory);
  if (advisories.length === 0) throw new Error("advisory update: no valid advisories");
  return {
    updated: new Date().toISOString().slice(0, 10),
    advisories,
  };
}

export function severityFromAdvisory(s: string): Severity {
  if (s === "critical" || s === "high" || s === "medium" || s === "low" || s === "info") return s;
  return "high";
}
