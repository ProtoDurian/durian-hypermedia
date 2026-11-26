// Lane L-3d: the 3D stage on the new model. A port, not a rewrite: the drawing, the labels and the camera are the old
// stage (src/ui/anim3d.ts, cam3d.ts, fit3d.ts, least3d.ts, route3d.ts, kept as they are); this file replaces what used
// to feed it. The old feed was the graph engine's Frame; the new one is a Plan (where each thing sits, per layer) plus
// the StepState (lift, zoom, focus, layers apart) and the Motion (what the step touches):
//
//   viewAt(compiled, plan, k)  ->  View3 (pure: tests read it without WebGL)
//   mount3d(el, compiled, w)   ->  { step(k), dispose(), ... }   (tweens k-1 -> k, keeps keys stable)
//
// What it does with the model (SPEC 6.9, 6.11; owner points 2 and 26):
// - Layers: a `## Region` is a layer, top first. A thing stands on its own region's layer, else its container's; a thing
//   moved into a container on another layer is carried to it (the container it is in NOW, not where it was declared).
//   With no regions every nesting level is a layer (the stage's `flatNest` puts them on one floor). Its floor-plan
//   place is its Plan rect minus its layer band's top (the `band:<region>` rect the layers layout draws).
// - Camera: the auto camera of DESIGN 2.1: each step frames what it touches (Motion.touched, what a zoom opened, and
//   the things inside Plan.focus(k)), in 3D as in 2D; when that is nearly everything it frames the whole scene. The old
//   stage's own fitting keeps the words at 11 px or more, the camera above the top plane and never inside a block, and
//   everything stays drawn (nothing is faded for a zoom: zooming in never blanks the scene).
// - Labels: only who takes part (SPEC 6.11) while a step plays and for a moment after; then all.
// - Packets: one send per `a -> b: words` event, at a fixed index, with one eased progress, so a packet never jumps.
import type { CamView } from "../../core/camera";
import { FAINT } from "../../core/story";
import { mount3d as mountStage, type Item3, type Stage3, type View3 } from "../../ui/anim3d";
import { modelAt, scenePath } from "../core/scenes";
import { pathPoints } from "./route";
import type { Compiled, Event, Id, Model, Plan, Rect, StepState, Thing, ThingState, Tone } from "../types";

const MIN_PX = 11;
const BAND_PAD = 14;       // layouts/layers.ts: inside a band, round its things
const DUR = 760;           // ms a step takes to play
const QUIET_AFTER = 1200;  // ms after a step ends before every label shows again (SPEC 6.11)
const FOCUS_OFF = 0.12;   // the old stage's own fade for the layers a focus leaves out (anim3d.ts)
const WHOLE = 0.85;        // when a step touches more than this share of the stage, it frames the whole stage

const key = (model: Model, id: Id): number => model.order.indexOf(id) + 1;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const TONE: Record<Tone, string> = { good: "good", bad: "hot", warn: "warn", accent: "acc", off: "plain" };
const KIND: Record<Thing["shape"], string> = { box: "box", pill: "pill", circle: "circle", cylinder: "cylinder", cloud: "cloud", person: "person", diamond: "diamond", text: "text", dot: "dot", token: "token", ref: "pointer" };
// a step line with words draws its line and dot and puts the words on the line (the old "send arrow"); without words, the dot alone
const showOf = (style: string, words: string | null) => (style === "stream" ? "stream" : words ? "both" : "token");

/** the layer a thing stands on at a step: its container now (a move carries it), else its own region, else the first */
export function layerAt(model: Model, st: StepState, id: Id, seen = 0): number {
  const t = model.things[id];
  if (!t || seen > 64) return 0;
  const ts = st.things[id];
  if (ts?.at) return layerAt(model, st, ts.at, seen + 1);
  const cont = ts?.in ?? t.parent;
  const own = t.region ? model.regions.findIndex((r) => r.id === t.region) : -1;
  if (!model.regions.length) return cont ? layerAt(model, st, cont, seen + 1) + 1 : 0; // no layers: every nesting level is one
  if (cont && cont !== t.parent) return layerAt(model, st, cont, seen + 1); // moved into another container: it goes with it
  if (own >= 0) return own;
  return cont ? layerAt(model, st, cont, seen + 1) : 0;
}

