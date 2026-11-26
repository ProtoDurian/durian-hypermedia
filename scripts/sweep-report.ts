#!/usr/bin/env bun
// Builds the per-fence lines of SWEEP.md from the sweep runs (scripts/sweep.ts) and the sheet reviews (one line per fence:
// `<slug> | 1280: ... | 390: ...`).
//   bun scripts/sweep-report.ts --dyn <dir>[,<dir>...] --review <file>[,<file>...] [--only <regex on the slug>]
// A later --dyn dir wins over an earlier one for the same fence and width.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
const args = process.argv.slice(2);
const opt = (k: string, d = "") => (args.includes(k) ? (args[args.indexOf(k) + 1] ?? d) : d);
const dyns = opt("--dyn").split(",").filter(Boolean).map((d) => resolve(d)), reviews = opt("--review").split(",").filter(Boolean).map((d) => resolve(d));
const only = opt("--only") ? new RegExp(opt("--only")) : null;
const idOf = (slug: string) => slug.replace(/_/, "/").replace(/\.dh\.md_(\d+)$/, ".dh.md#$1");
const short = (slug: string) => idOf(slug).replace(/\.dh\.md/, "").replace(/-animation-|-3d-|-test-/, "-");

type R = any;
const runs = new Map<string, Map<string, R>>(); // slug -> width -> run
for (const d of dyns) for (const f of readdirSync(d).filter((n) => /-(1280|390)\.json$/.test(n))) {
  const m = /^(.*)-(1280|390)\.json$/.exec(f)!; const r = JSON.parse(readFileSync(join(d, f), "utf8"));
  if (!runs.has(m[1])) runs.set(m[1], new Map()); runs.get(m[1])!.set(m[2], r);
}
const rev = new Map<string, Map<string, string>>(); // slug -> width -> text
for (const f of reviews) if (existsSync(f)) for (const line of readFileSync(f, "utf8").split("\n")) {
  const p = line.split(" | "); if (p.length < 3) continue;
  const slug = p[0].trim().replace(/^[-*\s`]+|`$/g, "");
  const w = new Map<string, string>();
  for (const x of p.slice(1)) { const m = /^\s*(1280|390):\s*(.*)$/.exec(x); if (m) w.set(m[1], m[2].trim()); }
  rev.set(slug, w);
}
const revFor = (slug: string, w: string) => rev.get(slug)?.get(w) ?? [...rev].find(([k]) => k.length > 8 && slug.startsWith(k) && slug.length === k.length + 0)?.[1].get(w);

function motion(r: R): string[] {
  const out: string[] = [];
  if (r.error) out.push("did not run: " + r.error);
  const s = r.start;
  if (s) { if (s.zoom > 1.05) out.push(`step 1 closer than fitted (x${s.zoom})`); if (s.tiny) out.push(`step 1: ${s.tiny} words under 9.5 px`); if (s.cut) out.push(`step 1: ${s.cut} words cut at the frame edge`); if (!s.fitted && !r.three) out.push("step 1 is not the whole scene"); }
  const words: string[] = [], cam: number[] = [], jumps: string[] = [], dots: number[] = [];
  for (const p of r.plain ?? []) {
    const j = p.jitter;
    for (const w of j.words) { const m = /^(.*) \((\d+) zigs, up to ([\d.]+) px/.exec(w); if (m && +m[3] >= 3) words.push(`step ${p.step} "${m[1].replace(/^[^|]*\|/, "")}" ${m[2]}x ${m[3]} px`); }
    if (j.camera) cam.push(p.step);
    for (const x of j.jumps) jumps.push(`step ${p.step} ${x}`);
    if (j.dots) dots.push(p.step);
  }
  if (words.length) out.push(`words shake: ${words.slice(0, 4).join("; ")}${words.length > 4 ? ` (+${words.length - 4} more)` : ""}`);
  if (cam.length) out.push(`camera shakes at step ${cam.slice(0, 6).join(", ")}`);
  if (jumps.length) out.push(`words jump: ${jumps.slice(0, 3).join("; ")}${jumps.length > 3 ? ` (+${jumps.length - 3})` : ""}`);
  if (dots.length) out.push(`packet turns back at step ${dots.slice(0, 6).join(", ")}`);
  for (const z of r.zoomed ?? []) {
    const j = z.step.jitter, b: string[] = [];
    if (j.camJump > 2) b.push(`camera jumps ${j.camJump} units at once`);
    if (j.camera) b.push("camera shakes");
    if (z.before && z.after && z.after.words < 0.5 * Math.max(1, z.before.words)) b.push(`words ${z.before.words} -> ${z.after.words}`);
    if (b.length) out.push(`zoom (${z.how}) then Next: ${b.join(", ")}`);
  }
  return out;
}

let fences = [...runs.keys()].sort();
if (only) fences = fences.filter((s) => only.test(s));
let ok = 0;
const lines: string[] = [];
for (const slug of fences) {
  const per: string[] = [];
  for (const w of ["1280", "390"]) {
    const r = runs.get(slug)!.get(w); const items: string[] = r ? motion(r) : ["not run"];
    const v = revFor(slug, w); if (v && !/^OK\b/i.test(v)) items.push("looks: " + v);
    if (items.length) per.push(`${w}: ${items.join("; ")}`);
  }
  const r0 = runs.get(slug)!.get("1280");
  if (!per.length) { ok++; lines.push(`- \`${short(slug)}\`${r0?.three ? " (3D)" : ""}: OK`); }
  else lines.push(`- \`${short(slug)}\`${r0?.three ? " (3D)" : ""}: ${per.join(" | ")}`);
}
console.log(`${fences.length} fences, ${ok} OK on both widths\n`);
console.log(lines.join("\n"));
