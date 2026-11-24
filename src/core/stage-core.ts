// This package is the source of this file: edit it here. It began as a copy of the private prototype's composed stage (0.7.0).
// The composed stage (format version 11, 0.7.0): the shared parts every stage block uses.
// A block parses its own lines, lays itself out in a box of a given width and returns drawing items in that box's
// coordinates; the stage (tools/stage.ts) stacks the boxes and draws connectors after layout. Items carry numbers and
// token names only: the renderer (site/src/stage.tsx) turns them into SVG with page tokens. Pure: no DOM, no node modules.
// See SPEC.md for the interface a block builder writes to.
import { textW } from "./scene";
import { chipW } from "./chipw";
import { docBudget } from "./stage-budget";

// ---------------------------------------------------------------- source lines
export type Line = { n: number; ind: number; t: string };
export class StageError extends Error { constructor(public line: number, msg: string) { super(msg); } }
export type Problem = { line: number; msg: string };

// ---------------------------------------------------------------- drawing items (what the renderer draws)
/** Paint: a role's colour ("role:<name>" with a part: line, soft, plane, ink), a tone ("good", "bad", "warn", "acc", "muted")
 * with a part, or a stage colour: "surface", "surface-2", "line", "line-2", "ink", "ink-2", "muted", "none". */
export type Paint = string;
export type Font = "title" | "body" | "sub" | "lane" | "chip" | "big" | "mono" | "small-b";
export const FONT: Record<Font, { size: number; weight: number; mono?: boolean }> = {
  title: { size: 13.5, weight: 500 }, body: { size: 12.5, weight: 400 }, sub: { size: 12, weight: 400 }, lane: { size: 12.5, weight: 500 }, // the defaults of the stage.css tokens --stg-fs-<font>, --stg-title-weight
  chip: { size: 11.5, weight: 500 }, big: { size: 21, weight: 600 }, mono: { size: 12, weight: 400, mono: true }, "small-b": { size: 11.5, weight: 600 },
};
export const LINE_H: Record<Font, number> = { title: 18, body: 17, sub: 16, lane: 17, chip: 15, big: 28, mono: 16, "small-b": 15 };
/** When an item shows: from step `from` to step `to` (1-based, inclusive; to 0 = to the end), emphasised in `hot` steps. */
/** When an item shows, and (bar) the measurement hooks it carries: written as data-bar-<key> attributes (kind, id, label, role, edge, from, to, edge-label, column, axis, min, max, value). */
export type When = { from?: number; to?: number; on?: number[]; hot?: number[]; dim?: number[]; bar?: Record<string, string | number | undefined> };
export type Item = When & ({ k: "box"; x: number; y: number; w: number; h: number; fill: Paint; stroke: Paint; r?: number; dash?: boolean; thick?: boolean; cls?: string; id?: string; role?: string }
  | { k: "text"; x: number; y: number; s: string; f: Font; ink: Paint; anchor?: "start" | "middle" | "end"; tip?: string; strike?: boolean; rotate?: 90; breaks?: number[]; pitch?: number; halo?: boolean; size?: number }
  | { k: "path"; pts: [number, number][]; curve?: "h" | "v" | "round" | "line"; ink: Paint; dash?: boolean; arrow?: boolean; w?: number; flow?: boolean; id?: string; dot?: boolean; head?: number; cls?: string }
  | { k: "badge"; x: number; y: number; s: string; role: string }
  | { k: "tri"; x: number; y: number; ink: Paint });

// ---------------------------------------------------------------- measuring and wrapping words
const MONO_W = 0.6;
// stopgap (23 Nov): a phone stage's type sizes, never under 11 px, used only inside a narrow
// layout; the paint reads the same values from stage.css (--stg-phone-<font>, on a plan drawn with class stg-phone),
// each meant to become the review's theme token of that name
export const PHONE_FONT: Partial<Record<Font, number>> = { title: 12.5, body: 11.5, sub: 11, chip: 11 };
let phoneFont = false;
export const setPhoneFont = (on: boolean) => { phoneFont = on; };
/** the drawn width of plain (regular) type: the measure corrected per character, fitted to browser widths at phone sizes
 * (digits draw 2.4 px wider at 11 px; "_" 3.5; "=" 5.5; letters 0.15 narrower) */
