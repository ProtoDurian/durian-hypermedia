// Lane parse: format 12 text -> Model (../ENGINE.md section 2). Every refusal names the line and the fix.
import type { ChartKind, ChartSpec, EngineSrc, Fact, Id, LayoutName, Model, Region, Relation, Shape, Thing, Tone } from "../types";
import { CHART_KINDS, LAYOUTS, SHAPES, TONES } from "../types";
import { layoutForWord } from "../layouts";
import { blockParts } from "../layouts/block-parts"; // eng-blocks2
import { goneMessage } from "../core/gone";
import { STAGE_OPTS, SETUP_HEADS, dec } from "./print12";
import { emptyModel, expandIds, isLayout, nearest, problem, rolesOf, slug, splitBody } from "./common";

/** words of section 2.3: never ids */
export const RESERVED = ["title", "layout", "show", "hide", "at", "in", "is", "text", "tone", "dim", "clear", "light", "say", "note", "foot", "split", "merge", "drop", "focus", "zoom", "lift", "put", "enter", "leave", "layers", "then", "pace", "all", "plain", "off", "from", "into", "camera", "scene", "end"];
const FLAGS = {
  look: ["dashed", "solid", "soft", "plain", "bare", "lit"], place: ["left", "right", "below", "beside", "above"],
  other: ["closed", "open", "hidden-inside", "hidden", "inside", "values", "compact", "stacked", "log", "chart", "initial", "final", "pointer", "group", "buckets", "table", "record", "row"],
};
const KNOWN_FLAGS = [...SHAPES, ...LAYOUTS, ...FLAGS.look, ...FLAGS.place, ...FLAGS.other, ...CHART_KINDS];
/** words some layouts own, read before the registry has them (the old blocks' words), and words the front ends hand on */
const SETUP_WORDS = SETUP_HEADS;
const STEP_WORDS = ["dashed", "cross", "state-tone", "mark", "keep", "peak", "heading", "big", "limit", "move", "bars", "at", "span", "dot", "arrow", "hush", "tag", "fill", "off", "mark", "value", "sum", "pass", "tile", "strip", "total", "aside", "fields", "unwrap", "set", "title", "into", "counts", "swap", "cut", "inside", "key", "=", "grid", "rows", "map", "list", "chips", "calc", "card", "cells", "units"];
const CORE = new Set(["show", "hide", "tone", "dim", "text", "clear", "light", "say", "note", "foot", "split", "merge", "drop", "focus", "zoom", "lift", "put", "enter", "leave", "layers", "then", "pace", "camera"]);
const isOwned = (w: string) => !CORE.has(w) && (STEP_WORDS.includes(w) || !!layoutForWord(w, "step"));
const ARROW = /\s(->|-->|--|<->|-x|~>)\s/;
const STYLE: Record<string, Relation["style"] | "lost" | "stream"> = { "->": "arrow", "-->": "dashed", "--": "line", "<->": "both", "-x": "lost", "~>": "stream" };
const ID = /^[A-Za-z0-9_][\w.-]*$/;
const toneWords = TONES as readonly string[];

/** split a bracket's words, honouring "quoted words" */
export function splitWords(s: string): string[] {
  const out: string[] = []; const re = /(?:[^\s"]+="[^"]*"|"[^"]*"|\S)+/g; let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.push(m[0].replace(/^"(.*)"$/, "$1").replace(/=\"([^"]*)\"$/, "=$1"));
  return out;
}
type Ln = { n: number; ind: number; t: string };
const lines = (text: string, base: number): Ln[] => {
  const out: Ln[] = [];
  text.split("\n").forEach((raw, i) => { const t0 = raw.replace(/\t/g, "  "), t = t0.trim(); if (!t || t.startsWith("// ")) return; out.push({ n: base + i, ind: t0.length - t0.trimStart().length, t }); });
  return out;
};
/** `@step Title: caption`; fmt12: `\:` is a colon of the sentence, not the title's end (migrate writes it for an old step whose words hold
 *  ": ", so the reader sees the whole line, as the old graph engine drew it) */
export const stepTitle = (s: string): [string, string] => {
  let k = -1; for (let i = s.indexOf(": "); i >= 0; i = s.indexOf(": ", i + 1)) if (s[i - 1] !== "\\") { k = i; break; }
  const un = (x: string) => x.replace(/\\:/g, ":").trim();
  return k > 0 && k <= 48 ? [un(s.slice(0, k)), un(s.slice(k + 2))] : [un(s), un(s)];
};
/** fmt12: `role name cN: label` in the setup: a role of this block only (its colour here, and its words in the colour key). It wins over
 *  a page role of the same name inside this block, so samples from several pages can share one page without renaming roles */
