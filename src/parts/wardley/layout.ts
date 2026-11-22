// The wardley map's layout (format version 11): the word placer. Pure; every label looks at a bounded number of things,
// so the cost grows with the number of components and needs, never with their square; charged to the budget it is given.
import type { Budget } from "../../core/budget";
import { textW, wrap } from "../kit/text";
import type { WardleySpec } from "./part";

export const WM = { w: 640, h: 440, l: 44, r: 12, t: 14, b: 44, font: 13, small: 12 };
export interface Box { l: number; t: number; r: number; b: number }
export interface Placed { id: string; x: number; y: number; ex?: { x: number; y: number }; box: Box; text: string; anchorEnd: "start" | "end" | "middle"; tx: number; ty: number; evBox?: Box; evText?: string; evAnchor?: "start" | "end" | "middle"; evTx?: number }
export interface WardleyLayout { w: number; h: number; px: (e: number) => number; py: (v: number) => number; labels: Placed[]; notes: { text: string; x: number; y: number; w: number; lines: string[] }[]; minW: number }
const hitA = (a: Box, b: Box) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
const segHit = (b: Box, x1: number, y1: number, x2: number, y2: number) => { // a segment against a box, by sampling
  for (let k = 0; k <= 8; k++) { const x = x1 + ((x2 - x1) * k) / 8, y = y1 + ((y2 - y1) * k) / 8; if (x > b.l && x < b.r && y > b.t && y < b.b) return true; } return false;
};
// what a label must keep off (dots, labels placed, the sample points of the lines) sits in a grid of cells over the map; a
// candidate box looks only at the cells it covers, and at most NEAR things there (a spot that crowded cannot be read anyway)
const CELL = 32, NEAR = 12;
class AvoidGrid {
  readonly cols: number; readonly rows: number;
  private cells: { box: number[]; line: number[] }[];
  boxes: Box[] = []; lines: [number, number, number, number][] = [];
  private seenB: number[] = []; private seenL: number[] = []; private stamp = 0;
  constructor(w: number, h: number) { this.cols = Math.ceil(w / CELL); this.rows = Math.ceil(h / CELL); this.cells = Array.from({ length: this.cols * this.rows }, () => ({ box: [], line: [] })); }
  private cx(x: number) { return Math.min(this.cols - 1, Math.max(0, Math.floor(x / CELL))); }
  private cy(y: number) { return Math.min(this.rows - 1, Math.max(0, Math.floor(y / CELL))); }
  addBox(bx: Box) { const k = this.boxes.push(bx) - 1; this.seenB.push(0); for (let y = this.cy(bx.t); y <= this.cy(bx.b); y++) for (let x = this.cx(bx.l); x <= this.cx(bx.r); x++) this.cells[y * this.cols + x].box.push(k); }
  addLine(ln: [number, number, number, number]) {
    const k = this.lines.push(ln) - 1; this.seenL.push(0); let last = -1;
    for (let q = 0; q <= 8; q++) { const c = this.cy(ln[1] + ((ln[3] - ln[1]) * q) / 8) * this.cols + this.cx(ln[0] + ((ln[2] - ln[0]) * q) / 8); if (c !== last) { this.cells[c].line.push(k); last = c; } }
  }
  /** the cost of a box against what is near it, and the work it took (cells visited, things looked at) */
  cost(bx: Box): { cost: number; work: number } {
    const st = ++this.stamp; let cost = 0, seen = 0, work = 0;
    for (let y = this.cy(bx.t); y <= this.cy(bx.b) && seen < NEAR; y++) for (let x = this.cx(bx.l); x <= this.cx(bx.r) && seen < NEAR; x++) {
      const cell = this.cells[y * this.cols + x]; work++;
      for (const k of cell.box) { if (this.seenB[k] === st) continue; this.seenB[k] = st; if (++seen > NEAR) break; cost += hitA(bx, this.boxes[k]) * 4; }
      for (const k of cell.line) { if (this.seenL[k] === st) continue; this.seenL[k] = st; if (++seen > NEAR) break; const ln = this.lines[k]; if (segHit(bx, ln[0], ln[1], ln[2], ln[3])) cost += 40; }
    }
    return { cost, work: work + seen };
  }
}
export function layoutWardley(s: WardleySpec, budget?: Budget): WardleyLayout {
  const { w, h, l, r, t, b, font } = WM;
  const px = (e: number) => l + e * (w - l - r), py = (v: number) => t + (1 - v) * (h - t - b);
  const grid = new AvoidGrid(w, h);
  budget?.charge(10 + s.comps.length + s.needs.length, s.comps.length + s.needs.length);
  const dots = s.comps.map((c) => ({ x: px(c.e), y: py(c.v) }));
  const at = new Map(s.comps.map((c, k) => [c.id, k]));
  for (const n of s.needs) { const a = at.get(n.a), q = at.get(n.b); if (a !== undefined && q !== undefined) grid.addLine([dots[a].x, dots[a].y, dots[q].x, dots[q].y]); }
  dots.forEach((d) => grid.addBox({ l: d.x - 7, t: d.y - 7, r: d.x + 7, b: d.y + 7 }));
  const labels: Placed[] = [];
  // the written order keeps the output stable
  s.comps.forEach((c, k) => {
    const text = c.label, wd = textW(text, font) + 4, d = dots[k];
    budget?.charge(1 + (text.length >> 4), 0, text.length);
    const cand: [number, number, "start" | "end" | "middle"][] = c.anchor
      ? [[0, -12, "middle"], [0, 20, "middle"], [-wd - 10, 4, "end"]]
      : [[11, 4, "start"], [-11, 4, "end"], [0, -12, "middle"], [0, 20, "middle"], [11, -12, "start"], [-11, -12, "end"], [11, 18, "start"], [-11, 18, "end"], [22, 4, "start"], [-22, 4, "end"], [0, -26, "middle"], [0, 34, "middle"]];
    let bestC: { box: Box; tx: number; ty: number; a: "start" | "end" | "middle"; cost: number } | null = null;
    for (const [dx, dy, a] of cand) {
      const tx = d.x + dx, ty = d.y + dy;
      const box: Box = a === "start" ? { l: tx - 1, t: ty - font + 2, r: tx + wd, b: ty + 4 } : a === "end" ? { l: tx - wd, t: ty - font + 2, r: tx + 1, b: ty + 4 } : { l: tx - wd / 2, t: ty - font + 2, r: tx + wd / 2, b: ty + 4 };
      const near = grid.cost(box);
      budget?.charge(2 + near.work, 4);
      let cost = near.cost;
      if (box.l < 2) cost += (2 - box.l) * 30;
      if (box.r > w - 2) cost += (box.r - w + 2) * 30;
      if (box.t < 2) cost += (2 - box.t) * 30;
      if (box.b > h - b + 12) cost += 20;
      if (!bestC || cost < bestC.cost) bestC = { box, tx, ty, a, cost };
      // every candidate is scored, crowded map or not: the work per label stays the same (the first free spot still wins)
    }
    grid.addBox(bestC!.box);
    labels.push({ id: c.id, x: d.x, y: d.y, box: bestC!.box, text, anchorEnd: bestC!.a, tx: bestC!.tx, ty: bestC!.ty });
  });
  // the evolved labels sit by their new place
  for (const ev of s.evolves) {
    const k = at.get(ev.id); if (k === undefined) continue;
    const text = ev.label || s.comps[k].label, x = px(ev.to), y = py(s.comps[k].v);
    budget?.charge(2 + (text.length >> 4), 0, text.length);
    const wd = textW(text, font) + 4;
    let box: Box = { l: x + 10, t: y - font + 6, r: x + 10 + wd, b: y + 8 }, ax: "start" | "end" | "middle" = "start", tx = x + 11;
    if (box.r > w - 2) { box = { l: x - 10 - wd, t: y - font + 6, r: x - 10, b: y + 8 }; ax = "end"; tx = x - 11; }
    const p = labels[k]; p.ex = { x, y }; p.evBox = box; p.evText = text; p.evAnchor = ax; p.evTx = tx;
  }
  const notes = s.notes.map((n) => {
    budget?.charge(4, 4);
    const lns = wrap(n.text, 150, WM.small, 99, budget), maxW = 150;
    return { text: n.text, x: Math.min(px(n.e), w - maxW - 6), y: py(n.v), w: maxW, lines: lns };
  });
  return { w, h, px, py, labels, notes, minW: Math.ceil((w * 11) / WM.small) };
}
