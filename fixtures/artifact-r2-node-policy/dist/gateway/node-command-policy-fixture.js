// INERT FIXTURE — synthetic clawscore test data, NOT real OpenClaw code, never executed.
// Shape from OpenClaw 2026.1.29 dist/gateway/node-command-policy.js: a node RPC
// allowlist plus the system.execApprovals.* method names — not sandbox exec-approvals.
const SYSTEM_COMMANDS = ["system.run", "system.execApprovals.get", "system.execApprovals.set"];
function isNodeCommandAllowed(params) {
  if (!params.allowlist.has(params.command)) return { ok: false, reason: "command not allowlisted" };
  return { ok: true };
}
export { SYSTEM_COMMANDS, isNodeCommandAllowed };
