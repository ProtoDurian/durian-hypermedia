// This package is the source of this file: edit it here. It began as a copy of the private prototype's composed stage (0.7.0).
// Bars (stage block "bars"): a small bar chart inside a scene. Labelled bars stand on one value axis; each step sets
// the values, may draw reference lines (a limit, the peak), light a bar, or show things moving from one bar to
// others. The plot's place is fixed for the whole scene: a step changes heights and lights, never the frame.
//
// bars 7 team: day of the week · cups sold ÷ the weekly average | ×
// axis 0, 0.5, 1, 1.5
// line average: 1
// labels: Mon, Tue, Wed, Thu, Fri, Sat, Sun
// tabs Before: 1..2; After: 3
// @step Busy Friday: Friday sells the most.
// values: 0.8 0.9 0.9 1.0 1.4 1.1 0.9
// peak: busiest 1.4×
// heading: cups by day | the week of 3 March
// big: 1.4× | busiest ÷ average
// @step A cap: No day should go over 1.2.
// limit 1.2: cap 1.2×
// @step Move a shift: Friday hands work to Monday and Tuesday.
// values: 1.0 1.0 0.9 1.0 1.2 1.1 0.9
// move 2 from Fri to Mon; 1 from Sat to Tue
//
// Setup: `bars N [role]: axis title | unit` (1 to 64 bars), then indented `axis a, b, c` (labelled grid values),
// `line name: v` (a solid reference line), `every K`, `labels:...`, `tabs Name: 1..2; Name: 3` (tabs, one lit per
// step), `tone 23, 29 bad` (those bars in a tone on every step). Step words: `values: v v v` (kept until the next), `peak: words` (a dotted line at the step's highest bar,
// which is lit), `limit v: words` (a dashed line from this step on; bars over it are lit in this step), `heading: line |
// line`, `big: value | words` (kept until replaced), `light i: words` (one bar lit, a chip over it), `move k from a to b;...`
// (low dashed curves from the giver's top, in level to the taker's top corner; b's growth since the last values is drawn
// as k stacked blocks), `tone ids bad` / `off` (those bars in a tone from this step on).
import { most, type Item, type StageBlock, type Box, type LayoutOut, StageError, registerBlock, measure, wrap, parts, colon, chip, LINE_H } from "./stage-core";
import { docBudget } from "./stage-budget";

