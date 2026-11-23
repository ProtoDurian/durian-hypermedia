// This package is the source of this file: edit it here. It began as a copy synced from a private prototype (scripts/sync.ts, now frozen).
// The animation part, format version 6: one engine for every scene (tools/scene.ts), drawn here in SVG, or in 3D
// (site/src/anim3d.ts, loaded only when a reader opens the 3D view; ```animation 3d opens in it). A toggle keeps the step.
// The engine gives each step a frame (where every entity sits) and its effects (highlights, speech, tokens sent);
// this file tweens between frames, draws with page tokens only, and lets the reader explore with a camera:
// drag to pan, pinch or Ctrl + wheel to zoom, click an entity for its note, "Back to the story" to follow the steps again.
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { baseY as geoBase, floorY, SLAB } from "./geo3d";
import { sceneLlm, useNarrow, phoneLeast, tokens, NARROW, minFont, MIN_PX, METER_H, union, pad, center, edgePoint, fitAspect, storyView, connGeom, ridesOn, bezAt, bezTan, bezOff, bezPath, labelBox, personIcon, cylRy, DESIGN, CHIP, type Box, type Edge, type Frame, type Rect, type Geom, type Mark, type SendGeom, type SizeTok } from "../core/scene";
import { stageScene, phoneScene, leastScale } from "../core/readable";
// format version 11: a still scene and a static one show whole (core/whole.ts); a calm story (core/calm.ts): only
// items that pass each other arc, one held view from a camera word to the next, one token's words at a time
import { layoutWidth, oneStep, STAGE, staticView, wholeAspect, wholeLayout, wholeSize, wholeView } from "../core/whole";
import { calmHeight, heldViews, tokenSubject, passing, stepT } from "../core/calm";
import { useStatic, StaticSteps, type StaticProp } from "../parts/kit/static";
import type { Compiled } from "../core/scene"; // (tokenIds' cache)
import { moreSides } from "../core/edge10";
import { Controls, reducedMotion } from "./parts";
import type { Ui } from "./ui";
import type { Stage3, View3, Item3, Pick } from "./anim3d";
import { lerpRoute } from "../core/route";
import { FAINT } from "../core/story";
import { visOf, REST_MS } from "../core/depth";
// format version 10: a scene inside a scene (tools/scenes.ts; the stage's part in ./anim-scenes)
import { sceneMove, sceneFrames, stepScene } from "../core/scenes";
import { moveCam, moveO, SceneChip, StepList, sceneBands } from "./anim-scenes";
import { hasWebGL } from "./gl";
import { EndLabels, LineEnds } from "./line-ends";
import { FieldRow, RecordBox } from "./record";
import { lineSlots, slotOf, wordOf, type LineSlots } from "./diagram-slots";

// 3D needs WebGL and motion; without either, the reader gets the 2D stage and no toggle. A 3D-only scene (format
// version 10) needs only WebGL: with reduced motion it shows still 3D frames, one per step
function can3d(only = false): boolean {
  if (typeof window === "undefined" || (!only && reducedMotion())) return false;
  // asked once per page; the test context is given back at once (site/src/gl.ts: a throwaway context per animation
  // pushed the 3D stages' own contexts out)
  return hasWebGL();
}

// the page's width without its scrollbar, for the phone's edge-to-edge stage (parts.css): 100vw counts a visible
// scrollbar and would scroll the page sideways. Set once per page, and again when the page changes size
let pageW = false;
function watchPageW() {
  if (pageW || typeof window === "undefined") return;
  pageW = true;
  const set = () => document.documentElement.style.setProperty("--page-w", `${document.documentElement.clientWidth}px`);
  set();
  addEventListener("resize", set);
  try { new ResizeObserver(set).observe(document.documentElement); } catch {}
}

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpR = (a: Rect, b: Rect, t: number): Rect => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t) });
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export type SceneSrc = { head: string; steps: { title: string; raw: string; line: number }[]; base: number; info: Record<string, string>; part?: "state" | "class" | "er"; title?: string };
// ly: its y inside its layer's band; L: its layer (both tweened, for the 3D stage)
// anchorY: a pointer's anchor top (a pointer below its anchor points up)
// lv: its meter (level=) at this moment, tweened
// g (format version 9): how fully it is drawn, FAINT inside a closed thing (its words hidden) to 1 when open, tweened
// lift (format version 10): how far it is lifted out of its box (0 to 1, tweened; only the 3D stage raises it)
// slab (format version 11): the slabs it stands on in 3D while it moves to another floor or parent, eased from start to end
type Shown = { box: Box; r: Rect; o: number; enter: boolean; ly: number; L: number; anchorY?: number; lv?: number; g?: number; lift?: number; slab?: number };
// every token id a scene ever has, once per compiled scene (a token that has left still counts as named)
const tokCache = new WeakMap<Compiled, Set<string>>();
function tokenIds(c: Compiled): Set<string> {
  let s = tokCache.get(c);
  if (!s) { s = new Set(c.frames.flatMap((f) => f.boxes.filter((b) => b.kind === "token").map((b) => b.id))); tokCache.set(c, s); }
  return s;
}
// the slabs each thing stands on in 3D, at rest in one frame: the 3D stage's own rule (./geo3d.ts baseY)
function slabsOf(boxes: readonly Box[]): Map<number, number> {
  const key = new Map(boxes.map((b) => [b.id, b.key]));
  const rest = boxes.map((b) => ({ key: b.key, kind: b.kind, container: b.container, bare: ["array", "list"].includes(b.kind), parent: key.get((b.ent.parent ?? b.ent.anchor) as string) ?? null, L: b.layer ?? 0 }));
  const by = new Map(rest.map((r) => [r.key, r]));
  return new Map(rest.map((r) => [r.key, Math.round((geoBase(r, by, 1) - floorY(r.L, 1)) / (SLAB + 1))]));
}
// a line's end as the router measured it (format version 10): with its heading, so a queue's line meets its rails
const endRect = (s: Shown): Rect & { head?: number } => (s.box.head ? { ...s.r, head: s.box.head } : s.r);
const liftOf = (b?: Box) => (b?.lift ? 1 : 0);
const gOf = (b?: Box) => (b?.faint ? FAINT : 1);
const wordsO = (g?: number) => (g == null ? 1 : Math.max(0, Math.min(1, (g - FAINT) / (1 - FAINT))));
const bandOff = (b: Box) => b.y - b.ly;

