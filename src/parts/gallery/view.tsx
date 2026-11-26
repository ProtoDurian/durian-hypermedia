// The gallery part's view (format version 11): one image with zoom, a grid, or a carousel (swipe, keys, dots), and a lightbox
// (pinch and wheel zoom, drag to pan, arrows, Esc). Our own code, no library. Every address goes through the host's
// urlPolicy (as an image). The lightbox is drawn into the document's own root (the part's box is a size container, so a
// fixed box inside it would not cover the page).
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PartViewProps } from "../types";
import { Icon, STR, clamp } from "../downloads/media-ui";
import { refusedText, useMediaSrcs, useSeen } from "../../react/media-loader";
import type { GallerySpec } from "./part";
import { useStatic } from "../kit/static";


type Im = GallerySpec["images"][number] & { href: string };

function Lightbox({ images, index, onIndex, onClose }: { images: Im[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const [z, setZ] = useState({ s: 1, x: 0, y: 0 });
  const zr = useRef(z); zr.current = z;
  const root = useRef<HTMLDivElement>(null), stage = useRef<HTMLDivElement>(null), img = useRef<HTMLImageElement>(null);
  const pts = useRef(new Map<number, { x: number; y: number }>()), start = useRef<{ d: number; s: number; x: number; y: number; cx: number; cy: number; x0: number; y0: number } | null>(null), last = useRef(0), moved = useRef(0);
  const im = images[index];
  const go = useCallback((d: number) => { onIndex((index + d + images.length) % images.length); }, [index, images.length, onIndex]);
  useEffect(() => { setZ({ s: 1, x: 0, y: 0 }); }, [index]);
  // focus: in on open, back to the opener on close; the page behind stays put
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    root.current?.querySelector<HTMLElement>(".lb-close")?.focus();
    return () => { document.body.style.overflow = prev; opener?.focus?.(); };
  }, []);
  const limit = (s: number, x: number, y: number) => {
    const st = stage.current, el = img.current; if (!st || !el) return { s, x, y };
    const w = el.clientWidth * s, h = el.clientHeight * s, mx = Math.max(0, (w - st.clientWidth) / 2), my = Math.max(0, (h - st.clientHeight) / 2);
    return { s, x: s <= 1 ? 0 : clamp(x, -mx, mx), y: s <= 1 ? 0 : clamp(y, -my, my) };
  };
  const zoomAt = (ns: number, cx: number, cy: number) => {
    const st = stage.current!.getBoundingClientRect(), o = zr.current, s = clamp(ns, 1, 8);
    const px = cx - (st.left + st.width / 2), py = cy - (st.top + st.height / 2), k = s / o.s;
    setZ(limit(s, px - (px - o.x) * k, py - (py - o.y) * k));
  };
  const down = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved.current = 0;
    const p = [...pts.current.values()], o = zr.current;
    if (p.length === 2) start.current = { d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), s: o.s, x: o.x, y: o.y, cx: (p[0].x + p[1].x) / 2, cy: (p[0].y + p[1].y) / 2, x0: o.x, y0: o.y };
    else start.current = { d: 0, s: o.s, x: o.x, y: o.y, cx: e.clientX, cy: e.clientY, x0: e.clientX, y0: e.clientY };
  };
  const move = (e: React.PointerEvent) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = [...pts.current.values()], st = start.current; if (!st) return;
    if (p.length >= 2 && st.d) {
      const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), cx = (p[0].x + p[1].x) / 2, cy = (p[0].y + p[1].y) / 2, rect = stage.current!.getBoundingClientRect();
      const s = clamp(st.s * (d / st.d), 1, 8), px = st.cx - (rect.left + rect.width / 2), py = st.cy - (rect.top + rect.height / 2), k = s / st.s;
      setZ(limit(s, px - (px - st.x) * k + (cx - st.cx), py - (py - st.y) * k + (cy - st.cy))); moved.current = 99;
    } else if (p.length === 1) {
      const dx = e.clientX - st.cx, dy = e.clientY - st.cy; moved.current = Math.max(moved.current, Math.hypot(dx, dy));
      if (zr.current.s > 1) setZ(limit(zr.current.s, st.x + dx, st.y + dy));
    }
  };
  const up = (e: React.PointerEvent) => {
    const had = pts.current.has(e.pointerId); pts.current.delete(e.pointerId);
    const st = start.current;
    if (had && st && pts.current.size === 0) {
      const dx = e.clientX - st.cx, dy = e.clientY - st.cy;
      if (zr.current.s <= 1.02 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4 && images.length > 1) go(dx < 0 ? 1 : -1);
      else if (moved.current < 8 && e.pointerType !== "mouse") { // a double tap zooms in, and out again
        const now = performance.now(); if (now - last.current < 320) { zoomAt(zr.current.s > 1.2 ? 1 : 2.5, e.clientX, e.clientY); last.current = 0; } else last.current = now;
      }
      start.current = null;
    } else if (pts.current.size === 1) { const p = [...pts.current.values()][0], o = zr.current; start.current = { d: 0, s: o.s, x: o.x, y: o.y, cx: p.x, cy: p.y, x0: p.x, y0: p.y }; }
  };
  useEffect(() => {
    const st = stage.current; if (!st) return;
    const wheel = (e: WheelEvent) => { e.preventDefault(); zoomAt(zr.current.s * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY); };
    st.addEventListener("wheel", wheel, { passive: false });
    return () => st.removeEventListener("wheel", wheel);
  }, []);
  const key = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.stopPropagation(); onClose(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); go(1); } else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
    else if (e.key === "+" || e.key === "=") { e.preventDefault(); const r = stage.current!.getBoundingClientRect(); zoomAt(zr.current.s * 1.4, r.left + r.width / 2, r.top + r.height / 2); }
    else if (e.key === "-") { e.preventDefault(); const r = stage.current!.getBoundingClientRect(); zoomAt(zr.current.s / 1.4, r.left + r.width / 2, r.top + r.height / 2); }
    else if (e.key === "0") setZ({ s: 1, x: 0, y: 0 });
    else if (e.key === "Tab") { // keep focus inside the dialog
      const f = [...root.current!.querySelectorAll<HTMLElement>("button:not([disabled])")]; if (!f.length) return;
      const i = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  };
  const ctr = () => { const r = stage.current!.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  return (
    <div ref={root} className="lb" data-dh-slot="lightbox" role="dialog" aria-modal="true" aria-label={`${STR.gallery}: ${im.alt}`} onKeyDown={key}>
      <div className="lb-top">
        <span className="lb-count" aria-live="polite">{index + 1} / {images.length}</span>
        <span className="m-grow" />
        <button type="button" className="m-ctl lb-z" onClick={() => { const [x, y] = ctr(); zoomAt(zr.current.s / 1.5, x, y); }} aria-label={STR.zoomOut}><Icon n="minus" /></button>
        <button type="button" className="m-ctl lb-z" onClick={() => { const [x, y] = ctr(); zoomAt(zr.current.s * 1.5, x, y); }} aria-label={STR.zoomIn}><Icon n="plus" /></button>
        <button type="button" className="m-ctl lb-z" onClick={() => setZ({ s: 1, x: 0, y: 0 })} aria-label={STR.zoomReset}><Icon n="replay" /></button>
        <button type="button" className="m-ctl lb-close" onClick={onClose} aria-label={STR.close}><Icon n="close" /></button>
      </div>
      <div className="lb-stage" ref={stage} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <img ref={img} src={im.href} alt={im.alt} draggable={false} style={{ transform: `translate(${z.x}px, ${z.y}px) scale(${z.s})`, cursor: z.s > 1 ? "grab" : "zoom-in" }} onDoubleClick={(e) => zoomAt(zr.current.s > 1.2 ? 1 : 2.5, e.clientX, e.clientY)} />
        {images.length > 1 ? <button type="button" className="m-ctl lb-nav lb-prev" onClick={() => go(-1)} aria-label={STR.prev}><Icon n="left" size={26} /></button> : null}
        {images.length > 1 ? <button type="button" className="m-ctl lb-nav lb-next" onClick={() => go(1)} aria-label={STR.next}><Icon n="right" size={26} /></button> : null}
      </div>
      <p className="lb-cap" data-dh-slot="caption"><b>{im.alt}</b>{extra(im) ? <span>{im.caption}</span> : null}</p>
    </div>
  );
}

