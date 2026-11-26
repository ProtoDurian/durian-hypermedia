// treemap as primitives (lane chwire, sub-lane B). Contract: ./common.ts KindImpl.
// One `rect` per block, keyed `tile:<node id>`, so a zoom (click a branch) glides the blocks that stay and the page sees the
// rest enter and leave. Words are `text` prims keyed `tile:<id>:n` (name) and `tile:<id>:v` (value). Blocks too small for
// words are drawn but have no mark. The tree layout (squarified, run again at each zoom) is layout.ts's, paid from a budget
// of this kind's own, never the page's.
//
// Exports besides the kind, for the page (shared by treemap and sunburst):
//   crumbs(view, zoom)  the path from the whole to the open node, for the breadcrumb the page draws
//   treeHint(view)     the hint line under the chart
//   toneProps(tone)     a View's tone word as the role / tone / class of a primitive
import type { Font, Prim, Rect, Tone } from "../../types";
import { Budget, partLimitsOf } from "../../../core/budget";
import { fmtValue } from "../../../parts/chart-kinds/fmt";
import { treemapLayout, type Rect as TRect, type TNode } from "../../../parts/chart-kinds/layout";
import { pct, type View } from "../../../parts/chart-kinds/compute";
import type { KBuilt, KCtx, KindImpl, KMark } from "./common";

export type TreeView = Extract<View, { kind: "treemap" | "sunburst" }>;
const TAP_HINT = "Click or tap a block with a path to open it; the path above takes you back.";
const RING_HINT = "Click or tap a ring to open it; the centre or the path above takes you back.";
export const ROOT_NAME = "All";
export const TREE_HEIGHT = 420;

/** the path from the whole (id 0) to the open node, each with the name the breadcrumb shows */
export function crumbs(v: View, zoom: number): { id: number; name: string }[] {
  if (v.kind !== "treemap" && v.kind !== "sunburst") return [];
  const out: { id: number; name: string }[] = [];
  const at = v.nodes[zoom] ? zoom : 0;
  for (let i = at; i >= 0; i = v.nodes[i].parent) out.unshift({ id: i, name: i === 0 ? ROOT_NAME : v.nodes[i].name });
  return out;
}
export const treeHint = (v: View): string => (v.kind === "sunburst" ? RING_HINT : TAP_HINT);

/** a View's tone word (c1..c8, acc, good, warn, bad, muted) as the role, tone and class a primitive takes */
export function toneProps(t: string): { role: string | null; tone: Tone | null; cls: string } {
  const role = /^c[1-8]$/.test(t) ? t : null;
  const tone: Tone | null = t === "acc" ? "accent" : t === "good" || t === "warn" || t === "bad" ? t : null;
  return { role, tone, cls: `kd-t-${t || "acc"}` };
}
/** the number as the chart's own words show it (the popover keeps the full form) */
export const fmtOf = (v: { fmt: { format: string; currency?: string } }, compact = false) => (x: number): string => fmtValue(x, v.fmt.format, v.fmt.currency, compact, compact);
/** the card of a node (the old popover's words, exactly) */
export function nodeData(nodes: TNode[], id: number, f: (x: number) => string, whole: TNode): { title: string; meta: string; text?: string } {
  const n = nodes[id], par = n.parent >= 0 ? nodes[n.parent] : null;
  return {
    title: n.name,
    meta: `${f(n.value)} · ${pct(n.value / (whole.value || 1))} of ${id === 0 ? "all" : whole.id === 0 ? "the whole" : whole.name}`,
    text: `${par && par.id !== 0 ? `In ${par.path}. ` : ""}${par && par.id !== whole.id ? `${pct(n.value / (par.value || 1))} of ${par.name}. ` : ""}${n.children.length ? `${n.children.length} inside; click to open.` : ""}`.trim() || undefined,
  };
}
/** the layouts that run again at a zoom pay from a budget of this part's own, never the page's */
export const layoutBudget = (): Budget => new Budget(partLimitsOf(), null, null, "the chart-kinds part");
/** the text cut with "…" so it is at most `w` px wide; "" when not even two letters fit */
export function cut(measure: (s: string, f: Font) => number, s: string, w: number, font: Font): string {
  if (measure(s, font) <= w) return s;
  let t = s;
  while (t.length > 1 && measure(t + "…", font) > w) t = t.slice(0, -1);
  return t.length >= 3 ? t + "…" : "";
}
export const rectIn = (r: Rect, o: Rect): Rect => ({ x: r.x + o.x, y: r.y + o.y, w: r.w, h: r.h });
const f1 = (n: number): number => Math.round(n * 100) / 100;

