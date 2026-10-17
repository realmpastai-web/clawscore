import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateAgainstSchema } from "../src/schema-validate.js";
import { schemaPath } from "../src/paths.js";
import { fixture, REPO, runCli } from "./helpers.js";

const schema = JSON.parse(readFileSync(schemaPath(REPO), "utf8")) as unknown;

describe("CLI", () => {
  it("prints help", () => {
    const r = runCli(["--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/clawscore/);
    expect(r.stdout).toMatch(/--path/);
  });

  it("prints version", () => {
    const r = runCli(["--version"]);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe("0.1.0");
  });

  it("scans fixtures/good at 90+ grade A", () => {
    const r = runCli(["--path", fixture("good")]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/SCORE\s+(9\d|100)\/100/);
    expect(r.stdout).toMatch(/GRADE A/);
  });

  it("scans fixtures/bad below 50 and flags required issues", () => {
    const r = runCli(["--path", fixture("bad")]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/SCORE\s+\d+\/100/);
    expect(r.stdout).toMatch(/GRADE [DF]/);
    expect(r.stdout).toMatch(/gateway-public-bind/);
    expect(r.stdout).toMatch(/gateway-auth-token/);
    expect(r.stdout).toMatch(/plaintext-secret/);
    expect(r.stdout).toMatch(/skill-risky-pattern/);
    expect(r.stdout).toMatch(/file-permissions/);
    expect(r.stdout).toMatch(/−\d+ pts/);
    expect(r.stdout).toMatch(/100 − /);
    expect(r.stdout).toMatch(/\[REDACTED\]/);
    expect(r.stdout).not.toMatch(/fixture-openai-key-placeholder-value/);
    expect(r.stdout).not.toMatch(/discord-bot-token-placeholder-value/);
  });

  it("emits JSON that matches the bundled schema", () => {
    const r = runCli(["--path", fixture("bad"), "--json"]);
    expect(r.status).toBe(0);
    const report = JSON.parse(r.stdout) as unknown;
    const errors = validateAgainstSchema(report, schema);
    expect(errors).toEqual([]);
  });

  it("writes a valid SVG badge", () => {
    const out = join(REPO, "test-output.svg");
    try {
      const r = runCli(["--path", fixture("good"), "--badge", out, "--json"]);
      expect(r.status).toBe(0);
      expect(existsSync(out)).toBe(true);
      const svg = readFileSync(out, "utf8");
      expect(svg).toMatch(/<svg\b/);
      expect(svg).toMatch(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
      expect(svg).toMatch(/<\/svg>/);
      expect(svg).toMatch(/clawscore/);
    } finally {
      if (existsSync(out)) unlinkSync(out);
    }
  });

  it("markdown report is shareable", () => {
    const r = runCli(["--path", fixture("good"), "--markdown"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^# clawscore report/m);
    expect(r.stdout).toMatch(/\*\*Score:\*\*/);
    expect(r.stdout).toMatch(/\*\*Score math:\*\*/);
  });
});
