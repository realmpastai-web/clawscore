export const CLAWSCORE_VERSION = "0.1.0";

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type Grade = "A" | "B" | "C" | "D" | "F";

export interface Advisory {
  id: string;
  affected: string;
  fixed: string;
  severity: Severity | "critical" | "high" | "medium" | "low";
  source: string;
  aliases?: string[];
  summary?: string;
  nvd?: string;
}

export interface AdvisoriesFile {
  updated?: string;
  advisories: Advisory[];
}

export interface Finding {
  id: string;
  title: string;
  severity: Severity;
  weight: number;
  evidence: string;
  fix: string;
  file?: string;
}

export interface ReportSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface Report {
  tool: "clawscore";
  toolVersion: string;
  path: string;
  configPath: string | null;
  openclawVersion: string | null;
  score: number;
  grade: Grade;
  findings: Finding[];
  summary: ReportSummary;
}

export type JsonObject = { [key: string]: JsonValue };
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | JsonObject;

export type OpenClawConfig = JsonObject;

export interface Install {
  root: string;
  configPath: string | null;
  config: OpenClawConfig | null;
  configText: string | null;
  version: string | null;
  skillDirs: string[];
}

export interface ScanOptions {
  path?: string;
  advisories?: Advisory[];
}

export interface CliOptions {
  command: "scan" | "fix" | "skill";
  path?: string;
  skillPath?: string;
  json: boolean;
  markdown: boolean;
  badge?: string;
  yes: boolean;
  updateAdvisories: boolean;
  help: boolean;
  version: boolean;
}
