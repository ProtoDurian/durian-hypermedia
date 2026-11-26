// Layout family "data" (lane eng-data): array list stack queue map. Contract: ../types.ts LayoutPlugin, ../ENGINE.md section 3.
//
// The values ARE the cells: `split s [array]: 5 2 8 1` makes four cells with ids s.0 .. s.3, drawn by this layout's
// decor with a stable key per value (a value that moves between steps keeps its key, so the renderer slides it; see
// data/kit.ts cellKeys). Things held by the container (`job1 in q`, `apple in h.2`) are placed here too, in the order
// they arrived. Rules ported from src/core/scene.ts (SPEC 6.3 and 6.12):
//   array  cells in a row, index under each; wraps into rows when the plan is narrow
//   list   a row, left to right from its head, an arrow between items (a column on a phone)
//   stack  a column, the newest on top, growing upward from a bottom that stays put
//   queue  a row where the front (the oldest, the next to leave) is on the right and new items join on the left;
//          a column (front at the top) on a phone; items close up, so a pop moves the rest forward
//   map    a table (key, value) or, with `buckets=n`, n rows of chains in bucket hash(key) mod n
// A container keeps one size for the whole story (the still rule), a closed one draws its inside faint with a count title.
import type { Id, LayoutCtx, LayoutInput, LayoutPlugin, Placed, Prim, Rect, Thing, Tone } from "../types";
import {
  IDX_H, LINK_GAP, titleRoom, baseline, cellKeys, closedAt, cut, entryOf, hasFlag, hashOf, headH, membersAt,
  sizeOfThing, stOf, titlePrim, titleWords, tokOf, valuesAt, type Tok,
} from "./data/kit";
import { partLooks } from "./data/kit"; // render3

interface It { key: string; id: Id; w: number; h: number; text: string | null; member: boolean }
type Dir = "row" | "column" | "grid";
const f2 = (n: number) => +n.toFixed(2);
const line = (x1: number, y1: number, x2: number, y2: number) => `M${f2(x1)} ${f2(y1)}L${f2(x2)} ${f2(y2)}`;
const GAP: Record<string, number> = { array: 4, list: LINK_GAP, stack: 4, queue: 6 };

/** the shared frame: sizes over the whole story, title band, closed look, and the Placed that reads a per-step arrangement */
interface Arranged { rects: Rect[]; extra: Prim[] }
interface Spec {
  W: number; H: number;
  items: (k: number) => It[];
  arrange: (k: number, items: It[]) => Arranged;
  ids: (k: number, items: It[], a: Arranged) => Record<Id, Rect>;
  count: (k: number) => number;
}

function frame(input: LayoutInput, ctx: LayoutCtx, name: string, spec: (z: Tok, pad: number, head: number) => Omit<Spec, "W" | "H"> & { cw: number; ch: number; minW?: number }): Placed {
  const { model, states } = input;
  const id = input.container, t = id ? model.things[id] : null;
  const z = tokOf(model, t, ctx.phone);
  const title = t?.title ?? "";
  const pad = id === null ? 0 : title ? z.pad : 4;
  const head = title ? headH(z) : 0;
  const s = spec(z, pad, head);
  const hdrW = titleRoom(ctx, t, "items", pad);
  const W = Math.max(s.cw + 2 * pad, hdrW, 40), H = Math.max(s.ch + 2 * pad + head, 40);
  const n = states.length;
  const decorCache = new Map<number, Prim[]>(), atCache = new Map<number, Record<Id, Rect>>();
  const live = (k: number) => id === null || !!stOf(states, k, id)?.visible;
  const arranged = (k: number) => { const items = s.items(k); return { items, a: s.arrange(k, items) }; };
  return {
    w: W, h: H,
    at(k) {
      const hit = atCache.get(k); if (hit) return hit;
      const out: Record<Id, Rect> = {};
      if (live(k)) { const { items, a } = arranged(k); Object.assign(out, s.ids(k, items, a)); }
      atCache.set(k, out); return out;
    },
    decor(k) {
      const hit = decorCache.get(k); if (hit) return hit;
      const out: Prim[] = [];
      if (id && t && live(k) && k < n) {
        const st = stOf(states, k, id), closed = closedAt(t, st), { items, a } = arranged(k);
        out.push(...titlePrim(ctx, id, titleWords(ctx, t, name, st, s.count(k), W - 2 * pad), pad, head, closed));
        if (!(hasFlag(t, "hidden-inside") && !st?.open)) {
          const parts = partLooks(model, id)[Math.min(k, model.steps.length)] ?? {}; // render3: a cell's own tone and dim
          items.forEach((it, i) => { if (it.member) return; const pl = parts[it.id.slice(id.length + 1)]; out.push(...cellPrims(ctx, t, it, a.rects[i], z, closed, pl?.tone ?? st?.tone ?? null, !!st?.dim || !!pl?.dim)); });
          out.push(...(closed ? a.extra.filter((p) => p.k !== "text") : a.extra)); // a closed thing shows no words, not even its indices
        }
      }
      decorCache.set(k, out); return out;
    },
  };
}

