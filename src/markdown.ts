// Markdown to a small, safe tree. marked tokenises (GFM); this file turns the tokens into plain data:
// no HTML string ever leaves this module. Raw HTML in the source becomes text. Links and images pass the URL policy.
// Inline parts: :kbd[Ctrl+K, Ctrl+S] and :mouse[double-click index.ts]; a link to code:<repo>/<path>#<symbol> is a code reference.
import { Marked, type Token, type Tokens, type TokenizerAndRendererExtension } from "marked";
import { KEY_GLYPHS, MOUSE_PRESS } from "./core/dh-lib";
import { applyUrlPolicy, decodeRefs, type UrlPolicy } from "./safety";

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
  | { t: "ref"; name: string; text: string; data: unknown };          // a host's inline reference (InlineDef)
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
  /** what it looks like in text, e.g. /@[\w./-]+/ or /&T-\d+/ (no g or y flag; keep it simple: it runs on every text) */
  match: RegExp;
  /** the match to data for the component (default: the matched text) */
  parse?: (m: RegExpExecArray) => D;
  /** the React component that draws it: receives { text, data } (only the React entry reads this) */
  Component?: C;
}
export interface MdContext { inlines?: InlineDef<any, any>[]; policy?: UrlPolicy; idPrefix: string; ids: Set<string>; maxDepth: number; problems: { line: number; message: string }[]; line: number; heads: { depth: number; text: string; id: string }[] }

export const CALLOUT_WORDS: Record<string, CalloutKind> = { Note: "note", Tip: "tip", Important: "important", "Watch out": "warn", "Security finding": "security" };
const KEY_WORDS: Record<string, string> = { left: "Left arrow", right: "Right arrow", up: "Up arrow", down: "Down arrow" };

// ---- the two inline parts, as marked extensions (pure tokenizers: no renderer is ever used)
const inlinePart = (name: "kbd" | "mouse"): TokenizerAndRendererExtension => ({
  name, level: "inline",
  start(src: string) { const i = src.indexOf(`:${name}[`); return i < 0 ? undefined : i; },
  tokenizer(src: string) { const m = src.match(name === "kbd" ? /^:kbd\[([^\]\n]{1,200})\]/ : /^:mouse\[([^\]\n]{1,200})\]/); if (m) return { type: name, raw: m[0], text: m[1] } as any; return undefined; },
  renderer: () => "",
});
const marked = new Marked({ gfm: true, async: false, extensions: [inlinePart("kbd"), inlinePart("mouse")] } as any);
// a lexer that also knows a host's inline references (one per set of definitions)
const withRefs = new WeakMap<InlineDef<any, any>[], Marked>();
function lexerFor(defs: InlineDef<any, any>[] | undefined): Marked {
  if (!defs?.length) return marked;
  let m = withRefs.get(defs);
  if (m) return m;
  const exts = defs.map((d): TokenizerAndRendererExtension => {
    if (!/^[a-z][a-z0-9-]{0,40}$/.test(d.name)) throw new Error(`durian-hypermedia: an inline name is lower case letters, digits and dashes: "${d.name}"`);
    const flags = d.match.flags.replace(/[gy]/g, "");
    const find = new RegExp(d.match.source, flags), at = new RegExp(`^(?:${d.match.source})`, flags);
    return {
      name: `ref-${d.name}`, level: "inline",
      start(src: string) { const i = src.search(find); return i < 0 ? undefined : i; },
      tokenizer(src: string) { const mm = at.exec(src); if (!mm || !mm[0]) return undefined; let data: unknown = mm[0]; try { if (d.parse) data = d.parse(mm); } catch { return undefined; } return { type: "dh-ref", raw: mm[0], name: d.name, data } as any; },
      renderer: () => "",
    };
  });
  m = new Marked({ gfm: true, async: false, extensions: [inlinePart("kbd"), inlinePart("mouse"), ...exts] } as any);
  withRefs.set(defs, m);
  return m;
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 80) || "s";
}
export function uniqueId(base: string, ctx: MdContext): string {
  let id = ctx.idPrefix + base;
  while (ctx.ids.has(id)) id += "-2";
  ctx.ids.add(id);
  return id;
}
/** The plain text of an inline tree (what a heading's id is made from; a table cell's label). */
export const inlineText = (c: MdInline[]): string => c.map((x) => (x.t === "ref" ? x.text : "v" in x ? x.v : "c" in x ? inlineText(x.c) : x.t === "kbd" ? x.label : x.t === "mouse" ? `${x.act} ${x.target}`.trim() : x.t === "img" ? x.alt : "")).join("");
const plain = inlineText;

