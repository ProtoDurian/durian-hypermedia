// The diff part (format version 11): a real diff view for a unified diff (what `git diff` prints). Pure.
//
//   ```diff view=split
//   diff --git a/src/a.ts b/src/a.ts
//   --- a/src/a.ts
//   +++ b/src/a.ts
//   @@ -10,5 +10,5 @@ export function start() {
//   -  const host = "localhost";
//   +  const host = "0.0.0.0";
//   ```
//
// The parser reads files, hunks and lines with their line numbers. Word marks inside a changed line come from jsdiff
// (BSD-3, at parse time), which only sees lines under a size cap and gets a hard edit limit, so two long one-line files
// cost a count, not a hang. Every loop over the text is a hand scan that charges the part's budget.
import { diffWordsWithSpace } from "diff";
import { definePart } from "../types";
import { isSpace, type Err } from "../kit/text";
import type { Budget } from "../../core/budget";

export const DIFF_KEYS = ["id", "title", "view", "static", "llm"];
/** a run of unchanged lines longer than FOLD folds to KEEP lines at each end; a tap opens the middle */
export const DIFF_FOLD = 10, DIFF_KEEP = 3;

export interface DLine { k: " " | "+" | "-"; text: string; old: number | null; new: number | null; marks?: [number, number][] }   // marks: [from, to) in text
export interface Hunk { oldStart: number; oldLen: number; newStart: number; newLen: number; head: string; lines: DLine[] }
export interface DFile { oldName: string; newName: string; note: string; hunks: Hunk[] }
export interface DiffData {
  title: string;
  /** "split" or "unified" when the fence fixes it; "" lets the part's own width decide */
  view: "" | "split" | "unified";
  files: DFile[];
  adds: number;
  dels: number;
  /** the body is not a diff (or did not read): it is drawn as a plain code block */
  plain: boolean;
  /** the text, kept only when the block is drawn plain */
  src: string;
  errors: Err[];
  warnings: Err[];
}
export interface Lim { diffLines: number; diffFiles: number; diffWordLine: number; diffWordTokens: number; diffEditLength: number }

/** One row of the view: a line, a fold or a gap, or a hunk head. */
export type DRow =
  | { t: "line"; line: DLine }
  | { t: "gap"; n: number; id: string; hidden?: DLine[] }   // n lines not in the diff (a gap between hunks), or a folded run of unchanged lines (hidden holds them)
  | { t: "hunk"; head: string };

const isDigit = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9";
const MAX_DIGITS = 9;
/** digits at `at`: [value, next index] or null (at most 9 digits: a line number is not an essay) */
function num(s: string, at: number): [number, number] | null {
  let i = at;
  while (isDigit(s[i]) && i - at <= MAX_DIGITS) i++;
  return i === at || i - at > MAX_DIGITS ? null : [+s.slice(at, i), i];
}
/** `@@ -a[,b] +c[,d] @@[ head]`: the hunk's numbers and its head text, or null when the line is not a hunk head */
function hunkAt(s: string): { oldStart: number; oldLen: number; newStart: number; newLen: number; head: string } | null {
  if (!s.startsWith("@@ -")) return null;
  const a = num(s, 4);
  if (!a) return null;
  let i = a[1], oldLen = 1, newLen = 1;
  if (s[i] === ",") { const b = num(s, i + 1); if (!b) return null; oldLen = b[0]; i = b[1]; }
  if (!s.startsWith(" +", i)) return null;
  const c = num(s, i + 2);
  if (!c) return null;
  i = c[1];
  if (s[i] === ",") { const d = num(s, i + 1); if (!d) return null; newLen = d[0]; i = d[1]; }
  if (!s.startsWith(" @@", i)) return null;
  i += 3;
  if (isSpace(s[i])) i++;
  return { oldStart: a[0], oldLen, newStart: c[0], newLen, head: s.slice(i) };
}
/** A body with no `@@ -a,b +c,d @@` hunk line is not a diff: it stays a plain code block. */
export function looksLikeDiff(body: string): boolean {
  for (let from = 0; from < body.length;) {
    let to = body.indexOf("\n", from);
    if (to < 0) to = body.length;
    if (body.startsWith("@@ -", from) && hunkAt(body.slice(from, to).trimEnd()) !== null) return true;
    from = to + 1;
  }
  return false;
}

