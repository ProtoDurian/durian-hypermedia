// The compare part's view (format version 11): a matrix of options as columns, a value drawn as a tick, a chip, a bar or
// a word (never colour alone), a note as a button that opens the one popover card. Wide: all options in columns. Narrow
// (under 560 px of stage): the matrix scrolls inside its own box with the criterion column fixed and a shaded edge, or a
// switcher shows one option at a time. Every element is a React element: no HTML string reaches the page.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { usePopover } from "../kit/view";
import type { PartViewProps } from "../types";
import { cssWord } from "../../safety";
import type { Cell, CompareData, Row } from "./part";

/** the part's own words (the renderer's shared words come from `ui`) */
const W = {
  noData: "No data", yes: "Yes", no: "No", partial: "Partial", good: "Good", warn: "Warn", bad: "Bad", comparison: "Comparison", scrolls: "scrolls sideways when wide",
  criterion: "Criterion", pick: "Our pick", best: "best", most: "most", lower: "lower is better", bestRow: "Best in this row", hint: "↔ Swipe the matrix to see all of it",
  view: "How to show the options", all: "All options", one: "One at a time", options: "Options", cannot: "This comparison cannot be drawn:",
};
const word = (k: string) => (W as Record<string, string>)[k] ?? k;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** the stage width under which the matrix is narrow */
export const COMPARE_NARROW = 560;

