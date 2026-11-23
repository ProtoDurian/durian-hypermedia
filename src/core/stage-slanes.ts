// This package is the source of this file: edit it here. It began as a copy of the private prototype's composed stage (0.7.0).
// The swimlane matrix (stage block "matrix"): lanes (rows) crossed with columns into cells; each cell holds
// cards and chips. Rows and columns are labelled, a step lights a cell (with a line of words under its contents), cards
// can enter or take the focus in a step, and the narrow form stacks the matrix by lane (a column label above each cell).
//
// matrix: Support tickets | who holds a ticket, stage by stage (optional caption | right note)
// column in: Intake | arrives (columns, left to right; id, title, optional note)
// column tr: Triage
// column fx: Fix
// support desk: Front desk | first contact (a lane: role id: title | note)
// in: [t1] New ticket | by email; [t2] Chat ask | live; + urgent (a cell: column id: items split by ";")
// tr: [t3] Tag it | priority and owner
// ops eng: Engineering | owns the fix
// fx: [t4] Patch | with a test; + hotfix;... about 40 more
// @step Arrive: A ticket arrives.
// light desk.in: two tickets wait (light a cell; words under its contents)
// @step Triage: It gets a tag.
// light desk.tr
// show t4 (a card appears; its place was reserved)
// light t3 (a card takes the focus in this step)
//
// An item is a card `[id role] title | line | line` (the bracket is optional; the lane's role colours it unless the
// bracket names another), a chip `+ words`, or `... words` (the "and more" of the cell). Targets of `cell`:
// `lane.column`, `lane.*` (a whole row), `*.column` (a whole column) or just `lane`. Nothing here is a size or a colour.
import { type Item, type StageBlock, type Box, type LayoutOut, type Line, type ParseCtx, StageError, LINE_H, registerBlock, measure, wrap, longestWord, parts, colon, expandIds, ID_RE, shift, forbidden } from "./stage-core";
import { docBudget } from "./stage-budget";

export const MATRIX_LIMITS = { bands: 8, lanes: 16, perCell: 12, items: 120, subs: 6 };
const SENTINEL = "\u0000matrix";

type MItem = { kind: "card" | "chip" | "more"; id: string; auto: boolean; role: string; title: string; subs: string[]; from: number; hot: number[]; line: number };
type Cell = { band: string; items: MItem[]; line: number };
type Lane = { role: string; id: string; title: string; note: string; cells: Cell[]; line: number };
type Band = { id: string; title: string; note: string; line: number };
type Op = { word: "cell" | "enter" | "spot"; cells: [string, string][]; ids: string[]; text: string; step: number; line: number };
type Matrix = { title: string; note: string; bands: Band[]; lanes: Lane[]; ops: Op[]; line: number };

const rolesList = (ctx: ParseCtx) => [...ctx.roles].join(", ") || "none";
const noRole = (r: string, ctx: ParseCtx) => `"${r}" is not a role of this page; the page declares ${rolesList(ctx)}`;

function parseItem(raw: string, lane: Lane, line: number, ctx: ParseCtx): MItem {
  docBudget().charge("matrix item", raw.length + 1, raw.length);
  let s = raw.trim(), kind: MItem["kind"] = "card";
  if (s === "..." || s.startsWith("... ")) {
    const t = s.slice(3).trim(); if (!t) throw new StageError(line, `"..." is the "and more" of a cell and needs words: ... about 40 more`);
    return { kind: "more", id: "", auto: true, role: lane.role, title: t, subs: [], from: 1, hot: [], line };
  }
  if (s.startsWith("+ ")) { kind = "chip"; s = s.slice(2).trim(); }
  let id = "", role = lane.role;
  if (s.startsWith("[")) {
    const k = s.indexOf("]"); if (k < 0) throw new StageError(line, `an item's id is written in brackets: [t1] title, or [t1 ops] to colour it by another role`);
    const w = s.slice(1, k).split(" ").filter(Boolean); s = s.slice(k + 1).trim();
    if (!w.length || w.length > 2) throw new StageError(line, `the bracket holds an id and at most one role: [t1] or [t1 ops]`);
    id = w[0]; if (!ID_RE.test(id)) throw new StageError(line, `"${id}" is not an id: letters, digits, -, _ and ., starting with a letter`);
    if (w[1]) { role = w[1]; if (!ctx.roles.has(role)) ctx.problem(line, noRole(role, ctx)); }
  }
  const [title, ...subs] = s.split(" | ").map((x) => x.trim());
  if (!title) throw new StageError(line, `an item needs words: [t1] New ticket | a second line, or + a chip`);
  if (kind === "chip" && subs.length) throw new StageError(line, `a chip is one line of words; a card has second lines: [t1] title | line`);
  if (subs.length > MATRIX_LIMITS.subs) throw new StageError(line, `a card holds at most ${MATRIX_LIMITS.subs} second lines`);
  return { kind, id, auto: !id, role, title, subs: subs.filter((x) => x !== ""), from: 1, hot: [], line };
}

