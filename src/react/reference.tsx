// References (format version 11): `[[<type>:<name> "label"]]`. parse() asks the host's resolveReference; this file draws
// what it answered. No resolver: the label as a chip. Pending and failed have their own looks (tokens --ref-*, light and
// dark). Ready: the part, drawn by the same part dispatch as a part written inline (Blocks, in document.tsx, draws it).
// Also the two reference-only parts' plain views: an SVG drawn only through an <img>, and an interactive part's still
// (its fallback; it runs only with the InteractivePart of "durian-hypermedia/react/interactive", when the host turns it on).
import React from "react";
import { useDh } from "./context";
import { Md } from "./markdown";
import { svgDataUrl } from "../core/svg";
import type { InteractiveBlock, MdInline, ReferenceBlock, SvgBlock } from "../types";

type RefInline = Extract<MdInline, { t: "reference" }>;
type Look = "unresolved" | "pending" | "ready" | "failed" | "refused";

function words(ui: Record<string, any>) {
  return {
    pending: (ui.refPending as string | undefined) ?? "Loading",
    failed: (ui.refFailed as string | undefined) ?? "Not available",
    refused: (ui.refRefused as string | undefined) ?? "Not shown",
  };
}

/** The chip: the label (or the name), the type, and the state. */
export function ReferenceChip({ type, name, label, look, note }: { type: string; name: string; label: string | null; look: Look; note?: string }) {
  const { ui } = useDh();
  const w = words(ui as any);
  const said = look === "pending" ? w.pending : look === "failed" ? w.failed : look === "refused" ? w.refused : "";
  return (
    <span className="dh-xref" data-state={look} data-dh-ref-type={type} title={note ? `${type}: ${name} (${note})` : `${type}: ${name}`}>
      <span className="dh-xref-type">{type}</span>
      <span className="dh-xref-label">{label ?? name}</span>
      {said ? <span className="dh-xref-state">{said}{note ? <span className="dh-sr">: {note}</span> : null}</span> : null}
    </span>
  );
}

/** A reference inside a sentence. */
export function ReferenceInline({ x }: { x: RefInline }) {
  const look: Look = x.error ? "refused" : x.state ?? "unresolved";
  return <ReferenceChip type={x.type} name={x.name} label={x.label} look={look} note={x.error ?? x.reason} />;
}

/** A reference on a line of its own. */
export function ReferencePart({ block }: { block: ReferenceBlock }) {
  const { ui } = useDh();
  const { type, name, label } = block.ref;
  if (block.state === "unresolved") return <p className="dh-xref-line"><ReferenceChip type={type} name={name} label={label} look="unresolved" /></p>;
  const w = words(ui as any);
  const failed = block.state === "failed";
  return (
    <div className="dh-xref-card" data-state={block.state} data-dh-ref-type={type} role={failed ? "note" : "status"}>
      <span className="dh-xref-mark" aria-hidden="true" />
      <span className="dh-xref-body">
        <span className="dh-xref-head"><span className="dh-xref-type">{type}</span> <b className="dh-xref-label">{label ?? name}</b></span>
        <span className="dh-xref-note">{failed ? `${w.failed}${block.reason ? `: ${block.reason}` : ""}` : w.pending}</span>
      </span>
    </div>
  );
}

/** An SVG a reference stood for, drawn only through an <img>: no script in it runs, nothing it names is fetched. */
export function SvgPart({ block }: { block: SvgBlock }) {
  return (
    <div className="dh-svg">
      <img className="dh-svg-img" src={svgDataUrl(block.svg)} alt={block.alt} decoding="async" loading="lazy" referrerPolicy="no-referrer" />
      {block.title ? <div className="dh-svg-title">{block.title}</div> : null}
    </div>
  );
}

/** An interactive part's still: its fallback (or its label) and a chip that says it does not run here. */
export function InteractiveStill({ block, note }: { block: InteractiveBlock; note?: string }) {
  const { ui } = useDh();
  const off = note ?? ((ui as any).ixOff as string | undefined) ?? "Interactive part: off on this site";
  return (
    <div className="dh-ix" data-ix-state={note ? "stopped" : "off"}>
      {block.title ? <div className="dh-ix-title">{block.title}</div> : null}
      <div className="dh-ix-fallback">{block.fallback.length ? <Md blocks={block.fallback} /> : <p>{block.alt}</p>}</div>
      <span className="dh-ix-chip">{off}</span>
    </div>
  );
}
