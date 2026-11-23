// This package is the source of this file: edit it here. It began as a copy of the private prototype's composed stage (0.7.0).
// The composed stage (format version 11, 0.7.0; tools/stage.ts lays it out): one stage at the column's own width,
// laid out once for every step, so a thing that stays never moves; a step only shows, hides and lights things.
// No camera, pan or zoom. The player is one row: the title and its note, Back, Next, Play, the count; the named steps
// as numbered buttons; one caption. Static (SPEC 4.1): one step, drawn whole, no player.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { compileStage, layoutStage, STAGE_WORK, STAGE_MEMORY, type Plan } from "../core/stage";
/** the widths the server lays out at: the stage's drawing width in a full-width figure (--stg-max 1180 less its border; every
 * window of 1212 px or more) and on a 390 px phone (358 less the border), so the page the server paints is the page the
 * browser keeps there (no jump on load) */
const SSR_WIDE_W = 1178, SSR_NARROW_W = 356;
import { type Item, type Paint, FONT, PHONE_FONT, measure, textLayout } from "../core/stage-core";
import { BudgetError, newBudget, withStageBudget } from "../core/stage-budget";
/** run on a stage budget of its own: a long-lived host renders many pages, and none may spend another's room */
const fresh = <T,>(fn: () => T): T => withStageBudget(newBudget(STAGE_WORK, STAGE_MEMORY), fn);
import { useStatic, StaticSteps, type StaticProp } from "../parts/kit/static";
import type { Ui } from "./ui";

