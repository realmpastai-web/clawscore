import { asObject, asString } from "../locate.js";
import type { Finding, Install, JsonObject } from "../types.js";

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

export function checkMessaging(install: Install): Finding[] {
  const channels = asObject(install.config?.channels);
  if (!channels) return [];
  const findings: Finding[] = [];
  for (const [name, raw] of Object.entries(channels)) {
    if (!CHANNEL_KEYS.has(name.toLowerCase())) continue;
    const ch = asObject(raw);
    if (!ch) continue;
    if (ch.enabled === false) continue;
    if (isOpenToUnknownSenders(ch)) {
      findings.push({
        id: "messaging-open-senders",
        title: "Messaging channel accepts commands from unknown senders",
        severity: "high",
        weight: 6,
        evidence: `channels.${name} has no sender allow-list (dmPolicy=${JSON.stringify(policyOf(ch))}, allowFrom=${summarizeAllow(ch)}). Unknown senders can issue commands.`,
        fix: `Set channels.${name}.dmPolicy to "allowlist" (or "pairing") and put your sender IDs in channels.${name}.allowFrom. Do not use "*" or dmPolicy "open".`,
        file: install.configPath ?? undefined,
      });
    }
  }
  return findings;
}

function policyOf(ch: JsonObject): string | null {
  const dm = asObject(ch.dm);
  return asString(ch.dmPolicy) ?? asString(dm?.policy);
}

function allowFromOf(ch: JsonObject): unknown {
  const dm = asObject(ch.dm);
  return ch.allowFrom ?? dm?.allowFrom;
}

function summarizeAllow(ch: JsonObject): string {
  const allow = allowFromOf(ch);
  if (!Array.isArray(allow)) return "unset";
  if (allow.includes("*")) return '["*"]';
  return `[${allow.length} entries]`;
}

export function isOpenToUnknownSenders(ch: JsonObject): boolean {
  const policy = (policyOf(ch) ?? "pairing").toLowerCase();
  const allow = allowFromOf(ch);
  const list = Array.isArray(allow) ? allow : [];
  const hasStar = list.some((x) => x === "*");
  if (policy === "disabled") return false;
  if (policy === "open" || hasStar) return true;
  if (policy === "allowlist") return list.length === 0 || hasStar;
  if (policy === "pairing") return false;
  return hasStar;
}
