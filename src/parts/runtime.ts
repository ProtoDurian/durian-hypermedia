// The one place the format's shared code meets the folder parts (format version 11). The parser (core/dh-lib.ts),
// parse() (document.ts) and doccheck (core/doccheck.ts) each call one function here; the folders are listed by the
// generated registry. Builders never edit this file: a part's own code lives in its folder.
import { FOLDER_PART_DEFS } from "./generated/registry";
import { BudgetError, currentBudget, partBudget } from "../core/budget";
import { LIMITS } from "../safety";
import type { PartNode } from "../core/dh-lib";
import type { PartDef, PartInput } from "./types";

/** The folder part of that fence word, if there is one. */
export const folderPart = (name: string): PartDef<any> | undefined => (Object.hasOwn(FOLDER_PART_DEFS, name) ? FOLDER_PART_DEFS[name] : undefined);

/** The rows the format's parser adds to its own part table (core/dh-lib.ts PARTS). */
export function folderPartRows(): Record<string, { form: "fenced"; llm: "part"; steps: boolean }> {
  const out: Record<string, { form: "fenced"; llm: "part"; steps: boolean }> = {};
  for (const [name, d] of Object.entries(FOLDER_PART_DEFS)) out[name] = { form: "fenced", llm: "part", steps: d.steps };
  return out;
}

export function inputOf(p: PartNode, def: PartDef<any>): PartInput {
  return {
    body: p.body, bodyLine: p.bodyLine, line: p.line, attrs: { ...p.attrs },
    head: def.steps ? p.head : "", steps: def.steps ? p.steps.map((s) => ({ title: s.title, line: s.line, raw: s.raw })) : [],
  };
}

type Read = { ok: true; data: unknown; input: PartInput } | { ok: false; message: string; budget: boolean; input: PartInput };
// a part is read once per node: parse(), its LLM view and its checks reuse it (and charge the budget once)
const reads = new WeakMap<PartNode, Read>();

/** Read a folder part: its data, or why it could not be read. A BudgetError is never swallowed into data. */
export function readPart(p: PartNode, def: PartDef<any>): Read {
  const had = reads.get(p);
  if (had) return had;
  const input = inputOf(p, def);
  let r: Read;
  try {
    const budget = partBudget(`the ${def.name} part`);
    const limits = currentBudget()?.lim ?? LIMITS;
    r = { ok: true, data: def.parse(input, { limits, budget }), input };
  } catch (e) {
    r = { ok: false, message: e instanceof Error ? e.message : String(e), budget: e instanceof BudgetError, input };
  }
  reads.set(p, r);
  return r;
}

/** What an LLM reads for a folder part with no :::llm after it; null = the fence as written. */
export function folderLlm(p: PartNode): string | null {
  const def = folderPart(p.name);
  if (!def || def.llmKind !== "own" || !def.llm) return null;
  const r = readPart(p, def);
  if (!r.ok) return `[${p.name} not shown: ${r.message}]`;
  return String(def.llm(r.data, r.input) ?? "");
}

/** doccheck's rules for a folder part (called from core/doccheck.ts checkPartData). */
export function folderCheck(p: PartNode, err: (line: number, msg: string) => void, warn: (line: number, msg: string) => void): void {
  const def = folderPart(p.name);
  if (!def) return;
  const r = readPart(p, def);
  if (!r.ok) { err(p.line, `${p.name}: ${r.message}`); return; }
  if (!def.check) return;
  for (const i of def.check(r.data, r.input) ?? []) (i.level === "warn" ? warn : err)(i.line ?? p.line, i.message.startsWith(`${p.name}:`) ? i.message : `${p.name}: ${i.message}`);
}

/** parse()'s hook (document.ts): the block of a folder part, or the message to refuse it with; null for any other part
 *  (then nothing is read or computed here: `base` is called only for a folder part, after it was read). */
export function folderBlock(p: PartNode, base: () => Record<string, unknown>): { block: Record<string, unknown> } | { refuse: string } | null {
  const def = folderPart(p.name);
  if (!def) return null;
  const r = readPart(p, def);
  if (!r.ok) return { refuse: r.budget ? r.message : `could not be read (${r.message})` };
  const llmKind = p.llm ? "text" : p.attrs.llm === "none" ? "none" : def.llmKind;
  return { block: { type: p.name, ...base(), llmKind, data: r.data } };
}
