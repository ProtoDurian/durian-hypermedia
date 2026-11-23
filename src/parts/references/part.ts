// The references block (format version 11): the list that `[@key]` marks in the text point to.
//
//   ```references style=apa
//   - id: smith2020
//     author: Smith, Jane; Lee, Kim
//     title: A study of marks
//     in: Journal of Studies
//     year: 2020
//   ```
//
// A block draws the list (sorted for apa and chicago, in order of first cite for ieee) with "cited N times" and links back to each
// mark. Each mark in the text (inline.ts, the same folder) opens a card with the entry. One block per page.
import { definePart } from "../types";
import { capsOf, formatRef, parseRefs, plainRef, refDoc, refLink, type Seg, type Style } from "./format";

export interface Entry { id: string; num: number; segs: Seg[]; plain: string; link: string; uses: number }
export interface RefsData {
  title: string | null; style: Style;
  /** the page's id prefix: the list's anchors are `<idPrefix>ref-<id>` and the marks' `<idPrefix>cite-<id>-<n>` */
  idPrefix: string;
  entries: Entry[];
  problems: { line: number; msg: string; level: "error" | "warn" }[];
}

export default definePart<RefsData>({
  name: "references",
  form: "fenced",
  steps: false,
  llmKind: "own",
  parse(input, ctx) {
    const caps = capsOf(ctx.limits);
    const r = parseRefs(input.body, input.attrs, input.bodyLine, caps, ctx.budget);
    const doc = refDoc(r.refs, r.style, ctx.texts ?? [], caps, ctx.budget);
    const problems = [...r.problems];
    const entries: Entry[] = doc.refs.map((x) => {
      ctx.budget.charge(8, 1, 200);
      const uses = doc.uses[x.id] ?? 0;
      if (!uses && (ctx.texts ?? []).length) problems.push({ line: input.bodyLine, level: "warn", msg: `reference "${x.id}" is never cited` });
      return { id: x.id, num: doc.num[x.id], segs: formatRef(x, r.style), plain: plainRef(x, r.style), link: refLink(x), uses };
    });
    return { title: input.attrs.title ? input.attrs.title.slice(0, 120) : null, style: r.style, idPrefix: ctx.idPrefix ?? "dh-", entries, problems };
  },
  llm: (d) => llmOf(d),
  check: (d) => d.problems.map((p) => ({ line: p.line, level: p.level, message: p.msg })),
});
function llmOf(d: RefsData): string {
  return ["References:", ...d.entries.map((e) => `- [${e.id}] ${e.plain}`)].join("\n");
}
