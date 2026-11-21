// This package is the source of this file: edit it here. It began as a copy synced from a private prototype (scripts/sync.ts, now frozen).
// The 3D camera's rules (format version 9), as plain numbers so tests can check them without WebGL.
// y is up. The camera orbits a target (tx, ty, tz) at a turn (az), a tilt (el) and a distance (dist).
//
// 1. It stays above every plane and thing that is shown: a low tilt is raised, and when even looking straight down is
//    not high enough (the target is deep in a stack and the camera close), it backs off. Before format version 9 the
//    tilt alone was raised, up to a limit, so a close look at a lower layer left the camera between the planes, and the
//    target was seen through the slabs and planes above it: "things under the plane".
// 2. When it looks into a lower layer (the reader clicked a thing there, or the story frames things there), the layers
//    between it and that layer fade, like focus: nothing solid stands between the camera and what it looks at.
// 3. It never sits inside a block.
// 4. The author's words (tools/camera.ts): turn= and tilt= name the angle, close flies in, far pulls back.
import { MAX_ELEVATION, minElevation } from "./geo3d";
import { TURN_RAD, TILT_RAD, type CamView } from "../core/camera";

export type Cam = { tx: number; ty: number; tz: number; az: number; el: number; dist: number };
export type V3 = { x: number; y: number; z: number };
// a layer plane: its top surface's height and its floor plan
export type PlaneRect = { top: number; x0: number; x1: number; z0: number; z1: number };
// a block, as its corners
export type Block = { min: V3; max: V3 };

export const MARGIN = 30;      // how far above the highest shown plane or thing the camera stays
export const FAR = 1.6;        // far: the distance grows by this much
export const CLOSE_FILL = 0.96; // close: how much of the stage the things fill (the plain camera leaves room: 0.84)
export const camPos = (c: Cam): V3 => ({ x: c.tx + c.dist * Math.cos(c.el) * Math.sin(c.az), y: c.ty + c.dist * Math.sin(c.el), z: c.tz + c.dist * Math.cos(c.el) * Math.cos(c.az) });

// rule 1: tilt up first (down to the least tilt that clears floor), then back off along the same line
export function clampCam(c: Cam, floor: number, margin = MARGIN): Cam {
  c.el = Math.min(MAX_ELEVATION, Math.max(minElevation(c.ty, c.dist, floor, margin), c.el));
  const need = floor + margin - c.ty;
  if (c.ty + c.dist * Math.sin(c.el) < floor + margin - 1e-6) c.dist = need / Math.sin(c.el);
  return c;
}
// rule 3: back off until the camera is outside every block (with a little room)
export function outOfBlocks(c: Cam, blocks: Block[], room = 6): Cam {
  const inside = (p: V3, b: Block) => p.x > b.min.x - room && p.x < b.max.x + room && p.y > b.min.y - room && p.y < b.max.y + room && p.z > b.min.z - room && p.z < b.max.z + room;
  for (let k = 0; k < 24 && blocks.some((b) => inside(camPos(c), b)); k++) c.dist *= 1.15;
  return c;
}
// rule 2: how many layers from the top fade (layers 0 .. k-1) so that none stands between the camera and a target on
// layer tL: a layer above tL fades when the camera is below (or just above) its plane, or when the line from the
// camera to the target crosses its plane inside the plane's floor plan. 0: none fade
export function peelFor(c: Cam, target: V3, tL: number | null, planes: PlaneRect[], near = 20): number {
  if (tL == null || tL <= 0) return 0;
  const p = camPos(c);
  for (let L = Math.min(tL, planes.length) - 1; L >= 0; L--) {
    const pl = planes[L];
    if (p.y < pl.top + near) return L + 1;
    if (crosses(p, target, pl)) return L + 1;
  }
  return 0;
}
// does the line from a to b cross the plane's top inside its floor plan?
export function crosses(a: V3, b: V3, pl: PlaneRect): boolean {
  if (!((a.y > pl.top && b.y < pl.top) || (a.y < pl.top && b.y > pl.top))) return false;
  const t = (a.y - pl.top) / (a.y - b.y);
  const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
  return x >= pl.x0 && x <= pl.x1 && z >= pl.z0 && z <= pl.z1;
}
// rule 4: the angle the author asked for, else the story's default for that kind of shot
export function angleOf(v: CamView | null | undefined, az0: number, el0: number): { az: number; el: number } {
  return { az: v?.turn ? TURN_RAD[v.turn] : az0, el: v?.tilt ? TILT_RAD[v.tilt] : el0 };
}
// the camera glides the short way round: the turn goal moved to within half a turn of where the camera is
export function nearTurn(from: number, to: number): number {
  let d = (to - from) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return from + d;
}
