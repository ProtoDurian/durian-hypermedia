// A stage bar chart (the composed stage's `bars` block, src/core/stage-bars.ts) drawn by the chart system. Ported, not
// rewritten: the plot's place, the type scale and every rule of the old block stay (bars stand on one value axis; a step
// sets the values, may draw a dotted peak line and a dashed limit, light a bar, or move things from bar to bar; the
// plot's place is fixed for the whole story, so a step changes heights and paint, never the frame).
// Every thing keeps one key for the whole story (`b:<label>:s0` a bar, `peak:line`, `limit:line`, `tabline`, `head:0:0`,
// `big:0` ...), so the renderer glides it from step k-1 to step k: a bar grows, the peak line slides, the tab's
// underline moves from one tab to the next.
// It is the bar kind's drawing when `spec.opts.stage` is "bars" (src/engine/parse/lower-stage.ts sets it); the words it
// reads are listed in INPUT.md ("Stage bars"). Pure: the same spec, numbers, rect and ctx give the same primitives.
import type { ChartCtx, ChartSpec, Font, Prim, Rect } from "../../types";
import { withUnit } from "../axis"; // fmt12

const LINE_H: Record<string, number> = { sub: 16, body: 17, lane: 17, big: 28, chip: 15 };
const MAX_BARS = 64;
const CHIP_PX = 7;
const r2 = (v: number) => Math.round(v * 100) / 100;
const fmt = (v: number) => String(+v.toFixed(6));

/** what one step says (the words of the old block's `Step`): values come from the numbers, not from here */
export interface StepBars {
  peak?: string;
  limit?: { v: number; s: string };
  head?: string[];
  big?: string[];
  bar?: { i: number; s: string };
  moves?: { from: number; to: number; k: number }[];
  tone?: [number, string | null][];
}
/** `opts["bar-steps"]`: the steps' words, by step number */
export type StepsJson = Record<string, StepBars>;

interface Setup {
  ticks: number[]; lines: { name: string; v: number }[]; every: number; tabs: { name: string; a: number; b: number }[];
  tones: [number, string][]; steps: Map<number, StepBars>;
}
const NUM = /^-?\d{1,9}(\.\d{1,9})?$/;
const num = (s: string) => (NUM.test(s.trim()) ? +s.trim() : NaN);
const parts = (s: string, sep: string) => s.split(sep).map((x) => x.trim()).filter(Boolean);

const memo = new WeakMap<ChartSpec, Setup>();
/** the setup words of the spec (`axis`, `line`, `every`, `tabs`, `tone`, `bar-steps`), read once per spec */
export function readSetup(spec: ChartSpec): Setup {
  const hit = memo.get(spec); if (hit) return hit;
  const o = spec.opts ?? {}, labels = spec.x;
  const s: Setup = { ticks: [], lines: [], every: 0, tabs: [], tones: [], steps: new Map() };
  s.ticks = parts(o.axis ?? "", ",").map(num).filter((x) => Number.isFinite(x));
  for (const l of (o.line ?? "").split("\n").filter(Boolean)) { const c = l.indexOf(":"), v = c < 0 ? NaN : num(l.slice(c + 1)); if (c > 0 && Number.isFinite(v)) s.lines.push({ name: l.slice(0, c).trim(), v }); }
  s.every = Math.max(0, Math.round(num(o.every ?? "") || 0));
  for (const t of parts(o.tabs ?? "", ";")) {
    const c = t.indexOf(":"); if (c <= 0) continue;
    const r = t.slice(c + 1).trim(), d = r.indexOf(".."), a = num(d < 0 ? r : r.slice(0, d)), z = d < 0 ? a : num(r.slice(d + 2));
    if (Number.isInteger(a) && Number.isInteger(z) && a >= 1 && z >= a) s.tabs.push({ name: t.slice(0, c).trim(), a, b: z });
  }
  for (const l of (o.tone ?? "").split("\n").filter(Boolean)) {
    const sp = l.lastIndexOf(" "); if (sp < 0) continue;
    for (const i of indices(labels, l.slice(0, sp))) s.tones.push([i, l.slice(sp + 1)]);
  }
  try { const j = JSON.parse(o["bar-steps"] ?? "{}") as StepsJson; for (const [k, v] of Object.entries(j)) s.steps.set(+k, v); } catch { /* a bad list draws without step words */ }
  memo.set(spec, s);
  return s;
}
/** the bars a tone line names (`23`, `23, 29`, `Mon..Wed`) */
function indices(labels: string[], text: string): number[] {
  const out: number[] = [];
  for (const p of parts(text, ",")) {
    const d = p.indexOf(".."), a = labels.indexOf(d < 0 ? p : p.slice(0, d).trim()), z = d < 0 ? a : labels.indexOf(p.slice(d + 2).trim());
    if (a < 0 || z < a) return [];
    for (let i = a; i <= z; i++) out.push(i);
  }
  return out;
}

