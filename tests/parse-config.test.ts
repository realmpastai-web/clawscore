import { describe, expect, it } from "vitest";
import { parseJson5 } from "../src/parse-config.js";
import { compareVersions, isParseableVersion, versionInRange } from "../src/version-cmp.js";

describe("parseJson5", () => {
  it("parses OpenClaw-style JSON5", () => {
    const cfg = parseJson5(`
      {
        // gateway
        gateway: {
          bind: 'lan',
          auth: { mode: "none", },
        },
      }
    `);
    expect(cfg).toEqual({
      gateway: { bind: "lan", auth: { mode: "none" } },
    });
  });
});

describe("version ranges", () => {
  it("treats 2026.1.24 as affected and 2026.1.29 as fixed", () => {
    expect(versionInRange("2026.1.24", "<2026.1.29")).toBe(true);
    expect(versionInRange("2026.1.28", "<2026.1.29")).toBe(true);
    expect(versionInRange("2026.1.29", "<2026.1.29")).toBe(false);
    expect(versionInRange("v2026.1.29", "<2026.1.29")).toBe(false);
    expect(compareVersions("2026.1.24", "2026.1.29")).toBe(-1);
  });

  it("treats pre-calendar 0.x versions as inside <2026.1.29", () => {
    expect(isParseableVersion("0.9.0")).toBe(true);
    expect(isParseableVersion("v0.9.0")).toBe(true);
    expect(isParseableVersion("not-a-version")).toBe(false);
    expect(isParseableVersion("latest")).toBe(false);
    expect(versionInRange("0.9.0", "<2026.1.29")).toBe(true);
    expect(versionInRange("1.0.0", "<2026.1.29")).toBe(true);
  });
});
