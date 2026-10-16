#!/usr/bin/env node
import { chmodSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function walkFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkFiles(p, out);
    else if (st.isFile()) out.push(p);
  }
  return out;
}

function chmodTree(dir, mode, predicate) {
  if (process.platform === "win32") return;
  for (const file of walkFiles(dir)) {
    if (predicate(file)) {
      try {
        chmodSync(file, mode);
      } catch {
        // ignore
      }
    }
  }
}

const sensitive = (file) =>
  /openclaw\.json5?$|credentials|\.pem$|\.key$|auth-profiles/i.test(file);

chmodTree(join(root, "fixtures", "good"), 0o600, sensitive);
chmodTree(join(root, "fixtures", "mixed"), 0o600, sensitive);
chmodTree(join(root, "fixtures", "bad"), 0o666, sensitive);

console.log("fixture permissions applied");
