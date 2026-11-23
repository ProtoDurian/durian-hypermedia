// This package is the source of this file: edit it here. It began as a copy synced from a private prototype (scripts/sync.ts, now frozen).
// The 3D stage for the animation engine (format version 6). It draws the same frames as the 2D stage (tools/scene.ts):
// each entity keeps its floor-plan place (x, and its y inside its layer as depth) and is lifted to its layer's height.
// Layers are planes, stacked top to bottom; "split layers" pulls them apart; "focus" flies the camera to one.
// Colours come from the page tokens (read from CSS); every word is an HTML label over the canvas, so it stays flat and readable.
// Loaded only when a reader opens the 3D view (a dynamic import), so pages without it never fetch three.js.
import * as THREE from "three";
import { gapOf, baseY as baseOf, heightOf, floorY, SLAB, planeY, PLANE_H, minElevation, MAX_ELEVATION } from "./geo3d";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { DESIGN, CHIP, cut, type Layer, type Rect } from "../core/scene";
import { FAINT } from "../core/story";
import { clampCam, outOfBlocks, peelFor, angleOf, nearTurn, FAR, CLOSE_FILL, type PlaneRect, type Block } from "./cam3d";
import type { CamView } from "../core/camera";
import { LIFT_UP, labelOn, wireLabelOn } from "../core/depth";
import type { Route } from "../core/route";
import { floorCurve, footY, curveSig, tubeSegs, type Slab } from "./route3d";
import { mkMeter, placeMeter, dropMeter, type Meter } from "./meter3d";
import { leastGoal, edgeRows, planeAnchor, orderRows, lineHitsRect, type P2 } from "./least3d";
import { keepInScene } from "./fit3d";
import { endMeshes } from "./line-ends3d";
import { markAt, type Ends } from "../core/line-ends";
import { setRich } from "./inline-dom";
import { hasWebGL, NEAR_MARGIN, RESTORE_AFTER } from "./gl";

