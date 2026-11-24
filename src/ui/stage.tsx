// This package is the source of this file: edit it here. It began as a copy of the private prototype's composed stage (0.7.0).
// The composed stage (format version 11, 0.7.0; src/core/stage.ts lays it out): one stage at the column's own width,
// laid out once for every step, so a thing that stays never moves; a step only shows, hides and lights things.
// No camera, pan or zoom. The player is one row: the title and its note, Back, Next, Play, the count; the named steps
// as numbered buttons; one caption. Static (SPEC 4.1): one step, drawn whole, no player.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { BudgetError, newBudget, withStageBudget } from "../core/stage-budget";
import { compileStage, layoutStage, STAGE_WORK, STAGE_MEMORY, type Plan } from "../core/stage";
/** the widths the server lays out at: the stage's drawing width (its box: the figure, min(1180, window - 32), less its 2 px
 * border) at the windows readers use most: 360, 375, 390 and 414 px phones, 768 and 1024 px tablets, every window of 1212 px
 * or more. stage.css shows the widest plan that fits the box at its own size, so where the box is one of these widths the
 * page the server paints is the page the browser keeps (no jump on load; one width source: stageW) */
export const SSR_W = [326, 341, 356, 380, 734, 990, 1178] as const;
/** the one width source: the width a stage lays out at, its box's content width (the client's layout and the server's set agree on it) */
export const stageW = (el: HTMLElement) => { const cs = getComputedStyle(el); return Math.floor(el.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0)); };
import { type Item, type Paint, FONT, PHONE_FONT, measure, textLayout } from "../core/stage-core";
import { useStatic, StaticSteps, type StaticProp } from "../parts/kit/static";
import { cssVars } from "./css-vars";
import type { Ui } from "./ui";

/** Each compile and each plan (one width) runs on a stage budget of its own (src/core/stage.ts STAGE_WORK, 4x the heaviest
 * real plan), on the server and in the browser: a page draws many stages and the browser lays them out
 * again on every resize, and none may spend another's room or the page's. Over the cap it throws BudgetError (refused). */
export function stageWork<T>(run: () => T): T {
  return withStageBudget(newBudget(STAGE_WORK, STAGE_MEMORY), run);
}

