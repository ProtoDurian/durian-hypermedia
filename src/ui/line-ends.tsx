// Line ends and end labels on the 2D stage (the shapes are src/core/line-ends.ts).
import React from "react";
import { glyphOf, markAt, toStage, type P } from "../core/line-ends";
import { bezOff, bezTan, CHIP, type Edge, type Geom } from "../core/scene";
import { PORT_GAP } from "../core/route";

export function LineEnds({ e, g, slot = "line-end" }: { e: Edge; g: Geom; slot?: string }) {
  if (!e.ends) return null;
  return <g className="scn-ends" data-dh-slot={slot}>{(["a", "b"] as const).map((side) => {
    const mark = markAt(e.style, e.ends, side);
    if (!mark) return null;
    const t = bezTan(g, side === "a" ? 0 : 1), dir: P = side === "a" ? t : { x: -t.x, y: -t.y }, at = side === "a" ? g.P : g.Q;
    const put = (q: P) => toStage(q, at, dir, PORT_GAP), gl = glyphOf(mark);
    const ring = gl.ring && put({ x: gl.ring.x, y: 0 });
    return <g key={side} data-end={side} data-mark={mark}>
      {gl.polys.map((pl, k) => {
        const d = `M${pl.pts.map(put).map((q) => `${q.x.toFixed(2)} ${q.y.toFixed(2)}`).join("L")}${pl.fill ? "Z" : ""}`;
        return <path key={k} className={`scn-end${pl.fill ? ` is-${pl.fill}` : ""}`} d={d} />;
      })}
      {ring && <circle className="scn-end is-paper" cx={ring.x} cy={ring.y} r={gl.ring!.r} />}
    </g>;
  })}</g>;
}

export function EndLabels({ e, g, slot = "end-label" }: { e: Edge; g: Geom; slot?: string }) {
  if (!e.tags) return null;
  return <>{e.tags.map((tg) => {
    const c = bezOff(g, tg.t, tg.o);
    return <text key={tg.end} className="scn-end-t" data-end={tg.end} data-dh-slot={slot} x={c.x} y={c.y} textAnchor="middle" dominantBaseline="central" style={{ fontSize: CHIP.font }}>{tg.text}</text>;
  })}</>;
}
