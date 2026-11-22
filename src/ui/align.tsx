// This package is the source of this file: edit it here. It began as a copy synced from a private prototype (scripts/sync.ts, now frozen).
// The alignment grid part (format version 8): a 2x2 or 3x3 grid with named axis ends. Items sit in cells, or at points
// (a dot, and its label placed where it overlaps no other). Rendered at build time, hydrated in the browser, where the
// point labels are placed by measuring and a tap (or hover) on an item with a note shows the note under the grid.
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { alignColMin, type AlignSpec } from "../core/align";
import { chipW } from "../core/chipw";
import { Chip, NoteBar, type Picked } from "./tier";
import type { Ui } from "./ui";

const useIsoLayout = typeof window === "undefined" ? useEffect : useLayoutEffect;
type R = { l: number; t: number; r: number; b: number };
// the cell borders of the grid as lines (plane coordinates), a gap's two edges merged into one
export function gridLines(plane: HTMLElement): { xs: number[]; ys: number[] } {
  const pr = plane.getBoundingClientRect(), xs: number[] = [], ys: number[] = [];
  const add = (a: number[], v: number) => { if (!a.some((o) => Math.abs(o - v) < 6)) a.push(v); };
  for (const c of plane.parentElement!.querySelectorAll<HTMLElement>(".al-cell")) { const r = c.getBoundingClientRect(); add(xs, r.left - pr.left); add(xs, r.right - pr.left); add(ys, r.top - pr.top); add(ys, r.bottom - pr.top); }
  return { xs, ys };
}
// how many cell borders a label straddles (a margin of 2 px each side: touching is not crossing)
export const crosses = (r: R, g: { xs: number[]; ys: number[] }) => g.xs.filter((x) => x > r.l + 2 && x < r.r - 2).length + g.ys.filter((y) => y > r.t + 2 && y < r.b - 2).length;
export const CROSS_COST = 220;
const hit = (a: R, b: R) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));