const MAX_BARS = 64, MAX_LINES = 8;
type Move = { from: number; to: number; k: number };
// what is in force at each step: the values, peak, words and limit kept from the step that set them, and the authored
// tones (the head's on every step, a step's from that step on); the layout and the LLM view read the same
type At = { values: number[]; peak?: string; head?: string[]; big?: string[]; limit?: { v: number; s: string; from: number } };
function inForce(b: Bars, steps: number): { at: At[]; toneAt: Map<number, string>[] } {
  const at: At[] = []; let cur: At = { values: Array(b.n).fill(0) };
  const started = [...b.steps.keys()].some((k) => k === 0) ? b.steps.get(0)!.values : undefined;
  if (started) cur = { values: started };
  for (let k = 1; k <= steps; k++) {
    const s = b.steps.get(k);
    cur = { ...cur, values: s?.values ?? cur.values, peak: s?.peak ?? cur.peak, head: s?.head ?? cur.head, big: s?.big ?? cur.big, limit: s?.limit ? { ...s.limit, from: k } : cur.limit };
    at[k] = cur;
  }
  const toneAt: Map<number, string>[] = []; let tcur = new Map<number, string>(b.tones);
  for (let k = 1; k <= steps; k++) { const st = b.steps.get(k)?.tone; if (st) { tcur = new Map(tcur); for (const [i, t] of st) t ? tcur.set(i, t) : tcur.delete(i); } toneAt[k] = tcur; }
  return { at, toneAt };
}
// the LLM view asks step by step: work out what is in force once (to twice the step asked, so a long tail of steps
// without bar words stays linear) and keep it with the block
const factsMemo = new WeakMap<Bars, { n: number; at: At[]; toneAt: Map<number, string>[] }>();
function factsInForce(b: Bars, step: number): { at: At[]; toneAt: Map<number, string>[] } {
  let m = factsMemo.get(b);
  if (!m || m.n < step) { const n = Math.max(2 * step, ...b.steps.keys()); docBudget().charge("stage bars", b.n * n + 1); m = { n, ...inForce(b, n) }; factsMemo.set(b, m); }
  return m;
}
// one bar's paint in one step, and in words why it is lit ("" when it has the plain paint); the last rule that matches wins
function barTone(b: Bars, at: At[], toneAt: Map<number, string>[], k: number, i: number): { tone: string; why: string } {
  const a = at[k], s = b.steps.get(k), v = a.values[i], hi = Math.max(...a.values), mv = s?.moves ?? [];
  let tone = b.role ? `role:${b.role}` : "acc", why = "";
  // The authored peak stays highlighted regardless of the cap; only a giver's automatic warning requires excess.
  const over = !a.limit || v > a.limit.v;
  if (a.peak && v === hi) { tone = "bad"; why = "the peak"; }
  if (s?.limit && v > s.limit.v && v !== hi) { tone = "warn"; why = "over the limit"; }
  if (mv.some((m) => m.from === i) && over) { tone = "warn"; why = "gives"; }
  if (mv.some((m) => m.to === i)) { tone = "good"; why = "takes"; }
  const byAuthor = toneAt[k].get(i); if (byAuthor) { tone = byAuthor === "accent" ? "acc" : byAuthor; why = `marked ${byAuthor}`; } // the author's tone wins over the worked-out ones
  if (s?.bar?.i === i) { tone = "acc"; why = s.bar.s ? `lit: ${s.bar.s}` : "lit"; }
  return { tone, why };
}
type Step = { values?: number[]; peak?: string; limit?: { v: number; s: string }; head?: string[]; big?: string[]; bar?: { i: number; s: string }; moves: Move[]; tone?: [number, string | null][] };
type Bars = { n: number; role: string; title: string; unit: string; ticks: number[]; lines: { name: string; v: number }[]; every: number; labels: string[]; tabs: { name: string; a: number; b: number }[]; steps: Map<number, Step>; line: number; most: number; tones: [number, string][] };
const num = (s: string) => (/^-?\d{1,9}(\.\d{1,9})?$/.test(s.trim()) ? +s.trim() : NaN);
const fmt = (v: number) => String(+v.toFixed(6));
function axisName(b: Bars): string {
  const s = `${b.n}|${b.title}|${b.unit}`; let h = 2166136261;
  docBudget().charge("stage bars", s.length + 1);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return `bars-${h.toString(36)}`;
}
const stepOf = (b: Bars, k: number) => { let s = b.steps.get(k); if (!s) { s = { moves: [] }; b.steps.set(k, s); } return s; };
const barIndex = (b: Bars, w: string) => b.labels.indexOf(w.trim());
// "tone ids <tone>" (the words pass verb): those bars in a tone, from the step on (in the head: on every step); "off" undoes
const BAR_TONES = ["good", "bad", "warn", "accent"];
/** the bars a tone line names ("23", "23, 29", "Mon..Wed"), or undefined when one is not a bar */
function toneIds(b: Bars, ids: string): number[] | undefined {
  const out: number[] = [];
  for (const p of parts(ids, ",")) {
    const d = p.indexOf(".."), a = barIndex(b, d < 0 ? p : p.slice(0, d)), z = d < 0 ? a : barIndex(b, p.slice(d + 2));
    if (a < 0 || z < a) return undefined;
    for (let i = a; i <= z; i++) out.push(i);
  }
  return out.length ? out : undefined;
}
const toneLine = (rest: string) => { const sp = rest.lastIndexOf(" "); return sp < 0 ? undefined : { ids: rest.slice(0, sp), tone: rest.slice(sp + 1) }; };
const toneShape = `"tone <bars> good|bad|warn|accent" (or off): "tone 23 bad", "tone Mon, Fri warn"`;

