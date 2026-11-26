// `dh migrate <file> [--write]` (lane core2): rewrite a page's animation blocks to format 12 (parse/migrate.ts) and print
// the diff. It never writes without --write. The command is a function of its arguments and an io object, so a test
// reads it without files; scripts/migrate.ts is the thin runner (`bun scripts/migrate.ts <file> [--write]`), and the
// `dh` tool calls `migrateCommand` the same way.
import { migrate } from "./migrate";

export interface MigrateIo { read(path: string): string; write(path: string, text: string): void; out(s: string): void; err(s: string): void }

const USAGE = "usage: dh migrate <file> [--write]   (prints the diff; writes the file only with --write)";

/** a unified diff of two texts (3 lines of context); the middle between the common start and end is compared by LCS */
export function unifiedDiff(a: string, b: string, name: string): string {
  if (a === b) return "";
  const A = a.split("\n"), B = b.split("\n");
  let s = 0; while (s < A.length && s < B.length && A[s] === B[s]) s++;
  let e = 0; while (e < A.length - s && e < B.length - s && A[A.length - 1 - e] === B[B.length - 1 - e]) e++;
  const a2 = A.slice(s, A.length - e), b2 = B.slice(s, B.length - e);
  type Op = [" " | "-" | "+", string];
  const ops: Op[] = A.slice(0, s).map((x) => [" ", x] as Op);
  if (a2.length * b2.length > 4_000_000) { for (const x of a2) ops.push(["-", x]); for (const x of b2) ops.push(["+", x]); }
  else {
    const n = a2.length, m = b2.length, W = m + 1, L = new Uint32Array((n + 1) * W);
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i * W + j] = a2[i] === b2[j] ? L[(i + 1) * W + j + 1] + 1 : Math.max(L[(i + 1) * W + j], L[i * W + j + 1]);
    let i = 0, j = 0;
    while (i < n && j < m) { if (a2[i] === b2[j]) { ops.push([" ", a2[i]]); i++; j++; } else if (L[(i + 1) * W + j] >= L[i * W + j + 1]) ops.push(["-", a2[i++]]); else ops.push(["+", b2[j++]]); }
    while (i < n) ops.push(["-", a2[i++]]); while (j < m) ops.push(["+", b2[j++]]);
  }
  for (const x of A.slice(A.length - e)) ops.push([" ", x]);
  const CTX = 3, out = [`--- ${name}`, `+++ ${name} (format 12)`];
  const keep = ops.map(([k], i) => k !== " " || ops.slice(Math.max(0, i - CTX), i + CTX + 1).some(([q]) => q !== " "));
  let ai = 0, bi = 0;
  for (let i = 0; i < ops.length;) {
    if (!keep[i]) { if (ops[i][0] !== "+") ai++; if (ops[i][0] !== "-") bi++; i++; continue; }
    let j = i; while (j < ops.length && keep[j]) j++;
    const hunk = ops.slice(i, j), da = hunk.filter(([k]) => k !== "+").length, db = hunk.filter(([k]) => k !== "-").length;
    out.push(`@@ -${ai + 1},${da} +${bi + 1},${db} @@`, ...hunk.map(([k, x]) => k + x));
    ai += da; bi += db; i = j;
  }
  return out.join("\n");
}

/** the command: returns the exit code (0 done, 1 the page cannot be migrated, 2 wrong arguments) */
export function migrateCommand(argv: string[], io: MigrateIo): number {
  const write = argv.includes("--write");
  const files = argv.filter((x) => !x.startsWith("--"));
  const unknown = argv.filter((x) => x.startsWith("--") && x !== "--write");
  if (files.length !== 1 || unknown.length) { io.err(unknown.length ? `unknown option ${unknown[0]}\n${USAGE}` : USAGE); return 2; }
  const path = files[0];
  let text: string;
  try { text = io.read(path); } catch (e) { io.err(`${path}: ${(e as Error).message}`); return 1; }
  let out: string;
  try { out = migrate(text); } catch (e) { io.err(`${path}: ${(e as Error).message}`); return 1; }
  if (out === text) { io.out(`${path}: nothing to change (already format 12, or no animation)`); return 0; }
  io.out(unifiedDiff(text, out, path));
  if (write) { io.write(path, out); io.out(`${path}: written`); } else io.out(`${path}: not written (add --write to write it)`);
  return 0;
}
