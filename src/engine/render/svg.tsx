// Lane render (Opus): the one 2D renderer. Draws a Plan's primitives as SVG with page tokens only (the stage look:
// thin borders, soft fills; the classes of ui/stage.css), tweens primitives with the same key between steps
// (positions, sizes, lines whose commands match), plays a Motion's events (a dot along a line, a lost message: a cross
// and a fade, a stream, speech, light), frames the auto camera (camera.ts) and lets the reader move the 2D stage
// (SPEC 6.8: drag, pinch, Ctrl + wheel, keys, Show everything, Back to the story). The player row is
// src/ui/parts.tsx Controls with the speed control; Play on step 1 stays there for one whole pause.
//
// No jitter (owner point 19): a plan is laid out once per width; a step only blends two fixed frames, so nothing is
// laid out again mid-tween. A resize lays out again at the new width and jumps to the end of the step.
// Server render: step 1, whole, fitted (owner point 25), one plan per SSR width (the stage's CSS shows the one that
// fits), so hydration draws the same markup and nothing shifts.
import React, { Suspense, useEffect, useMemo, useRef, useState } from "react"; // hydrate: Suspense
import type { Compiled, Event, Id, Plan, Prim, Rect, TextRun, Tone } from "../types";
import type { Ui } from "../../ui/ui";
import type { StaticProp } from "../../parts/kit/static";
import { useStatic, StaticSteps } from "../../parts/kit/static";
import { Controls } from "../../ui/parts";
import { useSpeed } from "../../ui/speed";
import { screenPlanWidth, PRINT_W, followBy } from "../../ui/stage"; // eng-polish: followBy (v0.7.0 8ded128); hydrate: SSR_W no longer drawn here (ENG_SSR_W)
import { FONT, LINE_H, fontSize } from "../../core/stage-core"; // eng-polish: FONT, fontSize
import { atSizes, measureAt } from "./font";
import { CHIP_H, chipW, stackTokens } from "./prims";
import { pathPoints } from "./route";
import { modelAt as sceneModelAt } from "../core/scenes";
import { parseMarks, plainOf, runsOfLines } from "./marks";
import { rotOf } from "../charts/rot"; // eng-stagebars: a chart word turned along a ring's radius
import { ThreeHost, threeOf, canThree, type ThreeApi } from "./three-host";
import { rideHeads, type RideItem } from "../../core/edge10"; // eng-polish: a container's heading rides with the view (v0.7.0 149ccb8)
import { stageView, filledFrames, restsOnWords } from "./fill"; // render2
import { storyCamera, lerpRect, zoomAt, keepNear, union, toAspect, leastScaleOf, shrinkToFit } from "./camera"; // phonecam: leastScaleOf, shrinkToFit

// ------------------------------------------------------------------ paint: roles and tones to page tokens
type Pal = (role: string | null | undefined) => number;
const TONE_VAR: Record<Tone, string | null> = { good: "good", bad: "bad", warn: "warn", accent: "acc", off: null };
const tv = (t: Tone | null | undefined) => (t ? TONE_VAR[t] : null);
// the look's tokens (look/look.css, --lk-*) with the page's own as the fallback, so a page without the look sheet draws too
const TONE_LK: Record<Tone, string> = { good: "good", bad: "bad", warn: "warn", accent: "accent", off: "off" };
function lineOf(n: number, tone?: Tone | null): string { const t = tv(tone); if (t && tone) return `var(--lk-edge-${TONE_LK[tone]}, var(--${t}))`; return n > 0 ? `var(--c${n})` : "var(--lk-edge, var(--c0, var(--line-2)))"; }
function softOf(n: number, tone?: Tone | null, plane = false): string { const t = tv(tone); if (t && tone) return `var(--lk-tint-${TONE_LK[tone]}, var(--${t}-soft))`; return n > 0 ? (plane ? `var(--c${n}-plane, var(--c${n}-soft))` : `var(--c${n}-soft)`) : plane ? "var(--lk-fill-container, var(--c0-plane, var(--surface-2)))" : "var(--lk-fill-neutral, var(--c0-soft, var(--surface-2)))"; }
function inkOf(n: number, tone?: Tone | null): string { const t = tv(tone); if (t) return `var(--${t}-ink, var(--${t}))`; return n > 0 ? `var(--c${n}-ink)` : "var(--lk-ink, var(--ink))"; }
const wireOf = (n: number, tone?: Tone | null) => (tv(tone) || n > 0 ? lineOf(n, tone) : "var(--lk-ink-2, var(--ink-2))");
const MUTED = "var(--lk-ink-muted, var(--muted))", INK = "var(--lk-ink, var(--ink))";
/** a font's size and weight from the look (the phone's own sizes where the look has them) */
const PHONE_FS = new Set(["title", "body", "sub", "chip"]), FW: Record<string, string> = { title: "var(--lk-fw-title, 500)", lane: "var(--lk-fw-lane, 500)", chip: "var(--lk-fw-chip, 500)", big: "var(--lk-fw-big, 600)", "small-b": "600" };
const FS: Record<string, number> = { title: 13.5, body: 12.5, sub: 12, lane: 12.5, chip: 11.5, big: 21, mono: 12, "small-b": 11.5 }, PFS: Record<string, number> = { title: 12.5, body: 11.5, sub: 11, chip: 11 };
export const fontStyle = (f: string, phone: boolean): React.CSSProperties => ({ fontSize: phone && PHONE_FS.has(f) ? `var(--lk-fs-phone-${f}, var(--lk-fs-${f}, ${PFS[f]}px))` : `var(--lk-fs-${f}, ${FS[f] ?? 12}px)`, fontWeight: FW[f] as any, fontFamily: f === "mono" ? "var(--lk-font-mono, var(--font-mono))" : "var(--lk-font, var(--font-sans))" });

