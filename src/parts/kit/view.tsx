// The parts' kit, React side: the step player every stepping part uses (static aware), SVG text lines, theme colour
// variables and the one popover card. Add, never alter: every part draws with these.
import React, { useEffect, useState } from "react";
import { Controls, reducedMotion } from "../../ui/parts";
import type { Ui } from "../../ui/ui";
import { useStatic, StaticSteps } from "./static";
import type { StaticProp } from "../types";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// a colour word -> the theme's variables (the base, its soft fill and its ink for words)
const SOFT: Record<string, string> = { acc: "var(--acc-soft)", good: "var(--good-soft)", warn: "var(--warn-soft)", bad: "var(--bad-soft)", muted: "var(--surface-2)" };
export const colBase = (c: string) => (c ? `var(--${c})` : "var(--acc)");
export const colSoft = (c: string) => SOFT[c] ?? `var(--${c || "c1"}-soft, var(--acc-soft))`;
export const colInk = (c: string) => (c === "muted" ? "var(--muted)" : c ? `var(--${c}-ink, var(--${c}))` : "var(--acc-ink)");

/** Is an item written under step s shown at step i (-1: before the first @step, always)? new: it came in at this step. */
export const shownAt = (s: number, i: number, n: number) => n < 2 || s <= i;
export const newAt = (s: number, i: number, n: number) => n >= 2 && s >= 0 && s === i;
export const oldAt = (s: number, i: number, n: number) => n >= 2 && s >= 0 && s < i;

/** The step state of a part with n steps. Play starts at once and stops at the last step; static draws one step. */
export function useSteps(n: number, stp: StaticProp, titles: string[] = []) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const sx = useStatic(stp, n, titles);
  useEffect(() => { if (sx.on) setPlaying(false); }, [sx.on]);
  const go = (k: number) => { setPlaying(false); setI(Math.max(0, Math.min(n - 1, k))); };
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setI((v) => { if (v >= n - 1) { setPlaying(false); return v; } return v + 1; }), 1600);
    return () => window.clearInterval(id);
  }, [playing, n]);
  const play = () => { if (playing) { setPlaying(false); return; } setI((v) => (v >= n - 1 ? 0 : v + 1)); setPlaying(!reducedMotion()); };
  if (sx.on) return { i: sx.i, go: (_: number) => {}, playing: false, play: () => {}, sx };
  return { i, go, playing, play, sx };
}
export type Steps = ReturnType<typeof useSteps>;

export function StepTitle({ titles, index }: { titles: string[]; index: number }) {
  return <span className="dh-step-title">
    {titles.map((title, i) => <span key={i} aria-hidden={i !== index || undefined} className={i === index ? undefined : "dh-step-hidden"}>{title}</span>)}
  </span>;
}

/** Under a stepping part: the caption and the control row, or (static) the chosen caption and the list of all. */
export function Stepper({ n, titles, st, ui, label }: { n: number; titles: string[]; st: Steps; ui: Ui; label?: string }) {
  if (n < 2) return null;
  if (st.sx.on) return <StaticSteps titles={titles} i={st.i} print={st.sx.print} />;
  return (
    <>
      <div className="anim-cap dh-cap" aria-live="polite"><span className="cw-num" style={{ minWidth: `max(22px, calc(${String(n).length}ch + 12px))` }}>{st.i + 1}</span><StepTitle titles={titles} index={st.i} /></div>
      <Controls ui={ui} i={st.i} n={n} onGo={st.go} playing={st.playing} onPlay={st.play} label={label ?? ui.step} />
    </>
  );
}
/** Left and right arrows step the part (not while focus is in a control). */
export const stepKeys = (st: Steps, n: number) => (e: React.KeyboardEvent) => {
  if (n < 2 || (e.target as HTMLElement).closest("input,select,textarea,button")) return;
  if (e.key === "ArrowRight") { st.go(st.i + 1); e.preventDefault(); }
  if (e.key === "ArrowLeft") { st.go(st.i - 1); e.preventDefault(); }
};

/** Lines of SVG text, one tspan each. */
export const Lines = ({ lines, x, y, lh, anchor = "middle", cls }: { lines: string[]; x: number; y: number; lh: number; anchor?: "start" | "middle" | "end"; cls?: string }) => (
  <text x={x} y={y} textAnchor={anchor} className={cls}>{lines.map((l, k) => <tspan key={k} x={x} dy={k ? lh : 0}>{l}</tspan>)}</text>
);

// The one popover card: usePopover from ./popover (re-exported here).
export { usePopover, type PopData } from "./popover";
