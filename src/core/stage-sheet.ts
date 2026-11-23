// This package is the source of this file: edit it here. It began as a copy of the private prototype's composed stage (0.7.0).
// The worksheet (stage block "sheet"): groups of rows with aligned value cells, a result per row, a partial card per
// group, and one outcome column; each step marks, dims and fills cells, writes results, sums, sends and totals.
//
// sheet: two shops, each with its own tills | 3 of 5 tills
// labels: morning, noon, evening <- labels under each row's cells (optional)
// shop s0: shop north | owns 2 tills <- a group (drawn as a lane, titled)
// till t1 "till 1": 10 12 15 <- a row (worksheet-row): up to 24 cells (chips)
// till t2 "till 2": 4 _ 9 <- "_": an empty dashed cell until a step fills it
// => office out: head office | adds the partials <- the outcome column (a card, titled)
// @step...
// mark t1 2: bad +15 a cell (or cells: 2,4 or 1..3; several rows) in a tone, words under it; this step only
// keep mark t1 3: good the same, from this step on (until a later keep mark on that cell)
// dim t1 t2 1..2 cells faint and dashed from this step on (until a later dim on the row; "off" clears)
// fill t2 2: 11 an empty cell gets its value from this step on
// value t1 t2: per day | 3.0 (good), 2.4 (bad struck) a result per row, from this step until the row's next value
// sum s0: partial | a = 3.0 + 2.4 = 5.4 -> (5.4, 2) the group's partial card; "-> x" is a chip in it from this
// step, and in the outcome column from the next step
// pass s0 the partial's chip reaches the outcome column in this step instead
// tile out b1: box 1 | 24 | 6+5+7+6 a small card in the outcome column's row of tiles, until a later tile b1
// strip out r1: the last 6 sums | 10 12 13 15 16 18 | oldest, this tick a strip of small cells, ends labelled
// total out: lines | lines => label | value lines and the big result, until the next total
// aside out: words a muted line in the outcome column, from this step on
//
// Geometry is computed once for all steps: a later thing in the same place replaces the earlier one, nothing moves.
import { type Item, type StageBlock, type Box, type LayoutOut, type Line, type Font, StageError, LINE_H, registerBlock, measure, wrap, parts, colon, shift } from "./stage-core";
import { docBudget } from "./stage-budget";

type Row = { role: string; id: string; label: string; v: string[]; empty: boolean[]; line: number };
type Group = { role: string; id: string; title: string; note: string; rows: Row[]; short: string };
type Strip = { id: string; head: string; v: string[]; ends: [string, string]; step: number };
type Op = { word: string; who: string[]; cells: number[]; arg: string; step: number; line: number };
type Sheet = { title: string; note: string; cols: string[]; groups: Group[]; out: { role: string; id: string; title: string; note: string } | null; ops: Op[]; strips: Map<string, Strip>; tiles: Set<string>; rowMap?: Map<string, Row>; tall?: boolean };
const TONES = ["good", "bad", "warn", "accent"];
const P = (tone: string) => (tone === "accent" ? "acc" : tone); // a tone word -> its paint name
type Kind = "mark" | "keep" | "dim" | "fill" | "value" | "sum" | "pass" | "tile" | "strip" | "total" | "aside" | "hide" | "light" | "cols" | "rows";
/** The source words, one line each: the word an author writes -> what it does. A rename is one line here. */
const WORDS: Record<string, Kind> = {
  mark: "mark",     // a cell in a tone, words under it; this step only
  dim: "dim",       // cells faint and dashed from this step
  fill: "fill",     // an empty cell gets its value
  value: "value",   // a result per row
  sum: "sum",       // a group's partial card
  pass: "pass",     // the partial's chip reaches the outcome column now
  tile: "tile",     // a small card in the outcome column
  strip: "strip",   // a strip of small cells in the outcome column
  total: "total",   // lines and the big result
  aside: "aside",   // a muted line in the outcome column
  hide: "hide",     // results go from this step on (the stage's one word for go away); a later result brings them back
  light: "light",   // the stage's halo on a group's partial (or its lane), the outcome column, a row or a tile, this step
};
const MORE: Record<string, Kind> = { labels: "cols", spacing: "rows" }; // setup words after "sheet:" ("spacing: roomy": taller rows, cells centred)
// "keep mark t1 3: good": the stage strips "keep" and hands over "mark" with op.keep; that is the kind "keep"
const SAY = Object.fromEntries([...Object.entries(WORDS), ...Object.entries(MORE)].map(([w, k]) => [k, w])) as Record<Kind, string>;
const MAX_CELLS = 24, MAX_STRIP = 48, MAX_ROWS = 120, MAX_GROUPS = 12, MAX_TILES = 12, MAX_OPS = 400;
const CELL_H = 22, PITCH = 26, COL_H = 14;

/** "3", "2,4", "1..6", "none": cell numbers (1-based) checked against n cells; null when it does not read. */
function cellSpec(s: string, n: number): number[] | null {
  if (s === "off") return [];
  const out: number[] = [];
  for (const p of s.split(",")) {
    const k = p.indexOf("..");
    const a = k < 0 ? p : p.slice(0, k), b = k < 0 ? p : p.slice(k + 2);
    if (!/^\d{1,3}$/.test(a) || !/^\d{1,3}$/.test(b)) return null;
    const x = +a, y = +b; if (x < 1 || y > n || y < x) return null;
    for (let j = x; j <= y; j++) out.push(j);
  }
  return out;
}
/** A result "1.33 /s (bad struck)": its words, tone and strike. */
function result(s: string): { s: string; tone: string; strike: boolean } {
  const t = s.trim();
  if (t.endsWith(")")) {
    const k = t.lastIndexOf(" (");
    if (k > 0) { const ws = t.slice(k + 2, -1).split(" "); if (ws.every((w) => TONES.includes(w) || w === "struck")) return { s: t.slice(0, k), tone: ws.find((w) => TONES.includes(w)) ?? (ws.includes("struck") ? "bad" : "good"), strike: ws.includes("struck") }; }
  }
  return { s: t, tone: "good", strike: false };
}
const charge = (n: number) => docBudget().charge("stage sheet", n + 1, n);

function parseRow(l: Line, roles: Set<string>, problem: (n: number, m: string) => void): Row {
  const c = colon(l.t); if (!c) throw new StageError(l.n, `a sheet row is: role id "label": value value value`);
  const head = c[0], q = head.indexOf(' "');
  const label = q > 0 && head.endsWith('"') ? head.slice(q + 2, -1) : "";
  const [role, id] = (q > 0 ? head.slice(0, q) : head).split(" ");
  if (!id) throw new StageError(l.n, `a sheet row is: role id "label": values`);
  if (!roles.has(role)) problem(l.n, `"${role}" is not a role of this page; the page declares ${[...roles].join(", ") || "none"}`);
  const raw = c[1].split(" ").filter(Boolean);
  if (raw.length > MAX_CELLS) throw new StageError(l.n, `a row holds at most ${MAX_CELLS} values (this one has ${raw.length})`);
  return { role, id, label: label || id, v: raw.map((x) => (x === "_" ? "" : x)), empty: raw.map((x) => x === "_"), line: l.n };
}

