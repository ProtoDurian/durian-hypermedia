// Lane core: the LLM view of a model (SPEC 6.8, 6.11): one line of what the stage starts with (things nested in
// brackets, then the lines), the families and regions, then the captions as a numbered list; under each caption the
// sends of that step (`a -> b: words`), what tokens do, and the state changes in words. A layout's own `llm` lines
// (a time axis, a worksheet's sums) come last.
import type { Event, Fact, Id, LayoutPlugin, Model, Motion, StepState, ThingState } from "../types";
import { LAYOUT } from "../layouts";
import { diff } from "./diff";
import { insideHidden, isClosed } from "./states";
import { hasScenes, sceneLabel, sceneModel, scenePath } from "./scenes"; // eng-scenes

const q = (s: string) => `"${s}"`;
/** eng-blocks2: a part (layouts/parts.ts) is a thing the head-block layouts make to say when a piece of their drawing shows; it is never named to a reader */
const isPart = (model: Model, id: Id) => !!model.things[id]?.flags.includes("part");
const list = (xs: string[]) => xs.join(", ");

const DATA = new Set(["array", "list", "stack", "queue", "map"]);
/** llm3: where each pointer or token sits at a data structure's cell at the start (`at i a.0`: a.0 is no thing, so the core state keeps no `at`) */
let cellAt: Record<Id, string> | null = null;
function cellsAtStart(model: Model): Record<Id, string> {
  const out: Record<Id, string> = {};
  for (const f of model.setup) if (f.k === "at" && !model.things[f.place]) for (const id of f.ids) out[id] = f.place;
  return out;
}

/** how a thing is named in the setup line: its kind, id, title and lines, values, chip and tone */
function describe(model: Model, id: Id, st: ThingState, kids: string[]): string {
  const t = model.things[id];
  // llm3: a group (a container the graph layout draws) and a pointer say what they are, not the layout or shape they borrow
  const kind = t.chart ? `chart ${t.chart.kind}` : t.flags.includes("group") ? "group" : t.flags.includes("pointer") ? "pointer" : t.layout ?? t.shape;
  const words = [...(st.text ? [t.title, ...st.text] : [t.title, ...t.lines])].filter(Boolean);
  let s = `${kind} ${id}`;
  if (words.length && !(words.length === 1 && words[0] === id)) s += ` ${q(words.join("; "))}`;
  if (st.at) s += ` at ${st.at}`;
  if (st.side) s += ` (${st.side})`;
  else if (t.keys.under) s += ` under ${t.keys.under}${t.keys.side ? ` ${t.keys.side}` : ""}`; // llm3: a tree node's place (`under p30 left`)
  if (t.keys.buckets) s += ` in ${t.keys.buckets} buckets`; // llm3: a hash map's buckets
  if (isClosed(model, id)) s += insideHidden(model, id) ? " closed, inside hidden" : " closed";
  if (st.values) s += `: ${st.values.length ? st.values.join(" ") : "empty"}`;
  else if (t.layout && DATA.has(t.layout) && !kids.length) s += ": empty"; // llm3
  if (!st.at && cellAt?.[id]) s += ` at ${cellAt[id]}`; // llm3: a pointer at a cell (`at i a.0`): the data layout reads it, the core state cannot
  if (st.is) s += `, is ${st.is}`;
  if (st.tone) s += `, ${st.tone}${TONE_MEANS[st.tone] ? ` (${TONE_MEANS[st.tone]})` : ""}`; // llm3
  if (st.dim) s += ", dimmed";
  if (kids.length) s += ` [${kids.join(", ")}]`;
  return s;
}

function setupLine(model: Model, s0: StepState): string {
  cellAt = cellsAtStart(model); // llm3
  const n = model.steps.length;
  const view = model.view === "3d-only" ? ", 3D only" : model.view === "3d" ? ", in 3D" : "";
  // eng-scenes: a story with scenes inside it names them first (SPEC 6.12)
  const subs = hasScenes(model) ? Object.keys(model.scenes) : [];
  const scenes = subs.length ? `, with ${subs.length} scene${subs.length === 1 ? "" : "s"} inside it (${subs.map((id) => sceneName(model, id)).join(", ")}): steps in a scene are indented under the step that enters it` : "";
  const line = `Animation, ${n} step${n === 1 ? "" : "s"}${view}${scenes}. ${startsWith(model, s0)}`;
  cellAt = null;
  return line;
}

