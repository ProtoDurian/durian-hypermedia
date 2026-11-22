// This package is the source of this file: edit it here. It began as a copy synced from a private prototype (scripts/sync.ts, now frozen).
// Where things stand in the 3D stage (format version 7), as plain numbers, so a test can check them without WebGL.
// y is up. Layer L's plane is a thin slab whose top surface is at planeTop(L); a thing on layer L stands on it, a thing
// inside a container on the same layer stands on the container's slab, and the camera never goes below the top plane.
export const SLAB = 4;          // a container's slab height
export const PLANE_H = 2;       // a layer plane's thickness
export const PLANE_GAP = 0.5;   // the plane's top surface sits this far below the layer's floor line
// heights of things standing on a layer, in world units (one unit is about one CSS pixel of the 2D stage)
export const HEIGHT: Record<string, number> = { box: 16, pill: 14, diamond: 14, row: 10, circle: 16, cylinder: 30, cloud: 22, person: 0, dot: 8, text: 0, token: 9, pointer: 0 };

export type Rest = { key: number; kind: string; container: boolean; bare: boolean; parent: number | null; L: number };
type Foot = { w: number; h: number };

// the distance between two layers; split layers pull them further apart. Format version 10: on a narrow stage (a
// phone) the whole scene is drawn at about half size, so a line between two stacked layers was some 15 px long; there
// the gap grows with the scene's span (NARROW_GAP of it, up to 110), so it reads as a line, not a tick
export const NARROW_GAP = 0.1;
export const gapOf = (foot: Foot, spread: number, narrow = false) => { const span = Math.max(foot.w, foot.h); return (narrow ? Math.max(46, Math.min(110, span * NARROW_GAP + 20)) : 46) + spread * Math.max(90, Math.min(220, span * 0.32)); };
export const floorY = (L: number, gap: number) => -L * gap;
export const planeTop = (L: number, gap: number) => floorY(L, gap) - PLANE_GAP;
export const planeY = (L: number, gap: number) => planeTop(L, gap) - PLANE_H; // the plane's bottom (its mesh's origin)
export const heightOf = (it: Rest) => (it.container ? (it.bare ? 0 : SLAB) : HEIGHT[it.kind] ?? 16);
// a thing's base: its layer's floor, plus one slab (and a hair) for each container under it on the same layer
export function baseY(it: Rest, byKey: Map<number, Rest>, gap: number): number {
  let n = 0, p = it.parent != null ? byKey.get(it.parent) : undefined, guard = 0;
  while (p && Math.abs(p.L - it.L) < 0.5 && guard++ < 64) { if (!p.bare) n++; p = p.parent != null ? byKey.get(p.parent) : undefined; }
  return floorY(it.L, gap) + n * (SLAB + 1);
}
// the check: every thing's bottom is at or above its layer plane's top surface, and a thing in a container on the same
// layer is at or above the container's slab top. Returns what breaks it (empty: all rest on their planes)
export function restCheck(items: Rest[], gap: number): { key: number; why: string }[] {
  const byKey = new Map(items.map((i) => [i.key, i]));
  const bad: { key: number; why: string }[] = [];
  for (const it of items) {
    if (it.kind === "layer") continue;
    const b = baseY(it, byKey, gap);
    const L = Math.round(it.L);
    if (b < planeTop(L, gap) - 1e-6) bad.push({ key: it.key, why: `bottom ${b.toFixed(1)} under the top of layer ${L}'s plane (${planeTop(L, gap).toFixed(1)})` });
    const p = it.parent != null ? byKey.get(it.parent) : undefined;
    if (p && p.container && Math.abs(p.L - it.L) < 0.5 && !p.bare) { const top = baseY(p, byKey, gap) + heightOf(p); if (b < top - 1e-6) bad.push({ key: it.key, why: `bottom ${b.toFixed(1)} inside its container's slab (top ${top.toFixed(1)})` }); }
  }
  return bad;
}
// the lowest camera elevation (radians) that keeps the camera above the highest plane and thing (topY), with a margin;
// at least 0.12 rad (about 7 degrees), so a reader never looks at a plane from underneath
export function minElevation(targetY: number, dist: number, topY: number, margin = 30): number {
  const k = (topY + margin - targetY) / Math.max(1, dist);
  return Math.max(0.12, Math.asin(Math.max(-1, Math.min(0.99, k))));
}
export const MAX_ELEVATION = 1.5;