const META = ["index ", "new file mode", "deleted file mode", "old mode", "new mode", "similarity index", "rename from", "rename to", "copy from", "copy to", "Binary files"];
/** the file name in a `---` or `+++` line: no timestamp after a tab, no a/ or b/ in front */
function nameOf(s: string): string {
  const t = s.indexOf("\t");
  let n = (t < 0 ? s : s.slice(0, t)).trim();
  if ((n.startsWith("a/") || n.startsWith("b/"))) n = n.slice(2);
  return n;
}

export function parseDiff(body: string, baseLine: number, attrs: Record<string, string>, lim: Lim, budget?: Budget): DiffData {
  const out: DiffData = { title: attrs.title ?? "", view: attrs.view === "split" || attrs.view === "unified" ? attrs.view : "", files: [], adds: 0, dels: 0, plain: false, src: "", errors: [], warnings: [] };
  for (const k of Object.keys(attrs)) if (!DIFF_KEYS.includes(k)) out.errors.push({ line: baseLine - 1, msg: `unknown key "${k.slice(0, 40)}" (keys: title, view, static)` });
  if (attrs.view && attrs.view !== "split" && attrs.view !== "unified") out.errors.push({ line: baseLine - 1, msg: "view= is split or unified" });
  budget?.charge(1 + (body.length >> 4));
  if (!looksLikeDiff(body)) { out.plain = true; out.src = body; out.warnings.push({ line: baseLine - 1, msg: `this diff block has no "@@ -a,b +c,d @@" hunk, so it stays a plain code block` }); return out; }
  const stop = (line: number, msg: string, keep: boolean): DiffData => { out.errors.push({ line: baseLine + line - 1, msg }); out.plain = true; out.src = keep ? body : ""; out.files = []; out.adds = out.dels = 0; return out; };
  // the lines, counted before they are split: a diff over the cap is not read at all
  let end = body.length;
  while (end > 0 && (body[end - 1] === "\n" || body[end - 1] === "\r")) end--;
  let count = 1;
  for (let at = body.indexOf("\n"); at >= 0 && at < end && count <= lim.diffLines; at = body.indexOf("\n", at + 1)) count++;
  if (count > lim.diffLines) return stop(1, `a diff of more than ${lim.diffLines} lines; the most is ${lim.diffLines}`, false);
  const src = body.slice(0, end).split("\n").map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
  budget?.charge(src.length * 2, src.length);
  const files: DFile[] = [];
  let f: DFile | null = null, h: Hunk | null = null, o = 0, nn = 0, adds = 0, dels = 0;
  const startFile = (oldName = "", newName = ""): DFile => { const x: DFile = { oldName, newName, note: "", hunks: [] }; files.push(x); return x; };
  for (let i = 0; i < src.length; i++) {
    const raw = src[i], ln = i + 1;
    budget?.charge(1 + (raw.length >> 4));
    const hm = hunkAt(raw);
    if (hm) {
      if (!f) f = startFile();
      h = { ...hm, lines: [] };
      f.hunks.push(h); o = h.oldStart; nn = h.newStart;
      continue;
    }
    // inside a hunk: a line of +, - or a space (hand-written diffs often get the counts wrong, so the counts only
    // decide where a file header "--- a" / "+++ b" may start, never where the lines stop)
    const done = !!h && o >= h.oldStart + h.oldLen && nn >= h.newStart + h.newLen;
    const header = raw.startsWith("diff --git ") || (done && raw.startsWith("--- ") && (src[i + 1] ?? "").startsWith("+++ "));
    if (h && !header && (raw === "" || raw[0] === "+" || raw[0] === "-" || raw[0] === " " || raw[0] === "\\")) {
      if (raw[0] === "\\") continue;   // \ No newline at end of file
      const c = raw[0] ?? " ";
      budget?.charge(0, 1, raw.length);
      if (c === "+") { h.lines.push({ k: "+", text: raw.slice(1), old: null, new: nn++ }); adds++; }
      else if (c === "-") { h.lines.push({ k: "-", text: raw.slice(1), old: o++, new: null }); dels++; }
      else h.lines.push({ k: " ", text: raw.slice(1), old: o++, new: nn++ });
      continue;
    }
    if (h && !header && raw.trim() && !done) return stop(ln, `line ${ln} inside a hunk must start with +, - or a space: "${raw.slice(0, 40)}"`, true);
    h = null;
    if (raw.startsWith("diff --git ")) {
      if (files.length >= lim.diffFiles) return stop(ln, `more than ${lim.diffFiles} files in one diff`, false);
      const rest = raw.slice(11), b = rest.indexOf(" b/", 2);
      f = startFile(rest.startsWith("a/") && b > 0 ? rest.slice(2, b) : "", b > 0 ? rest.slice(b + 3) : "");
      continue;
    }
    if (raw.startsWith("--- ")) {
      if (!f || f.hunks.length) { if (files.length >= lim.diffFiles) return stop(ln, `more than ${lim.diffFiles} files in one diff`, false); f = startFile(); }
      f.oldName = nameOf(raw.slice(4));
      continue;
    }
    if (raw.startsWith("+++ ")) { if (!f) f = startFile(); f.newName = nameOf(raw.slice(4)); continue; }
    if (!f) { if (raw.trim()) f = startFile(); continue; }
    if (META.some((m) => raw.startsWith(m))) {
      const piece = raw.startsWith("index ") ? "" : raw.trim();
      if (piece) f.note = f.note ? `${f.note}, ${piece}` : piece;
      if (raw.startsWith("rename to ")) f.newName = raw.slice(10);
      if (raw.startsWith("rename from ")) f.oldName = raw.slice(12);
    }
  }
  for (const file of files) for (const hh of file.hunks) wordMarks(hh, lim, budget);
  out.files = files.filter((x) => x.hunks.length || x.note);
  out.adds = adds; out.dels = dels;
  return out;
}

