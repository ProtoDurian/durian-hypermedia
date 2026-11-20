// Synced from the Durian Hypermedia sources by scripts/sync.ts: edit the source, not this copy.
// The tier list part (format version 8): rows of chips, one row per tier. Rendered to HTML at build time and
// hydrated in the browser, where a tap (or hover) on an item with a note shows the note under the list.
import React, { useState } from "react";
import type { Item, TierSpec } from "../core/tier";
import type { Ui } from "./ui";

export type Picked = { name: string; note: string } | null;
// one chip: a button when it has a note (tap shows it), a plain label when it has not
export function Chip({ it, picked, pick, className = "" }: { it: Item; picked: Picked; pick: (p: Picked) => void; className?: string }) {
  if (!it.note) return <span className={`dh-chip ${className}`}>{it.name}</span>;
  const on = picked?.name === it.name;
  return (
    <button type="button" className={`dh-chip has-note ${on ? "is-on" : ""} ${className}`} title={it.note} 
      onClick={() => pick({ name: it.name, note: it.note })}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") pick({ name: it.name, note: it.note }); }}
      onFocus={() => pick({ name: it.name, note: it.note })}>{it.name}</button>
  );
}
export function NoteBar({ picked, any, ui }: { picked: Picked; any: boolean; ui: Ui }) {
  if (!any) return null;
  return <div className="dh-note" aria-live="polite">{picked ? <><b>{picked.name}</b> {picked.note}</> : <span className="dh-note-hint">{ui.tapNote}</span>}</div>;
}

export function TierList({ spec, ui }: { spec: TierSpec; ui: Ui }) {
  const [picked, pick] = useState<Picked>(null);
  const any = spec.tiers.some((t) => t.items.some((i) => i.note));
  return (
    <div className="tl" style={{ "--lw": `${Math.min(14, Math.max(1, ...spec.tiers.map((t) => t.name.length)))}ch` } as React.CSSProperties}>
      {spec.title ? <div className="tl-title">{spec.title}</div> : null}
      {spec.tiers.map((t) => (
        <div key={t.name} className={`tl-row tone-${t.colour}`} role="group" aria-label={t.name}>
          <div className="tl-label">{t.name}</div>
          <div className="tl-items">{t.items.map((it) => <Chip key={it.name} it={it} picked={picked} pick={pick} />)}</div>
        </div>
      ))}
      <NoteBar picked={picked} any={any} ui={ui} />
    </div>
  );
}
