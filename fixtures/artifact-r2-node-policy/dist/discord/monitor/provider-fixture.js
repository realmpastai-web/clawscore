// INERT FIXTURE — synthetic clawscore test data, NOT real OpenClaw code, never executed.
// Shape from OpenClaw 2026.1.29 dist/discord/monitor/provider.js: channel allowlists
// plus an exec-approvals UI import — not the sandbox exec allowlist matcher.
import { mergeAllowlist } from "../../channels/allowlists/resolve-utils.js";
import { createExecApprovalButton } from "./exec-approvals.js";
function boot(discordCfg) {
  const execApprovalsConfig = discordCfg.execApprovals ?? {};
  const execApprovalsHandler = execApprovalsConfig.enabled ? createExecApprovalButton() : null;
  return { execApprovalsHandler, allow: mergeAllowlist([]) };
}
export { boot };
