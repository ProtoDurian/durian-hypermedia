// Lanes: the stage's drawing items (core/stage-core.ts Item) as the engine's primitives. The stage names its colours as
// paints ("role:client:soft", "good:line", "surface", "ink-2"); a Prim has a role, a tone and a few fixed fills, so a
// paint is split here, and the original words ride in `cls` (as tokens) for a renderer that wants the exact one.
import type { Tone } from "../../types";

export type Split = { role: string | null; tone: Tone | null; part: string; base: string };
const TONE_OF: Record<string, Tone> = { good: "good", bad: "bad", warn: "warn", acc: "accent", hot: "accent" };

export function splitPaint(p: string | undefined): Split {
  if (!p || p === "none") return { role: null, tone: null, part: "", base: "none" };
  const [a, b, c] = p.split(":");
  if (a === "role") return { role: b ?? null, tone: null, part: c ?? "line", base: "role" };
  if (a in TONE_OF) return { role: null, tone: TONE_OF[a], part: b ?? "line", base: "tone" };
  return { role: null, tone: null, part: "", base: a };
}

export type FillName = "soft" | "band" | "faint" | "none" | "role";
export function fillOf(p: string | undefined): FillName {
  const s = splitPaint(p);
  if (s.base === "none") return "none";
  if (s.base === "role" || s.base === "tone") return s.part === "soft" ? "soft" : "role";
  if (s.base === "surface-2") return "band";
  return "faint";
}
export type EdgeName = "line" | "faint" | "role" | "none";
export function edgeOf(p: string | undefined): EdgeName {
  const s = splitPaint(p);
  if (s.base === "none") return "none";
  if (s.base === "role" || s.base === "tone") return "role";
  if (s.base === "line-2" || s.base === "muted") return "faint";
  return "line";
}
export type InkName = "ink" | "muted" | "role" | "tone";
export function inkOf(p: string | undefined): InkName {
  const s = splitPaint(p);
  if (s.base === "role") return "role";
  if (s.base === "tone") return "tone";
  if (s.base === "muted") return "muted";
  return "ink";
}
