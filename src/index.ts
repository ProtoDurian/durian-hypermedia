// durian-hypermedia: the format, a pure parser, the LLM view and the checks. No DOM, no files, no network.
//   import { parse, llmView, check } from "durian-hypermedia";
//   const doc = parse(text, { urlPolicy, blocks });   // typed, safe tree (types.ts)
//   llmView(doc);                                     // what an LLM reads
//   check(doc);                                       // doccheck's rules, as a list
//   animationTexts(block);                            // the texts of an animation block (also block.texts)
// Colours for code: highlight(doc) from "durian-hypermedia/server" (Bun or Node; Code Hike needs WebAssembly).
// Drawing: "durian-hypermedia/react" (all parts) or "durian-hypermedia/react/<part>" (one part each).
export { parse, llmView, check, animationTexts, FORMAT_VERSION, type ParseOptions } from "./document";
export { defineBlock, registerBlock, unregisterBlock, type BlockDef, type BlockInput } from "./blocks";
export { LIMITS, defaultUrlPolicy, applyUrlPolicy, schemeOf, type Limits, type UrlPolicy, type UrlKind } from "./safety";
export { setYamlParser } from "./host/yaml";
export { CALLOUT_WORDS, inlineText, slug, type InlineDef } from "./markdown";
import type { InlineDef } from "./markdown";
/** Make an inline reference definition (type help; checks the name when first used). */
export function defineInline<D = unknown, C = unknown>(def: InlineDef<D, C>): InlineDef<D, C> { return def; }
export type * from "./types";
/** This package's version (package.json); a consumer can check the one it pinned. */
export const VERSION = "0.4.0";
export const PART_NAMES = ["terminal", "filetree", "editor", "codewalk", "chart", "mermaid", "animation", "tierlist", "alignment", "tabs", "accordion", "human", "llm"] as const;