/** what a stage starts with: its things (nested in brackets), then its lines */
function startsWith(model: Model, s0: StepState): string {
  const visible = (id: Id) => !!s0.things[id]?.visible && !isPart(model, id); // eng-blocks2
  const kidsOf = (parent: Id | null): Id[] => model.order.filter((id) => visible(id) && !s0.things[id].at && (s0.things[id].in ?? null) === parent);
  const atOf = (parent: Id): Id[] => model.order.filter((id) => visible(id) && s0.things[id].at === parent);
  const walk = (id: Id): string[] => [describe(model, id, s0.things[id], kidsOf(id).flatMap(walk)), ...atOf(id).map((x) => describe(model, x, s0.things[x], []))];
  const top = kidsOf(null).flatMap(walk);
  const loose = model.order.filter((id) => visible(id) && s0.things[id].at && !s0.things[s0.things[id].at!]?.visible).map((id) => describe(model, id, s0.things[id], []));
  const rels = Object.values(model.relations).filter((r) => s0.relations[r.id]?.visible).map(relWords);
  let line = `Starts with: ${[...top, ...loose].join("; ") || "nothing"}.`;
  if (rels.length) line += ` Connected: ${list(rels)}.`;
  return line;
}

const ARROW = { arrow: "->", dashed: "-->", line: "--", both: "<->" } as const;
function relWords(r: Model["relations"][string]): string {
  return `${r.from} ${ARROW[r.style]} ${r.to}${r.role ? ` (${r.role})` : ""}${r.label ? `: ${r.label}` : ""}`;
}

/** families (roles), one colour each, with the things in each */
function familiesLine(model: Model): string | null {
  const by = new Map<string, Id[]>();
  for (const id of model.order) { const r = model.things[id].role; if (r) (by.get(r) ?? by.set(r, []).get(r)!).push(id); }
  // llm3: a family only lines use (`d1 --> d2 (copy)`) names its lines
  for (const r of Object.values(model.relations)) if (r.role && !model.order.some((id) => model.things[id].role === r.role)) (by.get(r.role) ?? by.set(r.role, []).get(r.role)!).push(`${r.from} ${ARROW[r.style]} ${r.to}`);
  if (!by.size) return null;
  const parts = [...by].map(([role, ids]) => { const label = model.roles[role]?.label; return `${role}${label ? ` ${q(label)}` : ""} (${list(ids)})`; });
  return `Families, one colour each: ${parts.join("; ")}.`;
}

const REGION_WORDS: Partial<Record<Model["layout"], string>> = { lanes: "Lanes, left to right", layers: "Layers, top to bottom", timeline: "Rows, top to bottom", grid: "Rows, top to bottom" };
function regionsLine(model: Model): string | null {
  if (!model.regions.length) return null;
  const parts = model.regions.map((r) => { const ids = model.order.filter((id) => model.things[id].region === r.id && !model.things[id].parent); return `${r.id}${r.title && r.title !== r.id ? ` ${q(r.title)}` : ""}${regionPlace(r)}${ids.length ? ` (${list(ids)})` : ""}${regionMore(r)}`; });
  return `${REGION_WORDS[model.layout] ?? "Regions"}: ${parts.join("; ")}.`;
}

/** llm3: a band's place over the lanes (`under Servers..Storage`), and a lane's `...` line */
function regionPlace(r: Model["regions"][number]): string {
  const i = r.flags.findIndex((f) => f === "under" || f === "across" || f === "above");
  if (i < 0) return "";
  const span = r.flags[i + 1]?.split("..");
  return ` (${r.flags[i]}${span && span.length === 2 ? ` ${span[0]} to ${span[1]}` : ""})`;
}
function regionMore(r: Model["regions"][number]): string {
  const more = r.flags.filter((f) => f.startsWith("more=")).map((f) => f.slice(5));
  return more.length ? `, and ${more.join("; ")}` : "";
}

/** group ids that share the same words: "c, s is ESTABLISHED" */
function grouped(pairs: [Id, string][], say: (ids: string, w: string) => string): string[] {
  const by = new Map<string, Id[]>();
  for (const [id, w] of pairs) (by.get(w) ?? by.set(w, []).get(w)!).push(id);
  return [...by].map(([w, ids]) => say(list(ids), w));
}

