import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scan } from "../src/scan.js";
import { cleanup, copyFixture, runCli } from "./helpers.js";

const COMMENTED_JSON5 = `{
  // keep-me: operator note
  gateway: {
    bind: "lan", // public on purpose
    port: 18789,
    auth: {
      mode: "none",
    },
    controlUi: {
      allowedOrigins: ["*"],
    },
  },
  /* block comment stays */
  agents: { defaults: { workspace: "~/.openclaw/workspace" } },
}
`;

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
      expect(r.stdout).toMatch(/Restore: clawscore fix --restore /);
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


  it("loudly warns that the sender placeholder blocks all messages until replaced", () => {
    const dir = copyFixture("bad");
    try {
      const r = runCli(["fix", "--path", dir, "--yes"]);
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/WARNING: fix inserted the placeholder/);
      expect(r.stdout).toMatch(/ALL incoming messages are blocked until you replace it/);
    } finally {
      cleanup(dir);
    }
  });

  it("preserves JSON5 comments and untouched lines", () => {
    const dir = copyFixture("mixed");
    try {
      writeFileSync(join(dir, "openclaw.json"), COMMENTED_JSON5, "utf8");
      const r = runCli(["fix", "--path", dir, "--yes"]);
      expect(r.status).toBe(0);
      const after = readFileSync(join(dir, "openclaw.json"), "utf8");
      expect(after).toContain("// keep-me: operator note");
      expect(after).toContain("// public on purpose");
      expect(after).toContain("/* block comment stays */");
      const beforeLines = COMMENTED_JSON5.split("\n");
      const afterLines = after.split("\n");
      expect(afterLines.length).toBe(beforeLines.length);
      const targeted = /bind:|allowedOrigins:|mode:/;
      for (let i = 0; i < beforeLines.length; i += 1) {
        if (targeted.test(beforeLines[i]!) || targeted.test(afterLines[i] ?? "")) continue;
        expect(afterLines[i], `line ${i + 1} should be byte-identical`).toBe(beforeLines[i]);
      }
      expect(after).toMatch(/bind:\s*"loopback"/);
      expect(after).toMatch(/mode:\s*"token"/);
      expect(after).toContain("http://127.0.0.1:18789");
      expect(after).not.toMatch(/allowedOrigins:\s*\[\s*"\*"\s*\]/);
    } finally {
      cleanup(dir);
    }
  });

  it("fix --restore returns the config byte-identical to the original", () => {
    const dir = copyFixture("bad");
    try {
      const original = readFileSync(join(dir, "openclaw.json"), "utf8");
      const applied = runCli(["fix", "--path", dir, "--yes"]);
      expect(applied.status).toBe(0);
      expect(readFileSync(join(dir, "openclaw.json"), "utf8")).not.toBe(original);
      const stamps = readdirSync(join(dir, ".clawscore-backup"));
      const backupDir = join(dir, ".clawscore-backup", stamps[0]!);
      const restored = runCli(["fix", "--restore", backupDir, "--path", dir]);
      expect(restored.status).toBe(0);
      expect(readFileSync(join(dir, "openclaw.json"), "utf8")).toBe(original);
    } finally {
      cleanup(dir);
    }
  });

  it("refuses to apply if the backup cannot be written", () => {
    const dir = copyFixture("bad");
    try {
      const before = readFileSync(join(dir, "openclaw.json"), "utf8");
      writeFileSync(join(dir, ".clawscore-backup"), "not-a-directory\n", "utf8");
      const r = runCli(["fix", "--path", dir, "--yes"]);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toMatch(/refusing to apply fix: backup could not be written/);
      expect(readFileSync(join(dir, "openclaw.json"), "utf8")).toBe(before);
    } finally {
      cleanup(dir);
    }
  });
});