registerBlock({
  word: "matrix", kind: "head", ops: ["show", "light"],
  parse(inp, ctx): Matrix {
    if (ctx.ids.has(SENTINEL)) throw new StageError(inp.line, "a scene holds one matrix");
    ctx.ids.add(SENTINEL);
    const [title, ...rest] = inp.arg.split(" | ").map((x) => x.trim());
    return { title: title ?? "", note: rest.join(" | "), bands: [], lanes: [], ops: [], line: inp.line };
  },
  claim(m: Matrix, l: Line, body: Line[], ctx): boolean {
    const c = colon(l.t); if (!c) return false;
    const head = c[0].split(" ").filter(Boolean);
    if (head[0] === "column" && head.length === 2) {
      const id = head[1]; if (!ID_RE.test(id)) throw new StageError(l.n, `"${id}" is not an id: letters, digits, -, _ and ., starting with a letter`);
      for (const b of body) throw new StageError(b.n, "a column is one line: column id: Title | a note");
      if (m.bands.some((b) => b.id === id)) throw new StageError(l.n, `column "${id}" is declared twice`);
      if (m.bands.length >= MATRIX_LIMITS.bands) throw new StageError(l.n, `a matrix has at most ${MATRIX_LIMITS.bands} columns`);
      const [title, ...rest] = c[1].split(" | ").map((x) => x.trim());
      if (!title) throw new StageError(l.n, `a column needs a title: column ${id}: Intake | a note`);
      m.bands.push({ id, title, note: rest.join(" | "), line: l.n }); return true;
    }
    if (head.length !== 2 || head[0] === "column") return false;
    const [role, id] = head;
    if (!ctx.roles.has(role)) ctx.problem(l.n, noRole(role, ctx));
    if (!ID_RE.test(id)) throw new StageError(l.n, `"${id}" is not an id: letters, digits, -, _ and ., starting with a letter`);
    if (m.lanes.some((x) => x.id === id)) throw new StageError(l.n, `lane "${id}" is declared twice`);
    if (m.lanes.length >= MATRIX_LIMITS.lanes) throw new StageError(l.n, `a matrix has at most ${MATRIX_LIMITS.lanes} lanes`);
    const [title, ...rest] = c[1].split(" | ").map((x) => x.trim());
    if (!title) throw new StageError(l.n, `a lane needs a title: role id: Front desk | a note`);
    if (!body.length) throw new StageError(l.n, `a lane lists its cells indented under it: columnid: [t1] card | line; + chip`);
    const lane: Lane = { role, id, title, note: rest.join(" | "), cells: [], line: l.n };
    for (const b of body) {
      const bad = forbidden(b.t); if (bad) ctx.problem(b.n, `no ${bad}`); // the stage checks the lines it reads itself; a lane's cells are read here
      const q = colon(b.t);
      if (!q || q[0].includes(" ")) throw new StageError(b.n, `a cell is "columnid: items": a column id, a colon, then cards and chips split by ";" (here: "${b.t.slice(0, 40)}")`);
      if (lane.cells.some((x) => x.band === q[0])) throw new StageError(b.n, `lane "${id}" holds column "${q[0]}" twice: put its items on one line, split by ";"`);
      const items = parts(q[1], ";").map((x) => parseItem(x, lane, b.n, ctx));
      if (!items.length) throw new StageError(b.n, `a cell holds at least one item (or leave the cell out)`);
      if (items.length > MATRIX_LIMITS.perCell) throw new StageError(b.n, `a cell holds at most ${MATRIX_LIMITS.perCell} items: end it with "... about 40 more"`);
      lane.cells.push({ band: q[0], items, line: b.n });
    }
    m.lanes.push(lane); return true;
  },
  check(m: Matrix, ctx) {
    if (!m.bands.length) throw new StageError(m.line, "a matrix needs columns: column in: Intake");
    if (!m.lanes.length) throw new StageError(m.line, "a matrix needs lanes, its rows: role id: Title, with cells indented under it");
    const known = m.bands.map((b) => b.id), seen = new Map<string, number>(); let n = 0;
    for (const lane of m.lanes) for (const cell of lane.cells) {
      if (!known.includes(cell.band)) ctx.problem(cell.line, `"${cell.band}" is not a column of the matrix (${known.join(", ")})`);
      cell.items.forEach((it, i) => {
        n++;
        if (it.auto) it.id = `${lane.id}.${cell.band}.${i + 1}`;
        else if (seen.has(it.id)) throw new StageError(cell.line, `"${it.id}" is used twice in the matrix (first on line ${seen.get(it.id)})`);
        seen.set(it.id, cell.line);
      });
    }
    if (n > MATRIX_LIMITS.items) throw new StageError(m.line, `a matrix holds at most ${MATRIX_LIMITS.items} items; this one has ${n}: split it`);
  },
  op(m: Matrix, op0, ctx) {
    // words pass: show (a card comes in), light (a card in focus, or a cell lit: lane.column, lane.*, *.column, lane)
    const k0 = op0.arg.indexOf(": "), tg0 = k0 < 0 ? op0.arg : op0.arg.slice(0, k0);
    const cellish = op0.word === "light" && parts(tg0, ",").every((t) => t.includes(".") || m.lanes.some((l) => l.id === t));
    const op = { ...op0, word: op0.word === "show" ? "enter" : cellish ? "cell" : "spot" };
    if (op.word === "spot" && k0 >= 0) { if (op0.shared && !m.lanes.some((l) => l.cells.some((c) => c.items.some((x) => !x.auto && x.id === tg0.trim())))) return false; ctx.problem(op.line, `a matrix card lights with no words: "light ${tg0.trim()}"; light its cell with words: "light lane.column: words"`); return; }
    const find = (id: string) => m.lanes.flatMap((l) => l.cells.flatMap((c) => c.items)).find((x) => x.id === id && !x.auto);
    const ids = () => m.lanes.flatMap((l) => l.cells.flatMap((c) => c.items.filter((x) => !x.auto).map((x) => x.id)));
    if (op.word === "cell") {
      const k = op.arg.indexOf(": "), tg = k < 0 ? op.arg.replace(/:$/, "") : op.arg.slice(0, k), text = k < 0 ? "" : op.arg.slice(k + 2).trim();
      const cells: [string, string][] = [];
      for (const t of parts(tg, ",")) {
        const [a, b = "*"] = t.includes(".") ? [t.slice(0, t.indexOf(".")), t.slice(t.indexOf(".") + 1)] : [t, "*"];
        const lanes = a === "*" ? m.lanes : m.lanes.filter((l) => l.id === a), bands = b === "*" ? m.bands : m.bands.filter((x) => x.id === b);
        if (!lanes.length) { if (op0.shared) return false; ctx.problem(op.line, `"${a}" is not a lane of the matrix (${m.lanes.map((l) => l.id).join(", ")})`); return; }
        if (!bands.length) { ctx.problem(op.line, `"${b}" is not a column of the matrix (${m.bands.map((x) => x.id).join(", ")})`); return; }
        for (const l of lanes) for (const x of bands) if (!cells.some(([p, q]) => p === l.id && q === x.id)) cells.push([l.id, x.id]);
      }
      if (!cells.length) { ctx.problem(op.line, `light names what to light: light desk.tr, or desk.* (a row), *.tr (a column)`); return; }
      if (text && cells.length > 1) { ctx.problem(op.line, `words under a cell go with one cell: name one lane.column (here ${cells.length} cells)`); return; }
      m.ops.push({ word: "cell", cells, ids: [], text, step: op.step, line: op.line }); return;
    }
    const want = expandIds(op.arg, ids()), bad = want.filter((id) => !find(id));
    if (!want.length) { ctx.problem(op.line, `${op0.word} names cards by their id: ${op0.word} t1, t2`); return; }
    if (bad.length) { if (op0.shared) return false; ctx.problem(op.line, `"${bad[0]}" is not a card of the matrix${ids().length ? ` (${ids().slice(0, 12).join(", ")}${ids().length > 12 ? ", ..." : ""})` : ": write [id] before its title"}`); return; }
    for (const id of want) { const it = find(id)!; if (op.word === "enter") it.from = Math.max(it.from, op.step); else it.hot.push(op.step); }
    m.ops.push({ word: op.word as "enter" | "spot", cells: [], ids: want, text: "", step: op.step, line: op.line });
  },
  layout(m: Matrix, box: Box): LayoutOut { return layoutMatrix(m, box); },
  facts(m: Matrix, step): string[] {
    const it = (x: MItem) => x.kind === "more" ? `and more: ${x.title}` : `${x.kind === "chip" ? "chip " : ""}${x.title}${x.subs.length ? ` (${x.subs.join("; ")})` : ""}`;
    const lane = (id: string) => m.lanes.find((l) => l.id === id)!, band = (id: string) => m.bands.find((b) => b.id === id)!;
    if (step === 0) return [
      `${m.title ? m.title + (m.note ? ` (${m.note})` : "") + ". " : ""}Columns: ${m.bands.map((b) => b.title + (b.note ? ` (${b.note})` : "")).join(", ")}.`,
      ...m.lanes.map((l) => `${l.title}${l.note ? ` (${l.note})` : ""}: ${m.bands.flatMap((b) => { const c = l.cells.find((x) => x.band === b.id); const xs = c?.items.filter((x) => x.from === 1) ?? []; return xs.length ? [`${b.title}: ${xs.map(it).join("; ")}`] : []; }).join(". ") || "empty"}.`),
    ];
    return m.ops.filter((o) => o.step === step).map((o) => {
      if (o.word === "cell") return `Lit: ${o.cells.map(([l, b]) => `${lane(l).title}, ${band(b).title}`).join("; ")}${o.text ? ` (${o.text})` : ""}.`;
      const items = m.lanes.flatMap((l) => l.cells.flatMap((c) => c.items.filter((x) => o.ids.includes(x.id)).map((x) => `${it(x)} [${l.title}, ${band(c.band).title}]`)));
      return `${o.word === "enter" ? "Now in the matrix" : "In focus"}: ${items.join("; ")}.`;
    });
  },
} satisfies StageBlock<Matrix>);

