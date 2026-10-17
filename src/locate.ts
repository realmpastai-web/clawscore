import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseJson5 } from "./parse-config.js";
import type { Install, JsonObject, OpenClawConfig } from "./types.js";

const CONFIG_NAMES = ["openclaw.json", "openclaw.json5", "clawdbot.json", "moltbot.json"];

export function defaultInstallPath(): string {
  return join(homedir(), ".openclaw");
}

export function locateInstall(pathOverride?: string): Install {
  const root = resolve(pathOverride ?? defaultInstallPath());
  const configPath = findConfig(root);
  let config: OpenClawConfig | null = null;
  let configText: string | null = null;
  if (configPath && existsSync(configPath)) {
    configText = readFileSync(configPath, "utf8");
    try {
      const parsed = parseJson5(configText);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        config = parsed as OpenClawConfig;
      }
    } catch {
      config = null;
    }
  }
  const version = readVersion(root, config);
  const skillDirs = discoverSkillDirs(root, config);
  return { root, configPath, config, configText, version, skillDirs };
}

function findConfig(root: string): string | null {
  for (const name of CONFIG_NAMES) {
    const p = join(root, name);
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

function readVersion(root: string, config: OpenClawConfig | null): string | null {
  const files = ["VERSION", "version", "openclaw-version"];
  for (const name of files) {
    const p = join(root, name);
    if (existsSync(p) && statSync(p).isFile()) {
      const text = readFileSync(p, "utf8").trim().split(/\s+/)[0];
      if (text) return text;
    }
  }
  const pkgPath = join(root, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string; name?: string };
      if (pkg.version && (pkg.name === "openclaw" || pkg.name === "clawdbot" || !pkg.name)) {
        return pkg.version;
      }
      if (pkg.version) return pkg.version;
    } catch {
      // ignore
    }
  }
  const fromConfig = pickString(config, ["version", "openclawVersion"]);
  if (fromConfig) return fromConfig;
  const meta = config?.meta;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const v = (meta as JsonObject).version;
    if (typeof v === "string") return v;
  }
  return null;
}

function pickString(obj: JsonObject | null, keys: string[]): string | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function discoverSkillDirs(root: string, config: OpenClawConfig | null): string[] {
  const dirs: string[] = [];
  const candidates = [
    join(root, "skills"),
    join(root, "workspace", "skills"),
    join(root, "agents", "main", "skills"),
  ];
  const extra = config?.skills;
  if (extra && typeof extra === "object" && !Array.isArray(extra)) {
    const load = (extra as JsonObject).load;
    if (load && typeof load === "object" && !Array.isArray(load)) {
      const extraDirs = (load as JsonObject).extraDirs;
      if (Array.isArray(extraDirs)) {
        for (const d of extraDirs) {
          if (typeof d === "string") candidates.push(resolve(root, expandHome(d)));
        }
      }
    }
  }
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isDirectory()) dirs.push(c);
  }
  return dirs;
}

function expandHome(p: string): string {
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

export function listSkillPackages(skillDirs: string[]): string[] {
  const out: string[] = [];
  for (const dir of skillDirs) {
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (name.startsWith(".")) continue;
      const p = join(dir, name);
      try {
        if (statSync(p).isDirectory()) out.push(p);
      } catch {
        // ignore
      }
    }
  }
  return out;
}

export function asObject(value: unknown): JsonObject | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as JsonObject;
  return null;
}

export function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
