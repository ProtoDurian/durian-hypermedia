// References in a parsed page (format version 11). The Markdown reader finds `[[<type>:<name> "label"]]` (core/refs.ts);
// this file, called once per Markdown text of the page, does the rest:
//   - a paragraph that is only a reference becomes a ReferenceBlock; a reference inside a sentence stays a chip
//   - every reference is counted against maxReferences and charged to one part budget, "the reference reader"
//   - a bad name is refused with its reason; a reference inside a part another reference resolved to is refused
//   - a fenced ```interactive or ```svg is refused, naming the reference form
//   - with the host's resolveReference, each one is asked; a ready part is read as if it were written there (the page's
//     caps and budgets), so it renders through the same part dispatch as an inline part
// The package never fetches anything: the host answers, now (parse on a server) or later (the React view asks).
import type { Block, ErrorBlock, InteractiveBlock, LlmKind, Problem, ReferenceBlock, SvgBlock } from "./types";
import type { MdBlock, MdInline } from "./markdown";
import { partBudget, BudgetError, type Budget } from "./core/budget";
import { REFERENCE_ONLY, refText } from "./core/refs";
import { svgProblem } from "./core/svg";
import { parseInteractive, checkInteractive, ixHeight } from "./core/interactive";
import { parseAttrs, ALIASES } from "./core/dh-lib";
import { utf8Bytes, type Limits } from "./safety";

/** What the host is asked: the reference's type and name, as written. */
export interface ReferenceQuery { type: string; name: string }
/** The host's answer. `part` is the part's source: as it would be written inline (its fence included), or only what goes
 *  inside the fence; for svg the SVG text, for interactive its @html, @css, @script (and @fallback) sections. */
export type ReferenceAnswer = { state: "pending" } | { state: "ready"; part: string } | { state: "failed"; reason: string };
/** The host's resolver. It never fetches inside parse(): answer pending, and render again when the part is there.
 *  null or undefined: not the host's to answer (the reference stays unresolved: its label as a chip). */
export type ResolveReference = (ref: ReferenceQuery) => ReferenceAnswer | null | undefined;

type Answer = { state: "unresolved" } | { state: "pending" } | { state: "failed"; reason: string } | { state: "ready"; part: string };
const short = (s: string, n = 200) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const fmt = (n: number) => n.toLocaleString("en-US");

/** A host's answer, checked: anything else than the three states is a failure with a reason. */
export function answerOf(a: unknown): Exclude<Answer, { state: "unresolved" }> {
  const x = a as { state?: unknown; part?: unknown; reason?: unknown } | null | undefined;
  if (x && x.state === "pending") return { state: "pending" };
  if (x && x.state === "ready" && typeof x.part === "string") return { state: "ready", part: x.part };
  if (x && x.state === "failed") return { state: "failed", reason: short(typeof x.reason === "string" && x.reason.trim() ? x.reason.trim() : "the host could not give this part") };
  return { state: "failed", reason: "the host's answer is not pending, ready (with the part's source) or failed" };
}

/** A reference-only type written as a fence (```interactive, ```svg): refused, naming the reference form. */
export const isReferenceOnlyFence = (lang: string) => (REFERENCE_ONLY as readonly string[]).includes(lang.toLowerCase());
export const referenceOnlyMessage = (lang: string) => {
  const t = lang.toLowerCase();
  return `\`\`\`${t} is refused: ${t === "svg" ? "raw SVG" : "an interactive part (HTML, CSS and script)"} exists only as a reference. Store it with the host and write [[${t}:<name> "label"]] on a line of its own`;
};

/** The source a host answered with, without its fence: the fence's attributes and what is inside. A source that does not
 *  open with a fence is all body. */
