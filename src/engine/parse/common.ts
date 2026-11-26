// Lane parse: helpers every front end shares (splitting a fence body, an empty Model, id lists, nearest-id hints).
import type { EngineSrc, Fact, Id, LayoutName, Model, Problem, Shape, Tone } from "../types";
import { LAYOUTS, SHAPES } from "../types";

export type RawStep = { title: string; raw: string; line: number };
export interface Split { head: string; steps: RawStep[]; base: number }

/** The fence body as the old engines read it: the setup text, and the steps (title after `@step`, raw lines, page line of the `@step` line). */
export function splitBody(body: string, line0: number): Split {
  const head: string[] = [];
  const steps: RawStep[] = [];
  let cur: { title: string; raw: string[]; line: number } | null = null;
  body.split("\n").forEach((l, k) => {
    const m = /^@step\b(?=(\s*))\1(.*)$/.exec(l);
    if (m) {
      if (cur) steps.push({ title: cur.title, raw: cur.raw.join("\n"), line: cur.line });
      cur = { title: m[2].trim(), raw: [], line: line0 + k };
      return;
    }
    (cur ? cur.raw : head).push(l);
  });
  if (cur) { const c = cur as { title: string; raw: string[]; line: number }; steps.push({ title: c.title, raw: c.raw.join("\n"), line: c.line }); }
  return { head: head.join("\n"), steps, base: line0 };
}

/** the fence's words that the old engines read as `info` (everything that is a plain string) */
export const infoOf = (src: EngineSrc): Record<string, string> => ({ ...src.fence });

export function emptyModel(src: EngineSrc, origin: Model["origin"]): Model {
  return {
    format: 12, origin, title: null, note: null,
    look: src.fence.look === "classic" ? "classic" : src.fence.look === "stage" ? "stage" : origin === "graph10" ? "classic" : "stage",
    view: src.fence.only !== undefined ? "3d-only" : src.fence.view === "3d" || "3d" in src.fence ? "3d" : "2d",
    layout: "lanes", roles: {}, regions: [], things: {}, order: [], relations: {}, setup: [], steps: [], scenes: {},
    fence: { ...src.fence }, layoutWords: {}, problems: [],
  };
}

export const isLayout = (s: string): s is LayoutName => (LAYOUTS as readonly string[]).includes(s);
export const isShape = (s: string): s is Shape => (SHAPES as readonly string[]).includes(s);

/** the Model's roles from the page's roles (name -> colour 1..8) */
export function rolesOf(model: Model, roles: Record<string, number>) {
  for (const [name, colour] of Object.entries(roles)) model.roles[name] = { colour, label: null };
}

const TONE_MAP: Record<string, Tone | null> = { acc: "accent", accent: "accent", good: "good", warn: "warn", hot: "bad", bad: "bad", muted: "off", off: "off", plain: null };
export const toneOf = (t: string): Tone | null | undefined => (t in TONE_MAP ? TONE_MAP[t] : undefined);

/** the nearest of `known` to `id` (edit distance, 3 at most), for "did you mean" messages */
export function nearest(id: string, known: string[]): string | null {
  let best: string | null = null, bd = 4;
  for (const k of known) { const d = lev(id, k); if (d < bd) { bd = d; best = k; } }
  return best;
}
function lev(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 9;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; }
  }
  return row[b.length];
}

/** `p1..p4` and `a,b` and `a b` to ids; a range steps the trailing number (`p1..p4`, `n01..n12`); other tokens stay as written */
export function expandIds(text: string): Id[] {
  const out: Id[] = [];
  for (const tok of text.split(/[,\s]+/).filter(Boolean)) {
    const m = /^(.*?)(\d+)\.\.(.*?)(\d+)$/.exec(tok);
    if (m && (m[3] === "" || m[3] === m[1])) {
      const a = +m[2], b = +m[4], w = m[2].length;
      if (b >= a && b - a < 400) { for (let i = a; i <= b; i++) out.push(m[1] + String(i).padStart(m[2].startsWith("0") ? w : 0, "0")); continue; }
    }
    out.push(tok);
  }
  return out;
}

export const slug = (s: string, fallback: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || fallback;

export const problem = (m: Model, line: number, msg: string, warn?: boolean) => { const p: Problem = { line, msg, ...(warn ? { warn } : {}) }; m.problems.push(p); };

export const F = (line: number) => ({ line });
export type FactOf<K extends Fact["k"]> = Extract<Fact, { k: K }>;
