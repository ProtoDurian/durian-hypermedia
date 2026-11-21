// This package is the source of this file: edit it here. It began as a copy synced from a private prototype (scripts/sync.ts, now frozen).
// still9: things a step does not change stay where they are (format version 9).
// For every scene and every step, each thing that is on the stage before and after the step keeps its exact place
// and size, unless the step changes it: it is added, moved, swapped, split, merged, pushed or popped, its layout or
// layer is set, it sits inside something that moved (carried), or it is an item of a data structure (array, list,
// stack, queue, bucket, table, tree) whose items changed (a queue moving up is what a pop means).
// Usage: bun tools/still9.ts [--steps]     (every animation of the Format page and the article, wide and phone layouts)
import { compileScene, phoneInfo, type Compiled, type Box } from "./scene";

const FLOWING = new Set(["array", "list", "stack", "queue", "bucket", "buckets", "table", "tree"]);
const EPS = 0.5;

export interface Still { step: number; id: string; from: [number, number, number, number]; to: [number, number, number, number] }

// the ids a step may move, with what they hold
function mayMove(c: Compiled, k: number): Set<string> {
  const ops = c.scene.steps[k]?.ops ?? [];
  const roots = new Set<string>();
  for (const o of ops) {
    if (o.op === "add") roots.add(o.decl.id);
    else if (o.op === "move") roots.add(o.id);
    else if (o.op === "swap") { roots.add(o.a); roots.add(o.b); }
    else if (o.op === "split") { roots.add(o.id); o.into.forEach((x) => roots.add(x.id)); }
    else if (o.op === "merge") { o.ids.forEach((x) => roots.add(x)); roots.add(o.into.id); }
    else if (o.op === "set" && Object.keys(o.kv).some((x) => ["layout", "dir", "cols", "layer", "size"].includes(x))) roots.add(o.id);
    else if (o.op === "push" || o.op === "pop") roots.add(o.s);
  }
  const prev = k > 0 ? c.frames[k - 1] : null, cur = c.frames[k];
  const out = new Set<string>(roots);
  // carried: inside a thing that may move, before or after
  for (const f of [prev, cur]) {
    if (!f) continue;
    const byId = new Map(f.boxes.filter((b) => b.key > 0).map((b) => [b.id, b]));
    for (const b of f.boxes) {
      for (let p: string | null = b.ent.parent, n = 0; p && n < 64; p = byId.get(p)?.ent.parent ?? null, n++) if (roots.has(p)) { out.add(b.id); break; }
    }
  }
  // items of a data structure whose items changed
  if (prev) {
    const kidsOf = (f: typeof prev) => { const m = new Map<string, string>(); for (const b of f.boxes) if (b.key > 0) m.set(b.id, JSON.stringify(b.ent.kids)); return m; };
    const a = kidsOf(prev), b = kidsOf(cur);
    for (const x of cur.boxes) {
      if (x.key <= 0 || !FLOWING.has(x.kind) && !(x.kind === "group" && x.ent.layout === "tree")) continue;
      if (a.get(x.id) !== b.get(x.id)) for (const f of [prev, cur]) for (const y of f.boxes) {
        for (let p: string | null = y.ent.parent, n = 0; p && n < 64; p = f.boxes.find((z) => z.id === p && z.key > 0)?.ent.parent ?? null, n++) if (p === x.id) { out.add(y.id); break; }
      }
    }
  }
  return out;
}

const rect = (b: Box): [number, number, number, number] => [b.x, b.y, b.w, b.h];
export function stillCheck(c: Compiled): Still[] {
  const out: Still[] = [];
  for (let k = 1; k < c.frames.length; k++) {
    const prev = c.frames[k - 1], cur = c.frames[k];
    const ok = mayMove(c, k);
    const before = new Map(prev.boxes.filter((b) => b.key > 0 && b.kind !== "token" && b.kind !== "pointer").map((b) => [b.id, b]));
    for (const b of cur.boxes) {
      if (b.key <= 0 || b.kind === "token" || b.kind === "pointer" || ok.has(b.id)) continue;
      const a = before.get(b.id);
      if (!a) continue;
      if (Math.abs(a.x - b.x) > EPS || Math.abs(a.y - b.y) > EPS || Math.abs(a.w - b.w) > EPS || Math.abs(a.h - b.h) > EPS) out.push({ step: k + 1, id: b.id, from: rect(a), to: rect(b) });
    }
  }
  return out;
}

