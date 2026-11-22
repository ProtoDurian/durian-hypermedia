// durian-hypermedia/react/interactive: runs an interactive part a reference resolved to (format version 11), in a frame
// of its own, only when the host turns it on:
//   import { InteractivePart } from "durian-hypermedia/react/interactive";
//   <DhDocument doc={doc} interactive="on" components={{ interactive: InteractivePart }} />
// - the frame: <iframe sandbox="allow-scripts"> (no allow-same-origin: an empty origin of its own, so no cookies, no
//   storage and no reach into the page; no forms, pop-ups or top navigation), its page under the policy
//   default-src 'none' (nothing is fetched). interactive="static" draws the HTML and CSS with no script (sandbox="").
// - the page accepts one message from it: its height, a number, from that frame. With interactive="on" the frame must
//   say it within 5 s, and it never runs past 10 minutes; a frame that loads a second page (it navigated) is stopped.
//   A stopped frame is removed and the still (the fallback, or the label) is shown again.
// - Trusted Types: this module is the only one with a policy, named "dh-interactive", made the first time a frame
//   starts. A page that requires Trusted Types and does not list the name keeps the still. The other entries never load
//   this module (test/trusted-types.test.ts).
// A host page's own CSP also holds in the frame (a srcdoc frame keeps its page's policy): a page whose CSP has no
// 'unsafe-inline' for scripts cannot run the frame's script either, and the part stops at its 5 s check.
import React, { useEffect, useRef, useState } from "react";
import { useDh } from "./context";
import { InteractiveStill } from "./reference";
import { Md } from "./markdown";
import { frameDoc, IX_LIMITS, IX_TOKENS } from "../core/interactive";
import type { InteractiveBlock } from "../types";

type Policy = { createHTML(s: string): unknown };
let made: Policy | null | "denied" | undefined;
function policy(): Policy | null | "denied" {
  if (made !== undefined) return made;
  const tt = (globalThis as any).trustedTypes;
  if (!tt) return (made = null);                 // no Trusted Types here: a plain string is fine
  try { made = tt.createPolicy("dh-interactive", { createHTML: (s: string) => s }) as Policy; }
  catch { made = "denied"; }                      // the page's list does not include dh-interactive
  return made;
}
const tokensOf = (el: Element) => {
  const cs = getComputedStyle(el), out: Record<string, string> = {};
  for (const t of IX_TOKENS) { const v = cs.getPropertyValue(t).trim(); if (v) out[t] = v; }
  return out;
};
const darkAt = (el: Element) => {
  const t = el.closest("[data-theme]")?.getAttribute("data-theme");
  return t ? t === "dark" : typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
};

type State = "off" | "starting" | "running" | "static" | "stopped";

export function InteractivePart({ block }: { block: InteractiveBlock }) {
  const { interactive, ui } = useDh();
  const mode = interactive === "on" || interactive === "static" ? interactive : "off";
  const slot = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<State>("off");
  const [why, setWhy] = useState<string>("");
  const w = ui as any;

  useEffect(() => {
    const host = slot.current;
    if (mode === "off" || !host) return;
    const pol = policy();
    if (pol === "denied") { setState("stopped"); setWhy(w.ixDenied ?? "Interactive part: this page does not allow it"); return; }
    const f = document.createElement("iframe");
    f.setAttribute("sandbox", mode === "on" ? "allow-scripts" : "");   // never allow-same-origin, forms, pop-ups, top navigation
    f.setAttribute("referrerpolicy", "no-referrer");
    f.setAttribute("allow", "");
    f.title = block.title || block.alt || "Interactive part";
    f.className = "dh-ix-frame";
    f.style.height = `${block.height}px`;
    const page = frameDoc(block, mode === "static");
    (f as any).srcdoc = pol ? pol.createHTML(page) : page;
    let loads = 0, live = true, running = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const send = () => { try { f.contentWindow?.postMessage({ dhTokens: tokensOf(host), dark: darkAt(host) }, "*"); } catch { /* gone */ } };
    const stop = (msg: string) => { if (!live) return; live = false; f.remove(); setState("stopped"); setWhy(msg); };
    const onLoad = () => { loads++; if (loads > 1) stop(w.ixMoved ?? "Interactive part stopped: it tried to leave its frame"); else send(); };
    const onMessage = (e: MessageEvent) => {
      if (e.source !== f.contentWindow) return;
      const d = e.data;
      if (!d || typeof d !== "object" || typeof d.dhHeight !== "number" || !Number.isFinite(d.dhHeight)) return;
      f.style.height = `${Math.max(IX_LIMITS.minHeight, Math.min(IX_LIMITS.maxHeight, Math.ceil(d.dhHeight)))}px`;
      setState((s) => (s === "starting" ? "running" : s));
      running = true;
    };
    f.addEventListener("load", onLoad);
    window.addEventListener("message", onMessage);
    const watch = new MutationObserver(send);
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const doc = host.closest(".dh-doc");
    if (doc) watch.observe(doc, { attributes: true, attributeFilter: ["data-theme"] });
    host.replaceChildren(f);
    setState(mode === "on" ? "starting" : "static");
    if (mode === "on") {
      timers.push(setTimeout(() => { if (!running) stop(w.ixSilent ?? "Interactive part did not answer"); }, IX_LIMITS.silentMs));
      timers.push(setTimeout(() => stop(w.ixLife ?? "Interactive part stopped after 10 minutes"), IX_LIMITS.lifeMs));
    }
    return () => { live = false; for (const t of timers) clearTimeout(t); watch.disconnect(); window.removeEventListener("message", onMessage); f.removeEventListener("load", onLoad); f.remove(); };
  }, [mode, block.html, block.css, block.script, block.height]);

  if (mode === "off") return <InteractiveStill block={block} />;
  // stopped: the still, with why (the frame is gone already)
  if (state === "stopped") return <InteractiveStill block={block} note={why || undefined} />;
  // before the frame starts (and on the server) the fallback shows where the frame will be
  return (
    <div className="dh-ix" data-ix-state={state === "off" ? "starting" : state}>
      {block.title ? <div className="dh-ix-title">{block.title}</div> : null}
      <div className="dh-ix-slot" ref={slot} />
      {state === "off" ? <div className="dh-ix-fallback">{block.fallback.length ? <Md blocks={block.fallback} /> : <p>{block.alt}</p>}</div> : null}
    </div>
  );
}
export default InteractivePart;
