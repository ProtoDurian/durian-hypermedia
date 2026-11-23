// Line ends on the 3D stage (SPEC 3.2): the same shapes as 2D, flat beside the line, as tubes and patches.
import * as THREE from "three";
import { glyphOf, type EndMark, type P } from "../core/line-ends";
import { PORT_GAP } from "../core/route";

const R = 1.15, LIFT = 1.6;
export function endMeshes(curve: THREE.Curve<THREE.Vector3>, side: "a" | "b", mark: EndMark, ink: THREE.Material, paper: THREE.Material): THREE.Mesh[] {
  const t = side === "a" ? 0 : 1, at = curve.getPointAt(t), dir = curve.getTangentAt(t).multiplyScalar(side === "a" ? 1 : -1).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  // across the line and level; a line straight up takes the stage's x
  const across = Math.abs(dir.y) > 0.98 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3().crossVectors(up, dir).normalize();
  const lift = Math.abs(dir.y) > 0.7 ? new THREE.Vector3() : up.clone().multiplyScalar(LIFT);
  const put = (q: P) => at.clone().addScaledVector(dir, q.x - PORT_GAP).addScaledVector(across, q.y).add(lift);
  const out: THREE.Mesh[] = [];
  const own = (m: THREE.Mesh) => { m.userData.own = true; out.push(m); };
  const bar = (a: THREE.Vector3, b: THREE.Vector3) => own(new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(a, b), 1, R, 5, false), ink));
  const patch = (ps: THREE.Vector3[], mat: THREE.Material) => {
    const geo = new THREE.BufferGeometry().setFromPoints(ps.slice(1, -1).flatMap((_, k) => [ps[0], ps[k + 1], ps[k + 2]]));
    own(new THREE.Mesh(geo, mat));
  };
  const gl = glyphOf(mark);
  for (const pl of gl.polys) {
    const ps = pl.pts.map(put);
    if (pl.fill) patch(ps, pl.fill === "ink" ? ink : paper);
    for (let k = 0; k + 1 < ps.length; k++) bar(ps[k], ps[k + 1]);
    if (pl.fill) bar(ps[ps.length - 1], ps[0]);
  }
  if (gl.ring) {
    const ps = Array.from({ length: 12 }, (_, k) => put({ x: gl.ring!.x + Math.cos((k * Math.PI) / 6) * gl.ring!.r, y: Math.sin((k * Math.PI) / 6) * gl.ring!.r }));
    patch(ps, paper);
    ps.forEach((q, k) => bar(q, ps[(k + 1) % ps.length]));
  }
  return out;
}
