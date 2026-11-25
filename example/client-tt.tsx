// Trusted Types pages (tt-*.html): every fixture rendered in the browser only (createRoot, so every element is made
// on the page, not hydrated) by the strict entry, under require-trusted-types-for 'script'.
import { holdFonts } from "./font-hold";
holdFonts();
import React from "react";
import { createRoot } from "react-dom/client";
import { DhDocument } from "../src/react/strict";
import type { Document } from "../src/types";
import { taskBlock, hostInlines } from "./host-block";

const raw = document.getElementById("dh-doc")?.textContent;
const el = document.getElementById("dh-root");
if (raw && el) {
  const doc = JSON.parse(raw) as Document;
  createRoot(el).render(<DhDocument doc={doc} blocks={[taskBlock]} inlines={hostInlines} llmPeek />);
}
