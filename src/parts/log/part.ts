import { definePart } from "../types";
import { LOG_KEYS, parseLog, logLlm, logRaws, type LogSpec } from "./logview";
import { logCaps, type QueryCaps } from "./query";
export interface LogData extends LogSpec { title: string; time: string; text: string; caps: QueryCaps }
export default definePart<LogData>({ name: "log", form: "fenced", steps: false, llmKind: "own",
 parse(input, ctx) {
   const caps = logCaps(ctx.limits), a = input.attrs;
   const d = parseLog(input.body, input.bodyLine, a, ctx.budget, ctx.limits.logLines, caps);
   if (!input.body.trim()) d.errors.push({ line: input.line, msg: "log is empty: paste the log lines" });
   for (const k of Object.keys(a)) { ctx.budget.charge(k.length+1); if (!LOG_KEYS.includes(k)) d.errors.push({ line: input.line, msg: `unknown option "${k}" (options: ${LOG_KEYS.join(", ")})` }); }
   return { ...d, title: a.title ?? "", time: a.time ?? "as-written", text: logLlm(d,a,logRaws(input.body),ctx.budget), caps };
 }, llm: d=>d.text, check: d=>d.errors.map(e=>({line:e.line,message:e.msg})) });
