// Grid layout, the native form (format 12): `layout: grid` on the stage or a `[grid]` container.
//  - Regions are rows (`## Row title`); a row's things are its cells, side by side, one column width each.
//  - A container with no regions fills a grid of `cols=N` columns (`keys.cols`; else as many as fit), things in declaration order.
//  - A thing that is itself a container (a bin) is a framed cell: its title, a derived count of what is in it now, and its members in
//    their own grid. "A thing drops into a bin" is `x in bin2`; a member has one slot in every container it ever sits in, so a move
//    slides it between two slots and nothing else shifts (the still rule). The counts are worked out from the states, never written.
//  - A cell's words may change in a step (`text id: ...`, `is`): the cell is as tall as the tallest wording in the story.
// Everything here is measured with the layout context (`ctx.measure`, `ctx.wrap`), so the page's fonts decide.
import { LINE_H } from "../../../core/stage-core";
import type { Id, LayoutCtx, LayoutInput, Placed, Prim, Rect, StepState, Thing, ThingState } from "../../types";

const PAD = 14, GAP = 12, CP = 10, ROW_GAP = 12, MIN_CELL = 150, CHIP_CELL = 84, HEAD_GAP = 6;

const lc = (s: string) => s.trim();
/** the columns a grid container asks: `cols=N` on the thing, else 0 (as many as fit) */
const colsKey = (t: Thing | undefined): number => { const v = Number(t?.keys.cols ?? t?.keys.columns ?? 0); return Number.isInteger(v) && v >= 1 && v <= 8 ? v : 0; };

/** the width a container's inside gets: the stage's drawing width, or the cell the grid that holds it gave it (ctx.child's avail) */
export function innerWidth(input: Pick<LayoutInput, "avail">, ctx: LayoutCtx, id: Id | null): number {
  if (id === null) return Math.max(80, (input.avail ?? ctx.width) - 2 * PAD);
  return Math.max(60, (input.avail ?? ctx.width) - 2 * CP);
}
/** the narrowest a cell of this container is: small chips (a bin, an inventory of one-word things) pack tighter than cards */
function minCell(model: LayoutInput["model"], id: Id | null): number {
  if (id === null) return MIN_CELL;
  const kids = model.order.filter((k) => model.things[k].parent === id);
  return kids.every((k) => !model.things[k].container && model.things[k].lines.length === 0 && model.things[k].title.length <= 14) ? CHIP_CELL : MIN_CELL;
}
/** how many columns a grid container (or the stage) uses at width w */
function colsFor(model: LayoutInput["model"], ctx: LayoutCtx, id: Id | null, w: number): number {
  const asked = colsKey(id ? model.things[id] : undefined);
  const fit = Math.max(1, Math.min(6, Math.floor((w + GAP) / (minCell(model, id) + GAP))));
  const n = asked || fit;
  return ctx.phone ? Math.min(n, 2) : n;
}

