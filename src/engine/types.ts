// The one engine (format 12): the frozen contracts every lane builds against. DESIGN: showcase-fb/DESIGN.md option 1;
// the words: src/engine/ENGINE.md. Change this file only through the integrator (brant): every lane imports it.
//
// The pipeline, one direction only:
//   source text ──parse──▶ Model (things, relations, steps of facts)
//   Model ──core.states──▶ StepState[] (what is true at each step)  ──core.diff──▶ Motion[] (what changes k-1 → k)
//   Model + StepState[] ──layouts (plug-ins, nested)──▶ Placed (a box per thing per step, decor per layout)
//   Placed + Motion ──render (2D SVG, or 3D)──▶ the page; charts draw through charts/ into the same primitives.
// Nothing here holds a colour value or a time in milliseconds: colours are roles/tones mapped to page tokens, times
// come from the renderer's motion rules.

// ------------------------------------------------------------------ names
export type Id = string;
/** a line of the source, 1-based, for every message */
export type Src = { line: number };
export type Problem = { line: number; msg: string; warn?: boolean };

/** the 14 layouts (DESIGN 2.3), in 8 families */
export const LAYOUTS = ["lanes", "graph", "free", "tree", "array", "list", "stack", "queue", "map", "timeline", "grid", "sheet", "wrap", "track", "layers"] as const;
export type LayoutName = (typeof LAYOUTS)[number];
/** the layout family that owns each layout (one lane per family) */
export const FAMILY: Record<LayoutName, "lanes" | "graph" | "tree" | "data" | "time" | "grid" | "sheet" | "layers"> = {
  lanes: "lanes", graph: "graph", free: "graph", tree: "tree", array: "data", list: "data", stack: "data", queue: "data", map: "data",
  timeline: "time", grid: "grid", sheet: "sheet", wrap: "sheet", track: "sheet", layers: "layers",
};
export const SHAPES = ["box", "pill", "circle", "cylinder", "cloud", "person", "diamond", "text", "dot", "token", "ref"] as const;
export type Shape = (typeof SHAPES)[number];
export const TONES = ["good", "bad", "warn", "accent", "off"] as const;
export type Tone = (typeof TONES)[number];
export const CHART_KINDS = [
  "bar", "line", "area", "scatter", "bubble", "candlestick", "heatmap",          // lane ch-xy
  "pie", "doughnut", "polar", "radar",                                           // lane ch-radial
  "dots", "units", "spans",                                                      // lane ch-radial (in-animation kinds)
  "histogram", "boxplot", "violin", "funnel", "waterfall", "treemap", "sunburst", "calendar", // our existing kinds (ch-wire)
] as const;
export type ChartKind = (typeof CHART_KINDS)[number];
export type Look = "stage" | "classic";

// ------------------------------------------------------------------ the model (what parse gives)
/** a `## Region`: a lane, a band, a layer, a time row group, a grid row ... (the stage's layout says which) */
export interface Region { id: Id; title: string; flags: string[]; src: Src; layout?: LayoutName }

/** One thing. Every thing has one line form: `role id [flags]: title | line | line`. */
export interface Thing {
  id: Id;
  role: string | null;          // the colour role (front matter `roles:`); null = neutral c0
  title: string;
  lines: string[];              // the card's lines after `|`
  flags: string[];              // raw flags in order, e.g. ["cylinder"], ["chart", "bar", "values"], ["circle", "right"]
  shape: Shape;                 // from flags (default "box"; a `[token]` is a chip that sits on/at things; `[ref]` a pointer label)
  layout: LayoutName | null;    // a container's own layout (a layout flag), else null
  container: boolean;           // holds things (a layout flag, or an indented child, or a region)
  parent: Id | null;            // the container it is declared in (indentation), null at top level
  region: Id | null;            // the `##` region it is declared under
  order: number;                // declaration order among its siblings
  values: string[] | null;      // a data structure's or chart's cells (`split s [array]: 5 2 8 1`, `x = ...`)
  keys: Record<string, string>; // key=value words (`pos=2,1`, `buckets=4`, `note=...`, legacy keys)
  chart: ChartSpec | null;      // `[chart <kind> ...]`
  src: Src;
}