export interface Item3 {
  slab?: number; // (format version 11) the slabs it stands on while it moves to another floor or parent, eased from where it starts to where it ends
  key: number; id: string; kind: string; label: string; size: string; cc: number; fill: string; pcc: number; container: boolean; bare: boolean; parent: number | null;
  tone: string; dim: boolean; down: boolean; x: number; y: number; w: number; h: number; L: number; o: number; depth: number;
  nest?: number; // format version 9: in a scene with no declared layers, its nesting level (it stands on one floor)
  faint?: number; // format version 9: inside a closed thing, drawn this strongly (FAINT to 1), its words hidden until it opens
  lift?: number; // format version 10 (tools/depth.ts): lifted out of its box, 0 to 1: it rises LIFT_UP, with what it holds
  lv?: number; // format version 10: its meter (level=), 0 to 100, tweened (site/src/meter3d.ts)
}
export interface View3 {
  items: Item3[];
  // bend, rt (format version 10): the 2D line's bow and route; a line between two things on one layer follows it
  edges: { key: string; from: number; to: number; style: string; label: string; implicit: boolean; cc: number; o: number; bend?: number; rt?: Route | null; part?: boolean; ends?: Ends; tags?: { end: "a" | "b"; text: string; t: number; o: number }[] }[];
  sends: { label: string; path: number[]; show: string; cc: number; p: number; offs?: number[]; bends?: number[]; rts?: (Route | null)[] }[];
  says: { key: number; text: string; o: number }[];
  hl: Map<number, string>; sel: number | null;
  layers: Layer[]; levels: number; spread: number; focus: number | null; look: number[] | null; touched: number[];
  // the held view (core/calm.ts): the things of each step that shares it, at rest, and what those steps touch
  hold?: { frames: Item3[][]; touched: number[]; least: number; spread: number };
  foot: Rect; // the floor plan of the whole story, so layer planes and the centre never move
  stepKey: string; // changes when the step changes: the story camera moves again
  cam?: CamView | null; // the author's camera words for this step (format version 9): close, far, turn=, tilt=
  part?: number[] | null; // format version 10: while a step plays, only these things' labels show (null: every label)
  toks?: number[] | null; // (format version 11) the tokens the step is about: every other token keeps its pill, its label fades (null: all)
  // format version 10: the scene inside the scene that is shown; when it changes the camera starts far from the new one
  // (going in) or close to the thing it was entered from (going out, sceneVia), and glides to the story's view
  scene?: string; sceneDir?: "in" | "out"; sceneVia?: number | null;
  fade?: number; // format version 10: during a move between scenes, how strongly the layer planes show (with the things)
  least?: number; // format version 10: the least scale (scene units to pixels) at which the frame's smallest words are 11 pixels (site/src/least3d.ts)
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
// how far a line to a text stops short of it (item 8, fix): about one line of words
const TEXT_CLEAR = 20;

// asked once per page, and the test context is given back at once (site/src/gl.ts)
export function canWebGL(): boolean { return hasWebGL(); }

// still (format version 10): reduced motion in a 3D-only scene: each step is a still frame, the camera jumps
export function mount3d(host: HTMLElement, on: { pick: (p: Pick) => void; user: (active: boolean) => void }, opts: { still?: boolean } = {}): Stage3 {
  if (!canWebGL()) throw new Error("no WebGL");
  const canvas = document.createElement("canvas");
  canvas.className = "scn3-canvas";
  const labels = document.createElement("div");
  labels.className = "scn3-labels";
  host.append(canvas, labels);
  // format version 10 (site/src/gl.ts): the WebGL context is made when the stage first comes near the screen, given
  // back when it is far (parked), and taken again when it comes back; a context the browser takes away is asked for
  // again while the stage is on screen. While there is none, nothing is drawn, not even the words
  let renderer: THREE.WebGLRenderer | null = null;
  let near = false, parked = false, glLost = false, lostAt = 0;
  const mkRenderer = () => {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    r.setClearAlpha(0); // the stage shows through: the page token behind it is the background
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    return r;
  };
  // the context's state, readable from outside (tests): none, live, parked, lost
  const say = () => { host.dataset.gl = !renderer ? "none" : parked ? "parked" : glLost ? "lost" : "live"; };
  const onLost = () => { glLost = true; lostAt = performance.now(); labels.style.opacity = "0"; say(); };
  const onRestored = () => { glLost = false; labels.style.opacity = ""; say(); resize(); if (view) update(view); dirty = true; };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);
  // a live context to draw with, or null: made on first use near the screen; asked for again when lost on screen
  const gl = (): THREE.WebGLRenderer | null => {
    if (!near) return null;
    if (!renderer) { renderer = mkRenderer(); glLost = false; say(); resize(); }
    if (parked) { parked = false; say(); renderer.forceContextRestore(); return null; }
    if (glLost) { if (performance.now() - lostAt > RESTORE_AFTER) { lostAt = performance.now(); renderer.forceContextRestore(); } return null; }
    return renderer;
  };
  const park = () => { if (renderer && !parked && !glLost) { parked = true; renderer.forceContextLoss(); say(); } };
  say();
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
    const names = ["surface", "surface-2", "surface-3", "line", "line-2", "ink", "muted", "faint", "acc", "acc-soft", "acc-softer", "good", "good-soft", "warn", "warn-soft", "hot", "hot-soft", "bad", "meter", "meter-track", ...[1, 2, 3, 4, 5, 6, 7, 8].flatMap((k) => [`c${k}`, `c${k}-soft`, `c${k}-plane`]), "scn-edge", "scn-frame-edge", "scn-acc-edge", "scn-good-edge", "scn-warn-edge", "scn-hot-edge", "scn-muted-edge"];
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
    const line = t === "acc" ? C["scn-acc-edge"] : t === "good" ? C["scn-good-edge"] : t === "warn" ? C["scn-warn-edge"] : t === "hot" ? C["scn-hot-edge"] : t === "muted" ? C["scn-muted-edge"] : C[container ? "scn-frame-edge" : "scn-edge"]; // the measured palette: 3:1 edges
    return { fill, line, side: fill.clone().lerp(line, 0.38) };
  };

  // ---------------------------------------------------------------- one object per entity, reused between steps
  // sock (format version 10): a lifted thing's old place, a thin outline on the floor it rose from
  type Obj = { g: THREE.Group; body: THREE.Mesh | null; extra: THREE.Mesh[]; edge: THREE.LineSegments | null; ring: THREE.LineLoop; x: THREE.LineSegments; sock: THREE.LineLoop; mats: THREE.Material[]; label: HTMLDivElement; kind: string; seen: boolean; meter?: Meter };
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
    } else if (k === "circle" || k === "cylinder" || k === "dot" || k === "initial" || k === "final") {
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
    const sock = new THREE.LineLoop(ring.geometry.clone(), lineMat());
    sock.visible = false;
    mats.push(ring.material as THREE.Material, x.material as THREE.Material, sock.material as THREE.Material);
    g.add(ring, x, sock);
    root.add(g);
    const label = document.createElement("div");
    labels.append(label);
    return { g, body, extra, edge, ring, x, sock, mats, label, kind: k, seen: true };
  };
  const dropObj = (k: number, o: Obj) => { if (o.meter) dropMeter(o.meter); root.remove(o.g); o.mats.forEach((m) => m.dispose()); o.ring.geometry.dispose(); o.x.geometry.dispose(); o.sock.geometry.dispose(); o.label.remove(); objs.delete(k); };

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
  // pts, ends, on (item 8, fix): points along the line, the keys it joins and how strongly it shows, so a name at rest can keep off it
  type Wire = { mesh: THREE.Mesh; heads: THREE.Mesh[]; mat: THREE.MeshBasicMaterial; sig: string; label: HTMLDivElement | null; mid: THREE.Vector3; paper?: THREE.MeshBasicMaterial; tags?: { el: HTMLDivElement; at: THREE.Vector3 }[]; pts?: THREE.Vector3[]; ends?: [number, number]; on?: number };
  const wires = new Map<string, Wire>();
  // drops: a stream's dots, moved each frame along curves
  const tokens: { mesh: THREE.Mesh; label: HTMLDivElement; arrow: THREE.Group; head: THREE.Mesh; arrowMat: THREE.MeshBasicMaterial; sig: string; drops: THREE.Mesh[]; curves: THREE.Curve<THREE.Vector3>[] }[] = [];
  const bubbles: HTMLDivElement[] = [];

  // ---------------------------------------------------------------- the camera: the story's, unless the reader moved it
  const camNow = { tx: 0, ty: 0, tz: 0, az: -0.5, el: 0.62, dist: 900 };
  let goal = { ...camNow };
  let user = false, userFocus: number | null = null, lastStep = "", first = true, lastScene: string | null = null;
  let view: View3 | null = null;
  let dirty = true;
  const W = { w: 1, h: 1 };
  // the highest point on the stage: the top plane, or the top of the highest thing; the camera stays above it
  // format version 9 (site/src/cam3d.ts): the layers above the one the camera looks into fade (peelK of them, from the
  // top; peelO: each layer's fade, eased), and the camera stays above what is still shown: it tilts up, then backs off
  let peelK = 0, storyL: number | null = null, userL: number | null = null;
  const peelO: number[] = [];
  const topY = () => {
    let y = view && peelK > 0 ? floorY(peelK, gap(view)) : 0;
    // under the story's camera a token on its way does not push it up and let it down again
    if (!user && rests.length) for (const r of rests) for (const [k, p] of r.pos) { if ((r.posL.get(k) ?? 0) > peelK - 0.5) y = Math.max(y, p.top); }
    else for (const [k, p] of pos) if ((posL.get(k) ?? 0) > peelK - 0.5) y = Math.max(y, p.top);
    return y;
  };
  // (format version 11) where the held view's things rest, step by step: the story's camera reads these, never a tween
  type Rest = { items: Item3[]; pos: Map<number, { c: THREE.Vector3; half: THREE.Vector3; top: number }>; posL: Map<number, number> };
  let rests: Rest[] = [];
  const restsOf = (v: View3): Rest[] => {
    if (!v.hold) return [];
    const g = gap({ ...v, spread: v.hold.spread }), X0 = cx(), Z0 = cz();
    return v.hold.frames.map((raw) => {
      const items = flatNest({ ...v, items: raw, spread: v.hold!.spread }).items, by = new Map(items.map((i) => [i.key, i]));
      const out: Rest = { items, pos: new Map(), posL: new Map() };
      for (const it of items) {
        if (it.kind === "layer") continue;
        let up = 0;
        for (let x: Item3 | undefined = it, n = 0; x && n < 64; x = x.parent != null ? by.get(x.parent) : undefined, n++) up += x.lift ?? 0;
        const hgt = heightOf(it), y = baseOf(it, by, g) + (it.nest ?? 0) * NEST_LIFT * v.hold!.spread + up * LIFT_UP + (it.kind === "token" ? 14 : 0);
        const half = new THREE.Vector3(it.w / 2, Math.max(hgt, 8) / 2, (it.kind === "pill" ? Math.min(it.h, 26) : it.h) / 2);
        out.pos.set(it.key, { c: new THREE.Vector3(it.x + it.w / 2 - X0, y + half.y, it.y + it.h / 2 - Z0), half, top: y + Math.max(hgt, it.kind === "person" ? 34 : it.kind === "pointer" ? 32 : 0) });
        out.posL.set(it.key, it.L);
      }
      return out;
    });
  };
  const planeRects = (): PlaneRect[] => {
    if (!view) return [];
    const v = view, g = gap(v);
    return v.layers.map((_, L) => ({ top: floorY(L, g), x0: -v.foot.w / 2 - 20, x1: v.foot.w / 2 + 20, z0: -v.foot.h / 2 - 20, z1: v.foot.h / 2 + 20 }));
  };
  const blocks = (): Block[] => {
    const out: Block[] = [];
    if (view) for (const it of view.items) { const p = pos.get(it.key); if (p && !it.container && (lift.get(it.key) ?? 1) > 0.3) out.push({ min: { x: p.c.x - p.half.x, y: p.c.y - p.half.y, z: p.c.z - p.half.z }, max: { x: p.c.x + p.half.x, y: p.c.y + p.half.y, z: p.c.z + p.half.z } }); }
    return out;
  };
  // which layers fade: none when the reader picked a whole layer (focus fades the rest already) or looks at everything
  const repeel = () => {
    const tL = userFocus != null ? null : user ? userL ?? storyL : storyL;
    const k = peelFor(goal, { x: goal.tx, y: goal.ty, z: goal.tz }, tL, planeRects());
    if (k !== peelK) { peelK = k; dirty = true; }
  };
  const clampEl = (c: typeof camNow) => { clampCam(c, topY()); outOfBlocks(c, blocks()); };
  const place = () => {
    repeel();
    clampEl(goal); clampEl(camNow);
    // (rfit) the clamp can raise the camera: which layers fade is worked out again for where it really is (the story sets
    // its goal afresh on every draw, so the fade was always reckoned from the unraised camera, and a plane could stand in
    // the line of sight)
    repeel();
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
    renderer?.setSize(r.width, r.height, false);
    cam.aspect = r.width / r.height;
    cam.updateProjectionMatrix();
    dirty = true;
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  // world position of an item (centre of its floor plan, its base height)
  const gap = (v: View3) => gapOf(v.foot, v.spread, W.w < 480);
  const cx = () => view!.foot.x + view!.foot.w / 2, cz = () => view!.foot.y + view!.foot.h / 2;
  const lift = new Map<number, number>();
  // a thing stands on its layer's plane; a thing inside a container on the same layer stands on the container's slab (geo3d.ts)
  const baseY = (it: Item3, byKey: Map<number, Item3>) => baseOf(it, byKey, gap(view!));
  // where things are, for camera and connectors
  const pos = new Map<number, { c: THREE.Vector3; half: THREE.Vector3; top: number }>();
  const posL = new Map<number, number>();

  const fitBox = (pts: { c: THREE.Vector3; half: THREE.Vector3 }[], el: number, az: number, M = 0.84) => {
    const b = new THREE.Box3();
    for (const p of pts) { b.expandByPoint(p.c.clone().sub(p.half)); b.expandByPoint(p.c.clone().add(p.half)); }
    if (b.isEmpty()) b.set(new THREE.Vector3(-100, -20, -100), new THREE.Vector3(100, 20, 100));
    const c = b.getCenter(new THREE.Vector3());
    const tv = Math.tan((cam.fov * Math.PI) / 360), th = tv * (Math.max(120, W.w) / W.h);
    const back = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    const right = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az)), up = new THREE.Vector3().crossVectors(back, right);
    // format version 10 (fix): the corners of each thing, not of the box around them all (turned, that box's corners
    // stand far outside the things, and a scene filled a third of the stage); the view is centred on them across and
    // up, then backed off to the nearest distance at which every corner fits, with a margin for labels
    const corners: THREE.Vector3[] = [];
    for (const p of pts.length ? pts : [{ c, half: b.getSize(new THREE.Vector3()).multiplyScalar(0.5) }]) for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) corners.push(new THREE.Vector3(p.c.x + sx * p.half.x, p.c.y + sy * p.half.y, p.c.z + sz * p.half.z));
    let r0 = Infinity, r1 = -Infinity, u0 = Infinity, u1 = -Infinity;
    for (const q of corners) { const p = q.clone().sub(c); const r = p.dot(right), u = p.dot(up); r0 = Math.min(r0, r); r1 = Math.max(r1, r); u0 = Math.min(u0, u); u1 = Math.max(u1, u); }
    c.addScaledVector(right, (r0 + r1) / 2).addScaledVector(up, (u0 + u1) / 2);
    const need = () => { let d = 120; for (const q of corners) { const p = q.clone().sub(c); const k = p.dot(back); d = Math.max(d, k + Math.abs(p.dot(right)) / (M * th), k + Math.abs(p.dot(up)) / (M * tv)); } return d; };
    let dist = need();
    // close up, the near side draws bigger: centre again on what the camera sees from there (perspective), twice
    for (let n = 0; n < 2; n++) {
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const q of corners) { const p = q.clone().sub(c); const z = Math.max(1, dist - p.dot(back)); const sx = p.dot(right) / z, sy = p.dot(up) / z; a0 = Math.min(a0, sx); a1 = Math.max(a1, sx); b0 = Math.min(b0, sy); b1 = Math.max(b1, sy); }
      c.addScaledVector(right, ((a0 + a1) / 2) * dist).addScaledVector(up, ((b0 + b1) / 2) * dist);
      dist = need();
    }
    return { tx: c.x, ty: c.y, tz: c.z, az, el, dist };
  };
  const storyGoal = () => {
    if (!view) return goal;
    const v = view;
    // (format version 11) one held view from a camera word to the next: the view is worked out from where the things of
    // every step that shares it rest, so it does not move between those steps (core/calm.ts heldViews)
    const R: Rest[] = rests.length ? rests : [{ items: v.items, pos, posL }];
    const ptsOf = (k: number) => R.map((r) => r.pos.get(k)).filter(Boolean) as { c: THREE.Vector3; half: THREE.Vector3; top: number }[];
    const layerOf = (keys: number[]) => R.flatMap((r) => keys.map((k) => r.posL.get(k))).filter((x): x is number => x != null);
    const all = R.flatMap((r) => [...r.pos.entries()]);
    // (format version 10, fix-edge) a thing dimmed by a highlight is still on the stage: it counts (before, under 0.3 it
    // was left out, the whole view slid to what the step lights and cut the rest, and the scene jumped between steps)
    const visible = R.flatMap((r) => r.items.filter((i) => i.o > 0.05).map((i) => r.pos.get(i.key)).filter(Boolean) as { c: THREE.Vector3; half: THREE.Vector3; top: number }[]);
    // what the step touches, with room above it for its words (its label, a chip, speech): 34 units up
    // (fix) the box moves up half of it and grows half of it: 34 more on top, not 68 (a close-up of one thing sat low,
    // under an empty half stage)
    const up = new THREE.Vector3(0, 17, 0);
    const touchKeys = rests.length ? v.hold!.touched : v.touched;
    const touched = (touchKeys.flatMap(ptsOf) as { c: THREE.Vector3; half: THREE.Vector3 }[]).map((p) => ({ c: p.c.clone().add(up), half: p.half.clone().add(up) }));
    // format version 9: turn= and tilt= set the angle, close fills the stage with what it frames, far pulls back; the
    // layer the story looks into (a focus, or the highest layer of what it frames) lets the layers above it fade
    const cw = v.cam ?? null, far = (g: ReturnType<typeof fitBox>) => (cw?.far ? { ...g, dist: g.dist * FAR } : g);
    storyL = null;
    // (rfit) a view cut to what the step touches slides to keep within the scene: no empty band on one side while the
    // other is cut (site/src/fit3d.ts)
    const sceneBoxes = [...(visible.length ? visible : all.map(([, p]) => p)), ...v.layers.flatMap((_, L) => layerPts(L))];
    const inScene = (lg: { goal: ReturnType<typeof fitBox>; cut: boolean }) => (lg.cut ? keepInScene(lg.goal, cam.fov, W.w, W.h, sceneBoxes, touched) : lg.goal);
    if (v.look?.length) {
      // format version 10: what a framed thing holds and shows comes too (on a declared layer it stands on a lower plane,
      // outside the thing's own box): a zoom into a pod frames its containers below it
      const lk = new Set(v.look);
      const s = R.flatMap((r) => {
        const byK = new Map(r.items.map((i) => [i.key, i]));
        const under = (it: Item3) => { for (let x = it.parent != null ? byK.get(it.parent) : undefined, n = 0; x && n < 64; x = x.parent != null ? byK.get(x.parent) : undefined, n++) if (lk.has(x.key)) return true; return false; };
        return [...v.look!.map((k) => r.pos.get(k)), ...r.items.filter((it) => it.o > 0.3 && !it.container && under(it)).map((it) => r.pos.get(it.key))].filter(Boolean) as any[];
      });
      if (s.length) {
        const Ls = layerOf(v.look);
        storyL = Ls.length ? Math.round(Math.min(...Ls)) : null;
        // (format version 10, fix-edge) a scene with no layers keeps its flat angle when the author frames part of it, so it
        // does not swing between steps (it took -0.35, 0.7 here and -0.15, flat in the whole view)
        const a = !v.layers.length ? angleOf(cw, -0.15, FLAT_TILT) : angleOf(cw, -0.35, 0.7);
        const M = cw?.close ? CLOSE_FILL : 0.84;
        // on a phone, under the least scale: what the step touches (site/src/least3d.ts)
        return inScene(leastGoal(far(fitBox([...s, ...touched], a.el, a.az, M)), touched.length ? far(fitBox(touched, a.el, a.az, M)) : null, W.w, W.h, cam.fov, v.least ?? 0));
      }
    }
    // a focused layer is seen from nearly in front (a long plane seen from a slant looks tipped over)
    if (v.focus != null) { storyL = v.focus; const a = angleOf(cw, -0.15, 0.85); return inScene(leastGoal(far(fitBox([...layerPts(v.focus), ...touched], a.el, a.az)), touched.length ? far(fitBox(touched, a.el, a.az)) : null, W.w, W.h, cam.fov, v.least ?? 0)); }
    // everything on the stage, and the layer planes (they are wider than what stands on them)
    const planesPts = v.layers.flatMap((_, L) => layerPts(L));
    // a scene with no layers (a 2D scene opened in 3D) is seen from nearly in front, as in 2D, so it fills the stage
    const a = angleOf(cw, !v.layers.length ? -0.15 : -0.5, !v.layers.length ? FLAT_TILT : v.spread > 0.5 ? 0.5 : 0.62);
    const whole = far(fitBox([...(visible.length ? visible : all.map(([, p]) => p)), ...planesPts, ...touched], a.el, a.az));
    // format version 10 (site/src/least3d.ts): on a phone, a whole view under the least scale frames what the step
    // touches instead, at that size, looking into its highest layer (the layers above it fade)
    const lg = leastGoal(whole, touched.length ? far(fitBox(touched, a.el, a.az)) : null, W.w, W.h, cam.fov, v.least ?? 0);
    if (lg.cut) { const Ls = layerOf(touchKeys); storyL = Ls.length ? Math.round(Math.min(...Ls)) : null; }
    return inScene(lg);
  };
  const layerPts = (L: number) => {
    const v = view!, y = -L * gap(v);
    return [{ c: new THREE.Vector3(0, y + 8, 0), half: new THREE.Vector3(v.foot.w / 2 + 10, 12, v.foot.h / 2 + 10) }];
  };

  // ---------------------------------------------------------------- update: lay out this moment of the story
  const update = (v: View3) => {
    v = flatNest(v);
    // format version 10: another scene inside the scene: the layers it peeled away belong to the scene it left
    const newScene = (v.scene ?? "") !== (lastScene ?? "");
    if (newScene) { peelO.length = 0; peelK = 0; }
    view = v;
    touchedKeys = new Set([...v.touched, ...v.hl.keys()]);
    partSet = v.part ? new Set(v.part) : null;
    tokSet = v.toks ? new Set(v.toks) : null;
    host.dataset.part = v.part ? v.part.join(",") : "all";
    syncPlanes(v.layers.length);
    const byKey = new Map(v.items.map((i) => [i.key, i]));
    for (const o of objs.values()) o.seen = false;
    pos.clear(); posL.clear();
    const X0 = cx(), Z0 = cz();
    const focusOn = userFocus ?? null;
    // format version 10: how far each thing is raised: its own lift, plus that of what holds it (it rises with it;
    // lifts nest, so a pod lifted out of a lifted node rises above it)
    const raised = (it: Item3) => { let m = 0; for (let x: Item3 | undefined = it, n = 0; x && n < 64; x = x.parent != null ? byKey.get(x.parent) : undefined, n++) m += x.lift ?? 0; return m; };
    for (const it of v.items) {
      if (it.kind === "layer") continue;
      let o = objs.get(it.key);
      if (o && o.kind !== it.kind) { dropObj(it.key, o); o = undefined; }
      if (!o) { o = mkObj(it); objs.set(it.key, o); }
      o.seen = true;
      const hgt = heightOf(it);
      // nested scenes with no declared layers: split layers lifts each nesting level above its container
      const up = raised(it) * LIFT_UP;
      // (format version 11) a thing that moves to another parent or floor rises along its way: its slab count is eased by the 2D
      // side from where it starts to where it ends (a count read from the tween dropped a slab half way: a hop)
      const floor = it.slab != null ? floorY(it.L, gap(view!)) + it.slab * (SLAB + 1) : baseY(it, byKey);
      const by = floor + (it.nest ?? 0) * NEST_LIFT * v.spread + up;
      const x = it.x + it.w / 2 - X0, z = it.y + it.h / 2 - Z0;
      const hlt = v.hl.get(it.key), sel = v.sel === it.key;
      // a highlight lifts a thing a little; a lit container lifts what stands on it too (format version 9: before, its
      // slab rose over the feet of what it holds)
      let pop = hlt ? 6 : 0;
      for (let p = it.parent != null ? byKey.get(it.parent) : undefined, g = 0; p && !pop && g < 64; p = p.parent != null ? byKey.get(p.parent) : undefined, g++) if (Math.abs(p.L - it.L) < 0.5 && v.hl.has(p.key)) pop = 6;
      o.g.position.set(x, by + pop, z);
      const off = (focusOn != null && Math.abs(it.L - focusOn) > 0.5 ? FOCUS_OFF : 1) * (peelO[Math.round(it.L)] ?? 1);
      const gh = it.faint ?? 1, op = it.o * off * (it.dim ? 0.5 : 1) * gh;
      const order = (v.layers.length + 1 - it.L) * 100 + (it.container ? 10 + it.depth : 60);
      for (const x of [o.body, o.edge, ...o.extra]) if (x) x.renderOrder = order;
      o.ring.renderOrder = order + 1; o.x.renderOrder = order + 2;
      const t = tone(it.tone, it.container, it.depth, it.cc, it.fill === "none" || (!!it.cc && it.pcc === it.cc));
      const k = it.kind;
      if (o.body) {
        if (k === "initial" || k === "final") o.body.scale.set(it.w, hgt, it.h);
        else if (k === "circle" || k === "dot") { const d = k === "dot" ? 14 : Math.min(it.w, it.h); o.body.scale.set(d, hgt, d); }
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
      if (o.ring.visible) { const fw = o.body && (k === "cylinder" || k === "cloud" || k === "circle") ? o.body.scale.x : it.w, fd = o.body && (k === "cylinder" || k === "cloud" || k === "circle") ? o.body.scale.z : k === "pill" ? Math.min(it.h, 26) : it.h; o.ring.scale.set(fw + 8, 1, fd + 8); o.ring.position.y = 1; rm.color.copy(hlt ? toneLine(hlt) : C.acc); rm.opacity = op; rm.dashSize = sel && !hlt ? 0.04 : 10; rm.gapSize = sel && !hlt ? 0.03 : 0; }
      // a lifted thing's old place: a thin outline on the floor it rose from, so the reader sees where it goes back
      o.sock.visible = (it.lift ?? 0) > 0.02;
      if (o.sock.visible) { o.sock.scale.set(it.w + 4, 1, (k === "pill" ? Math.min(it.h, 26) : it.h) + 4); o.sock.position.y = -(it.lift ?? 0) * LIFT_UP - pop + 1; const sm = o.sock.material as THREE.LineBasicMaterial; sm.color.copy(C["line-2"]); sm.opacity = it.o * (it.lift ?? 0); }
      // format version 10: a meter (level=) lies on the top face along the front edge (site/src/meter3d.ts)
      if (it.lv != null && k !== "layer") {
        if (!o.meter) { o.meter = mkMeter(); o.g.add(o.meter.g); }
        const fd = k === "pill" ? Math.min(it.h, 26) : it.h, zt = (DESIGN as any)[it.size] ?? DESIGN.m;
        placeMeter(o.meter, { w: it.w, d: fd, top: hgt, inX: it.container ? zt.pad : Math.max(8, zt.px - 4), lv: it.lv, op, order, track: C["meter-track"], fill: C.meter });
      } else if (o.meter) { dropMeter(o.meter); o.meter = undefined; }
      o.x.visible = it.down;
      if (it.down) { o.x.scale.set(it.w, 1, it.h); o.x.position.y = hgt + 0.6; const xm = o.x.material as THREE.LineBasicMaterial; xm.color.copy(C.bad); xm.opacity = it.o * off; }
      const half = new THREE.Vector3(it.w / 2, Math.max(hgt, 8) / 2, (k === "pill" ? Math.min(it.h, 26) : it.h) / 2);
      pos.set(it.key, { c: new THREE.Vector3(x, by + pop + half.y, z), half, top: by + pop + Math.max(hgt, k === "person" ? 34 : k === "pointer" ? 32 : 0) });
      posL.set(it.key, it.L);
      // its label: on a container's back-left corner, else above its top
      const lb = o.label;
      lb.className = `scn3-l k-${k} sz-${it.size}${it.cc && it.tone === "plain" ? ` cc cc-${it.cc}` : ""}${it.container ? " is-cont" : ""} tone-${it.tone}${it.down ? " is-down" : ""}${hlt ? " is-hl" : ""}${sel ? " is-sel" : ""}`;
      const words = k === "token" ? cut(it.label || "", CHIP.font, CHIP.maxW) : it.label || "";
      if (lb.textContent !== words) lb.textContent = words;
      if (!it.container) lb.style.maxWidth = `${(DESIGN as any)[it.size]?.maxW ?? 160}px`;
      lb.dataset.o = String(gh < 1 ? op * Math.max(0, (gh - FAINT) / (1 - FAINT)) / gh : op); lb.dataset.k = String(it.key);
      lift.set(it.key, op / gh); // a connector into a closed thing stays as strong as the thing's outside
    }
    for (const [k, o] of objs) if (!o.seen) dropObj(k, o);
    // the layer planes
    const g = gap(v);
    planes.forEach((p, L) => {
      const l = v.layers[L];
      const off = (focusOn != null && L !== focusOn ? FOCUS_OFF : 1) * (peelO[L] ?? 1);
      // (format version 11) in the author's zoom the layer plane, wider than what is zoomed into, stood cut at the stage's
      // edges: in a zoom every thing is whole or left out, the plane and its name included
      const story = (v.focus != null && L !== v.focus ? FOCUS_OFF : 1) * (v.fade ?? 1) * (v.look?.length ? 0 : 1);
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
      // a wire to a faded thing fades further (format version 9): up close it read as a stray bar across the stage
      const opac = e.o * Math.pow(Math.min(lift.get(e.from) ?? 1, lift.get(e.to) ?? 1), 1.6);
      seen.add(e.key);
      const curve = wireCurve(e.from, e.to, a, b, { implicit: e.implicit, off: 0, bend: e.bend ?? 0, rt: e.rt ?? null }, 0, byKey, X0, Z0);
      const mid = curve.getPoint(0.5);
      const sig = `${curveSig(curve)}|${e.style}${e.ends ? JSON.stringify([e.ends, e.tags]) : ""}`;
      let wv = wires.get(e.key);
      if (!wv) { const mat = basic(); wv = { mesh: new THREE.Mesh(new THREE.BufferGeometry(), mat), heads: [], mat, sig: "", label: null, mid }; root.add(wv.mesh); wires.set(e.key, wv); }
      if (wv.sig !== sig) {
        wv.sig = sig;
        wv.mesh.geometry.dispose();
        wv.mesh.geometry = tube(curve, e.style === "-->", e.implicit ? 0.9 : 1.3);
        for (const h of wv.heads) { root.remove(h); if (h.userData.own) h.geometry.dispose(); }
        for (const tg of wv.tags ?? []) tg.el.remove();
        wv.heads = []; wv.tags = [];
        const head = (at: number, dir: number) => {
          const c = new THREE.Mesh(UNIT_CONE, wv!.mat); c.scale.set(7, 12, 7);
          const p = curve.getPointAt(at), tan = curve.getTangentAt(at).multiplyScalar(dir);
          c.position.copy(p).addScaledVector(tan, -5);
          c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan.normalize());
          root.add(c); wv!.heads.push(c);
        };
        if (e.ends) {
          // format version 11: the author's line ends, and the words near them
          wv.paper ??= basic({ side: THREE.DoubleSide });
          wv.mat.side = THREE.DoubleSide; wv.mat.needsUpdate = true;
          for (const side of ["a", "b"] as const) { const m = markAt(e.style, e.ends, side); if (m) for (const x of endMeshes(curve, side, m, wv.mat, wv.paper)) { root.add(x); wv.heads.push(x); } }
          for (const tg of e.tags ?? []) {
            const tan = curve.getTangentAt(tg.t), across = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
            const el = document.createElement("div"); el.className = "scn3-wire is-end"; el.textContent = tg.text; labels.append(el);
            wv.tags.push({ el, at: curve.getPointAt(tg.t).addScaledVector(across, tg.o).add(new THREE.Vector3(0, 3, 0)) });
          }
        } else {
          if (["->", "-->", "<->"].includes(e.style)) head(1, 1);
          if (e.style === "<->") head(0, -1);
        }
        wv.mid = curve.getPointAt(0.5);
        wv.pts = curve.getSpacedPoints(16);
      }
      wv.ends = [e.from, e.to]; wv.on = opac;
      wv.mat.color.copy(e.cc ? C[`c${e.cc}`] : e.implicit ? C["line-2"] : C.muted); wv.mat.opacity = opac;
      if (wv.paper) { wv.paper.color.copy(C["surface-2"]); wv.paper.opacity = opac; }
      for (const tg of wv.tags ?? []) tg.el.dataset.o = String(opac);
      if (e.label) {
        if (!wv.label) { wv.label = document.createElement("div"); wv.label.className = "scn3-wire"; labels.append(wv.label); }
        wv.label.textContent = e.label; wv.label.dataset.o = String(opac);
      } else if (wv.label) { wv.label.remove(); wv.label = null; }
    }
    for (const [k, wv] of wires) if (!seen.has(k)) { root.remove(wv.mesh, ...wv.heads); wv.mesh.geometry.dispose(); wv.mat.dispose(); wv.label?.remove(); for (const h of wv.heads) if (h.userData.own) h.geometry.dispose(); for (const tg of wv.tags ?? []) tg.el.remove(); wv.paper?.dispose(); wires.delete(k); }
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
      // each hop: on one layer, the 2D line (beside its connector when it runs along one); else the curve between layers
      const curves = ps.slice(1).map((b, k) => { const off = arrowOn && (conns.has(`${s.path[k]}>${s.path[k + 1]}`) || conns.has(`${s.path[k + 1]}>${s.path[k]}`)) ? 7 : 0; return wireCurve(s.path[k], s.path[k + 1], ps[k], b, { implicit: false, off: s.offs?.[k] ?? 0, bend: s.bends?.[k] ?? 0, rt: s.rts?.[k] ?? null }, off, byKey, X0, Z0); });
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
      const sig = curves.map(curveSig).join("|");
      const segs = curves.map((c) => tubeSegs(c, 40));
      if (t.sig !== sig) { t.sig = sig; t.arrow.children.slice().forEach((c) => { t.arrow.remove(c); (c as THREE.Mesh).geometry.dispose(); }); curves.forEach((c, k) => t.arrow.add(new THREE.Mesh(new THREE.TubeGeometry(c, segs[k], 1.7, 6, false), t.arrowMat))); }
      t.arrow.visible = arrowOn && s.p > 0; t.head.visible = arrowOn && s.p > 0;
      t.arrow.children.forEach((c, k) => { const g = (c as THREE.Mesh).geometry as THREE.BufferGeometry; const full = g.index!.count; g.setDrawRange(0, k < seg ? full : k === seg ? Math.floor(Math.min(1, fr) * segs[k]) * 6 * 6 : 0); });
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
    v.says.forEach((s, i) => { const p = pos.get(s.key); const b = bubbles[i]; if (b.dataset.sk !== `${s.key} ${s.text}`) { b.dataset.fresh = "1"; b.dataset.sk = `${s.key} ${s.text}`; setRich(b, s.text); } b.dataset.o = p ? String(s.o) : "0"; if (p) { b.dataset.x = String(p.c.x); b.dataset.y = String(p.top + 18); b.dataset.z = String(p.c.z); } });
    // the story camera moves when the step changes (or on the first draw)
    rests = restsOf(v);
    if (!user) { goal = storyGoal(); if (first) { Object.assign(camNow, goal); first = false; } }
    // format version 10: into or out of a scene inside the scene (site/src/anim-scenes.tsx)
    if (newScene) { if (lastScene != null || v.sceneDir) sceneJump(v); lastScene = v.scene ?? ""; }
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
  // a line between two things (format version 10): on one layer it runs on the floor along the 2D line (the router's
  // route, or the old bow for a circle's or a list's line), from the foot of one to the foot of the other; between
  // layers it keeps the curve above (off: beside a connector)
  const wireCurve = (ka: number, kb: number, a: { c: THREE.Vector3; half: THREE.Vector3 }, b: { c: THREE.Vector3; half: THREE.Vector3 }, way: { implicit: boolean; off: number; bend: number; rt: Route | null }, off: number, byKey: Map<number, Item3>, X0: number, Z0: number): THREE.Curve<THREE.Vector3> => {
    const ia = byKey.get(ka), ib = byKey.get(kb);
    if (ia && ib && Math.abs((posL.get(ka) ?? 0) - (posL.get(kb) ?? 0)) < 0.5) return floorCurve(ia, ib, way, footY(a), footY(b), X0, Z0, slabsOn(posL.get(ka) ?? 0, byKey));
    const { P, Q, mid } = curvePts(a, b, off);
    // (item 8, fix) a line to or from a text stops short of it: its words are the thing, and the line ran under them
    const short = (E: THREE.Vector3, it: Item3 | undefined) => { if (it?.kind === "text") E.add(mid.clone().sub(E).setLength(Math.min(TEXT_CLEAR, mid.distanceTo(E) * 0.4))); };
    short(P, ia); short(Q, ib);
    return new THREE.QuadraticBezierCurve3(P, mid, Q);
  };
  // format version 10: the slabs (drawn containers) on a layer, which a floor line climbs over (site/src/route3d.ts)
  const slabsOn = (L: number, byKey: Map<number, Item3>): Slab[] => {
    const out: Slab[] = [];
    for (const it of byKey.values()) { if (!it.container || it.bare || Math.abs(it.L - L) > 0.5 || it.o < 0.05) continue; const p = pos.get(it.key); if (p) out.push({ x0: p.c.x - p.half.x, x1: p.c.x + p.half.x, z0: p.c.z - p.half.z, z1: p.c.z + p.half.z, top: p.top }); }
    return out;
  };
  const toneLine = (t: string) => (t === "good" ? C.good : t === "warn" ? C.warn : t === "hot" ? C.hot : t === "muted" ? C["line-2"] : C.acc);

  // ---------------------------------------------------------------- draw: move the camera towards its goal, project the labels
  const v3 = new THREE.Vector3();
  // keepIn: a layer's name chip stays inside the stage (it hangs to the left of its anchor)
  // rowY (format version 10, fix): the y a layer's name takes when its plane is past the stage's top or bottom
  // at (fix): a layer name's spot on the screen, on the part of its plane that shows (least3d.ts planeAnchor)
  const project = (el: HTMLElement, x: number, y: number, z: number, o: number, keepIn = false, rowY?: number, at?: P2 | null) => {
    v3.set(x, y, z).project(cam);
    const behind = !at && v3.z > 1;
    let sx = (v3.x * 0.5 + 0.5) * W.w, sy = (-v3.y * 0.5 + 0.5) * W.h;
    if (at) { sx = at.x; sy = at.y; }
    if (keepIn) { sx = Math.min(W.w - 60, Math.max(sx, el.offsetWidth + 6)); sy = rowY ?? Math.min(W.h - 34, Math.max(16, sy)); }
    else if (sx >= 0 && sx <= W.w) sx = inX(el, sx); // (rfit) a word whose spot is on the stage is not cut at its side
    const show = !behind && o > 0.04 && sx > -60 && sx < W.w + 60 && sy > -30 && sy < W.h + 30;
    el.style.opacity = show ? String(Math.min(1, o)) : "0";
    el.style.visibility = show ? "visible" : "hidden";
    if (show) { el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`; el.style.zIndex = String(Math.round((1 - v3.z) * 1e5)); placed.push({ el, sx, sy }); }
    // where its anchor projects, before any step aside (tests compare a moving chip with its token frame by frame)
    el.dataset.ax = sx.toFixed(1); el.dataset.ay = sy.toFixed(1);
    // hidden: when it shows again it is placed afresh (a new step's token starts somewhere else)
    if (!show) { const st = slot.get(el); if (st) st.fresh = true; const nt = nslot.get(el); if (nt) nt.fresh = true; }
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
  // (rfit) the x that keeps a word wholly across the stage (2 px in), its anchor as anchorOf; a word wider than the stage keeps its x
  const inX = (el: HTMLElement, sx: number) => { const w = el.offsetWidth, x0 = sx + anchorOf(el)[0] * w; return w > W.w - 4 ? sx : x0 < 2 ? sx + 2 - x0 : x0 + w > W.w - 2 ? sx - (x0 + w - W.w + 2) : sx; };
  const acrossOk = (r: { x: number; w: number }) => r.x >= 2 && r.x + r.w <= W.w - 2;
  let lineSegs: { ends: [number, number]; p: P2[] }[] = [];
  const unclutter = () => {
    const rect = (p: { el: HTMLElement; sx: number; sy: number }, dy = 0, dx = 0) => { const [ax, ay] = anchorOf(p.el), w = p.el.offsetWidth, h = p.el.offsetHeight; return { x: p.sx + dx + ax * w, y: p.sy + dy + ay * h, w, h }; };
    const small = (el: HTMLElement) => el.classList.contains("scn3-wire") || el.classList.contains("scn3-arrow") || el.classList.contains("scn3-send") || el.classList.contains("scn3-say") || el.classList.contains("k-token");
    const cont = (el: HTMLElement) => el.classList.contains("is-cont");
    const hits = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
    // format version 9: names never pile on each other. Layer names first, then the names of what the step touches or
    // lights, then the nearest: each takes its own spot if it is free, else moves a little (up, down, aside), else fades
    // to a ghost (a reader zooms in to read it). Like the chips, a name keeps its spot and fade while anything moves,
    // and eases to a new one at rest, so nothing flickers
    const fixed: { x: number; y: number; w: number; h: number }[] = [];
    const big = placed.filter((p) => !small(p.el) && !cont(p.el));
    // the layer in focus first; other layer names after what the step touches, and they may fade too
    const pri = (el: HTMLElement) => (el.classList.contains("scn3-layer") ? (el.classList.contains("is-on") ? 0 : 1.5) : el.classList.contains("is-hl") || el.classList.contains("is-sel") || touchedKeys.has(+(el.dataset.k ?? -1)) ? 1 : 2);
    big.sort((a, b) => pri(a.el) - pri(b.el) || +b.el.style.zIndex - +a.el.style.zIndex);
    for (const p of big) {
      const w = p.el.offsetWidth, h = p.el.offsetHeight;
      const tries: [number, number][] = [[0, 0], [0, -0.6 * h], [0, 0.6 * h], [-0.3 * w, 0], [0.3 * w, 0], [0, -h], [0, h]];
      // (item 8, fix) a name keeps off the lines that do not end at its own thing, when a spot like that is free
      const own = +(p.el.dataset.k ?? NaN);
      const offLines = (r: { x: number; y: number; w: number; h: number }) => !lineSegs.some((s) => !s.ends.includes(own) && lineHitsRect(s.p, r));
      const st = held(p, () => {
        // (a line through a name's middle needs a wider step aside than a word does)
        for (const [dx, dy] of [...tries, [-0.62 * w, 0], [0.62 * w, 0], [0, -1.6 * h], [0, 1.6 * h]] as [number, number][]) { const r = rect(p, dy, dx); if (!fixed.some((f) => hits(r, f)) && offLines(r) && acrossOk(r)) return [dx, dy, 1]; }
        for (const [dx, dy] of tries) if (!fixed.some((r) => hits(rect(p, dy, dx), r))) return [dx, dy, 1];
        return [0, 0, pri(p.el) <= 1 ? 1 : GHOST];
      });
      if (st.dx || st.dy) p.el.style.transform = `translate(${(p.sx + st.dx).toFixed(1)}px, ${(p.sy + st.dy).toFixed(1)}px)`;
      if (st.o < 0.999) p.el.style.opacity = String(+p.el.style.opacity * st.o);
      if (st.o > 0.5) fixed.push(rect(p, st.dy, st.dx));
    }
    // a container's name keeps a clear gap (10 px) from the words of what it holds, so it never reads as one phrase
    // with them ("lift Ana"): it moves left along its edge first, then up above its outline
    const near = (a: { x: number; y: number; w: number; h: number }, b: typeof a, m: number) => a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;
    for (const p of placed.filter((q) => cont(q.el))) {
      const h = p.el.offsetHeight + 2;
      // a clear gap if there is one within two lines; else simply off every word; else a ghost (format version 9)
      const st = held(p, () => {
        for (const across of [true, false]) for (const [m, dys] of [[10, [0, -h, -2 * h]], [1, [0, -h, -2 * h, -3 * h]]] as [number, number[]][]) for (const dy of dys) for (const dx of [0, -16, -32, -48]) { const r = rect(p, dy, dx); if (!fixed.some((f) => near(r, f, m)) && (!across || acrossOk(r))) return [dx, dy, 1]; }
        return [0, 0, GHOST];
      });
      if (st.dx || st.dy) p.el.style.transform = `translate(${(p.sx + st.dx).toFixed(1)}px, ${(p.sy + st.dy).toFixed(1)}px)`;
      if (st.o < 0.999) p.el.style.opacity = String(+p.el.style.opacity * st.o);
      if (st.o > 0.5) fixed.push(rect(p, st.dy, st.dx));
    }
    // format version 9: a small label that moves (a token's chip on its way, or any label while the camera glides)
    // keeps the step aside it had when the move began, so it travels with its token in the same frame and never jumps
    // between spots; at rest it eases to the best free spot. Labels at rest are placed first, against each other only,
    // so a chip passing by does not push them about either
    const sm = placed.filter((q) => small(q.el)).map((p) => {
      // a reused speech bubble with a new text is placed afresh, at once (it kept the last text's spot, then slid)
      const st = (p.el.dataset.fresh ? undefined : slot.get(p.el)) ?? { dy: 0, dx: 0, sx: p.sx, sy: p.sy, fresh: true, still: 0 };
      delete p.el.dataset.fresh;
      // it counts as moving until it has stood still for STILL frames (a move can pause for a frame between ticks)
      st.still = !st.fresh && Math.hypot(p.sx - st.sx, p.sy - st.sy) > 0.3 ? 0 : st.still + 1;
      // a speech bubble that is still fading in finds its spot as it appears (it held a spot, then slid once shown)
      const appearing = p.el.classList.contains("scn3-say") && parseFloat(p.el.style.opacity || "1") < 0.98;
      const moving = !st.fresh && !appearing && st.still < STILL;
      if (moving) dirty = true;
      st.sx = p.sx; st.sy = p.sy;
      slot.set(p.el, st);
      return { p, st, moving };
    });
    // speech first: what a thing says keeps the spot it appeared in, and a chip at rest steps aside for it
    const sayFirst = (q: { p: { el: HTMLElement } }) => (q.p.el.classList.contains("scn3-say") ? 0 : 1);
    for (const { p, st, moving } of [...sm.filter((q) => !q.moving).sort((x, y) => sayFirst(x) - sayFirst(y)), ...sm.filter((q) => q.moving)]) {
      const h = p.el.offsetHeight + 3;
      // (fix) a chip at rest keeps 3 px from every word; one on its way only must not cover one
      const gapR = (r: { x: number; y: number; w: number; h: number }, m: number) => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });
      const free = (dy: number, dx = st.dx) => !fixed.some((f) => hits(gapR(rect(p, dy, dx), moving ? 0 : 3), f));
      if (!moving) {
        // above or below first; format version 10: when every one of those is taken (three chips and a name at one
        // thing), beside, half its width and a little more to the right or the left
        const sw = p.el.offsetWidth * 0.6 + 4;
        let best: [number, number] = [0, 0];
        const tries: [number, number][] = [...[0, -h, h, -2 * h, 2 * h, -3 * h, 3 * h].map((dy): [number, number] => [dy, 0]), ...[0, -h, h, -2 * h, 2 * h].flatMap((dy): [number, number][] => [[dy, sw], [dy, -sw]])];
        for (const [dy, dx] of tries) if (free(dy, dx)) { best = [dy, dx]; break; }
        // the first placing is at once; a later one eases there (a third of the way each frame)
        const ez = (a: number, b: number) => (st.fresh || Math.abs(b - a) < 0.5 ? b : a + (b - a) / 3);
        st.dy = ez(st.dy, best[0]); st.dx = ez(st.dx, best[1]);
        if (Math.abs(best[0] - st.dy) >= 0.5 || Math.abs(best[1] - st.dx) >= 0.5) dirty = true;
      } else if (!free(st.dy)) {
        // format version 10: a moving chip keeps its step aside while it is clear; when it would cover a word or another
        // chip (three pieces of a split leave one spot together), it eases to the nearest clear spot, a third of the way
        // each frame, so it never jumps
        const best = [st.dy, st.dy - h, st.dy + h, st.dy - 2 * h, st.dy + 2 * h].find(free);
        if (best != null) { st.dy = Math.abs(best - st.dy) < 0.5 ? best : st.dy + (best - st.dy) / 3; dirty = true; }
      }
      st.fresh = false;
      if (st.dy || st.dx) p.el.style.transform = `translate(${(p.sx + st.dx).toFixed(1)}px, ${(p.sy + st.dy).toFixed(1)}px)`;
      // small labels stay above the names of things, in a fixed order, so two never swap in front of each other
      p.el.style.zIndex = String(2e5 + (moving ? 1 : 0));
      fixed.push(rect(p, st.dy, st.dx));
    }
    placed = [];
  };
  // each small label's step aside (dy) and where its anchor was last frame
  const slot = new WeakMap<HTMLElement, { dy: number; dx: number; sx: number; sy: number; fresh: boolean; still: number }>();
  const STILL = 10;
  // a name's spot and fade (format version 9): worked out at once the first time, held while its anchor moves, eased
  // to a new one when it has stood still for STILL frames
  const GHOST = 0.16;
  const nslot = new WeakMap<HTMLElement, { dx: number; dy: number; o: number; sx: number; sy: number; still: number; fresh: boolean }>();
  const held = (p: { el: HTMLElement; sx: number; sy: number }, find: () => [number, number, number]) => {
    const st = nslot.get(p.el) ?? { dx: 0, dy: 0, o: 1, sx: p.sx, sy: p.sy, still: 0, fresh: true };
    st.still = !st.fresh && Math.hypot(p.sx - st.sx, p.sy - st.sy) > 0.3 ? 0 : st.still + 1;
    st.sx = p.sx; st.sy = p.sy;
    if (st.fresh || st.still >= STILL) {
      const [dx, dy, o] = find();
      if (st.fresh) Object.assign(st, { dx, dy, o });
      else { const e = (a: number, b: number) => (Math.abs(b - a) < 0.3 ? b : a + (b - a) / 4); st.dx = e(st.dx, dx); st.dy = e(st.dy, dy); st.o = Math.abs(o - st.o) < 0.01 ? o : st.o + (o - st.o) / 4; if (st.dx !== dx || st.dy !== dy || st.o !== o) dirty = true; }
    } else dirty = true;
    st.fresh = false;
    nslot.set(p.el, st);
    return st;
  };
  let touchedKeys = new Set<number>();
  // the 3D labels rule (format version 10): while a step plays, only who takes part shows a label; each label eases
  // to hidden (about 0.1 s) or shown (about 0.2 s), by the clock, not per frame, so it is quick on a slow device and
  // never blinks
  let partSet: Set<number> | null = null, tokSet: Set<number> | null = null;
  const showK = new WeakMap<HTMLElement, { v: number; t: number }>();
  const ease = (el: HTMLElement, on: boolean) => {
    const want = on ? 1 : 0, now = performance.now(), st = showK.get(el) ?? { v: want, t: now };
    const k = 1 - Math.exp(-Math.min(200, now - st.t) / (on ? 70 : 35));
    const v = Math.abs(want - st.v) < 0.02 || opts.still ? want : st.v + (want - st.v) * k;
    if (v !== want) dirty = true;
    showK.set(el, { v, t: now });
    return v;
  };
  // fault 3 (format version 10 fix): while the camera flies into or out of a scene inside the scene, the scene is
  // drawn small and its words would pile on each other; they stay hidden until the camera has arrived (then ease in)
  let flying = false;
  const drawLabels = () => {
    placed = [];
    if (!view) return;
    const X0 = cx(), Z0 = cz();
    // (a move between scenes keeps its data at rest, at full fade: only a move under way counts)
    const still = !flying && !(view.sceneDir && (view.fade ?? 1) < 0.98);
    for (const it of view.items) {
      const o = objs.get(it.key), p = pos.get(it.key);
      if (!o || !p) continue;
      // (format version 11, one focus at a time) a token the step is not about keeps its pill; its label fades
      const tokOff = it.kind === "token" && !!tokSet && !tokSet.has(it.key);
      const op = +(o.label.dataset.o ?? 1) * ease(o.label, still && labelOn([it.key], partSet) && !tokOff);
      o.label.dataset.on = (partSet && !labelOn([it.key], partSet)) || tokOff ? "0" : "1";
      if (it.container) project(o.label, p.c.x - it.w / 2 + 8, p.top + 1, p.c.z - it.h / 2 + 2, it.label ? op : 0);
      else project(o.label, p.c.x, p.top + 2, p.c.z, op);
    }
    const g = gap(view);
    const lx = view.foot.x - 20 - X0, lz = view.foot.y + view.foot.h / 2 - Z0;
    // a layer's name sits at the left end of the part of its plane that shows; a plane past the top or bottom of the
    // stage keeps its name at that edge, one row each, in layer order (least3d.ts)
    const fx0 = view.foot.x - 20 - X0, fx1 = view.foot.x + view.foot.w + 20 - X0, fz0 = view.foot.y - 20 - Z0, fz1 = view.foot.y + view.foot.h + 20 - Z0;
    const scr = (x: number, y: number, z: number): P2 & { z: number } => { v3.set(x, y, z).project(cam); return { x: (v3.x * 0.5 + 0.5) * W.w, y: (-v3.y * 0.5 + 0.5) * W.h, z: v3.z }; };
    const lo = 16, hi = W.h - 34;
    const quads = planes.map((_, L) => { const y = floorY(L, g); return [scr(fx0, y, fz0), scr(fx1, y, fz0), scr(fx1, y, fz1), scr(fx0, y, fz1)]; });
    // the middle of the plane's left edge when it shows (as before), else the left end of what shows
    const ats = quads.map((q, L) => { if (q.some((p) => p.z > 1)) return null; const m = scr(lx, floorY(L, g), lz); return m.x >= 0 && m.x <= W.w && m.y >= lo && m.y <= hi ? m : planeAnchor(q, W.w, lo, hi); });
    const row = (planes[0]?.label.offsetHeight || 22) + 4;
    const edge = edgeRows(quads.map((q) => q.reduce((s, p) => s + p.y, 0) / q.length), lo, hi, row);
    // then in layer order, a row apart (a name moved up or down keeps its place across); a plane off the stage: its
    // name hangs at the stage's left
    // (rfit) a plane wholly past the stage's top or bottom: only the nearest one on each side keeps its name, at that
    // edge, with an arrow that points off the stage (data-off, parts.css); the names of the others are left out
    const midY = quads.map((q) => q.reduce((s, p) => s + p.y, 0) / q.length), offOf = (L: number) => (ats[L] ? "" : midY[L] > hi ? "b" : midY[L] < lo ? "t" : "");
    const offB = planes.map((_, L) => L).filter((L) => offOf(L) === "b"), offT = planes.map((_, L) => L).filter((L) => offOf(L) === "t");
    const keepName = (L: number) => (offOf(L) === "b" ? L === Math.min(...offB) : offOf(L) === "t" ? L === Math.max(...offT) : true);
    const kept = planes.map((_, L) => L).filter(keepName), keptY = orderRows(kept.map((L) => ats[L]?.y ?? (offOf(L) === "b" ? hi : offOf(L) === "t" ? lo : edge[L])), lo, hi, row);
    const ys = planes.map((_, L) => (kept.includes(L) ? keptY[kept.indexOf(L)] : edge[L]));
    const x0 = Math.min(W.w, ...ats.map((a) => a?.x ?? W.w)); // a name with no plane on the stage lines up with the others
    planes.forEach((pl, L) => { const a = ats[L], at = { x: a ? a.x : x0 < W.w ? x0 : 0, y: ys[L] }; pl.label.dataset.off = offOf(L); project(pl.label, lx, floorY(L, g), lz, keepName(L) ? +(pl.label.dataset.o ?? 1) : 0, true, undefined, at); });
    for (const [key, wv] of wires) if (wv.label) { const e = view.edges.find((x) => x.key === key); const on = wireLabelOn(e, partSet); wv.label.dataset.on = on ? "1" : "0"; project(wv.label, wv.mid.x, wv.mid.y, wv.mid.z, +(wv.label.dataset.o ?? 1) * ease(wv.label, still && on)); }
    for (const [key, wv] of wires) if (wv.tags?.length) { const on = wireLabelOn(view.edges.find((x) => x.key === key), partSet); for (const tg of wv.tags) project(tg.el, tg.at.x, tg.at.y, tg.at.z, +(tg.el.dataset.o ?? 1) * ease(tg.el, still && on)); }
    for (const t of tokens) project(t.label, +(t.label.dataset.x ?? 0), +(t.label.dataset.y ?? 0), +(t.label.dataset.z ?? 0), +(t.label.dataset.o ?? 0) * ease(t.label, still));
    for (const b of bubbles) project(b, +(b.dataset.x ?? 0), +(b.dataset.y ?? 0), +(b.dataset.z ?? 0), +(b.dataset.o ?? 0) * ease(b, still));
    // the lines on the screen, for names at rest to keep off (item 8, fix)
    lineSegs = [...wires.values()].filter((w) => (w.on ?? 0) > 0.3 && w.pts && w.ends).map((w) => ({ ends: w.ends!, p: w.pts!.map((q) => { v3.copy(q).project(cam); return { x: (v3.x * 0.5 + 0.5) * W.w, y: (-v3.y * 0.5 + 0.5) * W.h }; }) }));
    unclutter();
  };
  let raf = 0, visible = true;
  const frame = () => {
    raf = requestAnimationFrame(frame);
    if (!visible) return;
    let moving = false;
    // the camera has arrived after a fly into or out of a scene: within 4 % of its distance and its target
    if (flying && Math.abs(camNow.dist - goal.dist) < goal.dist * 0.04 && Math.hypot(camNow.tx - goal.tx, camNow.ty - goal.ty, camNow.tz - goal.tz) < goal.dist * 0.04) { flying = false; dirty = true; }
    camNow.az = nearTurn(goal.az, camNow.az);
    let fading = false;
    if (view) for (let L = 0; L < view.layers.length; L++) {
      const want = L < peelK ? FOCUS_OFF : 1, now = peelO[L] ?? 1;
      if (Math.abs(want - now) > 0.004 && !opts.still) { peelO[L] = now + (want - now) * 0.18; fading = true; } else peelO[L] = want;
    }
    if (fading) { update(view!); moving = true; }
    for (const k of Object.keys(camNow) as (keyof typeof camNow)[]) {
      const d = goal[k] - camNow[k];
      const eps = k === "dist" || k.startsWith("t") ? 0.05 : 0.0005;
      if (Math.abs(d) > eps && !opts.still) { camNow[k] += d * 0.14; moving = true; } else { if (camNow[k] !== goal[k]) moving = true; camNow[k] = goal[k]; }
    }
    // a stream's dots flow for as long as the step shows it
    const now = performance.now() / 1000;
    for (const t of tokens) if (t.curves.length) {
      const n = t.curves.length, per = 6;
      t.drops.forEach((d, k) => { const seg = Math.floor(k / per), f = (now / 1.6 + (k % per) / per) % 1; d.position.copy(t.curves[seg].getPointAt(f)).y -= 2.5; });
      moving = true;
    }
    if (!moving && !dirty) return;
    const r3 = gl();
    if (!r3) { dirty = true; return; }
    dirty = false;
    place();
    r3.render(scene, cam);
    drawLabels();
  };
  raf = requestAnimationFrame(frame);
  const io = new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); if (visible) dirty = true; });
  io.observe(host);
  // near the screen (one screen height above or below) the stage holds a context; far, it gives it back
  const nio = new IntersectionObserver((es) => { near = es.some((e) => e.isIntersecting); if (near) dirty = true; else park(); }, { rootMargin: NEAR_MARGIN });
  nio.observe(host);
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
      userL = posL.has(k) ? Math.round(posL.get(k)!) : null;
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
  // a new scene is shown: going in, the camera starts far back and flies in; going out, it starts at the thing the
  // scene was entered from and flies back out to the story's view
  function sceneJump(v: View3) {
    flying = !opts.still;
    const via = v.sceneVia != null ? pos.get(v.sceneVia) : undefined;
    if (via) Object.assign(camNow, goal, { tx: via.c.x, ty: via.c.y, tz: via.c.z, dist: clampDist(Math.max(160, Math.max(via.half.x, via.half.z) * 5)) });
    else Object.assign(camNow, goal, { dist: clampDist(goal.dist * (v.sceneDir === "out" ? 0.4 : 2.6)) });
    dirty = true;
  }
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

  // format version 9: the check of what is really drawn, read from the scene graph (tools/plane9.ts calls it in a
  // browser at every step, camera and width). It reports what breaks: a shown plane at or above the camera, the camera
  // inside a block, a thing whose drawn bottom is under its plane's top or its container's slab, a solid thing drawn
  // see-through or after its plane, and, when the camera looks into a layer, a shown plane or a solid thing between it
  // and what it looks at
  (host as any).dh3probe = () => {
    const bad: string[] = [];
    if (!view) return { bad: ["no view"], n: 0 };
    root.updateMatrixWorld(true);
    const P = cam.position.clone();
    const shown = (m: THREE.Material | THREE.Material[]) => Math.max(...(Array.isArray(m) ? m : [m]).map((x) => (x as THREE.MeshBasicMaterial).opacity));
    const planeTop: number[] = [];
    planes.forEach((pl, L) => {
      const b = new THREE.Box3().setFromObject(pl.mesh); planeTop[L] = b.max.y;
      const op = shown(pl.mesh.material as THREE.Material);
      if (op > 0.2 && P.y <= b.max.y + 1) bad.push(`camera (height ${P.y.toFixed(1)}) at or under layer ${L}'s plane (top ${b.max.y.toFixed(1)})`);
      if ((pl.mesh.material as THREE.Material).depthWrite) bad.push(`layer ${L}'s plane writes depth (it would hide what stands under it)`);
    });
    const byKey = new Map(view.items.map((i) => [i.key, i]));
    let n = 0;
    for (const it of view.items) {
      const o = objs.get(it.key); if (!o || it.kind === "layer") continue;
      const meshes = [o.body, ...o.extra].filter(Boolean) as THREE.Mesh[];
      if (!meshes.length) continue;
      const op = Math.max(...meshes.map((m) => shown(m.material as any)));
      if (op < 0.3) continue;
      n++;
      const b = new THREE.Box3(); meshes.forEach((m) => b.expandByObject(m));
      if (P.x > b.min.x && P.x < b.max.x && P.y > b.min.y && P.y < b.max.y && P.z > b.min.z && P.z < b.max.z) bad.push(`camera inside "${it.label || it.id}"`);
      const L = Math.round(it.L);
      if (Math.abs(it.L - L) < 0.01 && planeTop[L] != null && b.min.y < planeTop[L] - 0.01) bad.push(`"${it.label || it.id}" drawn under layer ${L}'s plane: bottom ${b.min.y.toFixed(2)}, plane top ${planeTop[L].toFixed(2)}`);
      const par = it.parent != null ? byKey.get(it.parent) : undefined, po = par ? objs.get(par.key) : undefined;
      if (par && po?.body && par.container && !par.bare && Math.abs(par.L - it.L) < 0.01 && !["token", "pointer"].includes(it.kind)) { const pb = new THREE.Box3().setFromObject(po.body); if (b.min.y < pb.max.y - 0.01) bad.push(`"${it.label || it.id}" drawn inside its container's slab`); }
      for (const m of meshes) for (const mt of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshBasicMaterial[]) {
        if (mt.opacity >= 0.999 && (mt.transparent || !mt.depthWrite)) bad.push(`"${it.label || it.id}" is solid but drawn see-through`);
      }
      const pl = planes[L]; if (pl && !it.container && meshes.some((m) => m.renderOrder <= pl.mesh.renderOrder)) bad.push(`"${it.label || it.id}" is drawn before its plane`);
    }
    // what the camera looks into: nothing shown stands between it and the target
    const tL = userFocus != null ? null : user ? userL ?? storyL : storyL;
    if (tL != null && tL > 0) {
      const T = new THREE.Vector3(camNow.tx, camNow.ty, camNow.tz);
      planes.forEach((pl, L) => {
        if (L >= tL || shown(pl.mesh.material as THREE.Material) <= 0.2) return;
        const b = new THREE.Box3().setFromObject(pl.mesh), y = b.max.y;
        if ((P.y - y) * (T.y - y) >= 0) return;
        const k = (P.y - y) / (P.y - T.y), x = P.x + (T.x - P.x) * k, z = P.z + (T.z - P.z) * k;
        if (x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z) bad.push(`layer ${L}'s plane stands between the camera and layer ${tL}`);
      });
    }
    // where each shown thing is on the screen (a test clicks one on each layer)
    const pts: { key: number; L: number; x: number; y: number; container: boolean }[] = [];
    for (const it of view.items) { const p = pos.get(it.key); if (!p || (lift.get(it.key) ?? 0) < 0.3) continue; const q = p.c.clone().project(cam); if (q.z < 1 && Math.abs(q.x) < 0.95 && Math.abs(q.y) < 0.95) pts.push({ key: it.key, L: it.L, x: (q.x * 0.5 + 0.5) * W.w, y: (-q.y * 0.5 + 0.5) * W.h, container: it.container }); }
    return { bad, n, cam: [P.x, P.y, P.z].map((v) => +v.toFixed(1)), peel: peelK, tL, pts };
  };
  // (rfit) the frame check (p10/rfit/fit3d.ts): each shown thing's and each shown plane's drawn box, its eight corners
  // projected to the stage (pixels from the stage's top left); w, h: the stage; still: the camera is at its goal
  (host as any).dh3corners = () => {
    if (!view) return null;
    root.updateMatrixWorld(true);
    const op = (m: THREE.Material | THREE.Material[]) => Math.max(...(Array.isArray(m) ? m : [m]).map((x) => (x as THREE.MeshBasicMaterial).opacity));
    const box = (b: THREE.Box3) => { const out: P2[] = []; for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) { v3.set(x, y, z).project(cam); out.push({ x: (v3.x * 0.5 + 0.5) * W.w, y: (-v3.y * 0.5 + 0.5) * W.h }); } return out; };
    const things: { key: number; name: string; L: number; touched: boolean; c: P2[] }[] = [];
    for (const it of view.items) {
      const o = objs.get(it.key); if (!o || it.kind === "layer") continue;
      const ms = [o.body, ...o.extra].filter(Boolean) as THREE.Mesh[];
      if (!ms.length || Math.max(...ms.map((m) => op(m.material as any))) < 0.3) continue;
      const b = new THREE.Box3(); ms.forEach((m) => b.expandByObject(m));
      things.push({ key: it.key, name: it.label || it.id, L: it.L, touched: view.touched.includes(it.key), c: box(b) });
    }
    const pl = planes.map((p, L) => ({ L, name: p.label.textContent ?? "", shown: op(p.mesh.material as THREE.Material) > 0.2, c: box(new THREE.Box3().setFromObject(p.mesh)) })).filter((p) => p.shown);
    const still = (Object.keys(camNow) as (keyof typeof camNow)[]).every((k) => Math.abs(goal[k] - camNow[k]) < (k === "dist" || k.startsWith("t") ? 0.5 : 0.002));
    return { w: W.w, h: W.h, user, still, things, planes: pl };
  };
  return {
    update,
    zoom: (f) => { goal.dist = clampDist(goal.dist * f); setUser(true); },
    pan: (dx, dy) => { panBy(dx, dy); setUser(true); },
    walk,
    fit: () => { userFocus = null; userL = -1; const all = [...pos.values(), ...(view ? view.layers.flatMap((_, L) => layerPts(L)) : [])]; goal = fitBox(all, 0.62, -0.5); setUser(true); if (view) update(view); },
    back: () => { userFocus = null; userL = null; setUser(false); if (view) update(view); goal = storyGoal(); },
    dispose: () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); nio.disconnect(); canvas.removeEventListener("webglcontextlost", onLost); canvas.removeEventListener("webglcontextrestored", onRestored); mo.disconnect(); mq.removeEventListener?.("change", onMq); document.removeEventListener("dh-theme", onTheme);
      for (const [k, o] of objs) dropObj(k, o);
      for (const w of wires.values()) { w.mesh.geometry.dispose(); w.mat.dispose(); w.paper?.dispose(); for (const h of w.heads) if (h.userData.own) h.geometry.dispose(); }
      if (renderer) { renderer.forceContextLoss(); renderer.dispose(); } canvas.remove(); labels.remove();
    },
  };
}

