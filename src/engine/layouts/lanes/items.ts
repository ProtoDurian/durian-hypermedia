// Lanes: the stage's drawing items at one step, as primitives with keys that stay the same from step to step.
import type { Item } from "../../../core/stage-core";
import type { Prim, Rect } from "../../types";
import { edgeOf, fillOf, inkOf, splitPaint } from "./paint";
import { itemToPrim } from "../time/prims"; // eng-polish

export const shownAt = (it: Item, k: number): boolean => (it.on ? it.on.includes(k) : k >= (it.from ?? 1) && (!it.to || k <= it.to));

const f1 = (n: number) => Math.round(n * 10) / 10;
/** an SVG path through the points (the stage's own curves: "h" and "v" leave sideways / up-down, "round" corners, "line") */
export function pathD(pts: [number, number][], curve?: string): string {
  if (pts.length < 2) return "";
  if (curve === "line") return pts.map(([x, y], i) => `${i ? "L" : "M"}${f1(x)} ${f1(y)}`).join("");
  if (curve === "round") {
    let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const [px, py] = pts[i - 1], [x, y] = pts[i], [nx, ny] = pts[i + 1];
      const r = Math.min(8, Math.hypot(x - px, y - py) / 2, Math.hypot(nx - x, ny - y) / 2);
      d += `L${f1(x - Math.sign(x - px) * r)} ${f1(y - Math.sign(y - py) * r)}Q${f1(x)} ${f1(y)} ${f1(x + Math.sign(nx - x) * r)} ${f1(y + Math.sign(ny - y) * r)}`;
    }
    return d + `L${f1(pts.at(-1)![0])} ${f1(pts.at(-1)![1])}`;
  }
  const seg = (a: [number, number], b: [number, number]) => {
    if (curve === "v") { const my = (a[1] + b[1]) / 2; return `C${f1(a[0])} ${f1(my)} ${f1(b[0])} ${f1(my)} ${f1(b[0])} ${f1(b[1])}`; }
    const mx = (a[0] + b[0]) / 2; return `C${f1(mx)} ${f1(a[1])} ${f1(mx)} ${f1(b[1])} ${f1(b[0])} ${f1(b[1])}`;
  };
  let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
  if (pts.length === 2) return d + seg(pts[0], pts[1]);
  d += seg(pts[0], pts[1]);
  for (let i = 2; i < pts.length - 1; i++) d += `L${f1(pts[i][0])} ${f1(pts[i][1])}`;
  return d + seg(pts.at(-2)!, pts.at(-1)!);
}
/** the arrowhead's three points as a closed path (the stage draws it as a small triangle along the last stretch) */
export function headD(pts: [number, number][], curve?: string, size = 10): string {
  const [bx, by] = pts.at(-1)!, [ax, ay] = pts.at(-2)!;
  let dx = bx - ax, dy = by - ay;
  if (curve === "h" || (curve !== "v" && curve !== "round" && curve !== "line" && pts.length === 2)) { dx = Math.sign(dx) || 1; dy = 0; }
  else if (curve === "v") { dx = 0; dy = Math.sign(dy) || 1; }
  const L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, q = 0.6;
  return `M${f1(bx)} ${f1(by)}L${f1(bx - ux * size - uy * size * q)} ${f1(by - uy * size + ux * size * q)}L${f1(bx - ux * size + uy * size * q)} ${f1(by - uy * size - ux * size * q)}Z`;
}

/** eng-polish: the time block's own drawing (its row frames, bars, cells, dots, ruler marks): flat shapes with the stage's paints, not cards (a card is round, outlined and lit) */
const TIME_SHAPE = /(^|\s)(stg-time-|stg-seg|stg-span-bar|stg-ruler-dot)/;
export const idOfBox = (id: string | undefined): string | undefined => (id && id.startsWith("badge:") ? id.slice(6) : id);

/** a path item that is a connector between two things (not a cut mark, a key or a bar's rule) */
const PLAIN_FILL = new Set(["surface", "surface-2"]), PLAIN_EDGE = new Set(["line", "line-2"]);
export const isWire = (it: Extract<Item, { k: "path" }>): boolean => !!it.id && it.id.includes(">") && !it.ink.startsWith("bad:") && it.pts.length >= 2;

const tokens = (...t: (string | false | undefined | null)[]) => t.filter(Boolean).join(" ") || undefined;

