// durian-hypermedia/react: every part, ready to draw a Document.
//   import { DhDocument } from "durian-hypermedia/react";
//   import "durian-hypermedia/styles.css";
//   <DhDocument doc={doc} variant="flat" />
// For a smaller bundle, import DocumentView from "durian-hypermedia/react/document" and only the parts you need.
import React from "react";
import { DocumentView, Blocks, type DocumentProps } from "./document";
import { MarkdownPart } from "./markdown";
import { TerminalPart } from "./terminal";
import { FileTreePart } from "./filetree";
import { EditorPart } from "./editor";
import { CodeWalkPart } from "./codewalk";
import { ChartPart } from "./chart";
import { MermaidPart } from "./mermaid";
import { AnimationPart } from "./animation";
import { TierListPart } from "./tierlist";
import { AlignmentPart } from "./alignment";
import { TabsPart, AccordionPart, HumanPart } from "./containers";
import { SvgPart, InteractiveStill } from "./reference";
import type { Components } from "./context";

export const ALL_PARTS: Components = {
  terminal: TerminalPart, filetree: FileTreePart, editor: EditorPart, codewalk: CodeWalkPart, chart: ChartPart, mermaid: MermaidPart,
  animation: AnimationPart, tierlist: TierListPart, alignment: AlignmentPart, tabs: TabsPart, accordion: AccordionPart, human: HumanPart,
  svg: SvgPart, interactive: InteractiveStill,
};
/** A Document with every part. */
export function DhDocument(p: DocumentProps) { return <DocumentView {...p} components={{ ...ALL_PARTS, ...(p.components ?? {}) }} />; }
export default DhDocument;
export { DocumentView, Blocks, MarkdownPart, TerminalPart, FileTreePart, EditorPart, CodeWalkPart, ChartPart, MermaidPart, AnimationPart, TierListPart, AlignmentPart, TabsPart, AccordionPart, HumanPart };
export { DEFAULT_SLOTS, plainCode, useDh, type Slots, type Components, type PartComponent, type CodeSlotProps, type InlineCodeSlotProps, type LinkSlotProps, type TableSlotProps, type HeadingSlotProps, type MermaidSlotProps } from "./context";
export { HostMermaidPart } from "./mermaid-host";
export { UI, type Ui } from "../ui/ui";
export type { DocumentProps };
