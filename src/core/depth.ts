// This package is the source of this file: edit it here. It began as a copy synced from a private prototype (scripts/sync.ts, now frozen).
// depth: the words for nesting in depth (format version 10, SPEC.md 6.11).
//   ```animation 3d only          the scene has no flat form: no 2D/3D button, it opens in 3D (see the fallback below)
//   ```animation labels=all       in 3D, keep every label while a step plays (the default shows only who takes part)
//   group n1 "node 1" closed=hidden   its inside is not drawn at all (it keeps its room) until the story zooms in
//   zoom into n1                  the camera flies in, the inside appears, what is outside fades (closed=hidden only)
//   zoom into p1                  ... and again, one level deeper (zooms nest); zoom into n1 n2 opens two at one level
//   zoom out | zoom out all       back one level, or all the way
//   lift fe web2                  (3D only) they rise up out of their boxes; everything else fades
//   put back [fe ...]             (3D only) they settle back into the same place; zoom out puts back what it closes
// Pure: the engine (tools/scene.ts) and story words (tools/story.ts) call these, so doccheck, the stages and the
// LLM view read the same state. The 2D floor plan never changes for a lift: only the 3D stage raises a lifted thing.
import type { State, Ent, Op, Fx, SceneError, Frame } from "./scene";
import { CAM_DEFAULT, type CamView } from "./camera";
import type { Ctx } from "./story";
import { closedCounts } from "./data";

// how strongly a thing is drawn when it is outside a deep zoom, or not lifted while other things are
export const OUT = 0.2;
// 3D: how high a lifted thing rises above its old place, in world units (about pixels at natural size)
export const LIFT_UP = 96;
// the words only a 3D-only scene may use (a flat stage cannot show a thing rising out of its box)
export const ONLY_3D = ["lift", "put back"] as const;
// the 3D labels rule: "part" (the default: while a step plays, only the labels of who takes part show) or "all"
export const LABELS = ["part", "all"] as const;
// in 3D, the other labels come back this long after a step has ended and the player stopped (the stage reads it);
// format version 10 fix: 600 (was 1200: with the step's own time, names came back 2.5 to 3 s after Next)
export const REST_MS = 600;

export interface Zoom { ids: string[]; cam: string[] | null; view?: CamView }
// zooms: the levels the story has zoomed into, innermost last; lifted: what is lifted out of its box now
export interface DepthState { zooms?: Zoom[]; lifted?: string[] }
// lifts / puts: what this step lifts or puts back (puts: also what a zoom out puts back)
export interface DepthFx { lifts?: string[]; puts?: string[] }

const chain = (s: State, id: string): string[] => { const out: string[] = []; for (let x: string | null = id, n = 0; x && s.ents[x] && n < 64; x = s.ents[x].parent ?? s.ents[x].anchor, n++) out.push(x); return out; };
// is a inside b (or b itself)?
export const within = (s: State, a: string, b: string) => chain(s, a).includes(b);

// ---------------------------------------------------------------- zoom: nested levels
export function zoomOp(s: State, op: { id: string | null; ids?: string[]; all?: boolean }, f: Fx, c: Ctx) {
  const zs = (s.zooms ??= []);
  if (op.id) {
    const ids = op.ids ?? [op.id];
    for (const id of ids) {
      const e = c.ent(s, id);
      if (!c.isContainer(e.kind)) throw c.refuse(`${id} is a ${e.kind}, and a ${e.kind} has no inside to zoom into; give it one: declare it as group ${id} "${e.label}" closed=yes and put its parts in it`);
      if (!e.kids.length) throw c.refuse(`${id} holds nothing: there is no inside to show`);
    }
    for (const a of ids) for (const b of ids) if (a !== b && within(s, a, b)) throw c.refuse(`zoom into ${ids.join(" ")}: ${a} is inside ${b}; zoom into ${b} first, then into ${a} in a later step (zooms nest)`);
    const top = () => zs[zs.length - 1];
    if (top() && ids.length === top().ids.length && ids.every((id) => top().ids.includes(id))) throw c.refuse(`zoom into ${ids.join(" ")}: the story is already zoomed into ${ids.length > 1 ? "them" : "it"}`);
    // a sideways move: close the levels that do not hold every new thing, then open the new one
    let back: Zoom | null = null;
    while (top() && !ids.every((id) => top().ids.some((z) => id !== z && within(s, id, z)))) { back = zs.pop()!; putBackIn(s, back.ids, f); }
    if (back) { s.camera = back.cam; s.view = back.view; }
    zs.push({ ids: [...ids], cam: s.camera, view: s.view });
    // the camera flies in: the camera words' close (tools/camera.ts), keeping the turn and tilt the author set
    s.camera = [...ids];
    s.view = { ...CAM_DEFAULT, ...(s.view ?? {}), close: true, far: false };
  } else {
    if (!zs.length) throw c.refuse(`zoom out: nothing is zoomed into; write zoom into <id> in an earlier step`);
    let last: Zoom | undefined;
    for (let n = op.all ? zs.length : 1; n > 0; n--) { last = zs.pop()!; putBackIn(s, last.ids, f); }
    s.camera = last!.cam; s.view = last!.view;
  }
  // pass 9's readers: the thing zoomed into (the first of the top level)
  s.zoom = zs.length ? zs[zs.length - 1].ids[0] : null;
  s.zoomCam = null; s.zoomView = undefined;
}
// what a zoom opens: every thing of the top level
export const zoomIds = (s: State): string[] => s.zooms?.[s.zooms.length - 1]?.ids ?? (s.zoom ? [s.zoom] : []);