/** llm3: a cell of a data structure by its address and what it holds (`ids.2` -> `ids.2 (34)`, `cart.ana` -> `cart.ana (3)`) */
function cellWords(model: Model, st: StepState, x: Id): string {
  const dot = x.lastIndexOf("."); if (dot < 0 || model.things[x]) return x;
  const id = x.slice(0, dot), at = x.slice(dot + 1), t = model.things[id];
  const vals = st.things[id]?.values ?? t?.values; if (!t || !vals || t.chart) return x;
  const v = /^\d+$/.test(at) && t.layout !== "map" ? vals[Number(at)] : vals.find((c) => c.split(":")[0].trim() === at)?.split(":").slice(1).join(":").trim();
  return v ? `${x} (${v})` : x;
}
function eventLines(model: Model, events: Event[], before: StepState): string[] {
  const out: string[] = [];
  const title = (id: Id) => model.things[id]?.title || id;
  for (const e of events) {
    switch (e.k) {
      case "send":
        if (e.style === "lost") out.push(`${e.from} -> ${e.to}: ${e.words ?? "a message"} (lost on the way)`);
        else if (e.style === "stream") out.push(`${e.from} ~> ${e.to}${e.words ? `: ${e.words}` : ""} (a steady stream)`);
        else out.push(`${e.from} -> ${e.to}: ${e.words ?? ""}`.replace(/: $/, "") + (model.relations[e.rel]?.style === "dashed" ? " (dashed)" : "")); // llm3
        break;
      case "split": { const [src, ...pieces] = e.ids; out.push(`${src} splits into: ${list(pieces.map(title))}`); break; }
      case "merge": out.push(`${list(e.ids.map(title))} merge into ${e.to}: ${title(e.to ?? "")}`); break;
      case "drop":
        for (const id of e.ids) {
          const from = before.things[id]?.at ?? before.things[id]?.in;
          out.push(e.to ? `${from ?? id} -> ${e.to}: ${title(id)}, dropped there (lost)` : `${title(id)} is dropped (lost)`);
        }
        break;
      case "say": out.push(`${e.id} says: ${e.words.replace(/\s*\|\s*/g, "; ")}`); break;
      case "light": { const ids = e.ids.filter((x) => !isPart(model, x)); if (ids.length) out.push(`Lit: ${list(ids.map((x) => cellWords(model, before, x)))}${e.note ? ` (${e.note})` : ""}`); break; } // eng-blocks2; llm3: a lit cell says what it holds
      case "note": out.push(`Note: ${e.words}`); break;
      case "foot": out.push(`Foot: ${e.words}`); break;
    }
  }
  return out;
}

/** zoom, lift and put back in words (SPEC 6.11) */
function depthLines(model: Model, facts: Fact[], a: StepState, b: StepState): string[] {
  const out: string[] = [];
  let zs = a.zoom;
  const put: Id[] = [];
  for (const f of facts) {
    if (f.k === "zoom") {
      if (f.into && f.into.length) {
        const hid = f.into.some((id) => insideHidden(model, id));
        out.push(`zoom into ${list(f.into)}${hid ? `: ${f.into.length > 1 ? "their insides appear" : "its inside appears"}, the rest fades` : ""}`);
        zs = [...zs, f.into];
      } else if (f.all) { out.push("zoom out all the way"); zs = []; }
      else { out.push(`zoom out of ${list(zs[zs.length - 1] ?? ["it"])}`); zs = zs.slice(0, -1); }
    } else if (f.k === "lift") {
      const from = [...new Set(f.ids.map((id) => a.things[id]?.in ?? model.things[id]?.parent).filter(Boolean) as Id[])];
      out.push(`lift ${list(f.ids)}${from.length ? ` out of ${list(from)}` : ""}`);
    } else if (f.k === "putback") {
      const ids = f.ids.length ? f.ids : model.order.filter((id) => a.things[id]?.lifted);
      out.push(`put back ${list(ids)}`); put.push(...ids);
    }
  }
  // a zoom out that puts things back
  const settled = model.order.filter((id) => a.things[id]?.lifted && !b.things[id]?.lifted && !put.includes(id));
  if (settled.length && facts.some((f) => f.k === "zoom")) out.push(`${list(settled)} settle back into place`);
  return out;
}

