// This package is the source of this file: edit it here. It began as a copy synced from a private prototype (scripts/sync.ts, now frozen).
// The alignment grid part (format version 8, free in format version 10): pure, shared by the parser (dh-lib), doccheck and the browser (site/src/align.tsx).
//
//   ```alignment title="Which task first?"
//   x: low effort .. high effort
//   y: high impact .. low impact
//   arrows: on
//   region: low effort / high impact "Quick wins" [good]
//   low effort / high impact "Do first" [good]: Fix the typo (one line), Add a sample
//   high effort / low impact "Skip": Rewrite the build
//   Update the logo @ 0.2, 0.7
//   ```
//
// Two lines name the axes, each with 2 to 6 names (the first and the last are the two ends); the two axes may differ in
// size, so a grid may be 2x2, 3x3, 2x4, 5x3, 6x6. x runs left to right and y top to bottom, each in the order written.
// Items go in a cell, by its column and row names (`column / row: item, item`, an optional "label" and a [colour] before
// the colon), or at a point (`item @ x, y`, both numbers from 0 to 1: 0 is the first end of the axis, 1 the last, the
// rest spread evenly). A `region:` line paints a block of cells with a label and a colour; `arrows: on` draws an arrow
// along each axis. Colours are theme names, never hex.
import { parseItem, splitList, itemText, splitAround, tailMark, briefList, TIER_COLOURS, type Err, type Item } from "./tier";

export const ALIGN_MAX = 6; // names on one axis
export interface Cell { col: number; row: number; label: string; colour: string; items: Item[]; line: number }
export interface Region { c0: number; c1: number; r0: number; r1: number; label: string; colour: string; line: number }
export interface Point extends Item { x: number; y: number; line: number }
export interface AlignSpec { title: string; xs: string[]; ys: string[]; cells: Cell[]; regions: Region[]; points: Point[]; arrows: boolean; errors: Err[] }

// a point line: /^(.*\S)\s*@\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*$/, read in one pass (the pattern backtracked
// through the name and through long runs of digits). Nothing after the "@" may hold one, so it is the last "@".
const NUM = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/; // the same numbers as [+-]?\d*\.?\d+, without the backtracking
const SPACE = /\s/;
function pointOf(t: string): [string, string, string, string] | null {
  const a = t.lastIndexOf("@");
  if (a < 0) return null;
  let e = a;
  while (e > 0 && SPACE.test(t[e - 1])) e--;
  const name = t.slice(0, e);
  if (!name || /[\n\r\u2028\u2029]/.test(name)) return null;
  // after the "@": spaces, a number, spaces, a comma, spaces, a number, spaces
  let i = a + 1;
  const skip = () => { while (i < t.length && SPACE.test(t[i])) i++; };
  const word = () => { const s = i; while (i < t.length && t[i] !== "," && !SPACE.test(t[i])) i++; return t.slice(s, i); };
  skip(); const x = word(); skip();
  if (t[i] !== ",") return null;
  i++; skip(); const y = word(); skip();
  return i === t.length && NUM.test(x) && NUM.test(y) ? [t, name, x, y] : null;
}
// "head [colour]" -> the head and the colour (lower case) or ""; the bracket must be last
const takeColour = (s: string): { head: string; colour: string; raw: string } => { const m = tailMark(s, "[", "]", true); return m ? { head: m[0].trim(), colour: m[1].trim().toLowerCase(), raw: m[1].trim() } : { head: s.trim(), colour: "", raw: "" }; };
const takeLabel = (s: string): { head: string; label: string } => { const m = tailMark(s, '"', '"'); return m ? { head: m[0].trim(), label: m[1].trim() } : { head: s.trim(), label: "" }; };

