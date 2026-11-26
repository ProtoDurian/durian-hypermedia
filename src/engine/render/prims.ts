// Lane prims: how a plain thing is drawn (card, shape, token, ref, state chip, values, a crossed-out thing) as primitives,
// in the look's tokens (thin borders, soft fills; the card rules of core/stage-cards.ts drawCard, the shapes of
// ui/anim.tsx Shape). The words are fitted to the rect the layout gave (render/prims/fit.ts); nothing is drawn outside it.
//
// Conventions every lane that makes primitives shares (the renderer, svg.tsx, draws them this way):
// - `text`: (x, y) is the baseline of the first line; each next line is LINE_H[font] lower (core/stage-core.ts).
// - `chip`: (x, y) is its top-left corner; it is CHIP_H tall and chipW(words) wide.
// - `box`: the shape fills its rect (a circle is the largest circle in it, centred; a person's icon sits at its top).
// - keys: `t:<id>` the thing's shape, `t:<id>:title`, `t:<id>:lines`, `t:<id>:is` its state chip, `t:<id>:vals`, `t:<id>:x` its
//   cross when it is down. The renderer tweens primitives with the same key between steps and fades the rest in or out.
// - a thing that is dimmed puts `eng-dim` on every primitive it draws (the box also carries `dim`).
import type { Look, Prim, Rect, Thing, ThingState } from "../types";
import { LINE_H, measure, wrap, type Font } from "../../core/stage-core";
import { atSizes } from "./font";
import { ellipsis, fitWords, TITLE_GAP, wrapWords } from "./prims/fit";

/** a chip's height and side padding (a state chip, a token) */
export const CHIP_H = 18;
export const CHIP_PX = 7;
export const chipW = (words: string) => Math.ceil(measure(words, "chip")) + 2 * CHIP_PX;
/** a card's padding, as the stage's (core/stage-cards.ts CARD_PX, CARD_PT): tighter on a phone */
export const cardPad = (phone: boolean) => ({ px: phone ? 7 : 11, pt: phone ? 7 : 10 });
/** a person's icon height */
export const PERSON_ICON = 22;
/** a ref's label and arrow above what it points at */
export const REF_H = 26;
/** containers whose layout draws their heading (and their cells) itself */
const OWN_HEADING = new Set(["array", "list", "stack", "queue", "map", "tree"]);
/** a key a step set (`set id down=yes level=3 fill=none`), else the one the thing was declared with */
type Keyed = ThingState & { keys?: Record<string, string> };
const keyOf = (t: Thing, s: Keyed, k: string): string | undefined => s.keys?.[k] ?? t.keys[k];
/** a meter's track height and the room a thing keeps for it under its words (core/scene.ts METER_H, METER_ROOM) */
const METER_H = 7, METER_ROOM = 12;

/** the size a thing needs to draw its words whole at one width (a layout may give more): for layouts that size cards
 * with the renderer's own rules. `states` is every step's state of the thing (its chip and replaced lines count). */
export function thingNeed(t: Thing, states: ThingState[], phone: boolean, maxW = phone ? 220 : 260): { w: number; h: number } {
  return atSizes(phone, () => needAt(t, states, phone, maxW));
}
function needAt(t: Thing, states: ThingState[], phone: boolean, maxW: number): { w: number; h: number } {
  const { px, pt } = cardPad(phone);
  const lineSets = [t.lines, ...states.map((s) => s.text).filter((x): x is string[] => !!x)];
  const widest = Math.max(measure(t.title, "title"), ...lineSets.flat().map((l) => measure(l, "sub")), 0);
  const w = Math.min(maxW, Math.max(t.shape === "circle" ? 44 : 60, Math.ceil(widest) + 2 * px + 2));
  if (t.shape === "token") return { w: chipW(t.title || t.id), h: CHIP_H };
  if (t.shape === "dot") return { w: Math.max(24, Math.ceil(measure(t.title, "sub")) + 4), h: 34 };
  const inner = w - 2 * px;
  const titleN = t.title ? wrapWords(t.title, inner, "title", phone ? 8 : 2).length : 0;
  const linesN = Math.max(...lineSets.map((ls) => ls.flatMap((l) => wrapWords(l, inner, "sub", 8)).length), 0);
  let h = pt + titleN * LINE_H.title + linesN * LINE_H.sub + pt + 2;
  if (t.shape === "person") h += PERSON_ICON + 4;
  if (t.shape === "cylinder") h += 12;
  if (t.shape === "circle") return { w: Math.max(w, h), h: Math.max(w, h) };
  if (t.shape === "diamond") return { w: Math.round(w * 1.4), h: Math.round(h * 1.5) };
  return { w, h: Math.max(h, 36) };
}

