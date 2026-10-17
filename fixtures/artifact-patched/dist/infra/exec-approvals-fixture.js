// INERT FIXTURE — synthetic clawscore test data, NOT real OpenClaw code, never executed.
function execApproval(cmd){var resolvedPath=realpathSync(resolveExecutable(cmd.name));if(allowlist.has(resolvedPath)){return runExec(cmd)}return deny()}