registerBlock({
  word: "sheet", kind: "head", ops: Object.keys(WORDS), more: Object.keys(MORE),
  claim: (s: Sheet, l, body, ctx) => sheetLine(s, l, body, ctx),
  parse(inp): Sheet {
    const [title, note] = [inp.arg.split(" | ")[0].trim(), inp.arg.split(" | ").slice(1).join(" | ").trim()];
    return { title, note, cols: [], groups: [], out: null, ops: [], strips: new Map(), tiles: new Set() };
  },
  op(s: Sheet, op, ctx) {
    charge(op.arg.length);
    const w = op.word, k: Kind = w === "mark" && op.keep ? "keep" : WORDS[w] ?? MORE[w];
    if (k === "rows") { if (op.arg.trim() === "roomy") s.tall = true; else ctx.problem(op.line, `"${w}:" takes one word: ${w}: roomy`); return; }
    if (k === "cols") { s.cols = parts(op.arg, ","); if (s.cols.length > MAX_CELLS) ctx.problem(op.line, `${w} names at most ${MAX_CELLS} columns`); return; }
    if (s.ops.length >= MAX_OPS) { ctx.problem(op.line, `a sheet takes at most ${MAX_OPS} step words`); return; }
    const sp = op.arg.indexOf(": "), head = sp < 0 ? op.arg.replace(/:$/, "") : op.arg.slice(0, sp), arg = sp < 0 ? "" : op.arg.slice(sp + 2);
    const words = head.split(" ").filter(Boolean);
    const rows = (s.rowMap ??= new Map(s.groups.flatMap((g) => g.rows.map((r) => [r.id, r] as const)))); // the setup is complete once steps begin
    const size = (id: string) => rows.get(id)?.v.length ?? s.strips.get(id)?.v.length ?? 0;
    const names = () => [...rows.keys(), ...s.strips.keys()].join(", ");
    const need = (id: string, what: "row" | "cells" | "group" | "out") => {
      const ok = what === "row" ? rows.has(id) : what === "cells" ? rows.has(id) || s.strips.has(id) : what === "group" ? s.groups.some((g) => g.id === id) : s.out?.id === id;
      if (!ok) ctx.problem(op.line, `"${id}" is not a ${what === "out" ? "outcome column" : what === "cells" ? "row or strip" : what} of the sheet (${what === "row" ? [...rows.keys()].join(", ") : what === "cells" ? names() : what === "group" ? s.groups.map((g) => g.id).join(", ") : s.out?.id ?? "none"})`);
      return ok;
    };
    if (k === "light") {
      // the stage's word: "light s0, s1" or "light out"; ids that are not all the sheet's go back to the stage
      const ids = op.arg.split(/[\s,]+/).filter(Boolean);
      const key = (id: string) => s.groups.some((g) => g.id === id) ? `g:${id}` : s.out?.id === id ? `out:${id}` : rows.has(id) ? `row:${id}` : s.tiles.has(id) ? `tile:${id}` : null;
      if (!ids.length || op.arg.includes(": ") || ids.some((id) => !key(id))) return false;
      s.ops.push({ word: k, who: ids.map((id) => key(id)!), cells: [], arg: "", step: op.step, line: op.line }); return;
    }
    if (k === "hide") {
      // the sheet's things that come and go: a row's result, a group's partial, a tile, a total (the outcome column's id, or a second total's name)
      const keys = (id: string) => rows.has(id) ? [`value:${id}`] : s.groups.some((g) => g.id === id) ? [`sum:${id}`] : s.tiles.has(id) ? [`tile:${id}`] : s.out?.id === id ? ["total:"] : s.ops.some((o) => o.word === "total" && o.who[1] === id) ? [`total:${id}`] : null;
      if (!words.length || words.some((id) => !keys(id))) return false; // not all mine: the stage looks elsewhere
      s.ops.push({ word: k, who: words.flatMap((id) => keys(id)!), cells: [], arg: "", step: op.step, line: op.line }); return;
    }
    let cells: number[] = [];
    const ids = words.slice(0, -1), spec = words.at(-1) ?? "";
    if (k === "mark" || k === "keep" || k === "dim" || k === "fill") {
      if (op.shared && ids.some((id) => !rows.has(id) && !s.strips.has(id))) return false;
      if (!ids.length) { ctx.problem(op.line, `${w} names rows, then cells: ${w} t1 2${k === "dim" ? "" : k === "fill" ? ": 11" : ": bad"}`); return; }
      for (const id of ids) if (!need(id, k === "fill" ? "row" : "cells")) return;
      for (const id of ids) { const c = cellSpec(spec, size(id)); if (!c || (c.length === 0 && k !== "dim")) { ctx.problem(op.line, `${w} names a row and a cell from 1 to ${size(id)} (2, or 2,4, or 1..3${k === "dim" ? ", or off" : ""}): "${spec}"`); return; } cells = c; }
      if (k === "mark" || k === "keep") { const tone = arg.split(" ")[0]; if (!TONES.includes(tone)) { ctx.problem(op.line, `a ${w} is ${TONES.join(", ")}, then words to write under the cell`); return; } }
      if (k === "fill") {
        if (cells.length !== 1) { ctx.problem(op.line, `${w} names one cell: ${w} t1 t2 2: 11, 12`); return; }
        if (parts(arg, ",").length !== ids.length) { ctx.problem(op.line, `${w} gives one value per row: ${ids.length} rows, ${parts(arg, ",").length} values`); return; }
      }
      if (k === "dim" && arg) { ctx.problem(op.line, `${w} takes no words: ${w} t1 1..6`); return; }
      s.ops.push({ word: k, who: ids, cells, arg, step: op.step, line: op.line }); return;
    }
    if (k === "value") { for (const id of words) if (!need(id, "row")) return; const vals = parts(arg.split(" | ")[1] ?? "", ","); if (vals.length !== words.length) { ctx.problem(op.line, `${w} gives one result per row: ${words.length} rows, ${vals.length} results`); return; } }
    else if (k === "sum") { if (words.length !== 1 || !need(words[0], "group")) return; }
    else if (k === "pass") {
      if (words.length !== 1 || !need(words[0], "group")) return;
      if (!s.ops.some((o) => o.word === "sum" && o.who[0] === words[0] && o.arg.includes(" -> "))) { ctx.problem(op.line, `${w} moves a partial's chip: write "${SAY.sum} ${words[0]}: ... -> chip" first`); return; }
      if (!s.out) { ctx.problem(op.line, `${w} needs the outcome column (=> role id: title)`); return; }
    }
    else if (k === "aside") { if (words.length !== 1 || !need(words[0], "out")) return; }
    else if (k === "total") { if (words.length < 1 || words.length > 2 || !need(words[0], "out")) { if (words.length > 2) ctx.problem(op.line, `${w} names the outcome column and, for a second result, a name: ${w} out wrong: lines => label | value`); return; } }
    else if (k === "tile") {
      if (words.length !== 2 || !need(words[0], "out")) { if (words.length !== 2) ctx.problem(op.line, `${w} names the outcome column and a tile: ${w} out b1: title | value | line`); return; }
      s.tiles.add(words[1]); if (s.tiles.size > MAX_TILES) { ctx.problem(op.line, `the outcome column holds at most ${MAX_TILES} tiles`); return; }
    } else if (k === "strip") {
      if (words.length !== 2 || !need(words[0], "out")) { if (words.length !== 2) ctx.problem(op.line, `${w} names the outcome column and a strip: ${w} out r1: heading | v v v | first end, last end`); return; }
      const [hd, vs, ends] = [arg.split(" | ")[0] ?? "", arg.split(" | ")[1] ?? "", arg.split(" | ")[2] ?? ""], v = vs.split(" ").filter(Boolean);
      if (!v.length) { ctx.problem(op.line, `a strip lists its cells after the heading: ${w} out r1: heading | 1 2 3 | first, last`); return; }
      if (v.length > MAX_STRIP) { ctx.problem(op.line, `a strip holds at most ${MAX_STRIP} cells (this one has ${v.length})`); return; }
      if (s.strips.has(words[1]) || rows.has(words[1])) { ctx.problem(op.line, `"${words[1]}" is already a row or strip of the sheet`); return; }
      const e = parts(ends, ",");
      s.strips.set(words[1], { id: words[1], head: hd.trim(), v, ends: [e[0] ?? "", e[1] ?? ""], step: op.step });
    }
    s.ops.push({ word: k, who: words, cells: [], arg, step: op.step, line: op.line });
  },
  layout(s: Sheet, box: Box): LayoutOut {
    const items: Item[] = [], n = Math.max(1, box.steps);
    const allRows = s.groups.flatMap((g) => g.rows);
    charge(allRows.reduce((a, r) => a + r.v.length, 0) + s.ops.length * 4);
    const rowOf = new Map(allRows.map((r) => [r.id, r] as const));
    const opsOf = (w: string) => s.ops.filter((o) => o.word === w);
    const valOps = opsOf("value"), sumOps = opsOf("sum"), markOps = s.ops.filter((o) => o.word === "mark" || o.word === "keep");
    // a later thing in the same place replaces the earlier one: each op's last step, in one pass from the end (0 = to the end)
    const ends = new Map<string, number>(), opIndex = new Map(s.ops.map((o, i) => [o, i] as const));
    { const last = new Map<string, { step: number; end: number }>();
      for (let i = s.ops.length - 1; i >= 0; i--) { const o = s.ops[i], keys = placeKeys(o); charge(keys.length);
        for (const k of keys) { const r = last.get(k), end = !r ? 0 : r.step > o.step ? r.step - 1 : r.end; ends.set(`${i}|${k}`, end); last.set(k, { step: o.step, end }); } } }
    const endOf = (o: Op, k: string) => ends.get(`${opIndex.get(o)}|${k}`) ?? 0;
    const valRows = new Set(valOps.flatMap((o) => o.who)), fillOf = new Map<string, Op>(), underN = new Map<string, number>();
    for (const o of s.ops) if (o.word === "fill") for (const id of o.who) { const k = `${id}:${o.cells[0] - 1}`; if (!fillOf.has(k)) fillOf.set(k, o); }
    // ---- widths
    const nv = Math.max(1, ...allRows.map((r) => r.v.length));
    const fills = opsOf("fill");
    const cellW = (pad: number, min: number) => Math.max(min, ...allRows.flatMap((r) => r.v.map((v) => measure(v, "sub") + pad)), ...fills.flatMap((o) => parts(o.arg, ",").map((v) => measure(v, "sub") + pad)), ...s.cols.map((c) => measure(c, "sub") + 8));
    let cw = cellW(16, 30);
    const labW = Math.max(40, ...allRows.map((r) => measure(r.label, "sub") + 14));
    const valW = valOps.length ? Math.max(80, ...valOps.flatMap((o) => [measure(o.arg.split(" | ")[0], "sub"), ...parts(o.arg.split(" | ")[1] ?? "", ",").map((v) => measure(result(v).s, "title"))]).map((x) => x + 22)) : 0;
    const sumMin = sumOps.length ? 170 : 0;
    // the outcome column: as wide as its longest line wants (at least half the stage when it holds tiles or a strip), at most 58% of the stage
    const outLines: string[] = [], totalLines: string[] = []; // a total's lines wrap beside its big result; an aside reads best unbroken
    for (const o of s.ops) {
      if (o.word === "total") { const [a, b] = totalParts(o.arg); totalLines.push(...parts(a, " | "), ...parts(b, " | ")); }
      else if (o.word === "aside") outLines.push(o.arg);
      else if (o.word === "strip") outLines.push(o.arg.split(" | ")[0]);
    }
    const stripNeed = Math.max(0, ...[...s.strips.values()].map((st) => 24 + st.v.length * stripCell(st)));
    const tileW = (o: Op) => Math.max(64, ...parts(o.arg, " | ").map((t, i) => measure(i === 1 ? result(t).s : t, i === 1 ? "title" : "sub") + 26));
    const tileWidths = new Map<string, number>(); for (const o of opsOf("tile")) tileWidths.set(o.who[1], Math.max(tileWidths.get(o.who[1]) ?? 0, tileW(o)));
    // the boxed tiles share the widest one's width, as the reference design draws them; a "… more" tile keeps its own
    const moreTile = new Set(opsOf("tile").filter((o) => /^(\.\.\.|…)/.test(o.arg.trim())).map((o) => o.who[1]));
    const tileMax = Math.max(0, ...[...tileWidths].filter(([id]) => !moreTile.has(id)).map(([, w]) => w));
    if (!box.narrow) for (const id of tileWidths.keys()) if (!moreTile.has(id)) tileWidths.set(id, tileMax); // a phone keeps each tile its own width, so more fit on a line
    const tilesNeed = tileWidths.size ? 24 + [...tileWidths.values()].reduce((a, w) => a + w + 8, 0) : 0;
    const sentNeed = Math.max(0, ...sumOps.map((o) => { const g = s.groups.find((x) => x.id === o.who[0]); const sent = o.arg.split(" -> ")[1]; return sent && g ? measure(sent, "sub") + 22 + 14 + measure("← " + g.short, "sub") + 24 : 0; }));
    // a column that holds tiles or a strip (a wide row) takes at least half the stage, as the reference design's does (22: 490 of 980)
    const halfNeed = tileWidths.size || s.strips.size ? Math.round(box.w * 0.5) : 0;
    const outNeed = s.out ? Math.max(200, box.w * 0.25, sentNeed, tilesNeed, stripNeed, halfNeed, measure(s.out.title, "title") + measure(s.out.note, "sub") + 40, ...outLines.map((l) => measure(l, "sub") + 26), ...totalLines.map((l) => Math.min(box.w * 0.25, measure(l, "sub") + 26))) : 0; // a total's lines wrap in the column's base 25% (as the original)
    const leftMin = 16 + 8 + labW + Math.min(nv, 4) * cw + 8 + (valW ? valW + 8 : 0) + (sumMin ? sumMin + 8 : 0) + 8;
    let ow = s.out ? Math.min(outNeed, box.w * (s.strips.size ? 0.7 : 0.58), box.w - 12 - leftMin) : 0; // a strip of small cells may take a little more
    let narrow = box.narrow || (s.out !== null && ow < 200) || leftMin > box.w;
    const leftW = narrow || !s.out ? box.w : box.w - ow - 12;
    // on a phone the outcome column goes under the groups; the groups keep their wide form (partial card beside the rows) when it fits
    const leftFits = 16 + 8 + labW + nv * cw + 8 + (valW ? valW + 8 : 0) + (sumMin ? sumMin + 8 : 0) + 8 <= box.w;
    if (narrow) ow = box.w;
    const nl = narrow && !leftFits;
    if (nl) cw = cellW(9, 26);
    // cells per line: all of a row's cells on one line when they fit, else they wrap; on a phone they start under the label line
    const stacked = nl && labW + nv * cw > leftW - 32; // a phone row too long for one line: label line, then the cells
    const fixed = stacked ? 32 : nl ? 32 + labW : 16 + 8 + labW + 8 + (valW ? valW + 8 : 0) + (sumMin ? sumMin + 8 : 0) + 8;
    const cellTop0 = stacked ? (narrow ? 25 : 29) : narrow ? 4 : 7, cellFoot = narrow ? 2 : 7, tallH = s.tall && !narrow ? Math.max(56, Math.round(box.w / 18)) : 0; // tall rows on a wide stage only (a phone keeps the compact rows); they grow with the stage, as a drawing scaled to the page does
    // many cells: tighter cells (down to the text and 5 px) when that keeps the row on one line; else even lines (10 + 10, not 19 + 1)
    if (!nl && !stacked && Math.floor((leftW - fixed) / cw) < nv && Math.floor((leftW - fixed) / nv) >= cellW(5, 19)) cw = Math.floor((leftW - fixed) / nv);
    const fitN = Math.max(1, Math.min(nv, Math.floor((leftW - fixed) / cw))), perLine = Math.ceil(nv / Math.ceil(nv / fitN));
    const lines = (r: Row) => Math.ceil(r.v.length / perLine);
    const rowsW = Math.max(8 + labW + Math.min(nv, perLine) * cw + 8, !nl && (valW || sumMin) ? Math.round(box.w * 0.15) : 0); // a short row still reads as a column (15% of a wide stage) before the results beside it
    const sumW = nl ? leftW - 16 : Math.max(sumMin, leftW - 16 - rowsW - (valW ? valW + 8 : 0) - 16);
    const pitch = PITCH + (s.cols.length ? COL_H : 0);
    // the words under a marked cell wrap (two lines at most)
    const markW = Math.max(cw - 3, Math.min(220, (nl ? leftW - 32 : rowsW - 16)));
    // "mark A 6: bad +160 | 10 < 160: reset!": the words under the cell, then the note after " | " under the row at its left
    const markLines = (o: Op) => { const add = o.arg.split(" | ")[0].split(" ").slice(1).join(" "); return add ? wrap(add, markW, "sub", 3) : []; };
    const noteLines = (o: Op) => { const nt = o.arg.split(" | ").slice(1).join(" | "); return nt ? wrap(nt, Math.max(markW, (nl ? leftW - 32 : rowsW - 16)), "sub", 2) : []; };
    for (const o of markOps) { const k = markLines(o).length + noteLines(o).length; for (const id of o.who) underN.set(id, Math.max(underN.get(id) ?? 0, k)); }
    const under = (r: Row) => (underN.get(r.id) ?? 0) * LINE_H.sub;
    const valLine = (lab: string, v: string) => measure(lab, "sub") + measure(v, "small-b") + 30;
    const valNarrowW = new Map<string, number>(); for (const o of valOps) { const vs = parts(o.arg.split(" | ")[1] ?? "", ","); o.who.forEach((id, j) => valNarrowW.set(id, Math.max(valNarrowW.get(id) ?? 0, valLine(o.arg.split(" | ")[0], result(vs[j] ?? "").s)))); }
    const valBeside = (r: Row) => nl && valRows.has(r.id) && (valNarrowW.get(r.id) ?? 0) <= (stacked ? leftW - 40 - Math.min(labW, measure(r.label, "sub") + 14) : leftW - 24 - (rowX + labW + r.v.length * cw));
    const besideGap = (r: Row) => (stacked && valBeside(r) ? 7 : 0); // a result on the label line: the cells keep clear of its box
    const cellTopOf = (r: Row) => (tallH && lines(r) === 1 ? (tallH - CELL_H - (s.cols.length ? COL_H : 0)) / 2 : cellTop0 + besideGap(r));
    // a phone result that is not beside the label: one line under the cells when it fits, else the two-line box
    const valUnder = (r: Row) => nl && valRows.has(r.id) && !valBeside(r) && (valNarrowW.get(r.id) ?? 1e9) <= leftW - 32;
    const rowH = (r: Row) => Math.max(tallH, cellTop0 + besideGap(r) + cellFoot + lines(r) * pitch + under(r) + (nl && valRows.has(r.id) && !valBeside(r) ? (valUnder(r) ? 28 : 50) : 0), !nl && valRows.has(r.id) ? 48 : 0);
    // the partial card: its lines wrap in its width; a chip row under them when it sends one
    // a partial card's parts: text lines (wrapped), or chips ("+ a; b", wrapped into rows); then the chip it sends
    const sumBody = (o: Op) => {
      const [body, sent] = [o.arg.split(" -> ")[0], o.arg.split(" -> ")[1]], ls: string[] = [], rows: { at: number; chips: { s: string; x: number; w: number }[]; beside?: number }[] = [];
      for (const p of parts(body, " | ")) {
        if (!p.startsWith("+ ")) { ls.push(...wrap(p, sumW - 24, "sub", 3)); continue; }
        let x = 0, row: { s: string; x: number; w: number }[] = [];
        for (const c of parts(p.slice(2), ";")) { const w = Math.min(sumW - 24, measure(c, "sub") + 20); if (x && x + w > sumW - 24) { rows.push({ at: ls.length, chips: row }); row = []; x = 0; } row.push({ s: c, x, w }); x += w + 6; }
        if (row.length) rows.push({ at: ls.length, chips: row });
      }
      // a chip row right after the title sits on the title's line when it fits there
      const r0 = rows[0], rw = r0 ? Math.max(...r0.chips.map((c) => c.x + c.w)) : 0;
      if (r0 && r0.at === 1 && ls.length && measure(ls[0], "sub") + 12 + rw <= sumW - 24 && (ls.length < 2 || measure(ls[1], "sub") + 8 <= measure(ls[0], "sub") + 12)) r0.beside = measure(ls[0], "sub") + 12;
      return { ls, rows, sent: sent?.trim() };
    };
    const bodyH = (b: ReturnType<typeof sumBody>) => b.ls.length * LINE_H.sub + b.rows.reduce((a, r) => a + (r.beside !== undefined ? 4 : 30), 0); // chips on the title's line: 4 px off the card's top
    // the chip it sends sits at the card's right (da1feb0: its bottom right): beside its last line when it fits there, else on a row of its own at the bottom
    const sentBeside = (b: ReturnType<typeof sumBody>) => b.sent && b.ls.length && !b.rows.some((r) => r.at >= b.ls.length) && measure(b.ls[b.ls.length - 1], "sub") + 10 + measure(b.sent, "sub") + 22 <= sumW - 24 ? measure(b.ls[b.ls.length - 1], "sub") + 10 : -1;
    // the sent chip at the card's right beside the last line adds no height when the line above keeps clear of it (else 12)
    const sentSnug = (b: ReturnType<typeof sumBody>) => { const n2 = b.ls.length - 2; if (n2 < 0) return true; const r0 = b.rows[0], above = measure(b.ls[n2], "sub") + (n2 === 0 && r0?.beside !== undefined ? 0 : 0), chipsW = n2 === 0 && r0?.beside !== undefined ? r0.beside + Math.max(...r0.chips.map((c) => c.x + c.w)) : 0; return Math.max(above, chipsW) + 10 <= sumW - 24 - (measure(b.sent ?? "", "sub") + 22); };
    const sumHeight = (g: Group) => Math.max(0, ...sumOps.filter((o) => o.who[0] === g.id).map((o) => { const b = sumBody(o); return 14 + bodyH(b) + (b.sent ? (sentBeside(b) >= 0 ? (sentSnug(b) ? 4 : 12) : 30) : 0); }));
    // ---- the sheet's title line
    let y = 0;
    if (s.title || s.note) { items.push({ k: "text", x: 0, y: 14, s: s.title, f: "sub", ink: "muted" }); if (s.note && !narrow) items.push({ k: "text", x: box.w, y: 14, s: s.note, f: "sub", ink: "muted", anchor: "end" }); y = narrow ? 28 : 58; if (s.note && narrow) { items.push({ k: "text", x: 0, y: 30, s: s.note, f: "sub", ink: "muted" }); y = 42; } }
    const top = y, rowY = new Map<string, number>(), rowX = 16, cellX = (j: number) => rowX + (stacked ? 0 : labW) + (j % perLine) * cw;
    const cellPos = new Map<string, { x: number; y: number; w: number }>(); // "id:j" -> the cell's box
    const groupY = new Map<string, [number, number]>();
    // ---- groups, rows, cells
    for (const g of s.groups) {
      const gy = y; let ry = y + (narrow ? 24 : 30);
      for (const r of g.rows) { rowY.set(r.id, ry); ry += rowH(r) + (narrow ? 4 : 8); }
      const sh = sumHeight(g);
      const gh = nl ? ry - y + (sh ? sh + 12 : 0) : Math.max(ry - y, sh ? 30 + sh + 8 : 0);
      groupY.set(g.id, [gy, gh]);
      items.push({ k: "box", x: 0, y: gy, w: leftW, h: gh, fill: `role:${g.role}:plane`, stroke: `role:${g.role}:line`, r: 10, cls: "scn-frame", role: g.role, id: `group:${g.id}`, bar: { kind: "lane", id: `group:${g.id}`, label: g.title, role: g.role } }, { k: "text", x: 12, y: gy + (narrow ? 18 : 20), s: g.title, f: "title", ink: "ink" });
      if (g.note) items.push({ k: "text", x: leftW - 12, y: gy + (narrow ? 18 : 20), s: g.note, f: "sub", ink: "ink-2", anchor: "end" });
      for (const r of g.rows) {
        const yy = rowY.get(r.id)!, w = nl ? leftW - 16 : rowsW;
        items.push({ k: "box", x: 8, y: yy, w, h: rowH(r), fill: `role:${r.role}:soft`, stroke: `role:${r.role}:line`, r: 8, cls: "scn-shape", role: r.role, id: `row:${r.id}`, bar: { kind: "worksheet-row", id: r.id, label: r.label, role: r.role } }, { k: "text", x: rowX, y: tallH ? yy + cellTopOf(r) + 15 : yy + 19, s: r.label, f: "sub", ink: "ink" });
        r.v.forEach((v, j) => {
          const x = cellX(j), cy = yy + cellTopOf(r) + Math.floor(j / perLine) * pitch;
          cellPos.set(`${r.id}:${j}`, { x, y: cy, w: cw - 3 });
          const fillAt = r.empty[j] ? fillOf.get(`${r.id}:${j}`) : undefined;
          const filled = fillAt ? parts(fillAt.arg, ",")[fillAt.who.indexOf(r.id)] : "";
          const cid = `cell:${r.id}:${j}`, bar = { kind: "chip", id: cid, column: `v${j % perLine}`, ...(s.cols[j] ? { label: s.cols[j] } : {}) };
          if (r.empty[j]) {
            items.push({ k: "box", x, y: cy, w: cw - 3, h: CELL_H, fill: "none", stroke: "line-2", r: 4, dash: true, cls: "stg-cell", id: cid, bar, ...(fillAt ? { to: fillAt.step - 1 } : {}) });
            if (fillAt) items.push({ k: "box", x, y: cy, w: cw - 3, h: CELL_H, fill: "surface", stroke: "line", r: 4, cls: "stg-cell", id: cid, bar, from: fillAt.step }, { k: "text", x: x + (cw - 3) / 2, y: cy + 15, s: filled, f: "sub", ink: "ink", anchor: "middle", from: fillAt.step });
          } else items.push({ k: "box", x, y: cy, w: cw - 3, h: CELL_H, fill: "surface", stroke: "line", r: 4, cls: "stg-cell", id: cid, bar }, { k: "text", x: x + (cw - 3) / 2, y: cy + 15, s: v, f: "sub", ink: "ink", anchor: "middle" });
          if (s.cols[j]) items.push({ k: "text", x: x + (cw - 3) / 2, y: cy + CELL_H + 12, s: s.cols[j], f: "sub", ink: "muted", anchor: "middle" });
        });
      }
      y = gy + gh + (narrow ? 7 : 10);
    }
    const leftBottom = y - (narrow ? 7 : 10);
    // ---- the outcome column (right; under the groups when narrow): slots in source order, each as tall as its tallest version
    const ox = narrow ? 0 : leftW + 12, oy = narrow ? leftBottom + 12 : top, inner = ow - 24;
    const outItems: Item[] = [];
    const noteBelow = !!s.out?.note && measure(s.out.title, "title") + measure(s.out.note, "sub") + 36 > ow; // the column's note under its title when both do not fit one line
    let inY = oy + (narrow ? 28 : 34 + 16) + (noteBelow ? 16 : 0); // room under the outcome header before its first chip (a phone keeps its tight header: )
    const passStep = (g: string, from: number) => { const o = s.ops.find((x) => x.word === "pass" && x.who[0] === g && x.step >= from); return o ? o.step : Math.min(n, from + 1); };
    let tilesY = -1; const tileX = new Map<string, [number, number]>();
    let chipEnd = -1, chipY = 0; // a phone: the end of the last sent chip's line, so the next one may sit beside it
    const totalAt = new Map<string, { y: number; l: number }>(); // a total's name -> its place and the height of its lines
    // the place order follows the reference layout, not the step order: what arrives sits at the top (each group's sent
    // chip, then the asides written in the step a chip arrives before any new place of that step: a first total of its
    // name, the first tile, a strip), then every other place in source order
    const sent = s.out ? s.ops.filter((o) => o.word === "sum" && o.arg.includes(" -> ")) : [];
    const arrive = new Set(sent.map((o) => passStep(o.who[0], o.step)));
    const opened = new Set<string>(), newAt = new Set<number>(); // the steps where a new place has opened, so far in source order
    const first: Op[] = [...sent];
    for (const o of s.ops) {
      if (o.word === "aside" && arrive.has(o.step) && !newAt.has(o.step)) first.push(o);
      const place = o.word === "total" ? `total:${o.who[1] ?? ""}` : o.word === "tile" ? "tiles" : o.word === "strip" ? `strip:${o.who[1]}` : "";
      if (place && !opened.has(place)) { opened.add(place); newAt.add(o.step); }
    }
    const firstSet = new Set(first);
    for (const o of [...first, ...s.ops.filter((o) => !firstSet.has(o))]) {
      if (!s.out) break;
      if (o.word === "sum") {
        const g = s.groups.find((x) => x.id === o.who[0])!, sent = o.arg.split(" -> ")[1]?.trim();
        if (!sent) continue;
        const k = passStep(g.id, o.step), cwid = measure(sent, "sub") + 22, whole = cwid + 8 + measure("← " + g.short, "sub");
        // a phone: a sent chip sits beside the one before it when both fit the column's line, not on a line of its own
        const beside = narrow && chipEnd > 0 && chipEnd + 18 + whole <= ox + ow - 12, cx0 = beside ? chipEnd + 18 : ox + 12, cy0 = beside ? chipY : inY;
        outItems.push(...shift([{ k: "box", x: cx0, y: cy0, w: cwid, h: CELL_H, fill: `role:${g.role}:soft`, stroke: `role:${g.role}:line`, r: 11, bar: { kind: "chip", label: sent } }, { k: "text", x: cx0 + cwid / 2, y: cy0 + 15, s: sent, f: "sub", ink: `role:${g.role}:ink`, anchor: "middle" }, { k: "text", x: cx0 + 8 + cwid, y: cy0 + 15, s: "← " + g.short, f: "sub", ink: "muted" }], 0, 0, { from: k, to: 0 }));
        chipEnd = cx0 + whole; chipY = cy0;
        if (!beside) inY += narrow ? 25 : 30;
      } else if (o.word === "tile") {
        if (tilesY < 0) {
          tilesY = inY; let tx = ox + 12, ty = inY;
          // a "… more" tile that does not fit beside the last tile is a short line under it, not a tile row of its own (a phone)
          let extra = 0;
          for (const [id, w] of tileWidths) {
            if (moreTile.has(id) && tx + w > ox + ow - 12 && tx > ox + 12) { tileX.set(id, [ox + 8, ty + 40]); extra = 22; continue; }
            if (tx + w > ox + ow - 12 && tx > ox + 12) { tx = ox + 12; ty += 64; }
            tileX.set(id, [tx, ty]); tx += w + 8;
          }
          inY = ty + 64 + extra;
        }
        const [tx, ty] = tileX.get(o.who[1])!, w = tileWidths.get(o.who[1])!, [t, v0, l2] = [...parts(o.arg, " | "), "", "", ""], tv = result(v0), toned = tv.s !== v0.trim(), v = tv.s;
        const when = { from: o.step, to: endOf(o, `tile:${o.who[1]}`) };
        if (/^(\.\.\.|…)/.test(t)) outItems.push(...shift([{ k: "text", x: tx + 4, y: ty + 32, s: t, f: "sub", ink: "muted" }], 0, 0, when));
        else outItems.push(...shift([{ k: "box", x: tx, y: ty, w, h: 56, fill: toned ? `${P(tv.tone)}:soft` : "surface", stroke: toned ? `${P(tv.tone)}:line` : "line-2", r: 8, thick: toned, id: `tile:${o.who[1]}`, bar: { kind: "card", id: `tile:${o.who[1]}`, label: t } }, { k: "text", x: tx + 9, y: ty + 15, s: t, f: "sub", ink: "muted" }, { k: "text", x: tx + 9, y: ty + 34, s: v, f: "title", ink: toned ? `${P(tv.tone)}:ink` : "ink", strike: tv.strike }, ...(l2 ? [{ k: "text" as const, x: tx + 9, y: ty + 50, s: l2, f: "sub" as const, ink: "muted" as const }] : [])], 0, 0, when));
      } else if (o.word === "strip") {
        const st = s.strips.get(o.who[1])!, hl = wrap(st.head, inner, "sub", 2);
        const tight = stripCell(st), scw = Math.floor(inner / tight) >= st.v.length ? tight : tight + 6, per = Math.max(1, Math.floor(inner / scw)), rowsN = Math.ceil(st.v.length / per), last = st.v.length - 1;
        const its: Item[] = hl.map((t, i) => ({ k: "text" as const, x: ox + 12, y: inY + 12 + i * LINE_H.sub, s: t, f: "sub" as const, ink: "muted" as const }));
        // one row: the ends under the first and the last cell; wrapped: the first end above the first cell, the last under the last
        const above = rowsN > 1 && st.ends[0] ? LINE_H.sub + 10 : 0, cy0 = inY + hl.length * LINE_H.sub + 4 + above;
        if (above) its.push({ k: "text", x: ox + 12, y: cy0 - 6, s: st.ends[0], f: "sub", ink: "muted" });
        its.push({ k: "box", x: ox + 8, y: cy0 - 4, w: ow - 16, h: rowsN * PITCH + 4 + COL_H, fill: "none", stroke: "none", r: 6, bar: { kind: "strip", id: `strip:${st.id}`, label: st.head } });
        st.v.forEach((v, j) => {
          const x = ox + 12 + (j % per) * scw, cy = cy0 + Math.floor(j / per) * PITCH, cid = `cell:${st.id}:${j}`;
          cellPos.set(`${st.id}:${j}`, { x, y: cy, w: scw - STRIP_GAP });
          its.push({ k: "box", x, y: cy, w: scw - STRIP_GAP, h: CELL_H, fill: "surface", stroke: "line", r: 4, cls: "stg-cell", id: cid, bar: { kind: "chip", id: cid, column: `s${j % per}` } }, { k: "text", x: x + (scw - STRIP_GAP) / 2, y: cy + 15, s: v, f: "sub", ink: "ink", anchor: "middle" });
        });
        const ly = cy0 + rowsN * PITCH + 8;
        if (st.ends[0] && !above) its.push({ k: "text", x: ox + 12, y: ly, s: st.ends[0], f: "sub", ink: "muted" });
        let ly2 = ly;
        if (st.ends[1]) {
          const lx = Math.min(ox + ow - 12, Math.max(ox + 12 + measure(st.ends[1], "sub"), ox + 12 + (last % per) * scw + scw - STRIP_GAP));
          if (st.ends[0] && !above && lx - measure(st.ends[1], "sub") < ox + 12 + measure(st.ends[0], "sub") + 8) ly2 = ly + LINE_H.sub; // the two ends would touch: the last one a line lower
          its.push({ k: "text", x: lx, y: ly2, s: st.ends[1], f: "sub", ink: "muted", anchor: "end" });
        }
        outItems.push(...shift(its, 0, 0, { from: o.step, to: 0 }));
        inY = ly2 + 10;
      } else if (o.word === "total") {
        const nm = o.who[1] ?? "";
        if (!totalAt.has(nm)) {
          const all = s.ops.filter((x) => x.word === "total" && (x.who[1] ?? "") === nm), l = Math.max(...all.map((t) => totalBlock(t, ox, 0, ow, 0, box.narrow).lines));
          totalAt.set(nm, { y: inY, l }); inY += Math.max(...all.map((t) => totalBlock(t, ox, 0, ow, l, box.narrow).h));
        }
        const at = totalAt.get(nm)!, tb = totalBlock(o, ox, at.y, ow, at.l, box.narrow);
        outItems.push(...shift(tb.items, 0, 0, { from: o.step, to: endOf(o, `total:${nm}`) }));
      } else if (o.word === "aside") {
        const ls = wrap(o.arg, inner, "sub", 4);
        outItems.push(...shift(ls.map((t, i) => ({ k: "text" as const, x: ox + 12, y: inY + 10 + i * LINE_H.sub, s: t, f: "sub" as const, ink: "muted" as const })), 0, 0, { from: o.step, to: 0 }));
        inY += ls.length * LINE_H.sub + (narrow ? 3 : 6);
      }
    }
    // ---- the steps' work on the left: results, partial cards
    for (const o of valOps) {
      const [lab, vals] = [o.arg.split(" | ")[0], parts(o.arg.split(" | ")[1] ?? "", ",")];
      o.who.forEach((id, j) => {
        const r = rowOf.get(id)!, yy = rowY.get(id)!, x = nl ? 16 : 8 + rowsW + 8, vy = nl ? yy + rowH(r) - 50 : tallH ? yy + (rowH(r) - 44) / 2 : yy + 2, res = result(vals[j] ?? "");
        const when = { from: o.step, to: endOf(o, `value:${id}`) };
        if (valBeside(r) || valUnder(r)) { // one line at the right of the row's label line (or under its cells): the label muted, the result in its tone
          const vw = valNarrowW.get(id)!, bx = valBeside(r) ? leftW - 16 - vw : 16, top = valBeside(r) ? yy + 4 : yy + rowH(r) - 27, dy = top - yy - 4;
          items.push(...shift([{ k: "box", x: bx, y: yy + 4 + dy, w: vw, h: CELL_H, fill: `${P(res.tone)}:soft`, stroke: `${P(res.tone)}:line`, r: 8, thick: true, id: `value:${id}`, bar: { kind: "card", id: `value:${id}`, label: lab } }, { k: "text", x: bx + 9, y: yy + 19 + dy, s: lab, f: "sub", ink: "muted" }, { k: "text", x: bx + vw - 9, y: yy + 19 + dy, s: res.s, f: "small-b", ink: `${P(res.tone)}:ink`, anchor: "end", strike: res.strike }], 0, 0, when));
          return;
        }
        items.push(...shift([{ k: "box", x, y: vy, w: nl ? leftW - 32 : valW, h: 44, fill: `${P(res.tone)}:soft`, stroke: `${P(res.tone)}:line`, r: 8, thick: true, id: `value:${id}`, bar: { kind: "card", id: `value:${id}`, label: lab } }, { k: "text", x: x + (nl ? 10 : valW / 2), y: vy + 17, s: lab, f: "sub", ink: "muted", anchor: nl ? "start" : "middle" }, { k: "text", x: x + (nl ? 10 : valW / 2), y: vy + 36, s: res.s, f: res.tone === "good" ? "title" : "body", ink: res.tone === "good" ? "ink" : `${P(res.tone)}:ink`, anchor: nl ? "start" : "middle", strike: res.strike }], 0, 0, when));
      });
    }
    for (const o of sumOps) {
      const g = s.groups.find((x) => x.id === o.who[0])!, b = sumBody(o), [gy, gh] = groupY.get(g.id)!, sh = sumHeight(g);
      const x = nl ? 8 : 8 + rowsW + 8 + (valW ? valW + 8 : 0), sy = nl ? gy + gh - 12 - sh : gy + 30, sw = sumW, hh = nl ? sh : gh - 38;
      const when = { from: o.step, to: endOf(o, `sum:${g.id}`) };
      // the partial is the step's actor where it is written: lit in that step only (the original lights it), unless "light" names its group, which then decides alone
      const its: Item[] = [{ k: "box", x, y: sy, w: sw, h: hh, fill: "surface", stroke: `role:${g.role}:line`, r: 8, /* a thin border in its role's colour, never thick (a thick one reads as lit on every later step); lit, it is thick in that colour (a grey lit border read as a shadow) */ id: `sum:${g.id}`, hot: [o.step], bar: { kind: "card", id: `sum:${g.id}`, label: b.ls[0] ?? "" } }];
      let ty = sy + 17 + (b.rows[0]?.beside !== undefined ? 4 : 0), ri = 0; // chips on the title's line keep 4 px off the top
      const chipRows = (upTo: number) => { while (ri < b.rows.length && b.rows[ri].at <= upTo) { const bs = b.rows[ri].beside, cx0 = x + 12 + (bs ?? 0), cty = bs !== undefined ? ty - LINE_H.sub - 9 : ty; for (const c of b.rows[ri].chips) its.push({ k: "box", x: cx0 + c.x, y: cty - 6, w: c.w, h: CELL_H, fill: `role:${g.role}:soft`, stroke: `role:${g.role}:line`, r: 11, bar: { kind: "chip", label: c.s } }, { k: "text", x: cx0 + c.x + c.w / 2, y: cty + 9, s: wrap(c.s, c.w - 12, "sub", 1)[0], f: "sub", ink: `role:${g.role}:ink`, anchor: "middle" }); ty += bs !== undefined ? 0 : 30; ri++; } };
      b.ls.forEach((tl, i) => { chipRows(i); if (i === b.ls.length - 1 && b.sent && sentBeside(b) >= 0 && !sentSnug(b)) ty += 4; its.push({ k: "text", x: x + 12, y: ty, s: tl, f: "sub", ink: i ? "ink" : "ink-2" }); ty += LINE_H.sub; });
      chipRows(b.ls.length);
      if (b.sent) { const bx = sentBeside(b), cwid = measure(b.sent, "sub") + 22, cy = bx >= 0 ? ty - LINE_H.sub - 15 : sy + hh - 8 - CELL_H, cx = x + sw - 12 - cwid, leaves = s.out ? passStep(g.id, o.step) : 0, cwhen = leaves ? (leaves > o.step ? { on: Array.from({ length: Math.min(leaves - 1, when.to || n) - o.step + 1 }, (_, i) => o.step + i) } : { on: [0] }) : {}; its.push({ k: "box", x: cx, y: cy, w: cwid, h: CELL_H, fill: `role:${g.role}:soft`, stroke: `role:${g.role}:line`, r: 11, bar: { kind: "chip", label: b.sent }, ...cwhen }, { k: "text", x: cx + cwid / 2, y: cy + 15, s: b.sent, f: "sub", ink: `role:${g.role}:ink`, anchor: "middle", ...cwhen }); }
      items.push(...shift(its, 0, 0, when));
    }
    // ---- cell overlays: dim (from its step until the row's next dim), keep (until the cell's next keep), mark (its step)
    const over: Item[] = [];
    // light: the stage's halo (hot) on the named boxes in their step; a group lights its partial card when one shows then, else its lane
    const lit = (all: Item[]) => {
      const lights = opsOf("light"); if (!lights.length) return all;
      const byId = new Map<string, Item[]>(); for (const it of all) if (it.k === "box" && it.id) (byId.get(it.id) ?? byId.set(it.id, []).get(it.id)!).push(it);
      charge(lights.length * 4); const handLit = new Set<Item>();
      for (const o of lights) for (const key of o.who) {
        const [kind, id] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
        const sum = kind === "g" ? (byId.get(`sum:${id}`) ?? []).filter((b) => steps(b).includes(o.step)) : [];
        // a row lights its result when one shows then (the original lights the results), else the row
        const val = kind === "row" ? (byId.get(`value:${id}`) ?? []).filter((b) => steps(b).includes(o.step)) : [];
        const targets = kind === "g" ? (sum.length ? sum : byId.get(`group:${id}`) ?? []) : val.length ? val : (byId.get(key) ?? []).filter((b) => steps(b).includes(o.step));
        for (const b of targets) { if (kind === "g" && sum.length && !handLit.has(b)) { handLit.add(b); b.hot = []; } if (!b.hot?.includes(o.step)) b.hot = [...(b.hot ?? []), o.step]; } // a partial lit by hand: "light" alone decides its steps
      }
      return all;
    };
    const dims = opsOf("dim"), cellBoxes = new Map<string, Item[]>(); // "cell:id:j" -> its boxes (a dim marks them faint)
    const at10 = (x: number, y: number) => `${Math.round(x * 10)}|${Math.round(y * 10)}`, cellText0 = new Map<string, Item[]>(); // a cell's own words, by place
    const steps = (it: Item) => { const o: number[] = []; for (let k = 1; k <= n; k++) if (it.on ? it.on.includes(k) : k >= (it.from ?? 1) && (!it.to || k <= it.to)) o.push(k); return o; };
    for (const it of [...items, ...outItems]) {
      if (it.k === "box" && it.id?.startsWith("cell:")) { const l = cellBoxes.get(it.id); if (l) l.push(it); else cellBoxes.set(it.id, [it]); }
      else if (it.k === "text" && it.anchor === "middle" && it.f === "sub") { const k = at10(it.x, it.y); const l = cellText0.get(k); if (l) l.push(it); else cellText0.set(k, [it]); }
    }
    const covered = new Map<string, Set<number>>(); // place -> the steps a mark or keep writes the cell's words
    for (const id of new Set(dims.flatMap((o) => o.who))) {
      const mine = dims.filter((o) => o.who.includes(id)), size = rowOf.get(id)?.v.length ?? s.strips.get(id)?.v.length ?? 0;
      const at: (Set<number> | null)[] = []; let q = -1; // the dim in force at each step
      for (let k = 1; k <= n; k++) { while (q + 1 < mine.length && mine[q + 1].step <= k) q++; at.push(q < 0 ? null : new Set(mine[q].cells)); }
      charge(size * n);
      for (let j = 0; j < size; j++) {
        const on: number[] = [];
        for (let k = 1; k <= n; k++) if (at[k - 1]?.has(j + 1)) on.push(k);
        const p = cellPos.get(`${id}:${j}`); if (!on.length || !p) continue;
        const dimSet = new Set(on);
        for (const it of cellBoxes.get(`cell:${id}:${j}`) ?? []) {
          if (it.k !== "box" || it.dash) continue;
          const sh = steps(it), faint = sh.filter((k) => dimSet.has(k)); if (!faint.length) continue;
          it.on = sh.filter((k) => !dimSet.has(k)); if (!it.on.length) it.on = [0];
          items.push({ ...it, on: faint, dash: true, stroke: "line-2", fill: "none", dim: faint, cls: "stg-cell stg-dimcell" });
        }
        for (const it of cellText0.get(at10(p.x + p.w / 2, p.y + 15)) ?? []) it.dim = on;
      }
    }
    for (const o of markOps) {
      const [tone] = o.arg.split(" "), ml = markLines(o), nls = noteLines(o);
      for (const id of o.who) for (const c of o.cells) {
        const p = cellPos.get(`${id}:${c - 1}`); if (!p) continue;
        const when = o.word === "mark" ? { from: o.step, to: o.step } : { from: o.step, to: endOf(o, `keep:${id}:${c}`) };
        const r = rowOf.get(id), under0 = r ? rowY.get(id)! + cellTopOf(r) + lines(r) * pitch + 2 : p.y + CELL_H + 2;
        { const key = at10(p.x + p.w / 2, p.y + 15), cv = covered.get(key) ?? covered.set(key, new Set()).get(key)!; for (let k = when.from; k <= (when.to || n); k++) cv.add(k); }
        over.push(...shift([{ k: "box", x: p.x, y: p.y, w: p.w, h: CELL_H, fill: `${P(tone)}:soft`, stroke: `${P(tone)}:line`, r: 4, thick: true }, { k: "text", x: p.x + p.w / 2, y: p.y + 15, s: cellText(s, id, c - 1), f: "sub", ink: tone === "accent" ? "ink" : `${P(tone)}:ink`, anchor: "middle" }], 0, 0, when));
        if ((ml.length || nls.length) && c === o.cells[0]) {
          const lo = r ? 16 : ox + 12, hi = r ? (nl ? leftW - 16 : 8 + rowsW - 8) : ox + ow - 12, cx = Math.max(lo + markW / 2, Math.min(hi - markW / 2, p.x + p.w / 2));
          // a mark's words that are one amount ("+160") draw as a pill in the mark's tone, under the cell holding that value when the row has one (the original's "+160" under 160), else under the marked cell; a note fits beside it on its left when there is room
          const amt = ml.length === 1 && /^[+\u2212-][0-9][0-9.,]*$/.test(ml[0]) ? ml[0] : "";
          let noteRow = ml.length; const c0 = r ? cellPos.get(`${id}:0`) : undefined, nx = c0 && !nl ? Math.max(lo + 8, c0.x) : lo + 8;
          if (amt) {
            const nv = amt.slice(1), cols = r ? r.v.length : 0; let at = p;
            for (let j = 0; j < cols; j++) if (cellText(s, id, j) === nv) { at = cellPos.get(`${id}:${j}`) ?? p; break; }
            const pw = measure(amt, "sub") + 18, px = Math.max(lo, Math.min(hi - pw, at.x + at.w / 2 - pw / 2)), py = under0 + 10 - 13;
            over.push(...shift([{ k: "box", x: px, y: py, w: pw, h: 18, fill: `${P(tone)}:soft`, stroke: `${P(tone)}:line`, r: 9, bar: { kind: "chip", label: amt } } as Item, { k: "text", x: px + pw / 2, y: under0 + 10, s: amt, f: "sub", ink: tone === "accent" ? "ink" : `${P(tone)}:ink`, anchor: "middle" } as Item], 0, 0, { from: o.step, to: o.step }));
            if (nls.length && nx + measure(nls[0], "sub") + 10 <= px) noteRow = 0;
          } else over.push(...shift(ml.map((t, i) => ({ k: "text" as const, x: cx, y: under0 + 10 + i * LINE_H.sub, s: t, f: "sub" as const, ink: tone === "accent" ? "ink" : `${P(tone)}:ink`, anchor: "middle" as const })), 0, 0, { from: o.step, to: o.step }));
          over.push(...shift(nls.map((t, i) => ({ k: "text" as const, x: nx, y: under0 + 10 + (noteRow + i) * LINE_H.sub, s: t, f: "sub" as const, ink: tone === "accent" ? "ink" : `${P(tone)}:ink` })), 0, 0, { from: o.step, to: o.step }));
        }
      }
    }
    for (const [key, cv] of covered) for (const it of cellText0.get(key) ?? []) { const sh = steps(it).filter((k) => !cv.has(k)); it.on = sh.length ? sh : [0]; }
    if (s.out) {
      // wide: the column ends level with the last group; the page token "sheet-outcome: panel" makes it a fixed panel 0.312 of the width tall
      const panel = box.theme?.["sheet-outcome"] === "panel" ? Math.round(box.w * 0.312) : 0;
      const oh = narrow ? inY - oy + 8 : Math.max(leftBottom - top, panel, inY - oy + 8);
      // the column's frame first, so its contents draw over it; the cell overlays last
      const frame: Item[] = [{ k: "box", x: ox, y: oy, w: ow, h: oh, fill: `role:${s.out.role}:plane`, stroke: `role:${s.out.role}:line`, r: 10, cls: "scn-frame", role: s.out.role, id: `out:${s.out.id}`, bar: { kind: "card", id: `out:${s.out.id}`, label: s.out.title, role: s.out.role } }, { k: "text", x: ox + 12, y: oy + (narrow ? 18 : 20), s: s.out.title, f: "title", ink: "ink" }];
      if (s.out.note) frame.push(noteBelow ? { k: "text", x: ox + 12, y: oy + (narrow ? 34 : 37), s: wrap(s.out.note, ow - 24, "sub", 1)[0], f: "sub", ink: "ink-2", tip: s.out.note } : { k: "text", x: ox + ow - 12, y: oy + (narrow ? 18 : 20), s: s.out.note, f: "sub", ink: "ink-2", anchor: "end" });
      // a phone: the notes stay with the groups' column (right under them), the outcome column moves under the notes
      return { h: Math.max(leftBottom, oy + oh) + 4, items: lit([...frame, ...items, ...outItems, ...over]), slot: narrow ? { x: 0, y: oy, w: box.w, under: true } : { x: 0, y: leftBottom + 12, w: leftW } };
    }
    return { h: leftBottom + 4, items: lit([...items, ...over]) };
  },
  facts(s: Sheet, step) {
    if (step === 0) return [`${s.title}${s.note ? ` (${s.note})` : ""}:`, ...(s.cols.length ? [`columns: ${s.cols.join(", ")}`] : []), ...s.groups.flatMap((g) => [`${g.title}${g.note ? ` (${g.note})` : ""}:`, ...g.rows.map((r) => `  ${r.label}: ${r.v.map((v, j) => (r.empty[j] ? "(empty)" : v)).join(", ")}`)]), ...(s.out ? [`${s.out.title}${s.out.note ? ` (${s.out.note})` : ""}.`] : [])];
    const rows = new Map(s.groups.flatMap((g) => g.rows.map((r) => [r.id, r] as const)));
    const name = (id: string) => rows.get(id)?.label ?? s.strips.get(id)?.head ?? id;
    return s.ops.filter((o) => o.step === step).map((o) => {
      if (o.word === "mark" || o.word === "keep") { const [a0, ...nt] = o.arg.split(" | "), [tone, ...add] = a0.split(" "); return o.who.map((id) => `${name(id)}, value ${o.cells.join(", ")} (${o.cells.map((c) => cellText(s, id, c - 1)).join(", ")}): ${tone}${add.length ? ", " + add.join(" ") : ""}${nt.length ? "; " + nt.join(" | ") : ""}.`).join(" "); }
      if (o.word === "dim") return o.cells.length ? `${o.who.map(name).join(", ")}: ${o.cells.length === 1 ? `value ${o.cells[0]} is` : `values ${o.cells.join(", ")} are`} left out.` : `${o.who.map(name).join(", ")}: every value counts again.`;
      if (o.word === "fill") { const vs = parts(o.arg, ","); return `${o.who.map((id, j) => `${name(id)} value ${o.cells[0]}: ${vs[j]}`).join(", ")}.`; }
      if (o.word === "value") { const [lab, vals] = [o.arg.split(" | ")[0], parts(o.arg.split(" | ")[1] ?? "", ",")]; return `${lab}: ${o.who.map((id, j) => { const r = result(vals[j] ?? ""); return `${name(id)} ${r.s}${r.strike ? " (struck out)" : r.tone !== "good" ? ` (${r.tone})` : ""}`; }).join(", ")}.`; }
      if (o.word === "sum") { const g = s.groups.find((x) => x.id === o.who[0]); return `${g?.title ?? o.who[0]}: ${o.arg.replace(/ \| /g, "; ").replace(" -> ", ", sends ")}.`; }
      if (o.word === "pass") { const g = s.groups.find((x) => x.id === o.who[0]); return `${g?.title ?? o.who[0]} sends its partial to ${s.out?.title ?? "the outcome"}.`; }
      if (o.word === "tile") { const [t, v, l2] = parts(o.arg, " | "); return `${s.out?.title ?? "outcome"}, ${t}${v ? `: ${v}` : ""}${l2 ? ` (${l2})` : ""}.`; }
      if (o.word === "strip") { const st = s.strips.get(o.who[1])!; return `${st.head}: ${st.v.join(", ")}${st.ends[0] || st.ends[1] ? ` (${st.ends[0] || "first"} to ${st.ends[1] || "last"})` : ""}.`; }
      if (o.word === "total") return `${s.out?.title ?? "total"}: ${totalParts(o.arg).filter(Boolean).join(" => ").replace(/ \| /g, "; ").replace(" => ", "; ")}.`;
      return o.arg;
    });
  },
} satisfies StageBlock<Sheet>);