/** a relation drawn as a line; `a -> b`, `a --> b`, `a -- b`, `a <-> b` */
export interface Relation {
  id: Id;                       // `${from}->${to}` (+ `#2` for a second one between the same pair)
  from: Id; to: Id;
  style: "arrow" | "dashed" | "line" | "both";
  label: string | null;         // a setup label (kept); a step label is an event (one step)
  role: string | null;          // `(role)` after the target
  setup: boolean;               // declared in the setup (visible from step 1) vs first drawn in a step
  src: Src;
}

export interface ChartSpec {
  kind: ChartKind;
  title: string; unit: string | null;
  x: string[];                  // categories (`x:`), or labels; empty for kinds that need none
  series: { name: string; role: string | null; values: number[] }[]; // the setup values (steps change them)
  flags: string[];              // `values` (numbers on bars), `stacked`, `log`, `compact` ...
  opts: Record<string, string>; // the rest of the chart's own lines (axis, format, time axis ...), parsed by the chart lane
}

/** One fact or event written in a step (or in the setup: the state at step 0). DESIGN 2.2. */
export type Fact =
  | { k: "show" | "hide"; ids: Id[]; src: Src }
  | { k: "at"; ids: Id[]; place: Id; src: Src }                 // sits at / on a thing (a token, a ref)
  | { k: "in"; ids: Id[]; place: Id; side?: "left" | "right"; after?: Id; src: Src } // goes into a container
  | { k: "is"; ids: Id[]; words: string | null; src: Src }      // the state chip; null clears it (`is -`)
  | { k: "text"; id: Id; lines: string[]; src: Src }
  | { k: "tone"; ids: Id[]; tone: Tone; src: Src }              // `off` clears
  | { k: "dim"; ids: Id[]; on: boolean; src: Src }
  | { k: "values"; id: Id; values: string[]; from: Id[]; series?: number; src: Src } // `x = ...`, `x = ... from a,b`
  | { k: "clear"; src: Src }                                    // earlier step relations go
  | { k: "rel"; rel: Id; words: string | null; style: Relation["style"] | "lost" | "stream"; role: string | null; src: Src } // `a -> b: words` (line stays; words + dot this step), `a -x b`, `a ~> b`
  | { k: "light"; ids: Id[]; note?: string; src: Src }
  | { k: "say"; id: Id; words: string; side?: "above" | "below" | "left" | "right"; role?: string | null; src: Src }
  | { k: "note" | "foot"; words: string; tone?: string | null; src: Src }
  | { k: "split"; id: Id; into: Id[]; labels: string[]; src: Src }
  | { k: "merge"; ids: Id[]; into: Id; src: Src }
  | { k: "drop"; ids: Id[]; at?: Id; src: Src }
  | { k: "focus"; target: Id | "all"; src: Src }
  | { k: "zoom"; into: Id[] | null; all?: boolean; src: Src }    // `zoom into a b`; `zoom out` (into null); `zoom out all`
  | { k: "lift" | "putback"; ids: Id[]; src: Src }
  | { k: "enter"; scene: Id; from: Id; src: Src } | { k: "leave"; scene?: Id; src: Src }
  | { k: "layers"; apart: boolean; src: Src }
  | { k: "camera"; ids: Id[] | "all"; close?: boolean; far?: boolean; turn?: string; tilt?: string; src: Src } // legacy, kept
  | { k: "then"; src: Src }
  | { k: "pace"; pace: "slow" | "normal" | "fast"; src: Src }
  | { k: "layout"; word: string; arg: string; body: string[]; src: Src }; // a layout-owned step word (sheet `sum`, wrap `unwrap`, timeline `at`/`span`, track `at phase` ...), handed to that layout

