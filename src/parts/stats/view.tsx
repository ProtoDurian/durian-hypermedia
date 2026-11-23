// The stats part's view (format version 11): a grid of tiles, 2 to 4 to a row on a wide stage and 2 on a phone. Our own SVG
// for the arrow and the sparkline, real text for every word. Nothing in it moves or steps, so static draws the same tiles
// (marked static). A page that did not read draws its first problem instead of tiles.
import React from "react";
import { useStatic } from "../kit/static";
import { cx } from "../kit/view";
import type { PartViewProps } from "../types";
import type { StatsData, Tile } from "./part";

const W = { cannot: "These stat tiles cannot be drawn:" };

function Spark({ v, name }: { v: number[]; name: string }) {
  const w = 120, h = 36, pad = 3;
  let lo = v[0], hi = v[0];
  for (const x of v) { if (x < lo) lo = x; if (x > hi) hi = x; }
  const span = hi - lo || 1;
  const pts = v.map((x, i) => [pad + (i * (w - 2 * pad)) / (v.length - 1), h - pad - ((x - lo) / span) * (h - 2 * pad)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
  const last = pts[pts.length - 1];
  const dir = v[v.length - 1] > v[0] ? "up" : v[v.length - 1] < v[0] ? "down" : "flat";
  return (
    <svg className="stats-spark" data-dh-slot="spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${name}: ${v.join(", ")} (${dir})`} preserveAspectRatio="none">
      <path className="area" d={`${line}L${last[0].toFixed(1)} ${h}L${pts[0][0].toFixed(1)} ${h}z`} />
      <path className="ln" d={line} fill="none" />
      <circle cx={last[0]} cy={last[1]} r="2.6" />
    </svg>
  );
}

function TileView({ t }: { t: Tile }) {
  return (
    <li className={cx("stats-tile", t.colour && `tone-${t.colour}`)} data-dh-slot="tile">
      {t.glyph && <span className="stats-glyph" data-dh-slot="glyph" aria-hidden="true">{t.glyph}</span>}
      <div className="stats-name" data-dh-slot="stat-name">{t.name}</div>
      <div className="stats-value" data-dh-slot="stat-value">{t.value}</div>
      {t.sub && <div className="stats-sub" data-dh-slot="stat-sub">{t.sub}</div>}
      {t.trend && <span className="stats-trend" data-dh-slot="trend">{t.trend === "up" ? "↗" : t.trend === "down" ? "↘" : "→"} Trend: {t.trend}</span>}
      <div className="stats-foot">
        {t.change && (
          <span className={cx("stats-change", t.dir && `chg-${t.dir}`, t.colour ? `is-${t.colour}` : "is-plain")} data-dh-slot="stat-change">
            <svg viewBox="0 0 10 10" width="9" height="9" aria-hidden="true">{t.dir === "down" ? <path d="M5 8.6 1 2.4h8z" /> : t.dir === "up" ? <path d="M5 1.4 9 7.6H1z" /> : <path d="M1 4.2h8v1.6H1z" />}</svg>
            <span>{t.change.replace(/^-/, "−")}</span>
          </span>
        )}
        {t.note && <span className="stats-note">{t.note}</span>}
      </div>
      {t.spark.length > 1 && <Spark v={t.spark} name={t.name} />}
    </li>
  );
}

export default function StatsView({ data, static: stp }: PartViewProps<StatsData>) {
  const sx = useStatic(stp, 0);
  if (data.errors.length || !data.tiles.length) return <div className="stats"><div className="cw-error">{W.cannot} {data.errors[0]?.msg ?? "there is no tile"}</div></div>;
  return (
    <ul className="stats" aria-label={data.title || undefined} data-dh-static={sx.on || undefined}>
      {data.tiles.map((t, i) => <TileView key={i} t={t} />)}
    </ul>
  );
}
