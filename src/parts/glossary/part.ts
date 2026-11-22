// The glossary block (format version 11): terms defined once. The same folder holds the terms in prose (inline.ts).
//
//   ```glossary title="Words we use"
//   term "UL": the words a team agrees on and uses in code and talk
//   term bc "bounded context" also "context": one part of the system with its own words
//   ```
//
// A block draws the list of its terms (each with an anchor); the first use of each term in the text of a section is a button
// with the meaning in a card (inline.ts). The same terms can be in front matter (`glossary:` and `UL: the words`).
import { definePart } from "../types";
import { GLOSS_KEYS, glossaryLlm, parseGlossaryBlock, type GlossError, type Term } from "./terms";

export interface GlossaryData { title: string | null; terms: Term[]; errors: GlossError[] }

export default definePart<GlossaryData>({
  name: "glossary",
  form: "fenced",
  steps: false,
  llmKind: "own",
  parse(input, ctx) {
    const r = parseGlossaryBlock(input.body, input.bodyLine, ctx.limits, ctx.budget);
    const errors = [...r.errors];
    for (const k of Object.keys(input.attrs)) if (!GLOSS_KEYS.includes(k)) errors.push({ line: input.line, msg: `unknown key "${k.slice(0, 30)}"; the keys are ${GLOSS_KEYS.join(", ")}` });
    const title = input.attrs.title ? input.attrs.title.slice(0, 120) : null;
    return { title, terms: r.terms, errors };
  },
  llm: (data) => glossaryLlm(data.terms),
  check: (data) => data.errors.map((e) => ({ line: e.line, message: e.msg })),
});