const TONE_MEANS: Record<string, string> = { bad: "in trouble", warn: "a warning", accent: "in focus" };
function changeLines(model: Model, m0: Motion, a: StepState, b: StepState, facts: Fact[]): string[] {
  const out: string[] = [];
  const m: Motion = { ...m0, enter: m0.enter.filter((id) => !isPart(model, id)), exit: m0.exit.filter((id) => !isPart(model, id)), restyle: m0.restyle.filter((r) => !isPart(model, r.id)) }; // eng-blocks2
  const st = (id: Id) => b.things[id];
  if (m.enter.length) {
    const top = m.enter.filter((id) => !m.enter.includes(st(id).in ?? ""));
    out.push(`Now shown: ${top.map((id) => describe(model, id, st(id), model.order.filter((k) => m.enter.includes(k) && st(k).in === id).map((k) => describe(model, k, st(k), [])))).join("; ")}.`);
  }
  if (m.exit.length) out.push(`Gone: ${list(m.exit)}.`);
  for (const mv of m.move) {
    const now = st(mv.id);
    out.push(now.at ? `${mv.id} moves to ${now.at}.` : now.in ? `${mv.id} moves into ${now.in}${now.side ? ` (${now.side})` : ""}.` : `${mv.id} moves out of ${mv.from}.`);
  }
  const field = (f: keyof ThingState) => m.restyle.filter((r) => r.fields.includes(f)).map((r) => r.id);
  out.push(...grouped(field("is").map((id) => [id, st(id).is ?? ""]), (ids, w) => (w ? `${ids} ${ids.includes(",") ? "are" : "is"} ${w}.` : `${ids}: chip cleared.`)));
  for (const id of field("text")) out.push(`${id} now reads: ${(st(id).text ?? model.things[id].lines).join("; ")}.`);
  // llm3: a tone says what it means to a reader (bad: in trouble), a cleared tone and a dim say so in plain words
  out.push(...grouped(field("tone").map((id) => [id, st(id).tone ?? ""]), (ids, w) => (w ? `${ids} turn${ids.includes(",") ? "" : "s"} ${w}${TONE_MEANS[w] ? ` (${TONE_MEANS[w]})` : ""}.` : `${ids}: tone cleared, back to normal.`)));
  out.push(...grouped(field("dim").map((id) => [id, st(id).dim ? "dimmed (fades)" : "no longer dimmed (back)"]), (ids, w) => `${ids} ${ids.includes(",") ? "are" : "is"} ${w}.`));
  for (const v of m.values) {
    const ser = b.things[v.id].series ?? [];
    const before = a.things[v.id].series ?? [];
    const changed0 = v.before.join(" ") !== v.after.join(" ");
    if (changed0) out.push(`${v.id} = ${v.after.join(" ") || "empty"}${v.from.length ? ` (from ${list(v.from)})` : ""}`);
    ser.forEach((s, k) => { if (k > 0 && s && (before[k] ?? []).join(" ") !== s.join(" ")) out.push(`${v.id}.${k} = ${s.join(" ")}`); });
  }
  const clear = facts.some((f) => f.k === "clear");
  const drawnNow = m.relEnter.map((id) => model.relations[id]).filter((r) => r && !m.events.some((e) => e.k === "send" && e.rel === r.id) && !(m.enter.includes(r.from) || m.enter.includes(r.to)));
  if (drawnNow.length) out.push(`Connected: ${list(drawnNow.map(relWords))}.`);
  if (clear) out.push("The earlier connectors are gone.");
  else {
    const gone = m.relExit.map((id) => model.relations[id]).filter((r) => r && !m.exit.includes(r.from) && !m.exit.includes(r.to));
    if (gone.length) out.push(`No longer connected: ${list(gone.map((r) => `${r.from} ${ARROW[r.style]} ${r.to}`))}.`);
  }
  if (a.focus !== b.focus) out.push(b.focus === "all" ? "Focus on everything." : `Focus on ${b.focus}.`);
  if (a.layersApart !== b.layersApart) out.push(b.layersApart ? "The layers move apart." : "The layers come together.");
  if (a.scene !== b.scene) out.push(b.scene ? `Enter ${b.scene}.` : `Leave ${a.scene}.`);
  return out;
}