// ---- word marks: pair the removed and added lines of one change block, line by line, and mark the words that differ ----
/** the tokens of a line (a run of white space, a run of letters and digits, or one other character), counted up to `cap + 1` */
function countTokens(s: string, cap: number): number {
  let n = 0, i = 0;
  const kind = (c: string) => (isSpace(c) ? 1 : (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || (c >= "0" && c <= "9") || c === "_" ? 2 : 0);
  while (i < s.length && n <= cap) {
    const k = kind(s[i]);
    i++;
    if (k) while (i < s.length && kind(s[i]) === k) i++;
    n++;
  }
  return n;
}
function wordMarks(h: Hunk, lim: Lim, budget?: Budget) {
  const L = h.lines;
  for (let i = 0; i < L.length;) {
    if (L[i].k !== "-") { i++; continue; }
    let j = i; while (j < L.length && L[j].k === "-") j++;
    let e = j; while (e < L.length && L[e].k === "+") e++;
    const dels = j - i, adds = e - j;
    if (adds > 0) for (let p = 0; p < Math.min(dels, adds); p++) markPair(L[i + p], L[j + p], lim, budget);
    i = e;
  }
}
function markPair(a: DLine, b: DLine, lim: Lim, budget?: Budget) {
  if (a.text === b.text) return;
  const la = a.text.length, lb = b.text.length;
  budget?.charge(8 + ((la + lb) >> 4));
  if (la > lim.diffWordLine || lb > lim.diffWordLine) return;   // too long to mark words: the line is marked whole
  const ta = countTokens(a.text, lim.diffWordTokens), tb = countTokens(b.text, lim.diffWordTokens);
  if (ta > lim.diffWordTokens || tb > lim.diffWordTokens) return;
  budget?.charge((ta + tb) * 6);
  const parts = diffWordsWithSpace(a.text, b.text, { maxEditLength: lim.diffEditLength });
  if (!parts) return;
  let pa = 0, pb = 0;
  const ma: [number, number][] = [], mb: [number, number][] = [];
  for (const p of parts) {
    const n = p.value.length;
    if (p.removed) { ma.push([pa, pa + n]); pa += n; }
    else if (p.added) { mb.push([pb, pb + n]); pb += n; }
    else { pa += n; pb += n; }
  }
  // nothing in common: marking every word says nothing more than the line colour
  if (ma.length && ma.reduce((s, x) => s + x[1] - x[0], 0) < la) a.marks = real(a.text, ma);
  if (mb.length && mb.reduce((s, x) => s + x[1] - x[0], 0) < lb) b.marks = real(b.text, mb);
}
// a mark that is only spaces is not a mark
const real = (t: string, ms: [number, number][]) => ms.filter(([x, y]) => t.slice(x, y).trim() !== "");

/** The rows of one file as the view draws them: hunk heads, gaps between hunks, long unchanged runs folded. Charges a step a line. */
export function rowsOf(file: DFile, budget?: Budget): DRow[] {
  const out: DRow[] = [];
  let prevEnd = 1;
  file.hunks.forEach((h, hi) => {
    budget?.charge(2 + h.lines.length, 1);
    const gap = h.oldStart - prevEnd;
    if (gap > 0) out.push({ t: "gap", n: gap, id: `g${hi}` });
    out.push({ t: "hunk", head: `@@ -${h.oldStart},${h.oldLen} +${h.newStart},${h.newLen} @@${h.head ? " " + h.head : ""}` });
    let run: DLine[] = [], ri = 0;
    const flush = () => {
      if (run.length > DIFF_FOLD) {
        // a fold keeps the first and last lines of a long unchanged run; the middle opens on a tap
        for (const l of run.slice(0, DIFF_KEEP)) out.push({ t: "line", line: l });
        out.push({ t: "gap", n: run.length - 2 * DIFF_KEEP, id: `h${hi}.${ri++}`, hidden: run.slice(DIFF_KEEP, run.length - DIFF_KEEP) });
        for (const l of run.slice(-DIFF_KEEP)) out.push({ t: "line", line: l });
      } else for (const l of run) out.push({ t: "line", line: l });
      run = [];
    };
    for (const l of h.lines) { if (l.k === " ") run.push(l); else { flush(); out.push({ t: "line", line: l }); } }
    flush();
    prevEnd = h.oldStart + h.oldLen;
  });
  return out;
}

/** Split view: a removed block and the added block after it sit side by side. */
export function splitPairs(lines: DLine[], budget?: Budget): [DLine | null, DLine | null][] {
  const out: [DLine | null, DLine | null][] = [];
  budget?.charge(1 + lines.length);
  for (let i = 0; i < lines.length;) {
    const l = lines[i];
    if (l.k === " ") { out.push([l, l]); i++; continue; }
    const dels: DLine[] = [], adds: DLine[] = [];
    while (i < lines.length && lines[i].k === "-") dels.push(lines[i++]);
    while (i < lines.length && lines[i].k === "+") adds.push(lines[i++]);
    for (let p = 0; p < Math.max(dels.length, adds.length); p++) out.push([dels[p] ?? null, adds[p] ?? null]);
  }
  return out;
}

export default definePart<DiffData>({
  name: "diff",
  form: "fenced",
  steps: false,
  llmKind: "as-is",
  dependencies: ["diff"],
  parse: (input, ctx) => parseDiff(input.body, input.bodyLine, input.attrs, ctx.limits, ctx.budget),
  check: (d) => [...d.errors.map((e) => ({ line: e.line, message: e.msg })), ...d.warnings.map((w) => ({ line: w.line, level: "warn" as const, message: w.msg }))],
});
