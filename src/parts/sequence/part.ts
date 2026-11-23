// The sequence part (format version 11): who calls whom, in order. Pure: the parser and the LLM view (the layout is in
// layout.ts). Every scan is by hand: no regular expression runs over author text.
//
//   ```sequence title="One init call"
//   actor dev "developer"
//   participant cli "CLI"
//   dev -> cli: scaffold create
//   cli --> dev: project written
//   ```
import { definePart } from "../types";
import { isSpace, scanLines, type Err, type StepInfo } from "../kit/text";
import type { Budget } from "../../core/budget";

export const SEQ_KINDS = ["participant", "actor", "database", "queue", "service"] as const;
export type Arrow = "call" | "reply" | "async" | "lost";
export interface Participant { id: string; kind: string; label: string; line: number; implicit: boolean }
export type SeqItem =
  | { t: "msg"; from: number; to: number; arrow: Arrow; text: string; step: number; line: number }
  | { t: "open"; block: string; text: string; depth: number; step: number; line: number }
  | { t: "else"; word: "else" | "and"; text: string; depth: number; step: number; line: number }
  | { t: "end"; depth: number; step: number; line: number }
  | { t: "note"; a: number; b: number; text: string; step: number; line: number };
export interface SeqSpec { title: string; participants: Participant[]; items: SeqItem[]; steps: StepInfo[]; each: boolean; errors: Err[]; attrs: string[] }
export interface SeqLimits { sequenceParticipants: number; sequenceItems: number; sequenceDepth: number }

// ---- hand scans ----
const isIdChar = (c: string) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || (c >= "0" && c <= "9") || c === "_" || c === "." || c === "-";
/** an id: letters, digits, - _ . */
export function isId(s: string): boolean { if (!s) return false; for (let i = 0; i < s.length; i++) if (!isIdChar(s[i])) return false; return true; }
const isWordChar = (c: string | undefined) => c !== undefined && ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || (c >= "0" && c <= "9") || c === "_");
/** the line starts with this word at a word boundary: the rest after the spaces that follow it; else null */
export function wordRest(t: string, word: string): string | null {
  if (!t.startsWith(word) || isWordChar(t[word.length])) return null;
  return t.slice(word.length).trim();
}

// After the arrow: the target is the shortest non-space word that reaches a colon, in it or after its spaces
function msgTail(t: string, q: number): [string, string] | null {
  while (q < t.length && isSpace(t[q])) q++;
  let r = q; while (r < t.length && !isSpace(t[r])) r++;
  const c = t.indexOf(":", q + 1);
  if (c > q && c < r) return [t.slice(q, c), t.slice(c + 1).trimStart()];
  let s = r; while (s < t.length && isSpace(t[s])) s++;
  return r > q && t[s] === ":" ? [t.slice(q, r), t.slice(s + 1).trimStart()] : null;
}
/** `a -> b: text` (-> --> ->>) as [line, a, arrow, b, text]. Arrows are tried from the left, inside the first word or right
 *  after it and its spaces; an arrow that ends inside the first word has its target run to that word's end, so whether it
 *  works is known at once: each arrow costs O(1), and only a handful need the full tail scan, so the line is read in one pass */
