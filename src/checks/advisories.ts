import { loadAdvisories, severityFromAdvisory } from "../advisories.js";
import type { Finding, Install } from "../types.js";
import { versionInRange } from "../version-cmp.js";

export function checkAdvisories(install: Install): Finding[] {
  const findings: Finding[] = [];
  const advisories = loadAdvisories();
  if (!install.version) {
    findings.push({
      id: "version-unknown",
      title: "OpenClaw version could not be determined",
      severity: "info",
      weight: 2,
      evidence: `No VERSION, version file, or package.json version under ${install.root}`,
      fix: "Record the installed OpenClaw version in a VERSION file at the install root (for example 2026.1.29).",
    });
    return findings;
  }
  for (const adv of advisories) {
    if (!versionInRange(install.version, adv.affected)) continue;
    findings.push({
      id: `advisory-${adv.id}`,
      title: `${adv.id} matches installed version`,
      severity: severityFromAdvisory(adv.severity),
      weight: adv.severity === "critical" ? 8 : 6,
      evidence: `OpenClaw ${install.version} is in affected range ${adv.affected} (${adv.summary ?? adv.id}). Source: ${adv.source}`,
      fix: `Upgrade OpenClaw to ${adv.fixed} or later. See ${adv.source}`,
    });
  }
  return findings;
}
