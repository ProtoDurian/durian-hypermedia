// Lane render: the auto camera (DESIGN 2.1, SPEC 6.8): what a step frames.
// - It frames what the step touches, with a margin, in the stage's shape (the stage keeps one shape for the story).
// - Never smaller than the whole scene fitted: a plan is laid out at the stage's own width, so fitted is natural size
//   and its words are 11 px or more; the camera never zooms out past that, so words are never under 11 px.
// - Never larger than MAX_ZOOM times natural size, and it only moves in when that gains at least MIN_GAIN: a small
//   change of frame reads as a jolt (owner point 19), not as a close-up.
// - Whole things at the edge: a thing the frame would cut in half is taken in whole (the frame grows, never past the
//   scene) or left out (the frame slides), keeping what the step touches in frame.
// - Step 1 starts fitted (owner point 25), and so does any step that touches nothing; layouts whose rule is that
//   nothing moves (lanes, timeline, grid, sheet, wrap, track) keep the whole scene in frame on every step.
import type { LayoutName, Rect } from "../types";

export const MAX_ZOOM = 1.5;
export const MIN_GAIN = 1.25;
export const MARGIN = 24;
export const PHONE_MARGIN = 14;
/** layouts drawn still: the camera never leaves the whole scene */
export const STILL_LAYOUTS: LayoutName[] = ["lanes", "timeline", "grid", "sheet", "wrap", "track"];

export const union = (rs: Rect[]): Rect | null => (rs.length ? rs.reduce((a, r) => ({ x: Math.min(a.x, r.x), y: Math.min(a.y, r.y), w: Math.max(a.x + a.w, r.x + r.w) - Math.min(a.x, r.x), h: Math.max(a.y + a.h, r.y + r.h) - Math.min(a.y, r.y) })) : null);
const pad = (r: Rect, m: number): Rect => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });
const same = (a: Rect, b: Rect) => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5;

/** grow r to the aspect ar (w / h) around its centre */
export function toAspect(r: Rect, ar: number): Rect {
  if (!(ar > 0)) return r;
  let { w, h } = r;
  if (w / h > ar) h = w / ar; else w = h * ar;
  return { x: r.x + r.w / 2 - w / 2, y: r.y + r.h / 2 - h / 2, w, h };
}
/** keep r inside whole: shrink to it if larger, else slide in */
export function clampTo(r: Rect, whole: Rect): Rect {
  if (r.w >= whole.w - 0.5 && r.h >= whole.h - 0.5) return { ...whole };
  // each way on its own: larger than the scene, centred on it; else slid inside it
  const x = r.w >= whole.w ? whole.x + (whole.w - r.w) / 2 : Math.max(whole.x, Math.min(whole.x + whole.w - r.w, r.x));
  const y = r.h >= whole.h ? whole.y + (whole.h - r.h) / 2 : Math.max(whole.y, Math.min(whole.y + whole.h - r.h, r.y));
  return { x, y, w: r.w, h: r.h };
}

/** What the auto camera frames: the touched things with a margin, in the scene's shape; the whole scene when they
 * fill most of it. Contract: render lane (ENGINE.md section 3; pipeline.ts Plan.focus). */
export function focusRect(touched: Rect[], whole: Rect, phone: boolean): Rect {
  const u = union(touched);
  if (!u || whole.w <= 0 || whole.h <= 0) return { ...whole };
  const ar = whole.w / whole.h;
  let r = toAspect(pad(u, phone ? PHONE_MARGIN : MARGIN), ar);
  // never closer than MAX_ZOOM
  const minW = whole.w / MAX_ZOOM;
  if (r.w < minW) r = toAspect({ x: r.x + r.w / 2 - minW / 2, y: r.y + r.h / 2 - minW / ar / 2, w: minW, h: minW / ar }, ar);
  // not worth a move: the whole scene
  if (whole.w / r.w < MIN_GAIN) return { ...whole };
  return clampTo(r, whole);
}