// ---------------------------------------------------------------- lift and put back (3D only)
export function liftOp(s: State, ids: string[], f: Fx & DepthFx, c: Ctx, hidden: (id: string) => string | null) {
  const now = s.lifted ?? [];
  for (const id of ids) {
    const e = c.ent(s, id);
    if (e.kind === "token" || e.kind === "pointer") throw c.refuse(`lift raises a thing out of its box; ${id} is a ${e.kind}, which rides on what it sits at or in: lift that instead`);
    if (!e.parent) throw c.refuse(`lift raises a thing out of the box it is in; ${id} stands on the stage, in no box (put it in a group, or lift what it holds)`);
    if (now.includes(id)) throw c.refuse(`${id} is already lifted; put back ${id} first`);
    const by = hidden(id);
    if (by) throw c.refuse(`lift ${id}: it is inside ${by}, which is closed; zoom into ${by} in this step or an earlier one`);
    const up = now.find((x) => within(s, id, x) || within(s, x, id));
    if (up) throw c.refuse(`lift ${id}: ${within(s, id, up) ? `it is inside ${up}, which is lifted already (it rises with it)` : `it holds ${up}, which is lifted; put back ${up} first`}`);
  }
  for (const a of ids) for (const b of ids) if (a !== b && within(s, a, b)) throw c.refuse(`lift ${ids.join(" ")}: ${a} is inside ${b}; lift ${b} alone (what it holds rises with it)`);
  s.lifted = [...now, ...ids];
  (f.lifts ??= []).push(...ids);
  f.touched.push(...ids);
}
export function putBackOp(s: State, ids: string[] | null, f: Fx & DepthFx, c: Ctx) {
  const now = s.lifted ?? [];
  if (!now.length) throw c.refuse(`put back: nothing is lifted; write lift <id> in an earlier step`);
  const which = ids ?? now;
  for (const id of which) { c.ent(s, id); if (!now.includes(id)) throw c.refuse(`put back ${id}: ${id} is not lifted (lifted now: ${now.join(", ")})`); }
  s.lifted = now.filter((x) => !which.includes(x));
  (f.puts ??= []).push(...which);
  f.touched.push(...which);
}
// a zoom out puts back what is lifted inside the things it closes
function putBackIn(s: State, closing: string[], f: Fx & DepthFx) {
  const now = s.lifted ?? [];
  const back = now.filter((x) => closing.some((z) => within(s, x, z)));
  if (!back.length) return;
  s.lifted = now.filter((x) => !back.includes(x));
  (f.puts ??= []).push(...back);
}

// ---------------------------------------------------------------- what doccheck refuses at the end of a step
// a lifted thing settles back into its own place, so it never moves while it is lifted (nothing else moves either)
export function depthChecks(s: State, ops: Op[], f: Fx & DepthFx): SceneError[] {
  const out: SceneError[] = [];
  const up = new Set([...(s.lifted ?? []), ...(f.lifts ?? []), ...(f.puts ?? [])]);
  for (const op of ops) {
    if (op.op !== "move" && op.op !== "swap") continue;
    const ids = op.op === "move" ? op.ids ?? [op.id] : [op.a, op.b];
    const bad = ids.find((id) => up.has(id));
    if (bad) out.push({ line: op.line, msg: `${bad} is lifted out of its box in this step; a lifted thing settles back into its own place, so it cannot move: put back ${bad} (or zoom out) in an earlier step, then move it` });
  }
  // something removed while lifted is no longer lifted
  if (s.lifted) s.lifted = s.lifted.filter((id) => s.ents[id]);
  return out;
}
// the 3D-only words in a scene that is not 3D only; labels= and only on the fence
export function onlyChecks(ops: Op[], only3d: boolean): SceneError[] {
  if (only3d) return [];
  return ops.filter((o) => o.op === "lift" || o.op === "putback").map((o) => ({ line: o.line, msg: `${o.op === "lift" ? "lift" : "put back"} is a 3D-only word: a thing rising out of its box shows only in depth. Write \`\`\`animation 3d only on the fence (the scene then has no flat form), or use highlight or spotlight` }));
}

