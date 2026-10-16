import { basename } from "node:path";
import { listSkillPackages } from "../locate.js";
import { scanSkill } from "../skill-scan.js";
import type { Finding, Install } from "../types.js";

export function checkInstalledSkills(install: Install): Finding[] {
  const findings: Finding[] = [];
  const pkgs = listSkillPackages(install.skillDirs);
  for (const dir of pkgs) {
    const result = scanSkill(dir);
    for (const f of result.findings) {
      findings.push({
        ...f,
        evidence: `installed skill ${basename(dir)}: ${f.evidence}`,
      });
    }
  }
  return findings;
}
