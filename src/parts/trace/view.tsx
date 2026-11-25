// The trace part (DESIGN 12.1): the spans of one request as a waterfall, our own SVG, sharing the flame part's code
// (popover card, colours, search, number words, and the Flame view itself). Fold a span with its arrow; search by name,
// service or value; drag over the mini map to zoom a stretch; hover, tap or focus a span for its card (attributes, logs);
// a `log` part on the same page whose lines carry trace= and span= fields links both ways.
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { fmtLen, lenOf, searchSpans, traceToFlame, type Span, type TraceSpec } from "./part";
import { fmtNum, pct } from "../flame/part";
import { lengthSpot } from "./layout";
import { Budget, BudgetError, partLimitsOf } from "../../core/budget";
import type { PartViewProps, PartStage } from "../types";
import { colBase, colSoft, colInk, useSteps } from "../kit/view";
const colourVar = (c: string, variant?: string) => variant === "soft" ? colSoft(c) : variant === "ink" ? colInk(c) : colBase(c);
import { usePopover } from "../kit/view";
import { Flame } from "../flame/view";
import { W11 } from "../flame/words";
import type { Ui } from "../../ui/ui";

const en = {
  waterfall: "Waterfall", flame: "Flame", view: "View", search: "Search spans", matches: "{n} spans match · {t} · {p}% of the trace",
  foldAll: "Fold all", unfoldAll: "Unfold all", zoomIn: "Zoom in", zoomOut: "Zoom out", resetZoom: "Show all", critical: "Critical path", services: "Services",
  minimap: "The whole trace. Drag to zoom a stretch; arrow keys move it, plus and minus zoom.", showing: "Showing", fold: "Fold", unfold: "Unfold", hint: "Hover, tap or focus a span for its card.", swipe: "↔ Swipe the chart to see all of it",
  onPath: "On the critical path: the end waited for it", ranFor: "ran for", self: "self", attrs: "Attributes", logs: "Logs", noLogs: "No logs", showLog: "Show in the log", copyName: "Copy name", error: "Error",
  trace: "Trace", tooMuch: "This part needs more work than a page may use, so it is drawn as its source.", cannot: "This part cannot be drawn:", of: "of the trace", hidden: "hidden",
};
const T = (ui: Ui): typeof en => ({ ...en, ...((ui as any).wTrace ?? {}) });
const linkOwners = new WeakMap<HTMLElement, Set<symbol>>();
const CH = 6.9; // 12 px mono, about this wide a character
const LEVEL_VAR: Record<string, string> = { debug: "var(--trace-log-debug)", info: "var(--trace-log-info)", warn: "var(--trace-log-warn)", error: "var(--trace-log-error)" };
const niceStep = (range: number, target: number) => {
  const raw = range / Math.max(1, target), p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
  return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
};
const fit = (s: string, room: number) => (room < 3 ? "" : s.length > room ? s.slice(0, Math.max(1, room - 1)) + "…" : s);

