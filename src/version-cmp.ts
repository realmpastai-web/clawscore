/** OpenClaw uses calendar versions like 2026.1.29 (optional leading v, optional -pre). */

export function normalizeVersion(raw: string): string {
  return raw.trim().replace(/^v/i, "").split(/[-+]/)[0] ?? raw.trim();
}

export function compareVersions(a: string, b: string): number {
  const pa = normalizeVersion(a)
    .split(".")
    .map((p) => Number.parseInt(p, 10) || 0);
  const pb = normalizeVersion(b)
    .split(".")
    .map((p) => Number.parseInt(p, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** Range forms: <1.2.3, <=1.2.3, >1.2.3, >=1.2.3, =1.2.3 */
export function versionInRange(version: string, range: string): boolean {
  const trimmed = range.trim();
  const match = /^(<=|<|>=|>|=)\s*(.+)$/.exec(trimmed);
  if (!match) {
    return compareVersions(version, trimmed) === 0;
  }
  const op = match[1]!;
  const bound = match[2]!;
  const cmp = compareVersions(version, bound);
  switch (op) {
    case "<":
      return cmp < 0;
    case "<=":
      return cmp <= 0;
    case ">":
      return cmp > 0;
    case ">=":
      return cmp >= 0;
    default:
      return cmp === 0;
  }
}
