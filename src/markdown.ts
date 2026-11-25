// Markdown to a small, safe tree. markdown-it tokenises (CommonMark, plus GFM tables, strikethrough, task lists and
// autolink literals added here); this file turns the tokens into plain data: no HTML string ever leaves this module.
// Raw HTML in the source becomes text. Links and images pass the URL policy.
// Inline parts: :kbd[Ctrl+K, Ctrl+S] and :mouse[double-click index.ts]; a link to code:<repo>/<path>#<symbol> is a code reference.
//
// Work: markdown-it reads in time linear in the text (its own pathological tests, and test/markdown-work.test.ts here,
// which counts the work on a seeded fuzz of Markdown punctuation). Every rule this file adds is one forward pass:
// it never scans the same text again from a later start. A host's inline pattern is searched once per text run.
import GithubSlugger, { slug as githubSlug } from "github-slugger";
import MarkdownIt, { type MarkdownIt as Reader, type Token as Tok } from "./vendor/markdown-it";
import { KEY_GLYPHS, MOUSE_PRESS } from "./core/dh-lib";
import { applyUrlPolicy, decodeRefs, LIMITS, type UrlPolicy } from "./safety";
import { inlineSection, matchRaw, prepareInlines, rawParts, scanRun, type InlineRun } from "./parts/inline-runtime";
import { referenceRule } from "./core/refs";


export type MdInline =
  | { t: "text"; v: string }
  | { t: "strong" | "em" | "del"; c: MdInline[] }
  | { t: "code"; v: string }
  | { t: "br" }
  | { t: "link"; href: string | null; title?: string; c: MdInline[] }
  | { t: "img"; src: string | null; alt: string; title?: string }
  | { t: "coderef"; ref: string; c: MdInline[] }
  | { t: "kbd"; label: string; chords: string[][] }
  | { t: "mouse"; act: string; press: "l" | "r" | "w" | ""; badge: string; target: string }
  | { t: "ref"; name: string; text: string; data: unknown }           // a host's inline reference (InlineDef)
  | { t: "reference"; type: string; name: string; label: string | null; text: string; error?: string; state?: "pending" | "ready" | "failed"; reason?: string };   // [[type:name "label"]] in a sentence (core/refs.ts)
export type CalloutKind = "note" | "tip" | "important" | "warn" | "security";
export type MdBlock =
  | { t: "p"; c: MdInline[] }
  | { t: "text"; c: MdInline[] }                       // a tight list item's text (no paragraph)
  | { t: "h"; depth: number; id: string; text: string; c: MdInline[] }
  | { t: "list"; ordered: boolean; start: number | null; items: { task: boolean; checked: boolean; c: MdBlock[] }[] }
  | { t: "quote"; c: MdBlock[] }
  | { t: "callout"; kind: CalloutKind; label: string; c: MdBlock[] }
  | { t: "code"; lang: string; meta?: string; text: string; hl?: unknown }   // meta: the info string after the language; hl: Code Hike tokens, added by highlight() on the server
  | { t: "table"; align: ("left" | "right" | "center" | null)[]; head: MdInline[][]; rows: MdInline[][][] }
  | { t: "hr" }
  | { t: "raw"; text: string };                         // raw HTML from the source, shown as text

/** A host's inline reference in prose (@src/a.ts, &T-12 ...): a pattern, and what it means. The LLM reads it as written. */
export interface InlineDef<D = unknown, C = unknown> {
  /** a name for the reference kind (lower case letters, digits, dashes) */
  name: string;
  /** what it looks like in text, e.g. /@[\w./-]+/ or /&T-\d+/ (no g or y flag; keep it simple: it runs once over every text, and
   *  its own speed is the host's: a pattern that backtracks costs that on every page) */
  match: RegExp;
  /** the match to data for the component (default: the matched text) */
  parse?: (m: RegExpExecArray) => D;
  /** the React component that draws it: receives { text, data } (only the React entry reads this) */
  Component?: C;
}
export interface MdContext {
  inlines?: InlineDef<any, any>[]; policy?: UrlPolicy; idPrefix: string; slugger: GithubSlugger; maxDepth: number;
  problems: { line: number; message: string; level?: "error" | "warn" }[]; line: number; heads: { depth: number; text: string; id: string }[];
  /** the page's inline parts (parts/inline.ts), made once by parse() (prepareInlines); made here, for an empty page, when a caller gave none */
  inlineParts?: InlineRun;
  /** inside a heading the inline parts read nothing (a count, not a flag: the walk nests) */
  noScan?: number;
  /** the page line of the block being read, for the problems an inline part reports */
  runLine?: number;
}

export const CALLOUT_WORDS: Record<string, CalloutKind> = { Note: "note", Tip: "tip", Important: "important", "Watch out": "warn", "Security finding": "security" };
const KEY_WORDS: Record<string, string> = { left: "Left arrow", right: "Right arrow", up: "Up arrow", down: "Down arrow" };

// ---------------------------------------------------------------------------------------------------------------
// the reader: one markdown-it per set of host inline definitions

type StateInline = any;
type StateCore = any;
const isSp = (c: number) => c === 0x20 || c === 0x09;
const isWs = (c: number) => c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0b || c === 0x0c || c === 0x0d;
const isAlnum = (c: number) => (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a);
const ASCII_PUNCT = /[!-/:-@[-`{-~]/;
// a backslash before ASCII punctuation is the punctuation (what marked did to a link's address, title and a fence's language)
const unescapePunct = (s: string) => (s.includes("\\") ? s.replace(/\\([!-/:-@[-`{-~])/g, "$1") : s);

// where a host pattern matches in one text run: found once, front to back (the run is markdown-it's inline source)
interface RefFinder { name: string; def: InlineDef<any, any>; find: RegExp; at: RegExp }
interface RunMarks { src: string; starts: number[]; i: number }

/** The text rule: plain characters up to the next one another rule may start at. Linear: each character is looked at once. */
function textRule(finders: RefFinder[]) {
  return (state: StateInline, silent: boolean): boolean => {
    const src: string = state.src, max: number = state.posMax;
    let pos: number = state.pos;
    const marks = finders.length ? runMarks(state, finders) : null;
    let stop = max;
    if (marks) { while (marks.i < marks.starts.length && marks.starts[marks.i] < pos) marks.i++; if (marks.i < marks.starts.length && marks.starts[marks.i] < stop) stop = marks.starts[marks.i]; }
    while (pos < stop) {
      const c = src.charCodeAt(pos);
      if (isTerminator(c)) break;
      if ((c === 0x77 || c === 0x57 || c === 0x68 || c === 0x48 || c === 0x66 || c === 0x46) && litStart(src, pos)) break;
      if (isLocalCh(c) && (pos === 0 || !isLocalCh(src.charCodeAt(pos - 1))) && emailAt(src, pos, max) > 0) break;
      pos++;
    }
    if (pos === state.pos) return false;
    if (!silent) state.pending += src.slice(state.pos, pos);
    state.pos = pos;
    return true;
  };
}
// markdown-it's own terminators (rules_inline/text), the characters a rule may begin at
function isTerminator(c: number): boolean {
  switch (c) {
    case 0x0a: case 0x21: case 0x23: case 0x24: case 0x25: case 0x26: case 0x2a: case 0x2b: case 0x2d: case 0x3a: case 0x3c: case 0x3d: case 0x3e: case 0x40:
    case 0x5b: case 0x5c: case 0x5d: case 0x5e: case 0x5f: case 0x60: case 0x7b: case 0x7d: case 0x7e: return true;
    default: return false;
  }
}
function runMarks(state: StateInline, finders: RefFinder[]): RunMarks {
  // one list of match starts per inline source (state.src); nested parses of a link's text share the outer one
  const env = state.env as { __dhRuns?: Map<string, RunMarks> };
  const runs = (env.__dhRuns ??= new Map());
  let m = runs.get(state.src);
  if (!m) {
    const starts = new Set<number>();
    for (const f of finders) {
      f.find.lastIndex = 0;
      for (let r = f.find.exec(state.src); r; r = f.find.exec(state.src)) {
        if (r[0]) starts.add(r.index);
        f.find.lastIndex = r.index + Math.max(1, r[0].length);
      }
    }
    m = { src: state.src, starts: [...starts].sort((a, b) => a - b), i: 0 };
    runs.set(state.src, m);
  }
  if (m.i > 0 && m.starts[m.i - 1] >= state.pos) m.i = lowerBound(m.starts, state.pos);
  return m;
}
function lowerBound(a: number[], x: number): number { let lo = 0, hi = a.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (a[mid] < x) lo = mid + 1; else hi = mid; } return lo; }

