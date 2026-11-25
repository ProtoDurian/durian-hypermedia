// The graph part's data (format version 11): what parse() returns, and the sizes both the layouts and the view use.
// Plain JSON: nothing here is a function, a Map or a class (parse may run on a server and the view in a browser).
import type { Err } from "../kit/text";

export interface GNode { id: string; label: string; group: string | null; tone: string | null; note: string; line: number; declared: boolean; x: number; y: number; w: number }
export interface GGroup { id: string; label: string; parent: string | null; tone: string | null; note: string; line: number }
export interface GEdge { from: string; to: string; label: string; tone: string | null; dashed: boolean; line: number }
export interface StillItem { id: string; label: string; tone: string | null; count: number; group: boolean; x: number; y: number; w: number }
export interface Still { w: number; h: number; items: StillItem[]; edges: { a: string; b: string; count: number }[] }
export interface GraphSpec {
  title: string; layout: "layers" | "force" | "radial"; dir: "down" | "right"; centre: string | null; size: "s" | "m" | "l";
  nodes: GNode[]; groups: GGroup[]; edges: GEdge[];
  /** over graphFoldFirst nodes: only the groups are drawn first (every top-level group starts folded) */
  foldFirst: boolean;
  /** force layout: cytoscape's cose iterations (fixed from the counts, charged up front) */
  forceIterations: number;
  still: Still | null;
  errors: Err[]; warnings: Err[];
}
/** the caps one parse reads (from ctx.limits) */
export interface GraphLimits { graphNodes: number; graphEdges: number; graphGroups: number; graphDepth: number; graphFoldFirst: number }

export const GRAPH_LABEL_MAX = 80;
export const GRAPH_STILL_MAX = 60;         // the still picture draws every top-level group; over this many boxes the loose nodes are one box
export const GRAPH_LAYOUTS = ["layers", "force", "radial"] as const;
export const GRAPH_KEYS = ["id", "title", "layout", "dir", "centre", "size", "llm", "static"];
export const GRAPH_TONES = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "acc", "good", "warn", "bad", "muted"];

/** cytoscape's force layout: work allowed for one graph (iterations x (nodes + edges)), and the iteration range */
export const FORCE_WORK = 600_000;
export const FORCE_ITER_MAX = 250;
export const FORCE_ITER_MIN = 40;
export const forceIterations = (n: number, e: number) => Math.max(FORCE_ITER_MIN, Math.min(FORCE_ITER_MAX, Math.floor(FORCE_WORK / Math.max(1, n + e))));
/** one budget step stands for this many of cytoscape's pair comparisons (it cannot be metered from outside) */
export const FORCE_STEP_DIV = 16;
/** one budget step stands for this many small array or map operations in our own layouts (a typed-array read, a map lookup) */
export const OPS = 4;
export const opSteps = (n: number) => Math.ceil(n / OPS);
/** what the force layout is charged, once, when the part is read */
export const forceCost = (n: number, e: number) => Math.ceil((forceIterations(n, e) * (n + e)) / FORCE_STEP_DIV);
/** each iteration of cose compares every pair of the nodes it lays out, so one run over k nodes gets at most
 * FORCE_PAIRS / k^2 iterations (never more than the part's fixed count, never under FORCE_RUN_MIN): 2,000 nodes with no
 * group get 7, where the seed's spiral already spreads them; a group of 100 gets the full count */
export const FORCE_PAIRS = 30_000_000;
export const FORCE_RUN_MIN = 5;
export const forceRunIterations = (fixed: number, k: number) => Math.max(FORCE_RUN_MIN, Math.min(fixed, Math.floor(FORCE_PAIRS / Math.max(1, k * k))));

// geometry of the layouts, in the stage's units (a pixel at zoom 1); the view draws the same sizes
export const NODE_H = 30;
export const nodeWidth = (label: string) => Math.round(Math.min(220, Math.max(48, label.length * 7.3 + 28)));
