import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const SKIP_DIRS = new Set(["node_modules", ".git", ".clawscore-backup", "dist", "coverage"]);
const TEXT_EXTS = new Set([
  ".js",
  ".cjs",
  ".mjs",
  ".ts",
  ".tsx",
  ".json",
  ".json5",
  ".md",
  ".py",
  ".sh",
  ".bash",
  ".zsh",
  ".yml",
  ".yaml",
  ".toml",
]);
const MAX_FILE_BYTES = 512 * 1024;

export interface TextFile {
  path: string;
  text: string;
}

export function walkTextFiles(root: string): TextFile[] {
  const out: TextFile[] = [];
  walk(root, out);
  return out;
}

function walk(dir: string, out: TextFile[]): void {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name.startsWith(".") && name !== ".env" && name !== ".env.example") continue;
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(p, out);
      continue;
    }
    if (!st.isFile() || st.size > MAX_FILE_BYTES) continue;
    const ext = extname(name).toLowerCase();
    if (!TEXT_EXTS.has(ext) && name !== "SKILL.md" && name !== "Dockerfile") continue;
    try {
      out.push({ path: p, text: readFileSync(p, "utf8") });
    } catch {
      // ignore unreadable files
    }
  }
}