export interface Step { title: string; caption: string; facts: Fact[]; src: Src }

export interface Model {
  format: 12;
  origin: "format12" | "stage11" | "graph10";   // which front-end made it (the LLM view and doccheck may say so)
  title: string | null; note: string | null;    // `title: Name | note`
  look: Look;
  view: "2d" | "3d" | "3d-only";
  layout: LayoutName;                           // the stage's own layout
  roles: Record<string, { colour: number; label: string | null }>; // colour 0..8
  regions: Region[];
  things: Record<Id, Thing>;
  order: Id[];                                  // every thing in declaration order
  relations: Record<Id, Relation>;
  setup: Fact[];                                // facts written in the setup (state at step 0)
  steps: Step[];
  scenes: Record<Id, Model>;                    // `scene ... end` (DESIGN 2.3), each its own model
  fence: Record<string, string>;                // the fence's words (`3d`, `size=s`, `pace=slow`, `look=classic` ...)
  layoutWords: Record<string, { word: string; arg: string; body: string[]; src: Src }[]>; // setup lines a layout owns, by layout name
  problems: Problem[];
}

// ------------------------------------------------------------------ the state (what core.states gives)
/** a piece of a rich line in a text prim */
export interface TextRun { text: string; code?: boolean; bold?: boolean; italic?: boolean }

export interface ThingState {
  visible: boolean;
  at: Id | null;                // sits at that thing (tokens, refs)
  in: Id | null;                // the container it is in now (default: its declared parent)
  side: "left" | "right" | null;
  after?: Id | null;            // its place in its container: after that sibling (`in c after x`); null/absent: declaration order
  is: string | null;            // the state chip
  text: string[] | null;        // replaced lines (null: the declared ones)
  tone: Tone | null;
  dim: boolean;
  values: string[] | null;      // current cells / a chart's first series, as written
  series?: (string[] | null)[]; // a chart's series 2.. (`id.2 = ...`), as written; index 0 unused (it is `values`)
  lifted: boolean;
  open: boolean;                // a closed thing zoomed into
  keys?: Record<string, string>; // keys a step set (`set id down=yes level=3 fill=good`), over Thing.keys; absent: none changed
}
export interface StepState {
  step: number;                 // 0 = the setup, 1..n = steps
  things: Record<Id, ThingState>;
  relations: Record<Id, { visible: boolean }>;
  focus: Id | "all";            // a focused layer/region
  zoom: Id[][];                 // the stack of open levels
  layersApart: boolean;
  scene: Id | null;             // the scene the story is in (null: the overview)
  inner?: Record<Id, StepState>; // each nested scene's own state at this step (frozen while the story is elsewhere; SPEC 6.12)
  camera: Extract<Fact, { k: "camera" }> | null; // a legacy camera line still in force
  layout: Record<string, unknown>; // layout-owned state, keyed by layout name (the layout reads its own words)
}
/** what happens only in this step (no after-state) */
export type Event =
  | { k: "send"; rel: Id; from: Id; to: Id; words: string | null; style: "token" | "lost" | "stream"; role: string | null; beat: number }
  | { k: "say"; id: Id; words: string; side?: string; role?: string | null; beat: number }
  | { k: "light"; ids: Id[]; note?: string; beat: number }
  | { k: "split" | "merge" | "drop"; ids: Id[]; to?: Id; beat: number }
  | { k: "note" | "foot"; words: string; tone?: string | null };

// ------------------------------------------------------------------ the motion (what core.diff gives)
export interface Motion {
  step: number;                 // k (from k-1)
  scene?: Id | null;            // the scene this motion happens in (null/absent: the overview); enter/leave steps set it to the scene entered/left
  enter: Id[]; exit: Id[];      // things that appear / go
  move: { id: Id; from: Id | null; to: Id | null }[]; // `in`/`at` changed
  restyle: { id: Id; fields: (keyof ThingState)[] }[]; // tone, dim, is, text ...
  values: { id: Id; before: string[]; after: string[]; map: (number | null)[]; from: Id[] }[]; // map[j] = old index of new cell j (null: new)
  relEnter: Id[]; relExit: Id[];
  events: Event[];
  touched: Id[];                // every thing the step touches: the auto camera frames these (DESIGN 2.1)
  beats: number;                // `then` lines + 1
  pace: "slow" | "normal" | "fast";
}

