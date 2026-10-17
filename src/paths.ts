import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function findPackageRoot(start?: string): string {
  let dir = start ?? dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: string };
        if (pkg.name === "clawscore") return dir;
      } catch {
        // keep walking
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return start ?? dirname(fileURLToPath(import.meta.url));
    dir = parent;
  }
}

export function advisoriesPath(root = findPackageRoot()): string {
  return join(root, "data", "advisories.json");
}

export function schemaPath(root = findPackageRoot()): string {
  return join(root, "schemas", "report.schema.json");
}