/** Markdown text to blocks. Never throws: a problem becomes a "raw" block and a message in ctx.problems. */
export function mdBlocks(src: string, ctx: MdContext): MdBlock[] {
  // a nesting deeper than the cap is refused before marked sees it (deep quotes or lists cost marked a lot of stack)
  const deep = src.split("\n").find((l) => (l.match(/^(\s*>)+/)?.[0].split(">").length ?? 1) - 1 > ctx.maxDepth || (l.match(/^ */)![0].length / 2 > ctx.maxDepth * 2 && /^\s*([-*+]|\d+[.)])\s/.test(l)));
  if (deep !== undefined) { ctx.problems.push({ line: ctx.line, message: `Markdown nested deeper than ${ctx.maxDepth} levels; shown as plain text` }); return [{ t: "raw", text: src }]; }
  let toks: Token[];
  try { toks = lexerFor(ctx.inlines).lexer(src); }
  catch (e) { ctx.problems.push({ line: ctx.line, message: `Markdown could not be read: ${(e as Error).message}` }); return [{ t: "raw", text: src }]; }
  return blocks(toks, ctx, 0);
}
function blocks(toks: Token[], ctx: MdContext, depth: number): MdBlock[] {
  if (depth > ctx.maxDepth) { ctx.problems.push({ line: ctx.line, message: `Markdown nested deeper than ${ctx.maxDepth} levels; the rest is plain text` }); return [{ t: "raw", text: toks.map((t) => t.raw).join("") }]; }
  const out: MdBlock[] = [];
  for (const t of toks) {
    switch (t.type) {
      case "space": case "def": break;
      case "paragraph": out.push({ t: "p", c: inl((t as Tokens.Paragraph).tokens, ctx, depth) }); break;
      case "text": { const x = t as Tokens.Text; out.push({ t: "text", c: x.tokens ? inl(x.tokens, ctx, depth) : [{ t: "text", v: x.text }] }); break; }
      case "heading": { const h = t as Tokens.Heading; const c = inl(h.tokens, ctx, depth); const text = plain(c); const id = uniqueId(slug(text), ctx); ctx.heads.push({ depth: h.depth, text, id }); out.push({ t: "h", depth: h.depth, id, text, c }); break; }
      case "code": { const c = t as Tokens.Code; const info = (c.lang ?? "").trim(); const meta = info.replace(/^\S*\s*/, "").slice(0, 500); out.push({ t: "code", lang: info.split(/\s/)[0].slice(0, 30), ...(meta ? { meta } : {}), text: c.text }); break; }
      case "hr": out.push({ t: "hr" }); break;
      case "list": { const l = t as Tokens.List; out.push({ t: "list", ordered: l.ordered, start: l.ordered ? (typeof l.start === "number" ? l.start : 1) : null, items: l.items.map((it) => ({ task: !!it.task, checked: !!it.checked, c: blocks(it.tokens.filter((x) => x.type !== "checkbox"), ctx, depth + 1) })) }); break; }
      case "blockquote": {
        const q = t as Tokens.Blockquote;
        const first = q.tokens[0] as Tokens.Paragraph | undefined;
        const lead = first?.type === "paragraph" ? first.tokens[0] : undefined;
        const word = lead?.type === "strong" ? (lead as Tokens.Strong).text.replace(/:$/, "") : "";
        if (lead && CALLOUT_WORDS[word] && /:$/.test((lead as Tokens.Strong).text)) {
          const rest = first!.tokens.slice(1);
          if (rest[0]?.type === "text") rest[0] = { ...(rest[0] as Tokens.Text), text: (rest[0] as Tokens.Text).text.replace(/^\s+/, ""), raw: (rest[0] as Tokens.Text).raw.replace(/^\s+/, "") } as Tokens.Text;
          const body: MdBlock[] = [{ t: "p", c: inl(rest, ctx, depth + 1) }, ...blocks(q.tokens.slice(1), ctx, depth + 1)];
          out.push({ t: "callout", kind: CALLOUT_WORDS[word], label: word, c: body });
        } else out.push({ t: "quote", c: blocks(q.tokens, ctx, depth + 1) });
        break;
      }
      case "table": {
        const tb = t as Tokens.Table;
        out.push({ t: "table", align: tb.align.map((a) => a ?? null), head: tb.header.map((c) => inl(c.tokens, ctx, depth + 1)), rows: tb.rows.map((r) => r.map((c) => inl(c.tokens, ctx, depth + 1))) });
        break;
      }
      case "html": out.push({ t: "raw", text: (t as Tokens.HTML).text }); break;
      default: out.push({ t: "raw", text: t.raw ?? "" });
    }
  }
  return out;
}
function inl(toks: Token[] | undefined, ctx: MdContext, depth: number): MdInline[] {
  if (!toks) return [];
  if (depth > ctx.maxDepth) return [{ t: "text", v: toks.map((t) => t.raw).join("") }];
  const out: MdInline[] = [];
  for (const t of toks) {
    switch (t.type) {
      case "text": { const x = t as Tokens.Text; if (x.tokens?.length) out.push(...inl(x.tokens, ctx, depth + 1)); else out.push({ t: "text", v: decodeEntities(x.text) }); break; }
      case "escape": out.push({ t: "text", v: (t as Tokens.Escape).text }); break;
      case "strong": case "em": case "del": out.push({ t: t.type, c: inl((t as Tokens.Strong).tokens, ctx, depth + 1) }); break;
      case "codespan": out.push({ t: "code", v: decodeEntities((t as Tokens.Codespan).text) }); break;
      case "br": out.push({ t: "br" }); break;
      case "link": {
        const l = t as Tokens.Link;
        const c = inl(l.tokens, ctx, depth + 1);
        if (/^code:/i.test(l.href)) { out.push({ t: "coderef", ref: l.href.slice(5), c }); break; }
        let href = applyUrlPolicy(decodeRefs(l.href), "link", ctx.policy);
        if (href?.startsWith("#") && ctx.idPrefix && !href.startsWith("#" + ctx.idPrefix)) href = "#" + ctx.idPrefix + href.slice(1);
        out.push({ t: "link", href, ...(l.title ? { title: l.title } : {}), c });
        break;
      }
      case "image": { const im = t as Tokens.Image; out.push({ t: "img", src: applyUrlPolicy(decodeRefs(im.href), "image", ctx.policy), alt: im.text, ...(im.title ? { title: im.title } : {}) }); break; }
      case "kbd": {
        const text = (t as any).text as string;
        const chords = text.split(/\s*,\s*/).map((c) => c.split(/\+(?!$)/));
        out.push({ t: "kbd", chords: chords.map((ks) => ks.map((k) => KEY_GLYPHS[k.toLowerCase()] ?? k)), label: chords.map((ks) => ks.map((k) => KEY_WORDS[k.toLowerCase()] ?? k).join("+")).join(", then ") });
        break;
      }
      case "mouse": {
        const m = ((t as any).text as string).trim().match(/^(\S+)\s*(.*)$/);
        const act = m?.[1] ?? "", p = MOUSE_PRESS[act] ?? { press: "", badge: "" };
        out.push({ t: "mouse", act, press: p.press, badge: p.badge, target: (m?.[2] ?? "").replace(/^"|"$/g, "") });
        break;
      }
      case "dh-ref": out.push({ t: "ref", name: (t as any).name, text: t.raw, data: (t as any).data }); break;
      case "html": out.push({ t: "text", v: (t as Tokens.HTML).text }); break;   // inline HTML: shown as the text it is
      default: out.push({ t: "text", v: t.raw ?? "" });
    }
  }
  return out;
}
// marked keeps character references in text as written ("&amp;"); the tree holds the characters
function decodeEntities(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|#39|#x27);/g, (_, e) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", "#x27": "'" } as Record<string, string>)[e]);
}

/** Inline Markdown (a code walk's note) to the inline tree. */
export function mdInline(src: string, ctx: MdContext): MdInline[] {
  const b = mdBlocks(src, ctx);
  const flat = (x: MdBlock): MdInline[] => (x.t === "p" || x.t === "text" || x.t === "h" ? x.c : x.t === "raw" ? [{ t: "text", v: x.text }] : x.t === "code" ? [{ t: "code", v: x.text }] : []);
  return b.flatMap((x, i) => [...(i ? [{ t: "br" } as MdInline] : []), ...flat(x)]);
}

