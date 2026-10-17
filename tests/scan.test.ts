import { chmodSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scan } from "../src/scan.js";
import { cleanup, fixture, runCli } from "./helpers.js";

function withEmptyPath<T>(fn: () => T): T {
  const orig = process.env.PATH;
  process.env.PATH = "";
  try {
    return fn();
  } finally {
    process.env.PATH = orig;
  }
}

function artifactHighIds(report: { findings: { id: string; severity: string }[] }): string[] {
  return report.findings.filter((f) => f.id.startsWith("artifact-") && f.severity === "high").map((f) => f.id);
}

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


  it("flags artifact CVE patterns in a vulnerable shipped build (version-agnostic)", () => {
    const report = scan({ path: fixture("artifact-vuln"), packagePath: fixture("artifact-vuln") });
    const ids = report.findings.map((f) => f.id);
    expect(ids).toContain("artifact-gatewayurl-exfil");
    expect(ids).toContain("artifact-exec-path-injection");
  });

  it("does not flag artifact CVE patterns in a patched shipped build", () => {
    const report = scan({ path: fixture("artifact-patched"), packagePath: fixture("artifact-patched") });
    const ids = report.findings.map((f) => f.id);
    expect(ids).not.toContain("artifact-gatewayurl-exfil");
    expect(ids).not.toContain("artifact-exec-path-injection");
  });

  it("flags official lan bind and legacy 0.0.0.0 bind", () => {
    const lan = scan({ path: fixture("bad") });
    expect(lan.findings.some((f) => f.id === "gateway-public-bind")).toBe(true);
    expect(lan.findings.find((f) => f.id === "gateway-public-bind")!.evidence).toMatch(/"lan"/);

    const dir = mkdtempSync(join(tmpdir(), "clawscore-legacy-bind-"));
    try {
      writeFileSync(
        join(dir, "openclaw.json"),
        JSON.stringify({
          gateway: { bind: "0.0.0.0", auth: { mode: "token", token: "oc_gw_fixture_token_not_a_secret_cc" } },
        }),
        "utf8",
      );
      writeFileSync(join(dir, "VERSION"), "2026.1.29\n", "utf8");
      const report = scan({ path: dir });
      expect(report.findings.some((f) => f.id === "gateway-public-bind")).toBe(true);
    } finally {
      cleanup(dir);
    }
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

  it("flags both artifact ids on real-layout with --package-path", () => {
    const report = scan({
      path: fixture("real-layout/state"),
      packagePath: fixture("real-layout/pkg/openclaw"),
    });
    const ids = report.findings.map((f) => f.id);
    expect(ids).toContain("artifact-gatewayurl-exfil");
    expect(ids).toContain("artifact-exec-path-injection");
    const info = report.findings.find((f) => f.id === "artifact-scan");
    expect(info?.severity).toBe("info");
    expect(info?.weight).toBe(0);
    expect(info?.evidence).toMatch(/^artifact scan: ran on /);
    const r1 = report.findings.find((f) => f.id === "artifact-gatewayurl-exfil")!;
    expect(r1.evidence.startsWith("Heuristic pattern match:")).toBe(true);

    const cli = runCli([
      "scan",
      "--path",
      fixture("real-layout/state"),
      "--package-path",
      fixture("real-layout/pkg/openclaw"),
      "--json",
    ]);
    expect(cli.status).toBe(0);
    const json = JSON.parse(cli.stdout) as { findings: { id: string }[] };
    expect(json.findings.map((f) => f.id)).toContain("artifact-gatewayurl-exfil");
    expect(json.findings.map((f) => f.id)).toContain("artifact-exec-path-injection");
  });

  it("skips artifact highs on real-layout without --package-path when openclaw is not on PATH", () => {
    const report = withEmptyPath(() => scan({ path: fixture("real-layout/state") }));
    expect(artifactHighIds(report)).toEqual([]);
    const skipped = report.findings.filter((f) => f.severity === "info" && /skipped/.test(f.evidence));
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.evidence).toContain(
      "artifact scan: skipped, OpenClaw package not found (use --package-path)",
    );
    expect(skipped[0]!.weight).toBe(0);
  });

  it("still flags R2 when resolvedPath appears only in an unrelated file", () => {
    const report = scan({
      path: fixture("artifact-r2-unrelated"),
      packagePath: fixture("artifact-r2-unrelated"),
    });
    expect(report.findings.map((f) => f.id)).toContain("artifact-exec-path-injection");
  });

  it("terminates on a symlink loop in dist/ without throwing", () => {
    const dist = fixture("artifact-symlink-loop/dist");
    try {
      symlinkSync("cycle-b", join(dist, "cycle-a"));
      symlinkSync("cycle-a", join(dist, "cycle-b"));
      symlinkSync(".", join(dist, "self"));
    } catch {
      // already created
    }
    expect(() =>
      scan({
        path: fixture("artifact-symlink-loop"),
        packagePath: fixture("artifact-symlink-loop"),
      }),
    ).not.toThrow();
    const report = scan({
      path: fixture("artifact-symlink-loop"),
      packagePath: fixture("artifact-symlink-loop"),
    });
    expect(report.findings.some((f) => f.id === "artifact-scan")).toBe(true);
  });

  it("deducts each CVE once when version advisory and artifact both match", () => {
    const report = scan({
      path: fixture("artifact-double-cve"),
      packagePath: fixture("artifact-double-cve"),
    });
    const ids = report.findings.map((f) => f.id);
    expect(ids).toContain("advisory-CVE-2026-25253");
    expect(ids).toContain("advisory-CVE-2026-24763");
    expect(ids).not.toContain("artifact-gatewayurl-exfil");
    expect(ids).not.toContain("artifact-exec-path-injection");
    const cve = report.findings.filter(
      (f) =>
        f.id === "advisory-CVE-2026-25253" ||
        f.id === "advisory-CVE-2026-24763" ||
        f.id === "artifact-gatewayurl-exfil" ||
        f.id === "artifact-exec-path-injection",
    );
    expect(cve).toHaveLength(2);
    expect(cve.reduce((s, f) => s + f.weight, 0)).toBe(12);
    const adv = report.findings.find((f) => f.id === "advisory-CVE-2026-25253")!;
    expect(adv.evidence).toMatch(/Heuristic pattern match:/);
  });

  it("artifact-patched still yields no artifact high findings", () => {
    const report = scan({
      path: fixture("artifact-patched"),
      packagePath: fixture("artifact-patched"),
    });
    expect(artifactHighIds(report)).toEqual([]);
    expect(report.findings.map((f) => f.id)).not.toContain("artifact-gatewayurl-exfil");
    expect(report.findings.map((f) => f.id)).not.toContain("artifact-exec-path-injection");
  });

  it("finds the package via the openclaw binary on PATH", () => {
    const root = mkdtempSync(join(tmpdir(), "clawscore-path-pkg-"));
    try {
      const state = join(root, "state");
      const pkg = join(root, "pkg", "openclaw");
      const bin = join(root, "bin");
      mkdirSync(state, { recursive: true });
      mkdirSync(join(pkg, "dist", "control-ui", "assets"), { recursive: true });
      mkdirSync(join(pkg, "dist", "infra"), { recursive: true });
      mkdirSync(bin, { recursive: true });
      writeFileSync(
        join(state, "openclaw.json"),
        JSON.stringify({
          gateway: { bind: "loopback", auth: { mode: "token", token: "oc_gw_fixture_token_not_a_secret_ii" } },
        }),
        "utf8",
      );
      writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "openclaw", version: "0.0.0-fixture" }), "utf8");
      writeFileSync(
        join(pkg, "openclaw.mjs"),
        "// INERT FIXTURE\nexport {}\n",
        "utf8",
      );
      writeFileSync(
        join(pkg, "dist", "control-ui", "assets", "index-fixture.js"),
        '// INERT FIXTURE — synthetic clawscore test data, NOT real OpenClaw code, never executed.\nfunction boot(params){var l=params.get("gatewayUrl");if(l){connect({gatewayUrl:l,token:store.token})}params.delete("gatewayUrl")}\n',
        "utf8",
      );
      writeFileSync(
        join(pkg, "dist", "infra", "exec-approvals-fixture.js"),
        "// INERT FIXTURE — synthetic clawscore test data, NOT real OpenClaw code, never executed.\nfunction execApproval(cmd){if(allowlist.has(cmd.name)){return runExec(cmd)}return deny()}\n",
        "utf8",
      );
      const binPath = join(bin, "openclaw");
      symlinkSync(join(pkg, "openclaw.mjs"), binPath);
      chmodSync(binPath, 0o755);
      const orig = process.env.PATH;
      process.env.PATH = bin;
      try {
        const report = scan({ path: state });
        const ids = report.findings.map((f) => f.id);
        expect(ids).toContain("artifact-gatewayurl-exfil");
        expect(ids).toContain("artifact-exec-path-injection");
      } finally {
        process.env.PATH = orig;
      }
    } finally {
      cleanup(root);
    }
  });

});
