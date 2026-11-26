// Lanes: what a card shows at each step that the core's ThingState does not hold, read from the Model's own facts.
// The composed stage's card words (stage-cards.ts CardStep) lower to `layout` facts (parse/lower-stage.ts): a step's
// `title`, `dashed`, `cross`, `fill` (a record's value), `mark` (a token chip's tone and remark) and `state-tone` (the
// tone of a state word). Each lasts from its step until changed, except `mark` (that step only). The lit cards of a step
// follow the stage's rule (stage-cards.ts drawCard `hot`), read from the Model's `light`, `rel` and `show` facts.
// Nothing here reads the stage's own compile: the Model is the only input.
import type { Fact, Id, Model, Tone } from "../../types";

export type Mark = { tone: string; remark: string };
export interface CardStep {
  title: Record<Id, string>;
  dashed: Set<Id>;
  cross: Set<Id>;
  corner: Set<Id>;
  fill: Record<Id, Record<string, string>>;
  stateTone: Record<Id, { tone: string; gone: boolean }>;
  /** token chip marks of this step only: card -> token index (0-based) -> mark */
  marks: Record<Id, Map<number, Mark>>;
  /** the things the stage lights at this step */
  lit: Set<Id>;
  /** a lit pill's note (`light p1: sold`), this step only */
  notes: Record<Id, string>;
}

type LF = Extract<Fact, { k: "layout" }>;

/** `id: words` */
const idColon = (arg: string): [Id, string] | null => { const i = arg.indexOf(": "); if (i < 0) return null; return [arg.slice(0, i).trim(), arg.slice(i + 2)]; };
/** `id`, `id off`, `id corner`, `id corner off` */
const idFlags = (arg: string): { id: Id; off: boolean; corner: boolean } => { const w = arg.trim().split(/\s+/); return { id: w[0] ?? "", off: w.includes("off"), corner: w.includes("corner") }; };

/** the tokens of a card (`tokens: mix ( flour, sugar )` lowers to keys.tokens): a JSON list, or the stage's words joined by
 * commas (a token may end in a comma, so a comma followed by another comma is the token's own) */
export function tokensOf(keys: Record<string, string>): string[] {
  const s = keys.tokens; if (!s) return [];
  if (s.startsWith("[")) { try { const a = JSON.parse(s); if (Array.isArray(a)) return a.map(String); } catch { /* the joined form */ } }
  return s.split(/,(?!,)/);
}
/** a record's keys (`keys: Name; Kind` lowers to keys.keys): a JSON list or comma-joined */
export function recordKeysOf(keys: Record<string, string>): string[] {
  const s = keys.keys; if (!s) return [];
  if (s.startsWith("[")) { try { const a = JSON.parse(s); if (Array.isArray(a)) return a.map(String); } catch { /* the joined form */ } }
  return s.split(",");
}
export function badgesOf(keys: Record<string, string>): { b: string; s: string }[] {
  if (!keys.badges) return [];
  try { const a = JSON.parse(keys.badges); return Array.isArray(a) ? a.filter((x) => x && typeof x.b === "string").map((x) => ({ b: String(x.b), s: String(x.s ?? "") })) : []; } catch { return []; }
}

