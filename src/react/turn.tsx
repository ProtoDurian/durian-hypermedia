// Hydration order (format version 10). A page with many parts used to hydrate every part at once, and an animation lays
// its scene out in the browser: on a slow phone the server's first drawing stayed for 12 to 15 seconds. Now what the
// reader sees comes first:
//   1. the parts on screen (and just below it), one per task, so the page paints between them;
//   2. the part the reader scrolls to jumps the queue;
//   3. then the rest, in page order, still one per task;
//   4. a part the reader touches, clicks, focuses or types in works at once (React replays the event once it is live).
// How: each heavy part sits in a Suspense boundary that waits for its turn while the page hydrates. The server HTML of a
// waiting part stays as it is (React keeps it), so nothing flashes. Only hydrateDocument() turns this on; a page
// rendered on the server, rendered in the browser only, or hydrated by the host's own hydrateRoot is not delayed.
import React, { Suspense, createContext, useContext, useEffect, useId, useRef } from "react";
import { DhContext } from "./context";

/** view: the part as its Turn last drew it, with the page's settings (print draws a part still waiting from it) */
type Entry = { key: string; box: HTMLElement | null; mark: HTMLElement | null; released: boolean; done: boolean; promise: Promise<void>; resolve: () => void; seq: number; view?: () => React.ReactNode };

/** The queue behind the hydration order. hydrateDocument() makes one; a host never needs to. */
export class HydrationOrder {
  private entries = new Map<string, Entry>();
  private queue: Entry[] = [];
  private busy = false;
  private finished = false;
  private seq = 0;
  private io: IntersectionObserver | null = null;
  private pumpTimer: ReturnType<typeof setTimeout> | null = null;
  private off: (() => void)[] = [];

  /** the entry for one part (made when its Suspense boundary first renders) */
  entry(key: string): Entry {
    let e = this.entries.get(key);
    if (!e) {
      let resolve!: () => void;
      const promise = new Promise<void>((r) => { resolve = r; });
      e = { key, box: null, mark: null, released: this.finished, done: false, promise, resolve, seq: this.seq++ };
      if (this.finished) resolve();
      else this.queue.push(e);
      this.entries.set(key, e);
      // the queue starts when the markers are in the page (attach), not before: until then nothing can be placed
    }
    return e;
  }
  /** the part's marker is in the page: it can be placed on the screen */
  attach(key: string, mark: HTMLElement) {
    const e = this.entry(key);
    e.mark = mark; e.box = mark.parentElement;
    if (!e.done) mark.setAttribute?.("data-wait", ""); // table-more leaves the part's tables alone until it has hydrated
    if (this.io && !e.released) this.io.observe(mark);
    this.kick();
  }
  detach(key: string) { const e = this.entries.get(key); if (e?.mark && this.io) this.io.unobserve(e.mark); e?.mark?.removeAttribute?.("data-wait"); if (e) { e.mark = null; e.box = null; } }
  /** the part has drawn itself: the next one may go */
  drawn(key: string) { const e = this.entries.get(key); if (e && !e.done) { e.done = true; e.mark?.removeAttribute?.("data-wait"); if (this.current === e && this.wait) this.wait(); } }

  private wait: (() => void) | null = null;
  private current: Entry | null = null;
  private near(e: Entry) {
    if (!e.mark) return false;
    const r = e.mark.getBoundingClientRect();
    return r.bottom > -200 && r.top < innerHeight + 400;
  }
  private release(e: Entry) { if (!e.released) { e.released = true; e.resolve(); } this.queue = this.queue.filter((x) => x !== e); }
  private kick() { if (this.pumpTimer == null && !this.busy && !this.finished) this.pumpTimer = setTimeout(() => { this.pumpTimer = null; this.pump(); }, 0); }
  private next(): Entry | undefined {
    // on screen first, in page order; then the rest in page order
    const live = this.queue.filter((e) => !e.released).sort((a, b) => a.seq - b.seq);
    return live.find((e) => this.near(e)) ?? live[0];
  }
  private pump() {
    if (this.busy || this.finished) return;
    const e = this.next();
    if (!e) { if (this.entries.size) this.finished = true; return; }
    this.busy = true;
    this.current = e;
    this.release(e);
    // one part per task: the next waits until this one has drawn itself (or a short time has passed, so no part can hold up the rest)
    let over = false;
    const go = () => { if (over) return; over = true; this.wait = null; this.current = null; clearTimeout(t); this.busy = false; setTimeout(() => this.pump(), 0); };
    const t = setTimeout(go, 2000);
    this.wait = () => setTimeout(go, 0);
    if (e.done) this.wait();
  }