/** the LLM view; `plugins` defaults to the layout registry (a layout adds its own lines) */
export function llm(model: Model, states: StepState[], plugins: Partial<Record<string, LayoutPlugin>> = LAYOUT): string {
  const lines: string[] = [];
  if (model.title) lines.push(`${model.title}${model.note ? ` (${model.note})` : ""}`);
  lines.push(setupLine(model, states[0]));
  const fam = familiesLine(model); if (fam) lines.push(fam);
  const reg = regionsLine(model); if (reg) lines.push(reg);
  const lay = layoutLines(model, states, plugins); // llm3
  lines.push(...lay.setup);
  lines.push("");
  model.steps.forEach((step, i) => {
    const k = i + 1, a = states[k - 1], b = states[k];
    if (!a || !b) return;
    const head = step.title && step.caption && step.title !== step.caption ? `${step.title}: ${step.caption}` : step.caption || step.title;
    // eng-scenes: steps inside a scene are indented under the step that enters it, in that scene's words (SPEC 6.12)
    const sp = hasScenes(model) ? scenePath(model) : null;
    if (sp) {
      const ind = "   ".repeat(sp.enter[k] ? sp.path[k].length - 1 : sp.path[k].length);
      lines.push(`${ind}${k}. ${head}`);
      const own = sp.owner[k];
      const body: string[] = [];
      if (sp.enter[k]) { const id = sp.enter[k]!; body.push(`enters scene ${sceneName(model, id)} from ${sp.via[k]}. ${startsWith(sceneModel(model, id), b.inner?.[id] ?? b)}`); }
      else if (sp.leave[k]) { const back = sp.path[k][sp.path[k].length - 1]; body.push(`leaves scene ${sp.leave[k]}: back to ${back ? `scene ${back}` : "the overview"}, as it was, at ${sp.via[k]}`); }
      else if (own === "") body.push(...stepLines(model, step.facts, a, b));
      else if (own && a.inner?.[own] && b.inner?.[own]) body.push(...stepLines(sceneModel(model, own), step.facts, a.inner[own], b.inner[own]));
      for (const l of [...body, ...(lay.steps[k] ?? [])]) lines.push(`${ind}   ${l}`); // llm3: the layouts' facts of this step
      return;
    }
    lines.push(`${k}. ${head}`);
    for (const l of [...stepLines(model, step.facts, a, b), ...(lay.steps[k] ?? [])]) lines.push(`   ${l}`); // llm3: the layouts' facts of this step
  });
  if (lay.end.length) lines.push("", ...lay.end);
  while (lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

// llm3: the facts only a layout holds (a token's fields, a table's rows, a chart's axis and values, a timeline's items, a
// worksheet's sums) come through the ONE layout hook, LayoutPlugin.llm. Every layout that has something in the story speaks:
// the stage's, a region's or a container's layout, a layout whose head words sit in the setup (a `nest:` beside lanes), and a
// layout that owns a step word written in a step (a `card` panel). A line `Step k: words` goes under step k's caption; a
// line `Setup: words` and any other line go with the setup lines at the top; `End: words` goes last.
function layoutLines(model: Model, states: StepState[], plugins: Partial<Record<string, LayoutPlugin>>): { setup: string[]; steps: string[][]; end: string[] } {
  const used = new Set<string>([model.layout, ...model.regions.flatMap((r) => (r.layout ? [r.layout] : [])), ...model.order.flatMap((id) => (model.things[id].layout ? [model.things[id].layout!] : []))]);
  for (const [name, ws] of Object.entries(model.layoutWords)) if (ws?.length) used.add(name);
  const stepWords = new Set(model.steps.flatMap((s) => s.facts.flatMap((f) => (f.k === "layout" ? [f.word.replace(/^keep /, "")] : []))));
  for (const [name, p] of Object.entries(plugins)) if (p?.words?.step?.some((w) => stepWords.has(w))) used.add(name);
  const out = { setup: [] as string[], steps: [] as string[][], end: [] as string[] };
  const seen = new Set<string>();
  for (const name of used) {
    const p = plugins[name];
    if (!p?.llm) continue;
    let got: string[] = [];
    try { got = p.llm(model, states); } catch { /* a layout's view never breaks the whole view */ }
    for (const l of got) {
      if (seen.has(l)) continue; // two layouts reading the same old block say its facts once
      seen.add(l);
      const m = /^Step (\d+): ([\s\S]*)$/.exec(l);
      if (m && Number(m[1]) >= 1 && Number(m[1]) <= model.steps.length) (out.steps[Number(m[1])] ??= []).push(m[2]);
      else if (/^End: /.test(l)) out.end.push(l.slice(5));
      else out.setup.push(l.replace(/^Setup: /, ""));
    }
  }
  return out;
}

/** the lines under one step's caption: sends, token events, depth, state changes, speech and light, notes */
function stepLines(model: Model, facts: Fact[], a: StepState, b: StepState): string[] {
    const m = diff(model, a, b);
    const notes = m.events.filter((e) => e.k === "note" || e.k === "foot");
    return [
      ...eventLines(model, m.events.filter((e) => e.k === "send"), a),
      ...eventLines(model, m.events.filter((e) => e.k === "split" || e.k === "merge" || e.k === "drop"), a),
      ...depthLines(model, facts, a, b),
      ...changeLines(model, m, a, b, facts),
      ...eventLines(model, m.events.filter((e) => e.k === "say" || e.k === "light"), a),
      ...eventLines(model, notes, a),
    ];
}

// eng-scenes: a scene by its id and label (`up "TCP, up close"`)
const sceneName = (model: Model, id: Id): string => { const l = sceneLabel(model, id); return l !== id ? `${id} ${q(l)}` : id; };
