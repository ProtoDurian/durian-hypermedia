// Layout family "tree" (lane eng-data): tree. Contract: ../types.ts LayoutPlugin, ../ENGINE.md section 3.
//
// Indent (or `in t under n [left|right]`: state.in = the parent, state.side) = children. Each node is centred over its
// children; a binary tree (any node with a side) keeps an empty side's room, so a node with one child stays above its
// slot; the layout holds room for every node the story ever has (the still rule), so a node that is shown later appears
// in its place and nothing moves. A node that is a laid-out container (`[array]`: a tree of arrays, merge sort) is sized
// by ctx.child and its indented children are tree children, not its contents (data layouts skip them: kit.inTreeContext).
// A tree too wide for a phone turns top to bottom as an indented outline, never a grid. Port of scene.ts treeLayout.
import type { Id, LayoutPlugin, Placed, Prim, Rect, Thing } from "../types";
import { thingPrims } from "../render/prims"; // fmt12
import { titleRoom, baseline, closedAt, headH, inTreeContext, sizeOfThing, stOf, titlePrim, titleWords, tokOf } from "./data/kit";

const GAP = 16, LEVEL = 46;       // between siblings; between a row of nodes and the next (scene.ts treeLayout)
const INDENT = 24, ROW_GAP = 10;  // the outline form
const f2 = (n: number) => +n.toFixed(2);