// ------------------------------------------------------------------ layout plug-ins (one file per family in layouts/)
export interface Rect { x: number; y: number; w: number; h: number }
/** a drawing primitive with a stable key: the renderer tweens primitives with the same key between steps.
 *  cls `eng-top` (any layout may use it; eng-lanes2): the prim is drawn after the lines, over them (a chip of words that
 *  sits on a line or a card); every other prim keeps the frame's paint order (decor, things, then lines) */
export type Prim =
  | { k: "box"; key: string; id?: Id; shape: Shape; rect: Rect; role: string | null; tone: Tone | null; dim?: boolean; dashed?: boolean; lit?: boolean; container?: boolean; cls?: string }
  | { k: "text"; key: string; id?: Id; x: number; y: number; lines: string[]; font: Font; anchor: "start" | "middle" | "end"; ink: "ink" | "muted" | "role" | "tone"; role?: string | null; tone?: Tone | null; cls?: string;
      /** rich words per line (`code`, **bold**, *italic*), when a line has any; lines[i] stays its plain text (measure, LLM view) */
      runs?: (TextRun[] | null)[] }
  | { k: "chip"; key: string; id?: Id; x: number; y: number; words: string; role: string | null; tone?: Tone | null; cls?: string }
  | { k: "path"; key: string; id?: Id; d: string; role: string | null; dashed?: boolean; arrow?: "end" | "both" | null; width?: "thin" | "line" | "hot"; fill?: "soft" | "role" | "none"; cls?: string } // fill: a closed shape (a pie slice, a radar area); default none
  | { k: "rect"; key: string; rect: Rect; fill: "soft" | "band" | "faint" | "none" | "role"; role?: string | null; tone?: Tone | null; edge?: "line" | "faint" | "role" | "none"; r?: number; cls?: string }
  | { k: "dot"; key: string; x: number; y: number; r: number; role: string | null; tone?: Tone | null; hollow?: boolean; cls?: string };
export type Font = "title" | "body" | "sub" | "lane" | "chip" | "big" | "mono" | "small-b"; // the stage's type scale (core/stage-core.ts FONT)

export interface LayoutCtx {
  width: number;                // the drawing width this plan is for (phone < 480)
  phone: boolean;
  look: Look;
  measure(text: string, font: Font): number;     // drawn width in px (stage-core `measure`)
  wrap(text: string, w: number, font: Font, max?: number): string[];
  /** lay out a child container (the engine recurses; a layout never calls another layout directly) */
  child(id: Id, avail?: number): Placed;   // avail: the width the parent can give it (default: the drawing width)
  problem(p: Problem): void;
}
export interface LayoutInput {
  model: Model;
  states: StepState[];          // every step, 0..n: a layout reserves room for the whole story (the still rule)
  container: Id | null;         // null: the stage itself (its regions are `model.regions`)
  members: Id[];                // things whose `in` is this container at some step (in declaration order)
  avail?: number;               // the width its parent gives it (ctx.child's avail); absent at the stage root: ctx.width
  regions: Region[];            // regions of this container (the stage's, or none)
}
/** A layout's answer: its size, where each member sits at each step (relative to its own top-left), and its decor. */
export interface Placed {
  w: number; h: number;         // its size: the largest over the story
  at(step: number): Record<Id, Rect>; // every visible member's rect at that step (members that do not move: the same rect)
  decor(step: number): Prim[];  // headings, axes, cells, guides ... (keys stable across steps)
  /** "own": this layout draws its scene's words itself (in its decor): line labels, say bubbles, note and foot text; the renderer
   *  draws none of those for it (it still draws the motion: dots along routes, lost crosses, streams) */
  words?: "own";
  /** optional: lines it routes itself (lanes, sheet); the engine's router draws the rest */
  routes?(step: number, rel: Relation, from: Rect, to: Rect): string | null;
  /** optional: words this layout adds to the step's caption (a time marker's `[caption]` words), in order */
  caption?(step: number): string[];
  /** optional: how its members' boxes are drawn when not the plain card (a data cell, a time bar ...) */
  draw?(step: number, id: Id, rect: Rect, state: ThingState): Prim[] | null;
}
export interface LayoutPlugin {
  name: LayoutName;
  /** setup and step words this layout owns (sheet `sum`, wrap `unwrap`, timeline `span` ...) */
  words?: { setup?: string[]; step?: string[] };
  /** check and read its own words into StepState.layout[name]; called by core once per step */
  step?(model: Model, prev: unknown, facts: Extract<Fact, { k: "layout" }>[], problem: (p: Problem) => void): unknown;
  place(input: LayoutInput, ctx: LayoutCtx): Placed;
  /** its lines of the LLM view, if it adds any (a time axis, a worksheet's sums) */
  llm?(model: Model, states: StepState[]): string[];
}