export function parseAlign(body: string, baseLine = 1, title = ""): AlignSpec {
  const errors: Err[] = [];
  const err = (line: number, msg: string) => errors.push({ line, msg });
  const axis: { x?: string[]; y?: string[] } = {}, axisLine: { x: number; y: number } = { x: baseLine, y: baseLine };
  const cells: Cell[] = [], points: Point[] = [], regions: Region[] = [];
  const cellAt = new Set<string>(); // "col,row" of the cells read so far
  let arrows = false, arrowsSeen = false;
  const where = new Map<string, string>(); // item (lower case) -> where it is
  const lines = body.split("\n");
  // pass 1: the two axis lines (they may come after the cells; the cells are read once both are known)
  lines.forEach((raw, i) => {
    const m = raw.trim().match(/^([xy])(?=(\s*))\2:(?=(\s*))\3(.*)$/); // spaces taken whole: no backtracking into them
    if (!m) return;
    const k = m[1] as "x" | "y", line = baseLine + i;
    if (axis[k]) { err(line, `a second "${k}:" line; name the ${k} axis once`); return; }
    axisLine[k] = line;
    const names = splitAround(m[4], "..").map((s) => s.trim());
    if (names.some((n) => !n)) { err(line, `"${k}:" has an empty name; write the names with " .. " between them, like "${k}: ${k === "x" ? "low effort .. high effort" : "high impact .. low impact"}"`); axis[k] = names.filter(Boolean); return; }
    if (names.length < 2) { err(line, `"${k}:" needs at least the two ends of the axis, like "${k}: ${k === "x" ? "lawful .. chaotic" : "good .. evil"}"`); axis[k] = names; return; }
    if (names.length > ALIGN_MAX) err(line, `"${k}:" has ${names.length} names; an axis may have 2 to ${ALIGN_MAX} (more cells would be too small to read): remove ${names.length - ALIGN_MAX}, or split the grid in two`);
    for (const n of names) if (/[\/:"@\[\]]/.test(n)) err(line, `axis name "${n}" may not hold / : " @ [ or ] (cell lines use them)`);
    const firstAt = new Map<string, number>();
    names.forEach((n, j) => { const key = n.trim().toLowerCase(); if (!firstAt.has(key)) firstAt.set(key, j); if (firstAt.get(key) !== j) err(line, `axis name "${n}" is used twice on the ${k} axis`); });
    axis[k] = names;
  });
  for (const k of ["x", "y"] as const) if (!axis[k]) err(baseLine, `the grid has no "${k}:" line; name the ${k} axis' ends, like "${k}: ${k === "x" ? "lawful .. chaotic" : "good .. evil"}"`);
  const xs = axis.x ?? [], ys = axis.y ?? [];
  // a name to its first place on the axis, compared trimmed and in lower case: a lookup, not a search of the axis
  const placeOf = (names: string[]) => { const m = new Map<string, number>(); names.forEach((x, j) => { const key = x.trim().toLowerCase(); if (!m.has(key)) m.set(key, j); }); return (n: string) => m.get(n.trim().toLowerCase()) ?? -1; };
  const colAt = placeOf(xs), rowAt = placeOf(ys);
  const add = (line: number, it: Item, at: string): boolean => {
    const key = it.name.toLowerCase();
    if (where.has(key)) { err(line, `"${it.name}" is placed twice (${where.get(key)} and ${at}); each item goes in one place`); return false; }
    where.set(key, at);
    return true;
  };
  const colourOk = (line: number, what: string, c: { colour: string; raw: string }): string => {
    if (!c.colour) return "";
    if (!TIER_COLOURS.includes(c.colour)) { err(line, `${what}: unknown colour "${c.raw}"; colours are ${TIER_COLOURS.join(", ")} (theme names, never a hex value)`); return ""; }
    return c.colour;
  };
  // a side of a region: a name, or "first .. last" in the axis order
  const span = (line: number, k: "x" | "y", s: string): [number, number] | null => {
    const names = k === "x" ? xs : ys, at = k === "x" ? colAt : rowAt;
    const parts = splitAround(s, "..").map((p) => p.trim());
    if (parts.length > 2 || parts.some((p) => !p)) { err(line, `a region's ${k === "x" ? "columns" : "rows"} are one name or "first .. last"; got "${s}"`); return null; }
    const idx = parts.map(at);
    const bad = parts.find((_, j) => idx[j] < 0);
    if (bad !== undefined) { err(line, `region: no ${k === "x" ? "column" : "row"} "${bad}"; the ${k === "x" ? "columns" : "rows"} are ${briefList(names)}`); return null; }
    if (idx.length === 2 && idx[0] > idx[1]) { err(line, `region: write the ${k === "x" ? "columns" : "rows"} in the axis order: "${parts[1]} .. ${parts[0]}"`); return null; }
    return [idx[0], idx[idx.length - 1]];
  };
  // pass 2: cells, regions, points, arrows
  lines.forEach((raw, i) => {
    const line = baseLine + i, t = raw.trim();
    if (!t || /^[xy]\s*:/.test(t)) return;
    const ar = t.match(/^arrows(?=(\s*))\1:(?=(\s*))\2(.*)$/);
    if (ar) {
      const v = ar[3].trim().toLowerCase();
      if (arrowsSeen) err(line, `a second "arrows:" line; write it once`);
      arrowsSeen = true;
      if (v === "on" || v === "off") arrows = v === "on"; else err(line, `"arrows:" is on or off (got "${ar[3].trim()}"); "arrows: on" draws an arrow along each axis`);
      return;
    }
    const rg = t.match(/^region(?=(\s*))\1:(?=(\s*))\2(.*)$/);
    if (rg) {
      if (!xs.length || !ys.length) return; // the missing axis is already reported
      const { head: h1, colour, raw: rawC } = takeColour(rg[3]);
      const { head, label } = takeLabel(h1);
      const parts = head.split("/").map((s) => s.trim());
      if (parts.length !== 2 || !parts[0] || !parts[1]) { err(line, `a region line is "region: columns / rows "label" [colour]", like "region: ${xs[0]} .. ${xs[1]} / ${ys[0]} "${label || "Quick wins"}" [good]"`); return; }
      const cs = span(line, "x", parts[0]), rs = span(line, "y", parts[1]);
      const c = colourOk(line, "region", { colour, raw: rawC });
      if (!colour) err(line, `a region needs a colour: add [${TIER_COLOURS.join("], [")}] after it (a region with no colour would not show)`);
      if (!cs || !rs) return;
      const r: Region = { c0: cs[0], c1: cs[1], r0: rs[0], r1: rs[1], label, colour: c || "c1", line };
      const clash = regions.find((o) => r.c0 <= o.c1 && o.c0 <= r.c1 && r.r0 <= o.r1 && o.r0 <= r.r1);
      if (clash) { err(line, `this region overlaps the region on line ${clash.line}; regions may not overlap: shrink one, or colour single cells instead`); return; }
      regions.push(r);
      return;
    }
    // the head of a cell line is everything before the first colon outside quotes
    let colon = -1, inq = false;
    for (let j = 0; j < t.length; j++) { if (t[j] === '"') inq = !inq; else if (t[j] === ":" && !inq) { colon = j; break; } }
    let col = -1, row = -1, label = "", cellColour = "", looksCell = false, headCol = "", headRow = "";
    if (colon > 0) {
      const { head: h1, colour, raw: rawC } = takeColour(t.slice(0, colon).trim());
      const lm = takeLabel(h1);
      label = lm.label;
      const parts = lm.head.split("/").map((s) => s.trim());
      if (parts.length === 2 && parts[0] && parts[1]) { looksCell = true; [headCol, headRow] = parts; col = colAt(headCol); row = rowAt(headRow); cellColour = colourOk(line, `cell ${headCol} / ${headRow}`, { colour, raw: rawC }); }
    }
    if (looksCell && col >= 0 && row >= 0) {
      const at = `cell ${xs[col]} / ${ys[row]}`;
      if (cellAt.has(`${col},${row}`)) { err(line, `${at} has two lines; put all its items on one line`); return; }
      const cell: Cell = { col, row, label, colour: cellColour, items: [], line };
      const rest = t.slice(colon + 1).trim();
      if (rest) for (const raw2 of splitList(rest)) {
        if (!raw2) { err(line, `${at} has an empty item (two commas in a row, or a comma at the end); remove the extra comma`); continue; }
        const it = parseItem(raw2);
        if (typeof it === "string") { err(line, `${at}: ${it}`); continue; }
        if (add(line, it, at)) cell.items.push(it);
      }
      cells.push(cell); cellAt.add(`${col},${row}`);
      return;
    }
    const p = pointOf(t);
    if (p) {
      const it = parseItem(p[1]);
      if (typeof it === "string") { err(line, `point line: ${it}`); return; }
      const x = +p[2], y = +p[3];
      for (const [k, v] of [["x", x], ["y", y]] as const) if (v < 0 || v > 1) err(line, `"${it.name}" is at ${k} = ${v}; a point's x and y go from 0 to 1 (0 is the first end of the axis, 1 the last, 0.5 the middle)`);
      if (x < 0 || x > 1 || y < 0 || y > 1) return;
      if (add(line, it, `at (${x}, ${y})`)) points.push({ ...it, x, y, line });
      return;
    }
    if (looksCell) {
      if (!xs.length || !ys.length) return; // the missing axis is already reported
      const why = col < 0 && row < 0 && colAt(headRow) >= 0 && rowAt(headCol) >= 0 ? `the column comes first: write "${headRow} / ${headCol}"`
        : col < 0 ? `no column "${headCol}": the columns are ${briefList(xs)}` : `no row "${headRow}": the rows are ${briefList(ys)}`;
      err(line, `cell "${headCol} / ${headRow}" does not match the axes: ${why}`);
      return;
    }
    err(line, `"${t.slice(0, 40)}" is not a cell line, a point line, a "region:" line or an "arrows:" line; write "column / row: item, item" for a cell, or "item @ x, y" for a point (x and y from 0 to 1)`);
  });
  if (!errors.length && !points.length && !cells.some((c) => c.items.length)) err(baseLine, `the alignment grid has no items; add a cell line like "${xs[0] ?? "column"} / ${ys[0] ?? "row"}: item, item" or a point line like "item @ 0.3, 0.7"`);
  return { title, xs, ys, cells, regions, points, arrows, errors };
}

const esc = (s: string) => s.replace(/\|/g, "\\|");
const num = (v: number) => String(Math.round(v * 1000) / 1000);
// what an LLM reads: one line naming the axes, then a table cell -> items, a line per region, and / or a table item -> (x, y); colours are dropped
export function alignLlm(spec: AlignSpec): string {
  const { xs, ys } = spec;
  const out = [`Alignment grid${spec.title ? `: ${spec.title}` : ""}${spec.title && /[.?!]$/.test(spec.title) ? "" : "."} Columns (x, left to right): ${xs.join(", ")}. Rows (y, top to bottom): ${ys.join(", ")}.`];
  const full = spec.cells.filter((c) => c.items.length || c.label);
  if (full.length) {
    out.push("", "| cell | items |", "| --- | --- |");
    const order = [...full].sort((a, b) => a.row - b.row || a.col - b.col);
    for (const c of order) out.push(`| ${esc(xs[c.col])} / ${esc(ys[c.row])}${c.label ? ` "${esc(c.label)}"` : ""} | ${c.items.length ? esc(c.items.map(itemText).join(", ")) : "(empty)"} |`);
    if (full.length < xs.length * ys.length) out.push("", "Cells not listed are empty.");
  }
  if (spec.regions.length) {
    out.push("");
    for (const r of spec.regions) out.push(`Region${r.label ? ` "${r.label}"` : ""}: columns ${r.c0 === r.c1 ? xs[r.c0] : `${xs[r.c0]} to ${xs[r.c1]}`}, rows ${r.r0 === r.r1 ? ys[r.r0] : `${ys[r.r0]} to ${ys[r.r1]}`}.`);
  }
  if (spec.points.length) {
    out.push("", `Points: x and y run from 0 (the first end: ${xs[0]}, ${ys[0]}) to 1 (the last end: ${xs[xs.length - 1]}, ${ys[ys.length - 1]}).`, "", "| item | x | y |", "| --- | --- | --- |");
    for (const p of spec.points) out.push(`| ${esc(itemText(p))} | ${num(p.x)} | ${num(p.y)} |`);
  }
  return out.join("\n");
}

// ---- format version 10: how wide a column must be so that no chip in a cell needs more than two lines ----
// A chip's chrome on a phone: padding 7 + 7, border 1.5 + 1.5; a cell's: padding 5 + 5, border 1 + 1; one pixel of slack.
export const ALIGN_PHONE_CHIP = 17, ALIGN_PHONE_CELL = 12;
// The least width (px) of the chip's text box that breaks the name into at most two lines: the wider half when the name
// is split at its best space, never less than its longest word.
export function twoLineW(name: string, width: (s: string) => number): number {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length < 2) return width(name);
  let best = Infinity;
  for (let k = 1; k < words.length; k++) best = Math.min(best, Math.max(width(words.slice(0, k).join(" ")), width(words.slice(k).join(" "))));
  return Math.max(best, ...words.map(width));
}
export function alignColMin(spec: AlignSpec, width: (s: string, font: number) => number, font = 12): number {
  let need = 0;
  for (const c of spec.cells) for (const it of c.items) need = Math.max(need, twoLineW(it.name, (s) => width(s, font)));
  return need ? Math.ceil(need + ALIGN_PHONE_CHIP + ALIGN_PHONE_CELL + 1) : 78;
}
