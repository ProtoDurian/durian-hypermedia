// This package is the source of this file: edit it here. It began as a copy of the private prototype's composed stage (0.7.0).
// The composed stage as a part of a page: the small hooks the shared files call. An ```animation is a
// composed stage unless its fence asks for the graph engine (layout=graph or another engine layout, 3d, a kind).
import { compileStage, isStage, stageLlm, type Compiled } from "./stage";
import { pageRoles } from "./stage-roles";
import { cardTexts } from "./stage-cards";

type P = { name: string; attrs: Record<string, string>; head: string; steps: { title: string; raw: string; line: number }[]; bodyLine: number };
const STAGE_INFO = ["title"];
/** A composed scene's LLM view is its content (exempt from the 400-token:::llm rule); over this many tokens doccheck warns. */
export const STAGE_LLM_CEILING = 2000;
export const isStagePart = (p: { name: string; attrs: Record<string, string>; head?: string }) => p.name === "animation" && isStage(p.attrs, p.head);
/** the page's roles, set on every part by parseDoc (not enumerable: JSON and tests do not see it) */
export function setStageRoles(parts: object[], fm: any) { const r = pageRoles(fm); for (const p of parts) Object.defineProperty(p, "stageRoles", { value: r, enumerable: false, configurable: true }); return r; }
const rolesOf = (p: P): Record<string, number> => (p as any).stageRoles?.roles ?? {};
export function stageSrc(p: P) {
  const info: Record<string, string> = {};
  for (const k of STAGE_INFO) if (p.attrs[k]) info[k] = p.attrs[k];
  for (const [k, v] of Object.entries(((p as any).stageRoles?.theme ?? {}) as Record<string, string>)) info["theme:" + k] = v; // the page's stage tokens ride with the source
  return { head: p.head, steps: p.steps.map((s) => ({ title: s.title, raw: s.raw, line: s.line })), base: p.bodyLine, info };
}
const cache = new WeakMap<object, Compiled>();
export function stageOf(p: P): Compiled {
  let c = cache.get(p); if (c) return c;
  const s = stageSrc(p); c = compileStage(s.head, s.steps, s.base, s.info, rolesOf(p)); cache.set(p, c); return c;
}
/** what jsonOf hands the renderer */
export const stagePartJson = (p: P) => ({ src: stageSrc(p), roles: rolesOf(p) });
export const stagePartLlm = (p: P) => stageLlm(stageOf(p));
/** the words a person reads (the human text a translation keeps) */
export const stagePartTexts = (p: P): string[] => stageTexts(stageOf(p));
/** the words a person reads in a compiled stage, in story order */
export function stageTexts(c: Compiled): string[] {
  const m = c.model, out: string[] = [];
  if (m.title) out.push(m.title);
  for (const l of m.lanes) { if (l.title) out.push(l.title); for (const c of l.cards) out.push(...cardTexts(m, c)); out.push(...l.more); }
  for (const s of m.steps) out.push(s.title, s.caption);
  return out;
}
/** doccheck: errors and warnings of a composed scene, and the page's role list */
export function stagePartCheck(p: P): { errors: { line: number; msg: string }[]; warnings: { line: number; msg: string }[] } {
  const c = stageOf(p), roleErr = ((p as any).stageRoles?.errors ?? []) as string[];
  const toks = Math.round(stageLlm(c).length / 4), warnings = [...c.warnings];
  if (toks > STAGE_LLM_CEILING) warnings.push({ line: p.bodyLine - 1, msg: `this scene reads as ${toks} tokens in the LLM view, over ${STAGE_LLM_CEILING}: split it into two scenes` });
  return { errors: [...roleErr.map((msg) => ({ line: 1, msg })), ...c.errors], warnings };
}
/** The Format page's "## " sections, split only outside fenced blocks: a composed scene's lanes are "## " lines too. */
export function sectionsOutsideFences(text: string): string[] {
  const out: string[] = []; let cur: string[] = [], fence = "";
  for (const l of text.split("\n")) {
    const f = /^\s*(`{3,}|~{3,})/.exec(l);
    if (f) { if (!fence) fence = f[1]; else if (l.trim().startsWith(fence) && l.trim().replace(/[`~]/g, "") === "") fence = ""; }
    if (!fence && !f && l.startsWith("## ") && cur.length) { out.push(cur.join("\n")); cur = []; }
    cur.push(l);
  }
  if (cur.length) out.push(cur.join("\n"));
  return out;
}
