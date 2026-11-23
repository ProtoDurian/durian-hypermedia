// Inline marks (SPEC 6.15) as React elements: text only, never HTML.
import React from "react";
import { lineRuns, spans } from "../core/inline";
import { textW } from "../core/scene";

export function Rich({ text }: { text: string }) {
  return <>{spans(text).map((s, k) => {
    let el: React.ReactNode = s.code ? <code className="scn-code" data-dh-slot="code">{s.t}</code> : s.t;
    if (s.i) el = <em>{el}</em>;
    if (s.b) el = <strong>{el}</strong>;
    return <React.Fragment key={k}>{el}</React.Fragment>;
  })}</>;
}

// speech with marks on the 2D stage: each run sits where the engine measured it, and is held to that width
export function RichWords({ text, lines, x, y, font }: { text: string; lines: string[]; x: number; y: number; font: number }) {
  const rows = lineRuns(text, lines, font, textW), lh = Math.round(font * 1.3), y0 = y - ((rows.length - 1) * lh) / 2;
  return <g>{rows.map((row, k) => {
    const left = x - row.w / 2, cy = y0 + k * lh;
    return <g key={k}>{row.runs.map((r, j) => <g key={j}>
      {r.code && <rect className="scn-code-bg" x={left + r.x} y={cy - lh / 2 + 0.5} width={r.w} height={lh - 1} rx={3} />}
      <text className={["scn-say-t", r.code && "is-code", r.b && "is-b", r.i && "is-i"].filter(Boolean).join(" ")} x={left + r.x + r.w / 2} y={cy} textAnchor="middle" dominantBaseline="central"
        textLength={Math.max(1, r.code ? r.w - 2 * CHIP_PAD : r.w)} lengthAdjust="spacingAndGlyphs" style={{ fontSize: r.code ? font * 0.94 : font }}>{r.t}</text>
    </g>)}</g>;
  })}</g>;
}
const CHIP_PAD = 3;
