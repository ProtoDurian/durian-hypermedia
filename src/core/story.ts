// This package is the source of this file: edit it here. It began as a copy synced from a private prototype (scripts/sync.ts, now frozen).
// story: the words for telling how one thing becomes many and goes through another (format version 9).
//   split msg into 4 "seg"        a token becomes 4 tokens, msg.1 ... msg.4 ("seg 1" ... "seg 4"), where it was
//   merge msg                     the pieces of a split token become it again (or: merge a b into c "label")
//   move msg.1 msg.2 into q       several things move together (one hop); a token goes into a container, a queue
//                                 holds it as an item (at the back), and "pop q to x" takes the front one out
//   drop msg.4 at r               a token travels to r and is lost there (a dropped packet): red, crossed out, gone
//   send "msg" a -> b as m        the sent token stays at b as token m, for later lines to move, split or drop
//   group r "router" closed=yes   a thing with an inside: drawn faint and without words until the story zooms in
//   zoom into r / zoom out        the camera flies in and the inside opens; then it closes and the camera goes back
// Pure: the engine (tools/scene.ts) calls these for its play, layout and LLM view, so doccheck, the 2D stage and the
// 3D stage all read the same state.
import type { State, Ent, Op, Fx, SceneError, Place } from "./scene";
import { CAM_DEFAULT } from "./camera";

// a split makes at most this many pieces: more chips than this cannot be read on a stage
export const MAX_PIECES = 8;
// how strongly a closed thing's inside is drawn (its words are hidden until it opens)
export const FAINT = 0.28;

// what the engine lends the story words (so this file needs nothing from it at run time)
export interface Ctx {
  ent: (s: State, id: string, what?: string) => Ent;
  drop: (s: State, id: string) => void;
  newEnt: (s: State, d: { kind: string; id: string; label: string | null; parent: string | null }, extra?: Partial<Ent>) => Ent;
  insertAt: (list: string[], id: string, place: Place, s: State) => void;
  kidsOf: (s: State, parent: string | null) => string[];
  isContainer: (kind: string) => boolean;
  refuse: (msg: string) => Error;
}

// ---------------------------------------------------------------- parsing helpers
// split <id> into <n> ["label"]: the pieces' ids and labels
export function piecesOf(id: string, n: number, label: string | null): { id: string; label: string }[] {
  if (!Number.isInteger(n) || n < 2 || n > MAX_PIECES) throw new Error(`split ${id} into ${n}: a split makes 2 to ${MAX_PIECES} pieces (more cannot be read on the stage)`);
  return Array.from({ length: n }, (_, k) => ({ id: `${id}.${k + 1}`, label: label ? `${label} ${k + 1}` : `${k + 1}/${n}` }));
}

// ---------------------------------------------------------------- closed things and their insides
// what is open: the thing the story zoomed into, and everything around it
export function openSet(s: State): Set<string> {
  const out = new Set<string>();
  for (let id = s.zoom ?? null, n = 0; id && s.ents[id] && n < 64; id = s.ents[id].parent, n++) out.add(id);
  return out;
}
// the closed container that hides a thing (its inside is drawn faint, without words), or null when it shows. A token
// at a thing is hidden when that thing is
export function hiddenBy(s: State, id: string, open = openSet(s)): string | null {
  let e: Ent | undefined = s.ents[id];
  // a token at a closed thing sits on its outside, which shows; at a thing inside it, it is hidden with that thing
  if (e?.anchor) e = s.ents[e.anchor];
  for (let n = 0; e && n < 64; n++) {
    const p: Ent | undefined = e.parent ? s.ents[e.parent] : undefined;
    if (!p) return null;
    if (p.closed && !open.has(p.id)) return p.id;
    e = p;
  }
  return null;
}

// ---------------------------------------------------------------- the changes
const where = (e: Ent) => (e.anchor ? `at ${e.anchor}` : e.parent ? `in ${e.parent}` : "on the stage");
const moved = (f: Fx, id: string, line: number) => (f.moved ??= []).push({ id, line });

// a token moves: "to" a thing it sits at, or "into" a container it waits in (a queue holds it as an item, at the back)
export function moveToken(s: State, e: Ent, to: Ent, into: boolean, place: Place, f: Fx, line: number, c: Ctx) {
  if (into) {
    if (e.kind !== "token") throw c.refuse(`a pointer sits at a thing: move ${e.id} to ${to.id}`);
    if (!c.isContainer(to.kind)) throw c.refuse(`"into" goes into a container (a group, a queue ...), and ${to.id} is a ${to.kind}; to sit at it, write move ${e.id} to ${to.id}`);
    if (to.kind === "table" || to.kind === "buckets") throw c.refuse(`a token cannot wait in a ${to.kind}; put it in one ${to.kind === "buckets" ? `bucket (${to.id}.0)` : "group or queue"}`);
  }
  if (e.parent) { const l = c.kidsOf(s, e.parent), i = l.indexOf(e.id); if (i >= 0) l.splice(i, 1); }
  if (into) { e.anchor = null; e.parent = to.id; c.insertAt(to.kids, e.id, place, s); }
  else { e.parent = null; e.anchor = to.id; }
  f.touched.push(e.id, to.id);
  moved(f, e.id, line);
}

