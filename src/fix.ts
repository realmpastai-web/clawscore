import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { isOpenToUnknownSenders } from "./checks/messaging.js";
import { unifiedDiff } from "./diff.js";
import { asObject, asString, locateInstall } from "./locate.js";
import { applyJson5Sets, type Json5Set } from "./json5-edit.js";
import { parseJson5 } from "./parse-config.js";
import { redactSecrets } from "./redact.js";
import type { OpenClawConfig } from "./types.js";

export interface FixPlan {
  path: string;
  configPath: string;
  originalText: string;
  nextText: string;
  diff: string;
  permFiles: string[];
  notes: string[];
  manuals: string[];
}

export interface FixResult {
  applied: boolean;
  backupDir?: string;
  restoreCommand?: string;
  plan: FixPlan;
}

export interface RestoreResult {
  restored: string;
  backupDir: string;
  path: string;
}

const SENDER_STUB = "REPLACE_WITH_YOUR_SENDER_ID";
const LOOPBACK_ORIGINS = ["http://127.0.0.1:18789", "http://localhost:18789"];
const BIND_LOOPBACK = new Set(["loopback", "127.0.0.1", "localhost", "::1", "[::1]"]);

const CHANNEL_KEYS = new Set([
  "whatsapp",
  "telegram",
  "discord",
  "slack",
  "signal",
  "imessage",
  "matrix",
  "msteams",
  "teams",
  "googlechat",
  "irc",
  "mattermost",
  "webchat",
  "twitch",
  "line",
  "zalo",
]);

export function planFix(pathOverride?: string): FixPlan {
  const install = locateInstall(pathOverride);
  if (!install.configPath || install.configText === null) {
    throw new Error(`no OpenClaw config found under ${install.root}`);
  }
  if (!install.config) {
    throw new Error(`could not parse ${install.configPath}`);
  }
  const notes: string[] = [];
  const manuals: string[] = [];
  const sets = collectEdits(install.config);
  const edited = applyJson5Sets(install.configText, sets);
  for (const a of edited.applied) notes.push(a.note);
  for (const s of edited.skipped) {
    notes.push(`Skipped ${s.path.join(".")}: ${s.reason}.`);
    manuals.push(s.manual);
  }
  notes.push("Never deletes skills; review flagged skills by hand.");
  notes.push("Does not remove or rewrite secret values.");
  notes.push("Does not create a gateway token or enable the agent sandbox.");
  const nextText = edited.text;
  if (nextText.includes(SENDER_STUB)) {
    notes.unshift(
      `WARNING: fix inserted the placeholder "${SENDER_STUB}" into your sender allow-list. ` +
        `While this placeholder is present the channel allow-list matches no one, so ALL incoming ` +
        `messages are blocked until you replace it with your real sender IDs. Edit ${basename(install.configPath)} and swap it out before relying on messaging.`,
    );
  }
  const diff = unifiedDiff(install.configText, nextText, basename(install.configPath));
  const permFiles = [install.configPath];
  const credDir = join(install.root, "credentials");
  if (existsSync(credDir)) {
    for (const name of readdirSync(credDir)) {
      const p = join(credDir, name);
      if (statSync(p).isFile()) permFiles.push(p);
    }
  }
  return {
    path: install.root,
    configPath: install.configPath,
    originalText: install.configText,
    nextText,
    diff: redactSecrets(diff),
    permFiles,
    notes,
    manuals,
  };
}

function collectEdits(config: OpenClawConfig): Json5Set[] {
  const sets: Json5Set[] = [];
  const gateway = asObject(config.gateway) ?? {};
  const bind = asString(gateway.bind);
  if (bind && !BIND_LOOPBACK.has(bind.toLowerCase())) {
    sets.push({
      path: ["gateway", "bind"],
      value: "loopback",
      note: 'Set gateway.bind to "loopback" (documented enum).',
      manual: 'Set gateway.bind to "loopback".',
    });
  }
  const customHost = asString(gateway.customBindHost);
  if (customHost && customHost !== "127.0.0.1" && customHost.toLowerCase() !== "loopback") {
    sets.push({
      path: ["gateway", "customBindHost"],
      value: "127.0.0.1",
      note: "Set gateway.customBindHost to 127.0.0.1 (unused once bind is loopback).",
      manual: 'Set gateway.customBindHost to "127.0.0.1" or remove it.',
    });
  }
  const auth = asObject(gateway.auth) ?? {};
  if (auth.mode === "none") {
    sets.push({
      path: ["gateway", "auth", "mode"],
      value: "token",
      note: 'Set gateway.auth.mode from "none" to "token" (token value not generated).',
      manual: 'Set gateway.auth.mode to "token" and configure a long random token yourself.',
    });
  }
  const controlUi = asObject(gateway.controlUi) ?? {};
  const allowed = Array.isArray(controlUi.allowedOrigins) ? controlUi.allowedOrigins : [];
  if (allowed.includes("*") || controlUi.dangerouslyAllowHostHeaderOriginFallback === true) {
    if (allowed.includes("*") || allowed.length === 0) {
      sets.push({
        path: ["gateway", "controlUi", "allowedOrigins"],
        value: LOOPBACK_ORIGINS,
        note: "Replaced wildcard / missing Control UI origins with loopback origins.",
        manual: `Set gateway.controlUi.allowedOrigins to ${JSON.stringify(LOOPBACK_ORIGINS)}.`,
      });
    }
    if (controlUi.dangerouslyAllowHostHeaderOriginFallback === true) {
      sets.push({
        path: ["gateway", "controlUi", "dangerouslyAllowHostHeaderOriginFallback"],
        value: false,
        note: "Set gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback to false.",
        manual: "Set gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback to false.",
      });
    }
  }

  const channels = asObject(config.channels);
  if (channels) {
    for (const [name, raw] of Object.entries(channels)) {
      if (!CHANNEL_KEYS.has(name.toLowerCase())) continue;
      const ch = asObject(raw);
      if (!ch || ch.enabled === false) continue;
      if (!isOpenToUnknownSenders(ch)) continue;
      const dm = asObject(ch.dm);
      const policyPath =
        typeof ch.dmPolicy === "string" || !dm
          ? ["channels", name, "dmPolicy"]
          : ["channels", name, "dm", "policy"];
      const allowPath =
        Array.isArray(ch.allowFrom) || ch.allowFrom !== undefined || !dm
          ? ["channels", name, "allowFrom"]
          : ["channels", name, "dm", "allowFrom"];
      sets.push({
        path: policyPath,
        value: "allowlist",
        note: `Set ${policyPath.join(".")} to "allowlist".`,
        manual: `Set ${policyPath.join(".")} to "allowlist".`,
      });
      const existing = Array.isArray(ch.allowFrom)
        ? ch.allowFrom.filter((x) => x !== "*")
        : Array.isArray(dm?.allowFrom)
          ? (dm.allowFrom as unknown[]).filter((x) => x !== "*")
          : [];
      sets.push({
        path: allowPath,
        value: existing.length > 0 ? existing : [SENDER_STUB],
        note: `Set ${allowPath.join(".")} to a sender allow-list stub.`,
        manual: `Set ${allowPath.join(".")} to ${JSON.stringify(existing.length > 0 ? existing : [SENDER_STUB])}.`,
      });
    }
  }
  return sets;
}