export function msgLine(t: string): [string, string, string, string, string] | null {
  let first = 0; while (first < t.length && !isSpace(t[first])) first++;
  let s = first; while (s < t.length && isSpace(t[s])) s++;
  const colonAfter = t[s] === ":", lastColon = first > 0 ? t.lastIndexOf(":", first - 1) : -1;
  for (let e = 1; e <= first; e++) {
    const p = e === first ? s : e;
    if (t[p] !== "-") continue;
    for (const arrow of ["-->", "->>", "->"]) {
      if (!t.startsWith(arrow, p)) continue;
      const q = p + arrow.length;
      if (q < first) {
        if (lastColon > q) { const c = t.indexOf(":", q + 1); return [t, t.slice(0, e), arrow, t.slice(q, c), t.slice(c + 1).trimStart()]; }
        if (colonAfter) return [t, t.slice(0, e), arrow, t.slice(q, first), t.slice(s + 1).trimStart()];
        continue;
      }
      const r = msgTail(t, q);
      if (r) return [t, t.slice(0, e), arrow, r[0], r[1]];
    }
  }
  return null;
}
/** `a -x b: text` as [line, a, b, text] */
export function lostLine(t: string): [string, string, string, string] | null {
  let e = 0; while (e < t.length && !isSpace(t[e])) e++;
  let p = e; while (p < t.length && isSpace(t[p])) p++;
  if (!e || p === e || !t.startsWith("-x", p) || !isSpace(t[p + 2])) return null;
  const r = msgTail(t, p + 2);
  return r ? [t, t.slice(0, e), r[0], r[1]] : null;
}
/** `note a: text` or `note a b: text` as [line, a, b or undefined, text]: a colon inside the first word ends it; else a second word may follow */
export function noteLine(t: string): [string, string, string | undefined, string] | null {
  if (!t.startsWith("note") || !isSpace(t[4])) return null;
  let q = 4; while (q < t.length && isSpace(t[q])) q++;
  let r = q; while (r < t.length && !isSpace(t[r])) r++;
  if (r === q) return null;
  const c = t.indexOf(":", q + 1);
  if (c > q && c < r) return [t, t.slice(q, c), undefined, t.slice(c + 1).trimStart()];
  const two = r < t.length ? msgTail(t, r) : null;
  if (two) return [t, t.slice(q, r), two[0], two[1]];
  let s = r; while (s < t.length && isSpace(t[s])) s++;
  return t[s] === ":" ? [t, t.slice(q, r), undefined, t.slice(s + 1).trimStart()] : null;
}
const isLetter = (c: string) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");
/** `<kind> <id> "label"`: the kind word, the id and the label (undefined when none); null when the line is not one */
export function declLine(t: string): { kind: string; id: string; label: string | undefined } | null {
  let i = 0; while (i < t.length && isLetter(t[i])) i++;
  if (!i || !isSpace(t[i])) return null;
  const kind = t.slice(0, i);
  while (i < t.length && isSpace(t[i])) i++;
  const s = i; while (i < t.length && !isSpace(t[i])) i++;
  if (i === s) return null;
  const id = t.slice(s, i);
  while (i < t.length && isSpace(t[i])) i++;
  if (i === t.length) return { kind, id, label: undefined };
  if (t[i] !== '"') return null;
  const e = t.indexOf('"', i + 1);
  if (e < 0) return null;
  for (let j = e + 1; j < t.length; j++) if (!isSpace(t[j])) return null;
  return { kind, id, label: t.slice(i + 1, e) };
}
/** mermaid's habit `participant A as B`: the kind word, the id, the label; null when the line is not one */
function asLine(t: string): { kind: string; id: string; label: string } | null {
  let i = 0; while (i < t.length && isLetter(t[i])) i++;
  const kind = t.slice(0, i).toLowerCase();
  if (!(SEQ_KINDS as readonly string[]).includes(kind) || !isSpace(t[i])) return null;
  while (i < t.length && isSpace(t[i])) i++;
  const s = i; while (i < t.length && !isSpace(t[i])) i++;
  if (i === s) return null;
  const id = t.slice(s, i);
  while (i < t.length && isSpace(t[i])) i++;
  if (t.slice(i, i + 2).toLowerCase() !== "as" || !isSpace(t[i + 2])) return null;
  const label = t.slice(i + 3).trim();
  return label ? { kind, id, label } : null;
}
const BLOCKS = ["loop", "alt", "opt", "par"];
const isKeyword = (t: string) => [...BLOCKS, "else", "and", "end", "note"].some((w) => wordRest(t, w) !== null);

