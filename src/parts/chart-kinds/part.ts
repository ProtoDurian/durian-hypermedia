// The chart-kinds part (format version 11): eight new kinds of a ```chart, each a YAML map with `kind:` at the top level:
// histogram, boxplot, violin, funnel, waterfall, treemap, sunburst and calendar. The format hands this part such a chart
// (input.body is its YAML); the numbers come from compute.ts, which the LLM view, doccheck and the browser all read.
//
//   ```chart
//   kind: histogram
//   x: { label: latency, format: duration-ms }
//   marks: [p50, p95]
//   data: [112, 98, 143, 131, 87, 205, 119]
//   ```
import { definePart } from "../types";
import { BudgetError } from "../../core/budget";
import { chargeYaml, yamlParse } from "../../host/yaml";
import { isSpace, type Err } from "../kit/text";
import type { Budget } from "../../core/budget";
import { KINDS, capsOf, compute, llmText, type View } from "./compute";

export interface ChartStep { title: string; view: View }
export interface ChartKindsData {
  kind: string;
  title: string;
  /** every step's drawing numbers (one entry when the chart has no steps); empty when the chart has errors */
  steps: ChartStep[];
  /** true when the chart was written with `steps:` (two or more) */
  stepped: boolean;
  errors: Err[];
  warnings: Err[];
}

/** the line of each top-level key of the chart's YAML (the first one), for the lines refusals name */
function keyLines(body: string, baseLine: number, b: Budget): Map<string, number> {
  const out = new Map<string, number>();
  let line = baseLine;
  for (let from = 0; from <= body.length; line++) {
    let to = body.indexOf("\n", from);
    if (to < 0) to = body.length;
    b.charge(1 + ((to - from) >> 4));
    const c = body[from];
    if (c !== undefined && c !== "#" && c !== "-" && c !== " " && c !== "\t" && !isSpace(c)) {
      const colon = body.indexOf(":", from);
      if (colon >= 0 && colon < to) { const key = body.slice(from, colon).trim(); if (key && !out.has(key)) out.set(key, line); }
    }
    if (to === body.length) break;
    from = to + 1;
  }
  return out;
}
const kindWord = (body: string): string => {
  for (const l of body.split("\n", 400)) if (l.startsWith("kind:")) return l.slice(5).trim();
  return "chart";
};

export function parseChartKinds(body: string, bodyLine: number, line: number, limits: Parameters<typeof capsOf>[0], b: Budget): ChartKindsData {
  const empty = (msg: string, key = "kind", kind = ""): ChartKindsData => ({ kind, title: "", steps: [], stepped: false, errors: [{ line: lines.get(key) ?? line, msg }], warnings: [] });
  b.charge(1 + (body.length >> 4));
  const lines = keyLines(body, bodyLine, b);
  let d: unknown;
  try { d = yamlParse(body); chargeYaml(d, b); }
  catch (e) { if (e instanceof BudgetError) throw e; return empty(`the chart's YAML cannot be read: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`); }
  if (!d || typeof d !== "object" || Array.isArray(d)) return empty(`a chart is a YAML map such as "kind: histogram" then "data: [...]"; this is ${Array.isArray(d) ? "a list" : "not a map"}`);
  const dd = d as Record<string, unknown>;
  const kind = typeof dd.kind === "string" ? dd.kind : "";
  if (!KINDS.includes(kind)) return empty(`kind must be one of ${KINDS.join(", ")}`, "kind", kind);
  const r = compute(dd, b, capsOf(limits));
  const at = (i: { key: string; msg: string }): Err => ({ line: lines.get(i.key) ?? line, msg: i.msg });
  const errors = r.errors.map(at), warnings = r.warnings.map(at);
  const title = typeof dd.title === "string" ? dd.title : "";
  if (errors.length || r.steps.some((s) => !s.view)) return { kind, title, steps: [], stepped: false, errors: errors.length ? errors : [{ line, msg: "the chart cannot be drawn" }], warnings };
  return { kind, title, steps: r.steps.map((s) => ({ title: s.stepTitle ?? "", view: s.view! })), stepped: r.steps.length > 1, errors, warnings };
}

export default definePart<ChartKindsData>({
  name: "chart-kinds",
  form: "fenced",
  steps: false,
  llmKind: "own",
  chartKinds: ["histogram", "boxplot", "violin", "funnel", "waterfall", "treemap", "sunburst", "calendar"],
  parse: (input, ctx) => parseChartKinds(input.body, input.bodyLine, input.line, ctx.limits, ctx.budget),
  llm: (d, input) => {
    if (d.errors.length) return `Chart (${d.kind || kindWord(input.body)}) could not be drawn: ${d.errors[0].msg}\n\n${input.body}`;
    return llmText(d.kind, d.title, d.steps.map((s) => ({ errors: [], warnings: [], view: s.view, stepTitle: s.title })));
  },
  check: (d) => [...d.errors.map((e) => ({ line: e.line, message: e.msg })), ...d.warnings.map((w) => ({ line: w.line, level: "warn" as const, message: w.msg }))],
});
