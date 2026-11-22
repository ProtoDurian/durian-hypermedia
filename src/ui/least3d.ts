// This package is the source of this file: edit it here. It began as a copy synced from a private prototype (scripts/sync.ts, now frozen).
// The 3D story camera's least size on a phone (format version 10, fix): the 3D stage draws its words as page text of
// at least 11 pixels, so they never shrink with the scene; what shrinks is the room between them. When the story's
// whole view (everything, and the layer planes) would draw the scene smaller than the size its 2D layout made room
// for (the least scale: the frame's smallest words reach 11 pixels, tools/readable.ts), the words touch. On a phone
// the camera then frames what the step touches, at that size, and the reader turns or zooms out to see the rest, as
// the 2D stage does (it frames the step's focus and shades the edges).
//
// Pure numbers, so a test can check it without WebGL.

// a stage narrower than this is a phone (tools/scene.ts NARROW)
export const NARROW3 = 480;

export type Goal = { tx: number; ty: number; tz: number; az: number; el: number; dist: number };

// pixels on the screen per scene unit at the camera's target, for a perspective camera with a vertical field of view
// of fov degrees, on a stage h pixels tall, at a distance d
export const ppuAt = (h: number, fov: number, d: number) => h / (2 * Math.tan((fov * Math.PI) / 360) * d);
// the distance at which one scene unit at the target is ppu pixels
export const distFor = (h: number, fov: number, ppu: number) => h / (2 * Math.tan((fov * Math.PI) / 360) * ppu);

// the story's goal on a stage w x h: whole is the view of everything, tight the view of what the step touches (null
// when it touches nothing). On a phone, when the whole view draws under the least scale, the camera frames what the
// step touches, pulled back as far as the least scale allows (never further than the whole view), so as much around
// it shows as can at that size. Returns the goal, and whether it was cut to what the step touches
export function leastGoal(whole: Goal, tight: Goal | null, w: number, h: number, fov: number, least: number): { goal: Goal; cut: boolean } {
  if (!tight || !least || w >= NARROW3 || !(h > 0)) return { goal: whole, cut: false };
  if (ppuAt(h, fov, whole.dist) >= least - 1e-9) return { goal: whole, cut: false };
  const d = Math.max(tight.dist, Math.min(distFor(h, fov, least), whole.dist));
  return { goal: { ...tight, dist: d }, cut: true };
}

// layer names past the stage's top or bottom (a close view of one layer): each name stays on the stage, at the edge
// its plane is beyond, one row each in layer order (the nearest layer nearest the middle), so they never pile on each
// other or swap. ys: where each layer's name would be (top to bottom layers); lo, hi: the least and most y on the
// stage; row: one name's height. A name on the stage keeps its y
export function edgeRows(ys: number[], lo: number, hi: number, row: number): number[] {
  const out = ys.map((y) => Math.min(hi, Math.max(lo, y)));
  const above = ys.map((y, L) => ({ y, L })).filter((p) => p.y < lo).sort((a, b) => a.L - b.L);
  const below = ys.map((y, L) => ({ y, L })).filter((p) => p.y > hi).sort((a, b) => b.L - a.L);
  above.forEach((p, k) => (out[p.L] = lo + k * row));
  below.forEach((p, k) => (out[p.L] = hi - k * row));
  return out;
}

// where a layer's name goes (format version 10, fix): at the left end of the part of its plane the stage shows, so the
// name sits on its own plane in a close view too (the plane's left middle can be far off the stage, and its name then
// sat by another plane). quad: the plane's top corners on the screen, in order; the stage is x 0..w, y lo..hi. Returns
// the left-most point of what shows (the middle of it, up and down), or null when none of the plane shows
export type P2 = { x: number; y: number };
export function planeAnchor(quad: P2[], w: number, lo: number, hi: number): P2 | null {
  let poly = quad;
  const clip = (inside: (p: P2) => boolean, cut: (a: P2, b: P2) => P2) => {
    const out: P2[] = [];
    poly.forEach((b, k) => {
      const a = poly[(k + poly.length - 1) % poly.length];
      if (inside(b)) { if (!inside(a)) out.push(cut(a, b)); out.push(b); }
      else if (inside(a)) out.push(cut(a, b));
    });
    poly = out;
  };
  const atX = (x: number) => (a: P2, b: P2) => ({ x, y: a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x) });
  const atY = (y: number) => (a: P2, b: P2) => ({ x: a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y), y });
  clip((p) => p.x >= 0, atX(0));
  clip((p) => p.x <= w, atX(w));
  clip((p) => p.y >= lo, atY(lo));
  clip((p) => p.y <= hi, atY(hi));
  if (poly.length < 3) return null;
  const x = Math.min(...poly.map((p) => p.x));
  const ys = poly.filter((p) => p.x <= x + 1).map((p) => p.y);
  return { x, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

// layer names stay in layer order, top to bottom, one row apart at least, inside the stage (lo..hi): a pass down
// pushes a name below the one above it, a pass up keeps room under it for the names below. ys: each name's wanted y
export function orderRows(ys: number[], lo: number, hi: number, row: number): number[] {
  const n = ys.length, out = ys.map((y) => Math.min(hi, Math.max(lo, y)));
  for (let L = 1; L < n; L++) out[L] = Math.max(out[L], out[L - 1] + row);
  for (let L = n - 1; L >= 0; L--) out[L] = Math.min(out[L], hi - (n - 1 - L) * row, L < n - 1 ? out[L + 1] - row : Infinity);
  return out;
}

// item 8 (fix): does a line on the screen (a polyline) run through a rectangle (a word), with pad pixels of room?
export function lineHitsRect(pts: P2[], r: { x: number; y: number; w: number; h: number }, pad = 2): boolean {
  const x0 = r.x - pad, y0 = r.y - pad, x1 = r.x + r.w + pad, y1 = r.y + r.h + pad;
  const inR = (p: P2) => p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1;
  const cross = (a: P2, b: P2, c: P2, d: P2) => {
    const o = (p: P2, q: P2, s: P2) => (q.x - p.x) * (s.y - p.y) - (q.y - p.y) * (s.x - p.x);
    return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
  };
  const edges: [P2, P2][] = [[{ x: x0, y: y0 }, { x: x1, y: y0 }], [{ x: x1, y: y0 }, { x: x1, y: y1 }], [{ x: x1, y: y1 }, { x: x0, y: y1 }], [{ x: x0, y: y1 }, { x: x0, y: y0 }]];
  for (let k = 0; k < pts.length; k++) {
    if (inR(pts[k])) return true;
    if (k && edges.some(([c, d]) => cross(pts[k - 1], pts[k], c, d))) return true;
  }
  return false;
}
