// The one hover card of every folder part (from the chart family's, DESIGN 2.3): a title line, an optional meta line, the
// text, at most two actions. It opens on hover (after a short wait), on focus, and on tap or Enter; Esc or a tap outside
// closes it. In a narrow part it is a sheet at the bottom of the part. Tokens --pop-*; slot data-dh-slot="popover".
import React, { useCallback, useEffect, useRef, useState } from "react";

export type PopData = { title: string; meta?: string; text?: React.ReactNode; actions?: { label: string; href?: string; copy?: string; run?: () => void }[] };
type Open = { id: string; data: PopData; x: number; y: number; w: number; h: number } | null;

/** `host` is the part's own box (position: relative); the card sits inside it */
export function usePopover(host: React.RefObject<HTMLElement | null>, closeLabel = "Close") {
  const [open, setOpen] = useState<Open>(null);
  const timer = useRef<number>(0);
  const card = useRef<HTMLDivElement>(null);
  const openId = useRef<string | null>(null);
  const openedAt = useRef(0);
  openId.current = open?.id ?? null;
  const clear = () => { clearTimeout(timer.current); };
  const show = useCallback((id: string, data: PopData, anchor: Element) => {
    const hb = host.current?.getBoundingClientRect(), ab = anchor.getBoundingClientRect();
    if (!hb) return;
    openedAt.current = Date.now();
    setOpen({ id, data, x: ab.left - hb.left + ab.width / 2, y: ab.top - hb.top, w: hb.width, h: hb.height });
  }, [host]);
  const showAt = useCallback((id: string, data: PopData, at: {x:number;y:number}) => {
    const box = host.current?.getBoundingClientRect(); if (!box) return;
    openedAt.current = Date.now(); setOpen({id,data,...at,w:box.width,h:box.height});
  },[host]);
  const hide = useCallback(() => { clear(); setOpen(null); }, []);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { hide(); } };
    const down = (e: PointerEvent) => { const t = e.target as Node; if (card.current?.contains(t)) return; if ((t as Element).closest?.("[data-pop-id]")) return; hide(); };
    document.addEventListener("keydown", key); document.addEventListener("pointerdown", down, true);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("pointerdown", down, true); };
  }, [open?.id, hide]);
  useEffect(() => () => clear(), []);
  /** props for the thing that opens the card */
  const bind = (id: string, data: PopData, at?: {x:number;y:number}) => ({
    "data-pop-id": id,
    "aria-expanded": open?.id === id,
    onPointerEnter: (e: React.PointerEvent) => { if (e.pointerType !== "mouse") return; clear(); const el = e.currentTarget; timer.current = window.setTimeout(() => at ? showAt(id,data,at) : show(id, data, el), 150); },
    onPointerLeave: (e: React.PointerEvent) => { if (e.pointerType !== "mouse") return; clear(); timer.current = window.setTimeout(() => { if (openId.current === id) hide(); }, 160); },
    onFocus: (e: React.FocusEvent) => at ? showAt(id,data,at) : show(id, data, e.currentTarget),
    onBlur: (e: React.FocusEvent) => { const to = e.relatedTarget as Node | null; if (to && card.current?.contains(to)) return; if (openId.current === id) hide(); },
    onClick: (e: React.MouseEvent) => { if (openId.current === id && Date.now() - openedAt.current > 500) hide(); else if(at)showAt(id,data,at);else show(id, data, e.currentTarget); }, // a click that follows the focus which just opened it keeps it open
  });
  const phone = typeof window !== "undefined" && open ? open.w < 560 : false;
  const node = open ? (
    <div ref={card} className={`dh-pop${phone ? " dh-pop-sheet" : ""}`} data-dh-slot="popover" role="group" aria-label={open.data.title}
      style={phone ? undefined : placed(open)}
      onPointerEnter={() => clear()} onPointerLeave={(e) => { if (e.pointerType === "mouse") { clear(); timer.current = window.setTimeout(hide, 160); } }}>
      <div className="dh-pop-title">{open.data.title}</div>
      {open.data.meta && <div className="dh-pop-meta">{open.data.meta}</div>}
      {open.data.text && <div className="dh-pop-text">{open.data.text}</div>}
      {(open.data.actions?.length || phone) ? (
        <div className="dh-pop-actions">
          {open.data.actions?.slice(0, 2).map((a, k) => a.href ? <a key={k} className="dh-pop-act" href={a.href}>{a.label}</a> : <button key={k} type="button" className="dh-pop-act" onClick={() => { if (a.run) { a.run(); return; } try { navigator.clipboard?.writeText(a.copy ?? a.label); } catch {} }}>{a.label}</button>)}
          {phone && <button type="button" className="dh-pop-act dh-pop-close" onClick={hide}>{closeLabel}</button>}
        </div>
      ) : null}
    </div>
  ) : null;
  return { bind, node, hide, showAt, openId: open?.id ?? null };
}
const CARD_W = 300;
function placed(o: NonNullable<Open>): React.CSSProperties {
  const w = Math.min(CARD_W, o.w - 16);
  const left = Math.max(8, Math.min(o.w - w - 8, o.x - w / 2));
  // above the anchor when there is room, else below it
  const above = o.y > 130;
  return above ? { left, width: w, bottom: o.h - o.y + 8 } : { left, width: w, top: o.y + 34 };
}
