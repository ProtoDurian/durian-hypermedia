// This package is the source of this file: edit it here. It began as a copy synced from a private prototype (scripts/sync.ts, now frozen).
// A meter (level=) in 3D (format version 10). In 2D it is a thin bar along the bottom of the thing, filled to the
// level. In 3D the same bar lies on the thing's top face along its front edge (the edge nearest the camera), a track
// the width of the thing less its padding, and a fill to the level, raised a hair above the face so it never flickers
// into it. Colours are the page's --meter and --meter-track tokens.
import * as THREE from "three";

const BAR = new THREE.BoxGeometry(1, 1, 1);
BAR.translate(0.5, 0.5, 0); // left end at x = 0, base at y = 0
export const METER_D = 4; // the bar's depth on the face, as the 2D bar's height
export type Meter = { g: THREE.Group; track: THREE.Mesh; fill: THREE.Mesh; mats: THREE.MeshBasicMaterial[] };

export function mkMeter(): Meter {
  const mats = [new THREE.MeshBasicMaterial({ transparent: true }), new THREE.MeshBasicMaterial({ transparent: true })];
  const track = new THREE.Mesh(BAR, mats[0]), fill = new THREE.Mesh(BAR, mats[1]);
  const g = new THREE.Group();
  g.add(track, fill);
  return { g, track, fill, mats };
}
// w, d: the thing's width and depth on the floor; top: the height of its top face; inX: the padding at each end
// (the 2D bar's); lv: the level, 0 to 100; op: the thing's opacity; order: its render order
export function placeMeter(m: Meter, o: { w: number; d: number; top: number; inX: number; lv: number; op: number; order: number; track: THREE.Color; fill: THREE.Color }) {
  const len = Math.max(4, o.w - 2 * o.inX);
  const z = o.d / 2 - Math.min(o.inX, o.d / 4) - METER_D / 2;
  m.g.position.set(-o.w / 2 + o.inX, o.top + 0.8, z);
  m.track.scale.set(len, 1, METER_D);
  m.fill.scale.set(Math.max(0.001, (len * Math.max(0, Math.min(100, o.lv))) / 100), 1.4, METER_D);
  m.mats[0].color.copy(o.track); m.mats[1].color.copy(o.fill);
  for (const x of m.mats) { x.opacity = o.op; const t = o.op < 0.999; if (x.transparent !== t) { x.transparent = t; x.needsUpdate = true; } }
  m.track.renderOrder = o.order + 3; m.fill.renderOrder = o.order + 4;
  m.fill.visible = o.lv > 0;
}
export function dropMeter(m: Meter) { m.mats.forEach((x) => x.dispose()); m.g.removeFromParent(); }
