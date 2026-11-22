import { definePart, type PartInput, type PartContext, type PartIssue } from "../types";
import { BudgetError } from "../../core/budget";
import { LANG_ALIASES, TRACE_KEYS, TRACE_LANGS, parseTrace, markApp, secretIn, traceLlm, type Trace } from "./trace";
export interface StackData { title: string; trace: Trace | null; strip: string; repo: string; error: string | null; appHits: number; issues: PartIssue[]; text: string }
export function parseStack(input: PartInput, ctx: PartContext): StackData {
  const a = input.attrs, issues: PartIssue[] = [];
  ctx.budget.charge(input.body.length);
  const lines = input.body.split("\n").length;
  if (lines > ctx.limits.stacktraceLines) throw new Error(`trace has ${lines} lines; at most ${ctx.limits.stacktraceLines}`);
  for (const k of Object.keys(a)) { ctx.budget.charge(1 + k.length); if (!TRACE_KEYS.includes(k)) issues.push({ line: input.line, message: `unknown option "${k}" (options: ${TRACE_KEYS.join(", ")})` }); }
  if (a.lang && !LANG_ALIASES[a.lang.toLowerCase()]) issues.push({ line: input.line, message: `unknown lang="${a.lang}" (languages: ${TRACE_LANGS.join(", ")})` });
  if (a.strip && !a.repo) issues.push({ line: input.line, message: "strip= needs repo= (the pinned repo the files belong to)" });
  const sec = secretIn(input.body, ctx.budget); if (sec) issues.push({ line: input.line, message: `the trace looks like it holds ${sec}; take it out before it goes on a page` });
  let trace: Trace | null = null, error: string | null = null, appHits = 0, text = "";
  try { trace = parseTrace(input.body, a.lang ? LANG_ALIASES[a.lang.toLowerCase()] ?? null : null, ctx.budget, ctx.limits.stacktraceLines); appHits = markApp(trace, a.app, ctx.budget);
    if (a.app && !appHits) issues.push({ line: input.line, level: "warn", message: `app="${a.app}" matches no frame; check the module, package or path prefix` });
    const attrs = Object.entries(a).filter(([k]) => !["id", "title"].includes(k)).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" ");
    text = traceLlm(input.body, `stacktrace${attrs ? " " + attrs : ""}`, a, trace, ctx.budget);
  } catch (e) { if (e instanceof BudgetError) throw e; error = e instanceof Error ? e.message : String(e); issues.push({ line: input.line, message: error }); }
  return { title: a.title ?? "", trace, strip: a.strip ?? "", repo: a.repo ?? "", error, appHits, issues, text };
}
export default definePart<StackData>({ name: "stacktrace", form: "fenced", steps: false, llmKind: "own", parse: parseStack, llm: (d) => d.text, check: (d) => d.issues });