export function restoreCommand(backupDir: string): string {
  return `clawscore fix --restore ${backupDir}`;
}

export function writeBackup(plan: FixPlan): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = join(plan.path, ".clawscore-backup", stamp);
  const dest = join(backupDir, basename(plan.configPath));
  try {
    mkdirSync(backupDir, { recursive: true });
    copyFileSync(plan.configPath, dest);
    const copied = readFileSync(dest);
    const original = readFileSync(plan.configPath);
    if (!copied.equals(original)) {
      throw new Error("copied bytes do not match the original config");
    }
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    throw new Error(
      `refusing to apply fix: backup could not be written (${why}). Config left unchanged.`,
    );
  }
  return backupDir;
}

export function applyFix(plan: FixPlan, opts: { yes: boolean }): FixResult {
  if (!opts.yes) {
    return { applied: false, plan };
  }
  const backupDir = writeBackup(plan);
  const tmp = `${plan.configPath}.clawscore-tmp`;
  try {
    writeFileSync(tmp, plan.nextText, "utf8");
    renameSync(tmp, plan.configPath);
  } catch (e) {
    try {
      if (existsSync(tmp)) {
        // leave the temp file for inspection; config should still be the original
      }
    } catch {
      // ignore
    }
    const why = e instanceof Error ? e.message : String(e);
    throw new Error(`failed to write config after backup at ${backupDir}: ${why}`);
  }
  if (process.platform !== "win32") {
    for (const file of plan.permFiles) {
      try {
        chmodSync(file, 0o600);
      } catch {
        // ignore chmod errors
      }
    }
  }
  return { applied: true, backupDir, restoreCommand: restoreCommand(backupDir), plan };
}

const CONFIG_NAMES = ["openclaw.json", "openclaw.json5", "clawdbot.json", "moltbot.json"];

export function inferInstallFromBackup(backupDir: string): string {
  const resolved = resolve(backupDir);
  const parent = dirname(resolved);
  if (basename(parent) === ".clawscore-backup") return dirname(parent);
  throw new Error("cannot infer --path from backup dir; pass --path <install>");
}

export function restoreFromBackup(backupDir: string, pathOverride?: string): RestoreResult {
  const resolvedBackup = resolve(backupDir);
  if (!existsSync(resolvedBackup) || !statSync(resolvedBackup).isDirectory()) {
    throw new Error(`backup directory not found: ${backupDir}`);
  }
  const installRoot = pathOverride ? resolve(pathOverride) : inferInstallFromBackup(resolvedBackup);
  const install = locateInstall(installRoot);
  let src: string | null = null;
  for (const name of CONFIG_NAMES) {
    const p = join(resolvedBackup, name);
    if (existsSync(p) && statSync(p).isFile()) {
      src = p;
      break;
    }
  }
  if (!src) {
    throw new Error(`backup does not contain an OpenClaw config file (${CONFIG_NAMES.join(", ")})`);
  }
  const dest = install.configPath ?? join(install.root, basename(src));
  const bytes = readFileSync(src);
  const tmp = `${dest}.clawscore-tmp`;
  writeFileSync(tmp, bytes);
  renameSync(tmp, dest);
  const written = readFileSync(dest);
  if (!written.equals(bytes)) {
    throw new Error("restore verification failed: written bytes do not match the backup");
  }
  return { restored: dest, backupDir: resolvedBackup, path: install.root };
}

export function parseConfigOrThrow(text: string): OpenClawConfig {
  const parsed = parseJson5(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("config is not an object");
  }
  return parsed as OpenClawConfig;
}
