// The graph part (format version 11): an explorable network graph, for finding your way around a big graph (hundreds of
// nodes: service calls, package dependencies). Parse, the layouts' numbers, the checks and the LLM view; pure. The view
// (view.tsx) draws it with cytoscape on a canvas.
//
//   ```graph title="Package dependencies" layout=layers
//   group core "core" [c1]
//   node parse "parser" in core
//   node check "doccheck" in core
//   node react "react renderer" [c2]
//   check -> parse
//   react -> parse
//   react -> chart.js "lazy"
//   ```
//
// Lines, one thing a line (`// text` is a comment):
//   group <id> ["label"] [in <group>] [colour] [note="..."]   a group; groups may sit in groups
//   node <id> ["label"] [in <group>] [colour] [note="..."]    a node; a node used in an edge and never declared is added
//   <a> -> <b> [-> <c> ...] ["label"] [colour] [dashed]       edges; each end may be a list (a, b) or a group's id
// An id may carry a numbered range: `node api-{1..8} in api` declares api-1 to api-8; `web-{1..3} -> api-{1..8}` is
// every pair (24 edges). Colours are the theme's words in square brackets: [c1] to [c8], [acc], [good], [warn], [bad],
// [muted]. A node takes its group's colour unless it names its own; a top-level group with no colour takes the next
// family colour in order.
//
// The info string: #id, title="...", layout=layers|force|radial (layers by default), dir=down|right (layers),
// centre=<node> (radial: the node in the middle), size=s|m|l (the stage's height).
//
// Work: parsing, pattern expansion and our own layouts (layers, radial, the still picture) charge the part's budget as they
// go. The force layout runs in the browser inside cytoscape, where it cannot be metered, so it has a fixed iteration count
// (forceIterations) and is charged here, up front, from the node and edge counts.
import { definePart } from "../types";
import { COLOUR_WORDS, FAMILY, isSpace, type Err } from "../kit/text";
import type { Budget } from "../../core/budget";
import { forceSeed, groupMap, layersLayout, radialLayout, stillOf } from "./layout";
import {
  GRAPH_KEYS, GRAPH_LABEL_MAX, GRAPH_LAYOUTS, GRAPH_TONES, forceIterations, nodeWidth, opSteps,
  type GEdge, type GGroup, type GNode, type GraphLimits, type GraphSpec,
} from "./shape";

export type { GraphSpec, GNode, GGroup, GEdge } from "./shape";

// ---- hand scans (no regular expression over author text) ----
const isIdChar = (c: string) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || (c >= "0" && c <= "9") || c === "_" || c === "." || c === "-";
const isDigit = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9";
export function isId(s: string): boolean { if (!s) return false; for (let i = 0; i < s.length; i++) if (!isIdChar(s[i])) return false; return true; }
const isHexDigit = (c: string) => isDigit(c) || (c >= "a" && c <= "f") || (c >= "A" && c <= "F");
/** "#fff", "ff0000", "#ff000080": a hex colour as written */
function isHexColour(s: string): boolean {
  let i = s[0] === "#" ? 1 : 0;
  const n = s.length - i;
  if (n < 3 || n > 8) return false;
  for (; i < s.length; i++) if (!isHexDigit(s[i])) return false;
  return true;
}
const startsNoCase = (s: string, w: string) => s.length >= w.length && s.slice(0, w.length).toLowerCase() === w;

type PatPart = { lit: string } | { a: string; b: string };
/** a word with {a..b} ranges split into its pieces, by one scan from left to right */
function patternParts(word: string): PatPart[] | null {
  const out: PatPart[] = []; let i = 0, lit = "", ranges = 0;
  while (i < word.length) {
    const c = word[i];
    if (c !== "{") { if (!isIdChar(c)) return null; lit += c; i++; continue; }
    let j = i + 1; while (j < word.length && isDigit(word[j])) j++;
    if (j === i + 1 || word[j] !== "." || word[j + 1] !== ".") return null;
    let k = j + 2; while (k < word.length && isDigit(word[k])) k++;
    if (k === j + 2 || word[k] !== "}") return null;
    if (lit) out.push({ lit }); lit = "";
    out.push({ a: word.slice(i + 1, j), b: word.slice(j + 2, k) }); ranges++;
    i = k + 1;
  }
  if (lit) out.push({ lit });
  return ranges ? out : null;
}

