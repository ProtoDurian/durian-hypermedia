// The mermaid part (```mermaid). Optional: mermaid is a peer dependency the host may leave out; without it the
// diagram's source stays on the page as text. Drawn in the browser with securityLevel "strict" and no HTML labels
// (so no <foreignObject>), then the SVG is cleaned with DOMPurify (no script, no foreignObject, no event handlers)
// and attached as nodes, never through innerHTML. The diagram is redrawn when the theme changes.
import React, { useEffect, useRef, useState } from "react";
import { Diagram } from "../ui/parts";
import { useDh } from "./context";
import type { MermaidBlock } from "../types";

let n = 0;
const tok = (el: Element, v: string) => getComputedStyle(el).getPropertyValue(v).trim();
export async function drawMermaid(root: HTMLElement): Promise<number> {
  const boxes = [...root.querySelectorAll<HTMLElement>("[data-mermaid]")];
  if (!boxes.length) return 0;
  let mermaid: any, DOMPurify: any;
  try { mermaid = (await import("mermaid")).default; DOMPurify = (await import("dompurify")).default; }
  catch { root.classList.add("dh-mermaid-missing"); return 0; }
  const doc = root.closest(".dh-doc") ?? root;
  const theme = doc.getAttribute("data-theme") ?? document.documentElement.dataset.theme;
  const dark = theme ? theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  mermaid.initialize({
    startOnLoad: false, securityLevel: "strict", htmlLabels: false, flowchart: { htmlLabels: false }, class: { htmlLabels: false } as any,
    suppressErrorRendering: true, maxTextSize: 20000, theme: "base", fontFamily: tok(root, "--font-sans") || "sans-serif",
    themeVariables: { darkMode: dark, background: "transparent", primaryColor: tok(root, "--acc-soft"), primaryTextColor: tok(root, "--ink"), primaryBorderColor: tok(root, "--acc"), lineColor: tok(root, "--muted"), textColor: tok(root, "--ink"), edgeLabelBackground: tok(root, "--surface"), fontSize: "14px" },
  });
  let drawn = 0;
  for (const box of boxes) {
    const src = box.querySelector("code")?.textContent ?? "";
    box.querySelector(".mermaid-svg")?.remove();
    try {
      const { svg } = await mermaid.render(`dh-mmd-${n++}`, src);
      const clean = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true }, FORBID_TAGS: ["foreignObject", "script"], RETURN_DOM_FRAGMENT: true });
      const d = document.createElement("div"); d.className = "mermaid-svg"; d.appendChild(clean);
      box.appendChild(d); box.classList.add("is-drawn"); box.classList.remove("is-failed"); drawn++;
    } catch (e) { box.classList.add("is-failed"); }
  }
  return drawn;
}

export function MermaidPart({ block }: { block: MermaidBlock }) {
  const { ui, slots } = useDh();
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let dead = false;
    const draw = () => { if (ref.current) drawMermaid(ref.current).finally(() => { if (!dead) setBusy(false); }); };
    draw();
    const mo = new MutationObserver(draw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const doc = ref.current?.closest(".dh-doc");
    if (doc) mo.observe(doc, { attributes: true, attributeFilter: ["data-theme"] });
    return () => { dead = true; mo.disconnect(); };
  }, [block]);
  return <div ref={ref} className="dh-mermaid">{busy && <slots.Spinner label={(ui as any).drawing ?? "Drawing the diagram…"} />}<Diagram steps={block.steps} ui={ui} /></div>;
}
export default MermaidPart;
