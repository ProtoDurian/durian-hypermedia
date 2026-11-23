import { layoutSankey, type LNode, type SankeyLayout } from "./layout";
import type { SankeySpec } from "./part";

export type Measure = (text: string) => number;
export type Label = { x: number; y: number; w: number; h: number; lines: string[] };
const gap = 4, lineHeight = 16;
/** Wrap at spaces, keeping every word intact, including a word wider than the requested room. */
export function labelLines(text: string, room: number, measure: Measure): string[] {
  const lines: string[] = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const last = lines.length - 1;
    if (last >= 0 && measure(lines[last] + " " + word) <= room) lines[last] += " " + word;
    else lines.push(word);
  }
  return lines.length ? lines : [""];
}
function size(text: string, room: number, measure: Measure): Label {
  const lines = labelLines(text, room - 8, measure);
  return { x: 0, y: 0, w: Math.ceil(lines.reduce((w, line) => Math.max(w, measure(line)), 0)) + 8, h: lines.length * lineHeight + 4, lines };
}
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(x, hi));
function columns(nodes: LNode[], vertical: boolean): LNode[][] {
  const groups = new Map<number, LNode[]>();
  for (const n of nodes) {
    const key = Math.round(vertical ? n.y : n.x);
    groups.set(key, [...(groups.get(key) ?? []), n]);
  }
  return [...groups.values()];
}
/** Labels are planned for every state together: revealing a flow never moves a persistent label. */
export function labelledLayout(spec: SankeySpec, availableWidth: number, measure: Measure): { layout: SankeyLayout; labels: Map<string, Label> } {
  let longestWord = 0;
  for (const n of spec.nodes) for (const word of n.label.split(/\s+/)) longestWord = Math.max(longestWord, measure(word));
  const width = Math.max(availableWidth, Math.ceil(longestWord) + 24);
  const probe = layoutSankey(spec, width, 320, false);
  const vertical = availableWidth < 520 && (probe.columns > 3 || (probe.columns > 2 && spec.nodes.some(n => measure(n.label) > width * .22)));
  const groups = columns(probe.nodes, false);
  const maxCol = Math.max(1, ...groups.map(g => g.length));
  const labels = new Map<string, Label>();
  if (!vertical) {
    const room = Math.max(longestWord + 8, Math.min(width * .3 - 12, width / (probe.columns + 1) - 20));
    for (const n of probe.nodes) labels.set(n.id, size(n.label, room, measure));
    const firstX = Math.min(...probe.nodes.map(n => n.x)), lastX = Math.max(...probe.nodes.map(n => n.x));
    const margin = (x: number) => Math.max(0, ...probe.nodes.filter(n => Math.abs(n.x - x) < 1).map(n => labels.get(n.id)!.w)) + 10;
    const l = margin(firstX), r = margin(lastX);
    const middle = probe.nodes.filter(n => n.x > firstX + 1 && n.x < lastX - 1);
    const pitch = Math.max(40, ...middle.map(n => labels.get(n.id)!.w + 24));
    const drawWidth = Math.max(width, l + r + 80, l + r + 14 + (probe.columns - 1) * pitch);
    const height = Math.max(320, Math.min(560, maxCol * 40 + 60), ...groups.map(g => g.reduce((h, n) => h + labels.get(n.id)!.h + gap, 8)));
    const layout = layoutSankey(spec, drawWidth, height, false, 14, 14, { l, r });
    for (const group of columns(layout.nodes, false)) {
      group.sort((a, b) => a.y - b.y);
      let bottom = gap;
      for (const n of group) {
        const p = labels.get(n.id)!;
        p.x = clamp(n.x === l ? n.x - p.w - 6 : n.x + n.w + 6, gap, drawWidth - p.w - gap);
        p.y = Math.max(bottom, clamp(n.y + n.h / 2 - p.h / 2, gap, height - p.h - gap));
        bottom = p.y + p.h + gap;
      }
      let top = height - gap;
      for (const n of [...group].reverse()) {
        const p = labels.get(n.id)!;
        p.y = Math.min(p.y, top - p.h);
        top = p.y - gap;
      }
    }
    return { layout, labels };
  }
  // Above each node row, pack full labels into shelves. Actual coordinates group justified sinks correctly.
  const provisional = layoutSankey(spec, width, Math.max(360, probe.columns * 96), true, 14, 14);
  const rowPlans = columns(provisional.nodes, true).map(row => {
    const shelves: { right: number; height: number }[] = [];
    const plans = row.sort((a, b) => a.x - b.x).map(n => {
      const p = size(n.label, Math.max(longestWord + 8, Math.min(200, width / Math.min(row.length, 2) - 12)), measure);
      p.x = clamp(n.x + n.w / 2 - p.w / 2, gap, width - p.w - gap);
      let shelf = shelves.findIndex(s => s.right + gap <= p.x);
      if (shelf < 0) { shelf = shelves.length; shelves.push({ right: 0, height: 0 }); }
      shelves[shelf].right = p.x + p.w;
      shelves[shelf].height = Math.max(shelves[shelf].height, p.h);
      labels.set(n.id, p);
      return { id: n.id, shelf };
    });
    return { plans, shelves, height: shelves.reduce((h, s) => h + s.height + gap, 0) };
  });
  const band = Math.max(...rowPlans.map(r => r.height));
  const height = Math.max(360, probe.columns * (band + 38));
  const layout = layoutSankey(spec, width, height, true, 14, 14, { l: 0, r: 0, t: band + gap, b: 8 });
  for (const row of rowPlans) for (const plan of row.plans) {
    const n = layout.nodes.find(n => n.id === plan.id)!, p = labels.get(plan.id)!;
    p.x = clamp(n.x + n.w / 2 - p.w / 2, gap, width - p.w - gap);
    p.y = n.y - gap - row.shelves.slice(0, plan.shelf + 1).reduce((h, s) => h + s.height + gap, 0) + gap;
  }
  return { layout, labels };
}
