import { describe, expect, it } from "vitest";
import { scan } from "../src/scan.js";
import { fixture } from "./helpers.js";

describe("scan fixtures", () => {
  it("scores fixtures/good at 90+ grade A", () => {
    const report = scan({ path: fixture("good") });
    expect(report.score).toBeGreaterThanOrEqual(90);
    expect(report.grade).toBe("A");
    expect(report.findings.map((f) => f.id)).not.toContain("gateway-public-bind");
    expect(report.findings.map((f) => f.id)).not.toContain("gateway-auth-token");
  });

  it("scores fixtures/bad below 50 as D or F and flags required issues", () => {
    const report = scan({ path: fixture("bad") });
    expect(report.score).toBeLessThan(50);
    expect(["D", "F"]).toContain(report.grade);
    const ids = report.findings.map((f) => f.id);
    expect(ids).toContain("gateway-public-bind");
    expect(ids).toContain("gateway-auth-token");
    expect(ids).toContain("plaintext-secret");
    expect(ids).toContain("skill-risky-pattern");
    expect(ids).toContain("file-permissions");
    const secret = report.findings.find((f) => f.id === "plaintext-secret")!;
    expect(secret.evidence).toMatch(/\[REDACTED\]/);
    expect(secret.evidence).not.toMatch(/fixture-openai-key-placeholder-value/);
  });

  it("scores fixtures/mixed between good and bad", () => {
    const report = scan({ path: fixture("mixed") });
    expect(report.score).toBeGreaterThan(50);
    expect(report.score).toBeLessThan(90);
    const ids = report.findings.map((f) => f.id);
    expect(ids).toContain("sandbox-disabled");
    expect(ids).not.toContain("gateway-public-bind");
  });

  it("flags both verified advisories on 2026.1.24", () => {
    const report = scan({ path: fixture("bad") });
    const ids = report.findings.map((f) => f.id);
    expect(ids).toContain("advisory-CVE-2026-25253");
    expect(ids).toContain("advisory-CVE-2026-24763");
  });

  it("does not flag those advisories on 2026.1.29", () => {
    const report = scan({ path: fixture("good") });
    const ids = report.findings.map((f) => f.id);
    expect(ids).not.toContain("advisory-CVE-2026-25253");
    expect(ids).not.toContain("advisory-CVE-2026-24763");
  });

  it("never calls fetch during an offline scan", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("network should not be used");
    }) as typeof fetch;
    try {
      scan({ path: fixture("good") });
      scan({ path: fixture("bad") });
    } finally {
      globalThis.fetch = orig;
    }
  });

});
