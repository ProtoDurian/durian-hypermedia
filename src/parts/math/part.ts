// The maths fence (format version 11): ```math with TeX inside, a formula in a block of its own (the same as `$$ ... $$`).
//
//   ```math
//   \sum_{k=1}^{n} k = \frac{n(n+1)}{2}
//   ```
import { definePart } from "../types";
import { drawMath, where } from "./inline";
import type { MathData } from "./scan";

export default definePart<MathData & { problem?: string }>({
  name: "math",
  form: "fenced",
  steps: false,
  llmKind: "own",
  dependencies: ["katex"],
  parse(input, ctx) {
    const tex = input.body.replace(/^\n+|\n+$/g, "");
    const r = drawMath(tex, true, { caps: { chars: ctx.limits.mathChars, nodes: ctx.limits.mathNodes } }, ctx.budget);
    return { ...r.data, ...(r.problem ? { problem: r.problem } : {}) };
  },
  // the TeX as written, between $$ signs
  llm: (d) => `$$\n${d.tex}\n$$`,
  check: (d) => (d.problem ? [{ message: d.problem }] : []),
});
export { where };