/** A strip cell's pitch: its widest value and a little air. */
/** a strip's cells sit tight, as the reference design's do (25 wide, 2 apart for four digits): the text and 6 px, then the gap */
const STRIP_GAP = 2;
const stripCell = (st: Strip) => Math.max(...st.v.map((v) => measure(v, "sub") + 6)) + STRIP_GAP;

/** The places an op writes to: a later op on the same place ends it. */
function placeKeys(o: Op): string[] {
  if (o.word === "value") return o.who.map((id) => `value:${id}`);
  if (o.word === "keep") return o.who.flatMap((id) => o.cells.map((c) => `keep:${id}:${c}`));
  if (o.word === "tile") return [`tile:${o.who[1]}`];
  if (o.word === "total") return [`total:${o.who[1] ?? ""}`];
  if (o.word === "sum") return [`sum:${o.who[0]}`];
  if (o.word === "hide") return o.who; // its places, named at parse
  return [];
}

/** A cell's words at the end of the scene: its own value, or the value a fill gives it. */
const LOOK = new WeakMap<Sheet, { n: number; rows: Map<string, Row>; fills: Map<string, string> }>();
function cellText(s: Sheet, id: string, j: number): string {
  const st = s.strips.get(id); if (st) return st.v[j] ?? "";
  let lk = LOOK.get(s);
  if (!lk || lk.n !== s.ops.length) { // built once per sheet (again only if ops were added since)
    const fills = new Map<string, string>();
    for (const o of s.ops) if (o.word === "fill") { const vs = parts(o.arg, ","); o.who.forEach((w, i) => { const k = `${w}:${o.cells[0] - 1}`; if (!fills.has(k)) fills.set(k, vs[i] ?? ""); }); }
    lk = { n: s.ops.length, rows: new Map(s.groups.flatMap((g) => g.rows.map((r) => [r.id, r] as const))), fills }; LOOK.set(s, lk);
  }
  const r = lk.rows.get(id); if (!r) return "";
  return r.empty[j] ? lk.fills.get(`${id}:${j}`) ?? "" : r.v[j];
}