export function parseSequence(body: string, baseLine: number, title: string, each: boolean, lim: SeqLimits, budget?: Budget): SeqSpec {
  const errors: Err[] = [];
  const err = (line: number, msg: string) => errors.push({ line, msg });
  const { lines, steps } = scanLines(body, baseLine, budget);
  const parts: Participant[] = [];
  const byId = new Map<string, number>();
  const items: SeqItem[] = [];
  const stack: { word: string; line: number; kind: string }[] = [];
  const idx = (id: string, line: number): number => {
    const had = byId.get(id);
    if (had !== undefined) return had;
    if (!isId(id)) err(line, `"${id.length > 40 ? id.slice(0, 40) + "…" : id}" is not an id (letters, digits, - _ . only); declare it first, like: participant cli "CLI"`);
    byId.set(id, parts.length);
    parts.push({ id, kind: "participant", label: id, line, implicit: true });
    return parts.length - 1;
  };
  if (each && steps.length) err(steps[0].line, `steps=each makes every message a step; remove the @step lines, or remove steps=each`);
  for (const l of lines) {
    budget?.charge(2, 1, 0);
    const t = l.text.trim();
    if (items.length + parts.length > lim.sequenceItems) { err(l.line, `a sequence holds at most ${lim.sequenceItems} lines; split the story into two`); break; }
    // a declaration
    const d = declLine(t);
    if (d && !isKeyword(t) && !msgLine(t) && !lostLine(t)) {
      const kind = d.kind.toLowerCase();
      if (!(SEQ_KINDS as readonly string[]).includes(kind)) { err(l.line, `unknown participant kind "${d.kind}" (kinds: ${SEQ_KINDS.join(", ")}); write: participant ${d.id} "label"`); continue; }
      if (!isId(d.id)) { err(l.line, `"${d.id}" is not an id (letters, digits, - _ . only)`); continue; }
      const at = byId.get(d.id);
      if (at !== undefined && !parts[at].implicit) { err(l.line, `participant "${d.id}" is declared twice`); continue; }
      if (at !== undefined) { parts[at] = { id: d.id, kind, label: d.label ?? d.id, line: l.line, implicit: false }; continue; }
      byId.set(d.id, parts.length);
      parts.push({ id: d.id, kind, label: d.label ?? d.id, line: l.line, implicit: false });
      continue;
    }
    // mermaid's habit: participant A as B
    const asM = asLine(t);
    if (asM) { const lab = asM.label.startsWith('"') ? asM.label.slice(1) : asM.label; err(l.line, `"as" is mermaid's habit; write ${asM.kind} ${asM.id.toLowerCase()} "${lab.endsWith('"') ? lab.slice(0, -1) : lab}"`); continue; }
    let blk: string | null = null;
    for (const w of BLOCKS) if (blk === null && wordRest(t, w) !== null) blk = w;
    if (blk) {
      if (stack.length >= lim.sequenceDepth) { err(l.line, `blocks nest ${lim.sequenceDepth} deep at most; flatten this ${blk}, or split the story`); continue; }
      stack.push({ word: blk, line: l.line, kind: blk });
      items.push({ t: "open", block: blk, text: wordRest(t, blk)!, depth: stack.length - 1, step: l.step, line: l.line });
      continue;
    }
    const elWord = wordRest(t, "else") !== null ? "else" : wordRest(t, "and") !== null ? "and" : null;
    if (elWord) {
      const top = stack[stack.length - 1];
      const home = elWord === "else" ? "alt" : "par", homeText = elWord === "else" ? "an alt" : "a par";
      if (!top) { err(l.line, `"${elWord}" with no block open; "${elWord}" belongs inside ${homeText} block`); continue; }
      if (top.kind !== home) { err(l.line, `"${elWord}" inside a ${top.kind} block (line ${top.line}); "${elWord}" belongs inside ${homeText} block`); continue; }
      items.push({ t: "else", word: elWord, text: wordRest(t, elWord)!, depth: stack.length - 1, step: l.step, line: l.line });
      continue;
    }
    if (wordRest(t, "end") !== null) {
      if (!stack.length) { err(l.line, `"end" with no block open; a loop, alt, opt or par block comes first`); continue; }
      items.push({ t: "end", depth: stack.length - 1, step: l.step, line: l.line });
      stack.pop();
      continue;
    }
    const nt = noteLine(t);
    if (nt) {
      if (!nt[3].trim()) { err(l.line, `a note with no text; write: note ${nt[1]}: the words`); continue; }
      // `note a b: text` has two ids; `note a: text` one
      items.push({ t: "note", a: idx(nt[1], l.line), b: nt[2] ? idx(nt[2], l.line) : -1, text: nt[3].trim(), step: l.step, line: l.line });
      continue;
    }
    let m: string[] | null = msgLine(t);
    let arrow: Arrow | null = null, from = "", to = "", text = "";
    if (m) { from = m[1]; to = m[3]; text = m[4]; arrow = m[2] === "->" ? "call" : m[2] === "-->" ? "reply" : "async"; }
    else if ((m = lostLine(t))) { from = m[1]; to = m[2]; text = m[3]; arrow = "lost"; }
    if (!arrow) { err(l.line, `"${t.slice(0, 40)}" is not a participant, a message (a -> b: text) or a block; messages: -> call, --> reply, ->> async, -x lost`); continue; }
    if (!text.trim()) { err(l.line, `a message with no text; write: ${from} ${m && m[2] ? m[2] : "->"} ${to}: what is said`); continue; }
    items.push({ t: "msg", from: idx(from, l.line), to: idx(to, l.line), arrow, text: text.trim(), step: l.step, line: l.line });
  }
  for (const s of stack) err(s.line, `the ${s.word} block is never closed; add a line "end" after its messages`);
  if (parts.length > lim.sequenceParticipants) err(parts[lim.sequenceParticipants].line, `${parts.length} participants; at most ${lim.sequenceParticipants} (split the story into two)`);
  if (!items.some((i) => i.t === "msg")) err(baseLine, `a sequence has no message; write one, like: a -> b: hello`);
  // steps=each: every message is a step, its text the caption; blocks and notes join the message they belong to
  let stepList = steps;
  if (each) {
    budget?.charge(items.length + 1, items.length);
    const msgs: number[] = [];
    items.forEach((it, k) => { if (it.t === "msg") msgs.push(k); });
    if (msgs.length < 2) err(baseLine, `steps=each needs at least 2 messages`);
    stepList = msgs.map((k) => ({ title: (items[k] as { text: string }).text, line: items[k].line }));
    msgs.forEach((k, rank) => { items[k].step = rank; });
    // a note after a message shows with it, and so does an end; a block opener with the first message in it
    const before: number[] = [];
    let last = -1;
    items.forEach((it, k) => {
      before[k] = last;
      if (it.t === "msg") last = it.step;
      else if (it.t === "note" || it.t === "end") it.step = last;
    });
    let next: number | undefined;
    for (let k = items.length - 1; k >= 0; k--) {
      const it = items[k];
      if (it.t === "msg") next = it.step;
      else if (it.t === "open" || it.t === "else") it.step = next === undefined ? before[k] : next;
    }
  }
  return { title, participants: parts, items, steps: stepList, each, errors, attrs: [] };
}

