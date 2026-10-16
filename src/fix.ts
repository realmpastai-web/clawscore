import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { isOpenToUnknownSenders } from "./checks/messaging.js";
import { unifiedDiff } from "./diff.js";
import { asObject, locateInstall } from "./locate.js";
import { parseJson5 } from "./parse-config.js";
import { redactSecrets } from "./redact.js";
import type { JsonObject, OpenClawConfig } from "./types.js";

export interface FixPlan {
  path: string;
  configPath: string;
  originalText: string;
  nextText: string;
  diff: string;
  permFiles: string[];
  notes: string[];
}

export interface FixResult {
  applied: boolean;
  backupDir?: string;
  plan: FixPlan;
}

const SENDER_STUB = "REPLACE_WITH_YOUR_SENDER_ID";
const LOOPBACK_ORIGINS = ["http://127.0.0.1:18789", "http://localhost:18789"];

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
  const next = structuredClone(install.config) as OpenClawConfig;
  hardenGateway(next, notes);
  hardenChannels(next, notes);
  const nextText = `${JSON.stringify(next, null, 2)}\n`;
  const diff = unifiedDiff(install.configText, nextText, basename(install.configPath));
  const permFiles = [install.configPath];
  const credDir = join(install.root, "credentials");
  if (existsSync(credDir)) {
    for (const name of readdirSync(credDir)) {
      const p = join(credDir, name);
      if (statSync(p).isFile()) permFiles.push(p);
    }
  }
  notes.push("Never deletes skills; review flagged skills by hand.");
  notes.push("Does not remove or rewrite secret values.");
  return {
    path: install.root,
    configPath: install.configPath,
    originalText: install.configText,
    nextText,
    diff: redactSecrets(diff),
    permFiles,
    notes,
  };
}

function hardenGateway(config: OpenClawConfig, notes: string[]): void {
  const gateway = (asObject(config.gateway) ?? {}) as JsonObject;
  const bind = gateway.bind;
  if (typeof bind === "string" && bind.toLowerCase() !== "loopback" && bind !== "127.0.0.1") {
    gateway.bind = "loopback";
    notes.push('Set gateway.bind to "loopback".');
  }
  if (typeof gateway.customBindHost === "string" && gateway.customBindHost !== "127.0.0.1") {
    delete gateway.customBindHost;
  }
  const auth = (asObject(gateway.auth) ?? {}) as JsonObject;
  if (auth.mode === "none") {
    auth.mode = "token";
    notes.push('Set gateway.auth.mode from "none" to "token" (token value not generated).');
  }
  gateway.auth = auth;
  const controlUi = (asObject(gateway.controlUi) ?? {}) as JsonObject;
  const allowed = Array.isArray(controlUi.allowedOrigins) ? controlUi.allowedOrigins : [];
  if (allowed.includes("*") || controlUi.dangerouslyAllowHostHeaderOriginFallback === true) {
    controlUi.allowedOrigins = LOOPBACK_ORIGINS;
    controlUi.dangerouslyAllowHostHeaderOriginFallback = false;
    notes.push("Replaced wildcard / Host-header origin fallback with loopback Control UI origins.");
  }
  gateway.controlUi = controlUi;
  config.gateway = gateway;
}

function hardenChannels(config: OpenClawConfig, notes: string[]): void {
  const channels = asObject(config.channels);
  if (!channels) return;
  for (const [name, raw] of Object.entries(channels)) {
    if (!CHANNEL_KEYS.has(name.toLowerCase())) continue;
    const ch = asObject(raw);
    if (!ch || ch.enabled === false) continue;
    if (!isOpenToUnknownSenders(ch)) continue;
    ch.dmPolicy = "allowlist";
    const existing = Array.isArray(ch.allowFrom)
      ? ch.allowFrom.filter((x) => x !== "*")
      : [];
    ch.allowFrom = existing.length > 0 ? existing : [SENDER_STUB];
    channels[name] = ch;
    notes.push(`Set channels.${name}.dmPolicy=allowlist and allowFrom stub.`);
  }
  config.channels = channels;
}

export function applyFix(plan: FixPlan, opts: { yes: boolean }): FixResult {
  if (!opts.yes) {
    return { applied: false, plan };
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = join(plan.path, ".clawscore-backup", stamp);
  mkdirSync(backupDir, { recursive: true });
  copyFileSync(plan.configPath, join(backupDir, basename(plan.configPath)));
  writeFileSync(plan.configPath, plan.nextText, "utf8");
  if (process.platform !== "win32") {
    for (const file of plan.permFiles) {
      try {
        chmodSync(file, 0o600);
      } catch {
        // ignore chmod errors
      }
    }
  }
  return { applied: true, backupDir, plan };
}

export function parseConfigOrThrow(text: string): OpenClawConfig {
  const parsed = parseJson5(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("config is not an object");
  }
  return parsed as OpenClawConfig;
}
