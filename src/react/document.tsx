// DocumentView: draws a Document with the part components it is given (tree-shakeable: import only the parts you use).
//   import { DocumentView } from "durian-hypermedia/react/document";
//   import { ChartPart } from "durian-hypermedia/react/chart";
//   <DocumentView doc={doc} components={{ chart: ChartPart }} />
// A part with no component is shown as what an LLM reads (plain text), so nothing is lost.
// "durian-hypermedia/react" exports DhDocument, the same with every part.
import React, { useMemo } from "react";
import { UI, type Ui } from "../ui/ui";
import { registeredBlocks, type BlockDef } from "../blocks";
import type { UrlPolicy } from "../safety";
import type { InlineDef } from "../markdown";
import type { Block, Document, HostBlock } from "../types";
import { DhContext, DEFAULT_SLOTS, useDh, type Components, type DhSettings, type Slots, cx } from "./context";
import { Md } from "./markdown";
import { Turn } from "./turn";
import { ReferencePart } from "./reference";

export interface DocumentProps {
  doc: Document;
  /** a component per part type; parts without one show their LLM text */
  components?: Components;
  /** host blocks (their Component draws them); added to the ones registered with registerBlock */
  blocks?: BlockDef<any, React.ComponentType<{ block: HostBlock; data: any }>>[];
  /** host inline references (their Component draws them; without one the text shows as a span.dh-ref) */
  inlines?: InlineDef<any, React.ComponentType<{ text: string; data: any }>>[];
  /** the renderer's own words (buttons, hints); default English */
  ui?: Partial<Ui>;
  /** a style name for the host's CSS: sets data-dh-variant on the root ("flat" and "bold" ship in styles.css) */
  variant?: string;
  /** "light" or "dark" for this document only (default: the page's data-theme, else the system setting) */
  theme?: "light" | "dark";
  /** "off" stills every animation, morph, typing and chart transition (also set by prefers-reduced-motion) */
  motion?: "on" | "off";
  /** swap the chrome (the part frame, callouts, error blocks, the spinner) and draw Markdown elements
   *  yourself (Code, InlineCode, Link, Table, Heading) or mermaid diagrams (Mermaid) */
  slots?: Partial<Slots>;
  /** add this to every Markdown heading's level, so a page's "#" sits below the host's own headings (default 0) */
  demoteHeadings?: number;
  /** links and images are checked again with this policy at render time (default: the parser's default policy) */
  urlPolicy?: UrlPolicy;
  /** show "What an LLM reads here" under each part */
  llmPeek?: boolean;
  /** an interactive part a reference resolved to: "off" (the default) shows its still; "static" draws its HTML and CSS
   *  in a sandboxed frame with no script; "on" runs it there. Needs InteractivePart from durian-hypermedia/react/interactive */
  interactive?: "off" | "static" | "on";
  className?: string;
}

function Fallback({ block }: { block: Block }) {
  const text = "llm" in block && block.llm ? block.llm : block.type === "host" ? (block as HostBlock).body : "";
  return <pre className="dh-fallback" data-dh-missing={block.type}><code>{text}</code></pre>;
}
function HostPart({ block }: { block: HostBlock }) {
  const { hostBlocks } = useDh();
  const C = hostBlocks.get(block.name)?.Component as React.ComponentType<{ block: HostBlock; data: any }> | undefined;
  return C ? <C block={block} data={block.data} /> : <Fallback block={block} />;
}
function Peek({ block }: { block: Block }) {
  const { ui, llmPeek } = useDh();
  if (!llmPeek || !("llm" in block) || !block.llm || block.type === "human") return null;
  return <details className="llm-peek"><summary>{ui.llmHere}</summary><pre className="pane-llm">{block.llm}</pre></details>;
}
/** Draws a list of blocks with the components from context (containers use it for their content). */
export function Blocks({ blocks }: { blocks: Block[] }): React.ReactElement {
  const { components, slots } = useDh();
  return <>{blocks.map((b, i) => {
    if (b.type === "markdown") return <Md key={i} blocks={b.md} />;
    if (b.type === "error") return <slots.Error key={i} block={b} />;
    // a reference (format version 11): when ready, its part through this same dispatch; else its chip or card
    if (b.type === "reference") return b.state === "ready" && b.blocks?.length ? <div key={i} className="dh-xref-part" data-dh-ref-type={b.ref.type} data-dh-ref-name={b.ref.name}><Blocks blocks={b.blocks} /></div> : <ReferencePart key={i} block={b} />;
    if (b.type === "toc") return b.items.length ? <nav key={i} className={`toc-block toc-${b.scope}`} aria-label="Contents"><ol>{b.items.map((h, k) => <li key={k} className={`toc-${h.depth}`}><a href={`#${h.id}`}>{h.text}</a></li>)}</ol></nav> : null;
    if (b.type === "human") { const C = components.human; return C ? <C key={i} block={b} /> : <Fallback key={i} block={b} />; }
    const C = (b.type === "host" ? HostPart : components[b.type]) as React.ComponentType<{ block: Block }> | undefined;
    const part = C ? <C block={b} /> : <Fallback block={b} />;
    return <slots.Frame key={i} block={b}>{C && b.type !== "host" && b.type !== "tabs" && b.type !== "accordion" ? <Turn>{part}</Turn> : part}<Peek block={b} /></slots.Frame>;
  })}</>;
}

export function DocumentView(p: DocumentProps): React.ReactElement {
  const settings = useMemo<DhSettings>(() => ({
    ui: { ...UI.en, ...(p.ui ?? {}) } as Ui,
    urlPolicy: p.urlPolicy,
    slots: { ...DEFAULT_SLOTS, ...(p.slots ?? {}) },
    components: p.components ?? {},
    hostBlocks: registeredBlocks(p.blocks ?? []),
    hostInlines: new Map((p.inlines ?? []).filter((d) => d.Component).map((d) => [d.name, d.Component!])),
    llmPeek: !!p.llmPeek,
    demoteHeadings: Math.max(0, Math.min(5, Math.floor(p.demoteHeadings ?? 0) || 0)),
    interactive: p.interactive === "on" || p.interactive === "static" ? p.interactive : "off",
  }), [p.ui, p.urlPolicy, p.slots, p.components, p.blocks, p.inlines, p.llmPeek, p.demoteHeadings, p.interactive]);
  const { doc } = p;
  return (
    <DhContext.Provider value={settings}>
      <div className={cx("dh-doc", p.className)} data-dh-variant={p.variant} data-theme={p.theme} data-dh-motion={p.motion === "off" ? "off" : undefined}>
        <Blocks blocks={doc.blocks} />
      </div>
    </DhContext.Provider>
  );
}
export default DocumentView;