type Tok = { k: "word" | "str" | "tone" | "kv" | "arrow" | "comma"; v: string; key?: string };
const endsWord = (c: string) => isSpace(c) || c === "," || c === '"' || c === "[";
// split a line into words, "quoted text", [colour], key=value, -> and commas
function tokens(s: string): Tok[] | string {
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === " " || c === "\t") { i++; continue; }
    if (c === '"') { const j = s.indexOf('"', i + 1); if (j < 0) return `a quote is never closed: end the label with "`; out.push({ k: "str", v: s.slice(i + 1, j) }); i = j + 1; continue; }
    if (c === "[") { const j = s.indexOf("]", i + 1); if (j < 0) return `a [colour] is never closed: end it with ]`; out.push({ k: "tone", v: s.slice(i + 1, j).trim() }); i = j + 1; continue; }
    if (c === ",") { out.push({ k: "comma", v: "," }); i++; continue; }
    if (s.startsWith("->", i)) { out.push({ k: "arrow", v: "->" }); i += 2; continue; }
    let j = i;
    while (j < s.length && !endsWord(s[j]) && !s.startsWith("->", j)) j++;
    const w = s.slice(i, j);
    const eq = w.indexOf("=");
    if (eq > 0) {
      const key = w.slice(0, eq);
      if (s[j] === '"' && eq === w.length - 1) { const e = s.indexOf('"', j + 1); if (e < 0) return `a quote is never closed: end ${key}="... with "`; out.push({ k: "kv", key, v: s.slice(j + 1, e) }); i = e + 1; continue; }
      out.push({ k: "kv", key, v: w.slice(eq + 1) });
    } else out.push({ k: "word", v: w });
    i = j;
  }
  return out;
}

/** a word with {a..b} ranges, as the names it stands for; counts before it makes any, and charges the budget per name made */
export function expandPattern(word: string, cap: number, B: Budget): string[] | string {
  if (!word.includes("{")) return [word];
  const parts = patternParts(word);
  if (!parts) return `"${word}" is not a name or a pattern: a pattern is letters, digits, - _ . and ranges like {1..8}`;
  let count = 1;
  for (const p of parts) {
    if ("lit" in p) continue;
    const a = +p.a, b = +p.b;
    if (b < a) return `the range {${p.a}..${p.b}} counts down; write the smaller number first`;
    count *= b - a + 1;
    if (count > cap) return `the pattern ${word} makes ${count > 1e9 ? "over a billion" : count.toLocaleString("en")} names; at most ${cap.toLocaleString("en")}`;
  }
  let out = [""];
  for (const p of parts) {
    if ("lit" in p) { out = out.map((x) => x + p.lit); continue; }
    const next: string[] = [];
    for (const x of out) for (let k = +p.a; k <= +p.b; k++) { B.charge(1, 1, x.length + 4); next.push(x + k); }
    out = next;
  }
  return out;
}

const toneOf = (t: Tok, err: (m: string) => void): string | null => {
  const w = t.v.toLowerCase();
  if (GRAPH_TONES.includes(w)) return w;
  if (isHexColour(t.v) || startsNoCase(t.v, "rgb") || startsNoCase(t.v, "hsl")) err(`a colour is a theme word, not a value: write one of ${COLOUR_WORDS.map((x) => `[${x}]`).join(", ")} instead of [${t.v}]`);
  else err(`unknown colour [${t.v}]; colours are ${COLOUR_WORDS.map((x) => `[${x}]`).join(", ")}`);
  return null;
};
/** "@step" as a word of its own at the start of a line (a graph takes none) */
const isStepLine = (t: string) => t.startsWith("@step") && (t.length === 5 || !isIdChar(t[5]));

