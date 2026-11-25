// This package is the source of this file: edit it here. It began as a copy synced from a private prototype (scripts/sync.ts, now frozen).
// Whole things at the edge, on every screen (format version 10): after the story camera has its size, it slides
// (it never grows or shrinks here) to the place along each axis that cuts the fewest things in half at the stage's
// edge: a thing with its words, a container's heading, a container that would fit. It keeps what the step touches (or
// its focus) in frame and stays within the scene: never past the scene's margin on a side, or centred on a scene
// smaller than the view. So a scene that fits the stage is never cut by a few pixels of margin, and a phone's first
// step shows a big container from its heading, not from its middle.
//
// The candidates on an axis: where the view is, centred on the scene, and for each thing the view cuts, just enough
// to take it in or just enough to leave it out. The one that cuts the fewest wins; a tie keeps the nearest.
import { cutBy, MARGIN, wordRects, type Frame, type Rect } from "./scene";

const inside = (r: Rect, v: Rect) => r.x >= v.x - 0.5 && r.y >= v.y - 0.5 && r.x + r.w <= v.x + v.w + 0.5 && r.y + r.h <= v.y + v.h + 0.5;

// the range of places along one axis that stay within the scene (its bounds b0..b0+bs, with a margin), for a view s long
function range(s: number, b0: number, bs: number): [number, number] {
  if (s >= bs + 2 * MARGIN) { const c = b0 + (bs - s) / 2; return [c, c]; }
  return [b0 - MARGIN, b0 + bs + MARGIN - s];
}

export function slideWhole(f: Frame, v: Rect, keep: Rect | null): Rect {
  let best = v, cuts = cutBy(f, v);
  if (!cuts.length) return v;
  const B = f.bounds;
  for (const ax of ["x", "y"] as const) {
    if (!cuts.length) break;
    const s = ax === "x" ? best.w : best.h, b0 = B[ax], bs = ax === "x" ? B.w : B.h;
    const [lo, hi] = range(s, b0, bs);
    const at = best[ax];
    const cand = new Set<number>([at, b0 + (bs - s) / 2]);
    for (const r of cuts) {
      const r0 = r[ax], rs = ax === "x" ? r.w : r.h;
      cand.add(r0 - 6); cand.add(r0 + rs + 6 - s); // take it in, at the low or the high edge
      cand.add(r0 + rs + 2); cand.add(r0 - 2 - s); // leave it out, past the low or the high edge
    }
    let pick = best, pickN = cuts.length;
    for (const c0 of cand) {
      const c = Math.min(Math.max(c0, lo), hi);
      const w: Rect = { ...best, [ax]: c };
      if (keep && !inside(keep, w)) continue;
      const n = cutBy(f, w).length;
      if (n < pickN || (n === pickN && Math.abs(c - at) < Math.abs(pick[ax] - at))) { pick = w; pickN = n; }
    }
    best = pick; cuts = cutBy(f, best);
  }
  return best;
}

// the stage edges to shade, with a small arrow (site/src/anim.tsx): each side with more of the scene beyond it, and
// each side where the view cuts a thing in half (a cut of a few pixels is still a cut, so it is shaded too)
export function moreSides(f: Frame, cam: Rect): ("l" | "r" | "t" | "b")[] {
  const b = f.bounds, m = 6;
  const l = b.x < cam.x - m, r = b.x + b.w > cam.x + cam.w + m, t = b.y < cam.y - m, bt = b.y + b.h > cam.y + cam.h + m;
  const cut = cutBy(f, cam);
  const out: ("l" | "r" | "t" | "b")[] = [];
  if (l || cut.some((c) => c.x < cam.x - 0.5)) out.push("l");
  if (r || cut.some((c) => c.x + c.w > cam.x + cam.w + 0.5)) out.push("r");
  if (t || cut.some((c) => c.y < cam.y - 0.5)) out.push("t");
  if (bt || cut.some((c) => c.y + c.h > cam.y + cam.h + 0.5)) out.push("b");
  return out;
}

