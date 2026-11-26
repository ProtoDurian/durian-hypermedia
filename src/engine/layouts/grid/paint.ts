// Grid layout: old stage drawing items -> the engine's primitives (Prim). The old blocks (matrix, bins, grid panels ...)
// still compute their geometry in `core/stage-*.ts`; this file only translates what they draw, keeping every measured
// place. A box keeps its corner radius as `g-r<px>`, a fill role and an edge tone stay apart (role = the fill's, tone = the edge's
// when both are given). Paint names ("role:c1:soft", "surface-2", "acc:line" ...) become a role, a tone and two classes the look
// reads: `gf-<fill>` and `ge-<edge>` (the fill kind and the edge kind of the old paint), so no colour value is here.
import type { Font, Prim, Tone } from "../../types";
import type { Item } from "../../../core/stage-core";

const TONE: Record<string, Tone> = { good: "good", bad: "bad", warn: "warn", acc: "accent", accent: "accent" };

/** a paint name's parts: the role (role:NAME:part), the tone (good/bad/warn/acc:part) and the plain part */
export function splitPaint(p: string | undefined): { role: string | null; tone: Tone | null; part: string } {
  if (!p || p === "none") return { role: null, tone: null, part: "none" };
  const a = p.split(":");
  if (a[0] === "role") return { role: a[1] ?? null, tone: null, part: a[2] ?? "line" };
  if (a[0] in TONE) return { role: null, tone: TONE[a[0]], part: a[1] ?? "line" };
  return { role: null, tone: null, part: p };
}

/** an old item's visibility in a step (stage.tsx `shown`): `on` lists steps; else from..to (to 0 = to the end) */
export const shownAt = (it: Item, k: number): boolean => (it.on ? it.on.includes(k) : k >= (it.from ?? 1) && (!it.to || k <= it.to));
/** the setup (step 0): what shows from the first step on and does not end (a step-only frame, note or panel waits for its step) */
export const shownAtSetup = (it: Item): boolean => !it.on && (it.from ?? 1) <= 1 && !it.to;

const INK: Record<string, "ink" | "muted"> = { ink: "ink", "ink-2": "muted", muted: "muted", "line-2": "muted", line: "muted" };

/** the points of an old path as an SVG path: "h"/"v" curves between two points, "round" corners, "line" straight */
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

/** One old item as primitives at step k (k 0 = the setup). `key` is stable across steps, so the renderer tweens the same item. */
export function itemPrims(it: Item, key: string, k: number, look?: { hot: boolean; dim: boolean }): Prim[] {
  const hot = look ? look.hot : !!it.hot?.includes(k), dim = look ? look.dim : !!it.dim?.includes(k); // blocks2: lit and faded as the StepState says
  const state = `${hot ? " g-hot" : ""}${dim ? " g-dim" : ""}`;
  switch (it.k) {
    case "box": {
      const f = splitPaint(it.fill), e = splitPaint(it.stroke);
      // a crossed card is drawn by the renderer from its class (two corner lines), as the old stage drew it
      const cls = `${it.cls ?? ""} gf-${f.part} ge-${e.part} g-r${Math.round(it.r ?? 8)}${it.thick ? " g-thick" : ""}${state}`.trim();
      const role = f.role ?? e.role ?? (it.role ?? null), tone = e.tone ?? f.tone;
      const frame = !!it.cls && /(^|\s)(scn-frame|stg-region|stg-band|stg-mcell|stg-note-strip)(\s|$)/.test(it.cls);
      return [{ k: "box", key, ...(it.id ? { id: it.id } : {}), shape: "box", rect: { x: it.x, y: it.y, w: Math.max(0, it.w), h: Math.max(0, it.h) }, role, tone, dim, dashed: !!it.dash, lit: !!it.thick || hot, container: frame, cls }]; // render3: a lit box is drawn lit (the stage's .stg-box.stg-hot: thick border, soft shadow); g-hot had no style, so a bin that took items in its step looked unlit
    }
    case "text": {
      const p = splitPaint(it.ink), plain = p.role === null && p.tone === null;
      const cls = `${it.strike ? "g-strike " : ""}${it.rotate === 90 ? "g-rot90 stg-rot90 " : ""}${it.halo ? "g-halo " : ""}${it.breaks?.length ? "g-lines " : ""}${state}`.trim();
      return [{ k: "text", key, x: it.x, y: it.y, lines: [it.s], font: it.f as Font, anchor: it.anchor ?? "start", ink: plain ? INK[p.part] ?? "ink" : p.role ? "role" : "tone", role: p.role, tone: p.tone, ...(cls ? { cls } : {}) }];
    }
    case "path": {
      const p = splitPaint(it.ink);
      return [{ k: "path", key, ...(it.id ? { id: it.id } : {}), d: pathD(it.pts, it.curve), role: p.role, dashed: !!it.dash, arrow: it.arrow ? "end" : null, width: it.w && it.w > 2 ? "hot" : "line", cls: `${it.dot ? "g-dotted " : ""}${it.flow !== undefined ? "g-flow " : ""}${it.cls ?? ""}${state}`.trim() }];
    }
    case "badge": return [{ k: "chip", key, x: it.x, y: it.y, words: it.s, role: it.role, cls: `g-badge${state}` }];
    case "tri": { const p = splitPaint(it.ink); return [{ k: "path", key, d: `M${it.x - 1} ${it.y - 5}L${it.x + 7} ${it.y}L${it.x - 1} ${it.y + 5}Z`, role: p.role, fill: "role", cls: `g-tri${state}` }]; }
  }
}