/** one item at step k (already known to be shown) as primitives; `i` is its place in the plan: its key */
export function itemPrims(it: Item, i: number, k: number): Prim[] {
  const hot = !!it.hot?.includes(k), dim = !!it.dim?.includes(k);
  const state = tokens(hot && "stg-hot", dim && "stg-dim");
  switch (it.k) {
    case "box": {
      const fill = splitPaint(it.fill), stroke = splitPaint(it.stroke);
      const role = it.role ?? fill.role ?? stroke.role;
      const tone = fill.tone ?? stroke.tone;
      const key = it.id ? `box:${it.id}:${i}` : `i${i}`;
      if ((it.cls && TIME_SHAPE.test(it.cls)) || (it.id ?? "").startsWith("time-")) { const p = itemToPrim(it, i, k, { hot, dim }); return p ? (Array.isArray(p) ? p : [p]) : []; } // eng-polish: drawn as the timeline layout draws them (layouts/time/prims.ts)
      const cls = tokens(it.cls, state, it.thick && "stg-thick", tone && `tone-${tone}`);
      if (it.cls === "stg-cross" || it.cls === "stg-cross-corner") {
        const x0 = it.cls === "stg-cross" ? it.x : it.x + 4, y0 = it.cls === "stg-cross" ? it.y : it.y + 4, x1 = it.cls === "stg-cross" ? it.x + it.w : it.x + it.w - 4, y1 = it.cls === "stg-cross" ? it.y + it.h : it.y + it.h - 4;
        return [{ k: "path", key, d: `M${x0} ${y0}L${x1} ${y1}M${x1} ${y0}L${x0} ${y1}`, role: stroke.role, width: "line", cls }];
      }
      if (it.cls === "scn-shape" || (it.id && !it.id.startsWith("badge:") && it.cls !== "stg-region")) {
        return [{ k: "box", key, id: idOfBox(it.id), shape: "box", rect: { x: it.x, y: it.y, w: Math.max(0, it.w), h: Math.max(0, it.h) }, role, tone, dim, dashed: !!it.dash, lit: hot, cls }];
      }
      // a plain paint the Prim cannot name (a panel's white, its line-2 border) rides as the timeline's exact-paint class
      // (time.css pf-<fill> ps-<stroke> on stg-box), at full opacity
      const pf = PLAIN_FILL.has(fill.base) ? `pf-${fill.base}` : null, ps = PLAIN_EDGE.has(stroke.base) ? `ps-${stroke.base}` : null;
      return [{ k: "rect", key, rect: { x: it.x, y: it.y, w: Math.max(0, it.w), h: Math.max(0, it.h) }, fill: pf ? "band" : fillOf(it.fill), role, tone, edge: ps ? "line" : edgeOf(it.stroke), r: it.r,
        cls: tokens(cls, it.dash && "stg-dash", hot && "stg-w-hot", (pf || ps) && "stg-box", pf, ps) }]; // a lit frame or chip: the stage's thick lit border (blocks.css stg-w-hot)
    }
    case "text": {
      const ink = splitPaint(it.ink);
      const lines = it.breaks?.length ? [0, ...it.breaks, it.s.length].slice(0, -1).map((a, j, all) => it.s.slice(a, j + 1 < all.length ? all[j + 1] : it.s.length).trim()).filter(Boolean) : [it.s];
      return [{ k: "text", key: `i${i}`, x: it.x, y: it.y, lines, font: it.f, anchor: it.anchor ?? "start", ink: inkOf(it.ink), role: ink.role, tone: ink.tone, cls: tokens(state, it.strike && "stg-struck", it.halo && "stg-halo", it.rotate === 90 && "stg-rot90", !!it.size && `stg-size-${it.size}`, ink.base === "ink-2" && "stg-ink-2", !!it.breaks?.length && `stg-pitch-${it.pitch ?? 16}`) }];
    }
    case "path": {
      if (it.pts.length < 2) return [];
      const ink = splitPaint(it.ink);
      return [{ k: "path", key: `i${i}`, id: it.id, d: pathD(it.pts, it.curve), role: ink.role, dashed: !!it.dash, arrow: it.arrow ? "end" : null, width: hot ? "hot" : (it.w ?? 2) <= 1 ? "thin" : "line", cls: tokens(it.cls, state, it.dot && "stg-dotted", ink.tone && `tone-${ink.tone}`, /^(line|line-2|muted|none)$/.test(ink.base) && `pi-${ink.base}`) }]; // eng-polish: a rule in the stage's quiet line colour (the time block's row rule) keeps it: time.css pi-<ink>
    }
    case "badge":
      return [
        { k: "rect", key: `i${i}`, rect: { x: it.x, y: it.y, w: 17, h: 17 }, fill: "role", role: it.role, edge: "role", r: 4, cls: tokens("stg-box stg-badge pf-line", state) },
        { k: "text", key: `i${i}t`, x: it.x + 8.5, y: it.y + 12.5, lines: [it.s], font: "small-b", anchor: "middle", ink: "ink", cls: tokens("stg-badge-t pi-surface", state) },
      ];
    case "tri": {
      const ink = splitPaint(it.ink);
      return [{ k: "path", key: `i${i}`, d: `M${it.x - 1} ${it.y - 5}L${it.x + 7} ${it.y}L${it.x - 1} ${it.y + 5}Z`, role: ink.role, width: "thin", cls: tokens("stg-tri", state) }];
    }
  }
}
export type { Rect };

/** A state chip (a card's `tag`) replaces the one before it (DESIGN 2.1: `is` sets the state, it never stacks). The stage
 * draws each tag from its step to the end in the same place, so two of them would sit one over the other: a chip ends
 * where a later chip in the same place begins. Edge-word chips (they carry `edge-label`) are not state chips. */
export function replaceTags(items: Item[]): Item[] {
  const out = items.slice();
  const chips: { i: number; from: number; y: number; cx: number }[] = [];
  items.forEach((it, i) => {
    if (it.k !== "box" || it.cls !== "stg-chip" || it.bar?.kind !== "chip" || it.bar["edge-label"] !== undefined || it.on) return;
    const t = items[i + 1]; if (!t || t.k !== "text" || t.f !== "chip") return;
    chips.push({ i, from: it.from ?? 1, y: Math.round(it.y), cx: it.x + it.w / 2 });
  });
  const byY = new Map<number, typeof chips>();
  for (const c of chips) { const a = byY.get(c.y) ?? []; a.push(c); byY.set(c.y, a); }
  for (const group of byY.values()) {
    group.sort((a, b) => a.from - b.from);
    for (let n = 0; n + 1 < group.length; n++) {
      const a = group[n], b = group[n + 1];
      if (Math.abs(a.cx - b.cx) > 8 || a.from === b.from) continue;
      for (const i of [a.i, a.i + 1]) { const it = out[i] as Item & { to?: number }; if (!it.to || it.to >= b.from) out[i] = { ...it, to: b.from - 1 } as Item; }
    }
  }
  return out;
}