/** `q #1, #3: accent`, `q #5: bad dropped: optional` */
function markOf(arg: string): { card: Id; idx: number[]; mark: Mark } | null {
  const c = idColon(arg); if (!c) return null;
  const [head, rest] = c; const sp = head.indexOf(" "); if (sp < 0) return null;
  const card = head.slice(0, sp), idx = head.slice(sp + 1).split(",").map((x) => Number(x.trim().replace(/^#/, "")) - 1).filter((n) => Number.isInteger(n) && n >= 0);
  const t = rest.trim(), k = t.indexOf(" ");
  return { card, idx, mark: { tone: k < 0 ? t : t.slice(0, k), remark: k < 0 ? "" : t.slice(k + 1).trim() } };
}

const cache = new WeakMap<Model, CardStep[]>();

/** every step's card words, 0 (the setup) to n */
export function cardSteps(model: Model): CardStep[] {
  const hit = cache.get(model); if (hit) return hit;
  const out: CardStep[] = [];
  let cur: CardStep = { title: {}, dashed: new Set(), cross: new Set(), corner: new Set(), fill: {}, stateTone: {}, marks: {}, lit: new Set(), notes: {} };
  // a record key written `Key = value` starts with that value
  for (const id of model.order) { const v0 = model.things[id]?.keys.vals0; if (v0) { try { cur.fill[id] = { ...JSON.parse(v0) }; } catch { /* none */ } } }
  // a setup state word's tone (lower-stage.ts keys.stateTone), as a step's state-tone fact gives it
  for (const id of model.order) { const w = model.things[id]?.keys.stateTone?.trim().split(/\s+/); if (w?.[0]) cur.stateTone[id] = { tone: w[0], gone: w.includes("gone") }; }
  const apply = (facts: Fact[], step: number) => {
    const next: CardStep = { title: { ...cur.title }, dashed: new Set(cur.dashed), cross: new Set(cur.cross), corner: new Set(cur.corner), fill: Object.fromEntries(Object.entries(cur.fill).map(([k, v]) => [k, { ...v }])), stateTone: { ...cur.stateTone }, marks: {}, lit: new Set(), notes: {} };
    for (const f of facts) {
      if (f.k !== "layout") continue;
      const lf = f as LF;
      switch (lf.word) {
        case "title": { const c = idColon(lf.arg); if (c) next.title[c[0]] = c[1]; break; }
        case "dashed": { const x = idFlags(lf.arg); if (x.off) next.dashed.delete(x.id); else next.dashed.add(x.id); break; }
        case "cross": { const x = idFlags(lf.arg), set = x.corner ? next.corner : next.cross; if (x.off) set.delete(x.id); else set.add(x.id); break; }
        case "fill": { const c = idColon(lf.arg); if (!c) break; const sp = c[0].indexOf(" "); if (sp < 0) break; const id = c[0].slice(0, sp), key = c[0].slice(sp + 1).trim(); (next.fill[id] ??= {})[key] = c[1]; break; }
        case "state-tone": { const w = lf.arg.trim().split(/\s+/); if (w[0]) next.stateTone[w[0]] = { tone: w[1] ?? "good", gone: w.includes("gone") }; break; }
        case "mark": { const m = markOf(lf.arg); if (!m) break; const mm = (next.marks[m.card] ??= new Map()); for (const i of m.idx) mm.set(i, m.mark); break; }
      }
    }
    // a state word set again without a tone is in the good tone; cleared, its tone goes
    // (the setup's own state words keep the tone their card carries: keys.stateTone)
    for (const f of facts) if (f.k === "is") for (const id of f.ids) if (!(step === 0 && model.things[id]?.keys.stateTone) && !facts.some((g) => g.k === "layout" && g.word === "state-tone" && g.arg.trim().split(/\s+/)[0] === id)) delete next.stateTone[id];
    if (step > 0) litOf(model, facts, next);
    cur = next; out.push(next);
  };
  apply(model.setup, 0);
  model.steps.forEach((s, i) => apply(s.facts, i + 1));
  cache.set(model, out);
  return out;
}

/** the stage's lit rule: the things `light` names; without a light on a card, the senders of the step's lines, and a thing
 * it shows unless the step only sends to it (stage-cards.ts drawCard). A pill's light note is this step's. */
function litOf(model: Model, facts: Fact[], st: CardStep) {
  const isCard = (id: Id) => !!model.things[id];
  const lights = facts.filter((f): f is Extract<Fact, { k: "light" }> => f.k === "light");
  for (const l of lights) if (l.note) for (const id of l.ids) st.notes[id] = l.note;
  const named = lights.flatMap((l) => l.ids).filter(isCard);
  if (named.length) { for (const id of named) st.lit.add(id); return; }
  const sends = facts.flatMap((f) => (f.k === "rel" && model.relations[f.rel] ? [model.relations[f.rel]] : []));
  for (const r of sends) st.lit.add(r.from);
  const shown = facts.flatMap((f) => (f.k === "show" ? f.ids : []));
  for (const id of shown) if (!sends.some((r) => r.to === id)) st.lit.add(id);
}

/** a stage tone word as the engine's tone */
export const toneWord = (t: string | undefined | null): Tone | null => (t === "good" || t === "bad" || t === "warn" ? t : t === "acc" || t === "accent" || t === "hot" ? "accent" : null);