// ---- GFM autolink literals (github.github.com/gfm, "Autolinks (extension)"): www., http://, https://, ftp:// and e-mail
// addresses. www. starts after a line start, white space or one of * _ ~ ( (GFM); a scheme starts after any character
// that is not a letter or a digit, as 0.6.1 read it ("url=https://...", "key:https://...", a quote before it), except
// "<" (a "<" that does not open an autolink is text, CommonMark and GFM agree). The rule
// reads forward once: a domain is scanned once for every start inside it (domainEnd keeps its last scan).
function litStart(src: string, pos: number): boolean {
  const pre = litPrefix(src, pos);
  if (!pre) return false;
  const p = pos > 0 ? src.charCodeAt(pos - 1) : -1;
  if (p < 0 || isWs(p) || p === 0x2a || p === 0x5f || p === 0x7e || p === 0x28) return true;
  if ((src.charCodeAt(pos) | 0x20) === 0x77 || p === 0x3c) return false;
  return !isWordBefore(src, pos);
}
/** Whether the character before pos is a letter or a digit (any script). */
function isWordBefore(src: string, pos: number): boolean {
  const p = src.charCodeAt(pos - 1);
  if (p < 0x80) return isAlnum(p);
  const cp = pos >= 2 && p >= 0xdc00 && p <= 0xdfff ? src.codePointAt(pos - 2)! : p;
  return /[\p{L}\p{N}]/u.test(String.fromCodePoint(cp));
}
function litPrefix(src: string, pos: number): number {
  const lc = (i: number) => src.charCodeAt(i) | 0x20;
  const c = lc(pos);
  if (c === 0x77) return lc(pos + 1) === 0x77 && lc(pos + 2) === 0x77 && src.charCodeAt(pos + 3) === 0x2e ? 4 : 0;
  if (c === 0x68) { if (lc(pos + 1) !== 0x74 || lc(pos + 2) !== 0x74 || lc(pos + 3) !== 0x70) return 0; let i = pos + 4; if (lc(i) === 0x73) i++; return src.startsWith("://", i) ? i + 3 - pos : 0; }
  if (c === 0x66) return lc(pos + 1) === 0x74 && lc(pos + 2) === 0x70 && src.startsWith("://", pos + 3) ? 6 : 0;
  return 0;
}
const isDomainCh = (c: number) => isAlnum(c) || c === 0x2d || c === 0x5f || c > 0x7f && !isWs(c);
// the last domain scan: where it started and stopped, and for the domain as scanned and for it without the trailing
// "." and "_" (the GFM rules trim those before the domain is judged): its last two dots and the last "_" of each of its
// last two segments. A scan from any later start inside it stops at the same place (a stop depends only on the
// characters), so a start inside it is answered from these without reading again.
interface DomTail { end: number; lastDot: number; prevDot: number; underLast: number; underPrev: number }
const dom = { src: "", max: -1, from: -1, end: -1, full: null as DomTail | null, trimmed: null as DomTail | null };
function domTail(src: string, from: number, end: number): DomTail {
  // read back from end over at most the last two segments
  const t: DomTail = { end, lastDot: -1, prevDot: -1, underLast: -1, underPrev: -1 };
  for (let k = end - 1; k >= from; k--) {
    const c = src.charCodeAt(k);
    if (c === 0x2e) { if (t.lastDot < 0) t.lastDot = k; else { t.prevDot = k; break; } }
    else if (c === 0x5f) { if (t.lastDot < 0) { if (t.underLast < 0) t.underLast = k; } else if (t.underPrev < 0) t.underPrev = k; }
  }
  return t;
}
/** The end of the domain characters at i (segments of letters, digits, - and _, joined by dots), or -1 when there are none. */
function domainEnd(src: string, i: number, max: number): number {
  if (!(dom.src === src && dom.max === max && i >= dom.from && i < dom.end)) {
    let j = i, segLen = 0;
    for (; j < max; j++) {
      const c = src.charCodeAt(j);
      if (c === 0x2e) { if (segLen === 0) break; if (j + 1 >= max || !isDomainCh(src.charCodeAt(j + 1))) break; segLen = 0; continue; }
      if (!isDomainCh(c)) break;
      segLen++;
    }
    dom.src = src; dom.max = max; dom.from = i; dom.end = j; dom.full = null; dom.trimmed = null;
  }
  return dom.end > i && src.charCodeAt(i) !== 0x2e ? dom.end : -1;
}
/** Whether the domain from i to end (dom.end, or dom.end less its trailing "." and "_") is valid: no _ in its last two
 * segments, and a dot when one is needed. */