/** a word list cut into rows that fit `w` (words are never cut), at most `max` rows (the last ends with an ellipsis) */
function wrapRows(text: string, w: number, font: Font, max: number, m: ChartCtx["measure"]): string[] {
  const words = text.split(/\s+/).filter(Boolean), rows: string[] = []; let cur = "";
  for (const wd of words) {
    const t = cur ? cur + " " + wd : wd;
    if (!cur || m(t, font) <= w) cur = t; else { rows.push(cur); cur = wd; }
  }
  if (cur) rows.push(cur);
  if (rows.length > max) { const keep = rows.slice(0, max); keep[max - 1] = keep[max - 1].replace(/[.,;:]?$/, "") + "…"; return keep; }
  return rows;
}

/** what is in force at step k: the words kept from the step that set them (the old block's `inForce`) */
interface At { peak?: string; head?: string[]; big?: string[]; limit?: { v: number; s: string } }
function inForce(steps: Map<number, StepBars>, upTo: number): At {
  let cur: At = {};
  for (let k = 1; k <= upTo; k++) { const s = steps.get(k); cur = { peak: s?.peak ?? cur.peak, head: s?.head ?? cur.head, big: s?.big ?? cur.big, limit: s?.limit ?? cur.limit }; }
  return cur;
}
/** the paint of bar i at step k, and why it is lit ("" for the plain paint); the last rule that matches wins */
export function barTone(setup: Setup, role: string, values: number[], k: number, i: number, at: At): { tone: string; why: string } {
  const s = setup.steps.get(k), v = values[i], hi = Math.max(...values), mv = s?.moves ?? [];
  let tone = role ? `role:${role}` : "acc", why = "";
  const over = !at.limit || v > at.limit.v;
  if (at.peak && v === hi) { tone = "bad"; why = "the peak"; }
  if (s?.limit && v > s.limit.v && v !== hi) { tone = "warn"; why = "over the limit"; }
  if (mv.some((m) => m.from === i) && over) { tone = "warn"; why = "gives"; }
  if (mv.some((m) => m.to === i)) { tone = "good"; why = "takes"; }
  const tcur = new Map<number, string>(setup.tones);
  for (let j = 1; j <= k; j++) for (const [b, t] of setup.steps.get(j)?.tone ?? []) t ? tcur.set(b, t) : tcur.delete(b);
  const by = tcur.get(i);
  if (by) { tone = by === "accent" ? "acc" : by; why = `marked ${by}`; }
  if (s?.bar?.i === i) { tone = "acc"; why = s.bar.s ? `lit: ${s.bar.s}` : "lit"; }
  return { tone, why };
}
/** a paint word of the old stage ("role:server", "acc", "bad" ...) as the fields of a primitive */
const paintOf = (tone: string): { role: string | null; tone: "good" | "bad" | "warn" | "accent" | null } =>
  tone.startsWith("role:") ? { role: tone.slice(5), tone: null } : { role: null, tone: tone === "acc" ? "accent" : (tone as "good" | "bad" | "warn") };