// ---------- the LLM view ----------
const KIND_WORD: Record<string, string> = { participant: "", actor: " (actor)", database: " (database)", queue: " (queue)", service: " (service)" };
const ARROW_TXT: Record<Arrow, string> = { call: "->", reply: "-->", async: "->>", lost: "-x" };
export function seqLlm(s: SeqSpec): string {
  const names = s.participants.map((p) => `${p.label}${KIND_WORD[p.kind] ?? ""}`).join(", ");
  const out: string[] = [`Sequence${s.title ? `: ${s.title}` : ""}${s.title && /[.!?]$/.test(s.title) ? "" : "."} Participants: ${names}.`, ""];
  let n = 0, curStep = -2, depth = 0;
  for (const it of s.items) {
    if (!s.each && s.steps.length && it.step !== curStep && it.step >= 0) { curStep = it.step; out.push(`${s.steps[it.step].title}`); }
    if (it.t === "msg") out.push(`${"   ".repeat(depth)}${++n}. ${s.participants[it.from].id} ${ARROW_TXT[it.arrow]} ${s.participants[it.to].id}: ${it.text}`);
    else if (it.t === "open") { out.push(`${"   ".repeat(it.depth)}${it.block}${it.text ? ` ${it.text}` : ""}:`); depth++; }
    else if (it.t === "else") out.push(`${"   ".repeat(it.depth)}${it.word}${it.text ? ` ${it.text}` : ""}:`);
    else if (it.t === "end") depth--;
    else if (it.t === "note") out.push(`${"   ".repeat(depth)}note ${s.participants[it.a].id}${it.b >= 0 ? ` ${s.participants[it.b].id}` : ""}: ${it.text}`);
  }
  const all = out.join("\n"); let e = all.length; while (e > 0 && all[e - 1] === "\n") e--;
  return all.slice(0, e);
}

const ATTRS = ["id", "title", "steps", "static", "llm"];
export default definePart<SeqSpec>({
  name: "sequence",
  form: "fenced",
  steps: true,
  llmKind: "own",
  parse: (input, ctx) => {
    const s = parseSequence(input.body, input.bodyLine, input.attrs.title ?? "", input.attrs.steps === "each", ctx.limits, ctx.budget);
    for (const k of Object.keys(input.attrs)) if (!ATTRS.includes(k)) s.attrs.push(`unknown attribute "${k}" (a sequence takes #id, title=..., steps=each and static=...)`);
    if (input.attrs.steps && input.attrs.steps !== "each") s.attrs.push(`steps=${input.attrs.steps} is not a word; write steps=each, or use @step lines`);
    return s;
  },
  llm: (s) => seqLlm(s),
  check: (s) => [...s.attrs.map((m) => ({ line: undefined, message: m })), ...s.errors.map((e) => ({ line: e.line, message: e.msg }))],
});
