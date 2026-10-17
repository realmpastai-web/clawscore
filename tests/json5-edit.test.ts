import { describe, expect, it } from "vitest";
import { applyJson5Sets } from "../src/json5-edit.js";

describe("applyJson5Sets", () => {
  it("replaces only the targeted value", () => {
    const src = `{
  // stay
  bind: 'lan',
  port: 18789,
}`;
    const out = applyJson5Sets(src, [
      { path: ["bind"], value: "loopback", note: "bind", manual: "set bind" },
    ]);
    expect(out.skipped).toEqual([]);
    expect(out.text).toBe(`{
  // stay
  bind: 'loopback',
  port: 18789,
}`);
  });

  it("inserts a missing key without rewriting siblings", () => {
    const src = `{
  telegram: {
    dmPolicy: "open"
  }
}`;
    const out = applyJson5Sets(src, [
      {
        path: ["telegram", "allowFrom"],
        value: ["REPLACE_WITH_YOUR_SENDER_ID"],
        note: "allowFrom",
        manual: "set allowFrom",
      },
    ]);
    expect(out.skipped).toEqual([]);
    expect(out.text).toContain('dmPolicy: "open"');
    expect(out.text).toContain('allowFrom: ["REPLACE_WITH_YOUR_SENDER_ID"]');
  });
});
