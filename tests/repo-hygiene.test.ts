import { describe, expect, it } from "vitest";
import { walkTextFiles } from "../src/walk.js";
import { REPO } from "./helpers.js";

const FORBIDDEN = [
  /ghp_[a-zA-Z0-9]{20,}/,
  /github_pat_[a-zA-Z0-9_]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY-----/,
  /xox[baprs]-[0-9]{8,}/,
];

describe("repo hygiene", () => {
  it("contains no live-looking secrets", () => {
    const files = walkTextFiles(REPO).filter(
      (f) => !f.path.includes(`${"node_modules"}`) && !f.path.includes(`${"dist"}`),
    );
    const hits: string[] = [];
    for (const file of files) {
      if (file.path.endsWith("redact.ts") || file.path.endsWith("redact.test.ts")) continue;
      for (const re of FORBIDDEN) {
        if (re.test(file.text)) hits.push(`${file.path} ~ ${re}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
