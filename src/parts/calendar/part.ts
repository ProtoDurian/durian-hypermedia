import { definePart } from "../types";
import { calendarOf, calendarLlm, calendarWarnings, type CalSpec } from "./model";
export default definePart<CalSpec>({
  name:"calendar", form:"fenced", steps:false, llmKind:"own",
  parse: (input,ctx) => calendarOf(input,ctx.budget,{lines:ctx.limits.calendarLines,occurrences:ctx.limits.calendarOccurrences}),
  llm: s => s.errors.length ? `[Calendar not shown: ${s.errors[0].msg}]` : calendarLlm(s),
  check: (s,input) => [...s.errors.map(e=>({line:e.line || input.line,message:e.msg.replace(/^calendar:\s*/,"")})),...calendarWarnings(s).map(e=>({line:e.line || input.line,message:e.msg.replace(/^calendar:\s*/,""),level:"warn" as const}))],
});
