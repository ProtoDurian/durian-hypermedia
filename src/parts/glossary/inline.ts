// The terms of a glossary in the text (format version 11): an inline part (parts/inline.ts). Where a term is used in prose (a
// whole word; the first letter's case is free; the longest name wins), its first use in each section (up to the next heading
// of level 1 or 2) is a button with a dotted underline; the card shows the meaning. Never inside code, a link, an image, a
// heading, a table's rule row or an HTML tag (the core reads only plain text runs). Terms come from `glossary:` in front
// matter and from the page's ```glossary blocks; the same name twice is refused.
import { defineInline } from "../inline";
import type { PartIssue } from "../types";
import { allTerms, defPlain, glossaryLlm, matcher, parseGlossaryBlock, parseGlossaryFront, parseGlossaryHost, type DefSeg, type GlossError, type Matcher, type Term } from "./terms";

/** what the view gets for one use of a term */
export interface TermUse { id: string; label: string; also: string[]; segs: DefSeg[]; plain: string; /** the page has a glossary block: its anchor for this term, else "" */ link: string }
export interface GlossState {
  terms: Term[]; m: Matcher | null;
  /** the terms already marked in this section / the terms the text used at all */
  seen: Set<string>; used: Set<string>;
  /** the page's id prefix: the anchors of the block's list carry it */
  idPrefix: string;
  /** problems about the whole page, found by prepare */
  issues: PartIssue[];
}

export default defineInline<GlossState, TermUse>({
  name: "glossary",
  prepare(page) {
    const lim = page.limits;
    const front = parseGlossaryFront(page.frontMatter, lim, page.budget);
    const blocks = page.blocks.map((b) => parseGlossaryBlock(b.body, b.bodyLine, lim, page.budget));
    const host = parseGlossaryHost(page.options.glossary, lim, page.budget);
    const all = allTerms(front.terms, blocks.flatMap((b) => b.terms), host.terms);
    const issues: PartIssue[] = [...front.errors, ...host.errors].map((e: GlossError) => ({ line: e.line, message: e.msg }));
    for (const d of all.dups) issues.push({ line: d.term.line, message: `the term "${d.term.label}" is defined twice: ${d.why} (first at line ${d.first.line}); keep one` });
    let terms = all.terms;
    if (terms.length > lim.glossaryTerms) {
      issues.push({ line: terms[lim.glossaryTerms].line, message: `more than ${lim.glossaryTerms} terms on the page; the rest are not marked in the text` });
      terms = terms.slice(0, lim.glossaryTerms);
    }
    if (!terms.length && !issues.length) return null;
    return { terms, m: matcher(terms, page.budget), seen: new Set(), used: new Set(), idPrefix: page.idPrefix, issues };
  },
  scan(text, st, budget) {
    if (!st.m) return [];
    const hits: { from: number; to: number; data: TermUse }[] = [];
    for (const f of st.m.find(text, budget)) {
      budget.charge(4);
      const t = f.term;
      st.used.add(t.id);
      if (st.seen.has(t.id)) continue;
      st.seen.add(t.id);
      hits.push({ from: f.from, to: f.to, data: { id: t.id, label: t.label, also: t.also, segs: t.segs, plain: defPlain(t.segs), link: t.from === "block" ? `#${st.idPrefix}term-${t.id}` : "" } });
    }
    return hits;
  },
  // a heading of level 1 or 2 starts a section: every term may be marked again
  section: (st, depth) => { if (depth <= 2) st.seen.clear(); },
  check(st) {
    const out = [...st.issues];
    for (const t of st.terms) if (t.from !== "host" && !st.used.has(t.id)) out.push({ line: t.line, level: "warn", message: `the term "${t.label}" is never used in the text` });
    return out;
  },
  // a host's terms are listed once at the top of the LLM view (a page's own terms are listed by its block, or stay in its front matter)
  llmHead: (st) => { const h = st.terms.filter((t) => t.from === "host"); return h.length ? glossaryLlm(h).replace("Glossary:", "Glossary (from the site):") : ""; },
});
