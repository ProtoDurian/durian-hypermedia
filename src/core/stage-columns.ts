// This package is the source of this file: edit it here. It began as a copy of the private prototype's composed stage (0.7.0).
// Columns (stage block "columns"): a dot histogram. One column per category, one small mark per counted thing,
// stacked from the bottom; each step sets the counts and may light some columns as new. The columns' places are
// reserved for the widest step, so a column never moves; a step only shows, hides and lights.
//
// columns 12 team: tickets closed per month, one dot each | tickets
// every 3
// labels: Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec
// @step First half: Six months of tickets.
// counts 6: 12, 9, 14, 11, 15, 8
// @step The year: The second half adds six columns.
// counts 12: 12, 9, 14, 11, 15, 8, 10, 13, 9, 16, 12, 7
// light 7..12
//
// `columns N [role]: caption | unit` reserves N columns (1 to 64), coloured by the role when one is given. Under it:
// `every K` labels every K-th column (default: as often as the labels fit), `labels: a, b,...` names the columns
// (default: 0, 1, 2,...), `leaving: darker` darkens a dot until a later step takes it away. Step words: `counts M: n, n,
//...` (the first M columns' counts, kept until the next `counts`; `19 [1 11 18]` keeps places 1, 11 and 18 empty, so
// a dot that stays never moves), `light a..b` or `light a, b` (those columns, by label or number, lit as new in this step: their frame is lit, and
// only the dots that came since the step before are warm; dots already there keep their tone).
import { type Item, type StageBlock, type Box, type LayoutOut, StageError, registerBlock, measure, wrap, parts } from "./stage-core";
import { docBudget } from "./stage-budget";

const MAX_COLS = 64, MAX_COUNT = 500, MAX_DOTS = 6000;
type Cols = { n: number; role: string; caption: string; unit: string; every: number; labels: string[]; counts: Map<number, number[]>; gaps: Map<number, number[][]>; fresh: Map<number, number[]>; leaving: boolean; line: number; steps: number };
const int = (s: string) => (/^\d{1,7}$/.test(s.trim()) ? +s.trim() : NaN);

/** a short stable name for this block's axis (the bar finds marks by it; two scenes on a page must not share one) */
function axisName(c: Cols): string {
  const s = `${c.n}|${c.caption}|${c.unit}`; let h = 2166136261;
  docBudget().charge("stage columns", s.length + 1);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return `cols-${h.toString(36)}`;
}
/** which column an author word names: its label, or its number when the columns are numbered */
function colIndex(c: Cols, w: string): number { const k = c.labels.indexOf(w); return k; }

