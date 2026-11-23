// The map's regions and arcs (the format, the format), drawn in our own SVG on the still picture and on any provider's tiles:
// areas coloured by a value (countries and US states, from our own packed boundary files), arcs between places and regions
// (width follows the value), the scale legend and the list of values. The globe draws the same data (site/src/map-globe.tsx).
// The boundary files load only when a map uses them (a dynamic import), so a map of places pays nothing.
import React, { memo, useMemo } from "react";
import { binEdges, decodeRegions, fmtNum, mixCss, mixOf, regionName, regionPoint, US_STATES, WORLD, type Range, type RegionPoly } from "./geo";
import { merc, type LL, type MArc, type MFill, type MapSpec } from "./model";
import type { Camera } from "./model";

import {WORLD_DATA,WORLD_Q} from "./geo-world";
import {US_DATA,US_Q} from "./geo-us";

export const U = 16384; // a region path is drawn in world units: the whole world is U wide (a camera at zoom z shows it 256 * 2^z px wide)
export type GeoData = { world: Map<string, RegionPoly> | null; us: Map<string, RegionPoly> | null; failed: boolean };

export const needsLand = (s:MapSpec)=>s.fills.length>0||s.globe;
export const needsUs = (s:MapSpec)=>s.fills.some(f=>f.code.startsWith("US-"));
/** Decode only the bundled boundaries needed by this part; also works during server rendering. */
export function useGeo(spec:MapSpec,want:boolean):GeoData {
  return useMemo(()=>!want||!needsLand(spec)?{world:null,us:null,failed:false}:{
    world:decodeRegions(WORLD_DATA,WORLD,WORLD_Q,spec.geoPointLimit),
    us:needsUs(spec)?decodeRegions(US_DATA,US_STATES,US_Q,spec.geoPointLimit):null,failed:false
  },[spec,want]);
}

// ---------- region paths ----------
const D_CACHE = new WeakMap<RegionPoly, string>();
export function regionD(poly: RegionPoly): string {
  let d = D_CACHE.get(poly);
  if (d !== undefined) return d;
  const out: string[] = [];
  for (const p of poly) for (const ring of p) {
    ring.forEach(([lng, lat], i) => { const m = merc({ lat, lng }); out.push(`${i ? "L" : "M"}${(m.x * U).toFixed(1)} ${(m.y * U).toFixed(1)}`); });
    out.push("Z");
  }
  d = out.join("");
  D_CACHE.set(poly, d);
  return d;
}
/** the transform that puts world units under a camera in a w by h stage */
export const geoTransform = (c: Camera, w: number, h: number): string => { const S = 256 * 2 ** c.zoom; return `translate(${(w / 2 - c.cx * S).toFixed(2)} ${(h / 2 - c.cy * S).toFixed(2)}) scale(${(S / U).toFixed(6)})`; };

/** every fill's colour, one range for the whole map so a step never changes a colour */
export function fillColours(fills: MFill[], r: Range, spec: MapSpec): Map<string, string> {
  const m = new Map<string, string>();
  for (const f of fills) m.set(f.code, mixCss(mixOf(f.value, r, spec.scale)));
  return m;
}
export const valueWords = (raw: string, unit: string) => (unit ? `${raw} ${unit}` : raw);

/** the land with no value: world countries (and US states when states are filled), drawn once, never redrawn on a pan */
export const Land = memo(function Land({ geo, hide, states }: { geo: GeoData; hide: Set<string>; states: boolean }) {
  if (!geo.world) return null;
  const world = [...geo.world.entries()].filter(([code]) => !hide.has(code) && !(states && code === "US"));
  const us = states && geo.us ? [...geo.us.entries()].filter(([code]) => !hide.has(code)) : [];
  return (
    <g className="map-land" data-dh-slot="land">
      {world.map(([code, poly]) => <path key={code} className="map-region is-nodata" d={regionD(poly)} />)}
      {us.map(([code, poly]) => <path key={code} className="map-region is-nodata" d={regionD(poly)} />)}
    </g>
  );
});

