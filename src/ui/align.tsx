// This package is the source of this file: edit it here. It began as a copy synced from a private prototype (scripts/sync.ts, now frozen).
// The alignment grid part (format version 8): a 2x2 or 3x3 grid with named axis ends. Items sit in cells, or at points
// (a dot, and its label placed where it overlaps no other). Rendered at build time, hydrated in the browser, where the
// point labels are placed by measuring and a tap (or hover) on an item with a note shows the note under the grid.
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AlignSpec } from "../core/align";
import { Chip, NoteBar, type Picked } from "./tier";
import type { Ui } from "./ui";

const useIsoLayout = typeof window === "undefined" ? useEffect : useLayoutEffect;
type R = { l: number; t: number; r: number; b: number };
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
  const mine = (k: number) => placed.filter((_, j) => j !== k);
  const order = pts.map((_, k) => k).sort((a, b) => dots[a].y - dots[b].y || dots[a].x - dots[b].x);
  const labels: R[] = [];
  for (const k of order) {
    const lab = pts[k].querySelector<HTMLElement>(".al-lab")!;
    lab.style.transform = "none"; lab.style.left = "0px"; lab.style.right = "auto"; lab.style.top = "0px";
    const w = lab.offsetWidth, h = lab.offsetHeight, { x, y } = dots[k];
    const c: [number, number][] = [[10, -h / 2], [-10 - w, -h / 2], [-w / 2, 9], [-w / 2, -9 - h], [10, 5], [10, -5 - h], [-10 - w, 5], [-10 - w, -5 - h]];
    for (let s = 1; s <= 4; s++) for (const dy of [s * (h + 3), -s * (h + 3)]) { c.push([10, -h / 2 + dy], [-10 - w, -h / 2 + dy], [-w / 2, 9 + dy], [-w / 2, -9 - h + dy]); }
    let best: { at: [number, number]; cost: number } | null = null;
    for (const at of c) {
      const r: R = { l: x + at[0], t: y + at[1], r: x + at[0] + w, b: y + at[1] + h };
      const out = (r.l < 0 ? -r.l : 0) + (r.r > W ? r.r - W : 0) + (r.t < 0 ? -r.t : 0) + (r.b > H ? r.b - H : 0);
      const cost = out * 40 + [...labels, ...mine(k)].reduce((n, o) => n + hit(r, o), 0);
      if (!best || cost < best.cost) best = { at, cost };
      if (!cost) break;
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
  const n = spec.xs.length;
  const has = spec.points.length > 0;
  const any = spec.cells.some((c) => c.items.some((i) => i.note)) || spec.points.some((p) => p.note);
  useIsoLayout(() => {
    const el = plane.current;
    if (!el) return;
    const go = () => placeLabels(el);
    go();
    const ro = new ResizeObserver(go); ro.observe(el);
    document.fonts?.ready.then(go);
    return () => ro.disconnect();
  }, [spec]);
  const cell = (r: number, c: number) => spec.cells.find((x) => x.row === r && x.col === c);
  return (
    <div className={`al al-${n} ${has ? "al-has-points" : ""}`} style={{ "--n": n } as React.CSSProperties}>
      {spec.title ? <div className="al-title">{spec.title}</div> : null}
      <div className="al-grid">
        <div className="al-corner" style={{ gridColumn: 1, gridRow: 1 }} />
        {spec.xs.map((x, c) => <div key={x} className="al-col" style={{ gridColumn: c + 2, gridRow: 1 }}>{x}</div>)}
        {spec.ys.map((y, r) => (
          <React.Fragment key={y}>
            <div className="al-row" style={{ gridColumn: 1, gridRow: r + 2 }}><span>{y}</span></div>
            {spec.xs.map((x, c) => {
              const cl = cell(r, c);
              return (
                <div key={x} className="al-cell" role="group" aria-label={`${x} / ${y}`} style={{ gridColumn: c + 2, gridRow: r + 2 }}>
                  {cl?.label ? <div className="al-cell-label">{cl.label}</div> : null}
                  {cl?.items.length ? <div className="al-items">{cl.items.map((it) => <Chip key={it.name} it={it} picked={picked} pick={pick} />)}</div> : null}
                </div>
              );
            })}
          </React.Fragment>
        ))}
        {has ? (
          <div className="al-plane" ref={plane}>
            {spec.points.map((p) => (
              <div key={p.name} className={`al-pt ${p.x > 0.6 ? "al-flip" : ""}`} data-x={p.x} data-y={p.y} style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}>
                <span className="al-link" /><span className="al-dot" />
                <span className="al-lab"><Chip it={p} picked={picked} pick={pick} /></span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <NoteBar picked={picked} any={any} ui={ui} />
    </div>
  );
}
