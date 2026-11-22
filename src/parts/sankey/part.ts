// The sankey part (format version 11): flows between nodes, a line each. Parse, checks and the LLM view; pure. The
// layout is d3-sankey's (layout.ts, called by the view); its cost is a function of the sizes only and is charged here,
// when the part is read, so a page that would lay out too much is refused before anything draws.
//
//   ```sankey title="Where a request's time goes" unit=ms
//   request -> auth: 12
//   request -> handler: 80
//   handler -> db: 55
//   node db "Postgres" [c3]
//   ```
import { definePart } from "../types";
import { COLOUR_WORDS, familyOf, isSpace, mdTable, type Err } from "../kit/text";
import type { Budget } from "../../core/budget";

/** d3-sankey's relaxation passes: the view asks for exactly this many, and the budget charges for them */
export const SANKEY_ITERATIONS = 32;
/** a node label longer than this gets a warning */
export const SANKEY_LABEL = 60;
export interface SNode { id: string; label: string; colour: string; named: boolean }
export interface SFlow { from: string; to: string; amount: number; appear: number; line: number }
export interface SankeySpec { title: string; unit: string; nodes: SNode[]; flows: SFlow[]; steps: string[]; errors: Err[]; warnings: Err[] }
/** what the layout costs: charged once per part, deterministic */
export const sankeyCost = (nodes: number, flows: number) => SANKEY_ITERATIONS * 2 * (nodes + flows) + nodes * flows;

// ---- hand scans (no regular expression over author text) ----
const isIdChar = (c: string) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || (c >= "0" && c <= "9") || c === "_" || c === "." || c === "-";
export function isId(s: string): boolean { if (!s) return false; for (const c of s) if (!isIdChar(c)) return false; return true; }
/** a decimal number as written: an optional "-", digits, an optional "." and digits */
function isNumber(s: string): boolean {
  let i = s[0] === "-" ? 1 : 0, d = 0;
  while (i < s.length && s[i] >= "0" && s[i] <= "9") { i++; d++; }
  if (!d) return false;
  if (i < s.length && s[i] === ".") { i++; let f = 0; while (i < s.length && s[i] >= "0" && s[i] <= "9") { i++; f++; } if (!f) return false; }
  return i === s.length;
}
/** "from -> to: amount" (null when the line is not a flow) */
export function flowLine(t: string): { from: string; to: string; amount: string } | null {
  const a = t.indexOf("->");
  if (a < 0) return null;
  const colon = t.indexOf(":", a + 2);
  if (colon < 0) return null;
  const from = t.slice(0, a).trim(), to = t.slice(a + 2, colon).trim(), amount = t.slice(colon + 1).trim();
  return isId(from) && isId(to) && isNumber(amount) ? { from, to, amount } : null;
}
/** `node <id> "label" [colour]`: the id, the label or undefined, the colour word or undefined; null when it is not one */
export function nodeLine(t: string): { id: string; label?: string; colour?: string } | null {
  if (!t.startsWith("node") || !isSpace(t[4])) return null;
  let i = 4;
  while (i < t.length && isSpace(t[i])) i++;
  const s = i;
  while (i < t.length && isIdChar(t[i])) i++;
  const id = t.slice(s, i);
  if (!id) return null;
  while (i < t.length && isSpace(t[i])) i++;
  let label: string | undefined, colour: string | undefined;
  if (t[i] === '"') { const e = t.indexOf('"', i + 1); if (e < 0) return null; label = t.slice(i + 1, e); i = e + 1; while (i < t.length && isSpace(t[i])) i++; }
  if (t[i] === "[") { const e = t.indexOf("]", i + 1); if (e < 0) return null; colour = t.slice(i + 1, e).trim(); i = e + 1; while (i < t.length && isSpace(t[i])) i++; }
  return i === t.length ? { id, label, colour } : null;
}
const colourMsg = (bad: string) => `"[${bad}]" is not a colour word; use ${COLOUR_WORDS.map((w) => `[${w}]`).join(" ")} (no hex values)`;
/** the bracketed word at the end of a line that is not a colour word, if any */
function badColour(t: string): string | undefined {
  const e = t.trimEnd();
  if (!e.endsWith("]")) return undefined;
  const o = e.lastIndexOf("[");
  if (o < 0) return undefined;
  const w = e.slice(o + 1, -1).trim();
  return COLOUR_WORDS.includes(w) ? undefined : w;
}

type Lim = { sankeyFlows: number; sankeyNodes: number; sankeySteps: number };
interface Chunk { text: string; line: number; appear: number }

