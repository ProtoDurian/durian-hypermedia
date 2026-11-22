// The venn part (format version 11): 2, 3 or 4 sets in fixed, even shapes (2 or 3 circles, 4 ellipses), not drawn to scale
// on purpose. Pure: the parser and the LLM view (layout.ts holds the layout). Every scan is by hand.
//
//   ```venn title="Who writes what"
//   set go "Go" [c1]
//   set rust "Rust" [c2]
//   go: Ana, Ben
//   go & rust: Cy
//   rust: 4 people
//   ```
import { definePart } from "../types";
import { COLOUR_WORDS, FAMILY, colonSplit, isSpace, scanLines, type Err, type StepInfo } from "../kit/text";
import type { Budget } from "../../core/budget";
import { parseItem, splitList, type Item } from "./names";

export interface VennSet { id: string; label: string; colour: string; step: number; line: number }
export interface VennRegion { mask: number; items: Item[]; count: number | null; countWord: string; step: number; line: number }
export interface VennSpec { title: string; sets: VennSet[]; regions: VennRegion[]; steps: StepInfo[]; errors: Err[]; attrs: string[] }
export interface VennLimits { vennNames: number }

const isIdChar = (c: string) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || (c >= "0" && c <= "9") || c === "_" || c === "." || c === "-";
/** an id: letters, digits, - _ . */
export function isId(s: string): boolean { if (!s) return false; for (let i = 0; i < s.length; i++) if (!isIdChar(s[i])) return false; return true; }
const isDigit = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9";

/** "head [colour]" -> head and colour (lower case, "" when none); the bracket must be last: a hand scan, the last non-space
 *  character is "]", and its "[" is the first one after the "]" before it */
export function takeColour(s: string): { head: string; colour: string; raw: string; has: boolean } {
  let end = s.length;
  while (end > 0 && isSpace(s[end - 1])) end--;
  const close = end - 1, open = close > 0 && s[close] === "]" ? s.indexOf("[", s.lastIndexOf("]", close - 1) + 1) : -1;
  if (open < 0 || open >= close) return { head: s.trim(), colour: "", raw: "", has: false };
  const raw = s.slice(open + 1, close).trim();
  return { head: s.slice(0, open).trim(), colour: raw.toLowerCase(), raw, has: true };
}
/** `set <id> "label" [colour]`: the id, the label (undefined when none) and what follows the label; null when it is not a set line */
export function setLine(t: string): { id: string; label: string | undefined; rest: string } | null {
  if (!t.startsWith("set") || !isSpace(t[3])) return null;
  let i = 3; while (i < t.length && isSpace(t[i])) i++;
  const s = i; while (i < t.length && !isSpace(t[i])) i++;
  if (i === s) return null;
  const id = t.slice(s, i);
  while (i < t.length && isSpace(t[i])) i++;
  if (t[i] === '"') {
    const e = t.indexOf('"', i + 1);
    if (e > 0) return { id, label: t.slice(i + 1, e), rest: t.slice(e + 1).trim() };
  }
  return { id, label: undefined, rest: t.slice(i).trim() };
}

// a count, by hand scans: "4" or "4 people" (number first, then words with no , ( ) or quote), and the wrong order "people 4"
const COUNT_BAD = ",()\"";
const hasBad = (s: string) => { for (let i = 0; i < s.length; i++) if (COUNT_BAD.includes(s[i])) return true; return false; };
export function countFirst(v: string): { n: number; word: string } | null {
  let i = 0; while (i < v.length && isDigit(v[i])) i++;
  if (!i) return null;
  const rest = v.slice(i);
  if (!rest) return { n: +v.slice(0, i), word: "" };
  return isSpace(rest[0]) && rest.trim() && !hasBad(rest) ? { n: +v.slice(0, i), word: rest.trim() } : null;
}
export function countLast(v: string): { n: string; word: string } | null {
  let j = v.length; while (j > 0 && isDigit(v[j - 1])) j--;
  if (j === v.length || !isSpace(v[j - 1])) return null;
  const word = v.slice(0, j).trimEnd();
  return word && isLetterAt(word[0]) && !hasBad(word) ? { n: v.slice(j), word } : null;
}
const isLetterAt = (c: string) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");

