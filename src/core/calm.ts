// A calm story (format version 11): a thing moves once, straight, and only when it must.
import { inFrame, minFont, MIN_PX, storyView, union, type Box, type Compiled, type Frame } from "./scene";
import { leastScale } from "./readable";

const SWAPS = new Set(["array", "list", "queue", "bucket"]);

// The items that pass another item of the same row on their way: only they travel on an arc, so that two never go
// through each other. An item that only moves up in its queue, or comes in from outside, goes straight.
export function passing(from: readonly Box[], to: readonly Box[]): Set<number> {
  const was = new Map(from.map((b) => [b.key, b])), rows = new Map<string, { key: number; a: number; b: number }[]>();
  for (const b of to) {
    const a = was.get(b.key), row = b.ent.parent;
    if (!a || !row || a.ent.parent !== row || !SWAPS.has(b.parentKind ?? "")) continue;
    const of = rows.get(row), at = { key: b.key, a: a.x, b: b.x };
    if (of) of.push(at); else rows.set(row, [at]);
  }
  const out = new Set<number>();
  for (const items of rows.values()) {
    // by where they started: one passes another when it ends left of one before it, or right of one after it
    items.sort((p, q) => p.a - q.a);
    let most = -Infinity, least = Infinity;
    const goes = (it: { key: number; a: number; b: number }) => { if (Math.abs(it.b - it.a) > 4) out.add(it.key); }; // one that stays is passed, and stays
    for (const it of items) { if (it.b < most - 1) goes(it); most = Math.max(most, it.b); }
    for (let k = items.length - 1; k >= 0; k--) { if (items[k].b > least + 1) goes(items[k]); least = Math.min(least, items[k].b); }
  }
  return out;
}

// ---------------------------------------------------------------- one view from a zoom to the next
// The steps from one of the author's camera words (zoom, camera, focus, enter, split) to the next share one view, of
// everything those steps touch on the whole of their way. Only where that view would draw words under the least size
// does it give way: it then holds for as many steps as fit, and slides once.
export interface Held { steps: number[]; frame: Frame }

const viewKey = (c: Compiled, k: number) => {
  const f = c.frames[k];
  return JSON.stringify([f.look, f.focus, f.view ?? null, f.spread, c.nest?.path[k] ?? null]);
};

function swept(c: Compiled, steps: number[]): Frame {
  const fs = steps.map((k) => c.frames[k]);
  if (fs.length < 2) return fs[0];
  return {
    ...fs[0],
    boxes: fs.flatMap((f) => f.boxes),
    marks: fs.flatMap((f) => f.marks),
    bounds: union(fs.map((f) => f.bounds)),
    camera: union(fs.map((f) => f.camera)),
    touched: [...new Set(fs.flatMap((f) => f.touched))],
  };
}

const memo = new WeakMap<Compiled, { key: string; at: Held[] }>();
// the held view of each step, for a stage of shape ar, px wide
export function heldViews(c: Compiled, ar: number, px: number): Held[] {
  const key = `${ar} ${px}`, old = memo.get(c);
  if (old?.key === key) return old.at;
  const at: Held[] = [], keys = c.frames.map((_, k) => viewKey(c, k));
  // one view fits a span when every step keeps in it what its own view kept, with no word smaller than the least
  const fits = (f: Frame, steps: number[]) => {
    if (!px) return true;
    const v = storyView(f, ar, px), small = v.w > px / leastScale(f, px) + 0.5;
    return steps.every((k) => {
      const own = c.frames[k], mine = storyView(own, ar, px);
      if (small && (px / v.w) * minFont(own) < Math.min(MIN_PX, (px / mine.w) * minFont(own)) - 0.01) return false;
      return inFrame(own, v).ok >= inFrame(own, mine).ok;
    });
  };
  for (let k = 0; k < c.frames.length;) {
    let end = k;
    while (keys[end + 1] === keys[k]) end++;
    // most spans fit whole; else as many steps as do
    let held: Held = { steps: range(k, end), frame: swept(c, range(k, end)) };
    if (end > k && !fits(held.frame, held.steps)) {
      held = { steps: [k], frame: c.frames[k] };
      for (let to = k + 1; to <= end; to++) {
        const f = swept(c, range(k, to));
        if (!fits(f, range(k, to))) break;
        held = { steps: range(k, to), frame: f };
      }
    }
    for (const s of held.steps) at[s] = held;
    k += held.steps.length;
  }
  memo.set(c, { key, at });
  return at;
}
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, k) => a + k);

// On a phone the stage grows a little where that, and only that, keeps the camera still between two zooms: the least
// height with the fewest moves, never over the part of the window that still leaves room for the caption and player.
export const PHONE_TALL = { most: 680, ofWindow: 0.82, usual: 0.7, by: 20 } as const;
export function calmHeight(c: Compiled, px: number, win: number): number | null {
  const usual = Math.max(260, Math.min(px / c.aspect, win * PHONE_TALL.usual));
  const most = Math.min(PHONE_TALL.most, win * PHONE_TALL.ofWindow);
  const moves = (h: number) => new Set(heldViews(c, px / h, px)).size;
  let wanted = 1;
  for (let k = 1; k < c.frames.length; k++) if (viewKey(c, k) !== viewKey(c, k - 1)) wanted++;
  let best: number | null = null, least = moves(usual);
  for (let h = usual + PHONE_TALL.by; least > wanted && h <= most; h += PHONE_TALL.by) {
    const m = moves(h);
    if (m < least) { least = m; best = Math.round(h); }
  }
  return best;
}

// How far a step has run. A frame's time (requestAnimationFrame's) is when the frame began, which can be a little before
// the click that started the step: unclamped, the first frame ran backwards (a back step), and in a step with beats it
// took the step's end for one frame (a flash of the end, then back to the start).
export const stepT = (now: number, start: number, d: number): number => (d > 0 ? Math.max(0, Math.min(1, (now - start) / d)) : 1);

/** (format version 11: one focus at a time) the tokens a step is about, whose labels show at rest; every other token keeps its
 *  pill and lets its label fade. The step's last line that names a token decides (a `split` line: its pieces); a step
 *  that names none is about the tokens that take part (what a `pop` moves). Null: one token or none on the stage, and
 *  nothing changes. Ids: every token id the scene ever has (a token that has left still counts as named). */
export function tokenSubject(f: Frame, raw: string, ids: Set<string>): number[] | null {
  const on = f.boxes.filter((b) => b.kind === "token" && !(b as { hidden?: boolean }).hidden);
  if (on.length < 2 || !raw.trim()) return null; // a still scene (no step words) keeps every label
  const words = (line: string) => line.split(/[\s,]+/).filter(Boolean);
  for (const line of raw.split("\n").map((l) => l.trim()).reverse()) {
    const w = words(line);
    if (w[0] === "split" && w[1]) return on.filter((b) => b.id.startsWith(`${w[1]}.`)).map((b) => b.key);
    const named = w.filter((x) => ids.has(x));
    if (named.length) return on.filter((b) => named.includes(b.id)).map((b) => b.key);
  }
  const part = new Set(f.part ?? []);
  return on.filter((b) => part.has(b.key)).map((b) => b.key);
}
