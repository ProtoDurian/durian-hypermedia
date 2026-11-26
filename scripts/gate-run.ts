#!/usr/bin/env bun
// The gate report: a new-engine match run (scripts/match.ts --engine new) set against a baseline run, fence by fence and
// check by check, worst first, with the lane that owns each fence (showcase-fb/HELPERS.md). The rule is "no worse than the
// baseline": a fence is worse when, at a width, a check's total over its steps is higher than the baseline's.
//   bun scripts/gate-run.ts --pair <label>=<new run>,<baseline run> [--pair ...] [--out GATE-RUN.md] [--sha <integration sha>]
// A run is a folder written by scripts/match.ts (report.json, site/). Tables are at most 4 columns wide.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "../src/index";
import { tryEngine } from "../src/engine/bridge";
import { layoutFindings } from "../src/engine/core/check-layout";

const PKG = resolve(import.meta.dir, "..");
const args = process.argv.slice(2);
const opts = (k: string) => args.flatMap((a, i) => (a === k ? [args[i + 1]] : []));
const CHECKS = ["overlap", "labels", "outside", "ellipsis", "small", "sideways", "crossings", "moved", "errors"] as const;
type Check = (typeof CHECKS)[number];
type Step = { step: number; label: string; checks: Record<Check, number>; samples?: Record<string, string[]> };
type Fence = { id: string; kind: string; file: string; n: number; info: string; slug: string; problems: number; widths: Record<string, { steps: Step[]; error?: string }> };
type Report = { meta: Record<string, any>; fences: Record<string, Fence> };
const load = (dir: string): Report => JSON.parse(readFileSync(join(resolve(dir), "report.json"), "utf8"));

// ------------------------------------------------------------------ which lane owns a fence
const CHART_LANE: Record<string, string> = {
  bar: "eng-chxy", line: "eng-chxy", area: "eng-chxy", scatter: "eng-chxy", bubble: "eng-chxy", candlestick: "eng-chxy", heatmap: "eng-chxy",
  pie: "eng-chradial", doughnut: "eng-chradial", polar: "eng-chradial", radar: "eng-chradial",
};
const LAYOUT_LANE: Record<string, string> = {
  lanes: "eng-lanes", graph: "eng-graph", free: "eng-graph", tree: "eng-data", array: "eng-data", list: "eng-data", stack: "eng-data", queue: "eng-data", map: "eng-data",
  timeline: "eng-time", grid: "eng-grid", sheet: "eng-sheet", wrap: "eng-sheet", track: "eng-sheet", layers: "eng-layers2",
};
/** every animation and chart fence of a fixture file, in order (the harness's rule: a fence inside another fence is not one) */
function fencesIn(text: string): { kind: string; body: string; fm: string }[] {
  const lines = text.split("\n");
  let fm = "";
  if (lines[0] === "---") { const end = lines.indexOf("---", 1); if (end > 0) fm = lines.slice(0, end + 1).join("\n"); }
  const out: { kind: string; body: string; fm: string }[] = [];
  let open: { ticks: string; kind: string; info: string; body: string[] } | null = null;
  for (const line of lines) {
    if (open) {
      if (new RegExp("^" + open.ticks[0] + "{" + open.ticks.length + ",}\\s*$").test(line)) { if (open.kind === "animation" || open.kind === "chart") out.push({ kind: open.kind, body: open.body.join("\n"), fm }); open = null; } else open.body.push(line);
      continue;
    }
    const m = /^(`{3,}|~{3,})\s*([A-Za-z0-9_-]*)(.*)$/.exec(line);
    if (m) open = { ticks: m[1], kind: m[2], info: m[3].trim(), body: [] };
  }
  return out;
}
const laneCache = new Map<string, string>();
function laneOf(f: Fence): string {
  const hit = laneCache.get(f.id); if (hit) return hit;
  let lane = "unknown";
  try {
    const file = join(PKG, "fixtures", f.file);
    const fe = fencesIn(readFileSync(file, "utf8"))[f.n - 1];
    if (fe.kind === "chart") lane = CHART_LANE[/^kind:\s*([a-z-]+)/m.exec(fe.body)?.[1] ?? ""] ?? "eng-chwire";
    else {
      const doc: any = parse(`${fe.fm ? fe.fm + "\n\n" : ""}\`\`\`animation${f.info ? " " + f.info : ""}\n${fe.body}\n\`\`\`\n`, { path: file });
      const block = doc.blocks.find((b: any) => b.type === "animation");
      const t = tryEngine(block);
      if (!t.c) lane = "eng-core (does not draw)";
      else {
        const m = t.c.model;
        const chart = Object.values(m.things).find((x) => x.chart);
        lane = Object.keys(m.scenes).length ? "eng-scenes" : m.view !== "2d" ? "eng-layers2" : m.layout === "lanes" && chart ? "eng-lanes" : LAYOUT_LANE[m.layout] ?? "eng-core";
        // a container with its own layout inside decides when the stage is the plain graph or lanes
        if (lane === "eng-graph" || lane === "eng-lanes") { const own = Object.values(m.things).find((x) => x.layout && LAYOUT_LANE[x.layout] && LAYOUT_LANE[x.layout] !== lane); if (own) lane = `${lane} + ${LAYOUT_LANE[own.layout!]}`; }
      }
    }
  } catch { lane = "unknown"; }
  laneCache.set(f.id, lane);
  return lane;
}