// ------------------------------------------------------------------ tween
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const NUM = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;
/** blend two paths with the same commands, number by number; null when they differ in shape */
function lerpPath(a: string, b: string, t: number): string | null {
  if (a === b) return a;
  const ca = a.replace(NUM, "#"), cb = b.replace(NUM, "#");
  if (ca !== cb) return null;
  const na = a.match(NUM)!.map(Number), nb = b.match(NUM)!.map(Number);
  let i = 0;
  return ca.replace(/#/g, () => { const v = lerp(na[i], nb[i], t); i++; return String(Math.round(v * 10) / 10); });
}
/** one primitive between its place in frame A and frame B */
function blend(a: Prim, b: Prim, t: number): Prim | null {
  if (a.k !== b.k) return null;
  switch (b.k) {
    case "box": case "rect": { const ra = (a as typeof b).rect; return { ...b, rect: lerpRect(ra, b.rect, t) }; }
    case "text": { const A = a as typeof b; if (A.lines.join("\n") !== b.lines.join("\n")) return null; return { ...b, x: lerp(A.x, b.x, t), y: lerp(A.y, b.y, t) }; }
    case "chip": { const A = a as typeof b; if (A.words !== b.words) return null; return { ...b, x: lerp(A.x, b.x, t), y: lerp(A.y, b.y, t) }; }
    case "dot": { const A = a as typeof b; return { ...b, x: lerp(A.x, b.x, t), y: lerp(A.y, b.y, t), r: lerp(A.r, b.r, t) }; }
    case "path": { const d = lerpPath((a as typeof b).d, b.d, t); return d === null ? null : { ...b, d }; }
  }
}
type Drawn = { p: Prim; o: number; key: string };
/** the primitives at time t between frame A (step from) and frame B (step to) */
export function tweenFrames(A: Prim[], B: Prim[], t: number): Drawn[] {
  if (t >= 1 || A === B) return B.map((p) => ({ p, o: 1, key: p.key }));
  const te = ease(t), fin = ease(clamp01((t - 0.35) / 0.65)), fout = 1 - ease(clamp01(t / 0.5));
  const byKey = new Map(A.map((p) => [p.key, p]));
  const inB = new Set(B.map((p) => p.key));
  const out: Drawn[] = [];
  // what goes fades out first, under the rest
  for (const p of A) if (!inB.has(p.key)) out.push({ p, o: fout, key: p.key + "~out" });
  for (const p of B) {
    const a = byKey.get(p.key);
    if (!a) { out.push({ p, o: fin, key: p.key }); continue; }
    const m = blend(a, p, te);
    if (m) out.push({ p: m, o: 1, key: p.key });
    else {
      // the words or the shape of the line changed: the old one fades out where it was going, the new one fades in
      const moved = blend({ ...a, ...(a.k === "text" || a.k === "chip" ? {} : {}) } as Prim, a, 1);
      out.push({ p: moved ?? a, o: fout, key: p.key + "~was" }, { p, o: fin, key: p.key });
    }
  }
  return out;
}

// ------------------------------------------------------------------ frames, cached per plan and step
const frameCache = new WeakMap<Plan, Map<number, Prim[]>>();
export function frameOf(plan: Plan, step: number): Prim[] {
  let m = frameCache.get(plan); if (!m) { m = new Map(); frameCache.set(plan, m); }
  let f = m.get(step); if (!f) { f = stackTokens(plan.frame(step)); m.set(step, f); }
  return f;
}
/** render2: the camera before the stage has a plan (its width not measured yet): never a place a glide starts from */
export const STAND_IN: Rect = { x: 0, y: 0, w: 1, h: 1 };
export const isStandIn = (r: Rect | null | undefined): boolean => !r || (r.w <= 1 && r.h <= 1);
/** where a step's glide starts: the view on screen, when there is one (a plan, and a camera that is not the stand-in); else
 * null, and the glide starts from the step's own frame */
export const glideFrom = (hasPlan: boolean, onScreen: Rect | null | undefined): Rect | null => (hasPlan && onScreen && !isStandIn(onScreen) ? onScreen : null);
/** the stage's canvas: at least the width the plan was laid out for, so a narrower layout is centred, never stretched
 * (its words stay their size); a wider one is shown whole, scaled down, and the camera and the reader move in it */
export const wholeOf = (plan: Plan): Rect => { const W = Math.max(1, plan.w, plan.width); return { x: -(W - Math.max(1, plan.w)) / 2, y: 0, w: W, h: Math.max(1, plan.h) }; };
/** the stage's size in scene units at natural size: as wide as the plan was laid out for (never stretched, never under
 * the least scale), as tall as the scene */
export const viewOf = (plan: Plan): { w: number; h: number } => { const W = wholeOf(plan); return { w: Math.min(W.w, Math.max(1, plan.width)), h: W.h }; };
/** The story camera of every step, worked out once per plan in story order: a step whose touched things are already
 * whole in the camera before keeps it (the stage moves only when the step needs it), so going to any step gives the
 * same frame however the reader got there. `px` (phonecam) is the stage's width on the screen (0: unknown, the plan's
 * width): a plan wider than the stage shrinks to fit down to where a step's smallest words are 11 px on the screen. */
const camCache = new WeakMap<Plan, Map<number, Rect[]>>();
export function cameraOf(c: Compiled, plan: Plan, step: number, px = 0): Rect {
  const sx = px > 0 ? Math.round(px) : 0; // phonecam: one set of frames per stage width
  let byPx = camCache.get(plan); if (!byPx) { byPx = new Map(); camCache.set(plan, byPx); }
  let cams = byPx.get(sx);
  if (!cams) {
    cams = [];
    // the stage keeps the overview's shape; inside a scene the camera frames the scene's own plan in that shape
    const view = stageView(c, plan, viewOf(plan)), ar = view.w / view.h; // render2: a graph scene's stage keeps its shape
    // what the story frames: the part of the canvas its things use over the whole story (a plan wider than the stage with
    // empty margins is framed on its things, so nothing is cut that would fit), never smaller than the stage
    const used = new Map<Plan, Rect>(), things = new Map<Plan, Rect>(); // phonecam: things, the raw union
    const usedOf = (P: Plan): Rect => {
      const hit = used.get(P); if (hit) return hit;
      const W = wholeOf(P), rs: Rect[] = [];
      for (let k = 0; k < c.states.length; k++) if (planAt(c, plan, k) === P) rs.push(...Object.values(P.rects(k)));
      const u = (rs.length ? union(rs) : null) ?? W, pad = 8; things.set(P, u);
      // things that fit the stage fill it (centred, the margin split); things a little wider (up to 6 px a side: less than a
      // card's padding, so only outer borders are cut, never words) are centred in it; else they keep a margin of `pad`
      const fitIn = (n: number, v: number) => (n <= v + 12 ? v : n + 2 * pad);
      const tw = Math.min(W.w, fitIn(u.w, view.w)), th = Math.min(W.h, fitIn(u.h, view.h));
      const x = Math.max(W.x, Math.min(W.x + W.w - tw, u.x + u.w / 2 - tw / 2)), y = Math.max(W.y, Math.min(W.y + W.h - th, u.y + u.h / 2 - th / 2));
      const r = { x, y, w: tw, h: th }; used.set(P, r); return r;
    };
    // phonecam: the widest view each step may have (scene units): the stage at the step's least scale (its smallest words
    // 11 px on the screen), never under natural size. A scene shrinks only when every one of its steps fits its things
    // whole that way, and then all its steps share one frame, the narrowest of theirs: a scene where some steps fit and some
    // do not keeps the natural-size window on every step (shrinking only some zoomed in and out between steps: format 55
    // at 390, 9 words moved on 3 of 6 steps)
    const stagePx = sx || view.w, maxWs: number[] = [], fitW = new Map<Plan, number>(), noFit = new Set<Plan>();
    for (let k = 0; k < c.states.length; k++) {
      const P = planAt(c, plan, k); usedOf(P);
      const mw = Math.max(view.w, stagePx / leastScaleOf(minWordPx(c, plan, k), plan.phone));
      maxWs.push(mw);
      if (things.get(P)!.w <= mw + 0.5) fitW.set(P, Math.min(fitW.get(P) ?? Infinity, mw)); else noFit.add(P);
    }
    for (let k = 0; k < c.states.length; k++) {
      const P = planAt(c, plan, k), whole = usedOf(P);
      const r = plan.rects(k), touched = k > 0 ? (c.motions[k]?.touched ?? []).map((id) => r[id]).filter(Boolean) : [];
      // phonecam: things wider than the stage, in a scene whose every step fits them at its least scale, are framed whole,
      // shrunk (the scene's shared width); a frame kept from the step before is kept only when it is no wider than this step allows
      const maxW = maxWs[k], W = wholeOf(P), u = things.get(P)!;
      const fit = !noFit.has(P) && fitW.has(P) ? shrinkToFit(u, { x: W.x, y: whole.y, w: W.w, h: whole.h }, view, fitW.get(P)!) : null;
      const prev0 = sceneOf(c, k - 1) === sceneOf(c, k) ? cams[k - 1] : undefined, prev = prev0 && prev0.w <= maxW + 0.5 ? prev0 : undefined;
      cams.push(fit ? toAspect(fit, ar) : prev && touched.length && touched.every((t) => within(prev, t)) ? prev : !touched.length && prev ? prev : toAspect(storyCamera(k, whole, view, Object.values(r), touched), ar));
    }
    cams = filledFrames(c, plan, cams, view); // render2: a graph scene fills its stage (render/fill.ts)
    byPx.set(sx, cams);
  }
  return cams[Math.max(0, Math.min(cams.length - 1, step))] ?? wholeOf(plan);
}
/** phonecam: what of a thing's edge the view may cut with no shaded edge: less than a card's padding, so never its words */
export const BORDER_CUT = 6;
const padR = (r: Rect, m: number): Rect => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });
/** phonecam: the smallest words a step draws, in px at natural size: its things' words and chips, its lines' words (a
 * line's own label or what a send carries) and its speech (the sizes fontStyle gives; Infinity when it draws none) */
export function minWordPx(c: Compiled, plan: Plan, k: number): number {
  const px = (f: string) => (plan.phone && PHONE_FS.has(f) ? PFS[f] : FS[f]) ?? 12;
  let m = Infinity;
  const B = frameOf(plan, k), paths = new Set<string>();
  for (const p of B) {
    if (p.k === "text" && p.lines.some((l) => l.trim())) m = Math.min(m, px(p.font));
    else if (p.k === "chip" && p.words) m = Math.min(m, px("chip"));
    else if (p.k === "path" && !has(p.cls, /(^|\s)eng-words-own/)) paths.add(p.key);
  }
  const events = c.motions[k]?.events ?? [], said = new Set<string>();
  for (const e of events) if (e.k === "send" && e.words) said.add(e.rel);
  for (const rel of Object.values(modelAt(c, k).relations)) if (paths.has(`rel:${rel.id}`) && (said.has(rel.id) || rel.label)) m = Math.min(m, px("sub"));
  if (plan.words !== "own" && events.some((e) => e.k === "say")) m = Math.min(m, px("sub"));
  return m;
}
/** the scene a step is in (null: the overview) */
export const sceneOf = (c: Compiled, k: number): Id | null => { const id = c.states[k]?.scene; return id && c.model.scenes[id] ? id : null; };
/** the plan a step draws from: a nested scene's own plan inside it (its frames and rects are already the scene's) */
export const planAt = (c: Compiled, plan: Plan, k: number): Plan => { const id = sceneOf(c, k); return id && plan.scene ? plan.scene(id) : plan; };
/** the model a step is told from: inside a scene, the scene's things, lines and roles */
export const modelAt = (c: Compiled, k: number): Compiled["model"] => sceneModelAt(c.model, c.states[k]);
const within = (o: Rect, r: Rect) => o.x <= r.x + 0.5 && o.y <= r.y + 0.5 && o.x + o.w >= r.x + r.w - 0.5 && o.y + o.h >= r.y + r.h - 0.5;

