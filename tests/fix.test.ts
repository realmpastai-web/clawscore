import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scan } from "../src/scan.js";
import { cleanup, copyFixture, runCli } from "./helpers.js";

describe("clawscore fix", () => {
  it("without --yes changes nothing", () => {
    const dir = copyFixture("bad");
    try {
      const before = readFileSync(join(dir, "openclaw.json"), "utf8");
      const r = runCli(["fix", "--path", dir]);
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/Dry run/);
      expect(existsSync(join(dir, ".clawscore-backup"))).toBe(false);
      expect(readFileSync(join(dir, "openclaw.json"), "utf8")).toBe(before);
    } finally {
      cleanup(dir);
    }
  });

  it("with --yes backs up, hardens, and improves the score", () => {
    const dir = copyFixture("bad");
    try {
      const before = scan({ path: dir });
      const r = runCli(["fix", "--path", dir, "--yes"]);
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/Backup:/);
      expect(existsSync(join(dir, ".clawscore-backup"))).toBe(true);
      const stamps = readdirSync(join(dir, ".clawscore-backup"));
      expect(stamps.length).toBeGreaterThan(0);
      const bak = join(dir, ".clawscore-backup", stamps[0]!, "openclaw.json");
      expect(existsSync(bak)).toBe(true);

      const cfg = JSON.parse(readFileSync(join(dir, "openclaw.json"), "utf8")) as {
        gateway: { bind: string };
        channels: { telegram: { dmPolicy: string; allowFrom: string[] } };
      };
      expect(cfg.gateway.bind).toBe("loopback");
      expect(cfg.channels.telegram.dmPolicy).toBe("allowlist");
      expect(cfg.channels.telegram.allowFrom).toContain("REPLACE_WITH_YOUR_SENDER_ID");
      expect(cfg.channels.telegram.allowFrom).not.toContain("*");

      if (process.platform !== "win32") {
        const mode = statSync(join(dir, "openclaw.json")).mode & 0o777;
        expect(mode).toBe(0o600);
      }

      const after = scan({ path: dir });
      expect(after.score).toBeGreaterThan(before.score);
      expect(after.findings.some((f) => f.id === "gateway-public-bind")).toBe(false);
      expect(after.findings.some((f) => f.id === "skill-risky-pattern")).toBe(true);
    } finally {
      cleanup(dir);
    }
  });
});