// ------------------------------------------------------------------ one pair of runs
const total = (f: Fence | undefined, w: string, c: Check) => f?.widths[w]?.steps.reduce((s, st) => s + st.checks[c], 0) ?? 0;
const widthsOf = (r: Report) => (r.meta.widths as number[]).map(String);
/** Known and accounted for (brant, 25 Nov): a check that goes up because the story or the control changes the data, not the layout. It is listed, never counted. */
const KNOWN: { id: string; check: Check; why: string }[] = [
  { id: "gt/12-monthly-budget.dh.md#1", check: "moved", why: "the balance \"1,270\" is a value that changes in step 5, so its words are elsewhere" },
  { id: "format/31-chart-with-controls.dh.md#1", check: "moved", why: "the control changes the chart's data, so its words move" },
  { id: "format/78-chart-log-toggle.dh.md#1", check: "moved", why: "the control changes the data (log scale), so its words move" },
];
interface Row { id: string; lane: string; excess: number; worse: string[]; better: number; known: string[] }

function section(label: string, newDir: string, baseDir: string, sha: string): string[] {
  const N = load(newDir), B = load(baseDir);
  const widths = widthsOf(N);
  const md: string[] = [`## ${label}`, ``, `New: \`${newDir}\` (engine ${N.meta.engine ?? "?"}, ${N.meta.scheme ?? "light"}, commit ${N.meta.commit}). Baseline: \`${baseDir}\` (${B.meta.engine ?? "old"}, ${B.meta.scheme ?? "light"}, commit ${B.meta.commit}).`, ``];
  const ids = Object.keys(N.fences).sort();
  const common = ids.filter((id) => B.fences[id]);
  const onlyNew = ids.filter((id) => !B.fences[id]);
  const rows: Row[] = [];
  for (const id of common) {
    const n = N.fences[id], b = B.fences[id];
    const worse: string[] = [], known: string[] = []; let excess = 0, better = 0;
    for (const w of widths) for (const c of CHECKS) {
      const d = total(n, w, c) - total(b, w, c);
      const kn = d > 0 ? KNOWN.find((k) => k.id === id && k.check === c) : undefined;
      if (d > 0) { if (!kn) excess += d; const at = n.widths[w]?.steps.map((s) => ({ s, x: s.checks[c] - (b.widths[w]?.steps[s.step - 1]?.checks[c] ?? 0) })).sort((p, q) => q.x - p.x)[0]; const smp = at?.s.samples?.[c]?.[0]; (kn ? known : worse).push(`${c} at ${w} px ${total(b, w, c)} -> ${total(n, w, c)}${at && at.x > 0 ? ` (step ${at.s.step}${smp ? `: ${smp.slice(0, 60)}` : ""})` : ""}${kn ? ` - known: ${kn.why}` : ""}`); }
      else if (d < 0) better += -d;
    }
    for (const w of widths) { const e = n.widths[w]?.error; if (e && !b.widths[w]?.error) { worse.push(`${w} px: did not run (${e.slice(0, 60)})`); excess += 1; } }
    rows.push({ id, lane: laneOf(n), excess, worse, better, known });
  }
  // what each run counts, by check and width
  const sum = (R: Report, ids: string[], w: string, c: Check) => ids.reduce((s, id) => s + total(R.fences[id], w, c), 0);
  for (const w of widths) {
    md.push(`### Counts at ${w} px (${common.length} fences in both runs)`, ``, `| Check | Baseline | New | Fences worse |`, `| --- | --- | --- | --- |`);
    for (const c of CHECKS) md.push(`| ${c} | ${sum(B, common, w, c)} | ${sum(N, common, w, c)} | ${common.filter((id) => total(N.fences[id], w, c) > total(B.fences[id], w, c)).length} |`);
    md.push(``);
  }
  const bad = rows.filter((r) => r.excess > 0).sort((a, b) => b.excess - a.excess);
  const knownOnly = rows.filter((r) => r.excess === 0 && r.known.length > 0);
  const nBetter = rows.filter((r) => r.excess === 0 && !r.known.length && r.better > 0).length;
  md.push(`### Verdict`, ``, `| What | Fences |`, `| --- | --- |`, `| compared | ${rows.length} |`, `| worse than the baseline (rule broken) | ${bad.length} |`, `| worse, but known and accounted for (not counted) | ${knownOnly.length} |`, `| same | ${rows.length - bad.length - nBetter - knownOnly.length} |`, `| better | ${nBetter} |`, `| in the new run only (no baseline) | ${onlyNew.length} |`, ``);

  if (knownOnly.length) { md.push(`### Known and accounted for`, ``, `| Fence | Lane | What |`, `| --- | --- | --- |`); for (const r of knownOnly) md.push(`| ${r.id} | ${r.lane} | ${r.known.join("; ")} |`); md.push(``); }
  // the lanes, worst first
  const byLane = new Map<string, Row[]>();
  for (const r of bad) { const k = r.lane; byLane.set(k, [...(byLane.get(k) ?? []), r]); }
  md.push(`### Worst first, by lane owner`, ``, `| Lane | Fences worse | Excess | Worst fence |`, `| --- | --- | --- | --- |`);
  for (const [lane, rs] of [...byLane].sort((a, b) => b[1].reduce((s, r) => s + r.excess, 0) - a[1].reduce((s, r) => s + r.excess, 0))) md.push(`| ${lane} | ${rs.length} | ${rs.reduce((s, r) => s + r.excess, 0)} | ${rs[0].id} |`);
  md.push(``, `### Every fence that is worse`, ``, `| Fence | Lane | Excess | Worst check |`, `| --- | --- | --- | --- |`);
  for (const r of bad) md.push(`| ${r.id} | ${r.lane} | ${r.excess} | ${r.worse[0]} |`);
  md.push(``);
  for (const [lane, rs] of [...byLane].sort((a, b) => b[1].reduce((s, r) => s + r.excess, 0) - a[1].reduce((s, r) => s + r.excess, 0))) {
    md.push(`#### ${lane}`, ``);
    for (const r of rs) md.push(`- **${r.id}** (excess ${r.excess}): ${r.worse.slice(0, 5).join("; ")}${r.worse.length > 5 ? `; and ${r.worse.length - 5} more` : ""}`);
    md.push(``);
  }

  // fences that drew an error box (the new engine refused the block) or did not run
  // hostile/ fixtures are refused on purpose (a page or part over a cap): they are not the engine's failures
  const errBox = ids.filter((id) => !id.startsWith("hostile/")).filter((id) => { const f = N.fences[id]; const p = join(resolve(newDir), "site", `${f.slug}.html`); return existsSync(p) && /class="dh-error"/.test(readFileSync(p, "utf8")); });
  md.push(`### Fences the new engine drew as an error box`, ``);
  if (!errBox.length) md.push(`None.`, ``);
  else { md.push(`| Fence | Lane | Reason |`, `| --- | --- | --- |`); for (const id of errBox) { const p = readFileSync(join(resolve(newDir), "site", `${N.fences[id].slug}.html`), "utf8"); md.push(`| ${id} | ${laneOf(N.fences[id])} | ${(/class="dh-error"[^>]*>([^<]*)</.exec(p)?.[1] ?? "").slice(0, 100)} |`); } md.push(``); }
  const dead = ids.filter((id) => { const f = N.fences[id]; return f.problems === -1 || !Object.keys(f.widths).length || Object.values(f.widths).some((w) => w.error); });
  md.push(`### Fences that did not run clean in the new run`, ``);
  if (!dead.length) md.push(`None.`, ``);
  else { md.push(`| Fence | Width | What |`, `| --- | --- | --- |`); for (const id of dead) { const f = N.fences[id]; const ws = Object.entries(f.widths).filter(([, w]) => w.error); if (!ws.length) md.push(`| ${id} | - | ${f.problems === -1 ? "parse() threw" : "not run"} |`); for (const [w, r] of ws) md.push(`| ${id} | ${w} | ${r.error!.slice(0, 80)} |`); } md.push(``); }
  if (onlyNew.length) {
    md.push(`### In the new run only (fixtures added since the baseline; no comparison)`, ``, `| Fence | Lane | Checks over 0 |`, `| --- | --- | --- |`);
    for (const id of onlyNew) { const f = N.fences[id]; const hit = widths.flatMap((w) => CHECKS.filter((c) => total(f, w, c) > 0).map((c) => `${c} ${total(f, w, c)} at ${w}`)); md.push(`| ${id} | ${laneOf(f)} | ${hit.slice(0, 4).join(", ") || "none"} |`); }
    md.push(``);
  }
  void sha;
  return md;
}

