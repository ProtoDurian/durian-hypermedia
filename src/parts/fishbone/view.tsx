// The fishbone part's view (format version 11): our own SVG, placed by the pure layout, so the box is the same before
// and after the script runs; a step changes what is shown, never the size. Wide: the spine runs left to right; under
// 600 px of stage it runs top to bottom with the head at the bottom. Static draws one step whole.
import React, { useMemo } from "react";
import { Budget, partLimitsOf } from "../../core/budget";
import { Lines, Stepper, colBase, colSoft, cx, newAt, shownAt, stepKeys, useSteps } from "../kit/view";
import type { PartViewProps } from "../types";
import type { Ui } from "../../ui/ui";
import type { FishSpec } from "./part";
import { FISH, chipHeight, layoutFish } from "./layout";

// a layout made while drawing pays from a budget of its own (made per spec): the page's budget was charged when the
// page was parsed, and a render (every step click) must never spend it
const scratch = () => new Budget(partLimitsOf(), null, null, "the fishbone part");

function FishSvg({ spec, mode, i, n }: { spec: FishSpec; mode: "wide" | "narrow"; i: number; n: number; ui: Ui }) {
  const L = useMemo(() => layoutFish(spec, mode, scratch()), [spec, mode]), f = FISH.font, lh = FISH.lh;
  const lit = new Set(spec.highlights.filter((h) => n < 2 || h.step === i).map((h) => h.category));
  return (
    <svg className={cx("dh-svg fish-svg", `fish-${mode}`)} viewBox={`0 0 ${L.w} ${L.h}`} role="img" aria-label={spec.title || "Fishbone diagram"} style={{ aspectRatio: `${L.w} / ${L.h}`, minWidth: `${L.minW}px` }}>
      <line x1={L.spine[0]} y1={L.spine[1]} x2={L.spine[2]} y2={L.spine[3]} className="fish-spine" data-dh-slot="spine" />
      <g data-dh-slot="head" className="fish-head"><rect x={L.head.x} y={L.head.y} width={L.head.w} height={L.head.h} rx={8} /><Lines lines={L.head.lines} x={L.head.x + L.head.w / 2} y={L.head.y + 16 + f - 4} lh={lh} /></g>
      {L.bones.map((b) => {
        const c = spec.categories[b.cat];
        if (!shownAt(c.step, i, n)) return null;
        const ch = chipHeight(b.chip.text.length), cxw = mode === "wide" ? b.chip.x - b.chip.w / 2 : b.chip.x, cy = mode === "wide" ? (b.side === -1 ? b.chip.y - ch : b.chip.y) : b.chip.y;
        return (
          <g key={b.cat} className={cx("fish-bone", lit.has(b.cat) && "is-lit", newAt(c.step, i, n) && "is-new")} style={{ ["--fc" as any]: colBase(c.colour) }}>
            <line x1={b.x0} y1={b.y0} x2={b.x1} y2={b.y1} className="fish-line" data-dh-slot="bone" />
            <g data-dh-slot="category" className="fish-cat"><rect x={cxw} y={cy} width={b.chip.w} height={ch} rx={12} fill={colSoft(c.colour)} stroke={colBase(c.colour)} />
              <Lines lines={b.chip.text} x={cxw + b.chip.w / 2} y={cy + f + 3} lh={lh} cls="fish-cat-text" /></g>
            {b.causes.map((ca, q) => shownAt(ca.step, i, n) && (
              <g key={q} data-dh-slot="cause" className={cx("fish-cause", newAt(ca.step, i, n) && "is-new")}>
                <line x1={ca.tx} y1={ca.by} x2={mode === "wide" ? ca.tx + 12 : (b.side === -1 ? ca.tx + 12 : ca.tx - 12)} y2={ca.by} className="fish-tick" />
                <Lines lines={ca.lines} x={mode === "wide" ? ca.tx - 4 : ca.x} y={ca.y + f - 2} lh={lh} anchor={mode === "wide" ? "end" : "start"} />
                {ca.subs.map((sc, z) => shownAt(sc.step, i, n) && <Lines key={z} lines={sc.lines.map((t, zz) => (zz ? t : `· ${t}`))} x={mode === "wide" ? ca.tx - 4 : ca.x + 8} y={sc.y + f - 2} lh={lh} anchor={mode === "wide" ? "end" : "start"} cls="fish-sub" />)}
              </g>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/** The stage width under which the spine turns vertical. */
export const FISH_NARROW = 600;

export default function FishboneView({ data: spec, ui, static: stp, stage }: PartViewProps<FishSpec>) {
  const n = spec.steps.length, titles = spec.steps.map((s) => s.title), st = useSteps(n, stp, titles), i = st.i;
  const minW = useMemo(() => layoutFish(spec, "wide", scratch()).minW, [spec]);
  // before the first measure (the server's HTML) both shapes are drawn and CSS shows one; after it, only the one that fits
  const mode = stage.width === 0 ? null : stage.width < FISH_NARROW ? "narrow" : "wide";
  return (
    <div className="dh-dg dh-fish" data-dh-static={st.sx.on || undefined} tabIndex={n > 1 ? 0 : undefined} onKeyDown={stepKeys(st, n)}>
      {mode !== "narrow" && <div className="dh-box fish-wide" data-dh-slot="box"><div className="dh-inner" style={{ minWidth: `${minW}px` }}><FishSvg spec={spec} mode="wide" i={i} n={n} ui={ui} /></div></div>}
      {mode !== "wide" && <div className="dh-box fish-narrow" data-dh-slot="box"><div className="dh-inner"><FishSvg spec={spec} mode="narrow" i={i} n={n} ui={ui} /></div></div>}
      <Stepper n={n} titles={titles} st={st} ui={ui} />
    </div>
  );
}
