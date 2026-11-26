// durian-markdown/react/interactive: runs an interactive part a reference resolved to (format version 11), in a frame
// of its own, only when the host turns it on:
//   import { InteractivePart } from "durian-markdown/react/interactive";
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
// A sandbox cannot forbid a frame to navigate itself: the host page sets frame-src 'none' so that no navigation of the
// frame makes a request (scripts/interactive-check.ts measures it); without it one request leaves before the stop.
// A host page's own CSP also holds in the frame (a srcdoc frame keeps its page's policy): a page whose CSP has no
// 'unsafe-inline' for scripts cannot run the frame's script either, and the part stops at its 5 s check.
// frameSrc instead loads a fixed same-origin host page with its own CSP (interactiveFrame(), ADOPT.md). That path
// never sets srcdoc or creates a Trusted Types policy; after ready it sends the checked sections by postMessage.
import React, { useEffect, useRef, useState } from "react";
import { useDh } from "./context";
import { InteractiveStill } from "./reference";
import { Md } from "./markdown";
import { frameDoc, IX_LIMITS, IX_TOKENS } from "../core/interactive";
import type { InteractiveProps } from "./reference";
export { interactiveFrame, IX_FRAME_CSP, IX_LIMITS, IX_TOKENS } from "../core/interactive";
export type { InteractiveProps } from "./reference";

/** Host-only option: a same-origin HTTP(S) page made by interactiveFrame(), served with its CSP header. */
export interface InteractivePartProps extends InteractiveProps { frameSrc?: string }

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

export function InteractivePart({ block, frameSrc }: InteractivePartProps) {
  const { interactive, ui } = useDh();
  const mode = interactive === "on" || interactive === "static" ? interactive : "off";
  const slot = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<State>("off");
  const [why, setWhy] = useState<string>("");
  const w = ui as any;

  useEffect(() => {
    const host = slot.current;
    if (mode === "off" || !host) return;
    // An external page has its own CSP. Never create the srcdoc Trusted Types policy on this path.
    const external = frameSrc !== undefined;
    let src = "";
    if (external) {
      try {
        const u = new URL(frameSrc, window.location.href);
        if (!frameSrc || !/^https?:$/.test(u.protocol) || u.origin !== window.location.origin || u.username || u.password) throw new Error("frame source");
        src = u.href;
      } catch { setState("stopped"); setWhy("Interactive part: frameSrc must be a same-origin HTTP(S) URL"); return; }
    }
    const pol = external ? null : policy();
    if (pol === "denied") { setState("stopped"); setWhy(w.ixDenied ?? "Interactive part: this page does not allow it"); return; }
    const f = document.createElement("iframe");
    f.setAttribute("sandbox", external || mode === "on" ? "allow-scripts" : "");   // static external: only the shell's bootstrap runs
    f.setAttribute("referrerpolicy", "no-referrer");
    f.setAttribute("allow", "");
    f.title = block.title || block.alt || "Interactive part";
    f.className = "dh-ix-frame";
    f.style.height = `${block.height}px`;
    if (external) f.src = src;
    else {
      const page = frameDoc(block, mode === "static");
      (f as any).srcdoc = pol ? pol.createHTML(page) : page;
    }
    let loads = 0, live = true, running = false, initialized = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const send = () => { if (!live || (external && !initialized)) return; try { f.contentWindow?.postMessage({ dhTokens: tokensOf(host), dark: darkAt(host) }, "*"); } catch { /* gone */ } };
    const stop = (msg: string) => { if (!live) return; live = false; f.remove(); setState("stopped"); setWhy(msg); };
    const onLoad = () => { loads++; if (loads > 1) stop(w.ixMoved ?? "Interactive part stopped: it tried to leave its frame"); else send(); };
    const onMessage = (e: MessageEvent) => {
      if (!live || e.source !== f.contentWindow) return;
      const d = e.data;
      if (external && d && typeof d === "object" && Object.keys(d).length === 1 && d.dhReady === true) {
        if (!initialized) {
          initialized = true;
          // An allow-scripts sandbox without allow-same-origin has an opaque origin, hence targetOrigin "*".
          f.contentWindow?.postMessage({ dhInit: true, html: block.html, css: block.css, script: mode === "on" ? block.script : "", mode, dhTokens: tokensOf(host), dark: darkAt(host) }, "*");
        }
        return;
      }
      if (external && (!initialized || !d || typeof d !== "object" || Object.keys(d).length !== 1)) return;
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
    if (mode === "on" || external) {
      timers.push(setTimeout(() => { if (!running) stop(w.ixSilent ?? "Interactive part did not answer"); }, IX_LIMITS.silentMs));
      timers.push(setTimeout(() => stop(w.ixLife ?? "Interactive part stopped after 10 minutes"), IX_LIMITS.lifeMs));
    }
    return () => { live = false; for (const t of timers) clearTimeout(t); watch.disconnect(); window.removeEventListener("message", onMessage); f.removeEventListener("load", onLoad); f.remove(); };
  }, [mode, block.html, block.css, block.script, block.height, frameSrc]);

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
