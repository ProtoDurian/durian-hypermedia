// This package is the source of this file: edit it here. It began as a copy synced from a private prototype (scripts/sync.ts, now frozen).
// Lines on one layer in 3D (format version 10): the same route as the 2D stage draws (tools/route.ts), laid on the
// floor plan between the two things, from the foot of one to the foot of the other. Before, a tube between two things
// on one layer arched over the things between them and could cross other tubes; now it fans out, runs straight or at
// right angles, and goes around what is in its way exactly as in 2D.
import * as THREE from "three";
import { connGeom, bezAt, type Geom } from "../core/scene";
import type { Route } from "../core/route";

export interface FloorEnd { x: number; y: number; w: number; h: number; kind: string }
export interface FloorWay { implicit: boolean; off: number; bend: number; rt: Route | null }

// a container's slab a line may cross (format version 10), in world units: its floor plan and the height of its top
export interface Slab { x0: number; x1: number; z0: number; z1: number; top: number }
// over a slab a line runs SLAB_CLEAR above its top; it climbs to that over SLAB_RAMP units before the wall, so it goes
// over the see-through wall instead of through it
export const SLAB_CLEAR = 2, SLAB_RAMP = 8;
export function overSlabs(x: number, z: number, h: number, slabs: Slab[]): number {
  for (const s of slabs) {
    const dx = Math.max(s.x0 - x, 0, x - s.x1), dz = Math.max(s.z0 - z, 0, z - s.z1), d = Math.hypot(dx, dz);
    if (d >= SLAB_RAMP) continue;
    h = Math.max(h, s.top + SLAB_CLEAR - (d / SLAB_RAMP) * (s.top + SLAB_CLEAR - h > 0 ? s.top + SLAB_CLEAR - h : 0));
  }
  return h;
}
// a curve along a 2D line (in floor-plan units), at a height that goes from h0 at its start to h1 at its end, and over
// the slabs of the containers it crosses (format version 10)
export class FloorCurve extends THREE.Curve<THREE.Vector3> {
  constructor(private g: Geom, private h0: number, private h1: number, private X0: number, private Z0: number, private slabs: Slab[] = []) { super(); }
  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const p = bezAt(this.g, t);
    const x = p.x - this.X0, z = p.y - this.Z0;
    return target.set(x, overSlabs(x, z, this.h0 + (this.h1 - this.h0) * t, this.slabs), z);
  }
}
// the 2D line between two things (their floor-plan boxes), as the 2D stage draws it, lifted into 3D
export function floorCurve(a: FloorEnd, b: FloorEnd, way: FloorWay, h0: number, h1: number, X0: number, Z0: number, slabs: Slab[] = []): FloorCurve {
  return new FloorCurve(connGeom(a, b, a.kind, b.kind, way.implicit, way.off, way.bend, way.rt), h0, h1, X0, Z0, slabs);
}
// how high a line runs at a thing: a little above its foot, so it reads as on the floor beside it
export const footY = (p: { c: THREE.Vector3; half: THREE.Vector3 }) => p.c.y - p.half.y + Math.min(6, p.half.y);
// a curve's signature, to rebuild a tube only when its line changed
export const curveSig = (c: THREE.Curve<THREE.Vector3>) => [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => c.getPoint(t).toArray().map((n) => n.toFixed(1)).join(",")).join(";");
// a routed line has corners: enough tube pieces that each corner stays round
export const tubeSegs = (c: THREE.Curve<THREE.Vector3>, min = 24) => Math.max(min, Math.min(160, Math.round(c.getLength() / 5)));
