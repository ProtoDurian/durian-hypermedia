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
import { cutBy, MARGIN, type Frame, type Rect } from "./scene";

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
