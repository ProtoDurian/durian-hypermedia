// The example site's page script: hydrate the document, then wire the style and theme buttons (no inline script).
import React from "react";
import { hydrateRoot, createRoot, type Root } from "react-dom/client";
import { DhDocument } from "../src/react/index";
import { readDocument } from "../src/react/hydrate";
import { taskBlock, hostInlines } from "./host-block";

const doc = readDocument("dh-doc");
const el = document.getElementById("dh-root");
const q = new URLSearchParams(location.search);
let variant = q.get("variant") ?? "";
let root: Root | null = null;
const props = () => ({ doc: doc!, blocks: [taskBlock], inlines: hostInlines, variant: variant || undefined, motion: (variant === "bold" ? "off" : "on") as "on" | "off" });
if (doc && el && el.dataset.mode === "csr") { root = createRoot(el); root.render(<DhDocument {...props()} />); }
else if (doc && el) root = hydrateRoot(el, <DhDocument {...props()} variant={undefined} motion="on" />, { onRecoverableError: (e) => console.warn("hydrate", e) });
const apply = () => {
  document.querySelectorAll<HTMLButtonElement>("[data-variant]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.variant === variant)));
  if (root && doc) root.render(<DhDocument {...props()} />);
};
if (variant) setTimeout(apply, 0); else apply();
document.querySelectorAll<HTMLButtonElement>("[data-variant]").forEach((b) => b.addEventListener("click", () => {
  variant = b.dataset.variant ?? "";
  const u = new URL(location.href); if (variant) u.searchParams.set("variant", variant); else u.searchParams.delete("variant"); history.replaceState(null, "", u);
  apply();
}));
document.querySelectorAll("a[href$='.html']").forEach((a) => a.addEventListener("click", () => { if (variant) (a as HTMLAnchorElement).search = `?variant=${variant}`; }));
document.querySelector("[data-theme-toggle]")?.addEventListener("click", () => {
  const cur = document.documentElement.dataset.theme ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.dataset.theme = cur === "dark" ? "light" : "dark";
});