function cellPrims(ctx: LayoutCtx, t: Thing, it: It, r: Rect, z: Tok, faint: boolean, tone: Tone | null, dim: boolean): Prim[] {
  const out: Prim[] = [{ k: "box", key: it.key, id: it.id, shape: "box", rect: r, role: t.role, tone, dim, cls: faint ? "cell faint" : "cell" }];
  if (!faint && it.text) out.push({ k: "text", key: `${it.key}:t`, id: it.id, x: r.x + r.w / 2, y: baseline(r.y + r.h / 2, z.font), lines: [cut(ctx, it.text, r.w - 10, z.font)], font: z.font, anchor: "middle", ink: "ink" });
  return out;
}

// ------------------------------------------------------------------ array list stack queue
function flowLayout(name: "array" | "list" | "stack" | "queue"): LayoutPlugin["place"] {
  return (input, ctx) => frame(input, ctx, name, (z, pad, head) => {
    const { model, states } = input;
    const id = input.container, t = id ? model.things[id] : null;
    const n = states.length, gap = GAP[name];
    const keys = id ? cellKeys(model, states)[id] ?? [] : [];
    const sizes = new Map<Id, [number, number]>();
    const sizeOf = (m: Id) => { let s = sizes.get(m); if (!s) { s = sizeOfThing(ctx, model, m, z, true); sizes.set(m, s); } return s; };
    let cw = z.cell;
    for (let k = 0; k < n; k++) for (const v of valuesAt(model, states, k, id ?? "")) cw = Math.max(cw, ctx.measure(cut(ctx, v, z.maxW, z.font), z.font) + 16);
    const items = (k: number): It[] => {
      const cells: It[] = valuesAt(model, states, k, id ?? "").map((v, j) => ({ key: keys[k]?.[j] ?? `${id}.${j}`, id: `${id}.${j}`, w: cw, h: z.cell, text: v, member: false }));
      const held = id ? membersAt(model, states, k, id) : input.members.filter((m) => stOf(states, k, m)?.visible);
      return [...cells, ...held.map((m): It => ({ key: `m:${m}`, id: m, w: sizeOf(m)[0], h: sizeOf(m)[1], text: null, member: true }))];
    };
    const all = Array.from({ length: n }, (_, k) => items(k));
    const N = Math.max(0, ...all.map((a) => a.length));
    const avail = Math.max(60, ctx.width - 2 * pad - 8);
    const itemW = Math.max(z.cell, ...all.flat().map((i) => i.w)), itemH = Math.max(z.cell, ...all.flat().map((i) => i.h));
    const rowExt = (a: It[]): [number, number] => [a.reduce((s, i) => s + i.w, 0) + Math.max(0, a.length - 1) * gap, Math.max(0, ...a.map((i) => i.h))];
    const colExt = (a: It[]): [number, number] => [Math.max(0, ...a.map((i) => i.w)), a.reduce((s, i) => s + i.h, 0) + Math.max(0, a.length - 1) * gap];
    const wantsColumn = t?.keys.layout === "column" || t?.keys.dir === "down";
    const dir: Dir = name === "array" ? "grid" : name === "stack" || wantsColumn ? "column" : Math.max(0, ...all.map((a) => rowExt(a)[0])) > avail ? "column" : "row";
    const perRow = N * (itemW + gap) - gap <= avail ? Math.max(1, N) : Math.max(1, Math.floor((avail + gap) / (itemW + gap)));
    const idx = name === "array" ? IDX_H : 0;
    const gridExt = (a: It[]): [number, number] => { const c = Math.min(a.length, perRow), r = Math.ceil(a.length / perRow); return [c ? c * (itemW + gap) - gap : 0, r ? r * (itemH + idx) + (r - 1) * gap : 0]; };
    const ext = (a: It[]) => (dir === "grid" ? gridExt(a) : dir === "row" ? rowExt(a) : colExt(a));
    const cW = Math.max(z.cell, ...all.map((a) => ext(a)[0])), cH = Math.max(z.cell, ...all.map((a) => ext(a)[1]));
    const W = Math.max(cW + 2 * pad, titleRoom(ctx, t, "items", pad), 40);
    const innerW = W - 2 * pad, top = head + pad, off = pad + (innerW - cW) / 2; // a row or a grid sits in the middle of its box (a queue stays flush to its front)
    return {
      cw: cW, ch: cH,
      items: (k) => all[k] ?? [],
      count: (k) => all[k]?.length ?? 0,
      arrange(_k, a) {
        const rects: Rect[] = [], extra: Prim[] = [];
        if (dir === "grid") {
          a.forEach((it, i) => {
            const col = i % perRow, row = Math.floor(i / perRow);
            const x = off + col * (itemW + gap) + (itemW - it.w) / 2, y = top + row * (itemH + idx + gap) + (itemH - it.h) / 2;
            rects.push({ x, y, w: it.w, h: it.h });
            if (!it.member) extra.push({ k: "text", key: `${id}:ix:${i}`, x: f2(off + col * (itemW + gap) + itemW / 2), y: f2(top + row * (itemH + idx + gap) + itemH + IDX_H - 4), lines: [String(i)], font: "chip", anchor: "middle", ink: "muted", cls: "index" });
          });
        } else if (dir === "row") {
          let x = name === "queue" ? pad + innerW : off;
          // a queue reads the way work flows: the front (item 0) on the right, new ones join on the left
          a.forEach((it) => {
            if (name === "queue") { x -= it.w; rects.push({ x, y: top + (cH - it.h) / 2, w: it.w, h: it.h }); x -= gap; }
            else { rects.push({ x, y: top + (cH - it.h) / 2, w: it.w, h: it.h }); x += it.w + gap; }
          });
        } else if (name === "stack") {
          // the newest (last) on top; the bottom stays where it is, so a push grows upward into the room kept for it
          let bottom = top + cH;
          a.forEach((it) => { rects.push({ x: pad + (innerW - it.w) / 2, y: bottom - it.h, w: it.w, h: it.h }); bottom -= it.h + gap; });
        } else {
          let y = top;
          a.forEach((it) => { rects.push({ x: pad + (innerW - it.w) / 2, y, w: it.w, h: it.h }); y += it.h + gap; });
        }
        if (name === "list") for (let i = 0; i + 1 < a.length; i++) {
          const p = rects[i], q = rects[i + 1];
          extra.push({ k: "path", key: `${id}:ar:${a[i].key}>${a[i + 1].key}`, id: id ?? undefined, d: dir === "row" ? line(p.x + p.w, p.y + p.h / 2, q.x, q.y + q.h / 2) : line(p.x + p.w / 2, p.y + p.h, q.x + q.w / 2, q.y), role: t?.role ?? null, arrow: "end", width: "thin" });
        }
        return { rects, extra };
      },
      ids: (_k, a, r) => Object.fromEntries(a.map((it, i) => [it.id, r.rects[i]])),
    };
  });
}