/** the filled regions: a path each (a focusable button when there are few of them; the list under the map is the way in when there are many) */
export const Filled = memo(function Filled({ geo, fills, colours, unit, on, tab }: { geo: GeoData; fills: MFill[]; colours: Map<string, string>; unit: string; on: string | null; tab: boolean }) {
  return (
    <g className="map-filled" data-dh-slot="regions">
      {fills.map((f) => {
        const poly = f.code.startsWith("US-") ? geo.us?.get(f.code) : geo.world?.get(f.code);
        if (!poly) return null;
        return <path key={f.code} className={`map-region is-filled ${on === f.code ? "is-on" : ""}`} data-code={f.code} d={regionD(poly)} style={{ fill: colours.get(f.code) }} tabIndex={tab ? 0 : -1} role="button" aria-label={`${f.name}: ${valueWords(f.raw, unit)}`} />;
      })}
    </g>
  );
});

// ---------- arcs ----------
export type ArcGeom = { d: string; w: number; a: { x: number; y: number }; b: { x: number; y: number }; wrap: number; mid: { x: number; y: number }; aVis?: boolean; bVis?: boolean };
/** an arc in pixels: a curve bowed to the left of its travel (so a flow and its return take two lanes), and the world shift for an arc that crosses the date line */
export function arcGeom(arc: MArc, c: Camera, w: number, h: number, vmax: number): ArcGeom {
  const S = 256 * 2 ** c.zoom, ma = merc(arc.a), mb = merc(arc.b);
  let bx = mb.x, wrap = 0;
  if (Math.abs(bx - ma.x) > 0.5) { wrap = bx > ma.x ? 1 : -1; bx += bx > ma.x ? -1 : 1; } // go the short way round; a copy shifted by one world draws the other end
  const A = { x: w / 2 + (ma.x - c.cx) * S, y: h / 2 + (ma.y - c.cy) * S }, B = { x: w / 2 + (bx - c.cx) * S, y: h / 2 + (mb.y - c.cy) * S };
  const dx = B.x - A.x, dy = B.y - A.y, dist = Math.hypot(dx, dy) || 1, bow = Math.min(0.28, 0.12 + 40 / (dist + 120));
  const C = { x: (A.x + B.x) / 2 + (dy / dist) * dist * bow, y: (A.y + B.y) / 2 - (dx / dist) * dist * bow };
  const width = 2 + 12 * Math.sqrt(arc.value / vmax);
  return { d: `M${A.x.toFixed(1)} ${A.y.toFixed(1)}Q${C.x.toFixed(1)} ${C.y.toFixed(1)} ${B.x.toFixed(1)} ${B.y.toFixed(1)}`, w: width, a: A, b: B, wrap: wrap * S, mid: { x: 0.25 * A.x + 0.5 * C.x + 0.25 * B.x, y: 0.25 * A.y + 0.5 * C.y + 0.25 * B.y } };
}
export const arcTitle = (a: MArc) => `${a.a.name} → ${a.b.name}`;

export function ArcDraw({ arc, g, on, tab, label, pl, anchor }: { arc: MArc; g: ArcGeom; on: boolean; tab: boolean; label: string; pl: string; anchor: object }) {
  const body = (
    <>
      <path className="map-arc-casing" d={g.d} style={{ strokeWidth: g.w + 3 }} />
      <path className="map-arc-line" d={g.d} style={{ strokeWidth: g.w }} />
      <path className="map-arc-flow" d={g.d} style={{ strokeWidth: Math.max(2, g.w * 0.45) }} />
      {g.bVis !== false ? <circle className="map-arc-end" cx={g.b.x} cy={g.b.y} r={Math.max(3.5, g.w / 2 + 2)} /> : null}
      {g.aVis !== false ? <circle className="map-arc-start" cx={g.a.x} cy={g.a.y} r={3} /> : null}
    </>
  );
  return (
    <g className={`map-arc ${pl} ${on ? "is-on" : ""}`} data-dh-slot="arc" data-arc={arc.id}>
      {body}
      {g.wrap ? <g transform={`translate(${-g.wrap} 0)`}>{body}</g> : null}
      <path className="map-arc-hit" d={g.d} style={{ strokeWidth: Math.max(24, g.w + 8) }} tabIndex={tab ? 0 : -1} role="button" aria-label={label} {...anchor} />
      {g.wrap ? <path className="map-arc-hit" d={g.d} transform={`translate(${-g.wrap} 0)`} style={{ strokeWidth: Math.max(24, g.w + 8) }} aria-hidden="true" {...anchor} tabIndex={-1} /> : null}
    </g>
  );
}