const PAD = 7, GAP = 2;
/** the blocks of the open node: depth by depth, a block's words after its own rect and before the next level (so a branch's
 *  words sit under its children, as in the old part) */
function blocks(v: TreeView, root: number, w: number, h: number): TRect[] {
  let rects: TRect[] = [];
  try { rects = treemapLayout(v.nodes, root, w, h, v.depth, layoutBudget()); } catch { rects = []; }
  return rects.slice().sort((a, b) => a.depth - b.depth || a.id - b.id);
}

export const treemap: KindImpl = {
  kind: "treemap",
  height: () => TREE_HEIGHT,
  build(v, rect, ctx: KCtx): KBuilt {
    if (v.kind !== "treemap") throw new Error("treemap: not a treemap view");
    const root = v.nodes[ctx.zoom ?? 0] ? ctx.zoom ?? 0 : 0;
    const f = fmtOf(v), fc = fmtOf(v, ctx.phone);
    const whole = v.nodes[root];
    const rs = blocks(v, root, rect.w, rect.h);
    const covered = new Set(rs.map((r) => v.nodes[r.id].parent)); // a block with children drawn: they cover its own corner
    const prims: Prim[] = [], marks: KMark[] = [];
    for (const r of rs) {
      const n = v.nodes[r.id], branch = n.children.length > 0, tiny = r.w < 24 || r.h < 24;
      const t = toneProps(n.tone), gx = Math.min(GAP, r.w / 4), gy = Math.min(GAP, r.h / 4);
      const x = f1(rect.x + r.x), y = f1(rect.y + r.y);
      prims.push({ k: "rect", key: `tile:${r.id}`, rect: { x: f1(x + gx), y: f1(y + gy), w: f1(Math.max(0, r.w - 2 * gx)), h: f1(Math.max(0, r.h - 2 * gy)) }, fill: "role", role: t.role, tone: t.tone, edge: "none", r: 6,
        cls: `kd-tile ${t.cls} kd-l${Math.min(5, r.depth)}${r.header ? " kd-head" : ""}${branch ? " kd-branch" : ""}${tiny ? " kd-tiny" : ""}` });
      if (tiny) continue;
      const label = (key: string, text: string, tx: number, ty: number, anchor: "start" | "end", font: Font, bold: boolean, ink: "ink" | "muted") =>
        prims.push({ k: "text", key: `tile:${r.id}:${key}`, x: f1(tx), y: f1(ty), lines: [text], font, anchor, ink, cls: bold ? "kd-tn" : "kd-tv" });
      if (r.header && r.w >= 52) {
        const vt = r.w >= 120 ? fc(n.value) : "", vw = vt ? ctx.measure(vt, "sub") + 8 : 0;
        const name = cut(ctx.measure, n.name, r.w - 2 * PAD - vw, "small-b");
        if (name) label("n", name, x + PAD, y + 18, "start", "small-b", true, "ink");
        if (vt && name) label("v", vt, x + r.w - PAD, y + 18, "end", "sub", false, "muted");
      } else if (r.w >= 52 && r.h >= 30 && !(covered.has(r.id) && branch)) {
        const name = cut(ctx.measure, n.name, r.w - 2 * PAD, "small-b");
        if (name) label("n", name, x + PAD, y + 17, "start", "small-b", true, "ink");
        if (name && !r.header && r.h >= 48) { const vt = fc(n.value); if (ctx.measure(vt, "sub") <= r.w - 2 * PAD) label("v", vt, x + PAD, y + 34, "start", "sub", false, "muted"); }
      }
      const d = nodeData(v.nodes, r.id, f, whole);
      marks.push({ key: `tile:${r.id}`, kind: "tile", rect: { x, y, w: f1(r.w), h: f1(r.h) }, title: d.title, meta: d.meta, text: d.text, zoom: branch ? r.id : undefined });
    }
    marks.sort((a, b) => Number(a.key.slice(5)) - Number(b.key.slice(5)));
    return { prims, marks };
  },
};
