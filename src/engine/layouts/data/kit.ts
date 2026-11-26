// Shared parts of the data-structure layouts (array list stack queue map) and the tree layout (lane eng-data).
// Pure functions of (Model, StepState[]): nothing here draws a colour or knows a time. Port of the sizes and rules in
// src/core/scene.ts (DESIGN tokens, measure, place, keepSlots) behind the LayoutPlugin interface.
import type { Fact, Font, Id, LayoutCtx, Model, Prim, Rect, StepState, Thing, ThingState, Tone } from "../../types";
import { LINE_H } from "../../../core/stage-core";
import { expand } from "../../core/ids"; // render3

// ------------------------------------------------------------------ size tokens (scene.ts DESIGN / PHONE, size s | m | l)
export interface Tok { font: Font; lh: number; px: number; py: number; minW: number; maxW: number; minH: number; pad: number; gap: number; cell: number; head: number }
const DESIGN = {
  s: { font: "chip", px: 10, py: 6, minW: 52, maxW: 120, minH: 28, pad: 8, gap: 12, cell: 32, head: 10.5 },
  m: { font: "body", px: 14, py: 9, minW: 72, maxW: 160, minH: 38, pad: 12, gap: 18, cell: 40, head: 11.5 },
  l: { font: "title", px: 18, py: 12, minW: 96, maxW: 200, minH: 48, pad: 16, gap: 24, cell: 48, head: 12.5 },
} as const;
const PHONE = {
  s: { font: "chip", px: 8, py: 5, minW: 44, maxW: 84, minH: 28, pad: 7, gap: 10, cell: 32, head: 11 },
  m: { font: "body", px: 10, py: 8, minW: 56, maxW: 100, minH: 36, pad: 9, gap: 12, cell: 38, head: 11.5 },
  l: { font: "title", px: 13, py: 10, minW: 76, maxW: 124, minH: 44, pad: 12, gap: 16, cell: 44, head: 12.5 },
} as const;
export const tokOf = (model: Model, thing: Thing | null, phone: boolean): Tok => {
  const w = thing?.keys.size ?? model.fence.size ?? "m";
  const n = w === "s" || w === "l" ? w : "m";
  const d = (phone ? PHONE : DESIGN)[n];
  return { ...d, font: d.font as Font, lh: LINE_H[d.font as Font] };
};
export const LINK_GAP = 38;          // things side by side that a line joins (scene.ts LINK_GAP)
export const MIN_LINE = 32;          // a joining line shows at least this much line
export const headH = (z: Tok) => Math.round(z.head + 14); // a container's title band
export const TOKEN_DOT = 10, CHIP_H = 18, CHIP_PX = 7;
export const IDX_H = 16;             // an array's index row under its cells

// ------------------------------------------------------------------ small helpers
export const DATA = new Set(["array", "list", "stack", "queue", "map"]);
export const hasFlag = (t: Thing, f: string) => t.flags.includes(f);
export const stOf = (states: StepState[], k: number, id: Id): ThingState | undefined => states[k]?.things[id];
export const shown = (states: StepState[], k: number, id: Id | null) => id === null || !!stOf(states, k, id)?.visible;
/** the text baseline for a line of `font` centred on cy (the stage's convention: y is the baseline) */
export const baseline = (cy: number, font: Font) => cy + LINE_H[font] / 2 - 4;
/** `s` cut with an ellipsis to fit w (scene.ts `cut`) */
export function cut(ctx: LayoutCtx, s: string, w: number, font: Font): string {
  if (ctx.measure(s, font) <= w) return s;
  let lo = 0, hi = s.length;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (ctx.measure(s.slice(0, m) + "…", font) <= w) lo = m; else hi = m - 1; }
  return s.slice(0, Math.max(1, lo)) + "…";
}
export const maxOver = <T>(n: number, f: (k: number) => T, init: T, big: (a: T, b: T) => T): T => { let m = init; for (let k = 0; k < n; k++) m = big(m, f(k)); return m; };