export function Animation({ src, ui, srText, static: staticProp }: { src: SceneSrc; ui: Ui; srText: string | null; static?: StaticProp }) {
  // the scene, and its phone variant (format version 8) for a stage under NARROW pixels: the phone's tokens (the same
  // type, tighter spacing), and the narrow layout when the scene is wide (a wide row or left-to-right graph runs top to
  // bottom). The story camera then never draws a phone's smallest words under 11 px (tools/scene.ts storyView)
  // (each compiled once, on a work budget: core/readable.ts stageScene and phoneScene; a phone layout over its budget
  // keeps the wide one)
  const cWide = useMemo(() => stageScene(src), []);
  const [px0, setPx0] = useState(0);
  const phone = px0 > 0 && px0 < NARROW;
  // SPEC 4.1: static is one step, drawn whole and flat (so the server's HTML, a PDF and a mail show it); the fence, the
  // page or the host ask for it (the static prop), print and reduced motion switch it on too (parts/kit/static.ts)
  const st = useStatic(staticProp, cWide.frames.length, src.steps.map((s) => s.title));
  // static draws a closed thing's inside in full, words and all: on paper no reader can zoom in to open it
  const gOfS = st.on ? (_b?: Box) => 1 : gOf;
  // format version 11: a still scene (no steps) and a static one show whole, laid out for the width of the stage
  const still = !!cWide.scene.attrs.still;
  const whole = st.on || still || !!src.part, wpx = layoutWidth(px0 || STAGE);
  // SPEC 6.14: the reader's camera (the 3D button, zoom, show everything, drag and wheel to move, and the line that says
  // how) comes only when the fence says zoom or 3d: steady. The story's own camera still follows the steps; a tap or
  // Enter still reads a note. fixed: a steady still scene
  const steady = !st.on && src.info.zoom !== "yes" && src.info.view !== "3d" && !cWide.scene.attrs.only3d;
  const fixed = steady && still;
  const cWhole = useMemo(() => (whole ? wholeLayout(cWide, wpx, !!src.part) : null), [wpx, whole]);
  const pKey = cWhole ? (cWhole.scene.attrs.narrow ? "narrow" : phone ? "phone" : "wide") : phone ? (useNarrow(cWide, px0) ? "narrow" : "phone") : "wide";
  const cPhone = useMemo(() => (whole || pKey === "wide" ? null : phoneScene(cWide, pKey === "narrow")), [pKey, whole]);
  const c = cWhole ?? cPhone ?? cWide;
  // a still or static drawing that cannot show whole with words at the least size is never shrunk under it and never
  // cut: it keeps the least size and scrolls sideways in its own box, as a table does. Print still fits the paper
  const oneS = (st.on || fixed) && c.frames.length ? oneStep(c, st.on ? st.i : 0) : null;
  const leastS = oneS && px0 ? Math.max(...oneS.frames.map((f) => leastScale(f, px0))) : 0;
  const natS = oneS ? wholeSize(oneS) : null;
  const swipeW = natS && leastS && !st.print && natS.w * leastS > px0 + 1 ? Math.ceil(natS.w * leastS) : 0;
  const [swipeMore, setSwipeMore] = useState("r");
  const stageAr = swipeW ? px0 / (natS!.h * leastS) : st.on && c.frames.length ? wholeAspect(oneStep(c, st.i), px0) : whole ? wholeAspect(c, px0) : c.aspect;
  // on a phone, a stage a little taller where that, and only that, keeps the camera still between two zooms (core/calm.ts)
  const tall = useMemo(() => (!whole && phone && c.frames.length && typeof window !== "undefined" ? calmHeight(c, px0, window.innerHeight) : null), [c, px0, whole]);
  const Z = tokens(c.scene.attrs.phone);
  const n = c.frames.length;
  const [liveI, setI] = useState(0);
  const [liveFrom, setFrom] = useState(0);
  const [liveT, setT] = useState(1);
  const i = st.on ? st.i : liveI, from = st.on ? st.i : liveFrom, t = st.on ? 1 : liveT;
  const [howOpen, setHowOpen] = useState(false); // the ? button under the stage: the whole "how to move" text
  const [playing, setPlaying] = useState(false);
  const [user, setUser] = useState<Rect | null>(null);   // the reader's own camera; null follows the story
  const [sel, setSel] = useState<number | null>(null);    // the entity whose note is open
  const [ar, setAr] = useState(c.aspect);                  // the stage's real shape (it has a minimum height on phones)
  const [px, setPx] = useState(0);                         // the stage's width in pixels
  const [liveMode, setMode] = useState<"2d" | "3d">("2d"); // the server draws 2D; the browser may switch
  const mode = st.on ? "2d" : liveMode;
  const [ok3d, setOk3d] = useState(false);
  const [loading3d, setLoading3d] = useState(false);
  const [user3, setUser3] = useState(false);               // the reader moved the 3D camera
  const [pickL, setPickL] = useState<number | null>(null); // the layer the reader clicked
  const [active, setActive] = useState(false);             // the reader took the stage (clicked, tapped or focused it): the wheel and one finger move it
  // format version 10 (tools/depth.ts): a 3D-only scene has no flat form; in 3D, while a step plays, only who takes
  // part shows a label (labels=all keeps them all); the others come back REST_MS after the step ends and the player stops
  const only3d = !!cWide.scene.attrs.only3d, labelsAll = cWide.scene.attrs.labels === "all";
  const [rest, setRest] = useState(true);
  const firstStep = useRef(true);
  const host3 = useRef<HTMLDivElement>(null);
  const s3 = useRef<Stage3 | null>(null);
  // (rfit) "Show everything" pressed before the 3D stage is live (the part hydrates on that very tap, or three.js is still
  // loading): kept here and done once the stage mounts; before, the tap was lost and the story's crop stayed
  const fitAsked = useRef(false);
  const view3 = useRef<View3 | null>(null);
  // the floor plan of the whole story: where the 3D stage puts its layer planes and its centre
  // (format version 10) of the scene the story is in: each scene has its own floor plan and families
  const sceneNow = stepScene(c, i).id;
  const families = (c.frames[i] ?? c.frames[0])?.families ?? [];
  const foot = useMemo(() => union(sceneFrames(c, i).flatMap((f) => f.boxes.filter((b) => b.kind !== "layer").map((b) => ({ x: b.x, y: b.ly, w: b.w, h: b.h })))), [c, sceneNow]);
  useEffect(() => { watchPageW(); const ok = can3d(only3d); setOk3d(ok); if (ok && (src.info.view === "3d" || only3d)) setMode("3d"); }, []);
  useEffect(() => { if (firstStep.current) { firstStep.current = false; return; } setRest(false); }, [i]);
  useEffect(() => { if (t < 1 || playing || rest) return; const tm = setTimeout(() => setRest(true), REST_MS); return () => clearTimeout(tm); }, [t, playing, rest, i]);
  useEffect(() => {
    if (mode !== "3d") return;
    let dead = false, h: Stage3 | null = null;
    setLoading3d(true);
    import("./anim3d").then((m) => {
      if (dead || !host3.current) return;
      try {
        h = m.mount3d(host3.current, {
          pick: (p: Pick) => { if (!p) { setSel(null); setPickL(null); } else if (p.kind === "ent") { setSel(p.key); setPickL(null); } else { setPickL(p.L); setSel(null); } },
          user: (a) => setUser3(a),
        }, { still: reducedMotion() });
        s3.current = h;
        if (view3.current) h.update(view3.current);
        if (fitAsked.current) { fitAsked.current = false; h.fit(); }
      } catch { setOk3d(false); setMode("2d"); }
      setLoading3d(false);
    }).catch(() => { setOk3d(false); setMode("2d"); setLoading3d(false); });
    return () => { dead = true; h?.dispose(); s3.current = null; };
  }, [mode]);
  useEffect(() => { if (mode === "3d" && view3.current) s3.current?.update(view3.current); });
  const stage = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const raf = useRef(0);
  const mk = "ah" + useId().replace(/[^\w-]/g, "");
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; cam: Rect; moved: boolean; dist?: number; key: string | null } | null>(null);
  const zoomRef = useRef<(f: number, at?: { x: number; y: number }) => void>(() => {});
  const panRef = useRef<(dx: number, dy: number) => void>(() => {});
  const activeRef = useRef(false);
  activeRef.current = active;
  const cam0 = useRef<Rect>({ x: 0, y: 0, w: 1, h: 1 });
  // Ctrl or Cmd + wheel (and a trackpad pinch, which browsers send as Ctrl + wheel) zooms at the pointer. A plain wheel
  // (or a trackpad's two-finger scroll) moves the view once the reader has taken the stage; before that it scrolls the
  // page, so a reader scrolling past the stage is never caught by it. Shift + wheel moves sideways
  useEffect(() => {
    const el = svg.current; if (!el || st.on || steady) return;
    const wheel = (e: WheelEvent) => {
      const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const r = el.getBoundingClientRect(), c0 = cam0.current;
        zoomRef.current(Math.exp(e.deltaY * k * 0.01), { x: c0.x + ((e.clientX - r.left) / r.width) * c0.w, y: c0.y + ((e.clientY - r.top) / r.height) * c0.h });
        return;
      }
      if (!activeRef.current) return;
      e.preventDefault();
      if (e.shiftKey && !e.deltaX) panRef.current(e.deltaY * k, 0); else panRef.current(e.deltaX * k, e.deltaY * k);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [mode, st.on]);
  // a step's length: longer with sends (or a token that moves or is dropped); each beat (a "then" line) is that long again; pace slow or fast (format version 9)
  const PACE: Record<string, number> = { slow: 1.8, normal: 1, fast: 0.55 };
  const dur = (k: number) => (c.nest?.via[k] ? 1700 : c.fx[k]?.sends.length || c.fx[k]?.moved?.length || c.fx[k]?.dropped?.length ? 1500 : 850) * (c.fx[k]?.beats ?? 1) * (PACE[c.fx[k]?.pace && c.fx[k]?.pace !== "normal" ? c.fx[k]!.pace! : src.info.pace ?? "normal"] ?? 1);

  const go = (k: number, keepCam = false) => {
    const to = Math.max(0, Math.min(n - 1, k));
    if (to === i) return;
    cancelAnimationFrame(raf.current);
    setFrom(i); setI(to); setSel(null); setPickL(null);
    if (!keepCam) { setUser(null); s3.current?.back(); fitAsked.current = false; }
    if (reducedMotion()) { setT(1); return; }
    setT(0);
    const start = performance.now(), d = dur(to);
    // (format version 11) a frame's time can be a little before the click: clamped, so a step never runs back first
    const tick = (now: number) => { const p = stepT(now, start, d); setT(p); if (p < 1) raf.current = requestAnimationFrame(tick); };
    raf.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  // a press or a tap anywhere outside the part lets the stage go (a tap on a phone does not always move the focus)
  const root = useRef<HTMLDivElement>(null);
  // format version 10: live once it knows its width (and so its phone layout); until then a phone shows no server 2D
  // (the wide layout, words of about 6 px), see parts.css .js .scn:not([data-live])
  useEffect(() => { if (px0 > 0) root.current?.setAttribute("data-live", "1"); }, [px0]);
  // the phone's edge-to-edge part (parts.css) moves left by where its column starts: --bleed-l, read from the parent
  // (a column need not be centred on the page)
  useEffect(() => {
    const el = root.current, par = el?.parentElement; if (!el || !par) return;
    const set = () => { const r = par.getBoundingClientRect(), s = getComputedStyle(par); el.style.setProperty("--bleed-l", `${(r.left + parseFloat(s.borderLeftWidth) + parseFloat(s.paddingLeft)).toFixed(2)}px`); };
    set();
    const ro = new ResizeObserver(set); ro.observe(document.documentElement); ro.observe(par);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!active) return;
    const out = (e: PointerEvent) => { if (root.current && !root.current.contains(e.target as Node)) setActive(false); };
    document.addEventListener("pointerdown", out, true);
    return () => document.removeEventListener("pointerdown", out, true);
  }, [active]);
  useEffect(() => {
    if (!playing || st.on) return;
    if (i >= n - 1) { setPlaying(false); return; }
    const tm = setTimeout(() => go(i + 1), dur(i) + 1700);
    return () => clearTimeout(tm);
  }, [playing, i, st.on]);
  // the stage keeps its shape from the scene, but has a minimum height; read the real shape for the camera
  useEffect(() => {
    const el = stage.current; if (!el) return;
    const ro = new ResizeObserver(() => { const r = el.getBoundingClientRect(); if (r.width && r.height) { setAr(r.width / r.height); setPx(r.width); setPx0(r.width); } });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!n) return <div className="cw-error">This animation has nothing to draw.</div>;
  // format version 11: a still scene has the stage and the notes, and no player; its words for a screen reader are its setup
  const stageWords = still ? (src.part ? srText ?? src.title ?? "" : sceneLlm(c)) : src.steps[i]?.title ?? "";
  // a step into or out of a scene inside the scene (format version 10): the stage shows one scene at a time, the one
  // left in the first half and the next in the second; nothing tweens between two scenes, the camera zooms through
  const mv = sceneMove(c, from, i, t);
  const A = mv ? mv.frame : c.frames[from], B = mv ? mv.frame : c.frames[i];
  const forward = !mv && i === from + 1;
  const te = mv ? 1 : ease(t);
  const fx = mv ? { highlights: [], says: [], sends: [], spawn: {}, merge: {}, enter: [], touched: [] } as typeof c.fx[number] : c.fx[i];
  // beats (format version 9): a change after a "then" line starts when the ones before it end: the stage moves from
  // the frame at the end of one beat to the frame at the end of the next; backwards, everything moves at once
  const NB = forward ? Math.max(1, fx.beats ?? 1) : 1;
  const local = (b: number) => Math.max(0, Math.min(1, t * NB - b));
  // the beat now: things move from the frame at the end of the beat before to the frame at the end of this one
  const seg = NB < 2 ? 0 : Math.max(0, Math.min(NB - 1, Math.floor(t * NB)));
  const beatF = forward ? c.beats?.[i] ?? [] : [];
  const SA = NB < 2 || seg === 0 ? A : beatF[seg - 1] ?? A, SB = NB < 2 || seg === NB - 1 ? B : beatF[seg] ?? B;
  const tSeg = NB < 2 ? te : ease(local(seg));
  const teOf = (_b: Box) => tSeg;
  // spotlight (format version 9): this step dims everything but these things, what holds them and what they hold
  const spot = forward || i === from ? new Set(fx.spot ?? []) : new Set<number>();
  const lit = (b: Box): boolean => {
    if (!spot.size || spot.has(b.key)) return true;
    const by = new Map(B.boxes.filter((x) => x.key > 0).map((x) => [x.id, x]));
    for (let x: string | null = b.ent.parent ?? b.ent.anchor, n = 0; x && n < 64; x = by.get(x)?.ent.parent ?? null, n++) if (spot.has(by.get(x)?.key ?? NaN)) return true;
    return B.boxes.some((x) => spot.has(x.key) && x.container && (() => { for (let y: string | null = b.ent.parent, n = 0; y && n < 64; y = by.get(y)?.ent.parent ?? null, n++) if (y === x.id) return true; return false; })()) || B.boxes.some((x) => spot.has(x.key) && x.ent.parent === b.id);
  };
  const dimOf = (b: Box) => (lit(b) ? 1 : lerp(1, 0.22, i === from ? 1 : te));
  const arc = new Set(forward ? fx.arc ?? [] : []);
  // the story's focus (a layer) dims the other layers; the reader's own pick of a layer does the same
  const off = (f: Frame, L: number | undefined) => (f.focus != null && L !== f.focus ? 0.12 : 1);
  const fo = (b: Box, p?: Box) => lerp(off(A, (p ?? b).layer), off(B, b.layer), te) * (pickL != null && b.layer !== pickL ? 0.2 : 1);

  // ---- where every entity is at this moment
  const prev = new Map(SA.boxes.map((b) => [b.key, b]));
  const cur = new Map(B.boxes.map((b) => [b.key, b]));
  const curSeg = new Map(SB.boxes.map((b) => [b.key, b]));
  const shown: Shown[] = [];
  // (format version 11) only items that pass another of their row travel on an arc; a queue that moves up goes straight
  const pass = passing(SA.boxes, SB.boxes);
  const slabsA = slabsOf(SA.boxes), slabsB = SA === SB ? slabsA : slabsOf(SB.boxes);
  for (const b of SB.boxes) {
    const p = prev.get(b.key);
    if (p) {
      const tb = teOf(b);
      const r = lerpR(p, b, tb);
      // move ... path=arc: it travels over an arc, not straight (format version 9)
      if (arc.has(b.id) && (Math.abs(b.x - p.x) > 4 || Math.abs(b.y - p.y) > 4)) r.y -= Math.sin(Math.PI * tb) * Math.max(40, Math.hypot(b.x - p.x, b.y - p.y) * 0.35);
      // items of an array, list, stack or queue that trade places pass each other on an arc, not through each other
      // (format version 11) on the beat's own clock, so an arc never runs ahead of the move it rides on
      if (pass.has(b.key)) r.y += Math.sin(Math.PI * tb) * b.h * 0.75 * (b.x > p.x ? -1 : 1);
      // (format version 11) in 3D, how many slabs it stands on, from where it starts and where it ends: worked out live from
      // the tween, a thing that moved to another floor or parent dropped a slab or gained one half way, and hopped
      const nA = slabsA.get(b.key), nB = slabsB.get(b.key), moves = (p.ent.parent ?? p.ent.anchor) !== (b.ent.parent ?? b.ent.anchor) || p.layer !== b.layer || nA !== nB;
      shown.push({ box: b, r, ...(moves && nA != null && nB != null ? { slab: lerp(nA, nB, tb) } : {}), o: fo(b, p) * dimOf(b) * lerp(visOf(p), visOf(b), tb), enter: false, ly: r.y - lerp(bandOff(p), bandOff(b), tb), L: lerp(p.layer, b.layer, tb), g: lerp(gOfS(p), gOfS(b), tb), lift: lerp(liftOf(p), liftOf(b), tb) });
      continue;
    }
    const src0 = forward ? prev.get(fx.spawn[b.key]) : undefined;
    const tb = teOf(b);
    if (src0) { const r = lerpR(src0, b, tb); shown.push({ box: b, r, o: Math.min(1, tb * 2) * fo(b) * dimOf(b) * visOf(b), enter: true, ly: r.y - lerp(bandOff(src0), bandOff(b), tb), L: lerp(src0.layer, b.layer, tb), g: gOfS(b) }); }
    else { const s = lerp(0.85, 1, tb); const cc = center(b); const r = { x: cc.x - (b.w * s) / 2, y: cc.y - (b.h * s) / 2, w: b.w * s, h: b.h * s }; shown.push({ box: b, r, o: tb * fo(b) * dimOf(b) * visOf(b), enter: true, ly: r.y - bandOff(b), L: b.layer, g: gOfS(b), lift: liftOf(b) }); }
  }
  if (t < 1) for (const p of SA.boxes) {
    if (curSeg.has(p.key)) continue;
    const into = forward ? cur.get(c.fx[i].merge[p.key]) : undefined;
    const tp = teOf(p);
    // a dropped token (format version 9) travels to where it is lost, turns red, is crossed out and fades
    const dr = forward ? c.fx[i].dropped?.find((d) => d.key === p.key) : undefined;
    if (dr) { const s = droppedAt(p, dr.at != null ? cur.get(dr.at) ?? prev.get(dr.at) : undefined, tp); shown.push({ ...s, ly: s.r.y - bandOff(p), L: p.layer, g: gOfS(p), o: s.o * fo(p) * visOf(p) }); continue; }
    const r = into ? lerpR(p, into, tp) : p;
    shown.push({ box: p, r, o: (1 - tp) * fo(p) * visOf(p), enter: false, ly: r.y - bandOff(into ?? p), L: into ? lerp(p.layer, into.layer, te) : p.layer, g: gOfS(p) });
  }
  for (const s of shown) if (s.box.kind === "pointer") s.anchorY = B.boxes.find((x) => x.id === s.box.ent.anchor)?.y;
  for (const s of shown) if (s.box.ent.level != null) { const p = prev.get(s.box.key)?.ent.level; s.lv = lerp(p ?? s.box.ent.level, s.box.ent.level, te); }
  const at = new Map(shown.map((s) => [s.box.key, s]));
  const edgesNow: { e: Edge; o: number }[] = [];
  const prevEdges = new Set(SA.edges.map((e) => e.key));
  const curEdges = new Set(SB.edges.map((e) => e.key));
  const teEdge = (_e: Edge) => tSeg;
  const litEdge = (e: Edge) => { if (!spot.size) return 1; const a = at.get(e.from), b = at.get(e.to); return a && b && lit(a.box) && lit(b.box) ? 1 : dimOf(a?.box ?? b!.box); };
  // a connector that stays keeps sliding its ends to their new places along the step (format version 10)
  const prevEdge = new Map(SA.edges.map((e) => [e.key, e]));
  for (const e of SB.edges) { const ea = t < 1 ? prevEdge.get(e.key) : undefined; edgesNow.push({ e: ea && ea.rt && e.rt ? { ...e, rt: lerpRoute(ea.rt, e.rt, tSeg) } : e, o: (prevEdges.has(e.key) ? 1 : teEdge(e)) * litEdge(e) }); }
  if (t < 1) for (const e of SA.edges) if (!curEdges.has(e.key)) edgesNow.push({ e, o: 1 - teEdge(e) });

  // ---- the camera: the story's, unless the reader moved it
  // the story's camera (tools/scene.ts storyView): what the author framed plus everything this step touches, in frame
  const whV = whole ? wholeView(c, ar, px) : null;
  // (format version 11, one focus at a time) at rest only the token the step is about keeps its words; the others keep
  // their pills (core/calm.ts tokenSubject)
  const tokIds = tokenIds(c);
  const tokS = tokenSubject(B, src.steps[i]?.raw ?? "", tokIds), tokMute = (s: Shown) => !!tokS && s.box.kind === "token" && !tokS.includes(s.box.key);
  // a step the author zoomed says so under its caption ("Zoomed in: router"), so the closer view does not read as a jump
  const zoomCue = (k: number) => {
    const f = c.frames[k], names = (f?.look ?? []).map((q) => f.boxes.find((b) => b.key === q)?.label).filter(Boolean);
    return names.length ? <em className="scn-zoomed">{(ui as any).zoomedIn ?? "Zoomed in"}: {names.join(", ")}</em> : null;
  };
  // (format version 11) one held view from one camera word to the next (core/calm.ts heldViews): the steps between share
  // one view of all they touch, so the camera moves only at a zoom in or out. The held view also holds in the second half
  // of a move between scenes
  const held = whole || (mv && mv.half === 0) ? null : heldViews(c, ar, px), hB = held?.[i], hA = held?.[from];
  const vB = whV ?? storyView(hB?.frame ?? B, ar, px), story = mv ? moveCam(mv, vB, ar) : user || (hB && hA === hB) ? vB : lerpR(whV ?? storyView(hA?.frame ?? A, ar, px), vB, te);
  const swipeB = swipeW ? union(oneS!.frames.map((f) => f.bounds)) : null;
  const cam = swipeB ? { x: swipeB.x - (natS!.w - swipeB.w) / 2, y: swipeB.y - (natS!.h - swipeB.h) / 2, w: natS!.w, h: natS!.h } : st.on || fixed ? staticView(oneStep(c, i), px ? ar : stageAr, px) : user && !mv ? fitAspect(user, ar) : story;
  const all = fitAspect(pad(union(sceneFrames(c, i).map((f) => f.bounds)), 24), ar);
  const stageO = moveO(mv);
  const toWorld = (dx: number, dy: number) => { const r = svg.current!.getBoundingClientRect(); return { x: (dx / r.width) * cam.w, y: (dy / r.height) * cam.h }; };
  // move the view by screen pixels (the wheel, the arrow keys): the scene moves the other way, as a page does
  const panBy = (dx: number, dy: number) => { if (!svg.current) return; const wv = toWorld(dx, dy); setUser({ ...cam, x: cam.x + wv.x, y: cam.y + wv.y }); };
  panRef.current = panBy;
  const zoomBy = (f: number, at?: { x: number; y: number }) => {
    const base = cam, c0 = at ?? center(base);
    const w = Math.min(Math.max(base.w * f, 60), all.w * 3), h = w / ar;
    const k = w / base.w;
    setUser({ x: c0.x - (c0.x - base.x) * k, y: c0.y - (c0.y - base.y) * k, w, h });
  };
  // ---- pointer: drag pans, two fingers pinch, a click on an entity opens its note
  zoomRef.current = zoomBy;
  cam0.current = cam;
  const onDown = (e: React.PointerEvent) => {
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!steady) (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const ps = [...ptrs.current.values()];
    // the entity under the finger, read now: after pointer capture the release is aimed at the stage itself
    const key = (e.target as Element).closest?.("[data-key]")?.getAttribute("data-key") ?? null;
    drag.current = { x: e.clientX, y: e.clientY, cam, moved: false, dist: ps.length === 2 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : undefined, key };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d || !ptrs.current.has(e.pointerId)) return;
    if (steady) { if (Math.hypot(e.clientX - d.x, e.clientY - d.y) >= 5) d.moved = true; return; }
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const ps = [...ptrs.current.values()];
    if (ps.length === 2 && d.dist) {
      const dist = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
      const k = d.dist / dist;
      const c0 = center(d.cam);
      const w = Math.min(Math.max(d.cam.w * k, 60), all.w * 3);
      setUser({ x: c0.x - w / 2, y: c0.y - w / ar / 2, w, h: w / ar });
      d.moved = true; return;
    }
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 5) return;
    d.moved = true;
    const wv = toWorld(dx, dy);
    setUser({ ...d.cam, x: d.cam.x - wv.x, y: d.cam.y - wv.y });
  };
  // on a phone, a view the story picks for the reader (a tap on a thing or a layer frames it) keeps the words readable:
  // no wider than the phone's least scale allows, around the same centre
  const readable = (r: Rect): Rect => {
    if (!phone || !px) return r;
    const wMax = px / Math.max(0.8, phoneLeast(B));
    if (r.w <= wMax) return r;
    const cc = center(r), h = wMax / ar;
    return { x: cc.x - wMax / 2, y: cc.y - h / 2, w: wMax, h };
  };
  const onUp = (e: React.PointerEvent) => {
    ptrs.current.delete(e.pointerId);
    const d = drag.current;
    if (!ptrs.current.size) drag.current = null;
    if (d && !d.moved) {
      const k = d.key;
      if (steady) { setSel(k && +k > 0 ? +k : null); return; } // a tap reads a note, and moves nothing
      if (k && +k < 0) { const b = cur.get(+k); setPickL(-(+k) - 1); setSel(null); if (b) setUser(readable(fitAspect(pad(b, 20), ar))); }
      else if (k) { const key = +k; setSel(key); setPickL(null); const b = cur.get(key); if (b) setUser(readable(fitAspect(pad(b, Math.max(40, b.w * 0.6)), ar))); }
      else { setSel(null); setPickL(null); }
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest("input,select,textarea,summary")) return;
    if (e.key === "ArrowRight") { go(i + 1); e.preventDefault(); }
    else if (e.key === "ArrowLeft") { go(i - 1); e.preventDefault(); }
    else if (e.key === "+" || e.key === "=") { zoomIn(); e.preventDefault(); }
    else if (e.key === "-") { zoomOut(); e.preventDefault(); }
    else if (e.key === "0" || e.key === "Escape") backToStory();
  };

  // ---- draw: containers (outer first), connectors, shapes, tokens; then this step's speech and travelling tokens
  const hl = new Map(fx.highlights.map((h) => [h.key, h.tone]));
  const conts = shown.filter((s) => s.box.container).sort((a, b) => a.box.depth - b.box.depth);
  const leaves = shown.filter((s) => !s.box.container && !["token", "pointer"].includes(s.box.kind));
  const overlays = shown.filter((s) => ["token", "pointer"].includes(s.box.kind));
  const fxO = Math.max(0, Math.min(1, (t - 0.55) / 0.45));
  const selBox = sel != null ? cur.get(sel) : null;
  const zoomIn = () => (mode === "3d" ? s3.current?.zoom(0.8) : zoomBy(0.8));
  const zoomOut = () => (mode === "3d" ? s3.current?.zoom(1.25) : zoomBy(1.25));
  const fitAll = () => { if (s3.current && mode === "3d") s3.current.fit(); else { fitAsked.current = true; setUser(all); } };
  function backToStory() { setUser(null); setSel(null); setPickL(null); s3.current?.back(); setUser3(false); fitAsked.current = false; }
  const moved = !!(user || user3 || pickL != null);
  // the stage's own keys, when it has focus: arrows move, + and - zoom, 0 or Esc go back to the story; in 3D, W A S D
  // walk over the ground as well. (The steps keep their keys on the rest of the part: arrows there, PageUp/PageDown here)
  const onStageKey = (e: React.KeyboardEvent) => {
    const k = e.key, step = 60;
    if (fixed && k !== "Enter") { if (k === "Escape") { setSel(null); e.stopPropagation(); } return; }
    if (steady && !["Enter", "Escape", "PageUp", "PageDown"].includes(k)) return; // no camera keys: the steps keep theirs
    const pan = (dx: number, dy: number) => { if (mode === "3d") s3.current?.pan(-dx, -dy); else panBy(dx, dy); };
    const walk = (f: number, sd: number) => s3.current?.walk(f, sd);
    let done = true;
    if (k === "ArrowLeft") pan(-step, 0); else if (k === "ArrowRight") pan(step, 0);
    else if (k === "ArrowUp") pan(0, -step); else if (k === "ArrowDown") pan(0, step);
    else if (k === "+" || k === "=") zoomIn(); else if (k === "-" || k === "_") zoomOut();
    else if (k === "0") backToStory();
    else if (k === "Escape") { backToStory(); setActive(false); }
    else if (k === "PageDown") go(i + 1); else if (k === "PageUp") go(i - 1);
    else if (mode === "3d" && (k === "w" || k === "W")) walk(1, 0); else if (mode === "3d" && (k === "s" || k === "S")) walk(-1, 0);
    else if (mode === "3d" && (k === "a" || k === "A")) walk(0, -1); else if (mode === "3d" && (k === "d" || k === "D")) walk(0, 1);
    else done = false;
    if (done) { e.preventDefault(); e.stopPropagation(); }
  };
  const toggle = () => { if (only3d) return; backToStory(); setMode(mode === "3d" ? "2d" : "3d"); };
  // in 3D, while a step plays (and until the reader pauses at its end), only who takes part shows a label
  // a 3D-only scene without 3D: its steps as a list stand in for the stage (no camera buttons, no "how to move")
  const listOnly = only3d && !st.on && mode !== "3d";
  const quiet = mode === "3d" && !labelsAll && !user3 && (t < 1 || playing || !rest);
  const layerName = (L: number) => B.layers[L]?.label ?? `${ui.layer ?? "layer"} ${L + 1}`;
  // ---- the same moment, for the 3D stage
  const sendP = forward ? Math.max(0, Math.min(1, (t - 0.12) / 0.88)) : 1;
  // streams that run in the step before and in this one keep flowing (format version 8): the same path keeps its key
  // and its dots and does not fade in again; a stream that stops fades out; only a step that starts one starts it
  const isStream = (g: SendGeom) => g.show === "stream";
  const streamKey = (g: SendGeom) => `st:${g.path.join(">")}`;
  const prevStreams = new Set(A.sends.filter(isStream).map(streamKey));
  const curStreams = new Set(B.sends.filter(isStream).map(streamKey));
  // a send runs in its own beat (format version 9)
  const sendPOf = (g: SendGeom, k = 0) => (isStream(g) && prevStreams.has(streamKey(g)) ? 1 : NB < 2 ? sendP : Math.max(0, Math.min(1, (local(fx.sendBeat?.[k] ?? 0) - 0.12) / 0.88)));
  const sayO = (k: number) => (!forward ? 1 : NB < 2 ? fxO : Math.max(0, Math.min(1, (local(fx.sayBeat?.[k] ?? 0) - 0.55) / 0.45)));
  const seenKey = new Map<string, number>();
  const sendKey = (g: SendGeom, k: number) => { if (!isStream(g)) return `s${i}-${k}`; const b = streamKey(g), n = seenKey.get(b) ?? 0; seenKey.set(b, n + 1); return n ? `${b}#${n}` : b; };
  const endingStreams = t < 1 && A !== B ? A.sends.filter((g) => isStream(g) && !curStreams.has(streamKey(g))) : [];
  if (mode === "3d") {
    const keyOf = new Map<string, number>([...A.boxes, ...B.boxes].map((b) => [b.id, b.key]));
    const item3 = (s: Shown, keyOf: Map<string, number>): Item3 => ({ key: s.box.key, id: s.box.id, kind: s.box.kind, label: s.box.label, ...(s.g != null && s.g < 1 ? { faint: s.g } : {}), size: s.box.size, cc: s.box.cc, fill: s.box.fill, pcc: s.box.pcc, container: s.box.container, bare: ["array", "list"].includes(s.box.kind), parent: s.box.ent.parent ? keyOf.get(s.box.ent.parent) ?? null : s.box.ent.anchor ? keyOf.get(s.box.ent.anchor) ?? null : null, tone: s.box.ent.tone, dim: s.box.ent.dim, down: s.box.ent.down, x: s.r.x, y: s.ly, w: s.r.w, h: s.r.h, L: s.L, o: s.o, depth: s.box.depth, ...(s.slab != null && !mv ? { slab: s.slab } : {}), ...(s.lift ? { lift: s.lift } : {}), ...(s.lv != null ? { lv: s.lv } : {}) });
    const items = shown.map((s) => item3(s, keyOf));
    if (mv) for (const it of items) it.o *= stageO;
    // (format version 11) inside a zoom, a thing outside what is zoomed into, and not touched in the held span, leaves the
    // stage: no thing stands half cut at the stage's edge. What holds the zoomed thing stays, and so does what the span
    // touches; the links to the rest stay too
    if (B.look?.length && !mv) {
      const byId = new Map(B.boxes.map((b) => [b.id, b])), upOf = (b: Box) => (b.ent.parent ?? b.ent.anchor ?? null) as string | null;
      const look = new Set(B.look.map((k) => B.boxes.find((b) => b.key === k)?.id).filter((x): x is string => !!x)), keep = new Set<string>(look);
      for (const id of look) for (let u = upOf(byId.get(id)!), m = 0; u && m < 64; u = byId.get(u) ? upOf(byId.get(u)!) : null, m++) keep.add(u);
      const touched = new Set(hB ? hB.steps.flatMap((k) => c.frames[k].touched) : B.touched);
      const inside = (b: Box) => { for (let x: Box | undefined = b, m = 0; x && m < 64; x = upOf(x) ? byId.get(upOf(x)!) : undefined, m++) if (look.has(x.id)) return true; return false; };
      const ctx = new Set(B.boxes.filter((b) => b.kind !== "layer" && !keep.has(b.id) && !touched.has(b.key) && !inside(b)).map((b) => b.key));
      for (const it of items) if (ctx.has(it.key)) it.faint = 0.001;
    }
    // the held view's things, each where its step ends: the 3D camera is worked out from these, never from a tween
    const hold = hB && {
      frames: hB.steps.map((k) => {
        const f = c.frames[k], ids = new Map(f.boxes.map((b) => [b.id, b.key]));
        return f.boxes.map((b) => item3({ box: b, r: b, o: visOf(b) * off(f, b.layer), enter: false, ly: b.y - bandOff(b), L: b.layer, g: gOfS(b), lift: liftOf(b) }, ids));
      }),
      touched: [...new Set(hB.steps.flatMap((k) => c.frames[k].touched))],
      least: Math.max(...hB.steps.map((k) => MIN_PX / minFont(c.frames[k]))),
      spread: c.frames[hB.steps[0]].spread ? 1 : 0,
    };
    // going in, the first half looks at the thing entered from, close
    const into = mv && mv.half === 0 && mv.dir === "in" && mv.viaKey != null ? mv : null;
    view3.current = {
      ...(hold ? { hold } : {}),
      items, edges: edgesNow.map(({ e, o }) => ({ ...e, o: o * stageO })),
      sends: (mv ? [] : B.sends).map((g, k) => ({ label: g.label, path: g.path, show: g.show, cc: g.cc, p: sendPOf(g, k), offs: g.offs, bends: g.bends, rts: g.rts })),
      says: fx.says.map((sy, k) => ({ key: sy.key, text: sy.text, o: sayO(k) })),
      hl: new Map(fx.highlights.map((h) => [h.key, h.tone])), sel,
      layers: B.layers, levels: B.levels, spread: lerp(A.spread ? 1 : 0, B.spread ? 1 : 0, te), focus: B.focus, look: into ? [into.viaKey as number] : B.look, touched: mv && !(mv.dir === "out" && mv.half === 1) ? [] : B.touched, foot, stepKey: String(i),
      cam: into ? { close: true, far: false, turn: B.view?.turn ?? null, tilt: B.view?.tilt ?? null } : B.view ?? null,
      part: quiet && B.part ? B.part : null,
      toks: tokS, // (format version 11) only the token the step is about keeps its label
      least: hold?.least ?? MIN_PX / minFont(B),
      // format version 10: the scene shown; going in, the first half flies into the thing entered from; the second
      // half starts far (going in) or at that thing (going out)
      scene: mv ? mv.scene : sceneNow, sceneDir: mv?.dir, ...(mv ? { fade: stageO } : {}), sceneVia: mv && mv.half === 1 && mv.dir === "out" ? mv.viaKey : null,
    };
  }
  const legend = src.part ? <span className="scn-legend scn-ttl" data-dh-slot="title">{src.title}</span> : families.length > 0 ? <ul className="scn-legend" aria-label={(ui as any).legend ?? "Colours"}>{families.map((k, n) => <li key={k.id} className={`scn-key cc cc-${n + 1}`}>{k.label}</li>)}</ul> : <span className="scn-legend" />;
  // the story camera keeps words readable, so a big scene can run past the stage: each edge with more of it beyond is
  // shaded, with a small arrow (format version 8 on a phone; format version 10 on every screen, tools/readable.ts), and
  // on a phone the line under the stage says so
  // (format version 10, tools/edge10.ts: a side where the view cuts a thing is shaded too)
  const more: ("l" | "r" | "t" | "b")[] = mode === "2d" ? moreSides(B, cam) : [];
  // (format version 11) a scene taller than its frame says so in words, where it is cut
  const downMore = more.includes("b") ? "b" : more.includes("t") ? "t" : null;
  const U = ui as any;
  const touchHint = mode === "3d"
    ? (active ? U.hintTouchOn3d ?? "One finger: turn · two fingers: move and zoom · tap outside the stage to scroll the page" : U.hintTouch3d ?? "Drag sideways to turn · tap the stage, then one finger turns and two fingers move and zoom")
    : (active ? U.hintTouchOn ?? "One finger: move · two fingers: zoom · tap outside the stage to scroll the page" : U.hintTouch ?? "Tap the stage, then drag with one finger to move · pinch to zoom") + (more.length ? ` · ${U.hintMore ?? "a shaded edge has more that way"}` : "");
  const shortHint = mode === "3d" ? (active ? U.hintShortOn3d ?? "1 finger: turn · 2: move, zoom" : U.hintShort3d ?? "Drag to turn") : (active ? U.hintShortOn ?? "Drag: move · pinch: zoom" : U.hintShort ?? "Tap, then drag to move");
  const hint = phone ? touchHint
    : !active
    ? (mode === "3d" ? (ui as any).hintOff3d ?? "Drag to turn, right-drag or Shift + drag to move · click the stage to use the wheel and the keys" : (ui as any).hintOff ?? "Drag to move · click the stage to use the wheel and the arrow keys")
    : (mode === "3d" ? (ui as any).hintOn3d ?? "Drag: turn · right-drag, Shift + drag or two fingers: move · wheel or pinch: zoom · arrows, W A S D: move · + −: zoom · Esc: back" : (ui as any).hintOn ?? "Drag, scroll or arrow keys: move · Ctrl + scroll, pinch or + −: zoom · Esc: back to the story");
  const tools = (
    <div className="scn-tools" role="group" aria-label={ui.camera ?? "Camera"}>
      {moved && <button type="button" className="scn-back" onClick={backToStory}>{ui.backToStory ?? "Back to the story"}</button>}
      <button type="button" className="scn-reset" onClick={backToStory} disabled={!moved} aria-label={(ui as any).resetView ?? "Reset the view"} title={(ui as any).resetView ?? "Reset the view"}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8a4.5 4.5 0 1 0 1.4-3.3M3.2 2.6v2.6h2.6" /></svg></button>
      {ok3d && !only3d && !src.part && <button type="button" className="scn-mode" onClick={toggle} aria-pressed={mode === "3d"} aria-label={mode === "3d" ? ui.show2d ?? "Show flat (2D)" : ui.show3d ?? "Show in 3D"} title={mode === "3d" ? ui.show2d ?? "Show flat (2D)" : ui.show3d ?? "Show in 3D"}>{mode === "3d" ? "2D" : "3D"}</button>}
      <button type="button" onClick={zoomOut} aria-label={ui.zoomOut ?? "Zoom out"} title={ui.zoomOut ?? "Zoom out"}>−</button>
      <button type="button" onClick={zoomIn} aria-label={ui.zoomIn ?? "Zoom in"} title={ui.zoomIn ?? "Zoom in"}>+</button>
      <button type="button" onClick={fitAll} aria-label={ui.fitAll ?? "Show everything"} title={ui.fitAll ?? "Show everything"} className="scn-fit"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" /></svg></button>
    </div>
  );
  return (
    <div ref={root} data-dh-part={src.part} className={cx("scn", !st.on && !fixed && active && "is-active", fixed && "is-fixed", steady && "is-steady", still && "is-still", whole && "is-whole", st.on && "is-static", swipeW > 0 && "is-swipe", !!tall && "is-tall")} data-variant={pKey} data-static={st.on ? String(i + 1) : undefined} data-dh-static={st.on || undefined}
      tabIndex={st.on || fixed ? undefined : 0} onKeyDown={st.on || fixed ? undefined : onKey} aria-roledescription={st.on ? undefined : "animation"}>
      {srText && <p className="sr-only">{srText}</p>}
      {/* the controls sit in a bar above the stage, so they never cover what the story shows */}
      {/* SPEC 4.1: static has no control row; a steady scene keeps the bar only for its colour key */}
      {((!st.on && !steady) || (src.part ? !!src.title : families.length > 0)) && <div className="scn-bar">
        {legend}
        {!listOnly && !st.on && !steady && tools}
      </div>}
      <div className="scn-stage" ref={stage} data-more={swipeW ? swipeMore || undefined : undefined} onScroll={swipeW ? (e) => { const w = e.currentTarget; setSwipeMore((w.scrollLeft > 2 ? "l" : "") + (w.scrollLeft + w.clientWidth < w.scrollWidth - 2 ? "r" : "")); } : undefined} style={{ ["--ar" as any]: (tall ? px0 / tall : stageAr).toFixed(3), ...(swipeW ? { ["--swipe-w" as any]: `${swipeW}px` } : {}) }} tabIndex={(st.on || fixed) && !swipeW ? undefined : 0} aria-label={(ui as any).stageLabel ?? "The stage: drag, scroll or use the arrow keys to move"}
        onKeyDown={st.on ? undefined : onStageKey} onPointerDownCapture={st.on || fixed ? undefined : () => setActive(true)} onFocus={st.on || fixed ? undefined : () => setActive(true)}
        onBlur={(e) => { if (!e.currentTarget.closest(".scn")?.contains(e.relatedTarget as Node | null)) setActive(false); }}>
        {mode === "3d" ? <div ref={host3} className="scn3" aria-label={stageWords} role="img">{loading3d && <div className="scn3-loading">{ui.loading3d}</div>}</div>
        : only3d && !st.on ? <div className="scn-only3d" role="note"><p>{still ? stageWords : U.only3d ?? "This scene is drawn in 3D only. Without 3D (WebGL), here are its steps:"}</p><ol>{src.steps.map((s, k) => <li key={k} className={cx(k === i && "is-cur")} aria-current={k === i ? "step" : undefined}>{s.title}</li>)}</ol></div>
        : <svg ref={svg} className="scn-svg" viewBox={`${cam.x.toFixed(1)} ${cam.y.toFixed(1)} ${cam.w.toFixed(1)} ${cam.h.toFixed(1)}`} preserveAspectRatio="xMidYMid meet"
          onPointerDown={st.on ? undefined : onDown} onPointerMove={st.on ? undefined : onMove} onPointerUp={st.on ? undefined : onUp} onPointerCancel={(e) => { ptrs.current.delete(e.pointerId); drag.current = null; }} role="img" aria-label={stageWords} style={stageO < 1 ? { opacity: stageO } : undefined}>
          <defs>
            <marker id={mk} className="scn-mk" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" /></marker>
            {families.map((_, k) => <marker key={k} id={`${mk}-c${k + 1}`} className={`scn-mk cc cc-${k + 1}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" /></marker>)}
            <filter id={`${mk}-sh`} x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="1" stdDeviation="1.4" floodOpacity="0.12" /></filter>
          </defs>
          {conts.map((s) => <Shape key={s.box.key} s={s} mute={tokMute(s)} slot={slotOf(src.part, s.box)} hl={hl.get(s.box.key)} sel={sel === s.box.key} sh={mk} Z={Z} />)}
          {edgesNow.map(({ e, o }) => { const a = at.get(e.from), b = at.get(e.to); return a && b ? <Connector sl={lineSlots(src.part)} key={e.key} e={e} a={endRect(a)} b={endRect(b)} ak={a.box.kind} bk={b.box.kind} o={o * Math.min(a.o, b.o)} mk={mk} /> : null; })}
          {leaves.map((s) => <Shape key={s.box.key} s={s} mute={tokMute(s)} slot={slotOf(src.part, s.box)} hl={hl.get(s.box.key)} sel={sel === s.box.key} sh={mk} Z={Z} />)}
          {(mv ? [] : B.sends).map((g, k) => <Send key={sendKey(g, k)} g={g} at={at} fin={cur} marks={B.marks} p={sendPOf(g, k)} still={st.on} />)}
          {(mv ? [] : edgesNow).filter(({ e }) => e.lr && B.sends.some((g) => g.path.some((_, k) => k + 1 < g.path.length && ridesOn(B, g, k)?.key === e.key))).map(({ e, o }) => { const a = at.get(e.from), b = at.get(e.to); return a && b ? <Connector sl={lineSlots(src.part)} key={`l-${e.key}`} e={e} a={endRect(a)} b={endRect(b)} ak={a.box.kind} bk={b.box.kind} o={o * Math.min(a.o, b.o)} mk={mk} labelOnly /> : null; })}
          {endingStreams.map((g, k) => <Send key={`end-${streamKey(g)}-${k}`} g={g} at={at} fin={prev} marks={A.marks} p={1} o={1 - te} />)}
          {overlays.map((s) => <Shape key={s.box.key} s={s} mute={tokMute(s)} hl={hl.get(s.box.key)} sel={sel === s.box.key} sh={mk} Z={Z} />)}
          {(mv ? [] : B.marks).filter((m) => m.kind === "say").map((m, k) => { const s = at.get(m.at); return s ? <Say key={`y${i}-${k}`} m={m} r={s.r} o={sayO(k)} /> : null; })}
        </svg>}
        {!st.on && !fixed && more.length > 0 && <div className="scn-more" aria-hidden="true">{more.map((sd) => <span key={sd} className={`scn-more-${sd}`} />)}{downMore && <em className="scn-more-say" data-side={downMore}>{downMore === "b" ? "↓" : "↑"} {U.moreBeyond ?? "more beyond the edge"}</em>}</div>}
        {!st.on && selBox && <div className="scn-info" role="status"><b>{selBox.label || selBox.id}</b><span className="scn-kind">{wordOf(src.part, selBox)}{selBox.ent.parent ? ` · ${ui.inside ?? "in"} ${B.boxes.find((x) => x.id === selBox.ent.parent)?.label || selBox.ent.parent}` : ""}{B.layers.length ? ` · ${ui.layer ?? "layer"} ${layerName(selBox.layer)}` : ""}</span>{selBox.ent.note ? <span className="scn-note">{selBox.ent.note}</span> : <span className="scn-note scn-nonote">{ui.noNote ?? "No note."}</span>}</div>}
        {!st.on && !selBox && pickL != null && <div className="scn-info" role="status"><b>{layerName(pickL)}</b><span className="scn-kind">{ui.layer ?? "layer"} {pickL + 1} / {B.levels}</span>{B.layers[pickL]?.note ? <span className="scn-note">{B.layers[pickL].note}</span> : <span className="scn-note scn-nonote">{ui.noNote ?? "No note."}</span>}</div>}
      </div>
      {/* how to move: always shown, under the stage, so it never covers the scene */}
      {/* format version 9: one line; on a phone a short one; the ? button shows the whole of it */}
      {swipeW > 0 && <p className="table-more scn-swipe-more">{U.hintSwipe ?? "↔ Swipe to see all of it"}</p>}
      {!listOnly && !st.on && !steady && <div className="scn-hint"><span className="scn-hint-t" aria-hidden="true" title={hint}>{phone ? shortHint : hint}</span><button type="button" className="scn-how" aria-expanded={howOpen} aria-label={U.howTo ?? "How to move"} title={hint} onClick={() => setHowOpen((o) => !o)}>?</button></div>}
      {howOpen && !listOnly && !st.on && !steady && <p className="scn-how-full" role="note">{hint}</p>}
      {st.on && <StaticSteps titles={src.steps.map((s) => s.title)} i={i} label={ui.allSteps} print={st.print} />}
      {!still && !st.on && <><div className="scn-caps" aria-live="polite">
        {src.steps.map((s, k) => <div key={k} className={cx("scn-cap", k === i && "is-active")} aria-hidden={k !== i}><span className="cw-num">{k + 1}</span><span><SceneChip c={c} k={k} ui={U} />{s.title}{zoomCue(k)}</span></div>)}
      </div>
      <Controls ui={ui} i={i} n={n} bands={sceneBands(c)} onGo={(k) => go(k)} playing={playing} onPlay={() => { if (!playing) go(i === n - 1 ? 0 : i + 1); setPlaying(!playing); }} />
      <details className="scn-steps">
        <summary>{ui.allSteps ?? "All steps"} ({n})</summary>
        {c.nest ? <StepList c={c} titles={src.steps.map((s) => s.title)} i={i} go={(k) => go(k)} /> : <ol>{src.steps.map((s, k) => <li key={k}><button type="button" className={cx(k === i && "is-cur")} onClick={() => go(k)}>{s.title}</button></li>)}</ol>}
      </details></>}
    </div>
  );
}

// ---------------------------------------------------------------- shapes, drawn from the engine's size tokens (tools/scene.ts DESIGN)
// words: lines centred on a point, one line height apart
function Words({ lines, x, y, z, cls = "scn-label", font }: { lines: string[]; x: number; y: number; z: SizeTok; cls?: string; font?: number }) {
  if (!lines.length) return null;
  const lh = font ? Math.round(font * 1.3) : z.lh;
  const y0 = y - ((lines.length - 1) * lh) / 2;
  return <text x={x} y={y0} className={cls} dominantBaseline="central" textAnchor="middle" style={{ fontSize: font ?? z.font }}>{lines.map((l, k) => <tspan key={k} x={x} y={y0 + k * lh}>{l}</tspan>)}</text>;
}
function Shape({ s, hl, sel, sh, Z = DESIGN, mute, slot }: { slot?: string; s: Shown; hl?: string; sel: boolean; sh: string; Z?: Record<string, SizeTok>; mute?: boolean }) {
  const { box: b, r } = s;
  const o = s.o * (s.g ?? 1), wo = wordsO(s.g);
  const e = b.ent;
  const z = Z[b.size] ?? Z.m;
  const tone = `tone-${e.tone}`;
  // a family's colour, when the thing has no tone (a tone is a state: good, warn, hot ... and wins)
  // fill-none: the border only; is-same: inside a container of its own family, it drops the tint to stand out
  const cc = b.cc && e.tone === "plain" ? cx(`cc cc-${b.cc}`, b.fill === "none" && "fill-none", b.pcc === b.cc && "is-same") : null;
  const cls = cx("scn-ent", `k-${b.kind}`, `sz-${b.size}`, tone, cc, e.dim && "is-dim", e.down && "is-down", hl && `is-hl hl-${hl}`, sel && "is-sel");
  const tx = r.x + r.w / 2, ty = r.y + r.h / 2;
  const lb = labelBox(b.kind, r, b.lines, z, e.level != null);
  // a meter (level=): a bar along the bottom in an outlined track, filled to the level (format version 10 fix: taller,
  // with an outline, so a full one still reads as a gauge, not a line)
  const meter = s.lv != null && b.kind !== "layer" ? (() => { const inX = b.container ? z.pad : Math.max(8, z.px - 4), w = r.w - 2 * inX, y = r.y + r.h - (b.container ? z.pad - 2 + METER_H - 4 : METER_H + 5); return <g className="scn-meter"><rect className="scn-meter-track" x={r.x + inX} y={y} width={w} height={METER_H} rx={METER_H / 2} /><rect className="scn-meter-fill" x={r.x + inX} y={y} width={Math.max(0, (w * s.lv!) / 100)} height={METER_H} rx={METER_H / 2} /></g>; })() : null;
  // inside a closed thing the words are hidden; they fade in as it opens
  const words = lb && wo > 0.02 ? <g style={wo < 1 ? { opacity: wo } : undefined}><Words lines={b.lines} x={tx} y={lb.y + lb.h / 2} z={z} /></g> : null;
  const title = <title>{[b.label || b.id, e.note].filter(Boolean).join(" · ")}</title>;
  const shadow = { filter: `url(#${sh}-sh)` };
  let body: React.ReactNode;
  if (b.kind === "layer") body = <><rect className="scn-band" x={r.x} y={r.y} width={r.w} height={r.h} rx={z.r + 6} /><text x={r.x + 12} y={ty} className="scn-band-t" dominantBaseline="central" style={{ fontSize: z.head }}>{b.label}</text></>;
  else if (b.container) {
    const head = b.head && wo > 0.02 ? <text x={r.x + (b.lbl ? b.lbl.x - b.x : z.pad)} y={r.y + b.head / 2 + 2} className="scn-head" dominantBaseline="central" style={{ fontSize: z.head, ...(wo < 1 ? { opacity: wo } : {}) }}>{b.label}</text> : null;
    if (b.kind === "record") body = <RecordBox b={b} r={r} o={wo} />;
    else if (b.kind === "array" || b.kind === "list") body = head;
    else if (b.kind === "stack") body = <>{head}<path className="scn-frame scn-open" d={`M${r.x} ${r.y + b.head}V${r.y + r.h}H${r.x + r.w}V${r.y + b.head}`} /></>;
    else if (b.kind === "queue") body = <>{head}<path className="scn-frame scn-open" d={`M${r.x} ${r.y + b.head}H${r.x + r.w}M${r.x} ${r.y + r.h}H${r.x + r.w}`} /></>;
    else if (b.kind === "bucket") body = <><rect className="scn-frame scn-bucket" x={r.x} y={r.y} width={r.w} height={r.h} rx={z.r} /><rect className="scn-idx-cell" x={r.x} y={r.y} width={30} height={r.h} rx={z.r} /><text x={r.x + 15} y={ty} className="scn-idx" textAnchor="middle" dominantBaseline="central">{b.label}</text></>;
    else if (b.kind === "table") {
      const cols: number[] = (e as any)._cols ?? [];
      let x = r.x + z.pad;
      body = <>{<rect className={cx("scn-frame", `d-${b.depth % 2}`)} x={r.x} y={r.y} width={r.w} height={r.h} rx={z.r + 4} />}{head}{(e.cells ?? []).map((v, k) => { const el = <text key={k} x={x + (cols[k] ?? 60) / 2} y={r.y + b.head + z.pad + (z.minH - 8) / 2} className="scn-th" textAnchor="middle" dominantBaseline="central" style={{ fontSize: z.head, opacity: wo }}>{wo > 0.02 ? v : ""}</text>; x += cols[k] ?? 60; return el; })}</>;
    }
    else body = <><rect className={cx("scn-frame", `d-${b.depth % 2}`)} x={r.x} y={r.y} width={r.w} height={r.h} rx={z.r + 4} />{head}</>;
  } else switch (b.kind) {
    case "circle": body = <><circle className="scn-shape" style={shadow} cx={tx} cy={ty} r={Math.min(r.w, r.h) / 2} />{words}</>; break;
    case "pill": body = <><rect className="scn-shape" style={shadow} x={r.x} y={r.y} width={r.w} height={r.h} rx={Math.min(r.h / 2, 18)} />{words}</>; break;
    case "cylinder": { const ry = cylRy(z); body = <><path className="scn-shape" style={shadow} d={`M${r.x} ${r.y + ry}A${r.w / 2} ${ry} 0 0 1 ${r.x + r.w} ${r.y + ry}V${r.y + r.h - ry}A${r.w / 2} ${ry} 0 0 1 ${r.x} ${r.y + r.h - ry}Z`} /><path className="scn-line" d={`M${r.x} ${r.y + ry}A${r.w / 2} ${ry} 0 0 0 ${r.x + r.w} ${r.y + ry}`} />{words}</>; break; }
    case "cloud": { const { x, y, w, h } = r; body = <><path className="scn-shape" style={shadow} d={`M${x + w * 0.22} ${y + h * 0.92}C${x - w * 0.02} ${y + h * 0.92} ${x - w * 0.02} ${y + h * 0.42} ${x + w * 0.2} ${y + h * 0.42}C${x + w * 0.22} ${y + h * 0.06} ${x + w * 0.56} ${y - h * 0.02} ${x + w * 0.64} ${y + h * 0.28}C${x + w * 0.8} ${y + h * 0.14} ${x + w * 1.02} ${y + h * 0.32} ${x + w * 0.9} ${y + h * 0.56}C${x + w * 1.04} ${y + h * 0.66} ${x + w * 0.98} ${y + h * 0.94} ${x + w * 0.8} ${y + h * 0.92}Z`} />{words}</>; break; }
    case "person": { const I = personIcon(z), hr = I * 0.24; body = <><g className="scn-person"><circle className="scn-shape" cx={tx} cy={r.y + hr + 1} r={hr} /><path className="scn-shape" d={`M${tx - I * 0.42} ${r.y + I}a${I * 0.42} ${I * 0.42} 0 0 1 ${I * 0.84} 0z`} /></g>{words}</>; break; }
    case "diamond": body = <><path className="scn-shape" style={shadow} d={`M${tx} ${r.y}L${r.x + r.w} ${ty}L${tx} ${r.y + r.h}L${r.x} ${ty}Z`} />{words}</>; break;
    case "field": body = <FieldRow b={b} r={r} o={wo} />; break;
    case "initial": body = <circle className="scn-dot-fill" cx={tx} cy={ty} r={r.w / 2 - 1} />; break;
    case "final": body = <><circle className="scn-ring-out" cx={tx} cy={ty} r={r.w / 2 - 1} /><circle className="scn-dot-fill" cx={tx} cy={ty} r={r.w / 2 - 5.5} /></>; break;
    case "text": body = <Words lines={b.lines} x={tx} y={ty} z={z} cls="scn-label scn-text" />; break;
    case "dot": body = <><circle className="scn-shape scn-dot" cx={tx} cy={r.y + 8} r={6} />{words}</>; break;
    // a token is small: a dot and a short word, next to what it sits on
    case "token": body = <><rect className="scn-chip" x={r.x} y={r.y} width={r.w} height={r.h} rx={r.h / 2} /><circle className="scn-chip-dot" cx={r.x + 9} cy={ty} r={CHIP.dot} />{wo > 0.02 && <text x={r.x + 10 + (r.w - 10) / 2} y={ty} className={mute ? "scn-chip-t is-mute" : "scn-chip-t"} textAnchor="middle" dominantBaseline="central" style={wo < 1 ? { opacity: wo } : undefined}>{b.lines[0] ?? b.label}</text>}</>; break;
    case "pointer": {
      // above its anchor it points down; below it, up
      const up = s.anchorY != null && r.y > s.anchorY;
      body = up
        ? <><path className="scn-ptr" d={`M${tx} ${r.y + 2}V${r.y + r.h - 16}M${tx - 4} ${r.y + 7}L${tx} ${r.y + 2}L${tx + 4} ${r.y + 7}`} /><text x={tx} y={r.y + r.h - 7} className="scn-ptr-t" textAnchor="middle" dominantBaseline="central">{b.label}</text></>
        : <><text x={tx} y={r.y + 7} className="scn-ptr-t" textAnchor="middle" dominantBaseline="central">{b.label}</text><path className="scn-ptr" d={`M${tx} ${r.y + 16}V${r.y + r.h - 2}M${tx - 4} ${r.y + r.h - 7}L${tx} ${r.y + r.h - 2}L${tx + 4} ${r.y + r.h - 7}`} /></>;
      break;
    }
    case "row": {
      const cols: number[] = (e as any)._cols ?? [];
      let x = r.x;
      body = <><rect className="scn-shape scn-row" x={r.x} y={r.y} width={r.w} height={r.h} />{(e.cells ?? []).map((v, k) => { const w = cols[k] ?? 60; const el = <g key={k}>{k > 0 && <line className="scn-line" x1={x} x2={x} y1={r.y} y2={r.y + r.h} />}<text x={x + w / 2} y={ty} className="scn-label" textAnchor="middle" dominantBaseline="central" style={{ fontSize: z.font, opacity: wo }}>{wo > 0.02 ? v : ""}</text></g>; x += w; return el; })}</>;
      break;
    }
    default: body = <><rect className="scn-shape" style={b.parentKind && ["array", "stack", "queue", "list", "bucket"].includes(b.parentKind) ? undefined : shadow} x={r.x} y={r.y} width={r.w} height={r.h} rx={b.parentKind && ["array", "stack", "queue", "list", "bucket"].includes(b.parentKind) ? Math.max(4, z.r - 3) : z.r} />{words}</>;
  }
  const rr = b.kind === "field" ? 4 : b.kind === "circle" ? Math.min(r.w, r.h) / 2 + 4 : b.kind === "pill" ? Math.min((r.h + 8) / 2, 22) : z.r + 3;
  // cells of an array sit 4 apart: their rings hug them, so two lit neighbours do not run into each other
  const rp = b.kind === "field" ? 0.5 : b.parentKind && ["array", "stack", "queue"].includes(b.parentKind) ? 1.5 : 4;
  const ring = (hl || sel) && !["text", "token", "pointer"].includes(b.kind) ? <rect className="scn-ring" x={r.x - rp} y={r.y - rp} width={r.w + 2 * rp} height={r.h + 2 * rp} rx={rr - 4 + rp} /> : null;
  const x = e.down ? <path className="scn-x" d={`M${r.x + 6} ${r.y + 6}L${r.x + r.w - 6} ${r.y + r.h - 6}M${r.x + r.w - 6} ${r.y + 6}L${r.x + 6} ${r.y + r.h - 6}`} /> : null;
  const idx = b.index != null && wo > 0.02 ? <text x={b.x + b.w / 2} y={b.y + b.h + 11} className="scn-idx" textAnchor="middle" dominantBaseline="central">{b.index}</text> : null;
  return <g className={cls} data-key={b.key} data-dh-slot={slot} style={{ opacity: o }}>{title}{ring}{body}{meter}{idx}{x}</g>;
}

// labelOnly (format version 10): just the label, drawn again over a send that runs on this connector
function Connector({ e, a, b, ak, bk, o, mk, labelOnly, sl = {} }: { sl?: LineSlots; e: Edge; a: Rect; b: Rect; ak: string; bk: string; o: number; mk: string; labelOnly?: boolean }) {
  const g = connGeom(a, b, ak, bk, e.implicit, 0, e.bend, e.rt ?? null);
  // (format version 11) a line with ends of its own draws them itself
  const head = !e.ends && (e.style === "->" || e.style === "-->" || e.style === "<->");
  // the label sits where the engine placed it (t along the curve, o beside it), so it covers no label or shape
  const m = e.label ? bezOff(g, e.lt, e.lo) : null;
  return (
    <g data-dh-slot={sl.line} className={cx("scn-conn", e.implicit && "is-implicit", e.style === "-->" && "is-dashed", e.cc && `cc cc-${e.cc}`)} style={{ opacity: o }}>
      {!labelOnly && <path d={bezPath(g)} markerEnd={head ? `url(#${mk}${e.cc ? `-c${e.cc}` : ""})` : undefined} markerStart={head && e.style === "<->" ? `url(#${mk}${e.cc ? `-c${e.cc}` : ""})` : undefined} />}
      {!labelOnly && <LineEnds e={e} g={g} slot={sl.mark} />}
      <EndLabels e={e} g={g} slot={sl.end} />
      {m && <g className="scn-conn-l" data-dh-slot={sl.label}><rect x={m.x - e.lw / 2} y={m.y - e.lh / 2} width={e.lw} height={e.lh} rx={Math.min(9, e.lh / 2)} /><Words lines={e.lines} x={m.x} y={m.y} z={DESIGN.s} cls="scn-conn-t" font={CHIP.font} /></g>}
    </g>
  );
}
// the point d units back along a curve from t (its length measured in 24 pieces); at most to its start
const DOT_BACK = 14;
function behind(g: Geom, t: number, d: number) {
  let len = 0; for (let k = 0, p = bezAt(g, 0); k < 24; k++) { const q = bezAt(g, (k + 1) / 24); len += Math.hypot(q.x - p.x, q.y - p.y); p = q; }
  return bezAt(g, Math.max(0, t - (len > 0 ? d / len : 0)));
}
// a send: an arrow that draws itself from source to target, a small token that travels the same way, or both. The
// curves are the connectors' own (beside a connector when there is one); the label sits where the engine placed it
function Send({ g, at, fin, marks, p, o = 1, still }: { g: SendGeom; at: Map<number, Shown>; fin: Map<number, Box>; marks: Mark[]; p: number; o?: number; still?: boolean }) {
  const rs = g.path.map((k) => at.get(k));
  if (rs.some((x) => !x) || rs.length < 2) return null;
  const geo: Geom[] = rs.slice(1).map((b, k) => connGeom(endRect(rs[k]!), endRect(b!), rs[k]!.box.kind, b!.box.kind, false, g.offs[k], g.bends[k] ?? 0, g.rts?.[k] ?? null));
  const n = geo.length, ep = ease(p);
  const seg = Math.min(n - 1, Math.floor(ep * n)), f = ep >= 1 ? 1 : ep * n - seg;
  const tip = bezAt(geo[seg], f), tan = bezTan(geo[seg], Math.max(0.02, f));
  if (g.show === "stream") {
    // the dots' count and speed come from where the path ends up, not from this moment of a move, so a stream whose
    // ends slide keeps its pace (a change of pace would make the browser jump every dot)
    const fb = g.path.map((k) => fin.get(k));
    const lenGeo = fb.every(Boolean) ? fb.slice(1).map((b, k) => connGeom(fb[k]!, b!, fb[k]!.kind, b!.kind, false, g.offs[k], g.bends[k] ?? 0, g.rts?.[k] ?? null)) : geo;
    return <Stream g={g} geo={geo} lenGeo={lenGeo} marks={marks} p={p} o={o} still={still} />;
  }
  const arrow = g.show !== "token", token = g.show !== "arrow";
  // format version 10: shown both ways, the dot rides a little behind the arrow's head, so it never covers a head (its
  // own, or the connector's when the arrow runs on it)
  const dot = arrow && token ? behind(geo[seg], f, DOT_BACK) : tip;
  // a token's chip keeps the place the engine gave it next to where the token rests
  const chip = g.chip != null ? marks[g.chip] : null;
  let chipR: Rect | null = null;
  if (chip) {
    const fb = g.path.map((k) => fin.get(k)!), last = connGeom(fb[n - 1], fb[n], fb[n - 1].kind, fb[n].kind, false, g.offs[n - 1], g.bends[n - 1] ?? 0, g.rts?.[n - 1] ?? null).Q;
    chipR = { ...chip.r, x: tip.x + chip.r.x - last.x, y: tip.y + chip.r.y - last.y };
  }
  const al = g.alabel != null ? marks[g.alabel] : null;
  const alq = al ? bezAt(geo[g.seg], g.t) : null, alp = alq ? { x: alq.x + g.ox, y: alq.y + g.oy } : null;
  const alo = al ? Math.max(0, Math.min(1, (ep * n - g.seg - g.t + 0.15) / 0.3)) : 0;
  return (
    <g className={cx("scn-send", arrow && "is-arrow", g.cc && `cc cc-${g.cc}`)} style={{ opacity: p === 0 ? 0 : 1 }}>
      {arrow && geo.map((gg, k) => (k < seg || k === seg) && <path key={k} className="scn-arrow" d={bezPath(gg)} pathLength={1} strokeDasharray="1 1" strokeDashoffset={k < seg ? 0 : 1 - f} />)}
      {arrow && <path className="scn-arrow-head" d={`M${tip.x} ${tip.y}l${-tan.x * 9 - tan.y * 4.5} ${-tan.y * 9 + tan.x * 4.5}l${tan.y * 9} ${-tan.x * 9}z`} />}
      {token && <><circle className="scn-send-halo" cx={dot.x} cy={dot.y} r={CHIP.dot + 4} /><circle className="scn-send-dot" cx={dot.x} cy={dot.y} r={CHIP.dot + 1} /></>}
      {chipR && <g className="scn-send-chip"><rect x={chipR.x} y={chipR.y} width={chipR.w} height={chipR.h} rx={chipR.h / 2} /><text x={chipR.x + chipR.w / 2} y={chipR.y + chipR.h / 2} textAnchor="middle" dominantBaseline="central">{chip!.lines[0]}</text></g>}
      {al && alp && <g className="scn-arrow-l" style={{ opacity: alo }}><rect x={alp.x - al.r.w / 2} y={alp.y - al.r.h / 2} width={al.r.w} height={al.r.h} rx={Math.min(9, al.r.h / 2)} /><Words lines={al.lines} x={alp.x} y={alp.y} z={DESIGN.s} cls="scn-arrow-t" font={CHIP.font} /></g>}
    </g>
  );
}
// a stream: dots flow along the path for the whole step, on a faint track; the browser moves them (animateMotion),
// so nothing re-renders per frame. With reduced motion they stand still, spread along the path
function Stream({ g, geo, lenGeo, marks, p, o = 1, still: stands }: { g: SendGeom; geo: Geom[]; lenGeo: Geom[]; marks: Mark[]; p: number; o?: number; still?: boolean }) {
  const d = geo.map((gg, k) => (k ? bezPath(gg).replace(/^M/, "L") : bezPath(gg))).join("");
  const len = Math.round(lenGeo.reduce((a, gg) => a + Math.hypot(gg.Q.x - gg.P.x, gg.Q.y - gg.P.y) * 1.15, 0) / 8) * 8;
  const n = Math.max(4, Math.min(10, Math.round(len / 45))), dur = Math.max(1.4, Math.min(4, len / 80));
  const still = !!stands || reducedMotion();
  const al = g.alabel != null ? marks[g.alabel] : null;
  const alq = al ? bezAt(geo[g.seg], g.t) : null;
  return (
    <g className={cx("scn-send", "is-stream", g.cc && `cc cc-${g.cc}`)} style={{ opacity: Math.min(1, p * 3) * o }} data-stream={g.path.join(">")}>
      <path className="scn-stream-track" d={d} />
      {Array.from({ length: n }, (_, k) => still
        ? (() => { const t = (k + 0.5) / n, seg = Math.min(geo.length - 1, Math.floor(t * geo.length)), q = bezAt(geo[seg], t * geo.length - seg); return <circle key={k} className="scn-send-dot" cx={q.x} cy={q.y} r={3.2} />; })()
        : <circle key={k} className="scn-send-dot" r={3.2}><animateMotion dur={`${dur.toFixed(2)}s`} repeatCount="indefinite" begin={`${(-(k * dur) / n).toFixed(2)}s`} path={d} /></circle>)}
      {al && alq && <g className="scn-arrow-l"><rect x={alq.x + g.ox - al.r.w / 2} y={alq.y + g.oy - al.r.h / 2} width={al.r.w} height={al.r.h} rx={Math.min(9, al.r.h / 2)} /><Words lines={al.lines} x={alq.x + g.ox} y={alq.y + g.oy} z={DESIGN.s} cls="scn-arrow-t" font={CHIP.font} /></g>}
    </g>
  );
}
// speech for this step, where the engine placed it (above the thing if that is free), with a tail towards it
function Say({ m, r, o }: { m: Mark; r: Rect; o: number }) {
  const c = center(r), x = c.x + m.dx, y = c.y + m.dy, w = m.r.w, h = m.r.h;
  const tx = Math.max(x + 10, Math.min(x + w - 10, c.x));
  const d = m.side === "up" ? `M${x} ${y}h${w}v${h}H${tx + 6}l-6 6l-6 -6H${x}z`
    : m.side === "down" ? `M${x} ${y}H${tx - 6}l6 -6l6 6H${x + w}v${h}h${-w}z`
    : `M${x} ${y}h${w}v${h}h${-w}z`;
  return (
    <g className="scn-say" style={{ opacity: o }}>
      <path d={d} />
      <Words lines={m.lines} x={x + w / 2} y={y + h / 2} z={DESIGN.s} cls="scn-say-t" font={CHIP.font + 0.5} />
    </g>
  );
}
// a dropped token (format version 9): it travels to the side of where it is lost (the first part of the step), then
// turns red, is crossed out, sinks a little and fades
function droppedAt(p: Box, at: Box | undefined, te: number): { box: Box; r: Rect; o: number; enter: boolean } {
  const k = Math.min(1, te / 0.55);
  const hitAt = at ? edgePoint(at, center(p), at.kind) : center(p);
  const r = lerpR(p, { x: hitAt.x - p.w / 2, y: hitAt.y - p.h / 2, w: p.w, h: p.h }, k);
  const lost = te > 0.5;
  return { box: lost ? { ...p, ent: { ...p.ent, tone: "hot", down: true } } : p, r: lost ? { ...r, y: r.y + (te - 0.5) * 16 } : r, o: te < 0.6 ? 1 : Math.max(0, 1 - (te - 0.6) / 0.4), enter: false };
}
