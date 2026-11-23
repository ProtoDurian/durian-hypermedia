// Browser helpers: draw a Document into an element, or hydrate the HTML the server rendered with renderToString.
//   server:  const html = renderToString(<DhDocument doc={doc} />);   // send html, and doc as JSON
//   browser: hydrateDocument(el, doc);
// hydrateDocument() also (format version 10): puts class `js` on <html> (the phone's first-paint rule in the styles needs
// it: until an animation has measured its stage, a phone shows the stage empty rather than the server's wide drawing),
// and hydrates the parts in the order the reader needs them (react/turn.tsx): on screen first, one per task, the one
// scrolled to next, then page order; a part the reader touches at once.
import React from "react";
import { hydrateRoot, createRoot, type Root } from "react-dom/client";
import type { Document } from "../types";
import type { DocumentProps } from "./document";
import { DhDocument } from "./index";
import { HydrationOrder, TurnContext } from "./turn";
import { flushSync } from "react-dom";
import { setPrinting } from "../parts/kit/static";

export { HydrationOrder, TurnContext };

const markJs = () => { try { document.documentElement.classList.add("js"); } catch { /* no document */ } };

export function hydrateDocument(el: Element, doc: Document, props: Omit<DocumentProps, "doc"> = {}): Root {
  markJs();
  const order = new HydrationOrder();
  const root = hydrateRoot(el, <TurnContext.Provider value={order}><DhDocument doc={doc} {...props} /></TurnContext.Provider>, { onRecoverableError: () => {} });
  order.watch(el);
  const offPrint = printUnseen(order);
  const unmount = root.unmount.bind(root);
  root.unmount = () => { offPrint(); order.stop(); unmount(); };
  return root;
}
/**
 * Print (SPEC 4.1): every part prints whole and static, even one the reader never scrolled to. A part still waiting for
 * its turn shows the server's HTML (its first state, with controls); a hydration would finish after the page is printed.
 * So before the page prints, each part not drawn yet is drawn at once, static, into its own root just before its marker
 * (flushed now), and its server HTML is hidden; after printing both go back. hydrateDocument() calls this.
 */
export function printUnseen(order: HydrationOrder): () => void {
  if (typeof window === "undefined") return () => {};
  let copies: { root: Root; box: HTMLElement; hid: [HTMLElement, string][] }[] = [];
  const before = () => {
    setPrinting(true); // the static hook reads print from here, so the copies draw their static state
    for (const w of order.waiting()) {
      // the server's HTML of the part: the nodes of its Suspense boundary, right after its marker
      const hid: [HTMLElement, string][] = [];
      let depth = 0;
      for (let n = w.mark.nextSibling; n; n = n.nextSibling) {
        if (n.nodeType === 8) { const d = (n as Comment).data; if (d.startsWith("$")) depth++; else if (d === "/$" && --depth <= 0) break; continue; }
        if (depth > 0 && n instanceof HTMLElement) hid.push([n, n.style.display]);
        if (depth <= 0) break;
      }
      const box = document.createElement("div");
      box.className = "dh-print-copy";
      try {
        w.mark.parentNode?.insertBefore(box, w.mark);
        const root = createRoot(box, { identifierPrefix: `dh-print-${copies.length}-` });
        flushSync(() => root.render(w.view()));
        for (const [n] of hid) n.style.display = "none";
        copies.push({ root, box, hid });
      } catch { box.remove(); }
    }
  };
  const after = () => {
    for (const c of copies) { try { c.root.unmount(); } catch { /* already gone */ } c.box.remove(); for (const [n, d] of c.hid) n.style.display = d; }
    copies = [];
  };
  window.addEventListener("beforeprint", before);
  window.addEventListener("afterprint", after);
  return () => { after(); window.removeEventListener("beforeprint", before); window.removeEventListener("afterprint", after); };
}
export function renderDocument(el: Element, doc: Document, props: Omit<DocumentProps, "doc"> = {}): Root {
  markJs();
  const root = createRoot(el);
  root.render(<DhDocument doc={doc} {...props} />);
  return root;
}
/** Read a Document a server put in <script type="application/json" id="...">, safely (JSON, never executed). */
export function readDocument(id: string): Document | null {
  const raw = document.getElementById(id)?.textContent;
  if (!raw) return null;
  try { return JSON.parse(raw) as Document; } catch { return null; }
}
/** JSON for a <script type="application/json"> tag: "<" is escaped so the text cannot close the tag. */
export function documentJson(doc: Document): string {
  return JSON.stringify(doc).replace(/</g, "\\u003c").replace(/\u{2028}/gu, "\\u2028").replace(/\u{2029}/gu, "\\u2029");
}
