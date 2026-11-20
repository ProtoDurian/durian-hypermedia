// Synced from the Durian Hypermedia sources by scripts/sync.ts: edit the source, not this copy.
// The alignment grid part (format version 8): pure, shared by the parser (dh-lib), doccheck and the browser (site/src/align.tsx).
//
//   ```alignment title="Which task first?"
//   x: low effort .. high effort
//   y: high impact .. low impact
//   low effort / high impact "Do first": Fix the typo (one line), Add a sample
//   high effort / low impact "Skip": Rewrite the build
//   Update the logo @ 0.2, 0.7
//   ```
//
// Two lines name the axes, each with 2 names (the two ends) or 3 (the ends and the middle): a grid is 2x2 or 3x3.
// x runs left to right and y top to bottom, each in the order the names are written.
// Items go in a cell, by its column and row names (`column / row: item, item`, an optional "label" before the colon),
// or at a point (`item @ x, y`, both numbers from 0 to 1: 0 is the first end of the axis, 1 the last, 0.5 the middle).
import { parseItem, splitList, itemText, type Err, type Item } from "./tier";

export interface Cell { col: number; row: number; label: string; items: Item[]; line: number }
export interface Point extends Item { x: number; y: number; line: number }
export interface AlignSpec { title: string; xs: string[]; ys: string[]; cells: Cell[]; points: Point[]; errors: Err[] }

const eq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const POINT = /^(.*\S)\s*@\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*$/;

