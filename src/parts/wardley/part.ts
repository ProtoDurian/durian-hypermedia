// The wardley part (format version 11): a map of components by evolution (left to right) and visibility (top to bottom).
// Positions are named keys, never a bare pair. Pure: the parser and the LLM view (layout.ts places the words). Every scan
// is by hand: no regular expression runs over author text.
//
//   ```wardley title="A tea shop"
//   anchor customer "Customer" visible=0.95 evolution=0.6
//   component kettle "Kettle" visible=0.45 evolution=0.4
//   customer -> kettle
//   @step A smart kettle moves it further to the right.
//   evolve kettle 0.65 "smart kettle"
//   ```
import { definePart } from "../types";
import { isSpace, scanLines, type Err, type StepInfo } from "../kit/text";
import type { Budget } from "../../core/budget";

export const STAGES = ["genesis", "custom built", "product", "commodity"];
const STAGE_WORD: Record<string, number> = { genesis: 0.125, custom: 0.375, "custom-built": 0.375, product: 0.625, commodity: 0.875 };
export const stageOf = (e: number) => STAGES[Math.min(3, Math.floor(e * 4))];
export interface Comp { id: string; label: string; anchor: boolean; v: number; e: number; step: number; line: number }
export interface Evolve { id: string; to: number; label: string; step: number; line: number }
export interface WardleySpec {
  title: string; comps: Comp[]; needs: { a: string; b: string; step: number; line: number }[]; evolves: Evolve[]; inertia: { id: string; step: number }[];
  pipelines: { id: string; from: number; to: number; step: number }[]; notes: { text: string; v: number; e: number; step: number }[];
  groups: { id: string; label: string; ids: string[]; step: number }[]; highlights: { id: string; step: number }[]; steps: StepInfo[]; errors: Err[]; warnings: Err[]; attrs: string[];
}
export interface WardleyLimits { wardleyComponents: number }

// ---- hand scans ----
const isIdChar = (c: string) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || (c >= "0" && c <= "9") || c === "_" || c === "." || c === "-";
/** an id: letters, digits, - _ . */
export function isId(s: string): boolean { if (!s) return false; for (let i = 0; i < s.length; i++) if (!isIdChar(s[i])) return false; return true; }
const isLower = (c: string | undefined) => c !== undefined && c >= "a" && c <= "z";
const isWord = (c: string | undefined) => c !== undefined && ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || (c >= "0" && c <= "9") || c === "_");
const isDigit = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9";
const skipWs = (t: string, i: number) => { while (i < t.length && isSpace(t[i])) i++; return i; };
const skipRun = (t: string, i: number) => { while (i < t.length && !isSpace(t[i])) i++; return i; };
/** the line starts with this word and a space: where the text after the spaces starts; else -1 */
export function afterKw(t: string, w: string): number { return t.startsWith(w) && isSpace(t[w.length]) ? skipWs(t, w.length) : -1; }
/** `"text" rest` -> [text, rest]; a label in double quotes at the start */
export function takeQuoted(s: string): [string, string] | null {
  if (s[0] !== '"') return null;
  const e = s.indexOf('"', 1);
  return e < 0 ? null : [s.slice(1, e), s.slice(e + 1).trimStart()];
}
const unq = (s: string) => (s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s);
/** every `key=value` of a text (a key is lower case letters at a word start; a value is "quoted" or a word): one pass */
export function keyVals(rest: string): [string, string][] {
  const out: [string, string][] = [];
  let i = 0;
  while (i < rest.length) {
    if (!isLower(rest[i]) || (i > 0 && isWord(rest[i - 1]))) { i++; continue; }
    let j = i; while (isLower(rest[j])) j++;
    if (rest[j] !== "=") { i = j; continue; }
    let end = -1;
    if (rest[j + 1] === '"') { const e = rest.indexOf('"', j + 2); if (e >= 0) end = e + 1; }
    if (end < 0) { end = skipRun(rest, j + 1); if (end === j + 1) { i = j + 1; continue; } }
    out.push([rest.slice(i, j), rest.slice(j + 1, end)]);
    i = end;
  }
  return out;
}
/** a decimal 0 to 1 as written: digits, or digits . digits, or .digits (never a sign or an exponent) */
export function isDecimal(v: string): boolean {
  let i = 0, d = 0;
  while (isDigit(v[i])) { i++; d++; }
  if (v[i] === ".") { i++; let f = 0; while (isDigit(v[i])) { i++; f++; } return f > 0 && i === v.length; }
  return d > 0 && i === v.length;
}
/** a bare pair like [0.4, 0.6] anywhere in the line */
export function hasBarePair(t: string): boolean {
  const run = (i: number) => { const s = i; while (i < t.length && (isDigit(t[i]) || t[i] === ".")) i++; return i > s ? i : -1; };
  for (let b = t.indexOf("["); b >= 0; b = t.indexOf("[", b + 1)) {
    let i = run(skipWs(t, b + 1)); if (i < 0) continue;
    i = skipWs(t, i); if (t[i] !== ",") continue;
    i = run(skipWs(t, i + 1)); if (i < 0) continue;
    if (t[skipWs(t, i)] === "]") return true;
  }
  return false;
}
/** `a -> b` as [a, b]: two words with `->` between them (spaces around it or none); the longest first word that fits */
export function needLine(t: string): [string, string] | null {
  const n = t.length;
  if (!n) return null;
  const end1 = skipRun(t, 0);
  let lastWs = -1; for (let i = n - 1; i >= 0; i--) if (isSpace(t[i])) { lastWs = i; break; }
  for (let k = end1; k >= 1; k--) {
    let j = k === end1 ? skipWs(t, k) : k;
    if (!t.startsWith("->", j)) continue;
    const y = skipWs(t, j + 2);
    if (y < n && y > lastWs) return [t.slice(0, k), t.slice(y)];
  }
  return null;
}
function num(raw: string | undefined, key: string, line: number, err: (l: number, m: string) => void): number | null {
  if (raw === undefined) return null;
  const v = unq(raw).toLowerCase();
  if (key === "evolution" && Object.hasOwn(STAGE_WORD, v)) return STAGE_WORD[v];
  if (!isDecimal(v) || +v < 0 || +v > 1) { err(line, `${key}=${v.length > 40 ? v.slice(0, 40) + "…" : v} is outside 0 to 1${key === "evolution" ? " (or a stage word: genesis, custom, product, commodity)" : ""}`); return null; }
  return +v;
}

