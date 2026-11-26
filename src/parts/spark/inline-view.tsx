// The sparkline in a sentence, drawn (format version 11): a line or bars the height of the text, as plain inline SVG with the
// numbers in its label. Hover, focus or tap shows the numbers in a small card that opens to the side that fits on screen.
import React, { useState } from "react";
import type { InlineViewProps } from "../inline";
import type { Spark } from "./inline";
import { cssWord } from "../../safety";

const W = 64, H = 16, PAD = 2;
/** the geometry of one sparkline: pure, so the tests and the view read the same numbers */
export function sparkShapes(s: Spark): { bars: { x: number; y: number; w: number; h: number }[]; points: string; last: { x: number; y: number } | null } {
  const v = s.values, lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const y = (x: number) => H - PAD - ((x - lo) / span) * (H - PAD * 2);
  const xs = (i: number) => PAD + (v.length > 1 ? i / (v.length - 1) : 0) * (W - PAD * 2);
  if (s.style === "bar") {
    const bw = (W - PAD * 2) / v.length;
    return { bars: v.map((x, i) => { const h = Math.max(1.5, H - PAD - y(x)); return { x: PAD + i * bw + bw * 0.15, y: H - PAD - h, w: bw * 0.7, h }; }), points: "", last: null };
  }
  return { bars: [], points: v.map((x, i) => `${xs(i).toFixed(1)},${y(x).toFixed(1)}`).join(" "), last: { x: xs(v.length - 1), y: y(v[v.length - 1]) } };
}
const colour = (c: string) => (c === "muted" ? "var(--faint)" : c === "acc" ? "var(--spark-ink)" : `var(--${cssWord(c, "spark-ink")})`);
const r1 = (n: number) => n.toFixed(1);

export default function SparkInline({ text, data }: InlineViewProps<Spark>) {
  const [side, setSide] = useState<"left" | "right">("left");
  // the card opens to the left or the right of the sparkline, so it never runs past the screen's edge
  const place = (e: React.SyntheticEvent<HTMLElement>) => { const r = e.currentTarget.getBoundingClientRect(); setSide(r.left > window.innerWidth / 2 ? "right" : "left"); };
  if (!data.values.length) return <>{text}</>;   // a wrong use stays as written (the page's problems say what is wrong)
  const list = data.values.join(", ");
  const sh = sparkShapes(data), col = colour(data.colour);
  return (
    <span className="spark" tabIndex={0} role="img" aria-label={`Trend: ${list}`} data-vals={list} data-side={side} data-dh-slot="spark"
      onPointerEnter={place} onFocus={place} onPointerDown={place}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true" focusable="false">
        {data.style === "bar"
          ? sh.bars.map((b, i) => <rect key={i} x={r1(b.x)} y={r1(b.y)} width={r1(b.w)} height={r1(b.h)} rx="1" fill={col} />)
          : <><polyline points={sh.points} fill="none" stroke={col} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />{sh.last && <circle cx={r1(sh.last.x)} cy={r1(sh.last.y)} r="2.2" fill={col} />}</>}
      </svg>
    </span>
  );
}
