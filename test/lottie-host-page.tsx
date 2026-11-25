// The page test/lottie-host.test.ts opens in a real browser: one Lottie part (the file named in ?f=), drawn by the strict
// entry. Before anything draws it notes the head and the body's own children, and from then on records the elements
// added to the document, inside and outside the part's container (.lt).
import React from "react";
import { createRoot } from "react-dom/client";
import { DhDocument } from "../src/react/strict";
import { parse, UNTRUSTED_LIMITS } from "../src/index";

const WATCHED = new Set(["LINK", "STYLE", "SCRIPT", "IMG"]);
const state = {
  head: document.head.innerHTML,
  bodyKids: [...document.body.children].length,
  outside: [] as string[],
  inPart: [] as string[],
  toHead: 0,
  toBody: 0,
};
(window as any).__lt = state;
new MutationObserver((records) => {
  for (const r of records) {
    const target = r.target as Element;
    const inside = !!(target.closest && target.closest(".lt"));
    for (const n of r.addedNodes) {
      if (!(n instanceof Element)) continue;
      if (target === document.head) state.toHead++;
      if (target === document.body) state.toBody++;
      for (const e of [n, ...n.querySelectorAll("*")]) if (inside ? e.tagName.toUpperCase() !== "IMG" && WATCHED.has(e.tagName.toUpperCase()) : WATCHED.has(e.tagName.toUpperCase())) (inside ? state.inPart : state.outside).push(e.tagName + " " + (e.getAttribute("href") ?? e.getAttribute("src") ?? (e.textContent ?? "").slice(0, 60)));
    }
  }
}).observe(document.documentElement, { childList: true, subtree: true });

const f = new URLSearchParams(location.search).get("f") ?? "good.json";
const doc = parse("# Lottie\n\n```lottie src=\"" + f + "\" loop\nalt: The animation under test.\n```\n", { path: "page.dh.md", limits: UNTRUSTED_LIMITS });
createRoot(document.getElementById("root")!).render(<DhDocument doc={doc} />);
