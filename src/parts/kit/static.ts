// Static (format version 11, SPEC 4.1): one state of a part, drawn whole, with no player, no control row, no motion and
// no camera move. Asked by the part's fence, the page or the host (resolved at build time into the part's `static`
// prop, so the server's HTML is already static), or by the reader (printing, "reduce motion"), switched on in the
// browser. Every part that steps or moves uses the one hook below.
import React, { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import type { StaticProp } from "../types";
export type { StaticProp };

// ---- the reader's side: 0 = live, 1 = reduce motion, 2 = printing ----
let printing = false;
const listeners = new Set<() => void>();
const reduceQ = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
const printQ = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("print") : null;
function readerMode(): number { return printing || printQ?.matches ? 2 : reduceQ?.matches ? 1 : 0; }
// every part re-renders before the print snapshot is taken: flushSync, or the printed page would show the live state
function notify() { flushSync(() => { for (const l of listeners) l(); }); }
let wired = false;
function wire() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  window.addEventListener("beforeprint", () => { printing = true; notify(); });
  window.addEventListener("afterprint", () => { printing = false; notify(); });
  try { reduceQ?.addEventListener("change", notify); printQ?.addEventListener("change", notify); } catch { /* old Safari: no change events, the page keeps its first mode */ }
}
function subscribe(l: () => void) { wire(); listeners.add(l); return () => { listeners.delete(l); }; }
/** for tests and the print check: switch the reader's print mode by hand */
export function setPrinting(on: boolean) { printing = on; notify(); }

/** Which step a static part draws: the last one, a step number (from 1) or a step title; out of range = the last. */
export function staticIndex(prop: StaticProp, n: number, titles: readonly string[] = []): number {
  const last = Math.max(0, n - 1);
  if (!prop) return last;
  const v = prop.trim();
  if (/^\d+$/.test(v)) return Math.min(last, Math.max(0, +v - 1));
  const k = titles.findIndex((t) => t.trim().toLowerCase() === v.toLowerCase());
  return k >= 0 ? k : last;
}
/** The hook: is this part static now, and which step does it draw. n = the number of steps (0 or 1: no steps). */
export function useStatic(prop: StaticProp, n: number, titles: readonly string[] = []): { on: boolean; i: number; print: boolean } {
  const mode = useSyncExternalStore(subscribe, readerMode, () => 0);
  const on = prop === false ? mode === 2 : prop !== undefined || mode > 0;
  return { on, i: staticIndex(prop === false ? undefined : prop, n, titles), print: mode === 2 };
}

/** Under a static part with steps: the chosen step's caption, and every caption in a closed list (open in print). */
export function StaticSteps({ titles, i, label, print }: { titles: readonly string[]; i: number; label?: string; print?: boolean }) {
  if (titles.length < 2) return null;
  return React.createElement("div", { className: "dh-static-steps", "data-dh-slot": "static-steps" },
    React.createElement("p", { className: "dh-static-cap" }, React.createElement("span", { className: "cw-num" }, String(i + 1)), " ", titles[i]),
    React.createElement("details", { open: print || undefined },
      React.createElement("summary", null, `${label ?? "All steps"} (${titles.length})`),
      React.createElement("ol", null, titles.map((t, k) => React.createElement("li", { key: k, "aria-current": k === i ? "step" : undefined }, t)))));
}
