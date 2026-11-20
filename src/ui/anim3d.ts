// This package is the source of this file: edit it here. It began as a copy synced from a private prototype (scripts/sync.ts, now frozen).
// The 3D stage for the animation engine (format version 6). It draws the same frames as the 2D stage (tools/scene.ts):
// each entity keeps its floor-plan place (x, and its y inside its layer as depth) and is lifted to its layer's height.
// Layers are planes, stacked top to bottom; "split layers" pulls them apart; "focus" flies the camera to one.
// Colours come from the page tokens (read from CSS); every word is an HTML label over the canvas, so it stays flat and readable.
// Loaded only when a reader opens the 3D view (a dynamic import), so pages without it never fetch three.js.
import * as THREE from "three";
import { gapOf, baseY as baseOf, heightOf, floorY, planeY, PLANE_H, minElevation, MAX_ELEVATION } from "./geo3d";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { DESIGN, CHIP, cut, type Layer, type Rect } from "../core/scene";

export interface Item3 {
  key: number; id: string; kind: string; label: string; size: string; cc: number; fill: string; pcc: number; container: boolean; bare: boolean; parent: number | null;
  tone: string; dim: boolean; down: boolean; x: number; y: number; w: number; h: number; L: number; o: number; depth: number;
}
export interface View3 {
  items: Item3[];
  edges: { key: string; from: number; to: number; style: string; label: string; implicit: boolean; cc: number; o: number }[];
  sends: { label: string; path: number[]; show: string; cc: number; p: number }[];
  says: { key: number; text: string; o: number }[];
  hl: Map<number, string>; sel: number | null;
  layers: Layer[]; levels: number; spread: number; focus: number | null; look: number[] | null; touched: number[];
  foot: Rect; // the floor plan of the whole story, so layer planes and the centre never move
  stepKey: string; // changes when the step changes: the story camera moves again
}
export type Pick = { kind: "ent"; key: number } | { kind: "layer"; L: number } | null;
export interface Stage3 { update(v: View3): void; zoom(f: number): void; pan(dx: number, dy: number): void; walk(fwd: number, side: number): void; fit(): void; back(): void; dispose(): void }

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
UNIT_BOX.translate(0, 0.5, 0); // base at y = 0
const UNIT_CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 40);
UNIT_CYL.translate(0, 0.5, 0);
const UNIT_SPH = new THREE.SphereGeometry(0.5, 28, 16);
UNIT_SPH.translate(0, 0.5, 0);
const UNIT_CONE = new THREE.ConeGeometry(0.5, 1, 20);
const EDGE_BOX = new THREE.EdgesGeometry(UNIT_BOX);
const EDGE_CYL = new THREE.EdgesGeometry(UNIT_CYL, 30);
const FOCUS_OFF = 0.12;