// ---------------------------------------------------------------- layout
const GAP = 6, CP = 6, CARD_P = 8;

/** One cell's contents laid out in width `w` at the origin: cards one under another, chips flowing, the "and more" last. */
function fillCell(lane: Lane, cell: Cell | undefined, w: number): { h: number; items: Item[] } {
  const items: Item[] = []; let y = 0, rx = 0, rh = 0;
  const flush = () => { if (rh) { y += rh + GAP; rx = 0; rh = 0; } };
  for (const it of cell?.items ?? []) {
    docBudget().charge("matrix cell", 1 + it.subs.length, 1);
    const when = { from: it.from, to: 0, hot: it.hot.length ? it.hot : undefined };
    if (it.kind === "card") {
      flush();
      const tw = w - 2 * CARD_P - 2, t = wrap(it.title, tw, "title", 2), s = it.subs.flatMap((x) => wrap(x, tw, "sub", 3)), h = 8 + t.length * LINE_H.title + s.length * LINE_H.sub + 6;
      const its: Item[] = [{ k: "box", x: 0, y, w, h, fill: `role:${it.role}:soft`, stroke: `role:${it.role}:line`, r: 8, cls: "scn-shape", id: `mx:${it.id}`, role: it.role, bar: { kind: "card", id: it.id, label: it.title, role: it.role } }];
      let ty = y + 8;
      for (const x of t) { ty += LINE_H.title; its.push({ k: "text", x: CARD_P, y: ty - 4, s: x, f: "title", ink: "ink", tip: t.length > 1 || x.endsWith("…") ? it.title : undefined }); }
      for (const x of s) { ty += LINE_H.sub; its.push({ k: "text", x: CARD_P, y: ty - 3, s: x, f: "sub", ink: "muted" }); }
      items.push(...shift(its, 0, 0, when)); y += h + GAP; continue;
    }
    if (it.kind === "more") {
      flush();
      const lines = wrap(it.title, w - 12, "sub", 2), h = 8 + lines.length * LINE_H.sub;
      items.push(...shift([{ k: "box", x: 0, y, w, h, fill: "none", stroke: "line-2", r: 8, dash: true, cls: "stg-more", bar: { kind: "chip", label: it.title } } as Item, ...lines.map((x, i): Item => ({ k: "text", x: w / 2, y: y + 4 + (i + 1) * LINE_H.sub - 3, s: x, f: "sub", ink: "muted", anchor: "middle", tip: it.title }))], 0, 0, when));
      y += h + GAP; continue;
    }
    const lines = wrap(it.title, w - 16, "chip", 2), cw = Math.min(w, Math.max(...lines.map((x) => measure(x, "chip"))) + 16), ch = 6 + lines.length * LINE_H.chip;
    if (rx && rx + GAP + cw > w) flush();
    const x = rx ? rx + GAP : 0;
    items.push(...shift([{ k: "box", x, y, w: cw, h: ch, fill: `role:${it.role}:soft`, stroke: `role:${it.role}:line`, r: 10, cls: "stg-chip", id: `mx:${it.id}`, role: it.role, bar: { kind: "chip", id: it.id, label: it.title, role: it.role } } as Item, ...lines.map((q, i): Item => ({ k: "text", x: x + cw / 2, y: y + 3 + (i + 1) * LINE_H.chip - 3, s: q, f: "chip", ink: `role:${it.role}:ink`, anchor: "middle", tip: lines.length > 1 || q.endsWith("…") ? it.title : undefined }))], 0, 0, when));
    rx = x + cw; rh = Math.max(rh, ch);
  }
  flush();
  return { h: Math.max(0, y - GAP), items };
}