/** struck words: drawn in their tone with a straight line in the bad tone over the whole word (the originals' look; tokens in stage.css) */
function StruckSlash({ it, phone }: { it: Extract<Item, { k: "text" }>; phone?: boolean }) {
  // a straight line over the whole word at the size it is drawn (a phone's own size; the measure's 0.95 left it short)
  const size = (phone ? PHONE_FONT[it.f] : undefined) ?? FONT[it.f].size, F = FONT[it.f], w = (measure(it.s, it.f) / (F.mono || F.weight >= 500 ? 1 : 0.95)) * (size / F.size);
  const x0 = it.anchor === "middle" ? it.x - w / 2 : it.anchor === "end" ? it.x - w : it.x, my = it.y - size * 0.32;
  return <line className="stg-struck-line" x1={x0 - 1} y1={my} x2={x0 + w + 1} y2={my} aria-hidden="true" />;
}
export type StageSrc = { head: string; steps: { title: string; raw: string; line: number }[]; base: number; info: Record<string, string> };
const TONES = ["good", "bad", "warn", "acc", "hot"];
/** a paint name to a page token: roles by the page's role number, tones and stage colours by name */
export function paint(p: Paint | undefined, roles: Record<string, number>): string {
  if (!p || p === "none") return "none";
  const [a, b] = p.split(":"); let c = p.split(":")[2];
  // "dot" and "dot-new" (a column's plain and lit dots): light falls back to the soft fill and the border; the dark blocks
  // set --cN-dot and --cN-dot-new brighter (not the dark fill)
  if (a === "role" && (c === "dot" || c === "dot-new")) { const n = roles[b]; if (n === undefined) return "var(--stg-unknown)"; return c === "dot" ? `var(--c${n}-dot, var(--c${n}-soft))` : `var(--c${n}-dot-new, var(--c${n}))`; }
  if (TONES.includes(a) && (b === "dot" || b === "dot-new")) return b === "dot" ? `var(--${a}-dot, var(--${a}-soft))` : `var(--${a}-dot-new, var(--${a}))`;
  if (a === "role") { const n = roles[b]; if (n === undefined) return "var(--stg-unknown)"; if (n === 0 && c === "wire") return "var(--ink-2)"; // a neutral card's connectors are drawn in ink, not the pale line
    if (c === "wire") c = "line";
    if (n === 0) return `var(--c0${c === "line" || !c ? "" : "-" + c}, var(--${c === "soft" || c === "plane" ? "surface-2" : c === "ink" ? "ink-2" : "line-2"}))`; return c === "line" || !c ? `var(--c${n})` : c === "plane" ? `var(--c${n}-plane, var(--c${n}-soft))` : `var(--c${n}-${c})`; }
  if (TONES.includes(a)) return b === "line" || !b ? `var(--${a})` : `var(--${a}-${b})`;
  return `var(--${a})`;
}
const shown = (it: Item, k: number) => (it.on ? it.on.includes(k) : k >= (it.from ?? 1) && (!it.to || k <= it.to));
/** an SVG path through the points: "h" leaves and enters sideways, "v" up or down, "round" a polyline with round corners */
export function pathD(pts: [number, number][], curve?: string): string {
  const f = (n: number) => Math.round(n * 10) / 10;
  if (pts.length < 2) return "";
  // "line": straight stretches point to point ("lines: straight")
  if (curve === "line") return pts.map(([x, y], i) => `${i ? "L" : "M"}${f(x)} ${f(y)}`).join("");
  if (curve === "round") {
    let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const [px, py] = pts[i - 1], [x, y] = pts[i], [nx, ny] = pts[i + 1];
      const r = Math.min(8, Math.hypot(x - px, y - py) / 2, Math.hypot(nx - x, ny - y) / 2);
      const ax = x - (Math.sign(x - px) * r), ay = y - (Math.sign(y - py) * r), bx = x + Math.sign(nx - x) * r, by = y + Math.sign(ny - y) * r;
      d += `L${f(ax)} ${f(ay)}Q${f(x)} ${f(y)} ${f(bx)} ${f(by)}`;
    }
    return d + `L${f(pts.at(-1)![0])} ${f(pts.at(-1)![1])}`;
  }
  const seg = (a: [number, number], b: [number, number]) => {
    if (curve === "v") { const my = (a[1] + b[1]) / 2; return `C${f(a[0])} ${f(my)} ${f(b[0])} ${f(my)} ${f(b[0])} ${f(b[1])}`; }
    const mx = (a[0] + b[0]) / 2; return `C${f(mx)} ${f(a[1])} ${f(mx)} ${f(b[1])} ${f(b[0])} ${f(b[1])}`;
  };
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  if (pts.length === 2) return d + seg(pts[0], pts[1]);
  d += seg(pts[0], pts[1]);
  for (let i = 2; i < pts.length - 1; i++) d += `L${f(pts[i][0])} ${f(pts[i][1])}`;
  return d + seg(pts.at(-2)!, pts.at(-1)!);
}
// the arrowhead: a small triangle along the last stretch of the line
function head(pts: [number, number][], curve?: string, size = 10): string {
  const [bx, by] = pts.at(-1)!, [ax, ay] = pts.at(-2)!;
  let dx = bx - ax, dy = by - ay;
  if (curve === "h" || (curve !== "v" && curve !== "round" && curve !== "line" && pts.length === 2)) { dx = Math.sign(dx) || 1; dy = 0; }
  else if (curve === "v") { dx = 0; dy = Math.sign(dy) || 1; }
  const L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, s = size, q = 0.6;
  return `M${bx} ${by}L${bx - ux * s - uy * s * q} ${by - uy * s + ux * s * q}L${bx - ux * s + uy * s * q} ${by - uy * s - ux * s * q}Z`;
}

