// The typed tree parse() returns. Plain data (JSON-safe): parse on a server, send it, render it in a browser.
import type { ChartControl, ChartSeries } from "./core/chart";
import type { TierSpec } from "./core/tier";
import type { AlignSpec } from "./core/align";
import type { MdBlock, MdInline } from "./markdown";
import type { Val } from "./core/expr";

export type { MdBlock, MdInline, ChartControl, ChartSeries, TierSpec, AlignSpec, Val };

/** How the LLM view shows a part: as written, its data, its captions, unwrapped, an author's :::llm text, nothing,
 *  one line per tier, or a host block's own text. */
export type LlmKind = "as-is" | "data" | "steps" | "lines" | "unwrap" | "text" | "none" | "drop" | "replace" | "host";

interface PartBase {
  /** the author's #id, prefixed (see ParseOptions.idPrefix), or null */
  id: string | null;
  /** the line of the part in the source (1-based) */
  line: number;
  /** the info string's key=value attributes, as written */
  attrs: Record<string, string>;
  /** what an LLM reads in place of this part */
  llm: string | null;
  llmKind: LlmKind;
}
export interface MarkdownBlock { type: "markdown"; line: number; md: MdBlock[] }
export interface TocBlock { type: "toc"; line: number; depth: number; scope: "page" | "section"; items: { depth: number; text: string; id: string }[] }

export interface TermLine { k: "cmd" | "out"; text: string; prompt?: string; /** highlighted command tokens [text, colour] (highlight()) */ hl?: [string, string | null][] }
export interface TerminalBlock extends PartBase { type: "terminal"; title: string | null; prompt: string; steps: { title: string; lines: TermLine[] }[] }

export interface TreeRow { depth: number; name: string; folder: boolean; badges: string[]; closed: boolean; note: string; gap: boolean; path: string; line?: number }
export interface FileTreeBlock extends PartBase { type: "filetree"; trees: { title: string | null; rows: TreeRow[] }[] }

export interface EditorFile { path: string; repo: string; made: boolean; commit: string | null; lang: string; code: string | null; open: boolean; error: string | null; hl?: unknown }
export interface EditorStep { title: string; file: string; before: string; after: string; added: number[]; removed: number[]; error: string | null; beforeHl?: unknown; afterHl?: unknown }
export interface EditorBlock extends PartBase { type: "editor"; files: EditorFile[]; steps: EditorStep[] }

export interface CodeWalkStep {
  animated: boolean; key: string; repo: string; file: string; commit: string | null;
  lines: [number, number] | null; focus: [number, number] | null; marks: number[]; lang: string;
  code: string | null; error: string | null;
  /** the step's note as a safe inline tree */
  note: MdInline[];
  /** highlighted, dedented code (highlight()) and the indent taken off */
  hl?: unknown; dedent?: number;
}
export interface CodeWalkBlock extends PartBase { type: "codewalk"; steps: CodeWalkStep[]; walkFiles: Record<string, string | null>; /** packed whole files for still steps (highlight()) */ walkHl?: Record<string, unknown> }

export interface ChartBlock extends PartBase { type: "chart"; chart: any; controls: ChartControl[]; initial: { x: Val[]; series: ChartSeries[]; vars: Record<string, Val>; error?: string } }
export interface MermaidBlock extends PartBase { type: "mermaid"; steps: { title: string; src: string }[] }
export interface AnimationBlock extends PartBase { type: "animation"; anim: { head: string; steps: { title: string; raw: string; line: number }[]; base: number; info: Record<string, string> };
  /** what a reader sees as text in this animation, in story order: quoted labels, captions, say and note texts (animationTexts(block)) */
  texts: string[] }
export interface TierListBlock extends PartBase { type: "tierlist"; tier: TierSpec }
export interface AlignmentBlock extends PartBase { type: "alignment"; align: AlignSpec }

export interface TabsBlock extends PartBase { type: "tabs"; items: { title: string; id: string; body: Block[] }[] }
export interface AccordionBlock extends PartBase { type: "accordion"; items: { title: string; id: string; body: Block[] }[] }
export interface HumanBlock extends PartBase { type: "human"; body: Block[] }

/** A part that went over a cap, failed to parse, or is not allowed: shown as a clear message instead of the part. */
export interface ErrorBlock { type: "error"; line: number; part: string | null; message: string }
/** A host's own block (registered with defineBlock / registerBlock). */
export interface HostBlock<D = unknown> extends PartBase { type: "host"; name: string; body: string; data: D }

export type Block =
  | MarkdownBlock | TocBlock | TerminalBlock | FileTreeBlock | EditorBlock | CodeWalkBlock | ChartBlock | MermaidBlock
  | AnimationBlock | TierListBlock | AlignmentBlock | TabsBlock | AccordionBlock | HumanBlock | ErrorBlock | HostBlock;
export type BlockType = Block["type"];

export interface Problem { line: number; level: "error" | "warn"; message: string }
export interface Banner { kind: string; text: MdInline[] }

export interface Document {
  /** the version of this tree's shape (bumped on a breaking change to these types) */
  ast: 1;
  /** the format version the parser implements (SPEC.md) */
  format: number;
  /** the source text, as given */
  source: string;
  /** the page's file name, used by the checks (a .dh.md page must hold a part) */
  path: string;
  frontMatter: Record<string, unknown>;
  title: string | null;
  banner: Banner | null;
  blocks: Block[];
  /** every heading, for a table of contents */
  headings: { depth: number; text: string; id: string }[];
  /** what parse() refused or changed (caps, unsafe input, syntax errors); empty for a clean page */
  problems: Problem[];
  /** what an LLM reads (the LLM view, SPEC.md section 2); llmView(doc) returns it */
  llm: string;
  /** true once highlight() added colours to code */
  highlighted: boolean;
}