/** parse a graph block. `attrs` is the info string's (title, layout, ...). Throws BudgetError when the part's budget is spent. */
export function parseGraph(body: string, baseLine: number, attrs: Record<string, string>, partLine: number, lim: GraphLimits, B: Budget): GraphSpec {
  const errors: Err[] = [], warnings: Err[] = [];
  const err = (line: number, msg: string) => { if (errors.length < 40) errors.push({ line, msg }); };
  const layout = (attrs.layout ?? "layers") as GraphSpec["layout"];
  const spec: GraphSpec = { title: attrs.title ?? "", layout, dir: attrs.dir === "right" ? "right" : "down", centre: attrs.centre ?? null, size: (["s", "m", "l"].includes(attrs.size) ? attrs.size : "m") as GraphSpec["size"], nodes: [], groups: [], edges: [], foldFirst: false, forceIterations: 0, still: null, errors, warnings };
  for (const k of Object.keys(attrs)) {
    if (GRAPH_KEYS.includes(k)) continue;
    if (k === "center") err(partLine, `graph: write centre= (the British spelling), not center=`);
    else err(partLine, `graph: unknown attribute "${k}"; a graph takes #id, title="...", layout=layers|force|radial, dir=down|right, centre=<node>, size=s|m|l and static`);
  }
  if (!(GRAPH_LAYOUTS as readonly string[]).includes(layout)) err(partLine, `graph: layout must be layers, force or radial, not "${attrs.layout}"`);
  if (attrs.dir && !["down", "right"].includes(attrs.dir)) err(partLine, `graph: dir must be down or right, not "${attrs.dir}"`);
  if (attrs.dir && layout !== "layers") err(partLine, `graph: dir= is for layout=layers only`);
  if (attrs.size && !["s", "m", "l"].includes(attrs.size)) err(partLine, `graph: size must be s, m or l, not "${attrs.size}"`);
  if (layout === "radial" && !attrs.centre) err(partLine, `graph: layout=radial needs centre=<node>, the node in the middle`);
  if (attrs.centre && layout !== "radial") err(partLine, `graph: centre= is for layout=radial; add layout=radial or remove centre=`);

  const maxNodes = lim.graphNodes, maxEdges = lim.graphEdges, maxGroups = lim.graphGroups, maxDepth = lim.graphDepth;
  const nodes = new Map<string, GNode>(), groups = new Map<string, GGroup>();
  const pendingIn: { id: string; group: string; line: number; isGroup: boolean }[] = [];
  const edgeKey = new Map<string, number>();
  let over = false;
  const addNode = (id: string, line: number, declared: boolean): GNode | null => {
    if (nodes.size >= maxNodes) { if (!over) err(line, `graph: over ${maxNodes.toLocaleString("en")} nodes; at most ${maxNodes.toLocaleString("en")} (split the graph, or fold the detail into groups)`); over = true; return null; }
    B.charge(1, 1, 0);
    const n: GNode = { id, label: id, group: null, tone: null, note: "", line, declared, x: 0, y: 0, w: 0 };
    nodes.set(id, n);
    return n;
  };

  let at = 0, i = 0;
  while (at <= body.length && !over) {
    let to = body.indexOf("\n", at); if (to < 0) to = body.length;
    const raw = body.slice(at, to); at = to + 1;
    const line = baseLine + i++;
    const t = raw.trim();
    B.charge(1 + (t.length >> 4));
    if (!t || t.startsWith("//")) { continue; }
    if (isStepLine(t)) { err(line, `graph takes no @step lines: it is for exploring; tell a story with an animation`); continue; }
    const tk = tokens(t);
    if (typeof tk === "string") { err(line, `graph: ${tk}`); continue; }
    const head = tk[0];
    if (head.k === "word" && (head.v === "node" || head.v === "group")) {
      const isGroup = head.v === "group";
      const ids: string[] = []; let label: string | null = null, inG: string | null = null, tone: string | null = null, note = "";
      let bad = false;
      for (let k = 1; k < tk.length; k++) {
        const x = tk[k];
        if (x.k === "word" && x.v === "in") { const g = tk[k + 1]; if (!g || g.k !== "word") { err(line, `graph: "in" needs a group's id after it, like: node parse in core`); bad = true; break; } inG = g.v; k++; continue; }
        if (x.k === "word") { if (label !== null) { err(line, `graph: "${x.v}" after the label; put the ids first, then "label", then in <group> and a [colour]`); bad = true; break; } ids.push(x.v); continue; }
        if (x.k === "comma") continue;
        if (x.k === "str") { if (label !== null) { err(line, `graph: two labels on one line; a ${head.v} has one "label"`); bad = true; break; } label = x.v; continue; }
        if (x.k === "tone") { tone = toneOf(x, (m) => err(line, `graph: ${m}`)); continue; }
        if (x.k === "kv") { if (x.key === "note") { note = x.v; continue; } err(line, `graph: a ${head.v} takes note="...", not ${x.key}=`); bad = true; break; }
        if (x.k === "arrow") { err(line, `graph: a ${head.v} line holds no edge; write the edge on its own line (a -> b)`); bad = true; break; }
      }
      if (bad) { continue; }
      if (!ids.length) { err(line, `graph: ${head.v} needs an id, like: ${isGroup ? `group core "core" [c1]` : `node parse "parser" in core`}`); continue; }
      if (label !== null && label.length > GRAPH_LABEL_MAX) err(line, `graph: the label "${label.slice(0, 24)}..." is ${label.length} characters; at most ${GRAPH_LABEL_MAX} (put the rest in note="...")`);
      const all: string[] = [];
      for (const w of ids) { const ex = expandPattern(w, maxNodes, B); if (typeof ex === "string") { err(line, `graph: ${ex}`); bad = true; break; } all.push(...ex); }
      if (bad) { continue; }
      if (all.length > 1 && label !== null) { err(line, `graph: one label for ${all.length} ${head.v}s; a label names one ${head.v}: give each its own line, or drop the label (the id is shown)`); continue; }
      for (const id of all) {
        if (!isId(id)) { err(line, `graph: "${id}" is not an id: use letters, digits, - _ and .`); continue; }
        if (isGroup) {
          if (groups.has(id)) { err(line, `graph: group ${id} is declared twice (first at line ${groups.get(id)!.line})`); continue; }
          if (nodes.has(id)) { err(line, `graph: ${id} is a node (line ${nodes.get(id)!.line}) and a group; give the group another id`); continue; }
          if (groups.size >= maxGroups) { err(line, `graph: over ${maxGroups} groups`); over = true; break; }
          B.charge(1, 1, 0);
          groups.set(id, { id, label: label ?? id, parent: null, tone, note, line });
          if (inG) pendingIn.push({ id, group: inG, line, isGroup: true });
        } else {
          const had = nodes.get(id);
          if (had?.declared) { err(line, `graph: node ${id} is declared twice (first at line ${had.line})`); continue; }
          if (groups.has(id)) { err(line, `graph: ${id} is a group (line ${groups.get(id)!.line}) and a node; give the node another id`); continue; }
          // a node an edge used before its line: the node line gives it its label, group and colour
          const n = had ?? addNode(id, line, true); if (!n) break;
          n.declared = true; n.line = line;
          if (label !== null) n.label = label;
          n.tone = tone; n.note = note;
          if (inG) pendingIn.push({ id, group: inG, line, isGroup: false });
        }
      }
      continue;
    }
    // an edge line: ends -> ends [-> ends ...] ["label"] [colour] [dashed]
    if (!tk.some((x) => x.k === "arrow")) { err(line, `graph: "${t.slice(0, 40)}" is not a graph line: write group <id>, node <id>, or an edge a -> b`); continue; }
    const hops: string[][] = [[]]; let label = "", tone: string | null = null, dashed = false, bad = false, tail = false;
    for (const x of tk) {
      if (x.k === "arrow") { if (tail) { err(line, `graph: the label and [colour] come after the last end of an edge`); bad = true; break; } hops.push([]); continue; }
      if (x.k === "comma") continue;
      if (x.k === "word" && x.v === "dashed" && hops.length > 1 && hops[hops.length - 1].length) { dashed = true; tail = true; continue; }
      if (x.k === "word") { if (tail) { err(line, `graph: "${x.v}" after the edge's label; the label and [colour] come last`); bad = true; break; } hops[hops.length - 1].push(x.v); continue; }
      if (x.k === "str") { if (label) { err(line, `graph: two labels on one edge line`); bad = true; break; } label = x.v; tail = true; continue; }
      if (x.k === "tone") { tone = toneOf(x, (m) => err(line, `graph: ${m}`)); tail = true; continue; }
      if (x.k === "kv") { err(line, `graph: an edge takes a "label", a [colour] and dashed, not ${x.key}=`); bad = true; break; }
    }
    if (bad) { continue; }
    if (hops.some((h) => !h.length)) { err(line, `graph: an edge needs a name on each side of ->, like: check -> parse`); continue; }
    if (label.length > GRAPH_LABEL_MAX) err(line, `graph: an edge label is ${label.length} characters; at most ${GRAPH_LABEL_MAX}`);
    const ends: string[][] = [];
    for (const h of hops) {
      const e: string[] = [];
      for (const w of h) { const ex = expandPattern(w, maxNodes, B); if (typeof ex === "string") { err(line, `graph: ${ex}`); bad = true; break; } e.push(...ex); }
      if (bad) break;
      for (const id of e) if (!isId(id)) { err(line, `graph: "${id}" is not an id: use letters, digits, - _ and .`); bad = true; break; }
      ends.push(e);
    }
    if (bad) { continue; }
    // count before making anything: a short line may stand for millions of edges
    let made = 0;
    for (let k = 0; k + 1 < ends.length; k++) made += ends[k].length * ends[k + 1].length;
    if (spec.edges.length + made > maxEdges) { err(line, `graph: over ${maxEdges.toLocaleString("en")} edges (this line makes ${made.toLocaleString("en")}, ${spec.edges.length.toLocaleString("en")} before it); at most ${maxEdges.toLocaleString("en")}: draw fewer, or link groups instead of their members`); over = true; break; }
    for (let k = 0; k + 1 < ends.length && !over; k++) for (const a of ends[k]) for (const b of ends[k + 1]) {
      B.charge(1, 1, 0);
      for (const id of [a, b]) if (!nodes.has(id) && !groups.has(id)) { if (!addNode(id, line, false)) break; }
      if (over) break;
      const key = `${a}\u0000${b}\u0000${label}`;
      if (edgeKey.has(key)) { err(line, `graph: the edge ${a} -> ${b}${label ? ` "${label}"` : ""} is written twice (first at line ${edgeKey.get(key)})`); continue; }
      edgeKey.set(key, line);
      spec.edges.push({ from: a, to: b, label, tone, dashed, line } as GEdge);
    }
  }

  // groups and their parents; a group inside itself is refused
  for (const p of pendingIn) {
    if (!groups.has(p.group)) { err(p.line, `graph: ${p.id} is "in ${p.group}", which is not a group${nodes.has(p.group) ? ` (it is a node)` : ""}; declare it first: group ${p.group} "..."`); continue; }
    if (p.isGroup) groups.get(p.id)!.parent = p.group; else nodes.get(p.id)!.group = p.group;
  }
  const cyc = new Set<string>();
  for (const g of groups.values()) {
    const seen: string[] = [g.id];
    for (let p = g.parent; p; p = groups.get(p)?.parent ?? null) {
      B.charge(1 + seen.length);
      if (p === g.id || seen.includes(p)) {
        const ring = [...seen.slice(seen.indexOf(p)), p];
        const k = [...new Set(ring)].sort().join(",");
        if (!cyc.has(k)) { cyc.add(k); err(g.line, ring.length === 2 ? `graph: group ${g.id} is inside itself ("in ${g.id}"); a group sits in another group` : `graph: the groups ${ring.join(" in ")} sit inside each other in a ring; one of them must not be "in" the next`); }
        break;
      }
      seen.push(p);
      if (seen.length > maxDepth + 1) { err(g.line, `graph: group ${g.id} is ${seen.length - 1} groups deep; at most ${maxDepth}`); break; }
    }
  }
  spec.nodes = [...nodes.values()];
  spec.groups = [...groups.values()];
  if (!spec.nodes.length && !errors.length) err(partLine, `graph has no nodes: write node lines (node parse "parser") or edges (check -> parse)`);
  if (errors.length) return spec;

  // edges and groups: a node may link to a group or to its members, never both (folded, both would be one line)
  const ancestors = (id: string): string[] => { const out: string[] = []; let p = nodes.get(id)?.group ?? groups.get(id)?.parent ?? null; while (p) { out.push(p); p = groups.get(p)?.parent ?? null; } return out; };
  const anc = new Map<string, string[]>();
  const ancOf = (id: string) => { let a = anc.get(id); if (!a) { a = ancestors(id); anc.set(id, a); B.charge(1 + a.length); } return a; };
  const outs = new Map<string, Map<string, number>>(), ins = new Map<string, Map<string, number>>();
  for (const e of spec.edges) {
    if (ancOf(e.from).includes(e.to) || ancOf(e.to).includes(e.from)) { err(e.line, `graph: the edge ${e.from} -> ${e.to} joins ${groups.has(e.from) ? `the group ${e.from} to its own member ${e.to}` : `${e.from} to its own group ${e.to}`}; link to a node outside the group`); continue; }
    for (const [map, a, b] of [[outs, e.from, e.to], [ins, e.to, e.from]] as const) {
      let m = map.get(a); if (!m) { m = new Map(); map.set(a, m); }
      if (!m.has(b)) m.set(b, e.line);
    }
  }
  const clash = new Set<string>();
  for (const [map, dir] of [[outs, "->"], [ins, "<-"]] as const) for (const [a, m] of map) for (const [b, atLine] of m) {
    B.charge(opSteps(1 + ancOf(b).length));
    for (const g of ancOf(b)) if (m.has(g)) {
      const k = `${a}|${g}|${b}`; if (clash.has(k)) continue; clash.add(k);
      const line = Math.max(atLine, m.get(g)!);
      err(line, dir === "->" ? `graph: ${a} links to the group ${g} and to its member ${b} at once; when ${g} is folded both become one line: link to the group or to its members, not both` : `graph: the group ${g} and its member ${b} both link to ${a}; when ${g} is folded both become one line: link from the group or from its members, not both`);
    }
  }
  if (spec.centre && !nodes.has(spec.centre)) err(partLine, groups.has(spec.centre) ? `graph: centre=${spec.centre} is a group; the centre is a node` : `graph: centre=${spec.centre} is not a node of this graph`);
  if (errors.length) return spec;

  // colours: a top-level group with no colour takes the next family colour; a group takes its parent's; a node its group's
  let fam = 0;
  for (const g of spec.groups) if (!g.parent && !g.tone) g.tone = FAMILY[fam++ % FAMILY.length];
  const gTone = (id: string | null): string | null => { for (let p = id; p; p = groups.get(p)?.parent ?? null) { const g = groups.get(p)!; if (g.tone) return g.tone; } return null; };
  for (const g of spec.groups) if (!g.tone) g.tone = gTone(g.parent);
  for (const n of spec.nodes) { if (!n.tone) n.tone = gTone(n.group); n.w = nodeWidth(n.label); }
  B.charge(opSteps(spec.nodes.length + spec.groups.length));

  spec.foldFirst = spec.nodes.length > lim.graphFoldFirst && spec.groups.length > 0;
  if (spec.nodes.length > lim.graphFoldFirst) {
    const loose = spec.nodes.filter((n) => !n.group).length;
    if (loose > lim.graphFoldFirst) warnings.push({ line: partLine, msg: `graph: ${spec.nodes.length} nodes and ${loose} of them in no group; the first view draws them all: put them in groups so it starts small` });
  }
  if (layout === "layers") layersLayout(spec, B);
  else if (layout === "radial") radialLayout(spec, B);
  else forceSeed(spec, B);
  spec.still = stillOf(spec, B);
  return spec;
}

