// pagecharts: the parts of a chart the page blocks add (SCENE-22 section 3): the log and linear switch, the key of styled series
// (their dashes and markers), and the calculator layout (inputs with units, formulas, a result). The chart part (chart.tsx) uses them.
// Plain React elements and tokens only; no HTML strings. In static mode (SPEC 4.1) there are no controls: the inputs are listed
// with their values, the switch and the key are text.
import React, { useEffect, useId, useState } from "react";
import type { ChartControl } from "../core/chart";
import { fmtValue } from "../core/chart11";
import { UNIT_TILES, formulaText, type CalcRow, type PcExt } from "../core/pagecharts";
import type { Val } from "../core/expr";
import type { Ui } from "./ui";

// English for every language for now, like words11.ts: the rest of the page's words are in ui.ts per language
const en = {
  axisScale: "Axis scale", linear: "Linear", log: "Log", scaleNow: "Showing a {s} axis",
  inputs: "Inputs", presets: "Presets", working: "How it adds up", result: "Result", reset: "Reset the inputs",
  key: "Key", hide: "Show or hide", on: "On", off: "Off",
};
export type PW = typeof en;
export const PW = (ui: Ui): PW => ({ ...en, ...((ui as any).w11 ?? {}) });

/** Linear and Log, two buttons: the reader switches the scale; the chart starts as the author wrote it */
export function ScaleToggle({ log, onChange, w }: { log: boolean; onChange: (log: boolean) => void; w: PW }) {
  return (
    <div className="pc-scale" role="group" aria-label={w.axisScale} data-dh-slot="scale-toggle">
      <span className="pc-scale-label">{w.axisScale}</span>
      <span className="pc-seg">
        <button type="button" className="pc-seg-b" aria-pressed={!log} onClick={() => onChange(false)}>{w.linear}</button>
        <button type="button" className="pc-seg-b" aria-pressed={log} onClick={() => onChange(true)}>{w.log}</button>
      </span>
    </div>
  );
}

/** full width: the figure of a calculator leaves the text column the way the stage's does, centred on the page and at most
 *  --pc-max wide (the same 1180 px as the stage's --stg-max, so a scene stage and its calculator line up). Sets two variables on the figure; print and a narrow page keep the column. */
