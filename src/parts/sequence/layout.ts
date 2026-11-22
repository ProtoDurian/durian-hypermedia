// The sequence's layout (format version 11): fixed numbers, pure, no browser needed, so the box is the same before and
// after the script runs. Columns come from the participants, rows from the items; the cost is charged to the budget it is given.
import type { Budget } from "../../core/budget";
import { wrap as kitWrap } from "../kit/text";
import type { SeqItem, SeqSpec } from "./part";

export const SEQ = { pitch: 132, font: 12, lh: 15, head: 46, pad: 14, actW: 8 };
export interface SeqRow { item: SeqItem; y: number; h: number; lines: string[]; x1: number; x2: number; depth: number; self: boolean; replyAt?: number }
export interface SeqLayout { w: number; h: number; headH: number; cols: number[]; heads: { x: number; w: number; lines: string[] }[]; rows: SeqRow[]; acts: { col: number; y1: number; y2: number; step: number }[]; minW: number }

export function layoutSequence(s: SeqSpec, budget?: Budget): SeqLayout {
  const wrap = (t: string, w: number, f: number, n?: number) => kitWrap(t, w, f, n, budget);
  const n = Math.max(1, s.participants.length), P = SEQ.pitch, f = SEQ.font, lh = SEQ.lh;
  const w = n * P;
  budget?.charge(4 + s.participants.length, s.participants.length);
  const cols = s.participants.map((_, k) => k * P + P / 2);
  const heads = s.participants.map((p, k) => ({ x: cols[k], w: P - 16, lines: wrap(p.label, P - 32, f, 2) }));
  const rows: SeqRow[] = [];
  let y = 8, depth = 0;
  for (const it of s.items) {
    budget?.charge(3 + s.participants.length, 8);
    if (it.t === "msg") {
      const a = cols[it.from], b = cols[it.to], self = it.from === it.to;
      const room = self ? P - 44 : Math.max(86, Math.abs(a - b) - 22);
      const lines = wrap(it.text, room, f, 4);
      const h = self ? Math.max(30, lines.length * lh + 14) : lines.length * lh + 22;
      rows.push({ item: it, y, h, lines, x1: Math.min(a, b), x2: Math.max(a, b), depth, self });
      y += h;
    } else if (it.t === "open") {
      const lines = wrap(`${it.block}${it.text ? ` ${it.text}` : ""}`, Math.max(60, w - 60 - depth * 12), f, 2);
      const h = lines.length * lh + 8;
      rows.push({ item: it, y, h, lines, x1: 0, x2: w, depth, self: false }); y += h; depth++;
    } else if (it.t === "else") {
      const lines = wrap(`${it.word}${it.text ? ` ${it.text}` : ""}`, Math.max(60, w - 60 - depth * 12), f, 2);
      const h = lines.length * lh + 10;
      rows.push({ item: it, y, h, lines, x1: 0, x2: w, depth: depth - 1, self: false }); y += h;
    } else if (it.t === "end") {
      depth = Math.max(0, depth - 1);
      rows.push({ item: it, y, h: 10, lines: [], x1: 0, x2: w, depth, self: false }); y += 10;
    } else {
      const a = it.a, b = it.b >= 0 ? it.b : it.a;
      const x1 = Math.min(cols[a], cols[b]) - (P - 20) / 2, x2 = Math.max(cols[a], cols[b]) + (P - 20) / 2;
      const lines = wrap(it.text, x2 - x1 - 16, f, 5);
      const h = lines.length * lh + 18;
      rows.push({ item: it, y: y + 3, h, lines, x1, x2, depth, self: false }); y += h + 6;
    }
  }
  const total = y + 14;
  // an activation bar: from a call to its reply (the first later reply back to the caller). Read from the end, with the
  // nearest later reply of each (from, to) pair kept, so every row is looked at once
  const acts: SeqLayout["acts"] = [];
  const nearest = new Map<number, number>();
  const found: ({ col: number; y1: number; y2: number; step: number } | null)[] = new Array(rows.length).fill(null);
  budget?.charge(2 * rows.length + 1, rows.length);
  for (let k = rows.length - 1; k >= 0; k--) {
    const m = rows[k].item;
    if (m.t !== "msg") continue;
    if (m.arrow === "call" && m.from !== m.to) {
      const j = nearest.get(m.to * 65536 + m.from);
      if (j !== undefined) { const q = rows[j].item as Extract<SeqItem, { t: "msg" }>; found[k] = { col: m.to, y1: rows[k].y + rows[k].h - 8, y2: rows[j].y + rows[j].h - 8, step: Math.max(m.step, q.step) }; rows[k].replyAt = j; }
    }
    if (m.arrow === "reply") nearest.set(m.from * 65536 + m.to, k);
  }
  for (const a of found) if (a) acts.push(a);
  const headH = SEQ.head + 8;
  return { w, h: total, headH, cols, heads, rows, acts, minW: Math.ceil((w * 11) / f) };
}
