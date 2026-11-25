// A citation mark in the text (format version 11): `(Smith & Lee, 2020)` or `[1]`, each cite a button. Hover (after a short wait, mouse
// only), focus-and-Enter or a tap opens one card with the entry (title line, the formatted reference, "Open source" and Copy). Esc or a
// tap outside closes it and gives the focus back; Tab goes into the card and back. On a phone the card is a sheet at the bottom.
// The card is drawn into the document's own root (so its stylesheet reaches it), by a portal, only after a reader opened it.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { InlineViewProps } from "../inline";
import type { CiteMark, CiteUse } from "./inline";

/** the part's own words */
const W = { open: "Open source", copy: "Copy", copied: "Copied", failed: "Copy failed", entry: "Reference" };
const SHEET_W = 640, HOVER_MS = 150, LEAVE_MS = 250;
// one card at a time on a page: a mark that opens tells the one that was open to close
let closeOpen: (() => void) | null = null;

function Mark({ use }: { use: CiteUse }) {
  const mark = useRef<HTMLButtonElement>(null), card = useRef<HTMLDivElement>(null), timer = useRef(0), leave = useRef(0);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | "sheet">("sheet");
  const [copy, setCopy] = useState<string>(W.copy);
  const cardId = `${use.id}-card`;
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
  const show = useCallback(() => { clearTimeout(leave.current); if (closeOpen && closeOpen !== close) closeOpen(); closeOpen = close; setOpen(true); }, [close]);
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
    try { await navigator.clipboard.writeText(use.card.plain); setCopy(W.copied); } catch { setCopy(W.failed); }
    window.setTimeout(() => setCopy(W.copy), 1500);
  };
  const cardKeys = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const items = [...(card.current?.querySelectorAll<HTMLElement>("a, button") ?? [])], i = items.indexOf(document.activeElement as HTMLElement);
    if ((e.shiftKey && i <= 0) || (!e.shiftKey && i === items.length - 1)) { e.preventDefault(); mark.current?.focus(); }
  };
  return (
    <>
      <button ref={mark} type="button" id={use.id} className="cite-mark" data-cite={use.key} data-dh-slot="cite" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? cardId : undefined}
        onPointerEnter={(e) => { if (e.pointerType === "touch") return; clearTimeout(timer.current); timer.current = window.setTimeout(show, HOVER_MS); }}
        onPointerLeave={() => { clearTimeout(timer.current); leave.current = window.setTimeout(() => { if (!card.current?.matches(":hover")) close(); }, LEAVE_MS); }}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => { if (e.key === "Tab" && !e.shiftKey && open) { const first = card.current?.querySelector<HTMLElement>("a, button"); if (first) { e.preventDefault(); first.focus(); } } }}>{use.label}</button>
      {host && createPortal(
        <div ref={card} id={cardId} className={`dh-pop cite-card${pos === "sheet" ? " dh-pop-sheet" : ""}`} role="dialog" aria-label={W.entry} data-dh-slot="popover"
          style={pos === "sheet" ? { position: "fixed" } : { position: "fixed", left: pos.left, top: pos.top }}
          onKeyDown={cardKeys} onPointerEnter={() => clearTimeout(leave.current)}
          onPointerLeave={(e) => { if (e.pointerType !== "touch") leave.current = window.setTimeout(close, LEAVE_MS); }}>
          <div className="dh-pop-title">{use.label}</div>
          <p className="dh-pop-text cite-entry">{use.card.segs.map((s, k) => (s.href ? <a key={k} href={s.href} rel="noreferrer">{s.t}</a> : s.i ? <i key={k}>{s.t}</i> : <React.Fragment key={k}>{s.t}</React.Fragment>))}</p>
          <div className="dh-pop-actions">
            {use.card.link && <a href={use.card.link} className="dh-pop-act" rel="noreferrer">{W.open}</a>}
            <button type="button" className="dh-pop-act" onClick={copyIt}>{copy}</button>
          </div>
        </div>, host)}
    </>
  );
}

export default function ReferencesInline({ data, text }: InlineViewProps<CiteMark>) {
  if (!data.cites.length) return <>{text}</>;
  const marks = data.cites.map((c, k) => <React.Fragment key={c.id}>{k > 0 && (data.style === "ieee" ? "], [" : "; ")}<Mark use={c} /></React.Fragment>);
  return <span className="cite" data-dh-slot="cite-group">{data.style === "ieee" ? "[" : "("}{marks}{data.style === "ieee" ? "]" : ")"}</span>;
}