/** put each line of a one-run label in place with the browser's own advances (the plan's are estimates) */
function placeLines(svg: SVGSVGElement | null) {
  if (!svg) return;
  for (const t of svg.querySelectorAll<SVGTextElement>("text.stg-lines")) {
    const s = t.firstChild?.nodeValue ?? "", breaks = (t.dataset.breaks ?? "").split(",").map(Number).filter((n) => n > 0 && n < s.length);
    if (!breaks.length || !t.getNumberOfChars()) continue;
    try {
      const L = textLayout(s, breaks, +(t.dataset.cx ?? 0), +(t.dataset.pitch ?? 16), (a, b) => (b > a ? t.getSubStringLength(a, b - a) : 0)), r = (n: number) => String(Math.round(n * 100) / 100);
      t.setAttribute("x", r(L.x)); t.setAttribute("dx", L.dx.map(r).join(" "));
    } catch { /* not laid out (hidden): keep the plan's places */ }
  }
}
function Draw({ plan, k, roles, still }: { plan: Plan; k: number; roles: Record<string, number>; still: boolean }) {
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => { placeLines(svg.current); let live = true; document.fonts?.ready.then(() => { if (live) placeLines(svg.current); }); return () => { live = false; }; }, [plan]);
  return (
    <svg ref={svg} className={plan.phone ? "stg-svg stg-phone" : "stg-svg"} viewBox={`0 0 ${plan.w} ${plan.h}`} width={plan.w} height={plan.h} role="img" aria-hidden="true" data-fills={plan.fills ? Object.keys(plan.fills).join(" ") : undefined} style={{ aspectRatio: `${plan.w} / ${plan.h}`, ...Object.fromEntries(Object.entries(plan.fills ?? {}).flatMap(([n, [l, d]]) => [[`--stg-f${n.slice(1)}-l`, l], [`--stg-f${n.slice(1)}-d`, d]])) } as any}>
      {plan.items.map((it, i) => {
        const on = shown(it, k), hot = it.hot?.includes(k), dim = it.dim?.includes(k);
        const cls = ["stg-i", on ? "" : "stg-off", hot ? "stg-hot" : "", dim ? "stg-dim" : ""].filter(Boolean).join(" ");
        const data = { "data-from": it.from ?? 1, "data-to": it.to || undefined } as any;
        if (it.bar) for (const [bk, bv] of Object.entries(it.bar)) data[`data-bar-${bk}`] = bv;
        switch (it.k) {
          case "box": {
            // a crossed card: one large X corner to corner in the struck look
            if (it.cls === "stg-cross-corner") return <g key={i} {...data} className={[cls, "stg-cross-corner"].filter(Boolean).join(" ")}><line className="stg-corner-line" x1={it.x + 4} y1={it.y + 4} x2={it.x + it.w - 4} y2={it.y + it.h - 4} /><line className="stg-corner-line" x1={it.x + it.w - 4} y1={it.y + 4} x2={it.x + 4} y2={it.y + it.h - 4} /></g>;
            if (it.cls === "stg-cross") return <g key={i} {...data} className={[cls, "stg-cross"].filter(Boolean).join(" ")}><line className="stg-cross-line" x1={it.x} y1={it.y} x2={it.x + it.w} y2={it.y + it.h} /><line className="stg-cross-line" x1={it.x + it.w} y1={it.y} x2={it.x} y2={it.y + it.h} /></g>;
            const n = it.role ? roles[it.role] : undefined;
            return <rect key={i} {...data} data-id={it.id} className={[cls, "stg-box", it.cls, n !== undefined ? `cc cc-${n}` : "", it.thick ? "stg-thick" : "", it.dash ? "stg-dash" : ""].filter(Boolean).join(" ")} x={it.x} y={it.y} width={Math.max(0, it.w)} height={Math.max(0, it.h)} rx={it.r ?? 8} style={{ fill: paint(it.fill, roles), stroke: paint(it.stroke, roles) }} />;
          }
          case "text": {
            if (it.breaks?.length) { // lines of one run, placed from measure here and from the browser's widths once painted (stage-lines effect)
              const L = textLayout(it.s, it.breaks, it.x, it.pitch ?? 16, (a, b) => measure(it.s.slice(a, b), it.f)), r = (n: number) => Math.round(n * 100) / 100;
              return <g key={i} {...data} className={cls}><text className={`stg-t stg-f-${it.f} stg-lines`} x={r(L.x)} y={it.y} dx={L.dx.map(r).join(" ")} dy={L.dy.map(r).join(" ")} textAnchor="middle" data-cx={it.x} data-breaks={it.breaks.join(",")} data-pitch={it.pitch ?? 16} style={{ fill: paint(it.ink, roles) }}>{it.s}{it.tip && <title>{it.tip}</title>}</text></g>;
            }
            return (
              <g key={i} {...data} className={cls} transform={it.rotate === 90 && /^[-+]?\d+(?:\.\d+)?$/.test(it.s) ? `rotate(-90 ${it.x} ${it.y})` : undefined}>
                <text className={`stg-t stg-f-${it.f}${it.strike ? " stg-struck" : ""}${it.halo ? " stg-halo" : ""}`} x={it.x} y={it.y} textAnchor={it.anchor ?? "start"} style={{ fill: paint(it.ink, roles) }}>{it.s}{it.tip && <title>{it.tip}</title>}</text>
                {it.strike && <StruckSlash it={it} phone={!!plan.phone} />}
              </g>
            );
          }
          case "path": {
            const d = pathD(it.pts, it.curve), col = paint(it.ink, roles);
            return (
              <g key={i} data-from={it.from ?? 1} data-to={it.to || undefined} data-id={it.id} className={[cls, "stg-edge", it.flow !== undefined ? "stg-conn" : "", it.dash ? "stg-dash" : ""].filter(Boolean).join(" ")}>
                <path {...data} className="stg-line" d={d} style={{ stroke: col, strokeWidth: it.w, strokeDasharray: it.dot ? "0.1 4.5" : it.dash ? "var(--stg-dash)" : undefined, strokeLinecap: it.dot ? "round" : undefined }} />
                {it.arrow && <path className="stg-head" d={head(it.pts, it.curve, it.head)} style={{ fill: col }} />}
                {it.flow && !still && hot && on && <circle className="stg-dot" r={3.6} style={{ fill: col, offsetPath: `path('${d}')` }} />}
              </g>
            );
          }
          case "badge": {
            const n = roles[it.role];
            return <g key={i} {...data} className={cls}><rect className="stg-badge" x={it.x} y={it.y} width={17} height={17} rx={4} style={{ fill: paint(`role:${it.role}:line`, roles) }} /><text className="stg-t stg-f-small-b stg-badge-t" x={it.x + 8.5} y={it.y + 12.5} textAnchor="middle">{it.s}</text></g>;
          }
          case "tri": return <path key={i} {...data} className={cls} d={`M${it.x - 1} ${it.y - 5}l8 5-8 5z`} style={{ fill: paint(it.ink, roles) }} />;
        }
      })}
    </svg>
  );
}

