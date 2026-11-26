// Shared pieces of the media parts (format version 11): icons, strings, the drag-to-seek hook, a small menu. They live in
// the first of the six folders; the other five import them from here. No HTML strings anywhere: every node is made by
// React (strict Trusted Types).
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyUrlPolicy } from "../../safety";
import { claimedBy, claimedRefusal, cleanPrefixes } from "../../media-loader";
import { useDh } from "../../react/context";

export const STR = {
  play: "Play", pause: "Pause", back: "Back", forward: "Forward", seconds: "seconds", mute: "Mute", unmute: "Unmute", volume: "Volume", speed: "Speed", captions: "Captions", captionsOff: "Off", pip: "Picture in picture",
  fullscreen: "Full screen", exitFullscreen: "Exit full screen", download: "Download", transcript: "Transcript", search: "Search the transcript", noMatch: "No line has that word", chapters: "Chapters", markers: "Markers",
  seek: "Seek", of: "of", loadFail: "This file could not be loaded", ready: "Ready: press play", loading: "Loading", close: "Close", next: "Next", prev: "Previous", zoomIn: "Zoom in", zoomOut: "Zoom out", fitWidth: "Fit width", fitPage: "Fit page", zoomReset: "Reset zoom",
  page: "Page", pages: "pages", outline: "Outline", findInPdf: "Find in the document", copy: "Copy", copied: "Copied", pause2: "Pause animation", replay: "Replay", frame: "Frame", stillFrame: "Still frame (reduced motion)",
  image: "Image", images: "images", gallery: "Gallery", checksum: "Checksum", verify: "Check it with", tooBig: "too large", lines: "lines", of2: "of", clipHint: "Plays while in view", expand: "Show", collapse: "Hide", addressRefused: "This address is not allowed here",
};

type P = React.SVGProps<SVGSVGElement>;
const PATHS: Record<string, React.ReactNode> = {
  play: <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor" />,
  pause: <><rect x="6.5" y="5" width="4" height="14" rx="1.4" fill="currentColor" /><rect x="13.5" y="5" width="4" height="14" rx="1.4" fill="currentColor" /></>,
  back: <><path d="M12 5V2L7.5 5.8 12 9.6V6.6a6 6 0 1 1-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></>,
  fwd: <><path d="M12 5V2l4.5 3.8L12 9.6V6.6a6 6 0 1 0 6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></>,
  vol: <><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></>,
  mute: <><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor" /><path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></>,
  speed: <><path d="M4.5 17a8 8 0 1 1 15 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M12 14l4-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><circle cx="12" cy="14" r="1.6" fill="currentColor" /></>,
  cc: <><rect x="3" y="5.5" width="18" height="13" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M10.2 10.2a2.2 2.2 0 1 0 0 3.6M16.4 10.2a2.2 2.2 0 1 0 0 3.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></>,
  pip: <><rect x="3" y="5" width="18" height="14" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><rect x="12" y="12" width="7" height="5" rx="1.2" fill="currentColor" /></>,
  full: <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />,
  unfull: <path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />,
  dl: <path d="M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 19.5h14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />,
  text: <path d="M5 6.5h14M5 11h14M5 15.5h9" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />,
  search: <><circle cx="10.5" cy="10.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.9" /><path d="M15 15l5 5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />,
  left: <path d="M14.5 5.5L8 12l6.5 6.5" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />,
  right: <path d="M9.5 5.5L16 12l-6.5 6.5" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />,
  plus: <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />,
  minus: <path d="M5 12h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />,
  list: <path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />,
  copy: <><rect x="8" y="8" width="11" height="12" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M5.5 15.5v-9a2 2 0 0 1 2-2h7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />,
  replay: <path d="M5 11a7 7 0 1 1 2 5M5 5v6h6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />,
  flag: <path d="M7 3.5v17M7 4.5h10l-2.2 3.4L17 11.3H7" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />,
  fitw: <path d="M4 12h16M4 8v8M20 8v8M8 9.5L4 12l4 2.5M16 9.5l4 2.5-4 2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  fitp: <><rect x="6.5" y="3.5" width="11" height="17" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M9.5 8.5h5M9.5 12h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></>,
  // file types (the downloads part)
  document: <><path d="M7 3.5h7l4 4v13H7z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M14 3.5v4h4M9.5 12h6M9.5 15.5h6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></>,
  sheet: <><rect x="4.5" y="5" width="15" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="M4.5 10h15M4.5 14.5h15M10 5v14" stroke="currentColor" strokeWidth="1.5" /></>,
  archive: <><rect x="4.5" y="4.5" width="15" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="M12 4.5v7M10.5 8h3M10.5 11.5h3a1 1 0 0 1 1 1v2.5a2.5 2.5 0 0 1-5 0v-2.5a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></>,
  image: <><rect x="4" y="5" width="16" height="14" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.7" /><circle cx="9" cy="10" r="1.7" fill="currentColor" /><path d="M4.5 17l4.5-4.5 3.5 3.5 2.5-2.5 4.5 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" /></>,
  audio: <><path d="M4 12v0M8 8.5v7M12 5v14M16 8.5v7M20 11v2" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></>,
  video: <><rect x="3.5" y="6" width="12.5" height="12" rx="2.4" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="M16 10.5l4.5-2.5v8L16 13.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></>,
  code: <path d="M9 7l-5 5 5 5M15 7l5 5-5 5M13.2 5.5l-2.4 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  textfile: <><path d="M7 3.5h7l4 4v13H7z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M10 11h5M10 14.5h5M10 18h3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></>,
  other: <><path d="M7 3.5h7l4 4v13H7z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M14 3.5v4h4" fill="none" stroke="currentColor" strokeWidth="1.6" /></>,
};
export const FILE_ICON: Record<string, string> = { document: "document", sheet: "sheet", archive: "archive", image: "image", audio: "audio", video: "video", code: "code", text: "textfile", other: "other" };
export function Icon({ n, size = 22, ...rest }: { n: string; size?: number } & P) {
  return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false" {...rest}>{PATHS[n] ?? PATHS.other}</svg>;
}