export function useBreakout(ref: React.RefObject<HTMLElement | null>, on: boolean) {
  useEffect(() => {
    const fig = on ? (ref.current?.closest("figure") as HTMLElement | null) : null;
    if (!fig) return;
    const place = () => {
      fig.style.removeProperty("--pc-fig-w"); fig.style.removeProperty("--pc-fig-ml");
      const page = document.documentElement.clientWidth, cs = getComputedStyle(fig);
      const max = parseFloat(cs.getPropertyValue("--pc-max")) || parseFloat(cs.getPropertyValue("--stg-max")) || 1180;
      const gut = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--gutter")) || 16, col = fig.getBoundingClientRect();
      const want = Math.min(max, page - 2 * Math.min(gut, 24));
      if (want <= col.width + 1) return;
      fig.style.setProperty("--pc-fig-w", `${want}px`); fig.style.setProperty("--pc-fig-ml", `${(page - want) / 2 - col.left}px`);
    };
    place();
    addEventListener("resize", place);
    return () => { removeEventListener("resize", place); fig.style.removeProperty("--pc-fig-w"); fig.style.removeProperty("--pc-fig-ml"); };
  }, [on]);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
function NumberField({ value, min, max, step, label, onSet }: { value: number; min: number; max: number; step: number; label: string; onSet: (v: number) => void }) {
  const [t, setT] = useState(String(value));
  useEffect(() => { setT((cur) => (Number(cur) === value ? cur : String(value))); }, [value]);
  return (
    <input className="pc-num" type="number" inputMode="decimal" aria-label={label} min={min} max={max} step={step} value={t}
      onChange={(e) => { const s = e.currentTarget.value; setT(s); const n = parseFloat(s); if (Number.isFinite(n)) onSet(clamp(n, min, max)); }}
      onBlur={() => setT(String(value))} />
  );
}

const rowValue = (row: CalcRow, v: Val | undefined): string => {
  if (typeof v === "number" && !Number.isFinite(v)) return "n/a"; // an input the formula cannot take (a division by 0): never "Infinity"
  if (typeof v !== "number") return String(v ?? "");
  const s = fmtValue(v, row.format, row.currency);
  return row.unit ? `${s} ${row.unit}` : s;
};

const toneClass = (t?: string) => `tone-${(t ?? "acc").replace(/^c?([1-8])$/, "c$1")}`;
/** a counted grid of tiles, one kind per colour and one look per kind (solid, outlined, struck) so colour is never alone;
 *  at most UNIT_TILES tiles are drawn and the rest is said in words. This is the hook where the stage's own units grid can be swapped in. */
export function UnitsGrid({ units, counts, label, slots, perRow }: { units: NonNullable<CalcRow["units"]>; counts: number[]; label: string; slots?: number; perRow?: number }) {
  let room = Math.min(UNIT_TILES, slots ?? UNIT_TILES);
  const total = counts.reduce((a, n) => a + Math.max(0, Math.round(n)), 0);
  const tiles: React.ReactNode[] = [];
  units.forEach((u, k) => {
    const n = Math.max(0, Math.round(counts[k] ?? 0)), draw = Math.min(n, room);
    room -= draw;
    for (let i = 0; i < draw; i++) tiles.push(<i key={`${k}-${i}`} className={`pc-tile pc-tile-${k % 3} ${toneClass(u.tone)}`} aria-hidden="true" />);
  });
  const cap = Math.min(UNIT_TILES, slots ?? UNIT_TILES), drawn = cap - room;
  if (slots) for (let i = 0; i < room; i++) tiles.push(<i key={`e-${i}`} className="pc-tile pc-tile-empty" aria-hidden="true" />); // unused slots, drawn pale
  return (
    <div className="pc-units" role="group" aria-label={label} data-dh-slot="units">
      <div className="pc-tiles" style={perRow ? ({ "--pc-per-row": perRow } as React.CSSProperties) : undefined} data-per-row={perRow || undefined}>{tiles}{total > drawn && <span className="pc-more">… {(total - drawn).toLocaleString("en-US")} more</span>}</div>
      <ul className="pc-units-key">{units.map((u, k) => <li key={u.kind}><i className={`pc-tile pc-tile-${k % 3} ${toneClass(u.tone)}`} aria-hidden="true" /><span>{u.kind}</span> <b>{Math.max(0, Math.round(counts[k] ?? 0)).toLocaleString("en-US")}</b></li>)}</ul>
    </div>
  );
}

/** a formula with the values written in: `ceil(123 MB / 8 MB)`; inputs carry their unit, other names their formatted value */
const workedFormula = (r: CalcRow, calc: NonNullable<PcExt["calc"]>, vars: Record<string, Val>): string => {
  const unit = new Map(calc.inputs.map((i) => [i.name, i.unit] as const));
  const fmtRow = new Map(calc.rows.map((x) => [x.name, x] as const));
  return formulaText(r.src, (id) => {
    const v = vars[id];
    if (typeof v === "number") { const row = fmtRow.get(id); const t = row ? rowValue(row, v) : v.toLocaleString("en-US", { maximumSignificantDigits: 8 }); return unit.get(id) ? `${t} ${unit.get(id)}` : t; }
    return typeof v === "string" ? v : undefined;
  }, false);
};

/** the calculator layout: inputs on the left, the working and the result on the right (stacked on a narrow page) */
export function Calculator({ calc, controls, vals, set, reset, vars, isStatic, w, error }: {
  calc: NonNullable<PcExt["calc"]>; controls: ChartControl[]; vals: Record<string, Val>; set: (k: string, v: Val) => void; reset: () => void;
  vars: Record<string, Val>; isStatic: boolean; w: PW; error?: string;
}) {
  const uid = useId();
  const presets = controls.filter((c) => c.kind === "button"); // the preset buttons sit in a header row above the inputs
  const worked = calc.formulaLook === "worked";
  const unitOf = (name: string) => calc.inputs.find((i) => i.name === name)?.unit;
  const row = (r: CalcRow) => {
    const x = vars[r.name];
    if (r.result) return (
      <div key={r.name} className="pc-result" role="status" aria-label={w.result} data-dh-slot="calc-result">
        <span className="pc-result-label">{r.label}</span>
        <span className="pc-result-value">{rowValue(r, x)}</span>
        <span className="pc-result-formula">{r.formula}</span>
      </div>
    );
    if (r.verdict) { const t = r.toneFrom ? String(vars[r.toneFrom] ?? "") : r.tone; return <p key={r.name} className={`pc-verdict ${toneClass(t)}`} data-dh-slot="calc-verdict"><span className="pc-verdict-label">{r.label}</span> <b>{String(x ?? "")}</b></p>; }
    if (r.units) return <div key={r.name} className="pc-units-row" data-dh-slot="calc-units"><span className="pc-units-label">{r.label}</span><UnitsGrid units={r.units} counts={Array.isArray(x) ? (x as number[]) : []} label={r.label} slots={r.slots} perRow={r.perRow} /></div>;
    if (worked && !r.note) return <p key={r.name} className="pc-line" data-dh-slot="calc-line"><span className="pc-line-label">{r.label}:</span> <span className="pc-line-formula">{workedFormula(r, calc, vars)}</span> = <b>{rowValue(r, x)}</b></p>;
    return (
      <div key={r.name} className="pc-row" data-dh-slot="calc-row">
        <span className="pc-row-label">{r.label}</span>
        <span className="pc-row-value">{rowValue(r, x)}</span>
        <span className="pc-row-formula">{r.formula}</span>
      </div>
    );
  };
  return (
    <div className="pc-calc" data-dh-slot="calculator" data-inputs={calc.inputLook} data-formulas={calc.formulaLook}>
      {!isStatic && presets.length > 0 && <div className="pc-presets" role="group" aria-label={w.presets} data-dh-slot="presets">{presets.map((c) => <button key={c.name} type="button" className="btn btn-s" onClick={() => { for (const [k, v] of Object.entries(c.set ?? {})) set(k, v as Val); }}>{c.label ?? c.name}</button>)}</div>}
      <section className="pc-in" aria-label={w.inputs}>
        <h4 className="pc-h">{w.inputs}</h4>
        {isStatic ? (
          <dl className="pc-in-static">
            {controls.filter((c) => c.kind !== "button").map((c) => {
              const v = vals[c.name]; const u = unitOf(c.name);
              return <div key={c.name} className="pc-in-row"><dt>{c.label ?? c.name}</dt><dd>{c.kind === "toggle" ? (v ? w.on : w.off) : String(v)}{u ? <span className="pc-unit"> {u}</span> : null}</dd></div>;
            })}
          </dl>
        ) : (
          <div className="pc-fields">
            {controls.map((c, i) => {
              const id = `${uid}-${i}`;
              if (c.kind === "slider") {
                const u = unitOf(c.name);
                const inLabel = calc.inputLook === "label";
                return (
                  <div key={c.name} className="pc-field">
                    <label className="pc-lab" htmlFor={id}>{c.label ?? c.name}{inLabel && <> <b className="pc-lab-v">{String(vals[c.name])}{u ? ` ${u}` : ""}</b></>}</label>
                    <div className="pc-ctl">
                      <input id={id} className="pc-range" type="range" min={c.min} max={c.max} step={c.step ?? 1} value={vals[c.name] as number} onChange={(e) => set(c.name, +e.currentTarget.value)} />
                      {!inLabel && <span className="pc-box"><NumberField value={vals[c.name] as number} min={c.min as number} max={c.max as number} step={c.step ?? 1} label={`${c.label ?? c.name}${u ? ` (${u})` : ""}`} onSet={(n) => set(c.name, n)} />{u && <span className="pc-unit">{u}</span>}</span>}
                    </div>
                  </div>
                );
              }
              if (c.kind === "select") {
                const u = unitOf(c.name);
                return (
                  <div key={c.name} className="pc-field">
                    <label className="pc-lab" htmlFor={id}>{c.label ?? c.name}</label>
                    <div className="pc-ctl"><select id={id} className="pc-select" value={String(vals[c.name])} onChange={(e) => set(c.name, c.options!.find((o) => String(o) === e.currentTarget.value)!)}>{c.options!.map((o) => <option key={String(o)} value={String(o)}>{String(o)}</option>)}</select>{u && <span className="pc-unit">{u}</span>}</div>
                  </div>
                );
              }
              if (c.kind === "toggle") return <div key={c.name} className="pc-field"><label className="pc-check"><input type="checkbox" checked={!!vals[c.name]} onChange={(e) => set(c.name, e.currentTarget.checked)} /><span>{c.label ?? c.name}</span></label></div>;
              return null;
            })}
            <div className="pc-actions">
              <button type="button" className="btn btn-s btn-quiet" onClick={reset}>{w.reset}</button>
            </div>
          </div>
        )}
      </section>
      <section className="pc-out" aria-label={w.working}>
        <h4 className="pc-h">{w.working}</h4>
        {error && <div className="cw-error" role="alert">{error}</div>}
        {!error && <div className="pc-rows">{(() => {
          const out: React.ReactNode[] = []; let run: React.ReactNode[] = [];
          const flush = () => { if (run.length) out.push(<div key={`p${out.length}`} className="pc-panel" data-dh-slot="calc-panel">{run}</div>); run = []; };
          calc.rows.forEach((r) => { const plain = worked && !r.result && !r.verdict && !r.units && !r.note; const el = row(r); if (plain) run.push(el); else { flush(); out.push(el); } });
          flush(); return out;
        })()}</div>}
      </section>
    </div>
  );
}
