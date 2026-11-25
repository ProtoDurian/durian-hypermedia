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

/** The folder part a code block is, when its info word is not a part's own name: ```json explore (a part's fences), or a
 *  ```chart whose top-level `kind:` a part claims (its chartKinds). null: the word stands as it is. One pass over the info
 *  string, and for a chart one pass over its lines until a top-level `kind:` line. */
export function folderFenceWord(word: string, rest: string, body: () => string[]): string | null {
  if (word === "chart") {
    if (!CHART_KINDS.size) return null;
    for (const l of body()) {
      if (!l.startsWith("kind:")) continue;
      let v = l.slice(5).trim();
      const hash = v.indexOf(" #"); if (hash >= 0) v = v.slice(0, hash).trim();
      if (v.length > 1 && (v[0] === "\"" || v[0] === "'") && v[v.length - 1] === v[0]) v = v.slice(1, -1);
      return CHART_KINDS.get(v) ?? null;
    }
    return null;
  }
  const claims = FENCES.get(word);
  if (!claims) return null;
  const words = new Set(rest.split(/\s+/));
  for (const [flag, name] of claims) if (words.has(flag)) return name;
  return null;
}
const CHART_KINDS = new Map<string, string>();
const FENCES = new Map<string, [string, string][]>();
for (const [name, d] of Object.entries(FOLDER_PART_DEFS)) {
  for (const k of d.chartKinds ?? []) CHART_KINDS.set(k, name);
  for (const f of d.fences ?? []) { let a = FENCES.get(f.word); if (!a) FENCES.set(f.word, (a = [])); a.push([f.flag, name]); }
}
/** the word a part's doccheck messages start with: "chart" for a part that draws chart kinds, else its name */
const wordOf = (def: PartDef<any>) => (def.chartKinds?.length ? "chart" : def.name);

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

// the id prefix of the parse() or check() call running now (both are synchronous, like the page budget they sit beside)
let ambientPrefix = "dh-";
/** Run fn with this id prefix known to the folder parts' parse (PartContext.idPrefix). */
export function withIdPrefix<T>(prefix: string, fn: () => T): T {
  const before = ambientPrefix;
  ambientPrefix = prefix;
  try { return fn(); } finally { ambientPrefix = before; }
}

type Read = { ok: true; data: unknown; input: PartInput } | { ok: false; message: string; budget: boolean; input: PartInput };
// a part is read once per node: parse(), its LLM view and its checks reuse it (and charge the budget once)
const reads = new WeakMap<PartNode, Read>();

/** Read a folder part: its data, or why it could not be read. A BudgetError is never swallowed into data. */
export function readPart(p: PartNode, def: PartDef<any>): Read {
  const had = reads.get(p);
  if (had) return had;
  const input = inputOf(p, def);
  if (def.fences?.length) { const m = /^\s*[`~]{3,}\s*([^\s`{]+)/.exec(p.open); input.attrs.lang = m && m[1] !== def.name ? m[1] : (input.attrs.lang ?? def.name); }
  let r: Read;
  try {
    const budget = partBudget(`the ${def.name} part`);
    const limits = currentBudget()?.lim ?? LIMITS;
    r = { ok: true, data: def.parse(input, { limits, budget, frontMatter: p.fm ?? {}, texts: p.texts ?? [], idPrefix: ambientPrefix }), input };
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

/** Is this folder part's LLM view allowed over the 400-token rule (its llmExempt says so for its data)? */
export function folderLlmExempt(p: PartNode): boolean {
  const def = folderPart(p.name);
  if (!def?.llmExempt) return false;
  const r = readPart(p, def);
  return r.ok && !!def.llmExempt(r.data);
}

/** doccheck's rules for a folder part (called from core/doccheck.ts checkPartData). */
export function folderCheck(p: PartNode, err: (line: number, msg: string) => void, warn: (line: number, msg: string) => void): void {
  const def = folderPart(p.name);
  if (!def) return;
  const r = readPart(p, def);
  const w = wordOf(def);
  if (!r.ok) { err(p.line, `${w}: ${r.message}`); return; }
  if (!def.check) return;
  for (const i of def.check(r.data, r.input) ?? []) (i.level === "warn" ? warn : err)(i.line ?? p.line, i.message.startsWith(`${w}:`) ? i.message : `${w}: ${i.message}`);
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