/** The story camera for one step (SPEC 6.8): everything, when everything fits the stage at natural size (the size its
 * words are laid out at, 11 px or more); else a window of the stage's size at natural size, never smaller (the least
 * scale: words never under 11 px), centred on what the step touches (or the scene's start), slid so it cuts the fewest
 * things in half and keeps what the step touches. `view` is the stage's size in scene units at natural size.
 * `rects` are every thing's rect at that step (containers included). */
export function storyCamera(step: number, whole: Rect, view: { w: number; h: number }, rects: Rect[], keep: Rect[] = []): Rect {
  const W = Math.min(view.w, whole.w), H = Math.min(view.h, whole.h);
  if (W >= whole.w - 0.5 && H >= whole.h - 0.5) return { ...whole };
  const k = union(keep);
  const c = k ? { x: k.x + k.w / 2, y: k.y + k.h / 2 } : { x: whole.x + W / 2, y: whole.y + H / 2 };
  const f = clampTo({ x: c.x - W / 2, y: c.y - H / 2, w: W, h: H }, whole);
  return wholeAtEdge(f, whole, rects, k && k.w <= W && k.h <= H ? keep : [], { w: W, h: H });
}

// phonecam: a plan wider than the stage shrinks to fit (as the old camera, core/readable.ts leastScale), per step, down
// to the scale where the step's smallest words are MIN_WORD_PX on the screen, never below the old floors (0.8 on a
// phone, 0.65 on a laptop); only when it does not fit at that scale is it a natural-size window with shaded edges
export const MIN_WORD_PX = 11;
/** the least scale a step may be drawn at (1 = natural size), from the smallest words it draws (px at natural size) */
export const leastScaleOf = (minWordPx: number, phone: boolean): number => Math.min(1, Math.max(phone ? 0.8 : 0.65, MIN_WORD_PX / (minWordPx > 0 && Number.isFinite(minWordPx) ? minWordPx : MIN_WORD_PX)));
/** phonecam: the story's frame of a step whose things (`used`, over the whole story) are wider than the stage (`view.w`
 * scene units at natural size): all of them, centred, with a margin of up to `pad` (less where only that fits), when they
 * are at most `maxW` wide (the stage at the step's least scale; never wider than the canvas `whole`); null when they do
 * not fit (the natural-size window) */
export function shrinkToFit(used: Rect, whole: Rect, view: { w: number; h: number }, maxW: number, pad = 8): Rect | null {
  if (used.w <= view.w + 0.5) return null;
  if (used.w > maxW + 0.5) return null;
  const w = Math.max(view.w, Math.min(whole.w, used.w + 2 * pad, maxW));
  const x = Math.max(whole.x, Math.min(whole.x + whole.w - w, used.x + used.w / 2 - w / 2));
  return { x, y: whole.y, w, h: whole.h };
}

export const SLACK = 12;
/** like clampTo, but a frame smaller than the scene may run up to SLACK px past its edge (eng-polish, v0.7.0 cab61bb) */
export function slackTo(r: Rect, whole: Rect): Rect {
  if (r.w >= whole.w - 0.5 && r.h >= whole.h - 0.5) return { ...whole };
  const x = r.w >= whole.w ? whole.x + (whole.w - r.w) / 2 : Math.max(whole.x - SLACK, Math.min(whole.x + whole.w - r.w + SLACK, r.x));
  const y = r.h >= whole.h ? whole.y + (whole.h - r.h) / 2 : Math.max(whole.y - SLACK, Math.min(whole.y + whole.h - r.h + SLACK, r.y));
  return { x, y, w: r.w, h: r.h };
}

/** A frame that cuts a thing in half grows to take it in (never past the scene, never past fitted) or slides to leave
 * it out, keeping `keep` (what the step touches) in frame. */
