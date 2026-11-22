// The layout of a sankey (format version 11): d3-sankey's, on the parsed part (part.ts). d3-sankey only lays out; the view
// draws the SVG. It always lays out left to right; for a narrow stage it is laid out with its axes swapped and read back
// turned, so the flow runs top to bottom. Its cost was charged to the page's budget when the part was read (sankeyCost).
import { sankey as d3sankey, sankeyJustify } from "d3-sankey";
import { SANKEY_ITERATIONS, type SankeySpec } from "./part";

export interface LNode { id: string; label: string; colour: string; x: number; y: number; w: number; h: number; col: number; inV: number; outV: number }
export interface LLink { i: number; d: string; width: number; from: string; to: string; amount: number; appear: number; colour: string; mid: [number, number] }
export interface SankeyLayout { nodes: LNode[]; links: LLink[]; columns: number; vertical: boolean; width: number; height: number }
export function layoutSankey(spec: SankeySpec, width: number, height: number, vertical: boolean, nodeW = 14, pad = 12, margin = { l: 0, r: 0 }): SankeyLayout {
  const oy = vertical ? 22 : 0; // a vertical sankey keeps room above and below for the labels of its first and last rows
  const idx = new Map(spec.nodes.map((n, k) => [n.id, k]));
  const nodes = spec.nodes.map((n) => ({ id: n.id }));
  const links = spec.flows.map((f) => ({ source: idx.get(f.from)!, target: idx.get(f.to)!, value: f.amount }));
  // along: the way the flow runs; cross: the way the nodes stack
  const along = vertical ? height - 2 * oy : width - margin.l - margin.r, cross = vertical ? width : height;
  const g = d3sankey().nodeId((d: any) => d.index).nodeAlign(sankeyJustify).nodeWidth(nodeW).nodePadding(pad).iterations(SANKEY_ITERATIONS).extent([[0, 0], [along, cross]]);
  const r = g({ nodes: nodes.map((n) => ({ ...n })), links: links.map((l) => ({ ...l })) });
  const cols = Math.max(0, ...r.nodes.map((n: any) => n.depth)) + 1;
  const ox = vertical ? 0 : margin.l;
  const outNodes: LNode[] = r.nodes.map((n: any, k: number) => ({
    id: spec.nodes[k].id, label: spec.nodes[k].label, colour: spec.nodes[k].colour, col: n.depth, inV: (n.targetLinks ?? []).reduce((a: number, l: any) => a + l.value, 0), outV: (n.sourceLinks ?? []).reduce((a: number, l: any) => a + l.value, 0),
    ...(vertical ? { x: n.y0, y: n.x0 + oy, w: n.y1 - n.y0, h: n.x1 - n.x0 } : { x: n.x0 + ox, y: n.y0, w: n.x1 - n.x0, h: n.y1 - n.y0 }),
  }));
  const outLinks: LLink[] = r.links.map((l: any, i: number) => {
    const f = spec.flows[i];
    let d: string, mid: [number, number];
    if (vertical) { const y0 = l.source.x1 + oy, y1 = l.target.x0 + oy, m = (y0 + y1) / 2; d = `M${l.y0},${y0}C${l.y0},${m} ${l.y1},${m} ${l.y1},${y1}`; mid = [(l.y0 + l.y1) / 2, m]; }
    else { const x0 = l.source.x1 + ox, x1 = l.target.x0 + ox, m = (x0 + x1) / 2; d = `M${x0},${l.y0}C${m},${l.y0} ${m},${l.y1} ${x1},${l.y1}`; mid = [m, (l.y0 + l.y1) / 2]; }
    return { i, d, width: Math.max(1, l.width), from: f.from, to: f.to, amount: f.amount, appear: f.appear, colour: spec.nodes[idx.get(f.from)!].colour, mid };
  });
  return { nodes: outNodes, links: outLinks, columns: cols, vertical, width, height };
}
/** every flow on the way into a flow's source and out of its target: the path it lights */
export function pathOf(spec: SankeySpec, i: number): Set<number> {
  const out = new Set<number>([i]);
  const up = (id: string) => spec.flows.forEach((f, k) => { if (f.to === id && !out.has(k)) { out.add(k); up(f.from); } });
  const down = (id: string) => spec.flows.forEach((f, k) => { if (f.from === id && !out.has(k)) { out.add(k); down(f.to); } });
  up(spec.flows[i].from); down(spec.flows[i].to);
  return out;
}

/** a character of the 12 px label, estimated a little wide so a label is cut by us, never by the box */
export const LABEL_PX = 7.2;
/** the room the drawing has inside the card (its border and side padding, which follow the same stage width the card's CSS does) */
export function innerWidth(stageWidth: number): number {
  const pad = stageWidth <= 600 ? 12 : 16;
  return Math.max(240, Math.floor(stageWidth) - 2 - 2 * pad);
}
/** the left and right room a left-to-right layout keeps for the labels of its first and last columns: what the longest needs, never more than 30% of the width */
export function labelMargins(firstLens: number[], lastLens: number[], width: number): { l: number; r: number } {
  const cap = Math.floor(width * 0.3), need = (lens: number[]) => (lens.length ? Math.max(...lens) * LABEL_PX + 10 : 0);
  return { l: Math.min(cap, Math.ceil(need(firstLens))), r: Math.min(cap, Math.ceil(need(lastLens))) };
}
/** a label cut with an ellipsis to the pixels it has; whole when it fits */
export function fitLabel(text: string, room: number): string {
  const chars = Math.floor(room / LABEL_PX);
  if (text.length <= chars) return text;
  return chars <= 1 ? "…" : text.slice(0, chars - 1) + "…";
}