/** The width a stage lays out at when printing starts, before the browser has the print layout: the content column
 * of A4 with the usual margins (the narrowest common sheet), so words stay at 11 px (8 pt) on paper and a wider
 * sheet (Letter, landscape) only scales the drawing up. */
export const PRINT_W = 620;
/** The width the drawing has on an A4 sheet at that layout (the column less the stage's frame): the width a landscape sheet scales up from (stage.css, `--stg-hint`: the stage's height there, which sets how far it can scale up). */
export const PRINT_BOX_W = 685;
/** Print (SPEC 4.1): requestAnimationFrame and ResizeObserver do not run while a page prints, so the stage would keep
 * its screen layout and the sheet would scale it down (1180 px to 0.53, words 4.3 pt). Lay out again, synchronously,
 * on beforeprint at PRINT_W (the print layout is not there yet). When matchMedia("print") turns on, the browser has
 * the paper layout but has already counted its pages (Chrome: a stage that grows then is cut off the PDF's end), so
 * lay out again only when the sheet is narrower than PRINT_W allows at 8 pt (or beforeprint never came). A wider sheet keeps the PRINT_W layout, scaled up: a re-layout wide there makes the stages SHORTER after Chrome has counted the pages, and the last pages print blank (13 on A3 landscape); stage.css caps a stage at one page, so scaled up it cannot outgrow the page. Was: or much wider
 * (A3 landscape: scaled up 2x the drawing outgrows the page; laid out at its own width it only gets shorter).
 * After printing, back to the screen width. `cur` is the width the stage is laid out at now. */