// Give every point label the first place around its dot that stays inside the plane and covers no other label or dot;
// when none is free, the place with the least overlap. Pure measuring: the labels keep their text and size.
export function placeLabels(plane: HTMLElement) {
  const W = plane.clientWidth, H = plane.clientHeight;
  const pts = [...plane.querySelectorAll<HTMLElement>(".al-pt")];
  const dots = pts.map((el) => ({ x: +el.dataset.x! * W, y: +el.dataset.y! * H }));
  const placed: R[] = dots.map((d) => ({ l: d.x - 6, t: d.y - 6, r: d.x + 6, b: d.y + 6 }));
  // the cells' own labels are obstacles too
  const pr = plane.getBoundingClientRect();
  for (const el of plane.parentElement!.querySelectorAll<HTMLElement>(".al-cell-label")) { const r = el.getBoundingClientRect(); placed.push({ l: r.left - pr.left, t: r.top - pr.top, r: r.right - pr.left, b: r.bottom - pr.top }); }
  const grid = gridLines(plane);
  // a label is never wider than the narrowest cell (less a little air), so a long name wraps into two lines instead of straddling a border
  const cellW = Math.min(...[...plane.parentElement!.querySelectorAll<HTMLElement>(".al-cell")].map((c) => c.getBoundingClientRect().width));
  const maxW = cellW > 0 && cellW < 260 ? Math.max(84, Math.floor(cellW - 10)) : 0;
  const mine = (k: number) => placed.filter((_, j) => j !== k);
  const order = pts.map((_, k) => k).sort((a, b) => dots[a].y - dots[b].y || dots[a].x - dots[b].x);
  const labels: R[] = [];
  for (const k of order) {
    const lab = pts[k].querySelector<HTMLElement>(".al-lab")!;
    lab.style.maxWidth = maxW ? `${maxW}px` : "";
    lab.style.transform = "none"; lab.style.left = "0px"; lab.style.right = "auto"; lab.style.top = "0px";
    const w = lab.offsetWidth, h = lab.offsetHeight, { x, y } = dots[k];
    const c: [number, number][] = [[10, -h / 2], [-10 - w, -h / 2], [-w / 2, 9], [-w / 2, -9 - h], [10, 5], [10, -5 - h], [-10 - w, 5], [-10 - w, -5 - h]];
    for (let s = 1; s <= 4; s++) for (const dy of [s * (h + 3), -s * (h + 3)]) { c.push([10, -h / 2 + dy], [-10 - w, -h / 2 + dy], [-w / 2, 9 + dy], [-w / 2, -9 - h + dy]); }
    // above or below the dot, slid sideways until the label sits inside the dot's own cell (the dot near a border no longer pushes its label across it)
    {
      const xl = [...grid.xs].sort((a, b) => a - b), yl = [...grid.ys].sort((a, b) => a - b);
      const lo = (a: number[], v: number) => a.filter((q) => q <= v).pop() ?? a[0], hi = (a: number[], v: number) => a.find((q) => q > v) ?? a[a.length - 1];
      const cl = lo(xl, x) - x + 3, cr = hi(xl, x) - x - 3 - w, dx = Math.min(Math.max(-w / 2, cl), Math.max(cl, cr));
      if (Math.abs(dx + w / 2) > 1) c.push([dx, 9], [dx, -9 - h]);
      const ct = lo(yl, y) - y + 3, cb = hi(yl, y) - y - 3 - h; // and beside it, slid up or down into the cell
      const dy = Math.min(Math.max(-h / 2, ct), Math.max(ct, cb));
      if (Math.abs(dy + h / 2) > 1) c.push([10, dy], [-10 - w, dy]);
    }
    // nearest first, so the first free place is the closest one (the order above is the same, plus a small push to the side for a tie)
    c.sort((a, b) => Math.hypot(Math.max(a[0], 0, -a[0] - w), Math.max(a[1], 0, -a[1] - h)) - Math.hypot(Math.max(b[0], 0, -b[0] - w), Math.max(b[1], 0, -b[1] - h)) || Math.abs(a[1] + h / 2) - Math.abs(b[1] + h / 2));
    let best: { at: [number, number]; cost: number } | null = null;
    for (const at of c) {
      const r: R = { l: x + at[0], t: y + at[1], r: x + at[0] + w, b: y + at[1] + h };
      // the plane has 12 to 14 px of margin inside the grid: a label may use it
      const M = 10, out = (r.l < -M ? -M - r.l : 0) + (r.r > W + M ? r.r - W - M : 0) + (r.t < -M ? -M - r.t : 0) + (r.b > H + M ? r.b - H - M : 0);
      const cost = out * 40 + crosses(r, grid) * CROSS_COST + [...labels, ...mine(k)].reduce((n, o) => n + hit(r, o), 0) + 6 * hit(r, placed[k]) + (Math.hypot(Math.max(at[0], 0, -at[0] - w), Math.max(at[1], 0, -at[1] - h)) - 9) * 0.5;
      if (!best || cost < best.cost) best = { at, cost };
      if (cost < 6) break; // free, and about as near as it gets
    }
    const at = best!.at;
    lab.style.left = `${at[0]}px`; lab.style.top = `${at[1]}px`;
    // a label that is not next to its dot gets a thin line to it
    const link = pts[k].querySelector<HTMLElement>(".al-link")!;
    const nx = Math.min(Math.max(0, at[0]), at[0] + w), ny = Math.min(Math.max(0, at[1]), at[1] + h), len = Math.hypot(nx, ny);
    if (len > 12) { link.style.display = "block"; link.style.width = `${len}px`; link.style.transform = `rotate(${Math.atan2(ny, nx)}rad)`; } else link.style.display = "none";
    const r: R = { l: x + at[0], t: y + at[1], r: x + at[0] + w, b: y + at[1] + h };
    labels.push(r); placed.push(r);
  }
}