// ---------------------------------------------------------------- the LLM view
const name = (id: string, label: string) => (label && label !== id ? `${id} "${label}"` : id);
/** degree of every node and group as written: [id, in, out], most connected first */
export function mostConnected(spec: GraphSpec, k = 5): { id: string; in: number; out: number }[] {
  const d = new Map<string, { id: string; in: number; out: number; at: number }>();
  const get = (id: string) => { let x = d.get(id); if (!x) { x = { id, in: 0, out: 0, at: d.size }; d.set(id, x); } return x; };
  for (const nd of spec.nodes) get(nd.id);
  for (const e of spec.edges) { if (e.from === e.to) continue; get(e.from).out++; get(e.to).in++; }
  return [...d.values()].filter((x) => x.in + x.out > 0).sort((a, b) => b.in + b.out - (a.in + a.out) || a.at - b.at).slice(0, k).map(({ id, in: i, out: o }) => ({ id, in: i, out: o }));
}
export const degreeText = (x: { in: number; out: number }) => [x.in ? `${x.in} in` : "", x.out ? `${x.out} out` : ""].filter(Boolean).join(", ");

/** what an LLM reads: the nodes by group, the edges as a -> b lines, and the most connected nodes. Linear in the spec (already paid for). */
export function graphLlm(spec: GraphSpec): string {
  const g = spec.groups.length, n = spec.nodes.length, e = spec.edges.length;
  const out: string[] = [];
  out.push(`Graph${spec.title ? ` "${spec.title}"` : ""}: ${n} node${n === 1 ? "" : "s"}${g ? ` in ${g} group${g === 1 ? "" : "s"}` : ""}, ${e} edge${e === 1 ? "" : "s"} (a -> b: a links to b).`);
  const byId = groupMap(spec);
  const path = (id: string) => { const p: string[] = []; for (let x: string | null = id; x; x = byId.get(x)?.parent ?? null) p.unshift(x); return p.join("/"); };
  const direct = new Map<string, GNode[]>(), kids = new Map<string, string[]>(), loose: GNode[] = [];
  for (const nd of spec.nodes) { if (!nd.group) { loose.push(nd); continue; } const a = direct.get(nd.group); if (a) a.push(nd); else direct.set(nd.group, [nd]); }
  for (const x of spec.groups) if (x.parent) { const a = kids.get(x.parent); if (a) a.push(x.id); else kids.set(x.parent, [x.id]); }
  const lines: string[] = [];
  for (const grp of spec.groups) {
    const what = [...(direct.get(grp.id) ?? []).map((nd) => name(nd.id, nd.label)), ...(kids.get(grp.id) ?? []).map((k) => `group ${k}`)];
    lines.push(`- ${grp.parent ? path(grp.id) : grp.id}${grp.label !== grp.id ? ` "${grp.label}"` : ""}: ${what.join(", ") || "(empty)"}`);
  }
  if (loose.length) lines.push(`- ${g ? "in no group" : "nodes"}: ${loose.map((nd) => name(nd.id, nd.label)).join(", ")}`);
  out.push(g ? `Nodes by group:\n${lines.join("\n")}` : lines[0].slice(2));
  const notes = [...spec.groups, ...spec.nodes].filter((x) => x.note);
  if (notes.length) out.push(`Notes:\n${notes.map((x) => `- ${x.id}: ${x.note}`).join("\n")}`);
  if (e) out.push(`Edges:\n${spec.edges.map((x) => `${x.from} -> ${x.to}${x.label ? `: ${x.label}` : ""}`).join("\n")}`);
  const top = mostConnected(spec);
  if (top.length) out.push(`Most connected: ${top.map((x) => `${x.id} (${degreeText(x)})`).join(", ")}.`);
  return out.join("\n\n");
}
/** a part that does not parse reads as its source, as written */
function sourceAsWritten(body: string): string {
  let end = body.length;
  while (end > 0 && body[end - 1] === "\n") end--;
  return "```graph\n" + body.slice(0, end) + "\n```";
}

export { forceIterations };
export default definePart<GraphSpec>({
  name: "graph",
  form: "fenced",
  steps: false,
  llmKind: "own",
  dependencies: ["cytoscape"],
  parse: (input, ctx) => parseGraph(input.body, input.bodyLine, input.attrs, input.line, ctx.limits, ctx.budget),
  llm: (s, input) => (s.errors.length ? sourceAsWritten(input.body) : graphLlm(s)),
  check: (s) => [...s.errors.map((e) => ({ line: e.line, message: e.msg })), ...s.warnings.map((w) => ({ line: w.line, level: "warn" as const, message: w.msg }))],
});
