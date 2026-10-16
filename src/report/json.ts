import { redactSecrets } from "../redact.js";
import type { Report } from "../types.js";

export function formatJson(report: Report): string {
  const text = `${JSON.stringify(report, null, 2)}\n`;
  return redactSecrets(text);
}