// a token splits into pieces where it was (at the same thing, or in the same container, side by side)
export function splitToken(s: State, e: Ent, into: { id: string; label: string | null }[], f: Fx, c: Ctx) {
  if (e.kind !== "token") throw c.refuse(`a pointer marks one place; it cannot split`);
  const list = e.parent ? c.kidsOf(s, e.parent) : null;
  let at = list ? list.indexOf(e.id) : -1;
  const { parent, anchor, family, tone, label } = e;
  c.drop(s, e.id);
  for (const n of into) {
    const ne = c.newEnt(s, { kind: "token", id: n.id, label: n.label, parent }, { anchor, family, tone });
    if (list) list.splice(at++, 0, n.id);
    f.spawn[ne.key] = e.key;
    f.touched.push(n.id);
  }
  (s.pieces ??= {})[e.id] = { ids: into.map((n) => n.id), label };
}

// tokens merge into one, where they all are; they must all be in one place
export function mergeTokens(s: State, es: Ent[], into: { id: string; label: string | null }, f: Fx, c: Ctx) {
  if (es.some((e) => e.kind !== "token")) throw c.refuse(`merge joins tokens with tokens, or shapes with shapes; ${es.filter((e) => e.kind !== "token").map((e) => e.id).join(", ")} ${es.filter((e) => e.kind !== "token").length > 1 ? "are not tokens" : "is not a token"}`);
  const w0 = where(es[0]), off = es.find((e) => where(e) !== w0);
  if (off) throw c.refuse(`merge: ${es[0].id} is ${w0} but ${off.id} is ${where(off)}; the pieces merge where they all are, so move ${off.id} there first`);
  const { parent, anchor, family, tone } = es[0];
  const list = parent ? c.kidsOf(s, parent) : null;
  const at = list ? Math.min(...es.map((e) => list.indexOf(e.id))) : -1;
  for (const e of es) c.drop(s, e.id);
  const ne = c.newEnt(s, { kind: "token", id: into.id, label: into.label, parent }, { anchor, family, tone });
  if (list) list.splice(at, 0, ne.id);
  f.touched.push(ne.id);
  for (const e of es) f.merge[e.key] = ne.key;
}

type StoryOp = Extract<Op, { op: "zoom" } | { op: "drop" } | { op: "join" }>;
export function applyStory(s: State, op: StoryOp, f: Fx, c: Ctx) {
  switch (op.op) {
    case "zoom": {
      if (op.id) {
        const e = c.ent(s, op.id);
        if (!c.isContainer(e.kind)) throw c.refuse(`${op.id} is a ${e.kind}, and a ${e.kind} has no inside to zoom into; give it one: declare it as group ${op.id} "${e.label}" closed=yes and put its parts in it`);
        if (!e.kids.length) throw c.refuse(`${op.id} holds nothing: there is no inside to show`);
        if (!s.zoom) { s.zoomCam = s.camera; s.zoomView = s.view; }
        s.zoom = op.id;
        // the camera flies in: the camera words' close (tools/camera.ts), keeping the turn and tilt the author set
        s.camera = [op.id];
        s.view = { ...CAM_DEFAULT, ...(s.view ?? {}), close: true, far: false };
      } else {
        if (!s.zoom) throw c.refuse(`zoom out: nothing is zoomed into; write zoom into <id> in an earlier step`);
        s.camera = s.zoomCam ?? null; s.view = s.zoomView;
        s.zoom = null; s.zoomCam = null; s.zoomView = undefined;
      }
      return;
    }
    case "drop": {
      const at = op.at ? c.ent(s, op.at) : null;
      for (const id of op.ids) {
        const e = c.ent(s, id);
        if (e.kind !== "token") throw c.refuse(`drop is for a token (a packet lost on the way), and ${id} is a ${e.kind}; to take a thing away, write remove ${id}`);
        (f.dropped ??= []).push({ key: e.key, at: at ? at.key : null });
        if (at) { f.touched.push(at.id); moved(f, id, op.line); }
        else if (e.anchor) f.touched.push(e.anchor);
        else if (e.parent) f.touched.push(e.parent);
        c.drop(s, id);
      }
      return;
    }
    case "join": {
      const p = s.pieces?.[op.id];
      if (!p) throw c.refuse(`${op.id} was never split, so it has no pieces to merge; write merge a b into ${op.id} "label" to merge tokens by name`);
      if (s.ents[op.id]) throw c.refuse(`"${op.id}" is already on the stage`);
      const gone = p.ids.filter((id) => !s.ents[id]);
      if (gone.length) throw c.refuse(`merge ${op.id}: ${gone.join(", ")} ${gone.length > 1 ? "are" : "is"} not on the stage; every piece must be there (add ${gone[0]} again first, or merge the others by name)`);
      mergeTokens(s, p.ids.map((id) => s.ents[id]), { id: op.id, label: p.label }, f, c);
      delete s.pieces![op.id];
      return;
    }
  }
}