export function placeNative(input: LayoutInput, ctx: LayoutCtx): Placed {
  const { model, states, container, members, regions } = input;
  const root = container === null;
  const me = container ? model.things[container] : undefined;
  const inW = innerWidth(input, ctx, container);
  const ox = root ? PAD : CP;                               // content's left edge inside this container
  // ---- the wording of every member over the whole story (the still rule: the tallest wording sets the cell)
  const wordsOf = (id: Id): { title: string; lines: string[] }[] => {
    const t = model.things[id], out = [{ title: t.title, lines: t.lines }];
    for (const s of states) { const st = s.things[id]; if (st?.text) out.push({ title: t.title, lines: st.text }); }
    return out;
  };
  const isBox = (id: Id) => !!model.things[id].container && model.things[id].layout === "grid";
  const cellH = (id: Id, w: number): number => {
    if (isBox(id)) return ctx.child(id, w).h;
    let h = 0;
    for (const v of wordsOf(id)) {
      const tl = ctx.wrap(lc(v.title), w - 2 * CP, "title", 3), sl = v.lines.flatMap((x) => ctx.wrap(lc(x), w - 2 * CP, "sub", 4));
      h = Math.max(h, 8 + tl.length * LINE_H.title + sl.length * LINE_H.sub + 8);
    }
    return Math.max(34, h);
  };

  // ---- the header of a container: its title (and a derived count), above its members
  let head = 0;
  const titleLines = me ? ctx.wrap(lc(me.title), inW - 40, "title", 2) : [];
  if (me) head = CP + titleLines.length * LINE_H.title + HEAD_GAP;

  // ---- rows
  type Row = { title: string | null; id: Id | null; cells: Id[] };
  let rows: Row[];
  if (root && regions.length) {
    rows = regions.map((r) => ({ title: r.title, id: r.id, cells: members.filter((m) => model.things[m].region === r.id) }));
    const loose = members.filter((m) => !model.things[m].region || !regions.some((r) => r.id === model.things[m].region));
    if (loose.length) rows.push({ title: null, id: null, cells: loose });
  } else {
    const cols0 = colsFor(model, ctx, container, inW);
    rows = [];
    for (let i = 0; i < members.length; i += cols0) rows.push({ title: null, id: null, cells: members.slice(i, i + cols0) });
  }
  const regionRows = root && regions.length > 0;
  const cols = Math.max(1, regionRows ? Math.max(...rows.map((r) => r.cells.length), 1) : colsFor(model, ctx, container, inW));
  const labW = regionRows && !ctx.phone ? Math.round(Math.min(168, Math.max(96, inW * 0.15))) : 0;
  const rowCols = regionRows && ctx.phone ? Math.min(cols, 2) : cols;
  const gridW = inW - (labW ? labW + GAP : 0);
  const colW = Math.max(40, (gridW - (rowCols - 1) * GAP) / rowCols);

  const rects: Record<Id, Rect> = {};
  const decorStatic: Prim[] = [];
  let y = head;
  rows.forEach((row, ri) => {
    const lines = row.title ? ctx.wrap(lc(row.title), (labW || inW) - 12, "lane", 3) : [];
    let labelH = 0;
    if (row.title && ctx.phone) { labelH = lines.length * LINE_H.lane + 4; lines.forEach((s, i) => decorStatic.push({ k: "text", key: `g:${container ?? ""}:row${ri}:t${i}`, x: ox, y: y + (i + 1) * LINE_H.lane - 4, lines: [s], font: "lane", anchor: "start", ink: "ink" })); }
    // a row's cells may wrap onto several lines on a phone (rowCols per line)
    const per = rowCols, groups: Id[][] = [];
    for (let i = 0; i < row.cells.length; i += per) groups.push(row.cells.slice(i, i + per));
    if (!groups.length) groups.push([]);
    const top0 = y + labelH;
    let gy = top0;
    groups.forEach((g) => {
      const gh = Math.max(g.length ? 0 : (row.title && !ctx.phone ? 34 : 0), ...g.map((id) => cellH(id, colW)));
      g.forEach((id, ci) => { rects[id] = { x: ox + (labW ? labW + GAP : 0) + ci * (colW + GAP), y: gy, w: colW, h: gh }; });
      gy += gh + ROW_GAP;
    });
    const rh = gy - ROW_GAP - top0;
    if (row.title && !ctx.phone) {
      decorStatic.push({ k: "rect", key: `g:${container ?? ""}:row${ri}:band`, rect: { x: ox, y: top0, w: inW, h: rh }, fill: "faint", edge: "line", r: 10, cls: "g-rowband" });
      lines.forEach((s, i) => decorStatic.push({ k: "text", key: `g:${container ?? ""}:row${ri}:t${i}`, x: ox + 12, y: top0 + 10 + (i + 1) * LINE_H.lane - 4, lines: [s], font: "lane", anchor: "start", ink: "ink" }));
    }
    y = gy - ROW_GAP + ROW_GAP;
  });
  const bodyH = Math.max(0, y - ROW_GAP);
  const w = root ? (input.avail ?? ctx.width) : inW + 2 * CP;
  const h = Math.ceil(me ? bodyH + CP : bodyH + (root ? 6 : 0));

  // ---- what is in a container now (derived counts)
  const inNow = (s: StepState, cid: Id): Id[] => Object.keys(s.things).filter((id) => { const st = s.things[id]; return st.visible && (st.in ?? model.things[id].parent) === cid && !st.at; });
  const countOf = (step: number): number => (container ? inNow(states[step], container).length : 0);

  const decor = (step: number): Prim[] => {
    const out: Prim[] = [];
    if (me) {
      out.push({ k: "box", key: `g:${container}:frame`, id: container!, shape: "box", rect: { x: 0, y: 0, w, h }, role: me.role, tone: states[step]?.things[container!]?.tone ?? null, dim: states[step]?.things[container!]?.dim, container: true, cls: "g-bin gf-soft ge-line" });
      titleLines.forEach((s, i) => out.push({ k: "text", key: `g:${container}:title${i}`, x: CP, y: CP + (i + 1) * LINE_H.title - 4, lines: [s], font: "title", anchor: "start", ink: "ink" }));
      out.push({ k: "chip", key: `g:${container}:count`, x: w - CP - 8, y: CP + 4, words: String(countOf(step)), role: me.role, cls: "g-count" });
    }
    return [...out, ...decorStatic];
  };
  const known = new Set<Id>(members);
  return {
    w, h,
    at(step) {
      const out: Record<Id, Rect> = {}, s = states[step];
      for (const id of members) { const st = s?.things[id]; if (st && st.visible && (st.in ?? model.things[id].parent) === container && rects[id]) out[id] = rects[id]; }
      return out;
    },
    decor,
    // a framed member (a bin) draws itself through its own decor; the others are plain cards the engine draws in their cell
    draw: (_step: number, id: Id, _r: Rect, _s: ThingState) => (known.has(id) && isBox(id) ? [] : null),
  };
}
