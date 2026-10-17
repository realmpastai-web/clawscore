/**
 * Minimal in-place JSON5 edits. Replaces or inserts a single value span so
 * comments, quotes, commas, and unrelated formatting stay byte-identical.
 */

export interface Json5Set {
  path: string[];
  value: unknown;
  note: string;
  manual: string;
}

export interface Json5EditApplied {
  path: string[];
  note: string;
}

export interface Json5EditSkipped {
  path: string[];
  reason: string;
  manual: string;
}

export interface Json5EditResult {
  text: string;
  applied: Json5EditApplied[];
  skipped: Json5EditSkipped[];
}

interface Property {
  path: string[];
  keyStart: number;
  valueStart: number;
  valueEnd: number;
}

interface ObjectSpan {
  path: string[];
  open: number;
  close: number;
}

interface Index {
  props: Property[];
  objects: ObjectSpan[];
}

export function applyJson5Sets(text: string, sets: Json5Set[]): Json5EditResult {
  const applied: Json5EditApplied[] = [];
  const skipped: Json5EditSkipped[] = [];
  let next = text;
  for (const s of sets) {
    const idx = indexJson5(next);
    if (!idx) {
      skipped.push({
        path: s.path,
        reason: "could not parse JSON5 for a safe in-place edit",
        manual: s.manual,
      });
      continue;
    }
    const matches = idx.props.filter((p) => samePath(p.path, s.path));
    if (matches.length > 1) {
      skipped.push({
        path: s.path,
        reason: "duplicate key; refusing to guess which value to change",
        manual: s.manual,
      });
      continue;
    }
    if (matches.length === 1) {
      const prop = matches[0]!;
      const quote = next[prop.valueStart] === "'" ? "'" : '"';
      const encoded = encodeJson5Value(s.value, quote);
      next = next.slice(0, prop.valueStart) + encoded + next.slice(prop.valueEnd);
      applied.push({ path: s.path, note: s.note });
      continue;
    }
    const inserted = insertProperty(next, idx, s);
    if (inserted) {
      next = inserted;
      applied.push({ path: s.path, note: s.note });
    } else {
      skipped.push({
        path: s.path,
        reason: "key missing and could not be inserted safely",
        manual: s.manual,
      });
    }
  }
  return { text: next, applied, skipped };
}

export function encodeJson5Value(value: unknown, preferQuote: '"' | "'" = '"'): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "string") {
    if (preferQuote === "'") return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => encodeJson5Value(v, '"')).join(", ")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${encodeJson5Value(v)}`).join(", ")} }`;
  }
  return "null";
}

function samePath(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function insertProperty(text: string, idx: Index, set: Json5Set): string | null {
  if (set.path.length === 0) return null;
  const parentPath = set.path.slice(0, -1);
  const key = set.path[set.path.length - 1]!;
  const parent = idx.objects.find((o) => samePath(o.path, parentPath));
  if (!parent) return null;
  const children = idx.props.filter(
    (p) => p.path.length === set.path.length && samePath(p.path.slice(0, -1), parentPath),
  );
  const indent = inferIndent(text, parent, children);
  const keyText = inferKeyText(text, children, key);
  const encoded = encodeJson5Value(set.value, '"');
  const line = `${keyText}: ${encoded}`;
  if (children.length === 0) {
    const inner = `\n${indent}${line}\n${indent.slice(0, Math.max(0, indent.length - 2))}`;
    return text.slice(0, parent.open + 1) + inner + text.slice(parent.close);
  }
  const last = children.reduce((a, b) => (a.valueEnd > b.valueEnd ? a : b));
  const afterValue = skipWsComments(text, last.valueEnd);
  if (text[afterValue] === ",") {
    const insertion = `\n${indent}${line}`;
    return text.slice(0, afterValue + 1) + insertion + text.slice(afterValue + 1);
  }
  const insertion = `,\n${indent}${line}`;
  return text.slice(0, last.valueEnd) + insertion + text.slice(last.valueEnd);
}

function inferIndent(text: string, parent: ObjectSpan, children: Property[]): string {
  if (children.length > 0) {
    const first = children.reduce((a, b) => (a.keyStart < b.keyStart ? a : b));
    const lineStart = text.lastIndexOf("\n", first.keyStart - 1) + 1;
    const raw = text.slice(lineStart, first.keyStart);
    if (/^[ \t]*$/.test(raw) && raw.length > 0) return raw;
  }
  const lineStart = text.lastIndexOf("\n", parent.open) + 1;
  const parentIndent = text.slice(lineStart, parent.open);
  const base = /^[ \t]*$/.test(parentIndent) ? parentIndent : "";
  return `${base}  `;
}

function inferKeyText(text: string, children: Property[], key: string): string {
  if (children.length > 0) {
    const sample = children[0]!;
    const c = text[sample.keyStart];
    if (c === '"') return JSON.stringify(key);
    if (c === "'") return `'${key.replace(/'/g, "\\'")}'`;
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) return key;
    return JSON.stringify(key);
  }
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) return key;
  return JSON.stringify(key);
}