export function wholeAtEdge(frame: Rect, whole: Rect, rects: Rect[], keep: Rect[] = [], max: { w: number; h: number } = whole): Rect {
  // it keeps the frame's shape, and never grows past max (the stage at natural size: words never under 11 px)
  const ar = frame.w / frame.h;
  const cuts = (f: Rect) => rects.filter((r) => r.w < f.w && r.h < f.h && overlaps(f, r) && !inside(f, r)).length;
  let f = frame;
  for (let pass = 0; pass < 3 && cuts(f) > 0; pass++) {
    const cut = rects.filter((r) => r.w < f.w && r.h < f.h && overlaps(f, r) && !inside(f, r));
    const grown = clampTo(toAspect(union([f, ...cut])!, ar), whole);
    if (grown.w <= max.w + 0.5 && grown.h <= max.h + 0.5 && cuts(grown) < cuts(f)) { f = grown; continue; }
    // slide: the place within a few steps that cuts the fewest, with `keep` whole
    // eng-polish (v0.7.0 cab61bb): the places that leave a cut thing out exactly are tried too, and the frame may run up to SLACK px past
    // the scene on that side (empty ground), only where that cuts fewer than any place within the scene; within the scene wins any tie
    let best = f, bc = cuts(f);
    const out = rects.filter((r) => r.w < f.w && r.h < f.h && overlaps(f, r) && !inside(f, r));
    // the first order (dx, dy, step) is the one the camera always had, so a tie keeps its old choice; then the exact places, then the places past the scene
    const raw: Rect[] = [];
    for (const dx of [-1, 1, 0]) for (const dy of [-1, 1, 0]) for (const s of [0.1, 0.2, 0.3]) raw.push({ ...f, x: f.x + dx * s * f.w, y: f.y + dy * s * f.h });
    for (const r of out) for (const x of [r.x + r.w + 2, r.x - 2 - f.w]) raw.push({ ...f, x });
    for (const r of out) for (const y of [r.y + r.h + 2, r.y - 2 - f.h]) raw.push({ ...f, y });
    const tries = [...raw.map((g) => clampTo(g, whole)), ...raw.map((g) => slackTo(g, whole))];
    for (const g of tries) {
      if (keep.length && !keep.every((k) => inside(g, k))) continue;
      const c = cuts(g); if (c < bc) { bc = c; best = g; }
    }
    if (best === f) break;
    f = best;
  }
  return f;
}
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (o: Rect, r: Rect) => o.x <= r.x + 0.5 && o.y <= r.y + 0.5 && o.x + o.w >= r.x + r.w - 0.5 && o.y + o.h >= r.y + r.h - 0.5;

/** linear blend of two frames (the camera glides) */
export const lerpRect = (a: Rect, b: Rect, t: number): Rect => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t, h: a.h + (b.h - a.h) * t });

/** the reader's view after zooming by k (k > 1 closer) at point p, kept between MAX_READER_ZOOM and fitted */
export const MAX_READER_ZOOM = 4;
/** the reader zooms between 4x natural size and the whole scene in the stage's shape */
export function zoomAt(view: Rect, k: number, p: { x: number; y: number }, whole: Rect, nat?: number): Rect {
  const ar = view.w / view.h, all = toAspect(whole, ar);
  // eng-sweep: 4x is of the stage's natural size (`nat`, scene units), not of the view the reader has now: zoomed in twice it was 16x, then 64x (the wheel gave 11x in two turns)
  const w = Math.max(Math.min(all.w, nat ?? view.w) / MAX_READER_ZOOM, Math.min(all.w, view.w / k)), h = w / ar, s = w / view.w;
  return keepNear({ x: p.x - (p.x - view.x) * s, y: p.y - (p.y - view.y) * s, w, h }, whole);
}
/** a reader's view may run past the scene a little, never lose it */
export function keepNear(v: Rect, whole: Rect): Rect {
  const mx = Math.min(v.w, whole.w) * 0.5, my = Math.min(v.h, whole.h) * 0.5;
  const x = Math.max(whole.x - mx, Math.min(whole.x + whole.w - v.w + mx, v.x)), y = Math.max(whole.y - my, Math.min(whole.y + whole.h - v.h + my, v.y));
  return { ...v, x, y };
}