/** The address a part may load: the host's urlPolicy, then the default rules again (applyUrlPolicy). null = refused.
 *  kind "link" for a download link, "image" for every resource the view loads. */
export function useMediaUrl(): (url: string, kind?: "link" | "image") => string | null {
  const { urlPolicy, loadMedia, mediaPrefixes } = useDh();
  const prefixes = useMemo(() => cleanPrefixes(mediaPrefixes), [mediaPrefixes]);
  // with a host loader, an address it claims (media:, @path) is not refused here: it is only ever given to the loader, never put in the page
  return useCallback((url: string, kind: "link" | "image" = "link") => (kind === "image" && loadMedia && claimedBy(url, prefixes) && !claimedRefusal(url) ? url.trim() : applyUrlPolicy(url, kind, urlPolicy)), [urlPolicy, loadMedia, prefixes]);
}
export const sameOrigin = (url: string) => { try { return new URL(url, location.href).origin === location.origin; } catch { return false; } };

export function useReducedMotion(): boolean {
  const [r, set] = useState(false);
  useEffect(() => { const m = matchMedia("(prefers-reduced-motion: reduce)"); const f = () => set(m.matches); f(); m.addEventListener?.("change", f); return () => m.removeEventListener?.("change", f); }, []);
  return r;
}
/** true while the element is within a screen of the viewport (a Lottie plays only then) */
export function useNear(ref: React.RefObject<HTMLElement | null>, margin = 80): boolean {
  const [near, set] = useState(true);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    try { const io = new IntersectionObserver((es) => set(es[es.length - 1].isIntersecting), { rootMargin: `${margin}px` }); io.observe(el); return () => io.disconnect(); } catch { set(true); }
  }, [ref, margin]);
  return near;
}
/** the theme: a number that changes when data-theme or the system scheme changes (canvases redraw on it) */
export function useThemeTick(): number {
  const [n, set] = useState(0);
  useEffect(() => {
    const bump = () => set((x) => x + 1);
    const mo = new MutationObserver(bump); mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = matchMedia("(prefers-color-scheme: dark)"); mq.addEventListener?.("change", bump);
    addEventListener("dh-theme", bump);
    return () => { mo.disconnect(); mq.removeEventListener?.("change", bump); removeEventListener("dh-theme", bump); };
  }, []);
  return n;
}
/** a CSS custom property of an element, trimmed ("" when it is not set) */
export const cssVar = (el: Element, name: string) => getComputedStyle(el).getPropertyValue(name).trim();
export const toneVar = (tone: string) => `--${tone}`;

