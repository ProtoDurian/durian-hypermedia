// durian-markdown: the format, a pure parser, the LLM view and the checks. No DOM, no files, no network.
//   import { parse, llmView, check } from "durian-markdown";
//   const doc = parse(text, { urlPolicy, blocks });   // typed, safe tree (types.ts)
//   llmView(doc);                                     // what an LLM reads
//   check(doc);                                       // doccheck's rules, as a list
//   animationTexts(block);                            // the texts of an animation block (also block.texts)
// Colours for code: highlight(doc) from "durian-markdown/server" (Bun or Node; Code Hike needs WebAssembly).
// Drawing: "durian-markdown/react" (all parts) or "durian-markdown/react/<part>" (one part each).
export { parse, llmView, check, animationTexts, FORMAT_VERSION, type ParseOptions } from "./document";
export { defineBlock, registerBlock, unregisterBlock, type BlockDef, type BlockInput } from "./blocks";
export { LIMITS, UNTRUSTED_LIMITS, defaultUrlPolicy, applyUrlPolicy, schemeOf, type Limits, type UrlPolicy, type UrlKind } from "./safety";
export { setYamlParser } from "./host/yaml";
export { CALLOUT_WORDS, inlineText, slug, type InlineDef } from "./markdown";
export { REFERENCE_ONLY, REF_NAME_MAX, isReferenceType, nameProblem as referenceNameProblem, refText as referenceText } from "./core/refs";
export { answerOf as referenceAnswer, type ResolveReference, type ReferenceQuery, type ReferenceAnswer } from "./refs";
import type { InlineDef } from "./markdown";
import { FOLDER_PART_NAMES } from "./parts/generated/registry";
/** Make an inline reference definition (type help; checks the name when first used). */
export function defineInline<D = unknown, C = unknown>(def: InlineDef<D, C>): InlineDef<D, C> { return def; }
export type * from "./types";
/** This package's version (package.json); a consumer can check the one it pinned. */
export const VERSION = "0.7.0";
export const PART_NAMES = ["terminal", "filetree", "editor", "codewalk", "chart", "animation", "state", "class", "er", "tierlist", "alignment", "tabs", "accordion", "human", "llm", ...FOLDER_PART_NAMES] as const;
// the parts in their own folders (src/parts/<name>/, format version 11): their definitions, for tools and hosts
export { FOLDER_PART_NAMES, FOLDER_PARTS } from "./parts/generated/registry";
export { definePart, type PartDef, type PartInput, type PartContext, type PartIssue, type PartViewProps, type PartStage, type StaticProp } from "./parts/types";