export function unfence(type: string, source: string): { attrs: Record<string, string>; body: string; fenced: boolean } | { error: string } {
  let i = 0;
  while (i < source.length) {
    const e = source.indexOf("\n", i), end = e < 0 ? source.length : e;
    let k = i; while (k < end && source.charCodeAt(k) <= 0x20) k++;
    if (k < end) { i = k; break; }
    i = end + 1;
  }
  const c = source.charCodeAt(i);
  if (c !== 0x60 && c !== 0x7e) return { attrs: {}, body: source, fenced: false };
  let k = i; while (source.charCodeAt(k) === c) k++;
  const run = k - i;
  if (run < 3) return { attrs: {}, body: source, fenced: false };
  const nl = source.indexOf("\n", k), head = source.slice(k, nl < 0 ? source.length : nl);
  let w = 0; while (w < head.length && head.charCodeAt(w) > 0x20 && head[w] !== "{") w++;
  const word = head.slice(0, w);
  if ((ALIASES[word] ?? word) !== type) return { error: `the host's answer is a ${word ? "```" + short(word, 30) : "plain code"} block, not ${type}` };
  const z = source.trimEnd(), last = z.lastIndexOf("\n");
  const close = z.slice(last + 1).trim();
  let n = 0; while (n < close.length && close.charCodeAt(n) === c) n++;
  if (nl < 0 || last < nl || n < run || n !== close.length) return { error: `the host's answer is not one ${type} part: it must end with the fence that closes it` };
  // a line inside that would close the fence makes it two parts (one pass over the lines)
  for (let a = nl + 1; a < last;) {
    const e = source.indexOf("\n", a), end = e < 0 || e > last ? last : e;
    let k = a; while (k < end && (source.charCodeAt(k) === 0x20 || source.charCodeAt(k) === 0x09)) k++;
    let m = k; while (m < end && source.charCodeAt(m) === c) m++;
    if (m - k >= run) { let z = m; while (z < end && source.charCodeAt(z) <= 0x20) z++; if (z === end) return { error: `the host's answer is not one ${type} part: a fence closes inside it` }; }
    a = end + 1;
  }
  const { attrs, words } = parseAttrs(head.slice(w));
  for (const x of words) attrs[x] = "true";
  return { attrs, body: source.slice(nl + 1, last), fenced: true };
}
/** A fenced part's source as one block of the page: as written when it opens with its fence, else wrapped in one
 *  longer than any run of backticks inside. */
export function fencedSource(type: string, source: string): string | { error: string } {
  const u = unfence(type, source);
  if ("error" in u) return u;
  if (u.fenced) return source;
  let most = 0;
  for (let i = 0, run = 0; i < source.length; i++) { if (source.charCodeAt(i) === 0x60) { run++; if (run > most) most = run; } else run = 0; }
  const f = "`".repeat(Math.max(3, most + 1));
  let end = source.length; while (end > 0 && source.charCodeAt(end - 1) === 0x0a) end--;
  return `${f}${type}\n${source.slice(0, end)}\n${f}`;
}

interface Hooks {
  lim: Limits;
  problems: Problem[];
  resolve?: ResolveReference;
  /** read the source of one fenced part (a type of the format or a host block) the way the page reads its own parts */
  readPart(type: string, source: string, line: number): Block[];
  /** Markdown to blocks with the page's context (an interactive part's fallback) */
  md(text: string, line: number): MdBlock[];
  /** count one block against the page's block cap (an svg or interactive part, which readPart does not read): its
   *  message when the page is over it, else null */
  tick(line: number): string | null;
}

// finds each reference's line in a Markdown text, front to back (each character is passed once)
class Lines {
  private pos = 0;
  private lost = false;
  constructor(private s: string, public line: number) {}
  find(needle: string): number {
    if (this.lost || !needle) return this.line;
    const i = this.s.indexOf(needle, this.pos);
    if (i < 0) { this.lost = true; return this.line; }
    for (let k = this.pos; k < i; k++) if (this.s.charCodeAt(k) === 0x0a) this.line++;
    this.pos = i;
    return this.line;
  }
}
type RefInline = Extract<MdInline, { t: "reference" }>;

/** One page's references: made once per parse() call. */
export class RefSession {
  /** references met so far (blocks and chips) */
  count = 0;
  /** above 0 while a part a reference resolved to is read: a reference in it is refused */
  depth = 0;
  private bytes = 0;
  private over = false;
  private budget: Budget | null = null;
  private spent: string | null = null;
  constructor(private h: Hooks) {}

  private err(line: number, message: string) { this.h.problems.push({ line, level: "error", message }); }

  /** null: the reference may be used; "text": past a cap, it shows as its label; else the message it is refused with */
  private admit(r: RefInline, line: number): null | "text" | { error: string } {
    if (this.depth > 0) {
      const m = "a reference inside a part that a reference resolved to is refused; write the part itself there, or reference it from the page";
      this.err(line, `${r.text}: ${m}`);
      return { error: m };
    }
    this.count++;
    if (this.count > this.h.lim.maxReferences) {
      if (!this.over) { this.over = true; this.err(line, `the page has more than ${fmt(this.h.lim.maxReferences)} references; the rest show as their labels. Reference fewer parts on one page, or split the page`); }
      return "text";
    }
    if (this.spent == null) {
      try { (this.budget ??= partBudget("the reference reader")).charge(1, 1, 0); }
      catch (e) { if (!(e instanceof BudgetError)) throw e; this.spent = e.message; this.err(line, `references: ${e.message}; the rest show as their labels`); }
    }
    if (this.spent != null) return "text";
    if (r.error) { this.err(line, `${r.text}: ${r.error}`); return { error: r.error }; }
    return null;
  }

  private ask(type: string, name: string): Answer {
    const f = this.h.resolve;
    if (!f) return { state: "unresolved" };
    try { const a = f({ type, name }); return a == null ? { state: "unresolved" } : answerOf(a); }
    catch (e) { return { state: "failed", reason: short(`the host could not resolve it (${(e as Error)?.message ?? String(e)})`) }; }
  }

  /** A reference on a paragraph of its own. */
  block(r: RefInline, line: number): Block {
    const a = this.admit(r, line);
    if (a === "text") return { type: "markdown", line, md: [{ t: "p", c: [{ t: "text", v: r.label ?? r.text }] }] };
    if (a) return { type: "error", line, part: "reference", message: `${r.text}: ${a.error}` };
    const ans = this.ask(r.type, r.name);
    const base = { id: null, line, attrs: {}, llm: r.text, llmKind: "as-is" as LlmKind, ref: { type: r.type, name: r.name, label: r.label, text: r.text } };
    if (ans.state !== "ready") return { type: "reference", ...base, state: ans.state, ...(ans.state === "failed" ? { reason: ans.reason } : {}) } as ReferenceBlock;
    // UTF-8 bytes are never fewer than UTF-16 units: a text longer than the cap is over it without being measured
    const bytes = ans.part.length > this.h.lim.maxReferenceBytes ? ans.part.length : utf8Bytes(ans.part);
    if (this.bytes + bytes > this.h.lim.maxReferenceBytes) {
      const reason = `the parts this page's references resolve to are ${bytes > this.h.lim.maxReferenceBytes ? "more than" : "over"} ${fmt(this.h.lim.maxReferenceBytes)} bytes together; this one is not read`;
      this.err(line, `${r.text}: ${reason}`);
      return { type: "reference", ...base, state: "failed", reason } as ReferenceBlock;
    }
    this.bytes += bytes;
    let blocks: Block[];
    this.depth++;
    try { blocks = this.read(r, ans.part, line); } finally { this.depth--; }
    if (blocks.length === 1 && blocks[0].type === "error") return { type: "reference", ...base, state: "failed", reason: (blocks[0] as ErrorBlock).message } as ReferenceBlock;
    return { type: "reference", ...base, state: "ready", blocks } as ReferenceBlock;
  }

  private read(r: RefInline, source: string, line: number): Block[] {
    const type = ALIASES[r.type] ?? r.type;
    if (type !== "svg" && type !== "interactive") return this.h.readPart(type, source, line);
    const u = unfence(type, source);
    const refuse = (message: string): Block[] => { this.err(line, `${r.text}: ${message}`); return [{ type: "error", line, part: type, message }]; };
    if ("error" in u) return refuse(u.error);
    const over = this.h.tick(line);
    if (over) return [{ type: "error", line, part: type, message: over }];
    const alt = r.label ?? u.attrs.title ?? r.name;
    const base = { id: null, line, attrs: u.attrs, llm: r.text, llmKind: "as-is" as LlmKind, title: u.attrs.title ?? null, alt };
    if (type === "svg") {
      const svg = u.body.trim();
      const bad = svgProblem(svg, utf8Bytes(svg), this.h.lim.maxSvgBytes);
      return bad ? refuse(bad) : [{ type: "svg", ...base, svg } as SvgBlock];
    }
    const bytes = utf8Bytes(u.body);
    if (bytes > this.h.lim.maxInteractiveBytes) return refuse(checkInteractive({ fallback: "", html: "", css: "", script: "", sections: [], unknown: [] }, bytes, this.h.lim.maxInteractiveBytes)[0].msg);
    let parts: ReturnType<typeof parseInteractive>;
    try { const b = partBudget("the interactive part"); parts = parseInteractive(u.body, line, (n) => b.charge(n, 0, 0)); }
    catch (e) { if (e instanceof BudgetError) return refuse(e.message); throw e; }
    const errs = checkInteractive(parts, bytes, this.h.lim.maxInteractiveBytes);
    if (errs.length) return refuse(errs[0].msg + (errs.length > 1 ? ` (and ${errs.length - 1} more)` : ""));
    const fallback = parts.fallback ? this.h.md(parts.fallback, line) : [];
    if (parts.fallback.includes("[[")) this.visitBlocks(fallback, new Lines(parts.fallback, line), true);
    return [{ type: "interactive", ...base, height: ixHeight(u.attrs), html: parts.html, css: parts.css, script: parts.script, fallback } as InteractiveBlock];
  }

  /** A reference inside a sentence (or a heading, a list, a table cell). */
  chip(x: RefInline, line: number): MdInline {
    const a = this.admit(x, line);
    if (a === "text") return { t: "text", v: x.label ?? x.text };
    if (a) return { ...x, error: a.error };
    const ans = this.ask(x.type, x.name);
    if (ans.state === "unresolved") return x;
    return { ...x, state: ans.state, ...(ans.state === "failed" ? { reason: ans.reason } : {}) };
  }

  /** The blocks of one Markdown text of the page, with its references taken care of (see the top of this file). */
  split(md: MdBlock[], text: string, line: number): Block[] {
    const has = text.includes("[["), fences = /interactive|svg/i.test(text);
    if (!has && !fences) return [{ type: "markdown", line, md }];
    const at = new Lines(text, line);
    const out: Block[] = [];
    let cur: MdBlock[] = [];
    const flush = () => { if (cur.length) { out.push({ type: "markdown", line, md: cur }); cur = []; } };
    for (const b of md) {
      if (has && b.t === "p" && b.c.length === 1 && b.c[0].t === "reference") { flush(); const r = b.c[0]; out.push(this.block(r, at.find(r.text))); continue; }
      if (b.t === "code" && isReferenceOnlyFence(b.lang)) {
        const l = at.find(b.lang), message = referenceOnlyMessage(b.lang);
        this.err(l, message);
        flush();
        out.push({ type: "error", line: l, part: b.lang.toLowerCase(), message });
        cur.push(b);
        continue;
      }
      this.visit(b, at, has);
      cur.push(b);
    }
    flush();
    return out;
  }
  /** The references in one inline text (a code walk step's note). */
  inline(c: MdInline[], text: string, line: number): MdInline[] {
    return text.includes("[[") ? this.inl(c, new Lines(text, line)) : c;
  }

  private visitBlocks(bs: MdBlock[], at: Lines, has: boolean) { for (const b of bs) this.visit(b, at, has); }
  private visit(b: MdBlock, at: Lines, has: boolean) {
    switch (b.t) {
      case "p": case "text": case "h": if (has) b.c = this.inl(b.c, at); break;
      case "list": for (const it of b.items) this.visitBlocks(it.c, at, has); break;
      case "quote": case "callout": this.visitBlocks(b.c, at, has); break;
      case "table": if (has) { b.head = b.head.map((c) => this.inl(c, at)); b.rows = b.rows.map((row) => row.map((c) => this.inl(c, at))); } break;
      case "code": if (isReferenceOnlyFence(b.lang)) this.err(at.find(b.lang), referenceOnlyMessage(b.lang)); break;
      default: break;
    }
  }
  private inl(c: MdInline[], at: Lines): MdInline[] {
    let out: MdInline[] | null = null;
    for (let i = 0; i < c.length; i++) {
      const x = c[i];
      let y: MdInline = x;
      if (x.t === "reference") y = this.chip(x, at.find(x.text));
      else if ("c" in x && Array.isArray(x.c)) { const k = this.inl(x.c, at); if (k !== x.c) y = { ...x, c: k } as MdInline; }
      if (y !== x && !out) out = c.slice(0, i);
      if (out) out.push(y);
    }
    return out ?? c;
  }
}

export { refText };
