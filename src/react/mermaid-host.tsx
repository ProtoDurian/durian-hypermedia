// The mermaid part with no mermaid library: each step is drawn by the host's Mermaid slot (it gets the source), or,
// without one, its source stays on the page as text. This file imports neither mermaid nor DOMPurify and sets no HTML
// string anywhere, so a host that renders diagrams its own way (a sandboxed frame, an image) can prove both are absent.
//   import { HostMermaidPart } from "durian-hypermedia/react/mermaid-host";
//   <DocumentView doc={doc} components={{ mermaid: HostMermaidPart }} slots={{ Mermaid: MyDiagram }} />
import React from "react";
import { Diagram } from "../ui/parts";
import { useDh } from "./context";
import type { MermaidBlock } from "../types";

export function HostMermaidPart({ block }: { block: MermaidBlock }) {
  const { ui, slots } = useDh();
  return <div className="dh-mermaid" data-dh-mermaid="host"><Diagram steps={block.steps} ui={ui} Draw={slots.Mermaid} /></div>;
}
export default HostMermaidPart;
