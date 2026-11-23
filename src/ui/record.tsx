// The record entity on the 2D stage (SPEC 3.2): src/core/record.ts places every word; this only draws them.
import React from "react";
import type { Box, Rect } from "../core/scene";
import type { HeadLay, RowLay } from "../core/record";

const R = 7;
// the part's own slot names: a class's, an entity's, else the record's
const slots = (as?: string) => as === "entity" ? { box: "entity", name: "entity-name", row: "column", method: "column" }
  : as ? { box: "class", name: "class-name", row: "field", method: "method" }
  : { box: "record", name: "record-name", row: "field", method: "field" };

export function RecordBox({ b, r, o }: { b: Box; r: Rect; o: number }) {
  const h = (b.ent as any)._head as HeadLay | undefined, as = b.ent.as, s = slots(as);
  if (!h) return null;
  const cx = r.x + r.w / 2, full = r.h - h.h < 1;
  const band = full
    ? `M${r.x + R} ${r.y}h${r.w - 2 * R}a${R} ${R} 0 0 1 ${R} ${R}v${r.h - 2 * R}a${R} ${R} 0 0 1 ${-R} ${R}h${2 * R - r.w}a${R} ${R} 0 0 1 ${-R} ${-R}v${2 * R - r.h}a${R} ${R} 0 0 1 ${R} ${-R}z`
    : `M${r.x + R} ${r.y}h${r.w - 2 * R}a${R} ${R} 0 0 1 ${R} ${R}v${h.h - R}h${-r.w}v${R - h.h}a${R} ${R} 0 0 1 ${R} ${-R}z`;
  return <g data-dh-slot={s.box} data-record={as ?? "record"}>
    <rect className="scn-frame scn-rec" x={r.x} y={r.y} width={r.w} height={r.h} rx={R} />
    <path className="scn-rec-head" d={band} />
    {o > 0.02 && <g style={o < 1 ? { opacity: o } : undefined}>
      {h.chip && <g data-dh-slot="stereotype">
        <rect className="scn-rec-chip" x={cx - h.chip.w / 2} y={r.y + h.chip.y - 8} width={h.chip.w} height={16} rx={8} />
        <text className="scn-rec-st" x={cx} y={r.y + h.chip.y} textAnchor="middle" dominantBaseline="central">{h.chip.t}</text>
      </g>}
      <text className={`scn-rec-name${as === "abstract" ? " is-i" : ""}`} data-dh-slot={s.name} textAnchor="middle" dominantBaseline="central" style={{ fontSize: h.font }}>
        {h.lines.map((l, k) => <tspan key={k} x={cx} y={r.y + l.y}>{l.t}</tspan>)}
      </text>
    </g>}
    <rect className="scn-rec-edge" x={r.x} y={r.y} width={r.w} height={r.h} rx={R} />
  </g>;
}

export function FieldRow({ b, r, o }: { b: Box; r: Rect; o: number }) {
  const row = (b.ent as any)._row as RowLay | undefined, s = slots(b.ent.as);
  if (!row) return null;
  return <g data-dh-slot={row.method ? s.method : s.row}>
    <rect className="scn-field" x={r.x + 0.75} y={r.y} width={r.w - 1.5} height={r.h} />
    {row.band && <line className="scn-rec-rule" x1={r.x} x2={r.x + r.w} y1={r.y} y2={r.y} />}
    {o > 0.02 && <g style={o < 1 ? { opacity: o } : undefined}>
      {row.words.map((w, k) => w.cls === "key"
        ? <g key={k} data-dh-slot="key">
          <rect className="scn-key" x={r.x + r.w - w.x - w.w} y={r.y + w.y - 7.5} width={w.w} height={15} rx={3} />
          <text className="scn-key-t" x={r.x + r.w - w.x - w.w / 2} y={r.y + w.y} textAnchor="middle" dominantBaseline="central">{w.t}</text>
        </g>
        : <text key={k} className={`scn-field-t is-${w.cls}${w.cls === "name" && row.italic ? " is-i" : ""}${w.cls === "name" && row.under ? " is-u" : ""}`} x={r.x + w.x} y={r.y + w.y} dominantBaseline="central" style={{ fontSize: row.font }}>{w.t}</text>)}
    </g>}
  </g>;
}
