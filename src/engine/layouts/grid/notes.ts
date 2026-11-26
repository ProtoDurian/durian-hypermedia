// Grid layout: the band under a step's panels that holds the step's notes, formula and foot lines (the stage's `stepBand`,
// src/core/stage.ts, copied in size and look). The grid layout says `words: "own"`, so it draws these itself and reserves their room.
import { LINE_H, measure, shift, textLines, wrap, type Item } from "../../../core/stage-core";
import type { Step } from "../../types";

export type Band = { notes: string[][]; formula: string[]; foot: { t: string; ink?: string }[] };
export const emptyBand = (b: Band) => !b.notes.length && !b.formula.length && !b.foot.length;

/** a step's note, foot and formula facts as the stage held them (`note: Title | line | line`, `= f | line`, `foot (tone): words`) */
export function bandOf(s: Step): Band {
  const b: Band = { notes: [], formula: [], foot: [] };
  for (const f of s.facts) {
    if (f.k === "note") b.notes.push(f.words.split(" | ").map((x) => x.trim()));
    else if (f.k === "foot") b.foot.push({ t: f.words, ...(f.tone ? { ink: f.tone.includes(":") ? f.tone : `${f.tone === "accent" ? "acc" : f.tone}:ink` } : {}) });
    else if (f.k === "layout" && f.word === "=") b.formula.push(...f.arg.split(" | ").map((x) => x.trim()).filter(Boolean));
  }
  return b;
}

/** the band's items at the origin, in width w, and its height */
export function layoutBand(s: Band, w: number): { h: number; items: Item[] } {
  const items: Item[] = []; let h = 0;
  for (const note of s.notes) {
    const [t, ...ls] = note, inner = w - 28;
    const tl = wrap(t, inner, "title", 6), th = (tl.length - 1) * LINE_H.title;
    const body = textLines(14, 26 + th, inner, ls, "body", "ink");
    const hh = 34 + th + body.h;
    items.push({ k: "box", x: 0, y: h, w, h: hh, fill: "surface-2", stroke: "stg-note-line", r: 10, cls: "stg-note-strip" }, ...tl.map((q, i) => ({ k: "text", x: 14, y: h + 20 + i * LINE_H.title, s: q, f: "title", ink: "ink", tip: tl.length > 1 ? t : undefined }) as Item), ...shift(body.items, 0, h));
    h += hh + 8;
  }
  if (s.formula.length) {
    const [f0, ...rest] = s.formula, fw = Math.min(w, Math.max(measure(f0, "big"), ...rest.map((x) => measure(x, "body"))) + 32);
    const lines0 = wrap(f0, fw - 32, "big", 3), body = textLines(16, 14 + lines0.length * LINE_H.big, fw - 32, rest, "body", "ink-2");
    const hh = 20 + lines0.length * LINE_H.big + body.h;
    items.push({ k: "box", x: 0, y: h, w: fw, h: hh, fill: "good:soft", stroke: "good:line", r: 10, thick: true });
    lines0.forEach((l, i) => items.push({ k: "text", x: 16, y: h + 8 + (i + 1) * LINE_H.big - 6, s: l, f: "big", ink: "good:ink" }));
    items.push(...shift(body.items, 0, h + 4));
    h += hh + 8;
  }
  s.foot.forEach((f) => { const t = textLines(0, h, w, [f.t], "sub", f.ink ?? "muted"); items.push(...t.items); h += t.h; });
  if (s.foot.length) h += 4;
  return { h, items };
}