/** a total's lines and its result: "lines | lines => label | value"; a total with no lines starts with "=> " */
function totalParts(arg: string): [string, string] { const m = /(^|\s)=>\s/.exec(arg); return m ? [arg.slice(0, m.index).trim(), arg.slice(m.index + m[0].length).trim()] : [arg, ""]; }

/** The total: its lines (wrapped), then the result box: a small label and the big value (wrapped, two lines at most). */
function totalBlock(o: Op, ox: number, y0: number, ow: number, linesTo = 0, phone = false): { h: number; lines: number; items: Item[] } {
  const [sums, res] = totalParts(o.arg), [rl, rv] = [res.split(" | ")[0].trim(), (res.split(" | ")[1] ?? "").trim()];
  const its: Item[] = []; let yy = y0 + 6;
  for (const t of parts(sums, " | ")) for (const l of wrap(t, ow - 24, "sub", 3)) { its.push({ k: "text", x: ox + 12, y: yy + 12, s: l, f: "sub", ink: "ink" }); yy += LINE_H.sub + 3; }
  const lines = yy - y0; yy = Math.max(yy, y0 + linesTo); // every version's result box sits at one place
  const res2 = result(rv), tone = P(res2.tone), id = o.who[1] ? `total:${o.who[1]}` : "total";
  // a phone: a big value that would wrap takes the title size on one line when that fits (the wide stage keeps it big)
  const wrapsBig = !!res2.s && wrap(res2.s, ow - 48, "big", 2).length > 1, big: Font = phone && wrapsBig && measure(res2.s, "title") <= ow - 48 ? "title" : "big", bl = res2.s ? wrap(res2.s, ow - 48, big, 2) : [];
  // a phone: the small label and the big value side by side on one line when both fit (21); the wide stage keeps them stacked
  const side = phone && !!rl && bl.length === 1 && 24 + measure(rl, "sub") + 14 + measure(bl[0], big) <= ow - 24;
  // a phone keeps its result box a little tighter: 5 above, 8 below, the label 17 over the value
  const above = phone ? 5 : 8, below = phone ? 8 : 12, labH = phone ? 17 : 18, top0 = phone ? 12 : 14;
  // side by side: the box is as tall as its one line and its padding, the baseline a quarter line up from the line's foot
  // (the big size: 40 tall, baseline 29, as before; the title size: 30 tall, baseline 21, so its descent clears the border)
  const sideBase = 8 + LINE_H[big] - Math.round(LINE_H[big] / 4);
  const bh = side ? 8 + LINE_H[big] + 4 : top0 + (rl ? labH : 0) + bl.length * LINE_H[big] + 4;
  yy += above - 8;
  its.push({ k: "box", x: ox + 10, y: yy + 8, w: ow - 20, h: bh, fill: `${tone}:soft`, stroke: `${tone}:line`, r: 10, thick: true, id, bar: { kind: "worksheet-row", id, label: rl || res2.s } });
  if (rl) its.push({ k: "text", x: ox + 24, y: side ? yy + 8 + sideBase - (big === "big" ? 2 : 0) : yy + 8 + top0 + 6, s: rl, f: "sub", ink: "muted" });
  const bx = side ? ox + 24 + measure(rl, "sub") + 14 : ox + 24;
  bl.forEach((t, i) => its.push({ k: "text", x: bx, y: side ? yy + 8 + sideBase : yy + 8 + top0 - 14 + (rl ? labH : 0) + 6 + (i + 1) * LINE_H[big] - 6, s: t, f: big, ink: res2.tone === "accent" ? "ink" : `${tone}:ink`, strike: res2.strike }));
  return { h: yy + 8 + bh + below - y0, lines, items: its };
}