/** Drag to seek: pointer down on the track, move, up. The track keeps its vertical scroll on a phone (touch-action: pan-y in CSS). */
export function useDrag(onFrac: (f: number, phase: "down" | "move" | "up") => void, toFrac: (clientX: number) => number, onCancel?: () => void) {
  const act = useRef(false);
  const cb = useRef(onFrac); cb.current = onFrac;
  const tf = useRef(toFrac); tf.current = toFrac;
  const oc = useRef(onCancel); oc.current = onCancel;
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      act.current = true; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      cb.current(tf.current(e.clientX), "down");
    },
    onPointerMove: (e: React.PointerEvent) => { if (act.current) cb.current(tf.current(e.clientX), "move"); },
    onPointerUp: (e: React.PointerEvent) => { if (!act.current) return; act.current = false; cb.current(tf.current(e.clientX), "up"); },
    // the browser took the finger (a vertical swipe scrolls the page): the drag is over and nothing is committed; the caller puts its state back
    onPointerCancel: () => { if (!act.current) return; act.current = false; oc.current?.(); },
  };
}

/** A small menu: a button, and a list of choices under it. Esc or a tap outside closes it. */
export function Menu({ label, value, items, onPick, icon, slot, wide = false }: { label: string; value: string; items: { key: string; label: string }[]; onPick: (k: string) => void; icon?: string; slot: string; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, [open]);
  useEffect(() => { if (open) root.current?.querySelector<HTMLElement>("[aria-checked=true]")?.focus(); }, [open]);
  return (
    <div className="mu" ref={root} data-dh-slot={slot} onKeyDown={(e) => {
      if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(false); (root.current?.querySelector(".mu-btn") as HTMLElement | null)?.focus(); }
      if (open && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); e.stopPropagation(); const bs = [...root.current!.querySelectorAll<HTMLElement>("[role=menuitemradio]")]; const i = bs.indexOf(document.activeElement as HTMLElement); bs[(i + (e.key === "ArrowDown" ? 1 : bs.length - 1)) % bs.length]?.focus(); }
    }}>
      <button type="button" className={`mu-btn m-ctl${wide ? " has-text" : ""}`} aria-haspopup="menu" aria-expanded={open} aria-label={`${label}: ${value}`} title={label} onClick={() => setOpen((o) => !o)}>
        {icon ? <Icon n={icon} size={20} /> : null}{wide || !icon ? <span className="mu-val">{value}</span> : null}
      </button>
      {open ? (
        <div className="mu-list" role="menu" aria-label={label}>
          {items.map((it) => (
            <button key={it.key} type="button" role="menuitemradio" aria-checked={it.label === value || it.key === value} className="mu-item" onClick={() => { onPick(it.key); setOpen(false); (root.current?.querySelector(".mu-btn") as HTMLElement | null)?.focus(); }}>{it.label}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** true when the key event is for a text field, or a button that handles Space and Enter itself */
export const typing = (e: React.KeyboardEvent) => {
  const t = e.target as HTMLElement;
  return t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable;
};
export const onButton = (e: React.KeyboardEvent) => (e.target as HTMLElement).tagName === "BUTTON" || (e.target as HTMLElement).tagName === "A";

export const pct = (x: number) => `${(Math.max(0, Math.min(1, x)) * 100).toFixed(3)}%`;
export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** one "now playing" status line for screen readers (polite) */
export function useCopy(): [boolean, (text: string) => void] {
  const [done, set] = useState(false);
  const t = useCallback((text: string) => { try { navigator.clipboard?.writeText(text).then(() => { set(true); setTimeout(() => set(false), 1600); }, () => {}); } catch {} }, []);
  return [done, t];
}
