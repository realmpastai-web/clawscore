import type { Finding, Grade, ReportSummary, Severity } from "./types.js";

export function summarize(findings: Finding[]): ReportSummary {
  const summary: ReportSummary = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
  for (const f of findings) summary[f.severity] += 1;
  return summary;
}

export interface Deduction {
  id: string;
  weight: number;
}

/** One row per check id (max weight if the same id appears more than once). */
export function deductions(findings: Finding[]): Deduction[] {
  const byId = new Map<string, number>();
  for (const f of findings) {
    byId.set(f.id, Math.max(byId.get(f.id) ?? 0, f.weight));
  }
  return [...byId.entries()]
    .map(([id, weight]) => ({ id, weight }))
    .sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));
}

export function computeScore(findings: Finding[]): number {
  const deducted = deductions(findings).reduce((sum, d) => sum + d.weight, 0);
  return Math.max(0, Math.min(100, 100 - deducted));
}

/** `100 − 12 − 10 − 8 = 70` using unique check ids so the printed score adds up. */
export function scoreEquation(findings: Finding[]): string {
  const parts = deductions(findings);
  const score = computeScore(findings);
  if (parts.length === 0) return "100 − 0 = 100";
  return `100 − ${parts.map((p) => p.weight).join(" − ")} = ${score}`;
}

/**
 * A 90–100, B 80–89, C 70–79, D 40–69, F 0–39.
 * Scores below 50 are D (40–49) or F (0–39).
 */
export function gradeFor(score: number): Grade {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 40) return "D";
  return "F";
}

export const SEVERITY_ORDER: Severity[] = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
];

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const ds = SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
    if (ds !== 0) return ds;
    if (b.weight !== a.weight) return b.weight - a.weight;
    return a.id.localeCompare(b.id);
  });
}
