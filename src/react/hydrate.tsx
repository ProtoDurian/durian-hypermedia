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

export { HydrationOrder, TurnContext };

const markJs = () => { try { document.documentElement.classList.add("js"); } catch { /* no document */ } };

export function hydrateDocument(el: Element, doc: Document, props: Omit<DocumentProps, "doc"> = {}): Root {
  markJs();
  const order = new HydrationOrder();
  const root = hydrateRoot(el, <TurnContext.Provider value={order}><DhDocument doc={doc} {...props} /></TurnContext.Provider>, { onRecoverableError: () => {} });
  order.watch(el);
  const unmount = root.unmount.bind(root);
  root.unmount = () => { order.stop(); unmount(); };
  return root;
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