export function Alignment({ spec, ui }: { spec: AlignSpec; ui: Ui }) {
  const [picked, pick] = useState<Picked>(null);
  const plane = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  const nx = spec.xs.length, ny = spec.ys.length;
  const has = spec.points.length > 0;
  const any = spec.cells.some((c) => c.items.some((i) => i.note)) || spec.points.some((p) => p.note);
  // with arrows on, one extra row (under the column names) and one extra column (beside the row names) carry them
  const c0 = spec.arrows ? 3 : 2, r0 = spec.arrows ? 3 : 2;
  useIsoLayout(() => {
    const el = plane.current;
    if (!el) return;
    const go = () => { placeLabels(el); const sc = scroller.current; if (sc) setWide(sc.scrollWidth > sc.clientWidth + 2); };
    go();
    const ro = new ResizeObserver(go); ro.observe(el);
    document.fonts?.ready.then(go);
    return () => ro.disconnect();
  }, [spec]);
  // a phone's column is as wide as its longest chip needs for two lines; when that is wider than the part, the grid scrolls inside its box and says so
  const colMin = alignColMin(spec, chipW);
  // (the plane exists only for point grids: a cell grid measures its own scroll box)
  useEffect(() => {
    const sc = scroller.current; if (!sc || plane.current) return;
    const go = () => setWide(sc.scrollWidth > sc.clientWidth + 2);
    go(); const ro = new ResizeObserver(go); ro.observe(sc); document.fonts?.ready.then(go);
    return () => ro.disconnect();
  }, [spec]);
  const cell = (r: number, c: number) => spec.cells.find((x) => x.row === r && x.col === c);
  const regionOf = (r: number, c: number) => spec.regions.find((g) => c >= g.c0 && c <= g.c1 && r >= g.r0 && r <= g.r1);
  return (
    <div className={`al ${has ? "al-has-points" : ""}${spec.arrows ? " al-arrows" : ""}`} style={{ "--nx": nx, "--ny": ny, "--colmin": `${colMin}px` } as React.CSSProperties}>
      {spec.title ? <div className="al-title">{spec.title}</div> : null}
      <div className={`al-scroll${wide ? " is-wide" : ""}`} ref={scroller}>
      <div className="al-grid">
        <div className="al-corner" style={{ gridColumn: 1, gridRow: 1 }} />
        {spec.xs.map((x, c) => <div key={x} className="al-col" style={{ gridColumn: c + c0, gridRow: 1 }}>{x}</div>)}
        {spec.arrows ? <div className="al-ax al-ax-x" aria-hidden="true" style={{ gridColumn: `${c0} / span ${nx}`, gridRow: 2 }} /> : null}
        {spec.arrows ? <div className="al-ax al-ax-y" aria-hidden="true" style={{ gridColumn: 2, gridRow: `${r0} / span ${ny}` }} /> : null}
        {spec.regions.map((g, k) => (
          <div key={k} className={`al-region tone-${g.colour}`} aria-hidden="true" style={{ gridColumn: `${g.c0 + c0} / ${g.c1 + c0 + 1}`, gridRow: `${g.r0 + r0} / ${g.r1 + r0 + 1}` }}>{g.label ? <span className="al-region-label">{g.label}</span> : null}</div>
        ))}
        {spec.ys.map((y, r) => (
          <React.Fragment key={y}>
            <div className="al-row" style={{ gridColumn: 1, gridRow: r + r0 }}><span>{y}</span></div>
            {spec.xs.map((x, c) => {
              const cl = cell(r, c), g = regionOf(r, c);
              const cls = `al-cell${cl?.colour ? ` tone-${cl.colour} al-tint` : g ? " in-region" : ""}${g?.label && r === g.r0 ? " rg-top" : ""}`;
              return (
                <div key={x} className={cls} role="group" aria-label={`${x} / ${y}${g?.label ? ` (${g.label})` : ""}`} style={{ gridColumn: c + c0, gridRow: r + r0 }}>
                  {cl?.label ? <div className="al-cell-label">{cl.label}</div> : null}
                  {cl?.items.length ? <div className="al-items">{cl.items.map((it) => <Chip key={it.name} it={it} picked={picked} pick={pick} />)}</div> : null}
                </div>
              );
            })}
          </React.Fragment>
        ))}
        {has ? (
          <div className="al-plane" ref={plane} style={{ gridColumn: `${c0} / span ${nx}`, gridRow: `${r0} / span ${ny}` }}>
            {spec.points.map((p) => (
              <div key={p.name} className={`al-pt ${p.x > 0.6 ? "al-flip" : ""}`} data-x={p.x} data-y={p.y} style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}>
                <span className="al-link" /><span className="al-dot" />
                <span className="al-lab"><Chip it={p} picked={picked} pick={pick} /></span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      </div>
      {wide ? <p className="al-more">{ui.hintGrid ?? "↔ Swipe the grid to see all of it"}</p> : null}
      <NoteBar picked={picked} any={any} ui={ui} />
    </div>
  );
}