export function parseVenn(body: string, baseLine: number, title: string, lim: VennLimits, budget?: Budget): VennSpec {
  const errors: Err[] = [];
  const err = (line: number, msg: string) => errors.push({ line, msg });
  const { lines, steps } = scanLines(body, baseLine, budget);
  const sets: VennSet[] = [], regions: VennRegion[] = [];
  const where = new Map<string, number>(), setAt = new Map<string, number>(), masks = new Set<number>();
  let named = 0;
  for (const l of lines) {
    budget?.charge(2, 1, 0);
    const t = l.text.trim();
    const sm = setLine(t);
    if (sm) {
      if (!isId(sm.id)) { err(l.line, `"${sm.id.length > 40 ? sm.id.slice(0, 40) + "…" : sm.id}" is not an id (letters, digits, - _ . only)`); continue; }
      if (setAt.has(sm.id)) { err(l.line, `set "${sm.id}" is written twice`); continue; }
      const c = takeColour(sm.rest);
      if (c.head) { err(l.line, `after the set's label only a colour in square brackets may follow, like [c2]; found "${c.head.slice(0, 30)}"`); continue; }
      let colour = "";
      if (c.has) {
        if (!COLOUR_WORDS.includes(c.colour)) err(l.line, `set "${sm.id}": unknown colour "${c.raw}"; colours are ${COLOUR_WORDS.join(", ")} (theme words, never a hex value)`);
        else colour = c.colour;
      }
      if (sets.length >= 4) { err(l.line, `${sets.length + 1} sets; a venn has 2 to 4 (every region of 5 sets cannot be drawn): write a table or a tier list`); break; }
      setAt.set(sm.id, sets.length);
      sets.push({ id: sm.id, label: sm.label ?? sm.id, colour: colour || FAMILY[sets.length % FAMILY.length], step: l.step, line: l.line });
      continue;
    }
    const rm = colonSplit(t);
    if (!rm) { err(l.line, `"${t.slice(0, 40)}" is not a set (set go "Go" [c1]) or a region (go & rust: Cy)`); continue; }
    const ids = rm[0].split("&").map((s) => s.trim());
    let mask = 0, bad = false;
    for (const id of ids) {
      const k = setAt.get(id);
      if (k === undefined) { err(l.line, `the region names "${id.length > 40 ? id.slice(0, 40) + "…" : id}", which is not a set; the sets are ${sets.map((s) => s.id).join(", ") || "(none yet: write the set lines first)"}`); bad = true; break; }
      if (mask & (1 << k)) { err(l.line, `set "${id}" is named twice in one region`); bad = true; break; }
      mask |= 1 << k;
    }
    if (bad) continue;
    if (masks.has(mask)) { err(l.line, `the region "${ids.join(" & ")}" is written twice; put all its items on one line`); continue; }
    const v = rm[1].trim();
    const lateSet = sets.find((s, k) => (mask & (1 << k)) && s.step > l.step);
    if (lateSet) err(l.line, `this region uses set "${lateSet.id}", which only appears in a later step; move the region under that step or after it`);
    if (!v) { err(l.line, `the region "${ids.join(" & ")}" has nothing after the colon; write names (Ana, Ben) or a count (4 people)`); continue; }
    // a count: a number first, then at most a few words (4, 12 people)
    const cm = countFirst(v);
    if (cm) { masks.add(mask); regions.push({ mask, items: [], count: cm.n, countWord: cm.word, step: l.step, line: l.line }); continue; }
    const rev = countLast(v);
    if (rev && !v.includes(",")) { err(l.line, `a count has the number first: write "${rev.n} ${rev.word}", not "${v}"`); continue; }
    const items: Item[] = [];
    let over = false;
    for (const raw of splitList(v)) {
      budget?.charge(1, 1, 0);
      const it = parseItem(raw);
      if (typeof it === "string") { err(l.line, it); continue; }
      if (named + items.length >= lim.vennNames) { err(l.line, `more than ${lim.vennNames} names; a venn holds at most ${lim.vennNames}: use a table`); over = true; break; }
      const key = it.name.toLowerCase();
      if (where.has(key)) { err(l.line, `"${it.name}" is in two regions (line ${where.get(key)} and here); an item goes in one region`); continue; }
      where.set(key, l.line); items.push(it);
    }
    named += items.length;
    masks.add(mask);
    regions.push({ mask, items, count: null, countWord: "", step: l.step, line: l.line });
    if (over) break;
  }
  if (sets.length < 2) err(baseLine, `a venn needs 2 to 4 sets; for one set write a list, and for more than 4 write a table or a tier list`);
  return { title, sets, regions, steps, errors, attrs: [] };
}

const joinNames = (xs: string[]) => (xs.length <= 2 ? xs.join(" and ") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1]);
export const bits = (m: number) => { let n = 0; while (m) { n += m & 1; m >>= 1; } return n; };
export function regionWords(spec: VennSpec, mask: number): string {
  const ins = spec.sets.filter((_, k) => mask & (1 << k)).map((s) => s.label);
  if (ins.length === spec.sets.length && spec.sets.length > 2) return spec.sets.length === 3 ? "all three" : "all four";
  return ins.length === 1 ? `${ins[0]} only` : `${joinNames(ins)} only`;
}
export const regionText = (r: VennRegion) => (r.count != null ? `${r.count}${r.countWord ? ` ${r.countWord}` : ""}` : r.items.map((i) => (i.note ? `${i.name} (${i.note})` : i.name)).join(", "));
export function vennLlm(spec: VennSpec): string {
  const out = [`Venn${spec.title ? `: ${spec.title}` : ""}${spec.title && /[.!?]$/.test(spec.title) ? "" : "."} Sets: ${spec.sets.map((s) => s.label).join(", ")}.`];
  // the regions in the figure's order: fewest sets first, then as written; under steps, step by step
  let step = -2;
  const sorted = spec.steps.length ? [...spec.regions].sort((a, b) => a.step - b.step || bits(a.mask) - bits(b.mask)) : [...spec.regions].sort((a, b) => bits(a.mask) - bits(b.mask));
  for (const r of sorted) {
    if (spec.steps.length && r.step !== step && r.step >= 0) { step = r.step; out.push(`${spec.steps[r.step].title}`); }
    out.push(`${regionWords(spec, r.mask)}: ${regionText(r)}`);
  }
  return out.join("\n");
}

const ATTRS = ["id", "title", "static", "llm"];
export default definePart<VennSpec>({
  name: "venn",
  form: "fenced",
  steps: true,
  llmKind: "own",
  parse: (input, ctx) => {
    const s = parseVenn(input.body, input.bodyLine, input.attrs.title ?? "", ctx.limits, ctx.budget);
    for (const k of Object.keys(input.attrs)) if (!ATTRS.includes(k)) s.attrs.push(`unknown attribute "${k}" (a venn takes #id, title=... and static=...)`);
    return s;
  },
  llm: (s) => vennLlm(s),
  check: (s) => [...s.attrs.map((m) => ({ line: undefined, message: m })), ...s.errors.map((e) => ({ line: e.line, message: e.msg }))],
});
