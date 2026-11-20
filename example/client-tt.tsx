// Trusted Types pages (tt-*.html): every fixture rendered in the browser only (createRoot, so every element is made
// on the page, not hydrated) by the strict entry, under require-trusted-types-for 'script'. Mermaid diagrams go to
// the host's Mermaid slot; here it is a stand-in that names the step (a real host draws in its own sandboxed frame).
import React from "react";
import { createRoot } from "react-dom/client";
import { DhDocument, type MermaidSlotProps } from "../src/react/strict";
import type { Document } from "../src/types";
import { taskBlock, hostInlines } from "./host-block";

function HostDiagram({ src, step }: MermaidSlotProps) {
  return <span className="ex-host-diagram" data-host-diagram={step}>diagram step {step + 1}, drawn by the host ({src.split("\n").length} lines)</span>;
}
const raw = document.getElementById("dh-doc")?.textContent;
const el = document.getElementById("dh-root");
if (raw && el) {
  const doc = JSON.parse(raw) as Document;
  createRoot(el).render(<DhDocument doc={doc} blocks={[taskBlock]} inlines={hostInlines} slots={{ Mermaid: HostDiagram }} llmPeek />);
}