// ------------------------------------------------------------------ the layout warnings authors see (core/check-layout.ts) on the same fences
function authorWarnings(newDir: string): string[] {
  const N = load(newDir);
  const per = new Map<string, Map<string, number>>(), total = new Map<string, number>();
  let drawn = 0;
  for (const f of Object.values(N.fences).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (f.kind !== "animation") continue;
    try {
      const fe = fencesIn(readFileSync(join(PKG, "fixtures", f.file), "utf8"))[f.n - 1];
      const doc: any = parse(`${fe.fm ? fe.fm + "\n\n" : ""}\`\`\`animation${f.info ? " " + f.info : ""}\n${fe.body}\n\`\`\`\n`, { path: join(PKG, "fixtures", f.file) });
      const t = tryEngine(doc.blocks.find((b: any) => b.type === "animation"));
      if (!t.c) continue;
      drawn++;
      for (const x of layoutFindings(t.c)) { total.set(x.kind, (total.get(x.kind) ?? 0) + 1); const m = per.get(x.kind) ?? new Map(); m.set(f.id, (m.get(f.id) ?? 0) + 1); per.set(x.kind, m); }
    } catch { /* a fence the engine cannot draw is listed elsewhere */ }
  }
  const md = [`## Warnings an author sees (doccheck, layout checks at 1000 and 390 px)`, ``, `${drawn} animation fences drawn by the new engine; one warning per step and finding, per width (core/check-layout.ts). Warnings only: nothing is refused.`, ``, `| Finding | Warnings | Fences | Worst fence |`, `| --- | --- | --- | --- |`];
  for (const k of ["cross", "small", "moved", "overlap"]) { const m = per.get(k) ?? new Map<string, number>(); const worst = [...m].sort((a, b) => b[1] - a[1])[0]; md.push(`| ${k} | ${total.get(k) ?? 0} | ${m.size} | ${worst ? `${worst[0]} (${worst[1]})` : "-"} |`); }
  return [...md, ``];
}

const pairs = opts("--pair");
if (!pairs.length) { console.error("usage: bun scripts/gate-run.ts --pair <label>=<new run>,<baseline run> [--pair ...] [--out GATE-RUN.md] [--sha <sha>]"); process.exit(2); }
const sha = opts("--sha")[0] ?? "";
const out = opts("--out")[0] ?? "GATE-RUN.md";
const md: string[] = [`# Gate run${sha ? ` ${sha}` : ""}`, ``, `Written ${new Date().toISOString()} by scripts/gate-run.ts. Rule (brant): **no worse than the baseline**, per fence and per check: at a width, a check's total over the fence's steps may not be higher than the baseline's. The baseline is not at 0 either.`, ``];
for (const p of pairs) {
  const m = /^([^=]+)=([^,]+),(.+)$/.exec(p);
  if (!m) { console.error(`bad --pair ${p}`); process.exit(2); }
  md.push(...section(m[1], m[2], m[3], sha));
}
md.push(...authorWarnings(pairs[0].split("=")[1].split(",")[0]));
writeFileSync(out, md.join("\n"));
console.log(`written ${out}`);
