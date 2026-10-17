import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isAdvisory, loadAdvisories, updateAdvisories } from "../src/advisories.js";

describe("advisories", () => {
  it("ships verified CVE entries with source URLs", () => {
    const list = loadAdvisories();
    const ids = list.map((a) => a.id);
    expect(ids).toContain("CVE-2026-25253");
    expect(ids).toContain("CVE-2026-24763");
    for (const a of list) {
      expect(isAdvisory(a)).toBe(true);
      expect(a.source).toMatch(/^https:\/\/(github\.com\/advisories|nvd\.nist\.gov|github\.com\/openclaw)/);
    }
  });

  it("updateAdvisories writes only after a successful fetch", async () => {
    const dir = mkdtempSync(join(tmpdir(), "clawscore-adv-"));
    const dest = join(dir, "advisories.json");
    const payload = {
      advisories: [
        {
          id: "CVE-2026-25253",
          affected: "<2026.1.29",
          fixed: "2026.1.29",
          severity: "high",
          source: "https://github.com/advisories/GHSA-g8p2-7wf7-98mq",
        },
      ],
    };
    const result = await updateAdvisories({
      dest,
      url: "https://example.test/advisories.json",
      fetchImpl: async () =>
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });
    expect(result.count).toBe(1);
    expect(JSON.parse(readFileSync(dest, "utf8")).advisories[0].id).toBe("CVE-2026-25253");
  });

  it("refuses to write an empty update", async () => {
    const dest = join(mkdtempSync(join(tmpdir(), "clawscore-adv-")), "advisories.json");
    writeFileSync(dest, "{}\n");
    await expect(
      updateAdvisories({
        dest,
        fetchImpl: async () => new Response("{}", { status: 200 }),
      }),
    ).rejects.toThrow(/advisories/);
  });
});
