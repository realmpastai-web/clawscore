import { asObject, asString } from "../locate.js";
import type { Finding, Install, JsonObject } from "../types.js";

export function checkSandboxAndExec(install: Install): Finding[] {
  const findings: Finding[] = [];
  const agents = asObject(install.config?.agents) ?? {};
  const defaults = asObject(agents.defaults) ?? {};
  const sandbox = asObject(defaults.sandbox) ?? asObject(install.config?.sandbox);
  const mode = asString(sandbox?.mode)?.toLowerCase() ?? "off";

  if (mode === "off" || !sandbox) {
    findings.push({
      id: "sandbox-disabled",
      title: "Agent sandbox is disabled",
      severity: "high",
      weight: 6,
      evidence: sandbox
        ? `agents.defaults.sandbox.mode is ${JSON.stringify(mode)} (OpenClaw default is off).`
        : "agents.defaults.sandbox is missing; OpenClaw defaults sandbox.mode to off, so tools run on the gateway host.",
      fix: 'Set agents.defaults.sandbox.mode to "non-main" or "all" and keep the Docker/Podman backend unless you have a tighter isolation plan.',
      file: install.configPath ?? undefined,
    });
  }

  const tools = asObject(install.config?.tools) ?? {};
  const exec = asObject(tools.exec) ?? {};
  findings.push(...checkExec(exec, install.configPath));
  return findings;
}

function checkExec(exec: JsonObject, file?: string | null): Finding[] {
  const findings: Finding[] = [];
  // Official: tools.exec.mode (deny|allowlist|ask|auto|full). Legacy: tools.exec.security.
  const mode = (asString(exec.mode) ?? asString(exec.security) ?? "full").toLowerCase();
  const unrestricted = mode === "full" || mode === "unsafe";

  if (unrestricted) {
    findings.push({
      id: "unrestricted-shell",
      title: "Unrestricted exec / shell tool",
      severity: "high",
      weight: 5,
      evidence: `tools.exec.mode is ${JSON.stringify(mode)} — host exec runs without an allow-list or approval prompt (OpenClaw default is full).`,
      fix: 'Set tools.exec.mode to "allowlist", "ask", or "deny", and configure tools.exec.safeBins (stdin-only) plus the host exec approvals allowlist.',
      file: file ?? undefined,
    });
  }

  // Official config key is tools.exec.safeBins. Durable command allowlists live in the
  // host approvals file, not openclaw.json. Leftover allowlist/allowList/allowed arrays
  // are accepted as heuristic evidence only (not in the official Zod schema).
  const leftover = exec.allowlist ?? exec.allowList ?? exec.allowed;
  const hasLeftoverAllowlist = Array.isArray(leftover) && leftover.length > 0;
  const hasSafeBins = Array.isArray(exec.safeBins) && exec.safeBins.length > 0;
  const policyMode = mode === "allowlist" || mode === "ask" || mode === "auto" || mode === "deny";

  if (!hasLeftoverAllowlist && !hasSafeBins && mode !== "deny") {
    findings.push({
      id: "exec-allowlist-missing",
      title: "Missing exec allow-list",
      severity: "medium",
      weight: 4,
      evidence: policyMode
        ? `tools.exec.mode is ${JSON.stringify(mode)} but tools.exec.safeBins is empty and no leftover allowlist array was found.`
        : "No tools.exec.safeBins (official) or leftover allowlist array is configured.",
      fix: "Set tools.exec.safeBins for stdin-only filters, and add resolved executable paths in the host exec approvals allowlist (not a tools.exec.allowlist key).",
      file: file ?? undefined,
    });
  }

  return findings;
}
