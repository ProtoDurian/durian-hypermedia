// What every part component reads: the renderer's words, the URL policy, the style variant, the host's slots and blocks.
import React, { createContext, useContext } from "react";
import type { HighlightedCode } from "codehike/code";
import { UI, type Ui } from "../ui/ui";
import type { Block, BlockType, ErrorBlock, HostBlock } from "../types";
import type { BlockDef } from "../blocks";
import type { UrlPolicy } from "../safety";
import type { DiagramDrawProps } from "../ui/parts";

/** Chrome a host style may swap. Each gets the default's props; return any React node. */
export interface Slots {
  /** the box around every part (default: <figure class="part part-<type>">) */
  Frame: React.ComponentType<{ block: Block; children: React.ReactNode }>;
  /** a "> **Note:**" callout */
  Callout: React.ComponentType<{ kind: string; label: string; children: React.ReactNode }>;
  /** a part that went over a cap or could not be read */
  Error: React.ComponentType<{ block: ErrorBlock }>;
  /** shown while a part loads (mermaid, the 3D stage's library) */
  Spinner: React.ComponentType<{ label: string }>;
  // The Markdown slots below have no default: without one the renderer draws the element itself.
  /** a fenced code block (not a part): the host draws it (its own colours, a Copy button) */
  Code?: React.ComponentType<CodeSlotProps>;
  /** an inline code span */
  InlineCode?: React.ComponentType<InlineCodeSlotProps>;
  /** every link that passed the URL policy (a link the policy refused stays a span.dh-link-off) */
  Link?: React.ComponentType<LinkSlotProps>;
  /** a Markdown table: the parsed header and rows, each cell already drawn as React children */
  Table?: React.ComponentType<TableSlotProps>;
  /** a Markdown heading, at its level after demoteHeadings */
  Heading?: React.ComponentType<HeadingSlotProps>;
  /** draws one step of a mermaid diagram instead of the in-page mermaid library (see the mermaid part) */
  Mermaid?: React.ComponentType<MermaidSlotProps>;
}
export interface CodeSlotProps {
  /** the first word of the fence's info string ("" when none) */
  lang: string;
  /** the code, as written */
  text: string;
  /** the rest of the info string after the language ("" when none), e.g. `title="a.ts" {3}` */
  meta: string;
  /** Code Hike tokens when highlight() ran on the server; ignore it to colour the code yourself */
  hl?: unknown;
}
export interface InlineCodeSlotProps { text: string }
export interface LinkSlotProps {
  /** the URL after the URL policy */
  href: string;
  title?: string;
  /** the URL has a scheme or starts with // (the default renderer opens these in a new tab) */
  external: boolean;
  children: React.ReactNode;
}
export interface TableSlotProps {
  align: ("left" | "right" | "center" | null)[];
  /** the header cells, drawn */
  head: React.ReactNode[];
  /** the body rows, each cell drawn */
  rows: React.ReactNode[][];
  /** the header cells as plain text (labels for a phone layout) */
  headText: string[];
}
export interface HeadingSlotProps {
  /** the level written in the page (1 for "#") */
  depth: number;
  /** the level to draw, after demoteHeadings (at most 6) */
  level: number;
  /** the heading's id (prefixed, unique in the page) */
  id: string;
  /** the heading as plain text */
  text: string;
  children: React.ReactNode;
}
export type MermaidSlotProps = DiagramDrawProps;
export type PartComponent<B extends Block = any> = React.ComponentType<{ block: B }>;
export type Components = Partial<Record<BlockType, PartComponent>>;

export interface DhSettings {
  ui: Ui;
  urlPolicy?: UrlPolicy;
  slots: Slots;
  components: Components;
  hostBlocks: Map<string, BlockDef<any, any>>;
  /** components for host inline references, by name */
  hostInlines: Map<string, React.ComponentType<{ text: string; data: any }>>;
  /** show "What an LLM reads here" under each part */
  llmPeek: boolean;
  /** added to every Markdown heading's level (at most 6) */
  demoteHeadings: number;
  /** the host's setting for interactive parts (DocumentProps.interactive); "off" when not set */
  interactive?: "off" | "static" | "on";
}
export const DhContext = createContext<DhSettings | null>(null);
export function useDh(): DhSettings {
  const c = useContext(DhContext);
  return c ?? { ui: UI.en, slots: DEFAULT_SLOTS, components: {}, hostBlocks: new Map(), hostInlines: new Map(), llmPeek: false, demoteHeadings: 0 };
}

/** The line count of a text, counted no further than max (a pane is only so many rows tall: no need to split every step). */
export function linesUpTo(text: string, max: number): number { let n = 1; for (let i = text.indexOf("\n"); i >= 0 && n < max; i = text.indexOf("\n", i + 1)) n++; return n; }
/** Code with no colours, in the shape Code Hike draws (used when highlight() did not run on the server). */
export function plainCode(text: string, lang = "text"): HighlightedCode {
  return { value: text, code: text, annotations: [], tokens: [text], lang, meta: "", themeName: "github-from-css", style: {} } as unknown as HighlightedCode;
}

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export const DEFAULT_SLOTS: Slots = {
  Frame: ({ block, children }) => <figure className={cx("part", `part-${block.type === "host" ? `host part-${(block as HostBlock).name}` : block.type}`)} id={"id" in block && block.id ? block.id : undefined} data-dh-part={block.type === "host" ? (block as HostBlock).name : block.type}>{children}</figure>,
  Callout: ({ kind, children }) => <aside className={`callout callout-${kind}`}><span className="callout-icon">{CALLOUT_ICON[kind] ?? CALLOUT_ICON.note}</span><div className="callout-body">{children}</div></aside>,
  Error: ({ block }) => <div className="dh-error" role="alert"><b>{block.part ? `${block.part}: ` : ""}not shown</b> <span>{block.message}</span>{block.line ? <span className="dh-error-line"> (line {block.line})</span> : null}</div>,
  Spinner: ({ label }) => <div className="dh-spinner" role="status"><span className="dh-spin" aria-hidden="true" /><span>{label}</span></div>,
};
export const CALLOUT_ICON: Record<string, React.ReactNode> = {
  note: <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="4" r="1.4" fill="currentColor" /><rect x="6.9" y="6.6" width="2.2" height="6.8" rx="1" fill="currentColor" /></svg>,
  tip: <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5a4.6 4.6 0 0 0-2.7 8.3c.5.4.8.9.8 1.5v.4h3.8v-.4c0-.6.3-1.1.8-1.5A4.6 4.6 0 0 0 8 1.5z" fill="currentColor" /><rect x="6.1" y="12.6" width="3.8" height="1.9" rx=".9" fill="currentColor" /></svg>,
  important: <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="6.8" y="2" width="2.4" height="8" rx="1.1" fill="currentColor" /><circle cx="8" cy="13" r="1.4" fill="currentColor" /></svg>,
  warn: <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8 15 14H1z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><rect x="7.1" y="6" width="1.8" height="4.4" rx=".8" fill="currentColor" /><circle cx="8" cy="12" r="1" fill="currentColor" /></svg>,
  security: <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7.5" rx="1.6" fill="currentColor" /><path d="M5.3 7V5.2a2.7 2.7 0 0 1 5.4 0V7" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>,
};
export { cx };
