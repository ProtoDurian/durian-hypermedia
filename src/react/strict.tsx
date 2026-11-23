// durian-hypermedia/react/strict: every part, for a page under Trusted Types (require-trusted-types-for 'script').
// The same parts as "durian-hypermedia/react" (since 0.7.0 the two entries hold the same parts; this one stays so a
// host can name the promise in its import). No module this entry reaches sets an HTML string (no
// dangerouslySetInnerHTML, no innerHTML); test/trusted-types.test.ts checks the import graph, and `bun run tt` renders
// every fixture in Chrome under the policy.
//   import { DhDocument } from "durian-hypermedia/react/strict";
//   <DhDocument doc={doc} slots={{ Code: MyCode, Link: MyLink }} />
import React from "react";
import { DocumentView, Blocks, type DocumentProps } from "./document";
import { MarkdownPart } from "./markdown";
import { TerminalPart } from "./terminal";
import { FileTreePart } from "./filetree";
import { EditorPart } from "./editor";
import { CodeWalkPart } from "./codewalk";
import { ChartPart } from "./chart";
import { AnimationPart } from "./animation";
import { TierListPart } from "./tierlist";
import { AlignmentPart } from "./alignment";
import { TabsPart, AccordionPart, HumanPart } from "./containers";
import { SvgPart, InteractiveStill } from "./reference";
import type { Components } from "./context";
import { FOLDER_PART_COMPONENTS } from "../parts/generated/react";

export const STRICT_PARTS: Components = {
  terminal: TerminalPart, filetree: FileTreePart, editor: EditorPart, codewalk: CodeWalkPart, chart: ChartPart,
  animation: AnimationPart, tierlist: TierListPart, alignment: AlignmentPart, tabs: TabsPart, accordion: AccordionPart, human: HumanPart,
  svg: SvgPart, interactive: InteractiveStill,
  // the parts in their own folders (src/parts/<name>/): none sets an HTML string (test/parts.test.ts)
  ...(FOLDER_PART_COMPONENTS as Components),
};
/** A Document with every part, under Trusted Types. */
export function DhDocument(p: DocumentProps) { return <DocumentView {...p} components={{ ...STRICT_PARTS, ...(p.components ?? {}) }} />; }
export default DhDocument;
export { DocumentView, Blocks, MarkdownPart, TerminalPart, FileTreePart, EditorPart, CodeWalkPart, ChartPart, AnimationPart, TierListPart, AlignmentPart, TabsPart, AccordionPart, HumanPart };
export { DEFAULT_SLOTS, plainCode, useDh, type Slots, type Components, type PartComponent, type CodeSlotProps, type InlineCodeSlotProps, type LinkSlotProps, type TableSlotProps, type HeadingSlotProps } from "./context";
export { UI, type Ui } from "../ui/ui";
export type { DocumentProps };
