// durian-hypermedia/react/strict: every part, for a page under Trusted Types (require-trusted-types-for 'script').
// The same as "durian-hypermedia/react" except the mermaid part: it is HostMermaidPart, which imports neither mermaid
// nor DOMPurify and draws each diagram step with the host's Mermaid slot (or shows its source as text). No module this
// entry reaches sets an HTML string (no dangerouslySetInnerHTML, no innerHTML); test/trusted-types.test.ts checks
// the import graph, and `bun run tt` renders every fixture in Chrome under the policy.
//   import { DhDocument } from "durian-hypermedia/react/strict";
//   <DhDocument doc={doc} slots={{ Mermaid: MyDiagram, Code: MyCode, Link: MyLink }} />
import React from "react";
import { DocumentView, Blocks, type DocumentProps } from "./document";
import { MarkdownPart } from "./markdown";
import { TerminalPart } from "./terminal";
import { FileTreePart } from "./filetree";
import { EditorPart } from "./editor";
import { CodeWalkPart } from "./codewalk";
import { ChartPart } from "./chart";
import { HostMermaidPart } from "./mermaid-host";
import { AnimationPart } from "./animation";
import { TierListPart } from "./tierlist";
import { AlignmentPart } from "./alignment";
import { TabsPart, AccordionPart, HumanPart } from "./containers";
import type { Components } from "./context";
import { FOLDER_PART_COMPONENTS } from "../parts/generated/react";

export const STRICT_PARTS: Components = {
  terminal: TerminalPart, filetree: FileTreePart, editor: EditorPart, codewalk: CodeWalkPart, chart: ChartPart, mermaid: HostMermaidPart,
  animation: AnimationPart, tierlist: TierListPart, alignment: AlignmentPart, tabs: TabsPart, accordion: AccordionPart, human: HumanPart,
  // the parts in their own folders (src/parts/<name>/): none sets an HTML string (test/parts.test.ts)
  ...(FOLDER_PART_COMPONENTS as Components),
};
/** A Document with every part; mermaid diagrams are drawn by the host's Mermaid slot. */
export function DhDocument(p: DocumentProps) { return <DocumentView {...p} components={{ ...STRICT_PARTS, ...(p.components ?? {}) }} />; }
export default DhDocument;
export { DocumentView, Blocks, MarkdownPart, TerminalPart, FileTreePart, EditorPart, CodeWalkPart, ChartPart, HostMermaidPart, AnimationPart, TierListPart, AlignmentPart, TabsPart, AccordionPart, HumanPart };
export { DEFAULT_SLOTS, plainCode, useDh, type Slots, type Components, type PartComponent, type CodeSlotProps, type InlineCodeSlotProps, type LinkSlotProps, type TableSlotProps, type HeadingSlotProps, type MermaidSlotProps } from "./context";
export { UI, type Ui } from "../ui/ui";
export type { DocumentProps };
