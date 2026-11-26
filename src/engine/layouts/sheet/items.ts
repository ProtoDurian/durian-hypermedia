// Lane sheet: the old stage's drawing items (src/core/stage-core.ts `Item`) as the engine's primitives (types.ts `Prim`).
// A block lays itself out once for the whole story and says, per item, in which steps it shows (`on`, or `from`..`to`),
// which steps it is lit in (`hot`) and which it is faded in (`dim`). The engine wants "the primitives of step k", with
// keys that stay the same from step to step, so a thing that does not change does not move.
import type { Item } from "../../../core/stage-core";
import { measure } from "../../../core/stage-core";
import type { Id, Prim, Rect, Tone } from "../../types";
import { itemRect, type Parts, type Vis } from "../parts";

/** a paint of the old items: "role:NAME[:part]", "good[:part]", "acc", "surface", "line-2", "muted", "none" ... */
export type Paint = { role: string | null; tone: Tone | null; part: string; plain: string | null };
const TONE_OF: Record<string, Tone> = { good: "good", bad: "bad", warn: "warn", acc: "accent", accent: "accent" };
export function paintOf(p: string | undefined): Paint {
  if (!p) return { role: null, tone: null, part: "", plain: null };
  const [a, b = "", c = ""] = p.split(":");
  if (a === "role") return { role: b, tone: null, part: c || "line", plain: null };
  if (TONE_OF[a]) return { role: null, tone: TONE_OF[a], part: b || "line", plain: null };
  return { role: null, tone: null, part: "", plain: a };
}

type When = { from?: number; to?: number; on?: number[]; hot?: number[]; dim?: number[] };
/** the steps (1..n) an item shows in */
export function stepsOf(it: When, n: number): number[] {
  if (it.on) return it.on.filter((k) => k >= 1 && k <= n);
  const out: number[] = [];
  for (let k = it.from ?? 1; k <= (it.to || n); k++) if (k >= 1 && k <= n) out.push(k);
  return out;
}

const f1 = (v: number) => Math.round(v * 10) / 10;
/** an SVG path through points, absolute commands only (the pipeline's translatePath reads M L Q Z) */
function pathD(pts: [number, number][], curve?: string): string {
  if (pts.length < 2) return "";
  if (curve === "round") {
    let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const [px, py] = pts[i - 1], [x, y] = pts[i], [nx, ny] = pts[i + 1];
      const r = Math.min(8, Math.hypot(x - px, y - py) / 2, Math.hypot(nx - x, ny - y) / 2);
      d += `L${f1(x - Math.sign(x - px) * r)} ${f1(y - Math.sign(y - py) * r)}Q${f1(x)} ${f1(y)} ${f1(x + Math.sign(nx - x) * r)} ${f1(y + Math.sign(ny - y) * r)}`;
    }
    return d + `L${f1(pts.at(-1)![0])} ${f1(pts.at(-1)![1])}`;
  }
  // the blocks of this lane draw straight stretches; other curves are drawn as right-angled polylines through their points
  return pts.map(([x, y], i) => `${i ? "L" : "M"}${f1(x)} ${f1(y)}`).join("");
}

type One = { prim: Prim; steps: Set<number>; hot: Set<number>; dim: Set<number>; vis: Vis; cover: Rect | null };
export type Drawn = {
  /** the primitives of step k (0 draws what step 1 draws: the setup is the first picture) */
  at(step: number): Prim[];
  /** a rect for every item that carries an id the model knows (a row, a group, a wrapper ...), widest wins */
  rects: Map<Id, Rect>;
  /** the whole height the items take (lowest edge) */
  bottom: number;
  /** every item's window and what it covers (blocks2: the parts of this drawing) */
  ones: { vis: Vis; rect: Rect | null }[];
};

/** Items of one block, shifted by (ox, oy), as primitives with the keys `${key}:${index}`. `known` says which item ids
 * are ids of things of the model (those primitives carry `id`). */
