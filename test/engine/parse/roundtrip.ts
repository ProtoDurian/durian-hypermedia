// Test helper (lane parse): what a Model is, for comparing two reads of the same story (ids, facts, relations; no line numbers).
import type { Fact, Model } from "../../../src/engine/types";
const strip = (f: Fact) => { const { src: _s, ...r } = f as any; return r; };
/** eng-migrate2: `beats: false` leaves `then` out: migrate writes it between the hops of a relay (one hop per beat), so the
 *  migrated story has beats the old one played in one; what is true at each step is the same (migrate-compile.test.ts) */
export function shape(m: Model, o: { beats?: boolean } = {}) {
  const things = m.order.map((id) => { const t = m.things[id]; return { id, role: t.role, title: t.title, lines: t.lines, shape: t.shape, layout: t.layout, parent: t.parent, region: t.region, values: t.values, keys: t.keys, chart: t.chart, container: t.container }; })
    .sort((a, b) => a.id.localeCompare(b.id));
  const kids = (p: string | null) => m.order.filter((i) => m.things[i].parent === p);
  return {
    layout: m.layout, title: m.title, note: m.note,
    regions: m.regions.map((r) => ({ id: r.id, title: r.title, flags: r.flags })),
    things, siblings: Object.fromEntries([null, ...m.order].map((p) => [String(p), p === null ? [...kids(p)].sort() : kids(p)] as [string, string[]]).filter((e) => e[1].length).sort((a, b) => a[0].localeCompare(b[0]))),
    relations: Object.values(m.relations).map((r) => ({ id: r.id, from: r.from, to: r.to, setup: r.setup, label: r.setup ? r.label : null, role: r.role })),
    setup: m.setup.map(strip), steps: m.steps.map((s) => ({ t: (s.title === s.caption ? s.title : `${s.title}: ${s.caption}`).replace(/\s+/g, " "), facts: s.facts.filter((f) => o.beats !== false || f.k !== "then").map((f) => (f.k === "rel" ? { ...strip(f), words: f.words ?? m.relations[f.rel]?.label ?? null } : strip(f))) })),
    layoutWords: Object.fromEntries(Object.entries(m.layoutWords).map(([k, v]) => [k, v.map((w) => ({ word: w.word, arg: w.arg, body: w.body }))])),
  };
}

/** fmt12: a line migrate writes in the setup, hides there and shows in a step (print12 lastingLines: an old step line whose
 *  label stays) read back as the step line it was, so `shape` compares the same story */
export function asStepLines(m: Model): Model {
  const hid = new Set<string>();
  for (const f of m.setup) if (f.k === "hide") for (const id of f.ids) if (m.relations[id]?.setup) hid.add(id);
  const shown = new Set<string>();
  for (const s of m.steps) for (const f of s.facts) if (f.k === "show" && f.ids.length === 1 && hid.has(f.ids[0])) shown.add(f.ids[0]);
  if (!shown.size) return m;
  const relations = Object.fromEntries(Object.entries(m.relations).map(([k, r]) => [k, shown.has(k) ? { ...r, setup: false } : r]));
  const setup = m.setup.flatMap((f) => (f.k === "hide" && f.ids.some((id) => shown.has(id)) ? (f.ids.filter((id) => !shown.has(id)).length ? [{ ...f, ids: f.ids.filter((id) => !shown.has(id)) }] : []) : [f]));
  const steps = m.steps.map((s) => ({ ...s, facts: s.facts.map((f): Fact => (f.k === "show" && f.ids.length === 1 && shown.has(f.ids[0]) ? { k: "rel", rel: f.ids[0], words: null, style: relations[f.ids[0]].style, role: relations[f.ids[0]].role, src: f.src } : f)) }));
  return { ...m, relations, setup, steps };
}
