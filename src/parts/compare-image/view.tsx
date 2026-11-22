// The compare-image part's view (format version 11): two pictures of the same size on top of each other, a bar between
// them. Drag the grip or anywhere on the picture (pointer events; the page still scrolls the other way), the arrow keys
// (1, Shift 10), Page Up and Down (10), Home and End, Enter or Space flips, a tap that does not move flips, the two labels
// are buttons that show a whole picture. The bar is a slider with words in aria-valuetext. Every address goes through the
// host's URL policy again before it is an <img>. Every element is a React element: no HTML string reaches the page.
import React, { useRef, useState } from "react";
import { useDh } from "../../react/context";
import { applyUrlPolicy } from "../../safety";
import type { PartViewProps } from "../types";
import type { CompareImageData } from "./part";

/** the part's own words (the renderer's shared words come from `ui`) */
const W = { slider: "Comparison position", helpH: "Drag sideways, or tap to flip", helpV: "Drag up and down, or tap to flip", blocked: "This image address is not allowed here", cannot: "This comparison cannot be drawn:" };

export default function CompareImageView({ data, ui: _ui }: PartViewProps<CompareImageData>) {
  const ci = data.ci;
  const { urlPolicy } = useDh();
  const stage = useRef<HTMLDivElement>(null);
  const [p, setP] = useState(ci?.start ?? 50);
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  if (!ci || data.errors.length) return <div className="cmpi"><div className="cw-error">{W.cannot} {data.errors[0]?.msg ?? "it has no images"}</div></div>;
  const before = applyUrlPolicy(ci.before.src, "image", urlPolicy), after = applyUrlPolicy(ci.after.src, "image", urlPolicy);
  if (before == null || after == null) return <div className="cmpi"><div className="cw-error">{W.blocked}: {before == null ? ci.before.src : ci.after.src}</div></div>;
  const start = ci.start;
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const fromEvent = (e: React.PointerEvent) => {
    const r = stage.current!.getBoundingClientRect();
    return clamp(ci.vertical ? ((e.clientY - r.top) / (r.height || 1)) * 100 : ((e.clientX - r.left) / (r.width || 1)) * 100);
  };
  const toggle = () => setP((v) => (v > 50 ? 0 : 100));
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest(".cmpi-lab")) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    try { stage.current!.setPointerCapture(e.pointerId); } catch { /* a pointer that is gone */ }
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d || d.id !== e.pointerId) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return;
    d.moved = true; setP(fromEvent(e));
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current; if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    try { stage.current!.releasePointerCapture(e.pointerId); } catch { /* a pointer that is gone */ }
    // a tap that did not move toggles between the two pictures
    if (!d.moved && !(e.target as HTMLElement).closest(".cmpi-grip")) toggle();
  };
  const onKey = (e: React.KeyboardEvent) => {
    const big = e.shiftKey ? 10 : 1;
    const dec = ci.vertical ? ["ArrowUp", "ArrowLeft"] : ["ArrowLeft", "ArrowDown"], inc = ci.vertical ? ["ArrowDown", "ArrowRight"] : ["ArrowRight", "ArrowUp"];
    let n: number | null = null;
    if (dec.includes(e.key)) n = p - big; else if (inc.includes(e.key)) n = p + big;
    else if (e.key === "PageDown") n = p - 10; else if (e.key === "PageUp") n = p + 10;
    else if (e.key === "Home") n = 0; else if (e.key === "End") n = 100;
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); return; }
    if (n != null) { e.preventDefault(); setP(clamp(n)); }
  };
  const label = (which: "before" | "after") => { const to = which === "before" ? 100 : 0; return () => setP((v) => (v === to ? start : to)); };
  const rounded = Math.round(p);
  const style = { ["--compare-image-p" as string]: `${p}%`, ...(ci.ratio ? { aspectRatio: ci.ratio.replace(":", " / ") } : {}) } as React.CSSProperties;
  return (
    <div className="cmpi" data-dir={ci.vertical ? "v" : "h"} data-fit={ci.fit} data-fixed={ci.ratio ? "1" : undefined}>
      {data.title && <div className="cmpi-title" data-dh-slot="title">{data.title}</div>}
      <div className="cmpi-stage" ref={stage} style={style} data-dh-slot="stage" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { drag.current = null; }}>
        <img className="cmpi-img cmpi-after" src={after} alt={ci.after.alt} draggable={false} loading="lazy" decoding="async" data-dh-slot="after" />
        <img className="cmpi-img cmpi-before" src={before} alt={ci.before.alt} draggable={false} loading="lazy" decoding="async" data-dh-slot="before" />
        <button type="button" className="cmpi-lab cmpi-lab-before" onClick={label("before")} aria-pressed={p >= 100} data-dh-slot="label-before">{ci.beforeLabel}</button>
        <button type="button" className="cmpi-lab cmpi-lab-after" onClick={label("after")} aria-pressed={p <= 0} data-dh-slot="label-after">{ci.afterLabel}</button>
        <div className="cmpi-bar" aria-hidden="true" data-dh-slot="bar" />
        <div className="cmpi-grip" role="slider" tabIndex={0} aria-label={W.slider} aria-orientation={ci.vertical ? "vertical" : "horizontal"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={rounded}
          aria-valuetext={`${ci.beforeLabel} ${rounded}%, ${ci.afterLabel} ${100 - rounded}%`} onKeyDown={onKey} data-dh-slot="handle">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 6 3 12l6 6M15 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
      </div>
      <div className="cmpi-help" aria-hidden="true">{ci.vertical ? W.helpV : W.helpH}</div>
    </div>
  );
}
