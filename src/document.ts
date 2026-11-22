// parse(): Durian Hypermedia text to the typed, safe Document. Pure: no files, no network, no DOM.
// The format's own parser (core/dh-lib.ts, shared with the site and doccheck) reads the parts; this file adds the caps,
// the URL policy, the safe Markdown tree, host blocks, and turns every part into plain typed data.
import {
  PARTS, ParseError, parseDoc, jsonOf, llmOfPart, llmKindOf, llmView as dhLlmView, animOf,
  type Doc as DhDoc, type Node as DhNode, type PartNode, type MdNode as DhMd,
} from "./core/dh-lib";
import { checkDoc } from "./core/doccheck";
import GithubSlugger from "github-slugger";
import { countHeading, mdBlocks, mdInline, type MdContext, type InlineDef } from "./markdown";
import { LIMITS, utf8Bytes, type Limits, type UrlPolicy } from "./safety";
import { registeredBlocks, type BlockDef, type BlockInput } from "./blocks";
import { compileScene } from "./core/scene";
import { pageBudget, withBudget } from "./core/budget";
import type { AnimationBlock, Block, Document, Problem, ErrorBlock, LlmKind, HostBlock } from "./types";

export const FORMAT_VERSION = 10;

/**
 * The texts a reader sees in an animation block, in story order: the quoted labels, the captions (step titles), the
 * say texts and the note texts the scene compiler reads. The same list as `block.texts` (parse() fills it); this
 * function compiles the block's own source again, so it also works on a block read from older JSON that has no
 * `texts`. Tools use it instead of reaching into scene internals.
 */
export function animationTexts(block: Pick<AnimationBlock, "anim">): string[] {
  const a = block.anim;
  return [...compileScene(a.head, a.steps, a.base, a.info).scene.texts];
}

export interface ParseOptions {
  /** the page's file name; decides the .md / .dh.md check (default: page.dh.md, or page.md when there is no part) */
  path?: string;
  /** every link and image URL goes through it (default: defaultUrlPolicy) */
  urlPolicy?: UrlPolicy;
  /** caps (default: LIMITS) */
  limits?: Partial<Limits>;
  /** put before every id the page makes (headings, #ids, tabs), so a page cannot clobber the host's own ids (default "dh-") */
  idPrefix?: string;
  /** host blocks for this call (added to the ones registered with registerBlock) */
  blocks?: BlockDef<any, any>[];
  /** host inline references in prose (@src/a.ts, &T-12 ...); pass the same array each time (it is cached by identity) */
  inlines?: InlineDef<any, any>[];
  /** drop "> **Security finding:**" callouts from the LLM view (a public render) */
  publicView?: boolean;
  /** false: a leading "---" block is Markdown (a rule and text the reader sees), not front matter (default true) */
  frontMatter?: boolean;
  /** marks every page may use in a file tree, as the front matter `marks:` writes them: { deprecated: { label: "deprecated", colour: "warn", means: "..." } }. A page's own entry of the same name wins (SPEC.md section 3.1) */
  marks?: Record<string, { label?: string; colour: string; means?: string }>;
  /** prompts every page may use in a terminal, as the front matter `prefixes:` writes them: { ">>>": { label: "Python", colour: "c4" } } */
  prefixes?: Record<string, { label?: string; colour: string; means?: string }>;
}

// what parse() keeps for llmView() and check() of the same Document in this process
interface Kept { dh: DhDoc | null; refused: Set<PartNode>; hosts: Map<PartNode, { def: BlockDef<any, any>; data: unknown; input: BlockInput }>; opts: ParseOptions }
const kept = new WeakMap<Document, Kept>();

