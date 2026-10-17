#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { updateAdvisories } from "./advisories.js";
import { applyFix, planFix, restoreFromBackup } from "./fix.js";
import { formatBadge } from "./report/badge.js";
import { formatJson } from "./report/json.js";
import { formatMarkdown } from "./report/markdown.js";
import { formatTerminal } from "./report/terminal.js";
import { assertRedacted } from "./redact.js";
import { scan } from "./scan.js";
import { scanSkill, skillExitCode } from "./skill-scan.js";
import { CLAWSCORE_VERSION, type CliOptions, type Report } from "./types.js";

const HELP = `clawscore ${CLAWSCORE_VERSION}
One command. A 0-100 security score for your OpenClaw setup, and the fixes.

Usage:
  clawscore [scan] [--path <dir>] [--json] [--markdown] [--badge <out.svg>]
  clawscore fix [--path <dir>] [--yes]
  clawscore fix --restore <backupDir> [--path <dir>]
  clawscore skill <path>
  clawscore --update-advisories

Options:
  --path <dir>           OpenClaw install/config root (default: ~/.openclaw)
  --json                 Print the report as JSON
  --markdown             Print a shareable Markdown report
  --badge <out.svg>      Write a shields.io-style SVG badge
  --yes                  Apply safe fixes (backup first). Without --yes, fix is a dry run.
  --restore <backupDir>  Restore openclaw.json from a .clawscore-backup directory
  --update-advisories    Fetch advisory data over the network (off by default)
  -h, --help             Show this help
  -V, --version          Show version

Offline by default. Never prints secret values. Not affiliated with OpenClaw.
`;

export function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    command: "scan",
    json: false,
    markdown: false,
    yes: false,
    updateAdvisories: false,
    help: false,
    version: false,
  };
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    if (a === "-h" || a === "--help") opts.help = true;
    else if (a === "-V" || a === "--version") opts.version = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--markdown") opts.markdown = true;
    else if (a === "--yes" || a === "-y") opts.yes = true;
    else if (a === "--restore") {
      opts.restore = argv[++i];
      if (!opts.restore) throw new Error("--restore requires a backup directory");
    } else if (a.startsWith("--restore=")) opts.restore = a.slice("--restore=".length);
    else if (a === "--update-advisories") opts.updateAdvisories = true;
    else if (a === "--path") {
      opts.path = argv[++i];
      if (!opts.path) throw new Error("--path requires a directory");
    } else if (a.startsWith("--path=")) opts.path = a.slice("--path=".length);
    else if (a === "--badge") {
      opts.badge = argv[++i];
      if (!opts.badge) throw new Error("--badge requires an output path");
    } else if (a.startsWith("--badge=")) opts.badge = a.slice("--badge=".length);
    else if (!a.startsWith("-")) rest.push(a);
    else throw new Error(`unknown option: ${a}`);
  }
  const cmd = rest[0];
  if (cmd === "scan" || cmd === "fix" || cmd === "skill") {
    opts.command = cmd;
    rest.shift();
  }
  if (opts.command === "skill") {
    opts.skillPath = rest[0] ?? opts.path;
    if (!opts.skillPath) throw new Error("clawscore skill <path> requires a skill path");
  } else if (rest.length > 0 && !opts.path) {
    opts.path = rest[0];
  }
  if (opts.restore) opts.command = "fix";
  return opts;
}

export async function runCli(
  argv: string[],
  io: { log: (s: string) => void; err: (s: string) => void } = {
    log: (s) => console.log(s),
    err: (s) => console.error(s),
  },
): Promise<number> {
  let opts: CliOptions;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    io.err(e instanceof Error ? e.message : String(e));
    return 2;
  }
  if (opts.help) {
    io.log(HELP.trimEnd());
    return 0;
  }
  if (opts.version) {
    io.log(CLAWSCORE_VERSION);
    return 0;
  }

  if (opts.updateAdvisories) {
    try {
      const result = await updateAdvisories();
      io.log(`Updated ${result.count} advisories at ${result.dest}`);
    } catch (e) {
      io.err(e instanceof Error ? e.message : String(e));
      return 1;
    }
    if (opts.command === "scan" && !opts.path && argv.every((a) => a.startsWith("-"))) {
      return 0;
    }
  }

  try {
    if (opts.command === "fix") return runFix(opts, io);
    if (opts.command === "skill") return runSkill(opts, io);
    return runScan(opts, io);
  } catch (e) {
    io.err(e instanceof Error ? e.message : String(e));
    return 1;
  }
}