// ------------------------------------------------------------------ geometry helpers for events
type Pt = { x: number; y: number };
/** the point at fraction f along the line; `back` px of its end are left out (eng-polish: a send's dot stops short of an arrowhead) */
const r2 = (n: number) => Math.round(n * 100) / 100; // a dot's place to 0.01 px: the server and the browser disagree in the last digits of a float (a hydration warning)
export const HEAD_ROOM = 10 + 4.2 + 1;
export function polyAt(pts: Pt[], f: number, back = 0): Pt {
  if (pts.length < 2) return pts[0] ?? { x: 0, y: 0 };
  const L = pts.slice(1).map((q, i) => Math.hypot(q.x - pts[i].x, q.y - pts[i].y)), tot = L.reduce((a, b) => a + b, 0) || 1;
  let d = clamp01(f) * Math.max(tot * 0.4, tot - back);
  for (let i = 0; i < L.length; i++) { if (d <= L[i] || i === L.length - 1) { const k = L[i] ? d / L[i] : 0; return { x: r2(lerp(pts[i].x, pts[i + 1].x, k)), y: r2(lerp(pts[i].y, pts[i + 1].y, k)) }; } d -= L[i]; }
  return pts[pts.length - 1];
}
/** where a line's words sit: beside its longest leg, off the line, clear of things when a spot is free */
function labelSpot(pts: Pt[], words: string, rects: Rect[], phone: boolean, bound?: Rect): { x: number; y: number; anchor: "start" | "middle" | "end"; box: Rect } {
  const w = measureAt(words, "sub", phone) + 6, h = 15;
  const legs = pts.slice(1).map((q, i) => ({ a: pts[i], b: q, l: Math.hypot(q.x - pts[i].x, q.y - pts[i].y) })).sort((p, q) => q.l - p.l);
  const spots: { x: number; y: number; anchor: "start" | "middle" | "end"; box: Rect }[] = [];
  // beside the middle of the longest legs first, then points along them, then a little further off the line; the words
  // never sit on the line itself. The box counts the chip drawn round the words
  const P = 6, Q = 2;
  for (const off of [0, 12, 24]) for (const at of [0.5, 0.3, 0.7, 0.15, 0.85]) for (const g of legs.slice(0, 4)) {
    if (at !== 0.5 && g.l < w + 30) continue;
    const m = { x: g.a.x + (g.b.x - g.a.x) * at, y: g.a.y + (g.b.y - g.a.y) * at }, horiz = Math.abs(g.a.y - g.b.y) < Math.abs(g.a.x - g.b.x);
    if (horiz) { spots.push({ x: m.x, y: m.y - 6 - off, anchor: "middle", box: { x: m.x - w / 2 - P, y: m.y - 6 - off - 11 - Q, w: w + 2 * P, h: h + 2 * Q } }, { x: m.x, y: m.y + 15 + off, anchor: "middle", box: { x: m.x - w / 2 - P, y: m.y + 4 + off - Q, w: w + 2 * P, h: h + 2 * Q } }); }
    else { spots.push({ x: m.x + 11 + off, y: m.y + 4, anchor: "start", box: { x: m.x + 5 + off, y: m.y - 8 - Q, w: w + 2 * P, h: h + 2 * Q } }, { x: m.x - 11 - off, y: m.y + 4, anchor: "end", box: { x: m.x - 5 - off - w - 2 * P, y: m.y - 8 - Q, w: w + 2 * P, h: h + 2 * Q } }); }
  }
  // then spots snapped just clear of a thing's edge near the middle of the longest leg (a short line between two things
  // inside a container: the words sit just under or over the two things, or beside them)
  const g0 = legs[0];
  if (g0) {
    const m = { x: (g0.a.x + g0.b.x) / 2, y: (g0.a.y + g0.b.y) / 2 }, horiz = Math.abs(g0.a.y - g0.b.y) < Math.abs(g0.a.x - g0.b.x);
    const BW = w + 2 * P, BH = h + 2 * Q, snaps: { s: (typeof spots)[number]; d: number }[] = [];
    for (const r of rects) {
      if (horiz) {
        if (r.x >= m.x + BW / 2 || r.x + r.w <= m.x - BW / 2) continue;
        for (const top of [r.y + r.h + 1, r.y - BH - 1]) if (Math.abs(top + BH / 2 - m.y) < 48) snaps.push({ s: { x: m.x, y: top + Q + 11, anchor: "middle", box: { x: m.x - BW / 2, y: top, w: BW, h: BH } }, d: Math.abs(top + BH / 2 - m.y) });
      } else {
        if (r.y >= m.y + BH / 2 || r.y + r.h <= m.y - BH / 2) continue;
        for (const [left, anchor] of [[r.x + r.w + 1, "start"], [r.x - BW - 1, "end"]] as const) if (Math.abs(left + BW / 2 - m.x) < 72) snaps.push({ s: { x: anchor === "start" ? left + P : left + BW - P, y: m.y + 4, anchor, box: { x: left, y: m.y - 8 - Q, w: BW, h: BH } }, d: Math.abs(left + BW / 2 - m.x) });
      }
    }
    snaps.sort((p, q) => p.d - q.d);
    for (const x of snaps) spots.push(x.s);
  }
  const out = (b: Rect) => (bound && (b.x < bound.x || b.y < bound.y || b.x + b.w > bound.x + bound.w || b.y + b.h > bound.y + bound.h) ? 3 : 0);
  // a container the words sit wholly inside is not in the way; a thing, a word or a chip they touch is
  // a big rect (a container) the words only cross the border of costs less than words or a thing they cover
  const hits = (b: Rect) => rects.reduce((n, r) => (b.x < r.x + r.w && r.x < b.x + b.w && b.y < r.y + r.h && r.y < b.y + b.h && !within(r, b) ? n + (r.w * r.h > 6 * b.w * b.h ? 0.4 : 1) : n), 0) + out(b);
  let best = spots[0], bh = Infinity;
  for (const s of spots) { const k = hits(s.box); if (k < bh) { bh = k; best = s; } if (!k) break; }
  return best ?? { x: 0, y: 0, anchor: "middle", box: { x: 0, y: 0, w: 0, h: 0 } };
}

// ------------------------------------------------------------------ drawing one primitive
/** a caption's or a note's words with their marks, as HTML */
const marked = (s: string | null | undefined): React.ReactNode => !s ? s : parseMarks(s).map((r, i) => r.code ? <code key={i}>{r.text}</code> : r.bold ? <strong key={i}>{r.text}</strong> : r.italic ? <em key={i}>{r.text}</em> : r.text);
/** fmt12: an author's step title is never dropped: it leads the caption in bold ("**Title.** caption"); a step written without
 *  one (`@step A sentence.`, title = caption) shows the sentence alone */
export const titleOf = (s: { title: string; caption: string } | null | undefined): string | null => (s && s.title && s.title !== s.caption ? s.title : null);
const leadOf = (s: { title: string; caption: string } | null | undefined): React.ReactNode => { const t = titleOf(s); return t ? <><strong className="eng-step-title">{marked(t)}{/[.!?:;…]$/.test(t) ? "" : "."}</strong>{" "}</> : null; };
/** fmt12: a step's name for the step control (its accessible name and tooltip): its title, else its caption's words */
export const stepName = (s: { title: string; caption: string } | undefined): string => plainOf(titleOf(s) ?? s?.caption ?? "");
/** a piece of rich words: code in the mono font, bold, italic (lines[i] stays the plain text the layout measured) */
function Run({ r }: { r: TextRun }) {
  return <tspan style={{ fontFamily: r.code ? "var(--lk-mono, var(--mono, ui-monospace, monospace))" : undefined, fontWeight: r.bold ? 650 : undefined, fontStyle: r.italic ? "italic" : undefined }}>{r.text}</tspan>;
}
// Paints go out as custom properties (--ef fill, --es stroke, --ed dash, --efo/--eso opacities) that engine.css reads
// with zero specificity (:where(.eng-p)), so any class a layout or a chart puts on a primitive (the timeline's pf-/ps-/
// pi-, the charts' xy-*) wins over the renderer's paint with no list of exceptions. Widths stay inline (the stage's
// own .stg-box/.stg-line widths would win otherwise), except where a class names its own width (stg-w-N).
const has = (cls: string | undefined, re: RegExp) => !!cls && re.test(cls);
const OWN_W = /(^|\s)(stg-w-|xy-|eng-down|eng-meter)/;
const paint = (fill: string, stroke: string, extra: { dash?: string; fo?: number | string; so?: number | string } = {}): React.CSSProperties =>
  ({ "--ef": fill, "--es": stroke, "--ed": extra.dash ?? "none", "--efo": extra.fo ?? 1, "--eso": extra.so ?? 1 }) as React.CSSProperties;
