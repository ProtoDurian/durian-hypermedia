// A glossary term in the text (format version 11): a button with a dotted underline; hover (after a short wait, mouse only),
// focus-and-Enter or a tap opens one card with the meaning, "All terms" (when the page has a glossary block) and Copy. Esc or a tap
// outside closes it and gives the focus back; Tab goes into the card and back. On a phone the card is a sheet at the bottom.
// The card is drawn into the document's own root (so its stylesheet reaches it), by a portal, only after a reader opened it.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { InlineViewProps } from "../inline";
import type { TermUse } from "./inline";
import { Segs } from "./segs";

/** the part's own words */
const W = { all: "All terms", copy: "Copy", copied: "Copied", failed: "Copy failed", meaning: "Meaning of a term", also: "also" };
/** the width under which the card is a sheet at the bottom of the screen */
const SHEET_W = 640;
const HOVER_MS = 150, LEAVE_MS = 250;

// one card at a time on a page: a term that opens tells the one that was open to close
let closeOpen: (() => void) | null = null;

export default function GlossaryInline({ text, data }: InlineViewProps<TermUse>) {
  const mark = useRef<HTMLButtonElement>(null), card = useRef<HTMLDivElement>(null), timer = useRef(0), leave = useRef(0);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | "sheet">("sheet");
  const [copy, setCopy] = useState<string>(W.copy);
  const id = useRef(`dh-term-${Math.random().toString(36).slice(2, 8)}`).current;

  const close = useCallback(() => { clearTimeout(timer.current); clearTimeout(leave.current); setOpen(false); }, []);
  const place = useCallback(() => {
    const m = mark.current, c = card.current;
    if (!m) return;
    if (window.innerWidth <= SHEET_W) { setPos("sheet"); return; }
    const r = m.getBoundingClientRect(), w = c?.offsetWidth ?? 320, h = c?.offsetHeight ?? 120;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    const below = r.bottom + 8 + h <= window.innerHeight || r.top - 8 - h < 0;
    setPos({ left, top: below ? r.bottom + 8 : r.top - 8 - h });
  }, []);
  const show = useCallback(() => {
    clearTimeout(leave.current);
    if (closeOpen && closeOpen !== close) closeOpen();
    closeOpen = close;
    setOpen(true);
  }, [close]);
  useEffect(() => { if (open) place(); }, [open, place]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { close(); mark.current?.focus(); } };
    const down = (e: PointerEvent) => { const t = e.target as Node; if (card.current?.contains(t) || mark.current?.contains(t)) return; close(); };
    const move = () => place();
    document.addEventListener("keydown", key); document.addEventListener("pointerdown", down, true);
    window.addEventListener("resize", move); window.addEventListener("scroll", move, true);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("pointerdown", down, true); window.removeEventListener("resize", move); window.removeEventListener("scroll", move, true); if (closeOpen === close) closeOpen = null; };
  }, [open, close, place]);
  useEffect(() => () => { clearTimeout(timer.current); clearTimeout(leave.current); }, []);

  const host = typeof document !== "undefined" && open ? (mark.current?.closest(".dh-doc") ?? document.body) : null;
  const copyIt = async () => {
    try { await navigator.clipboard.writeText(`${data.label}: ${data.plain}`); setCopy(W.copied); } catch { setCopy(W.failed); }
    window.setTimeout(() => setCopy(W.copy), 1500);
  };
  const cardKeys = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const items = [...(card.current?.querySelectorAll<HTMLElement>("a, button") ?? [])], i = items.indexOf(document.activeElement as HTMLElement);
    if ((e.shiftKey && i <= 0) || (!e.shiftKey && i === items.length - 1)) { e.preventDefault(); mark.current?.focus(); }
  };
  return (
    <>
      <button ref={mark} type="button" className="glossary-term" data-term={data.id} data-dh-slot="term" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
        onPointerEnter={(e) => { if (e.pointerType === "touch") return; clearTimeout(timer.current); timer.current = window.setTimeout(show, HOVER_MS); }}
        onPointerLeave={() => { clearTimeout(timer.current); leave.current = window.setTimeout(() => { if (!card.current?.matches(":hover")) close(); }, LEAVE_MS); }}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => { if (e.key === "Tab" && !e.shiftKey && open) { const first = card.current?.querySelector<HTMLElement>("a, button"); if (first) { e.preventDefault(); first.focus(); } } }}>{text}</button>
      {host && createPortal(
        <div ref={card} id={id} className={`dh-pop glossary-card${pos === "sheet" ? " dh-pop-sheet" : ""}`} role="dialog" aria-label={W.meaning} data-dh-slot="popover"
          style={pos === "sheet" ? { position: "fixed" } : { position: "fixed", left: pos.left, top: pos.top }}
          onKeyDown={cardKeys} onPointerEnter={() => clearTimeout(leave.current)}
          onPointerLeave={(e) => { if (e.pointerType !== "touch") leave.current = window.setTimeout(close, LEAVE_MS); }}>
          <div className="dh-pop-title">{data.label}</div>
          {data.also.length > 0 && <div className="dh-pop-meta">{W.also}: {data.also.join(", ")}</div>}
          <p className="dh-pop-text glossary-def"><Segs segs={data.segs} /></p>
          <div className="dh-pop-actions">
            {data.link && <a href={data.link} className="dh-pop-act">{W.all}</a>}
            <button type="button" className="dh-pop-act" onClick={copyIt}>{copy}</button>
          </div>
        </div>, host)}
    </>
  );
}