const toneOf = (s: ThingState) => (s.tone && s.tone !== "off" ? s.tone : null);
const f = (n: number) => Math.round(n * 10) / 10;

/** the room a shape leaves for words: a rect (x, w, top, h) inside `r`, before padding */
function wordsRoom(t: Thing, r: Rect): { x: number; w: number; top: number; h: number } {
  switch (t.shape) {
    case "circle": { const d = Math.min(r.w, r.h), w = d * 0.78; return { x: r.x + r.w / 2 - w / 2, w, top: r.y + r.h / 2 - w / 2, h: w }; }
    case "diamond": { const w = r.w * 0.56, h = r.h * 0.6; return { x: r.x + (r.w - w) / 2, w, top: r.y + (r.h - h) / 2, h }; }
    case "cloud": { const w = r.w * 0.72, h = r.h * 0.6; return { x: r.x + (r.w - w) / 2, w, top: r.y + r.h * 0.3, h }; }
    case "pill": { const k = Math.min(r.h / 2, 18) * 0.3; return { x: r.x + k, w: r.w - 2 * k, top: r.y, h: r.h }; }
    case "cylinder": { const ry = Math.min(8, r.h * 0.14), top = r.y + 2 * ry; return { x: r.x, w: r.w, top, h: Math.max(8, r.y + r.h - 1 - top) }; }
    case "person": { const top = r.y + PERSON_ICON + 4; return { x: r.x, w: r.w, top, h: Math.max(8, r.y + r.h - top) }; }
    default: return { x: r.x, w: r.w, top: r.y, h: r.h };
  }
}

