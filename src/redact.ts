const KEY_HINT =
  /(api[_-]?key|auth(?:orization)?|secret|token|password|private[_-]?key|access[_-]?key|bot[_-]?token|app[_-]?token|client[_-]?secret|credential)/i;

/** Patterns that look like live credentials. Never printed. */
const VALUE_PATTERNS: RegExp[] = [
  /\bsk-[a-zA-Z0-9_-]{8,}\b/g,
  /\bxox[baprs]-[a-zA-Z0-9-]{8,}\b/g,
  /\bghp_[a-zA-Z0-9]{20,}\b/g,
  /\bgithub_pat_[a-zA-Z0-9_]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bAIza[0-9A-Za-z_-]{20,}\b/g,
  /\bBearer\s+[A-Za-z0-9._\-=]+/gi,
];

export const REDACTED = "[REDACTED]";

export function looksLikeSecretKey(key: string): boolean {
  return KEY_HINT.test(key);
}

export function redactSecrets(text: string): string {
  let out = text;
  for (const re of VALUE_PATTERNS) {
    out = out.replace(new RegExp(re.source, re.flags), REDACTED);
  }
  return out;
}

export function redactValue(): string {
  return REDACTED;
}

export function assertRedacted(text: string): void {
  for (const re of VALUE_PATTERNS) {
    const copy = new RegExp(re.source, re.flags);
    if (copy.test(text)) {
      throw new Error("refusing to emit a secret-looking value");
    }
  }
}
