// The venn part's view (format version 11): our own SVG, placed by the pure layout, so the box is the same before and
// after the script runs. A region is a focusable button: hover, tap, focus or Enter opens the one popover card with its
// items; names that do not fit show as `+N`. On a narrow stage the regions are also listed under the figure. Static
// draws one step whole.
import React, { useMemo, useRef, useState } from "react";
import { Budget, partLimitsOf } from "../../core/budget";
import { Stepper, colBase, colInk, cx, newAt, shownAt, stepKeys, usePopover, useSteps } from "../kit/view";
import type { PartViewProps } from "../types";
import { bits, regionText, regionWords, type VennSpec } from "./part";
import { VENN, fitSetLabel, layoutVenn, regionDraw, type RegionDraw } from "./layout";

// a layout made while drawing pays from a budget of its own (made per spec): the page's budget was charged when the
// page was parsed, and a render (every step click) must never spend it
const scratch = () => new Budget(partLimitsOf(), null, null, "the venn part");

export default function VennView({ data: spec, ui, static: stp, stage }: PartViewProps<VennSpec>) {
  void stage;
  const host = useRef<HTMLDivElement>(null);
  const L = useMemo(() => layoutVenn(spec.sets.length, scratch()), [spec.sets.length]);
  const draws = useMemo(() => {
    const b = scratch(), m = new Map<number, RegionDraw>();
    for (const r of spec.regions) { const a = L.anchors.get(r.mask); if (a) m.set(r.mask, regionDraw(spec, r, a, b)); }
    return m;
  }, [spec, L]);
  const n = spec.steps.length, titles = spec.steps.map((s) => s.title), st = useSteps(n, stp, titles), i = st.i;
  const [hot, setHot] = useState<number | null>(null);
  const pop = usePopover(host, ui.close);
  const sets = spec.sets;
  const itemsOf = (mask: number): string[] => {
    const r = spec.regions.find((q) => q.mask === mask)!;
    return r.count != null ? [`${r.count}${r.countWord ? ` ${r.countWord}` : ""}`] : r.items.map((q) => (q.note ? `${q.name} (${q.note})` : q.name));
  };
  return (
    <div className="dh-dg dh-venn dh-pop-host" ref={host} data-dh-static={st.sx.on || undefined} tabIndex={n > 1 ? 0 : undefined} onKeyDown={stepKeys(st, n)}>
      <div className="dh-box" data-dh-slot="box">
        <div className="dh-inner" style={{ minWidth: `${L.minW}px`, maxWidth: `${L.w * 1.4}px` }}>
          <svg className={cx("dh-svg", hot != null && "has-hot")} viewBox={`0 0 ${L.w} ${L.h}`} role="group" aria-label={spec.title || "Venn diagram"} style={{ aspectRatio: `${L.w} / ${L.h}` }}>
            {sets.map((s, k) => {
              if (!shownAt(s.step, i, n)) return null;
              const e = L.shapes[k], inHot = hot != null && (hot & (1 << k)) !== 0;
              const common = { fill: colBase(s.colour), className: cx("venn-set", inHot && "is-in", hot != null && !inHot && "is-dim", newAt(s.step, i, n) && "is-new"), "data-dh-slot": "set" } as any;
              return e.rx === e.ry
                ? <circle key={k} cx={e.cx} cy={e.cy} r={e.rx} stroke={colBase(s.colour)} {...common} />
                : <ellipse key={k} cx={e.cx} cy={e.cy} rx={e.rx} ry={e.ry} transform={`rotate(${(e.rot * 180) / Math.PI} ${e.cx} ${e.cy})`} stroke={colBase(s.colour)} {...common} />;
            })}
            {sets.map((s, k) => { const fl = fitSetLabel(s.label, L.labels[k], L.w); return shownAt(s.step, i, n) && <text key={`l${k}`} x={fl.x} y={L.labels[k].y} textAnchor={fl.anchor} data-dh-slot="set-label" className="venn-set-label" fill={colInk(s.colour)}>{s.label}</text>; })}
            {spec.regions.map((r) => {
              if (!shownAt(r.step, i, n) || !sets.every((s, k) => !(r.mask & (1 << k)) || shownAt(s.step, i, n))) return null;
              const a = L.anchors.get(r.mask), d = draws.get(r.mask);
              if (!a || !d) return null;
              const total = d.lines.length + (d.more ? 1 : 0) + (d.count != null ? (d.word ? 2 : 1) : 0);
              const lh = VENN.lh, y0 = a.y - ((total - 1) * lh) / 2 + 5;
              const title = regionWords(spec, r.mask), items = itemsOf(r.mask);
              const id = `r${r.mask}`;
              const b = pop.bind(id, { title, text: <>{items.map((t, q) => <div key={q}>{t}</div>)}</> });
              return (
                <g key={r.mask} className={cx("venn-region", hot === r.mask && "is-hot", newAt(r.step, i, n) && "is-new")} data-dh-slot="region" role="button" tabIndex={0}
                  aria-label={`${title}: ${items.join(", ")}`} data-pop-id={b["data-pop-id"]} aria-expanded={b["aria-expanded"]}
                  onPointerEnter={(e) => { if (e.pointerType === "mouse") setHot(r.mask); b.onPointerEnter(e); }} onPointerLeave={(e) => { if (e.pointerType === "mouse") setHot(null); b.onPointerLeave(e); }}
                  onFocus={(e) => { setHot(r.mask); b.onFocus(e); }} onBlur={(e) => { setHot(null); b.onBlur(e); }} onClick={b.onClick}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { b.onClick(e as unknown as React.MouseEvent); e.preventDefault(); } }}>
                  <rect x={a.x - a.r * 0.95} y={a.y - a.r * 0.95} width={a.r * 1.9} height={a.r * 1.9} rx={a.r * 0.5} className="venn-hit" />
                  {d.count != null
                    ? <><text x={a.x} y={a.y + (d.word ? -8 : 7)} textAnchor="middle" className="venn-count">{d.count}</text>{d.word && <text x={a.x} y={a.y + 17} textAnchor="middle" className="venn-item" data-dh-slot="item">{d.word}</text>}</>
                    : d.lines.map((l, q) => <text key={q} x={a.x} y={y0 + q * lh} textAnchor="middle" className="venn-item" data-dh-slot="item">{l.text}</text>)}
                  {d.more > 0 && <text x={a.x} y={y0 + d.lines.length * lh} textAnchor="middle" className="venn-more" data-dh-slot="more">+{d.more}</text>}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      <ul className="venn-legend" data-dh-slot="legend">
        {spec.regions.filter((r) => shownAt(r.step, i, n)).sort((a, b) => bits(a.mask) - bits(b.mask)).map((r) => <li key={r.mask}><strong>{regionWords(spec, r.mask)}:</strong> {regionText(r)}</li>)}
      </ul>
      <Stepper n={n} titles={titles} st={st} ui={ui} />
      {pop.node}
    </div>
  );
}