function domainOk(src: string, i: number, end: number, needDot: boolean): boolean {
  let t: DomTail;
  if (end === dom.end) t = dom.full ??= domTail(src, dom.from, dom.end);
  else {
    t = dom.trimmed ??= (() => { let e = dom.end; while (e > dom.from && (src.charCodeAt(e - 1) === 0x2e || src.charCodeAt(e - 1) === 0x5f)) e--; return domTail(src, dom.from, e); })();
    if (end !== t.end) return false;
  }
  if (end <= i) return false;
  const dots = t.lastDot >= i;
  return !(t.underLast >= i || (dots && t.underPrev >= i) || (needDot && !dots));
}
// The run a link's end is read from: from a domain's end to white space or "<". Every start inside the run shares it, so
// it is read once: where it stops, where its ( and ) are, and its trailing punctuation (the GFM rules: ? ! . , : * _ ~
// " ', an unbalanced ")", an entity-like "&x;"), read back once from the stop. The ")" in that tail are listed in the
// order they are met: a link whose ")" outnumber its "(" by k keeps the tail up to the (k+1)th of them.
const run = { src: "", max: -1, from: -1, stop: -1, opens: [] as number[], closes: [] as number[], tailParens: [] as number[], tailEnd: -1 };
const isTrailCh = (c: number) => c === 0x3f || c === 0x21 || c === 0x2e || c === 0x2c || c === 0x3a || c === 0x2a || c === 0x5f || c === 0x7e || c === 0x22 || c === 0x27;
/** Where a link ends whose domain ends at d: the run to white space or "<", less the trailing punctuation. */
function linkEnd(src: string, d: number, max: number): number {
  if (!(run.src === src && run.max === max && d >= run.from && d <= run.stop)) {
    const opens: number[] = [], closes: number[] = [];
    let stop = d;
    for (; stop < max; stop++) { const ch = src.charCodeAt(stop); if (isWs(ch) || ch === 0x3c) break; if (ch === 0x28) opens.push(stop); else if (ch === 0x29) closes.push(stop); }
    const tailParens: number[] = [];
    let end = stop;
    for (;;) {
      const c = src.charCodeAt(end - 1);
      if (isTrailCh(c)) { end--; continue; }
      if (c === 0x29) { tailParens.push(end - 1); end--; continue; }
      if (c === 0x3b) { let k = end - 2; while (k > d && isAlnum(src.charCodeAt(k))) k--; end = k < end - 2 && src.charCodeAt(k) === 0x26 ? k : end - 1; continue; }
      break;
    }
    run.src = src; run.max = max; run.from = d; run.stop = stop; run.opens = opens; run.closes = closes; run.tailParens = tailParens; run.tailEnd = end;
  }
  const more = (run.closes.length - lowerBound(run.closes, d)) - (run.opens.length - lowerBound(run.opens, d));
  return more >= 0 && more < run.tailParens.length ? run.tailParens[more] + 1 : more < 0 && run.tailParens.length ? run.tailParens[0] + 1 : run.tailEnd;
}
function autolinkLiteral(state: StateInline, silent: boolean): boolean {
  // never inside a link, nor while markdown-it looks for the end of a link's text (silent): brackets come first
  if (state.linkLevel > 0 || silent) return false;
  const src: string = state.src, pos: number = state.pos, max: number = state.posMax;
  if (isLocalCh(src.charCodeAt(pos)) && emailLiteral(state, silent)) return true;
  if (!litStart(src, pos)) return false;
  const pre = litPrefix(src, pos);
  const www = (src.charCodeAt(pos) | 0x20) === 0x77;
  const d = domainEnd(src, pos + pre, max);
  if (d < 0) return false;
  const end = linkEnd(src, d, max);
  if (end <= pos + pre || !domainOk(src, pos + pre, Math.min(end, d), false)) return false;
  if (!silent) {
    const text = src.slice(pos, end);
    pushLink(state, www ? "http://" + text : text, text);
  }
  state.pos = end;
  return true;
}
const isLocalCh = (c: number) => isAlnum(c) || c === 0x2e || c === 0x2b || c === 0x2d || c === 0x5f;
// an e-mail address from its first character: a run of letters, digits and . + - _, "@", then a domain (letters, digits,
// - and _ in parts joined by dots, at least one dot, not ending in - or _). The run's end and the domain's end are kept,
// so asking again from a later place in the same run reads nothing twice.
const mail = { src: "", runFrom: -1, runEnd: -1, domAt: -1, domEnd: -1 };
function emailAt(src: string, p: number, max: number): number {
  if (!(mail.src === src && p >= mail.runFrom && p <= mail.runEnd)) {
    let e = p; while (e < src.length && isLocalCh(src.charCodeAt(e))) e++;
    if (mail.src !== src) { mail.domAt = -1; mail.domEnd = -1; dom.src = ""; run.src = ""; }
    mail.src = src; mail.runFrom = p; mail.runEnd = e;
  }
  const at = mail.runEnd;
  if (at <= p || src.charCodeAt(at) !== 0x40) return -1;
  if (mail.domAt !== at) {
    mail.domAt = at; mail.domEnd = -1;
    let j = at + 1, dots = 0, seg = 0;
    for (; j < src.length; j++) {
      const ch = src.charCodeAt(j);
      if (ch === 0x2e) { const nx = src.charCodeAt(j + 1); if (seg === 0 || !(isAlnum(nx) || nx === 0x2d || nx === 0x5f)) break; dots++; seg = 0; continue; }
      if (!(isAlnum(ch) || ch === 0x2d || ch === 0x5f)) break;
      seg++;
    }
    const last = src.charCodeAt(j - 1);
    if (dots > 0 && seg > 0 && last !== 0x2d && last !== 0x5f) mail.domEnd = j;
  }
  return mail.domEnd > 0 && mail.domEnd <= max ? mail.domEnd : -1;
}
function emailLiteral(state: StateInline, silent: boolean): boolean {
  const src: string = state.src, pos: number = state.pos;
  if (pos > 0 && isLocalCh(src.charCodeAt(pos - 1))) return false;
  const end = emailAt(src, pos, state.posMax);
  if (end < 0) return false;
  if (!silent) pushLink(state, "mailto:" + src.slice(pos, end), src.slice(pos, end));
  state.pos = end;
  return true;
}
function pushLink(state: StateInline, href: string, text: string) {
  const o = state.push("link_open", "a", 1); o.attrs = [["href", href]]; o.markup = "linkify"; o.info = "auto";
  const t = state.push("text", "", 0); t.content = text;
  const cl = state.push("link_close", "a", -1); cl.markup = "linkify"; cl.info = "auto";
}

// ---- GFM strikethrough: a run of one or two tildes, closed by a run of the same length (three or more is text)
const TILDE1 = 0x7e + 0x10000;   // a private marker for the one-tilde run, so pairs never mix lengths
function strikeTokenize(state: StateInline, silent: boolean): boolean {
  if (silent || state.src.charCodeAt(state.pos) !== 0x7e) return false;
  const scanned = state.scanDelims(state.pos, true);
  const len: number = scanned.length;
  const t = state.push("text", "", 0);
  t.content = "~".repeat(len);
  if (len <= 2) state.delimiters.push({ marker: len === 2 ? 0x7e : TILDE1, length: 0, token: state.tokens.length - 1, end: -1, open: scanned.can_open, close: scanned.can_close });
  state.pos += len;
  return true;
}
function strikePairs(state: StateInline, delimiters: any[]) {
  for (const d of delimiters) {
    if ((d.marker !== 0x7e && d.marker !== TILDE1) || d.end === -1) continue;
    const md = d.marker === 0x7e ? "~~" : "~";
    const a = state.tokens[d.token], b = state.tokens[delimiters[d.end].token];
    a.type = "s_open"; a.tag = "s"; a.nesting = 1; a.markup = md; a.content = "";
    b.type = "s_close"; b.tag = "s"; b.nesting = -1; b.markup = md; b.content = "";
  }
}
function strikePost(state: StateInline) {
  strikePairs(state, state.delimiters);
  for (const m of state.tokens_meta) if (m?.delimiters) strikePairs(state, m.delimiters);
}