// ---------- the legend ----------
export function ScaleLegend({ spec, range, lowIsNone }: { spec: MapSpec; range: Range; lowIsNone: boolean }) {
  const sc = spec.scale, unit = sc.unit;
  const sw = (v: number) => ({ background: mixCss(mixOf(v, range, sc)) });
  const ends = sc.kind === "steps" ? binEdges(range, sc.bins) : null;
  const stops = Array.from({ length: 9 }, (_, i) => mixCss(mixOf(range.lo + ((range.hi - range.lo) * i) / 8, range, sc))).join(", ");
  return (
    <div className="map-scale-legend" data-dh-slot="scale" role="group" aria-label={`Scale${unit ? `, ${unit}` : ""}: ${fmtNum(range.lo)} to ${fmtNum(range.hi)}`}>
      {ends ? (
        <div className="map-bands">
          {Array.from({ length: sc.bins }, (_, i) => (
            <span key={i} className="map-band" style={sw((ends[i] + ends[i + 1]) / 2)}><i>{fmtNum(ends[i])}{i === sc.bins - 1 ? ` – ${fmtNum(ends[i + 1])}` : ""}</i></span>
          ))}
        </div>
      ) : (
        <>
          <div className="map-ramp" style={{ background: `linear-gradient(in oklab to right, ${stops})` }} />
          <div className="map-ramp-ticks"><span>{fmtNum(range.lo)}</span>{range.mid !== null ? <span>{fmtNum(range.mid)}</span> : null}<span>{fmtNum(range.hi)}</span></div>
        </>
      )}
      <div className="map-scale-meta">{unit ? <span className="map-unit">{unit}</span> : null}{lowIsNone ? <span className="map-none"><i className="map-none-sw" />{sc.none}</span> : null}</div>
    </div>
  );
}

// ---------- the list of values (a way in for keys and phones: every region and arc is a button) ----------
export function ValuesPanel({ spec, fills, arcs, onShow, onArc, open, still=false }: { still?:boolean; spec: MapSpec; fills: MFill[]; arcs: MArc[]; onShow: (code: string) => void; onArc: (id: string) => void; open: string | null }) {
  const sorted = [...fills].sort((a, b) => b.value - a.value);
  const max = Math.max(...fills.map((f) => Math.abs(f.value)), 1e-9), amax = Math.max(...arcs.map((a) => a.value), 1e-9);
  const unit = spec.scale.unit;
  return (
    <>
      {fills.length ? (
        <details className="map-values" data-dh-slot="values" open={still || fills.length <= 12}>
          <summary>Values · {fills.length} region{fills.length === 1 ? "" : "s"}{unit ? ` · ${unit}` : ""}</summary>
          <ul>
            {sorted.map((f) => (
              <li key={f.code}><button disabled={still} type="button" className={`map-vrow ${open === f.code ? "is-on" : ""}`} onClick={() => onShow(f.code)} aria-label={`Show ${f.name} on the map: ${valueWords(f.raw, unit)}`}>
                <span className="map-vname">{f.name}</span>
                <span className="map-vbar" aria-hidden="true"><i style={{ width: `${Math.max(2, (Math.abs(f.value) / max) * 100)}%` }} /></span>
                <span className="map-vval">{f.raw}</span>
              </button></li>
            ))}
          </ul>
        </details>
      ) : null}
      {arcs.length ? (
        <details className="map-values" data-dh-slot="arcs" open={still || arcs.length <= 12}>
          <summary>Flows · {arcs.length} arc{arcs.length === 1 ? "" : "s"}{unit ? ` · ${unit}` : ""}</summary>
          <ul>
            {[...arcs].sort((a, b) => b.value - a.value).map((a) => (
              <li key={a.id}><button disabled={still} type="button" className={`map-vrow pl-${a.colour} ${open === a.id ? "is-on" : ""}`} onClick={() => onArc(a.id)} aria-label={`Show the arc ${arcTitle(a)}: ${valueWords(a.raw, unit)}`}>
                <span className="map-vname">{arcTitle(a)}</span>
                <span className="map-vbar" aria-hidden="true"><i style={{ width: `${Math.max(2, (a.value / amax) * 100)}%`, background: "var(--map-colour)" }} /></span>
                <span className="map-vval">{a.raw}</span>
              </button></li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}
export { regionName, regionPoint };
export type { LL };
