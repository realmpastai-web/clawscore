/**
 * JSON5 subset used by OpenClaw (~/.openclaw/openclaw.json):
 * comments, unquoted keys, trailing commas, single-quoted strings.
 */
export function parseJson5(text: string): unknown {
  const json = json5ToJson(text);
  return JSON.parse(json) as unknown;
}

export function json5ToJson(src: string): string {
  let i = 0;
  let out = "";
  const n = src.length;

  const isIdentStart = (c: string | undefined): boolean =>
    !!c && /[A-Za-z_$]/.test(c);
  const isIdentPart = (c: string | undefined): boolean =>
    !!c && /[A-Za-z0-9_$]/.test(c);

  const skipBlockComment = (): void => {
    i += 2;
    while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
    i = Math.min(n, i + 2);
  };

  const skipLineComment = (): void => {
    i += 2;
    while (i < n && src[i] !== "\n") i += 1;
  };

  const nextSignificantIndex = (from: number): number => {
    let j = from;
    while (j < n) {
      const c = src[j];
      if (c === "/" && src[j + 1] === "/") {
        j += 2;
        while (j < n && src[j] !== "\n") j += 1;
        continue;
      }
      if (c === "/" && src[j + 1] === "*") {
        j += 2;
        while (j < n && !(src[j] === "*" && src[j + 1] === "/")) j += 1;
        j = Math.min(n, j + 2);
        continue;
      }
      if (c && /\s/.test(c)) {
        j += 1;
        continue;
      }
      break;
    }
    return j;
  };

  const readString = (quote: string): string => {
    i += 1;
    let raw = "";
    while (i < n) {
      const c = src[i];
      if (c === "\\") {
        raw += src[i] + (src[i + 1] ?? "");
        i += 2;
        continue;
      }
      if (c === quote) {
        i += 1;
        break;
      }
      raw += c;
      i += 1;
    }
    if (quote === "'") {
      const unescaped = raw.replace(/\\'/g, "'").replace(/"/g, '\\"');
      return `"${unescaped}"`;
    }
    return `"${raw}"`;
  };

  while (i < n) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") {
      skipLineComment();
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      skipBlockComment();
      continue;
    }
    if (c === '"' || c === "'") {
      out += readString(c);
      continue;
    }
    if (c === ",") {
      const j = nextSignificantIndex(i + 1);
      if (src[j] === "}" || src[j] === "]") {
        i += 1;
        continue;
      }
      out += c;
      i += 1;
      continue;
    }
    if (isIdentStart(c)) {
      const start = i;
      i += 1;
      while (isIdentPart(src[i])) i += 1;
      const ident = src.slice(start, i);
      const j = nextSignificantIndex(i);
      if (src[j] === ":") out += JSON.stringify(ident);
      else out += ident;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}