// ---- the two inline parts, :kbd[...] and :mouse[...] (at most 200 characters inside: a bounded look ahead)
function inlinePart(name: "kbd" | "mouse") {
  const open = `:${name}[`;
  return (state: StateInline, silent: boolean): boolean => {
    const src: string = state.src, pos: number = state.pos, max: number = state.posMax;
    if (src.charCodeAt(pos) !== 0x3a || !src.startsWith(open, pos)) return false;
    const from = pos + open.length;
    let j = from;
    while (j < max && j - from <= 200) { const c = src.charCodeAt(j); if (c === 0x5d || c === 0x0a) break; j++; }
    if (j >= max || src.charCodeAt(j) !== 0x5d || j === from || j - from > 200) return false;
    if (!silent) { const t = state.push(name, "", 0); t.content = src.slice(from, j); t.markup = src.slice(pos, j + 1); }
    state.pos = j + 1;
    return true;
  };
}
// ---- a host's inline references: tried where the run's one search found a match
function refRule(finders: RefFinder[]) {
  return (state: StateInline, silent: boolean): boolean => {
    for (const f of finders) {
      f.at.lastIndex = state.pos;
      const mm = f.at.exec(state.src);
      if (!mm || !mm[0] || mm.index !== state.pos || state.pos + mm[0].length > state.posMax) continue;
      let data: unknown = mm[0];
      try { if (f.def.parse) data = f.def.parse(mm); } catch { continue; }
      if (!silent) { const t = state.push("dh-ref", "", 0); t.content = mm[0]; t.markup = mm[0]; t.meta = { name: f.name, data }; }
      state.pos += mm[0].length;
      return true;
    }
    return false;
  };
}
// ---- marks read from the source itself (InlineRaw: maths). They run before escapes and emphasis, so the author's `\\`, `_` and `*` are not touched.
function rawInline(state: StateInline, silent: boolean): boolean {
  const run: InlineRun | undefined = (state.env as any).dhRun;
  if (!run || !run.active.length) return false;
  const c = state.src[state.pos];
  for (const a of rawParts(run)) {
    if (!a.def.raw!.chars.includes(c)) continue;
    const r = matchRaw(run, a, state.src, state.pos, state.posMax, false);
    if (!r || !(r.end > state.pos) || r.end > state.posMax) continue;
    if (!silent) { const t = state.push("dh-ref", "", 0); t.content = state.src.slice(state.pos, r.end); t.markup = t.content; t.meta = { name: a.def.name, data: r.data, problem: r.problem, level: r.level }; }
    state.pos = r.end;
    return true;
  }
  return false;
}
/** A mark that stands alone on its lines at the top level of the page (a `$$` formula), as a paragraph of its own: the reader's block rules never see its lines. */
function rawBlock(state: any, startLine: number, endLine: number, silent: boolean): boolean {
  const run: InlineRun | undefined = state.env.dhRun;
  if (!run || !run.active.length || state.parentType !== "root" || state.level !== 0) return false;
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  const src: string = state.src, pos: number = state.bMarks[startLine] + state.tShift[startLine];
  const c = src[pos];
  for (const a of rawParts(run)) {
    if (!a.def.raw!.chars.includes(c)) continue;
    const r = matchRaw(run, a, src, pos, src.length, true);
    if (!r || !(r.end > pos) || r.data === undefined) continue;
    let last = startLine;
    while (last + 1 < endLine && state.bMarks[last + 1] < r.end) last++;
    if (state.bMarks[last] + state.tShift[last] > r.end || src.slice(r.end, state.eMarks[last]).trim() !== "") continue;
    if (silent) return true;
    const open = state.push("paragraph_open", "p", 1); open.map = [startLine, last + 1];
    const inl = state.push("inline", "", 0); inl.map = [startLine, last + 1]; inl.content = src.slice(pos, r.end);
    const ref = new state.Token("dh-ref", "", 0);
    ref.content = ref.markup = inl.content; ref.meta = { name: a.def.name, data: r.data, problem: r.problem, level: r.level };
    inl.children = [ref];
    state.push("paragraph_close", "p", -1);
    state.line = last + 1;
    return true;
  }
  return false;
}
// ---- task list items (GFM): "[ ] " or "[x] " at the start of an item's first paragraph
function taskItems(state: StateCore) {
  const toks: Tok[] = state.tokens;
  for (let i = 0; i + 2 < toks.length; i++) {
    if (toks[i].type !== "list_item_open" || toks[i + 1].type !== "paragraph_open" || toks[i + 2].type !== "inline") continue;
    const inl = toks[i + 2], m = /^\[([ xX])\][ \t]+/.exec(inl.content);
    if (!m) continue;
    toks[i].meta = { task: true, checked: m[1] !== " " };
    inl.content = inl.content.slice(m[0].length);
  }
}

// ---- inside a list item, an ordered list of any start ends the item's paragraph and nests (CommonMark lets only "1." do
// that; 0.6.0 nested any number, and pages count on it: "5. ... \n   6. to 11. ...")
function subList(state: any, line: number, _end: number, silent: boolean): boolean {
  if (!silent || state.parentType !== "paragraph" || state.listIndent < 0) return false;
  if (state.sCount[line] < state.blkIndent || state.sCount[line] - state.blkIndent >= 4) return false;
  const src: string = state.src, max: number = state.eMarks[line];
  let p: number = state.bMarks[line] + state.tShift[line];
  const s = p;
  while (p < max && p - s < 9 && src.charCodeAt(p) >= 0x30 && src.charCodeAt(p) <= 0x39) p++;
  if (p === s || p >= max || (src.charCodeAt(p) !== 0x2e && src.charCodeAt(p) !== 0x29)) return false;
  p++;
  if (p < max && !isSp(src.charCodeAt(p))) return false;
  while (p < max && isSp(src.charCodeAt(p))) p++;
  return p < max;
}
// ---- white space at the start of a paragraph's lines stays in its text, as 0.6.0's tree had it (a page shows it the same)
// 0.6.0 (marked) read a list item's own paragraphs as text, with a line indented four or more past the item losing four
// spaces (it was read as code and joined to the text); after a list inside the item, the item's paragraphs were
// paragraphs again, lines as written. One frame per nested block parse says which applies.
interface Frame { parent: string; afterList: boolean }
function keepLineStarts(md: Reader) {
  const block = md.block as any, tokenize = block.tokenize.bind(block);
  block.tokenize = (state: any, start: number, end: number) => {
    const frames: Frame[] = (state.env.__dhFrames ??= []);
    frames.push({ parent: state.parentType, afterList: false });
    try { tokenize(state, start, end); } finally { frames.pop(); }
  };
  const list = (md.block.ruler as any).__rules__.find((r: any) => r.name === "list");
  const listFn = list.fn, listAlt = [...list.alt];
  md.block.ruler.at("list", (state: any, start: number, end: number, silent: boolean) => {
    const ok = listFn(state, start, end, silent);
    if (ok && !silent) { const fr: Frame[] | undefined = state.env.__dhFrames; if (fr?.length) fr[fr.length - 1].afterList = true; }
    return ok;
  }, { alt: listAlt });
  const para = (md.block.ruler as any).__rules__.find((r: any) => r.name === "paragraph").fn;
  md.block.ruler.at("paragraph", (state: any, start: number, end: number, silent: boolean) => {
    const n = state.tokens.length;
    const ok = para(state, start, end, silent);
    const inl = state.tokens[n + 1];
    if (!ok || silent || inl?.type !== "inline") return ok;
    const lead = state.sCount[start] - state.blkIndent;
    if (lead > 0) inl.content = " ".repeat(lead) + inl.content;
    const fr: Frame[] | undefined = state.env.__dhFrames, top = fr?.[fr.length - 1];
    if (top?.parent === "list") {
      state.tokens[n].meta = { dhKind: top.afterList ? "p" : "text" };
      if (!top.afterList && inl.content.includes("\n    ")) inl.content = inl.content.replace(/\n {4}/g, "\n");
    }
    return ok;
  });
  // a line break (soft, or two spaces, or a backslash) no longer drops the next line's leading spaces
  md.inline.ruler.at("newline", (state: StateInline, silent: boolean) => {
    if (state.src.charCodeAt(state.pos) !== 0x0a) return false;
    if (!silent) {
      const pend: string = state.pending, pmax = pend.length - 1;
      if (pmax >= 0 && pend.charCodeAt(pmax) === 0x20) {
        if (pmax >= 1 && pend.charCodeAt(pmax - 1) === 0x20) { let ws = pmax - 1; while (ws >= 1 && pend.charCodeAt(ws - 1) === 0x20) ws--; state.pending = pend.slice(0, ws); state.push("hardbreak", "br", 0); }
        else { state.pending = pend.slice(0, -1); state.push("softbreak", "br", 0); }
      } else state.push("softbreak", "br", 0);
    }
    state.pos++;
    return true;
  });
  md.inline.ruler.before("escape", "dh-escape-break", (state: StateInline, silent: boolean) => {
    if (state.src.charCodeAt(state.pos) !== 0x5c || state.src.charCodeAt(state.pos + 1) !== 0x0a || state.pos + 1 >= state.posMax) return false;
    if (!silent) state.push("hardbreak", "br", 0);
    state.pos += 2;
    return true;
  });
}