const Icon = ({ kind }: { kind: "yes" | "no" | "partial" }) => (
  <svg className="cmp-ico" data-k={kind} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <circle cx="8" cy="8" r="7" fill="currentColor" opacity=".16" />
    {kind === "yes" && <path d="M4.6 8.4 7 10.8l4.4-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />}
    {kind === "no" && <path d="M5.4 5.4l5.2 5.2M10.6 5.4l-5.2 5.2" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />}
    {kind === "partial" && <path d="M8 3.2a4.8 4.8 0 0 1 0 9.6z" fill="currentColor" />}
  </svg>
);

function barPct(row: Row, c: Cell): number {
  if (c.num == null) return 0;
  let lo: number, hi: number;
  if (row.scale) { lo = row.scale[0]; hi = row.scale[1]; }
  else { lo = 0; hi = 1e-9; for (const x of row.cells) if (x.num != null) { if (x.num < lo) lo = x.num; if (x.num > hi) hi = x.num; } }
  return hi === lo ? 100 : Math.max(4, Math.min(100, ((c.num - lo) / (hi - lo)) * 100));
}

function Value({ row, cell }: { row: Row; cell: Cell }) {
  if (cell.kind === "none") return <span className="cmp-v cmp-none" data-v="none"><span aria-hidden="true">–</span><span className="cmp-sr">{W.noData}</span></span>;
  if (cell.kind === "bool") return <span className="cmp-v cmp-bool" data-v={cell.text}><Icon kind={cell.text as "yes"} /><span>{word(cell.text)}</span></span>;
  if (cell.kind === "tone") return <span className="cmp-v cmp-tone" data-v={cell.text}><span className="cmp-chip">{word(cell.text)}</span></span>;
  if (cell.kind === "score") return <span className="cmp-v cmp-score"><span className="cmp-num">{cell.text}</span><span className="cmp-bar" aria-hidden="true"><i style={{ width: `${barPct(row, cell)}%` }} /></span></span>;
  return <span className="cmp-v cmp-word">{cell.text}</span>;
}

export default function CompareView({ data, ui, stage }: PartViewProps<CompareData>) {
  const host = useRef<HTMLDivElement>(null), scroller = useRef<HTMLDivElement>(null);
  const compare = data.compare;
  const [view, setView] = useState<"table" | "single">(compare?.view ?? "table");
  const [opt, setOpt] = useState(compare && compare.pick >= 0 ? compare.pick : 0);
  const [edge, setEdge] = useState<"none" | "start" | "mid" | "end">("none");
  const pop = usePopover(host, ui.close);
  const narrow = stage.width > 0 && stage.width < COMPARE_NARROW;
  const single = view === "single" && narrow;
  const measure = useCallback(() => {
    const s = scroller.current;
    if (s) { const max = s.scrollWidth - s.clientWidth; setEdge(max < 3 ? "none" : s.scrollLeft < 3 ? "start" : s.scrollLeft > max - 3 ? "end" : "mid"); }
  }, []);
  useEffect(() => {
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (ro && scroller.current) ro.observe(scroller.current);
    return () => ro?.disconnect();
  }, [measure, single, view, stage.width]);
  if (!compare || data.errors.length) return <div className="cmp"><div className="cw-error">{W.cannot} {data.errors[0]?.msg ?? "it has no options"}</div></div>;
  const { options, rows } = compare;
  const cols = single ? [opt] : options.map((_, i) => i);
  const wins = (i: number) => compare.winner && compare.wins[i] > 0;
  const optStyle = (colour: string) => (colour ? ({ ["--compare-opt" as string]: `var(--${cssWord(colour, "acc")})` } as React.CSSProperties) : undefined);
  const label = `${data.title || W.comparison} (${W.scrolls})`;
  return (
    <div className="cmp dh-pop-host" ref={host} data-view={single ? "single" : "table"} data-narrow={narrow ? "1" : undefined} data-edge={edge}>
      {data.title && <div className="cmp-title" data-dh-slot="title">{data.title}</div>}
      {narrow && options.length > 2 && (
        <div className="cmp-switch" role="group" aria-label={W.view} data-dh-slot="switch">
          <button type="button" aria-pressed={view === "table"} onClick={() => setView("table")}>{W.all}</button>
          <button type="button" aria-pressed={view === "single"} onClick={() => setView("single")}>{W.one}</button>
        </div>
      )}
      {single && (
        <div className="cmp-tabs" role="group" aria-label={W.options} data-dh-slot="tabs">
          {options.map((o, i) => <button type="button" key={i} aria-pressed={i === opt} data-c={o.colour || undefined} onClick={() => setOpt(i)} style={optStyle(o.colour)}>{o.name}</button>)}
        </div>
      )}
      <div className="cmp-wrap">
        <div className="cmp-scroll" ref={scroller} tabIndex={0} role="region" aria-label={label} onScroll={measure} data-dh-slot="scroll">
          <table className="cmp-table" data-dh-slot="table">
            <thead>
              <tr>
                <th scope="col" className="cmp-corner"><span className="cmp-sr">{W.criterion}</span></th>
                {cols.map((i) => {
                  const o = options[i];
                  return (
                    <th scope="col" key={i} className="cmp-opt" data-pick={compare.pick === i ? "1" : undefined} data-most={compare.winner && compare.mostWins === i ? "1" : undefined} data-c={o.colour || undefined} style={optStyle(o.colour)}>
                      {compare.pick === i && <span className="cmp-flag" data-dh-slot="pick">{W.pick}</span>}
                      <span className="cmp-opt-name">{o.name}</span>
                      {wins(i) && <span className="cmp-wins" data-dh-slot="wins">{compare.wins[i]} {W.best}{compare.mostWins === i ? ` · ${W.most}` : ""}</span>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} data-kind={r.kind}>
                  <th scope="row" className="cmp-crit">{r.name}{r.lower && <span className="cmp-lower"> {W.lower}</span>}</th>
                  {cols.map((i) => {
                    const c = r.cells[i], best = compare.winner && r.best.includes(i);
                    const inner = (<><Value row={r} cell={c} />{best && <span className="cmp-star" data-dh-slot="best" title={W.bestRow}><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 1.6l1.9 4.1 4.5.5-3.3 3.1.9 4.4L8 11.5l-4 2.2.9-4.4L1.6 6.2l4.5-.5z" fill="currentColor" /></svg><span className="cmp-sr">{W.bestRow}</span></span>}</>);
                    return (
                      <td key={i} data-best={best ? "1" : undefined} data-pick={compare.pick === i ? "1" : undefined} data-v={c.text}>
                        {c.note ? (
                          <button type="button" className="cmp-note" aria-label={`${options[i].name}, ${r.name}: ${c.text}. ${c.note}`} {...pop.bind(`${ri}:${i}`, { title: `${r.name} · ${options[i].name}`, meta: c.text === "–" ? undefined : cap(c.text), text: c.note })}>{inner}<span className="cmp-i" aria-hidden="true">i</span></button>
                        ) : <div className="cmp-cell">{inner}</div>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {narrow && edge !== "none" && !single && <div className="cmp-hint" aria-hidden="true">{W.hint}</div>}
      {pop.node}
    </div>
  );
}
