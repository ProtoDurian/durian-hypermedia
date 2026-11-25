// The flame part (DESIGN 4.8): a flame chart (a trace) or a flame graph (folded stacks), our own SVG (tools/flame.ts).
// Click or tap a frame to zoom it to the full width (a crumb row zooms back out); a search lights matching frames and says
// their share; hover, tap or focus shows name, self, total and share; arrow keys walk the frames.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { fmtNum, pct, searchFrames, type FlameSpec } from "./part";
import { Budget, BudgetError, partLimitsOf } from "../../core/budget";
import type { PartViewProps, PartStage } from "../types";
import { familyOf } from "../kit/text";
import { colBase, colSoft, colInk, useSteps } from "../kit/view";
const colourVar = (c: string, variant?: string) => variant === "soft" ? colSoft(c) : variant === "ink" ? colInk(c) : colBase(c);
import { usePopover } from "../kit/view";
import { numberOrder } from "./order";
import { W11 } from "./words";
import type { Ui } from "../../ui/ui";

const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
const CH = 6.9; // 12 px mono, about this wide a character

export function Flame({ spec, error, ui, stage, static: stp }: { spec: FlameSpec | null; error: string | null; ui: Ui; stage: PartStage; static?: string | false }) {
  const w = W11(ui);
  const host = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const width = Math.max(240, (stage.width || 760) - (stage.width > 0 && stage.width <= 600 ? 26 : 34));
  const still = useSteps(0, stp).sx.on;
  const [zoom, setZoom] = useState(-1); // the frame zoomed to; -1 is the whole
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(0);
  const pop = usePopover(host, ui.close);
  const selfFrames = useMemo(() => {
    if (!spec) return [];
    const budget = new Budget(partLimitsOf(), null, null, "the flame part");
    for (const f of spec.frames) budget.charge(8 + f.name.length, 2, f.name.length);
    return numberOrder(spec.frames, (f) => -f.self, budget).slice(0, 40);
  }, [spec]);
  const found = useMemo(() => {
    if (!spec || !q.trim()) return { ids: new Set<number>(), total: 0, err: "" };
    try { const r = searchFrames(spec, q, new Budget(partLimitsOf(), null, null, "the flame search")); return { ids: new Set(r.ids), total: r.total, err: "" }; }
    catch (e) { if (e instanceof BudgetError) return { ids: new Set<number>(), total: 0, err: w.tooMuch }; throw e; }
  }, [spec, q]);
  if (!spec || spec.errors.length || !spec.frames.length) return <div className="flame" data-dh-static={still || undefined}><div className="cw-error">{w.cannot} {error || spec?.errors[0]?.msg || "No frames"}</div></div>;
  const phone = width < 560;
  const rowH = phone ? 28 : 24, gap = 1, pitch = rowH + gap;
  const svgW = phone ? Math.max(width, 560) : width;
  const maxDepth = Math.max(...spec.frames.map((f) => f.depth));
  const activeZoom = still ? -1 : zoom;
  const z = activeZoom >= 0 ? spec.frames[zoom] : null;
  const lo = z ? z.start : spec.origin, hi = z ? z.end : spec.origin + spec.span;
  const scale = svgW / Math.max(1e-9, hi - lo);
  const chain: number[] = []; for (let p = activeZoom; p >= 0; p = spec.frames[p].parent) chain.unshift(p);
  const inZoom = (id: number) => { if (!z) return true; for (let p = id; p >= 0; p = spec.frames[p].parent) if (p === activeZoom) return true; return false; };
  const ancestor = (id: number) => chain.includes(id) && id !== activeZoom;
  const total = spec.roots.reduce((a, r) => a + spec.frames[r].total, 0);
  const maxSelf = Math.max(1e-9, ...spec.frames.map((f) => f.self / Math.max(1e-9, f.total)));
  const height = (maxDepth + 1) * pitch + 4;
  const yOf = (depth: number) => (spec.dir === "down" ? depth * pitch + 2 : (maxDepth - depth) * pitch + 2);
  const fill = (f: (typeof spec.frames)[number]) => {
    if (spec.colour === "heat") return `color-mix(in oklab, var(--flame-heat-lo) ${Math.round(100 - (f.self / Math.max(1e-9, f.total) / maxSelf) * 100)}%, var(--flame-heat-hi))`;
    if (f.colour) return colourVar(f.colour, "soft");
    const g = f.name.includes(".") ? f.name.split(".")[0] : "";
    return g ? colourVar(familyOf(hash(g)), "soft") : "var(--flame-frame, var(--acc-softer))";
  };
  const edge = (f: (typeof spec.frames)[number]) => (spec.colour === "heat" ? "var(--line-2)" : f.colour ? colourVar(f.colour) : f.name.includes(".") ? colourVar(familyOf(hash(f.name.split(".")[0]))) : "var(--line-2)");
  const unit = spec.unit ? ` ${spec.unit}` : "";
  const visible = spec.frames.filter((f) => (inZoom(f.id) || ancestor(f.id)) && (ancestor(f.id) || (f.end > lo && f.start < hi)));
  const key = (e: React.KeyboardEvent) => {
    const id = Number((e.target as Element).closest("[data-fid]")?.getAttribute("data-fid") ?? NaN);
    if (!Number.isFinite(id)) return;
    const f = spec.frames[id], sibs = f.parent < 0 ? spec.roots : spec.children[f.parent];
    const at = sibs.indexOf(id), up = spec.dir === "down" ? "ArrowUp" : "ArrowDown", down = spec.dir === "down" ? "ArrowDown" : "ArrowUp";
    let to = -1;
    if (e.key === "ArrowRight") to = sibs[Math.min(sibs.length - 1, at + 1)]; else if (e.key === "ArrowLeft") to = sibs[Math.max(0, at - 1)];
    else if (e.key === up) to = f.parent >= 0 ? f.parent : id; else if (e.key === down) to = spec.children[id][0] ?? id;
    else if (e.key === "Enter" || e.key === " ") { setZoom(id); e.preventDefault(); return; }
    else if (e.key === "Escape" || e.key === "Backspace") { if (zoom >= 0 && !pop.openId) { setZoom(spec.frames[zoom].parent); e.preventDefault(); } return; }
    if (to >= 0) { e.preventDefault(); setFocus(to); requestAnimationFrame(() => (host.current?.querySelector(`[data-fid="${to}"]`) as HTMLElement | null)?.focus()); }
  };
  return (
    <div className={`flame dh-pop-host${phone ? " is-phone" : ""}`} ref={host} data-dh-static={still || undefined}>
      {spec.title && <div className="chart-title">{spec.title}</div>}
      {!still && <div className="flame-bar">
        <nav className="flame-crumbs" data-dh-slot="crumbs" aria-label={w.zoomed}>
          <button type="button" className="flame-crumb" onClick={() => setZoom(-1)} aria-current={zoom < 0 ? "true" : undefined}>{w.root}</button>
          {chain.map((id) => <React.Fragment key={id}><span aria-hidden="true">›</span><button type="button" className="flame-crumb" onClick={() => setZoom(id)} aria-current={id === zoom ? "true" : undefined}>{spec.frames[id].name}</button></React.Fragment>)}
        </nav>
        <label className="flame-search" data-dh-slot="search"><span className="sr-only">{w.search}</span>
          <input type="search" value={q} placeholder={w.search} onChange={(e) => setQ(e.currentTarget.value)} />
        </label>
      </div>
      }
      {q.trim() && <p className="flame-found" aria-live="polite">{found.err || (found.ids.size === 1 ? w.matchOne : w.matches).replace("{n}", String(found.ids.size)).replace("{p}", String(pct(found.total, total)))}</p>}
      <div className="flame-box" ref={box}>
        <svg width={svgW} height={height} viewBox={`0 0 ${svgW} ${height}`} role="group" aria-label={spec.title || "Flame"} onKeyDown={still ? undefined : key}>
          {visible.map((f) => {
            const x0 = ancestor(f.id) ? 0 : Math.max(0, (f.start - lo) * scale), x1 = ancestor(f.id) ? svgW : Math.min(svgW, (f.end - lo) * scale), wd = x1 - x0;
            if (wd < 0.8) return null;
            const dim = ancestor(f.id) || (found.ids.size > 0 && !found.ids.has(f.id));
            const hit = found.ids.has(f.id);
            const d = { title: f.name, meta: `${w.self} ${fmtNum(f.self)}${unit} · ${w.total} ${fmtNum(f.total)}${unit} · ${pct(f.total, total)}%`, text: f.parent >= 0 ? `${pct(f.total, spec.frames[f.parent].total)}% ${w.of} ${spec.frames[f.parent].name}` : "" };
            const room = Math.floor((wd - 8) / CH);
            const label = room >= 3 ? (f.name.length > room ? f.name.slice(0, Math.max(1, room - 1)) + "…" : f.name) : "";
            return (
              <g key={f.id} data-fid={f.id} className={`fl-frame${dim ? " is-dim" : ""}${hit ? " is-hit" : ""}${f.id === zoom ? " is-zoomed" : ""}`} data-dh-slot="frame" role="button" tabIndex={still ? undefined : f.id === focus || (focus >= spec.frames.length && f.id === 0) ? 0 : -1}
                aria-label={`${d.title}: ${d.meta}`} style={{ transform: `translate(${x0}px, ${yOf(f.depth)}px)` }} {...(still ? {} : pop.bind(`f${f.id}`, d))}
                onClick={still ? undefined : (e) => { setFocus(f.id); if (e.detail >= 0) setZoom(f.id); (pop.bind(`f${f.id}`, d) as any).onClick(e); }}>
                <rect width={wd} height={rowH} rx={3} fill={fill(f)} stroke={edge(f)} strokeWidth={hit ? 2 : 1} style={{ width: wd }} className="fl-rect" />
                {label && <text x={5} y={rowH / 2} dominantBaseline="central" className="fl-label" data-dh-slot="frame-label">{label}</text>}
              </g>
            );
          })}
        </svg>
      </div>
      {!still && <p className="part-hint">{w.flameHint}{phone ? ` ${w.hintFlame}` : ""}</p>}
      <details className="chart-table"><summary>{ui.table}</summary>
        <div className="table-wrap"><table><thead><tr><th>Frame</th><th>{w.self}</th><th>{w.total}</th><th>{w.share}</th></tr></thead>
          <tbody>{selfFrames.map((f) => <tr key={f.id}><th>{f.name}</th><td>{fmtNum(f.self)}</td><td>{fmtNum(f.total)}</td><td>{pct(f.total, total)}%</td></tr>)}</tbody></table></div>
      </details>
      {!still && pop.node}
    </div>
  );
}

export default function FlameView({ data, ui, stage, static: stp }: PartViewProps<FlameSpec>) { return <Flame spec={data} error={null} ui={ui} stage={stage} static={stp} />; }