/** a map entry `key: value` */
export function entryOf(v: string): [string, string] { const i = v.indexOf(":"); return i < 0 ? [v.trim(), ""] : [v.slice(0, i).trim(), v.slice(i + 1).trim()]; }
/** the hash a hash table shows: the sum of the key's character codes, mod the bucket count (scene data.ts hashOf) */
export const hashOf = (key: string, n: number) => [...key].reduce((a, ch) => a + ch.charCodeAt(0), 0) % n;

/** the values of a data container at a step (empty when it is not shown) */
// render3: a cell's own tone and dim (`tone a.3 good`, `dim a.0`). A part has no ThingState (core/states.ts), so the data
// layout reads the facts that name its cells; as a thing's, they hold from their step on (`tone a.3 off`, `dim a.0 off` end them).
// Kept by slot (the index or key the fact names), as the graph engine's `set a.3 tone=good` was. Per step 0..n: part -> look.
export type PartLook = { tone: Tone | null; dim: boolean };
const partCache = new WeakMap<Model, Map<Id, Record<string, PartLook>[]>>();
export function partLooks(model: Model, id: Id): Record<string, PartLook>[] {
  let byId = partCache.get(model); if (!byId) partCache.set(model, (byId = new Map()));
  const hit = byId.get(id); if (hit) return hit;
  const out: Record<string, PartLook>[] = [];
  let now: Record<string, PartLook> = {};
  const read = (facts: Fact[]) => {
    for (const f of facts) {
      if (f.k !== "tone" && f.k !== "dim") continue;
      for (const x of expand(model, f.ids)) {
        if (!x.startsWith(id + ".") || model.things[x]) continue;
        const p = x.slice(id.length + 1), cur = now[p] ?? { tone: null, dim: false };
        now = { ...now, [p]: f.k === "tone" ? { ...cur, tone: f.tone === "off" ? null : f.tone } : { ...cur, dim: f.on } };
      }
    }
  };
  read(model.setup); out.push(now);
  for (const s of model.steps) { read(s.facts); out.push(now); }
  byId.set(id, out);
  return out;
}

export function valuesAt(model: Model, states: StepState[], k: number, id: Id): string[] {
  const st = stOf(states, k, id);
  if (!st?.visible) return [];
  return st.values ?? model.things[id]?.values ?? [];
}

// ------------------------------------------------------------------ closed things (SPEC 6.12): faint inside, a count in the title
export const isClosed = (t: Thing) => hasFlag(t, "closed") || hasFlag(t, "hidden-inside");
export const closedAt = (t: Thing, st: ThingState | undefined) => isClosed(t) && !st?.open;
const NOUN: Record<string, [string, string]> = { array: ["item", "items"], list: ["item", "items"], stack: ["item", "items"], queue: ["item", "items"], map: ["key", "keys"], tree: ["node", "nodes"] };
/** the words a container's title band shows: its title, and when closed `title · 4 items` if that fits */
export function titleWords(ctx: LayoutCtx, t: Thing, name: string, st: ThingState | undefined, count: number, width: number): string {
  if (!closedAt(t, st)) return t.title;
  const [one, many] = NOUN[name] ?? NOUN.array;
  const full = `${t.title} · ${count} ${count === 1 ? one : many}`;
  return ctx.measure(full, "lane") <= width ? full : t.title;
}
export function titlePrim(ctx: LayoutCtx, id: Id, text: string, x: number, bandH: number, faint: boolean): Prim[] {
  if (!text) return [];
  return [{ k: "text", key: `${id}:title`, id, x, y: baseline(bandH / 2 + 1, "lane"), lines: [text], font: "lane", anchor: "start", ink: faint ? "muted" : "ink", cls: "title" }];
}

// ------------------------------------------------------------------ who holds what
/** is this container laid out by a tree (it, or the node above it, sits in a tree)? Then its indented children are tree edges, not contents. */
export function inTreeContext(model: Model, id: Id): boolean {
  const t = model.things[id]; if (!t) return false;
  const p = t.parent;
  if (p === null) return model.layout === "tree";
  const pl = model.things[p]?.layout ?? null;
  if (pl === "tree") return true;
  if (pl !== null && DATA.has(pl)) return inTreeContext(model, p);
  return false;
}
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** a place that is this container or one of its buckets (`h.2`, `h.b2`) */
export const placeMatcher = (id: Id) => { const re = new RegExp(`^${esc(id)}\\.b?(\\d+)$`); return (place: string | null): boolean => place === id || (place !== null && re.test(place)); };
export const bucketOf = (id: Id, place: string | null): number | null => { if (place === null) return null; const m = new RegExp(`^${esc(id)}\\.b?(\\d+)$`).exec(place); return m ? +m[1] : null; };

