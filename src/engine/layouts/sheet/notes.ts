// eng-lanes2: a step's notes and footnotes on the stage of a wrap scene, as the old stage drew them
// (core/stage.ts stepBand): a note is a strip (its title, then its lines), a footnote a small line under it. Each step's
// strip sits right under the last block that shows something in that step, so a note shares its place with a block
// that is hidden in that step (example-layers 10: the step 1 note where the step 2 grid comes).
import { LINE_H, shift, textLines, wrap, type Item } from "../../../core/stage-core";
import type { Model } from "../../types";

const TONE_INK: Record<string, string> = { good: "good:ink", bad: "bad:ink", warn: "warn:ink", accent: "acc:ink", acc: "acc:ink" };

/** does this scene's layout draw its steps' notes itself? only when nothing else the renderer draws as words is there
 * (`words: "own"` also stops the renderer's says and line words): notes or footnotes, and no says and no relations */
export function ownsNotes(model: Model): boolean {
  if (Object.keys(model.relations).length) return false;
  let any = false;
  for (const s of model.steps) for (const f of s.facts) { if (f.k === "say") return false; if (f.k === "note" || f.k === "foot") any = true; }
  return any;
}

/** each step's band (1..n): the stage's items at y 0 (shown in that step only) and its height; null: nothing to show */
export function noteBands(model: Model, w: number): ({ items: Item[]; h: number } | null)[] {
  return model.steps.map((s, si) => {
    const k = si + 1, items: Item[] = [];
    const notes = s.facts.filter((f) => f.k === "note"), feet = s.facts.filter((f) => f.k === "foot");
    if (!notes.length && !feet.length) return null;
    let h = 0;
    for (const f of notes) {
      if (f.k !== "note") continue;
      const [t, ...ls] = f.words.split(" | "), inner = w - 28;
      const tl = wrap(t, inner, "title", 6), th = (tl.length - 1) * LINE_H.title;
      const body = textLines(14, 26 + th, inner, ls, "body", "ink");
      const hh = 34 + th + body.h;
      items.push({ k: "box", x: 0, y: h, w, h: hh, fill: "surface-2", stroke: "stg-note-line", r: 10, cls: "stg-note-strip" } as Item,
        ...tl.map((q, i) => ({ k: "text", x: 14, y: h + 20 + i * LINE_H.title, s: q, f: "title", ink: "ink" }) as Item), ...shift(body.items, 0, h));
      h += hh + 8;
    }
    for (const f of feet) {
      if (f.k !== "foot") continue;
      const ink = f.tone ? TONE_INK[f.tone] ?? (model.roles[f.tone] ? `role:${f.tone}:ink` : "muted") : "muted";
      const t = textLines(0, h, w, [f.words], "sub", ink as never); items.push(...t.items); h += t.h;
    }
    if (feet.length) h += 4;
    return { items: items.map((it) => ({ ...it, on: [k] }) as Item), h };
  });
}