/** One thing at one step in `r`: its shape, its words, its state chip. Tokens and refs get the rect of what they sit at. */
export function thingPrims(t: Thing, st: ThingState, r: Rect, look: Look, phone: boolean): Prim[] {
  return atSizes(phone, () => primsAt(t, st, r, look, phone));
}
function primsAt(t: Thing, st: ThingState, r: Rect, look: Look, phone: boolean): Prim[] {
  const s = st as Keyed;
  const id = t.id, role = t.role, out: Prim[] = [];
  const down = /^(yes|true|1)$/i.test(keyOf(t, s, "down") ?? "");
  const tone = toneOf(s) ?? (down ? "bad" : null);
  const levelKey = keyOf(t, s, "level"), level = levelKey !== undefined && levelKey !== "" && Number.isFinite(Number(levelKey)) ? Math.max(0, Math.min(100, Number(levelKey))) : null;
  const fillNone = keyOf(t, s, "fill") === "none";
  const lines = s.text ?? t.lines;
  const { px, pt } = cardPad(phone);
  const dim = s.dim || down || undefined;
  const dimCls = dim ? "eng-dim" : undefined;
  const cx = r.x + r.w / 2;

  // a token: a small chip that sits on the bottom edge of what it is at (or its own rect), centred
  if (t.shape === "token") {
    const words = (s.values?.join(" ") || lines[0] || t.title || id), w = chipW(words);
    const at = !!s.at;
    const x = at ? cx - w / 2 : r.x, y = at ? r.y + r.h - 1 : r.y + (r.h - CHIP_H) / 2;
    out.push({ k: "chip", key: `t:${id}`, id, x, y, words, role, tone, cls: dim ? "eng-token eng-dim" : "eng-token" });
    return out;
  }
  // a ref: a pointer label above what it points at, with a short arrow down to it
  if (t.shape === "ref") {
    const words = ellipsis(t.title || id, Math.max(r.w, 60), "small-b"), top = s.at ? r.y - REF_H - 2 : r.y;
    out.push({ k: "text", key: `t:${id}:title`, id, x: cx, y: top + 11, lines: [words], font: "small-b", anchor: "middle", ink: role ? "role" : "ink", role, tone, cls: dim ? "eng-ref eng-dim" : "eng-ref" });
    out.push({ k: "path", key: `t:${id}`, id, d: `M${f(cx)} ${f(top + 15)}L${f(cx)} ${f(top + REF_H)}`, role, arrow: "end", width: "line", cls: dim ? "eng-ref eng-dim" : "eng-ref" });
    return out;
  }
  // a text thing: its words only, as many lines as its rect holds (the last one ends in an ellipsis)
  if (t.shape === "text") {
    const all = [t.title, ...lines].filter(Boolean).flatMap((l, i) => wrapWords(l, Math.max(20, r.w * 0.98), i ? "sub" : "body", 99));
    const n = Math.max(1, Math.floor(r.h / LINE_H.body) || 1), ls = all.slice(0, n);
    if (all.length > n) ls[n - 1] = ellipsis(all[n - 1] + " …", Math.max(20, r.w * 0.98), "body");
    const h = ls.length * LINE_H.body;
    out.push({ k: "text", key: `t:${id}:title`, id, x: cx, y: r.y + Math.max(0, (r.h - h) / 2) + LINE_H.body - 4, lines: ls, font: "body", anchor: "middle", ink: tone ? "tone" : "ink", tone, cls: dimCls });
    chipOn(out, t, s, r, null);
    return out;
  }
  // a dot: a small circle, its words under it
  if (t.shape === "dot") {
    out.push({ k: "dot", key: `t:${id}`, x: cx, y: r.y + 8, r: 6, role, tone, cls: dimCls });
    if (t.title) {
      const w = Math.max(r.w, 24), fit = fitWords(t.title, [], w + 8, Math.max(LINE_H.sub, r.h - 20), { px: 2, pt: 0 });
      if (fit.title.length) out.push({ k: "text", key: `t:${id}:title`, id, x: cx, y: r.y + 16 + LINE_H.sub - 3, lines: fit.title, font: "sub", anchor: "middle", ink: "muted", cls: dimCls });
    }
    chipOn(out, t, s, r, null);
    return out;
  }

  // the shape
  const own = t.container && !!t.layout && OWN_HEADING.has(t.layout);
  const bare = t.flags.includes("bare") || (t.container && (t.layout === "array" || t.layout === "list"));
  // fill=none: the border only (a rect with no fill; the other shapes keep their tint)
  if (fillNone && (t.shape === "box" || t.shape === "pill") && !t.container) out.push({ k: "rect", key: `t:${id}`, rect: r, fill: "none", role, tone, edge: "role", r: t.shape === "pill" ? Math.min(r.h / 2, 18) : 9, cls: dim ? "eng-dim" : undefined });
  else out.push({ k: "box", key: `t:${id}`, id, shape: t.shape, rect: r, role, tone, dim, dashed: t.flags.includes("dashed") || undefined, container: t.container || undefined, cls: bare ? "eng-bare" : undefined });
  const meter = () => {
    if (level === null) return;
    const inX = t.container ? px : Math.max(8, px - 4), w = r.w - 2 * inX, y = r.y + r.h - (t.container ? px - 2 + METER_H - 4 : METER_H + 5);
    if (w <= 4) return;
    const pill = (ww: number) => `M${f(r.x + inX + METER_H / 2)} ${f(y)}H${f(r.x + inX + ww - METER_H / 2)}A${METER_H / 2} ${METER_H / 2} 0 0 1 ${f(r.x + inX + ww - METER_H / 2)} ${f(y + METER_H)}H${f(r.x + inX + METER_H / 2)}A${METER_H / 2} ${METER_H / 2} 0 0 1 ${f(r.x + inX + METER_H / 2)} ${f(y)}Z`;
    out.push({ k: "rect", key: `t:${id}:meter`, rect: { x: r.x + inX, y, w, h: METER_H }, fill: "faint", edge: "line", r: METER_H / 2, cls: dim ? "eng-meter eng-dim" : "eng-meter" });
    const fw = Math.max(0, (w * level) / 100);
    if (fw >= METER_H) out.push({ k: "path", key: `t:${id}:meter-fill`, id, d: pill(fw), role: null, fill: "role", width: "thin", cls: dim ? "eng-meter eng-dim" : "eng-meter" });
  };
  const cross = () => {
    if (!down) return;
    const a = Math.min(6, r.w / 4), b = Math.min(6, r.h / 4);
    out.push({ k: "path", key: `t:${id}:x`, id, d: `M${f(r.x + a)} ${f(r.y + b)}L${f(r.x + r.w - a)} ${f(r.y + r.h - b)}M${f(r.x + r.w - a)} ${f(r.y + b)}L${f(r.x + a)} ${f(r.y + r.h - b)}`, role: null, width: "hot", cls: "eng-down" });
  };

  // a container: its title as a heading at its top-left (the layout leaves room there), no lines in the middle; a data
  // structure's or a tree's own layout draws its heading
  if (t.container) {
    let headRight = r.x + px, headTop = r.y;
    if (t.title && !own) {
      const head = ellipsis(t.title, Math.max(20, r.w - 8), "lane");
      headRight = r.x + px + measure(head, "lane"); headTop = r.y + pt;
      out.push({ k: "text", key: `t:${id}:title`, id, x: r.x + px, y: r.y + pt + LINE_H.lane - 5, lines: [head], font: "lane", anchor: "start", ink: role ? "role" : "ink", role, tone, cls: dimCls });
    }
    chipOn(out, t, s, r, t.title && !own ? { right: headRight, bottom: headTop + LINE_H.lane } : null);
    meter();
    cross();
    return out;
  }

  // the words: a card (stage look) reads left to right from its top-left; every other shape, and a classic look, centre them
  const room = wordsRoom(t, r);
  if (level !== null) room.h = Math.max(8, room.h - METER_ROOM);
  const card = t.shape === "box" || t.shape === "pill";
  const left = look !== "classic" && t.shape === "box";
  const values = s.values ?? t.values;
  const valsOn = !!values && values.length > 0 && !t.chart;
  const pad = t.shape === "box" ? { px, pt } : t.shape === "pill" ? { px: Math.min(px, 6), pt: Math.min(pt, 4) } : t.shape === "cylinder" ? { px: 2, pt: 0 } : { px: 2, pt: 2 };
  const valRows = valsOn ? wrap(values!.join("  "), Math.max(20, (room.w - 2 * pad.px) * 0.97), "mono", 3) : [];
  const fit = fitWords(t.title, lines, room.w, room.h - valRows.length * LINE_H.mono, pad);
  const block = fit.h + (valRows.length ? (fit.title.length || fit.sub.length ? TITLE_GAP : 0) + valRows.length * LINE_H.mono : 0);
  const top = left ? room.top + fit.pt : room.top + Math.max(fit.pt, (room.h - block) / 2);
  const x = left ? room.x + fit.px : room.x + room.w / 2, anchor = left ? "start" : "middle";
  if (fit.title.length) out.push({ k: "text", key: `t:${id}:title`, id, x, y: top + LINE_H[fit.tf] - 4, lines: fit.title, font: fit.tf, anchor, ink: "ink", cls: dimCls });
  const y2 = top + fit.title.length * LINE_H[fit.tf] + (fit.title.length && fit.sub.length ? TITLE_GAP : 0);
  if (fit.sub.length) out.push({ k: "text", key: `t:${id}:lines`, id, x, y: y2 + LINE_H[fit.sf] - 3, lines: fit.sub, font: fit.sf, anchor, ink: "muted", cls: dimCls });
  if (valRows.length) {
    const y3 = y2 + fit.sub.length * LINE_H[fit.sf] + (fit.sub.length || fit.title.length ? TITLE_GAP : 0);
    out.push({ k: "text", key: `t:${id}:vals`, id, x, y: y3 + LINE_H.mono - 3, lines: valRows, font: "mono", anchor, ink: "ink", cls: dimCls });
  }
  void card;
  // the state chip avoids the first line: it sits on the top edge unless the title reaches under it
  const firstW = fit.title.length ? Math.max(...fit.title.slice(0, 1).map((l) => measure(l, fit.tf))) : 0;
  chipOn(out, t, s, r, fit.title.length ? { right: left ? x + firstW : x + firstW / 2, bottom: top + LINE_H[fit.tf] } : null);
  meter();
  cross();
  return out;
}