const arrivalCache = new WeakMap<Model, Map<Id, Id[][]>>();
/** the order things were put into `id` (or its buckets), oldest first, after every step 0..n: a queue's front is the oldest */
export function arrival(model: Model, id: Id): Id[][] {
  let mm = arrivalCache.get(model); if (!mm) { mm = new Map(); arrivalCache.set(model, mm); }
  const hit = mm.get(id); if (hit) return hit;
  const is = placeMatcher(id);
  let seq: Id[] = inTreeContext(model, id) ? [] : model.order.filter((t) => is(model.things[t].parent)); // declared in the container or one of its buckets (`in h.2`)
  const apply = (facts: Fact[]) => {
    for (const f of facts) {
      if (f.k !== "in") continue;
      for (const m of f.ids) {
        seq = seq.filter((x) => x !== m);
        if (!is(f.place)) continue;
        const at = f.after ? seq.indexOf(f.after) : -1;
        if (at >= 0) seq.splice(at + 1, 0, m); else seq.push(m);
      }
    }
  };
  const out: Id[][] = [];
  apply(model.setup); out.push([...seq]);
  for (const s of model.steps) { apply(s.facts); out.push([...seq]); }
  mm.set(id, out);
  return out;
}
/** the things held by `id` at step k (visible, not riding on something), oldest first; `bucket` narrows to one bucket */
export function membersAt(model: Model, states: StepState[], k: number, id: Id, bucket?: number): Id[] {
  const is = placeMatcher(id);
  return (arrival(model, id)[k] ?? []).filter((m) => {
    const st = stOf(states, k, m); if (!st?.visible || st.at) return false;
    const where = st.in ?? model.things[m]?.parent ?? null;
    if (!is(where)) return false;
    return bucket === undefined ? true : bucketOf(id, where) === bucket;
  });
}

// ------------------------------------------------------------------ the size of a thing held by a data container
export function sizeOfThing(ctx: LayoutCtx, model: Model, id: Id, z: Tok, slot: boolean): [number, number] {
  const t = model.things[id];
  if (t.container && t.layout) { const c = ctx.child(id); return [c.w, c.h]; }
  const text = t.title;
  if (t.shape === "token" || t.shape === "ref") { const s = cut(ctx, text, 132, "chip"); return [ctx.measure(s, "chip") + 2 * CHIP_PX + TOKEN_DOT, CHIP_H]; }
  const lines = text ? ctx.wrap(text, z.maxW, z.font, 3) : [];
  const lw = Math.max(0, ...lines.map((l) => ctx.measure(l, z.font)));
  if (slot && t.shape === "box") return [Math.max(z.cell, lw + 16), z.cell];
  const h0 = Math.max(z.minH, lines.length * z.lh + 2 * z.py);
  switch (t.shape) {
    case "pill": { const h = Math.max(z.minH - 4, lines.length * z.lh + 2 * z.py - 2); return [Math.max(z.minW, lw + 2 * z.px + (lines.length > 1 ? h * 0.3 : 6)), h]; }
    case "circle": { const d = Math.max(z.minH + 10, lw + 2 * z.py + 10, lines.length * z.lh + 2 * z.py + 10); return [d, d]; }
    case "dot": return [Math.max(18, lw + 4), 16 + (lines.length ? 4 + lines.length * z.lh : 0)];
    case "text": return [lw + 4, lines.length * z.lh + 4];
    default: return [Math.max(z.minW, lw + 2 * z.px), h0];
  }
}