export function canWebGL(): boolean {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

export function mount3d(host: HTMLElement, on: { pick: (p: Pick) => void; user: (active: boolean) => void }): Stage3 {
  if (!canWebGL()) throw new Error("no WebGL");
  const canvas = document.createElement("canvas");
  canvas.className = "scn3-canvas";
  const labels = document.createElement("div");
  labels.className = "scn3-labels";
  host.append(canvas, labels);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearAlpha(0); // the stage shows through: the page token behind it is the background
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(38, 1.6, 1, 20000);
  const root = new THREE.Group();
  scene.add(root);

  // ---------------------------------------------------------------- colours: page tokens, read again when the theme changes
  const probe = document.createElement("canvas").getContext("2d")!;
  const css = (name: string) => {
    const v = getComputedStyle(host).getPropertyValue(name).trim() || "#888";
    probe.fillStyle = "#000"; probe.fillStyle = v; // the browser normalises any CSS colour
    return new THREE.Color(probe.fillStyle as string);
  };
  let C: Record<string, THREE.Color> = {};
  const readColours = () => {
    const names = ["surface", "surface-2", "surface-3", "line", "line-2", "ink", "muted", "faint", "acc", "acc-soft", "acc-softer", "good", "good-soft", "warn", "warn-soft", "hot", "hot-soft", "bad", ...[1, 2, 3, 4, 5, 6, 7, 8].flatMap((k) => [`c${k}`, `c${k}-soft`])];
    C = Object.fromEntries(names.map((n) => [n, css(`--${n}`)]));
    // paint again with the new tokens (a theme or palette switch while the stage is open)
    if (view) update(view);
    dirty = true;
  };
  // a family's colour (cc 1..8) when the thing has no tone: its soft fill, its base for lines
  const tone = (t: string, container: boolean, depth: number, cc = 0, plainFill = false) => {
    // format version 7: the family colour is the border and an optional soft tint; fill=none, or a thing of the same
    // family as its container, draws on the plain surface (the words are in ink, in the label layer)
    if (cc && t === "plain") { const fill = plainFill ? C.surface : C[`c${cc}-soft`], line = C[`c${cc}`]; return { fill, line, side: fill.clone().lerp(line, 0.38) }; }
    const fill = t === "acc" ? C["acc-soft"] : t === "good" ? C["good-soft"] : t === "warn" ? C["warn-soft"] : t === "hot" ? C["hot-soft"] : t === "muted" ? C["surface-3"] : container && depth % 2 ? C["surface-2"] : C.surface;
    const line = t === "acc" ? C.acc : t === "good" ? C.good : t === "warn" ? C.warn : t === "hot" ? C.hot : t === "muted" ? C.line : C["line-2"];
    return { fill, line, side: fill.clone().lerp(line, 0.38) };
  };

  // ---------------------------------------------------------------- one object per entity, reused between steps
  type Obj = { g: THREE.Group; body: THREE.Mesh | null; extra: THREE.Mesh[]; edge: THREE.LineSegments | null; ring: THREE.LineLoop; x: THREE.LineSegments; mats: THREE.Material[]; label: HTMLDivElement; kind: string; seen: boolean };
  const objs = new Map<number, Obj>();
  const basic = (opts: THREE.MeshBasicMaterialParameters = {}) => new THREE.MeshBasicMaterial({ transparent: true, ...opts });
  const lineMat = () => new THREE.LineBasicMaterial({ transparent: true });
  // a material at full opacity is drawn solid: it writes depth, so a see-through plane drawn later cannot cover it
  const solid = (m: THREE.Material, op: number) => { const t = op < 0.999; if (m.transparent !== t) { m.transparent = t; m.needsUpdate = true; } };
  const mkObj = (it: Item3): Obj => {
    const g = new THREE.Group();
    const mats: THREE.Material[] = [];
    let body: THREE.Mesh | null = null, edge: THREE.LineSegments | null = null;
    const extra: THREE.Mesh[] = [];
    const k = it.kind;
    if (it.container) {
      if (!it.bare) { const m = [basic(), basic(), basic(), basic(), basic(), basic()]; m.forEach((x) => (x.depthWrite = false)); body = new THREE.Mesh(UNIT_BOX, m); edge = new THREE.LineSegments(EDGE_BOX, lineMat()); mats.push(...m, edge.material as THREE.Material); }
    } else if (k === "circle" || k === "cylinder" || k === "dot") {
      const m = [basic(), basic(), basic()]; body = new THREE.Mesh(UNIT_CYL, m); edge = new THREE.LineSegments(EDGE_CYL, lineMat()); mats.push(...m, edge.material as THREE.Material);
    } else if (k === "cloud") {
      const m = basic(); body = new THREE.Mesh(UNIT_SPH, m); mats.push(m);
    } else if (k === "person") {
      const m = basic(), m2 = basic();
      const b = new THREE.Mesh(UNIT_CYL, m); b.scale.set(20, 18, 20); const h = new THREE.Mesh(UNIT_SPH, m2); h.scale.set(15, 15, 15); h.position.y = 19;
      extra.push(b, h); mats.push(m, m2);
    } else if (k === "pointer") {
      const m = basic(); const c = new THREE.Mesh(UNIT_CONE, m); c.rotation.x = Math.PI; c.scale.set(10, 16, 10); c.position.y = 24; extra.push(c); mats.push(m);
    } else if (k !== "text") {
      const m = [basic(), basic(), basic(), basic(), basic(), basic()]; body = new THREE.Mesh(UNIT_BOX, m); edge = new THREE.LineSegments(EDGE_BOX, lineMat()); mats.push(...m, edge.material as THREE.Material);
    }
    for (const x of [body, edge, ...extra]) if (x) { x.userData.key = it.key; g.add(x); }
    // the ring (highlight or selection) and the cross (down=yes) lie on the floor around and on top of the thing
    const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 0, -0.5), new THREE.Vector3(0.5, 0, 0.5), new THREE.Vector3(-0.5, 0, 0.5)]), new THREE.LineDashedMaterial({ transparent: true, dashSize: 0.04, gapSize: 0.03 }));
    ring.computeLineDistances();
    const xg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.42, 0, -0.42), new THREE.Vector3(0.42, 0, 0.42), new THREE.Vector3(0.42, 0, -0.42), new THREE.Vector3(-0.42, 0, 0.42)]);
    const x = new THREE.LineSegments(xg, lineMat());
    mats.push(ring.material as THREE.Material, x.material as THREE.Material);
    g.add(ring, x);
    root.add(g);
    const label = document.createElement("div");
    labels.append(label);
    return { g, body, extra, edge, ring, x, mats, label, kind: k, seen: true };
  };
  const dropObj = (k: number, o: Obj) => { root.remove(o.g); o.mats.forEach((m) => m.dispose()); o.ring.geometry.dispose(); o.x.geometry.dispose(); o.label.remove(); objs.delete(k); };

  // ---------------------------------------------------------------- layer planes (declared layers only)
  type Plane = { mesh: THREE.Mesh; edge: THREE.LineSegments; label: HTMLDivElement };
  const planes: Plane[] = [];
  const syncPlanes = (n: number) => {
    while (planes.length > n) { const p = planes.pop()!; root.remove(p.mesh, p.edge); (p.mesh.material as THREE.Material).dispose(); (p.edge.material as THREE.Material).dispose(); p.label.remove(); }
    while (planes.length < n) {
      const L = planes.length;
      const mesh = new THREE.Mesh(UNIT_BOX, basic({ depthWrite: false }));
      mesh.userData.layer = L;
      const edge = new THREE.LineSegments(EDGE_BOX, lineMat());
      const label = document.createElement("div");
      label.className = "scn3-layer";
      labels.append(label);
      root.add(mesh, edge);
      planes.push({ mesh, edge, label });
    }
  };

  // ---------------------------------------------------------------- connectors: a tube along a curve, with a cone for the head
  type Wire = { mesh: THREE.Mesh; heads: THREE.Mesh[]; mat: THREE.MeshBasicMaterial; sig: string; label: HTMLDivElement | null; mid: THREE.Vector3 };
  const wires = new Map<string, Wire>();
  // drops: a stream's dots, moved each frame along curves
  const tokens: { mesh: THREE.Mesh; label: HTMLDivElement; arrow: THREE.Group; head: THREE.Mesh; arrowMat: THREE.MeshBasicMaterial; sig: string; drops: THREE.Mesh[]; curves: THREE.Curve<THREE.Vector3>[] }[] = [];
  const bubbles: HTMLDivElement[] = [];

  // ---------------------------------------------------------------- the camera: the story's, unless the reader moved it
  const camNow = { tx: 0, ty: 0, tz: 0, az: -0.5, el: 0.62, dist: 900 };
  let goal = { ...camNow };
  let user = false, userFocus: number | null = null, lastStep = "", first = true;
  let view: View3 | null = null;
  let dirty = true;
  const W = { w: 1, h: 1 };
  // the highest point on the stage: the top plane, or the top of the highest thing; the camera stays above it
  const topY = () => { let y = 0; for (const p of pos.values()) y = Math.max(y, p.top); return y; };
  const clampEl = (c: { ty: number; dist: number; el: number }) => { c.el = Math.min(MAX_ELEVATION, Math.max(minElevation(c.ty, c.dist, topY()), c.el)); };
  const place = () => {
    clampEl(goal); clampEl(camNow);
    const { tx, ty, tz, az, el, dist } = camNow;
    cam.position.set(tx + dist * Math.cos(el) * Math.sin(az), ty + dist * Math.sin(el), tz + dist * Math.cos(el) * Math.cos(az));
    cam.lookAt(tx, ty, tz);
    // the camera, readable from outside (tests, and anyone curious): target x,y,z, turn, tilt, distance, height
    host.dataset.cam = [tx, ty, tz, az, el, dist, cam.position.y, topY()].map((n) => n.toFixed(3)).join(",");
  };
  const resize = () => {
    const r = host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    W.w = r.width; W.h = r.height;
    renderer.setSize(r.width, r.height, false);
    cam.aspect = r.width / r.height;
    cam.updateProjectionMatrix();
    dirty = true;
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  // world position of an item (centre of its floor plan, its base height)
  const gap = (v: View3) => gapOf(v.foot, v.spread);
  const cx = () => view!.foot.x + view!.foot.w / 2, cz = () => view!.foot.y + view!.foot.h / 2;
  const lift = new Map<number, number>();
  // a thing stands on its layer's plane; a thing inside a container on the same layer stands on the container's slab (geo3d.ts)
  const baseY = (it: Item3, byKey: Map<number, Item3>) => baseOf(it, byKey, gap(view!));
  // where things are, for camera and connectors
  const pos = new Map<number, { c: THREE.Vector3; half: THREE.Vector3; top: number }>();

  const fitBox = (pts: { c: THREE.Vector3; half: THREE.Vector3 }[], el: number, az: number) => {
    const b = new THREE.Box3();
    for (const p of pts) { b.expandByPoint(p.c.clone().sub(p.half)); b.expandByPoint(p.c.clone().add(p.half)); }
    if (b.isEmpty()) b.set(new THREE.Vector3(-100, -20, -100), new THREE.Vector3(100, 20, 100));
    const c = b.getCenter(new THREE.Vector3());
    // the nearest distance at which all 8 corners fit the view, with a margin for labels (exact for a perspective camera)
    const tv = Math.tan((cam.fov * Math.PI) / 360), th = tv * (Math.max(120, W.w) / W.h), M = 0.84;
    const back = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    const right = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az)), up = new THREE.Vector3().crossVectors(back, right);
    let dist = 120;
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
      const p = new THREE.Vector3(x, y, z).sub(c);
      const k = p.dot(back);
      dist = Math.max(dist, k + Math.abs(p.dot(right)) / (M * th), k + Math.abs(p.dot(up)) / (M * tv));
    }
    return { tx: c.x, ty: c.y, tz: c.z, az, el, dist };
  };
  const storyGoal = () => {
    if (!view) return goal;
    const v = view;
    const all = [...pos.entries()];
    const visible = all.filter(([k]) => (v.items.find((i) => i.key === k)?.o ?? 0) > 0.3).map(([, p]) => p);
    // what the step touches, with room above it for its words (its label, a chip, speech): 34 units up
    const up = new THREE.Vector3(0, 34, 0);
    const touched = (v.touched.map((k) => pos.get(k)).filter(Boolean) as { c: THREE.Vector3; half: THREE.Vector3 }[]).map((p) => ({ c: p.c.clone().add(up), half: p.half.clone().add(up) }));
    if (v.look?.length) { const s = v.look.map((k) => pos.get(k)).filter(Boolean) as any[]; if (s.length) return fitBox([...s, ...touched], 0.7, -0.35); }
    if (v.focus != null) return fitBox([...layerPts(v.focus), ...touched], 0.95, -0.3);
    // everything on the stage, and the layer planes (they are wider than what stands on them)
    const planesPts = v.layers.flatMap((_, L) => layerPts(L));
    return fitBox([...(visible.length ? visible : all.map(([, p]) => p)), ...planesPts, ...touched], v.spread > 0.5 ? 0.5 : 0.62, -0.5);
  };
  const layerPts = (L: number) => {
    const v = view!, y = -L * gap(v);
    return [{ c: new THREE.Vector3(0, y + 8, 0), half: new THREE.Vector3(v.foot.w / 2 + 10, 12, v.foot.h / 2 + 10) }];
  };

  // ---------------------------------------------------------------- update: lay out this moment of the story
  const update = (v: View3) => {
    view = v;
    syncPlanes(v.layers.length);
    const byKey = new Map(v.items.map((i) => [i.key, i]));
    for (const o of objs.values()) o.seen = false;
    pos.clear();
    const X0 = cx(), Z0 = cz();
    const focusOn = userFocus ?? null;
    for (const it of v.items) {
      if (it.kind === "layer") continue;
      let o = objs.get(it.key);
      if (o && o.kind !== it.kind) { dropObj(it.key, o); o = undefined; }
      if (!o) { o = mkObj(it); objs.set(it.key, o); }
      o.seen = true;
      const hgt = heightOf(it);
      const by = baseY(it, byKey);
      const x = it.x + it.w / 2 - X0, z = it.y + it.h / 2 - Z0;
      const hlt = v.hl.get(it.key), sel = v.sel === it.key;
      const pop = hlt ? 6 : 0;
      o.g.position.set(x, by + pop, z);
      const off = focusOn != null && Math.abs(it.L - focusOn) > 0.5 ? FOCUS_OFF : 1;
      const op = it.o * off * (it.dim ? 0.5 : 1);
      const order = (v.layers.length + 1 - it.L) * 100 + (it.container ? 10 + it.depth : 60);
      for (const x of [o.body, o.edge, ...o.extra]) if (x) x.renderOrder = order;
      o.ring.renderOrder = order + 1; o.x.renderOrder = order + 2;
      const t = tone(it.tone, it.container, it.depth, it.cc, it.fill === "none" || (!!it.cc && it.pcc === it.cc));
      const k = it.kind;
      if (o.body) {
        if (k === "circle" || k === "dot") { const d = k === "dot" ? 14 : Math.min(it.w, it.h); o.body.scale.set(d, hgt, d); }
        else if (k === "cylinder") o.body.scale.set(it.w * 0.8, hgt, it.h * 0.8);
        else if (k === "cloud") o.body.scale.set(it.w * 0.9, hgt, it.h * 0.9);
        else if (k === "pill") o.body.scale.set(it.w, hgt, Math.min(it.h, 26));
        else if (k === "token") { o.body.scale.set(9, 9, 9); o.g.position.y += 14; }
        else o.body.scale.set(it.w, hgt, it.h);
        if (o.edge) o.edge.scale.copy(o.body.scale);
        const mats = (Array.isArray(o.body.material) ? o.body.material : [o.body.material]) as THREE.MeshBasicMaterial[];
        const dotC = it.cc ? C[`c${it.cc}`] : C.acc;
        const fill = k === "token" || k === "dot" ? dotC : t.fill, side = k === "token" || k === "dot" ? dotC.clone().lerp(C.ink, 0.25) : t.side;
        // box faces: +x, -x, +y (top), -y, +z, -z; cylinder: side, top, bottom
        mats.forEach((m, i) => { m.color.copy(mats.length === 6 ? (i === 2 ? fill : side) : mats.length === 3 ? (i === 1 ? fill : side) : fill); m.opacity = op * (it.container ? 0.72 : 1); solid(m, m.opacity); });
        if (o.edge) { const em = o.edge.material as THREE.LineBasicMaterial; em.color.copy(hlt ? toneLine(hlt) : t.line); em.opacity = op; }
      }
      for (const e of o.extra) { const m = e.material as THREE.MeshBasicMaterial; m.color.copy(k === "pointer" ? C.hot : t.line.clone().lerp(t.fill, 0.35)); m.opacity = op; solid(m, op); }
      // ring: highlight (solid) or selection (dashed) around the foot
      const rm = o.ring.material as THREE.LineDashedMaterial;
      o.ring.visible = !!(hlt || sel);
      if (o.ring.visible) { o.ring.scale.set(it.w + 14, 1, (k === "pill" ? Math.min(it.h, 26) : it.h) + 14); o.ring.position.y = 1 - pop; rm.color.copy(hlt ? toneLine(hlt) : C.acc); rm.opacity = op; rm.dashSize = sel && !hlt ? 0.04 : 10; rm.gapSize = sel && !hlt ? 0.03 : 0; }
      o.x.visible = it.down;
      if (it.down) { o.x.scale.set(it.w, 1, it.h); o.x.position.y = hgt + 0.6; const xm = o.x.material as THREE.LineBasicMaterial; xm.color.copy(C.bad); xm.opacity = it.o * off; }
      const half = new THREE.Vector3(it.w / 2, Math.max(hgt, 8) / 2, (k === "pill" ? Math.min(it.h, 26) : it.h) / 2);
      pos.set(it.key, { c: new THREE.Vector3(x, by + pop + half.y, z), half, top: by + pop + Math.max(hgt, k === "person" ? 34 : k === "pointer" ? 32 : 0) });
      // its label: on a container's back-left corner, else above its top
      const lb = o.label;
      lb.className = `scn3-l k-${k} sz-${it.size}${it.cc && it.tone === "plain" ? ` cc cc-${it.cc}` : ""}${it.container ? " is-cont" : ""} tone-${it.tone}${it.down ? " is-down" : ""}${hlt ? " is-hl" : ""}${sel ? " is-sel" : ""}`;
      const words = k === "token" ? cut(it.label || "", CHIP.font, CHIP.maxW) : it.label || "";
      if (lb.textContent !== words) lb.textContent = words;
      if (!it.container) lb.style.maxWidth = `${(DESIGN as any)[it.size]?.maxW ?? 160}px`;
      lb.dataset.o = String(op);
      lift.set(it.key, op);
    }
    for (const [k, o] of objs) if (!o.seen) dropObj(k, o);
    // the layer planes
    const g = gap(v);
    planes.forEach((p, L) => {
      const l = v.layers[L];
      const off = focusOn != null && L !== focusOn ? FOCUS_OFF : 1;
      const story = v.focus != null && L !== v.focus ? FOCUS_OFF : 1;
      p.mesh.scale.set(v.foot.w + 40, PLANE_H, v.foot.h + 40);
      p.mesh.position.set(v.foot.x + v.foot.w / 2 - X0, planeY(L, g), v.foot.y + v.foot.h / 2 - Z0);
      p.mesh.renderOrder = p.edge.renderOrder = (v.layers.length + 1 - L) * 100;
      p.edge.scale.copy(p.mesh.scale); p.edge.position.copy(p.mesh.position);
      const m = p.mesh.material as THREE.MeshBasicMaterial;
      m.color.copy(C["acc-softer"]); m.opacity = 0.5 * off * story;
      const em = p.edge.material as THREE.LineBasicMaterial;
      em.color.copy(v.focus === L || focusOn === L ? C.acc : C["acc-soft"].clone().lerp(C.acc, 0.35)); em.opacity = off * story;
      p.label.textContent = l.label;
      p.label.dataset.o = String(off * story);
      p.label.classList.toggle("is-on", v.focus === L || focusOn === L);
    });
    // connectors
    const seen = new Set<string>();
    for (const e of v.edges) {
      const a = pos.get(e.from), b = pos.get(e.to);
      if (!a || !b) continue;
      const opac = e.o * Math.min(lift.get(e.from) ?? 1, lift.get(e.to) ?? 1);
      seen.add(e.key);
      const { P, Q, mid } = curvePts(a, b, 0);
      const sig = `${P.toArray().map((n) => n.toFixed(1))}|${Q.toArray().map((n) => n.toFixed(1))}|${e.style}`;
      let wv = wires.get(e.key);
      if (!wv) { const mat = basic(); wv = { mesh: new THREE.Mesh(new THREE.BufferGeometry(), mat), heads: [], mat, sig: "", label: null, mid }; root.add(wv.mesh); wires.set(e.key, wv); }
      if (wv.sig !== sig) {
        wv.sig = sig;
        const curve = new THREE.QuadraticBezierCurve3(P, mid, Q);
        wv.mesh.geometry.dispose();
        wv.mesh.geometry = tube(curve, e.style === "-->", e.implicit ? 0.9 : 1.3);
        for (const h of wv.heads) root.remove(h);
        wv.heads = [];
        const head = (at: number, dir: number) => {
          const c = new THREE.Mesh(UNIT_CONE, wv!.mat); c.scale.set(7, 12, 7);
          const p = curve.getPointAt(at), tan = curve.getTangentAt(at).multiplyScalar(dir);
          c.position.copy(p).addScaledVector(tan, -5);
          c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan.normalize());
          root.add(c); wv!.heads.push(c);
        };
        if (["->", "-->", "<->"].includes(e.style)) head(1, 1);
        if (e.style === "<->") head(0, -1);
        wv.mid = curve.getPointAt(0.5);
      }
      wv.mat.color.copy(e.cc ? C[`c${e.cc}`] : e.implicit ? C["line-2"] : C.muted); wv.mat.opacity = opac;
      if (e.label) {
        if (!wv.label) { wv.label = document.createElement("div"); wv.label.className = "scn3-wire"; labels.append(wv.label); }
        wv.label.textContent = e.label; wv.label.dataset.o = String(opac);
      } else if (wv.label) { wv.label.remove(); wv.label = null; }
    }
    for (const [k, wv] of wires) if (!seen.has(k)) { root.remove(wv.mesh, ...wv.heads); wv.mesh.geometry.dispose(); wv.mat.dispose(); wv.label?.remove(); wires.delete(k); }
    // sends this step: a small token travels the curves between the things on its path, an arrow draws itself along
    // them (beside a connector when there is one), or both; the words sit in a small chip
    while (tokens.length > v.sends.length) { const t = tokens.pop()!; root.remove(t.mesh, t.arrow, t.head); (t.mesh.material as THREE.Material).dispose(); t.arrowMat.dispose(); t.arrow.children.forEach((c) => (c as THREE.Mesh).geometry.dispose()); t.label.remove(); t.drops.forEach((d) => { root.remove(d); (d.material as THREE.Material).dispose(); }); }
    while (tokens.length < v.sends.length) {
      const mesh = new THREE.Mesh(UNIT_SPH, basic()); mesh.scale.set(9, 9, 9); root.add(mesh);
      const arrowMat = basic(); const arrow = new THREE.Group(); const head = new THREE.Mesh(UNIT_CONE, arrowMat); head.scale.set(8, 13, 8); root.add(arrow, head);
      const label = document.createElement("div"); labels.append(label); tokens.push({ mesh, label, arrow, head, arrowMat, sig: "", drops: [], curves: [] });
    }
    const conns = new Set(v.edges.map((e) => `${e.from}>${e.to}`));
    v.sends.forEach((s, i) => {
      const t = tokens[i];
      const ps = s.path.map((k) => pos.get(k)).filter(Boolean) as { c: THREE.Vector3; half: THREE.Vector3 }[];
      if (ps.length < 2) { t.mesh.visible = false; t.arrow.visible = false; t.head.visible = false; t.label.dataset.o = "0"; return; }
      const stream = s.show === "stream";
      const arrowOn = s.show === "arrow" || s.show === "both", tokenOn = s.show === "token" || s.show === "both";
      const curves = ps.slice(1).map((b, k) => { const off = arrowOn && (conns.has(`${s.path[k]}>${s.path[k + 1]}`) || conns.has(`${s.path[k + 1]}>${s.path[k]}`)) ? 7 : 0; const { P, Q, mid } = curvePts(ps[k], b, off); return new THREE.QuadraticBezierCurve3(P, mid, Q); });
      t.curves = stream ? curves : [];
      const want = stream ? 6 * curves.length : 0;
      while (t.drops.length > want) { const d = t.drops.pop()!; root.remove(d); (d.material as THREE.Material).dispose(); }
      while (t.drops.length < want) { const d = new THREE.Mesh(UNIT_SPH, basic()); d.scale.set(5, 5, 5); root.add(d); t.drops.push(d); }
      t.drops.forEach((d) => { (d.material as THREE.MeshBasicMaterial).color.copy(s.cc ? C[`c${s.cc}`] : C.hot); (d.material as THREE.MeshBasicMaterial).opacity = Math.min(1, s.p * 3); });
      const n = curves.length, ep = easeIO(s.p);
      const seg = Math.min(n - 1, Math.floor(ep * n)), fr = ep >= 1 ? 1 : ep * n - seg;
      const at = curves[seg].getPointAt(Math.min(1, fr)), tan = curves[seg].getTangentAt(Math.max(0.01, Math.min(1, fr)));
      t.mesh.visible = tokenOn && s.p > 0; t.mesh.position.copy(at).y -= 4.5;
      (t.mesh.material as THREE.MeshBasicMaterial).color.copy(s.cc ? C[`c${s.cc}`] : C.hot);
      // the arrow: one tube per piece, revealed along its length
      const sig = curves.map((c) => [c.v0, c.v1, c.v2].map((p) => p.toArray().map((x) => x.toFixed(1)).join(",")).join(";")).join("|");
      if (t.sig !== sig) { t.sig = sig; t.arrow.children.slice().forEach((c) => { t.arrow.remove(c); (c as THREE.Mesh).geometry.dispose(); }); for (const c of curves) t.arrow.add(new THREE.Mesh(new THREE.TubeGeometry(c, 40, 1.7, 6, false), t.arrowMat)); }
      t.arrow.visible = arrowOn && s.p > 0; t.head.visible = arrowOn && s.p > 0;
      t.arrow.children.forEach((c, k) => { const g = (c as THREE.Mesh).geometry as THREE.BufferGeometry; const full = g.index!.count; g.setDrawRange(0, k < seg ? full : k === seg ? Math.floor(Math.min(1, fr) * 40) * 6 * 6 : 0); });
      t.arrowMat.color.copy(s.cc ? C[`c${s.cc}`] : C.acc); t.arrowMat.opacity = 1;
      t.head.position.copy(at).addScaledVector(tan, -4); t.head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan.clone().normalize());
      // the words: an arrow's by the middle of its path, a token's next to the token
      // a third of the way along its middle piece: a connector's own label sits at the middle
      const mc = curves[Math.floor((n - 1) / 2)].getPointAt(n % 2 ? 0.33 : 0.5);
      const wide = arrowOn || stream;
      const words = wide ? s.label : cut(s.label, CHIP.font, CHIP.maxW);
      t.label.className = `${wide ? "scn3-arrow" : "scn3-send"}${s.cc ? ` cc cc-${s.cc}` : ""}`;
      t.label.textContent = words;
      const lp = wide ? mc : at;
      t.label.dataset.o = s.p > 0 && s.label ? String(stream ? 1 : arrowOn ? Math.min(1, Math.max(0, (ep * n - Math.floor((n - 1) / 2) - 0.2) / 0.3)) : 1) : "0";
      t.label.dataset.x = String(lp.x); t.label.dataset.y = String(lp.y + (wide ? 6 : 9)); t.label.dataset.z = String(lp.z);
    });
    // speech for this step, above the thing
    while (bubbles.length > v.says.length) bubbles.pop()!.remove();
    while (bubbles.length < v.says.length) { const b = document.createElement("div"); b.className = "scn3-say"; labels.append(b); bubbles.push(b); }
    v.says.forEach((s, i) => { const p = pos.get(s.key); const b = bubbles[i]; b.textContent = s.text; b.dataset.o = p ? String(s.o) : "0"; if (p) { b.dataset.x = String(p.c.x); b.dataset.y = String(p.top + 18); b.dataset.z = String(p.c.z); } });
    // the story camera moves when the step changes (or on the first draw)
    if (!user) { goal = storyGoal(); if (first) { Object.assign(camNow, goal); first = false; } }
    if (v.stepKey !== lastStep) { lastStep = v.stepKey; }
    dirty = true;
  };
  // one curve between two things: over things on one layer; a connector that skips a layer bows out sideways, so it does
  // not run through what stands on the layers between; off moves it sideways, so an arrow sits beside a connector
  const curvePts = (a: { c: THREE.Vector3; half: THREE.Vector3 }, b: { c: THREE.Vector3; half: THREE.Vector3 }, off: number) => {
    const P = clip(a, b.c), Q = clip(b, a.c);
    const d = P.distanceTo(Q);
    const mid = P.clone().add(Q).multiplyScalar(0.5);
    if (Math.abs(a.c.y - b.c.y) < 6) mid.y += Math.min(70, d * 0.28);
    else if (Math.abs(a.c.y - b.c.y) > gap(view!) * 1.5) { const out = Math.sign(mid.x || 1); mid.x += out * Math.min(140, 40 + Math.abs(a.c.y - b.c.y) * 0.35); }
    if (off) { const dir = Q.clone().sub(P); const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize().multiplyScalar(off); P.add(side); Q.add(side); mid.add(side); }
    return { P, Q, mid };
  };
  const toneLine = (t: string) => (t === "good" ? C.good : t === "warn" ? C.warn : t === "hot" ? C.hot : t === "muted" ? C["line-2"] : C.acc);

  // ---------------------------------------------------------------- draw: move the camera towards its goal, project the labels
  const v3 = new THREE.Vector3();
  // keepIn: a layer's name chip stays inside the stage (it hangs to the left of its anchor)
  const project = (el: HTMLElement, x: number, y: number, z: number, o: number, keepIn = false) => {
    v3.set(x, y, z).project(cam);
    const behind = v3.z > 1;
    let sx = (v3.x * 0.5 + 0.5) * W.w, sy = (-v3.y * 0.5 + 0.5) * W.h;
    if (keepIn) { sx = Math.min(W.w - 60, Math.max(sx, el.offsetWidth + 6)); sy = Math.min(W.h - 34, Math.max(16, sy)); }
    const show = !behind && o > 0.04 && sx > -60 && sx < W.w + 60 && sy > -30 && sy < W.h + 30;
    el.style.opacity = show ? String(Math.min(1, o)) : "0";
    el.style.visibility = show ? "visible" : "hidden";
    if (show) { el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`; el.style.zIndex = String(Math.round((1 - v3.z) * 1e5)); placed.push({ el, sx, sy }); }
  };
  // the same rule as the 2D stage: a small label (a connector's, an arrow's, a token's chip, speech) never sits on a
  // thing's label or on another small label; it steps up or down until it is clear
  let placed: { el: HTMLElement; sx: number; sy: number }[] = [];
  const anchorOf = (el: HTMLElement): [number, number] => {
    const c = el.classList;
    if (c.contains("scn3-layer")) return [-1, -0.5];
    if (c.contains("is-cont")) return [0, -1];
    if (c.contains("scn3-send")) return [-0.5, -1.25];
    if (c.contains("scn3-arrow") || c.contains("scn3-say")) return [-0.5, -1];
    if (c.contains("k-token")) return [-0.5, -1.3];
    return [-0.5, -0.5];
  };
  const unclutter = () => {
    const rect = (p: { el: HTMLElement; sx: number; sy: number }, dy = 0, dx = 0) => { const [ax, ay] = anchorOf(p.el), w = p.el.offsetWidth, h = p.el.offsetHeight; return { x: p.sx + dx + ax * w, y: p.sy + dy + ay * h, w, h }; };
    const small = (el: HTMLElement) => el.classList.contains("scn3-wire") || el.classList.contains("scn3-arrow") || el.classList.contains("scn3-send") || el.classList.contains("scn3-say") || el.classList.contains("k-token");
    const cont = (el: HTMLElement) => el.classList.contains("is-cont");
    const fixed = placed.filter((p) => !small(p.el) && !cont(p.el)).map((p) => rect(p));
    const hits = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
    // a container's name keeps a clear gap (10 px) from the words of what it holds, so it never reads as one phrase
    // with them ("lift Ana"): it moves left along its edge first, then up above its outline
    const near = (a: { x: number; y: number; w: number; h: number }, b: typeof a, m: number) => a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;
    for (const p of placed.filter((q) => cont(q.el))) {
      const h = p.el.offsetHeight + 2;
      // a clear gap if there is one within two lines; else simply off every word
      let best: [number, number] | null = null;
      search: for (const [m, dys] of [[10, [0, -h, -2 * h]], [1, [0, -h, -2 * h, -3 * h]]] as [number, number[]][]) for (const dy of dys) for (const dx of [0, -16, -32, -48]) { const r = rect(p, dy, dx); if (!fixed.some((f) => near(r, f, m))) { best = [dx, dy]; break search; } }
      best ??= [0, 0];
      if (best[0] || best[1]) p.el.style.transform = `translate(${(p.sx + best[0]).toFixed(1)}px, ${(p.sy + best[1]).toFixed(1)}px)`;
      fixed.push(rect(p, best[1], best[0]));
    }
    for (const p of placed.filter((q) => small(q.el))) {
      const h = p.el.offsetHeight + 3;
      let best = 0;
      for (const dy of [0, -h, h, -2 * h, 2 * h, -3 * h, 3 * h]) { const r = rect(p, dy); if (!fixed.some((f) => hits(r, f))) { best = dy; break; } }
      if (best) p.el.style.transform = `translate(${p.sx.toFixed(1)}px, ${(p.sy + best).toFixed(1)}px)`;
      fixed.push(rect(p, best));
    }
    placed = [];
  };
  const drawLabels = () => {
    placed = [];
    if (!view) return;
    const X0 = cx(), Z0 = cz();
    for (const it of view.items) {
      const o = objs.get(it.key), p = pos.get(it.key);
      if (!o || !p) continue;
      const op = +(o.label.dataset.o ?? 1);
      if (it.container) project(o.label, p.c.x - it.w / 2 + 8, p.top + 1, p.c.z - it.h / 2 + 2, it.label ? op : 0);
      else project(o.label, p.c.x, p.top + 2, p.c.z, op);
    }
    const g = gap(view);
    planes.forEach((pl, L) => project(pl.label, view!.foot.x - 20 - X0, floorY(L, g), view!.foot.y + view!.foot.h / 2 - Z0, +(pl.label.dataset.o ?? 1), true));
    for (const wv of wires.values()) if (wv.label) project(wv.label, wv.mid.x, wv.mid.y, wv.mid.z, +(wv.label.dataset.o ?? 1));
    for (const t of tokens) project(t.label, +(t.label.dataset.x ?? 0), +(t.label.dataset.y ?? 0), +(t.label.dataset.z ?? 0), +(t.label.dataset.o ?? 0));
    for (const b of bubbles) project(b, +(b.dataset.x ?? 0), +(b.dataset.y ?? 0), +(b.dataset.z ?? 0), +(b.dataset.o ?? 0));
    unclutter();
  };
  let raf = 0, visible = true;
  const frame = () => {
    raf = requestAnimationFrame(frame);
    if (!visible) return;
    let moving = false;
    for (const k of Object.keys(camNow) as (keyof typeof camNow)[]) {
      const d = goal[k] - camNow[k];
      const eps = k === "dist" || k.startsWith("t") ? 0.05 : 0.0005;
      if (Math.abs(d) > eps) { camNow[k] += d * 0.14; moving = true; } else camNow[k] = goal[k];
    }
    // a stream's dots flow for as long as the step shows it
    const now = performance.now() / 1000;
    for (const t of tokens) if (t.curves.length) {
      const n = t.curves.length, per = 6;
      t.drops.forEach((d, k) => { const seg = Math.floor(k / per), f = (now / 1.6 + (k % per) / per) % 1; d.position.copy(t.curves[seg].getPointAt(f)).y -= 2.5; });
      moving = true;
    }
    if (!moving && !dirty) return;
    dirty = false;
    place();
    renderer.render(scene, cam);
    drawLabels();
  };
  raf = requestAnimationFrame(frame);
  const io = new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); if (visible) dirty = true; });
  io.observe(host);
  readColours();
  const mo = new MutationObserver(readColours);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-palette", "class", "style"] });
  const onTheme = () => readColours();
  document.addEventListener("dh-theme", onTheme);
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const onMq = () => readColours();
  mq.addEventListener?.("change", onMq);

  // ---------------------------------------------------------------- the reader: turn, move, zoom, click a thing or a layer
  const setUser = (on: boolean) => { if (user !== on) { user = on; that.user(on); } };
  const that = on;
  const ptrs = new Map<number, { x: number; y: number }>();
  let drag: { x: number; y: number; moved: boolean; pan: boolean; dist?: number; mid?: { x: number; y: number } } | null = null;
  const panBy = (dx: number, dy: number) => {
    // move the target across the screen plane, scaled so the scene follows the finger
    const k = (2 * goal.dist * Math.tan((cam.fov * Math.PI) / 360)) / W.h;
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrix, 0), up = new THREE.Vector3().setFromMatrixColumn(cam.matrix, 1);
    const m = right.multiplyScalar(-dx * k).add(up.multiplyScalar(dy * k));
    goal.tx += m.x; goal.ty += m.y; goal.tz += m.z;
  };
  const down = (e: PointerEvent) => {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture?.(e.pointerId);
    const ps = [...ptrs.values()];
    drag = { x: e.clientX, y: e.clientY, moved: false, pan: e.shiftKey || e.button === 2 || e.button === 1, dist: ps.length === 2 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : undefined, mid: ps.length === 2 ? { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 } : undefined };
  };
  const move = (e: PointerEvent) => {
    if (!drag || !ptrs.has(e.pointerId)) return;
    const prev = ptrs.get(e.pointerId)!;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const ps = [...ptrs.values()];
    if (ps.length === 2) {
      const dist = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y), mid = { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 };
      if (drag.dist && drag.mid) {
        goal.dist = clampDist(goal.dist * (drag.dist / dist));
        panBy(mid.x - drag.mid.x, mid.y - drag.mid.y);
      }
      drag.dist = dist; drag.mid = mid; drag.moved = true; setUser(true); return;
    }
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) return;
    drag.moved = true; setUser(true);
    if (drag.pan) panBy(dx, dy);
    else { goal.az -= dx * 0.008; goal.el = goal.el + dy * 0.006; clampEl(goal); }
  };
  const up = (e: PointerEvent) => {
    ptrs.delete(e.pointerId);
    const d = drag;
    if (!ptrs.size) drag = null;
    if (!d || d.moved || ptrs.size) return;
    const r = canvas.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), cam);
    const hits = ray.intersectObjects(root.children, true).filter((h) => h.object.visible && ((h.object as any).material?.opacity ?? 1) > 0.2 && (h.object.userData.key != null || h.object.userData.layer != null));
    // a thing wins over the plane it stands on
    const hit = hits.find((h) => h.object.userData.key != null && !(view?.items.find((i) => i.key === h.object.userData.key)?.container)) ?? hits.find((h) => h.object.userData.key != null) ?? hits[0];
    if (!hit) { that.pick(null); return; }
    if (hit.object.userData.key != null) {
      const k = hit.object.userData.key as number, p = pos.get(k);
      that.pick({ kind: "ent", key: k });
      if (p) { goal = { ...goal, tx: p.c.x, ty: p.c.y, tz: p.c.z, dist: clampDist(Math.max(220, Math.max(p.half.x, p.half.z) * 6)) }; setUser(true); }
    } else {
      const L = hit.object.userData.layer as number;
      userFocus = L;
      that.pick({ kind: "layer", L });
      goal = fitBox(layerPts(L), 0.95, goal.az);
      setUser(true);
      if (view) update(view);
    }
  };
  const clampDist = (d: number) => Math.max(80, Math.min(9000, d));
  // the wheel (and a trackpad's two-finger scroll) zooms once the reader has taken the stage (clicked or focused it);
  // Ctrl or Cmd + wheel (a pinch) always zooms. Before that, a plain wheel scrolls the page past the stage
  const wheel = (e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey && !active()) return;
    e.preventDefault();
    const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    if (e.shiftKey && !e.ctrlKey && !e.metaKey) panBy(-(e.deltaX || d), 0);
    else goal.dist = clampDist(goal.dist * Math.exp(d * (e.ctrlKey || e.metaKey ? 0.01 : 0.0025)));
    setUser(true);
  };
  const ctx = (e: Event) => e.preventDefault();
  const active = () => !!host.closest(".scn")?.classList.contains("is-active");
  // walking: forward and back along the ground (towards where the camera looks, flattened), and sideways
  const walk = (fwd: number, side: number) => {
    const k = goal.dist * 0.08;
    const f = new THREE.Vector3(-Math.sin(goal.az), 0, -Math.cos(goal.az)), r = new THREE.Vector3(Math.cos(goal.az), 0, -Math.sin(goal.az));
    goal.tx += (f.x * fwd + r.x * side) * k; goal.tz += (f.z * fwd + r.z * side) * k;
    setUser(true);
  };
  const cancel = (e: PointerEvent) => { ptrs.delete(e.pointerId); drag = null; };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", cancel);
  canvas.addEventListener("wheel", wheel, { passive: false });
  canvas.addEventListener("contextmenu", ctx);

  return {
    update,
    zoom: (f) => { goal.dist = clampDist(goal.dist * f); setUser(true); },
    pan: (dx, dy) => { panBy(dx, dy); setUser(true); },
    walk,
    fit: () => { userFocus = null; const all = [...pos.values(), ...(view ? view.layers.flatMap((_, L) => layerPts(L)) : [])]; goal = fitBox(all, 0.62, -0.5); setUser(true); if (view) update(view); },
    back: () => { userFocus = null; setUser(false); if (view) update(view); goal = storyGoal(); },
    dispose: () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); mo.disconnect(); mq.removeEventListener?.("change", onMq); document.removeEventListener("dh-theme", onTheme);
      for (const [k, o] of objs) dropObj(k, o);
      for (const w of wires.values()) { w.mesh.geometry.dispose(); w.mat.dispose(); }
      renderer.dispose(); canvas.remove(); labels.remove();
    },
  };
}

// where the line from a thing's centre towards p leaves its box
function clip(a: { c: THREE.Vector3; half: THREE.Vector3 }, p: THREE.Vector3): THREE.Vector3 {
  const d = p.clone().sub(a.c);
  const k = Math.min(...(["x", "y", "z"] as const).map((ax) => (Math.abs(d[ax]) < 1e-6 ? Infinity : (a.half[ax] + 3) / Math.abs(d[ax]))));
  return a.c.clone().addScaledVector(d, Math.min(1, k));
}
// a tube along a curve; a dashed connector is every other piece of it
function tube(curve: THREE.Curve<THREE.Vector3>, dashed: boolean, r: number): THREE.BufferGeometry {
  if (!dashed) return new THREE.TubeGeometry(curve, 24, r, 6, false);
  const len = curve.getLength(), n = Math.max(2, Math.round(len / 9));
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i += 2) {
    const a = i / n, b = Math.min(1, (i + 1) / n);
    const pts = [0, 0.5, 1].map((t) => curve.getPointAt(a + (b - a) * t));
    parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 2, r, 6, false));
  }
  const g = mergeGeometries(parts) ?? new THREE.BufferGeometry();
  parts.forEach((p) => p.dispose());
  return g;
}
const easeIO = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