function layoutMatrix(m: Matrix, box: Box): LayoutOut {
  const W = box.w, nb = m.bands.length, items: Item[] = [];
  docBudget().charge("matrix layout", 20 + m.lanes.length * nb * 4, m.lanes.length * nb);
  const labW = Math.round(Math.min(168, Math.max(104, W * 0.15))), x0 = labW + GAP, colW = (W - x0 - CP - (nb - 1) * GAP) / nb;
  const cards = m.lanes.flatMap((l) => l.cells.flatMap((c) => c.items));
  // a card's words sit CARD_P inside the card; a chip's 16 already holds its own padding (no CARD_P), both inside the cell's CP
  const need = Math.max(88, ...cards.map((c) => (c.kind === "card" ? Math.max(longestWord(c.title, "title"), ...c.subs.map((s) => longestWord(s, "sub"))) + 2 * CARD_P : Math.min(longestWord(c.title, "chip") + 16, 110)) + 2 * CP));
  const wide = !box.narrow && colW >= need && W >= 560;
  const lit = (l: string, b: string) => m.ops.filter((o) => o.word === "cell" && o.cells.some(([x, y]) => x === l && y === b));
  const cellOf = (l: Lane, b: string) => l.cells.find((c) => c.band === b);
  // room under a lit cell's contents for its words (one reserve per cell, the tallest of its steps)
  const capLines = (l: string, b: string, w: number) => Math.max(0, ...lit(l, b).filter((o) => o.text).map((o) => wrap(o.text, w - 16, "sub", 3).length));
  const capH = (n: number) => (n ? 10 + n * LINE_H.sub : 0);
  let y = 0;
  if (m.title || m.note) {
    if (m.title) items.push({ k: "text", x: 0, y: 14, s: m.title, f: "sub", ink: "muted" });
    if (m.note && !(m.title && measure(m.title + m.note, "sub") + 24 > W)) items.push({ k: "text", x: W, y: 14, s: m.note, f: "sub", ink: "muted", anchor: "end" });
    else if (m.note) items.push({ k: "text", x: 0, y: 30, s: m.note, f: "sub", ink: "muted" });
    y = m.note && m.title && measure(m.title + m.note, "sub") + 24 > W ? 42 : 28;
  }
  // a lit cell: its frame and its words, shown in that step only
  const lightCell = (l: Lane, b: string, x: number, cy: number, w: number, h: number) => {
    for (const o of lit(l.id, b)) {
      items.push({ k: "box", x, y: cy, w, h, fill: "none", stroke: "acc:line", r: 8, thick: true, cls: "stg-sel", from: o.step, to: o.step, hot: [o.step], bar: { kind: "other" } });
      if (o.text) {
        const ls = wrap(o.text, w - 16, "sub", 3), bh = capH(ls.length) - 2, by = cy + h - bh - 5;
        items.push({ k: "box", x: x + 5, y: by, w: w - 10, h: bh, fill: "acc:soft", stroke: "acc:line", r: 6, from: o.step, to: o.step, bar: { kind: "other" } }, ...ls.map((q, i): Item => ({ k: "text", x: x + 12, y: by + 5 + (i + 1) * LINE_H.sub - 3, s: q, f: "sub", ink: "acc:ink", from: o.step, to: o.step, tip: ls.length > 2 ? o.text : undefined })));
      }
    }
  };
  if (wide) {
    const colX = (j: number) => x0 + j * (colW + GAP);
    // the column heads
    const heads = m.bands.map((b) => ({ t: wrap(b.title, colW - 14, "lane", 2), n: b.note ? wrap(b.note, colW - 14, "sub", 2) : [] }));
    const hh = 10 + Math.max(...heads.map((h) => h.t.length * LINE_H.lane + h.n.length * LINE_H.sub)) + 4;
    m.bands.forEach((b, j) => {
      items.push({ k: "box", x: colX(j), y, w: colW, h: hh, fill: "surface-2", stroke: "line-2", r: 8, cls: "stg-band", id: `mx:band:${b.id}`, bar: { kind: "band", id: `band:${b.id}`, label: b.title, column: `col:${b.id}` } });
      heads[j].t.forEach((q, i) => items.push({ k: "text", x: colX(j) + colW / 2, y: y + 8 + (i + 1) * LINE_H.lane - 4, s: q, f: "lane", ink: "ink", anchor: "middle", tip: b.title }));
      heads[j].n.forEach((q, i) => items.push({ k: "text", x: colX(j) + colW / 2, y: y + 8 + heads[j].t.length * LINE_H.lane + (i + 1) * LINE_H.sub - 3, s: q, f: "sub", ink: "muted", anchor: "middle", tip: b.note }));
    });
    y += hh + GAP;
    for (const l of m.lanes) {
      const fills = m.bands.map((b) => fillCell(l, cellOf(l, b.id), colW - 2 * CP));
      const need2 = fills.map((f, j) => Math.max(34, f.h + 2 * CP + capH(capLines(l.id, m.bands[j].id, colW))));
      const lt = wrap(l.title, labW - 22, "title", 3), ln = l.note ? wrap(l.note, labW - 22, "sub", 5) : [];
      const labH = 14 + lt.length * LINE_H.title + (ln.length ? 4 + ln.length * LINE_H.sub : 0);
      const rh = Math.max(...need2, labH) + 2 * CP;
      items.push({ k: "box", x: 0, y, w: W, h: rh, fill: `role:${l.role}:plane`, stroke: `role:${l.role}:line`, r: 10, cls: "scn-frame swimlane", id: `mx:lane:${l.id}`, role: l.role, bar: { kind: "lane", id: `lane:${l.id}`, label: l.title, role: l.role } });
      lt.forEach((q, i) => items.push({ k: "text", x: 12, y: y + CP + 8 + (i + 1) * LINE_H.title - 4, s: q, f: "title", ink: "ink", tip: l.title.length > 0 && (lt.length > 2 || q.endsWith("…")) ? l.title : undefined }));
      ln.forEach((q, i) => items.push({ k: "text", x: 12, y: y + CP + 8 + lt.length * LINE_H.title + 4 + (i + 1) * LINE_H.sub - 3, s: q, f: "sub", ink: "muted", tip: l.note }));
      m.bands.forEach((b, j) => {
        const ch = rh - 2 * CP;
        items.push({ k: "box", x: colX(j), y: y + CP, w: colW, h: ch, fill: "surface", stroke: "line", r: 7, cls: "stg-mcell", id: `mx:cell:${l.id}.${b.id}`, bar: { kind: "panel", id: `cell:${l.id}.${b.id}`, column: `col:${b.id}` } });
        items.push(...shift(fills[j].items, colX(j) + CP, y + CP + CP));
        lightCell(l, b.id, colX(j), y + CP, colW, ch);
      });
      y += rh + GAP;
    }
    return { h: y - GAP + 2, items };
  }
  // the narrow form: lane by lane; each non-empty cell under its band's label
  const iw = W - 2 * 8 - 2 * CP;
  for (const l of m.lanes) {
    const lt = wrap(l.title, W - 24, "title", 3), ln = l.note ? wrap(l.note, W - 24, "sub", 3) : [];
    const sub: Item[] = []; let ly = 8 + lt.length * LINE_H.title + (ln.length ? 2 + ln.length * LINE_H.sub : 0) + 8;
    lt.forEach((q, i) => sub.push({ k: "text", x: 12, y: 8 + (i + 1) * LINE_H.title - 4, s: q, f: "title", ink: "ink", tip: lt.length > 2 || q.endsWith("…") ? l.title : undefined }));
    ln.forEach((q, i) => sub.push({ k: "text", x: 12, y: 8 + lt.length * LINE_H.title + 2 + (i + 1) * LINE_H.sub - 3, s: q, f: "sub", ink: "muted", tip: l.note }));
    for (const b of m.bands) {
      const c = cellOf(l, b.id), isLit = lit(l.id, b.id).length > 0;
      if (!c && !isLit) continue;
      const f = fillCell(l, c, iw), ch = Math.max(34, f.h + 2 * CP + capH(capLines(l.id, b.id, W - 16)));
      sub.push({ k: "text", x: 12, y: ly + 11, s: b.title, f: "small-b", ink: "ink-2" });
      ly += 16;
      const lx = 8, w = W - 16;
      sub.push({ k: "box", x: lx, y: ly, w, h: ch, fill: "surface", stroke: "line", r: 7, cls: "stg-mcell", id: `mx:cell:${l.id}.${b.id}`, bar: { kind: "panel", id: `cell:${l.id}.${b.id}` } });
      sub.push(...shift(f.items, lx + CP, ly + CP));
      // lit frames of this cell (drawn into `items` through a local shift below)
      const keep = items.length; lightCell(l, b.id, lx, ly, w, ch);
      const lit2 = items.splice(keep); sub.push(...lit2);
      ly += ch + 8;
    }
    items.push({ k: "box", x: 0, y, w: W, h: ly, fill: `role:${l.role}:plane`, stroke: `role:${l.role}:line`, r: 10, cls: "scn-frame swimlane", id: `mx:lane:${l.id}`, role: l.role, bar: { kind: "lane", id: `lane:${l.id}`, label: l.title, role: l.role } });
    items.push(...shift(sub, 0, y));
    y += ly + GAP;
  }
  return { h: y - GAP + 2, items };
}