const join = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
/** eng-polish: one straight line over each line of a struck word, in the stage's strike colour (the stage's struckSlash: baseline minus 0.32 em, the word's width plus a pixel each side) */
function StrikeLines({ p, phone, transform, op }: { p: Extract<Prim, { k: "text" }>; phone: boolean; transform?: string; op?: number }) {
  const F = FONT[p.font], size = atSizes(phone, () => fontSize(p.font)), pitch = LINE_H[p.font] ?? 16;
  return <>{p.lines.map((l, i) => {
    if (!l) return null;
    const w = (measureAt(l, p.font, phone) / (F.mono || F.weight >= 500 ? 1 : 0.95)) * (size / F.size);
    const x0 = p.anchor === "middle" ? p.x - w / 2 : p.anchor === "end" ? p.x - w : p.x, y = p.y + i * pitch - size * 0.32;
    return <line key={i} className="eng-strike" x1={x0 - 1} y1={y} x2={x0 + w + 1} y2={y} transform={transform} aria-hidden="true" style={{ stroke: "var(--stg-struck-line, var(--bad))", strokeWidth: "var(--stg-struck-w, 1.6px)", strokeLinecap: "round", opacity: op }} />;
  })}</>;
}
// eng-sweep: a drawn number is rounded to 0.01, so the server's markup and the browser's agree to the last digit (a float that differs in its 17th digit made React's hydration warn: "Prop cx did not match")
const q2 = (n: number) => Math.round(n * 100) / 100;
const rq = (r: Rect): Rect => ({ x: q2(r.x), y: q2(r.y), w: q2(r.w), h: q2(r.h) });
function Shape({ p, o, pal, lit, roleOf, phone, tip }: { p: Prim; o: number; pal: Pal; lit: boolean; roleOf: (id?: Id) => string | null; phone: boolean; tip?: string }) {
  const op = o < 0.999 ? o : undefined;
  switch (p.k) {
    case "box": {
      const n = pal(p.role), r = rq(p.rect), hot = lit || p.lit;
      const style: React.CSSProperties = {
        ...paint(n > 0 ? softOf(n, null, p.container) : softOf(0, p.tone, p.container), lineOf(n, p.tone), { dash: p.dashed ? "var(--lk-box-dash, 4 4)" : undefined }),
        ...(has(p.cls, OWN_W) ? {} : { strokeWidth: hot ? "var(--lk-box-hot-w, 3.2px)" : p.container ? "var(--lk-frame-w, 1.3px)" : "var(--lk-box-w, 1.3px)" }),
        filter: hot ? "drop-shadow(var(--lk-halo, 0 1px 5px rgba(15, 23, 42, .28)))" : undefined,
        opacity: p.dim ? `calc(var(--lk-dim, .38) * ${op ?? 1})` : op,
      };
      // a thing the step lights (Motion light): a ring a few px outside it, in the accent (the old stage's scn-ring)
      // eng-lanes2: a box marked eng-noring (a lanes card: its lit look is the stage's thicker border) gets no ring
      const ring = lit && !p.container && !has(p.cls, /(^|\s)eng-noring(\s|$)/) ? (p.shape === "circle"
        ? <circle className="eng-ring" cx={r.x + r.w / 2} cy={r.y + r.h / 2} r={Math.min(r.w, r.h) / 2 + 4} style={{ fill: "none", stroke: "var(--lk-accent, var(--acc))", strokeWidth: 2, opacity: 0.9 }} />
        : <rect className="eng-ring" x={r.x - 4} y={r.y - 4} width={r.w + 8} height={r.h + 8} rx={p.shape === "pill" ? (r.h + 8) / 2 : 10} style={{ fill: "none", stroke: "var(--lk-accent, var(--acc))", strokeWidth: 2, opacity: 0.9 }} />) : null;
      const g = (body: React.ReactNode) => <g data-key={p.key} data-id={p.id} className={join("eng-p", "stg-box", hot && "stg-hot", p.cls)} style={style}>{body}{ring}</g>;
      switch (p.shape) {
        case "text": return null;
        case "circle": return g(<circle cx={r.x + r.w / 2} cy={r.y + r.h / 2} r={Math.max(0, Math.min(r.w, r.h) / 2)} />);
        case "pill": return g(<rect x={r.x} y={r.y} width={Math.max(0, r.w)} height={Math.max(0, r.h)} rx={Math.min(r.h / 2, 18)} />);
        case "cylinder": { const ry = Math.min(8, r.h * 0.14); return g(<><path d={`M${r.x} ${r.y + ry}A${r.w / 2} ${ry} 0 0 1 ${r.x + r.w} ${r.y + ry}V${r.y + r.h - ry}A${r.w / 2} ${ry} 0 0 1 ${r.x} ${r.y + r.h - ry}Z`} /><path d={`M${r.x} ${r.y + ry}A${r.w / 2} ${ry} 0 0 0 ${r.x + r.w} ${r.y + ry}`} style={{ fill: "none" }} /></>); }
        case "cloud": { const { x, y, w, h } = r; return g(<path d={`M${x + w * 0.22} ${y + h * 0.92}C${x - w * 0.02} ${y + h * 0.92} ${x - w * 0.02} ${y + h * 0.42} ${x + w * 0.2} ${y + h * 0.42}C${x + w * 0.22} ${y + h * 0.06} ${x + w * 0.56} ${y - h * 0.02} ${x + w * 0.64} ${y + h * 0.28}C${x + w * 0.8} ${y + h * 0.14} ${x + w * 1.02} ${y + h * 0.32} ${x + w * 0.9} ${y + h * 0.56}C${x + w * 1.04} ${y + h * 0.66} ${x + w * 0.98} ${y + h * 0.94} ${x + w * 0.8} ${y + h * 0.92}Z`} />); }
        case "diamond": { const cx = r.x + r.w / 2, cy = r.y + r.h / 2; return g(<path d={`M${cx} ${r.y}L${r.x + r.w} ${cy}L${cx} ${r.y + r.h}L${r.x} ${cy}Z`} />); }
        case "person": { const I = 22, cx = r.x + r.w / 2, hr = I * 0.24; return g(<><circle cx={cx} cy={r.y + hr + 1} r={hr} /><path d={`M${cx - I * 0.42} ${r.y + I}a${I * 0.42} ${I * 0.42} 0 0 1 ${I * 0.84} 0z`} /></>); }
        case "dot": return g(<circle cx={r.x + r.w / 2} cy={r.y + r.h / 2} r={Math.min(6, r.w / 2)} />);
        default: return g(<rect x={r.x} y={r.y} width={Math.max(0, r.w)} height={Math.max(0, r.h)} rx={p.container ? 12 : 9} />);
      }
    }
    case "rect": {
      const n = pal(p.role), tone = p.tone && p.tone !== "off" ? p.tone : null;
      const fill = p.fill === "none" ? "none" : tone ? softOf(0, tone) : p.fill === "role" || (p.fill === "soft" && p.role) ? softOf(n, null, true) : p.fill === "band" ? "var(--lk-fill-band, var(--surface-2))" : "var(--lk-fill-faint, var(--surface-2))";
      const stroke = !p.edge || p.edge === "none" ? "none" : tone ? lineOf(0, tone) : p.edge === "role" ? lineOf(n) : "var(--lk-hairline, var(--line))";
      return <rect data-key={p.key} className={join("eng-p", p.cls)} x={q2(p.rect.x)} y={q2(p.rect.y)} width={Math.max(0, q2(p.rect.w))} height={Math.max(0, q2(p.rect.h))} rx={p.r ?? 10} style={{ ...paint(fill, stroke, { fo: p.fill === "faint" ? 0.5 : 1, so: p.edge === "faint" ? 0.5 : 1 }), ...(has(p.cls, OWN_W) ? {} : { strokeWidth: 1 }), opacity: op }} />;
    }
    case "text": {
      const n = pal(p.role ?? roleOf(p.id)), strong = has(p.cls, /(^|\s)(stg-ink-strong|pi-strong)/) && n > 0;
      const fill = strong ? lineOf(n) : p.ink === "muted" ? MUTED : p.ink === "role" ? inkOf(n) : p.ink === "tone" ? inkOf(0, p.tone) : INK;
      const pitch = LINE_H[p.font] ?? 16;
      const turn = has(p.cls, /(^|\s)stg-rot90/) ? `rotate(-90 ${p.x} ${p.y})` : rotOf(p.cls) ? `rotate(${rotOf(p.cls)} ${p.x} ${p.y})` : undefined;
      // eng-polish: struck words: SVG text ignores text-decoration-color, so the strike is its own line in the stage's red (--stg-struck-line)
      const strike = has(p.cls, /(^|\s)(stg-struck|g-strike)(\s|$)/) ? <StrikeLines p={p} phone={phone} transform={turn} op={op} /> : null;
      const word = <text data-key={p.key} className={join("eng-p", "stg-t", `stg-f-${p.font}`, p.cls)} x={p.x} y={p.y} textAnchor={p.anchor} transform={turn} style={{ ...fontStyle(p.font, phone), ...paint(fill, "none"), opacity: op }}>{tip && <title>{tip}</title>}{p.lines.length === 1 && !p.runs?.[0] && !tip ? p.lines[0] : p.lines.map((l, i) => <tspan key={i} x={p.x} dy={i ? pitch : 0}>{p.runs?.[i] ? p.runs[i]!.map((r, j) => <Run key={j} r={r} />) : l}</tspan>)}</text>;
      return strike ? <>{word}{strike}</> : word;
    }
    case "chip": {
      const n = pal(p.role), w = atSizes(phone, () => chipW(p.words)), tone = p.tone && p.tone !== "off" ? p.tone : null;
      return <g data-key={p.key} data-id={p.id} className={p.cls} style={{ opacity: op }}><rect className="eng-p" x={q2(p.x)} y={q2(p.y)} width={q2(w)} height={CHIP_H} rx={6} style={{ ...paint(tone ? softOf(0, tone) : n ? softOf(n) : "var(--lk-canvas, var(--surface))", tone ? lineOf(0, tone) : n ? lineOf(n) : "var(--lk-hairline-2, var(--line-2))"), strokeWidth: 1.2 }} /><text className="eng-p stg-t stg-f-chip" x={p.x + w / 2} y={p.y + 13} textAnchor="middle" style={{ ...fontStyle("chip", phone), ...paint(tone ? inkOf(0, tone) : n ? inkOf(n) : INK, "none") }}>{p.words}</text></g>;
    }
    case "path": {
      // the paints sit on the group (a class there wins and the line inherits it); the width on the line itself
      const n = pal(p.role), col = wireOf(n), sw = p.width === "thin" ? "var(--lk-line-thin-w, 1.2px)" : p.width === "hot" || lit ? "var(--lk-line-hot-w, 2.2px)" : "var(--lk-line-w, 1.6px)";
      const pfill = p.fill === "soft" ? softOf(n) : p.fill === "role" ? lineOf(n) : "none";
      const pts = p.arrow ? pathPoints(p.d) : [];
      return (
        <g data-key={p.key} data-id={p.id} className={join("eng-p", "stg-edge", p.cls)} style={{ ...paint(pfill, col, { dash: p.dashed ? "var(--lk-dash, 6 4)" : undefined, so: lit || p.width === "hot" ? 1 : "var(--lk-line-quiet, .92)" }), color: col, opacity: op }}>
          <path className="stg-line" d={p.d} style={has(p.cls, OWN_W) ? undefined : { strokeWidth: sw }} />
          {p.arrow && pts.length >= 2 && <path className="stg-head" d={headAt(pts[pts.length - 2], pts[pts.length - 1])} style={{ fill: "currentColor", stroke: "none" }} />}
          {p.arrow === "both" && pts.length >= 2 && <path className="stg-head" d={headAt(pts[1], pts[0])} style={{ fill: "currentColor", stroke: "none" }} />}
        </g>
      );
    }
    case "dot": {
      const n = pal(p.role), col = lineOf(n, p.tone);
      return <circle data-key={p.key} className={join("eng-p", p.cls)} cx={q2(p.x)} cy={q2(p.y)} r={q2(p.r)} style={{ ...paint(p.hollow ? "var(--surface)" : col, col), strokeWidth: p.hollow ? 1.5 : 0, opacity: op }} />;
    }
  }
}
/** an arrowhead at b, along a to b */
function headAt(a: Pt, b: Pt, s = 10): string { // eng-polish: the stage's head: 10 long, 0.6 wide (lanes/items.ts headD)
  let dx = b.x - a.x, dy = b.y - a.y; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
  const q = 0.6, f = (n: number) => Math.round(n * 10) / 10;
  return `M${f(b.x)} ${f(b.y)}L${f(b.x - dx * s - dy * s * q)} ${f(b.y - dy * s + dx * s * q)}L${f(b.x - dx * s + dy * s * q)} ${f(b.y - dy * s - dx * s * q)}Z`;
}