export const Tree: LayoutPlugin = {
  name: "tree",
  place(input, ctx) {
    const { model, states } = input;
    const id = input.container, cont: Thing | null = id ? model.things[id] : null;
    const n = states.length;
    const z = tokOf(model, cont, ctx.phone);
    const title = cont?.title ?? "";
    const pad = id === null ? 0 : title ? z.pad : 4;
    const head = title ? headH(z) : 0;

    // ---- which things are nodes, and who is whose child (the last place a node is put under another node wins)
    const rides = (t: Id) => model.things[t].shape === "ref" || states.some((s) => !!s.things[t]?.at);
    // a node `in idx under p30 left` (the graph front-end) is declared in the tree with keys.under/keys.side; a later `in x` fact moves it
    const whereAt = (t: Id, st: (typeof states)[number]["things"][string] | undefined): Id | null => { if (!st) return null; const decl = model.things[t].parent; return st.in === decl && model.things[t].keys.under ? model.things[t].keys.under : st.in ?? decl; };
    const parentsOf = (t: Id) => states.map((s) => whereAt(t, s.things[t]));
    const nodes = new Set<Id>(), roots: Id[] = [];
    const isRoot = (t: Id) => parentsOf(t).some((p) => p === id);
    for (const t of model.order) if (!rides(t) && isRoot(t) && (id !== null || model.things[t].parent === null || states.some((s) => s.things[t]?.in === null))) { nodes.add(t); }
    for (let grew = true; grew;) {
      grew = false;
      for (const t of model.order) if (!nodes.has(t) && !rides(t) && parentsOf(t).some((p) => p !== null && p !== id && nodes.has(p))) { nodes.add(t); grew = true; }
    }
    const parent = new Map<Id, Id | null>(), side = new Map<Id, "left" | "right">();
    const flagSide = (t: Id): "left" | "right" | null => (model.things[t].keys.side === "left" || model.things[t].keys.side === "right" ? (model.things[t].keys.side as "left" | "right") : model.things[t].flags.includes("left") ? "left" : model.things[t].flags.includes("right") ? "right" : null);
    for (const t of nodes) {
      let p: Id | null = null, sd: "left" | "right" | null = flagSide(t);
      states.forEach((s) => {
        const st = s.things[t]; if (!st) return;
        const w = whereAt(t, st);
        if (w !== null && w !== id && nodes.has(w) && w !== t) { p = w; if (st.side) sd = st.side; }
      });
      parent.set(t, p); if (sd) side.set(t, sd);
    }
    // a cycle (a is under b under a) would never end: cut it at the node that closes it
    for (const t of nodes) { const seen = new Set<Id>([t]); let c = parent.get(t) ?? null; while (c) { if (seen.has(c)) { parent.set(t, null); break; } seen.add(c); c = parent.get(c) ?? null; } }
    for (const t of model.order) if (nodes.has(t) && !parent.get(t)) roots.push(t);
    const kids = (p: Id | null) => model.order.filter((t) => nodes.has(t) && (parent.get(t) ?? null) === p);
    const binary = [...nodes].some((t) => side.has(t));
    // fmt12: in a binary tree a child with no side takes the side its siblings leave free, left first (`n3` beside `n10 [right]`
    // is the left child), so an author writes [right] only where it differs; without this it drew beside both, off to the right
    if (binary) for (const p of nodes) {
      const c = kids(p), free = (["left", "right"] as const).filter((s) => !c.some((k) => side.get(k) === s));
      for (const k of c) if (!side.has(k) && free.length) side.set(k, free.shift()!);
    }

    // ---- sizes: a laid-out container is its layout's size; the rest come from the shape
    const size = new Map<Id, [number, number]>();
    for (const t of nodes) size.set(t, sizeOfThing(ctx, model, t, z, false));

    const rel = new Map<Id, Rect>();
    const avail = Math.max(60, ctx.width - 2 * pad - 8);
    const depth = new Map<Id, number>();
    const mark = (t: Id, d: number) => { depth.set(t, d); for (const c of kids(t)) mark(c, d + 1); };
    roots.forEach((r) => mark(r, 0));
    const rowH: number[] = [];
    for (const t of nodes) rowH[depth.get(t)!] = Math.max(rowH[depth.get(t)!] ?? 0, size.get(t)![1]);
    const rowY: number[] = []; { let y = 0; rowH.forEach((h, d) => { rowY[d] = y; y += h + LEVEL; }); }

    // ---- the natural form: each node centred over its children
    const width = new Map<string, number>();
    const sub = (t: Id): number => {
      const [w] = size.get(t)!, c = kids(t);
      let total: number;
      if (binary) {
        const l = c.find((k) => side.get(k) === "left"), r = c.find((k) => side.get(k) === "right");
        const lw = l ? sub(l) : w / 2, rw = r ? sub(r) : w / 2;
        total = Math.max(w, lw + GAP + rw); width.set(t + ":l", lw);
        for (const k of c) if (k !== l && k !== r) sub(k);
      } else total = Math.max(w, c.reduce((a, k) => a + sub(k) + GAP, -GAP));
      width.set(t, total); return total;
    };
    const put = (t: Id, x0: number) => {
      const [w, h] = size.get(t)!, c = kids(t), total = width.get(t)!, y = rowY[depth.get(t)!];
      if (binary) {
        const lw = width.get(t + ":l")!, rw = total - lw - GAP;
        const cx = w > lw + GAP + rw ? x0 + w / 2 : x0 + lw + GAP / 2;
        rel.set(t, { x: cx - w / 2, y, w, h });
        const l = c.find((k) => side.get(k) === "left"), r = c.find((k) => side.get(k) === "right");
        if (l) put(l, cx - GAP / 2 - width.get(l)!);
        if (r) put(r, cx + GAP / 2);
        let ox = x0 + total + GAP; for (const k of c) if (k !== l && k !== r) { put(k, ox); ox += width.get(k)! + GAP; }
        return;
      }
      rel.set(t, { x: x0 + (total - w) / 2, y, w, h });
      let x = x0 + (total - (c.reduce((a, k) => a + width.get(k)! + GAP, -GAP))) / 2;
      for (const k of c) { put(k, x); x += width.get(k)! + GAP; }
    };
    let natW = 0;
    { let x = 0; for (const r of roots) { sub(r); put(r, x); x += width.get(r)! + GAP * 2; } natW = Math.max(0, x - GAP * 2); }

    // ---- the outline form for a phone the tree does not fit: preorder rows, indented by depth
    const outline = ctx.phone && natW > avail;
    if (outline) {
      rel.clear();
      let y = 0;
      const walk = (t: Id, d: number) => {
        const [w, h] = size.get(t)!; rel.set(t, { x: d * INDENT, y, w, h }); y += h + ROW_GAP;
        const c = kids(t), l = c.filter((k) => side.get(k) === "left"), r = c.filter((k) => side.get(k) === "right"), o = c.filter((k) => !side.get(k));
        for (const k of [...l, ...o, ...r]) walk(k, d + 1);
      };
      roots.forEach((r) => walk(r, 0));
    }
    let cW = 0, cH = 0;
    for (const r of rel.values()) { cW = Math.max(cW, r.x + r.w); cH = Math.max(cH, r.y + r.h); }
    cW = Math.max(cW, 40); cH = Math.max(cH, 40);
    const hdrW = titleRoom(ctx, cont, "nodes", pad);
    const W = Math.max(cW + 2 * pad, hdrW), H = cH + 2 * pad + head;
    const ox = pad + (W - 2 * pad - cW) / 2, oy = pad + head;
    const place = (t: Id): Rect => { const r = rel.get(t)!; return { x: f2(r.x + ox), y: f2(r.y + oy), w: r.w, h: r.h }; };
    const live = (k: number) => id === null || !!stOf(states, k, id)?.visible;
    const nodeShown = (k: number, t: Id) => !!stOf(states, k, t)?.visible && !stOf(states, k, t)!.at;

    const atCache = new Map<number, Record<Id, Rect>>(), decorCache = new Map<number, Prim[]>();
    const edge = (p: Rect, c: Rect, k: string, faint: boolean, role: string | null): Prim => outline
      ? { k: "path", key: k, d: `M${f2(p.x + 12)} ${f2(p.y + p.h)}L${f2(p.x + 12)} ${f2(c.y + c.h / 2)}L${f2(c.x)} ${f2(c.y + c.h / 2)}`, role, width: "thin", cls: faint ? "tree-edge faint" : "tree-edge" }
      : { k: "path", key: k, d: `M${f2(p.x + p.w / 2)} ${f2(p.y + p.h)}L${f2(c.x + c.w / 2)} ${f2(c.y)}`, role, width: "thin", cls: faint ? "tree-edge faint" : "tree-edge" };
    // fmt12: a node that holds tree children only (no layout of its own: `plain n8 [circle]: 8` with indented children) is a node,
    // not a container: its words sit in its middle as a leaf's do, not as a heading at its top-left
    const treeNode = (t: Id) => nodes.has(t) && !model.things[t].layout && kids(t).length > 0;
    return {
      w: W, h: H,
      draw(_k, t, r, st) { return treeNode(t) ? thingPrims({ ...model.things[t], container: false }, st, r, ctx.look, ctx.phone) : null; },
      at(k) {
        const hit = atCache.get(k); if (hit) return hit;
        const out: Record<Id, Rect> = {};
        if (live(k)) for (const t of nodes) if (nodeShown(k, t)) out[t] = place(t);
        atCache.set(k, out); return out;
      },
      decor(k) {
        const hit = decorCache.get(k); if (hit) return hit;
        const out: Prim[] = [];
        if (live(k) && k < n) {
          const st = id ? stOf(states, k, id) : undefined, faint = !!cont && closedAt(cont, st);
          if (id && cont) { let count = 0; for (const t of nodes) if (nodeShown(k, t)) count++; out.push(...titlePrim(ctx, id, titleWords(ctx, cont, "tree", st, count, W - 2 * pad), pad, head, faint)); }
          for (const t of nodes) {
            const p = parent.get(t); if (!p || !nodeShown(k, t) || !nodeShown(k, p)) continue;
            out.push(edge(place(p), place(t), `tree:${p}>${t}`, faint, model.things[t].role));
          }
        }
        decorCache.set(k, out); return out;
      },
    };
  },
};
void baseline; void inTreeContext;