// format version 9: a scene with no declared layers made each nesting level a layer, one below the other, so a
// container hung over what it holds and its things seemed to be under it (a tree's nodes under the tree). In 3D such a
// scene now stands on one floor: what a container holds stands on its slab, as on a declared layer, and "split layers"
// lifts each nesting level above its container (NEST_LIFT per level), never below
export const NEST_LIFT = 60;
const FLAT_TILT = 0.95;
export function flatNest(v: View3): View3 {
  if (v.layers.length || !v.items.some((i) => i.L > 0.01 || i.nest != null)) return v;
  if (v.items.every((i) => i.nest != null)) return v;
  return { ...v, items: v.items.map((i) => ({ ...i, L: 0, nest: i.L })) };
}
// where the line from a thing's centre towards p leaves its box
function clip(a: { c: THREE.Vector3; half: THREE.Vector3 }, p: THREE.Vector3): THREE.Vector3 {
  const d = p.clone().sub(a.c);
  const k = Math.min(...(["x", "y", "z"] as const).map((ax) => (Math.abs(d[ax]) < 1e-6 ? Infinity : (a.half[ax] + 3) / Math.abs(d[ax]))));
  return a.c.clone().addScaledVector(d, Math.min(1, k));
}
// a tube along a curve; a dashed connector is every other piece of it
function tube(curve: THREE.Curve<THREE.Vector3>, dashed: boolean, r: number): THREE.BufferGeometry {
  if (!dashed) return new THREE.TubeGeometry(curve, tubeSegs(curve), r, 6, false);
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