// ---------------------------------------------------------------- frames: hidden, faded, lifted
// on a laid-out frame of state s: what is lifted (Box.lift), and what fades (Box.vis = OUT): outside a deep zoom (into
// a closed=hidden thing), or not lifted while things are lifted. What the step touches (lit) never fades
export function applyDepth(f: Frame, s: State, lit: string[] = []): Frame {
  closedCounts(f, s);
  const lifted = new Set((s.lifted ?? []).filter((id) => s.ents[id]));
  const top = zoomIds(s).filter((id) => s.ents[id]);
  const deep = top.some((id) => s.ents[id].hide);
  if (!lifted.size && !deep) return f;
  const on = new Set(lit);
  for (const b of f.boxes) {
    if (b.key <= 0 || b.hidden) continue;
    const ch = chain(s, b.id);
    if (lifted.has(b.id)) b.lift = true;
    const out = (lifted.size > 0 && !ch.some((x) => lifted.has(x))) || (deep && !top.some((z) => ch.includes(z)));
    if (out && !on.has(b.id) && !(b.ent.anchor && on.has(b.ent.anchor))) b.vis = OUT;
  }
  return f;
}
// how strongly the stages draw a box: 0 when hidden, OUT when faded, else 1
export const visOf = (b?: { hidden?: boolean; vis?: number }) => (!b ? 1 : b.hidden ? 0 : b.vis ?? 1);

// ---------------------------------------------------------------- the 3D labels rule
// who takes part in a step: what it adds, moves, changes, sends along, highlights, makes speak, lifts or puts back,
// and the camera's targets. While a step plays in 3D only their labels show (unless the scene says labels=all)
export function participants(f: Frame): number[] {
  const out = new Set<number>(f.touched);
  for (const k of f.look ?? []) out.add(k);
  // a focused layer is the camera's target too: what stands on it takes part
  if (f.focus != null) for (const b of f.boxes) if (b.key > 0 && b.layer === f.focus && !b.hidden) out.add(b.key);
  // what is lifted, with what it holds (it rises with it)
  const byId = new Map(f.boxes.filter((b) => b.key > 0).map((b) => [b.id, b]));
  for (const b of f.boxes) for (let x: typeof b | undefined = b, n = 0; x && n < 64; x = byId.get(x.ent.parent ?? x.ent.anchor ?? ""), n++) if (x.lift) { out.add(b.key); break; }
  return [...out];
}
// does a label show? key: whose label (a thing's, or a connector's ends); part: who takes part, or null when every
// label shows (the reader paused at the end of a step, moved the camera, or the scene says labels=all)
export function labelOn(keys: number[], part: Set<number> | null): boolean {
  return !part || keys.some((k) => part.has(k));
}

// ---------------------------------------------------------------- the LLM view
export function depthLlm(prev: State, next: State, ops: Op[], f: Fx & DepthFx): string[] {
  const out: string[] = [];
  for (const op of ops) {
    // out of the nearest box with a name (a group without a label only lays things out)
    if (op.op === "lift") out.push(`lift ${op.ids.join(", ")} out of ${[...new Set(op.ids.map((id) => named(prev, prev.ents[id]?.parent ?? null)))].join(", ")}`);
    else if (op.op === "putback") out.push(`put back ${(op.ids ?? prev.lifted ?? []).join(", ")}`);
  }
  const auto = (f.puts ?? []).filter((id) => !ops.some((o) => o.op === "putback" && (o.ids ?? prev.lifted ?? []).includes(id)));
  if (auto.length) out.push(`${auto.join(", ")} settle back into place`);
  return out;
}
const named = (s: State, id: string | null): string => { for (let x = id, n = 0; x && s.ents[x] && n < 64; x = s.ents[x].parent, n++) if (s.ents[x].label !== x) return x; return id ?? "?"; };
// the zoom line of the LLM view (story.ts calls it)
export function zoomLlm(prev: State, op: { id: string | null; ids?: string[]; all?: boolean }): string {
  if (op.id) { const ids = op.ids ?? [op.id]; const hid = ids.some((id) => prev.ents[id]?.hide); return `zoom into ${ids.join(", ")}${hid ? `: ${ids.length > 1 ? "their insides appear" : "its inside appears"}, the rest fades` : ""}`; }
  const zs = prev.zooms ?? [];
  return op.all ? `zoom out all the way` : `zoom out of ${(zs[zs.length - 1]?.ids ?? [prev.zoom ?? "it"]).join(", ")}`;
}
export type { Ent };
