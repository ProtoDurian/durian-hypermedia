// This package is the source of this file: edit it here. It began as a copy synced from a private prototype (scripts/sync.ts, now frozen).
// The story camera keeps words readable (format version 10): words are never drawn under MIN_PX on the screen,
// on a phone and on a laptop.
//
// On any stage (a phone under NARROW pixels, or a laptop) the story camera draws a step no smaller than the scale at which its smallest
// words are MIN_PX. When everything the step touches fits at that scale, it frames all of it (as before). When it does
// not fit (a stream along a whole flow, a send between two things far apart, a fan-out to things spread wide), the
// camera frames the step's **focus** instead, at that scale:
//   1. what the step says or leaves at rest: speech, a sent token's chip, an arrow's or a stream's label (mid-path),
//      with what they belong to;
//   2. what the step adds, moves, changes or lights (things it touches that are not only on a send's path);
//   3. where each send arrives (the end of its path), then where it starts;
//   4. the rest of each send's path, the nearest first.
// It takes each in that order when it still fits with what it has (the first always), so the reader sees where the
// step ends up, with as much of the way there as fits; the rest of the path still runs, and the shaded stage edges
// say more of the scene is beyond them.
//
// The phone also picks its layout by this rule: the narrow layout (the stage's own row or left-to-right graph runs
// top to bottom) when the scene is wide (more than WIDE wide per unit of height, as before), or when it keeps whole
// more steps than the plain phone layout does (fewer steps whose touched things must be cut to their focus).
import { compileScene, touchedRect, union, pad, center, fitAspect, minFont, MIN_PX, MARGIN, NARROW, type Compiled, type Frame, type Rect } from "./scene";
import { BudgetError } from "./budget";

// a scene wider than this per unit of height always takes the narrow layout on a phone (format version 8)
export const WIDE = 1.4;
// the phone screen height the layout choice assumes (the stage's height comes from it: site/src/parts.css)
export const PHONE_VH = 800;
// the phone stage's height for a stage px wide and a scene of shape aspect (site/src/parts.css: at least
// min(62vh, 360), at most 74vh)
export const phoneStageH = (px: number, aspect: number, vh = PHONE_VH) => Math.min(0.74 * vh, Math.max(Math.min(0.62 * vh, 360), px / aspect));
// the least scale of the story camera on a stage px wide (format version 10): where the frame's smallest words reach
// MIN_PX on the screen, on every screen (version 8 did this on a phone only, and drew a laptop down to 0.65). With no
// stage width known (px 0) there is no least
export const leastScale = (f: Frame, px: number) => (px ? Math.max(px < NARROW ? 0.8 : 0.65, MIN_PX / minFont(f)) : 0.65);

const fits = (r: Rect, W: number, ar: number) => fitAspect(pad(r, MARGIN), ar).w <= W + 0.5;

// the step's focus, in the order the camera takes it: groups of rectangles (a thing with its words and its tokens;
// a mark with what it belongs to)
export function focusItems(f: Frame): Rect[][] {
  const byKey = new Map(f.boxes.map((b) => [b.key, b]));
  const set = new Set(f.touched);
  const withWords = (k: number): Rect[] => {
    const b = byKey.get(k);
    if (!b) return [];
    const rs: Rect[] = [b.lbl ? union([b, b.lbl]) : b];
    // the tokens and pointers that sit on it
    for (const x of f.boxes) if ((x.kind === "token" || x.kind === "pointer") && x.ent.anchor === b.id) rs.push(x);
    return rs;
  };
  const items: Rect[][] = [];
  // 1. marks: speech, a resting chip, an arrow's label, with what they belong to
  for (const m of f.marks) items.push([m.r, ...withWords(m.at)]);
  // 2. touched things that are not only on a send's path
  const onPath = new Set(f.sends.flatMap((s) => s.path));
  for (const k of f.touched) if (!onPath.has(k)) items.push(withWords(k));
  // 3. where each send arrives, then where it starts
  for (const s of f.sends) if (s.path.length && set.has(s.path.at(-1)!)) items.push(withWords(s.path.at(-1)!));
  for (const s of f.sends) if (s.path.length && set.has(s.path[0])) items.push(withWords(s.path[0]));
  // 4. the rest of each path (ordered nearest first when chosen)
  const mids = f.sends.flatMap((s) => s.path.slice(1, -1)).filter((k) => set.has(k));
  const near = items.length ? center(union(items.flat())) : null;
  const dist = (k: number) => { const b = byKey.get(k); return b && near ? Math.hypot(center(b).x - near.x, center(b).y - near.y) : 0; };
  for (const k of [...new Set(mids)].sort((a, b) => dist(a) - dist(b))) items.push(withWords(k));
  return items.filter((it) => it.length);
}