/** a key a step set (`set id down=yes level=3`) over the one the thing was declared with */
const keyOf = (th: Thing, st: ThingState | undefined, k: string): string | undefined => st?.keys?.[k] ?? th.keys[k];
/** a meter's fill, 0 to 100 (`level=`), or null when the thing has none */
const level = (th: Thing, st: ThingState | undefined): number | null => { const v = keyOf(th, st, "level"); const n = v == null ? NaN : parseFloat(v); return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null; };

const depthOf = (model: Model, st: StepState, id: Id): number => { let n = 0; for (let c = st.things[id]?.in ?? model.things[id]?.parent; c && n < 64; c = st.things[c]?.in ?? model.things[c]?.parent) n++; return n; };

/** the top of each layer's band: from the `band:<id>` rects the layers layout draws; else just above its highest thing */
function bandTops(model: Model, plan: Plan, k: number, layerOfId: (id: Id) => number, steps: number, tight: boolean): { tops: number[]; foot: Rect } {
  const tops: number[] = model.regions.map(() => NaN);
  let hmax = 0, banded = false;
  try {
    for (const p of plan.frame(k)) if (p.k === "rect" && p.key.startsWith("band:")) {
      const L = model.regions.findIndex((r) => `band:${r.id}` === p.key);
      if (L >= 0) { tops[L] = p.rect.y; hmax = Math.max(hmax, p.rect.h); banded = true; }
    }
  } catch { /* no drawing yet: the fallback below */ }
  const rects = plan.rects(k);
  if (!banded) {
    for (const id of model.order) { const r = rects[id]; if (!r || model.things[id].parent) continue; const L = layerOfId(id); tops[L] = Number.isNaN(tops[L]) ? r.y - BAND_PAD : Math.min(tops[L], r.y - BAND_PAD); }
    hmax = plan.h;
  }
  // eng-3d3: the floor is the room the things take over the whole story (plus a pad), not the plan's full width: a plane much wider than what stands on it made the whole scene small, and the gap between layers follows the floor (format 68: 919 wide for 567 of things; the seven layers: 727 for 273)
  // (banded too: the 2D band has a column for the layer's name on its left and runs to the plan's width; the 3D plane need not)
  if (!tight) return { tops: tops.map((t) => (Number.isNaN(t) ? 0 : t)), foot: { x: 0, y: 0, w: plan.w, h: banded ? hmax : plan.h } };
  const room = roomOf(plan, steps), fx = Math.max(0, room.x0 - BAND_PAD), fw = Math.min(plan.w, room.x1 + BAND_PAD) - fx;
  return { tops: tops.map((t) => (Number.isNaN(t) ? 0 : t)), foot: { x: fx, y: 0, w: Math.max(40, fw), h: banded ? hmax : Math.max(plan.h, room.y1 + BAND_PAD) } };
}

/** the room the things of every step take (their rects, whatever the step), with a pad: the floor the planes are drawn over */
const rooms = new WeakMap<Plan, { x0: number; x1: number; y1: number }>();
function roomOf(plan: Plan, steps: number): { x0: number; x1: number; y1: number } {
  let r = rooms.get(plan);
  if (!r) {
    let x0 = Infinity, x1 = 0, y1 = 0;
    for (let k = 0; k < steps; k++) for (const q of Object.values(plan.rects(k))) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x + q.w); y1 = Math.max(y1, q.y + q.h); }
    r = { x0: Number.isFinite(x0) ? x0 : 0, x1, y1 }; rooms.set(plan, r);
  }
  return r;
}