export const ROLE_LINE = /^role\s+([A-Za-z][\w-]*)\s+c([0-8])(?:\s*:\s*(.*))?$/;
/** ids split by commas and spaces; an id with a space in it (a chart part: bars.Ben Ortiz) is in "double quotes" */
const list = (s: string): string[] => (s.match(/"[^"]*"|[^\s,"]+/g) ?? []).map((x) => x.replace(/^"(.*)"$/, "$1"));

export function parse12(src: EngineSrc): Model {
  const model = emptyModel(src, "format12");
  rolesOf(model, src.roles);
  const sp = splitBody(src.body, src.line0);
  const ps = new P12(model, src);
  ps.setup(lines(sp.head, sp.base), model, "");
  for (const s of sp.steps) {
    const [title, caption] = stepTitle(s.title);
    if (!s.title) problem(model, s.line, `@step needs a title: "@step Title: the sentence a reader sees"`);
    const facts: Fact[] = [];
    const sl = lines(s.raw, s.line + 1);
    for (let i = 0; i < sl.length; i++) { const h = sl[i], body: Ln[] = []; while (i + 1 < sl.length && sl[i + 1].ind > h.ind) body.push(sl[++i]); ps.fact(h, facts, false, body); }
    model.steps.push({ title, caption, facts, src: { line: s.line } });
  }
  ps.finish();
  blockParts(model); // eng-blocks2: what a head-block layout shows at a step is Model things and facts, made here once
  return model;
}

class P12 {
  layoutSet = false;
  private stack: { ind: number; id: Id }[] = [];
  private region: Id | null = null;
  private lastChart: Thing | null = null;
  constructor(private m: Model, private src: EngineSrc) {}
  private bad(line: number, msg: string) { problem(this.m, line, msg); }
  private known(): string[] { return [...this.m.order, ...this.m.regions.map((r) => r.id)]; }

  // ------------------------------------------------------------ setup
  setup(ls: Ln[], into: Model, _prefix: string) {
    const m = this.m;
    for (let i = 0; i < ls.length; i++) {
      const l = ls[i];
      if (/^scene\s/.test(l.t)) { const inner: Ln[] = []; let j = i + 1; while (j < ls.length && !(ls[j].t === "end" && ls[j].ind <= l.ind)) inner.push(ls[j++]); if (j >= ls.length) this.bad(l.n, `"scene" needs its "end" line`); this.sceneBlock(l, inner); i = j; continue; }
      const body: Ln[] = []; while (i + 1 < ls.length && ls[i + 1].ind > l.ind && this.isBodyOf(l)) body.push(ls[++i]);
      this.setupLine(l, body, ls, i);
    }
    void into;
  }
  /** lines indented under a layout word or a chart belong to it; indent under a thing is a child (read by setupLine) */
  private isBodyOf(l: Ln): boolean { const w = l.t.split(/[\s:]/)[0]; return !!SETUP_WORDS[w] || !!layoutForWord(w, "setup") || w === "x"; }