// ------------------------------------------------------------------ the identity of values (a value that moves keeps its key)
type Keys = Record<Id, string[][]>;
const keyCache = new WeakMap<StepState[], Keys>();
const arrEq = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
/**
 * For every container that holds values (array list stack queue; a map's entries are keyed by their key), the key of each
 * cell at each step, so the renderer slides a value to its new cell instead of redrawing it. A cell keeps the key of the
 * same value in the same container the step before (the nearest one, so 5 2 -> 2 5 swaps); a new cell may take the key of a
 * value in a `from` container that no longer holds it; the rest are new.
 */
export function cellKeys(model: Model, states: StepState[]): Keys {
  const hit = keyCache.get(states); if (hit) return hit;
  const ids = model.order.filter((id) => { const l = model.things[id].layout; return l !== null && DATA.has(l); });
  const out: Keys = {}; for (const id of ids) out[id] = [];
  const from: Record<number, Record<Id, Id[]>> = {};
  const note = (k: number, facts: Fact[]) => { for (const f of facts) if (f.k === "values" && f.from.length) ((from[k] ??= {})[f.id] ??= []).push(...f.from); };
  note(0, model.setup); model.steps.forEach((s, i) => note(i + 1, s.facts));
  let uid = 0;
  for (let k = 0; k < states.length; k++) {
    const taken = new Set<string>(), keys: Record<Id, (string | null)[]> = {};
    const vals = (id: Id, kk: number) => valuesAt(model, states, kk, id);
    const matchOwn = (id: Id, ks: (string | null)[]) => {
      const nv = vals(id, k), ov = k > 0 ? vals(id, k - 1) : [], ok = k > 0 ? out[id][k - 1] : [];
      const used = new Set<number>();
      nv.forEach((v, j) => {
        if (ks[j] !== null) return;
        let best = -1;
        for (let i = 0; i < ov.length; i++) if (!used.has(i) && !taken.has(ok[i]) && ov[i] === v && (best < 0 || Math.abs(i - j) < Math.abs(best - j))) best = i;
        if (best >= 0) { used.add(best); ks[j] = ok[best]; taken.add(ok[best]); }
      });
    };
    // 1. a container that did not change keeps every key; a map's entries are their keys; the rest match their own old cells
    const fed: Id[] = [];
    for (const id of ids) {
      const nv = vals(id, k);
      if (model.things[id].layout === "map") { keys[id] = nv.map((v) => `${id}.${entryOf(v)[0]}`); keys[id].forEach((x) => taken.add(x!)); continue; }
      if (k > 0 && from[k]?.[id]?.length) { keys[id] = nv.map(() => null); fed.push(id); continue; }
      const ov = k > 0 ? vals(id, k - 1) : [];
      if (k > 0 && arrEq(nv, ov)) { keys[id] = [...out[id][k - 1]]; keys[id].forEach((x) => taken.add(x!)); continue; }
      keys[id] = nv.map(() => null); matchOwn(id, keys[id]);
    }
    // 2. `x = ... from a,b`: the values come from those containers' cells of the step before (they fly in), 3. else their own
    for (const id of fed) {
      const ks = keys[id], nv = vals(id, k);
      nv.forEach((v, j) => {
        for (const src of from[k][id]) {
          if (!out[src]) continue;
          const sv = vals(src, k - 1), sk = out[src][k - 1];
          const i = sv.findIndex((x, ii) => x === v && !taken.has(sk[ii]));
          if (i >= 0) { ks[j] = sk[i]; taken.add(sk[i]); return; }
        }
      });
    }
    for (const id of fed) matchOwn(id, keys[id]);
    for (const id of ids) {
      const ks = keys[id];
      for (let j = 0; j < ks.length; j++) if (ks[j] === null) ks[j] = `${id}:${uid++}`;
      out[id][k] = ks as string[];
    }
  }
  keyCache.set(states, out);
  return out;
}

export const rectOf = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

/** the room a title band needs: its words, or (a closed thing) its words with a count, so opening it never resizes the box */
export const titleRoom = (ctx: LayoutCtx, t: Thing | null, noun: string, pad: number): number =>
  t?.title ? ctx.measure(isClosed(t) ? `${t.title} · 99 ${noun}` : t.title, "lane") + 2 * pad + 6 : 0;
