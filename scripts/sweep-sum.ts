#!/usr/bin/env bun
// Reads the <fence>-<width>.json files of scripts/sweep.ts and prints one block per fence and width: what is wrong, short.
//   bun scripts/sweep-sum.ts <sweep out dir> [--verbose]
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
const dir = resolve(process.argv[2]), verbose = process.argv.includes("--verbose");
for (const f of readdirSync(dir).filter((n) => n.endsWith(".json") && n !== "all.json").sort()) {
  const r = JSON.parse(readFileSync(join(dir, f), "utf8"));
  const bad: string[] = [];
  const s = r.start;
  if (r.error) bad.push("ERROR " + r.error);
  if (s) { if (s.zoom > 1.05) bad.push(`step 1 closer than natural (zoom ${s.zoom})`); if (s.tiny) bad.push(`step 1: ${s.tiny} words under 9.5 px`); if (s.cut) bad.push(`step 1: ${s.cut} words cut at the edge`); if (!s.fitted && !r.three) bad.push(`step 1 not whole (vb ${s.vb.join(" ")})`); }
  for (const p of r.plain ?? []) {
    const j = p.jitter, b: string[] = [];
    if (j.camera) b.push(`camera turns ${j.camera}`);
    if (j.words.length) b.push(`words turning: ${j.words.slice(0, verbose ? 20 : 3).join("; ")}${j.words.length > 3 && !verbose ? ` +${j.words.length - 3}` : ""}`);
    if (j.jumps.length) b.push(`jumps: ${j.jumps.slice(0, 3).join("; ")}`);
    if (j.dots) b.push(`packet reverses ${j.dots}`);
    if (j.frames < 20) b.push(`only ${j.frames} frames`);
    if (b.length) bad.push(`step ${p.step}: ${b.join(" | ")}`);
  }
  for (const z of r.zoomed ?? []) {
    const j = z.step.jitter, b: string[] = [];
    if (j.camJump > 2) b.push(`camera jumps ${j.camJump} at once`);
    if (j.camera) b.push(`camera turns ${j.camera}`);
    if (j.words.length) b.push(`${j.words.length} words turning`);
    if (j.jumps.length) b.push(`jumps ${j.jumps.length}`);
    if (j.dots) b.push(`packet reverses ${j.dots}`);
    if (z.before && z.after && z.after.words < 0.5 * Math.max(1, z.before.words)) b.push(`words ${z.before.words} -> ${z.after.words} after the step`);
    if (z.note) b.push(z.note);
    if (z.after && z.after.cut) b.push(`${z.after.cut} cut after the step`);
    if (b.length) bad.push(`zoom (${z.how}) then step 2: ${b.join(" | ")}`);
  }
  console.log(`${f.replace(/\.json$/, "").replace(/\.dh\.md_1/, "")}: ${bad.length ? "" : "OK"}${r.three ? " [3D]" : ""}${r.steps ? ` (${r.steps} steps)` : ""}`);
  for (const b of bad) console.log("   - " + b);
}
