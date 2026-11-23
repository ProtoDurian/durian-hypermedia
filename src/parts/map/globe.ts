// The globe's own geometry (the format places2, the format): an orthographic view of the sphere facing (lat, lng). The sphere is drawn by
// three.js (site/src/map-globe.tsx); the pins, arcs and the region under a pointer are worked out here from the same camera, so the
// DOM on top and the sphere below always agree. Pure: no DOM.
export type GCam = { lat: number; lng: number; k: number };
export type Proj = { x: number; y: number; z: number; vis: boolean };
export const GLOBE_K = { min: 0.7, max: 4 };
const rad = (d: number) => (d * Math.PI) / 180, deg = (r: number) => (r * 180) / Math.PI;
export const clampLat = (v: number) => Math.max(-85, Math.min(85, v));
export const wrapLng = (v: number) => ((((v + 180) % 360) + 360) % 360) - 180;
/** the radius in pixels of the globe in a w by h stage at zoom k */
export const globeR = (w: number, h: number, k: number) => (Math.min(w, h) / 2) * 0.9 * k;

/** the screen position of a point (lat, lng) at a height above the surface (in globe radii), for a camera facing (lat0, lng0) */
export function project(lat: number, lng: number, h: number, cam: GCam, w: number, hh: number, R: number): Proj {
  const φ = rad(lat), λ = rad(lng), φ0 = rad(cam.lat), λ0 = rad(cam.lng), r = 1 + h;
  const x = Math.cos(φ) * Math.sin(λ), y = Math.sin(φ), z = Math.cos(φ) * Math.cos(λ);
  const x1 = x * Math.cos(λ0) - z * Math.sin(λ0), z1 = x * Math.sin(λ0) + z * Math.cos(λ0);
  const y2 = y * Math.cos(φ0) - z1 * Math.sin(φ0), z2 = y * Math.sin(φ0) + z1 * Math.cos(φ0);
  const X = x1 * r, Y = y2 * r, Z = z2 * r;
  // seen from the front: the near side; a point above the surface beyond the edge is seen too, unless the globe covers it
  const vis = h <= 0 ? z2 > 0.03 : Z >= 0 || X * X + Y * Y >= 1;
  return { x: w / 2 + R * X, y: hh / 2 - R * Y, z: Z, vis };
}
/** the (lat, lng) under a screen point of the near side, or null off the globe */
export function unproject(px: number, py: number, cam: GCam, w: number, hh: number, R: number): { lat: number; lng: number } | null {
  const X = (px - w / 2) / R, Y = -(py - hh / 2) / R, d = 1 - X * X - Y * Y;
  if (d < 0) return null;
  const Z = Math.sqrt(d), φ0 = rad(cam.lat), λ0 = rad(cam.lng);
  const y = Y * Math.cos(φ0) + Z * Math.sin(φ0), z1 = -Y * Math.sin(φ0) + Z * Math.cos(φ0);
  const x = X * Math.cos(λ0) + z1 * Math.sin(λ0), z = -X * Math.sin(λ0) + z1 * Math.cos(λ0);
  return { lat: deg(Math.asin(Math.max(-1, Math.min(1, y)))), lng: deg(Math.atan2(x, z)) };
}
/** points along the great circle between two places, lifted off the surface in the middle (an arc over the globe) */
export function liftedArc(a: { lat: number; lng: number }, b: { lat: number; lng: number }, n = 28): { lat: number; lng: number; h: number }[] {
  const v = (p: { lat: number; lng: number }) => [Math.cos(rad(p.lat)) * Math.sin(rad(p.lng)), Math.sin(rad(p.lat)), Math.cos(rad(p.lat)) * Math.cos(rad(p.lng))];
  const A = v(a), B = v(b), dot = Math.max(-1, Math.min(1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2])), ang = Math.acos(dot), s = Math.sin(ang) || 1e-9;
  const out: { lat: number; lng: number; h: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n, ka = Math.sin((1 - f) * ang) / s, kb = Math.sin(f * ang) / s;
    const p = [ka * A[0] + kb * B[0], ka * A[1] + kb * B[1], ka * A[2] + kb * B[2]];
    out.push({ lat: deg(Math.asin(Math.max(-1, Math.min(1, p[1])))), lng: deg(Math.atan2(p[0], p[2])), h: (0.04 + 0.26 * (ang / Math.PI)) * Math.sin(Math.PI * f) });
  }
  return out;
}