const YAML_ALIAS = /(^|[\s\[{,:-])[&*][A-Za-z0-9_-]+/gm;
const tooManyAliases = (y: string) => (y.match(YAML_ALIAS)?.length ?? 0) > 16;

/** Run fn with the host blocks known to the format's parser, then forget them again. */
function withHostParts<T>(defs: Map<string, BlockDef<any, any>>, problems: Problem[], fn: () => T): T {
  const added: string[] = [];
  for (const name of defs.keys()) {
    if (PARTS[name]) { problems.push({ line: 1, level: "error", message: `host block "${name}" has the name of a built-in part; it is ignored` }); defs.delete(name); continue; }
    PARTS[name] = { form: "fenced", llm: "as-is", steps: false };
    added.push(name);
  }
  try { return fn(); } finally { for (const n of added) delete PARTS[n]; }
}
// an LLM text that replaces a part in the format's own LLM view (the way an author's :::llm does)
function textAsLlm(p: PartNode, text: string): void {
  p.llm = { kind: "part", name: "llm", attrs: {}, line: p.line, endLine: p.endLine, source: "", open: ":::llm", body: text, bodyLine: p.line, head: "", steps: [], nodes: [{ kind: "md", text, line: p.line } as DhMd], items: [] };
}

function emptyDoc(source: string, path: string, problems: Problem[], blocks: Block[]): Document {
  return { ast: 1, format: FORMAT_VERSION, source, path, frontMatter: {}, title: null, blocks, headings: [], problems, highlighted: false, llm: "" } as Document;
}

export function parse(text: string, opts: ParseOptions = {}): Document {
  const lim: Limits = { ...LIMITS, ...(opts.limits ?? {}) };
  const idPrefix = opts.idPrefix ?? "dh-";
  const problems: Problem[] = [];
  const source = String(text ?? "");
  if (utf8Bytes(source) > lim.maxInputBytes) {
    const msg = `the page is ${utf8Bytes(source).toLocaleString("en-US")} bytes; the limit is ${lim.maxInputBytes.toLocaleString("en-US")}`;
    problems.push({ line: 1, level: "error", message: msg });
    return emptyDoc(source, opts.path ?? "page.dh.md", problems, [{ type: "error", line: 1, part: null, message: msg }]);
  }
  const site = opts.marks || opts.prefixes ? { marks: opts.marks, prefixes: opts.prefixes } : undefined;
  const clean = source.replace(/\r\n?/g, "\n").replace(/\u{0}/gu, "\u{fffd}");
  const defs = registeredBlocks(opts.blocks ?? []);
  const refused = new Set<PartNode>();
  const hosts: Kept["hosts"] = new Map();
  const ctx: MdContext = { inlines: opts.inlines, policy: opts.urlPolicy, idPrefix, slugger: new GithubSlugger(), maxDepth: lim.maxDepth, problems: [], line: 1, heads: [] };
  let count = 0, stopped = false;

  // one evaluation budget for the whole call: every chart (and its LLM view) draws from it, none restarts it
  return withBudget(pageBudget(lim), () => withHostParts(defs, problems, () => {
    // 1. the format's parser
    let dh: DhDoc;
    const fmOn = opts.frontMatter !== false;
    const fmText = fmOn ? clean.match(/^---\n([\s\S]*?)\n---\n/)?.[1] : undefined;
    if (fmText != null && tooManyAliases(fmText)) {
      problems.push({ line: 1, level: "error", message: "the front matter uses too many YAML anchors and aliases; it is ignored" });
      return finish(parseSafe(clean.replace(/^---\n[\s\S]*?\n---\n/, "\n".repeat(fmText.split("\n").length + 2))));
    }
    return finish(parseSafe(clean));

    function parseSafe(t: string): DhDoc | null {
      const path = opts.path ?? "page.dh.md";
      try { return parseDoc(path, t, { frontMatter: fmOn, site }); }
      catch (e) {
        if (e instanceof ParseError) { problems.push({ line: e.line, level: "error", message: e.message }); return null; }
        // most often the front matter is not valid YAML: read the page without it
        const m = fmOn ? t.match(/^---\n[\s\S]*?\n---\n/) : null;
        if (m) {
          problems.push({ line: 1, level: "error", message: `the front matter could not be read (${(e as Error).message}); it is ignored` });
          try { return parseDoc(path, "\n".repeat(m[0].split("\n").length - 1) + t.slice(m[0].length), { site }); } catch (e2) { if (e2 instanceof ParseError) problems.push({ line: e2.line, level: "error", message: e2.message }); return null; }
        }
        problems.push({ line: 1, level: "error", message: (e as Error).message });
        return null;
      }
    }

    function finish(d: DhDoc | null): Document {
      if (!d) {
        const doc = emptyDoc(clean, opts.path ?? "page.dh.md", problems, [
          { type: "error", line: problems[0]?.line ?? 1, part: null, message: `the page could not be read: ${problems[0]?.message ?? "unknown error"}` },
          { type: "markdown", line: 1, md: [{ t: "raw", text: clean }] },
        ]);
        kept.set(doc, { dh: null, refused, hosts, opts });
        return doc;
      }
      dh = d;
      const blocks = walk(dh.body);
      const fm = (dh.fm && typeof dh.fm === "object" && !Array.isArray(dh.fm) ? dh.fm : {}) as Record<string, any>;
      // a heading id and a part id (or a tab or accordion item id) share one namespace on the page: name a clash
      const partIds = new Map<string, number>();
      const collect = (bs: any[]) => { for (const x of bs) { if (x.id) partIds.set(x.id, x.line); for (const it of x.items ?? []) { if (it.id) for (const k of x.type === "tabs" ? [it.id + "-t", it.id + "-p"] : [it.id]) partIds.set(k, x.line); collect(it.body ?? []); } collect(x.type === "human" ? x.body : []); } };
      collect(blocks);
      for (const h of ctx.heads) if (partIds.has(h.id)) problems.push({ line: partIds.get(h.id)!, level: "warn", message: `the heading "${h.text}" and a part both have the id "${h.id}"; a link to #${h.id} reaches only one of them. Rename the part's #id` });
      // a table of contents lists the headings after the walk
      fillTocs(blocks, ctx.heads);
      for (const p of ctx.problems) problems.push({ line: p.line, level: "error", message: p.message });
      const hasPart = blocks.some((x) => x.type !== "markdown" && x.type !== "toc");
      const path = opts.path ?? (hasPart ? "page.dh.md" : "page.md");
      dh.path = path;
      let llm = "";
      try { llm = dhLlmView(dh, path, !!opts.publicView); } catch (e) { problems.push({ line: 1, level: "error", message: `the LLM view could not be made: ${(e as Error).message}` }); }
      const doc: Document = { ast: 1, format: FORMAT_VERSION, source: clean, path, frontMatter: fm, title: typeof fm.title === "string" ? fm.title : null, blocks, headings: ctx.heads, problems, highlighted: false, llm } as Document;
      kept.set(doc, { dh, refused, hosts, opts });
      return doc;
    }

    function refuse(p: PartNode, message: string): ErrorBlock {
      refused.add(p);
      textAsLlm(p, `[${p.name} not shown: ${message}]`);
      problems.push({ line: p.line, level: "error", message: `${p.name}: ${message}` });
      return { type: "error", line: p.line, part: p.name, message };
    }

    function walk(nodes: DhNode[]): Block[] {
      const out: Block[] = [];
      for (const n of nodes) {
        if (stopped) break;
        if (++count > lim.maxBlocks) {
          stopped = true;
          const message = `the page has more than ${lim.maxBlocks} blocks; the rest is not shown`;
          problems.push({ line: n.line, level: "error", message });
          out.push({ type: "error", line: n.line, part: null, message });
          break;
        }
        if (n.kind === "md") { ctx.line = n.line; out.push({ type: "markdown", line: n.line, md: mdBlocks(n.text, ctx) }); continue; }
        if (n.kind === "toc") { out.push({ type: "toc", line: n.line, depth: Math.min(4, Math.max(2, +(n.attrs.depth ?? 3) || 3)), scope: n.attrs.section ? "section" : "page", items: [] }); continue; }
        try { out.push(part(n)); }
        catch (e) { out.push(refuse(n, `could not be read (${(e as Error).message})`)); }
      }
      return out;
    }

    function base(p: PartNode) {
      return { id: p.attrs.id ? idPrefix + p.attrs.id : null, line: p.line, attrs: { ...p.attrs }, llm: (llmOfPart(p, !!opts.publicView) || null) as string | null, llmKind: llmKindOf(p) as LlmKind };
    }

    function part(p: PartNode): Block {
      const def = PARTS[p.name];
      const host = defs.get(p.name);
      if (host && def) {
        const input: BlockInput = { body: p.body, attrs: { ...p.attrs }, line: p.line };
        let data: unknown;
        try { data = host.parse ? host.parse(input) : { body: p.body }; }
        catch (e) { return refuse(p, (e as Error).message); }
        const llm = host.llm ? String(host.llm(data, input) ?? "") : null;
        if (llm != null) textAsLlm(p, llm);
        hosts.set(p, { def: host, data, input });
        const hb: HostBlock = { type: "host", name: p.name, body: p.body, data, ...base(p), llmKind: "host" };
        return hb;
      }
      if (!def) return refuse(p, `"${p.name}" is not a part of this format`);
      if (def.steps && p.steps.length > lim.maxSteps) return refuse(p, `${p.steps.length} steps; the limit is ${lim.maxSteps}`);
      if (def.form === "container") {
        if (p.name === "tabs" || p.name === "accordion") {
          const items = p.items.map((it, k) => (countHeading(it.heading, ctx), { title: it.title, id: `${p.attrs.id ? idPrefix + p.attrs.id : `${idPrefix}${p.name}-${p.line}`}-${k}`, body: walk(it.nodes) }));
          return { type: p.name, items, ...base(p) } as Block;
        }
        if (p.name === "human") return { type: "human", body: walk(p.nodes), ...base(p) } as Block;
        return refuse(p, `:::${p.name} stands alone here`);
      }
      // caps that must hold before the part is compiled or evaluated
      let animTexts: string[] = [];
      if (p.name === "animation") {
        if (p.body.length > lim.maxAnimChars) return refuse(p, `${p.body.length.toLocaleString("en-US")} characters; the limit is ${lim.maxAnimChars.toLocaleString("en-US")}`);
        if (p.steps.length > lim.maxAnimSteps) return refuse(p, `${p.steps.length} steps; the limit is ${lim.maxAnimSteps}`);
        const lines = p.head.split("\n").filter((l) => l.trim() && !/^\s*(#|\/\/)/.test(l)).length;
        const values = [...p.body.matchAll(/\[([^\]]*)\]/g)].reduce((a, m) => a + m[1].split(",").length, 0);
        if (lines + values > lim.maxAnimEntities * 2) return refuse(p, `about ${lines + values} things on the stage; the limit is ${lim.maxAnimEntities}`);
        const c = animOf(p);
        animTexts = [...c.scene.texts];
        const most = Math.max(0, ...c.frames.map((f) => f.boxes.length));
        if (most > lim.maxAnimEntities) return refuse(p, `${most} things on the stage; the limit is ${lim.maxAnimEntities}`);
      }
      if (p.name === "chart" || p.name === "tierlist" || p.name === "alignment") {
        if (tooManyAliases(p.body)) return refuse(p, "too many YAML anchors and aliases");
      }
      if (p.name === "mermaid") {
        if (p.body.length > lim.maxMermaidChars) return refuse(p, `${p.body.length.toLocaleString("en-US")} characters; the limit is ${lim.maxMermaidChars.toLocaleString("en-US")}`);
      }
      // the format's own JSON for this one part
      const j = jsonOf({ ...dh, body: [p] } as DhDoc, undefined, !!opts.publicView).blocks[0] as Record<string, any>;
      delete j.source; delete j.size; delete j.type; delete j.id; delete j.attrs; delete j.line; delete j.llm; delete j.llmKind;
      const blk: Record<string, any> = { type: p.name, ...base(p), ...j };
      switch (p.name) {
        case "animation": blk.texts = animTexts; break;
        case "chart": {
          if (blk.initial?.limit) return refuse(p, blk.initial.error);
          const pts = (blk.initial?.x?.length ?? 0) + (blk.initial?.series ?? []).reduce((a: number, s: any) => a + (Array.isArray(s.data) ? s.data.length : 0), 0);
          if (pts > lim.maxChartPoints) return refuse(p, `${pts.toLocaleString("en-US")} data points; the limit is ${lim.maxChartPoints.toLocaleString("en-US")}`);
          break;
        }
        case "tierlist": { const n = (blk.tier?.tiers ?? []).reduce((a: number, t: any) => a + (t.items?.length ?? 0), 0); if (n > lim.maxItems) return refuse(p, `${n} items; the limit is ${lim.maxItems}`); break; }
        case "alignment": { const n = (blk.align?.points?.length ?? 0) + (blk.align?.cells ?? []).reduce((a: number, c: any) => a + (c.items?.length ?? 0), 0); if (n > lim.maxItems) return refuse(p, `${n} items; the limit is ${lim.maxItems}`); break; }
        case "codewalk":
          blk.steps = (blk.steps ?? []).map((s: any, i: number) => ({ ...s, note: mdInline((p.steps[i]?.raw ?? "").trim(), { ...ctx, line: p.steps[i]?.line ?? p.line }) }));
          break;
        case "mermaid": {
          // a %%{init: ...}%% directive may try to change mermaid's settings: it is dropped
          let dropped = 0;
          blk.steps = (blk.steps ?? []).map((s: any) => ({ ...s, src: String(s.src).split("\n").filter((l) => { const d = /^\s*%%\s*\{/.test(l); if (d) dropped++; return !d; }).join("\n") }));
          if (dropped) problems.push({ line: p.line, level: "warn", message: "mermaid: %%{...}%% directives are dropped (they could change the diagram's security settings)" });
          break;
        }
      }
      return blk as Block;
    }
  }));
}

function fillTocs(blocks: Block[], heads: { depth: number; text: string; id: string }[]) {
  // the headings in page order are ctx.heads; a section toc takes the h3+ under the h2 it sits in
  let seen = 0;
  const visit = (bs: Block[]) => {
    for (const b of bs) {
      if (b.type === "markdown") seen += b.md.filter((m) => m.t === "h").length;
      else if (b.type === "toc") {
        if (b.scope === "section") {
          const before = heads.slice(0, seen);
          const parent = before.map((h, i) => ({ h, i })).filter(({ h }) => h.depth === 2).pop()?.i ?? -1;
          const end = heads.findIndex((h, i) => i > parent && h.depth <= 2);
          b.items = heads.slice(parent + 1, end < 0 ? undefined : end).filter((h) => h.depth > 2 && h.depth <= b.depth);
        } else b.items = heads.filter((h) => h.depth >= 2 && h.depth <= b.depth);
      } else if (b.type === "tabs" || b.type === "accordion") b.items.forEach((it) => visit(it.body));
      else if (b.type === "human") visit(b.body);
    }
  };
  visit(blocks);
}

/** What an LLM reads: the page without the wrappers (SPEC.md section 2). */
export function llmView(doc: Document | string, opts: ParseOptions = {}): string {
  const d = typeof doc === "string" ? parse(doc, opts) : doc;
  if (typeof (d as any).llm === "string" && (d as any).llm) return (d as any).llm;
  return (parse(d.source, { ...opts, path: d.path }) as any).llm ?? "";
}

/** The doccheck rules for one page, as a list. Parts parse() refused are reported once each and not checked again. */
export function check(doc: Document | string, opts: ParseOptions = {}): Problem[] {
  let d = typeof doc === "string" ? parse(doc, opts) : doc;
  let k = kept.get(d);
  if (!k) { d = parse(d.source, { ...opts, path: d.path }); k = kept.get(d)!; }
  const out: Problem[] = d.problems.map((p) => ({ ...p }));
  if (!k.dh) return out;
  // take refused parts out so the checks do not evaluate them again
  const strip = (nodes: DhNode[]): DhNode[] => nodes.map((n) => (n.kind === "part" && k!.refused.has(n) ? ({ kind: "md", text: "", line: n.line } as DhMd) : n.kind === "part" ? ({ ...n, nodes: strip(n.nodes), items: n.items.map((it) => ({ ...it, nodes: strip(it.nodes) })) } as PartNode) : n));
  const dh = { ...k.dh, body: strip(k.dh.body) } as DhDoc;
  const issues: { file: string; line: number; msg: string; level: "error" | "warn" }[] = [];
  const defs = registeredBlocks(k.opts.blocks ?? []);
  // the checks evaluate every chart again for each control value: one budget of their own for the whole call
  withBudget(pageBudget({ ...LIMITS, ...(k.opts.limits ?? {}) }), () => withHostParts(defs, [], () => { try { checkDoc(dh, undefined, issues); } catch (e) { issues.push({ file: dh.path, line: 1, msg: `the checks stopped: ${(e as Error).message}`, level: "error" }); } }));
  for (const i of issues) out.push({ line: i.line, level: i.level, message: i.msg });
  for (const [p, h] of k.hosts) {
    if (!h.def.check) continue;
    try { for (const r of h.def.check(h.data, h.input) ?? []) out.push({ line: r.line ?? p.line, level: r.level ?? "error", message: `[${p.name}] ${r.message}` }); }
    catch (e) { out.push({ line: p.line, level: "error", message: `[${p.name}] the check stopped: ${(e as Error).message}` }); }
  }
  return out;
}
