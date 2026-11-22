// The fishbone part (format version 11): causes by category along a spine into an effect. Pure.
//
//   ```fishbone title="Why is checkout slow?"
//   effect: Checkout takes 4 seconds at p95
//   People: on-call is new to the service
//   Process: no load test before a release
//     only staging has real data
//   ```
import { definePart } from "../types";
import { afterWord, colonSplit, familyOf, indentOf, scanLines, type Err, type StepInfo } from "../kit/text";

export const FISH_MIN = 2, FISH_MAX = 8;
export interface Cause { text: string; subs: { text: string; line: number; step: number }[]; line: number; step: number }
export interface Category { name: string; causes: Cause[]; line: number; step: number; colour: string }
export interface FishSpec { title: string; effect: string; categories: Category[]; steps: StepInfo[]; highlights: { step: number; category: number }[]; errors: Err[] }

export function parseFish(body: string, baseLine: number, title: string, lim: { fishboneCauses: number; fishboneSubCauses: number }, budget?: import("../../core/budget").Budget): FishSpec {
  const errors: Err[] = [];
  const err = (line: number, msg: string) => errors.push({ line, msg });
  const { lines, steps } = scanLines(body, baseLine, budget);
  const cats: Category[] = [], highlights: { step: number; category: number }[] = [];
  const byName = new Map<string, number>();
  let effect = "", effects = 0, cur: Cause | null = null, subIndent = -1, causes = 0, subs = 0;
  for (const l of lines) {
    budget?.charge(2, 1, 0);
    const indent = indentOf(l.text), t = l.text.trim();
    const hm = indent === 0 ? afterWord(t, "highlight") : null;
    if (hm !== null) {
      const k = byName.get(hm.toLowerCase());
      if (k === undefined) err(l.line, `highlight: no category "${hm}"; the categories are ${cats.map((c) => c.name).join(", ") || "(none yet)"}`); else highlights.push({ step: l.step, category: k });
      continue;
    }
    if (indent > 0) {
      if (!cur) { err(l.line, `an indented line is a cause of the cause above it; there is no cause above this one`); continue; }
      if (subIndent < 0) subIndent = indent;
      if (indent > subIndent) { err(l.line, `a cause of a cause of a cause: a fishbone has 2 levels; move this line up one level, or join it to the line above`); continue; }
      if (++subs > lim.fishboneSubCauses) { err(l.line, `more than ${lim.fishboneSubCauses} sub-causes; split the fishbone`); break; }
      cur.subs.push({ text: t, line: l.line, step: l.step });
      continue;
    }
    const m = colonSplit(t);
    if (!m) { err(l.line, `"${t.slice(0, 40)}" is not a line; write "effect: the problem" or "Category: a cause"`); continue; }
    if (m[0].toLowerCase() === "effect") {
      effects++;
      if (effects > 1) { err(l.line, `a second "effect:" line; a fishbone has one head`); continue; }
      if (!m[1].trim()) err(l.line, `"effect:" has no text; write the problem the causes lead to`);
      effect = m[1].trim();
      continue;
    }
    if (!m[1].trim()) { err(l.line, `the cause of "${m[0]}" is empty; write a cause after the colon`); cur = null; continue; }
    if (++causes > lim.fishboneCauses) { err(l.line, `more than ${lim.fishboneCauses} causes; a fishbone that big is not read: split it`); break; }
    const key = m[0].trim().toLowerCase();
    let k = byName.get(key);
    if (k === undefined) { cats.push({ name: m[0].trim(), causes: [], line: l.line, step: l.step, colour: familyOf(cats.length) }); k = cats.length - 1; byName.set(key, k); }
    cur = { text: m[1].trim(), subs: [], line: l.line, step: l.step };
    subIndent = -1;
    cats[k].causes.push(cur);
  }
  if (!effects) err(baseLine, `a fishbone has no "effect:" line; start with: effect: the problem`);
  if (cats.length < FISH_MIN) err(baseLine, `a fishbone has ${cats.length} categor${cats.length === 1 ? "y" : "ies"}; it needs 2 to ${FISH_MAX} (for one, write a list)`);
  if (cats.length > FISH_MAX) err(cats[FISH_MAX].line, `${cats.length} categories; a fishbone has at most ${FISH_MAX}: join some, or split it in two`);
  return { title, effect, categories: cats, steps, highlights, errors };
}

export function fishLlm(s: FishSpec): string {
  const out = [`Fishbone${s.title ? `: ${s.title}` : ""}${s.title && /[.!?]$/.test(s.title) ? "" : "."} Effect: ${s.effect}. Causes by category:`];
  for (const c of s.categories) {
    out.push(`- ${c.name}`);
    for (const ca of c.causes) { out.push(`  - ${ca.text}`); for (const sc of ca.subs) out.push(`    - ${sc.text}`); }
  }
  if (s.steps.length) { out.push("", "Steps:"); s.steps.forEach((st, i) => out.push(`${i + 1}. ${st.title}`)); }
  return out.join("\n");
}

export default definePart<FishSpec>({
  name: "fishbone",
  form: "fenced",
  steps: true,
  llmKind: "own",
  parse: (input, ctx) => parseFish(input.body, input.bodyLine, input.attrs.title ?? "", ctx.limits, ctx.budget),
  llm: (s) => fishLlm(s),
  check: (s) => s.errors.map((e) => ({ line: e.line, message: e.msg })),
});