  private setupLine(l: Ln, body: Ln[], ls: Ln[], i: number) {
    const m = this.m, t = l.t;
    if (t.startsWith("## ")) { this.region = this.addRegion(t.slice(3).trim(), l.n); this.stack = []; this.curLayout = null; return; }
    const rl = ROLE_LINE.exec(t); // fmt12: a role of this block
    if (rl) {
      if (m.order.length || Object.keys(m.relations).length) { this.bad(l.n, `"role ${rl[1]} c${rl[2]}" goes before the first thing: a role line names a colour the lines after it use`); return; }
      m.roles[rl[1]] = { colour: +rl[2], label: rl[3]?.trim() || null }; return;
    }
    // lines indented under a chart are its own: x: categories, axis, line, format ... (read by the chart lane from opts)
    if (this.lastChart && l.ind > this.chartInd && this.stack.length && this.stack[this.stack.length - 1].id === this.lastChart.id) {
      const sm = /^series\s+("(?:[^"\\]|\\.)*")\s+(\S+):\s?(.*)$/.exec(t);
      if (sm) { const c = this.lastChart.chart!; const s = { name: JSON.parse(sm[1]) as string, role: sm[2] === "-" ? null : sm[2], values: sm[3].trim() ? sm[3].trim().split(/\s+/).map(Number) : [] }; c.series[this.seriesN++] = s; return; }
      const om = /^([A-Za-z][\w-]*):?(?:\s+(.*))?$/.exec(t);
      if (om && !/^\S+ = /.test(t)) { const c = this.lastChart.chart!; if (om[1] === "x") c.x = (om[2] ?? "").split(",").map((x) => x.trim()).filter(Boolean); else c.opts[om[1]] = (c.opts[om[1]] ? c.opts[om[1]] + "\n" : "") + (om[2] ?? ""); return; }
    }
    const kw = /^([A-Za-z][\w-]*):(?: (.*))?$/.exec(t) ?? /^([A-Za-z][\w-]*):$/.exec(t);
    if (kw) {
      const w = kw[1], arg = kw[2] ?? "";
      if (w === "title") { const [a, ...b] = arg.split(" | "); m.title = a.trim() || null; m.note = b.join(" | ").trim() || null; return; }
      if (w === "layout") {
        if (!isLayout(arg.trim())) { this.bad(l.n, `"${arg.trim()}" is not a layout: layout: ${LAYOUTS.join(" | ")}`); return; }
        m.layout = arg.trim() as LayoutName; this.layoutSet = true; return;
      }
      if (w === "x") {
        const c = this.lastChart; if (!c) { this.bad(l.n, `"x:" names a chart's categories and goes under a chart line: out spent [chart bar]: title, then "x: a, b, c"`); return; }
        c.chart!.x = arg.split(",").map((x) => x.trim()).filter(Boolean); return;
      }
      if (STAGE_OPTS.includes(w)) { m.fence[w] = arg; return; }
      this.layoutWord(w, arg, body, l, "setup"); return;
    }
    const first = t.split(/[\s:]/)[0];
    if ((SETUP_WORDS[first] || layoutForWord(first, "setup")) && !(first in this.m.roles) && first !== "plain") { this.layoutWord(first, t.slice(first.length).replace(/^:/, "").trim(), body, l, "setup"); return; }
    if (ARROW.test(t)) { this.relation(l, true, []); return; }
    const vals = /^(\S+) = (.*)$/.exec(t);
    if (vals && (this.m.things[vals[1].split(".")[0]])) { this.setValues(vals, l, this.m.setup, true); return; }
    if (this.stateFact(l, this.m.setup, true)) return;
    if (isOwned(first) && !(first in this.m.roles) && !SETUP_WORDS[first]) { this.fact(l, this.m.setup, true, body); return; }
    if (/^(show|hide|tone|dim|text|light|say|note|foot|focus|zoom|lift|put|layers|camera|clear)\b/.test(t)) { this.fact(l, this.m.setup, true, body); return; }
    // a line a layout head claimed (a time block's ticks, window ...), not a thing of a role of this page
    if (this.curLayout && !(first in this.m.roles) && first !== "plain" && !/^c[1-8]$/.test(first)) {
      const w = t.split(/[\s:]/)[0]; (this.m.layoutWords[this.curLayout] ??= []).push({ word: w, arg: t.slice(w.length).replace(/^:/, "").trim(), body: body.map((b) => " ".repeat(Math.max(0, b.ind - l.ind - 2)) + b.t), src: { line: l.n } }); return;
    }
    this.curLayout = null;
    this.thingLine(l);
  }

  private chartInd = 0;
  private seriesN = 0;
  private curLayout: string | null = null;
  private sceneBlock(l: Ln, inner: Ln[]) {
    // `scene id "label" key=value` ... `end`: a scene inside the scene, its own stage (setup lines only)
    const m = /^scene\s+(\S+)(?:\s+"([^"]*)")?((?:\s+[\w-]+=\S+)*)$/.exec(l.t);
    if (!m) { this.bad(l.n, `a scene inside the scene is: scene id "label" (then its setup lines) end`); return; }
    const fence = { ...this.src.fence }; delete fence["graph-src"];
    for (const kv of m[3].trim().split(/\s+/).filter(Boolean)) { const e = kv.indexOf("="); fence[kv.slice(0, e)] = dec(kv.slice(e + 1)); }
    const sub = emptyModel({ ...this.src, fence }, "format12");
    sub.roles = this.m.roles; sub.title = m[2] || null;
    const p = new P12(sub, { ...this.src, fence });
    p.setup(inner, sub, "");
    p.finish();
    this.m.problems.push(...sub.problems); sub.problems = [];
    this.m.scenes[m[1]] = sub;
  }

  private addRegion(head: string, line: number): Id {
    const m = this.m;
    const bracket = /^(.*?)\s*\[([^\]]*)\]\s*$/.exec(head);
    const title = (bracket ? bracket[1] : head).trim(), flags = bracket ? splitWords(bracket[2]) : [];
    const idFlag = flags.find((f) => f.startsWith("id="));
    const id = idFlag ? idFlag.slice(3) : slug(title, `row${m.regions.length + 1}`);
    const known = m.regions.find((r) => r.id === id && r.title === title);
    if (known) return known.id;
    let uid = id; while (m.regions.some((r) => r.id === uid)) uid += "-" + m.regions.length;
    const r: Region = { id: uid, title: title === "_" ? "" : title, flags: flags.filter((f) => !f.startsWith("id=")), src: { line } };
    m.regions.push(r);
    return uid;
  }

  private allKnown(ids: string[]): boolean {
    const m = this.m;
    return ids.length > 0 && ids.every((x) => x === "all" || x in m.things || m.regions.some((r) => r.id === x) || x in m.relations || Object.values(m.scenes).some((s) => x in s.things) || (x.includes(".") && x.split(".")[0] in m.things));
  }
  private layoutWord(word: string, arg: string, body: Ln[], l: Ln, at: "setup" | "step", facts?: Fact[], anyWord = false) {
    const owner = layoutForWord(word, at)?.name ?? (at === "setup" ? SETUP_WORDS[word] : undefined);
    const bodyText = body.map((b) => " ".repeat(Math.max(0, b.ind - l.ind - 2)) + b.t);
    if (at === "step") {
      if (owner || anyWord || STEP_WORDS.includes(word)) { facts!.push({ k: "layout", word, arg, body: bodyText, src: { line: l.n } }); return; }
      const gone = goneMessage(word); if (gone) { this.bad(l.n, gone); return; }
      const near = nearest(word, [...STEP_WORDS, ...Object.keys(SETUP_WORDS)]);
      this.bad(l.n, `"${word}" is not a word of a step${near ? `; did you mean "${near}"?` : ""}. A step says what is true: show, hide, at, in, is, text, tone, dim, light, say, "a -> b: words", "id = values"`);
      return;
    }
    if (owner || SETUP_WORDS[word]) {
      const key = owner ?? SETUP_WORDS[word]; this.curLayout = key;
      const list = (this.m.layoutWords[key] ??= []) as { word: string; arg: string; body: string[]; src: { line: number } }[];
      const head = { word, arg, body: [] as string[], src: { line: l.n } }; list.push(head);
      let cur = head, base = l.ind;
      for (const b of body) {
        if (b.t.startsWith("+ ")) { const r = b.t.slice(2), w = r.split(/[\s:]/)[0]; cur = { word: w, arg: r.slice(w.length).replace(/^:/, "").trim(), body: [], src: { line: b.n } }; list.push(cur); base = b.ind; }
        else cur.body.push(" ".repeat(Math.max(0, b.ind - base - 2)) + b.t);
      }
      return;
    }
    const near = nearest(word, [...Object.keys(SETUP_WORDS), "title", "layout", "x"]);
    this.bad(l.n, `"${word}:" is not a setup word${near ? `; did you mean "${near}:"?` : ""}. Setup lines: title:, layout:, ## Region, "role id [flags]: title", "a -> b: label", "id = values", "ids is words", and a layout's own words`);
  }

  // ------------------------------------------------------------ things
  private thingLine(l: Ln) {
    const m = this.m, t = l.t;
    if (/^(->|-->|--|<->|-x|~>)\s/.test(t) || /^\S+\s+(->|-->|--|<->|-x|~>)$/.test(t)) { this.bad(l.n, `a relation names both ends: "a -> b: words" (also -->, --, <->, -x, ~>); this line is "${t}"`); return; }
    const mt = /^(\S+)\s+([^\s\[:]+)(?:\s*\[([^\]]*)\])?((?:\s+[\w-]+=(?:"[^"]*"|\S+))*)\s*(?::\s?(.*))?$/.exec(t);
    if (!mt) { this.bad(l.n, `this line does not read: "${t}". A thing is "role id [flags]: title | line"; a fact is "ids is words", "ids at place", "ids in container", "id = values", "a -> b: label"; a region is "## Title"`); return; }
    const [, role, idText, flagText = "", kvText = "", rest = ""] = mt;
    if (role !== "plain" && !(role in m.roles) && !/^c[1-8]$/.test(role)) {
      const declared = Object.keys(m.roles);
      const near = nearest(role, declared);
      this.bad(l.n, `"${role}" is not a role of this page${near ? `; did you mean "${near}"?` : ""}: the page declares ${declared.length ? declared.join(", ") : "none"}. Add it under roles: in the front matter, or write "plain"`);
      return;
    }
    const ids = expandIds(idText);
    if (!ids.length || ids.some((id) => !ID.test(id))) { this.bad(l.n, `"${idText}" is not an id: letters, digits, - _ . only`); return; }
    for (const id of ids) {
      if (RESERVED.includes(id)) this.m.problems.push({ line: l.n, msg: `"${id}" is a reserved word of the format; it works as an id here, but a line that starts with it may be read as its own word: give the thing another id when you can`, warn: true });
      if (m.things[id]) { this.bad(l.n, `"${id}" is declared twice; the first is on line ${m.things[id].src.line}`); return; }
    }
    const flags = splitWords(flagText);
    const unknown = flags.filter((f) => !KNOWN_FLAGS.includes(f) && !f.startsWith("id="));
    if (unknown.length) { const near = nearest(unknown[0], KNOWN_FLAGS); this.bad(l.n, `unknown flag "${unknown[0]}"${near ? `; did you mean "${near}"?` : ""}. Flags: shapes (${SHAPES.join(" ")}), layouts (${LAYOUTS.join(" ")}), chart <kind>, ${[...FLAGS.look, ...FLAGS.place].join(" ")}, closed, hidden-inside, values, compact`); return; }
    const keys: Record<string, string> = {};
    let cellParent: string | null = null;
    for (const kv of splitWords(kvText)) { const e = kv.indexOf("="); keys[kv.slice(0, e)] = dec(kv.slice(e + 1)); }
    if (keys.parent) { cellParent = keys.parent; delete keys.parent; }
    // the parent: indentation under a thing; the stack is the things above at a lower indent
    while (this.stack.length && this.stack[this.stack.length - 1].ind >= l.ind) this.stack.pop();
    const parent = this.stack.length ? this.stack[this.stack.length - 1].id : cellParent;
    const shape = (flags.find((f) => (SHAPES as readonly string[]).includes(f)) as Shape | undefined) ?? "box";
    const layout = (flags.find((f) => (LAYOUTS as readonly string[]).includes(f)) as LayoutName | undefined) ?? null;
    const ci = flags.indexOf("chart");
    const titles = rest ? rest.split(" | ").map((x) => x.trim()) : [];
    const data = (layout && ["array", "list", "stack", "queue", "map"].includes(layout)) || flags.includes("row") || flags.includes("table");
    const perId = ids.length > 1 && !data && ci < 0 ? rest.split(";").map((x) => x.trim()) : null;
    if (perId && perId.length !== 1 && perId.length !== ids.length) { this.bad(l.n, `${ids.length} things (${ids[0]}..${ids[ids.length - 1]}) but ${perId.length} titles: give one title per thing, split by ";", or one for all`); return; }
    for (const [k, id] of ids.entries()) {
      const ttl = perId ? (perId.length === 1 ? perId[0] : perId[k]) : rest;
      const parts = perId ? ttl.split(" | ").map((x) => x.trim()) : titles;
      let values: string[] | null = null, title = parts[0] ?? "", lns = parts.slice(1), chart: ChartSpec | null = null;
      if (data) { values = !rest ? null : layout === "map" ? rest.split(/,\s+/).map((x) => x.trim()).filter(Boolean) : (rest.includes(",") ? rest.split(",") : rest.split(/\s+/)).map((x) => x.trim().replace(/^"|"$/g, "")).filter(Boolean); title = keys.title ?? ""; lns = keys.lines ? keys.lines.split(" | ") : []; delete keys.title; delete keys.lines; }
      if (ci >= 0) {
        const kind = flags[ci + 1] as ChartKind | undefined;
        if (!kind || !(CHART_KINDS as readonly string[]).includes(kind)) { this.bad(l.n, `a chart names its kind: [chart ${CHART_KINDS.slice(0, 6).join("|")}|...], got "${kind ?? ""}"`); return; }
        chart = { kind, title: parts[0] ?? "", unit: parts[1] ?? null, x: [], series: [{ name: id, role: role === "plain" ? null : role, values: [] }], flags: flags.slice(ci + 2).filter((f) => !(CHART_KINDS as readonly string[]).includes(f)), opts: {} };
        title = parts[0] ?? ""; lns = [];
      }
      const th: Thing = {
        id, role: role === "plain" ? null : role, title, lines: lns, flags: flags.filter((f) => !f.startsWith("id=")), shape, layout, container: !!layout || flags.some((f) => ["group", "buckets", "table", "record", "row"].includes(f)),
        parent, region: this.region, order: m.order.length, values, keys, chart, src: { line: l.n },
      };
      if (parent) { const p = m.things[parent]; if (p) p.container = true; }
      if (layout) th.container = true;
      m.things[id] = th; m.order.push(id);
      if (chart) { this.lastChart = th; this.chartInd = l.ind; this.seriesN = 0; }
      if (k === ids.length - 1) this.stack.push({ ind: l.ind, id });
    }
  }

  // ------------------------------------------------------------ relations
  private relation(l: Ln, setup: boolean, facts: Fact[]) {
    const k = ARROW.exec(l.t)!; const arrow = k[1];
    const left = l.t.slice(0, k.index), right0 = l.t.slice(k.index + k[0].length);
    const c = right0.search(/:(?:\s|$)/);
    let head = (c < 0 ? right0 : right0.slice(0, c)).trim(); const label = c < 0 ? null : right0.slice(c + 1).trim() || null;
    let role: string | null = null; const rm = /^(.*?)\s*\((\w[\w-]*)\)$/.exec(head); if (rm) { head = rm[1]; role = rm[2]; }
    const from = list(left), to = list(head);
    if (!from.length || !to.length || [...from, ...to].some((x) => !ID.test(x))) { this.bad(l.n, `a relation is "a -> b: words" (also -->, --, <->, -x, ~>); a, b -> c, d joins every pair`); return; }
    for (const a of from) for (const b of to) {
      // eng-scenes: a line first drawn in a step whose two ends are things of one scene inside the scene is that scene's line
      const m = setup || this.m.relations[`${a}->${b}`] ? this.m : Object.values(this.m.scenes).find((s) => s.things[a] && s.things[b]) ?? this.m;
      const base = `${a}->${b}`; let id = base;
      if (!m.relations[id]) { const style = STYLE[arrow]; m.relations[id] = { id, from: a, to: b, style: style === "lost" || style === "stream" ? "arrow" : style, label: setup ? label : null, role, setup, src: { line: l.n } }; }
      else if (setup) { let n = 2; while (m.relations[`${base}#${n}`]) n++; id = `${base}#${n}`; m.relations[id] = { ...m.relations[base], id, label, role, setup, src: { line: l.n } }; }
      if (!setup) facts.push({ k: "rel", rel: id, words: label, style: STYLE[arrow], role, src: { line: l.n } });
    }
  }

  // ------------------------------------------------------------ facts (setup state and steps)
  private setValues(m: RegExpExecArray, l: Ln, facts: Fact[], setup: boolean) {
    const [, idp, rest] = m;
    const [base, part] = [idp.split(".")[0], idp.includes(".") ? idp.slice(idp.indexOf(".") + 1) : ""];
    const th = this.m.things[base];
    if (!th) { const near = nearest(base, this.m.order); this.bad(l.n, `"${base}" is not a thing${near ? `; did you mean "${near}"?` : ""}: "id = values" sets the numbers of a chart or the cells of a data structure`); return; }
    const fm = /^(.*?)(?:\s+from\s+(\S.*))?$/.exec(rest)!;
    const raw = fm[1].trim(), vals = raw === "-" ? [] : (raw.includes(",") && !/^\S+( \S+)+$/.test(raw.replace(/,\s*/g, ",")) ? raw.split(",") : raw.includes(", ") ? raw.split(/,\s*/) : raw.split(/\s+/)).map((x) => x.trim().replace(/^"|"$/g, "")).filter(Boolean);
    const series = /^\d+$/.test(part) ? +part - 1 : undefined;
    if (part && series === undefined) { this.bad(l.n, `"${idp}": after the dot a chart's series is a number (returns.2 = ...); to name categories write them in the chart's x:`); return; }
    if (setup && th.chart) {
      const s = th.chart.series[series ?? 0] ?? (th.chart.series[series ?? 0] = { name: `${base}.${(series ?? 0) + 1}`, role: null, values: [] });
      s.values = vals.map(Number); return;
    }
    if (setup && th.values !== null || setup && th.layout) { th.values = vals; return; }
    facts.push({ k: "values", id: base, values: vals, from: fm[2] ? list(fm[2]) : [], ...(series !== undefined ? { series } : {}), src: { line: l.n } });
  }

  /** `ids is words`, `ids at place`, `ids in container [left|right] [after id]` */
  private stateFact(l: Ln, facts: Fact[], setup: boolean): boolean {
    const m = /^((?:[^\s,]+,\s*)*[^\s,]+)\s+(is|at|in)\s+(.+)$/.exec(l.t) ?? (/^((?:[^\s,]+,\s*)*[^\s,]+)\s+is\s*$/.exec(l.t) && null);
    if (!m) return false;
    const ids = this.expand(list(m[1]));
    const verb = m[2], rest = m[3].trim();
    if (verb === "is") facts.push({ k: "is", ids, words: rest === "-" ? null : rest, src: { line: l.n } });
    else if (verb === "at") facts.push({ k: "at", ids, place: rest, src: { line: l.n } });
    else {
      const im = /^(\S+)(?:\s+(left|right))?(?:\s+after\s+(\S+))?$/.exec(rest);
      if (!im) { this.bad(l.n, `"in" is "ids in container [left|right] [after id]"`); return true; }
      facts.push({ k: "in", ids, place: im[1], ...(im[2] ? { side: im[2] as "left" } : {}), ...(im[3] ? { after: im[3] } : {}), src: { line: l.n } });
    }
    void setup; return true;
  }
  private expand(ids: string[]): Id[] {
    const out: Id[] = [];
    for (const id of ids) {
      const dd = /^(.+)\.(.*\.\.[^.]*)$/.exec(id);
      if (dd && this.m.things[dd[1]]?.chart) { const labs = this.m.things[dd[1]].chart!.x, [a, b] = dd[2].split(".."); const i = labs.indexOf(a), j = labs.indexOf(b); if (i >= 0 && j >= i) { for (const x of labs.slice(i, j + 1)) out.push(`${dd[1]}.${x}`); continue; } }
      if (id.includes("*")) { const re = new RegExp("^" + id.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$"); out.push(...this.m.order.filter((x) => re.test(x))); continue; }
      if (/\s/.test(id)) out.push(id); else out.push(...expandIds(id));
    }
    return out;
  }

  fact(l: Ln, facts: Fact[], setup: boolean, body: Ln[] = []) {
    const t = l.t, S = { line: l.n }, bad = (msg: string) => this.bad(l.n, msg);
    let m: RegExpExecArray | null;
    { const w0 = t.split(/[\s:]/)[0]; if (isOwned(w0) && !/^\S+\s+(->|-->|--|<->|-x|~>)\s/.test(t) && !/^\S+ = /.test(t)) { this.layoutWord(w0, t.slice(w0.length).replace(/^:/, "").trim(), body, l, "step", facts); return; } }
    if (ARROW.test(t)) { this.relation(l, false, facts); return; }
    if ((m = /^(\S+) = (.*)$/.exec(t))) { this.setValues(m, l, facts, false); return; }
    if (this.stateFact(l, facts, setup)) return;
    const w = t.split(/[\s:]/)[0], rest = t.slice(w.length).replace(/^:/, "").trim();
    if (["show", "hide", "light", "dim", "tone"].includes(w)) {
      const head = w === "light" || w === "tone" || w === "dim" || w === "show" || w === "hide" ? rest.replace(/:.*$/, "").replace(w === "tone" ? /\s+\S+$/ : /\s+(off)$/, "") : rest;
      if (!this.allKnown(this.expand(list(head)))) { this.layoutWord("keep".length ? w : w, rest, body, l, "step", facts, true); return; }
    }
    switch (w) {
      case "show": case "hide": if (!rest) return bad(`"${w}" names things: ${w} a, b (or p1..p4)`), void 0; facts.push({ k: w, ids: this.expand(list(rest)), src: S }); return;
      case "tone": {
        const tm = /^(.+?)\s+(\w+)$/.exec(rest);
        if (!tm || !toneWords.includes(tm[2])) return bad(`tone is "tone ids ${TONES.join("|")}": got "${rest}"`), void 0;
        facts.push({ k: "tone", ids: this.expand(list(tm[1])), tone: tm[2] as Tone, src: S }); return;
      }
      case "dim": { const off = /\s+off$/.test(rest); facts.push({ k: "dim", ids: this.expand(list(rest.replace(/\s+off$/, ""))), on: !off, src: S }); return; }
      case "text": { const tm = /^(\S+?):\s?(.*)$/.exec(rest); if (!tm) return bad(`text sets a card's lines: text id: line | line`), void 0; facts.push({ k: "text", id: tm[1], lines: tm[2].split(" | ").map((x) => x.trim()), src: S }); return; }
      case "clear": facts.push({ k: "clear", src: S }); return;
      case "light": { const lm = /^(.*?)(?::\s?(.*))?$/.exec(rest)!; facts.push({ k: "light", ids: this.expand(list(lm[1])), ...(lm[2] ? { note: lm[2] } : {}), src: S }); return; }
      case "say": {
        const sm = /^(\S+?)(?:\s+([^\s(:]+))?(?:\s+\(([^)]*)\))?:\s?(.*)$/.exec(rest);
        if (!sm || !sm[4]) return bad(`say is "say id [above|below|left|right] [(role)]: words"`), void 0;
        facts.push({ k: "say", id: sm[1], words: sm[4], ...(sm[2] ? { side: sm[2] as "above" } : {}), ...(sm[3] ? { role: sm[3] } : {}), src: S }); return;
      }
      case "note": facts.push({ k: "note", words: rest, src: S }); return;
      case "foot": { const fm = /^(?:\((\w+)\)\s*)?:?\s*(.*)$/.exec(t.slice(4).replace(/^\s*/, "")); const fm2 = /^\(([^)]*)\):\s?(.*)$/.exec(t.slice(4).trim()); if (fm2) facts.push({ k: "foot", words: fm2[2], tone: fm2[1], src: S }); else facts.push({ k: "foot", words: rest, tone: null, src: S }); void fm; return; }
      case "split": {
        const sm = /^(\S+) into (.+)$/.exec(rest); if (!sm) return bad(`split is "split id into a b" (or a="label" b="label")`), void 0;
        const ps = splitWords(sm[2]).map((x) => { const e = x.indexOf("="); return e < 0 ? [x, ""] : [x.slice(0, e), x.slice(e + 1)]; });
        facts.push({ k: "split", id: sm[1], into: ps.map((x) => x[0]), labels: ps.map((x) => x[1]), src: S }); return;
      }
      case "merge": { const mm = /^(.+) into (\S+)$/.exec(rest); if (!mm) return bad(`merge is "merge a b into c"`), void 0; facts.push({ k: "merge", ids: list(mm[1]), into: mm[2], src: S }); return; }
      case "drop": { const dm = /^(.+?)(?:\s+at\s+(\S+))?$/.exec(rest)!; facts.push({ k: "drop", ids: list(dm[1]), ...(dm[2] ? { at: dm[2] } : {}), src: S }); return; }
      case "focus": if (!rest) return bad(`focus names a region or "all": focus ap`), void 0; facts.push({ k: "focus", target: rest, src: S }); return;
      case "zoom": {
        if (/^out(\s+all)?$/.test(rest)) { facts.push({ k: "zoom", into: null, ...(/all$/.test(rest) ? { all: true } : {}), src: S }); return; }
        const zm = /^into\s+(.+)$/.exec(rest); if (!zm) return bad(`zoom is "zoom into ids" or "zoom out [all]"`), void 0;
        facts.push({ k: "zoom", into: this.expand(list(zm[1])), src: S }); return;
      }
      case "lift": facts.push({ k: "lift", ids: this.expand(list(rest)), src: S }); return;
      case "put": { const pm = /^back(?:\s+(.*))?$/.exec(rest); if (!pm) return bad(`put is "put back [ids]"`), void 0; facts.push({ k: "putback", ids: pm[1] ? this.expand(list(pm[1])) : [], src: S }); return; }
      case "enter": { const em = /^(\S+) from (\S+)$/.exec(rest); if (!em) return bad(`enter is "enter scene from id"`), void 0; facts.push({ k: "enter", scene: em[1], from: em[2], src: S }); return; }
      case "leave": facts.push({ k: "leave", ...(rest ? { scene: rest } : {}), src: S }); return;
      case "layers": if (rest !== "apart" && rest !== "together") return bad(`layers is "layers apart" or "layers together"`), void 0; facts.push({ k: "layers", apart: rest === "apart", src: S }); return;
      case "then": facts.push({ k: "then", src: S }); return;
      case "pace": if (!["slow", "normal", "fast"].includes(rest)) return bad(`pace is slow, normal or fast`), void 0; facts.push({ k: "pace", pace: rest as "slow", src: S }); return;
      case "camera": {
        const ws = splitWords(rest); const f: Extract<Fact, { k: "camera" }> = { k: "camera", ids: "all", src: S }; const ids: string[] = [];
        for (const x of ws) { if (x === "close") f.close = true; else if (x === "far") f.far = true; else if (x.startsWith("turn=")) f.turn = x.slice(5); else if (x.startsWith("tilt=")) f.tilt = x.slice(5); else ids.push(x); }
        f.ids = ids.length === 1 && ids[0] === "all" || !ids.length ? "all" : this.expand(ids); facts.push(f); return;
      }
    }
    if (w === "keep") { facts.push({ k: "layout", word: "keep", arg: t.slice(5).trim(), body: body.map((b) => " ".repeat(Math.max(0, b.ind - l.ind - 2)) + b.t), src: S }); return; }
    if (w === "=") { facts.push({ k: "layout", word: "=", arg: rest, body: [], src: S }); return; }
    // a layout-owned word, with its indented body already attached by the caller
    this.layoutWord(w, rest, body, l, "step", facts);
  }

  finish() {
    const m = this.m;
    if (!this.layoutSet) m.layout = m.regions.length ? "lanes" : "graph";
    for (const r of m.regions) r.layout = m.layout;
    void this.src;
  }
}
