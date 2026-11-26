// The parts' kit, React side: the step player every stepping part uses (static aware), SVG text lines, theme colour
// variables and the one popover card. Add, never alter: every part draws with these.
import React, { useEffect, useState } from "react";
import { Controls, reducedMotion } from "../../ui/parts";
import { useSpeed } from "../../ui/speed";
import type { Ui } from "../../ui/ui";
import { useStatic, StaticSteps } from "./static";
import type { StaticProp } from "../types";
import { cssWord } from "../../safety";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// a colour word -> the theme's variables (the base, its soft fill and its ink for words)
const SOFT: Record<string, string> = { acc: "var(--acc-soft)", good: "var(--good-soft)", warn: "var(--warn-soft)", bad: "var(--bad-soft)", muted: "var(--surface-2)" };
// (a word that is not a plain word is drawn as the default colour: cssWord, safety.ts)
export const colBase = (c: string) => (c ? `var(--${cssWord(c, "acc")})` : "var(--acc)");
export const colSoft = (c: string) => SOFT[c] ?? `var(--${cssWord(c || "c1", "c1")}-soft, var(--acc-soft))`;
export const colInk = (c: string) => (c === "muted" ? "var(--muted)" : c ? `var(--${cssWord(c, "acc")}-ink, var(--${cssWord(c, "acc")}))` : "var(--acc-ink)");

/** Is an item written under step s shown at step i (-1: before the first @step, always)? new: it came in at this step. */
export const shownAt = (s: number, i: number, n: number) => n < 2 || s <= i;
export const newAt = (s: number, i: number, n: number) => n >= 2 && s >= 0 && s === i;
export const oldAt = (s: number, i: number, n: number) => n >= 2 && s >= 0 && s < i;

/** The pause between two steps while a kit part plays, at speed 1. */
export const KIT_DWELL = 1600;
/** The step state of a part with n steps. Play starts at once and stops at the last step; static draws one step.
 * Play on the first step stays on it for a whole pause (owner feedback 17: the first step is played, not skipped);
 * elsewhere it moves on at once. The page's speed (ui/speed.ts) divides the pause. */
export function useSteps(n: number, stp: StaticProp, titles: string[] = []) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, cycleSpeed] = useSpeed();
  const sx = useStatic(stp, n, titles);
  useEffect(() => { if (sx.on) setPlaying(false); }, [sx.on]);
  const go = (k: number) => { setPlaying(false); setI(Math.max(0, Math.min(n - 1, k))); };
  useEffect(() => {
    if (!playing) return;
    const id = window.setTimeout(() => setI((v) => { if (v >= n - 1) { setPlaying(false); return v; } return v + 1; }), KIT_DWELL / speed);
    return () => window.clearTimeout(id);
  }, [playing, n, i, speed]);
  const play = () => { if (playing) { setPlaying(false); return; } setI((v) => (v >= n - 1 || v === 0 ? 0 : v + 1)); setPlaying(!reducedMotion()); };
  const dwell = KIT_DWELL / speed;
  if (sx.on) return { i: sx.i, go: (_: number) => {}, playing: false, play: () => {}, sx, speed, cycleSpeed: () => {}, dwell };
  return { i, go, playing, play, sx, speed, cycleSpeed, dwell };
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
      <Controls ui={ui} i={st.i} n={n} onGo={st.go} playing={st.playing} onPlay={st.play} speed={st.speed} onSpeed={st.cycleSpeed} dwell={st.dwell} label={label ?? ui.step} />
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
