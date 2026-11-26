// Lane parse: a format 10 graph-engine block -> Model (DESIGN 2.7). The old parser (src/core/scene.ts parseScene) reads
// the block; its operations are replayed into facts: add -> a declared thing + show, remove -> hide, move -> in/at,
// set -> tone/dim/text, push/pop/swap -> values, send -> rel events, camera/focus/zoom/lift/scene -> their facts,
// layers -> regions with `layout: layers`.
import type { EngineSrc, Fact, Id, LayoutName, Model, Relation, Region, Step, Thing, Tone } from "../types";
import { parseScene, type Decl, type Op, type Scene } from "../../core/scene";
import { emptyModel, infoOf, isLayout, problem, rolesOf, splitBody, toneOf } from "./common";

const DATA = ["array", "list", "stack", "queue", "map"];
const CONTAINER_KINDS = ["group", "array", "list", "stack", "queue", "tree", "graph", "grid", "buckets", "table", "record", "map", "row"];
const STYLE: Record<string, Relation["style"]> = { "->": "arrow", "-->": "dashed", "--": "line", "<->": "both" };
const GRAPH_LAYOUT: Record<string, LayoutName> = { auto: "graph", graph: "graph", row: "graph", column: "graph", grid: "graph", tree: "tree", free: "free" };

export function lowerGraph(src: EngineSrc): Model {
  const sp = splitBody(src.body, src.line0);
  const info = infoOf(src);
  const model = emptyModel(src, "graph10");
  model.fence["graph-src"] = JSON.stringify({ head: sp.head, steps: sp.steps, base: sp.base, info });
  rolesOf(model, src.roles);
  const { scene, errors } = parseScene(sp.head, sp.steps, sp.base, info);
  for (const e of errors) problem(model, e.line, e.msg);
  model.layout = GRAPH_LAYOUT[scene.attrs.layout] ?? "graph";
  if (["row", "column", "grid"].includes(scene.attrs.layout)) model.fence["legacy-layout"] = scene.attrs.layout; // the graph engine's own layout, not the stage's grid
  if (scene.attrs.only3d) model.view = "3d-only"; else if (scene.attrs.view === "3d") model.view = "3d";
  lowerScene(model, scene, src);
  return model;
}

type Lowerer = ReturnType<typeof newLowerer>;