// a thing larger than the view at the least scale (a big container the step lights or fills): its top-left part,
// where its heading is, as much as fits, so the words keep their size
function corner(r: Rect, W: number, ar: number): Rect {
  if (fits(r, W, ar)) return r;
  const w = Math.min(r.w, W - 2 * MARGIN), h = Math.min(r.h, W / ar - 2 * MARGIN);
  return { x: r.x, y: r.y, w: Math.max(1, w), h: Math.max(1, h) };
}
// what the story camera frames for a step on a view W wide, of shape ar: everything the step touches when it fits,
// else its focus (as much as fits, in order). Returns the rectangles kept, and whether some were left out
export function storyFocus(f: Frame, W: number, ar: number): { keep: Rect[]; cut: boolean } | null {
  const t = touchedRect(f);
  if (!t) return null;
  if (fits(t, W, ar)) return { keep: [t], cut: false };
  const keep: Rect[] = [];
  for (const it of focusItems(f)) {
    const u = union(it);
    if (!keep.length || fits(union([...keep, u]), W, ar)) keep.push(keep.length ? u : corner(u, W, ar));
  }
  return { keep: keep.length ? keep : [t], cut: true };
}

// does the step's whole touched area fit a phone stage px wide at the least scale?
function cutSteps(c: Compiled, px: number): number {
  const ar = px / phoneStageH(px, c.aspect);
  return c.frames.filter((f) => { const t = touchedRect(f); return t && !fits(t, px / leastScale(f, px), ar); }).length;
}
// (rc.5) the steps with no camera or focus of their own, which talk about the whole scene, that a phone stage px wide
// cannot show whole at the least scale: on a stage as tall as the scene's shape asks (the stage's floor of 0.62 wide
// per unit of height is a least height, not a most)
function cutWholeSteps(c: Compiled, px: number): number {
  if (!c.frames.length) return 0;
  const all = union(c.frames.map((f) => f.bounds)), ar = px / phoneStageH(px, Math.min(c.aspect, (all.w + 2 * MARGIN) / (all.h + 2 * MARGIN)));
  return c.frames.filter((f) => f.look == null && f.focus == null && !fits(f.bounds, px / leastScale(f, px), ar)).length;
}
// the phone's layouts of a scene (the phone's tokens, and the narrow layout too), each compiled once per scene, on a
// budget of its own (core/work.ts): null when it is over it, and then the stage keeps the wide layout
const phones = new WeakMap<Compiled, { phone?: Compiled | null; narrow?: Compiled | null }>();
export function phoneScene(wide: Compiled, narrow: boolean): Compiled | null {
  const src = wide.src;
  if (!src) return null;
  const m = phones.get(wide) ?? {};
  phones.set(wide, m);
  const k = narrow ? "narrow" : "phone";
  if (m[k] === undefined) {
    try { m[k] = compileScene(src.head, src.steps, src.base, { ...src.info, phone: "1", ...(narrow ? { narrow: "1" } : {}) }); }
    catch (e) { if (!(e instanceof BudgetError)) throw e; m[k] = null; }
  }
  return m[k]!;
}
// the scene as the stage draws it: a block parse() accepted compiles within its budget; one made under a host's higher
// caps may not, and then the stage shows the steps' captions on an empty stage rather than fail
export function stageScene(src: { head: string; steps: { title: string; raw: string; line: number }[]; base: number; info: Record<string, string> }): Compiled {
  try { return compileScene(src.head, src.steps, src.base, src.info); }
  catch (e) { if (!(e instanceof BudgetError)) throw e; return compileScene("", src.steps.map((s) => ({ ...s, raw: "" })), src.base, src.info); }
}
// the narrow layout or not, on a phone stage px wide (wide: the scene compiled as written). Cached per scene and width
const cache = new WeakMap<Compiled, Map<number, boolean>>();
export function narrowWins(wide: Compiled, px: number): boolean {
  if (!(px > 0)) return false;
  if (wide.aspect > WIDE) return true;
  const src = wide.src;
  if (!src) return false;
  const m = cache.get(wide) ?? new Map<number, boolean>();
  cache.set(wide, m);
  const hit = m.get(px);
  if (hit != null) return hit;
  const phone = phoneScene(wide, false);
  const cp = phone ? cutSteps(phone, px) : 0, wp = phone ? cutWholeSteps(phone, px) : 0;
  let win = false;
  // (and, where both cut as many, the one that shows more of the steps about the whole scene whole: rc.5)
  if (cp > 0 || wp > 0) {
    const narrow = phoneScene(wide, true);
    if (narrow && !narrow.errors.length) { const cn = cutSteps(narrow, px); win = cn < cp || (cn === cp && cutWholeSteps(narrow, px) < wp); }
  }
  m.set(px, win);
  return win;
}