export function drawItems(items: Item[], key: string, ox: number, oy: number, n: number, known?: (id: string) => boolean, parts?: Parts): Drawn {
  const ones: One[] = [], rects = new Map<Id, Rect>();
  let bottom = 0;
  items.forEach((it, i) => {
    const k = `${key}:${i}`, id = "id" in it && typeof it.id === "string" && known?.(it.id) ? it.id : undefined;
    const when = { steps: new Set(stepsOf(it, n)), hot: new Set(it.hot ?? []), dim: new Set(it.dim ?? []) };
    const idp = id ? { id } : {};
    let prim: Prim | null = null;
    switch (it.k) {
      case "box": {
        const x = it.x + ox, y = it.y + oy, rect = { x, y, w: Math.max(0, it.w), h: Math.max(0, it.h) };
        const fill = paintOf(it.fill), stroke = paintOf(it.stroke), cls = ["stg-i", it.cls, it.thick ? "stg-thick" : "", fill.plain ? `fill-${fill.plain}` : "", stroke.plain ? `stroke-${stroke.plain}` : "", it.fill === "none" ? "fill-none" : "", it.dash ? "stg-dash" : ""].filter(Boolean).join(" ");
        bottom = Math.max(bottom, rect.y + rect.h);
        if (typeof it.id === "string" && known?.(it.id)) { const was = rects.get(it.id); if (!was || rect.w * rect.h > was.w * was.h) rects.set(it.id, rect); }
        if (fill.role || fill.tone) prim = { k: "box", key: k, ...idp, shape: it.r !== undefined && it.r >= it.h / 2 && it.h <= 30 ? "pill" : "box", rect, role: fill.role, tone: fill.tone, dashed: !!it.dash, cls };
        else prim = { k: "rect", key: k, rect, fill: fill.plain === "none" ? "none" : fill.plain === "surface-2" ? "band" : "soft", edge: stroke.role ? "role" : stroke.plain === "none" ? "none" : stroke.plain === "line-2" || it.dash ? "faint" : "line", role: stroke.role ?? fill.role, r: it.r, cls };
        break;
      }
      case "text": {
        const ink = paintOf(it.ink), x = it.x + ox, y = it.y + oy;
        const lines = it.breaks?.length ? ((starts) => starts.map((a, j) => it.s.slice(a, j + 1 < starts.length ? starts[j + 1] : undefined).trimEnd()))([0, ...it.breaks]) : [it.s];
        const cls = ["stg-i", it.strike ? "stg-struck" : "", it.halo ? "stg-halo" : "", it.rotate === 90 ? "stg-rot90" : ""].filter(Boolean).join(" ");
        const kind = ink.role ? "role" : ink.tone ? "tone" : ink.plain === "muted" ? "muted" : "ink";
        const w = Math.max(...lines.map((l) => measure(l, it.f)));
        bottom = Math.max(bottom, y + 4 + (lines.length - 1) * (it.pitch ?? 16));
        void w;
        prim = { k: "text", key: k, ...idp, x, y, lines, font: it.f, anchor: it.anchor ?? "start", ink: kind, role: ink.role, tone: ink.tone, cls };
        break;
      }
      case "path": {
        const ink = paintOf(it.ink), pts = it.pts.map(([x, y]) => [x + ox, y + oy] as [number, number]);
        for (const [, y] of pts) bottom = Math.max(bottom, y);
        prim = { k: "path", key: k, ...idp, d: pathD(pts, it.curve), role: ink.role ?? (ink.tone ? null : null), dashed: !!it.dash, arrow: it.arrow ? "end" : null, width: (it.w ?? 0) >= 3 ? "hot" : "line", cls: ["stg-i", it.cls, ink.tone ? `ink-${ink.tone}` : ink.plain ? `ink-${ink.plain}` : "", it.dot ? "stg-dotted" : ""].filter(Boolean).join(" ") };
        break;
      }
      case "badge": {
        bottom = Math.max(bottom, it.y + oy + 17);
        prim = { k: "chip", key: k, x: it.x + ox + 8.5, y: it.y + oy + 8.5, words: it.s, role: it.role, cls: "stg-i stg-badge" };
        break;
      }
      case "tri": {
        const ink = paintOf(it.ink), x = it.x + ox, y = it.y + oy;
        prim = { k: "path", key: k, d: `M${f1(x - 1)} ${f1(y - 5)}L${f1(x + 7)} ${f1(y)}L${f1(x - 1)} ${f1(y + 5)}Z`, role: ink.role, arrow: null, width: "thin", cls: `stg-i stg-tri ink-${ink.plain ?? ink.tone ?? "muted"}` };
        break;
      }
    }
    const r0 = itemRect(it), cover = r0 ? { ...r0, x: r0.x + ox, y: r0.y + oy } : null;
    if (prim) ones.push({ prim, ...when, vis: it as Vis, cover });
  });
  return {
    rects, bottom, ones: ones.map((o) => ({ vis: o.vis, rect: o.cover })),
    at: (step) => {
      const k = Math.max(1, step), out: Prim[] = [];
      for (const o of ones) {
        // what shows, lit or faded in this step is the Model's StepState (its part), not the block's own lists
        if (!(parts ? parts.shown(o.vis, k) : o.steps.has(k))) continue;
        const lit = parts ? parts.lit(o.vis, k) : o.hot.has(k), dim = parts ? parts.dim(o.vis, k) : o.dim.has(k);
        out.push(lit || dim ? flag(o.prim, lit, dim) : o.prim);
      }
      return out;
    },
  };
}
function flag(p: Prim, lit: boolean, dim: boolean): Prim {
  if (p.k === "box") return { ...p, lit: lit || undefined, dim: dim || undefined };
  // eng-lanes2: a lit frame (a rect) is the stage's lit box: its border width is the CSS's (stg-w-hot, blocks.css), not the renderer's 1 px
  const cls = [p.cls, lit ? "stg-hot" : "", lit && p.k === "rect" ? "stg-w-hot" : "", dim ? "stg-dim" : ""].filter(Boolean).join(" ");
  return { ...p, cls } as Prim;
}
