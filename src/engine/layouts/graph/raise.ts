// render2: a format 12 graph scene, written back in the graph engine's own words (format 10), so its layout is the
// measured one (core/scene.ts: ranks, row groups, the phone's forms, slots for the lines), as the old form of the same
// scene gets through legacy.ts. Only geometry is carried: what is shown, where it sits, what joins what, the sizes and
// the words that size a box or a line. The drawing, the motion and the colours stay the one engine's.
// A scene that uses something the graph engine has no words for (charts, regions, scenes inside the scene, a layout's
// own words, zooms into closed things, trees) is not raised: raise12 returns null and graph.ts ranks it itself.
import type { Id, Model, Relation, StepState, Thing } from "../../types";
import { FAMILY } from "../../types";

export type Raised = { head: string; steps: { title: string; raw: string; line: number }[]; base: number; info: Record<string, string>; setup: string };

const DATA = new Set(["array", "list", "stack", "queue", "map"]);
const SHAPE_KIND: Record<string, string> = { box: "box", pill: "pill", circle: "circle", cylinder: "cylinder", cloud: "cloud", person: "person", diamond: "diamond", text: "text", dot: "dot", token: "token", ref: "pointer" };
const ARROW: Record<Relation["style"], string> = { arrow: "->", dashed: "-->", line: "--", both: "<->" };
// facts that need nothing in the graph engine's words, or are geometry the states already carry
const PLAIN_FACTS = new Set(["show", "hide", "at", "in", "is", "text", "tone", "dim", "values", "clear", "rel", "light", "say", "note", "foot", "split", "merge", "drop", "focus", "camera", "zoom", "then", "pace", "layers", "lift", "putback"]); // fmt12: layers apart/together, lift, put back (3D depth only)
const OLD_TONE: Record<string, string> = { good: "good", bad: "hot", warn: "warn", accent: "acc", off: "plain" };

/** quoted words for the graph engine (it has no escape for a double quote) */
const q = (s: string) => `"${s.replace(/"/g, "'").replace(/\s+/g, " ").trim()}"`;
const ID_RE = /^[A-Za-z0-9_][\w.-]*$/;

/** why a model cannot be raised (null: it can) */
export function unraisable(model: Model): string | null {
  if (model.origin !== "format12") return "not format 12";
  // fmt12: a layers scene (its regions are the graph engine's layers, 2D or 3D) is raised too, so the things inside its layers
  // get the measured sizes its old form gets (64, 68 ...); only its top level stays the layers layout's
  const layered = model.layout === "layers";
  if (model.layout !== "graph" && !layered) return `layout ${model.layout}`;
  if (!model.order.length) return "empty";
  if (model.regions.length && !layered) return "regions";
  if (Object.keys(model.scenes).length) return "scenes";
  if (Object.keys(model.layoutWords).length) return "layout words";
  // fmt12: a 3D scene is raised too (the graph engine lays out its floor plan as in 2D; its depth comes from its nesting)
  const T0 = model.things;
  for (const id of model.order) {
    const t = model.things[id];
    if (!ID_RE.test(id)) return `id ${id}`;
    if (t.chart) return "chart";
    if (t.layout && !["graph", "free", "tree", ...DATA].includes(t.layout)) return `layout ${t.layout}`;
    if (t.layout && FAMILY[t.layout] === "data" && t.parent && model.things[t.parent]?.layout && FAMILY[model.things[t.parent].layout!] === "data") return "data in data";
    // render3: a data structure beside another container in a group: the graph engine gives it a slot of its own size, the data layout draws it bigger, and its
    // siblings and the group do not move for it (format 63: "cart sizes" past "orders service", "sorted ids" under "price index"). Ranked instead
    if (t.layout && FAMILY[t.layout] === "data" && t.parent && T0[t.parent]?.layout !== "free" && model.order.some((o) => o !== id && T0[o].parent === t.parent && T0[o].layout)) return "data beside a container in a group"; // a free group keeps its own places (68)
    if (t.lines.length) return "card lines"; // the graph engine sizes a box by its title only
    if (t.region && !layered) return "region";
    if (t.region && t.parent && T0[t.parent]?.region !== t.region) return "region inside"; // fmt12: a child stands on its container's layer
    if (t.keys.cols !== undefined && !/^[1-9]\d?$/.test(t.keys.cols)) return "cols";
    if (t.keys.pos !== undefined && !(t.parent && model.things[t.parent]?.layout === "free")) return "pos"; // fmt12: a place in a free container is the graph engine's own pos=
  }
  for (const f of [...model.setup, ...model.steps.flatMap((s) => s.facts)]) {
    if (f.k === "layout" && f.word === "set" && /^[\w.-]+(\s+[a-z]+=\S+)+$/.test(f.arg.trim())) continue; // the graph engine's own set (down=, level= ...)
    if (!PLAIN_FACTS.has(f.k)) return `fact ${f.k}`;
    if (f.k === "text") return "text";
  }
  return null;
}

