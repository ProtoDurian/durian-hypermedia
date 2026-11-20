// The prose containers: :::tabs, :::accordion and :::human. Their content is any blocks, drawn by the same renderer.
import React, { useState } from "react";
import { Blocks } from "./document";
import { useDh } from "./context";
import type { TabsBlock, AccordionBlock, HumanBlock } from "../types";

export function TabsPart({ block }: { block: TabsBlock }) {
  const [i, setI] = useState(0);
  const tabs = block.items;
  const go = (k: number, focus: boolean) => { const n = (k + tabs.length) % tabs.length; setI(n); if (focus && typeof document !== "undefined") document.getElementById(`${tabs[n].id}-t`)?.focus(); };
  return (
    <div className="tabs">
      <div className="tab-bar" role="tablist">
        {tabs.map((t, k) => (
          <button key={k} type="button" role="tab" id={`${t.id}-t`} aria-controls={`${t.id}-p`} aria-selected={k === i} tabIndex={k === i ? 0 : -1}
            onClick={() => setI(k)} onKeyDown={(e) => { if (e.key === "ArrowRight") { go(i + 1, true); e.preventDefault(); } if (e.key === "ArrowLeft") { go(i - 1, true); e.preventDefault(); } }}>{t.title}</button>
        ))}
      </div>
      {tabs.map((t, k) => <div key={k} role="tabpanel" className="tab-panel" id={`${t.id}-p`} aria-labelledby={`${t.id}-t`} hidden={k !== i}><Blocks blocks={t.body} /></div>)}
    </div>
  );
}
export function AccordionPart({ block }: { block: AccordionBlock }) {
  return <div className="accordion">{block.items.map((it, k) => <details key={k} className="acc-item" id={it.id}><summary>{it.title}</summary><div className="acc-body"><Blocks blocks={it.body} /></div></details>)}</div>;
}
export function HumanPart({ block }: { block: HumanBlock }) {
  const { ui, llmPeek } = useDh();
  return (
    <section className="human" id={block.id ?? undefined}>
      <div className="human-tag"><span className="human-chip">{ui.forPeople}</span><span>{block.llm ? ui.llmShort : ui.llmSkips}</span></div>
      <Blocks blocks={block.body} />
      {block.llm && llmPeek ? <details className="llm-peek"><summary>{ui.llmInstead}</summary><pre className="pane-llm">{block.llm}</pre></details> : null}
    </section>
  );
}
