// Line ends and end labels (SPEC 3.2). One set of shapes for 2D (src/ui/line-ends.tsx) and 3D
// (src/ui/line-ends3d.ts), in units along the line: x runs out from the thing's border along the line, y across it.
//   a -> b start=hollow end=arrow start-label="1" end-label="0..*"
// UML: open (an open arrow), triangle (closed, hollow), diamond (filled), hollow (an empty diamond).
// Crow's foot: one (exactly one: two bars), many, zero-or-one, one-or-many, zero-or-many.
// arrow is the filled head a "->" has; none takes a head away.
export const END_MARKS = ["none", "arrow", "open", "triangle", "diamond", "hollow", "one", "many", "zero-or-one", "one-or-many", "zero-or-many"] as const;
export type EndMark = (typeof END_MARKS)[number];
export interface P { x: number; y: number }
// fill: ink is the line's colour, paper is the stage's own ground (a hollow shape hides the line under it)
export interface Glyph { len: number; polys: { pts: P[]; fill?: "ink" | "paper" }[]; ring?: { x: number; r: number } }

const p = (...n: number[]): P[] => n.flatMap((v, k) => (k % 2 ? [] : [{ x: v, y: n[k + 1] }]));
const stem = { pts: p(0, 0, 4, 0) };
const bar = (x: number) => ({ pts: p(x, -6.5, x, 6.5) });
const foot = [{ pts: p(0, -6.5, 11, 0, 0, 6.5) }];
const gem = p(0.5, 0, 9.5, -5.5, 18.5, 0, 9.5, 5.5);
const GLYPHS: Record<EndMark, Glyph> = {
  none: { len: 4, polys: [stem] },
  arrow: { len: 10, polys: [{ pts: p(0.5, 0, 10, -4.8, 10, 4.8), fill: "ink" }] },
  open: { len: 10, polys: [stem, { pts: p(10, -5.5, 0.8, 0, 10, 5.5) }] },
  triangle: { len: 14, polys: [{ pts: p(0.5, 0, 14, -7, 14, 7), fill: "paper" }] },
  diamond: { len: 19, polys: [{ pts: gem, fill: "ink" }] },
  hollow: { len: 19, polys: [{ pts: gem, fill: "paper" }] },
  one: { len: 12, polys: [stem, bar(6), bar(10.5)] },
  many: { len: 11, polys: [stem, ...foot] },
  "zero-or-one": { len: 19, polys: [stem, bar(6)], ring: { x: 14, r: 4.2 } },
  "one-or-many": { len: 15, polys: [stem, ...foot, bar(14)] },
  "zero-or-many": { len: 20, polys: [stem, ...foot], ring: { x: 15.5, r: 4.2 } },
};
export const glyphOf = (m: string): Glyph => GLYPHS[m as EndMark] ?? GLYPHS.none;
// a glyph that is only an outline still needs the line drawn up to the border; every glyph's half width is at most this
export const END_HALF = 8;
// the straight stretch a marked end wants before the line turns
export const END_CLEAR = 22;

// what a connector says about its two ends; only what was written is there
export interface Ends { a?: EndMark; b?: EndMark; ta?: string; tb?: string }
export function endsOf(kv: Record<string, string>): Ends | undefined {
  const e: Ends = {};
  for (const [key, slot] of [["start", "a"], ["end", "b"]] as const) {
    const v = kv[key];
    if (v == null) continue;
    if (!(END_MARKS as readonly string[]).includes(v)) throw new Error(`${key}=${v} is not a line end (${END_MARKS.join(", ")})`);
    e[slot] = v as EndMark;
  }
  for (const [key, slot] of [["start-label", "ta"], ["end-label", "tb"]] as const) {
    const v = kv[key];
    if (v == null) continue;
    if (!v.trim()) throw new Error(`${key}= is a word near that end: ${key}="0..*"`);
    e[slot] = v.trim();
  }
  return Object.keys(e).length ? e : undefined;
}
// the mark drawn at an end: what the author wrote, else the head its arrow gives it
export function markAt(style: string, ends: Ends | undefined, side: "a" | "b"): EndMark | null {
  if (ends?.[side]) return ends[side]!;
  if (!ends) return null; // a plain connector keeps its own arrowhead
  return (side === "b" && style !== "--") || (side === "a" && style === "<->") ? "arrow" : null;
}
// glyph points on the stage: at is the line's end (gap short of the border), dir points out along the line
export function toStage(q: P, at: P, dir: P, gap: number): P {
  const x = q.x - gap;
  return { x: at.x + dir.x * x - dir.y * q.y, y: at.y + dir.y * x + dir.x * q.y };
}
// the room a glyph takes, for what must not cover it
export function glyphRect(m: EndMark, at: P, dir: P, gap: number): { x: number; y: number; w: number; h: number } {
  const g = glyphOf(m), ps = [[0, -END_HALF], [0, END_HALF], [g.len, -END_HALF], [g.len, END_HALF]].map(([x, y]) => toStage({ x, y }, at, dir, gap));
  const x = Math.min(...ps.map((q) => q.x)), y = Math.min(...ps.map((q) => q.y));
  return { x, y, w: Math.max(...ps.map((q) => q.x)) - x, h: Math.max(...ps.map((q) => q.y)) - y };
}