// ------------------------------------------------------------------ the drawing of one plan at one moment
type DrawProps = { c: Compiled; plan: Plan; from: number; to: number; t: number; cam: Rect; still: boolean; camA?: Rect; camB?: Rect; active?: boolean; svgRef?: React.Ref<SVGSVGElement>; handlers?: Record<string, unknown> };
export function Draw({ c, plan, from, to, t, cam, still, camA, camB, active, svgRef, handlers }: DrawProps) {
  const m = modelAt(c, to), P = planAt(c, plan, to);
  const pal: Pal = (role) => (role ? m.roles[role]?.colour ?? (/^c[0-8]$/.test(role) ? +role.slice(1) : 0) : 0);
  const roleOf = (id?: Id) => (id && m.things[id] ? m.things[id].role : null);
  const A = sceneOf(c, from) === sceneOf(c, to) ? frameOf(plan, from) : [], B = frameOf(plan, to);
  const drawn = tweenFrames(A, B, still ? 1 : t);
  const mo = c.motions[to], forward = to === from + 1 && !still;
  const events: Event[] = mo?.events ?? [];
  const lit = new Set<string>(); for (const e of events) if (e.k === "light") for (const id of e.ids) lit.add(id);
  // a title cut with an ellipsis keeps its whole words as a tip (the model holds them)
  const tipOf = (p: Prim): string | undefined => { if (p.k !== "text" || !p.id || !p.key.endsWith(":title") || !/…$/.test(p.lines[p.lines.length - 1] ?? "")) return undefined; return m.things[p.id]?.title || undefined; };
  const rects = plan.rects(to);
  const things = Object.values(rects);
  const beats = Math.max(1, mo?.beats ?? 1);
  const local = (beat: number) => clamp01(t * beats - beat);
  const paths = new Map<string, Prim & { k: "path" }>(); for (const p of B) if (p.k === "path") paths.set(p.key, p);

  // the lines' own words (setup labels) and this step's words on its lines, off the lines
  const labels: React.ReactNode[] = [];
  const wordBoxes = B.flatMap((q) => q.k === "text" ? [textBox(q, plan.phone)] : q.k === "chip" ? [{ x: q.x, y: q.y, w: atSizes(plan.phone, () => chipW(q.words)), h: CHIP_H }] : []);
  const placedLabels: Rect[] = [];
  // what the reader sees: the camera's view within the scene (words placed outside it are cut on a phone)
  const W0 = wholeOf(P), bound = { x: Math.max(W0.x, cam.x), y: Math.max(W0.y, cam.y), w: Math.min(W0.x + W0.w, cam.x + cam.w) - Math.max(W0.x, cam.x), h: Math.min(W0.y + W0.h, cam.y + cam.h) - Math.max(W0.y, cam.y) };
  const said = new Map<string, string>(), saidRole = new Map<string, string | null>();
  for (const e of events) if (e.k === "send" && e.words) { said.set(e.rel, e.words); saidRole.set(e.rel, e.role ?? null); }
  for (const rel of Object.values(m.relations)) {
    const p = paths.get(`rel:${rel.id}`); if (!p || has(p.cls, /(^|\s)eng-words-own/)) continue;
    const words = said.get(rel.id) ?? rel.label; if (!words) continue;
    const s = labelSpot(pathPoints(p.d), words, [...things, ...wordBoxes, ...placedLabels], plan.phone, bound), hot = said.has(rel.id);
    placedLabels.push(s.box);
    const o = hot && forward ? ease(clamp01((t - 0.3) / 0.5)) : 1;
    const text = <text key={`lbl:${rel.id}`} data-key={`lbl:${rel.id}`} className={`stg-t stg-f-sub${hot ? " eng-said" : ""}`} x={s.x} y={s.y} textAnchor={s.anchor} style={{ ...fontStyle("sub", plan.phone), fill: hot ? INK : MUTED, fontWeight: hot ? 600 : undefined, opacity: o < 1 && !hot ? o : undefined }}>{words}</text>;
    // a line's words sit in a chip beside it (the old stage's rounded label); what a send carries this step is in the
    // send's colour (the old stage's message chip)
    const n = hot ? pal((saidRole.get(rel.id) ?? rel.role) || null) : 0, b = s.box;
    const fill = !hot ? "var(--lk-surface, var(--surface))" : n > 0 ? softOf(n) : "var(--lk-tint-acc, var(--acc-softer, var(--acc-soft)))";
    const edge = !hot ? "var(--lk-hairline-2, var(--line))" : n > 0 ? lineOf(n) : "color-mix(in srgb, var(--acc) 45%, var(--line))";
    labels.push(<g key={`pill:${rel.id}`} data-key={`pill:${rel.id}`} className={hot ? "eng-msg" : "eng-lbl"} style={{ opacity: o < 1 ? o : undefined }}>
      <rect x={q2(b.x)} y={q2(b.y)} width={q2(b.w)} height={q2(b.h)} rx={q2(b.h / 2)} style={{ fill, stroke: edge, strokeWidth: 1 }} />
      {text}
    </g>);
  }
  // events in motion: a dot along the line, a lost one (a cross, a fade), a stream; speech
  const fx: React.ReactNode[] = [];
  const whole = wholeOf(P), blockers = things;
  const words = [...wordBoxes, ...placedLabels];
  for (const [i, e] of events.entries()) {
    if (e.k === "send") {
      const p = paths.get(`rel:${e.rel}`); if (!p) continue;
      let pts = pathPoints(p.d); const rel = m.relations[e.rel];
      const back = p.arrow === "both" || (p.arrow === "end" && !(rel && e.from === rel.to && e.from !== rel.from)) ? HEAD_ROOM : 0; // eng-polish: the end that has a head
      if (rel && e.from === rel.to && e.from !== rel.from) pts = [...pts].reverse();
      const col = wireOf(pal(e.role ?? rel?.role ?? null));
      // a token send (`style token`) rests at the line's end once it has arrived, so a still step still shows it
      // render2: a finished send rests clear of words: a dot that would sit on a badge, a chip or a line's words is gone
      // (gt 02's ACK, gt 03's GET, gt 05, gt 10 at their last step)
      if (!forward || t >= 1) { if (e.style === "token") { const q = polyAt(pts, 1, back); if (restsOnWords(q, wordBoxes, placedLabels, B)) continue; fx.push(<circle key={`fx${i}`} className="eng-dot eng-rest" cx={q.x} cy={q.y} r={4.2} style={{ fill: col }} />); } continue; }
      const tb = local(e.beat);
      if (e.style === "stream") {
        for (let j = 0; j < 3; j++) { const ph = (tb * 1.6 + j / 3) % 1; const q = polyAt(pts, ph, back); fx.push(<circle key={`fx${i}.${j}`} className="eng-dot" cx={q.x} cy={q.y} r={3.4} style={{ fill: col, opacity: tb > 0 && tb < 1 ? 0.9 : 0 }} />); }
      } else if (e.style === "lost") {
        const stop = 0.6, run = clamp01(tb / 0.6), q = polyAt(pts, run * stop), gone = clamp01((tb - 0.6) / 0.4);
        fx.push(<circle key={`fx${i}`} className="eng-dot" cx={q.x} cy={q.y + gone * 6} r={4.2} style={{ fill: gone ? "var(--bad)" : col, opacity: tb > 0 ? 1 - gone : 0 }} />);
        if (gone > 0) fx.push(<path key={`fx${i}x`} className="eng-lost" d={`M${q.x - 6} ${q.y - 6}L${q.x + 6} ${q.y + 6}M${q.x + 6} ${q.y - 6}L${q.x - 6} ${q.y + 6}`} style={{ stroke: "var(--bad)", strokeWidth: 2.4, strokeLinecap: "round", fill: "none", opacity: 1 - gone * 0.6 }} />);
      } else {
        const run = clamp01((tb - 0.1) / 0.8), q = polyAt(pts, ease(run), back);
        fx.push(<circle key={`fx${i}`} className="eng-dot" cx={q.x} cy={q.y} r={4.2} style={{ fill: col, opacity: run > 0 && run < 1 ? 1 : 0 }} />);
      }
    } else if (e.k === "say") {
      const r = rects[e.id]; if (!r || plan.words === "own") continue; // the stage's layout draws its says itself
      // the words on one line (two when long), else wrapped narrower when that finds a free spot the wide one does not
      const said = plainOf(e.words), forms = [said.length > 34 ? splitWords(said, 30) : [said]];
      if (said.length > 12) forms.push(splitWords(said, Math.ceil(said.length / 2) + 2));
      let lines = forms[0], w = 0, h = 0, bx = 0, by = 0, bestAll = Infinity;
      for (const ls of forms) {
      w = Math.max(...ls.map((l) => measureAt(l, "sub", plan.phone))) + 16; h = ls.length * LINE_H.sub + 10;
      // the side the author asked for first, then above, right, below, left; above and below may slide along the thing; the
      // first that covers no thing and no word (else the one that covers least)
      const spot = (sd: string) => { const [side, sh] = sd.split(":"), dx = (+sh || 0) * w; return side === "right" ? { x: r.x + r.w + 10, y: r.y + r.h / 2 - h / 2 } : side === "left" ? { x: r.x - 10 - w, y: r.y + r.h / 2 - h / 2 } : side === "below" ? { x: r.x + r.w / 2 - w / 2 + dx, y: r.y + r.h + 10 } : { x: r.x + r.w / 2 - w / 2 + dx, y: r.y - h - 10 }; };
      const base = ["above", "right", "below", "left"], first = e.side ? [e.side] : [];
      const sides = [...first, ...base.filter((x) => x !== e.side), ...[0.15, -0.15, 0.3, -0.3, 0.45, -0.45].flatMap((d) => [`above:${d}`, `below:${d}`])];
      const cost = (q: { x: number; y: number }) => { const b = { x: q.x, y: q.y, w, h }; return (q.y < bound.y || q.x < bound.x || q.x + w > bound.x + bound.w || q.y + h > bound.y + bound.h ? 50 : 0) + blockers.reduce((n, x) => (x !== r && !within(x, r) && !within(x, b) && overlapR(b, x) ? n + (x.w * x.h > 6 * w * h ? 0.4 : 1) : n), 0) + words.filter((x) => overlapR(b, x)).length * 3; };
      let best = spot(sides[0]), bc = cost(best);
      for (const sd of sides.slice(1)) { if (bc === 0) break; const q = spot(sd), k2 = cost(q); if (k2 < bc) { bc = k2; best = q; } }
      if (bc < bestAll - 0.5) { bestAll = bc; lines = ls; bx = best.x; by = best.y; }
      if (bestAll === 0) break;
      }
      w = Math.max(...lines.map((l) => measureAt(l, "sub", plan.phone))) + 16; h = lines.length * LINE_H.sub + 10;
      const runs = runsOfLines(e.words, lines);
      const o = forward ? ease(clamp01((local(e.beat) - 0.2) / 0.5)) : 1, n = pal(e.role ?? roleOf(e.id));
      fx.push(
        <g key={`say${i}`} data-key={`say:${e.id}`} className="eng-say" style={{ opacity: o < 1 ? o : undefined }}>
          <rect x={q2(bx)} y={q2(by)} width={q2(w)} height={q2(h)} rx={8} style={{ fill: "var(--surface)", stroke: n ? lineOf(n) : "var(--line-2)", strokeWidth: 1.2 }} />
          <text className="stg-t stg-f-sub" x={bx + 8} y={by + 5 + LINE_H.sub - 4} style={{ ...fontStyle("sub", plan.phone), fill: INK }}>{lines.map((l, k) => <tspan key={k} x={bx + 8} dy={k ? LINE_H.sub : 0}>{runs[k].map((r, j) => <Run key={j} r={r} />)}</tspan>)}</text>
        </g>,
      );
    }
  }
  const view = stageView(c, plan, viewOf(plan)), fitted = cam.x <= whole.x + 0.5 && cam.y <= whole.y + 0.5 && cam.x + cam.w >= whole.x + whole.w - 0.5 && cam.y + cam.h >= whole.y + whole.h - 0.5 || Object.values(rects).every((r) => within(cam, r) || within(padR(cam, BORDER_CUT), r)); // every thing in view: no shaded edge
  // phonecam: nor when the view cuts only a thing's outer border (BORDER_CUT a side: the story frames things up to that much
  // wider than the stage centred, cutting borders, never words: format 55's cards, 358 on a 356 stage, were shaded over)
  const f = (n: number) => Math.round(n * 100) / 100;
  // each edge with more of the scene beyond it is shaded, with a small arrow (SPEC 6.8)
  const gid = "eng-sh-" + plan.width, sw = cam.w * 0.045, more = { l: cam.x > whole.x + 2, r: cam.x + cam.w < whole.x + whole.w - 2, t: cam.y > whole.y + 2, b: cam.y + cam.h < whole.y + whole.h - 2 };
  const shade = fitted ? null : (
    <g className="eng-edges" aria-hidden="true" style={{ pointerEvents: "none" }}>
      <defs>{(["l", "r", "t", "b"] as const).map((s) => <linearGradient key={s} id={`${gid}-${s}`} x1={s === "r" ? 1 : 0} x2={s === "l" ? 1 : 0} y1={s === "b" ? 1 : 0} y2={s === "t" ? 1 : 0}><stop offset="0" style={{ stopColor: "var(--lk-canvas, var(--surface))", stopOpacity: 0.95 }} /><stop offset="1" style={{ stopColor: "var(--lk-canvas, var(--surface))", stopOpacity: 0 }} /></linearGradient>)}</defs>
      {more.l && <rect x={cam.x} y={cam.y} width={sw} height={cam.h} fill={`url(#${gid}-l)`} />}
      {more.r && <rect x={cam.x + cam.w - sw} y={cam.y} width={sw} height={cam.h} fill={`url(#${gid}-r)`} />}
      {more.t && <rect x={cam.x} y={cam.y} width={cam.w} height={sw} fill={`url(#${gid}-t)`} />}
      {more.b && <rect x={cam.x} y={cam.y + cam.h - sw} width={cam.w} height={sw} fill={`url(#${gid}-b)`} />}
      {more.l && <path d={`M${cam.x + sw * 0.55} ${cam.y + cam.h / 2 - 6}l-6 6 6 6`} style={{ fill: "none", stroke: "var(--muted)", strokeWidth: 1.6 }} />}
      {more.r && <path d={`M${cam.x + cam.w - sw * 0.55} ${cam.y + cam.h / 2 - 6}l6 6-6 6`} style={{ fill: "none", stroke: "var(--muted)", strokeWidth: 1.6 }} />}
    </g>
  );
  // eng-polish (v0.7.0 149ccb8): a container whose heading the view cuts keeps it just inside the view's edge, in its container, off every word and thing
  // eng-sweep: the rides are worked out for the view they are asked for; while the story's camera glides they are blended from the view the step started in to the one it ends in
  // (a heading that rides in one view and sits at home in the next used to fly across and back inside one step: "node 1" 190 px, format 53)
  const ridesAt = (cam: Rect, on: boolean): Map<string, { dx: number; dy: number }> => {
  const rides = new Map<string, { dx: number; dy: number }>();
  if (on) {
    const items: RideItem[] = [], heads = new Set<string>(), avoid: { key: number | null; r: Rect }[] = [];
    const keyOf = new Map<string, number>(); let kn = 1; const keyFor = (id: string) => { let q = keyOf.get(id); if (!q) keyOf.set(id, (q = kn++)); return q; };
    const depthOf = (id: string) => { let d = 0; for (let p = m.things[id]?.parent; p && d < 20; p = m.things[p]?.parent) d++; return d; };
    for (const d of drawn) if (d.p.k === "text" && d.p.id && d.p.key === `t:${d.p.id}:title` && m.things[d.p.id]?.container && rects[d.p.id] && d.o > 0.02) {
      heads.add(d.p.key); items.push({ key: keyFor(d.p.id), depth: depthOf(d.p.id), r: rects[d.p.id], head: textBox(d.p, plan.phone) });
    }
    for (const d of drawn) {
      if (d.p.k === "text" && !heads.has(d.p.key)) avoid.push({ key: null, r: textBox(d.p, plan.phone) });
      else if (d.p.k === "text") avoid.push({ key: keyFor(d.p.id!), r: textBox(d.p, plan.phone) });
    }
    for (const [id, r] of Object.entries(rects)) if (!m.things[id]?.container) avoid.push({ key: keyFor(id), r });
    for (const [key, v] of rideHeads(items, avoid, cam, view.w / cam.w)) { const id = [...keyOf].find(([, q]) => q === key)?.[0]; if (id) rides.set(`t:${id}:title`, v); }
  }
  return rides;
  };
  const rides = camA && camB && !still && t < 1
    ? (() => {
      const a = ridesAt(camA, camA.w > 0 && camA.h > 0), b = ridesAt(camB, camB.w > 0 && camB.h > 0), te = ease(t), out = new Map<string, { dx: number; dy: number }>();
      for (const k of new Set([...a.keys(), ...b.keys()])) { const p = a.get(k) ?? { dx: 0, dy: 0 }, q = b.get(k) ?? { dx: 0, dy: 0 }; out.set(k, { dx: lerp(p.dx, q.dx, te), dy: lerp(p.dy, q.dy, te) }); }
      return out;
    })()
    : ridesAt(cam, !still && cam.w > 0 && cam.h > 0 || still && !fitted);
  // eng-polish (v0.7.0 8ded128): accent words this step brings (not in the step before) count as lit for the phone's step scroll
  const before = new Set(A.map((q) => q.key));
  const fresh = (p: Prim) => A.length > 0 && p.k === "text" && p.ink === "tone" && p.tone === "accent" && !before.has(p.key);
  const rode = (p: Prim): Prim => { const v = p.k === "text" ? rides.get(p.key) : undefined; const q = v && p.k === "text" ? { ...p, x: p.x + v.dx, y: p.y + v.dy, cls: join(p.cls, "eng-ride") } : p; return fresh(q) ? { ...q, cls: join((q as { cls?: string }).cls, "eng-fresh") } as Prim : q; };
  return (
    <svg ref={svgRef} className={plan.phone ? "stg-svg stg-phone eng-svg" : "stg-svg eng-svg"} viewBox={`${f(cam.x)} ${f(cam.y)} ${f(cam.w)} ${f(cam.h)}`} width={view.w} height={view.h} role="img" aria-hidden="true" data-step={to}
      style={{ width: `max(100%, min(${Math.ceil(view.w)}px, 100% + 4px))`, maxWidth: "none", marginLeft: `calc((100% - max(100%, min(${Math.ceil(view.w)}px, 100% + 4px))) / 2)`, aspectRatio: `${view.w} / ${view.h}`, overflow: fitted ? "visible" : "hidden", outline: active ? "2px solid var(--acc)" : undefined, outlineOffset: active ? 2 : undefined, borderRadius: 6, cursor: still ? undefined : "grab", touchAction: active ? "none" : "auto" }} {...(handlers as object)}>
      {drawn.map((d) => <Shape key={d.key} p={rode(d.p)} o={d.o} pal={pal} roleOf={roleOf} phone={plan.phone} tip={tipOf(d.p)} lit={!!d.p.k && "id" in d.p && !!d.p.id && lit.has(d.p.id as string)} />)}
      {labels}
      {fx}
      {shade}
    </svg>
  );
}
const overlapR = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** the box a text primitive's words take (measured: the stage's own widths) */
function textBox(q: Prim & { k: "text" }, phone: boolean): Rect {
  const w = Math.max(0, ...q.lines.map((l) => measureAt(l, q.font, phone))), pitch = LINE_H[q.font] ?? 16, top = q.y - pitch + 4;
  return { x: q.anchor === "middle" ? q.x - w / 2 : q.anchor === "end" ? q.x - w : q.x, y: top, w, h: q.lines.length * pitch };
}
function splitWords(s: string, n: number): string[] { const out: string[] = []; let cur = ""; for (const w of s.split(" ")) { if (cur && (cur + " " + w).length > n) { out.push(cur); cur = w; } else cur = cur ? cur + " " + w : w; } if (cur) out.push(cur); return out; }