// ---------------------------------------------------------------- what doccheck refuses at the end of a step
// one hop per step for tokens: a token that moves twice in one step (two moves, a move and a drop ...); and a step that
// points at what a closed thing hides (its words are not drawn): highlight, say, a send, or a move into it
export function stepChecks(s: State, ops: Op[], f: Fx): SceneError[] {
  const out: SceneError[] = [];
  const seen = new Map<string, number>();
  for (const m of f.moved ?? []) {
    if (seen.has(m.id)) out.push({ line: m.line, msg: `one hop per step: ${m.id} already moved in this step (line ${seen.get(m.id)}); give its next hop a step of its own, with its own caption` });
    else seen.set(m.id, m.line);
  }
  const open = openSet(s);
  const check = (id: string, line: number, what: string) => {
    if (!s.ents[id]) return;
    const by = hiddenBy(s, id, open);
    if (by) out.push({ line, msg: `${what} ${id}, which is inside ${by}; ${by} is closed (its inside is drawn faint, without words): zoom into ${by} in this step or an earlier one` });
  };
  for (const op of ops) {
    if (op.op === "highlight") op.ids.forEach((id) => check(id, op.line, "highlight"));
    else if (op.op === "say") check(op.id, op.line, "say");
    else if (op.op === "send" && op.show !== "stream") op.path.forEach((id) => check(id, op.line, "a send goes to"));
    else if (op.op === "move") check(op.to, op.line, op.into ? "a move goes into" : "a move goes to");
    else if (op.op === "pop" && op.to) check(op.to, op.line, "a pop goes to");
    else if (op.op === "drop" && op.at) check(op.at, op.line, "a drop at");
  }
  return out;
}

// ---------------------------------------------------------------- the LLM view: what each step does with tokens
// under the caption, like a send: "from -> to: what"; a split, a merge, a drop and a zoom say so in words
export function llmLines(prev: State, next: State, ops: Op[]): string[] {
  const out: string[] = [];
  const lab = (st: State, id: string) => st.ents[id]?.label ?? id;
  const at = (e: Ent | undefined) => (e ? e.anchor ?? e.parent ?? "?" : "?");
  const isTok = (st: State, id: string) => st.ents[id]?.kind === "token";
  const movesOf = (ids: string[]) => {
    const groups = new Map<string, string[]>();
    for (const id of ids) { const k = `${at(prev.ents[id])} -> ${at(next.ents[id])}`; groups.set(k, [...(groups.get(k) ?? []), lab(next, id)]); }
    for (const [k, ls] of groups) out.push(`${k}: ${ls.join(", ")}`);
  };
  for (const op of ops) {
    if (op.op === "split" && prev.ents[op.id]?.kind === "token") out.push(`${op.id} splits into: ${op.into.map((n) => n.label ?? n.id).join(", ")}`);
    else if (op.op === "merge" && op.ids.every((id) => isTok(prev, id))) out.push(`${op.ids.map((id) => lab(prev, id)).join(", ")} merge into ${op.into.id}: ${op.into.label ?? op.into.id}`);
    else if (op.op === "join") { const ids = prev.pieces?.[op.id]?.ids ?? []; out.push(`${ids.map((id) => lab(prev, id)).join(", ")} merge into ${op.id}: ${lab(next, op.id)}`); }
    else if (op.op === "move") { const ids = (op.ids ?? [op.id]).filter((id) => isTok(next, id)); if (ids.length) movesOf(ids); }
    else if (op.op === "pop") { const q = prev.ents[op.s]; const id = q ? (q.kind === "stack" ? q.kids[q.kids.length - 1] : q.kids[0]) : null; if (id && isTok(prev, id) && op.to) movesOf([id]); }
    else if (op.op === "drop") for (const id of op.ids) out.push(op.at ? `${at(prev.ents[id])} -> ${op.at}: ${lab(prev, id)}, dropped there (lost)` : `${lab(prev, id)} is dropped (lost) ${prev.ents[id]?.anchor ? "at" : "in"} ${at(prev.ents[id])}`);
    else if (op.op === "zoom") out.push(op.id ? `zoom into ${op.id}` : `zoom out of ${prev.zoom ?? "it"}`);
  }
  return out;
}