export function parseWardley(body: string, baseLine: number, title: string, lim: WardleyLimits, budget?: Budget): WardleySpec {
  const errors: Err[] = [], warnings: Err[] = [];
  const err = (line: number, msg: string) => errors.push({ line, msg });
  const { lines, steps } = scanLines(body, baseLine, budget);
  const s: WardleySpec = { title, comps: [], needs: [], evolves: [], inertia: [], pipelines: [], notes: [], groups: [], highlights: [], steps, errors, warnings, attrs: [] };
  const ids = new Map<string, Comp>();
  const known = (id: string) => ids.has(id);
  const keys = (rest: string) => { const o: Record<string, string> = {}; for (const [k, v] of keyVals(rest)) o[k] = v; return o; };
  const deferred: { line: number; ids: string[]; msg: (id: string) => string }[] = [];
  for (const l of lines) {
    budget?.charge(2, 1);
    const t = l.text.trim();
    if (hasBarePair(t)) { err(l.line, `a bare pair like [0.4, 0.6] hides which number is which; write visible=0.6 evolution=0.4 (evolution runs left to right, visible top to bottom)`); continue; }
    let at = afterKw(t, "anchor"), kind = "anchor";
    if (at < 0) { at = afterKw(t, "component"); kind = "component"; }
    if (at >= 0) {
      const idEnd = skipRun(t, at), id = t.slice(at, idEnd);
      let rest = t.slice(idEnd).trimStart(), label = id;
      const q = takeQuoted(rest); if (q) { label = q[0]; rest = q[1]; }
      if (!isId(id)) { err(l.line, `"${id.length > 40 ? id.slice(0, 40) + "…" : id}" is not an id (letters, digits, - _ . only)`); continue; }
      if (known(id)) { err(l.line, `"${id}" is written twice`); continue; }
      const k = keys(rest);
      for (const key of Object.keys(k)) if (key !== "visible" && key !== "evolution") err(l.line, `unknown key "${key}=" on a ${kind} (keys: visible, evolution)`);
      if (k.visible === undefined) { err(l.line, `${kind} "${id}" has no visible= (0 at the bottom, hidden, to 1 at the top, seen by the user)`); continue; }
      if (k.evolution === undefined) { err(l.line, `${kind} "${id}" has no evolution= (0 to 1, or genesis, custom, product, commodity)`); continue; }
      const v = num(k.visible, "visible", l.line, err), e = num(k.evolution, "evolution", l.line, err);
      if (v === null || e === null) continue;
      if (s.comps.length >= lim.wardleyComponents) { err(l.line, `more than ${lim.wardleyComponents} components; split the map`); break; }
      s.comps.push({ id, label, anchor: kind === "anchor", v, e, step: l.step, line: l.line });
      ids.set(id, s.comps[s.comps.length - 1]);
      continue;
    }
    if ((at = afterKw(t, "evolve")) >= 0) {
      // evolve <id> <evolution> ["label"]
      const e1 = skipRun(t, at), a2 = skipWs(t, e1), e2 = skipRun(t, a2);
      if (e1 > at && a2 > e1 && e2 > a2) {
        const a3 = skipWs(t, e2);
        let lab: string | null = null;
        if (a3 === t.length) lab = "";
        else if (a3 > e2) { const q = takeQuoted(t.slice(a3)); if (q && q[1] === "") lab = q[0]; }
        if (lab !== null) { const to = num(t.slice(a2, e2), "evolution", l.line, err); if (to !== null) s.evolves.push({ id: t.slice(at, e1), to, label: lab, step: l.step, line: l.line }); continue; }
      }
    }
    if ((at = afterKw(t, "inertia")) >= 0 || (at = afterKw(t, "highlight")) >= 0) {
      const word = t.startsWith("inertia") ? "inertia" : "highlight", e1 = skipRun(t, at);
      if (e1 > at && skipWs(t, e1) === t.length) {
        const id = t.slice(at, e1);
        (word === "inertia" ? s.inertia : s.highlights).push({ id, step: l.step });
        deferred.push({ line: l.line, ids: [id], msg: (x) => `${word} names "${x}", which is not a component` });
        continue;
      }
    }
    if ((at = afterKw(t, "pipeline")) >= 0) {
      const e1 = skipRun(t, at), id = t.slice(at, e1);
      const k = keys(t.slice(e1).trimStart()), a = num(k.from, "from", l.line, err), b = num(k.to, "to", l.line, err);
      if (k.from === undefined || k.to === undefined) { err(l.line, `a pipeline needs from=0.4 to=0.7 (evolution values)`); continue; }
      if (a !== null && b !== null) s.pipelines.push({ id, from: a, to: b, step: l.step });
      deferred.push({ line: l.line, ids: [id], msg: (x) => `pipeline names "${x}", which is not a component` });
      continue;
    }
    if (t.startsWith("note") && !isWord(t[4])) {
      const q = takeQuoted(isSpace(t[4]) ? t.slice(4).trimStart() : t);
      if (!q) { err(l.line, `a note is: note "text" visible=0.5 evolution=0.5`); continue; }
      const k = keys(q[1]), v = num(k.visible, "visible", l.line, err), e = num(k.evolution, "evolution", l.line, err);
      if (k.visible === undefined || k.evolution === undefined) { err(l.line, `a note needs visible= and evolution=`); continue; }
      if (v !== null && e !== null) s.notes.push({ text: q[0], v, e, step: l.step });
      continue;
    }
    if ((at = afterKw(t, "group")) >= 0) {
      // group <id> "label": a, b
      const e1 = skipRun(t, at), a2 = skipWs(t, e1);
      const q = e1 > at && a2 > e1 && t[a2] === '"' ? t.indexOf('"', a2 + 1) : -1;
      const c = q >= 0 ? skipWs(t, q + 1) : -1;
      if (c >= 0 && t[c] === ":" && skipWs(t, c + 1) < t.length) {
        const gid = t.slice(at, e1), list = t.slice(skipWs(t, c + 1)).split(",").map((x) => x.trim()).filter(Boolean);
        budget?.charge(1 + list.length, list.length);
        s.groups.push({ id: gid, label: t.slice(a2 + 1, q), ids: list, step: l.step });
        deferred.push({ line: l.line, ids: list, msg: (x) => `group "${gid}" names "${x}", which is not a component` });
        continue;
      }
    }
    const nd = needLine(t);
    if (nd) { s.needs.push({ a: nd[0], b: nd[1], step: l.step, line: l.line }); continue; }
    err(l.line, `"${t.slice(0, 40)}" is not a Wardley line; lines are anchor, component, a -> b, evolve, inertia, pipeline, note, group, highlight`);
  }
  for (const d of deferred) for (const i of d.ids) if (!known(i)) err(d.line, d.msg(i));
  for (const n of s.needs) for (const id of [n.a, n.b]) if (!known(id)) err(n.line, `the need "${n.a} -> ${n.b}" names "${id}", which is not a component`);
  for (const ev of s.evolves) {
    const c = ids.get(ev.id);
    if (!c) err(ev.line, `evolve names "${ev.id}", which is not a component`); else if (ev.to < c.e) warnings.push({ line: ev.line, msg: `evolve "${ev.id}" goes backwards (to the left, from ${c.e} to ${ev.to}); that can happen, so this is a warning` });
  }
  // a cycle of needs: a depth-first walk with one shared path and a loop (no recursion: a long chain would overflow the
  // stack); every edge charges the budget
  const adj = new Map<string, string[]>();
  for (const n of s.needs) { const o = adj.get(n.a); if (o) o.push(n.b); else adj.set(n.a, [n.b]); }
  const state = new Map<string, number>();
  const walk = (start: string): string[] | null => {
    const path = [start], next = [0];
    state.set(start, 1);
    while (path.length) {
      const id = path[path.length - 1], out = adj.get(id) ?? [], k = next[next.length - 1];
      if (k >= out.length) { state.set(id, 2); path.pop(); next.pop(); continue; }
      next[next.length - 1] = k + 1;
      const nx = out[k];
      budget?.charge(1, 1);
      if (state.get(nx) === 1) return [...path, nx];
      if (!state.get(nx)) { state.set(nx, 1); path.push(nx); next.push(0); }
    }
    return null;
  };
  for (const c of s.comps) if (!state.get(c.id)) { const cyc = walk(c.id); if (cyc) { err(s.needs.find((n) => n.a === cyc[cyc.length - 2])?.line ?? baseLine, `needs go round in a circle (${cyc.slice(cyc.indexOf(cyc[cyc.length - 1])).join(" -> ")}); a component cannot need itself, even through others`); break; } }
  if (!s.comps.length) err(baseLine, `a Wardley map has no component; write one, like: component kettle "Kettle" visible=0.5 evolution=0.4`);
  return s;
}