  /** the parts not drawn yet (their server HTML still stands): print draws these from their views (react/hydrate.tsx) */
  waiting(): { mark: HTMLElement; view: () => React.ReactNode }[] {
    return [...this.entries.values()].filter((e) => !e.done && e.mark && e.view).sort((a, b) => a.seq - b.seq).map((e) => ({ mark: e.mark!, view: e.view! }));
  }
  /** start watching the reader: scrolling to a part, and touching one */
  watch(root: Element) {
    // if no marker ever comes (the page did not hydrate as planned), nothing may stay waiting for long
    setTimeout(() => this.kick(), 3000);
    try {
      this.io = new IntersectionObserver((es) => {
        for (const x of es) {
          if (!x.isIntersecting) continue;
          const e = [...this.entries.values()].find((y) => y.mark === x.target);
          this.io?.unobserve(x.target);
          // a part the reader scrolls to jumps the queue
          if (e && !e.released) { this.queue = [e, ...this.queue.filter((y) => y !== e)]; e.seq = -1 - this.seq++; this.kick(); }
        }
      }, { rootMargin: "400px 0px 600px 0px" });
      for (const e of this.entries.values()) if (e.mark && !e.released) this.io.observe(e.mark);
    } catch { this.io = null; }
    const now = (ev: Event) => {
      const t = ev.target as Node | null;
      if (!t) return;
      for (const e of this.entries.values()) if (!e.released && e.box && e.box.contains(t)) { this.release(e); break; }
    };
    for (const type of ["pointerdown", "touchstart", "mousedown", "click", "focusin", "keydown"]) {
      root.addEventListener(type, now, { capture: true, passive: true });
      this.off.push(() => root.removeEventListener(type, now, { capture: true } as EventListenerOptions));
    }
  }
  /** stop watching; every part waiting is let go at once */
  stop() {
    this.io?.disconnect(); this.io = null;
    for (const f of this.off) f();
    this.off = [];
    this.finished = true;
    if (this.pumpTimer != null) clearTimeout(this.pumpTimer);
    for (const e of this.entries.values()) this.release(e);
  }
}

export const TurnContext = createContext<HydrationOrder | null>(null);

// the part itself: throws a promise until its turn comes (only while the page hydrates)
function Wait({ id, order, children }: { id: string; order: HydrationOrder | null; children: React.ReactNode }) {
  if (order) {
    const e = order.entry(id);
    if (!e.released) throw e.promise;
  }
  useEffect(() => { order?.drawn(id); }, [order, id]);
  return <>{children}</>;
}

/**
 * Puts a part into the hydration queue (hydrateDocument). Everywhere else it draws the part at once. The marker is a
 * block with no height at the top of the part, so the queue can tell where on the page the part is.
 */
export function Turn({ children }: { children: React.ReactNode }) {
  const order = useContext(TurnContext), dh = useContext(DhContext);
  const id = useId();
  if (order) order.entry(id).view = () => <DhContext.Provider value={dh}>{children}</DhContext.Provider>;
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const m = ref.current;
    if (order && m) { order.attach(id, m); return () => order.detach(id); }
  }, [order, id]);
  return (
    <>
      <span className="dh-turn" ref={ref} aria-hidden="true" />
      <Suspense fallback={null}><Wait id={id} order={order}>{children}</Wait></Suspense>
    </>
  );
}
