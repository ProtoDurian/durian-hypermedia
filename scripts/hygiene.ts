#!/usr/bin/env bun
// Hygiene: the package is a public repo. Fail on anything that must not be published.
//   bun scripts/hygiene.ts            (exit 1 on any hit, with file:line and the rule)
// It reads every text file the repo would hold (not node_modules, dist or the example's build output).
// Names of people, agents, organisations and private material are not written here (that would publish them): they are
// read from public-rewrites.json ("deny") in the source folder above the package, when it is there.
//   bun scripts/hygiene.ts [<source folder>]
import { readdirSync, readFileSync, statSync } from "node:fs";
import { existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const PKG = resolve(import.meta.dir, "..");
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".cache"]);
const TEXT = /\.(ts|tsx|js|mjs|json|md|css|html|yaml|yml|txt|svg)$|^\.gitignore$/;

// each rule: a name, a pattern, and what it protects
export const RULES: { name: string; re: RegExp; why: string }[] = [
  { name: "machine path", re: /(\/tmp\/|\/home\/[a-z]|\/Users\/[A-Za-z]|\/nix\/store\/|\/root\/|C:\\Users\\|\/var\/folders\/)/, why: "a path on someone's machine" },
  { name: "email address", re: /[A-Za-z0-9._%+-]+@(?!example\.(com|org|net)\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, why: "a real person's or team's address" },
  { name: "private key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, why: "a secret key" },
  { name: "token", re: /\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{10,}|xox[abpr]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,})\b/, why: "an API token" },
  { name: "secret assignment", re: /\b(password|passwd|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*["'][^"'\s]{8,}["']/i, why: "a secret in code" },
  { name: "internal id", re: /\b(mw[a-z0-9]{6}-[0-9a-f]{8}|[!?]A\d{2,4}\b|#F\d{2,4}\b|D\d{3}\b(?=[: ])|PE-\d{3,}|pass [0-9]+ helper)/, why: "an id from the people or tools that made this" },
  { name: "internal host", re: /\b[a-z0-9-]+\.(internal|corp|local|lan)\b|\b(10|192\.168|172\.(1[6-9]|2\d|3[01]))\.\d+\.\d+\b/, why: "an internal host or address" },
];
// the private word lists: { "deny": { "<rule name>": ["word", ...] } }, each word matched whole and in any case
export function loadDeny(src: string): number {
  const f = join(src, "public-rewrites.json");
  if (!existsSync(f)) return 0;
  const deny = (JSON.parse(readFileSync(f, "utf8")).deny ?? {}) as Record<string, string[]>;
  let n = 0;
  for (const [name, words] of Object.entries(deny)) { if (!words.length) continue; RULES.push({ name, re: new RegExp(`(?<![\\w-])(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")).join("|")})(?![\\w-])`, "i"), why: "private" }); n += words.length; }
  return n;
}
// lines a rule may match on purpose (a rule's own text, the test inputs that are attacks)
const ALLOW: { file: RegExp; rule: string; line?: RegExp }[] = [
  { file: /^scripts\/hygiene\.ts$/, rule: "*" },
  { file: /^NOTES/, rule: "*" },
];

function files(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !(dir.endsWith("example") && e.name === "dist")) out.push(...files(join(dir, e.name))); }
    else if (TEXT.test(e.name) && statSync(join(dir, e.name)).size < 4_000_000) out.push(join(dir, e.name));
  }
  return out;
}
export function scan(root = PKG): { file: string; line: number; rule: string; text: string }[] {
  const hits: { file: string; line: number; rule: string; text: string }[] = [];
  for (const f of files(root)) {
    const rel = relative(root, f);
    if (rel === "bun.lock" || rel === "bun.lockb") continue;
    readFileSync(f, "utf8").split("\n").forEach((l, i) => {
      for (const r of RULES) {
        if (!r.re.test(l)) continue;
        if (ALLOW.some((a) => a.file.test(rel) && (a.rule === "*" || a.rule === r.name) && (!a.line || a.line.test(l)))) continue;
        hits.push({ file: rel, line: i + 1, rule: r.name, text: l.trim().slice(0, 140) });
      }
    });
  }
  return hits;
}
if (import.meta.main) {
  const n = loadDeny(resolve(process.argv[2] ?? join(PKG, "..")));
  const hits = scan();
  console.log(`hygiene: ${RULES.length} rules: ${RULES.map((r) => r.name).join(", ")}${n ? ` (${n} private words from public-rewrites.json)` : " (no private word list found: names are not checked)"}`);
  for (const h of hits) console.log(`${h.file}:${h.line}: [${h.rule}] ${h.text}`);
  console.log(hits.length ? `\n${hits.length} hit(s): fix them before publishing` : "0 hits");
  process.exit(hits.length ? 1 : 0);
}