export function drawStageBars(spec: ChartSpec, values: number[][], rect: Rect, ctx: ChartCtx): Prim[] {
  const setup = readSetup(spec), labels = spec.x, n = Math.min(MAX_BARS, Math.max(1, labels.length || (values[0]?.length ?? 1)));
  const role = spec.series[0]?.role ?? "", unit = spec.unit ?? "", title = spec.title ?? "";
  const W = rect.w, nar = ctx.phone, step = ctx.step, m = ctx.measure;
  const label = (i: number) => labels[i] ?? String(i);
  const vals = Array.from({ length: n }, (_, i) => Math.max(0, Number(values[0]?.[i]) || 0));
  const prev = ctx.prev?.[0] ? Array.from({ length: n }, (_, i) => Math.max(0, Number(ctx.prev![0][i]) || 0)) : vals;
  const at = inForce(setup.steps, step), S = setup.steps;
  const prims: Prim[] = [];
  const X = (v: number) => r2(rect.x + v), Yp = (v: number) => r2(rect.y + v);
  const text = (key: string, x: number, y: number, s: string, font: Font, ink: "ink" | "muted" | "tone", anchor: "start" | "middle" | "end", tone?: "bad" | "accent", cls?: string) =>
    prims.push({ k: "text", key, x: X(x), y: Yp(y), lines: [s], font, anchor, ink, ...(tone ? { tone } : {}), ...(cls ? { cls } : {}) });
  const steps = [...S.keys()];

  let y = 0;
  // ---- the tabs: one lit per step
  if (setup.tabs.length) {
    const ws = setup.tabs.map((t) => m(t.name, "lane") + 20), tot = ws.reduce((a, x) => a + x, 0);
    let x = Math.max(0, (W - tot) / 2);
    setup.tabs.forEach((t, i) => {
      const lit = step >= t.a && step <= t.b, s = wrapRows(t.name, ws[i] - 8, "lane", 1, m)[0];
      text(`tab:${i}`, x + ws[i] / 2, 17, s, "lane", lit ? "tone" : "ink", "middle", lit ? "accent" : undefined, "xy-sb-tab");
      if (lit) prims.push({ k: "rect", key: "tabline", rect: { x: X(x + 2), y: Yp(25), w: ws[i] - 4, h: 3 }, fill: "role", tone: "accent", edge: "role", r: 1.5, cls: "xy-sb-bar xy-sb-acc" });
      x += ws[i];
    });
    y += 38;
  }
  // ---- the heading (left) and the big number (right; under the heading on a phone): their place is the tallest step's
  const heads = [...S.values()].flatMap((s) => (s.head ? [s.head] : [])), bigs = [...S.values()].flatMap((s) => (s.big ? [s.big] : []));
  const bigW = nar ? W : Math.max(0, ...bigs.map((b) => Math.max(...b.map((s, i) => m(s, i ? "sub" : "big")), 0))) + 8;
  const headW = nar ? W : Math.max(120, W - bigW - 24), hx = nar ? 0 : Math.min(60, W * 0.05);
  const rowsOf = (h: string[]) => h.map((s, i) => wrapRows(s, headW - hx, i ? "sub" : "body", 2, m));
  const headH = Math.max(0, ...heads.map((h) => rowsOf(h).reduce((a, rs, i) => a + rs.length * LINE_H[i ? "sub" : "body"], 0)));
  const bigH = Math.max(0, ...bigs.map((b) => (b[0] ? LINE_H.big : 0) + (b[1] ? LINE_H.sub : 0)));
  if (at.head) {
    let hy = y;
    rowsOf(at.head).forEach((rs, i) => { const f: Font = i ? "sub" : "body"; rs.forEach((row, r) => { text(`head:${i}:${r}`, hx, hy + LINE_H[f] - 3, row, f, i ? "muted" : "ink", "start"); hy += LINE_H[f]; }); });
  }
  const by = nar ? y + headH + 4 : y;
  if (at.big?.[0]) text("big:0", nar ? 0 : W, by + LINE_H.big - 5, at.big[0], "big", "tone", nar ? "start" : "end", "bad");
  if (at.big?.[1]) text("big:1", nar ? 0 : W, by + LINE_H.big + LINE_H.sub - 3, wrapRows(at.big[1], bigW, "sub", 1, m)[0], "sub", "muted", nar ? "start" : "end");
  y += (nar ? headH + bigH + 4 : Math.max(headH, bigH)) + (headH || bigH ? 28 : 0);

  // ---- the plot
  const limits = [...S.values()].flatMap((s) => (s.limit ? [s.limit.v] : []));
  const most = Math.max(0, Number(spec.opts["bar-most"]) || 0, ...(ctx.max[0] ?? []).map((v) => Number(v) || 0), ...vals, ...limits);
  const topTick = setup.ticks.length ? Math.max(...setup.ticks) : 0;
  const vmax = Math.max(topTick >= most ? topTick : most * 1.04, ...setup.lines.map((l) => l.v), 1e-9);
  const tickLab = (v: number) => (v === 0 ? "0" : withUnit(fmt(v), unit)); // fmt12: "1500 dollars", not "1500dollars"
  const leftW = Math.max(16, ...setup.ticks.map((t) => m(tickLab(t), "sub"))) + 8;
  const rightLabs = [...setup.lines.map((l) => l.name), ...[...S.values()].flatMap((s) => (s.limit?.s ? [s.limit.s] : []))];
  const rightW = Math.max(0, ...rightLabs.map((s) => m(s, nar ? "sub" : "body"))) + (rightLabs.length ? (nar ? 6 : 12) : 0);
  // wide: the plot runs from 5.6% to 92.4% of the stage's width, its top at about 11% and its height 28% of that width
  // (the stage's margins are 14 on each side and 8 above the first block), so a chart keeps its shape at every width
  const Ws = W + 28, x0 = nar ? leftW : Math.max(leftW, 0.056 * Ws - 14), x1 = nar ? W - rightW : Math.min(W - rightW, 0.924 * Ws - 14);
  const top = nar ? y + 8 : Math.max(y + 8, 0.10875 * Ws - 8), H = nar ? Math.max(130, 0.42 * W) : Math.max(180, 0.28125 * Ws), bot = top + H;
  const Y = (v: number) => bot - (v / vmax) * H, slot = (x1 - x0) / n, bw = slot * 0.774, BX = (i: number) => x0 + i * slot + slot * 0.258; // a bar, then the gap after it
  for (const t of setup.ticks) {
    prims.push({ k: "path", key: `g:y:${fmt(t)}`, d: `M${X(x0)} ${Yp(Y(t))}L${X(x1)} ${Yp(Y(t))}`, role: null, width: "thin", cls: "xy-grid" });
    text(`t:y:${fmt(t)}`, x0 - 6, Y(t) + 4, tickLab(t), "sub", "muted", "end", undefined, "xy-tick");
  }
  // ---- the bars
  const mv = S.get(step)?.moves ?? [];
  const labW = Math.max(0, ...Array.from({ length: n }, (_, i) => m(label(i), "sub") + 6));
  const every = setup.every || Math.max(1, Math.ceil(labW / slot));
  for (let i = 0; i < n; i++) {
    const v = vals[i], { tone } = barTone(setup, role, vals, step, i, at), p = paintOf(tone);
    const taken = mv.filter((q) => q.to === i).reduce((a, q) => a + q.k, 0), base = taken && v > prev[i] ? prev[i] : v;
    prims.push({ k: "rect", key: `b:${label(i)}:s0`, rect: { x: X(BX(i)), y: Yp(Math.min(Y(v), bot - 1)), w: r2(bw), h: r2(Math.max(1, bot - Y(v))) }, fill: "role", role: p.role, tone: p.tone, edge: "role", r: 1.5, cls: `xy-bar xy-sb-bar${p.tone ? " xy-sb-" + (p.tone === "accent" ? "acc" : p.tone) : ""}` });
    // a move's target: its old height, and the growth as stacked blocks
    if (taken && v > base) {
      const bh = (Y(base) - Y(v)) / taken;
      for (let j = 0; j < taken; j++) prims.push({ k: "rect", key: `blk:${label(i)}:${j}`, rect: { x: X(BX(i)), y: Yp(Y(v) + j * bh), w: r2(bw), h: r2(bh) }, fill: "soft", tone: "warn", edge: "line", r: 1, cls: "xy-sb-block" });
    }
    if (i % every === 0) text(`x:${i}`, Math.max(m(label(i), "sub") / 2, Math.min(W - m(label(i), "sub") / 2, BX(i) + bw / 2)), bot + 16, label(i), "sub", "muted", "middle", undefined, "xy-cat");
  }
  // ---- the reference lines: solid, from the start; their names at the right (inside, above the line, on a phone)
  const labYs: number[] = [];
  const rLab = (key: string, s: string, v: number, tone?: "accent") => {
    if (!nar) { text(key, x1 + 8, Y(v) + 5, s, "body", tone ? "tone" : "ink", "start", tone); return; }
    const gap = LINE_H.sub; let ly = Y(v) + 4; for (let g = 0; g < 8; g++) { const hit = labYs.find((o) => Math.abs(o - ly) < gap); if (hit === undefined) break; ly = ly < hit ? hit - gap : hit + gap; }
    labYs.push(ly); text(key, x1 + 4, ly, s, "sub", tone ? "tone" : "ink", "start", tone);
  };
  setup.lines.forEach((l, j) => { prims.push({ k: "path", key: `ref:${j}`, d: `M${X(x0)} ${Yp(Y(l.v))}L${X(x1)} ${Yp(Y(l.v))}`, role: null, width: "line", cls: "xy-sb-ref" }); rLab(`refl:${j}`, l.name, l.v); });
  // ---- the peak: a dotted line at the step's highest bar, the words above it at the left; the limit: a dashed line from its
  // step on, drawn over the peak's dots, so both show when they nearly meet
  const lim = at.limit;
  if (at.peak) {
    const v = Math.max(...vals);
    // in a step whose limit is the peak's own value the two lines would lie on each other; the limit's line is the one drawn there
    if (!(lim && Math.abs(Y(lim.v) - Y(v)) < 1)) prims.push({ k: "path", key: "peak:line", d: `M${X(x0)} ${Yp(Y(v))}L${X(x1)} ${Yp(Y(v))}`, role: null, width: "line", dashed: true, cls: "xy-sb-peak xy-dotted" });
    // the words sit above the peak's line, and above a limit line in force that runs just over it (else they touch it)
    const near = lim && Y(lim.v) <= Y(v) && Y(v) - Y(lim.v) < LINE_H.sub ? [Y(lim.v)] : [];
    const base = Math.min(Y(v), ...near), ls = wrapRows(at.peak, x1 - x0 - 8, "sub", 2, m);
    ls.forEach((t, q) => text(`peak:words:${q}`, x0 + 4, base - 5 - (ls.length - 1 - q) * LINE_H.sub, t, "sub", "tone", "start", "bad"));
  }
  if (lim) {
    prims.push({ k: "path", key: "limit:line", d: `M${X(x0)} ${Yp(Y(lim.v))}L${X(x1)} ${Yp(Y(lim.v))}`, role: null, width: "line", dashed: true, cls: "xy-sb-limit" });
    if (lim.s) rLab("limit:label", lim.s, lim.v, "accent");
  }
  // ---- moves: a dashed arrow from the giver's top to the taker's, this step only
  for (const q of mv) {
    // a smooth dashed curve that runs low: from the giver's top it bends toward the taker and comes in level, ending at the
    // taker's top corner on the giver's side with the head pointing back along the way it came
    const right = q.from > q.to, fx = BX(q.from) + bw * (right ? 0.3 : 0.7), fy = Y(vals[q.from]) - 2;
    const tx = right ? BX(q.to) + bw + 2 : BX(q.to) - 2, ty = Y(vals[q.to]) - 4;
    const cx = tx + (fx - tx) * 0.55, cy = ty; let d = "";
    for (let j = 0; j <= 24; j++) { const t = j / 24, u = 1 - t; d += `${j ? "L" : "M"}${X(u * u * fx + 2 * u * t * cx + t * t * tx)} ${Yp(u * u * fy + 2 * u * t * cy + t * t * ty)}`; }
    prims.push({ k: "path", key: `moveunder:${q.from}:${q.to}`, d, role: null, width: "line", cls: "xy-sb-clear" });
    prims.push({ k: "path", key: `move:${q.from}:${q.to}`, d, role: null, width: "line", dashed: true, arrow: "end", cls: "xy-sb-move" });
  }
  // ---- a lit bar's chip, over the bar
  const lit = S.get(step)?.bar;
  if (lit?.s) {
    const w = Math.ceil(m(lit.s, "chip")) + 2 * CHIP_PX, cx = Math.max(x0 + w / 2, Math.min(x1 - w / 2, BX(lit.i) + bw / 2));
    prims.push({ k: "chip", key: "lit:chip", x: X(cx - w / 2), y: Yp(Math.max(top - 6, Y(vals[lit.i]) - 26)), words: lit.s, role: null, tone: "accent" });
  }
  // ---- the axis title under the labels
  let h = bot + 22;
  if (title) for (const [r, row] of wrapRows(title, W - 8, "sub", 2, m).entries()) {
    const cx = (x0 + x1) / 2 > W / 2 ? W / 2 : (x0 + x1) / 2, hw = m(row, "sub") / 2;
    text(`title:${r}`, Math.max(hw, Math.min(W - hw, cx)), h + 12, row, "sub", "muted", "middle", undefined, "xy-title"); h += 15;
  }
  void steps;
  return prims;
}
