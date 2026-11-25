// Citation marks in the text (format version 11): `[@key]`, `[@key, p. 12]`, `[@a; @b]`. An inline part (parts/inline.ts): it reads the
// plain text of a paragraph, a list item, a quote, a callout or a table cell, never code, a link or a heading. The marks are
// drawn from the page's ```references block (part.ts, the same folder): `(Smith & Lee, 2020)` in apa and chicago, `[1]` in ieee.
// A mark opens a card with the entry; a mark whose key is not in the list stays as written, with a problem that names the nearest key.
import { defineInline } from "../inline";
import { capsOf, citeGroups, citeLabel, formatRef, parseRefs, plainRef, refDoc, refLink, type Ref, type RefDoc, type Seg, type Style } from "./format";

/** one cite inside a mark: its label, which use of the key it is (for the list's links back) and the entry's card */
export interface CiteUse { key: string; label: string; n: number; id: string; card: { segs: Seg[]; plain: string; link: string } }
export interface CiteMark { style: Style; cites: CiteUse[] }
export interface CiteState {
  style: Style; doc: RefDoc | null; byId: Map<string, Ref>; idPrefix: string; seen: Record<string, number>; total: number; cap: number;
  cards: Map<string, CiteUse["card"]>;
  /** problems about the whole page, found by prepare */
  issues: { line: number; level?: "warn" | "error"; message: string }[];
}

export default defineInline<CiteState, CiteMark>({
  name: "references",
  // the marker "[@" is this part's own: it reads before the parts that match plain words
  rank: -1,
  prepare(page) {
    const texts = page.texts ?? [];
    const mentions = texts.some((t) => t.includes("[@"));
    if (!page.blocks.length && !mentions) return null;
    const caps = capsOf(page.limits);
    const issues: CiteState["issues"] = [];
    if (page.blocks.length > 1) issues.push({ line: page.blocks[1].line, message: "two references blocks; a page has one list (merge them)" });
    let doc: RefDoc | null = null;
    const byId = new Map<string, Ref>();
    if (page.blocks.length) {
      const b = page.blocks[0];
      const r = parseRefs(b.body, b.attrs, b.bodyLine, caps, page.budget);
      for (const x of r.refs) byId.set(x.id, x);
      doc = refDoc(r.refs, r.style, texts, caps, page.budget);
      if (doc.cites > caps.cites) issues.push({ line: b.line, message: `more than ${caps.cites} cites on the page; the rest are left as written` });
      return { style: r.style, doc, byId, idPrefix: page.idPrefix, seen: {}, total: 0, cap: caps.cites, cards: new Map(), issues };
    }
    return { style: "apa", doc, byId, idPrefix: page.idPrefix, seen: {}, total: 0, cap: caps.cites, cards: new Map(), issues };
  },
  scan(text, st, budget) {
    const hits: { from: number; to: number; data: CiteMark; problem?: string; level?: "error" | "warn" }[] = [];
    for (const g of citeGroups(text, budget)) {
      budget.charge(g.cites.length * 4);
      const keys = g.cites.map((c) => c.key);
      const shown = `[@${keys.join("; @")}]`;
      if (!st.doc) { hits.push({ from: g.start, to: g.end, data: { style: st.style, cites: [] }, problem: `${shown} cites a key but the page has no references block; add a references block with the list` }); continue; }
      const bad = keys.find((k) => !st.byId.has(k));
      if (bad !== undefined) {
        const miss = st.doc.missing.find((m) => m.key === bad);
        hits.push({ from: g.start, to: g.end, data: { style: st.style, cites: [] }, problem: `[@${bad}] is not in the references list${miss?.near ? ` (did you mean ${miss.near}?)` : ""}` });
        continue;
      }
      if (st.total + g.cites.length > st.cap) { hits.push({ from: g.start, to: g.end, data: { style: st.style, cites: [] }, problem: "more cites than the page allows; this one is left as written", level: "warn" }); continue; }
      const cites: CiteUse[] = g.cites.map((c) => {
        const r = st.byId.get(c.key)!;
        const n = (st.seen[c.key] = (st.seen[c.key] ?? 0) + 1);
        st.total++;
        let card = st.cards.get(c.key);
        if (!card) { card = { segs: formatRef(r, st.style), plain: plainRef(r, st.style), link: refLink(r) }; st.cards.set(c.key, card); }
        return { key: c.key, label: citeLabel(r, st.style, st.doc!.num[c.key], c.locator), n, id: `${st.idPrefix}cite-${c.key}-${n}`, card };
      });
      hits.push({ from: g.start, to: g.end, data: { style: st.style, cites } });
    }
    return hits;
  },
  check: (st) => st.issues,
});
