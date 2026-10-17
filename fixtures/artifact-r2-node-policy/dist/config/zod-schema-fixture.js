// INERT FIXTURE — synthetic clawscore test data, NOT real OpenClaw code, never executed.
// Shape from OpenClaw 2026.1.29 dist/config/zod-schema.providers-core.js: channel
// groupPolicy "allowlist" next to an execApprovals config schema field.
const GroupPolicySchema = { enum: ["open", "allowlist"] };
const discord = {
  groupPolicy: "allowlist",
  execApprovals: { enabled: false },
};
export { GroupPolicySchema, discord };