export function parseSankey(chunks: Chunk[], attrs: Record<string, string>, line: number, stepTitles: { title: string; line: number }[], lim: Lim, budget?: Budget): SankeySpec {
  const errors: Err[] = [], warnings: Err[] = [];
  const spec: SankeySpec = { title: attrs.title ?? "", unit: attrs.unit ?? "", nodes: [], flows: [], steps: stepTitles.map((s) => s.title), errors, warnings };
  for (const k of Object.keys(attrs)) if (!["title", "unit", "id", "llm", "static"].includes(k)) errors.push({ line, msg: `sankey: unknown attribute "${k}" (the attributes are title, unit, static)` });
  if (stepTitles.length > lim.sankeySteps) errors.push({ line: stepTitles[0].line, msg: `sankey: at most ${lim.sankeySteps} steps (this one has ${stepTitles.length}); merge some` });
  const byId = new Map<string, SNode>();
  const node = (id: string): SNode => {
    let n = byId.get(id);
    if (!n) { n = { id, label: id, colour: familyOf(byId.size), named: false }; byId.set(id, n); spec.nodes.push(n); }
    return n;
  };
  let lines = 0, stop = false;
  for (const ch of chunks) {
    if (stop) break;
    let ln = ch.line;
    for (let from = 0; from <= ch.text.length; ln++) {
      let to = ch.text.indexOf("\n", from);
      if (to < 0) to = ch.text.length;
      const raw = ch.text.slice(from, to);
      from = to + 1;
      budget?.charge(1 + (raw.length >> 4));
      const t = raw.trim();
      if (t && !t.startsWith("//")) {
        lines++;
        const f = flowLine(t);
        if (f) {
          const amount = +f.amount;
          if (!(amount > 0)) errors.push({ line: ln, msg: `sankey: the flow ${f.from} -> ${f.to} has an amount of ${f.amount}; an amount is above 0 (remove the line to show no flow)` });
          else if (f.from === f.to) errors.push({ line: ln, msg: `sankey: "${f.from}" flows into itself; a flow goes from one node to another` });
          else if (spec.flows.length >= lim.sankeyFlows) { errors.push({ line: ln, msg: `sankey: more than ${lim.sankeyFlows} flows; merge the small ones into an "other" node` }); stop = true; break; }
          else {
            spec.flows.push({ from: f.from, to: f.to, amount, appear: ch.appear, line: ln });
            node(f.from); node(f.to);
            if (spec.nodes.length > lim.sankeyNodes) { errors.push({ line: ln, msg: `sankey: more than ${lim.sankeyNodes} nodes; merge the small ones` }); stop = true; break; }
          }
        } else if (t === "node" || (t.startsWith("node") && isSpace(t[4]))) {
          const nm = nodeLine(t);
          if (!nm) { const bad = badColour(t); errors.push({ line: ln, msg: bad !== undefined ? `sankey: ${colourMsg(bad)}` : `sankey: write a node line as: node <id> "label" [c3]` }); }
          else {
            const n = node(nm.id);
            if (spec.nodes.length > lim.sankeyNodes) { errors.push({ line: ln, msg: `sankey: more than ${lim.sankeyNodes} nodes; merge the small ones` }); stop = true; break; }
            if (nm.label !== undefined) { n.label = nm.label; n.named = true; if (nm.label.length > SANKEY_LABEL) warnings.push({ line: ln, msg: `sankey: the label "${nm.label.slice(0, 24)}..." is ${nm.label.length} characters; keep it under ${SANKEY_LABEL}` }); }
            if (nm.colour !== undefined) { if (!COLOUR_WORDS.includes(nm.colour)) errors.push({ line: ln, msg: `sankey: ${colourMsg(nm.colour)}` }); else n.colour = nm.colour; }
          }
        } else errors.push({ line: ln, msg: `sankey: line not understood: "${t.slice(0, 50)}"; write a flow as: from -> to: amount (for example: request -> auth: 12), or a node as: node db "Postgres" [c3]` });
      }
      if (to === ch.text.length) break;
    }
  }
  if (!spec.flows.length && !errors.length) errors.push({ line, msg: `sankey: no flows; write one per line as: from -> to: amount` });
  // the layout the view will run, and the loop search below: their cost is a function of the sizes only
  budget?.charge(lines + 4 * (spec.nodes.length + spec.flows.length) + sankeyCost(spec.nodes.length, spec.flows.length), spec.nodes.length + 2 * spec.flows.length);
  const loop = findLoop(spec);
  if (loop) errors.push({ line: loop.line, msg: `sankey: a loop: ${loop.path.join(" -> ")}; a sankey flows one way, so remove or reroute one of these flows` });
  // a node that sends out more than comes in
  const inn = new Map<string, number>(), out = new Map<string, number>(), firstOut = new Map<string, SFlow>();
  for (const f of spec.flows) { inn.set(f.to, (inn.get(f.to) ?? 0) + f.amount); out.set(f.from, (out.get(f.from) ?? 0) + f.amount); if (!firstOut.has(f.from)) firstOut.set(f.from, f); }
  for (const n of spec.nodes) {
    const i = inn.get(n.id) ?? 0, o = out.get(n.id) ?? 0;
    if (i > 0 && o > i + 1e-9) warnings.push({ line: firstOut.get(n.id)!.line, msg: `sankey: "${n.id}" sends out ${round(o)} but only ${round(i)} comes in` });
  }
  return spec;
}
const round = (n: number) => Math.round(n * 100) / 100;
/** the first loop of flows, named (d3-sankey cannot lay one out); an explicit stack, so a long chain cannot overflow it */
function findLoop(spec: SankeySpec): { path: string[]; line: number } | null {
  const adj = new Map<string, SFlow[]>();
  for (const f of spec.flows) { let a = adj.get(f.from); if (!a) adj.set(f.from, (a = [])); a.push(f); }
  const state = new Map<string, 1 | 2>(); // 1 on the path now, 2 done
  for (const start of spec.nodes) {
    if (state.get(start.id)) continue;
    const path: string[] = [start.id], next: number[] = [0];
    state.set(start.id, 1);
    while (path.length) {
      const id = path[path.length - 1], out = adj.get(id) ?? [], k = next[next.length - 1];
      if (k >= out.length) { state.set(id, 2); path.pop(); next.pop(); continue; }
      next[next.length - 1]++;
      const f = out[k], s = state.get(f.to);
      if (s === 1) return { path: [...path.slice(path.indexOf(f.to)), f.to], line: f.line };
      if (!s) { state.set(f.to, 1); path.push(f.to); next.push(0); }
    }
  }
  return null;
}
/** a flow's share of its source's outgoing flow, counting the flows shown up to step `upto` */
export function flowShare(spec: SankeySpec, f: SFlow, upto = Infinity): number {
  let total = 0;
  for (const x of spec.flows) if (x.from === f.from && x.appear <= upto) total += x.amount;
  return total ? f.amount / total : 1;
}
export const nodeLabel = (spec: SankeySpec, id: string) => spec.nodes.find((n) => n.id === id)?.label ?? id;
export function sankeyLlm(spec: SankeySpec): string {
  const head = `Sankey${spec.title ? `: ${spec.title}` : ""}${spec.unit ? ` (${spec.unit})` : ""}.`;
  const cols = ["from", "to", `amount${spec.unit ? ` (${spec.unit})` : ""}`];
  const labels = new Map(spec.nodes.map((n) => [n.id, n.label]));
  const row = (f: SFlow) => [labels.get(f.from) ?? f.from, labels.get(f.to) ?? f.to, String(f.amount)];
  if (!spec.steps.length) return `${head}\n\n${mdTable(cols, spec.flows.map(row))}`;
  // flows are listed under the step they first appear in; the first step also holds what came before the first @step line
  const groups: SFlow[][] = spec.steps.map(() => []);
  for (const f of spec.flows) groups[Math.min(f.appear, groups.length - 1)].push(f);
  const out = [head];
  groups.forEach((g, k) => { out.push("", `Step ${k + 1}: ${spec.steps[k]}`, ""); out.push(g.length ? mdTable(cols, g.map(row)) : "No new flows."); });
  return out.join("\n");
}

export default definePart<SankeySpec>({
  name: "sankey",
  form: "fenced",
  steps: true,
  llmKind: "own",
  dependencies: ["d3-sankey"],
  parse: (input, ctx) => {
    const chunks: Chunk[] = [{ text: input.head, line: input.bodyLine, appear: 0 }, ...input.steps.map((s, j) => ({ text: s.raw, line: s.line + 1, appear: j }))];
    return parseSankey(chunks, input.attrs, input.line, input.steps, ctx.limits, ctx.budget);
  },
  llm: (s) => sankeyLlm(s),
  check: (s) => [...s.errors.map((e) => ({ line: e.line, message: e.msg })), ...s.warnings.map((w) => ({ line: w.line, level: "warn" as const, message: w.msg }))],
});
