// render2: a graph scene fills its stage as the graph engine's own stage did (SPEC 6.8: a fixed stage between 1.25 and 2.4
// wide per unit of height and at least 260 px tall; the story's camera draws up to 1.5 times natural size). The engine's
// stage drew a graph scene at natural size in a box as tall as the scene, so a small one sat small in a wide empty stage
// (format 47, the engine's array) and a wide one was a thin strip (55a, eight colours; 72). On a wide screen only: a
// phone's stage is phonecam's (it shrinks to fit, never zooms in).
import type { Compiled, Plan, Rect } from "../types";
import { toAspect, union } from "./camera";

const MIN_H = 260, WIDEST = 2.4, MOST = 1.5, PAD = 16;
const fills = (c: Compiled, plan: Plan): boolean => c.model.layout === "graph" && !plan.phone && c.model.view === "2d";

/** the stage's size in scene units: a graph scene's stage is at least 260 tall and no wider than 2.4 per unit of height
 * (it only grows: a scene taller than that keeps its own height) */
export function stageView(c: Compiled, plan: Plan, view: { w: number; h: number }): { w: number; h: number } {
  if (!fills(c, plan)) return view;
  return { w: view.w, h: Math.max(view.h, MIN_H, view.w / WIDEST) };
}

/** each step's frame, zoomed in on the things the story shows (all of its steps: no zoom between them) up to 1.5 times
 * natural size, where the frame showed them all; a frame that cuts some (the reader moves) is kept */
export function filledFrames(c: Compiled, plan: Plan, cams: Rect[], view: { w: number; h: number }): Rect[] {
  if (!fills(c, plan) || !cams.length) return cams;
  const rs: Rect[] = [];
  for (let k = 0; k < c.states.length; k++) rs.push(...Object.values(plan.rects(k)));
  const u = rs.length ? union(rs) : null; if (!u) return cams;
  const ar = view.w / view.h;
  let f = toAspect({ x: u.x - PAD, y: u.y - PAD, w: u.w + 2 * PAD, h: u.h + 2 * PAD }, ar);
  if (f.w < view.w / MOST) f = toAspect({ x: f.x + f.w / 2 - view.w / MOST / 2, y: f.y + f.h / 2, w: view.w / MOST, h: 0 }, ar);
  const holds = (a: Rect, b: Rect) => a.x <= b.x + 0.5 && a.y <= b.y + 0.5 && a.x + a.w >= b.x + b.w - 0.5 && a.y + a.h >= b.y + b.h - 0.5;
  return cams.map((cam) => (f.w < cam.w - 0.5 && holds(cam, u) ? f : cam));
}

/** render2: does a resting send's dot (r 4.2 at q) sit on words: a text or a chip of the frame, a line's words placed this
 * step, or a stage's chip box (a line's words or a tag)? */
export function restsOnWords(q: { x: number; y: number }, words: Rect[], labels: Rect[], frame: readonly { k: string; rect?: Rect; cls?: string }[]): boolean {
  const d: Rect = { x: q.x - 5, y: q.y - 5, w: 10, h: 10 };
  const meets = (b: Rect) => d.x < b.x + b.w && b.x < d.x + d.w && d.y < b.y + b.h && b.y < d.y + d.h;
  return words.some(meets) || labels.some(meets) || frame.some((p) => p.k === "rect" && !!p.rect && /(^|\s)stg-chip(\s|$)/.test(p.cls ?? "") && meets(p.rect));
}