export function printRelayout(el: HTMLElement, setW: (w: number) => void, cur: () => number): () => void {
  if (typeof window === "undefined") return () => {};
  const now = (w: number) => { if (w > 0 && w !== cur()) flushSync(() => setW(w)); };
  const width = () => Math.floor(el.clientWidth);
  const before = () => now(Math.min(width() || PRINT_W, PRINT_W));
  const after = () => now(width());
  const mq = window.matchMedia ? window.matchMedia("print") : null;
  const change = (e: { matches: boolean }) => { const cw = width(); if (!e.matches) now(cw); else if (cw > 0 && cw / (cur() || cw) < 0.97) now(cw); };
  addEventListener("beforeprint", before); addEventListener("afterprint", after);
  try { mq?.addEventListener("change", change); } catch { /* old Safari: beforeprint is enough */ }
  return () => { removeEventListener("beforeprint", before); removeEventListener("afterprint", after); try { mq?.removeEventListener("change", change); } catch { /* as above */ } };
}

/** The part. `src` is the animation's source, `roles` the page's role numbers; layout runs at the column's width. */
export function Stage({ src, roles, ui, static: stp, srText }: { src: StageSrc; roles: Record<string, number>; ui: Ui; static?: StaticProp; srText?: string }) {
  const c = useMemo(() => fresh(() => compileStage(src.head, src.steps, src.base, src.info, roles)), [src, roles]);
  const m = c.model, n = m.steps.length, titles = m.steps.map((s) => s.title);
  const st = useStatic(stp, n, titles);
  const [kLive, setK] = useState(n ? 1 : 0);
  const [playing, setPlaying] = useState(false);
  const [w, setW] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const wNow = useRef(0); wNow.current = w;
  const k = st.on ? st.i + 1 : kLive;
  // full width: the figure leaves the text column, centred on the page, at most --stg-max wide
  useEffect(() => {
    const fig = box.current?.closest("figure") as HTMLElement | null; if (!fig) return;
    const place = () => {
      // the column as it is without the breakout (stage.css already widens the figure before this runs; read in one go, nothing paints in between)
      fig.style.setProperty("--stg-fig-w", "auto"); fig.style.setProperty("--stg-fig-ml", "0px");
      const page = document.documentElement.clientWidth, cs = getComputedStyle(fig), max = parseFloat(cs.getPropertyValue("--stg-max")) || 1180;
      const gut = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--gutter")) || 16, col = fig.getBoundingClientRect();
      const want = Math.min(max, page - 2 * Math.min(gut, 24));
      if (want <= col.width + 1) return;
      fig.style.setProperty("--stg-fig-w", `${want}px`); fig.style.setProperty("--stg-fig-ml", `${(page - want) / 2 - col.left}px`);
    };
    place();
    addEventListener("resize", place);
    return () => removeEventListener("resize", place);
  }, []);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const set = () => { const cw = Math.floor(el.clientWidth); if (cw > 0) setW((o) => (Math.abs(o - cw) > 1 ? cw : o)); };
    set();
    let ro: ResizeObserver | null = null;
    try { ro = new ResizeObserver(() => requestAnimationFrame(set)); ro.observe(el); } catch { addEventListener("resize", set); }
    const pr = printRelayout(el, setW, () => wNow.current);
    return () => { ro?.disconnect(); removeEventListener("resize", set); pr(); };
  }, []);
  // the server draws the wide and the narrow plan (CSS shows the one that fits); the browser lays out at its own width
  const plans = useMemo(() => { try { return fresh(() => (w ? [layoutStage(m, w)] : [layoutStage(m, SSR_WIDE_W), layoutStage(m, SSR_NARROW_W)])); } catch (e) { if (e instanceof BudgetError) return [] as Plan[]; throw e; } }, [m, w]);
  useEffect(() => {
    if (!playing || st.on) return;
    if (kLive >= n) { setPlaying(false); return; }
    const t = setTimeout(() => setK((x) => Math.min(n, x + 1)), 3200);
    return () => clearTimeout(t);
  }, [playing, kLive, n, st.on]);
  if (!plans.length) return <div className="stg stg-over" role="note">{`${m.title ? m.title + ": " : ""}this scene needs more layout work than a page may use; show fewer cards, rows or steps, or split it into two scenes`}</div>;
  const go = (x: number) => { setPlaying(false); setK(Math.max(1, Math.min(n, x))); };
  const step = n ? m.steps[k - 1] : null;
  return (
    <div className={`stg${st.on ? " stg-static" : ""}`} style={plans.length === 1 ? ({ "--stg-boxmin": `${Math.ceil(plans[0].h * 0.935)}px`, "--stg-need": `${Math.ceil(plans[0].h * 0.935) + 160}px`, "--stg-hint": `${Math.ceil((plans[0].h * PRINT_BOX_W) / plans[0].w) + 83 + 18 * n + 10}px` } as React.CSSProperties) : undefined} data-dh-slot="stage" data-steps={n} data-step={k} data-bar-steps={n || 1}
      tabIndex={n && !st.on ? 0 : undefined} aria-label={m.title || undefined}
      onKeyDown={(e) => { if (st.on || !n) return; if ((e.target as HTMLElement).closest("button") && e.key !== "ArrowRight" && e.key !== "ArrowLeft") return; if (e.key === "ArrowRight") { go(k + 1); e.preventDefault(); } if (e.key === "ArrowLeft") { go(k - 1); e.preventDefault(); } }}>
      {(m.title || (n > 0 && !st.on)) && (
        <div className="stg-bar">
          {m.title && <span className="stg-title"><b>{m.title}</b>{m.note && <code className="stg-note">{m.note}</code>}</span>}
          {n > 0 && !st.on && (
            <span className="stg-ctl" role="group" aria-label={ui.step}>
              <button type="button" className="stg-btn" onClick={() => go(k - 1)} disabled={k <= 1} aria-label={ui.back}>◀</button>
              <button type="button" className="stg-btn" onClick={() => go(k + 1)} disabled={k >= n} aria-label={ui.next}>▶</button>
              <button type="button" className="stg-btn stg-play" aria-pressed={playing} onClick={() => { if (playing) { setPlaying(false); return; } if (k >= n) setK(1); setPlaying(true); }}>{playing ? ui.pause : ui.play}</button>
              <span className="stg-count" aria-live="polite" data-bar-count="">{k} / {n}</span>
            </span>
          )}
        </div>
      )}
      <div className={plans.length === 1 ? "stg-box-wrap stg-ratio" : "stg-box-wrap"} ref={box} data-bar-stage="" style={plans.length === 1 ? { aspectRatio: `${plans[0].w} / ${plans[0].h}` } : undefined}>
        {plans.map((p, i) => <div key={i} className={w ? "stg-plan" : i ? "stg-plan stg-plan-narrow" : "stg-plan stg-plan-wide"}><Draw plan={p} k={k || 1} roles={roles} still={st.on} /></div>)}
      </div>
      {srText && <p className="sr-only">{srText}</p>}
      {n > 0 && !st.on && (
        <>
          <ol className="stg-steps">{titles.map((t, i) => <li key={i}><button type="button" className="stg-stepbtn" data-bar-step={i + 1} aria-current={i + 1 === k ? "step" : undefined} onClick={() => go(i + 1)} aria-label={`${i + 1} ${t}`}><span className="stg-num">{i + 1}</span><span className="stg-stepname"> {t}</span></button></li>)}</ol>
          <p className="stg-cap" data-bar-caption="">{step?.caption}</p>
        </>
      )}
      {st.on && n > 0 && <StaticSteps titles={m.steps.map((s) => (s.caption === s.title ? s.title : `${s.title}: ${s.caption}`))} i={k - 1} label={ui.allSteps} print={st.print} />}
    </div>
  );
}