registerBlock({
  word: "columns", kind: "head", ops: ["counts", "light"],
  parse(inp, ctx): Cols {
    const k = inp.arg.indexOf(": "), head = (k < 0 ? inp.arg.replace(/:$/, "") : inp.arg.slice(0, k)).trim(), rest = k < 0 ? "" : inp.arg.slice(k + 2);
    const [nTxt, role = "", extra] = head.split(" ");
    const n = int(nTxt ?? "");
    if (!Number.isInteger(n) || n < 1 || n > MAX_COLS || extra !== undefined) throw new StageError(inp.line, `columns names how many columns it keeps, 1 to ${MAX_COLS}, and optionally a role: "columns 12 team: caption | unit"`);
    if (role && !ctx.roles.has(role)) ctx.problem(inp.line, `"${role}" is not a role of this page; the page declares ${[...ctx.roles].join(", ") || "none"}`);
    const [caption = "", unit = ""] = rest.split(" | ").map((x) => x.trim());
    const c: Cols = { n, role, caption, unit, every: 0, labels: Array.from({ length: n }, (_, i) => String(i)), counts: new Map(), gaps: new Map(), fresh: new Map(), leaving: false, line: inp.line, steps: 0 };
    let named = false;
    for (const b of inp.body) {
      docBudget().charge("stage columns", b.t.length + 1);
      if (b.t.startsWith("every ")) {
        const e = int(b.t.slice(6)); if (!Number.isInteger(e) || e < 1 || e > n) throw new StageError(b.n, `every names how often a column is labelled, 1 to ${n}: "every 4"`);
        if (c.every) throw new StageError(b.n, "every is written once"); c.every = e; continue;
      }
      if (b.t.startsWith("labels:")) {
        if (named) throw new StageError(b.n, "labels: is written once");
        const ls = parts(b.t.slice(7), ",");
        if (ls.length !== n) throw new StageError(b.n, `${n} columns but ${ls.length} labels: give one label per column`);
        const seen = new Set<string>(); for (const l of ls) { if (seen.has(l)) throw new StageError(b.n, `the label "${l}" is used twice`); seen.add(l); }
        c.labels = ls; named = true; continue;
      }
      if (b.t === "leaving: darker") { c.leaving = true; continue; }
      throw new StageError(b.n, `under columns: "every 4", "labels: a, b, c" or "leaving: darker"`);
    }
    return c;
  },
  op(c: Cols, op, ctx) {
    c.steps = Math.max(c.steps, op.step);
    if (op.word === "counts") {
      const k = op.arg.indexOf(": "), pre = k < 0 ? "" : op.arg.slice(0, k).trim(), m = int(pre), list = k < 0 ? op.arg : op.arg.slice(k + 2);
      docBudget().charge("stage columns", list.length + 1);
      // a count may name the places its dots left, in brackets: "19 [1 11 18]" (a dot that stays never moves)
      const gs: number[][] = [], xs = list.split(",").map((x) => {
        const q = x.indexOf("["), g = q < 0 ? [] : x.trim().endsWith("]") ? x.slice(q + 1, x.lastIndexOf("]")).split(" ").filter(Boolean).map(int) : [NaN];
        gs.push(g); return g.some((v) => !Number.isInteger(v)) || new Set(g).size !== g.length ? NaN : int(q < 0 ? x : x.slice(0, q));
      });
      if (xs.some((x) => !Number.isInteger(x))) { ctx.problem(op.line, `counts lists whole numbers split by commas, each with its empty places in brackets if dots left: "counts 3: 12, 9 [2 5], 14"`); return; }
      if (gs.some((g, i) => g.some((v) => v >= xs[i] + g.length))) { ctx.problem(op.line, `an empty place is inside its column: 9 [2 5] has 11 places, 0 to 10`); return; }
      gs.forEach((g) => g.sort((p, q) => p - q));
      if (xs.length > c.n) { ctx.problem(op.line, `${xs.length} counts but the columns keep ${c.n}: raise "columns ${c.n}" in the setup`); return; }
      if (pre && m !== xs.length) { ctx.problem(op.line, `counts ${pre} names ${Number.isNaN(m) ? "no number of columns" : m + " columns"} but lists ${xs.length}`); return; }
      if (xs.some((x, i) => x + gs[i].length > MAX_COUNT)) { ctx.problem(op.line, `a column holds at most ${MAX_COUNT} dots`); return; }
      if (c.counts.has(op.step)) { ctx.problem(op.line, "counts is written once a step"); return; }
      c.counts.set(op.step, xs); c.gaps.set(op.step, gs); return;
    }
    // light: columns by label, a range of labels, or a list; ids that are not columns may be another block's (op.shared)
    const out: number[] = [], mine = (w: string) => colIndex(c, w) >= 0;
    if (op.shared && !parts(op.arg, ",").every((raw) => { const r = raw.indexOf(".."); return r > 0 ? mine(raw.slice(0, r).trim()) && mine(raw.slice(r + 2).trim()) : mine(raw); })) return false;
    for (const raw of parts(op.arg, ",")) {
      const r = raw.indexOf("..");
      if (r > 0) { const a = colIndex(c, raw.slice(0, r).trim()), b = colIndex(c, raw.slice(r + 2).trim()); if (a < 0 || b < a) { ctx.problem(op.line, `"${raw}" is not a range of columns (${c.labels[0]} to ${c.labels[c.n - 1]})`); return; } for (let i = a; i <= b; i++) out.push(i); continue; }
      const i = colIndex(c, raw); if (i < 0) { ctx.problem(op.line, `"${raw}" is not a column (${c.labels.slice(0, 8).join(", ")}${c.n > 8 ? ", ..." : ""})`); return; }
      out.push(i);
    }
    if (!out.length) { ctx.problem(op.line, `light names columns: "light 7..12" or "light 3, 5"`); return; }
    c.fresh.set(op.step, [...(c.fresh.get(op.step) ?? []), ...out]);
  },
  layout(c: Cols, box: Box): LayoutOut {
    const items: Item[] = [], steps = Math.max(box.steps, c.steps, 1);
    // the counts in force at each step (kept until the next counts)
    // the places in force at each step: a column's count and the places its dots left (kept until the next counts)
    const at: number[][] = [], gp: number[][][] = []; let cur: number[] = [], cg: number[][] = [];
    for (let s = 1; s <= steps; s++) { if (c.counts.has(s)) { cur = c.counts.get(s)!; cg = c.gaps.get(s)!; } at[s] = cur; gp[s] = cg; }
    const places = (s: number, i: number) => (at[s][i] ?? 0) + (gp[s][i]?.length ?? 0);
    const has = (s: number, i: number, d: number) => i < at[s].length && d < places(s, i) && !gp[s][i].includes(d);
    const most = Math.max(1, ...at.slice(1).flatMap((x, j) => x.map((_, i) => places(j + 1, i))));
    docBudget().charge("stage columns", c.n * (most + 4) * (steps + 1) + 50, c.n * most);
    // the caption
    let y = 0;
    for (const row of c.caption ? wrap(c.caption, box.w, "sub", 2) : []) { items.push({ k: "text", x: 0, y: y + 12, s: row, f: "sub", ink: "muted" }); y += 15; }
    if (c.caption) y += 6;
    // columns: one row of slots on a wide stage; a phone splits them into rows of at most 16
    // a wide stage keeps fixed proportions of its width (margins PAD each side, 8 above the first block): the columns run
    // from 2% to 98% of it, start at 4.4% from its top and are 19.6% of it tall, so a histogram has one shape at every width
    // a phone keeps one row while a column can be 6 wide, else rows of at most 16
    const perLine = box.narrow && box.w / c.n < 6 ? Math.min(c.n, 16) : c.n, lines = Math.ceil(c.n / perLine), Ws = box.w + 28;
    const left = box.narrow ? 0 : Math.max(0, 0.02 * Ws - 14), span = box.narrow ? box.w : Math.min(box.w - left, 0.96 * Ws);
    const pitch = span / perLine, gap = Math.max(1.5, pitch * 0.0825), colW = pitch - gap;
    const across = Math.max(1, Math.min(6, Math.round(colW / (box.narrow ? 3.6 : 6.2)))), dp = colW / across, dot = Math.min(dp * (box.narrow ? 0.8 : 0.76), 7);
    // a phone with one row of columns keeps them at most half full, so a low, even fill still reads as low
    const rowsNeed = Math.ceil(most / across), colH = Math.max(rowsNeed * dp + 6, box.narrow ? (lines === 1 ? 2 * (rowsNeed * dp + 6) : 0) : 0.196 * Ws);
    if (!box.narrow) y = Math.max(y, 0.044 * Ws - 8);
    const labelW = Math.max(...c.labels.map((l) => measure(l, "sub"))) + 6;
    const every = c.every || [1, 2, 4, 5, 10, 20, 32, 64].find((e) => e * pitch >= labelW) || c.n;
    const name = axisName(c), dotPaint = c.role ? `role:${c.role}` : "acc";
    // a phone whose columns stand under 4 px apart: a lit frame is drawn 1 px in from each side with a tight glow, so lit
    // neighbours keep apart; its outline 1 px, not thick
    const tight = !!box.narrow && gap < 4, ins = tight ? 1.25 : 0, thick = !tight, glowCls = tight ? "stg-glow stg-glow-s" : "stg-glow";
    for (let L = 0; L < lines; L++) {
      const a = L * perLine, b = Math.min(c.n, a + perLine) - 1, top = y, bottom = top + colH;
      const axis = `${name}-${L}`;
      // the category axis: column i's centre sits at its true place on a linear axis from a - 0.5 to b + 0.5
      items.push({ k: "box", x: left, y: top, w: (b - a + 1) * pitch, h: colH, fill: "none", stroke: "none", r: 0, bar: { kind: "axis", axis, min: a - 0.5, max: b + 0.5 } });
      // the author's own labels (labels: a, b,...) name every column for the bar, shown or not
      const authored = c.labels.some((l, j) => l !== String(j));
      // lit columns side by side whose labels would touch: one row of labels, every k-th column of the run named (k the
      // fewest columns a label needs), never staggered into cramped rows
      const ranged = new Map<number, number[]>(); // column -> the steps its run's labels show
      for (let st = 1; st <= steps; st++) {
        const lit = (c.fresh.get(st) ?? []).filter((i) => i >= a && i <= b && at[st].length > i).sort((p, q) => p - q);
        for (let r = 0; r < lit.length;) {
          let e = r; while (e + 1 < lit.length && lit[e + 1] === lit[e] + 1) e++;
          const run = lit.slice(r, e + 1), lw = Math.max(...run.map((i) => measure(c.labels[i], "sub"))) + 3, touch = run.length > 1 && lw > pitch;
          if (touch) {
            const k = Math.ceil(lw / pitch);
            run.forEach((i, q) => { if (q % k === 0) items.push({ k: "text", x: left + (i - a) * pitch + gap / 2 + colW / 2, y: top + colH + 14, s: c.labels[i], f: "sub", ink: "acc:ink", anchor: "middle", on: [st], hot: [st] }); });
            for (const i of run) (ranged.get(i) ?? ranged.set(i, []).get(i)!).push(st);
          }
          r = e + 1;
        }
      }
      // a ranged run's neighbours keep clear of its label in its steps (the every-K labels it covers give way)
      const rangeOn = (i: number) => { const out = new Set<number>(); for (const [j, sts] of ranged) if (Math.abs(j - i) * pitch < 24) for (const st of sts) out.add(st); return out; };
      for (let i = a; i <= b; i++) {
        const x = left + (i - a) * pitch + gap / 2, shown: number[] = [], lit: number[] = [];
        for (let s = 1; s <= steps; s++) if (at[s].length > i) { (c.fresh.get(s)?.includes(i) ? lit : shown).push(s); }
        if (!shown.length && !lit.length) continue;
        // a column is a bin (named only when its label shows; a lit column always named)
        const named = i % every === 0 || authored, bar = { kind: "bin", id: `col:${i}`, ...(named ? { label: c.labels[i] } : {}), track: axis, value: i, column: `${axis}:${i}` };
        if (shown.length) items.push({ k: "box", x, y: top, w: colW, h: colH, fill: "surface-2", stroke: "line", r: 4, cls: "scn-frame stg-col", id: `col:${i}`, on: shown, bar });
        if (lit.length) items.push({ k: "box", x: x + ins, y: top, w: colW - 2 * ins, h: colH, fill: "surface-2", stroke: "acc:line", r: 4, thick, cls: "scn-frame stg-col", id: `new:${i}`, on: lit, bar: { ...bar, id: `new:${i}`, label: c.labels[i] } });
        // a lit column glows in a step that counts the dots again (an accent halo round its outline, as the originals); one
        // lit again with no new count keeps the plain lit outline
        const grows = lit.filter((s) => c.counts.has(s));
        if (grows.length) items.push({ k: "box", x: x + ins, y: top, w: colW - 2 * ins, h: colH, fill: "none", stroke: "acc:line", r: 4, thick, cls: glowCls, on: grows, bar: { ignore: 1 } });
        // the dots: dot d of column i shows in every step whose count is above d
        const hi = Math.max(...[...shown, ...lit].map((s) => places(s, i)));
        for (let d = 0; d < hi && items.length < MAX_DOTS * 2; d++) {
          const dx = x + (d % across) * dp + (dp - dot) / 2 + 0.4, dy = bottom - 3 - (Math.floor(d / across) + 1) * dp + (dp - dot) / 2;
          // a lit column warms only the dots that are new since the step before; a dot already there keeps its tone
          const isNew = (s: number) => s === 1 || !has(s - 1, i, d);
          const on0 = [...shown, ...lit].filter((s) => has(s, i, d) && !(lit.includes(s) && isNew(s))).sort((p, q) => p - q), onLit = lit.filter((s) => has(s, i, d) && isNew(s));
          // "leaving: darker": a dot that a later step takes away is darker until it leaves
          const gone: boolean[] = []; let later = false;
          for (let s = steps; s >= 1; s--) { gone[s] = later; if (i < at[s].length && !has(s, i, d)) later = true; }
          const leaves = (s: number) => c.leaving && gone[s];
          const dark = on0.filter(leaves), on = on0.filter((s) => !leaves(s));
          if (dark.length) items.push({ k: "box", x: dx, y: dy, w: dot, h: dot, fill: `${dotPaint}:ink`, stroke: "none", r: 1, cls: "stg-dot-u", on: dark, bar: { kind: "unit" } });
          // a plain dot is the role's own colour in both themes, 3:1 on the stage ("dot"; rc.2 MUST 8: light drew the pale fill);
          // in a lit column it is stronger: darker in light, the brighter ink in dark ("dot-new")
          const onPlain = on.filter((s) => !lit.includes(s)), onLitCol = on.filter((s) => lit.includes(s));
          if (onPlain.length) items.push({ k: "box", x: dx, y: dy, w: dot, h: dot, fill: `${dotPaint}:dot`, stroke: "none", r: 1, cls: "stg-dot-u", on: onPlain, bar: { kind: "unit" } });
          if (onLitCol.length) items.push({ k: "box", x: dx, y: dy, w: dot, h: dot, fill: `${dotPaint}:dot-new`, stroke: "none", r: 1, cls: "stg-dot-u", on: onLitCol, bar: { kind: "unit" } });
          if (onLit.length) items.push({ k: "box", x: dx, y: dy, w: dot, h: dot, fill: "warn:line", stroke: "none", r: 1, cls: "stg-dot-u", on: onLit, bar: { kind: "unit" } });
        }
        // the label: every K-th column, and a lit column's own label in its steps
        const lx = x + colW / 2, s = c.labels[i];
        const away = rangeOn(i), keep = (xs: number[]) => xs.filter((st) => !away.has(st));
        // an every-K label takes the accent in the steps its column is lit, like the other lit columns (same place: nothing moves)
        if (i % every === 0) { const on = keep(shown), hot = keep(lit); if (on.length) items.push({ k: "text", x: lx, y: bottom + 14, s, f: "sub", ink: "muted", anchor: "middle", on }); if (hot.length) items.push({ k: "text", x: lx, y: bottom + 14, s, f: "sub", ink: "acc:ink", anchor: "middle", on: hot }); }
        else if (lit.length && measure(s, "sub") <= pitch * every) { const on = keep(lit); if (on.length) items.push({ k: "text", x: lx, y: bottom + 14, s, f: "sub", ink: "acc:ink", anchor: "middle", on }); }
      }
      y = bottom + 20;
    }
    // keep words inside the box: a label at either end may hang half outside its column
    for (const it of items) if (it.k === "text" && it.anchor === "middle") { const hw = measure(it.s, it.f) / 2; it.x = Math.max(hw, Math.min(box.w - hw, it.x)); }
    return { h: y + 2, items };
  },
  facts(c: Cols, step) {
    if (step === 0) return [`Columns: ${c.caption || "counts"}${c.unit ? ` (one dot per ${c.unit.replace(/s$/, "")})` : ""}, up to ${c.n} columns.`];
    const xs = c.counts.get(step), out: string[] = [];
    if (xs) {
      docBudget().charge("stage columns", xs.length + 1);
      const tot = xs.reduce((a, b) => a + b, 0);
      out.push(`${xs.length} columns, ${tot}${c.unit ? " " + c.unit : ""} in all (${Math.min(...xs)} to ${Math.max(...xs)} a column): ${xs.map((x, i) => `${c.labels[i]} ${x}`).join(", ")}.`);
    }
    const f = c.fresh.get(step);
    if (f?.length) {
      // the counts in force now and in the step before (a step without counts keeps the last ones)
      let now: number[] = [], before: number[] = [];
      for (let s = 1; s <= step; s++) { if (s === step) before = now; if (c.counts.has(s)) now = c.counts.get(s)!; }
      const added = f.filter((i) => i >= before.length), again = f.filter((i) => i < before.length);
      if (added.length) out.push(`New: ${added.map((i) => c.labels[i]).join(", ")}${xs ? ` (${added.reduce((a, i) => a + (xs[i] ?? 0), 0)} in them)` : ""}.`);
      const moved = again.filter((i) => (now[i] ?? 0) !== before[i]), same = again.filter((i) => (now[i] ?? 0) === before[i]);
      if (moved.length) out.push(`Lit: ${moved.map((i) => { const d = (now[i] ?? 0) - before[i]; return `${c.labels[i]} ${now[i] ?? 0} (${d > 0 ? `${d} new` : `${-d} fewer`} since the step before)`; }).join(", ")}.`);
      if (same.length) out.push(`Lit, unchanged since the step before: ${same.map((i) => `${c.labels[i]} ${now[i] ?? 0}`).join(", ")}.`);
    }
    return out;
  },
} satisfies StageBlock<Cols>);