// The line on the stage that says there is more beyond an edge ("↓ more beyond the edge", parts.css .scn-more-say)
// never sits on a word: it takes the middle of its edge, else that edge's left end, else its right end (past the
// shaded strips); where every spot would cover a word, only the shaded edge and its arrow say so. Its size is the
// one parts.css draws (11.5 px words, 9 px padding, 22 px high, 6 px off the edge).
export const CUE = { h: 22, gap: 6, side: 30, clear: 3 } as const;
export const cueWidth = (text: string): number => Math.ceil(text.length * 7) + 20;
export type CueAt = "c" | "l" | "r";
export function cueAt(f: Frame, cam: Rect, w: number, h: number, side: "t" | "b", text: string, also: Rect[] = []): CueAt | null {
  if (!(w > 0 && h > 0 && cam.w > 0 && cam.h > 0)) return "c";
  // the drawing's words on the stage, in pixels (the stage shows the view whole: xMidYMid meet)
  const s = Math.min(w / cam.w, h / cam.h), ox = (w - cam.w * s) / 2, oy = (h - cam.h * s) / 2, m = CUE.clear;
  // (and a thing whose name is drawn inside it, a list's cell: the whole thing; a bucket's number in its first 30 px;
  // a cell's index under it)
  const inner = f.boxes.filter((b) => (!b.container || b.kind === "bucket") && !b.lbl && `${b.label ?? ""}`.trim()).map((b) => ({ r: { x: b.x, y: b.y, w: b.kind === "bucket" ? 30 : b.w, h: b.h } }));
  const idx = f.boxes.filter((b) => b.index != null).map((b) => ({ r: { x: b.x + b.w / 2 - 10, y: b.y + b.h + 4, w: 20, h: 14 } }));
  // (and a heading riding with the view, where it rides: also)
  const words = [...wordRects(f), ...inner, ...idx, ...also.map((r) => ({ r }))].map(({ r }) => ({ x: ox + (r.x - cam.x) * s - m, y: oy + (r.y - cam.y) * s - m, w: r.w * s + 2 * m, h: r.h * s + 2 * m }));
  const pw = Math.min(cueWidth(text), w - 64), y = side === "t" ? CUE.gap : h - CUE.gap - CUE.h;
  const spots: [CueAt, number][] = [["c", (w - pw) / 2], ["l", CUE.side], ["r", w - CUE.side - pw]];
  for (const [at, x] of spots) if (!words.some((r) => r.x < x + pw && x < r.x + r.w && r.y < y + CUE.h && y < r.y + r.h)) return at;
  return null;
}

// A container's heading rides with the view (rc.4): where the story camera shows part of a container but cuts its
// heading at the stage's edge (a close view inside a big container, a held view lower down), the heading is drawn just
// inside the view's edge instead, still inside its container: at the near corner of that edge, else the far one, else
// a line lower; never over a word, a thing or another riding heading, and only where the visible part of the container
// has room for it. Outer containers ride first. Returns, per container key, how far its heading moves (world units).
export const RIDE = { gap: 8, clear: 2 } as const;
export interface RideItem { key: number; depth: number; r: Rect; head: Rect }
export function rideHeads(items: RideItem[], avoid: { key: number | null; r: Rect }[], cam: Rect, s: number): Map<number, { dx: number; dy: number }> {
  const out = new Map<number, { dx: number; dy: number }>();
  if (!(s > 0 && cam.w > 0 && cam.h > 0)) return out;
  const m = RIDE.gap / s, c = RIDE.clear / s, placed: Rect[] = [];
  const meets = (a: Rect, b: Rect) => a.x < b.x + b.w + c && b.x < a.x + a.w + c && a.y < b.y + b.h + c && b.y < a.y + a.h + c;
  for (const it of [...items].sort((p, q) => p.depth - q.depth)) {
    const H = it.head;
    if (inside(H, cam)) continue;
    // the part of the container on the stage, less the gap at the view's edge
    const x0 = Math.max(it.r.x, cam.x + m), y0 = Math.max(it.r.y, cam.y + m), x1 = Math.min(it.r.x + it.r.w, cam.x + cam.w - m), y1 = Math.min(it.r.y + it.r.h, cam.y + cam.h - m);
    if (x1 - x0 < H.w + c || y1 - y0 < H.h + c) continue;
    const near = Math.min(Math.max(H.x, x0), x1 - H.w), far = x1 - H.w, top = Math.min(Math.max(H.y, y0), y1 - H.h);
    const spots: [number, number][] = [];
    for (let row = 0; row < 3; row++) { const y = top + row * (H.h + c); if (y + H.h <= y1) spots.push([near, y], [far, y]); }
    for (const [x, y] of spots) {
      const R = { x, y, w: H.w, h: H.h };
      if (placed.some((p) => meets(p, R)) || avoid.some((a) => a.key !== it.key && meets(a.r, R))) continue;
      out.set(it.key, { dx: x - H.x, dy: y - H.y });
      placed.push(R);
      break;
    }
  }
  return out;
}