/** struck words: drawn in their tone with a straight line in the bad tone over the whole word (the originals' look; tokens in stage.css) */
function struckSlash(it: Extract<Item, { k: "text" }>, phone?: boolean) {
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
      {stageWork(() => plan.items.map((it, i) => {
        const on = shown(it, k), hot = it.hot?.includes(k), dim = it.dim?.includes(k);
        const cls = ["stg-i", on ? "" : "stg-off", hot ? "stg-hot" : "", dim ? "stg-dim" : ""].filter(Boolean).join(" ");
        const data = { "data-from": it.from ?? 1, "data-to": it.to || undefined } as any;
        if (it.bar) for (const [bk, bv] of Object.entries(it.bar)) data[`data-bar-${bk}`] = bv;
        switch (it.k) {
          case "box": {
            const crossStroke = it.stroke === "none" ? undefined : { stroke: paint(it.stroke, roles) };
            // a crossed card: one large X corner to corner in the struck look
            if (it.cls === "stg-cross-corner") return <g key={i} {...data} className={[cls, "stg-cross-corner"].filter(Boolean).join(" ")}><line className="stg-corner-line" style={crossStroke} x1={it.x + 4} y1={it.y + 4} x2={it.x + it.w - 4} y2={it.y + it.h - 4} /><line className="stg-corner-line" style={crossStroke} x1={it.x + it.w - 4} y1={it.y + 4} x2={it.x + 4} y2={it.y + it.h - 4} /></g>;
            if (it.cls === "stg-cross") return <g key={i} {...data} className={[cls, "stg-cross"].filter(Boolean).join(" ")}><line className="stg-cross-line" style={crossStroke} x1={it.x} y1={it.y} x2={it.x + it.w} y2={it.y + it.h} /><line className="stg-cross-line" style={crossStroke} x1={it.x + it.w} y1={it.y} x2={it.x} y2={it.y + it.h} /></g>;
            const n = it.role ? roles[it.role] : undefined;
            return <rect key={i} {...data} data-id={it.id} className={[cls, "stg-box", it.cls, n !== undefined ? `cc cc-${n}` : "", it.thick ? "stg-thick" : "", it.dash ? "stg-dash" : ""].filter(Boolean).join(" ")} x={it.x} y={it.y} width={Math.max(0, it.w)} height={Math.max(0, it.h)} rx={it.r ?? 8} style={{ fill: paint(it.fill, roles), stroke: paint(it.stroke, roles) }} />;
          }
          case "text": {
            if (it.breaks?.length) { // lines of one run, placed from measure here and from the browser's widths once painted (stage-lines effect)
              const L = textLayout(it.s, it.breaks, it.x, it.pitch ?? 16, (a, b) => measure(it.s.slice(a, b), it.f)), r = (n: number) => Math.round(n * 100) / 100;
              return <g key={i} {...data} className={cls}><text className={`stg-t stg-f-${it.f} stg-lines`} x={r(L.x)} y={it.y} dx={L.dx.map(r).join(" ")} dy={L.dy.map(r).join(" ")} textAnchor="middle" data-cx={it.x} data-breaks={it.breaks.join(",")} data-pitch={it.pitch ?? 16} style={{ fill: paint(it.ink, roles), ...(it.size ? {fontSize:it.size} : {}) }}>{it.s}{it.tip && <title>{it.tip}</title>}</text></g>;
            }
            return (
              <g key={i} {...data} className={cls} transform={it.rotate === 90 ? `rotate(-90 ${it.x} ${it.y})` : undefined}>
                <text className={`stg-t stg-f-${it.f}${it.strike ? " stg-struck" : ""}${it.halo ? " stg-halo" : ""}`} x={it.x} y={it.y} textAnchor={it.anchor ?? "start"} style={{ fill: paint(it.ink, roles), ...(it.size ? {fontSize:it.size} : {}) }}>{it.s}{it.tip && <title>{it.tip}</title>}</text>
                {it.strike && struckSlash(it, plan.phone)}
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
      }))}
    </svg>
  );
}

/** The width a stage lays out at when printing starts, before the browser has the print layout: the content column
 * of A4 with the usual margins (the narrowest common sheet), so words stay at 11 px (8 pt) on paper and a wider
 * sheet (Letter, landscape) only scales the drawing up. */
export const PRINT_W = 620;
/** In print a stage's drawing may shrink to fit its sheet down to this share of its size, no further: an 11 px word is
 * 8.25 pt, so at 0.97 every word prints at 8 pt or more. A stage that would need more shrink splits between its blocks
 * instead (23 Nov: it was 0.935; and a scene printed at 7.7 pt on a landscape A4 sheet) */
export const PRINT_FLOOR = 0.97;
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

type Model = ReturnType<typeof compileStage>["model"];
/** the words of a stage that could not compile within its budget: its title and its steps as written */
function stillModel(src: StageSrc): Model {
  const tl = /^title:\s*(.*)$/m.exec(src.head)?.[1] ?? "", [title, note] = tl.split("|").map((x) => x.trim());
  const steps = src.steps.map((s) => { const i = s.title.indexOf(":"); const title = (i < 0 ? s.title : s.title.slice(0, i)).trim(); return { title, caption: i < 0 ? title : s.title.slice(i + 1).trim() }; });
  return { title: title ?? "", note: note ?? "", steps } as unknown as Model;
}
/** A stage over its budget (STAGE_WORK) is never blank: its title, a message that names the budget and the fix, and
 * its still form in words (every step, title and caption); every other stage on the page draws as usual. */
export const STAGE_OVER_MESSAGE = `This scene needs more work than one stage may use (the stage layout budget, ${STAGE_WORK.toLocaleString("en")} units of work), so it is shown still, in words. Show fewer cards, lines or steps, or split it into two scenes.`;
function StageOver({ m }: { m: Model }) {
  return (
    <div className="stg stg-over" data-dh-slot="stage" data-stage-over="">
      {m.title && <div className="stg-bar"><span className="stg-title"><b>{m.title}</b>{m.note && <code className="stg-note">{m.note}</code>}</span></div>}
      <p className="stg-over-msg" role="note">{STAGE_OVER_MESSAGE}</p>
      {m.steps.length > 0 && <ol className="stg-still">{m.steps.map((s, i) => <li key={i}>{s.caption === s.title ? s.title : `${s.title}: ${s.caption}`}</li>)}</ol>}
    </div>
  );
}

/** The part. `src` is the animation's source, `roles` the page's role numbers; layout runs at the column's width. */
export function Stage({ src, roles, ui, static: stp, srText, hydrate }: { src: StageSrc; roles: Record<string, number>; ui: Ui; static?: StaticProp; srText?: string; /** set by the client entry when it hydrates the server's markup */ hydrate?: boolean }) {
  // over one stage's budget (STAGE_WORK) a stage is never blank: it shows its still form (stillModel, StageOver)
  const c = useMemo(() => { try { return stageWork(() => compileStage(src.head, src.steps, src.base, src.info, roles)); } catch (e) { if (e instanceof BudgetError) return null; throw e; } }, [src, roles]);
  const m = c ? c.model : stillModel(src), n = m.steps.length, titles = m.steps.map((s) => s.title);
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
    const set = () => { const cw = stageW(el); if (cw > 0) setW((o) => (Math.abs(o - cw) > 1 ? cw : o)); };
    set();
    let ro: ResizeObserver | null = null;
    try { ro = new ResizeObserver(() => requestAnimationFrame(set)); ro.observe(el); } catch { addEventListener("resize", set); }
    const pr = printRelayout(el, setW, () => wNow.current);
    return () => { ro?.disconnect(); removeEventListener("resize", set); pr(); };
  }, []);
  // the server draws a plan at each width of SSR_W (CSS shows the widest that fits); the browser lays out at its own width
  // the browser never lays out the server's widths: until it knows its own (the first effect) it keeps the server's drawn
  // plans as they are (hydration adopts them; one layout per stage, so 7 plans x 27 stages never charge the page's budget)
  const browser = false; // the package hydrates by drawing the server's plans again (no HTML-string sink in its strict entry)
  // over one stage's budget (STAGE_WORK) the stage is refused: a note in its place, never an error out of render
  const laid = useMemo((): Plan[] | null => { if (!c) return null; try { return w ? [stageWork(() => layoutStage(m, w))] : browser ? [] : [...SSR_W, PRINT_W].map((x) => stageWork(() => layoutStage(m, x))); } catch (e) { if (e instanceof BudgetError) return null; throw e; } }, [c, m, w, browser]);
  const plans = laid ?? [];
  // print (SPEC 4.1): the plan a sheet prints and the sizes the print rules read from it (stage.css). In the browser that
  // is its one plan, laid out at PRINT_W on beforeprint; before it hydrates (the hydration order can keep a stage waiting
  // for seconds), the server's PRINT_W plan, shown only in print, so a stage printed before its turn prints the same.
  // Hydrating, the browser keeps the server's sizes as they are (suppressHydrationWarning) until it has its own plan.
  const pp = w ? (plans.length === 1 ? plans[0] : null) : plans[SSR_W.length] ?? null;
  useEffect(() => {
    if (!playing || st.on) return;
    if (kLive >= n) { setPlaying(false); return; }
    const t = setTimeout(() => setK((x) => Math.min(n, x + 1)), 3200);
    return () => clearTimeout(t);
  }, [playing, kLive, n, st.on]);
  if (laid === null) return <StageOver m={m} />;
  const go = (x: number) => { setPlaying(false); setK(Math.max(1, Math.min(n, x))); };
  const step = n ? m.steps[k - 1] : null;
  return (
    <div className={`stg${st.on ? " stg-static" : ""}`} style={pp ? cssVars({ "--stg-boxmin": `${Math.ceil(pp.h * PRINT_FLOOR)}px`, "--stg-need": `${Math.ceil(pp.h * PRINT_FLOOR) + 160}px`, "--stg-hint": `${Math.ceil((pp.h * PRINT_BOX_W) / pp.w) + 83 + 18 * n + 10}px` }) : undefined} suppressHydrationWarning data-dh-slot="stage" data-steps={n} data-step={k} data-bar-steps={n || 1}
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
      <div className={plans.length === 1 ? "stg-box-wrap stg-ratio" : pp ? "stg-box-wrap stg-ratio-print" : "stg-box-wrap"} ref={box} data-bar-stage="" style={plans.length === 1 ? { aspectRatio: `${plans[0].w} / ${plans[0].h}` } : pp ? cssVars({ "--stg-ar": `${pp.w} / ${pp.h}` }) : undefined} suppressHydrationWarning>
        {w ? plans.map((p, i) => <div key={i} className="stg-plan"><Draw plan={p} k={k || 1} roles={roles} still={st.on} /></div>)
          : plans.map((p, i) => <div key={i} className="stg-plan stg-plan-ssr" data-w={SSR_W[i] ?? PRINT_W} data-print={i === SSR_W.length || undefined}><Draw plan={p} k={k || 1} roles={roles} still={st.on} /></div>)}
      </div>
      {srText && <p className="sr-only">{srText}</p>}
      {n > 0 && !st.on && (
        <div className="stg-foot">
          <ol className="stg-steps">{titles.map((t, i) => <li key={i}><button type="button" className="stg-stepbtn" data-bar-step={i + 1} aria-current={i + 1 === k ? "step" : undefined} onClick={() => go(i + 1)} aria-label={`${i + 1} ${t}`}><span className="stg-num">{i + 1}</span><span className="stg-stepname"> {t}</span></button></li>)}</ol>
          {/* every step's caption sits, hidden, in the same grid cell as the shown one, so the caption is as tall as the tallest from the
 first step and a caption that wraps to one more line never moves what is under the stage */}
          <div className="stg-capbox"><p className="stg-cap" data-bar-caption="">{step?.caption}</p>{m.steps.map((s, i) => <p key={i} className="stg-cap stg-cap-room" aria-hidden="true">{s.caption}</p>)}</div>
        </div>
      )}
      {st.on && n > 0 && <StaticSteps titles={m.steps.map((s) => (s.caption === s.title ? s.title : `${s.title}: ${s.caption}`))} i={k - 1} label={ui.allSteps} print={st.print} />}
    </div>
  );
}