function makeReader(defs: InlineDef<any, any>[] | undefined, lazyInline = false): Reader {
  const finders: RefFinder[] = (defs ?? []).map((d) => {
    if (!/^[a-z][a-z0-9-]{0,40}$/.test(d.name)) throw new Error(`durian-markdown: an inline name is lower case letters, digits and dashes: "${d.name}"`);
    const flags = d.match.flags.replace(/[gy]/g, "");
    return { name: d.name, def: d, find: new RegExp(d.match.source, flags + "g"), at: new RegExp(d.match.source, flags + "y") };
  });
  const md = new MarkdownIt("default", { html: true, linkify: false, typographer: false, breaks: false, maxNesting: 100 });
  md.disable(["linkify", "replacements", "smartquotes", "text_join", "strikethrough"]);
  // the URL policy is this module's: markdown-it neither drops nor rewrites an address (no percent encoding, no punycode)
  md.validateLink = () => true;
  md.normalizeLink = (u: string) => u;
  md.normalizeLinkText = (u: string) => u;
  // a link's address and title as written, with backslash escapes resolved and character references kept (decodeRefs and
  // the policy read them; the tree shows a title as written, as 0.6.0 did)
  const h = md.helpers as any;
  const dest = h.parseLinkDestination, title = h.parseLinkTitle;
  md.helpers = {
    ...h,
    parseLinkDestination(str: string, start: number, max: number) {
      const r = dest(str, start, max);
      if (r.ok) { let raw = str.slice(start, r.pos); if (raw.charCodeAt(0) === 0x3c) raw = raw.slice(1, -1); r.str = unescapePunct(raw); }
      return r;
    },
    parseLinkTitle(str: string, start: number, max: number, prev?: any) {
      const r = title(str, start, max, prev);
      if (r.ok && !prev) r.str = unescapePunct(str.slice(start + 1, r.pos - 1));
      return r;
    },
  } as any;
  md.inline.ruler.at("text", textRule(finders));
  md.inline.ruler.after("text", "dh-kbd", inlinePart("kbd"));
  md.inline.ruler.after("dh-kbd", "dh-mouse", inlinePart("mouse"));
  let last = "dh-mouse";
  if (finders.length) { md.inline.ruler.after("dh-mouse", "dh-ref", refRule(finders)); last = "dh-ref"; }
  md.inline.ruler.after(last, "dh-autolit", autolinkLiteral);
  md.inline.ruler.before("link", "dh-reference", referenceRule);
  md.inline.ruler.before("escape", "dh-raw", rawInline);
  md.block.ruler.before("fence", "dh-raw-block", rawBlock, { alt: ["paragraph", "reference", "blockquote", "list"] });
  md.inline.ruler.before("emphasis", "dh-strike", strikeTokenize);
  md.inline.ruler2.before("emphasis", "dh-strike", strikePost);
  md.block.ruler.before("list", "dh-sublist", subList, { alt: ["paragraph"] });
  md.core.ruler.after("block", "dh-task", taskItems);
  keepLineStarts(md);
  // inline text has a nesting cap of its own, smaller than the blocks' (a link inside emphasis inside a link is 3): the
  // reader's look ahead for a missing "]" goes one level deeper each time, so its cost is this cap times the text
  md.core.ruler.before("inline", "dh-inline-cap", (state: StateCore) => { state.md.options.maxNesting = INLINE_NEST; });
  // mdBlocks reads each block's inline text when it converts that block (kidsOf), so the inline tokens of the whole
  // text never exist at once: the same rules on the same text, a smaller peak of memory
  if (lazyInline) md.core.ruler.disable(["dh-inline-cap", "inline"]);
  return md;
}
/** A fresh reader with the rules mdBlocks uses (for tests and tools that count its work; mdBlocks keeps its own). */
export const newReader = (inlines?: InlineDef<any, any>[]): Reader => makeReader(inlines);
const plainReader = makeReader(undefined, true);
const withRefs = new WeakMap<InlineDef<any, any>[], Reader>();
function readerFor(defs: InlineDef<any, any>[] | undefined): Reader {
  if (!defs?.length) return plainReader;
  let m = withRefs.get(defs);
  if (!m) { m = makeReader(defs, true); withRefs.set(defs, m); }
  return m;
}
// the reader's own nesting cap: room for every nesting mdBlocks lets through (maxDepth containers, two levels each, and the
// blocks inside), and small, because inside a link's text the reader may look ahead once per level
const nestCap = (maxDepth: number) => Math.max(40, 3 * maxDepth + 10);
const INLINE_NEST = 20;
// the reader and env of the text being converted: an inline token's children are read from them when it is converted
let cur: { md: Reader; env: any } | null = null;
function lex(src: string, defs: InlineDef<any, any>[] | undefined, maxDepth: number, inlineRun?: InlineRun): { toks: Tok[]; md: Reader; env: any } {
  const md = readerFor(defs), env: any = { dhRun: inlineRun };
  md.options.maxNesting = nestCap(maxDepth);
  const toks = md.parse(src, env);
  mail.src = ""; dom.src = ""; run.src = ""; // the e-mail, domain and link-end scans' caches need not hold the text
  return { toks, md, env };
}
/** The inline tokens of an inline token, read now (with the inline nesting cap) and not kept on it. */
function kidsOf(t: Tok | undefined): Tok[] {
  if (!t || t.type !== "inline") return [];
  if (t.children?.length || !t.content) return t.children ?? [];
  if (!cur) return [];
  const md = cur.md, keep = md.options.maxNesting, out: Tok[] = [];
  md.options.maxNesting = INLINE_NEST;
  try { md.inline.parse(t.content, md, cur.env, out); } finally { md.options.maxNesting = keep; }
  mail.src = ""; dom.src = ""; run.src = "";
  return out;
}
/** Run f with the reader and env of a lexed text current (kidsOf reads from them); nested calls restore the outer one. */
function withText<T>(l: { md: Reader; env: any }, f: () => T): T {
  const outer = cur; cur = l;
  try { return f(); } finally { cur = outer; }
}

// ---------------------------------------------------------------------------------------------------------------

/** The anchor GitHub gives a heading (github-slugger 2.0.0): lower case, punctuation dropped, each space becomes "-",
 *  letters and digits of any script kept, no length cut. "cyan.yaml" is "cyanyaml". It does not count repeats (see headingId). */
