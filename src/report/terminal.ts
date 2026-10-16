import type { Report } from "../types.js";
import { redactSecrets } from "../redact.js";

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

const c = {
  reset: useColor ? "\x1b[0m" : "",
  bold: useColor ? "\x1b[1m" : "",
  dim: useColor ? "\x1b[2m" : "",
  red: useColor ? "\x1b[31m" : "",
  yellow: useColor ? "\x1b[33m" : "",
  green: useColor ? "\x1b[32m" : "",
  cyan: useColor ? "\x1b[36m" : "",
};

function gradeColor(grade: string): string {
  if (grade === "A" || grade === "B") return c.green;
  if (grade === "C") return c.yellow;
  return c.red;
}

export function formatTerminal(report: Report): string {
  const lines: string[] = [];
  const gc = gradeColor(report.grade);
  lines.push(`${c.bold}clawscore${c.reset} ${report.toolVersion}`);
  lines.push(`${c.dim}path${c.reset}     ${report.path}`);
  lines.push(`${c.dim}version${c.reset}  ${report.openclawVersion ?? "unknown"}`);
  lines.push("");
  lines.push(
    `  ${c.bold}SCORE${c.reset}  ${gc}${report.score}/100${c.reset}   ${c.bold}GRADE ${report.grade}${c.reset}`,
  );
  lines.push("");
  const { summary } = report;
  lines.push(
    `${c.dim}findings${c.reset}  critical ${summary.critical}  high ${summary.high}  medium ${summary.medium}  low ${summary.low}  info ${summary.info}`,
  );
  if (report.findings.length === 0) {
    lines.push("");
    lines.push(`${c.green}No findings. Keep bind=loopback, sandbox on, and skills reviewed.${c.reset}`);
    return redactSecrets(lines.join("\n"));
  }
  lines.push("");
  for (const f of report.findings) {
    const tag = f.severity.toUpperCase().padEnd(8);
    lines.push(`${severityMark(f.severity)} [${tag}] ${c.bold}${f.id}${c.reset}  weight ${f.weight}`);
    if (f.title) lines.push(`         ${f.title}`);
    lines.push(`         evidence: ${f.evidence}`);
    lines.push(`         fix: ${f.fix}`);
    lines.push("");
  }
  lines.push(`${c.dim}Not affiliated with OpenClaw. Offline scan; no secrets printed.${c.reset}`);
  return redactSecrets(lines.join("\n"));
}

function severityMark(sev: string): string {
  switch (sev) {
    case "critical":
      return `${c.red}!!${c.reset}`;
    case "high":
      return `${c.red}!${c.reset} `;
    case "medium":
      return `${c.yellow}*${c.reset} `;
    default:
      return `${c.cyan}·${c.reset} `;
  }
}