export function indexJson5(src: string): Index | null {
  try {
    const props: Property[] = [];
    const objects: ObjectSpan[] = [];
    let i = skipWsComments(src, 0);
    if (src[i] !== "{") return null;
    const end = walkObject(src, i, [], props, objects);
    if (end < 0) return null;
    return { props, objects };
  } catch {
    return null;
  }
}

function walkObject(
  src: string,
  open: number,
  path: string[],
  props: Property[],
  objects: ObjectSpan[],
): number {
  let i = open + 1;
  while (i < src.length) {
    i = skipWsComments(src, i);
    if (i >= src.length) return -1;
    if (src[i] === "}") {
      objects.push({ path, open, close: i });
      return i + 1;
    }
    if (src[i] === ",") {
      i += 1;
      continue;
    }
    const keyStart = i;
    const keyTok = readKey(src, i);
    if (!keyTok) return -1;
    i = skipWsComments(src, keyTok.end);
    if (src[i] !== ":") return -1;
    i = skipWsComments(src, i + 1);
    const valueStart = i;
    const valueEnd = skipValue(src, i, [...path, keyTok.key], props, objects);
    if (valueEnd < 0) return -1;
    props.push({ path: [...path, keyTok.key], keyStart, valueStart, valueEnd });
    i = valueEnd;
  }
  return -1;
}

function walkArray(
  src: string,
  open: number,
  path: string[],
  props: Property[],
  objects: ObjectSpan[],
): number {
  let i = open + 1;
  let n = 0;
  while (i < src.length) {
    i = skipWsComments(src, i);
    if (i >= src.length) return -1;
    if (src[i] === "]") return i + 1;
    if (src[i] === ",") {
      i += 1;
      continue;
    }
    const valueEnd = skipValue(src, i, [...path, String(n)], props, objects);
    if (valueEnd < 0) return -1;
    i = valueEnd;
    n += 1;
  }
  return -1;
}

function skipValue(
  src: string,
  i: number,
  path: string[],
  props: Property[],
  objects: ObjectSpan[],
): number {
  const c = src[i];
  if (c === '"' || c === "'") {
    const s = readString(src, i);
    return s ? s.end : -1;
  }
  if (c === "{") return walkObject(src, i, path, props, objects);
  if (c === "[") return walkArray(src, i, path, props, objects);
  if (c === undefined) return -1;
  // atom: number, true/false/null, ident
  let j = i;
  if (src[j] === "+" || src[j] === "-") j += 1;
  while (j < src.length) {
    const ch = src[j]!;
    if (ch === "," || ch === "}" || ch === "]" || /\s/.test(ch)) break;
    if (ch === "/" && (src[j + 1] === "/" || src[j + 1] === "*")) break;
    j += 1;
  }
  return j > i ? j : -1;
}

function readKey(src: string, i: number): { key: string; end: number } | null {
  const c = src[i];
  if (c === '"' || c === "'") {
    const s = readString(src, i);
    return s ? { key: s.value, end: s.end } : null;
  }
  if (c && /[A-Za-z_$]/.test(c)) {
    let j = i + 1;
    while (j < src.length && /[A-Za-z0-9_$]/.test(src[j]!)) j += 1;
    return { key: src.slice(i, j), end: j };
  }
  return null;
}

function readString(src: string, i: number): { value: string; end: number } | null {
  const quote = src[i];
  if (quote !== '"' && quote !== "'") return null;
  let j = i + 1;
  let value = "";
  while (j < src.length) {
    const c = src[j];
    if (c === "\\") {
      value += src[j + 1] ?? "";
      j += 2;
      continue;
    }
    if (c === quote) return { value, end: j + 1 };
    value += c;
    j += 1;
  }
  return null;
}

function skipWsComments(src: string, from: number): number {
  let i = from;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c && /\s/.test(c)) {
      i += 1;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      i += 2;
      while (i < n && src[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      i = Math.min(n, i + 2);
      continue;
    }
    break;
  }
  return i;
}