export function slug(s: string): string { return githubSlug(s); }
/** The id of the next heading of a document: GitHub's slug, a repeat numbered the GitHub way (x, x-1, x-2), then idPrefix.
 *  ctx.slugger holds the repeats, one per document. A heading with no slug at all (no letter, digit, "-" or "_") gets "S" when there is no prefix (a slug is never upper case, so "S" never repeats one). */
export function headingId(text: string, ctx: MdContext): string {
  return ctx.idPrefix + ctx.slugger.slug(text) || "S";
}
/** The plain text of an inline tree (what a heading's id is made from; a table cell's label). */
export const inlineText = (c: MdInline[]): string => c.map((x) => (x.t === "ref" ? x.text : x.t === "reference" ? (x.label ?? x.name) : "v" in x ? x.v : "c" in x ? inlineText(x.c) : x.t === "kbd" ? x.label : x.t === "mouse" ? `${x.act} ${x.target}`.trim() : x.t === "img" ? x.alt : "")).join("");
const plain = inlineText;
/** The text github.com reads a heading's anchor from: the rendered text content. Code spans, links, emphasis and escapes give their text;
 *  an image, a line break and the tags of raw HTML give nothing; numeric character references and amp, lt, gt, quot, apos, nbsp are decoded
 *  (any other named reference stays as typed: this page shows it as typed too); every other syntax (:kbd[], :mouse[], a host's inline
 *  reference) GitHub does not know, so it reads as the source text. */
const GH_NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function ghRefs(s: string): string {
  return s.replace(/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|(amp|lt|gt|quot|apos|nbsp));/g, (m, d, h, n) => {
    if (n) return GH_NAMED[n];
    const c = d !== undefined ? parseInt(d, 10) : parseInt(h, 16);
    return c > 0 && c < 0x110000 && !(c >= 0xd800 && c < 0xe000) ? String.fromCodePoint(c) : "�";
  });
}
/** The text of raw HTML as GitHub's page shows it: comments, processing instructions and tags (an attribute may hold ">") give nothing;
 *  the tags GitHub's tag filter turns into literal text (title, textarea, style, xmp, iframe, noembed, noframes, script, plaintext) stay as typed. */
const FILTERED = /^<\/?(?:title|textarea|style|xmp|iframe|noembed|noframes|script|plaintext)(?=[\s/>])/i;
function htmlText(h: string): string {
  // one inline HTML token is one tag, comment or instruction (markdown-it's html_inline): never more than one to drop
  return FILTERED.test(h) ? h : "";
}
function ghText(toks: Tok[] | null | undefined): string {
  let out = "";
  for (const t of toks ?? []) {
    switch (t.type) {
      case "text": out += ghRefs(t.content); break;
      case "text_special": out += ghRefs(t.info === "entity" ? t.markup : t.content); break;
      case "softbreak": out += "\n"; break;
      case "code_inline": out += t.content; break;
      case "image": case "hardbreak": break;
      case "html_inline": out += htmlText(t.content); break;
      case "kbd": case "mouse": case "dh-ref": case "dh-reference": out += ghRefs(t.markup); break;
      default: break;   // the open and close tokens of strong, em, s and links: their text comes in between
    }
  }
  return out;
}
/** Count a heading that carries no id of its own (a tab or an accordion title) in the document's repeat counter, as GitHub counts every heading. */
export function countHeading(line: string, ctx: MdContext): void {
  const l = lex(line, ctx.inlines, ctx.maxDepth, ctx.inlineParts), toks = l.toks;
  const i = toks.findIndex((t) => t.type === "heading_open");
  if (i >= 0) ctx.slugger.slug(ghText(withText(l, () => kidsOf(toks[i + 1]))));
}

/** How deep a line opens containers: the quote marks and list markers it starts with (each nests once), and its indent
 *  (two columns a level). One pass over the line. */
function lineNesting(l: string): { marks: number; quotes: number; indent: number } {
  let i = 0, col = 0, marks = 0, quotes = 0, indent = -1;
  for (;;) {
    while (i < l.length && isSp(l.charCodeAt(i))) { col += l.charCodeAt(i) === 0x09 ? 4 - (col % 4) : 1; i++; }
    if (indent < 0) indent = col;
    const c = l.charCodeAt(i);
    if (c === 0x3e) { marks++; quotes++; i++; col++; continue; }
    if ((c === 0x2d || c === 0x2a || c === 0x2b) && (i + 1 >= l.length || isSp(l.charCodeAt(i + 1)))) { marks++; i++; col++; continue; }
    let j = i; while (j < l.length && j - i < 9 && l.charCodeAt(j) >= 0x30 && l.charCodeAt(j) <= 0x39) j++;
    if (j > i && (l.charCodeAt(j) === 0x2e || l.charCodeAt(j) === 0x29) && (j + 1 >= l.length || isSp(l.charCodeAt(j + 1)))) { marks++; col += j + 1 - i; i = j + 1; continue; }
    return { marks, quotes, indent: Math.max(0, indent) };
  }
}

/** Markdown text to blocks. Never throws: a problem becomes a "raw" block and a message in ctx.problems. */
export function mdBlocks(src: string, ctx: MdContext): MdBlock[] {
  // the page's inline parts: made by parse() once; a caller that gave none gets the parts for an empty page
  ctx.inlineParts ??= prepareInlines({}, [], LIMITS);
  // a nesting deeper than the cap is refused before the reader sees it (each level is a frame of the reader's stack, and
  // past its own cap the reader would drop the rest of the text)
  let deep = false;
  const lines = src.split("\n");
  for (const l of lines) {
    const n = lineNesting(l);
    if (n.quotes > ctx.maxDepth || n.marks > ctx.maxDepth * 2 || (n.indent / 2 > ctx.maxDepth * 2 && n.marks > 0)) { deep = true; break; }
  }
  if (deep) { ctx.problems.push({ line: ctx.line, message: `Markdown nested deeper than ${ctx.maxDepth} levels; shown as plain text` }); return [{ t: "raw", text: src }]; }
  let lx: ReturnType<typeof lex>;
  try { lx = lex(src, ctx.inlines, ctx.maxDepth, ctx.inlineParts); }
  catch (e) { ctx.problems.push({ line: ctx.line, message: `Markdown could not be read: ${(e as Error).message}` }); return [{ t: "raw", text: src }]; }
  const toks = lx.toks;
  if (toks.some((t) => t.level >= nestCap(ctx.maxDepth) - 2)) { ctx.problems.push({ line: ctx.line, message: `Markdown nested deeper than ${ctx.maxDepth} levels; shown as plain text` }); return [{ t: "raw", text: src }]; }
  return withText(lx, () => blocks(toks, 0, toks.length, ctx, 0, lines));
}

