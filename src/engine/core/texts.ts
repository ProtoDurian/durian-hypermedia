// Lane core2: the words a person reads in a model, in story order (the translation texts of a block, `block.texts`):
// the title and note, region and thing titles and lines, a line's setup label, then per step its title and caption and
// the words its facts say (a line's words, `say`, `note`, `foot`, `text`, `is`, `light ...: note`). A scene inside the
// story follows the overview's own words.
import type { Fact, Model } from "../types";

function factTexts(f: Fact): string[] {
  switch (f.k) {
    case "rel": return f.words ? [f.words] : [];
    case "say": return [f.words];
    case "note": case "foot": return [f.words];
    case "text": return [...f.lines];
    case "is": return f.words ? [f.words] : [];
    case "light": return f.note ? [f.note] : [];
    case "split": return f.labels.filter(Boolean);
    default: return [];
  }
}

export function modelTexts(model: Model): string[] {
  const out: string[] = [];
  const add = (...xs: (string | null | undefined)[]) => { for (const x of xs) if (x && x.trim()) out.push(x); };
  add(model.title, model.note);
  for (const r of model.regions) add(r.title);
  for (const id of model.order) { const t = model.things[id]; if (t.flags.includes("part")) continue; /* a head-block layout's own part, not a thing the author wrote */ if (t.title !== t.id || !t.layout) add(t.title); add(...t.lines); if (t.chart) add(t.chart.title, ...t.chart.x); }
  for (const r of Object.values(model.relations)) add(r.label);
  for (const f of model.setup) add(...factTexts(f));
  for (const s of model.steps) { add(s.title, s.caption === s.title ? null : s.caption); for (const f of s.facts) add(...factTexts(f)); }
  for (const sc of Object.values(model.scenes)) add(...modelTexts(sc));
  return out;
}