export function parseAlign(body: string, baseLine = 1, title = ""): AlignSpec {
  const errors: Err[] = [];
  const err = (line: number, msg: string) => errors.push({ line, msg });
  const axis: { x?: string[]; y?: string[] } = {}, axisLine: { x: number; y: number } = { x: baseLine, y: baseLine };
  const cells: Cell[] = [], points: Point[] = [];
  const where = new Map<string, string>(); // item (lower case) -> where it is
  const lines = body.split("\n");
  // pass 1: the two axis lines (they may come after the cells; the cells are read once both are known)
  lines.forEach((raw, i) => {
    const m = raw.trim().match(/^([xy])\s*:\s*(.*)$/);
    if (!m) return;
    const k = m[1] as "x" | "y", line = baseLine + i;
    if (axis[k]) { err(line, `a second "${k}:" line; name the ${k} axis once`); return; }
    axisLine[k] = line;
    const names = m[2].split(/\s*\.\.\s*/).map((s) => s.trim());
    if (names.some((n) => !n)) { err(line, `"${k}:" has an empty name; write the ends with " .. " between them, like "${k}: ${k === "x" ? "low effort .. high effort" : "high impact .. low impact"}"`); axis[k] = names.filter(Boolean); return; }
    if (names.length < 2) { err(line, `"${k}:" needs the two ends of the axis, like "${k}: ${k === "x" ? "lawful .. chaotic" : "good .. evil"}"`); axis[k] = names; return; }
    for (const n of names) if (/[\/:"@]/.test(n)) err(line, `axis name "${n}" may not hold / : " or @ (cell lines use them)`);
    names.forEach((n, j) => { if (names.findIndex((o) => eq(o, n)) !== j) err(line, `axis name "${n}" is used twice on the ${k} axis`); });
    axis[k] = names;
  });
  for (const k of ["x", "y"] as const) if (!axis[k]) err(baseLine, `the grid has no "${k}:" line; name the ${k} axis' ends, like "${k}: ${k === "x" ? "lawful .. chaotic" : "good .. evil"}"`);
  const xs = axis.x ?? [], ys = axis.y ?? [];
  for (const k of ["x", "y"] as const) { const n = (axis[k] ?? []).length; if (n > 3) err(axisLine[k], `"${k}:" has ${n} names, which makes a ${n}-wide grid; a grid is 2x2 or 3x3: give 2 names (the two ends) or 3 (the ends and the middle)`); }
  if (xs.length >= 2 && ys.length >= 2 && xs.length <= 3 && ys.length <= 3 && xs.length !== ys.length) err(axisLine.y, `the x axis has ${xs.length} names and the y axis ${ys.length}, which is a ${xs.length}x${ys.length} grid; a grid is 2x2 or 3x3, so give both axes 2 names or both 3`);
  const sized = xs.length >= 2 && ys.length >= 2 && xs.length <= 3 && ys.length <= 3;
  const add = (line: number, it: Item, at: string): boolean => {
    const key = it.name.toLowerCase();
    if (where.has(key)) { err(line, `"${it.name}" is placed twice (${where.get(key)} and ${at}); each item goes in one place`); return false; }
    where.set(key, at);
    return true;
  };
  const colAt = (n: string) => xs.findIndex((x) => eq(x, n)), rowAt = (n: string) => ys.findIndex((y) => eq(y, n));
  // pass 2: cells and points
  lines.forEach((raw, i) => {
    const line = baseLine + i, t = raw.trim();
    if (!t || /^[xy]\s*:/.test(t)) return;
    // the head of a cell line is everything before the first colon outside quotes
    let colon = -1, inq = false;
    for (let j = 0; j < t.length; j++) { if (t[j] === '"') inq = !inq; else if (t[j] === ":" && !inq) { colon = j; break; } }
    let col = -1, row = -1, label = "", looksCell = false, headCol = "", headRow = "";
    if (colon > 0) {
      let head = t.slice(0, colon).trim();
      const lm = head.match(/^(.*?)\s*"([^"]*)"$/);
      if (lm) { head = lm[1]; label = lm[2].trim(); }
      const parts = head.split("/").map((s) => s.trim());
      if (parts.length === 2 && parts[0] && parts[1]) { looksCell = true; [headCol, headRow] = parts; col = colAt(headCol); row = rowAt(headRow); }
    }
    if (looksCell && col >= 0 && row >= 0) {
      const at = `cell ${xs[col]} / ${ys[row]}`;
      if (cells.some((c) => c.col === col && c.row === row)) { err(line, `${at} has two lines; put all its items on one line`); return; }
      const cell: Cell = { col, row, label, items: [], line };
      const rest = t.slice(colon + 1).trim();
      if (rest) for (const raw2 of splitList(rest)) {
        if (!raw2) { err(line, `${at} has an empty item (two commas in a row, or a comma at the end); remove the extra comma`); continue; }
        const it = parseItem(raw2);
        if (typeof it === "string") { err(line, `${at}: ${it}`); continue; }
        if (add(line, it, at)) cell.items.push(it);
      }
      cells.push(cell);
      return;
    }
    const p = t.match(POINT);
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
        : col < 0 ? `no column "${headCol}": the columns are ${xs.join(", ")}` : `no row "${headRow}": the rows are ${ys.join(", ")}`;
      err(line, `cell "${headCol} / ${headRow}" does not match the axes: ${why}`);
      return;
    }
    err(line, `"${t.slice(0, 40)}" is not a cell line or a point line; write "column / row: item, item" for a cell, or "item @ x, y" for a point (x and y from 0 to 1)`);
  });
  if (!errors.length && !points.length && !cells.some((c) => c.items.length)) err(baseLine, `the alignment grid has no items; add a cell line like "${xs[0] ?? "column"} / ${ys[0] ?? "row"}: item, item" or a point line like "item @ 0.3, 0.7"`);
  return { title, xs, ys, cells, points, errors };
}

const esc = (s: string) => s.replace(/\|/g, "\\|");
const num = (v: number) => String(Math.round(v * 1000) / 1000);
// what an LLM reads: one line naming the axes, then a table cell -> items and / or a table item -> (x, y)
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
  if (spec.points.length) {
    out.push("", `Points: x and y run from 0 (the first end: ${xs[0]}, ${ys[0]}) to 1 (the last end: ${xs[xs.length - 1]}, ${ys[ys.length - 1]}).`, "", "| item | x | y |", "| --- | --- | --- |");
    for (const p of spec.points) out.push(`| ${esc(itemText(p))} | ${num(p.x)} | ${num(p.y)} |`);
  }
  return out.join("\n");
}
