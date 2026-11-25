// The weather part's view (format version 11): day cards or an hour line, our own icons, and a units menu the reader
// switches on the part itself. The fence's units are only the default; a host may pass its own default (DocumentView partOptions.weather.units); the
// reader's choice is remembered in their browser (one store, shared by every weather part on the page; storage in try/catch).
// Static draws the forecast whole in the fence's unit, with no menu, and reads and writes no storage. Nothing is fetched.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { PartViewProps } from "../types";
import { useStatic } from "../kit/static";
import { useDh } from "../../react/context";
import { WEEKDAYS, dateWords, weekdayOf } from "../kit/places";
import type { WxRow, WxSpec } from "./part";
import { SkyIcon } from "./icons";
import { SKY_WORDS, STORAGE_KEY, numPressure, numRain, numTemp, numWind, pageStore, showPressure, showRain, showTemp, showWind, unitsShown, type Choice, type Units } from "./units";

/** The host's default units: `partOptions={{ weather: { units: { temp: "f" } } }}` on the document (the reader's own choice still wins). Only the known unit words count. */
function hostUnits(o: unknown): Choice | null {
  const u = o && typeof o === "object" ? (o as { units?: unknown }).units : null;
  if (!u || typeof u !== "object") return null;
  const out: Choice = {};
  const pick = (k: keyof Units, allowed: string[]) => { const v = (u as Record<string, unknown>)[k]; if (typeof v === "string" && allowed.includes(v)) (out as Record<string, string>)[k] = v; };
  pick("temp", ["c", "f"]); pick("wind", ["kmh", "mph", "ms", "kn"]); pick("rain", ["mm", "in"]); pick("pressure", ["hpa", "inhg"]);
  return Object.keys(out).length ? out : null;
}

// the words of this part (the renderer's own word list has no weather words yet)
const WORDS = { units: "Units", swipe: "↔ Swipe to see all of it", foot: "Written in the source; nothing is fetched.", footLive: " Switch the units above; your choice is remembered in this browser.", chance: "chance of rain", forecast: "Forecast, scrolls sideways", hourly: "Hourly forecast, scrolls sideways", fallback: "Weather" };
const GROUPS: { key: keyof Units; label: string; options: [string, string][] }[] = [
  { key: "temp", label: "Temperature", options: [["c", "°C"], ["f", "°F"]] },
  { key: "wind", label: "Wind", options: [["kmh", "km/h"], ["mph", "mph"], ["ms", "m/s"], ["kn", "knots"]] },
  { key: "rain", label: "Rain", options: [["mm", "mm"], ["in", "inches"]] },
  { key: "pressure", label: "Pressure", options: [["hpa", "hPa"], ["inhg", "inHg"]] },
];
const NONE: Choice = {};
const COL_DAY = 108, COL_DAY_PHONE = 112, COL_HOUR = 76, GAP = 8, PAD = 14;

const label = (r: WxRow) => (r.time ? `${WEEKDAYS[weekdayOf(r.date)]} ${r.time}` : `${WEEKDAYS[weekdayOf(r.date)]} ${+r.date.slice(8)}`);

/** The forecast in the units `u` (every number is converted from the fence's unit, so a round trip is exact). */
export function Forecast({ spec, units: u }: { spec: WxSpec; units: Units }) {
  const src = spec.units, rows = spec.rows;
  const has = { wind: rows.some((r) => r.wind !== null), rain: rows.some((r) => r.precip !== null), pressure: rows.some((r) => r.pressure !== null) };
  const T = (v: number) => `${numTemp(v, src.temp, u.temp)}°`;
  const W = (r: WxRow) => (r.wind !== null ? showWind(r.wind, src.wind, u.wind) : "–");
  const aria = (r: WxRow) => `${dateWords(r.date)}${r.time ? ` ${r.time}` : ""}: ${SKY_WORDS[r.sky]}, ${r.lo === null ? showTemp(r.hi, src.temp, u.temp) : `high ${showTemp(r.hi, src.temp, u.temp)}, low ${showTemp(r.lo, src.temp, u.temp)}`}${r.chance !== null ? `, ${r.chance}% ${WORDS.chance}` : ""}${r.wind !== null ? `, wind ${W(r)}` : ""}${r.note ? `. ${r.note}` : ""}`;
  const temps = rows.flatMap((r) => (r.lo === null ? [r.hi] : [r.hi, r.lo])).map((v) => numTemp(v, src.temp, u.temp));
  const tmin = temps.length ? Math.min(...temps) : 0, tmax = temps.length ? Math.max(...temps) : 0, span = Math.max(1, tmax - tmin);
  const pos = (v: number) => ((numTemp(v, src.temp, u.temp) - tmin) / span) * 100;
  const ptsY = (v: number) => 24 + (1 - (numTemp(v, src.temp, u.temp) - tmin) / span) * 44;
  if (spec.kind === "day") {
    return (
      <ol className="wx-days">
        {rows.map((r) => (
          <li key={r.line} className="wx-day" data-dh-slot="day" aria-label={aria(r)}>
            <span className="wx-dl">{label(r)}</span>
            <SkyIcon sky={r.sky} />
            <span className="wx-sky">{SKY_WORDS[r.sky]}</span>
            <span className="wx-hl"><b data-wx="hi">{T(r.hi)}</b><span data-wx="lo">{r.lo !== null ? T(r.lo) : ""}</span></span>
            <span className="wx-band" aria-hidden="true"><i style={{ bottom: `${pos(r.lo ?? r.hi)}%`, height: `${Math.max(6, pos(r.hi) - pos(r.lo ?? r.hi))}%` }} /></span>
            <span className="wx-rain" title={WORDS.chance}><i style={{ height: `${r.chance ?? 0}%` }} /><em>{r.chance !== null ? `${r.chance}%` : "–"}</em></span>
            {has.rain ? <span className="wx-m" data-wx="precip">{r.precip !== null ? showRain(r.precip, src.rain, u.rain) : "–"}</span> : null}
            {has.wind ? <span className="wx-m" data-wx="wind">{W(r)}</span> : null}
            {has.pressure ? <span className="wx-m" data-wx="pressure">{r.pressure !== null ? showPressure(r.pressure, src.pressure, u.pressure) : "–"}</span> : null}
            {r.note ? <span className="wx-note">{r.note}</span> : null}
          </li>
        ))}
      </ol>
    );
  }
  const w = rows.length * COL_HOUR;
  return (
    <div className="wx-hours" style={{ minWidth: w }}>
      <ol className="wx-hrow" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>{rows.map((r) => <li key={r.line} aria-label={aria(r)}><span className="wx-dl">{r.time}</span><SkyIcon sky={r.sky} /></li>)}</ol>
      <svg className="wx-plot" width="100%" height="84" aria-hidden="true">
        <svg width="100%" height="84" viewBox={`0 0 ${w} 84`} preserveAspectRatio="none">
          <polyline vectorEffect="non-scaling-stroke" points={rows.map((r, k) => `${k * COL_HOUR + COL_HOUR / 2},${ptsY(r.hi)}`).join(" ")} />
        </svg>
        {rows.map((r, k) => <g key={r.line}><circle cx={`${((k + 0.5) / rows.length) * 100}%`} cy={ptsY(r.hi)} r="4" /><text x={`${((k + 0.5) / rows.length) * 100}%`} y={ptsY(r.hi) - 10} textAnchor="middle" data-wx="hi">{T(r.hi)}</text></g>)}
      </svg>
      <ol className="wx-hrow wx-hbars" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>{rows.map((r) => <li key={r.line}><span className="wx-rain"><i style={{ height: `${r.chance ?? 0}%` }} /><em>{r.chance !== null ? `${r.chance}%` : "–"}</em></span>{has.wind ? <span className="wx-m" data-wx="wind">{W(r)}</span> : null}</li>)}</ol>
    </div>
  );
}