// ------------------------------------------------------------------ map
function mapLayout(input: LayoutInput, ctx: LayoutCtx): Placed {
  const { model, states } = input;
  const id = input.container, t = id ? model.things[id] : null;
  const nb = Math.max(0, Math.min(16, Math.floor(+(t?.keys.buckets ?? t?.keys.count ?? 0)) || 0));
  return nb > 0 ? bucketsLayout(input, ctx, nb) : tableLayout(input, ctx);
}

function entriesAt(input: LayoutInput, k: number): [string, string][] {
  return valuesAt(input.model, input.states, k, input.container ?? "").map(entryOf);
}

function tableLayout(input: LayoutInput, ctx: LayoutCtx): Placed {
  const { model, states } = input;
  const id = input.container!, t = model.things[id], n = states.length;
  const keys = cellKeys(model, states)[id] ?? [];
  return frame(input, ctx, "map", (z, pad, head) => {
    const rh = z.minH - 8;
    let kw = Math.max(48, ctx.measure("key", "chip") + 2 * z.px), vw = Math.max(48, ctx.measure("value", "chip") + 2 * z.px), N = 0;
    for (let k = 0; k < n; k++) { const e = entriesAt(input, k); N = Math.max(N, e.length); for (const [a, b] of e) { kw = Math.max(kw, ctx.measure(a, z.font) + 2 * z.px); vw = Math.max(vw, ctx.measure(b, z.font) + 2 * z.px); } }
    const cW = kw + vw, cH = (1 + N) * rh;
    const W = Math.max(cW + 2 * pad, titleRoom(ctx, t, "keys", pad));
    const x0 = pad + (W - 2 * pad - cW) / 2, top = head + pad;
    return {
      cw: cW, ch: cH,
      items: (k) => entriesAt(input, k).map(([a, b], i): It => ({ key: keys[k]?.[i] ?? `${id}.${a}`, id: `${id}.${a}`, w: cW, h: rh, text: `${a}\u0000${b}`, member: false })),
      count: (k) => entriesAt(input, k).length,
      arrange(k, items) {
        const st = stOf(states, k, id), faint = closedAt(t, st);
        const rects = items.map((_, i) => ({ x: x0, y: top + (i + 1) * rh, w: cW, h: rh }));
        const extra: Prim[] = [
          { k: "rect", key: `${id}:head`, rect: { x: x0, y: top, w: cW, h: rh }, fill: "band", edge: "line", r: 4 },
          { k: "text", key: `${id}:hk`, x: x0 + kw / 2, y: baseline(top + rh / 2, "chip"), lines: ["key"], font: "chip", anchor: "middle", ink: "muted" },
          { k: "text", key: `${id}:hv`, x: x0 + kw + vw / 2, y: baseline(top + rh / 2, "chip"), lines: ["value"], font: "chip", anchor: "middle", ink: "muted" },
        ];
        items.forEach((it, i) => {
          const r = rects[i], [a, b] = it.text!.split("\u0000");
          extra.push({ k: "box", key: `${it.key}:k`, id: it.id, shape: "box", rect: { x: r.x, y: r.y, w: kw, h: rh }, role: t.role, tone: st?.tone ?? null, dim: !!st?.dim, cls: faint ? "cell faint" : "cell" });
          extra.push({ k: "box", key: `${it.key}:v`, id: it.id, shape: "box", rect: { x: r.x + kw, y: r.y, w: vw, h: rh }, role: t.role, tone: st?.tone ?? null, dim: !!st?.dim, cls: faint ? "cell faint" : "cell" });
          if (!faint) {
            extra.push({ k: "text", key: `${it.key}:kt`, id: it.id, x: r.x + kw / 2, y: baseline(r.y + rh / 2, z.font), lines: [cut(ctx, a, kw - 8, z.font)], font: z.font, anchor: "middle", ink: "ink" });
            extra.push({ k: "text", key: `${it.key}:vt`, id: it.id, x: r.x + kw + vw / 2, y: baseline(r.y + rh / 2, z.font), lines: [cut(ctx, b, vw - 8, z.font)], font: z.font, anchor: "middle", ink: "ink" });
          }
        });
        return { rects, extra };
      },
      ids: (_k, items, a) => Object.fromEntries(items.map((it, i) => [it.id, a.rects[i]])),
    };
  });
}

