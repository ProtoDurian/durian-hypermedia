// render2: a plot's point label is never crossed by the plot's line. The composed stage keeps a point's label off the
// other labels and the points, but not off the line that runs on past the point (stage 08: the line ran through
// "Halfway" and "Complete"). A label one of the plot's lines crosses moves just above or under where it was (its point
// stays in reach), to the first place no line crosses and that covers no other words; with none it stays.
import { measure, type Item } from "../../../core/stage-core";

type R = { x: number; y: number; w: number; h: number };
type Pt = [number, number];
/** does the segment a-b pass through r (grown by m)? */
function crosses(a: Pt, b: Pt, r: R, m = 2): boolean {
  const x0 = r.x - m, y0 = r.y - m, x1 = r.x + r.w + m, y1 = r.y + r.h + m;
  let t0 = 0, t1 = 1; const dx = b[0] - a[0], dy = b[1] - a[1];
  const clip = (p: number, q: number) => { if (p === 0) return q >= 0; const t = q / p; if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; } return true; };
  return clip(-dx, a[0] - x0) && clip(dx, x1 - a[0]) && clip(-dy, a[1] - y0) && clip(dy, y1 - a[1]) && t1 - t0 > 1e-6;
}
const meets = (a: R, b: R) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const rectOf = (t: Extract<Item, { k: "text" }>): R => { const w = measure(t.s, t.f); const x = t.anchor === "middle" ? t.x - w / 2 : t.anchor === "end" ? t.x - w : t.x; return { x, y: t.y - 13, w, h: 17 }; };

/** the block's items with every point label a plot line crosses moved off it (a new array; moved texts are copies) */
export function pointLabelsOffLines(items: Item[]): Item[] {
  // the plot's lines: the stage draws each stretch between two points as a two-point round path in the role's line ink
  const lines = items.filter((it): it is Extract<Item, { k: "path" }> => it.k === "path" && it.curve === "round" && it.pts.length === 2 && !it.id && /^role:.*:line$/.test(String(it.ink)));
  if (!lines.length) return items;
  const out = items.slice();
  // a point label: halo words in a role's ink (stage-time.ts writes no other halo text in a plot)
  const labels = out.flatMap((it, i) => (it.k === "text" && it.halo && /^role:.*:ink$/.test(String(it.ink)) ? [i] : []));
  const hit = (r: R) => lines.some((l) => crosses(l.pts[0], l.pts[1], r));
  const words = (skip: number) => out.flatMap((it, j) => (j !== skip && it.k === "text" ? [rectOf(it)] : []));
  for (const i of labels) {
    const t = out[i] as Extract<Item, { k: "text" }>, r = rectOf(t);
    if (!hit(r)) continue;
    const others = words(i);
    for (const dy of [-14, 14, -22, 22, -30, 30]) {
      const m = { ...r, y: r.y + dy };
      if (!hit(m) && !others.some((o) => meets(m, o))) { out[i] = { ...t, y: t.y + dy }; break; }
    }
  }
  return out;
}