export interface ViewOpts {
  /** the step the tween starts from (default: k, no tween) and how far along it is (0..1) */
  from?: number; t?: number;
  /** show only who takes part (a step is playing, or just ended) */
  quiet?: boolean;
}

/** One moment of the story as the old stage reads it. Pure: no WebGL, no DOM. */
export function viewAt(c: Compiled, plan0: Plan, k: number, o: ViewOpts = {}): View3 {
  const { states, motions } = c;
  const kk = Math.max(0, Math.min(states.length - 1, k));
  // a scene inside the scene (SPEC 6.12): its own model, its own state and plan, its own key space (the overview keeps its keys)
  const sceneId = states[kk].scene && c.model.scenes[states[kk].scene!] ? states[kk].scene! : null;
  const model = sceneId ? modelAt(c.model, states[kk]) : c.model;
  const plan = sceneId && plan0.scene ? plan0.scene(sceneId) : plan0;
  const innerOf = (s: StepState): StepState => (sceneId ? s.inner?.[sceneId] ?? states[kk].inner?.[sceneId] ?? s : s);
  const keyBase = sceneId ? 10000 * (1 + Object.keys(c.model.scenes).indexOf(sceneId)) : 0;
  const prevScene = states[Math.max(0, kk - 1)].scene ?? null, changed = (sceneId ?? null) !== prevScene && kk > 0;
  let k0 = Math.max(0, Math.min(states.length - 1, o.from ?? kk));
  if ((states[k0].scene ?? null) !== (sceneId ?? null)) k0 = kk; // a step that enters or leaves a scene does not tween things across scenes
  const t = clamp01(o.t ?? 1), te = ease(t);
  const B = innerOf(states[kk]), A = innerOf(states[k0]), mo = motions[kk];
  const K = (id: Id) => keyBase + key(model, id);
  const layerB = (id: Id) => layerAt(model, B, id), layerA = (id: Id) => layerAt(model, A, id);
  // a focused layer: the others fade (the story's focus, as the old stage's Frame carried it), eased with the step
  const focIdx = (s: StepState) => (s.focus === "all" ? -1 : model.regions.findIndex((r) => r.id === s.focus));
  const fadeOf = (s: StepState, L: number) => { const fi = focIdx(s); return fi < 0 || Math.abs(L - fi) < 0.5 ? 1 : FOCUS_OFF; };
  const { tops, foot } = bandTops(model, plan, kk, layerB, states.length, !sceneId);
  const rB = plan.rects(kk), rA = k0 === kk ? rB : plan.rects(k0);
  const layered = model.regions.length > 0;
  const levels = layered ? model.regions.length : 1 + Math.max(0, ...model.order.map((id) => (B.things[id]?.visible ? depthOf(model, B, id) : 0)));
  const top = (L: number) => (layered ? tops[L] ?? 0 : 0);

  // inside a closed thing: faint (`closed`), or not drawn at all (`hidden-inside`) until it is zoomed into
  const closedBy = (id: Id, st: StepState): "faint" | "hidden" | null => {
    for (let x = st.things[id]?.in ?? model.things[id]?.parent, n = 0; x && n < 64; x = st.things[x]?.in ?? model.things[x]?.parent, n++) {
      const t = model.things[x], s = st.things[x];
      if (t && s && !s.open && (t.flags.includes("hidden-inside") || t.flags.includes("closed"))) return t.flags.includes("hidden-inside") ? "hidden" : "faint";
    }
    return null;
  };

  // a token or a ref sits at a thing: a small square on it, side by side with the others there
  const tokenRect = (id: Id, st: StepState, rects: Record<Id, Rect>): Rect | null => {
    const at = st.things[id]?.at, base = at ? rects[at] : null; if (!base) return null;
    const mates = model.order.filter((x) => st.things[x]?.at === at && st.things[x].visible), n = mates.indexOf(id), m = mates.length;
    const w = 16;
    return { x: base.x + base.w / 2 - (m * w) / 2 + n * w, y: base.y + base.h / 2 - w / 2, w, h: w };
  };
  const rectOf = (id: Id, st: StepState, rects: Record<Id, Rect>): Rect | null => (st.things[id]?.at ? tokenRect(id, st, rects) : rects[id] ?? null);

  const ids = model.order.filter((id) => (B.things[id]?.visible && rB[id]) || (A.things[id]?.visible && rA[id]));
  const items: Item3[] = [];
  const cc = (id: Id) => model.roles[model.things[id].role ?? ""]?.colour ?? 0;
  for (const id of ids) {
    const th = model.things[id];
    const inB = !!(B.things[id]?.visible && rB[id]) && closedBy(id, B) !== "hidden", inA = !!(A.things[id]?.visible && rA[id]) && closedBy(id, A) !== "hidden";
    if (!inA && !inB) continue;
    const sB = B.things[id], sA = A.things[id];
    const ra = (inA ? rectOf(id, A, rA) : null) ?? rectOf(id, B, rB), rb = (inB ? rectOf(id, B, rB) : null) ?? ra;
    if (!ra || !rb) continue;
    const La = layerA(id), Lb = layerB(id);
    const ya = ra.y - top(La), yb = rb.y - top(Lb);
    const st: ThingState = inB ? sB : sA;
    const container = th.container && !st.at && th.shape !== "token";
    const parentId = st.at ?? st.in ?? th.parent;
    const faint = inB ? closedBy(id, B) : closedBy(id, A);
    const lifted = (sA?.lifted ? 1 : 0) * (1 - te) + (sB?.lifted ? 1 : 0) * te;
    const pcc = parentId ? cc(parentId) : 0;
    const kind = th.flags.includes("row") && !container ? "row" : th.shape === "token" || th.shape === "ref" ? KIND[th.shape] : container && ["array", "list"].includes(th.layout ?? "") ? th.layout! : container ? "group" : KIND[th.shape];
    // a table row has no title: its cells are its words
    const lvA = level(th, inA ? sA : sB), lvB = level(th, st), lv = lvB == null ? null : lerp(lvA ?? lvB, lvB, te);
    const cells = (st.values ?? th.values) ?? [], label = (th.title || (th.flags.includes("row") ? cells.join(" · ") : "")) + (st.is ? ` · ${st.is}` : "");
    items.push({
      key: K(id), id, kind, label, size: model.fence.size ?? "m", cc: cc(id), fill: th.flags.some((f) => f === "plain" || f === "bare") ? "none" : "soft", pcc,
      container, bare: container && ["array", "list"].includes(th.layout ?? ""), parent: parentId ? K(parentId) : null,
      tone: st.tone ? TONE[st.tone] : "plain", dim: st.dim, down: keyOf(th, st, "down") === "yes",
      x: lerp(ra.x, rb.x, te), y: lerp(ya, yb, te), w: lerp(ra.w, rb.w, te), h: lerp(ra.h, rb.h, te), L: lerp(La, Lb, te),
      o: (inA && inB ? 1 : inB ? te : 1 - te) * lerp(fadeOf(A, La), fadeOf(B, Lb), te), depth: depthOf(model, B, id),
      ...(lv != null ? { lv } : {}), ...(faint === "faint" ? { faint: FAINT } : {}), ...(lifted > 0.001 ? { lift: lifted } : {}),
    });
  }

  // a place kept for a token that lands later among tokens already in a container: a faint cube with a ring on the spot it will
  // take ("bytes from 1001 are missing", 69 step 9). Only while the token is somewhere else now, in one beat of the story
  const framed = new Set<number>();
  for (const id of model.order) {
    const th = model.things[id];
    if (th.shape !== "token" || !B.things[id]?.visible) continue;
    for (let j = kk + 1; j < states.length; j++) {
      const Sj = innerOf(states[j]), tj = Sj.things[id], into = tj?.in;
      if (!tj?.visible || !into || into === (B.things[id].in ?? th.parent)) continue;
      const mates = model.order.filter((x) => x !== id && B.things[x]?.visible && !B.things[x].at && (B.things[x].in ?? model.things[x].parent) === into);
      const slot = plan.rects(j)[id], live = items.find((i) => i.id === id);
      if (mates.length && slot && live && items.some((i) => i.id === into)) {
        const L = layerAt(model, Sj, id), key = K(id) + 500000;
        items.push({ ...live, key, id: id + "~slot", label: "", x: slot.x, y: slot.y - top(L), w: slot.w, h: slot.h, L, o: 0.4, parent: K(into), lift: undefined, down: false, tone: "plain", dim: false });
        framed.add(key);
      }
      break;
    }
  }

  // a line between two things on one layer runs where the 2D router drew it (its corner points, y inside the layer's band)
  const frameB = (() => { try { return plan.frame(kk); } catch { return []; } })();
  const polyOf = (relId: Id, from: Id, to: Id) => {
    const Lf = layerB(from);
    if (Math.abs(Lf - layerB(to)) > 0.5) return null;
    const p = frameB.find((x) => x.k === "path" && x.key === `rel:${relId}`) as Extract<(typeof frameB)[number], { k: "path" }> | undefined;
    const pts = p ? pathPoints(p.d) : [];
    return pts.length >= 2 ? pts.map((q) => ({ x: q.x, y: q.y - top(Lf) })) : null;
  };
  // lines: the relations that are drawn now; setup words stay; a step's words ride on its packet
  const evs = (mo?.events ?? []) as Event[];
  const sends = evs.filter((e): e is Extract<Event, { k: "send" }> => e.k === "send");
  const edges: View3["edges"] = [];
  for (const rel of Object.values(model.relations)) {
    const vB = B.relations[rel.id]?.visible && rB[rel.from] && rB[rel.to], vA = A.relations[rel.id]?.visible && rA[rel.from] && rA[rel.to];
    if (!vB && !vA) continue;
    if (!items.some((i) => i.key === K(rel.from)) || !items.some((i) => i.key === K(rel.to))) continue;
    const poly = polyOf(rel.id, rel.from, rel.to);
    edges.push({ key: `rel:${rel.id}`, ...(poly ? { poly } : {}), from: K(rel.from), to: K(rel.to), style: rel.style === "dashed" ? "-->" : rel.style === "line" ? "--" : rel.style === "both" ? "<->" : "->", label: rel.label ?? "", implicit: false, cc: model.roles[rel.role ?? ""]?.colour ?? 0, o: vA && vB ? 1 : vB ? te : 1 - te });
  }

  // packets: one send per event, in its own beat, at a fixed index (so it never changes identity mid-step)
  const NB = Math.max(1, mo?.beats ?? 1), local = (b: number) => clamp01(t * NB - b);
  const sendsOut: View3["sends"] = sends.map((e) => {
    const lost = e.style === "lost";
    const p = k0 === kk && o.t === undefined ? 1 : clamp01((local(e.beat) - 0.12) / 0.88);
    const poly = polyOf(e.rel, e.from, e.to);
    return { label: e.words ?? "", path: [K(e.from), K(e.to)], show: showOf(e.style, e.words), cc: model.roles[e.role ?? ""]?.colour ?? 0, p: lost ? Math.min(p, 0.6) : p, ...(poly ? { polys: [poly] } : {}) };
  });
  const says = evs.filter((e): e is Extract<Event, { k: "say" }> => e.k === "say").map((e) => ({ key: K(e.id), text: e.words, o: k0 === kk && o.t === undefined ? 1 : clamp01((local(e.beat) - 0.55) / 0.45) }));
  const hl = new Map<number, string>();
  for (const e of evs) if (e.k === "light") for (const id of e.ids) hl.set(K(id), B.things[id]?.tone ? TONE[B.things[id].tone!] : "acc");

  // who takes part: what the step touches, sends along, says, lights, lifts (SPEC 6.11); nothing touched: every label
  const touchedIds = [...new Set([...(mo?.touched ?? []), ...B.zoom.flat()])].filter((id) => model.things[id]);
  const touched = touchedIds.map(K);
  const tokens = touchedIds.filter((id) => model.things[id].shape === "token" || B.things[id]?.at).map(K);

  // the auto camera: what the step touches and what lies in Plan.focus(k); when that is most of the stage, all of it
  let authorLook = false; // the author framed it (`camera <ids>`, `zoom into`): only then what lies outside leaves the stage
  const look = (() => {
    // the author's `camera <ids>` frames exactly those things (the old stage's camera word); `camera all` is the whole stage
    // zooming out (a level closes) shows what it closed into: the whole stage; a `camera <ids>` line frames its things in the step that says it
    const stepSaysCamera = !!model.steps[kk - 1]?.facts.some((x) => x.k === "camera");
    if (kk > 0 && A.zoom.length > 0 && B.zoom.length === 0 && !stepSaysCamera) return null;
    if (B.camera && B.focus === "all" && (stepSaysCamera || (kk > 0 && innerOf(states[kk - 1]).zoom.length === B.zoom.length))) { if (B.camera.ids === "all") return null; const own = B.camera.ids.filter((id) => model.things[id] && B.things[id]?.visible).map(K); if (own.length) { authorLook = true; return own; } }
    const zoom = B.zoom.length ? B.zoom[B.zoom.length - 1].filter((id) => model.things[id]).map(K) : [];
    if (zoom.length) { authorLook = true; return zoom; }
    // a focused layer is framed by the stage itself; layers coming apart or together change the whole picture: all of it
    if (B.focus !== "all" || !touched.length || B.layersApart !== innerOf(states[Math.max(0, kk - 1)]).layersApart) return null;
    // a scene inside the scene is small and its boxes are the story: it is framed whole, never cut at an edge
    if (sceneId) return null;
    // on a phone a close-up cuts the things around it (the old stage showed the whole building); the stage's least-size rule still frames what the step touches when the whole is too small to read
    if (plan.phone) return null;
    const f = plan.focus(kk), set = new Set(touched);
    // one or two things touched: their neighbours on the drawn lines come too, so a close-up keeps its context
    if (touched.length <= 2) for (const rel of Object.values(model.relations)) { if (!B.relations[rel.id]?.visible) continue; const a = K(rel.from), b = K(rel.to); if (set.has(a) || set.has(b)) { set.add(a); set.add(b); } }
    for (const i of items) { const r = rB[i.id]; if (r && !i.container && i.kind !== "token" && i.kind !== "pointer" && r.x >= f.x && r.y >= f.y && r.x + r.w <= f.x + f.w && r.y + r.h <= f.y + f.h) set.add(i.key); }
    // what holds a framed thing is framed whole with it: a box is never cut at the stage's edge while its token is in view
    const byKey = new Map(items.map((i) => [i.key, i]));
    for (const k of [...set]) for (let p = byKey.get(k)?.parent, n = 0; p != null && n < 64; p = byKey.get(p)?.parent, n++) set.add(p);
    // eng-3d3: with one layer or none, a close-up whose things (and what holds them) span almost half of the floor or more is the whole stage: a close-up cut a host at one edge and the next at the other (format 68, "segment 4 again")
    if (model.regions.length <= 1 && set.size) { let x0 = Infinity, x1 = -Infinity; for (const i of items) if (set.has(i.key)) { x0 = Math.min(x0, i.x); x1 = Math.max(x1, i.x + i.w); } if (x1 - x0 > 0.45 * Math.max(1, foot.w)) return null; }
    const leaves = items.filter((i) => !i.container && i.o > 0.5).length || 1;
    // a close-up that spans half the layers (or more) is the whole stack anyway: a stack of layers is tall, the close-up would be cut at its top and bottom
    const spans = new Set(items.filter((i) => set.has(i.key)).map((i) => Math.round(i.L))).size;
    if (layered && model.regions.length >= 3 && spans >= Math.max(3, Math.ceil(model.regions.length * 0.5))) return null;
    return [...set].filter((k) => !byKey.get(k)?.container).length / leaves > WHOLE || (f.w >= plan.w - 1 && f.h >= plan.h - 1) ? null : [...set];
  })();

  // in a close-up, what is outside what it frames leaves the stage (the old stage's rule: no thing stands half cut at the edge).
  // What holds a framed thing stays, and what it holds, and what the step touches; the rest fades out with the step.
  if (authorLook && look && look.length) {
    const byK = new Map(items.map((i) => [i.key, i])), keep = new Set<number>([...look, ...touched]);
    for (const k of [...keep]) for (let p: number | null = byK.get(k)?.parent ?? null, n = 0; p != null && n < 64; p = byK.get(p)?.parent ?? null, n++) keep.add(p);
    const lk = new Set(look);
    for (const i of items) { if (keep.has(i.key)) continue; for (let p: number | null = i.parent, n = 0; p != null && n < 64; p = byK.get(p)?.parent ?? null, n++) if (lk.has(p)) { keep.add(i.key); break; } }
    for (const i of items) if (!keep.has(i.key)) i.o *= t < 1 ? 1 - te : 0;
  }
  // what the camera frames of the touched: when the author framed one thing (`camera k3`), the others the step touches (its pod, its node) do not widen the shot
  // 3dframe: the first step shows the whole stage, and zooming out all the way does too, on a phone as well (no cut to what the step touches: format 65 step 8 showed node 1 and cut node 2)
  const closedAll = kk > 0 && innerOf(states[kk - 1]).zoom.length > 0 && B.zoom.length === 0 && !model.steps[kk - 1]?.facts.some((x) => x.k === "camera");
  const framed1 = closedAll || (kk <= 1 && !authorLook) ? [] : authorLook && look && look.length && touched.some((k) => look.includes(k)) ? [...new Set([...touched.filter((k) => look.includes(k)), ...sendsOut.flatMap((s) => s.path)])] : touched; // 3dframe: a packet's two ends are in the shot, so its line is whole
  const focusL = B.focus === "all" ? -1 : model.regions.findIndex((r) => r.id === B.focus);
  const cam = B.camera ? ({ close: !!B.camera.close, far: !!B.camera.far, turn: (B.camera.turn as CamView["turn"]) ?? null, tilt: (B.camera.tilt as CamView["tilt"]) ?? null } as CamView) : null;
  const spread = lerp(A.layersApart ? 1 : 0, B.layersApart ? 1 : 0, te);
  // eng-3d3: layers together (2 or more, no gap, no focus): the lower layers stand under the top one and their words piled on its words (format 64 last
  // step). At rest the stage keeps each word that has a clear spot, top layer first, and leaves out the rest (the layer names stay): `stackHide`
  const stacked = model.regions.length >= 2 && spread < 0.5 && B.focus === "all";
  // a scene entered or left: the stage jumps its camera (far then in; or from the thing it was entered from) and the things fade in
  const playing = o.t !== undefined && changed, fade = playing ? te : 1;
  if (playing) { for (const i of items) i.o *= fade; for (const e of edges) e.o *= fade; }
  const via = playing && !sceneId ? scenePath(c.model).via[kk] : null;
  const out: View3 = {
    items, edges, sends: sendsOut, says, hl, sel: null, ...(framed.size ? { framed } : {}),
    layers: model.regions.map((r) => ({ id: r.id, label: r.title, note: "" })), levels, spread, focus: focusL >= 0 ? focusL : null,
    look: look && look.length ? look : null, touched: framed1, foot, stepKey: String(kk), cam,
    part: o.quiet && touched.length ? touched : null, takes: touched.length ? touched : null, toks: o.quiet && tokens.length ? tokens : null,
    least: (plan.phone ? 0.86 : 1) * (MIN_PX / 11), // eng-3d3: on a phone the readable least is 9.5 px, as the sweep counts it (11 px cut the scene at one side: format 69 steps 6-11)
     pillsOnLine: true, fitStack: true, ...(o.t !== undefined && t < 1 ? { playing: true } : {}), ...(stacked ? { stackHide: true } : {}), // (also while it plays: a layer name keeps its row the whole step) ...(look && look.length && !authorLook ? { autoLook: true } : {}), // eng-3d3
    ...(sceneId ? { scene: sceneId } : {}),
    ...(playing ? { sceneDir: sceneId ? ("in" as const) : ("out" as const), fade, sceneVia: via && c.model.things[via] ? key(c.model, via) : null } : {}),
  };
  // eng-3d3: while a step plays, the story's camera reads where the things will REST (the stage's held-view rule, "never a tween"): the fit moved with
  // every fading or moving thing and the labels, anchored in the world, went with it (format 65 step 4: "redis" rode 110 px up and back)
  if (o.t !== undefined && t < 1 && k0 !== kk && !playing && !sends.length && !tokens.length) { // (a step with a packet or a token on the move keeps the camera following it)
    const fin = viewAt(c, plan0, kk, { from: kk });
    out.hold = { frames: [fin.items], touched: fin.touched, least: fin.least ?? 1, spread: fin.spread };
  }
  return out;
}