/** Draw into the document's own root (the nearest .dh-doc), where the theme's variables live and no size container clips a fixed box. */
function Portal({ root, children }: { root: React.RefObject<HTMLElement | null>; children: React.ReactNode }) {
  const target = root.current?.closest(".dh-doc") ?? document.body;
  return createPortal(children, target);
}
// a caption that only repeats the alt text is not shown twice
const extra = (im: { alt: string; caption?: string }) => !!im.caption && im.caption.trim().toLowerCase() !== im.alt.trim().toLowerCase();
function GalleryLoaded({ data: spec, stage, static: stp, hrefs, why }: PartViewProps<GallerySpec> & { hrefs: (string | null)[]; why: string }) {
  // static (SPEC 4.1: the fence, the page, the host, print or reduce motion): every image at once, as a grid, with no arrows,
  // dots, swipe or lightbox; a printed carousel shows all its images, not the first one
  const sx = useStatic(stp, 0);
  const all = spec.images.map((im, k) => ({ ...im, href: hrefs[k] ?? null }));
  const imgs: Im[] = all.filter((im): im is Im => im.href !== null);
  const refused = all.length - imgs.length;
  const rootRef = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(Math.min(Math.max(0, spec.start - 1), Math.max(0, imgs.length - 1))), [lb, setLb] = useState<number | null>(null), [drag, setDrag] = useState(0);
  const ds = useRef<{ x: number; moved: boolean; w: number } | null>(null), openerRef = useRef<HTMLElement | null>(null);
  const n = imgs.length;
  void stage;
  const step = (d: number) => setI((k) => (spec.loop ? (k + d + n) % n : clamp(k + d, 0, n - 1)));
  const open = (k: number, el: HTMLElement) => { openerRef.current = el; setLb(k); };
  const cap = (im: Im) => (extra(im) ? <figcaption data-dh-slot="caption"><b>{im.alt}</b><span>{im.caption}</span></figcaption> : <figcaption data-dh-slot="caption" className="is-alt"><span>{im.alt}</span></figcaption>);
  const box = n === 0 ? null : (
    sx.on && n > 1 ? (
      <div className="gl-grid" data-dh-slot="grid" style={{ "--gallery-cols": spec.view === "grid" ? spec.columns : Math.min(3, n) } as React.CSSProperties} data-ratio={spec.ratio}>
        {imgs.map((im, k) => <figure key={k} className="gl-cell" data-dh-slot="image"><img src={im.href} alt={im.alt} draggable={false} style={spec.ratio !== "auto" ? { aspectRatio: spec.ratio.replace(":", " / ") } : undefined} />{cap(im)}</figure>)}
      </div>
    ) : spec.view === "carousel" && n > 1 ? (
      <div className="gl-car" data-dh-slot="carousel" role="group" aria-roledescription="carousel" aria-label={spec.title || STR.gallery}
        onKeyDown={(e) => { if (e.key === "ArrowRight") { e.preventDefault(); step(1); } else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); } else if (e.key === "Home") { e.preventDefault(); setI(0); } else if (e.key === "End") { e.preventDefault(); setI(n - 1); } }}>
        <div className="gl-view" tabIndex={0} aria-live="polite"
          onPointerDown={(e) => { ds.current = { x: e.clientX, moved: false, w: e.currentTarget.clientWidth }; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); }}
          onPointerMove={(e) => { const s = ds.current; if (!s) return; const dx = e.clientX - s.x; if (Math.abs(dx) > 8) s.moved = true; if (s.moved) setDrag(dx); }}
          onPointerUp={(e) => { const s = ds.current; ds.current = null; const dx = e.clientX - (s?.x ?? e.clientX); setDrag(0); if (s?.moved) { if (Math.abs(dx) > Math.min(60, s.w / 5)) step(dx < 0 ? 1 : -1); } else open(i, e.currentTarget as HTMLElement); }}
          onPointerCancel={() => { ds.current = null; setDrag(0); }}>
          <div className={`gl-track${drag ? " is-drag" : ""}`} style={{ transform: `translateX(calc(${-i * 100}% + ${drag}px))` }}>
            {imgs.map((im, k) => (
              <figure key={k} className="gl-slide" data-dh-slot="image" aria-hidden={k !== i} aria-label={`${k + 1} ${STR.of} ${n}`} aria-roledescription="slide">
                <img src={im.href} alt={im.alt} draggable={false} loading={Math.abs(k - i) < 2 ? "eager" : "lazy"} style={spec.ratio !== "auto" ? { aspectRatio: spec.ratio.replace(":", " / ") } : undefined} />
                {cap(im)}
              </figure>
            ))}
          </div>
        </div>
        <button type="button" className="m-ctl gl-nav gl-prev" onClick={() => step(-1)} disabled={!spec.loop && i === 0} aria-label={STR.prev}><Icon n="left" size={24} /></button>
        <button type="button" className="m-ctl gl-nav gl-next" onClick={() => step(1)} disabled={!spec.loop && i === n - 1} aria-label={STR.next}><Icon n="right" size={24} /></button>
        <div className="gl-dots" data-dh-slot="dots" role="group" aria-label={`${n} ${STR.images}`}>
          {imgs.map((im, k) => <button key={k} type="button" className="gl-dot" aria-label={`${STR.image} ${k + 1}: ${im.alt}`} aria-current={k === i ? "true" : undefined} onClick={() => setI(k)}><i /></button>)}
        </div>
      </div>
    ) : spec.view === "grid" && n > 1 ? (
      <div className="gl-grid" data-dh-slot="grid" style={{ "--gallery-cols": spec.columns } as React.CSSProperties} data-ratio={spec.ratio}>
        {imgs.map((im, k) => (
          <figure key={k} className="gl-cell" data-dh-slot="image">
            <button type="button" className="gl-img" onClick={(e) => open(k, e.currentTarget)} aria-label={`${STR.image} ${k + 1}: ${im.alt}`}>
              <img src={im.href} alt="" loading="lazy" draggable={false} style={spec.ratio !== "auto" ? { aspectRatio: spec.ratio.replace(":", " / ") } : undefined} />
            </button>
            {cap(im)}
          </figure>
        ))}
      </div>
    ) : (
      <figure className="gl-one" data-dh-slot="image">
        <button type="button" className="gl-img" onClick={(e) => open(0, e.currentTarget)} aria-label={`${STR.image}: ${imgs[0].alt}`}><img src={imgs[0].href} alt={imgs[0].alt} loading="lazy" draggable={false} /></button>
        {cap(imgs[0])}
      </figure>
    )
  );
  return (
    <div ref={rootRef} className={`gl dh-media gl-v-${sx.on && n > 1 ? "grid" : spec.view}`} data-dh-static={sx.on || undefined}>
      {spec.title ? <p className="gl-title">{spec.title}</p> : null}
      {box}
      {refused ? <p className="m-err" role="note">{why}{refused === all.length ? "" : ` (${refused})`}</p> : null}
      {lb !== null && !sx.on ? <Portal root={rootRef}><Lightbox images={imgs} index={lb} onIndex={(k) => { setLb(k); setI(k); }} onClose={() => { setLb(null); window.setTimeout(() => openerRef.current?.focus?.(), 0); }} /></Portal> : null}
    </div>
  );
}

/** Asks the host's loader (when there is one) for every image first; the gallery is drawn once all have answered. Without a loader this is the urlPolicy, on the render, as in 0.7.0. */
export default function GalleryView(p: PartViewProps<GallerySpec>) {
  // with a loader the images are asked for once the gallery is near the viewport
  const wait = useRef<HTMLDivElement>(null), seen = useSeen(wait, 300, p.static !== undefined && p.static !== false);
  const states = useMediaSrcs("gallery", p.data.images.map((im) => ({ url: im.src, kind: "image" as const })), seen);
  if (states.some((s) => s.status === "loading" || s.status === "idle")) return <div ref={wait} className={`gl dh-media gl-v-${p.data.view}`}>{p.data.title ? <p className="gl-title">{p.data.title}</p> : null}<p className="m-note" role="status">{STR.loading}</p></div>;
  const firstRefused = states.find((s) => s.status === "refused");
  return <GalleryLoaded {...p} hrefs={states.map((s) => (s.status === "ready" ? s.src : null))} why={refusedText(STR.addressRefused, firstRefused)} />;
}
