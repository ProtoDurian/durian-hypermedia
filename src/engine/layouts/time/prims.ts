// The time block's drawing Items (src/core/stage-core.ts) as the engine's primitives, for one step.
// An Item names its paints as strings ("role:job:soft", "good:line", "surface-2"); a Prim has a role, a tone and a
// few fixed fills. What a Prim cannot say (a thick or dashed stroke, a struck or haloed word, a word on end, the
// block's own class names) travels in `cls`, with the stage's own class names so stage.css keeps meaning the same:
//   stg-thick stg-dash stg-struck stg-halo stg-rot90 stg-dotted stg-conn stg-hot stg-dim, and tn-<tone> for a tone paint.
// stg-ink-strong on a text: its role's line colour, not the role's ink (a word set on a filled dot).
// The exact paints stay readable as classes too: pf-<fill> ps-<stroke> pi-<ink> (":" written "_"), only where the primitive's own fields cannot say the paint (the renderer then leaves that property to time.css).
import type { Item, Paint } from "../../../core/stage-core";
import type { Font, Prim, Tone } from "../../types";

type Parsed = { kind: "none" | "role" | "tone" | "stage"; name: string; part: string };
const TONES: Record<string, Tone> = { good: "good", bad: "bad", warn: "warn", acc: "accent", accent: "accent", hot: "accent" };

export function parsePaint(p: Paint | undefined): Parsed {
  if (!p || p === "none") return { kind: "none", name: "", part: "" };
  const [a, b, c] = p.split(":");
  if (a === "role") return { kind: "role", name: b ?? "", part: c ?? "line" };
  if (TONES[a]) return { kind: "tone", name: TONES[a], part: b ?? "line" };
  return { kind: "stage", name: a, part: "" };
}
const tokenOf = (p: Paint | undefined) => (p ?? "none").replace(/[^\w-]/g, "_");

/** is this Item on screen at step k (stage rule: `on` lists steps, else from..to with to 0 = to the end) */
export const shownAt = (it: Pick<Item, "on" | "from" | "to">, k: number): boolean => (it.on ? it.on.includes(k) : k >= (it.from ?? 1) && (!it.to || k <= it.to));

/** an SVG path through the points (src/ui/stage.tsx pathD: "h" and "v" curves, "round" corners, "line" straight) */
export function pathD(pts: [number, number][], curve?: string): string {
  const f = (n: number) => Math.round(n * 10) / 10;
  if (pts.length < 2) return "";
  if (curve === "line") return pts.map(([x, y], i) => `${i ? "L" : "M"}${f(x)} ${f(y)}`).join("");
  if (curve === "round") {
    let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const [px, py] = pts[i - 1], [x, y] = pts[i], [nx, ny] = pts[i + 1];
      const r = Math.min(8, Math.hypot(x - px, y - py) / 2, Math.hypot(nx - x, ny - y) / 2);
      const ax = x - Math.sign(x - px) * r, ay = y - Math.sign(y - py) * r, bx = x + Math.sign(nx - x) * r, by = y + Math.sign(ny - y) * r;
      d += `L${f(ax)} ${f(ay)}Q${f(x)} ${f(y)} ${f(bx)} ${f(by)}`;
    }
    return d + `L${f(pts.at(-1)![0])} ${f(pts.at(-1)![1])}`;
  }
  const seg = (a: [number, number], b: [number, number]) => {
    if (curve === "v") { const my = (a[1] + b[1]) / 2; return `C${f(a[0])} ${f(my)} ${f(b[0])} ${f(my)} ${f(b[0])} ${f(b[1])}`; }
    const mx = (a[0] + b[0]) / 2; return `C${f(mx)} ${f(a[1])} ${f(mx)} ${f(b[1])} ${f(b[0])} ${f(b[1])}`;
  };
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  if (pts.length === 2) return d + seg(pts[0], pts[1]);
  d += seg(pts[0], pts[1]);
  for (let i = 2; i < pts.length - 1; i++) d += `L${f(pts[i][0])} ${f(pts[i][1])}`;
  return d + seg(pts.at(-2)!, pts.at(-1)!);
}

const join = (...c: (string | number | false | null | undefined)[]) => c.filter(Boolean).join(" ") || undefined;

/** render3: a range in brackets at a label's end, the stage's inset title `Close-up (24..36)`, is written 24–36: at the
 *  label's size the two dots read as one, a decimal 24.36 (page review) */
export const rangeWords = (s: string): string => s.replace(/\((-?\d[\d.,]*?)\.\.(-?\d[\d.,]*)\)$/, "($1–$2)");

/** lines of a one-run label with `breaks` (character offsets) */
const linesOf = (s: string, breaks?: number[]): string[] => {
  if (!breaks?.length) return [s];
  const cuts = [0, ...breaks.filter((b) => b > 0 && b < s.length), s.length];
  return cuts.slice(0, -1).map((a, i) => s.slice(a, cuts[i + 1]).trim());
};

