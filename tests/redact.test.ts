import { describe, expect, it } from "vitest";
import { assertRedacted, redactSecrets } from "../src/redact.js";
import { scan } from "../src/scan.js";
import { formatJson } from "../src/report/json.js";
import { formatTerminal } from "../src/report/terminal.js";
import { fixture } from "./helpers.js";

describe("redaction", () => {
  it("strips secret-looking tokens from text", () => {
    const text = redactSecrets("token ghp_abcdefghijklmnopqrstuvwxyz123456 header");
    expect(text).toContain("[REDACTED]");
    expect(text).not.toMatch(/ghp_/);
    expect(() => assertRedacted(text)).not.toThrow();
  });

  it("never prints fixture secret values in reports", () => {
    const report = scan({ path: fixture("bad") });
    const blob = formatTerminal(report) + formatJson(report);
    expect(blob).not.toContain("fixture-openai-key-placeholder-value");
    expect(blob).not.toContain("discord-bot-token-placeholder-value");
    expect(blob).not.toContain("fixture-anthropic-key-placeholder-value");
    expect(blob).toMatch(/\[REDACTED\]/);
  });
});
