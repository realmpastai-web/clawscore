import { describe, expect, it } from "vitest";
import { scanSkill, skillExitCode } from "../src/skill-scan.js";
import { fixture, runCli } from "./helpers.js";

describe("clawscore skill", () => {
  it("exits non-zero on fixtures/skills/evil with findings", () => {
    const r = runCli(["skill", fixture("skills/evil")]);
    expect(r.status).not.toBe(0);
    expect(r.stdout).toMatch(/skill-risky-pattern/);
    expect(r.stdout).toMatch(/\[REDACTED\]|ssh|\.env|postinstall|evil\.example/);
  });

  it("exits 0 on fixtures/skills/clean", () => {
    const r = runCli(["skill", fixture("skills/clean")]);
    expect(r.status).toBe(0);
    const result = scanSkill(fixture("skills/clean"));
    expect(result.findings).toEqual([]);
    expect(skillExitCode(result.findings)).toBe(0);
  });
});