interface Chain { key: string; id: Id; w: number; h: number; text: string | null; member: boolean; bucket: number }
function bucketsLayout(input: LayoutInput, ctx: LayoutCtx, nb: number): Placed {
  const { model, states } = input;
  const id = input.container!, t = model.things[id], n = states.length;
  const keys = cellKeys(model, states)[id] ?? [];
  return frame(input, ctx, "map", (z, pad, head) => {
    const LEAD = 34, ROW_PAD = 4, ROW_GAP = 6;
    const sizes = new Map<Id, [number, number]>();
    const sizeOf = (m: Id) => { let s = sizes.get(m); if (!s) { s = sizeOfThing(ctx, model, m, z, true); sizes.set(m, s); } return s; };
    const chains = (k: number): Chain[][] => {
      const rows: Chain[][] = Array.from({ length: nb }, () => []);
      entriesAt(input, k).forEach(([a, b], i) => {
        const text = `${a}: ${b}`, bk = hashOf(a, nb);
        rows[bk].push({ key: keys[k]?.[i] ?? `${id}.${a}`, id: `${id}.${a}`, w: Math.max(z.cell, ctx.measure(cut(ctx, text, z.maxW, z.font), z.font) + 16), h: z.cell, text, member: false, bucket: bk });
      });
      for (let b = 0; b < nb; b++) for (const m of membersAt(model, states, k, id, b)) rows[b].push({ key: `m:${m}`, id: m, w: sizeOf(m)[0], h: sizeOf(m)[1], text: null, member: true, bucket: b });
      return rows;
    };
    const all = Array.from({ length: n }, (_, k) => chains(k));
    const rowExt = (r: Chain[]) => r.reduce((s, c) => s + LINK_GAP + c.w, 0);
    const chainW = Math.max(0, ...all.flatMap((rs) => rs.map(rowExt)));
    const itemH = Math.max(z.cell, ...all.flat(2).map((c) => c.h));
    const rowH = Math.max(32, itemH) + 2 * ROW_PAD;
    const cW = Math.max(120, LEAD + chainW + 8), cH = nb * rowH + (nb - 1) * ROW_GAP;
    const flat = (k: number): It[] => all[k].flat().map((c) => ({ key: c.key, id: c.id, w: c.w, h: c.h, text: c.text, member: c.member }));
    const top = head + pad;
    return {
      cw: cW, ch: cH,
      items: flat,
      count: (k) => all[k]?.reduce((s, r) => s + r.length, 0) ?? 0,
      arrange(k, items) {
        const rows = all[k] ?? [], st = stOf(states, k, id), faint = closedAt(t, st);
        const rect = new Map<string, Rect>(), extra: Prim[] = [];
        rows.forEach((row, b) => {
          const y = top + b * (rowH + ROW_GAP);
          extra.push({ k: "rect", key: `${id}:b${b}`, rect: { x: pad, y, w: cW, h: rowH }, fill: "faint", edge: "line", r: 6, cls: faint ? "bucket faint" : "bucket" });
          extra.push({ k: "text", key: `${id}:bn${b}`, x: pad + LEAD / 2, y: baseline(y + rowH / 2, "chip"), lines: [String(b)], font: "chip", anchor: "middle", ink: "muted", cls: "index" });
          let x = pad + LEAD, prevR = x, prevKey = `${id}:bn${b}`;
          row.forEach((c) => {
            const r = { x: x + LINK_GAP, y: y + (rowH - c.h) / 2, w: c.w, h: c.h };
            rect.set(c.key, r);
            extra.push({ k: "path", key: `${id}:ar:${prevKey}>${c.key}`, id, d: line(prevR, y + rowH / 2, r.x, y + rowH / 2), role: t.role, arrow: "end", width: "thin" });
            x = r.x + r.w; prevR = x; prevKey = c.key;
          });
        });
        return { rects: items.map((it) => rect.get(it.key)!), extra };
      },
      ids(_k, items, a) {
        const out: Record<Id, Rect> = {};
        items.forEach((it, i) => { out[it.id] = a.rects[i]; });
        for (let b = 0; b < nb; b++) { const r = { x: pad, y: top + b * (rowH + ROW_GAP), w: cW, h: rowH }; out[`${id}.${b}`] = r; out[`${id}.b${b}`] = r; }
        return out;
      },
    };
  });
}

export const ArrayLayout: LayoutPlugin = { name: "array", place: flowLayout("array") };
export const ListLayout: LayoutPlugin = { name: "list", place: flowLayout("list") };
export const StackLayout: LayoutPlugin = { name: "stack", place: flowLayout("stack") };
export const QueueLayout: LayoutPlugin = { name: "queue", place: flowLayout("queue") };
export const MapLayout: LayoutPlugin = { name: "map", place: mapLayout };