/** hot and dim: lit and faded as the StepState says (blocks2); without them, the block's own lists for step k */
export type Look = { hot: boolean; dim: boolean };
export function itemToPrim(it: Item, i: number, k: number, look?: Look): Prim | Prim[] | null {
  const key = `time:${i}`, hot = look ? look.hot : !!it.hot?.includes(k), dim = look ? look.dim : !!it.dim?.includes(k);
  const state = join(hot && "stg-hot", dim && "stg-dim");
  switch (it.k) {
    case "box": {
      const fill = parsePaint(it.fill), edge = parsePaint(it.stroke);
      const role = fill.kind === "role" ? fill.name : edge.kind === "role" ? edge.name : it.role ?? null;
      const muted = fill.name === "muted" || edge.name === "muted"; // the muted ink as a fill (a dot) or an edge: a tone of its own
      const tone = fill.kind === "tone" ? fill.name : edge.kind === "tone" ? edge.name : muted ? "muted" : null;
      // the renderer drops its own fill, stroke, width and dash for a primitive that carries pf-, ps-, pi-, stg-w- or stg-dotted
      // classes and leaves that property to time.css: so a class goes only on a paint the renderer cannot say from role, tone, fill and edge
      // a fill in the role's or tone's strong line colour (a dot, a badge): the renderer's "role" fill is the pale plane, so the edge says the colour (edge role: --es) and pf-line copies it to the fill
      const solid = (fill.kind === "role" || fill.kind === "tone") && fill.part === "line";
      const pf = solid ? "pf-line" : (fill.kind === "stage" && (fill.name === "muted" || fill.name === "surface")) ? `pf-${tokenOf(it.fill)}` : undefined;
      const ps = (edge.kind === "stage" && edge.name !== "line") || edge.kind === "tone" ? `ps-${tokenOf(it.stroke)}` : undefined;
      const fillKind: "soft" | "band" | "faint" | "none" | "role" = fill.kind === "none" ? "none"
        : fill.kind === "stage" ? (fill.name === "muted" ? "role" : fill.name === "surface-2" ? "band" : "faint")
        : fill.part === "soft" ? "soft" : "role";
      const edgeKind: "line" | "faint" | "role" | "none" = solid ? "role" : edge.kind === "none" ? "none"
        : edge.kind === "stage" ? (edge.name === "muted" ? "role" : "line") : "role";
      return {
        k: "rect", key, rect: { x: it.x, y: it.y, w: Math.max(0, it.w), h: Math.max(0, it.h) }, fill: fillKind, edge: edgeKind, r: it.r ?? 8, role, tone: tone && tone !== "muted" ? (tone as Tone) : null,
        cls: join("stg-box", it.cls?.replace(/\bscn-(shape|frame)\b\s*/g, "").trim(), it.thick && "stg-thick", it.dash && "stg-dash", tone && `tn-${tone}`, pf, ps, state),
      };
    }
    case "text": {
      const ink = parsePaint(it.ink);
      const pi = ink.kind === "stage" && ink.name !== "ink" && ink.name !== "muted" ? `pi-${tokenOf(it.ink)}` : undefined;
      const kind: "ink" | "muted" | "role" | "tone" = ink.kind === "role" ? "role" : ink.kind === "tone" ? "tone" : ink.name === "muted" ? "muted" : "ink";
      return {
        k: "text", key, x: it.x, y: it.y, lines: linesOf(rangeWords(it.s), it.breaks), font: it.f as Font, anchor: it.anchor ?? "start", ink: kind,
        role: ink.kind === "role" ? ink.name : null, tone: ink.kind === "tone" ? (ink.name as Tone) : null,
        cls: join("stg-t", ink.kind === "role" && ink.part === "line" && "stg-ink-strong", it.strike && "stg-struck", it.halo && "stg-halo", it.rotate === 90 && "stg-rot90", it.size && `stg-size-${it.size}`, it.pitch && `stg-pitch-${it.pitch}`, pi, state),
      };
    }
    case "path": {
      const ink = parsePaint(it.ink), w = it.w ?? 1.6;
      return {
        k: "path", key, id: it.id, d: pathD(it.pts, it.curve), role: ink.kind === "role" ? ink.name : null, dashed: !!it.dash,
        arrow: it.arrow ? "end" : null, width: w < 1.3 ? "thin" : w <= 1.8 ? "line" : "hot",
        cls: join("stg-edge", it.cls, it.dot && "stg-dotted", it.flow !== undefined && "stg-conn", ink.kind === "tone" && `tn-${ink.name}`, it.w && `stg-w-${it.w}`, ink.kind !== "role" && `pi-${tokenOf(it.ink)}`, state),
      };
    }
    case "badge": // a small square in the role's line colour (pf-line) with its letter in the surface colour (stage.css .stg-badge)
      return [
        { k: "rect", key, rect: { x: it.x, y: it.y, w: 17, h: 17 }, fill: "role", edge: "role", r: 4, role: it.role, cls: join("stg-box", "stg-badge", "pf-line", state) },
        { k: "text", key: key + ":t", x: it.x + 8.5, y: it.y + 12.5, lines: [it.s], font: "small-b", anchor: "middle", ink: "ink", cls: join("stg-t", "stg-badge-t", "pi-surface", state) },
      ];
    case "tri": {
      const ink = parsePaint(it.ink);
      return { k: "path", key, d: `M${it.x - 1} ${it.y - 5}l8 5-8 5z`, role: ink.kind === "role" ? ink.name : null, cls: join("stg-tri", ink.kind === "tone" && `tn-${ink.name}`, state) };
    }
  }
}

/** what decides whether an item shows at a step, and whether it is lit or faded: the Model's StepState (layouts/parts.ts `Parts`) */
export type View = { shown(it: Item, step: number): boolean; hot(it: Item, step: number): boolean; dim(it: Item, step: number): boolean };
/** every primitive on screen at step k (a step 0 draws as step 1: the stage's first view); `view` says what shows (default: the block's own windows) */
export function primsAt(items: Item[], step: number, view?: View): Prim[] {
  const k = Math.max(1, step), out: Prim[] = [];
  items.forEach((it, i) => {
    if (!(view ? view.shown(it, k) : shownAt(it, k))) return;
    const p = itemToPrim(it, i, k, view ? { hot: view.hot(it, k), dim: view.dim(it, k) } : undefined);
    if (p) out.push(...(Array.isArray(p) ? p : [p]));
  });
  return out;
}