// The sheet's groups, rows and outcome column are top-level lines after "sheet:"; the stage hands them over here
// (they read like cards, so the stage asks the sheet first while one is open).
export function sheetLine(s: Sheet, l: Line, body: Line[], ctx: { roles: Set<string>; problem: (n: number, m: string) => void }): boolean {
  const out = l.t.startsWith("=> ");
  const c = colon(out ? l.t.slice(3) : l.t); if (!c) return false;
  const q = c[0].indexOf(' "'), short = !out && q > 0 && c[0].endsWith('"') ? c[0].slice(q + 2, -1) : "";
  const [role, id] = (short ? c[0].slice(0, q) : c[0]).split(" "); if (!id) return false;
  if (!ctx.roles.has(role)) ctx.problem(l.n, `"${role}" is not a role of this page; the page declares ${[...ctx.roles].join(", ") || "none"}`);
  const [title, ...rest] = c[1].split(" | ").map((x) => x.trim());
  if (out) { if (s.out) throw new StageError(l.n, "a sheet has one outcome column"); s.out = { role, id, title, note: rest.join(" | ") }; return true; }
  if (!body.length) throw new StageError(l.n, `a sheet group lists its rows indented under it: role id "label": values`);
  charge(body.reduce((a, b) => a + b.t.length, 0));
  s.groups.push({ role, id, title, note: rest.join(" | "), short: short || title, rows: body.map((b) => parseRow(b, ctx.roles, ctx.problem)) });
  if (s.groups.length > MAX_GROUPS) throw new StageError(l.n, `a sheet holds at most ${MAX_GROUPS} groups`);
  if (s.groups.reduce((a, g) => a + g.rows.length, 0) > MAX_ROWS) throw new StageError(l.n, `a sheet holds at most ${MAX_ROWS} rows`);
  return true;
}