export interface Mounted3 { step(k: number): void; jump(k: number): void; dispose(): void; stage: Stage3; view(): View3 | null }

/** the 3D stage for a compiled story, drawn in `el` (it fetches nothing: three.js is already in the page's 3D chunk) */
/** how long a step's move takes at a speed (the Speed control: 0.5, 1, 1.5, 2): 760 ms at 1x, divided by the speed (eng-3d3) */
export const tweenMs = (speed = 1): number => DUR / Math.max(0.25, speed || 1);

export function mount3d(el: HTMLElement, c: Compiled, width: number, opts: { still?: boolean; labels?: "part" | "all"; /** the page's step speed, read at each step */ speed?: () => number } = {}): Mounted3 {
  const stage = mountStage(el, { pick: () => {}, user: () => {} }, { still: opts.still });
  const plan = c.plan(width), allLabels = opts.labels === "all" || c.model.fence.labels === "all";
  let cur = 0, last: View3 | null = null, raf = 0, quietTimer: ReturnType<typeof setTimeout> | undefined, gone = false;
  const draw = (k: number, o: ViewOpts) => { last = viewAt(c, plan, k, { ...o, quiet: !allLabels && o.quiet }); stage.update(last); };
  const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; if (quietTimer) clearTimeout(quietTimer); quietTimer = undefined; };
  const step = (k: number) => {
    k = Math.max(0, Math.min(c.states.length - 1, k));
    const from = cur; stop(); cur = k;
    if (opts.still || from === k) { draw(k, { quiet: false }); return; }
    const t0 = performance.now(), dur = tweenMs(opts.speed?.()); // eng-3d3: the move follows the Speed control, as the 2D stage's does
    const tick = () => {
      if (gone) return;
      const t = clamp01((performance.now() - t0) / dur);
      draw(k, { from, t, quiet: true });
      if (t < 1) raf = requestAnimationFrame(tick);
      else { raf = 0; quietTimer = setTimeout(() => { if (!gone && cur === k) draw(k, { quiet: false }); }, QUIET_AFTER); }
    };
    tick();
  };
  /** show step k at once, at rest (the first draw: no tween from the setup) */
  const jump = (k: number) => { k = Math.max(0, Math.min(c.states.length - 1, k)); stop(); cur = k; draw(k, { quiet: false }); };
  return { step, jump, view: () => last, stage, dispose: () => { gone = true; stop(); stage.dispose(); } };
}
