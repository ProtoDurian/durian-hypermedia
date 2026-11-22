// This package is the source of this file: edit it here. It began as a copy synced from a private prototype (scripts/sync.ts, now frozen).
// The 3D story view stays within its scene (format version 10, rfit). On a phone, when the whole scene would draw under
// the least scale (site/src/least3d.ts), the story camera frames what the step touches at that size. Centred on it, the
// view could leave a band of empty stage on one side while it cut the scene on the other (the seven-layer stack's first
// step: the browser on the top layer in the middle, the top 40 % of the stage empty, the four lower layers cut). Here
// the view slides, never grows or shrinks, until the scene meets the stage's edge on the side that had room, as the 2D
// stage clamps its view to the scene. What the step touches stays in frame.
//
// Pure numbers, so a test can check it without WebGL.
import { ppuAt, type Goal } from "./least3d";

export type V3 = { x: number; y: number; z: number };
export type Box2 = { x0: number; x1: number; y0: number; y1: number };

// the camera's axes for a goal: back (from the target to the camera), right and up, as three.js lookAt makes them
export function axes(g: Goal) {
  const back = { x: Math.cos(g.el) * Math.sin(g.az), y: Math.sin(g.el), z: Math.cos(g.el) * Math.cos(g.az) };
  const right = { x: Math.cos(g.az), y: 0, z: -Math.sin(g.az) };
  const up = { x: back.y * right.z - back.z * right.y, y: back.z * right.x - back.x * right.z, z: back.x * right.y - back.y * right.x };
  return { back, right, up };
}

// where a point draws on a stage w x h (pixels from the top left), for a perspective camera with a vertical field of
// view of fov degrees at goal g; null when it is behind the camera
export function project(g: Goal, fov: number, w: number, h: number, p: V3): { x: number; y: number } | null {
  const { back, right, up } = axes(g);
  const ex = g.tx + g.dist * back.x, ey = g.ty + g.dist * back.y, ez = g.tz + g.dist * back.z;
  const d = { x: p.x - ex, y: p.y - ey, z: p.z - ez };
  const depth = -(d.x * back.x + d.y * back.y + d.z * back.z);
  if (depth <= 1e-6) return null;
  const f = h / (2 * Math.tan((fov * Math.PI) / 360));
  return { x: w / 2 + ((d.x * right.x + d.y * right.y + d.z * right.z) / depth) * f, y: h / 2 - ((d.x * up.x + d.y * up.y + d.z * up.z) / depth) * f };
}

// the screen box of some boxes' corners (c: centre, half: half size), or null when none is in front of the camera
export function screenBox(g: Goal, fov: number, w: number, h: number, boxes: { c: V3; half: V3 }[]): Box2 | null {
  let b: Box2 | null = null;
  for (const q of boxes) for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const p = project(g, fov, w, h, { x: q.c.x + sx * q.half.x, y: q.c.y + sy * q.half.y, z: q.c.z + sz * q.half.z });
    if (!p) continue;
    b = b ? { x0: Math.min(b.x0, p.x), x1: Math.max(b.x1, p.x), y0: Math.min(b.y0, p.y), y1: Math.max(b.y1, p.y) } : { x0: p.x, x1: p.x, y0: p.y, y1: p.y };
  }
  return b;
}

// how far to move what is drawn along one axis (pixels; + is right or down) on a stage [0, size] with margin m:
// s0..s1 the scene, k0..k1 what must stay in frame (null: nothing). A scene that fits comes wholly inside; a bigger one
// meets the edge on the side that had room (no empty band while the other side is cut). The slide never takes k past
// the margin (nor further out, when it already is)
export function slide1(s0: number, s1: number, k: [number, number] | null, size: number, m: number): number {
  const lo = m, hi = size - m;
  let d = 0;
  if (s1 - s0 <= hi - lo) { if (s0 < lo) d = lo - s0; else if (s1 > hi) d = hi - s1; }
  else if (s0 > lo) d = lo - s0;
  else if (s1 < hi) d = hi - s1;
  if (k) { if (d < 0) d = Math.max(d, Math.min(0, lo - k[0])); else if (d > 0) d = Math.min(d, Math.max(0, hi - k[1])); }
  return d;
}

// the goal slid so its view keeps within the scene (scene: everything shown and the layer planes; keep: what the step
// touches, with room for its words). m: the margin, a share of the stage's smaller side. A few rounds, since near
// things move more than far ones under perspective
export function keepInScene(g: Goal, fov: number, w: number, h: number, scene: { c: V3; half: V3 }[], keep: { c: V3; half: V3 }[], m = 0.04): Goal {
  if (!(w > 0) || !(h > 0) || !scene.length) return g;
  let out = { ...g };
  const mm = m * Math.min(w, h);
  for (let n = 0; n < 3; n++) {
    const s = screenBox(out, fov, w, h, scene);
    if (!s) return out;
    const k = keep.length ? screenBox(out, fov, w, h, keep) : null;
    const dx = slide1(s.x0, s.x1, k ? [k.x0, k.x1] : null, w, mm), dy = slide1(s.y0, s.y1, k ? [k.y0, k.y1] : null, h, mm);
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) break;
    const ppu = ppuAt(h, fov, out.dist), { right, up } = axes(out);
    // the content moves right when the target moves left, and down when the target moves up
    out = { ...out, tx: out.tx - (right.x * dx) / ppu + (up.x * dy) / ppu, ty: out.ty - (right.y * dx) / ppu + (up.y * dy) / ppu, tz: out.tz - (right.z * dx) / ppu + (up.z * dy) / ppu };
  }
  return out;
}