type Pres = { parent: Id | null; anchor: Id | null };

/** a format 12 graph model as the graph engine's source (head, steps), or null */
export function raise12(model: Model, states: StepState[]): Raised | null {
  if (unraisable(model) || !states.length) return null;
  // a state chip or replaced lines size a box in the one engine; the graph engine has neither
  if (states.some((s) => Object.values(s.things).some((t) => t.is || t.text))) return null;
  const T = model.things;
  // a data structure holds its longest values for the whole story (the graph engine keeps its largest size anyway)
  const longest = new Map<Id, string[]>();
  // a thing that lives inside a data structure is one of its cells (a.0): the structure draws it, the engine knows it by name
  // a hash table drawn as buckets (a map with buckets= and no entries): its buckets h.0 .. h.(n-1) are its cells
  const buckets = (id: Id) => (T[id]?.layout === "map" && !(T[id].values ?? []).length && /^\d+$/.test(T[id].keys.buckets ?? "") ? +T[id].keys.buckets : 0);
  const cell = (id: Id) => { const m = /^(.*)\.(\d+)$/.exec(id); return !!m && !T[id] && (longest.has(m[1]) && (!buckets(m[1]) || +m[2] < buckets(m[1]))); };
  for (const id of model.order) if (T[id].layout && DATA.has(T[id].layout!)) {
    let best = T[id].values ?? [];
    for (const s of states) { const v = s.things[id]?.values; if (v && v.length > best.length) best = v; }
    longest.set(id, best);
  }
  const cellAt = new Map<number, Map<Id, Id>>(); // step -> token -> the cell it sits at
  { let now = new Map<Id, Id>(); const read = (facts: Model["setup"]) => { for (const f of facts) if (f.k === "at") for (const id of f.ids) { if (cell(f.place)) now.set(id, f.place); else now.delete(id); } else if (f.k === "in") for (const id of f.ids) now.delete(id); };
    read(model.setup); cellAt.set(0, new Map(now)); model.steps.forEach((st, k) => { read(st.facts); cellAt.set(k + 1, new Map(now)); }); }
  const where = (s: StepState, id: Id): Pres => {
    const at = s.things[id]?.at ?? (!s.things[id]?.in ? cellAt.get(s.step)?.get(id) ?? null : null);
    const kp = T[id].keys.parent; // a thing declared in a bucket (parent="h.2")
    return { parent: at ? null : (s.things[id]?.in ?? T[id].parent ?? (kp && cell(kp) ? kp : null)), anchor: at };
  };
  const kindOf = (t: Thing): string | null => {
    if (buckets(t.id)) return "buckets";
    if (t.flags.includes("table")) return "table"; // fmt12: a table and its rows (the router's routing table, 68)
    if (t.flags.includes("row")) return "row";
    if (t.layout && DATA.has(t.layout)) return t.layout;
    if (t.layout === "tree") return "tree";
    if (t.container || t.layout) return "group";
    return SHAPE_KIND[t.shape] ?? "box";
  };
  const keysOf = (t: Thing, s: StepState): Record<string, string> => ({ ...t.keys, ...(s.things[t.id]?.keys ?? {}) });
  // render3: only the roles this scene's things and lines use. model.roles holds every role of the page too; the graph engine
  // names at most 8 families, so on a page of many roles (the showcase: 37) every raised scene was refused and ranked instead
  const usedRoles = new Set<string>([...model.order.map((id) => T[id].role), ...Object.values(model.relations).map((r) => r.role)].filter((r): r is string => !!r));
  const roles = new Set(Object.keys(model.roles).filter((r) => usedRoles.has(r)));
  const decl = (id: Id, s: StepState, p: Pres): string | null => {
    const t = T[id], kind = kindOf(t); if (!kind) return null;
    const k = keysOf(t, s), w: string[] = [kind, id, ...(t.title && kind !== "row" ? [q(t.title)] : [])];
    if (p.anchor) { if (kind !== "token" && kind !== "pointer") return null; w.push("at", p.anchor); }
    else if (p.parent) { w.push("in", p.parent); if (k.under && T[p.parent]?.layout === "tree") w.push("under", k.under, ...(k.side === "left" || k.side === "right" ? [k.side] : [])); }
    else if (kind === "token" || kind === "pointer") return null; // a token sits at a thing or waits in a container
    if (kind === "group") { const lay = k["legacy-layout"] ?? (["row", "column", "grid"].includes(k.layout) ? k.layout : null) ?? (t.layout === "free" ? "free" : t.layout === "graph" ? "graph" : null); if (lay && ["row", "column", "grid", "graph", "free"].includes(lay)) w.push(`layout=${lay}`); if (k.cols) w.push(`cols=${k.cols}`); if (k.dir) w.push(`dir=${k.dir}`); }
    if (!p.parent && !p.anchor && t.region && model.layout === "layers") w.push(`layer=${t.region}`); // fmt12
    if (t.role && roles.has(t.role)) w.push(`is=${t.role}`);
    if (kind === "buckets") w.push(`count=${buckets(id)}`);
    for (const key of ["size", "pos", "fill", "level", "closed", ...(kind === "map" ? ["buckets"] : [])]) if (k[key] !== undefined && k[key] !== "") w.push(`${key}=${/\s/.test(k[key]) ? q(k[key]) : k[key]}`);
    if (k.down === "yes") w.push("down=yes");
    if (k.note) w.push(`note=${q(k.note)}`);
    const v = longest.get(id) ?? (kind === "table" || kind === "row" ? t.values ?? undefined : undefined); // fmt12
    return w.join(" ") + (v && v.length ? `: ${kind === "map" ? v.join(", ") : v.map((x) => (/[\s,]/.test(x) ? q(x) : x)).join(", ")}` : "");
  };
  const fence = model.fence;
  const info: Record<string, string> = {};
  if (fence.dir === "down" || fence.dir === "right") info.dir = fence.dir;
  if (["s", "m", "l"].includes(fence.size)) info.size = fence.size;
  if (fence.fill === "none") info.fill = "none";
  const lay = fence["legacy-layout"] ?? (model.layout === "free" ? "free" : fence.layout);
  if (lay && ["row", "column", "grid", "free", "graph"].includes(lay)) info.layout = lay;
  for (const k of ["apart", "entered", "fit"]) if (fence[k] !== undefined) info[k] = fence[k] || "1";
  if (model.view !== "2d") { info.view = "3d"; if (model.view === "3d-only") info.only = "3d"; } // fmt12

  const head: string[] = [...(model.layout === "layers" ? model.regions.map((r) => `layer ${r.id} ${q(r.title || r.id)}`) : []), ...[...roles].map((r) => `family ${r} ${q(model.roles[r].label ?? r)}`)]; // fmt12: layers first
  // the setup: everything the story ever shows is declared where it sits at step 0 (or where it first shows), and the
  // setup step takes away what step 0 hides, so the graph engine knows each thing's own words from the start
  const pres = new Map<Id, Pres>(), conns = new Map<string, Relation>();
  const first = (id: Id): StepState => states.find((s) => s.things[id]?.visible) ?? states[0];
  const depth = (s: StepState, id: Id): number => { let d = 0, p = where(s, id).parent ?? where(s, id).anchor; while (p && d < 64) { d++; const ps = T[p] ? where(s, p) : { parent: null, anchor: null }; p = ps.parent ?? ps.anchor; } return d; };
  const everShown = model.order.filter((id) => !cell(id) && states.some((s) => s.things[id]?.visible));
  const s0 = states[0];
  const declOrder = [...everShown].sort((a, b) => depth(first(a), a) - depth(first(b), b) || model.order.indexOf(a) - model.order.indexOf(b));
  for (const id of declOrder) {
    const s = first(id), p = where(s, id);
    // a parent or anchor the setup does not declare (shown only later): fall back to rank layout
    if ((p.parent && !pres.has(p.parent) && !cell(p.parent)) || (p.anchor && !pres.has(p.anchor) && !cell(p.anchor))) return null;
    const d = decl(id, s, p); if (!d) return null;
    head.push(d); pres.set(id, p);
  }
  // a line drawn only for the step that sends along it (it was not there before and is gone after) is the graph engine's
  // send, which leaves no line: it is not a connector, so it does not rank or bend the layout
  const sentAt = (k: number) => new Set(k > 0 ? model.steps[k - 1].facts.flatMap((f) => (f.k === "rel" ? [f.rel] : [])) : []);
  const sendOnlyBy = (r: Relation, k: number) => k > 0 && sentAt(k).has(r.id) && !states[k - 1].relations[r.id]?.visible && k + 1 < states.length && !states[k + 1].relations[r.id]?.visible;
  // at the last step there is no step after to tell: a story that sends this way elsewhere does so there too
  const sendsOnly = Object.values(model.relations).some((r) => states.some((_, k) => sendOnlyBy(r, k)));
  const sendOnly = (r: Relation, k: number) => sendOnlyBy(r, k) || (sendsOnly && k === states.length - 1 && k > 0 && sentAt(k).has(r.id) && !states[k - 1].relations[r.id]?.visible);
  const relOn = (s: StepState, r: Relation) => !!s.relations[r.id]?.visible && present(r.from) && present(r.to) && !sendOnly(r, s.step);
  const present = (id: Id) => pres.has(id) || cell(id);
  // a line drawn with words in the step it first shows: the graph engine's connector with its label (what migrate writes
  // for one), so the engine keeps room for the words as it did for the old form
  const wordsAt = (k: number, id: Id) => (k > 0 ? model.steps[k - 1].facts.find((f) => f.k === "rel" && f.rel === id && f.words) as { words: string } | undefined : undefined)?.words ?? null;
  const connLine = (r: Relation, words: string | null = null) => `${r.from} ${ARROW[r.style]} ${r.to}${r.label || words ? " " + q((r.label || words)!) : ""}${r.role && roles.has(r.role) ? ` is=${r.role}` : ""}${/#\d+$/.test(r.id) || [...conns.values()].some((c) => (c.from === r.from && c.to === r.to) || (c.from === r.to && c.to === r.from)) ? " also=yes" : ""}`;
  // relations shown at step 0 between things the setup shows
  const at0 = new Set(model.order.filter((id) => s0.things[id]?.visible));
  for (const r of Object.values(model.relations)) if (s0.relations[r.id]?.visible && (at0.has(r.from) || cell(r.from)) && (at0.has(r.to) || cell(r.to))) { if (r.from === r.to) return null; head.push(connLine(r)); conns.set(r.id, r); }

  const drop = (id: Id) => { for (const [k, v] of [...pres]) if (v.parent === id || v.anchor === id) drop(k); pres.delete(id); for (const [k, r] of [...conns]) if (r.from === id || r.to === id) conns.delete(k); };
  const SETS = new Set(["level", "size", "down", "dim", "fill", "closed"]);
  type Beat = { sends: { rel: Id; words: string | null; style: string }[]; says: { id: Id; words: string; side?: string }[] };
  const toState = (s: StepState, beats: Beat[], sets: string[] = []): string[] | null => {
    const out: string[] = [];
    // lines that go (their ends stay)
    for (const [k, r] of [...conns]) if (!s.relations[r.id]?.visible) { out.push(`remove ${r.from} -> ${r.to}`); conns.delete(k); }
    // things that go, the outermost first (what they hold goes with them)
    for (const id of [...pres.keys()].sort((a, b) => depth(s, a) - depth(s, b))) if (pres.has(id) && !s.things[id]?.visible) { out.push(`remove ${id}`); drop(id); }
    // things that move
    for (const id of [...pres.keys()]) {
      const p = pres.get(id)!, n = where(s, id);
      if (p.parent === n.parent && p.anchor === n.anchor) continue;
      const kind = kindOf(T[id]);
      if (n.anchor) { if (kind !== "token" && kind !== "pointer") return null; out.push(`move ${id} to ${n.anchor}`); }
      else if (n.parent) out.push(kind === "token" || kind === "pointer" ? `move ${id} into ${n.parent}` : `move ${id} to ${n.parent}`);
      else return null; // the graph engine has no move back to the stage itself
      pres.set(id, n);
    }
    // things that come (a container before what it holds)
    for (const id of everShown.filter((x) => s.things[x]?.visible && !pres.has(x)).sort((a, b) => depth(s, a) - depth(s, b) || model.order.indexOf(a) - model.order.indexOf(b))) {
      const p = where(s, id);
      if ((p.parent && !present(p.parent)) || (p.anchor && !present(p.anchor))) return null;
      const d = decl(id, s, p); if (!d) return null;
      out.push("add " + d); pres.set(id, p);
    }
    // keys that size a box
    for (const id of pres.keys()) {
      const a = s.things[id]?.keys; if (!a) continue;
      const kv = Object.entries(a).filter(([k, v]) => ["level", "size", "down"].includes(k) || (k === "fill" && (v === "soft" || v === "none"))).map(([k, v]) => `${k}=${v === "yes" || v === "no" ? v : v}`);
      if (kv.length) out.push(`set ${id} ${kv.join(" ")}`);
    }
    for (const a of sets) { const [id, ...kv] = a.trim().split(/\s+/); const ok = kv.filter((x) => SETS.has(x.split("=")[0])); if (present(id) && ok.length) out.push(`set ${id} ${ok.join(" ")}`); }
    // lines that come
    const labelled = new Set<Id>();
    for (const r of Object.values(model.relations)) if (!conns.has(r.id) && relOn(s, r)) { if (r.from === r.to) return null; const w = wordsAt(s.step, r.id); if (w) labelled.add(r.id); out.push(connLine(r, w)); conns.set(r.id, r); }
    // what the step's lines carry and its says, beat by beat: the words the graph engine keeps room for
    const parts: string[][] = [out], ends = new Set<Id>(), starts = new Set<Id>(); // one hop per step: the graph engine refuses a chain across its beats
    beats.forEach((b, i) => {
      const lines: string[] = [], sent = new Set<string>();
      for (const e of b.sends) {
        const r = model.relations[e.rel]; if (!r || labelled.has(r.id) || !present(r.from) || !present(r.to) || r.from === r.to || sent.has(r.from + ">" + r.to)) continue;
        if (!conns.has(r.id) && !sendOnly(r, s.step) && !e.words) continue; // a line drawn, nothing carried
        const show = e.style === "stream" ? "stream " : e.style === "both" ? "both " : ""; // a token send keeps no room (format 12 cannot tell an old arrow send)
        // one hop per beat: a send that starts where another of this beat ends is left out (a stream may run on)
        if (!show.startsWith("stream") && (ends.has(r.from) || starts.has(r.to))) continue;
        sent.add(r.from + ">" + r.to); ends.add(r.to); starts.add(r.from); lines.push(`send ${show}${e.words ? q(e.words) + " " : ""}${r.from} -> ${r.to}`);
      }
      for (const e of b.says) if (present(e.id) && e.words.trim()) lines.push(`say ${e.id}${e.side ? " " + e.side : ""}: ${e.words.replace(/\s+/g, " ")}`);
      if (i === 0) out.push(...lines); else if (lines.length) parts.push(lines);
    });
    const full = parts.filter((p) => p.length).slice(0, 6);
    return full.flatMap((p, i) => (i ? ["then", ...p] : p));
  };
  const setupRaw: string[] = [];
  // step 0: take away what the setup declared but step 0 does not show (the engine plays this as its setup step)
  { const r = toState(s0, [], model.setup.flatMap((f) => (f.k === "layout" && f.word === "set" ? [f.arg] : []))); if (!r) return null; setupRaw.push(...r); }
  const steps: Raised["steps"] = [];
  for (let k = 1; k < states.length; k++) {
    const st = model.steps[k - 1];
    const beats: Beat[] = [{ sends: [], says: [] }];
    for (const f of st.facts) {
      if (f.k === "then") beats.push({ sends: [], says: [] });
      else if (f.k === "rel") beats[beats.length - 1].sends.push({ rel: f.rel, words: f.words, style: f.style });
      else if (f.k === "say") beats[beats.length - 1].says.push({ id: f.id, words: f.words, side: f.side });
    }
    const sets = st.facts.flatMap((f) => (f.k === "layout" && f.word === "set" ? [f.arg] : []));
    const r = toState(states[k], beats, sets); if (!r) return null;
    // fmt12: the step's zooms first (the graph engine moves a thing into a closed container only once it is zoomed into)
    const zooms = st.facts.flatMap((f) => (f.k === "zoom" ? [f.into ? `zoom into ${f.into.join(" ")}` : `zoom out${f.all ? " all" : ""}`] : []));
    steps.push({ title: (st.caption || st.title || `step ${k}`).replace(/\n/g, " "), raw: [...zooms, ...r].join("\n"), line: st.src.line });
  }
  void OLD_TONE;
  return { head: head.join("\n"), steps, base: 1, info, setup: setupRaw.join("\n") };
}