// ------------------------------------------------------------------ timing
const PACE: Record<string, number> = { slow: 1.8, normal: 1, fast: 0.55 };
/** a step's motion length at speed 1: longer with a send or a move, each beat that long again */
export function stepMs(c: Compiled, k: number): number {
  const mo = c.motions[k]; if (!mo) return 850;
  const busy = mo.events.some((e) => e.k === "send") || mo.move.length > 0 || mo.values.length > 0;
  const fence = c.model.fence.pace && c.model.fence.pace !== "normal" ? c.model.fence.pace : null;
  return (busy ? 1500 : 850) * Math.max(1, mo.beats) * (PACE[mo.pace !== "normal" ? mo.pace : fence ?? "normal"] ?? 1);
}
const PAUSE = 1700;
// the reader moving the page (wheel, touch, scroll keys, a scroll the page did not make): a step's scroll waits for it
const USER_SCROLL_MS = 800;
let userScrollAt = -1e9, ownScrollUntil = 0, userScrollHooked = false;
function hookUserScroll() {
  if (userScrollHooked || typeof window === "undefined") return; userScrollHooked = true;
  const mark = () => { userScrollAt = performance.now(); }, opt = { passive: true, capture: true } as const;
  addEventListener("wheel", mark, opt); addEventListener("touchmove", mark, opt);
  addEventListener("keydown", (e: KeyboardEvent) => { if (["PageUp", "PageDown", "Home", "End", " ", "ArrowUp", "ArrowDown"].includes(e.key)) mark(); }, opt);
  addEventListener("scroll", () => { if (performance.now() > ownScrollUntil) mark(); }, opt);
}
const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// hydrate: the server's plans (ENG_SSR_W and PRINT_W), drawn on the server only. In the browser this throws a promise that never
// settles, so its Suspense boundary stays dehydrated: React keeps the server's HTML as it is and the browser never lays
// those plans out again (each stage used to lay out and hydrate 15: 87 stages took minutes on a slow phone). The
// stage puts its live plan in their place once it has measured its width. No HTML-string sink (the strict entry).
const NEVER: Promise<never> = new Promise<never>(() => {});
function ServerPlans({ c, k }: { c: Compiled; k: number }) {
  if (typeof window !== "undefined") throw NEVER;
  return <>{ssrPlans(c, k)}</>;
}
/** hydrate: the screen widths the server draws a stage at: the plans the client picks (screenPlanWidth) for a 320, 375, 390
 *  and 414 to 430 px phone, a 768 px tablet and a desktop page (box 286, 341, 356, 380, 730, 1178), 6 of the 14 SSR_W; between
 *  them the CSS shows the nearest narrower one (engine.css, data-ew), until the live plan comes. Each stage drew 15 plans: 19 MB of
 *  HTML on the 87-stage sample page. */