export function drawnW(s: string, f: Font): number {
  const F = FONT[f]; if (F.mono || F.weight >= 500) return measure(s, f);
  let x = 0;
  for (const ch of s) x += ch >= "0" && ch <= "9" ? 2.4 : ch === "_" ? 3.5 : ch === "=" ? 5.5 : (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") ? -0.15 : 0;
  return measure(s, f) + (x * fontSize(f)) / 11;
}
/** inside a phone layout: a line that is one unbroken token (an id, a name with digits) breaks again only when its drawn
 * width would cross the box's border (`slack`: the room right of the text, less 2 px); a line of words, or a token that
 * stays inside the border, keeps its place, so nothing grows where it already fits */
export function wrapRoom(s: string, w: number, f: Font, max = 4, slack = 0): string[] {
  const ls = wrap(s, w, f, max);
  // p11 (rc.3 review MUST 4: the layers story's routing table T3 at 1280): off a phone, where a line's drawn width (digits
  // draw wider than the table says) would cross the border, the text breaks again by drawn width; else it keeps its lines
  if (!phoneFont) return ls.some((l) => drawnW(l, f) > w + slack) ? wrap(s, w, f, max, true) : ls;
  return ls.flatMap((l) => {
    if (l.includes(" ") || drawnW(l, f) <= w + slack) return [l];
    const out: string[] = []; let cur = "";
    let cw = 0; // linear: each character's drawn width added once
    for (const ch of l) { const d = drawnW(ch, f); if (cur && cw + d > w + slack) { out.push(cur); cur = ""; cw = 0; } cur += ch; cw += d; }
    return cur ? [...out, cur] : out;
  });
}
/** a font's size in the layout being made: the phone size inside a narrow layout, else the stage's own */
export const fontSize = (f: Font): number => (phoneFont ? PHONE_FONT[f] : undefined) ?? FONT[f].size;
export function measure(s: string, f: Font): number {
  const F = FONT[f], size = fontSize(f);
  if (F.mono) return [...s].length * size * MONO_W;
  return F.weight >= 500 ? chipW(s, size) : textW(s, size) * 0.95;
}
/** Wrap words into lines at most `w` wide; a word longer than a line breaks by characters. Linear in the text. */
/** on a phone a block's text takes more lines instead of a "…" (no fact is cut on a phone). The stage
 * sets it around a narrow layout; blocks whose height follows their line count ask `most(n)` for their line limit. */
let phoneLines = false;
export const setPhoneLines = (on: boolean) => { phoneLines = on; };
export const most = (n: number) => (phoneLines ? n + 8 : n);
// a long run of digits, hex and colons draws wider than the table says (MAC addresses ran to the card edge on a
// phone): a line holding one breaks as if it were 15% wider
const HEXRUN = /[0-9A-Fa-f]{2}[:.-][0-9A-Fa-f]{2}[:.-][0-9A-Fa-f]{2}/;
const fitW = (x: string, f: Font) => measure(x, f) * (phoneLines && HEXRUN.test(x) ? 1.15 : 1); // on a phone, where the cards are narrow
export function wrap(s: string, w: number, f: Font, max = 4, drawn = false): string[] {
  const fitW2 = drawn ? (x: string, f2: Font) => Math.max(fitW(x, f2), drawnW(x, f2)) : fitW;
  docBudget().charge("stage words", s.length + 1, s.length);
  const words = s.split(" ").filter((x) => x !== ""), out: string[] = [];
  let cur = "";
  const push = (x: string) => { out.push(x); };
  for (let word of words) {
    const tryW = cur ? cur + " " + word : word;
    if (fitW2(tryW, f) <= w) { cur = tryW; continue; }
    if (cur) { push(cur); cur = ""; }
    while (fitW2(word, f) > w && word.length > 1) {
      let k = 1; while (k < word.length && fitW2(word.slice(0, k + 1), f) <= w) k++;
      // break after a "-", ".", "/", "_" or ":" when one falls in the part that fits (host names, paths)
      let b = k; while (b > 1 && !"-./_:".includes(word[b - 1])) b--;
      if (b > k / 3) k = b;
      push(word.slice(0, k)); word = word.slice(k);
    }
    cur = word;
  }
  if (cur || !out.length) push(cur);
  if (out.length > max) { const keep = out.slice(0, max); let last = keep[max - 1]; while (last && measure(last + "…", f) > w) last = last.slice(0, -1); keep[max - 1] = last + "…"; return keep; }
  return out;
}
/** a text of several lines drawn as ONE run (one text node, no tspans: a chip's "2 Announced", number over
 * name). `breaks` are the indexes in its words where a new line starts, each line centred on x, `pitch` apart. Gives the
 * first character's x and the per-character dx and dy that put every line in place; `width(from, to)` is the advance of
 * s.slice(from, to): measure in the plan, the browser's own (getSubStringLength) once painted. */
export function textLayout(s: string, breaks: number[], cx: number, pitch: number, width: (from: number, to: number) => number): { x: number; dx: number[]; dy: number[]; lines: { x: number; w: number }[] } {
  const starts = [0, ...breaks], end = (j: number) => (j + 1 < starts.length ? starts[j + 1] : s.length);
  const trim = (a: number, e: number) => { while (e > a && s[e - 1] === " ") e--; return e; };
  // drawn with text-anchor middle: SVG 2 centres the whole chunk (the union of its glyphs) on x, so every line is centred
  // on one point c (the first line starts at x) and the browser moves that point onto x
  const ws = starts.map((a, j) => width(a, trim(a, end(j)))), c = cx + ws[0] / 2, xs = ws.map((w) => c - w / 2);
  const dx: number[] = new Array(breaks.length ? breaks[breaks.length - 1] + 1 : 0).fill(0), dy = [...dx];
  for (let j = 1; j < starts.length; j++) { dx[starts[j]] = xs[j] - (xs[j - 1] + width(starts[j - 1], starts[j])); dy[starts[j]] = pitch; }
  return { x: cx, dx, dy, lines: ws.map((w) => ({ x: cx - w / 2, w })) };
}
/** The widest single word: the least width a text can wrap to. */
export const longestWord = (s: string, f: Font) => s.split(" ").reduce((a, x) => Math.max(a, measure(x, f)), 0);

// ---------------------------------------------------------------- splitting author text (hand-written scans, linear)
/** Split on a separator, trimmed, empty parts dropped. */
export const parts = (s: string, sep: string) => s.split(sep).map((x) => x.trim()).filter((x) => x !== "");
/** "role ids: rest" or "word: rest": the text before the first ": " and after it. */
export function colon(s: string): [string, string] | null { const k = s.indexOf(": "); if (k < 0) return s.endsWith(":") ? [s.slice(0, -1), ""] : null; return [s.slice(0, k), s.slice(k + 2)]; }
/** A trailing verdict "[+ kept]" or "[- dropped]": the text before it and the verdict. */
export function verdict(s: string): { text: string; ok?: boolean; v?: string; chip?: boolean } {
  const t = s.trimEnd();
  if (!t.endsWith("]")) return { text: s };
  const k = t.lastIndexOf("[");
  if (k < 0 || (t[k + 1] !== "+" && t[k + 1] !== "-" && t[k + 1] !== "=") || t[k + 2] !== " ") return { text: s };
  if (t[k + 1] === "=") return { text: t.slice(0, k).trimEnd(), v: t.slice(k + 3, -1).trim(), chip: true };
  return { text: t.slice(0, k).trimEnd(), ok: t[k + 1] === "+", v: t.slice(k + 3, -1).trim() };
}

// ---------------------------------------------------------------- what the source may not hold
// No coordinate, pixel, colour value or millisecond. Text is content, so a caption may say
// "300 ms"; what is refused is a pixel size or a colour value anywhere, and a coordinate or a time as an option value.
export function forbidden(t: string): string | null {
  const low = t.toLowerCase();
  for (let i = 0; i < low.length; i++) {
    const c = low[i];
    if (c === "#" && (i === 0 || low[i - 1] === " " || low[i - 1] === "=" || low[i - 1] === ":")) {
      let j = i + 1; while (j < low.length && /[0-9a-f]/.test(low[j])) j++;
      const n = j - i - 1; if ((n === 3 || n === 6 || n === 8) && (j === low.length || !/[0-9a-z_-]/.test(low[j]))) return `a colour value (${t.slice(i, j)}): colours come from the page's roles, never from the scene`;
    }
    if (c >= "0" && c <= "9" && (i === 0 || !/[0-9a-z.]/.test(low[i - 1]))) {
      let j = i; while (j < low.length && /[0-9.]/.test(low[j])) j++;
      const u = low.slice(j, j + 2), after = low[j + 2];
      if (u === "px" && (after === undefined || !/[a-z]/.test(after))) return `a pixel size (${t.slice(i, j + 2)}): the stage sizes everything itself`;
      i = j - 1;
    }
  }
  if (/(^|\s)(x|y|left|top|width|height|pos|dur|delay)=/.test(low)) return "a coordinate, size or time option: the stage places and times everything itself";
  if (/(^|\s)(rgb|rgba|hsl|hsla|oklch)\(/.test(low)) return "a colour value: colours come from the page's roles";
  if (/(^|\s)\d+(\.\d+)?ms\b/.test(low) && /(=|^\s*(pace|wait|after|every)\b)/.test(low)) return "a time in milliseconds: the player sets the pace";
  return null;
}

// ---------------------------------------------------------------- the block interface
export type BlockInput = { word: string; arg: string; body: Line[]; line: number };
/** `keep`: the line began with "keep" (keep at, keep span, keep dot, keep mark): it stays from this step on */
/** `shared`: another block of this scene owns the word too: return false for what is not yours (it goes on to the next) */
export type StepOp = BlockInput & { step: number; keep?: boolean; shared?: boolean };
export type ParseCtx = { roles: Set<string>; problem: (line: number, msg: string) => void; ids: Set<string>; steps: number; caption?: (step: number, text: string, keep?: boolean) => void; lanes?: string[] }; // lanes: the lane titles, for check
/** `beside`: the block is one of a step's panels laid side by side (its box is its share of the row, not the stage) */
export type Box = { /** Matching default column grids may share their first column. */ columnLeft?: number; /** a note frame's least height ('height: N lines' after 'notes:') */ noteMin?: number; w: number; narrow: boolean; steps: number; stepTitles: string[]; beside?: boolean; /** the panels sit right of a lone card (wide): a card filling them is a card, not the stage's panel */ inset?: boolean; noteH?: (w: number) => number; theme?: Record<string, string>; aside?: { w: number; steps?: number[] }; footLeft?: number; lanes?: { title: string; x: number; w: number }[] }; // lanes: laid-out lane columns, x in the block's frame
/** `slot`: a head block may offer a place for the step notes (its left column under its rows, beside a side column);
 * the stage puts the note region there instead of under everything. */
/** `aside`: content for an empty peer-panel slot offered to the immediately following head; the stage owns its placement.
 * Box.aside.steps: when set, the slot is free only in those steps; the head takes it only if its aside shows in no other step. */
/** A head may align following foot words with its first content column. */
/** `slot.under`: on a phone the notes go right under the block's first part (a worksheet's groups), and what the block drew from `y` down (its outcome column) moves under them. */
/** head: an aside's own words above its body (an inset's caption or bracket); the panels beside it start below them */
export type LayoutOut = { h: number; head?: number; items: Item[]; slot?: { x: number; y: number; w: number; grow?: string[]; under?: boolean }; aside?: LayoutOut; footLeft?: number };
export interface StageBlock<N = any> {
  /** the word that starts the block: a head block's line is `word: arg` (or `word arg`), a panel's is `word arg` in a step */
  word: string;
  /** head: declared before the first @step, laid out once for the whole scene; panel: written under a step, shown in that step only */
  kind: "head" | "panel";
  /** A setup block may also be supplied as a one-step panel (counted units). */
  panel?: boolean;
  /** step words a head block owns ("at" for the track, "mark" for the worksheet): each is handed to `op`. Two blocks
 * may own one word (track and time both own "at"; any block may own "show" and "light" for its own ids): the stage
 * offers the line to each owner in source order until one takes it */
  ops?: string[];
  /** the head block's own setup words that follow it at the top level ("carry", "where" for the track) */
  more?: string[];
  parse(input: BlockInput, ctx: ParseCtx): N;
  /** a panel written right under another panel of the same word may join it (cell rows: one panel, rows aligned); true when it did */
  join?(prev: N, next: N): boolean;
  /** a head block may claim the setup lines that follow it (until the next lane or head block): return true when it took the line */
  claim?(node: N, l: Line, body: Line[], ctx: ParseCtx): boolean;
  /** a setup word from `more`, or a step word from `ops` */
  /** return false to say "not mine" (the ids or the value are not this block's): the stage offers the line to the next owner */
  op?(node: N, op: StepOp, ctx: ParseCtx): void | boolean;
  /** called once after the whole setup is read (every head line, claimed line and "more" word): refuse what only the whole setup shows */
  check?(node: N, ctx: ParseCtx): void;
  /** Heads with the same column key share the largest default gutter; explicit layouts may decline. */
  columns?(node: N, box: Box): { key: string; left: number } | undefined;
  layout(node: N, box: Box): LayoutOut;
  /** the facts an LLM reads: step 0 = the setup, then each step from 1 */
  facts(node: N, step: number): string[];
}
const REG = new Map<string, StageBlock>();
export function registerBlock(b: StageBlock) { REG.set(b.word, b); }
export const blockFor = (word: string) => REG.get(word);
export const blockByOp = (word: string) => [...REG.values()].find((b) => b.kind === "head" && b.ops?.includes(word));
export const blockByMore = (word: string) => [...REG.values()].find((b) => b.kind === "head" && b.more?.includes(word));
export const blockWords = () => [...REG.keys()];

// ---------------------------------------------------------------- small drawing helpers blocks share
export const PAD = 14; // the stage's side margin
export function chip(x: number, y: number, s: string, paint: string, w0 = 0, f: Font = "chip", bar: Record<string, string | number> = { kind: "chip", label: s }): { w: number; items: Item[] } {
  const w = Math.max(w0, measure(s, f) + 18), h = 20;
  return { w, items: [{ k: "box", x: x - w / 2, y, w, h, fill: `${paint}:soft`, stroke: `${paint}:line`, r: 10, cls: "stg-chip", bar }, { k: "text", x, y: y + 14, s, f, ink: `${paint}:ink`, anchor: "middle" }] };
}
/** A list of lines, each "! text" in the warning tone: items and the height used. */
export function textLines(x: number, y: number, w: number, lines: string[], f: Font = "sub", ink: Paint = "muted"): LayoutOut {
  const items: Item[] = []; let h = 0;
  for (const l of lines) {
    const warn = l.startsWith("! "), s = warn ? l.slice(2) : l;
    for (const row of wrap(s, w, f)) { items.push({ k: "text", x, y: y + h + LINE_H[f] - 4, s: row, f, ink: warn ? "warn:ink" : ink }); h += LINE_H[f]; }
  }
  return { h, items };
}
/** Move items by dx, dy (a block's box placed on the stage). */
export function shift(items: Item[], dx: number, dy: number, when?: When): Item[] {
  return items.map((it) => {
    const o: any = { ...it, ...(when ? { from: it.from ?? when.from, to: it.to ?? when.to, on: it.on ?? when.on, hot: it.hot ?? when.hot } : {}) };
    if (it.k === "path") o.pts = it.pts.map(([x, y]) => [x + dx, y + dy]);
    else { o.x = (it as any).x + dx; o.y = (it as any).y + dy; }
    return o as Item;
  });
}
/** "a, b..c, p*": ids, ranges (p1..p6) and prefixes (p* = every id of the scene that starts with p and ends in digits). */
export function expandIds(s: string, all: Iterable<string>): string[] {
  const out: string[] = [];
  for (const raw of parts(s, ",")) {
    if (raw.endsWith("*")) { const pre = raw.slice(0, -1); for (const id of all) if (id.startsWith(pre) && /^\d*$/.test(id.slice(pre.length)) && id.length > pre.length) out.push(id); continue; }
    const r = range(raw); if (r) out.push(...r); else out.push(raw);
  }
  return out;
}
/** "p1..p6" -> p1, p2,... p6 (at most 64); null when not a range */
export function range(s: string): string[] | null {
  const k = s.indexOf(".."); if (k < 0) return null;
  const a = s.slice(0, k), b = s.slice(k + 2);
  const ma = /^([a-z_-]*?)(\d+)$/i.exec(a), mb = /^([a-z_-]*?)(\d+)$/i.exec(b);
  if (!ma || !mb || (mb[1] && mb[1] !== ma[1])) return null;
  const from = +ma[2], to = +mb[2]; if (to < from || to - from > 63) return null;
  return Array.from({ length: to - from + 1 }, (_, i) => ma[1] + (from + i));
}
export const ID_RE = /^[A-Za-z][\w.-]*$/;
