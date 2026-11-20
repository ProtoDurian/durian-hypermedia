// Browser helpers: draw a Document into an element, or hydrate the HTML the server rendered with renderToString.
//   server:  const html = renderToString(<DhDocument doc={doc} />);   // send html, and doc as JSON
//   browser: hydrateDocument(el, doc);
import React from "react";
import { hydrateRoot, createRoot, type Root } from "react-dom/client";
import type { Document } from "../types";
import type { DocumentProps } from "./document";
import { DhDocument } from "./index";

export function hydrateDocument(el: Element, doc: Document, props: Omit<DocumentProps, "doc"> = {}): Root {
  return hydrateRoot(el, <DhDocument doc={doc} {...props} />, { onRecoverableError: () => {} });
}
export function renderDocument(el: Element, doc: Document, props: Omit<DocumentProps, "doc"> = {}): Root {
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