export const ENG_SSR_W = [286, 341, 356, 380, 730, 1178] as const;
const ssrPlans = (c: Compiled, k: number) => [...ENG_SSR_W, PRINT_W].map((x, i) => { const p = c.plan(x); return <div key={i} className="stg-plan stg-plan-ssr eng-plan-ssr" data-ew={ENG_SSR_W[i] ?? PRINT_W} data-print={i === ENG_SSR_W.length || undefined}><Draw c={c} plan={p} from={k} to={k} t={1} cam={cameraOf(c, p, k)} still={true} /></div>; });

// ------------------------------------------------------------------ the part
export function EngineStage({ compiled: c, ui, static: stp, srText }: { compiled: Compiled; ui: Ui; static?: StaticProp; srText?: string }) {
  const m = c.model, n = Math.max(0, c.states.length - 1), titles = m.steps.map((s) => s.title);
  const st = useStatic(stp, n, titles);
  const [kLive, setK] = useState(n ? 1 : 0);
  const [from, setFrom] = useState(n ? 1 : 0);
  const [t, setT] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [speed, cycleSpeed] = useSpeed();
  const [w, setW] = useState(0), [spx, setSpx] = useState(0); // phonecam: spx, the stage's width on the screen
  const [user, setUser] = useState<Rect | null>(null);
  const [active, setActive] = useState(false);
  // 3D (`3d`, `3d only` on the fence): the server and a browser with no WebGL draw 2D; with WebGL the stage switches to render/three.ts
  const { want: want3, only: only3 } = threeOf(c), [ok3, setOk3] = useState(false), [mode, setMode] = useState<"2d" | "3d">("2d"), api3 = useRef<ThreeApi | null>(null);
  useEffect(() => { const ok = want3 && canThree(only3); setOk3(ok); if (ok) setMode("3d"); }, []);
  const mode3 = mode === "3d" && !st.on;
  const box = useRef<HTMLDivElement>(null), root = useRef<HTMLDivElement>(null), svg = useRef<SVGSVGElement>(null);
  const raf = useRef(0);
  const camFrom = useRef<Rect | null>(null); // eng-sweep: where the camera was when the last step was asked for
  const k = st.on ? (n ? st.i + 1 : 0) : kLive; // a still scene has no step 1: static draws its state 0

  // the plan's width: the box's, snapped to the stage's plan widths (as ui/stage.tsx), so the server's plan is kept
  useEffect(() => {
    const el = box.current; if (!el) return;
    // hydrate: a stage with no width on its first measure (hidden) draws the server's plans itself, as before, so no boundary stays dehydrated
    const set = () => { const cw = el.clientWidth; if (cw <= 0) setOwnSsr(true); if (cw > 0 && !window.matchMedia?.("print").matches) { const nw = screenPlanWidth(cw); setSpx(cw); setW((old) => { if (old && old !== nw) { cancelAnimationFrame(raf.current); setT(1); setUser(null); } return nw; }); } };
    set();
    let ro: ResizeObserver | null = null;
    try { ro = new ResizeObserver(() => requestAnimationFrame(set)); ro.observe(el); } catch { addEventListener("resize", set); }
    return () => { ro?.disconnect(); removeEventListener("resize", set); };
  }, []);
  const plan = useMemo(() => (w ? c.plan(w) : null), [c, w]);
  // hydrate: the server's plans stay the server's (ServerPlans); one element for the stage's life, so an update before the
  // first measure is no update to the dehydrated boundary (React would drop the server's HTML and draw the empty fallback)
  const [ownSsr, setOwnSsr] = useState(false);
  const serverPlans = useMemo(() => <Suspense fallback={null}><ServerPlans c={c} k={k} /></Suspense>, [c]);
  const ssr = useMemo(() => (w || !ownSsr ? null : ssrPlans(c, k)), [c, w, ownSsr]);

  // stepping: blend from the step shown to the next; the camera glides with it
  const go = (to0: number, fromPlay = false) => {
    const to = Math.max(n ? 1 : 0, Math.min(n, to0));
    if (to === kLive) return;
    if (!fromPlay) { setPlaying(false); wantFollow.current = true; }
    cancelAnimationFrame(raf.current);
    if (mode3 && !fromPlay) api3.current?.back(); // eng-sweep: a step the reader asks for goes back to the story's camera in 3D too, as the old stage did (a zoomed-in 3D view stayed put and the step's action ran off the screen)
    // eng-sweep: the glide starts from the view on screen (a reader's zoom, a step cut short), never from a jump back to the story
    // camera. render2: before the stage has measured its width there is no plan and no view on screen, only the 1 x 1
    // stand-in (the stage grew from a point: cards inside cards at 390); then it starts from the step's own frame (camA)
    camFrom.current = glideFrom(!!plan, camRef.current);
    setFrom(kLive); setK(to); setUser(null);
    if (reduced()) { setT(1); return; }
    setT(0);
    const start = performance.now(), d = stepMs(c, to) / speed;
    const tick = (now: number) => { const p = clamp01((now - start) / d); setT(p); if (p < 1) raf.current = requestAnimationFrame(tick); };
    raf.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  // on a phone the foot (player row and caption) sticks over a tall stage: after a step the READER asked for, once it has
  // played, the step's lit things are scrolled above the foot when they sit under it or above the screen (as the old
  // stage); never on load, never on Play's own steps, never within USER_SCROLL_MS of the reader moving the page
  const wantFollow = useRef(false);
  useEffect(() => { hookUserScroll(); }, []);
  useEffect(() => {
    if (!wantFollow.current) return; wantFollow.current = false;
    if (st.on || typeof window === "undefined" || !matchMedia("screen and (max-width: 560px)").matches) return;
    const timer = setTimeout(() => {
      if (performance.now() - userScrollAt < USER_SCROLL_MS) return;
      const el = root.current, foot = el?.querySelector(".stg-foot"); if (!el || !foot) return;
      // eng-polish (v0.7.0 8ded128): the step's lit things and the accent words it brings (a table's chosen row: Draw marks them eng-fresh); all of them in one screen
      // when they fit, else the screenful that holds the most of them
      const hot = [...el.querySelectorAll(".stg-plan .stg-hot, .stg-plan .eng-fresh")].map((e) => e.getBoundingClientRect()).filter((b) => b.width > 0 && b.height > 0);
      if (!hot.length) return;
      const by = followBy(hot, foot.getBoundingClientRect().top);
      if (Math.abs(by) < 1) return;
      ownScrollUntil = performance.now() + 1200;
      scrollBy({ top: by, behavior: reduced() ? "auto" : "smooth" });
    }, reduced() ? 0 : stepMs(c, kLive) / speed);
    return () => clearTimeout(timer);
  }, [kLive]);
  const dwell = (stepMs(c, kLive) + PAUSE) / speed;
  useEffect(() => {
    if (!playing || st.on) return;
    if (kLive >= n) { setPlaying(false); return; }
    const tm = setTimeout(() => go(kLive + 1, true), dwell);
    return () => clearTimeout(tm);
  }, [playing, kLive, st.on, speed]);
  const onPlay = () => {
    if (playing) { setPlaying(false); return; }
    // Play on step 1 stays there for one whole pause (owner point 17); at the end it starts again; elsewhere it moves on
    if (kLive >= n) { cancelAnimationFrame(raf.current); setFrom(1); setK(1); setT(1); }
    else if (kLive > 1) go(kLive + 1, true);
    setPlaying(true);
  };

  // a press outside lets the stage go
  useEffect(() => {
    if (!active) return;
    const out = (e: PointerEvent) => { if (root.current && !root.current.contains(e.target as Node)) setActive(false); };
    document.addEventListener("pointerdown", out, true);
    return () => document.removeEventListener("pointerdown", out, true);
  }, [active]);

  const whole: Rect = plan ? wholeOf(planAt(c, plan, k)) : STAND_IN, view = plan ? stageView(c, plan, viewOf(plan)) : { w: 1, h: 1 }; // render2: stageView
  const all = toAspect(whole, view.w / view.h);
  const camA = plan ? cameraOf(c, plan, from, spx) : whole, camB = plan ? cameraOf(c, plan, k, spx) : whole;
  const story = st.on ? (plan ? cameraOf(c, plan, k, spx) : whole) : t >= 1 ? camB : lerpRect(camFrom.current ?? camA, camB, ease(t)); // eng-sweep
  const cam = user ?? story;
  const camRef = useRef(cam); camRef.current = cam;
  const activeRef = useRef(active); activeRef.current = active;
  const wholeRef = useRef(whole); wholeRef.current = whole;
  const natRef = useRef(view.w); natRef.current = view.w; // eng-sweep: the stage's natural width, the zoom's limit is 4x of it

  // Ctrl or Cmd + wheel (a trackpad pinch too) zooms at the pointer; a plain wheel moves the view once the stage is taken
  useEffect(() => {
    const el = svg.current; if (!el || st.on) return;
    const wheel = (e: WheelEvent) => {
      const u = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1, r = el.getBoundingClientRect(), v = camRef.current;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const p = { x: v.x + ((e.clientX - r.left) / r.width) * v.w, y: v.y + ((e.clientY - r.top) / r.height) * v.h };
        setUser(zoomAt(v, Math.exp(-e.deltaY * u * 0.01), p, wholeRef.current, natRef.current));
        return;
      }
      if (!activeRef.current) return;
      e.preventDefault();
      const s = v.w / r.width, dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX, dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
      setUser(keepNear({ ...v, x: v.x + dx * u * s, y: v.y + dy * u * s }, wholeRef.current));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [plan, st.on]);

  // drag moves the view, two fingers pinch; a tap takes the stage
  const ptrs = useRef(new Map<number, Pt>());
  const drag = useRef<{ x: number; y: number; cam: Rect; moved: boolean; dist?: number; mid?: Pt } | null>(null);
  const handlers = st.on || !plan ? undefined : {
    onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => {
      if (e.pointerType === "touch" && !activeRef.current) return; // one finger scrolls the page until the stage is taken
      ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
      const ps = [...ptrs.current.values()];
      drag.current = { x: e.clientX, y: e.clientY, cam: camRef.current, moved: false, ...(ps.length === 2 ? { dist: Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y), mid: { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 } } : {}) };
    },
    onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => {
      const d = drag.current; if (!d || !ptrs.current.has(e.pointerId)) return;
      ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const r = e.currentTarget.getBoundingClientRect(), s = d.cam.w / r.width, ps = [...ptrs.current.values()];
      if (ps.length === 2 && d.dist && d.mid) {
        const dist = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y), p = { x: d.cam.x + ((d.mid.x - r.left) / r.width) * d.cam.w, y: d.cam.y + ((d.mid.y - r.top) / r.height) * d.cam.h };
        setUser(zoomAt(d.cam, dist / d.dist, p, wholeRef.current, natRef.current)); d.moved = true; return;
      }
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < 5) return;
      d.moved = true;
      setUser(keepNear({ ...d.cam, x: d.cam.x - dx * s, y: d.cam.y - dy * s }, wholeRef.current));
    },
    onPointerUp: (e: React.PointerEvent<SVGSVGElement>) => {
      const d = drag.current; ptrs.current.delete(e.pointerId);
      if (!ptrs.current.size) drag.current = null;
      if (d && !d.moved) setActive(true);
    },
    onPointerCancel: (e: React.PointerEvent<SVGSVGElement>) => { ptrs.current.delete(e.pointerId); drag.current = null; },
    onClick: () => setActive(true),
  };
  // eng-sweep: the 3D stage's zoom is a distance factor (below 1 = closer, as the old stage's buttons call it); f here is 2D's (above 1 = closer). "+" used to zoom out in 3D
  const zoomBy = (f: number) => { if (mode3) { api3.current?.zoom(1 / f); return; } const v = camRef.current; setUser(zoomAt(v, f, { x: v.x + v.w / 2, y: v.y + v.h / 2 }, whole, view.w)); };
  const onKey = (e: React.KeyboardEvent) => {
    if (st.on || !n || (e.target as HTMLElement).closest("input,select,textarea")) return;
    const v = camRef.current;
    if (e.key === "PageDown") { go(k + 1); e.preventDefault(); return; }
    if (e.key === "PageUp") { go(k - 1); e.preventDefault(); return; }
    if (e.key === "+" || e.key === "=") { zoomBy(1.25); e.preventDefault(); return; }
    if (e.key === "-") { zoomBy(0.8); e.preventDefault(); return; }
    if (e.key === "0" || e.key === "Escape") { if (mode3) api3.current?.fit(); else setUser(null); return; }
    if (active && e.key.startsWith("Arrow")) {
      const dx = e.key === "ArrowLeft" ? -0.1 : e.key === "ArrowRight" ? 0.1 : 0, dy = e.key === "ArrowUp" ? -0.1 : e.key === "ArrowDown" ? 0.1 : 0;
      if (mode3) api3.current?.pan(dx * 400, dy * 400); else setUser(keepNear({ ...v, x: v.x + dx * v.w, y: v.y + dy * v.h }, whole)); e.preventDefault(); return;
    }
    if ((e.target as HTMLElement).closest("button")) return;
    if (e.key === "ArrowRight") { go(k + 1); e.preventDefault(); }
    if (e.key === "ArrowLeft") { go(k - 1); e.preventDefault(); }
  };

  const step = n ? m.steps[k - 1] : null;
  // the colour legend (SPEC 6.10): a swatch and the words of each role that has a label
  const legend = Object.entries(m.roles).filter(([, r]) => r.label);
  // fmt12: each key entry shows its role as its boxes look (soft fill, 2 px edge) and as its lines look (a short stroke in the
  // line colour): in light the yellow role's lines are a dark amber-grey (the palette keeps them apart from green for colour-blind
  // readers), so a key of the fill alone read yellow beside lines that are not
  // a step inside a scene of its own (SPEC 6.12): a chip in the bar names it
  const inside = sceneOf(c, k);
  const notes = plan?.words === "own" ? [] : (c.motions[k]?.events ?? []).filter((e): e is Extract<Event, { k: "note" | "foot" }> => e.k === "note" || e.k === "foot");
  const phone = !!plan?.phone;
  const hint = mode3 ? ((active ? (ui as any).hintOn3d : (ui as any).hintOff3d) ?? "Drag to turn, right-drag or Shift + drag to move · wheel or pinch: zoom") : phone ? ui.hintShort ?? ui.hintOff : active ? ui.hintOn : ui.hintOff;
  const fitted = cam.x <= whole.x + 0.5 && cam.y <= whole.y + 0.5 && cam.x + cam.w >= whole.x + whole.w - 0.5 && cam.y + cam.h >= whole.y + whole.h - 0.5;
  return (
    <div ref={root} className={`stg eng eng-stage${st.on ? " stg-static" : ""}`} data-look={m.look} data-origin={m.origin} data-dh-slot="stage" data-engine="12" data-steps={n} data-step={k} data-bar-steps={n || 1}
      tabIndex={n && !st.on ? 0 : undefined} aria-label={m.title || undefined} onKeyDown={onKey}>
      <div className="stg-bar">
        {m.title && <span className="stg-title"><b>{m.title}</b>{m.note && <code className="stg-note">{m.note}</code>}</span>}
        {inside && <span className="eng-inside" style={{ fontSize: 12, padding: "2px 8px", borderRadius: 999, border: "1px solid var(--lk-hairline-2, var(--line-2))", color: "var(--lk-ink-2, var(--ink-2))" }}>{ui.inScene ?? "Inside"} · {m.scenes[inside]?.title || inside}</span>}
        {legend.length > 0 && <span className="eng-legend" style={{ display: "inline-flex", flexWrap: "wrap", gap: "4px 12px", fontSize: 12, color: "var(--lk-ink-2, var(--ink-2))" }}>{legend.map(([id, r]) => <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span aria-hidden="true" className="eng-key-box" style={{ width: 12, height: 12, borderRadius: 3, background: softOf(r.colour), border: `2px solid ${lineOf(r.colour)}`, boxSizing: "border-box" }} /><span aria-hidden="true" className="eng-key-line" style={{ width: 12, height: 2.5, borderRadius: 2, marginLeft: -3, background: lineOf(r.colour) }} />{r.label}</span>)}</span>}
        {ok3 && !only3 && !st.on && <button type="button" className="scn-mode" onClick={() => setMode(mode3 ? "2d" : "3d")} aria-pressed={mode3} aria-label={mode3 ? ((ui as any).show2d ?? "Show flat (2D)") : ((ui as any).show3d ?? "Show in 3D")}>{mode3 ? "2D" : "3D"}</button>}
        {/* hydrate: the server draws the camera buttons too (off until the live plan), so the bar does not grow a row when the stage hydrates */}
        {!st.on && (
          <span className="stg-ctl" role="group" aria-label={ui.camera}>
            <button type="button" className="stg-btn" onClick={() => zoomBy(0.8)} aria-label={ui.zoomOut} title={ui.zoomOut} disabled={!plan}>−</button>
            <button type="button" className="stg-btn" onClick={() => zoomBy(1.25)} aria-label={ui.zoomIn} title={ui.zoomIn} disabled={!plan}>+</button>
            <button type="button" className="stg-btn" onClick={() => (mode3 ? api3.current?.fit() : setUser({ ...all }))} disabled={!plan || (!mode3 && fitted)}>{ui.fitAll}</button>
            {user && !mode3 && <button type="button" className="stg-btn" onClick={() => setUser(null)}>{ui.backToStory}</button>}
          </span>
        )}
      </div>
      <div className={plan && !mode3 ? "stg-box-wrap stg-ratio" : "stg-box-wrap"} ref={box} data-bar-stage="" style={plan && !mode3 ? { aspectRatio: `${view.w} / ${view.h}` } : undefined} suppressHydrationWarning>
        {mode3 && plan ? <ThreeHost c={c} k={k} speed={speed} apiRef={api3} onFail={() => { setOk3(false); setMode("2d"); }} loading={(ui as any).loading3d} />
        : plan ? <div className="stg-plan"><Draw c={c} plan={plan} from={st.on ? k : from} to={k} t={st.on ? 1 : t} cam={cam} camA={user || st.on || t >= 1 ? undefined : camFrom.current ?? camA} camB={user || st.on || t >= 1 ? undefined : camB} still={st.on} active={active} svgRef={svg} handlers={handlers} /></div>
          : ssr ?? serverPlans /* hydrate */}
      </div>
      {/* hydrate: before the stage has its plan (the server, the first render) both hints are drawn and engine.css shows the phone's
          short one where the plan will be a phone plan, so the line does not change length when the stage hydrates */}
      {!st.on && n > 0 && <p className="eng-hint" style={{ margin: "4px 12px 0", fontSize: 12, color: "var(--muted)" }}>{plan || mode3 ? hint : <><span className="eng-hint-wide">{ui.hintOff}</span><span className="eng-hint-phone">{ui.hintShort ?? ui.hintOff}</span></>}</p>}
      {srText && <p className="sr-only">{srText}</p>}
      {n > 0 && !st.on && (
        <>
          <div className="stg-foot">
            <Controls ui={ui} i={k - 1} n={n} stepNames={m.steps.map(stepName)} onGo={(x) => go(x + 1)} playing={playing} onPlay={onPlay} speed={speed} onSpeed={cycleSpeed} dwell={dwell} />
            <div className="stg-capbox">
              <p className="stg-cap" data-bar-caption="">{leadOf(step)}{marked([step?.caption, ...(plan?.caption(k) ?? [])].filter(Boolean).join(" "))}{notes.map((x, i) => <span key={i} className={`eng-note eng-${x.k}`}>{" "}{marked(x.words)}</span>)}</p>
              {m.steps.map((s, i) => <p key={i} className="stg-cap stg-cap-room" aria-hidden="true">{leadOf(s)}{marked(s.caption)}</p>)}
            </div>
          </div>
        </>
      )}
      {st.on && n > 0 && <StaticSteps titles={m.steps.map((s) => plainOf(s.caption === s.title ? s.title : `${s.title}: ${s.caption}`))} i={k - 1} label={ui.allSteps} print={st.print} />}
    </div>
  );
}
export { union };
