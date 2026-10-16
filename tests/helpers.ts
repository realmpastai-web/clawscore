import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export const REPO = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const CLI = join(REPO, "dist", "cli.js");
export const FIXTURES = join(REPO, "fixtures");

export function fixture(name: string): string {
  return join(FIXTURES, name);
}

export function runCli(args: string[]): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    cwd: REPO,
    env: { ...process.env, NO_COLOR: "1" },
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

export function copyFixture(name: string): string {
  const dest = mkdtempSync(join(tmpdir(), `clawscore-${name}-`));
  cpSync(fixture(name), dest, { recursive: true });
  return dest;
}

export function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}