function lowerScene(model: Model, scene: Scene, src: EngineSrc) {
  const lw = newLowerer(model);
  for (const op of scene.setup) lw.op(op, model.setup, true);
  // eng-scenes: a scene inside the scene: its own model, its setup first (enter and leave are facts of the parent)
  const subLw: Record<Id, Lowerer> = {};
  for (const sub of scene.subs ?? []) {
    const m = emptyModel(src, "graph10");
    m.fence = { ...model.fence, ...sub.attrs }; delete m.fence["graph-src"];
    m.roles = model.roles; m.layout = GRAPH_LAYOUT[sub.attrs.layout ?? "auto"] ?? "graph"; m.title = sub.label || null;
    const l2 = newLowerer(m);
    for (const op of sub.setup) l2.op(op, m.setup, true);
    subLw[sub.id] = l2;
    model.scenes[sub.id] = m;
  }
  // eng-scenes: a step's ops are lowered by the lowerer of the scene the story is in, so what a step inside a scene
  // makes (split pieces, a merge, a new line) is that scene's thing; the facts stay the story's (model.steps)
  const inScene: Id[] = [];
  // the graph engine: a send leaves no line behind (only setup and drawn connectors stay), so a line that only a
  // send drew is hidden again at the next step
  const lasting = new Set<Id>([model, ...Object.values(model.scenes)].flatMap((m) => Object.values(m.relations).filter((r) => r.setup).map((r) => r.id)));
  let sentOnly: Id[] = [], sentIn: Id | null = null; // the lines and the scene (null: the overview) they were sent in
  // the graph engine: `highlight x tone=warn` colours x for its step only; `set x tone=...` lasts
  const toneKept = new Map<Id, Tone>(); let litTone: Id[] = [];
  for (const s of scene.steps) {
    const facts: Fact[] = [];
    // (a step that enters or leaves a scene does only that, so the hide waits for the next plain step)
    // (a step that enters or leaves a scene does only that; a line sent inside a scene the story left stays in that
    //  scene's frozen state, as the old engine kept the scene as it was left)
    const moves = s.ops.some((op) => op.op === "enter" || op.op === "leave");
    const here = inScene[inScene.length - 1] ?? null;
    if (sentOnly.length && sentIn !== here) sentOnly = [];
    if (sentOnly.length && !moves) { facts.push({ k: "hide", ids: sentOnly, src: { line: s.line } }); sentOnly = []; }
    if (litTone.length && !moves) {
      const back = new Map<Tone, Id[]>(); for (const id of litTone) { const t = toneKept.get(id) ?? "off"; back.set(t, [...(back.get(t) ?? []), id]); }
      for (const [tone, ids] of back) facts.push({ k: "tone", ids, tone, src: { line: s.line } });
      litTone = [];
    }
    if (s.pace && s.pace !== "normal") facts.push({ k: "pace", pace: s.pace as "slow" | "fast", src: { line: s.line } });
    s.ops.forEach((op, i) => {
      if (i > 0 && (s.beat?.[i] ?? 0) > (s.beat?.[i - 1] ?? 0)) facts.push({ k: "then", src: { line: op.line } });
      const top = inScene[inScene.length - 1];
      (top !== undefined && subLw[top] ? subLw[top] : lw).op(op, facts, false);
      if (op.op === "enter" && subLw[op.id] && !inScene.includes(op.id)) inScene.push(op.id);
      else if (op.op === "leave" && inScene.length) inScene.pop();
    });
    for (const op of s.ops) for (const f of facts) if (f.k === "tone" && f.src.line === op.line) {
      if (op.op === "highlight") litTone.push(...f.ids.filter((id) => !litTone.includes(id)));
      else for (const id of f.ids) { toneKept.set(id, f.tone); litTone = litTone.filter((x) => x !== id); }
    }
    const sends = new Set<Id>(), drawnHere = new Set<Id>();
    s.ops.forEach((op) => { if (op.op !== "send") for (const f of facts) if (f.k === "rel" && f.src.line === op.line) drawnHere.add(f.rel); });
    for (const f of facts) if (f.k === "rel" && !drawnHere.has(f.rel)) sends.add(f.rel);
    for (const id of drawnHere) lasting.add(id);
    const after = inScene[inScene.length - 1] ?? null;
    if (after !== sentIn) { sentOnly = []; sentIn = after; }
    sentOnly = [...new Set([...sentOnly, ...sends])].filter((id) => !lasting.has(id));
    const step: Step = { title: s.caption, caption: s.caption, facts, src: { line: s.line } };
    model.steps.push(step);
  }
  if (model.regions.length && model.layout === "graph") model.layout = "layers";
  for (const m of Object.values(model.scenes)) { for (const p of m.problems) model.problems.push(p); m.problems = []; }
}

