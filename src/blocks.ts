// Host blocks: a host adds its own fenced parts (```fy-task, ```fy-terminal ...) without forking the package.
// One definition serves the parser (parse, llm, check) and the React renderer (Component).
import type { Problem } from "./types";

/** What the parser hands a host block: the lines inside the fence, the info string's attributes, the fence's line. */
export interface BlockInput { body: string; attrs: Record<string, string>; line: number }
export interface BlockDef<D = unknown, C = unknown> {
  /** the fence word: lower case letters, digits and dashes, starting with a letter; not a built-in part's name */
  name: string;
  /** body to data (pure; throw an Error to show an error block with its message). Default: { body }. */
  parse?: (input: BlockInput) => D;
  /** what an LLM reads in place of the block. Default: the fence as written. */
  llm?: (data: D, input: BlockInput) => string;
  /** the block's own checks (doccheck runs them with the rest) */
  check?: (data: D, input: BlockInput) => { line?: number; level?: "error" | "warn"; message: string }[];
  /** the React component that draws it: receives { block, data } (only the React entry reads this) */
  Component?: C;
}
const NAME_RE = /^[a-z][a-z0-9-]{0,40}$/;
const global = new Map<string, BlockDef<any, any>>();

/** Make a block definition (type help only; it returns what it is given, after checking the name). */
export function defineBlock<D = unknown, C = unknown>(def: BlockDef<D, C>): BlockDef<D, C> {
  if (!NAME_RE.test(def.name)) throw new Error(`durian-hypermedia: a block name is lower case letters, digits and dashes, starting with a letter: "${def.name}"`);
  return def;
}
/** Register a block for every parse() and every renderer in this process (or pass `blocks` to parse() and the renderer
 *  instead, to keep it to one call). Registering a name twice replaces the first. */
export function registerBlock<D = unknown, C = unknown>(def: BlockDef<D, C>): void { global.set(def.name, defineBlock(def)); }
export function unregisterBlock(name: string): void { global.delete(name); }
export function registeredBlocks(extra: BlockDef<any, any>[] = []): Map<string, BlockDef<any, any>> {
  const m = new Map(global);
  for (const d of extra) m.set(d.name, defineBlock(d));
  return m;
}
export type BlockProblem = Problem;
