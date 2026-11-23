// Tables wider than their box (0.7.0-rc.3, the owner's bullet E: the widest table lost its last columns at 1680 with
// nothing to say there was more). Every `.table-wrap` inside a document scrolls sideways already (base.css); this marks
// the side that has more of the table (`data-more` "l", "r" or "lr": base.css fades that edge out) and adds one line
// under a table that scrolls ("↔ Swipe the table to see all of it"). Both follow the scroll and any change of size.
// The line is out of the flow (base.css), so adding it never moves the page. No markup and no inline style text is
// written: the line is a plain element with textContent, placed with a CSSOM transform (strict CSP and Trusted Types).
import { useEffect, type RefObject } from "react";

/** which sides of a box hold more than it shows: "l", "r", "lr" or "" */
export function moreSides(scrollLeft: number, clientWidth: number, scrollWidth: number): string {
  const wide = scrollWidth > clientWidth + 2;
  return (wide && scrollLeft > 2 ? "l" : "") + (wide && scrollLeft + clientWidth < scrollWidth - 2 ? "r" : "");
}

/** mark one table box: its faded sides, and the swipe line under it while it scrolls */
export function markTable(w: HTMLElement, hint: string): void {
  const next = w.nextElementSibling as HTMLElement | null, more = next?.classList.contains("table-more") ? next : null;
  const wide = w.scrollWidth > w.clientWidth + 2;
  let line = more;
  if (wide && !more) { line = w.ownerDocument.createElement("p"); line.className = "table-more"; line.textContent = hint; w.after(line); }
  if (!wide && more) { more.remove(); line = null; }
  if (line) { line.style.transform = ""; line.style.transform = `translateY(${Math.round(w.getBoundingClientRect().bottom + 1 - line.getBoundingClientRect().top)}px)`; }
  const sides = moreSides(w.scrollLeft, w.clientWidth, w.scrollWidth);
  if (sides) w.dataset.more = sides; else delete w.dataset.more;
}

/** keep every table box under `root` marked: on scroll, on resize, and when parts add or grow tables */
export function useTableMore(root: RefObject<HTMLElement | null>, hint: string): void {
  useEffect(() => {
    const el = root.current, win = el?.ownerDocument.defaultView;
    if (!el || !win) return;
    const seen = new WeakSet<HTMLElement>(), offs: (() => void)[] = [];
    const ro = typeof win.ResizeObserver === "function" ? new win.ResizeObserver((es) => es.forEach((e) => { const w = (e.target as HTMLElement).closest<HTMLElement>(".table-wrap"); if (w) markTable(w, hint); })) : null;
    const run = () => el.querySelectorAll<HTMLElement>(".table-wrap").forEach((w) => {
      if (!seen.has(w)) {
        seen.add(w); const on = () => markTable(w, hint); w.addEventListener("scroll", on, { passive: true }); offs.push(() => w.removeEventListener("scroll", on));
        ro?.observe(w); const t = w.querySelector("table"); if (t) ro?.observe(t);
      }
      markTable(w, hint);
    });
    let queued = 0;
    const later = () => { if (!queued) queued = win.requestAnimationFrame(() => { queued = 0; run(); }); };
    const mo = typeof win.MutationObserver === "function" ? new win.MutationObserver(later) : null;
    mo?.observe(el, { childList: true, subtree: true });
    win.addEventListener("resize", run);
    run();
    return () => { ro?.disconnect(); mo?.disconnect(); win.removeEventListener("resize", run); if (queued) win.cancelAnimationFrame(queued); offs.forEach((f) => f()); el.querySelectorAll(".table-more").forEach((p) => p.remove()); };
  }, [root, hint]);
}
