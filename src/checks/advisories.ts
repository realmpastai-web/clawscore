import { loadAdvisories, severityFromAdvisory } from "../advisories.js";
import type { Finding, Install } from "../types.js";
import { isParseableVersion, versionInRange } from "../version-cmp.js";

function infoFinding(id: string, title: string, evidence: string): Finding {
  return {
    id,
    title,
    severity: "info",
    weight: 0,
    evidence,
    fix: "No action required. Informational only.",
  };
}

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
  const version = install.version.trim();
  if (version.endsWith("-fixture")) {
    findings.push(
      infoFinding(
        "advisory-skipped",
        "Advisory check skipped",
        "advisory check skipped: fixture version",
      ),
    );
    return findings;
  }
  if (!isParseableVersion(version)) {
    findings.push(
      infoFinding(
        "version-unparsed",
        "OpenClaw version could not be parsed",
        `Version ${version} could not be parsed for advisory matching`,
      ),
    );
    return findings;
  }
  for (const adv of advisories) {
    if (!versionInRange(version, adv.affected)) continue;
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