function newLowerer(model: Model) {
  const kinds: Record<Id, string> = {};
  const vals: Record<Id, string[]> = {};
  const kids: Record<Id, Id[]> = {};
  const pieces: Record<Id, Id[]> = {};
  const relCount: Record<string, number> = {};
  let familyN = 0;
  const L = (line: number) => ({ line });

  const relId = (from: Id, to: Id, also: boolean, newOne: boolean): Id => {
    const base = `${from}->${to}`;
    const n = relCount[base] ?? 0;
    if (!n) { relCount[base] = 1; return base; }
    if (!also && !newOne) return base;
    relCount[base] = n + 1;
    return `${base}#${n + 1}`;
  };
  const ensureRel = (from: Id, to: Id, style: Relation["style"], label: string | null, role: string | null, line: number, setup: boolean, also = false): Id => {
    const base = `${from}->${to}`;
    if (!setup && !also && model.relations[base]) return base;
    const id = relId(from, to, also, setup && !!model.relations[base]);
    if (!model.relations[id]) model.relations[id] = { id, from, to, style, label, role, setup, src: L(line) };
    return id;
  };
  const cellOf = (id: Id): { arr: Id; i: number } | null => {
    const m = /^(.*)\.(\d+)$/.exec(id);
    return m && vals[m[1]] ? { arr: m[1], i: +m[2] } : null;
  };
  const setVals = (id: Id, v: string[], facts: Fact[], line: number, from: Id[] = []) => { vals[id] = v; facts.push({ k: "values", id, values: v, from, src: L(line) }); };

  function declareThing(d: Decl, line: number, setup: boolean, facts: Fact[]) {
    const known = model.things[d.id];
    if (known) { if (!setup) facts.push({ k: "show", ids: [d.id], src: L(line) }, ...place(d, line)); return; }
    const kind = d.kind;
    kinds[d.id] = kind;
    const shape = kind === "token" ? "token" : kind === "pointer" ? "ref" : kind === "initial" || kind === "final" ? "dot" : (["box", "circle", "pill", "cylinder", "cloud", "person", "diamond", "text", "dot"] as const).find((s) => s === kind) ?? "box";
    const own = kind === "grid" ? "grid" : d.kv.layout; // the graph engine's row|column|grid is the graph family (legacy-layout), never the stage's grid layout
    const layout: LayoutName | null = ["array", "list", "stack", "queue", "map", "tree", "graph"].includes(kind) ? (kind as LayoutName) : kind === "buckets" ? "map" : kind === "grid" ? "graph" : own && ["tree", "free", "graph"].includes(own) ? (own as LayoutName) : own && ["row", "column", "grid"].includes(own) ? "graph" : null;
    const keys: Record<string, string> = {};
    for (const [k, v] of Object.entries(d.kv)) if (!["layer", "is", "tone", "dim", "layout"].includes(k)) keys[k] = v; // note="..." stays in keys.note: it is what a click shows, not a body line
    if (own && ["row", "column", "grid"].includes(own)) keys["legacy-layout"] = own;
    else if (d.kv.layout && !isLayout(d.kv.layout)) keys.layout = d.kv.layout;
    if (d.under) keys.under = d.under;
    if (d.side) keys.side = d.side;
    if (d.place.after) keys.after = d.place.after;
    if (d.place.before) keys.before = d.place.before;
    if (d.place.first) keys.first = "yes";
    if (d.fields) keys.fields = JSON.stringify(d.fields);
    if (kind === "buckets") { keys.buckets = d.kv.count ?? keys.buckets ?? ""; delete keys.count; }
    const flags = [...(layout && layout !== kind ? [layout] : []), ...(shape !== kind && !(layout === kind) ? [shape] : []), kind, ...(d.kv.closed ? [d.kv.closed === "no" ? "open" : d.kv.closed === "hidden" ? "hidden-inside" : "closed"] : [])];
    const t: Thing = {
      id: d.id, role: d.kv.is ?? null, title: d.label ?? "", lines: [], flags, shape, layout,
      container: CONTAINER_KINDS.includes(kind), parent: d.parent, region: d.kv.layer ?? (d.parent ? model.things[d.parent]?.region ?? null : null),
      order: model.order.length, values: d.values ? [...d.values] : null, keys, chart: null, src: L(line),
    };
    model.things[d.id] = t; model.order.push(d.id);
    if (d.parent) { const p = model.things[d.parent]; if (p) p.container = true; (kids[d.parent] ??= []).push(d.id); }
    if (t.values) vals[d.id] = t.values;
    else if (DATA.includes(kind)) vals[d.id] = [];
    if (d.kv.tone) { const tn = toneOf(d.kv.tone); if (tn !== undefined) facts.push({ k: "tone", ids: [d.id], tone: tn ?? "off", src: L(line) }); }
    if (/^(yes|true)$/.test(d.kv.dim ?? "")) facts.push({ k: "dim", ids: [d.id], on: true, src: L(line) });
    if (!setup) facts.push({ k: "show", ids: [d.id], src: L(line) });
    facts.push(...place(d, line));
  }
  const place = (d: Decl, line: number): Fact[] => {
    if (d.anchor) return [{ k: "at", ids: [d.id], place: d.anchor, src: L(line) }];
    if (d.parent && (d.side || d.place.after) && !model.setup.length) return [];
    return [];
  };

  function op(o: Op, facts: Fact[], setup: boolean) {
    const line = o.line;
    switch (o.op) {
      case "add": declareThing(o.decl, line, setup, facts); return;
      case "conn": {
        const style = (i: number) => STYLE[o.styles[i]] ?? "arrow";
        for (let i = 0; i < o.chain.length - 1; i++) {
          const id = ensureRel(o.chain[i], o.chain[i + 1], style(i), o.label || null, o.is, line, setup, !!o.also);
          if (!setup) facts.push({ k: "rel", rel: id, words: null, style: style(i), role: o.is, src: L(line) }); // the label stays with the line (Relation.label), it is not an event
        }
        return;
      }
      case "remove": {
        const ids: Id[] = [...o.ids];
        for (const [a, b] of o.conns) ids.push(`${a}->${b}`);
        facts.push({ k: "hide", ids, src: L(line) });
        for (const id of o.ids) { const p = model.things[id]?.parent; if (p && kids[p]) kids[p] = kids[p].filter((x) => x !== id); }
        return;
      }
      case "move": {
        const ids = o.ids ?? [o.id];
        const overlay = kinds[ids[0]] === "token" || kinds[ids[0]] === "pointer";
        if (overlay && !o.into) facts.push({ k: "at", ids, place: o.to, src: L(line) });
        else { for (const id of ids) for (const k of Object.keys(kids)) kids[k] = kids[k].filter((x) => x !== id); (kids[o.to] ??= []).push(...ids); facts.push({ k: "in", ids, place: o.to, ...(o.side ? { side: o.side } : {}), ...(o.place.after ? { after: o.place.after } : {}), src: L(line) }); }
        return;
      }
      case "swap": {
        const a = cellOf(o.a), b = cellOf(o.b);
        if (a && b && a.arr === b.arr) { const v = [...vals[a.arr]]; [v[a.i], v[b.i]] = [v[b.i], v[a.i]]; setVals(a.arr, v, facts, line); }
        else facts.push({ k: "layout", word: "swap", arg: `${o.a} ${o.b}`, body: [], src: L(line) });
        return;
      }
      case "set": {
        for (const [k, v] of Object.entries(o.kv)) {
          if (k === "label") {
            const c = cellOf(o.id);
            if (c) { const x = [...vals[c.arr]]; x[c.i] = v; setVals(c.arr, x, facts, line); } else facts.push({ k: "text", id: o.id, lines: [v], src: L(line) });
          } else if (k === "tone") { const tn = toneOf(v); if (tn !== undefined) facts.push({ k: "tone", ids: [o.id], tone: tn ?? "off", src: L(line) }); }
          else if (k === "dim" || k === "down") { if (k === "dim") facts.push({ k: "dim", ids: [o.id], on: /^(yes|true)$/.test(v), src: L(line) }); else facts.push({ k: "layout", word: "set", arg: `${o.id} down=${v}`, body: [], src: L(line) }); }
          else facts.push({ k: "layout", word: "set", arg: `${o.id} ${k}=${v}`, body: [], src: L(line) });
        }
        return;
      }
      case "highlight": {
        facts.push({ k: "light", ids: o.ids, src: L(line) });
        const tn = toneOf(o.tone);
        if (tn) if (tn !== "accent") facts.push({ k: "tone", ids: o.ids, tone: tn, src: L(line) });
        return;
      }
      case "say": facts.push({ k: "say", id: o.id, words: o.text, ...(o.at ? { side: o.at as "above" } : {}), src: L(line) }); return;
      case "spotlight": facts.push({ k: "light", ids: o.ids, src: L(line) }); return;
      case "note": if (setup && model.things[o.id]) { model.things[o.id].keys.note = o.text; return; } facts.push({ k: "layout", word: "set", arg: `${o.id} note=${o.text}`, body: [], src: L(line) }); return;
      case "send": {
        const style = o.show === "stream" ? "stream" : "arrow";
        for (let i = 0; i < o.path.length - 1; i++) {
          const id = ensureRel(o.path[i], o.path[i + 1], "arrow", null, o.is, line, false);
          facts.push({ k: "rel", rel: id, words: o.label || null, style, role: o.is, src: L(line) });
        }
        if (o.as) {
          const end = o.path[o.path.length - 1];
          const into = ["queue", "stack", "list"].includes(kinds[end] ?? "");
          declareThing({ kind: "token", id: o.as, label: o.label || o.as, parent: null, under: null, side: null, place: {}, anchor: into ? null : end, kv: {}, values: null }, line, false, facts);
          if (into) { (kids[end] ??= []).push(o.as); facts.push({ k: "in", ids: [o.as], place: end, src: L(line) }); }
        }
        return;
      }
      case "push": {
        if (o.as) { declareThing({ kind: "box", id: o.as, label: o.label, parent: o.s, under: null, side: null, place: {}, anchor: null, kv: {}, values: null }, line, false, facts); facts.push({ k: "in", ids: [o.as], place: o.s, src: L(line) }); return; }
        setVals(o.s, [...(vals[o.s] ?? []), o.label], facts, line);
        return;
      }
      case "pop": {
        const v = vals[o.s] ?? [], isQueue = kinds[o.s] === "queue";
        if (v.length) { setVals(o.s, isQueue ? v.slice(1) : v.slice(0, -1), facts, line); return; }
        const list = kids[o.s] ?? [], id = isQueue ? list[0] : list[list.length - 1];
        if (id) {
          kids[o.s] = list.filter((x) => x !== id);
          const overlay = kinds[id] === "token" || kinds[id] === "pointer";
          if (o.to && !overlay) (kids[o.to] ??= []).push(id);
          facts.push(o.to ? (overlay ? { k: "at", ids: [id], place: o.to, src: L(line) } : { k: "in", ids: [id], place: o.to, src: L(line) }) : { k: "hide", ids: [id], src: L(line) });
        }
        return;
      }
      case "split": {
        pieces[o.id] = o.into.map((x) => x.id);
        for (const x of o.into) declareThing({ kind: "token", id: x.id, label: x.label ?? x.id, parent: null, under: null, side: null, place: {}, anchor: null, kv: {}, values: null }, line, false, facts);
        facts.push({ k: "split", id: o.id, into: o.into.map((x) => x.id), labels: o.into.map((x) => x.label ?? ""), src: L(line) });
        return;
      }
      case "merge": {
        declareThing({ kind: "token", id: o.into.id, label: o.into.label ?? o.into.id, parent: null, under: null, side: null, place: {}, anchor: null, kv: {}, values: null }, line, false, facts);
        facts.push({ k: "merge", ids: o.ids, into: o.into.id, src: L(line) });
        return;
      }
      case "join": facts.push({ k: "merge", ids: pieces[o.id] ?? [], into: o.id, src: L(line) }); return;
      case "drop": facts.push({ k: "drop", ids: o.ids, ...(o.at ? { at: o.at } : {}), src: L(line) }); return;
      case "camera": facts.push({ k: "camera", ids: o.ids ?? "all", ...(o.view.close ? { close: true } : {}), ...(o.view.far ? { far: true } : {}), ...(o.view.turn ? { turn: o.view.turn } : {}), ...(o.view.tilt ? { tilt: o.view.tilt } : {}), src: L(line) }); return;
      case "layer": { const r: Region = { id: o.id, title: o.label ?? o.id, flags: o.note ? [`note=${o.note}`] : [], src: L(line), layout: "layers" }; model.regions.push(r); return; }
      case "family": { model.roles[o.id] = { colour: (familyN++ % 8) + 1, label: o.label ?? o.id }; return; } // fmt12: the old key showed the id when a family had no words
      case "layers": facts.push({ k: "layers", apart: o.mode === "split", src: L(line) }); return;
      case "focus": facts.push({ k: "focus", target: o.layer ?? "all", src: L(line) }); return;
      case "zoom": facts.push({ k: "zoom", into: o.id === null && !o.ids ? null : (o.ids ?? [o.id as Id]), ...(o.all ? { all: true } : {}), src: L(line) }); return;
      case "lift": facts.push({ k: "lift", ids: o.ids, src: L(line) }); return;
      case "putback": facts.push({ k: "putback", ids: o.ids ?? [], src: L(line) }); return;
      case "enter": facts.push({ k: "enter", scene: o.id, from: o.from, src: L(line) }); return;
      case "leave": facts.push({ k: "leave", ...(o.id ? { scene: o.id } : {}), src: L(line) }); return;
      case "put": {
        const v = [...(vals[o.m] ?? [])], i = v.findIndex((e) => e.startsWith(o.key + ":"));
        const e = `${o.key}: ${o.value}`;
        if (i >= 0) v[i] = e; else v.push(e);
        setVals(o.m, v, facts, line);
        return;
      }
      case "get": facts.push({ k: "light", ids: [`${o.m}.${o.key}`], src: L(line) }); return;
    }
  }
  return { op };
}
export type { Lowerer };