/** the state chip (`is`): on the card's top edge at its right, half outside, so it never covers the title; when the title's
 * first line reaches under it, it moves up until it clears the line. It replaces the one before (one key per thing). */
function chipOn(out: Prim[], t: Thing, s: ThingState, r: Rect, words: { right: number; bottom: number } | null) {
  if (!s.is) return;
  const w = chipW(s.is), x = Math.max(r.x + 4, r.x + r.w - w - 8);
  let y = r.y - CHIP_H / 2;
  // the chip's lower edge is y + CHIP_H; the title's first line starts at its top (its glyphs reach ~LINE_H - 6 above its bottom)
  if (words && x < words.right + 3 && y + CHIP_H > words.bottom - LINE_H.title + 6) y = Math.min(y, words.bottom - LINE_H.title + 6 - CHIP_H);
  out.push({ k: "chip", key: `t:${t.id}:is`, id: t.id, x, y, words: s.is, role: t.role, tone: toneOf(s), cls: s.dim ? "eng-state eng-dim" : "eng-state" });
}

export type { Font };

/** Tokens at one thing sit side by side, not on top of each other: each token is drawn from a copy of the rect it sits at,
 * so chips on one row that overlap are laid out in a row (in frame order, 4 px apart) centred where they were. */
export function stackTokens(frame: Prim[]): Prim[] {
  const chips = frame.filter((p): p is Extract<Prim, { k: "chip" }> => p.k === "chip" && /(^|\s)eng-token(\s|$)/.test(p.cls ?? ""));
  if (chips.length < 2) return frame;
  const rows = new Map<number, typeof chips>();
  for (const c of chips) { const y = Math.round(c.y); rows.set(y, [...(rows.get(y) ?? []), c]); }
  const moved = new Map<string, number>();
  for (const row of rows.values()) {
    if (row.length < 2) continue;
    const sorted = [...row].sort((a, b) => a.x - b.x);
    let group: typeof chips = [], right = -Infinity;
    const flush = () => {
      if (group.length > 1) {
        const ws = group.map((c) => chipW(c.words)), total = ws.reduce((a, b) => a + b, 0) + 4 * (group.length - 1);
        const mid = group.reduce((a, c, i) => a + c.x + ws[i] / 2, 0) / group.length;
        let x = mid - total / 2;
        for (const [i, c] of group.entries()) { moved.set(c.key, x); x += ws[i] + 4; }
      }
      group = [];
    };
    for (const c of sorted) { if (group.length && c.x > right) flush(); group.push(c); right = Math.max(right, c.x + chipW(c.words)); }
    flush();
  }
  return moved.size ? frame.map((p) => (p.k === "chip" && moved.has(p.key) ? { ...p, x: moved.get(p.key)! } : p)) : frame;
}