// ------------------------------------------------------------------ charts (charts/)
/** what a chart knows about the story it is in (in a page: prev = the numbers before the control changed, max over every
 *  reachable state when known, else the current ones). values[s][j] = series s, category j. A role name may be c1..c8. */
export interface ChartCtx {
  phone: boolean; look: Look; measure: LayoutCtx["measure"];
  step: number;                 // 0..n (0 outside an animation)
  prev: number[][] | null;      // the numbers of the step (or control state) before, null at the first
  max: number[][];              // the largest value of each series and category over the whole story: sizes never change per step
  lit: string[];                // categories lit in this step (`light returns.Jul..Dec` gives Jul..Dec)
}
export interface ChartDraw {
  kind: ChartKind;
  /** primitives for one chart in a rect, at given numbers; keys stable per category/series so tweens glide */
  draw(spec: ChartSpec, values: number[][], rect: Rect, ctx: ChartCtx): Prim[];
  llm(spec: ChartSpec, values: number[][]): string[];
}

// ------------------------------------------------------------------ the engine's public result (pipeline.ts)
export interface Compiled {
  model: Model;
  states: StepState[];          // 0..n
  motions: Motion[];            // motions[k] for k = 1..n (motions[0] is empty)
  plan(width: number): Plan;    // laid out at one width (cached)
  llm(): string;                // the LLM view
  problems: Problem[];          // doccheck: refusals and warnings, each with its line
}
export interface Plan {
  width: number; w: number; h: number; phone: boolean;
  problems: Problem[];          // what the layouts refused or warned about at this width (ctx.problem), each with its line
  frame(step: number): Prim[];  // everything drawn at that step, absolute coordinates, stable keys (inside a scene: that scene's frame)
  scene?(id: Id): Plan;         // a nested scene's own plan (its own size; the renderer frames it into the stage)
  focus(step: number): Rect;    // what the auto camera frames (the touched things + margin)
  rects(step: number): Record<Id, Rect>;
  caption(step: number): string[];  // words the layouts add to the step's caption (after the author's)
  words?: "own";                // the stage's layout draws its says, notes and feet itself (its lines carry cls eng-words-own)
}

// ------------------------------------------------------------------ the input (one ```animation block)
export interface EngineSrc {
  body: string;                 // the fence's contents (setup and steps)
  line0: number;                // the page line of the body's first line (messages name page lines)
  fence: Record<string, string>; // the fence's words: `3d` -> "", `look` -> "classic", `size` -> "s" ...
  roles: Record<string, number>; // the page's roles and their colours (front matter)
  format12: boolean;            // the page says `format: 12`
}
