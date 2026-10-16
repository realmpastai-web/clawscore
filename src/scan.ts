import { checkAdvisories } from "./checks/advisories.js";
import { checkGateway } from "./checks/gateway.js";
import { checkMessaging } from "./checks/messaging.js";
import { checkPermissions } from "./checks/permissions.js";
import { checkSandboxAndExec } from "./checks/sandbox.js";
import { checkPlaintextSecrets } from "./checks/secrets.js";
import { checkInstalledSkills } from "./checks/skills.js";
import { locateInstall } from "./locate.js";
import { redactSecrets } from "./redact.js";
import { computeScore, gradeFor, sortFindings, summarize } from "./score.js";
import { CLAWSCORE_VERSION, type Finding, type Report, type ScanOptions } from "./types.js";

export function scan(options: ScanOptions = {}): Report {
  const install = locateInstall(options.path);
  const findings: Finding[] = [
    ...checkAdvisories(install),
    ...checkGateway(install),
    ...checkPlaintextSecrets(install),
    ...checkSandboxAndExec(install),
    ...checkInstalledSkills(install),
    ...checkMessaging(install),
    ...checkPermissions(install),
  ].map(sanitizeFinding);

  const sorted = sortFindings(findings);
  const score = computeScore(sorted);
  return {
    tool: "clawscore",
    toolVersion: CLAWSCORE_VERSION,
    path: install.root,
    configPath: install.configPath,
    openclawVersion: install.version,
    score,
    grade: gradeFor(score),
    findings: sorted,
    summary: summarize(sorted),
  };
}

function sanitizeFinding(f: Finding): Finding {
  return {
    ...f,
    evidence: redactSecrets(f.evidence),
    fix: redactSecrets(f.fix),
    title: redactSecrets(f.title),
  };
}
