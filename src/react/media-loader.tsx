// What a media part uses to ask the host's loader (DocumentProps.loadMedia) first; the rules themselves are in ../media-loader.ts.
//  - useMediaSrcs: for a source set on an element (<img>, <video>, <audio>, <source>, a poster). With no loader it is applyUrlPolicy on the render
//    (the 0.7.0 path, nothing async). With a loader it asks once per address when `gate` is true, keeps the answer, and revokes a blob made from `{bytes}`
//    (and gives its bytes back to the page's total) when the part unmounts, the address changes or the gate goes away.
//  - useSeen: true once the element has been near the viewport (always true with no loader): the gate of an image, a poster, a gallery.
//  - useMediaVia: for a part that fetches the file itself (pdf, lottie, captions, peaks, audio): the `via` argument of mediaBytes/mediaText.
import { useEffect, useMemo, useRef, useState } from "react";
import { applyUrlPolicy, type UrlPolicy } from "../safety";
import { askLoader, claimedBy, cleanPrefixes, newMade, resolveSources, revokeMade, type LoadMedia, type MediaItem, type MediaKind, type MediaSrc } from "../media-loader";
import type { MediaVia } from "../parts/downloads/media-fetch";
import { useDh } from "./context";
import { useStatic } from "../parts/kit/static";

export type { MediaItem, MediaSrc };

export function useMediaSrcs(part: string, items: readonly MediaItem[], gate = true): MediaSrc[] {
  const { loadMedia, mediaPrefixes, urlPolicy, mediaTotal } = useDh();
  const prefixes = useMemo(() => cleanPrefixes(mediaPrefixes), [mediaPrefixes]);
  const host = useRef({ loadMedia, urlPolicy, prefixes, items, total: mediaTotal });
  host.current = { loadMedia, urlPolicy, prefixes, items, total: mediaTotal };   // read when the effect runs: a new function each render does not reload anything
  const has = !!loadMedia;
  const key = items.map((i) => `${i.kind}\n${i.role ?? ""}\n${i.url ?? ""}`).join("\n\u0000") + "\n\u0001" + prefixes.join(" ");
  const [done, setDone] = useState<{ key: string; res: MediaSrc[] } | null>(null);
  useEffect(() => {
    if (!has || !gate) return;
    const ac = new AbortController(), made = newMade();
    void (async () => {
      const h = host.current;
      const res = await resolveSources(part, h.items, { loader: h.loadMedia, prefixes: h.prefixes, urlPolicy: h.urlPolicy, total: h.total }, ac.signal, made);
      if (ac.signal.aborted) { revokeMade(made); return; }
      setDone({ key, res });
    })();
    return () => { ac.abort(); revokeMade(made); };
  }, [has, gate, key, part]);
  if (!has) return items.map((it): MediaSrc => { const u = it.url == null || it.url === "" ? null : applyUrlPolicy(it.url, "image", urlPolicy); return u == null ? { status: "refused", reason: "" } : { status: "ready", src: u }; });
  return done && done.key === key && gate ? done.res : items.map((): MediaSrc => (gate ? { status: "loading" } : { status: "idle" }));
}

/** true once the element has come within `margin` px of the viewport; always true when the host gave no loader (nothing waits then). Also true while the
 *  page is printing (or print media is emulated), when the host asked for a static page (DocumentProps.static), or when `force` is (the part's own static):
 *  such a page has to hold every image, and a far image would never come near the viewport. */
export function useSeen(ref: React.RefObject<Element | null>, margin = 300, force = false): boolean {
  const dh = useDh(), has = !!dh.loadMedia;
  const st = useStatic(dh.static, 0);
  const forced = force || st.print || (dh.static !== undefined && dh.static !== false);
  const [seen, setSeen] = useState(!has);
  useEffect(() => {
    if (!has || seen) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setSeen(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: `${margin}px` });
    io.observe(el);
    return () => io.disconnect();
  }, [has, seen, ref, margin]);
  return seen || forced;
}

/** For a part that fetches the file itself: `via(url, kind, role)` is what mediaBytes/mediaText take as their last argument; undefined when the host gave no loader. */
export function useMediaVia(part: string): (url: string, kind: MediaKind, role?: string) => MediaVia | undefined {
  const { loadMedia, mediaPrefixes, urlPolicy, mediaTotal } = useDh();
  const host = useRef<{ loadMedia?: LoadMedia; urlPolicy?: UrlPolicy; mediaPrefixes?: readonly string[]; total?: { used: number } }>({});
  host.current = { loadMedia, urlPolicy, mediaPrefixes, total: mediaTotal };
  const has = !!loadMedia;
  return useMemo(() => (url, kind, role) => {
    if (!has) return undefined;
    return (cap, signal) => askLoader(url, kind, part, role, cap, { loader: host.current.loadMedia, prefixes: cleanPrefixes(host.current.mediaPrefixes), urlPolicy: host.current.urlPolicy, total: host.current.total }, signal ?? new AbortController().signal);
  }, [has, part]);
}

/** The words for a refused source: the part's own text ("This address is not allowed"), and with a loader's reason after it. No reason (no loader): the part's text alone, as in 0.7.0. */
export function refusedText(base: string, ms: MediaSrc | undefined): string {
  return ms && ms.status === "refused" && ms.reason ? `${base}: ${ms.reason}` : base;
}
/** true when the host has a loader and claims this address: such an address is only ever given to the loader, so a part draws no plain link to it */
export function useClaims(): (url: string) => boolean {
  const { loadMedia, mediaPrefixes } = useDh();
  const prefixes = useMemo(() => cleanPrefixes(mediaPrefixes), [mediaPrefixes]);
  return useMemo(() => (url: string) => !!loadMedia && claimedBy(url, prefixes), [loadMedia, prefixes]);
}
/** true when the host gave a loader */
export function useHasLoader(): boolean { return !!useDh().loadMedia; }
