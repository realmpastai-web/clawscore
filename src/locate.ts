import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { parseJson5 } from "./parse-config.js";
import type { Install, JsonObject, OpenClawConfig } from "./types.js";

const CONFIG_NAMES = ["openclaw.json", "openclaw.json5", "clawdbot.json", "moltbot.json"];
const PACKAGE_NAMES = ["openclaw", "clawdbot", "moltbot"] as const;

export function defaultInstallPath(): string {
  return join(homedir(), ".openclaw");
}

export function locateInstall(pathOverride?: string, packagePathOverride?: string): Install {
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
  const packageDir = resolvePackageDir(root, packagePathOverride, Boolean(pathOverride));
  return { root, configPath, config, configText, version, skillDirs, packageDir };
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

function existingDirectory(p: string): string | null {
  try {
    const real = realpathSync(p);
    if (statSync(real).isDirectory()) return real;
  } catch {
    try {
      if (existsSync(p) && statSync(p).isDirectory()) return resolve(p);
    } catch {
      return null;
    }
  }
  return null;
}

function packageNameAt(dir: string): string | null {
  const pkgPath = join(dir, "package.json");
  try {
    if (!existsSync(pkgPath) || !statSync(pkgPath).isFile()) return null;
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: string };
    return typeof pkg.name === "string" ? pkg.name : null;
  } catch {
    return null;
  }
}

function isMatchingPackageDir(dir: string, expected?: string): boolean {
  const name = packageNameAt(dir);
  if (!name) return false;
  if (expected) return name === expected;
  return (PACKAGE_NAMES as readonly string[]).includes(name);
}

function hasDistDir(dir: string): boolean {
  const dist = join(dir, "dist");
  try {
    return existsSync(dist) && statSync(dist).isDirectory();
  } catch {
    return false;
  }
}

function walkUpToNamedPackage(start: string, expectedName: string): string | null {
  let dir: string;
  try {
    const st = lstatSync(start);
    dir = st.isDirectory() ? start : dirname(start);
  } catch {
    dir = dirname(start);
  }
  for (;;) {
    if (isMatchingPackageDir(dir, expectedName)) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function findOnPath(cmd: string): string | null {
  const pathEnv = process.env.PATH ?? "";
  if (!pathEnv) return null;
  const names =
    process.platform === "win32" ? [cmd, `${cmd}.cmd`, `${cmd}.exe`, `${cmd}.bat`] : [cmd];
  for (const dir of pathEnv.split(delimiter).filter(Boolean)) {
    for (const n of names) {
      const p = join(dir, n);
      try {
        const st = lstatSync(p);
        if (st.isFile() || st.isSymbolicLink()) return p;
      } catch {
        continue;
      }
    }
  }
  return null;
}

function packageDirFromBinary(name: string): string | null {
  const bin = findOnPath(name);
  if (!bin) return null;
  let resolved = bin;
  try {
    resolved = realpathSync(bin);
  } catch {
    resolved = bin;
  }
  return walkUpToNamedPackage(resolved, name);
}

function npmGlobalRoot(): string | null {
  if (!(process.env.PATH ?? "")) return null;
  try {
    const result = spawnSync("npm", ["root", "-g"], {
      encoding: "utf8",
      timeout: 8000,
      env: {
        ...process.env,
        npm_config_offline: "true",
        npm_config_audit: "false",
        npm_config_fund: "false",
        npm_config_update_notifier: "false",
      },
    });
    if (result.status !== 0) return null;
    const line = (result.stdout ?? "").trim().split(/\r?\n/).filter(Boolean).pop();
    return line || null;
  } catch {
    return null;
  }
}

function packageDirFromNpmGlobal(name: string): string | null {
  const root = npmGlobalRoot();
  if (!root) return null;
  const dir = join(root, name);
  if (isMatchingPackageDir(dir, name) || hasDistDir(dir)) return existingDirectory(dir);
  return null;
}

function packageDirFromInstallRoot(root: string): string | null {
  const candidates = [
    root,
    join(root, "package"),
    join(root, "node_modules", "openclaw"),
    join(root, "node_modules", "clawdbot"),
    join(root, "node_modules", "moltbot"),
  ];
  for (const dir of candidates) {
    if (hasDistDir(dir)) return existingDirectory(dir) ?? dir;
  }
  return null;
}

function pkgDiscoveryDisabled(): boolean {
  return process.env.CLAWSCORE_NO_PKG_DISCOVERY === "1";
}

function packageDirFromPathOrNpm(): string | null {
  if (pkgDiscoveryDisabled()) return null;
  for (const name of PACKAGE_NAMES) {
    const fromBin = packageDirFromBinary(name);
    if (fromBin) return fromBin;
  }
  for (const name of PACKAGE_NAMES) {
    const fromNpm = packageDirFromNpmGlobal(name);
    if (fromNpm) return fromNpm;
  }
  return null;
}

/** Resolve the OpenClaw package directory. Never touches the network. */
export function resolvePackageDir(
  installRoot: string,
  packagePathOverride?: string,
  pathExplicit = false,
): string | null {
  if (packagePathOverride) return existingDirectory(resolve(packagePathOverride));

  // Explicit --path: look under that install root before PATH / npm -g, so a
  // developer's global openclaw cannot shadow a local unpack or fixture.
  if (pathExplicit) {
    const fromRoot = packageDirFromInstallRoot(installRoot);
    if (fromRoot) return fromRoot;
    return packageDirFromPathOrNpm();
  }

  const fromDisc = packageDirFromPathOrNpm();
  if (fromDisc) return fromDisc;
  return packageDirFromInstallRoot(installRoot);
}
