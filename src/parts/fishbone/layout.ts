// The fishbone's layout (format version 11): pure, so the box is the same before and after the script runs. Two
// shapes: wide, the spine runs left to right; narrow, it runs top to bottom with the head at the bottom.
import type { Budget } from "../../core/budget";
import { wrap as kitWrap } from "../kit/text";
import type { Cause, FishSpec } from "./part";

export const FISH = { font: 13, lh: 16, wc: 150, chipH: 40 }; // chipH: room for a two-line category name
export const chipHeight = (lines: number) => Math.max(24, lines * FISH.lh + 8);
export interface FCause { x: number; y: number; w: number; lines: string[]; subs: { y: number; lines: string[]; step: number }[]; anchor: "start" | "end"; step: number; tx: number; by: number }
export interface FBone { cat: number; x0: number; y0: number; x1: number; y1: number; chip: { x: number; y: number; w: number; text: string[] }; causes: FCause[]; side: -1 | 1 }
export interface FishLayout { w: number; h: number; mode: "wide" | "narrow"; spine: [number, number, number, number]; head: { x: number; y: number; w: number; h: number; lines: string[] }; bones: FBone[]; minW: number }

function causeBlock(c: Cause, width: number, budget?: Budget) {
  const wrap = (t: string, w: number, f: number, n?: number) => kitWrap(t, w, f, n, budget);
  const f = FISH.font, lh = FISH.lh;
  const lines = wrap(c.text, width, f, 4);
  const subs = c.subs.map((s) => ({ lines: wrap(s.text, width - 14, f, 3), step: s.step }));
  const h = lines.length * lh + subs.reduce((a, s) => a + s.lines.length * lh + 3, 0) + 8;
  return { lines, subs, h };
}
export function layoutFish(s: FishSpec, mode: "wide" | "narrow", budget?: Budget): FishLayout {
  const wrap = (t: string, w: number, f: number, n?: number) => kitWrap(t, w, f, n, budget);
  const f = FISH.font, lh = FISH.lh, wc = FISH.wc;
  // every cause and sub-cause is wrapped and placed: the work counts them and the characters they wrap (0.6.2 doubling test)
  budget?.charge(10 + s.effect.length + s.categories.reduce((a, c) => a + 6 + c.name.length + c.causes.reduce((b, ca) => b + 4 + ca.text.length + ca.subs.reduce((q, sb) => q + 4 + sb.text.length, 0), 0), 0), 200);
  const n = s.categories.length;
  const bones: FBone[] = [];
  if (mode === "wide") {
    const headW = 170, headLines = wrap(s.effect, headW - 20, f, 6), headH = headLines.length * lh + 22;
    // each side holds every other category; a bone sits wc + 40 right of the one before it
    const pitch = wc + 44;
    const sideCount = [Math.ceil(n / 2), Math.floor(n / 2)];
    const blocks = s.categories.map((c) => c.causes.map((ca) => causeBlock(ca, wc - 8, budget)));
    const len = blocks.map((b) => b.reduce((a, x) => a + x.h, 0) + 8);
    const top = Math.max(0, ...len.filter((_, k) => k % 2 === 0)) + FISH.chipH + 14, bot = Math.max(0, ...len.filter((_, k) => k % 2 === 1)) + FISH.chipH + 14;
    const spineY = Math.max(top, headH / 2 + 4), slant = 30;
    const w = 30 + wc + 40 + (Math.max(sideCount[0], sideCount[1]) - 1) * pitch + 24 + 30 + headW, h = spineY + Math.max(bot, headH / 2 + 4);
    const spineEnd = w - headW - 4;
    s.categories.forEach((c, k) => {
      const side: -1 | 1 = k % 2 === 0 ? -1 : 1, col = Math.floor(k / 2);
      const x0 = 30 + wc + 40 + col * pitch + (side === 1 ? 24 : 0);   // where the bone meets the spine
      const L = len[k], x1 = x0 - slant, y1 = spineY + side * L;
      let yy = side === -1 ? spineY - 6 : spineY + 6;
      const causes: FCause[] = blocks[k].map((b, q) => {
        const yMid = side === -1 ? yy - b.h / 2 : yy + b.h / 2;
        yy += side * b.h;
        const t = Math.abs(yMid - spineY) / L, bx = x0 - slant * t;
        const subs: FCause["subs"] = []; let sy = yMid - b.h / 2 + 4 + b.lines.length * lh;
        for (const sb of b.subs) { subs.push({ y: sy, lines: sb.lines, step: sb.step }); sy += sb.lines.length * lh + 3; }
        return { x: bx, y: yMid - b.h / 2 + 4, w: wc - 8, lines: b.lines, subs, anchor: "end" as const, step: s.categories[k].causes[q].step, tx: bx - 12, by: yMid };
      });
      const chipText = wrap(c.name, 130, f, 2), chipW = Math.min(140, Math.max(...chipText.map((t) => t.length * 7.5), 44) + 18);
      bones.push({ cat: k, x0, y0: spineY, x1, y1, side, chip: { x: x1, y: y1, w: chipW, text: chipText }, causes });
    });
    return { w, h, mode, spine: [10, spineY, spineEnd, spineY], head: { x: spineEnd, y: spineY - headH / 2, w: headW, h: headH, lines: headLines }, bones, minW: Math.ceil((w * 11) / f) };
  }
  // narrow: the spine runs down the middle, the head at the bottom; bones go left and right, text on the outside
  const W = 320, mid = W / 2, tw2 = mid - 30, headLines = wrap(s.effect, W - 60, f, 6), headH = headLines.length * lh + 20;
  let y = 14;
  const rowsL: number[] = [], rowsR: number[] = [];
  s.categories.forEach((c, k) => {
    const side: -1 | 1 = k % 2 === 0 ? -1 : 1;
    const blocks = c.causes.map((ca) => causeBlock(ca, tw2 - 6, budget));
    const L = blocks.reduce((a, x) => a + x.h, 0) + 6;
    // two sides may sit side by side: left and right share a band while their bones do not touch the other's text
    const band = y;
    const chipText = wrap(c.name, tw2, f, 2);
    const chipY = band;
    let yy = band + chipHeight(chipText.length) + 8;
    const causes: FCause[] = blocks.map((b, q) => {
      const fx = side === -1 ? 8 : mid + 22;
      const out: FCause = { x: fx, y: yy + 2, w: tw2, lines: b.lines, subs: [], anchor: "start", step: c.causes[q].step, tx: side === -1 ? mid - 22 : mid + 22, by: yy + b.h / 2 };
      let sy = yy + 2 + b.lines.length * lh;
      for (const sb of b.subs) { out.subs.push({ y: sy, lines: sb.lines, step: sb.step }); sy += sb.lines.length * lh + 3; }
      yy += b.h; return out;
    });
    const end = yy + 6;
    bones.push({ cat: k, x0: mid, y0: end, x1: side === -1 ? mid - 22 : mid + 22, y1: band + chipHeight(chipText.length), side, chip: { x: side === -1 ? 8 : mid + 22, y: chipY, w: Math.min(tw2, Math.max(...chipText.map((t) => t.length * 7.5), 44) + 18), text: chipText }, causes });
    (side === -1 ? rowsL : rowsR).push(end);
    y = end + 4;
  });
  const h = y + 14 + headH;
  return { w: W, h, mode, spine: [mid, 6, mid, y + 6], head: { x: 30, y: y + 14, w: W - 60, h: headH, lines: headLines }, bones, minW: W };
}
