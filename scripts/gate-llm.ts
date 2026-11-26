#!/usr/bin/env bun
// The LLM-view comparison of the gate (gate3): every animation and chart fence of fixtures/ parsed once with engine "old" and once
// with engine "new" in this very build (no browser), the two LLM views set against each other by the words a reader of the text sees.
//   bun scripts/gate-llm.ts [--out <dir>] [--only <glob>]
// Writes <out>/llm-diff.md (tables at most 4 columns), <out>/old/<slug>.txt and <out>/new/<slug>.txt. A word is a run of letters or digits, lower case.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { llmView, parse } from "../src/index";

const PKG = resolve(import.meta.dir, "..");
const args = process.argv.slice(2);
const opt = (k: string, d = "") => (args.includes(k) ? (args[args.indexOf(k) + 1] ?? d) : d);
const OUT = resolve(opt("--out", join(PKG, "dist/gate-llm")));
const only = opt("--only");
const globRe = (g: string) => new RegExp("^" + g.replace(/[.+^$()|\\[\]]/g, (c) => "\\" + c).replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
const matcher = only ? globRe(/[*?]/.test(only) ? only : `*${only}*`) : null;

function mdFiles(dir: string): string[] {
  return readdirSync(dir).sort().flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? mdFiles(p) : /\.md$/.test(n) ? [p] : []; });
}
type Fence = { id: string; kind: string; info: string; body: string; fm: string; slug: string };
function fencesIn(rel: string, text: string): Fence[] {
  const lines = text.split("\n");
  let fm = "";
  if (lines[0] === "---") { const end = lines.indexOf("---", 1); if (end > 0) fm = lines.slice(0, end + 1).join("\n"); }
  const out: Fence[] = [];
  let open: { ticks: string; kind: string; info: string; body: string[] } | null = null;
  for (const line of lines) {
    if (open) {
      if (new RegExp("^" + open.ticks[0] + "{" + open.ticks.length + ",}\\s*$").test(line)) {
        if (open.kind === "animation" || open.kind === "chart") { const id = `${rel}#${out.length + 1}`; out.push({ id, kind: open.kind, info: open.info, body: open.body.join("\n"), fm, slug: id.replace(/[^A-Za-z0-9.-]+/g, "_") }); }
        open = null;
      } else open.body.push(line);
      continue;
    }
    const m = /^(`{3,}|~{3,})\s*([A-Za-z0-9_-]*)(.*)$/.exec(line);
    if (m) open = { ticks: m[1]!, kind: m[2]!, info: m[3]!.trim(), body: [] };
  }
  return out;
}
const root = join(PKG, "fixtures");
const fences = mdFiles(root).flatMap((f) => fencesIn(relative(root, f), readFileSync(f, "utf8"))).filter((f) => !matcher || matcher.test(f.id));
mkdirSync(join(OUT, "old"), { recursive: true }); mkdirSync(join(OUT, "new"), { recursive: true });
const words = (s: string) => { const m = new Map<string, number>(); for (const w of s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) m.set(w, (m.get(w) ?? 0) + 1); return m; };
const view = (f: Fence, engine: "old" | "new") => {
  const text = `${f.fm ? f.fm + "\n\n" : ""}\`\`\`${f.kind}${f.info ? " " + f.info : ""}\n${f.body}\n\`\`\`\n`;
  try { return llmView(parse(text, { path: basename(f.id.split("#")[0]!), engine }), { engine }); } catch (e) { return `(threw: ${String(e).slice(0, 120)})`; }
};
const rows: { id: string; same: boolean; lost: string[]; gained: string[]; ol: number; nl: number }[] = [];
for (const f of fences) {
  const o = view(f, "old"), n = view(f, "new");
  writeFileSync(join(OUT, "old", f.slug + ".txt"), o); writeFileSync(join(OUT, "new", f.slug + ".txt"), n);
  const ow = words(o), nw = words(n);
  const lost = [...ow.keys()].filter((w) => !nw.has(w)), gained = [...nw.keys()].filter((w) => !ow.has(w));
  rows.push({ id: f.id, same: o === n, lost, gained, ol: o.length, nl: n.length });
}
const md: string[] = [`# LLM views, old against new (${fences.length} fences)`, ``, `Both parsed in this build: \`parse(text, { engine })\` then \`llmView\`. A word is lost when the old view has it and the new view has none like it.`, ``];
const same = rows.filter((r) => r.same).length, lostRows = rows.filter((r) => r.lost.length).sort((a, b) => b.lost.length - a.lost.length);
md.push(`| What | Fences |`, `| --- | --- |`, `| identical text | ${same} |`, `| different text | ${rows.length - same} |`, `| the new view loses at least one word | ${lostRows.length} |`, `| the new view loses none | ${rows.length - lostRows.length} |`, ``);
md.push(`## Fences where the new view loses words, most first`, ``, `| Fence | Lost | Gained | Words lost (first 12) |`, `| --- | --- | --- | --- |`);
for (const r of lostRows) md.push(`| ${r.id} | ${r.lost.length} | ${r.gained.length} | ${r.lost.slice(0, 12).join(" ")} |`);
writeFileSync(join(OUT, "llm-diff.md"), md.join("\n") + "\n");
console.log(md.slice(0, 12).join("\n")); console.log(`written: ${join(OUT, "llm-diff.md")}`);