const evWord = (c: number) => `${stageOf(c)} (${c.toFixed(2)})`;
export function wardleyLlm(s: WardleySpec): string {
  const out = [`Wardley map${s.title ? `: ${s.title}` : ""}${s.title && /[.!?]$/.test(s.title) ? "" : "."} Evolution left to right: ${STAGES.join(", ")}; visibility top to bottom.`, "", "| component | evolution | visible |", "| --- | --- | --- |"];
  for (const c of s.comps) out.push(`| ${c.label}${c.anchor ? " (anchor)" : ""} | ${evWord(c.e)} | ${c.v.toFixed(2)} |`);
  const names = new Map<string, string>(); for (const c of s.comps) names.set(c.id, c.label);
  const lab = (id: string) => names.get(id) ?? id;
  out.push("");
  const by = new Map<string, string[]>(); for (const n of s.needs) { const o = by.get(n.a); if (o) o.push(lab(n.b)); else by.set(n.a, [lab(n.b)]); }
  for (const [a, bs] of by) out.push(`${lab(a)} needs ${bs.join(", ")}`);
  for (const e of s.evolves) out.push(`${lab(e.id)} evolves to ${evWord(e.to)}${e.label ? ` as "${e.label}"` : ""}`);
  for (const i of s.inertia) out.push(`${lab(i.id)} has inertia (resists change)`);
  for (const p of s.pipelines) out.push(`${lab(p.id)} is a pipeline from ${p.from.toFixed(2)} to ${p.to.toFixed(2)}`);
  for (const g of s.groups) out.push(`${g.label}: ${g.ids.map(lab).join(", ")}`);
  for (const n of s.notes) out.push(`Note (${evWord(n.e)}, visible ${n.v.toFixed(2)}): ${n.text}`);
  if (s.steps.length) { out.push("", "Steps:"); s.steps.forEach((st, i) => out.push(`${i + 1}. ${st.title}`)); }
  return out.join("\n");
}

const ATTRS = ["id", "title", "static", "llm"];
export default definePart<WardleySpec>({
  name: "wardley",
  form: "fenced",
  steps: true,
  llmKind: "own",
  parse: (input, ctx) => {
    const s = parseWardley(input.body, input.bodyLine, input.attrs.title ?? "", ctx.limits, ctx.budget);
    for (const k of Object.keys(input.attrs)) if (!ATTRS.includes(k)) s.attrs.push(`unknown attribute "${k}" (a wardley map takes #id, title=... and static=...)`);
    return s;
  },
  llm: (s) => wardleyLlm(s),
  check: (s) => [...s.attrs.map((m) => ({ line: undefined, message: m })), ...s.errors.map((e) => ({ line: e.line, message: e.msg })), ...s.warnings.map((w) => ({ line: w.line, level: "warn" as const, message: w.msg }))],
});