/** The units menu: one group of real buttons per value the part has (temperature always). Tab reaches every button; Space or Enter picks it. */
export function UnitsMenu({ spec, units, onChoose }: { spec: WxSpec; units: Units; onChoose: (key: keyof Units, value: string) => void }) {
  const rows = spec.rows;
  const has = { temp: true, wind: rows.some((r) => r.wind !== null), rain: rows.some((r) => r.precip !== null), pressure: rows.some((r) => r.pressure !== null) };
  return (
    <div className="wx-units" role="group" aria-label={WORDS.units} data-dh-slot="units">
      {GROUPS.filter((g) => has[g.key]).map((g) => (
        <div key={g.key} className="wx-ug" role="group" aria-label={g.label}>
          <span className="wx-ul" aria-hidden="true">{g.label}</span>
          <span className="wx-seg">{g.options.map(([v, w]) => <button key={v} type="button" data-unit={`${g.key}:${v}`} aria-pressed={units[g.key] === v} onClick={() => onChoose(g.key, v)}>{w}</button>)}</span>
        </div>
      ))}
    </div>
  );
}

const useIso = typeof window === "undefined" ? useEffect : useLayoutEffect;

export default function WeatherView({ data: spec, static: stp, stage }: PartViewProps<WxSpec>) {
  const sx = useStatic(stp, 0), live = !sx.on;
  const wx = useDh().partOptions?.weather;
  const host = useMemo(() => hostUnits(wx), [wx]);
  // the reader's choice: read only when live (a static part and the server touch no storage)
  const choice = useSyncExternalStore(pageStore.subscribe, live ? pageStore.get : () => NONE, () => NONE);
  const units = useMemo(() => (live ? unitsShown(spec.units, host, choice) : spec.units), [live, spec.units, host, choice]);
  useEffect(() => {
    if (!live) return;
    const on = (e: StorageEvent) => { if (e.key === STORAGE_KEY || e.key === null) pageStore.reload(); };
    window.addEventListener("storage", on);
    return () => window.removeEventListener("storage", on);
  }, [live]);
  // "Swipe" shows when the columns are wider than the part (the part's width is known after the first measure)
  const n = spec.rows.length;
  const need = spec.kind === "day" ? n * (stage.width > 640 ? COL_DAY : COL_DAY_PHONE) + Math.max(0, n - 1) * GAP + PAD : n * COL_HOUR + PAD;
  const wide = need > 360, swipe = stage.width > 0 && stage.width < need;
  const box = useRef<HTMLDivElement>(null);
  void useIso;
  const head = spec.place || spec.title || WORDS.fallback;
  return (
    <div className="dh-dg wx" data-dh-static={sx.on || undefined}>
      <div className="wx-head">
        <div className="wx-place"><b>{head}</b>{spec.place && spec.title ? <span> · {spec.title}</span> : null}</div>
        {live ? <UnitsMenu spec={spec} units={units} onChoose={(k, v) => pageStore.choose(k, v)} /> : null}
      </div>
      <div className="wx-scroll" ref={box} tabIndex={0} role="group" aria-label={spec.kind === "day" ? WORDS.forecast : WORDS.hourly}>
        <Forecast spec={spec} units={units} />
      </div>
      {wide ? <p className="wx-hint" style={{ visibility: swipe ? "visible" : "hidden" }} aria-hidden={swipe ? undefined : true}>{WORDS.swipe}</p> : null}
      <p className="wx-foot">{WORDS.foot}{live ? WORDS.footLive : ""}</p>
    </div>
  );
}