/** The index just after the close token that matches the open token at i. */
function closeOf(toks: Tok[], i: number, end: number): number {
  let n = 0;
  for (let j = i; j < end; j++) { n += toks[j].nesting; if (n === 0) return j; }
  return end - 1;
}
const srcOf = (toks: Tok[], i: number, end: number, lines: string[]): string => {
  // the source lines of a block range (the "too deep" fallback shows them as written)
  let a = -1, b = -1;
  for (let j = i; j < end; j++) { const m = toks[j].map; if (m) { if (a < 0 || m[0] < a) a = m[0]; b = Math.max(b, m[1]); } }
  return a < 0 ? inlineRaw(toks, i, end) : lines.slice(a, b).join("\n");
};
function blocks(toks: Tok[], from: number, to: number, ctx: MdContext, depth: number, lines: string[]): MdBlock[] {
  if (depth > ctx.maxDepth) { ctx.problems.push({ line: ctx.line, message: `Markdown nested deeper than ${ctx.maxDepth} levels; the rest is plain text` }); return [{ t: "raw", text: srcOf(toks, from, to, lines) }]; }
  const out: MdBlock[] = [];
  for (let i = from; i < to; i++) {
    const t = toks[i];
    switch (t.type) {
      case "paragraph_open": {
        ctx.runLine = ctx.line + (t.map?.[0] ?? 0);
        const inl = toks[i + 1];
        const c = kidsOf(inl);
        // a list item's own paragraphs are "text", tight or loose (0.6.0's tree; a loose list draws as a tight one)
        // a list item's own paragraph: the kind the reader set (keepLineStarts), else tight text or a paragraph
        const kind = (t.meta as { dhKind?: string } | null)?.dhKind ?? (t.hidden ? "text" : "p");
        out.push(kind === "text" ? { t: "text", c: inlines(c, 0, c.length, ctx, depth) } : { t: "p", c: inlines(c, 0, c.length, ctx, depth) });
        i = closeOf(toks, i, to);
        break;
      }
      case "heading_open": {
        const c = kidsOf(toks[i + 1]);
        ctx.noScan = (ctx.noScan ?? 0) + 1;
        let tree: MdInline[];
        try { tree = inlines(c, 0, c.length, ctx, depth); } finally { ctx.noScan--; }
        const text = plain(tree);
        const id = headingId(ghText(c), ctx);
        const d = +t.tag.slice(1);
        if (ctx.inlineParts) inlineSection(ctx.inlineParts, d);
        ctx.heads.push({ depth: d, text, id });
        out.push({ t: "h", depth: d, id, text, c: tree });
        i = closeOf(toks, i, to);
        break;
      }
      case "fence": {
        const info = unescapePunct(t.info.trim());
        const meta = info.replace(/^\S*\s*/, "").slice(0, 500);
        out.push({ t: "code", lang: info.split(/\s/)[0].slice(0, 30), ...(meta ? { meta } : {}), text: t.content.replace(/\n$/, "") });
        break;
      }
      case "code_block": out.push({ t: "code", lang: "", text: t.content.replace(/\n+$/, "") }); break;
      case "hr": out.push({ t: "hr" }); break;
      case "bullet_list_open": case "ordered_list_open": {
        const end = closeOf(toks, i, to);
        const ordered = t.type === "ordered_list_open";
        const items: { task: boolean; checked: boolean; c: MdBlock[] }[] = [];
        for (let j = i + 1; j < end; j++) {
          if (toks[j].type !== "list_item_open") continue;
          const e = closeOf(toks, j, end);
          const meta = toks[j].meta as { task?: boolean; checked?: boolean } | null;
          items.push({ task: !!meta?.task, checked: !!meta?.checked, c: blocks(toks, j + 1, e, ctx, depth + 1, lines) });
          j = e;
        }
        const st = t.attrGet("start");
        out.push({ t: "list", ordered, start: ordered ? (st != null ? +st : 1) : null, items });
        i = end;
        break;
      }
      case "blockquote_open": {
        const end = closeOf(toks, i, to);
        out.push(quote(toks, i + 1, end, ctx, depth, lines));
        i = end;
        break;
      }
      case "table_open": {
        ctx.runLine = ctx.line + (t.map?.[0] ?? 0);
        const end = closeOf(toks, i, to);
        const align: ("left" | "right" | "center" | null)[] = [], head: MdInline[][] = [], rows: MdInline[][][] = [];
        let row: MdInline[][] | null = null, inHead = false;
        for (let j = i + 1; j < end; j++) {
          const x = toks[j];
          if (x.type === "thead_open") inHead = true;
          else if (x.type === "thead_close") inHead = false;
          else if (x.type === "tr_open") row = [];
          else if (x.type === "tr_close") { if (row && !inHead) rows.push(row); row = null; }
          else if (x.type === "th_open" || x.type === "td_open") {
            const c = kidsOf(toks[j + 1]);
            const cell = inlines(c, 0, c.length, ctx, depth + 1);
            if (inHead) { head.push(cell); const s = /text-align:(left|right|center)/.exec(String(x.attrGet("style") ?? "")); align.push(s ? (s[1] as "left" | "right" | "center") : null); }
            else row?.push(cell);
          }
        }
        out.push({ t: "table", align, head, rows });
        i = end;
        break;
      }
      case "html_block": {
        // as 0.6.0 showed it: the block and the blank lines after it
        let k = t.map ? t.map[1] : 0, tail = "";
        while (t.map && k < lines.length - 1 && /^[ \t]*$/.test(lines[k])) tail += lines[k++] + "\n";
        out.push({ t: "raw", text: t.content + tail });
        break;
      }
      case "inline": { const c = kidsOf(t); out.push({ t: "text", c: inlines(c, 0, c.length, ctx, depth) }); break; }
      default: if (t.nesting === 1) i = closeOf(toks, i, to); break;
    }
  }
  return out;
}
function quote(toks: Tok[], from: number, to: number, ctx: MdContext, depth: number, lines: string[]): MdBlock {
  // a callout: the quote opens with a bold marker word and a colon ("> **Tip:** ...")
  if (toks[from]?.type === "paragraph_open" && toks[from + 1]?.type === "inline") {
    const kids = kidsOf(toks[from + 1]).filter((k) => !(k.type === "text" && !k.content));
    if (kids[0]?.type === "strong_open") {
      const sc = closeOf(kids, 0, kids.length);
      const raw = kids.slice(1, sc).map((k) => (k.type === "text" ? k.content : k.type === "text_special" ? k.content : k.type === "code_inline" ? k.content : "")).join("");
      const word = raw.replace(/:$/, "");
      if (CALLOUT_WORDS[word] && /:$/.test(raw)) {
        const rest = kids.slice(sc + 1);
        // the white space after the label goes; a text node it leaves empty stays, as 0.6.1 had it (before a code span)
        const lead = inlines(rest, 0, rest.length, ctx, depth + 1);
        if (lead[0]?.t === "text" && (rest[0]?.type === "text" || rest[0]?.type === "softbreak")) lead[0] = { t: "text", v: lead[0].v.replace(/^\s+/, "") };
        const pEnd = closeOf(toks, from, to);
        const body: MdBlock[] = [{ t: "p", c: lead }, ...blocks(toks, pEnd + 1, to, ctx, depth + 1, lines)];
        return { t: "callout", kind: CALLOUT_WORDS[word], label: word, c: body };
      }
    }
  }
  return { t: "quote", c: blocks(toks, from, to, ctx, depth + 1, lines) };
}
// the text of a range of inline tokens, as written (the fallback when a tree is too deep)
function inlineRaw(toks: Tok[], from: number, to: number): string {
  let s = "";
  for (let j = from; j < to; j++) { const t = toks[j]; s += t.type === "inline" ? t.content : t.type === "softbreak" ? "\n" : t.markup && t.nesting !== 0 ? t.markup : t.type === "text_special" ? t.markup : t.content ?? ""; }
  return s;
}
function inlines(toks: Tok[], from: number, to: number, ctx: MdContext, depth: number, inLink = false): MdInline[] {
  if (depth > ctx.maxDepth) return [{ t: "text", v: inlineRaw(toks, from, to) }];
  const out: MdInline[] = [];
  // plain text and soft line breaks join into one text node, as the tree had them; an escaped character is a node of its own,
  // except an escaped bracket in a link's text, which joins the text around it (as 0.6.1 had it)
  let buf: string | null = null;
  const flush = () => { if (buf !== null) { pushText(out, decodeEntities(buf), ctx, inLink); buf = null; } };
  for (let i = from; i < to; i++) {
    const t = toks[i];
    switch (t.type) {
      case "text": if (t.content) buf = (buf ?? "") + t.content; break;
      case "softbreak": buf = (buf ?? "") + "\n"; break;
      case "text_special":
        // a reference stays as written; a real escape (a backslash and ASCII punctuation) is a node of its own; a backslash
        // before anything else is plain text, as it was
        if (t.info === "entity" || !(t.markup.length >= 2 && t.content === t.markup.slice(1))) buf = (buf ?? "") + t.markup;
        else if (inLink && (t.content === "[" || t.content === "]")) buf = (buf ?? "") + t.content;
        else { flush(); out.push({ t: "text", v: t.content }); }
        break;
      case "hardbreak": flush(); out.push({ t: "br" }); break;
      case "code_inline": flush(); out.push({ t: "code", v: decodeEntities(t.content) }); break;
      case "strong_open": case "em_open": case "s_open": {
        flush();
        const e = closeOf(toks, i, to);
        out.push({ t: t.type === "strong_open" ? "strong" : t.type === "em_open" ? "em" : "del", c: inlines(toks, i + 1, e, ctx, depth + 1, inLink) });
        i = e;
        break;
      }
      case "link_open": {
        flush();
        const e = closeOf(toks, i, to);
        const c = inlines(toks, i + 1, e, ctx, depth + 1, true);
        const raw = String(t.attrGet("href") ?? "");
        const title = attr(t, "title");
        if (/^code:/i.test(raw)) { out.push({ t: "coderef", ref: raw.slice(5), c }); i = e; break; }
        let href = applyUrlPolicy(decodeRefs(raw), "link", ctx.policy);
        if (href?.startsWith("#") && ctx.idPrefix && !href.startsWith("#" + ctx.idPrefix)) href = "#" + ctx.idPrefix + href.slice(1);
        out.push({ t: "link", href, ...(title ? { title } : {}), c });
        i = e;
        break;
      }
      case "image": {
        flush();
        const title = attr(t, "title");
        out.push({ t: "img", src: applyUrlPolicy(decodeRefs(String(t.attrGet("src") ?? "")), "image", ctx.policy), alt: t.content, ...(title ? { title } : {}) });
        break;
      }
      case "kbd": {
        flush();
        const chords = t.content.split(/\s*,\s*/).map((c) => c.split(/\+(?!$)/));
        out.push({ t: "kbd", chords: chords.map((ks) => ks.map((k) => KEY_GLYPHS[k.toLowerCase()] ?? k)), label: chords.map((ks) => ks.map((k) => KEY_WORDS[k.toLowerCase()] ?? k).join("+")).join(", then ") });
        break;
      }
      case "mouse": {
        flush();
        const m = t.content.trim().match(/^(\S+)\s*(.*)$/);
        const act = m?.[1] ?? "", p = MOUSE_PRESS[act] ?? { press: "", badge: "" };
        out.push({ t: "mouse", act, press: p.press, badge: p.badge, target: (m?.[2] ?? "").replace(/^"|"$/g, "") });
        break;
      }
      case "dh-ref": {
        const m = t.meta as { name: string; data: unknown; problem?: string; level?: "error" | "warn" };
        if (m.problem) ctx.problems.push({ line: ctx.runLine ?? ctx.line, message: `${m.name}: ${m.problem}`, level: m.level });
        if (m.data === undefined) { buf = (buf ?? "") + t.content; break; }   // a wrong use: the text stays as written
        flush(); out.push({ t: "ref", name: m.name, text: t.content, data: m.data }); break;
      }
      case "dh-reference": { flush(); const m = t.meta as { type: string; name: string; label: string | null; bad: string | null }; out.push({ t: "reference", type: m.type, name: m.name, label: m.label, text: t.content, ...(m.bad ? { error: m.bad } : {}) }); break; }
      case "html_inline": flush(); out.push({ t: "text", v: t.content }); break;   // inline HTML: shown as the text it is
      default:
        if (t.nesting === 1) { flush(); const e = closeOf(toks, i, to); out.push(...inlines(toks, i + 1, e, ctx, depth + 1, inLink)); i = e; }
        else if (t.content) buf = (buf ?? "") + t.content;
    }
  }
  flush();
  return out;
}
/** A plain text run to the tree: text, with a ref node for every range an inline part (parts/inline.ts) took. Never inside a link or a
 *  heading (the callers say so): code, images and HTML are not plain text runs at all. */