function emitReport(report: Report, opts: CliOptions, io: { log: (s: string) => void }): void {
  const chunks: string[] = [];
  if (opts.json) chunks.push(formatJson(report).trimEnd());
  else if (opts.markdown) chunks.push(formatMarkdown(report).trimEnd());
  else chunks.push(formatTerminal(report).trimEnd());
  if (opts.json && opts.markdown) {
    // json already chosen; markdown is extra
    chunks.push(formatMarkdown(report).trimEnd());
  }
  const text = chunks.join("\n");
  assertRedacted(text);
  io.log(text);
  if (opts.badge) {
    const svg = formatBadge(report);
    assertRedacted(svg);
    writeFileSync(resolve(opts.badge), svg, "utf8");
  }
}

function runScan(opts: CliOptions, io: { log: (s: string) => void }): number {
  const report = scan({ path: opts.path });
  emitReport(report, opts, io);
  return 0;
}

function runFix(
  opts: CliOptions,
  io: { log: (s: string) => void; err: (s: string) => void },
): number {
  if (opts.restore) {
    const result = restoreFromBackup(opts.restore, opts.path);
    io.log(`Restored ${result.restored} from ${result.backupDir}`);
    return 0;
  }
  const plan = planFix(opts.path);
  io.log("Planned safe fixes (reversible; skills are never deleted):");
  for (const n of plan.notes) io.log(`  - ${n}`);
  for (const m of plan.manuals) io.log(`  - Manual: ${m}`);
  io.log("");
  if (plan.diff) {
    io.log(plan.diff);
    io.log("");
  } else {
    io.log("Config already matches safe bind / origin / sender defaults.");
    io.log("");
  }
  io.log(`File modes to tighten (0600): ${plan.permFiles.join(", ")}`);
  if (!opts.yes) {
    io.log("\nDry run. Re-run with --yes to write a backup and apply.");
    return 0;
  }
  const result = applyFix(plan, { yes: true });
  io.log(`Backup: ${result.backupDir}`);
  io.log(`Restore: ${result.restoreCommand}`);
  io.log("Fixes applied. Re-scan with: clawscore --path " + plan.path);
  return 0;
}

function runSkill(opts: CliOptions, io: { log: (s: string) => void }): number {
  const result = scanSkill(resolve(opts.skillPath!));
  const fakeReport: Report = {
    tool: "clawscore",
    toolVersion: CLAWSCORE_VERSION,
    path: result.path,
    configPath: null,
    openclawVersion: null,
    score: Math.max(0, 100 - result.findings.reduce((s, f) => s + f.weight, 0)),
    grade: "F",
    findings: result.findings,
    summary: {
      critical: result.findings.filter((f) => f.severity === "critical").length,
      high: result.findings.filter((f) => f.severity === "high").length,
      medium: result.findings.filter((f) => f.severity === "medium").length,
      low: result.findings.filter((f) => f.severity === "low").length,
      info: result.findings.filter((f) => f.severity === "info").length,
    },
  };
  fakeReport.grade = fakeReport.score >= 90 ? "A" : fakeReport.score >= 80 ? "B" : fakeReport.score >= 70 ? "C" : fakeReport.score >= 40 ? "D" : "F";
  emitReport(fakeReport, opts, io);
  return skillExitCode(result.findings);
}

function isEntrypoint(): boolean {
  try {
    const self = fileURLToPath(import.meta.url);
    const arg = process.argv[1] ? resolve(process.argv[1]) : "";
    return arg.length > 0 && self === arg;
  } catch {
    return false;
  }
}

if (isEntrypoint()) {
  runCli(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    },
  );
}
