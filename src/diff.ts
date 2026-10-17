export function unifiedDiff(oldText: string, newText: string, filename: string): string {
  if (oldText === newText) return "";
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const ops = diffOps(a, b);
  const lines = [`--- a/${filename}`, `+++ b/${filename}`, `@@ -1,${a.length} +1,${b.length} @@`];
  for (const op of ops) {
    if (op.type === "eq") lines.push(` ${op.line}`);
    else if (op.type === "del") lines.push(`-${op.line}`);
    else lines.push(`+${op.line}`);
  }
  return lines.join("\n");
}

type Op = { type: "eq" | "del" | "add"; line: string };

function diffOps(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "eq", line: a[i]! });
      i += 1;
      j += 1;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      ops.push({ type: "del", line: a[i]! });
      i += 1;
    } else {
      ops.push({ type: "add", line: b[j]! });
      j += 1;
    }
  }
  while (i < n) {
    ops.push({ type: "del", line: a[i]! });
    i += 1;
  }
  while (j < m) {
    ops.push({ type: "add", line: b[j]! });
    j += 1;
  }
  return ops;
}