const MAX_INLINE_PROBLEMS = 100;
function pushText(out: MdInline[], v: string, ctx: MdContext, off: boolean): void {
  const run = ctx.inlineParts;
  if (!run || off || ctx.noScan || !run.active.length || !v) { out.push({ t: "text", v }); return; }
  const found = scanRun(run, v, (p) => {
    if (run.reported++ < MAX_INLINE_PROBLEMS) ctx.problems.push({ line: ctx.runLine ?? ctx.line, message: p.message, level: p.level });
    else if (run.reported === MAX_INLINE_PROBLEMS + 1) ctx.problems.push({ line: ctx.runLine ?? ctx.line, message: `more than ${MAX_INLINE_PROBLEMS} problems with parts of a sentence; the rest are not listed`, level: "warn" });
  });
  if (!found.length) { out.push({ t: "text", v }); return; }
  let at = 0;
  for (const m of found) {
    if (m.from > at) out.push({ t: "text", v: v.slice(at, m.from) });
    out.push({ t: "ref", name: m.name, text: v.slice(m.from, m.to), data: m.data });
    at = m.to;
  }
  if (at < v.length) out.push({ t: "text", v: v.slice(at) });
}
const attr = (t: Tok, k: string): string | undefined => { const v = t.attrGet(k); return v == null ? undefined : String(v); };
// character references stay as written in text; the tree holds the characters of these few (as 0.6.0 did)
function decodeEntities(s: string): string {
  return s.includes("&") ? s.replace(/&(amp|lt|gt|quot|#39|#x27);/g, (_, e) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", "#x27": "'" } as Record<string, string>)[e]) : s;
}

/** Inline Markdown (a code walk's note) to the inline tree. */
export function mdInline(src: string, ctx: MdContext): MdInline[] {
  // a heading inside an inline text (a code walk note) has no id on the page and is not in its table of contents: it must not take a number from the page's counter
  const b = mdBlocks(src, { ...ctx, slugger: new GithubSlugger(), heads: [] });
  const flat = (x: MdBlock): MdInline[] => (x.t === "p" || x.t === "text" || x.t === "h" ? x.c : x.t === "raw" ? [{ t: "text", v: x.text }] : x.t === "code" ? [{ t: "code", v: x.text }] : []);
  return b.flatMap((x, i) => [...(i ? [{ t: "br" } as MdInline] : []), ...flat(x)]);
}