export function TraceView({ spec, error, ui, stage, static: stp }: { spec: TraceSpec | null; error: string | null; ui: Ui; stage: PartStage; static?: string | false }) {
  const w = T(ui), w11 = W11(ui);
  const host = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const mini = useRef<SVGSVGElement>(null);
  const clipId = useId().replace(/:/g, "");
  const width = Math.max(240, (stage.width || 760) - (stage.width > 0 && stage.width <= 600 ? 26 : 34));
  const still = useSteps(0, stp).sx.on;
  const [barH, setBarH] = useState(18);
  const [view, setView] = useState<"waterfall" | "flame">("waterfall");
  const [q, setQ] = useState("");
  const [folded, setFolded] = useState<Set<number>>(() => {
    const s = new Set<number>();
    if (spec && spec.open > 0) for (const sp of spec.spans) if (sp.depth === spec.open - 1 && spec.children[sp.id].length) s.add(sp.id);
    return s;
  });
  const [range, setRange] = useState<[number, number] | null>(null);
  const [focus, setFocus] = useState(0);
  const [sel, setSel] = useState(-1);
  const [svcOn, setSvcOn] = useState<string | null>(null);
  const [crit, setCrit] = useState(spec ? spec.critical : true);
  const [linked, setLinked] = useState<Record<string, number>>({});
  const [pending, setPending] = useState(-1);
  const pop = usePopover(host, ui.close);
  const drag = useRef<null | { mode: "new" | "move" | "left" | "right"; t0: number; r0: [number, number] }>(null);

  useEffect(() => {
    if (!host.current) return;
    const v = parseFloat(getComputedStyle(host.current).getPropertyValue("--trace-bar-h"));
    if (Number.isFinite(v) && v >= 8) setBarH(v);
  }, []);

  // the log part(s) on the same page: lines whose span= (and trace=, when both name one) belong to a span
  const keyOf = useMemo(() => { const m = new Map<string, number>(); if (spec) for (const s of spec.spans) { if (!m.has(s.key)) m.set(s.key, s.id); if (!m.has(s.name)) m.set(s.name, s.id); } return m; }, [spec]);
  const logLines = useCallback((id: number): HTMLElement[] => {
    if (!spec || typeof document === "undefined") return [];
    const span = spec.spans[id];
    return Array.from((host.current?.closest('.dh-doc') ?? host.current)?.querySelectorAll<HTMLElement>('[data-dh-part="log"] [data-span]') ?? []).filter((li) => (li.dataset.span === span.key || li.dataset.span === span.name) && (!li.dataset.trace || !spec.trace || li.dataset.trace === spec.trace));
  }, [spec]);
  useEffect(() => {
    const root = host.current?.closest(".dh-doc"); if (!spec || !root || still) return;
    let marked = new Set<HTMLElement>();
    const owner = Symbol("trace link");
    const release = (li: HTMLElement) => { const owners = linkOwners.get(li); owners?.delete(owner); if (!owners?.size) { linkOwners.delete(li); li.removeAttribute("data-trace-linked"); } };
    const scan = () => {
      const found: Record<string, number> = {}, next = new Set<HTMLElement>();
      for (const li of root.querySelectorAll<HTMLElement>('[data-dh-part="log"] [data-span]')) {
        if (li.dataset.trace && spec.trace && li.dataset.trace !== spec.trace) continue;
        const id = keyOf.get(li.dataset.span ?? ""); if (id === undefined) continue;
        found[id] = (found[id] ?? 0) + 1; let owners = linkOwners.get(li); if (!owners) linkOwners.set(li, owners = new Set()); owners.add(owner); li.setAttribute("data-trace-linked", "1"); next.add(li);
      }
      for (const li of marked) if (!next.has(li)) release(li);
      marked = next; setLinked(found);
    };
    scan();
    const observer = new MutationObserver(scan);
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-span", "data-trace"] });
    return () => { observer.disconnect(); for (const li of marked) release(li); };
  }, [spec, keyOf, still]);
  const showInLog = (id: number) => {
    const lines = logLines(id); if (!lines.length) return;
    pop.hide();
    const li = lines[0];
    li.scrollIntoView?.({ block: "center" }); li.focus?.({ preventScroll: true });
    lines.forEach((l) => l.setAttribute("data-linked", "1"));
    setTimeout(() => lines.forEach((l) => l.removeAttribute("data-linked")), 2600);
  };
  // a log line's "Show span": open that span's card
  useEffect(() => {
    if (!spec || still) return;
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail as { trace?: string; span?: string };
      if (!d?.span || (d.trace && spec.trace && d.trace !== spec.trace)) return;
      const id = keyOf.get(d.span); if (id === undefined) return;
      setView("waterfall"); setQ(""); setSvcOn(null);
      setFolded((f) => { const n = new Set(f); for (let p = spec.spans[id].parent; p >= 0; p = spec.spans[p].parent) n.delete(p); return n; });
      setRange((r) => (r && (spec.spans[id].end < r[0] || spec.spans[id].start > r[1]) ? null : r));
      setPending(id);
      host.current?.scrollIntoView?.({ block: "nearest" });
    };
    document.addEventListener("dh-trace-focus", on);
    return () => document.removeEventListener("dh-trace-focus", on);
  }, [spec, keyOf, still]);
  useEffect(() => {
    if (pending < 0) return;
    const el = host.current?.querySelector<SVGElement>(`[data-sid="${pending}"]`) as unknown as HTMLElement | null;
    if (el) { setFocus(pending); setSel(pending); el.scrollIntoView?.({ block: "nearest", inline: "nearest" }); el.focus(); setPending(-1); }
  });

  const found = useMemo(() => {
    if (!spec || !q.trim()) return { ids: new Set<number>(), total: 0, err: "" };
    try { const r = searchSpans(spec, q, new Budget(partLimitsOf(), null, null, "the trace search")); return { ids: new Set(r.ids), total: r.total, err: "" }; }
    catch (e) { if (e instanceof BudgetError) return { ids: new Set<number>(), total: 0, err: w11.tooMuch }; throw e; }
  }, [spec, q]);
  const flameSpec = useMemo(() => (spec && !spec.errors.length ? traceToFlame(spec, new Budget(partLimitsOf(), null, null, "the trace part")) : null), [spec]);
  const desc = useMemo(() => {
    if (!spec) return [] as number[];
    const d = spec.spans.map(() => 0);
    for (let i = spec.order.length - 1; i >= 0; i--) { const s = spec.spans[spec.order[i]]; if (s.parent >= 0) d[s.parent] += d[s.id] + 1; }
    return d;
  }, [spec]);
  const svcColour = useMemo(() => { const m: Record<string, string> = Object.create(null); if (spec) for (const s of spec.services) m[s.id] = s.colour; return m; }, [spec]);
  const svcLabel = useMemo(() => { const m: Record<string, string> = {}; if (spec) for (const s of spec.services) m[s.id] = s.label; return m; }, [spec]);

  if (!spec || spec.errors.length || !spec.spans.length) return <div className="trace"><div className="cw-error">{w.cannot} {error || spec?.errors[0]?.msg || "No spans"}</div></div>;
  const phone = width < 560;
  const pitch = barH + (phone ? 22 : 10);
  const labelW = (phone ? 210 : 250) + Math.min(8, Math.max(...spec.spans.map((s) => s.depth))) * 8;
  const svgW = phone ? Math.max(width, labelW + 360) : width;
  const plotW = Math.max(120, svgW - labelW - 14);
  const full: [number, number] = [spec.origin, spec.origin + Math.max(spec.length, 1e-9)];
  const [lo, hi] = (!still && range) || full;
  const k = plotW / Math.max(1e-9, hi - lo);
  const X = (t: number) => labelW + (t - lo) * k;
  // the rows that show: a folded span hides its children, unless a search match is inside it
  const forced = new Set<number>();
  for (const id of found.ids) for (let p = spec.spans[id].parent; p >= 0; p = spec.spans[p].parent) forced.add(p);
  const rows: number[] = [];
  let skip = Infinity;
  for (const id of spec.order) {
    const s = spec.spans[id];
    if (s.depth > skip) continue;
    skip = Infinity; rows.push(id);
    if (!still && folded.has(id) && !forced.has(id) && spec.children[id].length) skip = s.depth;
  }
  const isFolded = (id: number) => !still && folded.has(id) && !forced.has(id) && spec.children[id].length > 0;
  const axisH = 28, height = axisH + rows.length * pitch + 6;
  const step = niceStep(hi - lo, phone ? 4 : 7);
  const ticks: number[] = [];
  for (let t = Math.ceil((lo - spec.origin) / step) * step; t <= hi - spec.origin + 1e-9 && ticks.length < 40; t += step) ticks.push(Math.round(t * 1e6) / 1e6 + spec.origin);
  const dim = (s: Span) => (found.ids.size > 0 && !found.ids.has(s.id)) || (svcOn !== null && s.service !== svcOn);
  const rel = (t: number) => fmtNum(Math.round((t - spec.origin) * 100) / 100);
  const unit = spec.unit ? ` ${spec.unit}` : "";

  const setRangeSafe = (a: number, b: number) => {
    const min = Math.max(spec.length / 200, 1e-6);
    let l = Math.max(full[0], Math.min(a, b)), h = Math.min(full[1], Math.max(a, b));
    if (h - l < min) { const c = (l + h) / 2; l = c - min / 2; h = c + min / 2; }
    if (l <= full[0] + 1e-9 && h >= full[1] - 1e-9) setRange(null); else setRange([Math.max(full[0], l), Math.min(full[1], h)]);
  };
  const zoomBy = (f: number) => { const c = (lo + hi) / 2, half = ((hi - lo) / 2) * f; setRangeSafe(c - half, c + half); };
  const panBy = (f: number) => { const d = (hi - lo) * f; let a = lo + d, b = hi + d; if (a < full[0]) { b += full[0] - a; a = full[0]; } if (b > full[1]) { a -= b - full[1]; b = full[1]; } setRangeSafe(a, b); };

  // ---- the mini map: a drag makes, moves or resizes the window
  const miniW = Math.max(200, Math.min(width, 1200));
  const miniH = 44;
  const mt = (px: number) => full[0] + (Math.max(0, Math.min(miniW, px)) / miniW) * (full[1] - full[0]);
  const mx = (t: number) => ((t - full[0]) / (full[1] - full[0])) * miniW;
  const miniDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = mini.current!.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * miniW, t = mt(px), edge = 10 * (miniW / r.width);
    const a = mx(lo), b = mx(hi);
    mini.current!.setPointerCapture?.(e.pointerId);
    if (range && Math.abs(px - a) <= edge) drag.current = { mode: "left", t0: t, r0: [lo, hi] };
    else if (range && Math.abs(px - b) <= edge) drag.current = { mode: "right", t0: t, r0: [lo, hi] };
    else if (range && px > a && px < b) drag.current = { mode: "move", t0: t, r0: [lo, hi] };
    else drag.current = { mode: "new", t0: t, r0: [lo, hi] };
    e.preventDefault();
  };
  const miniMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current; if (!d) return;
    const r = mini.current!.getBoundingClientRect(), t = mt(((e.clientX - r.left) / r.width) * miniW), dt = t - d.t0;
    if (d.mode === "new") setRangeSafe(d.t0, t);
    else if (d.mode === "left") setRangeSafe(d.r0[0] + dt, d.r0[1]);
    else if (d.mode === "right") setRangeSafe(d.r0[0], d.r0[1] + dt);
    else { let a = d.r0[0] + dt, b = d.r0[1] + dt; if (a < full[0]) { b += full[0] - a; a = full[0]; } if (b > full[1]) { a -= b - full[1]; b = full[1]; } setRangeSafe(a, b); }
  };
  const miniUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current; drag.current = null;
    mini.current?.releasePointerCapture?.(e.pointerId);
    if (d && d.mode === "new") { const r = mini.current!.getBoundingClientRect(), t = mt(((e.clientX - r.left) / r.width) * miniW); if (Math.abs(mx(t) - mx(d.t0)) < 4) { const half = (hi - lo) / 2; const c = t; if (range) setRangeSafe(c - half, c + half); } }
  };
  const miniKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") panBy(-0.1); else if (e.key === "ArrowRight") panBy(0.1);
    else if (e.key === "+" || e.key === "=" || e.key === "ArrowUp") zoomBy(0.5); else if (e.key === "-" || e.key === "ArrowDown") zoomBy(2);
    else if (e.key === "0" || e.key === "Home") setRange(null); else return;
    e.preventDefault();
  };

  // ---- the keys on a row
  const focusRow = (id: number) => { setFocus(id); requestAnimationFrame(() => (host.current?.querySelector(`[data-sid="${id}"]`) as unknown as HTMLElement | null)?.focus()); };
  const toggle = (id: number) => setFolded((f) => { const n = new Set(f); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const rowKey = (e: React.KeyboardEvent) => {
    const el = (e.target as Element).closest("[data-sid]"); if (!el || e.target !== el) return;
    const id = Number(el.getAttribute("data-sid")), at = rows.indexOf(id), s = spec.spans[id], has = spec.children[id].length > 0;
    if (e.key === "ArrowDown") focusRow(rows[Math.min(rows.length - 1, at + 1)]);
    else if (e.key === "ArrowUp") focusRow(rows[Math.max(0, at - 1)]);
    else if (e.key === "Home") focusRow(rows[0]); else if (e.key === "End") focusRow(rows[rows.length - 1]);
    else if (e.key === "ArrowRight") { if (has && isFolded(id)) toggle(id); else if (has) focusRow(spec.children[id][0]); }
    else if (e.key === "ArrowLeft") { if (has && !isFolded(id)) { if (!folded.has(id)) toggle(id); } else if (s.parent >= 0) focusRow(s.parent); }
    else return;
    e.preventDefault();
  };

  const card = (s: Span) => {
    const logs = s.logs.map((i) => spec.logs[i]);
    const n = linked[s.id] ?? 0;
    return {
      title: s.name,
      meta: `${svcLabel[s.service]} · ${fmtLen(lenOf(s), spec.unit)} · +${rel(s.start)} to +${rel(s.end)}${unit}`,
      text: (
        <div data-dh-slot="span-detail" className="tr-detail">
          {s.error !== null && <p className="tr-d-err"><b>{w.error}:</b> {s.error}</p>}
          <p className="tr-d-line">{w.self} {fmtLen(s.self, spec.unit)} · {pct(lenOf(s), spec.length)}% {w.of}{s.critical && crit ? ` · ${w.onPath}` : ""}</p>
          {s.attrs.length > 0 && <dl className="tr-d-attrs">{s.attrs.slice(0, 12).map((a) => <React.Fragment key={a.k}><dt>{a.k}</dt><dd>{a.v}</dd></React.Fragment>)}</dl>}
          {logs.length > 0 && <ul className="tr-d-logs">{logs.map((g) => <li key={g.id}><span className="tr-lv" style={{ color: LEVEL_VAR[g.level] }}>{g.level}</span> <span className="tr-d-t">+{rel(g.time)}</span> {g.text}</li>)}</ul>}
        </div>
      ),
      actions: [n ? { label: `${w.showLog} (${n})`, run: () => showInLog(s.id) } : { label: w.copyName, copy: s.name }],
    };
  };

  return (
    <div className={`trace dh-pop-host${phone ? " is-phone" : ""}`} ref={host} data-dh-static={still || undefined}>
      {spec.title && <div className="chart-title">{spec.title}</div>}
      {!still && <div className="trace-bar">
        <div className="trace-seg" role="group" aria-label={w.view} data-dh-slot="view">
          <button type="button" aria-pressed={view === "waterfall"} onClick={() => setView("waterfall")}>{w.waterfall}</button>
          <button type="button" aria-pressed={view === "flame"} onClick={() => setView("flame")}>{w.flame}</button>
        </div>
        {view === "waterfall" && (
          <>
            <label className="flame-search" data-dh-slot="search"><span className="sr-only">{w.search}</span>
              <input type="search" value={q} placeholder={w.search} onChange={(e) => setQ(e.currentTarget.value)} />
            </label>
            <div className="trace-tools" role="group" aria-label={w.zoomIn}>
              <button type="button" className="trace-btn" onClick={() => zoomBy(0.5)} aria-label={w.zoomIn}>+</button>
              <button type="button" className="trace-btn" onClick={() => zoomBy(2)} aria-label={w.zoomOut} disabled={!range}>-</button>
              <button type="button" className="trace-btn" onClick={() => setRange(null)} disabled={!range}>{w.resetZoom}</button>
              <button type="button" className="trace-btn" onClick={() => setFolded(new Set(spec.spans.filter((s) => spec.children[s.id].length).map((s) => s.id)))}>{w.foldAll}</button>
              <button type="button" className="trace-btn" onClick={() => setFolded(new Set())}>{w.unfoldAll}</button>
              {spec.path.length > 0 && <button type="button" className="trace-btn" aria-pressed={crit} onClick={() => setCrit(!crit)}>{w.critical}</button>}
            </div>
          </>
        )}
      </div>
      }
      {!still && view === "flame" && flameSpec ? <Flame spec={flameSpec} error={null} ui={ui} stage={{...stage, width}} static={stp} /> : (
        <>
          {!still && <div className="trace-legend" role="group" aria-label={w.services} data-dh-slot="service">
            {spec.services.map((s) => (
              <button key={s.id} type="button" className="trace-chip" aria-pressed={svcOn === s.id} onClick={() => setSvcOn(svcOn === s.id ? null : s.id)} style={{ ["--trace-svc" as any]: colourVar(s.colour), ["--trace-svc-soft" as any]: colourVar(s.colour, "soft"), ["--trace-svc-ink" as any]: colourVar(s.colour, "ink") }}>
                <span className="trace-dot" aria-hidden="true" />{s.label}<span className="trace-n">{s.spans}</span>
              </button>
            ))}
          </div>
          }
          {!still && q.trim() && <p className="flame-found" aria-live="polite">{found.err || w.matches.replace("{n}", String(found.ids.size)).replace("{t}", fmtLen(found.total, spec.unit)).replace("{p}", String(pct(found.total, spec.length)))}</p>}
          {!still && <svg ref={mini} className="trace-mini" data-dh-slot="minimap" width="100%" viewBox={`0 0 ${miniW} ${miniH}`} preserveAspectRatio="none" role="slider" tabIndex={0} aria-label={w.minimap}
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(((lo - full[0]) / (full[1] - full[0])) * 100)} aria-valuetext={`${rel(lo)} – ${rel(hi)}${unit}`}
            onPointerDown={miniDown} onPointerMove={miniMove} onPointerUp={miniUp} onPointerCancel={miniUp} onKeyDown={miniKey}>
            <rect className="tr-mini-bg" x={0} y={0} width={miniW} height={miniH} rx={6} />
            {spec.order.map((id, i) => {
              const s = spec.spans[id], rh = Math.max(1.5, Math.min(4, (miniH - 6) / spec.spans.length)), y = 3 + (i / Math.max(1, spec.spans.length)) * (miniH - 6 - rh);
              return <rect key={id} x={mx(s.start)} y={y} width={Math.max(1.5, mx(s.end) - mx(s.start))} height={rh} fill={s.error !== null ? "var(--trace-error)" : colourVar(s.colour ?? svcColour[s.service])} opacity={0.85} />;
            })}
            {range && <>
              <rect className="tr-mini-brush" x={mx(lo)} y={0} width={Math.max(2, mx(hi) - mx(lo))} height={miniH} rx={4} />
              <rect className="tr-mini-grip" x={mx(lo) - 2} y={8} width={4} height={miniH - 16} rx={2} />
              <rect className="tr-mini-grip" x={mx(hi) - 2} y={8} width={4} height={miniH - 16} rx={2} />
            </>}
          </svg>
          }
          {!still && range && <p className="flame-found">{w.showing} +{rel(lo)} to +{rel(hi)}{unit}</p>}
          <div className="trace-box" ref={box}>
            <svg width={svgW} height={height} viewBox={`0 0 ${svgW} ${height}`} role="tree" aria-label={spec.title || w.trace} onKeyDown={still ? undefined : rowKey}>
              <defs><clipPath id={`${clipId}c`}><rect x={labelW} y={0} width={plotW} height={height} /></clipPath></defs>
              <g className="tr-axis" aria-hidden="true">
                {ticks.map((t) => <g key={t}><line x1={X(t)} x2={X(t)} y1={axisH - 4} y2={height} className="tr-grid" /><text x={X(t)} y={14} textAnchor={X(t) > svgW - 30 ? "end" : "middle"} className="tr-tick">{rel(t)}</text></g>)}
                <text x={labelW - 8} y={14} textAnchor="end" className="tr-tick tr-unit">{spec.unit}</text>
              </g>
              {rows.map((id, i) => {
                const s = spec.spans[id], y = axisH + i * pitch, by = y + (pitch - barH) / 2, dimmed = dim(s), hit = found.ids.has(id);
                const col = s.colour ?? svcColour[s.service], x0 = Math.max(labelW, X(s.start)), x1 = Math.min(labelW + plotW, X(s.end));
                const barW = Math.max(2, x1 - x0), inRange = s.end >= lo && s.start <= hi, has = spec.children[id].length > 0, fo = isFolded(id);
                const chev = 6 + s.depth * 8, chipX = chev + (phone ? 40 : 24), chipTxt = fit(svcLabel[s.service], phone ? 5 : 9), chipW = Math.max(14, chipTxt.length * CH + 12);
                const nameX = chipX + chipW + 6, room = Math.floor((labelW - 8 - (s.error !== null ? 14 : 0) - (fo ? 36 : 0) - nameX) / CH);
                const lenTxt = fmtLen(lenOf(s), spec.unit), marks = s.logs.map((li) => X(spec.logs[li].time));
                const lenAt = lengthSpot(x0, x0 + barW, lenTxt.length * CH, marks, labelW, labelW + plotW);
                const onPath = crit && s.critical;
                const b = pop.bind(`s${id}`, card(s));
                return (
                  <g key={id} {...(still ? {} : b)} data-sid={id} data-dh-slot="span" role="treeitem" aria-level={s.depth + 1} aria-expanded={has ? !fo : undefined} aria-selected={sel === id}
                    className={`tr-row${dimmed ? " is-dim" : ""}${hit ? " is-hit" : ""}${sel === id ? " is-sel" : ""}${s.error !== null ? " is-error" : ""}${onPath ? " is-crit" : ""}`}
                    tabIndex={still ? undefined : id === focus || (focus >= spec.spans.length && i === 0) || (!rows.includes(focus) && i === 0) ? 0 : -1}
                    aria-label={`${svcLabel[s.service]} ${s.name}, ${lenTxt}${s.error !== null ? `, ${w.error}: ${s.error}` : ""}${onPath ? `, ${w.onPath}` : ""}`}
                    onKeyDown={still ? undefined : (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); b.onClick(e as unknown as React.MouseEvent); } }}
                    onClick={still ? undefined : (e) => { setSel(id); setFocus(id); b.onClick(e); }}>
                    <rect className="tr-stripe" x={0} y={y} width={svgW} height={pitch} />
                    {has && !still && (
                      <g className="tr-chev" role="button" aria-label={`${fo ? w.unfold : w.fold} ${s.name}`} onClick={(e) => { e.stopPropagation(); toggle(id); }} onPointerEnter={(e) => e.stopPropagation()}>
                        <rect x={chev - 6} y={y} width={phone ? 40 : 24} height={pitch} fill="transparent" />
                        <path d={`M ${chev + 2} ${y + pitch / 2 - 4} l 6 4 l -6 4 z`} className={`tr-arrow${fo ? "" : " is-open"}`} style={{ transformOrigin: `${chev + 5}px ${y + pitch / 2}px` }} />
                      </g>
                    )}
                    <g data-dh-slot="service"><rect x={chipX} y={y + pitch / 2 - 9} width={chipW} height={18} rx={9} fill={colourVar(svcColour[s.service], "soft")} stroke={colourVar(svcColour[s.service])} strokeWidth={1} />
                      <text x={chipX + chipW / 2} y={y + pitch / 2} textAnchor="middle" dominantBaseline="central" className="tr-chip-t" fill={colourVar(svcColour[s.service], "ink")}>{chipTxt}</text></g>
                    <text x={nameX} y={y + pitch / 2} dominantBaseline="central" className="tr-name">{fit(s.name, room)}</text>
                    {fo && <text x={labelW - 8 - (s.error !== null ? 14 : 0)} y={y + pitch / 2} textAnchor="end" dominantBaseline="central" className="tr-more">+{desc[id]}</text>}
                    {s.error !== null && <g className="tr-err" aria-hidden="true"><circle cx={labelW - 12} cy={y + pitch / 2} r={7} /><text x={labelW - 12} y={y + pitch / 2} textAnchor="middle" dominantBaseline="central">!</text></g>}
                    <g clipPath={`url(#${clipId}c)`}>
                      {inRange && <>
                        {onPath && <rect className="tr-crit" x={x0 - 2.5} y={by - 2.5} width={barW + 5} height={barH + 5} rx={5} />}
                        <rect data-dh-slot="span-bar" className="tr-bar" x={x0} y={by} width={barW} height={barH} rx={4} fill={colourVar(col, "soft")} stroke={s.error !== null ? "var(--trace-error)" : colourVar(col)} strokeWidth={s.error !== null ? 2 : 1} />
                        <text x={lenAt.x} y={y + pitch / 2} dominantBaseline="central" className="tr-len" textAnchor={lenAt.anchor}>{lenTxt}</text>
                        {s.logs.map((li) => { const g = spec.logs[li], cx = X(g.time); return <path key={li} className="tr-log" d={`M ${cx} ${by + barH / 2 - 5} l 5 5 l -5 5 l -5 -5 z`} fill={LEVEL_VAR[g.level]} />; })}
                      </>}
                    </g>
                  </g>
                );
              })}
            </svg>
          </div>
          {!still && <p className="part-hint">{w.hint}{phone ? ` ${w.swipe}` : ""}</p>}
          <details className="chart-table"><summary>{ui.table}</summary>
            <div className="table-wrap"><table><thead><tr><th>{w.trace}</th><th>{w11.length}</th><th>{w.self}</th><th>{w.error}</th></tr></thead>
              <tbody>{spec.order.map((id) => { const s = spec.spans[id]; return <tr key={id}><th>{"· ".repeat(s.depth)}{svcLabel[s.service]} {s.name}</th><td>{fmtLen(lenOf(s), spec.unit)}</td><td>{fmtLen(s.self, spec.unit)}</td><td>{s.error ?? ""}</td></tr>; })}</tbody></table></div>
          </details>
        </>
      )}
      {!still && pop.node}
    </div>
  );
}

export default function TracePartView({ data, ui, stage, static: stp }: PartViewProps<TraceSpec>) { return <TraceView spec={data} error={null} ui={ui} stage={stage} static={stp} />; }
