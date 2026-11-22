// flame: the source of a ```flame part (DESIGN 4.8): a flame chart (indented `start end name` lines, a trace) or a flame graph
// (folded stacks `a;b;c count`, what profilers print). Both become one list of frames with a start and an end on one axis. Pure.
import { Budget, partLimitsOf } from "../../core/budget";
import { definePart } from "../types";
import type { LIMITS } from "./limits";
import { numberOrder } from "./order";
import { mdTable } from "../kit/text";
import { checkAttrs, bodyLines, chartLine, foldedLine, textOrder, type Issue11, type Src } from "./source";

export interface Frame { id: number; name: string; depth: number; parent: number; start: number; end: number; self: number; total: number; line: number; /** a family colour word chosen by the caller (the trace part colours by service); the flame colours by group when absent */ colour?: string }
export interface FlameSpec {
  form: "chart" | "graph"; title: string; unit: string; dir: "up" | "down"; colour: "group" | "heat";
  frames: Frame[]; /** the frame ids, root first, each frame's children in order */ children: number[][]; roots: number[];
  origin: number; span: number; errors: Issue11[]; warnings: Issue11[];
}

export function parseFlame(src: Src, limits: typeof LIMITS, budget: Budget = new Budget(partLimitsOf(), null, null, "the flame part")): FlameSpec {
  const FLAME_CAPS = { frames: limits.flameFrames, lines: limits.flameLines, depth: limits.flameDepth, name: limits.flameName };
  const errors: Issue11[] = [], warnings: Issue11[] = [];
  checkAttrs(src, ["unit", "dir", "colour"], "flame", errors, budget);
  const lines = bodyLines(src.body, src.bodyLine, budget);
  budget.charge(lines.reduce((n, l) => n + l.text.length + 1, 0));
  const chartish = lines.filter((l) => chartLine(l.text) !== null);
  const form: "chart" | "graph" = chartish.length ? "chart" : "graph";
  const spec: FlameSpec = { form, title: src.attrs.title ?? "", unit: src.attrs.unit ?? "", dir: form === "chart" ? "down" : "up", colour: "group", frames: [], children: [], roots: [], origin: 0, span: 0, errors, warnings };
  if (src.attrs.dir !== undefined) { if (src.attrs.dir === "up" || src.attrs.dir === "down") spec.dir = src.attrs.dir; else errors.push({ line: src.line, msg: `flame: dir= is up or down (got "${src.attrs.dir}")` }); }
  if (src.attrs.colour !== undefined) { if (src.attrs.colour === "group" || src.attrs.colour === "heat") spec.colour = src.attrs.colour; else errors.push({ line: src.line, msg: `flame: colour= is group or heat (got "${src.attrs.colour}")` }); }
  if (src.steps.length) errors.push({ line: src.steps[0].line, msg: `flame takes no @step lines` });
  if (lines.length > FLAME_CAPS.lines) { errors.push({ line: src.line, msg: `flame: at most ${FLAME_CAPS.lines} lines (this one has ${lines.length}); aggregate the stacks first (merge equal stacks and add their counts)` }); return spec; }
  budget.charge(lines.length * 4, lines.length * 2);
  if (!lines.length) { errors.push({ line: src.line, msg: `flame: no frames; write indented lines "start end name", or folded stacks "a;b;c 120"` }); return spec; }
  const mix = (l: { text: string; line: number }, want: string) => errors.push({ line: l.line, msg: `flame: this line is ${want}, but the part is a flame ${form}; use one form: indented "start end name" lines (a chart), or "a;b;c count" stacks (a graph)` });
  if (form === "chart") {
    const stack: { depth: number; indent: number; id: number }[] = [];
    for (const l of lines) {
      budget.charge(4 + l.text.length, 2, l.text.length);
      const m = chartLine(l.text);
      if (!m) { mix(l, "not a chart line (start end name)"); continue; }
      if (/\t/.test(m[1])) { errors.push({ line: l.line, msg: `flame: indent with spaces, not tabs` }); continue; }
      const indent = m[1].length, start = +m[2], end = +m[3], name = m[4].trim();
      if (end < start) { errors.push({ line: l.line, msg: `flame: "${name}" ends (${end}) before it starts (${start}); swap them` }); continue; }
      if (name.length > FLAME_CAPS.name) { errors.push({ line: l.line, msg: `flame: a frame name is at most ${FLAME_CAPS.name} characters` }); continue; }
      while (stack.length && stack[stack.length - 1].indent >= indent) { budget.charge(1); stack.pop(); }
      const parent = stack.length ? stack[stack.length - 1] : null;
      if (!parent && indent > 0 && !spec.frames.length) { errors.push({ line: l.line, msg: `flame: the first frame is not indented; start with the root at the left edge` }); continue; }
      if (parent) {
        const p = spec.frames[parent.id];
        if (start < p.start || end > p.end) { errors.push({ line: l.line, msg: `flame: "${name}" (${start} to ${end}) is outside its parent "${p.name}" (${p.start} to ${p.end}); a child runs inside its parent's time` }); continue; }
      }
      if (spec.frames.length >= FLAME_CAPS.frames) { errors.push({ line: l.line, msg: `flame: more than ${FLAME_CAPS.frames} frames; aggregate them (merge short frames into their parent)` }); break; }
      const depth = parent ? spec.frames[parent.id].depth + 1 : 0;
      if (depth > FLAME_CAPS.depth) { errors.push({ line: l.line, msg: `flame: nested deeper than ${FLAME_CAPS.depth} levels` }); continue; }
      const f: Frame = { id: spec.frames.length, name, depth, parent: parent ? parent.id : -1, start, end, self: 0, total: end - start, line: l.line };
      spec.frames.push(f); stack.push({ depth, indent, id: f.id });
    }
  } else {
    // folded stacks: merge them into a tree; a frame's width is its samples, laid out left to right in name order
    interface N { name: string; total: number; kids: Map<string, N>; line: number }
    const root: N = { name: "", total: 0, kids: new Map(), line: src.line };
    let visits = 0, nodes = 0;
    for (const l of lines) {
      const m = foldedLine(l.text);
      if (!m || (!m[1].includes(";") && /^\d/.test(m[1]) && /\s/.test(m[1]))) { mix(l, "not a folded stack (a;b;c count)"); continue; }
      const count = +m[2];
      if (!(count > 0)) { errors.push({ line: l.line, msg: `flame: the count ${m[2]} is not above 0; a stack is written with the samples it had (a;b;c 120)` }); continue; }
      if (!Number.isFinite(root.total + count)) { errors.push({ line: l.line, msg: `flame: the combined count is not finite; scale the counts down` }); continue; }
      const names = m[1].split(";").map((x) => x.trim());
      if (names.some((x) => !x)) { errors.push({ line: l.line, msg: `flame: an empty frame name in "${m[1].slice(0, 40)}"; frames are separated by one ;` }); continue; }
      if (names.length > FLAME_CAPS.depth) { errors.push({ line: l.line, msg: `flame: a stack deeper than ${FLAME_CAPS.depth} frames` }); continue; }
      budget.charge(names.length, names.length);
      visits += names.length;
      let n = root;
      for (const nm of names) { budget.charge(1, 1, nm.length); let k = n.kids.get(nm); if (!k) { if (++nodes > FLAME_CAPS.frames) { errors.push({ line: l.line, msg: `flame: more than ${FLAME_CAPS.frames} different frames after merging the stacks; aggregate them (merge rare frames into their caller)` }); return spec; } k = { name: nm.slice(0, FLAME_CAPS.name), total: 0, kids: new Map(), line: l.line }; n.kids.set(nm, k); } k.total += count; n = k; }
      root.total += count;
    }
    void visits;
    const place = (n: N, depth: number, parent: number, start: number) => {
      budget.charge(1, 1);
      const f: Frame = { id: spec.frames.length, name: n.name, depth, parent, start, end: start + n.total, self: 0, total: n.total, line: n.line };
      spec.frames.push(f);
      let x = start;
      for (const k of textOrder([...n.kids.values()], (x) => x.name, budget)) { place(k, depth + 1, f.id, x); x += k.total; }
    };
    // one root per first frame (they usually share one: main)
    let x = 0;
    for (const k of textOrder([...root.kids.values()], (x) => x.name, budget)) { place(k, 0, -1, x); x += k.total; }
  }
  budget.charge(spec.frames.length * 6, spec.frames.length * 3);
  // the tree: children in order, self time, the axis
  spec.children = spec.frames.map(() => []);
  for (const f of spec.frames) if (f.parent < 0) spec.roots.push(f.id); else spec.children[f.parent].push(f.id);
  for (const f of spec.frames) f.self = Math.max(0, f.total - spec.children[f.id].reduce((a, k) => a + spec.frames[k].total, 0));
  if (spec.frames.length) { spec.origin = Math.min(...spec.roots.map((r) => spec.frames[r].start)); spec.span = Math.max(...spec.roots.map((r) => spec.frames[r].end)) - spec.origin; }
  if (!spec.frames.length && !errors.length) errors.push({ line: src.line, msg: `flame: no frames` });
  if (form === "chart" && spec.roots.length > 1) warnings.push({ line: spec.frames[spec.roots[1]].line, msg: `flame: ${spec.roots.length} frames at the left edge; a trace usually has one root (indent the others under it)` });
  budget.charge(spec.frames.length * 2, spec.frames.length * 2);
  return spec;
}
/** share of the whole, in percent with one decimal */
export const pct = (v: number, whole: number) => (whole > 0 ? Math.round((v / whole) * 1000) / 10 : 0);
export const fmtNum = (v: number) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100));
/** frames whose name contains the text (case does not matter); a reader's search gets a budget of its own */
export function searchFrames(spec: FlameSpec, q: string, b: Budget = new Budget({ steps: 200_000, values: 200_000, chars: 200_000 }, null, null, "the flame search")): { ids: number[]; total: number } {
  const t = q.trim().toLowerCase();
  if (!t) return { ids: [], total: 0 };
  b.charge(1 + q.length, spec.frames.length * 2);
  const ids: number[] = []; let total = 0;
  const covered = spec.frames.map(() => false);
  const todo = [...spec.roots].reverse();
  while (todo.length) {
    b.charge(1);
    const id = todo.pop()!, f = spec.frames[id];
    b.charge(1 + f.name.length);
    const hit = f.name.toLowerCase().includes(t);
    const above = f.parent >= 0 && covered[f.parent];
    covered[id] = above || hit;
    if (hit) { ids.push(id); if (!above) total += f.total; }
    for (let j = spec.children[id].length - 1; j >= 0; j--) { b.charge(1); todo.push(spec.children[id][j]); }
  }
  return { ids, total };
}
export function flameLlm(spec: FlameSpec): string {
  const u = spec.unit ? ` ${spec.unit}` : "";
  if (spec.form === "chart") {
    const out = [`Flame chart${spec.title ? `: ${spec.title}` : ""}${spec.unit ? ` (${spec.unit})` : ""}. Each line is a call: its name, when it started and ended, and how long it took; indented lines are inside the line above.`, ""];
    for (const f of spec.frames) out.push(`${"  ".repeat(f.depth)}${f.name} ${fmtNum(f.start)}–${fmtNum(f.end)} (${fmtNum(f.total)}${u})`);
    return out.join("\n");
  }
  const total = spec.roots.reduce((a, r) => a + spec.frames[r].total, 0);
  const head = `Flame graph${spec.title ? `: ${spec.title}` : ""}${spec.unit ? ` (${spec.unit})` : ""}. ${fmtNum(total)} in all.`;
  // stacks: every leaf-or-self path with its own count, biggest first
  const stacks: { s: string; n: number }[] = [];
  const path = (id: number): string => { const names: string[] = []; for (let p = id; p >= 0; p = spec.frames[p].parent) names.unshift(spec.frames[p].name); return names.join(";"); };
  for (const f of spec.frames) if (f.self > 0) stacks.push({ s: path(f.id), n: f.self });
  const orderedStacks = numberOrder(textOrder(stacks, (x) => x.s), (x) => -x.n);
  const selfBy = new Map<string, number>();
  for (const f of spec.frames) selfBy.set(f.name, (selfBy.get(f.name) ?? 0) + f.self);
  const fns = numberOrder(textOrder([...selfBy].filter(([, n]) => n > 0), (x) => x[0]), (x) => -x[1]);
  const build = (k: number) => [head, "", "Stacks (the samples in each, biggest first):", "", mdTable(["stack", "count", "share"], orderedStacks.slice(0, k).map((x) => [x.s, fmtNum(x.n), `${pct(x.n, total)}%`])), "", "Functions by their own time:", "", mdTable(["function", "self", "share"], fns.slice(0, k).map(([n, v]) => [n, fmtNum(v), `${pct(v, total)}%`]))].join("\n");
  let k = Math.max(stacks.length, fns.length);
  let text = build(k);
  while (text.length / 4 > 380 && k > 5) { k = Math.max(5, Math.floor(k * 0.7)); text = build(k); }
  return k < Math.max(stacks.length, fns.length) ? `${text}\n\nThe top ${k} of each are listed (${stacks.length} stacks, ${fns.length} functions in all).` : text;
}

export default definePart<FlameSpec>({
  name: "flame", form: "fenced", steps: true, llmKind: "own",
  parse: (input, ctx) => parseFlame(input, ctx.limits, ctx.budget),
  llm: (s) => flameLlm(s),
  check: (s) => [...s.errors.map((e) => ({ line: e.line, message: e.msg })), ...s.warnings.map((e) => ({ line: e.line, level: "warn" as const, message: e.msg }))],
});
