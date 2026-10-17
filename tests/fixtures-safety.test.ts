import { statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { walkTextFiles } from "../src/walk.js";
import { FIXTURES, REPO } from "./helpers.js";

describe("fixture safety", () => {
  it("marks fixture JavaScript as inert and never imported by tests", () => {
    const fixtureJs = walkTextFiles(FIXTURES).filter((f) => f.path.endsWith(".js"));
    expect(fixtureJs.length).toBeGreaterThan(0);
    for (const file of fixtureJs) {
      expect(file.text, file.path).toMatch(/INERT FIXTURE/);
      if (process.platform !== "win32") {
        const mode = statSync(file.path).mode & 0o111;
        expect(mode, `${file.path} must not be executable`).toBe(0);
      }
    }

    const tests = walkTextFiles(join(REPO, "tests"));
    for (const file of tests) {
      expect(file.text).not.toMatch(/from\s+['"][^'"]*fixtures[^'"]*\.js['"]/);
      expect(file.text).not.toMatch(/require\(\s*['"][^'"]*fixtures[^'"]*\.js['"]/);
      expect(file.text).not.toMatch(/import\(\s*['"][^'"]*fixtures[^'"]*\.js['"]/);
      expect(file.text).not.toMatch(/spawn(?:Sync)?\([^)]*fixtures[^)]*\.js/);
    }
  });

  it("uses example.* domains in malicious-looking fixtures", () => {
    const bait = walkTextFiles(join(FIXTURES, "bad", "skills")).concat(
      walkTextFiles(join(FIXTURES, "skills", "evil")),
    );
    const blob = bait.map((f) => f.text).join("\n");
    expect(blob).toMatch(/attacker\.example|evil\.example/);
    expect(blob).not.toMatch(/https?:\/\/(?!localhost)(?!127\.)[a-z0-9.-]+\.(com|net|org|io)\b/i);
  });
});