registerBlock({
  word: "bars", kind: "head", ops: ["values", "bars", "peak", "limit", "heading", "big", "light", "move", "tone"], more: ["values"],
  parse(inp, ctx): Bars {
    const k = inp.arg.indexOf(": "), head = (k < 0 ? inp.arg.replace(/:$/, "") : inp.arg.slice(0, k)).trim(), rest = k < 0 ? "" : inp.arg.slice(k + 2);
    const [nTxt, role = "", extra] = head.split(" ");
    const n = num(nTxt ?? "");
    if (!Number.isInteger(n) || n < 1 || n > MAX_BARS || extra !== undefined) throw new StageError(inp.line, `bars names how many bars it draws, 1 to ${MAX_BARS}, and optionally a role: "bars 7 team: axis title | unit"`);
    if (role && !ctx.roles.has(role)) ctx.problem(inp.line, `"${role}" is not a role of this page; the page declares ${[...ctx.roles].join(", ") || "none"}`);
    const [title = "", unit = ""] = rest.split(" | ").map((x) => x.trim());
    const b: Bars = { n, role, title, unit, ticks: [], lines: [], every: 0, labels: Array.from({ length: n }, (_, i) => String(i)), tabs: [], steps: new Map(), line: inp.line, most: 0, tones: [] };
    const once = new Set<string>();
    for (const l of inp.body) {
      docBudget().charge("stage bars", l.t.length + 1);
      const w = l.t.split(" ")[0].replace(/:$/, "");
      if (["axis", "every", "labels", "tabs"].includes(w)) { if (once.has(w)) throw new StageError(l.n, `${w} is written once`); once.add(w); }
      if (w === "axis") {
        const xs = parts(l.t.slice(5), ",").map(num);
        if (!xs.length || xs.some((x) => !Number.isFinite(x) || x < 0) || xs.some((x, i) => i && x <= xs[i - 1])) throw new StageError(l.n, `axis lists increasing values from 0 up, split by commas: "axis 0, 0.5, 1, 1.5"`);
        b.ticks = xs; continue;
      }
      if (w === "line") {
        const c = colon(l.t.slice(5)); const v = c ? num(c[1]) : NaN;
        if (!c || !c[0].trim() || !Number.isFinite(v) || v < 0) throw new StageError(l.n, `a reference line is "line name: value": "line average: 1"`);
        if (b.lines.length >= MAX_LINES) throw new StageError(l.n, `bars draw at most ${MAX_LINES} reference lines`);
        b.lines.push({ name: c[0].trim(), v }); continue;
      }
      if (w === "every") { const e = num(l.t.slice(6)); if (!Number.isInteger(e) || e < 1 || e > n) throw new StageError(l.n, `every names how often a bar is labelled, 1 to ${n}: "every 4"`); b.every = e; continue; }
      if (w === "labels") {
        const ls = parts(l.t.slice(l.t.indexOf(":") + 1), ",");
        if (ls.length !== n) throw new StageError(l.n, `${n} bars but ${ls.length} labels: give one label per bar`);
        if (new Set(ls).size !== ls.length) throw new StageError(l.n, "a bar label is used twice");
        b.labels = ls; continue;
      }
      if (w === "tabs") {
        for (const t of parts(l.t.slice(5), ";")) {
          const c = colon(t), r = c ? c[1].trim() : "", d = r.indexOf(".."), a = num(d < 0 ? r : r.slice(0, d)), z = d < 0 ? a : num(r.slice(d + 2));
          if (!c || !c[0].trim() || !Number.isInteger(a) || !Number.isInteger(z) || a < 1 || z < a) throw new StageError(l.n, `tabs lists tabs and their steps: "tabs Before: 1..2; After: 3"`);
          b.tabs.push({ name: c[0].trim(), a, b: z });
        }
        if (b.tabs.length > 6) throw new StageError(l.n, "tabs holds at most 6 tabs");
        continue;
      }
      if (w === "tone") {
        const t = toneLine(l.t.slice(5)), ids = t && toneIds(b, t.ids);
        if (!t || !ids || !BAR_TONES.includes(t.tone)) throw new StageError(l.n, `under bars, ${toneShape}: the bars in that tone on every step`);
        for (const i of ids) b.tones.push([i, t.tone]);
        continue;
      }
      throw new StageError(l.n, `under bars: axis, line, every, labels, tabs or tone`);
    }
    return b;
  },
  op(b: Bars, op, ctx) {
    const s = stepOf(b, op.step), arg = op.arg.startsWith(": ") ? op.arg.slice(2) : op.arg.replace(/^:$/, "");
    docBudget().charge("stage bars", arg.length + 1);
    switch (op.word) {
      case "values": case "bars": {
        const xs = arg.split(/[\s,]+/).filter(Boolean).map(num);
        if (xs.length !== b.n || xs.some((x) => !Number.isFinite(x) || x < 0)) { ctx.problem(op.line, `values lists ${b.n} numbers from 0 up, one per bar (${xs.length} given)`); return; }
        if (s.values) { ctx.problem(op.line, "values is written once a step"); return; }
        s.values = xs; b.most = Math.max(b.most, ...xs); return;
      }
      case "peak": s.peak = arg.trim(); return;
      case "heading": s.head = arg.split(" | ").map((x) => x.trim()).slice(0, 2); return;
      case "big": s.big = arg.split(" | ").map((x) => x.trim()).slice(0, 2); return;
      case "limit": {
        const c = colon(arg) ?? [arg, ""], v = num(c[0]);
        if (!Number.isFinite(v) || v < 0) { ctx.problem(op.line, `limit names a value on the axis: "limit 1.2: cap 1.2×"`); return; }
        if (s.limit) { ctx.problem(op.line, "limit is written once a step"); return; }
        s.limit = { v, s: c[1].trim() }; b.most = Math.max(b.most, v); return;
      }
      case "light": {
        const c = colon(arg) ?? [arg, ""], i = barIndex(b, c[0]);
        if (i < 0 && op.shared) return false;
        if (i < 0) { ctx.problem(op.line, `"${c[0]}" is not a bar (${b.labels.slice(0, 8).join(", ")}${b.n > 8 ? ", ..." : ""})`); return; }
        s.bar = { i, s: c[1].trim() }; return;
      }
      case "tone": {
        const t = toneLine(arg), ids = t && toneIds(b, t.ids);
        if (!ids && op.shared) return false;
        if (!t || !ids || (t.tone !== "off" && !BAR_TONES.includes(t.tone))) { ctx.problem(op.line, toneShape); return; }
        for (const i of ids) (s.tone ??= []).push([i, t.tone === "off" ? null : t.tone]);
        return;
      }
      case "move": {
        // "move 2 from Fri to Mon; 1 from Fri to Tue" (the words pass: one verb, "move <what> to <where>")
        const shape = `a bar move is "move <count> from <bar> to <bar>", several split by ";": "move 2 from Fri to Mon; 1 from Sat to Tue"`;
        const ms: Move[] = [];
        for (const m of parts(arg, ";")) {
          const fi = m.indexOf(" from "), ti = fi < 0 ? -1 : m.indexOf(" to ", fi + 6);
          const k = fi < 0 ? NaN : num(m.slice(0, fi)), f = ti < 0 ? -1 : barIndex(b, m.slice(fi + 6, ti)), to = ti < 0 ? -1 : barIndex(b, m.slice(ti + 4));
          // a line that is not a bar move may belong to another block that owns "move" (the stage says so in op.shared)
          if (fi < 0 || ti < 0 || f < 0 || to < 0) { if ((op as { shared?: boolean }).shared) return false; ctx.problem(op.line, shape); return; }
          if (f === to) { ctx.problem(op.line, `a move goes between two different bars: "${m}"`); return; }
          if (!Number.isInteger(k) || k < 1 || k > 40) { ctx.problem(op.line, `a move's count is a whole number, 1 to 40: "move 2 from Fri to Mon"`); return; }
          ms.push({ from: f, to, k });
        }
        if (!ms.length) { ctx.problem(op.line, shape); return; }
        s.moves.push(...ms);
        if (s.moves.length > 16) ctx.problem(op.line, "a step shows at most 16 moves");
        return;
      }
    }
  },
  layout(b: Bars, box: Box): LayoutOut {
    const items: Item[] = [], moveUnder: Item[] = [], steps = Math.max(box.steps, ...b.steps.keys(), 1), W = box.w, nar = box.narrow;
    docBudget().charge("stage bars", b.n * steps * 3 + 50, b.n * steps);
    const { at, toneAt } = inForce(b, steps);
    let y = 0;
    // the tabs: one lit per step
    if (b.tabs.length) {
      const ws = b.tabs.map((t) => measure(t.name, "lane") + 20), tot = ws.reduce((a, x) => a + x, 0);
      let x = Math.max(0, (W - tot) / 2);
      b.tabs.forEach((t, i) => {
        const on = Array.from({ length: steps }, (_, j) => j + 1), lit = on.filter((k) => k >= t.a && k <= t.b);
        const s = wrap(t.name, ws[i] - 8, "lane", 1)[0];
        items.push({ k: "text", x: x + ws[i] / 2, y: 17, s, f: "lane", ink: "ink-2", anchor: "middle", on: on.filter((k) => !lit.includes(k)) });
        items.push({ k: "text", x: x + ws[i] / 2, y: 17, s, f: "lane", ink: "acc:ink", anchor: "middle", on: lit });
        items.push({ k: "box", x: x + 2, y: 25, w: ws[i] - 4, h: 3, fill: "acc:line", stroke: "none", r: 1.5, on: lit });
        x += ws[i];
      });
      y += 38;
    }
    // the heading (left) and the big number (right; under the heading on a phone): their place is the tallest step's
    const bigW = nar ? W : Math.max(0, ...at.slice(1).map((a) => Math.max(...(a.big ?? []).map((s, i) => measure(s, i ? "sub" : "big")), 0))) + 8;
    const headW = nar ? W : Math.max(120, W - bigW - 24), hx = nar ? 0 : Math.min(60, W * 0.05);
    const headH = Math.max(0, ...at.slice(1).map((a) => (a.head ?? []).reduce((h, s, i) => h + wrap(s, headW - hx, i ? "sub" : "body", 2).length * LINE_H[i ? "sub" : "body"], 0)));
    const bigH = Math.max(0, ...at.slice(1).map((a) => (a.big?.[0] ? LINE_H.big : 0) + (a.big?.[1] ? LINE_H.sub : 0)));
    for (let k = 1; k <= steps; k++) {
      const a = at[k], when = { on: [k] };
      let hy = y;
      (a.head ?? []).forEach((s, i) => { const f = i ? "sub" : "body"; for (const row of wrap(s, headW - hx, f, 2)) { items.push({ k: "text", x: hx, y: hy + LINE_H[f] - 3, s: row, f, ink: i ? "muted" : "ink", ...when }); hy += LINE_H[f]; } });
      const by = nar ? y + headH + 4 : y;
      if (a.big?.[0]) items.push({ k: "text", x: nar ? 0 : W, y: by + LINE_H.big - 5, s: a.big[0], f: "big", ink: "bad:ink", anchor: nar ? "start" : "end", ...when });
      if (a.big?.[1]) items.push({ k: "text", x: nar ? 0 : W, y: by + LINE_H.big + LINE_H.sub - 3, s: wrap(a.big[1], bigW, "sub", 1)[0], f: "sub", ink: "muted", anchor: nar ? "start" : "end", ...when });
    }
    y += (nar ? headH + bigH + 4 : Math.max(headH, bigH)) + (headH || bigH ? 28 : 0);
    // the plot
    const topTick = b.ticks.length ? Math.max(...b.ticks) : 0;
    const vmax = Math.max(topTick >= b.most ? topTick : b.most * 1.04, ...b.lines.map((l) => l.v), 1e-9);
    const tickLab = (v: number) => (v === 0 ? "0" : fmt(v) + b.unit);
    const leftW = Math.max(16, ...b.ticks.map((t) => measure(tickLab(t), "sub"))) + 8;
    const rightLabs = [...b.lines.map((l) => l.name), ...[...b.steps.values()].flatMap((s) => (s.limit?.s ? [s.limit.s] : []))];
    // a phone keeps a margin for the line labels too, in the small type
    const rightW = Math.max(0, ...rightLabs.map((s) => measure(s, nar ? "sub" : "body"))) + (rightLabs.length ? (nar ? 6 : 12) : 0);
    // wide: the plot runs from 5.6% to 92.4% of the stage's width, its top at about 11% and its height 28% of that width
    // (the stage's margins are PAD on each side and 8 above the first block), so a chart keeps its shape at every width
    const Ws = W + 28, x0 = nar ? leftW : Math.max(leftW, 0.056 * Ws - 14), x1 = nar ? W - rightW : Math.min(W - rightW, 0.924 * Ws - 14);
    const top = nar ? y + 8 : Math.max(y + 8, 0.10875 * Ws - 8), H = nar ? Math.max(130, 0.42 * W) : Math.max(180, 0.28125 * Ws), bot = top + H;
    const Y = (v: number) => bot - (v / vmax) * H, slot = (x1 - x0) / b.n, bw = slot * 0.774, BX = (i: number) => x0 + i * slot + slot * 0.258; // a bar, then the gap after it: a line along the axis starts in a gap
    const name = axisName(b), authored = b.labels.some((l, j) => l !== String(j)); // the author's labels name each bar for the bar
    items.push({ k: "box", x: x0, y: top, w: x1 - x0, h: H, fill: "none", stroke: "none", r: 0, bar: { kind: "axis", axis: name, min: 0, max: vmax, "axis-direction": "y" } });
    for (const t of b.ticks) {
      items.push({ k: "path", pts: [[x0, Y(t)], [x1, Y(t)]], ink: "line", w: 1, id: `grid:${fmt(t)}`, bar: { track: name, value: t } });
      items.push({ k: "text", x: x0 - 6, y: Y(t) + 4, s: tickLab(t), f: "sub", ink: "muted", anchor: "end" });
    }
    // the bars: one item per run of steps with the same height and paint, so nothing moves inside a run
    const all = Array.from({ length: steps }, (_, j) => j + 1), runId = new Map<string, string>();
    for (let i = 0; i < b.n; i++) {
      const runs = new Map<string, number[]>();
      for (const k of all) {
        const a = at[k], s = b.steps.get(k), v = a.values[i], mv = s?.moves ?? [];
        const tone = barTone(b, at, toneAt, k, i).tone;
        // a move's target: its old height, and the growth as stacked blocks
        const prev = k > 1 ? at[k - 1].values[i] : v, k2 = mv.filter((m) => m.to === i).reduce((a2, m) => a2 + m.k, 0);
        const key = `${v}|${tone}|${k2 ? prev : ""}|${k2}`;
        (runs.get(key) ?? runs.set(key, []).get(key)!).push(k);
      }
      for (const [key, on] of runs) {
        const [vs, tone, prevS, k2s] = key.split("|"), v = +vs, k2 = +k2s, base = k2 && v > +prevS ? +prevS : v;
        const rid = `bar:${i}:${on[0]}`;
        for (const k of on) runId.set(`${i}:${k}`, rid);
        items.push({ k: "box", x: BX(i), y: Y(v), w: bw, h: bot - Y(v), fill: `${tone}:line`, stroke: `${tone}:line`, r: 1.5, cls: "scn-shape stg-bar", id: rid, on, bar: { kind: "panel", id: rid, column: `${name}:${i}`, ...(authored ? { label: b.labels[i] } : {}) } });
        if (k2 && v > base) {
          const bh = (Y(base) - Y(v)) / k2;
          for (let j = 0; j < k2; j++) items.push({ k: "box", x: BX(i), y: Y(v) + j * bh, w: bw, h: bh, fill: "warn:soft", stroke: "warn:line", r: 1, cls: "stg-block", on, bar: { kind: "chip" } });
        }
        items.push({ k: "path", pts: [[BX(i), Y(v)], [BX(i) + bw, Y(v)]], ink: `${tone}:line`, w: 1, id: `top:${i}:${on[0]}`, on, bar: { track: name, value: v } });
      }
      if (i % (b.every || Math.max(1, Math.ceil(Math.max(...b.labels.map((l) => measure(l, "sub") + 6)) / slot))) === 0)
        items.push({ k: "text", x: BX(i) + bw / 2, y: bot + 16, s: b.labels[i], f: "sub", ink: "muted", anchor: "middle" });
    }
    // the reference lines: solid, from the start; their names at the right (inside, above the line, on a phone)
    // labels of lines close together keep a line apart on a phone (average 1.0 and a limit 1.1 on a short plot)
    const labYs: number[] = [];
    const rLab = (s: string, v: number, ink: string, k?: { from: number; to?: number }) => {
      if (!nar) { items.push({ k: "text", x: x1 + 8, y: Y(v) + 5, s, f: "body", ink, ...k }); return; }
      const gap = LINE_H.sub; let ly = Y(v) + 4; for (let g = 0; g < 8; g++) { const hit = labYs.find((o) => Math.abs(o - ly) < gap); if (hit === undefined) break; ly = ly < hit ? hit - gap : hit + gap; }
      labYs.push(ly); items.push({ k: "text", x: x1 + 4, y: ly, s, f: "sub", ink, ...k });
    };
    for (const l of b.lines) { items.push({ k: "path", pts: [[x0, Y(l.v)], [x1, Y(l.v)]], ink: "line-2", w: 2, id: `marker:line:${l.name}`, bar: { track: name, value: l.v } }); rLab(l.name, l.v, "ink"); }
    // peaks: a dotted line at the step's highest bar, the words above it at the left (one line when they fit); limits: a
    // dashed line from their step on, drawn over the peak's dots, so both show when they nearly meet (a peak just under
    // the limit), as the originals draw them
    const lims = [...b.steps.entries()].filter(([, s]) => s.limit).sort((p, q) => p[0] - q[0]);
    const peaks = new Map<string, number[]>();
    for (const k of all) if (at[k].peak) { const key = `${Math.max(...at[k].values)}|${at[k].peak}`; (peaks.get(key) ?? peaks.set(key, []).get(key)!).push(k); }
    for (const [key, on] of peaks) {
      const p = key.indexOf("|"), v = +key.slice(0, p), s = key.slice(p + 1);
      // in a step whose limit is the peak's own value the two lines
      // would lie on each other; the limit's dashed line is the one drawn there, the peak keeps its words over it
      const lineOn = on.filter((k) => !(at[k].limit && Math.abs(Y(at[k].limit!.v) - Y(v)) < 1));
      if (lineOn.length) items.push({ k: "path", pts: [[x0, Y(v)], [x1, Y(v)]], ink: "bad:line", dash: true, dot: true, w: 2.5, id: `marker:peak:${fmt(v)}`, on: lineOn, bar: { track: name, value: v } });
      if (s) {
        // the words sit above the peak's line, and above a limit line in force that runs just over it (else they touch it)
        const near = on.flatMap((k) => (at[k].limit && Y(at[k].limit!.v) <= Y(v) && Y(v) - Y(at[k].limit!.v) < LINE_H.sub ? [Y(at[k].limit!.v)] : []));
        const base = Math.min(Y(v), ...near), ls = wrap(s, x1 - x0 - 8, "sub", most(2));
        ls.forEach((t, q) => items.push({ k: "text", x: x0 + 4, y: base - 5 - (ls.length - 1 - q) * LINE_H.sub, s: t, f: "sub", ink: "bad:ink", on }));
      }
    }
    lims.forEach(([k, s], j) => {
      const to = lims[j + 1]?.[0] ? lims[j + 1][0] - 1 : 0, v = s.limit!.v, when = { from: k, to };
      items.push({ k: "path", pts: [[x0, Y(v)], [x1, Y(v)]], ink: "acc:line", dash: true, w: 2, id: `marker:limit:${fmt(v)}`, bar: { track: name, value: v }, ...when });
      if (s.limit!.s) rLab(s.limit!.s, v, "acc:ink", when);
    });
    // moves: a dashed arrow from the giver's top to the taker's, this step only
    for (const [k, s] of b.steps) {
      if (k < 1) continue;
      for (const m of s.moves) {
        // a smooth dashed curve that runs low: from the giver's top it bends toward the taker and comes in level, ending at
        // the taker's top corner on the giver's side with the head pointing back along the way it came (left when the giver
        // is to the right), as the originals draw a move
        const v = at[k].values, right = m.from > m.to, fx = BX(m.from) + bw * (right ? 0.3 : 0.7), fy = Y(v[m.from]) - 2;
        const tx = right ? BX(m.to) + bw + 2 : BX(m.to) - 2, ty = Y(v[m.to]) - 4;
        const cx = tx + (fx - tx) * 0.55, cy = ty, arc: [number, number][] = [];
        // a fine polyline (no corner rounding: that is for right-angle paths and would kink a curve at every point)
        for (let j = 0; j <= 24; j++) { const t = j / 24, u = 1 - t; arc.push([u * u * fx + 2 * u * t * cx + t * t * tx, u * u * fy + 2 * u * t * cy + t * t * ty]); }
        // The clearance goes behind the data: it may separate a move from the grid, but never erase a bar's top.
        moveUnder.push({ k: "path", pts: arc, ink: "surface", w: nar ? 5 : 6, on: [k], bar: { ignore: 1 } });
        items.push({ k: "path", pts: arc, ink: "acc:line", dash: true, arrow: true, head: nar ? 11 : 15, w: nar ? 2 : 2.5, id: `move:${m.from}:${m.to}:${k}`, on: [k], bar: { edge: 1, from: runId.get(`${m.from}:${k}`) ?? "", to: runId.get(`${m.to}:${k}`) ?? "" } });
      }
      if (s.bar?.s) { const v = at[k].values[s.bar.i], c = chip(0, 0, s.bar.s, "acc"); const cx = Math.max(x0 + c.w / 2, Math.min(x1 - c.w / 2, BX(s.bar.i) + bw / 2)); items.push(...chip(cx, Math.max(top - 6, Y(v) - 26), s.bar.s, "acc").items.map((it) => ({ ...it, on: [k] }))); }
    }
    // the axis title under the labels
    let h = bot + 22;
    if (b.title) for (const row of wrap(b.title, W - 8, "sub", 2)) { items.push({ k: "text", x: (x0 + x1) / 2 > W / 2 ? W / 2 : (x0 + x1) / 2, y: h + 12, s: row, f: "sub", ink: "muted", anchor: "middle" }); h += 15; }
    for (const it of items) if (it.k === "text" && it.anchor === "middle") { const hw = measure(it.s, it.f) / 2; it.x = Math.max(hw, Math.min(W - hw, it.x)); }
    return { h: h + 6, items: [...moveUnder, ...items] };
  },
  facts(b: Bars, step) {
    const tabSteps = (t: { a: number; b: number }) => (t.a === t.b ? `step ${t.a}` : `steps ${t.a} to ${t.b}`);
    if (step === 0) {
      const v0 = b.steps.get(0)?.values;
      return [`Bars: ${b.title || "values"}${b.unit ? ` (${b.unit})` : ""}, ${b.n} bars${b.ticks.length ? `, axis ${b.ticks.map(fmt).join(", ")}` : ""}.`, ...(b.tabs.length ? [`Tabs: ${b.tabs.map((t) => `${t.name} (${tabSteps(t)})`).join(", ")}.`] : []), ...b.lines.map((l) => `Line ${l.name} at ${fmt(l.v)}.`), ...(v0 ? [`Values: ${v0.map((v, i) => `${b.labels[i]} ${fmt(v)}`).join(", ")}.`] : [])];
    }
    // the drawing's paint: which bars are lit in this step and why, and the tab lit when it changes
    const { at, toneAt } = factsInForce(b, step), lit: string[] = [], plainAt: string[] = [], lim = at[step].limit;
    // An unhighlighted bar at the limit stays plain; authored highlights also say "at the limit", never "over".
    for (let i = 0; i < b.n; i++) {
      const w = barTone(b, at, toneAt, step, i).why, v = at[step].values[i], on = !!lim && v === lim.v;
      if (w) lit.push(`${b.labels[i]} ${fmt(v)} (${w}${on ? "; at the limit" : ""})`); else if (on) plainAt.push(`${b.labels[i]} ${fmt(v)}`);
    }
    const tabOn = (k: number) => b.tabs.findIndex((t) => k >= t.a && k <= t.b), tab = tabOn(step);
    const s = b.steps.get(step);
    const out: string[] = [];
    if (tab >= 0 && (step === 1 || tab !== tabOn(step - 1))) out.push(`Tab: ${b.tabs[tab].name}.`);
    const atText = plainAt.length ? `at the limit ${fmt(lim!.v)}, not lit: ${plainAt.join(", ")}` : "";
    const tail = lit.length ? [`Lit bars: ${lit.join(", ")}${atText ? "; " + atText : ""}.`] : atText ? [`Bars ${atText}.`] : [];
    if (!s) return [...out, ...tail];
    if (s.head) out.push(s.head.join(" · ") + ".");
    if (s.values) { docBudget().charge("stage bars", s.values.length + 1); out.push(`Values: ${s.values.map((v, i) => `${b.labels[i]} ${fmt(v)}`).join(", ")}.`); }
    if (s.peak) out.push(`Peak: ${s.peak}.`);
    if (s.big) out.push(s.big.join(": ") + ".");
    if (s.limit) out.push(`Limit ${fmt(s.limit.v)}${s.limit.s ? `: ${s.limit.s}` : ""}.`);
    if (s.moves.length) out.push(`Moves: ${s.moves.map((m) => `${b.labels[m.from]} to ${b.labels[m.to]} (${m.k})`).join(", ")}.`);
    return [...out, ...tail];
  },
} satisfies StageBlock<Bars>);
