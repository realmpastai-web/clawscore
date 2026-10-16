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
  const mode = (asString(exec.mode) ?? "full").toLowerCase();
  const unrestricted = mode === "full" || mode === "unsafe";

  if (unrestricted) {
    findings.push({
      id: "unrestricted-shell",
      title: "Unrestricted exec / shell tool",
      severity: "high",
      weight: 5,
      evidence: `tools.exec.mode is ${JSON.stringify(mode)} — host exec runs without an allow-list or approval prompt (OpenClaw default is full).`,
      fix: 'Set tools.exec.mode to "allowlist" or "ask", and list the exact binaries the agent may run.',
      file: file ?? undefined,
    });
  }

  const allowlist = exec.allowlist ?? exec.allowList ?? exec.allowed;
  const hasAllowlist = Array.isArray(allowlist) && allowlist.length > 0;
  const hasSafeBins = Array.isArray(exec.safeBins) && exec.safeBins.length > 0;
  const policyMode = mode === "allowlist" || mode === "ask" || mode === "auto" || mode === "deny";

  if (!hasAllowlist && !hasSafeBins && mode !== "deny") {
    findings.push({
      id: "exec-allowlist-missing",
      title: "Missing exec allow-list",
      severity: "medium",
      weight: 4,
      evidence: policyMode
        ? `tools.exec.mode is ${JSON.stringify(mode)} but no tools.exec.allowlist (or safeBins) entries were found.`
        : "No tools.exec.allowlist is configured.",
      fix: "Add tools.exec.allowlist with resolved executable paths (and optional argPattern). Keep autoAllowSkills false unless Gateway and node share a trust boundary.",
      file: file ?? undefined,
    });
  }

  return findings;
}
