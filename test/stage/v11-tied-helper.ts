// This package is the source of this file: edit it here. It began as a copy of the private prototype's composed stage (0.7.0).
// the reader can match every drawn number to its own cell: it stands on end inside the cell, or level inside it,
// or level over several cells with a leader at the cell's centre. Returns "" when tied, else why not. Measure with the phone font set.
import { fontSize, measure, type Item } from "../../src/core/stage-core";
type Text = Extract<Item, { k: "text" }>;
type Box = Extract<Item, { k: "box" }>;
export function tiedToCell(items: Item[], t: Text, cells: Box[]): string {
  const own = cells.filter((c) => String(c.bar?.label) === t.s).sort((a, b) => Math.abs(a.x + a.w / 2 - t.x) - Math.abs(b.x + b.w / 2 - t.x))[0];
  if (!own) return `"${t.s}": no cell with that number`;
  const lo = own.x - 1, hi = own.x + own.w + 1;
  if (t.rotate) return t.x - fontSize(t.f) * 0.72 >= lo && t.x <= hi ? "" : `"${t.s}" stands on end outside its own cell`;
  const half = measure(t.s, t.f) / 2;
  if (t.x - half >= lo && t.x + half <= hi) return "";
  const cx = own.x + own.w / 2;
  return items.some((i) => i.k === "path" && i.cls === "stg-time-leader" && Math.abs(i.pts[0][0] - cx) < 0.6 && (!i.from || !t.from || i.from === t.from)) ? "" : `"${t.s}" lies level over several cells with no leader to its own`;
}
