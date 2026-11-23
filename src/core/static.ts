// Static (format version 11, SPEC 4.1): doccheck's rules for a part's `static` fence value and the page's front matter
// `static:`, and the parse-time step of `static=<title>` into its step number. The renderer side is src/parts/kit/static.ts.
import { terminalSteps, type PartNode } from "./dh-lib";
/** The step titles a part's `static=<title>` can name (its `@step` lines). */
// a terminal with no @step lines steps one command at a time: its commands are its steps (with no titles)
const titlesOf = (p: PartNode) => (p.name === "terminal" || p.name === "console") && !p.steps.length ? terminalSteps(p).map(() => "") : p.steps.map((s) => s.title.trim());

/** doccheck: `static=<number>` in range, `static=<title>` names a step; a value on a part with no steps is a warning. */
export function staticIssues(p: PartNode): { line: number; msg: string; level: "error" | "warn" }[] {
  const a = p.attrs?.static;
  if (a === undefined) return [];
  const v = a.trim(), low = v.toLowerCase();
  if (v === "" || low === "true" || low === "false") return [];
  const titles = titlesOf(p), n = titles.length;
  if (p.attrs.steps === "each") return /^\d+$/.test(v) && +v >= 1 ? [] : [{ line: p.line, msg: `${p.name}: with steps=each a step has no title; write static=<number> (from 1) or static for the last one`, level: "error" }];
  if (n < 2) return [{ line: p.line, msg: `${p.name}: static=${v} names a step, but this part has no steps (it has one state); write static alone`, level: "warn" }];
  if (/^\d+$/.test(v)) return +v >= 1 && +v <= n ? [] : [{ line: p.line, msg: `${p.name}: static=${v} is not a step; the steps are 1 to ${n} (or static alone for the last one)`, level: "error" }];
  if (titles.some((t) => t.toLowerCase() === low)) return [];
  if (titles.every((t) => !t)) return [{ line: p.line, msg: `${p.name}: static="${v}" names no step; its steps have no titles: write static=<number> (1 to ${n}) or static alone for the last one`, level: "error" }];
  const list = titles.map((t, k) => `${k + 1} "${t.length > 40 ? t.slice(0, 39) + "…" : t}"`).join(", ");
  return [{ line: p.line, msg: `${p.name}: static="${v}" names no step; write a step's number or its exact title (${list})`, level: "error" }];
}

/** At parse time: `static="<title>"` becomes that step's number, so a renderer only meets "", a number or false.
 *  A title that names no step is left as it is (doccheck refuses it; a renderer draws the last step). */
export function normaliseStatic(p: PartNode): void {
  const a = p.attrs?.static;
  if (a === undefined) return;
  const v = a.trim(), low = v.toLowerCase();
  if (v === "" || /^\d+$/.test(v) || low === "true" || low === "false") return;
  const k = p.steps.findIndex((s) => s.title.trim().toLowerCase() === low);
  if (k >= 0) p.attrs.static = String(k + 1);
}

/** doccheck: the front matter's `static:` is true or false (also yes, no, 1, 0). */
export function frontMatterStaticIssue(fm: Record<string, unknown> | null | undefined): string | null {
  if (!fm || !("static" in fm)) return null;
  const v = fm.static;
  if (typeof v === "boolean" || v === 0 || v === 1) return null;
  if (typeof v === "string" && ["true", "false", "yes", "no", "1", "0"].includes(v.trim().toLowerCase())) return null;
  return `static: in the front matter is true (every part of the page shows one still state) or false, not ${JSON.stringify(v)}`;
}
