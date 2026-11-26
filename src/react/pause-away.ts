// hydrate: a part off the screen keeps its CSS animations still. A running CSS animation (a weather icon's rain, a
// terminal's cursor, a map's flowing arc) makes the browser work out the page's styles and layout again every frame, on
// the screen or not: on the 87-stage sample page, 24 of them, all off the screen, held a slow phone at 12 to 30 frames a
// second with nothing to see move. Each figure is watched (IntersectionObserver); the animations inside one that is
// away from the screen are paused (Web Animations, no change to the markup React owns) and played again, only the ones
// paused here, when it comes back. New animations inside a figure that is away are caught on the next sweep (2 s).
import { useEffect, type RefObject } from "react";

/** how far outside the screen a figure still counts as on it (so an animation is running before it scrolls in) */
export const AWAY_MARGIN = "300px 0px";

/** watch the figures under `root`; returns the stop function (every animation paused here is played again) */
export function pauseAway(root: Element, win: Window & typeof globalThis = window): () => void {
  const doc = root.ownerDocument;
  if (typeof win.IntersectionObserver !== "function" || typeof doc?.getAnimations !== "function") return () => {};
  const away = new Set<Element>(), ours = new Set<Animation>();
  const isAway = (t: Element) => { for (const f of away) if (f.contains(t)) return true; return false; };
  const sweep = () => {
    for (const a of doc.getAnimations()) {
      const t = (a.effect as KeyframeEffect | null)?.target;
      if (!t || !root.contains(t)) continue;
      if (isAway(t)) { if (a.playState === "running") { a.pause(); ours.add(a); } }
      else if (ours.has(a)) { ours.delete(a); if (a.playState === "paused") a.play(); }
    }
    for (const a of ours) if (!a.effect || !(a.effect as KeyframeEffect).target?.isConnected) ours.delete(a);
  };
  const io = new win.IntersectionObserver((es) => {
    for (const e of es) { if (e.isIntersecting) away.delete(e.target); else away.add(e.target); }
    sweep();
  }, { rootMargin: AWAY_MARGIN });
  const seen = new WeakSet<Element>();
  const watch = () => { for (const f of root.querySelectorAll("figure")) if (!seen.has(f)) { seen.add(f); io.observe(f); } };
  watch();
  const timer = win.setInterval(() => { watch(); if (away.size) sweep(); }, 2000);
  return () => {
    win.clearInterval(timer); io.disconnect();
    for (const a of ours) if (a.playState === "paused") a.play();
    ours.clear(); away.clear();
  };
}

/** the document's hook: pause the animations of the figures away from the screen */
export function usePauseAway(root: RefObject<HTMLElement | null>): void {
  useEffect(() => { const el = root.current; return el ? pauseAway(el) : undefined; }, [root]);
}
