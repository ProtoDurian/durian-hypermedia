// This package is the source of this file: edit it here. It began as a copy synced from a private prototype (scripts/sync.ts, now frozen).
// scene: the Durian Hypermedia animation engine, format version 6.
// One language for every animation: a free 2D space of entities (shapes, containers, data structures, tokens),
// connectors that follow their ends, layouts that place things, a camera, and steps of changes.
//
//   ```animation
//   group cluster "cluster" layout=row          <- setup: what is on the stage at the start
//   group n1 "node 1" in cluster
//   pill web1 "web-1" in n1
//   pill svc "service"
//   svc -> web1
//   @step The service sends a request to web-1.  <- a step: its caption...
//   send "GET /" svc -> web1                      <- ...and the changes in it, which run together
//   camera n1
//   ```
//
// Pure: no node modules, so doccheck replays and checks every step with the code the browser draws it with.
// No colour, pixel or time is written in the source: layouts place things, tones are page tokens, the engine animates.
// Version 5 adds layers: `layer app "App"` declares one (top to bottom, in order), `layer=app` puts a thing on it, and
// steps may `split layers`, `stack layers` and `focus <layer>`. The 2D stage shows layers as bands; the 3D stage
// (site/src/anim3d.ts) stacks them as planes it can pull apart. One scene, two renderers.

// ---------------------------------------------------------------- the vocabulary (SPEC.md section 6)
export const SHAPES = ["box", "circle", "pill", "cylinder", "cloud", "person", "diamond", "text", "dot"] as const;
export const CONTAINERS = ["group", "array", "list", "stack", "queue", "tree", "graph", "grid", "buckets", "table"] as const;
export const OVERLAYS = ["token", "pointer"] as const;
export const KINDS = [...SHAPES, ...CONTAINERS, ...OVERLAYS, "row"] as const;
export const LAYOUTS = ["row", "column", "grid", "tree", "graph", "free"] as const;
export const TONES = ["plain", "acc", "good", "warn", "hot", "muted"] as const;
export const ARROWS = ["->", "-->", "--", "<->"] as const;
export const OPS = ["add", "remove", "move", "swap", "set", "highlight", "say", "note", "send", "push", "pop", "split", "merge", "camera", "focus"] as const;
// the layer words (format version 5): "layer" declares one in the setup; "split layers", "stack layers" and "focus" change the view
export const LAYER_OPS = ["split layers", "stack layers", "focus <layer>", "focus all"] as const;
const SETUP_OPS = ["note", "push", "camera", "set", "focus"];
const DECL_KEYS = ["tone", "dim", "down", "layout", "dir", "cols", "pos", "count", "note", "layer", "size", "is", "level", "fill"];
const SET_KEYS = ["label", "tone", "dim", "down", "layout", "dir", "cols", "layer", "size", "is", "level", "fill"];
// fill (format version 7): a family's thing has its family's border; its soft fill is on (soft, the default) or off (none),
// per scene (```animation fill=none) or per thing (fill=none). Words stay in ink either way
export const FILLS = ["soft", "none"] as const;
// level=0..100: a meter inside a thing (load, a queue's depth, progress); set level= moves it
const LEVEL_RE = /^(100|[1-9]?\d)$/;
// families (format version 6): "family req \"request\"" names one in the setup; is=req colours a thing, a connector or a
// send with the family's colour. The palette has PALETTE colours, given in the order the families are declared
export const PALETTE = 8;
// sizes (format version 6): an entity, or a whole scene (```animation size=s), is small, medium or large; nothing finer
export const SIZE_NAMES = ["s", "m", "l"] as const;
// how a send shows its movement: a small token travels, an arrow draws itself from source to target, or both
// stream: many small dots flow along the path for the whole step (traffic, a feed, a scrape)
export const SEND_SHOWS = ["token", "arrow", "both", "stream"] as const;
const VIEWS = ["2d", "3d"];
// the kind each helper is drawn as, and the layout it uses
const HELPER_LAYOUT: Record<string, string> = { group: "row", array: "row", list: "row", stack: "column", queue: "row", tree: "tree", graph: "graph", grid: "grid", buckets: "column", table: "column", bucket: "row" };

export interface SceneError { line: number; msg: string }
export interface Place { after?: string; before?: string; first?: boolean }
export interface Decl { kind: string; id: string; label: string | null; parent: string | null; under: string | null; side: "left" | "right" | null; place: Place; anchor: string | null; kv: Record<string, string>; values: string[] | null }
export type Op =
  | { op: "add"; decl: Decl; line: number }
  | { op: "conn"; chain: string[]; styles: string[]; label: string; is: string | null; line: number }
  | { op: "remove"; ids: string[]; conns: [string, string][]; line: number }
  | { op: "move"; id: string; to: string; place: Place; under: string | null; side: "left" | "right" | null; line: number }
  | { op: "swap"; a: string; b: string; line: number }
  | { op: "set"; id: string; kv: Record<string, string>; line: number }
  | { op: "highlight"; ids: string[]; tone: string; line: number }
  | { op: "say"; id: string; text: string; line: number }
  | { op: "note"; id: string; text: string; line: number }
  | { op: "send"; label: string; path: string[]; show: string; is: string | null; line: number }
  | { op: "push"; s: string; label: string; as: string | null; line: number }
  | { op: "pop"; s: string; to: string | null; line: number }
  | { op: "split"; id: string; into: { id: string; label: string | null }[]; line: number }
  | { op: "merge"; ids: string[]; into: { id: string; label: string | null }; line: number }
  | { op: "camera"; ids: string[] | null; line: number }
  | { op: "layer"; id: string; label: string | null; note: string; line: number }
  | { op: "family"; id: string; label: string | null; line: number }
  | { op: "layers"; mode: "split" | "stack"; line: number }
  | { op: "focus"; layer: string | null; line: number };
export interface SceneStep { caption: string; line: number; ops: Op[] }
// narrow: the phone layout (the renderer asks for it on a stage under NARROW pixels): the stage's own row or
// left-to-right graph runs top to bottom instead, so a wide scene is not drawn tiny
// phone: the phone's spacing (PHONE: the same type sizes, tighter padding, gaps and wrap widths), so more of a scene
// fits a phone at a size where its words stay readable; the narrow layout always uses it
export interface Scene { attrs: { layout: string; dir: string; view: string; size: string; fill?: string; narrow?: boolean; phone?: boolean }; setup: Op[]; steps: SceneStep[]; texts: string[] }

// ---------------------------------------------------------------- lexing one line
type Tok = { t: "str" | "arrow" | "kv" | "word"; v: string; k?: string };
const ID_RE = /^[A-Za-z0-9_][\w.-]*$/;
// split at the first ": " (or a final ":") outside quotes: the head, and the text or values after it
function splitColon(s: string): [string, string | null] {
  let q = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '"') q = !q;
    else if (!q && s[i] === ":" && (i === s.length - 1 || s[i + 1] === " ")) return [s.slice(0, i), s.slice(i + 1).trim()];
  }
  return [s, null];
}
function lex(head: string): Tok[] {
  // arrows may be written without spaces (a->b); ids never hold < or >
  const spaced = head.replace(/("[^"]*")|(<->|-->|->)/g, (m, q) => (q ? m : ` ${m} `));
  const out: Tok[] = [];
  const re = /"([^"]*)"|(<->|-->|->|--)(?=\s|$)|([A-Za-z][\w-]*)=("([^"]*)"|\S+)|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(spaced))) {
    if (m[1] !== undefined) out.push({ t: "str", v: m[1] });
    else if (m[2]) out.push({ t: "arrow", v: m[2] });
    else if (m[3]) out.push({ t: "kv", k: m[3], v: m[5] ?? m[4] });
    else out.push({ t: "word", v: m[6] });
  }
  return out;
}
const values = (s: string) => (s.includes(",") ? s.split(",") : s.split(/\s+/)).map((x) => x.trim().replace(/^"|"$/g, "")).filter((x) => x !== "");

// ---------------------------------------------------------------- parsing
export function parseScene(head: string, steps: { title: string; raw: string; line: number }[], base: number, info: Record<string, string> = {}): { scene: Scene; errors: SceneError[] } {
  const errors: SceneError[] = [];
  const scene: Scene = { attrs: { layout: info.layout ?? "auto", dir: info.dir ?? "right", view: info.view ?? "2d", size: info.size ?? "m", fill: info.fill ?? "soft", narrow: info.narrow === "1", phone: info.phone === "1" || info.narrow === "1" }, setup: [], steps: [], texts: [] };
  if (info.fill && !(FILLS as readonly string[]).includes(info.fill)) errors.push({ line: base - 1, msg: `fill=${info.fill}: fill is soft (a light family tint, the default) or none (the border only)` });
  if (info.view && !VIEWS.includes(info.view)) errors.push({ line: base - 1, msg: `${info.view}: an animation opens in 2d or 3d (\`\`\`animation 3d)` });
  if (info.layout && ![...LAYOUTS, "auto"].includes(info.layout)) errors.push({ line: base - 1, msg: `layout=${info.layout} is not a layout (${LAYOUTS.join(", ")})` });
  if (info.dir && !["right", "down"].includes(info.dir)) errors.push({ line: base - 1, msg: `dir=${info.dir}: dir is right or down` });
  if (info.size && !(SIZE_NAMES as readonly string[]).includes(info.size)) errors.push({ line: base - 1, msg: `size=${info.size}: a size is s, m or l (small, medium, large)` });
  if (info.kind) errors.push({ line: base - 1, msg: `animation kinds are gone since format version 4 (got "${info.kind}"): write \`\`\`animation (or \`\`\`animation 3d), then entities and steps (SPEC.md section 6)` });
  const read = (text: string, line: number, setup: boolean, into: Op[]) => {
    const t = text.trim();
    if (!t || t.startsWith("//")) return;
    try { const op = parseLine(t, line, setup, scene.texts); if (op) into.push(op); } catch (e) { errors.push({ line, msg: (e as Error).message }); }
  };
  head.split("\n").forEach((l, i) => read(l, base + i, true, scene.setup));
  for (const s of steps) {
    if (!s.title) errors.push({ line: s.line, msg: "@step needs a caption: the sentence a reader sees for this step" });
    else scene.texts.push(s.title);
    const ops: Op[] = [];
    s.raw.split("\n").forEach((l, i) => read(l, s.line + 1 + i, false, ops));
    scene.steps.push({ caption: s.title, line: s.line, ops });
  }
  if (steps.length < 2) errors.push({ line: base - 1, msg: "an animation needs at least 2 @step lines" });
  return { scene, errors };
}

function parseLine(text: string, line: number, setup: boolean, texts: string[]): Op | null {
  const [headText, tail] = splitColon(text);
  const toks = lex(headText);
  if (!toks.length) throw new Error(`nothing before the colon in "${text}"`);
  const w0 = toks[0].t === "word" ? toks[0].v : "";
  // layers (format version 5): a declaration in the setup, and the two view changes
  if (w0 === "concept") throw new Error(`"concept" in a scene is now "family"`);
  if (w0 === "family") {
    if (!setup) throw new Error(`families are named in the setup, before the first @step: family ${toks[1]?.v ?? "req"} "label"`);
    const id = toks[1]?.t === "word" ? toks[1].v : "";
    if (!id || !ID_RE.test(id)) throw new Error(`family needs an id after it: family req "request"`);
    let label: string | null = null;
    for (const x of toks.slice(2)) { if (x.t === "str" && label == null) { label = x.v; texts.push(x.v); } else throw new Error(`family ${id}: a family takes an id and a "label" only`); }
    if (tail != null) throw new Error("family takes no \": text\"");
    return { op: "family", id, label, line };
  }
  if (w0 === "layer") {
    if (!setup) throw new Error(`layers are declared in the setup, before the first @step: layer ${toks[1]?.v ?? "app"} "label"`);
    const id = toks[1]?.t === "word" ? toks[1].v : "";
    if (!id || !ID_RE.test(id)) throw new Error(`layer needs an id after it: layer app "App"`);
    if (id === "all" || id === "layers") throw new Error(`"${id}" is a reserved word; give the layer another id`);
    let label: string | null = null, note = "";
    for (const x of toks.slice(2)) {
      if (x.t === "str" && label == null) { label = x.v; texts.push(x.v); }
      else if (x.t === "kv" && x.k === "note") { note = x.v; texts.push(x.v); }
      else throw new Error(`layer ${id}: a layer takes an id, a "label" and note="..." only`);
    }
    if (tail != null) throw new Error("layer takes no \": text\"; use note=\"...\"");
    return { op: "layer", id, label, note, line };
  }
  if ((w0 === "split" || w0 === "stack") && toks.length === 2 && toks[1].t === "word" && toks[1].v === "layers" && tail == null) return { op: "layers", mode: w0, line };
  // a connection: a -> b -> c "label"
  if (toks.some((x) => x.t === "arrow") && !["remove", "send"].includes(w0)) {
    if (w0 === "add") toks.shift();
    return parseConn(toks, line, texts);
  }
  if (w0 === "add") {
    if (setup) throw new Error(`"add" is for steps; in the setup, write the entity alone: ${text.replace(/^add\s+/, "")}`);
    return { op: "add", decl: parseDecl(toks.slice(1), tail, texts), line };
  }
  if ((KINDS as readonly string[]).includes(w0) || w0 === "row") {
    if (!setup) throw new Error(`in a step, a new entity starts with "add": add ${text}`);
    return { op: "add", decl: parseDecl(toks, tail, texts), line };
  }
  if (!(OPS as readonly string[]).includes(w0)) throw new Error(`unknown line "${text.slice(0, 50)}": a line is an entity (${KINDS.join(", ")}), a connection (a -> b) or a change (${OPS.join(", ")})`);
  if (setup && !SETUP_OPS.includes(w0)) throw new Error(`"${w0}" is a change: put it under a @step (the setup takes entities, connections, note, push, set and camera)`);
  let rest = toks.slice(1);
  const words = rest.filter((x) => x.t === "word").map((x) => x.v);
  const strs = rest.filter((x) => x.t === "str").map((x) => x.v);
  const kv = Object.fromEntries(rest.filter((x) => x.t === "kv").map((x) => [x.k!, x.v]));
  const need = (n: number, form: string) => { if (words.length < n) throw new Error(`${w0} needs ${form}`); };
  const noTail = () => { if (tail != null) throw new Error(`${w0} takes no ": text"`); };
  switch (w0) {
    case "remove": {
      const ids: string[] = [], conns: [string, string][] = [];
      for (let i = 0; i < rest.length; i++) {
        const x = rest[i];
        if (rest[i + 1]?.t === "arrow" && rest[i + 2]) { conns.push([x.v, rest[i + 2].v]); i += 2; continue; }
        if (x.t === "word") ids.push(x.v); else throw new Error(`remove takes ids and connections (a -> b), not "${x.v}"`);
      }
      if (!ids.length && !conns.length) throw new Error("remove needs what to remove: remove <id> or remove a -> b");
      noTail();
      return { op: "remove", ids, conns, line };
    }
    case "move": {
      // move <id> to|into <id> [under <id> [left|right]] [after <id>|before <id>|first]
      const w = words;
      if (w.length < 3 || !["to", "into"].includes(w[1])) throw new Error("move needs: move <id> to <container or anchor>");
      const { place, under, side } = clauses(w.slice(3));
      noTail();
      return { op: "move", id: w[0], to: w[2], place, under, side, line };
    }
    case "swap": need(2, "two ids: swap a.0 a.1"); noTail(); return { op: "swap", a: words[0], b: words[1], line };
    case "set": {
      need(1, "an id and key=value: set a.2 label=7");
      noTail();
      if (!Object.keys(kv).length) throw new Error(`set needs key=value after the id (keys: ${SET_KEYS.join(", ")})`);
      for (const k of Object.keys(kv)) if (!SET_KEYS.includes(k)) throw new Error(`set: unknown key "${k}" (keys: ${SET_KEYS.join(", ")})`);
      if (kv.label != null) texts.push(kv.label);
      return { op: "set", id: words[0], kv, line };
    }
    case "highlight": need(1, "one id or more: highlight a.0 a.1"); noTail(); if (kv.tone && !(TONES as readonly string[]).includes(kv.tone)) throw new Error(`tone=${kv.tone} is not a tone (${TONES.join(", ")})`); return { op: "highlight", ids: words, tone: kv.tone ?? "acc", line };
    case "say": need(1, "an id and a text: say db: 3 rows"); if (!tail) throw new Error("say needs a text after a colon: say db: 3 rows"); texts.push(tail); return { op: "say", id: words[0], text: tail, line };
    case "note": need(1, "an id and a text: note db: holds users"); texts.push(tail ?? ""); return { op: "note", id: words[0], text: tail ?? "", line };
    case "push": {
      need(1, `a stack or queue and a label: push q "job 1"`);
      noTail();
      const as = words[1] === "as" ? words[2] ?? null : null;
      if (words.length > 1 && words[1] !== "as") throw new Error(`push takes one label in quotes: push ${words[0]} "label" [as id]`);
      if (!strs.length) throw new Error(`push needs a label in quotes: push ${words[0]} "label"`);
      texts.push(strs[0]);
      return { op: "push", s: words[0], label: strs[0], as, line };
    }
    case "pop": need(1, "a stack or queue: pop q [to <id>]"); noTail(); if (words.length > 1 && words[1] !== "to") throw new Error("pop takes: pop <stack or queue> [to <id>]"); return { op: "pop", s: words[0], to: words[2] ?? null, line };
    case "send": {
      // send [token|arrow|both] ["label"] a -> b [-> c]; the show word is followed by a label or an id, never an arrow
      const isKv = rest.filter((x) => x.t === "kv");
      for (const x of isKv) if (x.k !== "is") throw new Error(`send takes is=<family> only, not ${x.k}=`);
      rest = rest.filter((x) => x.t !== "kv");
      const show = rest[0]?.t === "word" && (SEND_SHOWS as readonly string[]).includes(rest[0].v) && rest[1] && rest[1].t !== "arrow" ? rest.shift()!.v : "token";
      const label = rest[0]?.t === "str" ? rest.shift()!.v : "";
      const path: string[] = [];
      rest.forEach((x, i) => { if (i % 2 === 0) { if (x.t !== "word") throw new Error(`send: expected an id, got "${x.v}"`); path.push(x.v); } else if (x.v !== "->") throw new Error(`send goes along "->": send "label" a -> b -> c`); });
      if (path.length < 2) throw new Error(`send needs a path: send "label" a -> b (or send arrow "label" a -> b, send both ...)`);
      // one hop per step (format version 7): a request that goes a -> b -> c in one step is hard to follow; each hop is
      // its own step, with its own caption. A stream is a steady flow, not one request: it may run a longer path
      if (path.length > 2 && show !== "stream") throw new Error(`one hop per step: "${path.join(" -> ")}" moves ${path.length - 1} hops at once; send ${path[0]} -> ${path[1]} in this step, and ${path[1]} -> ${path[2]} in a step of its own with its own caption`);
      noTail(); if (label) texts.push(label);
      return { op: "send", label, path, show, is: isKv[0]?.v ?? null, line };
    }
    case "split": case "merge": {
      // split a into b ["label"] c ["label"];  merge a b into c ["label"]
      const i = rest.findIndex((x) => x.t === "word" && x.v === "into");
      if (i < 0) throw new Error(w0 === "split" ? `split needs: split <id> into <id> ["label"] <id> ["label"]` : `merge needs: merge <id> <id> into <id> ["label"]`);
      const before = rest.slice(0, i).filter((x) => x.t === "word").map((x) => x.v);
      const after: { id: string; label: string | null }[] = [];
      for (const x of rest.slice(i + 1)) { if (x.t === "word") after.push({ id: x.v, label: null }); else if (x.t === "str" && after.length) { after[after.length - 1].label = x.v; texts.push(x.v); } }
      noTail();
      if (w0 === "split") { if (before.length !== 1 || after.length < 2) throw new Error(`split takes one id and at least two new ids: split s1 into s1a "a-m" s1b "n-z"`); return { op: "split", id: before[0], into: after, line }; }
      if (before.length < 2 || after.length !== 1) throw new Error(`merge takes at least two ids and one new id: merge a b into ab "a-z"`);
      return { op: "merge", ids: before, into: after[0], line };
    }
    case "camera": noTail(); if (!words.length) throw new Error("camera needs ids, or all: camera db, camera all"); return { op: "camera", ids: words.length === 1 && words[0] === "all" ? null : words, line };
    case "focus": noTail(); if (words.length !== 1) throw new Error("focus takes one layer, or all: focus app, focus all"); return { op: "focus", layer: words[0] === "all" ? null : words[0], line };
  }
  return null;
}
function clauses(w: string[]): { place: Place; under: string | null; side: "left" | "right" | null; parent: string | null; anchor: string | null } {
  const r = { place: {} as Place, under: null as string | null, side: null as "left" | "right" | null, parent: null as string | null, anchor: null as string | null };
  for (let i = 0; i < w.length; i++) {
    const x = w[i], y = w[i + 1];
    const needY = () => { if (!y) throw new Error(`"${x}" needs an id after it`); i++; return y; };
    if (x === "in") r.parent = needY();
    else if (x === "at") r.anchor = needY();
    else if (x === "under") { r.under = needY(); if (w[i + 1] === "left" || w[i + 1] === "right") { r.side = w[i + 1] as any; i++; } }
    else if (x === "after") r.place.after = needY();
    else if (x === "before") r.place.before = needY();
    else if (x === "first") r.place.first = true;
    else throw new Error(`unexpected word "${x}" (expected in, at, under, after, before or first)`);
  }
  return r;
}
function parseDecl(toks: Tok[], tail: string | null, texts: string[]): Decl {
  const kind = toks[0]?.v ?? "";
  if (!(KINDS as readonly string[]).includes(kind)) throw new Error(`unknown entity "${kind}" (entities: ${KINDS.join(", ")})`);
  const id = toks[1]?.t === "word" ? toks[1].v : "";
  if (!id || !ID_RE.test(id)) throw new Error(`${kind} needs an id after it (letters, digits, - _ .): ${kind} db "Postgres"`);
  let label: string | null = null;
  const words: string[] = [];
  const kv: Record<string, string> = {};
  for (const x of toks.slice(2)) {
    if (x.t === "str") { if (label != null) throw new Error(`${kind} ${id} has two labels`); label = x.v; texts.push(x.v); }
    else if (x.t === "kv") { if (!DECL_KEYS.includes(x.k!)) throw new Error(`${kind} ${id}: unknown key "${x.k}" (keys: ${DECL_KEYS.join(", ")})`); kv[x.k!] = x.v; if (x.k === "note") texts.push(x.v); }
    else if (x.t === "word") words.push(x.v);
    else throw new Error(`${kind} ${id}: unexpected "${x.v}"`);
  }
  const c = clauses(words);
  if (kv.tone && !(TONES as readonly string[]).includes(kv.tone)) throw new Error(`tone=${kv.tone} is not a tone (${TONES.join(", ")})`);
  if (kv.layout && !(LAYOUTS as readonly string[]).includes(kv.layout)) throw new Error(`layout=${kv.layout} is not a layout (${LAYOUTS.join(", ")})`);
  if (kv.dir && !["right", "down"].includes(kv.dir)) throw new Error(`dir=${kv.dir}: dir is right or down`);
  if (kv.cols && !/^[1-9]\d?$/.test(kv.cols)) throw new Error(`cols=${kv.cols}: a number from 1 to 99`);
  if (kv.count && !/^[1-9]\d?$/.test(kv.count)) throw new Error(`count=${kv.count}: a number from 1 to 99`);
  if (kv.pos && !/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(kv.pos)) throw new Error(`pos=${kv.pos}: two numbers, column,row (pos=2,1)`);
  if (kv.size && !(SIZE_NAMES as readonly string[]).includes(kv.size)) throw new Error(`size=${kv.size}: a size is s, m or l (small, medium, large); nothing finer`);
  if (kv.level && !LEVEL_RE.test(kv.level)) throw new Error(`level=${kv.level}: a whole number from 0 to 100`);
  if (kv.fill && !(FILLS as readonly string[]).includes(kv.fill)) throw new Error(`fill=${kv.fill}: fill is soft or none`);
  const vals = tail != null ? values(tail) : null;
  const takesValues = ["array", "list", "stack", "queue", "table", "row"];
  if (vals && !takesValues.includes(kind)) throw new Error(`${kind} takes no ": values" (only ${takesValues.join(", ")} do)`);
  if ((kind === "row" || kind === "table") && !vals?.length) throw new Error(`${kind} needs its cells after a colon: ${kind} ${id}${kind === "row" ? " in t" : ""}: 1, alice`);
  if ((OVERLAYS as readonly string[]).includes(kind) && !c.anchor) throw new Error(`a ${kind} sits on something: ${kind} ${id} "label" at <id>`);
  if (c.anchor && !(OVERLAYS as readonly string[]).includes(kind)) throw new Error(`only a token or a pointer sits "at" an entity; use "in <container>" to put ${id} inside one`);
  if (kind === "buckets" && !kv.count) throw new Error(`buckets needs count=: buckets h "hash table" count=5`);
  if (vals) texts.push(...vals.filter((v) => !/^-?\d+(\.\d+)?$/.test(v)));
  return { kind, id, label, parent: c.parent, under: c.under, side: c.side, place: c.place, anchor: c.anchor, kv, values: vals };
}
function parseConn(toks0: Tok[], line: number, texts: string[]): Op {
  const chain: string[] = [], styles: string[] = [];
  let label = "", is: string | null = null;
  for (const x of toks0) if (x.t === "kv") { if (x.k !== "is") throw new Error(`a connection takes is=<family> only, not ${x.k}=`); is = x.v; }
  const toks = toks0.filter((x) => x.t !== "kv");
  toks.forEach((x, i) => {
    if (x.t === "str") { if (i !== toks.length - 1) throw new Error(`a connection's label comes last: a -> b "label"`); label = x.v; texts.push(x.v); return; }
    if (chain.length === styles.length) { if (x.t !== "word") throw new Error(`expected an id, got "${x.v}"`); chain.push(x.v); }
    else { if (x.t !== "arrow") throw new Error(`expected an arrow (${ARROWS.join(" ")}) between ids, got "${x.v}"`); styles.push(x.v); }
  });
  if (chain.length < 2 || chain.length !== styles.length + 1) throw new Error(`a connection is: a -> b, a --> b (dashed), a -- b (a line), a <-> b, or a chain a -> b -> c`);
  return { op: "conn", chain, styles, label, is, line };
}

// ---------------------------------------------------------------- the state: what is on the stage after each step
export interface Ent {
  key: number; id: string; kind: string; label: string; parent: string | null; kids: string[];
  tone: string; dim: boolean; down: boolean; note: string;
  layout: string; dir: string; cols: number; pos: [number, number] | null;
  under: string | null; side: "left" | "right" | null; anchor: string | null; cells: string[] | null; slot: boolean;
  layer: string | null; // the layer it says it is on (layer=); null: its container's layer
  size: string | null;  // s, m or l (size=); null: its data structure's size, else the scene's
  fill: string | null;  // soft or none (fill=); null: the scene's
  family: string | null; // is=: the family it stands for, which gives its colour
  level: number | null;   // level=: a meter from 0 to 100, or none
}
export interface Layer { id: string; label: string; note: string }
export interface Conn { key: number; from: string; to: string; style: string; label: string; family: string | null }
export interface Family { id: string; label: string }
export interface State { ents: Record<string, Ent>; root: string[]; conns: Conn[]; camera: string[] | null; next: number; counters: Record<string, number>; layers: Layer[]; spread: boolean; focus: string | null; families: Family[] }
// what one step does on top of the state: shown in that step only
// touched: the ids this step adds, moves, changes, sends along, highlights or makes speak; the story camera keeps them in frame
export interface Fx { highlights: { key: number; tone: string }[]; says: { key: number; text: string }[]; sends: { label: string; path: number[]; show: string; family: string | null }[]; spawn: Record<number, number>; merge: Record<number, number>; enter: number[]; touched: string[] }

const isContainer = (k: string) => (CONTAINERS as readonly string[]).includes(k) || k === "bucket";
const isOverlay = (k: string) => (OVERLAYS as readonly string[]).includes(k);
const clone = (s: State): State => JSON.parse(JSON.stringify(s));
class Refuse extends Error {}

export function play(scene: Scene): { states: State[]; fx: Fx[]; errors: SceneError[] } {
  const errors: SceneError[] = [];
  let s: State = { ents: {}, root: [], conns: [], camera: null, next: 1, counters: {}, layers: [], spread: false, focus: null, families: [] };
  const states: State[] = [], fx: Fx[] = [];
  const apply = (ops: Op[], f: Fx) => {
    for (const op of ops) {
      try { applyOp(s, op, f); } catch (e) { errors.push({ line: op.line, msg: e instanceof Refuse ? e.message : `this change broke the engine: ${(e as Error).message}` }); }
    }
  };
  const f0: Fx = { highlights: [], says: [], sends: [], spawn: {}, merge: {}, enter: [], touched: [] };
  // layers first, so a setup line may name a layer declared below it
  apply(scene.setup.filter((o) => o.op === "layer" || o.op === "family"), f0);
  apply(scene.setup.filter((o) => o.op !== "layer" && o.op !== "family"), f0);
  // the setup is the stage before step 1; step k shows the setup plus the changes of steps 1..k
  for (const st of scene.steps) {
    const f: Fx = { highlights: [], says: [], sends: [], spawn: {}, merge: {}, enter: [], touched: [] };
    apply(st.ops, f);
    // one hop per step, also across lines: a send that starts where another send of this step ends is a second hop
    const sends = st.ops.filter((o): o is Extract<Op, { op: "send" }> => o.op === "send" && o.show !== "stream");
    for (const b of sends) {
      const a = sends.find((x) => x !== b && x.path[x.path.length - 1] === b.path[0]);
      if (a) errors.push({ line: b.line, msg: `one hop per step: ${a.path.join(" -> ")} then ${b.path.join(" -> ")} in one step is two hops; move "${b.label || b.path.join(" -> ")}" to a step of its own, with its own caption` });
    }
    states.push(clone(s));
    fx.push(f);
  }
  return { states, fx, errors };
}

function ent(s: State, id: string, what = "entity"): Ent {
  const e = s.ents[id];
  if (!e) {
    const near = Object.keys(s.ents).filter((k) => k.toLowerCase() === id.toLowerCase() || k.startsWith(id + ".")).slice(0, 3);
    throw new Refuse(`no ${what} "${id}" on the stage${near.length ? ` (did you mean ${near.join(", ")}?)` : ""}`);
  }
  return e;
}
const kidsOf = (s: State, parent: string | null) => (parent ? s.ents[parent].kids : s.root);
function isInside(s: State, id: string, anc: string): boolean { let p = s.ents[id]?.parent ?? null; while (p) { if (p === anc) return true; p = s.ents[p].parent; } return false; }
function insertAt(list: string[], id: string, place: Place, s: State) {
  if (place.first) { list.unshift(id); return; }
  const ref = place.after ?? place.before;
  if (ref) {
    const i = list.indexOf(ref);
    if (i < 0) throw new Refuse(`"${ref}" is not in the same container, so nothing can go ${place.after ? "after" : "before"} it`);
    list.splice(place.after ? i + 1 : i, 0, id);
    return;
  }
  list.push(id);
}
function newEnt(s: State, d: { kind: string; id: string; label: string | null; parent: string | null }, extra: Partial<Ent> = {}): Ent {
  if (s.ents[d.id]) throw new Refuse(`"${d.id}" is already on the stage; give the new one another id`);
  const e: Ent = { key: s.next++, id: d.id, kind: d.kind, label: d.label ?? d.id, parent: d.parent, kids: [], tone: "plain", dim: false, down: false, note: "", layout: HELPER_LAYOUT[d.kind] ?? "row", dir: "right", cols: 3, pos: null, under: null, side: null, anchor: null, cells: null, slot: false, layer: null, size: null, fill: null, family: null, level: null, ...extra };
  s.ents[d.id] = e;
  return e;
}
function checkParent(s: State, parent: string | null, kind: string) {
  if (!parent) return;
  const p = ent(s, parent, "container");
  if (!isContainer(p.kind)) throw new Refuse(`"${parent}" is a ${p.kind}, not a container: only ${CONTAINERS.join(", ")} hold entities (to give it things, declare it as group ${parent} "${p.label}")`);
  if (kind === "row" && p.kind !== "table") throw new Refuse(`a row goes in a table, and "${parent}" is a ${p.kind}`);
  if (p.kind === "table" && kind !== "row") throw new Refuse(`a table holds rows: row r1 in ${parent}: 1, alice`);
  if (p.kind === "buckets") throw new Refuse(`put entities in one bucket of "${parent}": in ${parent}.0, ${parent}.1, ...`);
}
function addItems(s: State, parent: Ent, labels: string[], f?: Fx) {
  for (const v of labels) {
    const id = `${parent.id}.${s.counters[parent.id] = (s.counters[parent.id] ?? -1) + 1}`;
    const e = newEnt(s, { kind: "box", id, label: v, parent: parent.id }, { slot: parent.kind === "array" });
    parent.kids.push(id);
    f?.enter.push(e.key);
  }
}
function treeCheck(s: State, parentId: string | null, under: string | null, side: "left" | "right" | null, self: string) {
  const p = parentId ? s.ents[parentId] : null;
  if (!p || p.kind !== "tree" && p.layout !== "tree") { if (under) throw new Refuse(`"under" works inside a tree; "${self}" is not in one`); return; }
  if (!under) { const roots = p.kids.filter((k) => k !== self && !s.ents[k].under); if (roots.length) throw new Refuse(`tree "${p.id}" already has a root (${roots[0]}); say where ${self} goes: under <id> [left|right]`); return; }
  const u = ent(s, under);
  if (u.parent !== p.id) throw new Refuse(`"${under}" is not in tree "${p.id}"`);
  if (side && p.kids.some((k) => k !== self && s.ents[k].under === under && s.ents[k].side === side)) throw new Refuse(`${under} already has a ${side} child`);
}

function applyOp(s: State, op: Op, f: Fx) {
  switch (op.op) {
    case "add": {
      const d = op.decl;
      checkParent(s, d.parent, d.kind);
      if (d.anchor) ent(s, d.anchor);
      treeCheck(s, d.parent, d.under, d.side, d.id);
      const e = newEnt(s, d);
      if (d.kv.tone) e.tone = d.kv.tone;
      if (d.kv.dim) e.dim = /^(true|yes)$/.test(d.kv.dim);
      if (d.kv.down) e.down = /^(true|yes)$/.test(d.kv.down);
      if (d.kv.layout) e.layout = d.kv.layout;
      if (d.kv.dir) e.dir = d.kv.dir;
      if (d.kv.cols) e.cols = +d.kv.cols;
      if (d.kv.pos) e.pos = d.kv.pos.split(",").map(Number) as [number, number];
      if (d.kv.note) e.note = d.kv.note;
      if (d.kv.layer) e.layer = needLayer(s, d.kv.layer);
      if (d.kv.size) e.size = d.kv.size;
      if (d.kv.fill) e.fill = d.kv.fill;
      if (d.kv.is) e.family = needFamily(s, d.kv.is);
      if (d.kv.level) e.level = +d.kv.level;
      f.touched.push(d.id);
      e.under = d.under; e.side = d.side; e.anchor = d.anchor;
      if (!d.anchor) insertAt(kidsOf(s, d.parent), d.id, d.place, s);
      f.enter.push(e.key);
      if (d.kind === "table") { e.cells = d.values; e.label = d.label ?? ""; }
      else if (d.kind === "row") { e.cells = d.values; e.label = d.label ?? d.values!.join(" · "); }
      else if (d.values) addItems(s, e, d.values, f);
      // a container shows a heading only when the author gives it a label
      if (isContainer(d.kind) && d.label == null) e.label = "";
      if (d.kind === "buckets") for (let i = 0; i < +d.kv.count; i++) { const b = newEnt(s, { kind: "bucket", id: `${d.id}.${i}`, label: String(i), parent: d.id }, { slot: true }); e.kids.push(b.id); f.enter.push(b.key); }
      return;
    }
    case "conn": {
      for (const id of op.chain) ent(s, id);
      for (let i = 0; i < op.styles.length; i++) {
        const [a, b] = [op.chain[i], op.chain[i + 1]];
        if (a === b) throw new Refuse(`"${a}" cannot connect to itself`);
        if (isInside(s, a, b) || isInside(s, b, a)) throw new Refuse(`${a} and ${b}: a connector cannot join a container to something inside it`);
        if (s.conns.some((c) => (c.from === a && c.to === b) || (c.from === b && c.to === a))) throw new Refuse(`${a} and ${b} are already connected`);
        const c: Conn = { key: s.next++, from: a, to: b, style: op.styles[i], label: op.label, family: op.is ? needFamily(s, op.is) : null };
        f.touched.push(a, b);
        s.conns.push(c);
        f.enter.push(c.key);
      }
      return;
    }
    case "remove": {
      for (const [a, b] of op.conns) {
        const i = s.conns.findIndex((c) => (c.from === a && c.to === b) || (c.from === b && c.to === a));
        if (i < 0) throw new Refuse(`no connector between ${a} and ${b}`);
        s.conns.splice(i, 1);
      }
      for (const id of op.ids) {
        const e = ent(s, id);
        const p = e.parent ? s.ents[e.parent] : null;
        if (p && (p.kind === "tree" || p.layout === "tree") && p.kids.some((k) => s.ents[k].under === id)) throw new Refuse(`${id} has children in the tree; remove or move them first`);
        drop(s, id);
      }
      return;
    }
    case "move": {
      const e = ent(s, op.id);
      const to = ent(s, op.to, "target");
      if (isOverlay(e.kind)) { e.anchor = to.id; f.touched.push(e.id, to.id); return; }
      if (op.to === op.id || isInside(s, op.to, op.id)) throw new Refuse(`${op.id} cannot move into itself`);
      checkParent(s, to.id, e.kind);
      treeCheck(s, to.id, op.under, op.side, e.id);
      const from = kidsOf(s, e.parent);
      // children of e in a tree stay where they are only if e stays; moving a tree node with children is refused
      const p = e.parent ? s.ents[e.parent] : null;
      if (p && (p.kind === "tree" || p.layout === "tree") && p.id !== to.id && p.kids.some((k) => s.ents[k].under === e.id)) throw new Refuse(`${e.id} has children in the tree; move them first`);
      const was = from.indexOf(e.id), wasLayer = layerIndex(s, e.id);
      from.splice(was, 1);
      e.parent = to.id; e.under = op.under; e.side = op.side;
      f.touched.push(e.id);
      // a thing that changes layer with no place given keeps its place in the row (a lift keeps its shaft)
      const noPlace = !op.place.first && !op.place.after && !op.place.before;
      if (noPlace && layerIndex(s, e.id) !== wasLayer && was < to.kids.length) { to.kids.splice(was, 0, e.id); return; }
      insertAt(to.kids, e.id, op.place, s);
      return;
    }
    case "swap": {
      const a = ent(s, op.a), b = ent(s, op.b);
      if (a.parent !== b.parent) throw new Refuse(`swap works inside one container; ${op.a} and ${op.b} are in different ones`);
      if (isOverlay(a.kind) || isOverlay(b.kind)) throw new Refuse(`a token or pointer moves with "move ... to"; it has no place to swap`);
      const list = kidsOf(s, a.parent);
      f.touched.push(a.id, b.id);
      const i = list.indexOf(a.id), j = list.indexOf(b.id);
      list[i] = b.id; list[j] = a.id;
      // in an array the names are the places: a.0 is always the first cell, so the values trade places and the names stay
      if (a.slot && b.slot) {
        const [ia, ib] = [a.id, b.id];
        list[i] = ia; list[j] = ib;
        const ka = { key: a.key, label: a.label, tone: a.tone, dim: a.dim, down: a.down, note: a.note };
        Object.assign(a, { key: b.key, label: b.label, tone: b.tone, dim: b.dim, down: b.down, note: b.note });
        Object.assign(b, ka);
      }
      return;
    }
    case "set": {
      const e = ent(s, op.id);
      f.touched.push(e.id);
      for (const [k, v] of Object.entries(op.kv)) {
        if (k === "label") e.label = v;
        else if (k === "size") { if (!(SIZE_NAMES as readonly string[]).includes(v)) throw new Refuse(`size=${v}: a size is s, m or l`); e.size = v; }
        else if (k === "tone") { if (!(TONES as readonly string[]).includes(v)) throw new Refuse(`tone=${v} is not a tone (${TONES.join(", ")})`); e.tone = v; }
        else if (k === "dim" || k === "down") { if (!/^(true|false|yes|no)$/.test(v)) throw new Refuse(`${k}= is yes or no`); (e as any)[k] = /^(true|yes)$/.test(v); }
        else if (k === "layout") { if (!isContainer(e.kind)) throw new Refuse(`${op.id} is not a container; only a container has a layout`); if (!(LAYOUTS as readonly string[]).includes(v)) throw new Refuse(`layout=${v} is not a layout`); e.layout = v; }
        else if (k === "dir") e.dir = v;
        else if (k === "layer") e.layer = needLayer(s, v);
        else if (k === "is") e.family = needFamily(s, v);
        else if (k === "fill") { if (!(FILLS as readonly string[]).includes(v)) throw new Refuse(`fill=${v}: fill is soft or none`); e.fill = v; }
        else if (k === "level") { if (!LEVEL_RE.test(v)) throw new Refuse(`level=${v}: a whole number from 0 to 100`); e.level = +v; }
        else if (k === "cols") e.cols = +v;
      }
      return;
    }
    case "highlight": for (const id of op.ids) { f.highlights.push({ key: ent(s, id).key, tone: op.tone }); f.touched.push(id); } return;
    case "say": f.says.push({ key: ent(s, op.id).key, text: op.text }); f.touched.push(op.id); return;
    case "note": ent(s, op.id).note = op.text; return;
    case "send": f.sends.push({ label: op.label, path: op.path.map((id) => ent(s, id).key), show: op.show, family: op.is ? needFamily(s, op.is) : ent(s, op.path[0]).family }); f.touched.push(...op.path); return;
    case "push": {
      const q = ent(s, op.s, "stack or queue");
      if (!["stack", "queue", "list"].includes(q.kind)) throw new Refuse(`push works on a stack, a queue or a list; "${op.s}" is a ${q.kind}`);
      if (op.as) { const e = newEnt(s, { kind: "box", id: op.as, label: op.label, parent: q.id }); q.kids.push(op.as); f.enter.push(e.key); }
      else addItems(s, q, [op.label], f);
      f.touched.push(q.id);
      return;
    }
    case "pop": {
      const q = ent(s, op.s, "stack or queue");
      if (!["stack", "queue"].includes(q.kind)) throw new Refuse(`pop works on a stack or a queue; "${op.s}" is a ${q.kind}`);
      if (!q.kids.length) throw new Refuse(`${op.s} is empty: nothing to pop`);
      // a stack gives back its newest item, a queue its oldest
      const id = q.kind === "stack" ? q.kids[q.kids.length - 1] : q.kids[0];
      if (op.to) {
        const to = ent(s, op.to, "target");
        checkParent(s, to.id, "box");
        q.kids.splice(q.kids.indexOf(id), 1);
        s.ents[id].parent = to.id; to.kids.push(id);
        f.touched.push(id);
      } else drop(s, id);
      f.touched.push(q.id);
      return;
    }
    case "split": {
      const e = ent(s, op.id);
      if (isContainer(e.kind)) throw new Refuse(`split works on a shape, and "${op.id}" is a container; add new containers and move what is inside`);
      const list = kidsOf(s, e.parent);
      let at = list.indexOf(e.id);
      const conns = s.conns.filter((c) => c.from === e.id || c.to === e.id);
      drop(s, e.id);
      for (const n of op.into) {
        const ne = newEnt(s, { kind: e.kind, id: n.id, label: n.label, parent: e.parent }, { tone: e.tone, under: e.under, side: e.side, family: e.family });
        list.splice(at++, 0, n.id);
        f.spawn[ne.key] = e.key;
        f.touched.push(n.id);
        // the pieces keep the connectors of what they came from
        for (const c of conns) { const c2 = { ...c, key: s.next++, from: c.from === e.id ? n.id : c.from, to: c.to === e.id ? n.id : c.to }; s.conns.push(c2); f.enter.push(c2.key); }
      }
      return;
    }
    case "merge": {
      const es = op.ids.map((id) => ent(s, id));
      if (es.some((e) => e.parent !== es[0].parent)) throw new Refuse(`merge works inside one container; ${op.ids.join(", ")} are not all in the same one`);
      if (es.some((e) => isContainer(e.kind))) throw new Refuse(`merge works on shapes, not containers`);
      const list = kidsOf(s, es[0].parent);
      const at = Math.min(...es.map((e) => list.indexOf(e.id)));
      const conns = s.conns.filter((c) => op.ids.includes(c.from) || op.ids.includes(c.to));
      for (const e of es) drop(s, e.id);
      const ne = newEnt(s, { kind: es[0].kind, id: op.into.id, label: op.into.label, parent: es[0].parent }, { tone: es[0].tone, family: es[0].family });
      list.splice(at, 0, ne.id);
      f.touched.push(ne.id);
      for (const e of es) f.merge[e.key] = ne.key;
      const seen = new Set<string>();
      for (const c of conns) {
        const from = op.ids.includes(c.from) ? ne.id : c.from, to = op.ids.includes(c.to) ? ne.id : c.to;
        if (from === to || seen.has(`${from}>${to}`)) continue;
        seen.add(`${from}>${to}`);
        s.conns.push({ ...c, key: s.next++, from, to });
      }
      return;
    }
    case "camera": if (op.ids) for (const id of op.ids) ent(s, id); s.camera = op.ids; return;
    case "family":
      if (s.families.some((c) => c.id === op.id)) throw new Refuse(`family "${op.id}" is named twice`);
      if (s.families.length >= PALETTE) throw new Refuse(`a scene names at most ${PALETTE} families (the palette has ${PALETTE} colours); give ${op.id} the colour of a near one, or a tone=`);
      s.families.push({ id: op.id, label: op.label ?? op.id });
      return;
    case "layer":
      if (s.layers.some((l) => l.id === op.id)) throw new Refuse(`layer "${op.id}" is declared twice`);
      s.layers.push({ id: op.id, label: op.label ?? op.id, note: op.note });
      return;
    case "layers": s.spread = op.mode === "split"; return;
    // focus moves the story's camera to one layer, so it replaces a "camera" framing; "focus all" ends it
    case "focus": if (op.layer) { needLayer(s, op.layer); s.camera = null; } s.focus = op.layer; return;
  }
}
function needFamily(s: State, id: string): string {
  if (s.families.some((c) => c.id === id)) return id;
  if (!s.families.length) throw new Refuse(`no family "${id}": this scene names no families; name one in the setup: family ${id} "label"`);
  throw new Refuse(`no family "${id}" (families: ${s.families.map((c) => c.id).join(", ")})`);
}
function needLayer(s: State, id: string): string {
  if (s.layers.some((l) => l.id === id)) return id;
  if (!s.layers.length) throw new Refuse(`no layer "${id}": this scene declares no layers; declare one in the setup: layer ${id} "label"`);
  throw new Refuse(`no layer "${id}" (layers: ${s.layers.map((l) => l.id).join(", ")})`);
}
// the layer an entity sits on, as an index from the top: its own layer=, else its container's; a token or pointer
// sits on its anchor's. With no layers declared, every nesting level is a layer (top-level things are level 0).
export function layerIndex(s: State, id: string, seen = 0): number {
  const e = s.ents[id];
  if (!e || seen > 64) return 0;
  if (e.anchor) return layerIndex(s, e.anchor, seen + 1);
  if (!s.layers.length) return e.parent ? layerIndex(s, e.parent, seen + 1) + 1 : 0;
  if (e.layer) { const i = s.layers.findIndex((l) => l.id === e.layer); if (i >= 0) return i; }
  return e.parent ? layerIndex(s, e.parent, seen + 1) : 0;
}
// take an entity off the stage, with what it holds, its connectors and the tokens on it
function drop(s: State, id: string) {
  const e = s.ents[id];
  if (!e) return;
  for (const k of [...e.kids]) drop(s, k);
  const list = kidsOf(s, e.parent);
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1);
  delete s.ents[id];
  s.conns = s.conns.filter((c) => c.from !== id && c.to !== id);
  for (const o of Object.values(s.ents)) if (o.anchor === id) drop(s, o.id);
  if (s.camera) { s.camera = s.camera.filter((c) => c !== id); if (!s.camera.length) s.camera = null; }
}

// ---------------------------------------------------------------- layout: where everything sits (world units ~ CSS pixels)
export interface Rect { x: number; y: number; w: number; h: number }
export interface Pt { x: number; y: number }
// layer: the layer it sits on (index from the top); ly: its y inside its layer's band (the 3D stage puts every layer
// on the same floor plan, so a band's own offset is taken off)
// size: its size name; lines: its label, wrapped; lbl: where its words are (a container's heading), for the overlap check
export interface Box extends Rect { key: number; id: string; kind: string; label: string; depth: number; container: boolean; parentKind: string | null; index: string | null; ent: Ent; head: number; layer: number; ly: number; size: SizeName; lines: string[]; lbl: Rect | null; cc: number; fill: "soft" | "none"; pcc: number }
// a connector's label: lines, and where it sits (t along the curve, o off it, sideways), so a moving connector keeps it
// cc: the family colour (1..PALETTE), 0 for none; fill: its family tint on (soft) or off (none); pcc: the family colour
// of the container it sits in (a thing of the same family as its container draws without a tint, so it stands out)
// bend: how far its middle bows sideways (to the right of its way), so it runs around a thing instead of through it
export interface Edge { key: string; from: number; to: number; style: string; label: string; implicit: boolean; cc: number; lines: string[]; lt: number; lo: number; lw: number; lh: number; lr: Rect | null; bend: number }
// what a step puts on top of the stage: a sent token's resting chip, an arrow's label, speech. Each is placed next to
// the thing it belongs to (dx, dy: its corner from that thing's centre), where it covers no label and no shape
export interface Mark { kind: "send" | "alabel" | "say"; at: number; text: string; lines: string[]; r: Rect; dx: number; dy: number; side: "up" | "down" | "left" | "right" | "on" }
// a send: the curves between the things on its path (an arrow drawn along them, or a token travelling them)
// seg, t, ox, oy: an arrow's label sits t along curve seg, moved by (ox, oy)
export interface SendGeom { show: string; label: string; cc: number; path: number[]; offs: number[]; bends: number[]; chip: number | null; alabel: number | null; seg: number; t: number; ox: number; oy: number }
// layers: the declared layers (none: every nesting level is one, unnamed); bands: the 2D stage draws them as bands;
// levels: how many layers there are; spread: split apart (3D); focus: the layer the story looks at, or null
// look: the keys the story's camera frames (null: everything, or the focused layer); touched: the keys this step touches
export interface Frame { boxes: Box[]; edges: Edge[]; bounds: Rect; camera: Rect; layers: Layer[]; bands: boolean; levels: number; spread: boolean; focus: number | null; look: number[] | null; size: SizeName; marks: Mark[]; sends: SendGeom[]; touched: number[]; families: Family[]; phone?: boolean }

// text width: Latin about 7.3 per character at 13px, CJK about 13, Indic scripts about 8.6
export function textW(s: string, size = 13): number {
  let w = 0;
  for (const ch of s) { const c = ch.codePointAt(0)!; w += c >= 0x2e80 ? 13 : c >= 0x0900 && c <= 0x0dff ? 8.6 : /[A-Z@#%&mwMW]/.test(ch) ? 8.6 : /[ilj.,:;'|!]/.test(ch) ? 3.8 : 7.1; }
  return (w * size) / 13;
}

// ---------------------------------------------------------------- the design system (format version 6)
// Every size on the stage comes from these tokens. A scene (```animation size=s) or an entity (size=l) picks s, m or l,
// nothing finer; a container's size also sizes what it holds. font/lh: label type and line height; head: a container's
// heading; px/py: padding; minW/maxW: a label wraps at maxW; minH: the least height; r: corner radius; pad/gap: a
// container's inner padding and the space between what it holds; cell: an array's or a stack's cell
export type SizeName = "s" | "m" | "l";
export interface SizeTok { font: number; lh: number; head: number; px: number; py: number; minW: number; maxW: number; minH: number; r: number; pad: number; gap: number; cell: number }
export const DESIGN: Record<SizeName, SizeTok> = {
  s: { font: 11, lh: 14, head: 10.5, px: 10, py: 6, minW: 52, maxW: 120, minH: 28, r: 6, pad: 8, gap: 12, cell: 32 },
  m: { font: 13, lh: 17, head: 11.5, px: 14, py: 9, minW: 72, maxW: 160, minH: 38, r: 8, pad: 12, gap: 18, cell: 40 },
  l: { font: 15, lh: 20, head: 12.5, px: 18, py: 12, minW: 96, maxW: 200, minH: 48, r: 10, pad: 16, gap: 24, cell: 48 },
};
// the phone's tokens (format version 8): the same type sizes (a heading at least 11), with tighter padding, gaps and wrap
// widths, so a scene is narrower and the stage can draw it at natural size on a phone, where words must stay readable
export const PHONE: Record<SizeName, SizeTok> = {
  s: { font: 11, lh: 14, head: 11, px: 8, py: 5, minW: 44, maxW: 84, minH: 28, r: 6, pad: 7, gap: 10, cell: 32 },
  m: { font: 13, lh: 17, head: 11.5, px: 10, py: 8, minW: 56, maxW: 100, minH: 36, r: 8, pad: 9, gap: 12, cell: 38 },
  l: { font: 15, lh: 20, head: 12.5, px: 13, py: 10, minW: 76, maxW: 124, minH: 44, r: 10, pad: 12, gap: 16, cell: 44 },
};
export const tokens = (phone?: boolean) => (phone ? PHONE : DESIGN);
// on a phone, speech and a connector's or an arrow's label wrap sooner (two short lines rather than one long one)
export const chipOf = (phone?: boolean) => (phone ? PHONE_CHIP : CHIP);
// tokens, sends, speech and connector labels are small whatever the size: a dot and a short chip
export const CHIP = { font: 11, lh: 14, h: 18, px: 7, maxW: 132, dot: 4.5, gap: 5, sayW: 200, edgeW: 170 };
export const PHONE_CHIP = { ...CHIP, sayW: 118, edgeW: 120 };
// a label wraps at its size's maxW, at most 3 lines; a token's chip is one line, cut with "…" (the full text is in its title)
export const MAX_LINES = 3;
export const headH = (z: SizeTok) => Math.round(z.head + 14);
// a heading is set semibold with a little letter spacing: about a tenth wider than body text
export const headW = (s: string, z: SizeTok) => textW(s, z.head) * 1.1 + s.length * z.head * 0.03;

export function wrapText(s: string, font: number, maxW: number, maxLines = MAX_LINES): string[] {
  const fits = (t: string) => textW(t, font) <= maxW + 0.5;
  const lines: string[] = [];
  let cur = "";
  for (let w of s.split(/\s+/).filter(Boolean)) {
    // a word longer than a line is cut where it overflows (with a hyphen between two Latin letters)
    while (!fits(w)) {
      let k = w.length - 1;
      while (k > 1 && !fits(w.slice(0, k) + "-")) k--;
      const hy = /[A-Za-z]$/.test(w.slice(0, k)) && /^[A-Za-z]/.test(w.slice(k)) ? "-" : "";
      if (cur) { lines.push(cur); cur = ""; }
      lines.push(w.slice(0, k) + hy);
      w = w.slice(k);
    }
    const t = cur ? `${cur} ${w}` : w;
    if (fits(t)) cur = t; else { lines.push(cur); cur = w; }
  }
  if (cur || !lines.length) lines.push(cur);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last && !fits(`${last}…`)) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last.trimEnd()}…`;
  return kept;
}
// the same number of lines, as even as they can be (no lone word on a last line)
export function wrapEven(s: string, font: number, maxW: number, maxLines = MAX_LINES): string[] {
  const first = wrapText(s, font, maxW, maxLines);
  if (first.length < 2 || first[first.length - 1].endsWith("…")) return first;
  let lo = maxW * 0.4, hi = maxW;
  for (let k = 0; k < 10; k++) { const m = (lo + hi) / 2; if (wrapText(s, font, m, maxLines + 1).length <= first.length) hi = m; else lo = m; }
  return wrapText(s, font, hi, maxLines);
}
// one line, cut with "…" to fit
export const cut = (s: string, font: number, maxW: number) => wrapText(s, font, maxW, 1)[0];

const SLOT_PARENTS = ["array", "stack", "queue", "list", "bucket"];
const isSlot = (kind: string, parentKind: string | null) => kind === "box" && !!parentKind && SLOT_PARENTS.includes(parentKind);
const linesW = (lines: string[], font: number) => Math.max(0, ...lines.map((l) => textW(l, font)));
// the icon of a person, and the dot, stand above their label
export const personIcon = (z: SizeTok) => Math.round(z.minH * 0.95);
export const cylRy = (z: SizeTok) => Math.round(z.minH * 0.18);

// the size of a shape from its label and its size tokens; its label wraps first
function leafGeom(e: Ent, parentKind: string | null, z: SizeTok): { w: number; h: number; lines: string[] } {
  const text = e.label ?? "";
  if (isSlot(e.kind, parentKind)) { const lines = [cut(text, z.font, z.maxW)]; return { w: Math.max(z.cell, linesW(lines, z.font) + 16), h: z.cell, lines }; }
  const wrap = (k = 1) => (text ? wrapEven(text, z.font, z.maxW * k) : []);
  switch (e.kind) {
    case "row": return { w: 0, h: z.minH - 8, lines: [] };
    case "text": { const lines = wrap(1.4); return { w: linesW(lines, z.font) + 4, h: lines.length * z.lh + 4, lines }; }
    case "dot": { const lines = wrap(); return { w: Math.max(18, linesW(lines, z.font) + 4), h: 16 + (lines.length ? 4 + lines.length * z.lh : 0), lines }; }
    case "person": { const I = personIcon(z), lines = wrap(); return { w: Math.max(I + 10, linesW(lines, z.font) + 6), h: I + 4 + lines.length * z.lh, lines }; }
    case "circle": { const lines = wrap(0.75); const d = Math.max(z.minH + 10, linesW(lines, z.font) + 2 * z.py + 10, lines.length * z.lh + 2 * z.py + 10); return { w: d, h: d, lines }; }
    case "cylinder": { const ry = cylRy(z), lines = wrap(); return { w: Math.max(z.minW, linesW(lines, z.font) + 2 * z.px), h: Math.max(z.minH + 2 * ry, lines.length * z.lh + 2 * z.py + 2 * ry), lines }; }
    case "cloud": { const lines = wrap(); return { w: Math.max(z.minW * 1.3, linesW(lines, z.font) + 2 * z.px + 40), h: Math.max(z.minH + 20, lines.length * z.lh + 2 * z.py + 24), lines }; }
    case "diamond": { const lines = wrap(0.8); return { w: Math.max(z.minW * 1.25, linesW(lines, z.font) * 1.5 + 2 * z.px), h: Math.max(z.minH * 1.4, lines.length * z.lh * 1.7 + 2 * z.py), lines }; }
    case "pill": { const lines = wrap(); const h = Math.max(z.minH - 4, lines.length * z.lh + 2 * z.py - 2); return { w: Math.max(z.minW, linesW(lines, z.font) + 2 * z.px + (lines.length > 1 ? h * 0.3 : 6)), h, lines }; }
    default: { const lines = wrap(); return { w: Math.max(z.minW, linesW(lines, z.font) + 2 * z.px), h: Math.max(z.minH, lines.length * z.lh + 2 * z.py) + (e.level != null ? 8 : 0), lines }; }
  }
}
// where a shape's words sit inside it (the renderer writes them there; the overlap check keeps tokens off them)
export function labelBox(kind: string, r: Rect, lines: string[], z: SizeTok, meter = false): Rect | null {
  if (!lines.length || !lines.some((l) => l)) return null;
  const w = linesW(lines, z.font), h = lines.length * z.lh;
  let cy = r.y + r.h / 2 - (meter ? 4 : 0);
  if (kind === "cylinder") cy = r.y + (r.h + cylRy(z)) / 2;
  else if (kind === "cloud") cy = r.y + r.h * 0.58;
  else if (kind === "person") cy = r.y + personIcon(z) + 4 + h / 2;
  else if (kind === "dot") cy = r.y + 20 + h / 2;
  return { x: r.x + r.w / 2 - w / 2, y: cy - h / 2, w, h };
}

// ---------------------------------------------------------------- connectors: one curve, shared by both renderers and the checks
// where the line from a rectangle's centre towards p leaves the rectangle (or the circle)
export function edgePoint(r: Rect, p: Pt, kind: string): Pt {
  const c = center(r);
  const dx = p.x - c.x, dy = p.y - c.y;
  if (!dx && !dy) return c;
  if (kind === "circle") { const rad = Math.min(r.w, r.h) / 2, l = Math.hypot(dx, dy); return { x: c.x + (dx / l) * rad, y: c.y + (dy / l) * rad }; }
  const k = Math.min(Math.abs(r.w / 2 / (dx || 1e-9)), Math.abs(r.h / 2 / (dy || 1e-9)));
  return { x: c.x + dx * k, y: c.y + dy * k };
}
// a connector leaves each end on the side facing the other end, so it bends around neighbours; circles along the line
function port(r: Rect, o: Rect, kind: string, vert: boolean) {
  const c = center(r), oc = center(o);
  if (kind === "circle") { const p = edgePoint(r, oc, kind); const l = Math.hypot(p.x - c.x, p.y - c.y) || 1; return { x: p.x, y: p.y, nx: (p.x - c.x) / l, ny: (p.y - c.y) / l }; }
  if (vert) { const s = oc.y >= c.y ? 1 : -1; return { x: c.x, y: s > 0 ? r.y + r.h : r.y, nx: 0, ny: s }; }
  const s = oc.x >= c.x ? 1 : -1;
  return { x: s > 0 ? r.x + r.w : r.x, y: c.y, nx: s, ny: 0 };
}
export interface Geom { P: Pt; c1: Pt; c2: Pt; Q: Pt }
// off: moves the whole curve sideways (to the right of its way), so an arrow drawn over a connector sits beside it
export function connGeom(a: Rect, b: Rect, ak: string, bk: string, straight = false, off = 0, bend = 0): Geom {
  const ca = center(a), cb = center(b);
  const gx = Math.max(0, Math.abs(cb.x - ca.x) - (a.w + b.w) / 2), gy = Math.max(0, Math.abs(cb.y - ca.y) - (a.h + b.h) / 2);
  const vert = gy > gx;
  const p = port(a, b, ak, vert), q = port(b, a, bk, vert);
  const gap = 3;
  let P = { x: p.x + p.nx * gap, y: p.y + p.ny * gap }, Q = { x: q.x + q.nx * gap, y: q.y + q.ny * gap };
  const d = Math.max(24, Math.hypot(Q.x - P.x, Q.y - P.y) * 0.45);
  let c1 = straight ? P : { x: P.x + p.nx * d, y: P.y + p.ny * d }, c2 = straight ? Q : { x: Q.x + q.nx * d, y: Q.y + q.ny * d };
  if (off) {
    const L = Math.hypot(Q.x - P.x, Q.y - P.y) || 1, nx = -(Q.y - P.y) / L * off, ny = (Q.x - P.x) / L * off;
    const sh = (v: Pt) => ({ x: v.x + nx, y: v.y + ny });
    P = sh(P); Q = sh(Q); c1 = sh(c1); c2 = sh(c2);
  }
  if (bend) {
    const L = Math.hypot(Q.x - P.x, Q.y - P.y) || 1, nx = (-(Q.y - P.y) / L) * bend, ny = ((Q.x - P.x) / L) * bend;
    c1 = { x: c1.x + nx, y: c1.y + ny }; c2 = { x: c2.x + nx, y: c2.y + ny };
  }
  return { P, c1, c2, Q };
}
export function bezAt(g: Geom, t: number): Pt {
  const u = 1 - t;
  return { x: u * u * u * g.P.x + 3 * u * u * t * g.c1.x + 3 * u * t * t * g.c2.x + t * t * t * g.Q.x, y: u * u * u * g.P.y + 3 * u * u * t * g.c1.y + 3 * u * t * t * g.c2.y + t * t * t * g.Q.y };
}
export function bezTan(g: Geom, t: number): Pt {
  const u = 1 - t;
  const x = 3 * u * u * (g.c1.x - g.P.x) + 6 * u * t * (g.c2.x - g.c1.x) + 3 * t * t * (g.Q.x - g.c2.x), y = 3 * u * u * (g.c1.y - g.P.y) + 6 * u * t * (g.c2.y - g.c1.y) + 3 * t * t * (g.Q.y - g.c2.y);
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
}
// a point t along the curve, moved o sideways (to the right of its way)
export function bezOff(g: Geom, t: number, o: number): Pt { const p = bezAt(g, t), d = bezTan(g, t); return { x: p.x - d.y * o, y: p.y + d.x * o }; }
export const bezPath = (g: Geom) => `M${g.P.x.toFixed(1)} ${g.P.y.toFixed(1)}C${g.c1.x.toFixed(1)} ${g.c1.y.toFixed(1)} ${g.c2.x.toFixed(1)} ${g.c2.y.toFixed(1)} ${g.Q.x.toFixed(1)} ${g.Q.y.toFixed(1)}`;

export const sampleGeom = (g: Geom, n = 64): Pt[] => Array.from({ length: n + 1 }, (_, i) => bezAt(g, i / n));
// the bow that keeps a line from a to b off every obstacle (things it does not end at); the least bow wins
const BENDS = [0, 30, -30, 55, -55, 85, -85, 120, -120, 160, -160];
// obst: words (crossing one is what counts); shapes: things, which a line keeps a clear gap from
export function chooseBend(a: Box, b: Box, obst: Rect[], off = 0, shapes: Rect[] = []): number {
  if (!obst.length && !shapes.length) return 0;
  let best = 0, bestN = Infinity;
  for (const bend of BENDS) {
    const pts = sampleGeom(connGeom(a, b, a.kind, b.kind, false, off, bend), 40);
    const n = obst.filter((r) => lineThrough(pts, r, 2)).length + shapes.filter((r) => lineThrough(pts, r, -6)).length;
    if (n === 0) return bend;
    if (n < bestN) { bestN = n; best = bend; }
  }
  return best;
}
// ---------------------------------------------------------------- placing small things where they cover nothing
export const hit = (a: Rect, b: Rect, m = 0) => a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;
const area = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
// the first candidate that covers nothing; else the one that covers least (labels weigh more than shapes)
// soft: the edges of containers; crossing one is allowed, but a free spot that does not is better
// lines: the connectors and arrows drawn on the stage; a small thing on one is as bad as one on a label
function pick<T extends { r: Rect }>(cands: T[], labels: Rect[], shapes: Rect[], soft: Rect[] = [], lines: Pt[][] = []): T {
  let best = cands[0], bestScore = Infinity;
  for (const c of cands) {
    let s = 0;
    for (const ln of lines) if (lineThrough(ln, c.r, 0)) s += 90;
    for (const e of soft) if (hit(c.r, e, 2)) s += 6;
    for (const l of labels) if (hit(c.r, l, 2)) s += 4 * (area(c.r, l) + 20);
    for (const sh of shapes) if (hit(c.r, sh, 1)) s += area(c.r, sh) + 10;
    if (s === 0) return c;
    if (s < bestScore) { bestScore = s; best = c; }
  }
  return best;
}
// spots of w x h around a rectangle, the preferred side first; each side tries its middle, then its two ends
function around(a: Rect, w: number, h: number, sides: ("up" | "down" | "left" | "right")[], g = CHIP.gap) {
  const out: { r: Rect; side: "up" | "down" | "left" | "right" }[] = [];
  for (const k of [1, 2.6, 5, 8]) for (const side of sides) {
    const gg = g * k;
    if (side === "up" || side === "down") {
      const y = side === "up" ? a.y - h - gg : a.y + a.h + gg;
      for (const x of [a.x + a.w / 2 - w / 2, a.x + a.w - w, a.x, a.x + a.w - w / 3, a.x - (2 * w) / 3]) out.push({ r: { x, y, w, h }, side });
    } else {
      const x = side === "right" ? a.x + a.w + gg : a.x - w - gg;
      for (const y of [a.y + a.h / 2 - h / 2, a.y, a.y + a.h - h]) out.push({ r: { x, y, w, h }, side });
    }
  }
  return out;
}

// story: every connector the whole story ever has, so a graph keeps its layers when a connector comes or goes
// keep: the size each thing has at its largest in the story (by kind and id): a thing keeps one size for the whole story
// attrs.room: the widest connector or arrow label of the story, so a graph leaves room for it between its layers
// heads: where each container's heading sits along its top (0 left, 1 right), chosen for the story so no line crosses it
export function layoutState(s: State, attrs: { layout: string; dir: string; size?: string; fill?: string; room?: number; narrow?: boolean; phone?: boolean }, story: [string, string][] = [], keep: Map<string, [number, number]> = new Map(), heads: Map<string, number> | null = null): Frame {
  const links: [string, string][] = [...s.conns.map((c) => [c.from, c.to] as [string, string]), ...story.filter(([a, b]) => s.ents[a] && s.ents[b])];
  const sz0 = ((SIZE_NAMES as readonly string[]).includes(attrs.size ?? "") ? attrs.size : "m") as SizeName;
  const sizeOf = (id: string, n = 0): SizeName => { const e = s.ents[id]; if (!e || n > 64) return sz0; return (e.size as SizeName | null) ?? (e.parent ? sizeOf(e.parent, n + 1) : e.anchor ? sizeOf(e.anchor, n + 1) : sz0); };
  const DZ = tokens(attrs.phone);
  const Z0 = DZ[sz0];
  // a family's colour is its place in the list; a token or a pointer takes its anchor's
  const fill0 = attrs.fill === "none" ? "none" : "soft";
  const fillOf = (id: string): "soft" | "none" => (s.ents[id]?.fill === "none" ? "none" : s.ents[id]?.fill === "soft" ? "soft" : fill0);
  const ccOf = (id: string | null | undefined, n = 0): number => { const e = id ? s.ents[id] : undefined; if (!e || n > 64) return 0; if (e.family) return s.families.findIndex((c) => c.id === e.family) + 1; return e.anchor ? ccOf(e.anchor, n + 1) : 0; };
  const boxes = new Map<string, Box>();
  const rel = new Map<string, Rect>(); // position of each entity relative to its parent's inner origin
  const size = new Map<string, [number, number]>();
  const head = new Map<string, number>();
  const lines = new Map<string, string[]>();
  const kept = (e: Ent, w: number, h: number): [number, number] => { const k = keep.get(`${e.kind}:${e.id}`); return k ? [Math.max(w, k[0]), Math.max(h, k[1])] : [w, h]; };
  const rootLayout0 = attrs.layout === "auto" ? (links.some(([a, b]) => top(s, a) !== top(s, b)) ? "graph" : "row") : attrs.layout;
  const rootLayout = attrs.narrow && rootLayout0 === "row" ? "column" : rootLayout0;
  const rootDir = attrs.narrow ? "down" : attrs.dir;
  // when the narrow layout turns a graph downward, a column whose things connect outside it turns into a row, so their
  // lines leave side by side instead of running down through each other
  const within = (id: string, c: string) => { for (let x: string | null = id, n = 0; x && n < 64; x = s.ents[x]?.parent ?? null, n++) if (x === c) return true; return false; };
  const turned = new Set(attrs.narrow && rootLayout0 === "graph" ? Object.values(s.ents).filter((e) => isContainer(e.kind) && e.layout === "column" && e.kids.some((k) => links.some(([a, b]) => (a === k && !within(b, e.id)) || (b === k && !within(a, e.id))))).map((e) => e.id) : []);
  const layoutOf = (e: Ent) => (turned.has(e.id) ? "row" : e.layout);
  const rowLike = (e: Ent) => layoutOf(e) === "row" || ["bucket", "array", "list", "queue"].includes(e.kind);
  // measure bottom-up, placing each container's children relative to its inner box
  const measure = (id: string): [number, number] => {
    const e = s.ents[id];
    const z = DZ[sizeOf(id)];
    if (!isContainer(e.kind)) {
      const g = leafGeom(e, e.parent ? s.ents[e.parent].kind : null, z);
      lines.set(id, g.lines);
      const sz = kept(e, g.w, g.h);
      size.set(id, sz);
      return sz;
    }
    const kids = e.kids.filter((k) => !isOverlay(s.ents[k].kind));
    // a queue in a row reads the way things flow (format version 8): new items join at the back (left) and the front,
    // where a worker takes from, is on the right, by what reads it; in a column the front is at the top
    const lay0 = e.kind === "table" ? "table" : e.kind === "stack" ? "stack" : layoutOf(e);
    const [iw, ih] = place(id, kids, e.kind === "queue" && lay0 === "row" ? "queue" : lay0, e.dir, e.cols, gapOf(e.kind, z), z);
    const hh = e.label && e.kind !== "bucket" ? headH(z) : 0;
    const bare = ["array", "list", "queue"].includes(e.kind) && !e.label;
    const pad = bare ? 0 : e.kind === "bucket" ? 4 : z.pad;
    const idx = e.kind === "array" ? 16 : 0;
    const lead = e.kind === "bucket" ? 34 : 0;
    head.set(id, hh);
    const [w, h] = kept(e, Math.max(iw + 2 * pad + lead, hh ? headW(e.label, z) + 2 * z.pad + 6 : 0, e.kind === "bucket" ? 120 : 40), Math.max(Math.max(ih, e.kind === "bucket" ? 32 : 0) + 2 * pad + hh + idx, 40));
    // what it holds sits in the padded inner box: a row from the left (so a thing that moves between floors keeps its
    // shaft), any other layout centred
    const ox = pad + lead + (e.kind === "queue" && lay0 === "row" ? Math.max(0, w - 2 * pad - lead - iw) : rowLike(e) ? 0 : Math.max(0, (w - 2 * pad - lead - iw) / 2));
    for (const k of kids) { const r = rel.get(k)!; rel.set(k, { ...r, x: r.x + ox, y: r.y + pad + hh }); }
    size.set(id, [w, h]);
    return [w, h];
  };
  const gapOf = (kind: string, z: SizeTok) => (kind === "array" ? 4 : kind === "list" ? 30 : kind === "bucket" ? 24 : kind === "stack" ? 4 : kind === "queue" ? 6 : kind === "table" ? 0 : z.gap);
  const place = (owner: string | null, kids: string[], layout: string, dir: string, cols: number, gap: number, z: SizeTok): [number, number] => {
    const sz = kids.map((k) => measure(k));
    if (!kids.length) return [0, 0];
    const set = (k: string, x: number, y: number) => rel.set(k, { x, y, w: size.get(k)![0], h: size.get(k)![1] });
    if (layout === "table") {
      // a table's rows share column widths
      const n = Math.max(...kids.map((k) => s.ents[k].cells?.length ?? 0), s.ents[owner!].cells?.length ?? 0);
      const colW = Array.from({ length: n }, (_, c) => Math.max(48, ...[s.ents[owner!].cells, ...kids.map((k) => s.ents[k].cells)].map((cs) => textW(cs?.[c] ?? "", z.font) + 2 * z.px)));
      const w = colW.reduce((a, b) => a + b, 0);
      (s.ents[owner!] as any)._cols = colW;
      const rh = z.minH - 8;
      let y = rh;
      for (const k of kids) { size.set(k, [w, rh]); (s.ents[k] as any)._cols = colW; set(k, 0, y); y += rh; }
      return [w, y];
    }
    if (layout === "column" || layout === "stack") {
      const w = Math.max(...sz.map((x) => x[0]));
      let y = 0;
      const order = layout === "stack" ? [...kids].reverse() : kids;
      for (const k of order) { const [kw, kh] = size.get(k)!; set(k, (w - kw) / 2, y); y += kh + gap; }
      return [w, y - gap];
    }
    if (layout === "grid") {
      const c = Math.max(1, cols);
      const cw = Math.max(...sz.map((x) => x[0])), ch = Math.max(...sz.map((x) => x[1]));
      kids.forEach((k, i) => { const [kw, kh] = size.get(k)!; set(k, (i % c) * (cw + gap) + (cw - kw) / 2, Math.floor(i / c) * (ch + gap) + (ch - kh) / 2); });
      const rows = Math.ceil(kids.length / c);
      return [Math.min(c, kids.length) * (cw + gap) - gap, rows * (ch + gap) - gap];
    }
    if (layout === "free") {
      let fx = 0;
      let maxX = 0, maxY = 0;
      for (const k of kids) {
        const e = s.ents[k], [kw, kh] = size.get(k)!;
        const x = e.pos ? e.pos[0] * 40 : fx, y = e.pos ? e.pos[1] * 40 : 0;
        if (!e.pos) fx += kw + gap;
        set(k, x, y); maxX = Math.max(maxX, x + kw); maxY = Math.max(maxY, y + kh);
      }
      return [maxX, maxY];
    }
    if (layout === "tree") return treeLayout(s, kids, size, set);
    if (layout === "graph") return graphLayout(s, kids, size, set, dir, gap, links, attrs.room ?? 0);
    // row (a queue's row: the newest on the left, the front on the right)
    const h = Math.max(...sz.map((x) => x[1]));
    let x = 0;
    for (const k of layout === "queue" ? [...kids].reverse() : kids) { const [kw, kh] = size.get(k)!; set(k, x, (h - kh) / 2); x += kw + gap; }
    return [x - gap, h];
  };
  const rootKids = s.root.filter((k) => !isOverlay(s.ents[k].kind));
  const lay = (id: string) => layerIndex(s, id);
  // layers as bands: when the top-level things sit on two or more declared layers, the stage is a column of bands,
  // one per layer (top first), and the n-th thing of every band shares one column, so stacks line up; containers in a
  // column share its width, so what moves between them goes straight up or down
  const banded = s.layers.length > 0 && new Set(rootKids.map(lay)).size > 1;
  const bandRects: { L: number; r: Rect }[] = [];
  let rw = 0, rh = 0;
  if (banded) {
    const BG = Z0.gap * 0.8, BP = Z0.pad + 2, CG = Z0.gap * 3;
    for (const k of rootKids) measure(k);
    const per = s.layers.map((_, L) => rootKids.filter((k) => lay(k) === L));
    const ncol = Math.max(1, ...per.map((p) => p.length));
    const colW = Array.from({ length: ncol }, (_, c) => Math.max(40, ...per.map((p) => (p[c] ? size.get(p[c])![0] : 0))));
    for (const p of per) p.forEach((k, c) => {
      const e = s.ents[k], [kw, kh] = size.get(k)!;
      if (!isContainer(e.kind) || kw >= colW[c]) return;
      const dx = colW[c] - kw;
      size.set(k, [colW[c], kh]);
      if (!rowLike(e)) for (const kid of e.kids) { const r = rel.get(kid); if (r) rel.set(kid, { ...r, x: r.x + dx / 2 }); }
    });
    const labelW = Math.max(...s.layers.map((l) => headW(l.label, Z0))) + 30;
    const totalW = labelW + colW.reduce((a, b) => a + b, 0) + (ncol - 1) * CG + BP;
    let y = 0;
    per.forEach((p, L) => {
      const inner = Math.max(30, ...p.map((k) => size.get(k)![1]));
      let x = labelW;
      p.forEach((k, c) => { const [kw, kh] = size.get(k)!; rel.set(k, { x: x + (colW[c] - kw) / 2, y: y + BP + (inner - kh) / 2, w: kw, h: kh }); x += colW[c] + CG; });
      bandRects.push({ L, r: { x: 0, y, w: totalW, h: inner + 2 * BP } });
      y += inner + 2 * BP + BG;
    });
    rw = totalW; rh = y - BG;
  } else [rw, rh] = place(null, rootKids, rootLayout, rootDir, 3, rootLayout === "graph" ? Math.round(Z0.gap * 1.6) : Math.round(Z0.gap * 2.2), Z0);
  const bandY = (id: string) => (banded ? bandRects[lay(top(s, id))]?.r.y ?? 0 : 0);
  // absolute positions, top-down
  const absolute = (id: string, ox: number, oy: number, depth: number) => {
    const e = s.ents[id], r = rel.get(id)!;
    const x = ox + r.x, y = oy + r.y;
    const p = e.parent ? s.ents[e.parent] : null;
    const index = p?.kind === "array" ? String(p.kids.indexOf(id)) : null;
    const sn = sizeOf(id), z = DZ[sn];
    const container = isContainer(e.kind);
    const ls = container ? (e.label ? [e.label] : []) : lines.get(id) ?? [];
    const rect = { x, y, w: r.w, h: r.h };
    const hh = head.get(id) ?? 0;
    const lbl = container
      ? (hh && e.label ? { x: x + z.pad + (heads?.get(id) ?? 0) * Math.max(0, r.w - 2 * z.pad - headW(e.label, z) - 2), y: y + 4, w: headW(e.label, z) + 2, h: hh - 6 } : e.kind === "bucket" ? { x, y, w: 30, h: r.h } : null)
      : e.kind === "row" ? rect : labelBox(isSlot(e.kind, p?.kind ?? null) ? "box" : e.kind, rect, ls, z, e.level != null);
    boxes.set(id, { key: e.key, id, kind: e.kind, label: e.label, ...rect, depth, container, parentKind: p?.kind ?? null, index, ent: e, head: hh, layer: lay(id), ly: y - bandY(id), size: sn, lines: ls, lbl, cc: ccOf(id), fill: fillOf(id), pcc: ccOf(e.parent) });
    for (const k of e.kids) if (rel.has(k)) absolute(k, x, y, depth + 1);
  };
  for (const k of rootKids) absolute(k, 0, 0, 0);
  // the bands are drawn under everything, as containers with negative keys (-1 for the top layer, -2 ...)
  const bandBoxes: Box[] = bandRects.map(({ L, r }) => {
    const l = s.layers[L];
    const e: Ent = { key: -(L + 1), id: l.id, kind: "layer", label: l.label, parent: null, kids: [], tone: "plain", dim: false, down: false, note: l.note, layout: "row", dir: "right", cols: 1, pos: null, under: null, side: null, anchor: null, cells: null, slot: false, layer: l.id, size: null, family: null, level: null };
    const tw = headW(l.label, Z0);
    return { key: -(L + 1), id: l.id, kind: "layer", label: l.label, ...r, depth: -1, container: true, parentKind: null, index: null, ent: e, head: 0, layer: L, ly: 0, size: sz0, lines: [l.label], lbl: { x: r.x + 12, y: r.y + r.h / 2 - 8, w: tw + 2, h: 16 }, cc: 0, fill: "soft", pcc: 0 };
  });
  const byKey = new Map([...boxes.values()].map((b) => [b.key, b]));
  const edges: Edge[] = s.conns.filter((c) => boxes.has(c.from) && boxes.has(c.to)).map((c) => ({ key: `c${c.key}`, from: boxes.get(c.from)!.key, to: boxes.get(c.to)!.key, style: c.style, label: c.label, implicit: false, cc: c.family ? s.families.findIndex((x) => x.id === c.family) + 1 : 0, lines: [], lt: 0.5, lo: 0, lw: 0, lh: 0, lr: null, bend: 0 }));
  // implicit edges: a tree's parent to child, a list's and a bucket's item to the next
  const implicit = (from: number, to: number, key: string, style: string) => edges.push({ key, from, to, style, label: "", implicit: true, cc: 0, lines: [], lt: 0.5, lo: 0, lw: 0, lh: 0, lr: null, bend: 0 });
  for (const e of Object.values(s.ents)) {
    if (e.kind === "tree" || e.layout === "tree") for (const k of e.kids) { const c = s.ents[k]; if (c.under && boxes.has(c.under)) implicit(s.ents[c.under].key, c.key, `t${s.ents[c.under].key}-${c.key}`, "--"); }
    if (e.kind === "list" || e.kind === "bucket") for (let i = 0; i + 1 < e.kids.length; i++) implicit(s.ents[e.kids[i]].key, s.ents[e.kids[i + 1]].key, `l${s.ents[e.kids[i]].key}-${s.ents[e.kids[i + 1]].key}`, "->");
  }
  // what a small thing must not cover: every label, and every shape
  const leafBoxes = [...boxes.values()].filter((b) => !b.container);
  const labels: Rect[] = [...bandBoxes, ...boxes.values()].map((b) => b.lbl).filter((r): r is Rect => !!r);
  const shapes: Rect[] = leafBoxes.filter((b) => b.kind !== "text").map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }));
  // a connector that would run through a thing (not one of its ends) bows around it
  for (const ed of edges) {
    if (ed.implicit) continue;
    const a = byKey.get(ed.from)!, b = byKey.get(ed.to)!;
    // a container's heading is first moved along its top (heads is null then); once it has its place, a line that still
    // crosses it bows around it too
    const words = [...bandBoxes, ...boxes.values()].filter((x) => x.lbl && x.key !== a.key && x.key !== b.key && (heads || !x.container || x.key < 0)).map((x) => x.lbl!);
    ed.bend = chooseBend(a, b, words, 0, shapes.filter((r) => !(r.x === a.x && r.y === a.y && r.w === a.w) && !(r.x === b.x && r.y === b.y && r.w === b.w)));
  }
  const edgeLine = new Map(edges.map((ed) => { const a = byKey.get(ed.from)!, b = byKey.get(ed.to)!; return [ed.key, sampleGeom(connGeom(a, b, a.kind, b.kind, ed.implicit, 0, ed.bend))]; }));
  // a connector's label: on its middle if that is free, else beside it or further along
  for (const ed of edges) {
    if (!ed.label) continue;
    const a = byKey.get(ed.from)!, b = byKey.get(ed.to)!;
    const g = connGeom(a, b, a.kind, b.kind, ed.implicit, 0, ed.bend);
    ed.lines = wrapEven(ed.label, CHIP.font, chipOf(attrs.phone).edgeW, 2);
    ed.lw = Math.max(24, linesW(ed.lines, CHIP.font) + 14); ed.lh = ed.lines.length * CHIP.lh + 4;
    const cands: { r: Rect; t: number; o: number }[] = [];
    for (const t of [0.5, 0.38, 0.62, 0.28, 0.72]) for (const o of [0, ed.lh / 2 + 8, -(ed.lh / 2 + 8)]) { const p = bezOff(g, t, o); cands.push({ r: { x: p.x - ed.lw / 2, y: p.y - ed.lh / 2, w: ed.lw, h: ed.lh }, t, o }); }
    const best = pick(cands, labels, shapes, [], [...edgeLine].filter(([k]) => k !== ed.key).map(([, v]) => v));
    ed.lt = best.t; ed.lo = best.o; ed.lr = best.r;
    labels.push(best.r);
  }
  // tokens and pointers sit next to their anchor (a token by its top-right corner, a pointer above it), never on a label
  for (const e of Object.values(s.ents)) {
    if (!isOverlay(e.kind) || !e.anchor) continue;
    const a = boxes.get(e.anchor);
    if (!a) continue;
    const text = cut(e.label, CHIP.font, CHIP.maxW);
    const tw = textW(text, CHIP.font);
    let r: Rect;
    if (e.kind === "pointer") {
      const w = Math.max(16, tw + 6), h = 30;
      r = pick(around(a, w, h, ["up", "down"], 2), labels, shapes, [], [...edgeLine.values()]).r;
    } else {
      const w = tw + 2 * CHIP.px + 10, h = CHIP.h;
      const cands = [{ r: { x: a.x + a.w - w + 6, y: a.y - h - 3, w, h } }, ...around(a, w, h, ["up", "right", "down", "left"])];
      r = pick(cands, labels, shapes, [], [...edgeLine.values()]).r;
    }
    labels.push(r);
    boxes.set(e.id, { key: e.key, id: e.id, kind: e.kind, label: e.label, ...r, depth: 99, container: false, parentKind: null, index: null, ent: e, head: 0, layer: lay(e.anchor), ly: r.y - bandY(e.anchor), size: "s", lines: [text], lbl: r, cc: ccOf(e.id), fill: fillOf(e.id), pcc: 0 });
  }
  const all = [...bandBoxes, ...boxes.values()];
  const bounds = all.length ? union(all) : { x: 0, y: 0, w: Math.max(rw, 100), h: Math.max(rh, 60) };
  const focus = s.focus ? s.layers.findIndex((l) => l.id === s.focus) : -1;
  const onFocus = focus < 0 ? [] : banded ? bandBoxes.filter((b) => b.layer === focus) : all.filter((b) => b.layer === focus);
  const cam = s.camera ? union(s.camera.map((id) => boxes.get(id)).filter(Boolean) as Rect[]) : onFocus.length ? union(onFocus) : bounds;
  const levels = s.layers.length || Math.max(1, ...all.map((b) => b.layer + 1));
  return { boxes: all, edges, bounds, camera: pad(cam, 12), layers: s.layers, bands: banded, levels, spread: s.spread, focus: focus < 0 ? null : focus, look: s.camera ? s.camera.map((id) => boxes.get(id)?.key).filter((k): k is number => k != null) : null, size: sz0, marks: [], sends: [], touched: [], families: s.families, phone: !!attrs.phone };
}
const top = (s: State, id: string): string => { let e = s.ents[id]; while (e?.parent) e = s.ents[e.parent]; return e?.id ?? id; };
export function union(rs: Rect[]): Rect {
  if (!rs.length) return { x: 0, y: 0, w: 100, h: 60 };
  const x = Math.min(...rs.map((r) => r.x)), y = Math.min(...rs.map((r) => r.y));
  return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y };
}
export const pad = (r: Rect, p: number): Rect => ({ x: r.x - p, y: r.y - p, w: r.w + 2 * p, h: r.h + 2 * p });
export const center = (r: Rect): Pt => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

// ---------------------------------------------------------------- what a step adds on top: sends, arrows, speech
// placed after the layout, where they cover no label and no shape; the renderers draw them where this puts them
export function decorate(f: Frame, fx: Fx | undefined, touchedIds: string[] = []): Frame {
  const byKey = new Map(f.boxes.map((b) => [b.key, b]));
  const byId = new Map(f.boxes.filter((b) => b.key > 0).map((b) => [b.id, b]));
  const labels: Rect[] = [...f.boxes.map((b) => b.lbl), ...f.edges.map((e) => e.lr)].filter((r): r is Rect => !!r);
  const shapes: Rect[] = f.boxes.filter((b) => !b.container && b.kind !== "text" && b.kind !== "token" && b.kind !== "pointer").map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }));
  const marks: Mark[] = [];
  const sends: SendGeom[] = [];
  const soft: Rect[] = f.boxes.filter((b) => b.container && b.key > 0).flatMap((b) => [{ x: b.x, y: b.y, w: b.w, h: 1 }, { x: b.x, y: b.y + b.h - 1, w: b.w, h: 1 }, { x: b.x, y: b.y, w: 1, h: b.h }, { x: b.x + b.w - 1, y: b.y, w: 1, h: b.h }]);
  const conn = new Set(f.edges.map((e) => `${e.from}>${e.to}`));
  const mark = (m: Omit<Mark, "dx" | "dy">) => { const a = byKey.get(m.at)!; const c = center(a); marks.push({ ...m, dx: m.r.x - c.x, dy: m.r.y - c.y }); labels.push(m.r); return marks.length - 1; };
  // every line on the stage: the connectors, then each send drawn as an arrow or a stream (a send over a connector
  // follows its bow; one with no connector bows around things by itself)
  const edgeBend = new Map<string, number>();
  for (const e of f.edges) { edgeBend.set(`${e.from}>${e.to}`, e.bend); if (!edgeBend.has(`${e.to}>${e.from}`)) edgeBend.set(`${e.to}>${e.from}`, -e.bend); }
  const lines: Pt[][] = f.edges.map((e) => { const a = byKey.get(e.from), b = byKey.get(e.to); return a && b ? sampleGeom(connGeom(a, b, a.kind, b.kind, e.implicit, 0, e.bend)) : []; });
  const plan = (fx?.sends ?? []).map((snd) => {
    const path = snd.path.filter((k) => byKey.has(k));
    if (path.length < 2) return null;
    // an arrow drawn over a connector sits beside it (to the right of its way), so a call and its reply do not overlap
    // extra: more bow than its connector's, when no side offset alone clears the words
    const extra = path.slice(1).map(() => 0);
    const offs = path.slice(1).map((k, i) => {
      if (snd.show === "token" || !(conn.has(`${path[i]}>${k}`) || conn.has(`${k}>${path[i]}`))) return 0;
      // beside the connector; further off, on whichever side is free, when a connector's chip or a word is in the way
      const a = byKey.get(path[i])!, b = byKey.get(k)!;
      const words = [...f.edges.map((x) => x.lr), ...f.boxes.filter((x) => x.key !== a.key && x.key !== b.key).map((x) => x.lbl)].filter((r): r is Rect => !!r);
      const eb = edgeBend.get(`${a.key}>${b.key}`) ?? 0;
      const things = shapes.filter((r) => !(r.x === a.x && r.y === a.y) && !(r.x === b.x && r.y === b.y));
      for (const x of [0, 25, -25, 45, -45, 70, -70, 100, -100]) for (const o of [7, -7, 12, -12, 17, -17, 23, -23]) { const pts = sampleGeom(connGeom(a, b, a.kind, b.kind, false, o, eb + x)); if (!words.some((r) => lineThrough(pts, r, 0)) && !things.some((r) => lineThrough(pts, r, -4))) { extra[i] = x; return o; } }
      return 7;
    });
    const bends = path.slice(1).map((k, i) => { const a = byKey.get(path[i])!, b = byKey.get(k)!; const eb = edgeBend.get(`${a.key}>${b.key}`); return eb != null ? eb + extra[i] : (snd.show === "token" ? 0 : chooseBend(a, b, f.boxes.filter((x) => x.lbl && x.key !== a.key && x.key !== b.key).map((x) => x.lbl!), offs[i], shapes.filter((r) => !(r.x === a.x && r.y === a.y) && !(r.x === b.x && r.y === b.y)))); });
    const geo = path.slice(1).map((k, i) => { const a = byKey.get(path[i])!, b = byKey.get(k)!; return connGeom(a, b, a.kind, b.kind, false, offs[i], bends[i]); });
    const own = snd.show === "token" ? [] : geo.map((g) => sampleGeom(g));
    lines.push(...own);
    return { snd, path, offs, bends, geo, own };
  });
  for (const pl of plan) {
    if (!pl) continue;
    const { snd, path, offs, bends, geo, own } = pl;
    const others = lines.filter((l) => !own.includes(l));
    const g: SendGeom = { show: snd.show, label: snd.label, cc: snd.family ? f.families.findIndex((c) => c.id === snd.family) + 1 : 0, path, offs, bends, chip: null, alabel: null, seg: 0, t: 0.5, ox: 0, oy: 0 };
    const last = geo[geo.length - 1], end = byKey.get(path[path.length - 1])!;
    if (snd.label && snd.show === "token") {
      // (a stream's and an arrow's label are placed below, by the middle of the path)
      // the token rests at its end, by the side it came in on; its chip sits next to it, off every label
      const text = cut(snd.label, CHIP.font, CHIP.maxW);
      const w = textW(text, CHIP.font) + 2 * CHIP.px, h = CHIP.h;
      const dot: Rect = { x: last.Q.x - 6, y: last.Q.y - 6, w: 12, h: 12 };
      const best = pick([...around(dot, w, h, ["up", "right", "down", "left"], 3), ...around(end, w, h, ["up", "down", "right", "left"])], labels, shapes, soft, lines);
      g.chip = mark({ kind: "send", at: end.key, text: snd.label, lines: [text], r: best.r, side: best.side });
    } else if (snd.label) {
      // an arrow's label sits by the middle of the arrow, beside it if the middle is taken
      const lines = wrapEven(snd.label, CHIP.font, chipOf(f.phone).edgeW, 2);
      const w = linesW(lines, CHIP.font) * 1.08 + 2 * CHIP.px, h = lines.length * CHIP.lh + 4; // its words are semi-bold: 8% wider
      const mid = Math.floor((geo.length - 1) / 2), gm = geo[mid];
      const cands: { r: Rect; t: number; ox: number; oy: number }[] = [];
      for (const t of [0.5, 0.38, 0.62, 0.3, 0.7]) for (const o of [h / 2 + 6, -(h / 2 + 6), 0, h + 10, -(h + 10)]) { const p = bezOff(gm, t, o), q = bezAt(gm, t); cands.push({ r: { x: p.x - w / 2, y: p.y - h / 2, w, h }, t, ox: p.x - q.x, oy: p.y - q.y }); }
      // then rings around the middle of the arrow, further and further out
      const q = bezAt(gm, 0.5);
      for (const rr of [w / 2 + 14, w / 2 + 34, w / 2 + 60, w / 2 + 90]) for (let k = 0; k < 12; k++) { const ox = Math.cos((k * Math.PI) / 6) * rr, oy = Math.sin((k * Math.PI) / 6) * rr * 0.6; cands.push({ r: { x: q.x + ox - w / 2, y: q.y + oy - h / 2, w, h }, t: 0.5, ox, oy }); }
      const best = pick(cands, labels, shapes, soft, others);
      g.seg = mid; g.t = best.t; g.ox = best.ox; g.oy = best.oy;
      g.alabel = mark({ kind: "alabel", at: path[mid + 1], text: snd.label, lines, r: best.r, side: "on" });
    }
    sends.push(g);
  }
  for (const sy of fx?.says ?? []) {
    const a = byKey.get(sy.key);
    if (!a) continue;
    const words = wrapEven(sy.text, CHIP.font + 0.5, chipOf(f.phone).sayW, 2);
    const w = linesW(words, CHIP.font + 0.5) + 22, h = words.length * CHIP.lh + 10;
    // then rings around the thing, further and further out
    const c = center(a), ring: { r: Rect; side: "up" | "down" | "left" | "right" }[] = [];
    for (const rr of [0.5, 0.75, 1.05, 1.4, 1.8]) for (let k = 0; k < 16; k++) { const ang = (k * Math.PI) / 8, ox = Math.cos(ang) * (a.w / 2 + w / 2 + 12) * rr * 1.4, oy = Math.sin(ang) * (a.h / 2 + h / 2 + 12) * rr * 1.6; ring.push({ r: { x: c.x + ox - w / 2, y: c.y + oy - h / 2, w, h }, side: Math.abs(ox) > Math.abs(oy) ? (ox > 0 ? "right" : "left") : oy > 0 ? "down" : "up" }); }
    const best = pick([...around(a, w, h, ["up", "down", "right", "left"], 9), ...ring], labels, shapes, soft, lines);
    mark({ kind: "say", at: a.key, text: sy.text, lines: words, r: best.r, side: best.side });
  }
  const touched = [...new Set(touchedIds.map((id) => byId.get(id)?.key).filter((k): k is number => k != null))];
  const bounds = marks.length ? union([f.bounds, ...marks.map((m) => m.r)]) : f.bounds;
  const camera = f.look == null && f.focus == null ? pad(bounds, 12) : f.camera;
  return { ...f, bounds, camera, marks, sends, touched };
}

// ---------------------------------------------------------------- the story camera, and the checks on it
// grow a rectangle to the stage's shape, so the camera never squashes the scene; never closer than about natural size
export function fitAspect(r: Rect, ar: number, min = 0): Rect {
  const c = center(r);
  let w = Math.max(r.w, min), h = Math.max(r.h, min * 0.5);
  if (w / h > ar) h = w / ar; else w = h * ar;
  return { x: c.x - w / 2, y: c.y - h / 2, w, h };
}
// what a step touches, with its words and its marks: the story camera always keeps it in frame
export function touchedRect(f: Frame): Rect | null {
  const set = new Set(f.touched);
  const rs: Rect[] = [];
  for (const b of f.boxes) if (set.has(b.key)) { rs.push(b); if (b.lbl) rs.push(b.lbl); }
  for (const m of f.marks) rs.push(m.r);
  for (const b of f.boxes) if ((b.kind === "token" || b.kind === "pointer") && b.ent.anchor && f.boxes.some((x) => x.id === b.ent.anchor && set.has(x.key))) rs.push(b);
  return rs.length ? union(rs) : null;
}
export const MARGIN = 16;
// the smallest type a frame draws, in stage units: labels, container and layer headings, chips, indexes, speech
export function minFont(f: Frame): number {
  const Z = tokens(f.phone);
  let m = CHIP.font;
  for (const b of f.boxes) {
    const z = Z[b.size] ?? Z.m;
    if (b.kind === "layer" || b.kind === "table" || (b.container && b.head && b.label)) m = Math.min(m, z.head);
    if (b.lines?.length && !b.container) m = Math.min(m, z.font);
  }
  return m;
}
// the least words a phone may show, in pixels on the screen, and the least scale that gives them
export const MIN_PX = 11;
export const phoneLeast = (f: Frame) => MIN_PX / minFont(f);
// the story's view of a step on a stage of shape ar, px pixels wide: what the author framed (camera, focus, else
// everything) plus what the step touches, with a margin. On a phone (under NARROW pixels) it is drawn no smaller than
// the scale at which its smallest words are MIN_PX on the screen (format version 8; 0.65 on a wider stage) when what
// the step touches still fits; the reader drags to see the rest
export function storyView(f: Frame, ar: number, px = 0): Rect {
  const t = touchedRect(f);
  const want = pad(t ? union([f.camera, t]) : f.camera, MARGIN);
  // never drawn larger than 1.5 times natural size, so a small scene does not fill the stage with huge words
  let v = fitAspect(want, ar, px ? Math.max(320 * 0.5, px / 1.5) : 320);
  // the least scale: on a phone, where the smallest words reach MIN_PX (small words are hard to read); 0.65 on a
  // wider stage (better to see it all)
  const least = px && px < NARROW ? Math.max(0.8, phoneLeast(f)) : 0.65;
  if (px && v.w > px / least) {
    const tv = t ? fitAspect(pad(t, MARGIN), ar) : null;
    const w = Math.max(px / least, tv?.w ?? 0);
    if (w < v.w) {
      const h = w / ar;
      const c = tv ? center(tv) : center(v);
      // as near the middle of the whole view as possible, with what the step touches inside
      const x = Math.min(Math.max(center(v).x - w / 2, tv ? tv.x + tv.w - w : -Infinity), tv ? tv.x : Infinity);
      const y = Math.min(Math.max(center(v).y - h / 2, tv ? tv.y + tv.h - h : -Infinity), tv ? tv.y : Infinity);
      v = { x: Number.isFinite(x) ? x : c.x - w / 2, y: Number.isFinite(y) ? y : c.y - h / 2, w, h };
    }
  }
  return v;
}
const inside = (r: Rect, v: Rect) => r.x >= v.x - 0.5 && r.y >= v.y - 0.5 && r.x + r.w <= v.x + v.w + 0.5 && r.y + r.h <= v.y + v.h + 0.5;
// in frame: each touched thing (with its words) and each mark is fully inside the view and outside every control
// (controls: rectangles in world units); returns how many there are and how many are in frame
export function inFrame(f: Frame, v: Rect, controls: Rect[] = []): { total: number; ok: number } {
  const set = new Set(f.touched);
  const rs: Rect[] = [];
  for (const b of f.boxes) if (set.has(b.key)) rs.push(b.lbl ? union([b, b.lbl]) : b);
  for (const m of f.marks) rs.push(m.r);
  const ok = rs.filter((r) => inside(r, v) && !controls.some((c) => hit(r, c))).length;
  return { total: rs.length, ok };
}
// the overlap check: each small thing (a token, a pointer, a sent token's chip, an arrow's label, speech) against
// every label and every shape on the stage
export function overlaps(f: Frame): { label: number; shape: number } {
  const smalls: Rect[] = [...f.boxes.filter((b) => b.kind === "token" || b.kind === "pointer"), ...f.marks.map((m) => m.r)];
  const labels: Rect[] = [...f.boxes.filter((b) => b.kind !== "token" && b.kind !== "pointer").map((b) => b.lbl), ...f.edges.map((e) => e.lr)].filter((r): r is Rect => !!r);
  const shapes: Rect[] = f.boxes.filter((b) => !b.container && !["text", "token", "pointer"].includes(b.kind));
  let label = 0, shape = 0;
  smalls.forEach((a, i) => {
    for (const l of labels) if (hit(a, l, -1)) label++;
    for (const b of smalls.slice(i + 1)) if (hit(a, b, -1)) label++;
    for (const sh of shapes) if (hit(a, sh, -1)) shape++;
  });
  return { label, shape };
}

// ---------------------------------------------------------------- lines over words
// the lines a frame draws: each connector, and each send drawn as an arrow or a stream, sampled along its curve.
// own: the line's own label (a connector's chip, an arrow's label), which sits on it by design
export interface Line { pts: Pt[]; own: Rect | null; send: boolean; ends: [number, number] }
export function frameLines(f: Frame): Line[] {
  const byKey = new Map(f.boxes.map((b) => [b.key, b]));
  const smp = (g: Geom, n = 72) => Array.from({ length: n + 1 }, (_, i) => bezAt(g, i / n));
  const out: Line[] = [];
  for (const e of f.edges) { const a = byKey.get(e.from), b = byKey.get(e.to); if (a && b) out.push({ pts: smp(connGeom(a, b, a.kind, b.kind, e.implicit, 0, e.bend)), own: e.lr, send: false, ends: [a.key, b.key] }); }
  for (const g of f.sends) {
    if (g.show === "token") continue;
    const own = g.alabel != null ? f.marks[g.alabel]?.r ?? null : null;
    for (let k = 0; k + 1 < g.path.length; k++) { const a = byKey.get(g.path[k]), b = byKey.get(g.path[k + 1]); if (a && b) out.push({ pts: smp(connGeom(a, b, a.kind, b.kind, false, g.offs[k], g.bends[k] ?? 0)), own, send: true, ends: [a.key, b.key] }); }
  }
  return out;
}
// does a polyline run through a rectangle (shrunk by m, so a line that only grazes an edge does not count)?
export function lineThrough(pts: Pt[], r: Rect, m = 1.5): boolean {
  const x0 = r.x + m, y0 = r.y + m, x1 = r.x + r.w - m, y1 = r.y + r.h - m;
  if (x1 <= x0 || y1 <= y0) return false;
  for (let i = 0; i + 1 < pts.length; i++) {
    const p = pts[i], q = pts[i + 1];
    let t0 = 0, t1 = 1;
    const dx = q.x - p.x, dy = q.y - p.y;
    const clip = (pp: number, qq: number) => { if (pp === 0) return qq >= 0; const t = qq / pp; if (pp < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; } return true; };
    if (clip(-dx, p.x - x0) && clip(dx, x1 - p.x) && clip(-dy, p.y - y0) && clip(dy, y1 - p.y) && t0 <= t1) return true;
  }
  return false;
}
// the words a line could cover: every label (a container's heading and a layer's name included), every connector
// chip, token chip, arrow label and speech. A thing's own words count too, except when the line ends at that thing
export function wordRects(f: Frame): { r: Rect; key: number | null }[] {
  return [
    ...f.boxes.filter((b) => b.lbl).map((b) => ({ r: b.lbl!, key: b.key })),
    ...f.edges.filter((e) => e.lr).map((e) => ({ r: e.lr!, key: null })),
    ...f.marks.map((m) => ({ r: m.r, key: null })),
  ];
}
export function lineCrossings(f: Frame): number {
  const words = wordRects(f);
  let n = 0;
  for (const ln of frameLines(f)) for (const w of words) {
    if (w.r === ln.own) continue;
    if (w.key != null && ln.ends.includes(w.key)) continue;
    if (lineThrough(ln.pts, w.r)) n++;
  }
  return n;
}

// lines through things: a connector or an arrow that runs across a shape it does not end at
export function linesThroughThings(f: Frame): number {
  const sh = f.boxes.filter((b) => !b.container && !["text", "token", "pointer"].includes(b.kind));
  let n = 0;
  for (const ln of frameLines(f)) for (const b of sh) if (!ln.ends.includes(b.key) && lineThrough(ln.pts, b, 1)) n++;
  return n;
}

// a tree: each node centred over its children; in a binary tree (left/right) an empty side keeps its room
function treeLayout(s: State, kids: string[], size: Map<string, [number, number]>, set: (k: string, x: number, y: number) => void): [number, number] {
  const GAP = 16, LEVEL = 46;
  const ch = (id: string | null) => kids.filter((k) => (s.ents[k].under ?? null) === id);
  const binary = kids.some((k) => s.ents[k].side);
  const width = new Map<string, number>();
  const sub = (id: string): number => {
    const [w] = size.get(id)!;
    const c = ch(id);
    let total: number;
    if (binary) { const l = c.find((k) => s.ents[k].side === "left"), r = c.find((k) => s.ents[k].side === "right"); const lw = l ? sub(l) : w / 2, rw = r ? sub(r) : w / 2; total = Math.max(w, lw + GAP + rw); width.set(id + ":l", lw); }
    else total = Math.max(w, c.reduce((a, k) => a + sub(k) + GAP, -GAP));
    width.set(id, total);
    return total;
  };
  let maxY = 0;
  const put = (id: string, x0: number, y: number) => {
    const [w, h] = size.get(id)!;
    const c = ch(id), total = width.get(id)!;
    maxY = Math.max(maxY, y + h);
    if (binary) {
      const lw = width.get(id + ":l")!;
      const rw = total - lw - GAP;
      const cxm = w > lw + GAP + rw ? x0 + w / 2 : x0 + lw + GAP / 2;
      set(id, cxm - w / 2, y);
      const l = c.find((k) => s.ents[k].side === "left"), r = c.find((k) => s.ents[k].side === "right");
      if (l) put(l, cxm - GAP / 2 - width.get(l)!, y + h + LEVEL);
      if (r) put(r, cxm + GAP / 2, y + h + LEVEL);
      return;
    }
    set(id, x0 + (total - w) / 2, y);
    const cw = c.reduce((a, k) => a + width.get(k)! + GAP, -GAP);
    let x = x0 + (total - cw) / 2;
    for (const k of c) { put(k, x, y + h + LEVEL); x += width.get(k)! + GAP; }
  };
  let x = 0;
  const roots = ch(null);
  for (const r of roots) { sub(r); put(r, x, 0); x += width.get(r)! + GAP * 2; }
  // nodes that hang under something not in the tree go in a row below (doccheck refuses these anyway)
  return [Math.max(0, x - GAP * 2), maxY];
}

// a graph: layers by the longest path along connectors (left to right, or top to bottom), then ordered to cut crossings
function graphLayout(s: State, kids: string[], size: Map<string, [number, number]>, set: (k: string, x: number, y: number) => void, dir: string, gap: number, links: [string, string][], room = 0): [number, number] {
  // a label sits beside a vertical arrow and across a horizontal one: leave it room
  const LAYER = dir === "down" ? Math.max(50, Math.min(90, room ? 2 * CHIP.lh + 30 : 0)) : Math.max(84, Math.min(CHIP.edgeW + 50, room + 40));
  const idx = new Map(kids.map((k, i) => [k, i]));
  // a connector between anything inside two children counts as an edge between the two children
  const owner = (id: string): string | null => { let e = s.ents[id]; while (e) { if (idx.has(e.id)) return e.id; e = e.parent ? s.ents[e.parent] : (undefined as any); } return null; };
  const out = new Map<string, Set<string>>(kids.map((k) => [k, new Set()]));
  for (const [x, y] of links) { const a = owner(x), b = owner(y); if (a && b && a !== b) out.get(a)!.add(b); }
  // drop the edges that close a loop (depth-first, in the order the author wrote things)
  const state = new Map<string, number>(); const back = new Set<string>();
  const dfs = (u: string) => { state.set(u, 1); for (const v of out.get(u)!) { if (state.get(v) === 1) back.add(`${u}>${v}`); else if (!state.get(v)) dfs(v); } state.set(u, 2); };
  for (const k of kids) if (!state.get(k)) dfs(k);
  const layer = new Map<string, number>();
  const lay = (u: string): number => { if (layer.has(u)) return layer.get(u)!; layer.set(u, 0); let L = 0; for (const k of kids) if (out.get(k)!.has(u) && !back.has(`${k}>${u}`)) L = Math.max(L, lay(k) + 1); layer.set(u, L); return L; };
  kids.forEach(lay);
  const nL = Math.max(...layer.values()) + 1;
  const layers: string[][] = Array.from({ length: nL }, () => []);
  for (const k of kids) layers[layer.get(k)!].push(k);
  // order: two sweeps of the barycentre of each node's neighbours in the layer before
  const pos = new Map<string, number>();
  const setPos = () => layers.forEach((l) => l.forEach((k, i) => pos.set(k, i)));
  setPos();
  for (let sweep = 0; sweep < 2; sweep++) {
    for (let L = 1; L < nL; L++) {
      const bc = (k: string) => { const ps = kids.filter((p) => layer.get(p) === L - 1 && out.get(p)!.has(k)); return ps.length ? ps.reduce((a, p) => a + pos.get(p)!, 0) / ps.length : pos.get(k)!; };
      layers[L].sort((a, b) => bc(a) - bc(b) || idx.get(a)! - idx.get(b)!);
      setPos();
    }
  }
  const across = (k: string) => (dir === "down" ? size.get(k)![0] : size.get(k)![1]);
  const along = (k: string) => (dir === "down" ? size.get(k)![1] : size.get(k)![0]);
  const span = layers.map((l) => l.reduce((a, k) => a + across(k) + gap, -gap));
  const maxSpan = Math.max(...span);
  let at = 0;
  layers.forEach((l, L) => {
    const thick = Math.max(...l.map(along));
    let c = (maxSpan - span[L]) / 2;
    for (const k of l) {
      const off = (thick - along(k)) / 2;
      if (dir === "down") set(k, c, at + off); else set(k, at + off, c);
      c += across(k) + gap;
    }
    at += thick + LAYER;
  });
  at -= LAYER;
  return dir === "down" ? [maxSpan, at] : [at, maxSpan];
}

// ---------------------------------------------------------------- everything at once, for doccheck, the LLM view and the renderer
// warnings: what doccheck says but does not refuse (a token's label too long for its chip)
export interface Compiled { scene: Scene; frames: Frame[]; fx: Fx[]; errors: SceneError[]; warnings: SceneError[]; aspect: number }
export const TOKEN_CHARS = 18;
// below this stage width (pixels) a wide scene (more than 1.4 wide per unit of height) is drawn with its narrow layout
export const NARROW = 480;
export const useNarrow = (c: Compiled, px: number) => px > 0 && px < NARROW && c.aspect > 1.4;
// what a phone stage (under NARROW pixels) draws: the phone's tokens, and the narrow layout when the scene is wide
export const phoneInfo = (wide: Compiled, info: Record<string, string>, px: number): Record<string, string> => ({ ...info, phone: "1", ...(useNarrow(wide, px) ? { narrow: "1" } : {}) });
export function compileScene(head: string, steps: { title: string; raw: string; line: number }[], base: number, info: Record<string, string> = {}): Compiled {
  const { scene, errors } = parseScene(head, steps, base, info);
  const r = play(scene);
  errors.push(...r.errors);
  const story: [string, string][] = [];
  for (const st of r.states) for (const c of st.conns) if (!story.some(([a, b]) => a === c.from && b === c.to)) story.push([c.from, c.to]);
  // one size per thing for the whole story: lay out every step, keep each thing's largest size, lay out again until
  // nothing grows (a lift that fills with people, or moves to another floor, keeps its size; so does its floor)
  const labelsOf = [...scene.setup, ...scene.steps.flatMap((st) => st.ops)].flatMap((o) => (o.op === "conn" ? [o.label] : o.op === "send" && o.show !== "token" ? [o.label] : []));
  const room = Math.max(0, ...labelsOf.filter(Boolean).map((l) => Math.max(...wrapEven(l, CHIP.font, chipOf(scene.attrs.phone).edgeW, 2).map((x) => textW(x, CHIP.font))) + 2 * CHIP.px));
  let keep = new Map<string, [number, number]>();
  let frames: Frame[] = [];
  for (let pass = 0; pass < 6; pass++) {
    frames = r.states.map((st) => layoutState(st, { ...scene.attrs, room }, story, keep));
    let grew = false;
    const next = new Map(keep);
    for (const f of frames) for (const b of f.boxes) {
      if (b.key < 0 || b.kind === "token" || b.kind === "pointer" || b.kind === "row") continue;
      const k = `${b.kind}:${b.id}`, o = next.get(k);
      if (!o || b.w > o[0] + 0.5 || b.h > o[1] + 0.5) { next.set(k, [Math.max(b.w, o?.[0] ?? 0), Math.max(b.h, o?.[1] ?? 0)]); grew = true; }
    }
    keep = next;
    if (!grew) break;
  }
  const deco = (fs: Frame[]) => fs.map((f, i) => decorate(f, r.fx[i], r.fx[i]?.touched ?? []));
  frames = deco(frames);
  // each container's heading slides along its top (left, right, middle ...) to where no line in the whole story
  // crosses it; the same place on every step, so it never jumps
  const heads = new Map<string, number>();
  const lineSets = frames.map((f) => frameLines(f));
  const ids = [...new Set(frames.flatMap((f) => f.boxes.filter((b) => b.container && b.key > 0 && b.head && b.lbl).map((b) => b.id)))];
  for (const id of ids) {
    let best = 0, bestN = Infinity;
    for (const frac of [0, 1, 0.5, 0.25, 0.75]) {
      let n = 0;
      frames.forEach((f, i) => {
        const b = f.boxes.find((x) => x.id === id && x.container && x.key > 0);
        if (!b?.lbl) return;
        const z = tokens(scene.attrs.phone)[b.size], rr = { ...b.lbl, x: b.x + z.pad + frac * Math.max(0, b.w - 2 * z.pad - b.lbl.w) };
        for (const ln of lineSets[i]) if (!ln.ends.includes(b.key) && lineThrough(ln.pts, rr)) n++;
      });
      if (n < bestN) { bestN = n; best = frac; }
      if (n === 0) break;
    }
    if (best) heads.set(id, best);
  }
  frames = deco(r.states.map((st) => layoutState(st, { ...scene.attrs, room }, story, keep, heads)));
  // one stage size for every step, so the buttons never move: the shape of everything the story ever shows
  const all = union(frames.map((f) => f.bounds));
  // a scene with layers, or one that opens in 3D, gets a taller stage (at most 1.5 wide per unit of height): in 3D its layers stack upward
  const layered = scene.attrs.view === "3d" || frames.some((f) => f.layers.length);
  // the narrow (phone) layout may be taller than wide: down to 0.62 wide per unit of height
  const aspect = Math.min(layered ? 1.5 : 2.4, Math.max(scene.attrs.narrow ? 0.62 : 1.25, all.w / Math.max(all.h, 1)));
  // an entity off-stage (a tree node whose parent is not in the tree) is caught here
  for (const [i, st] of r.states.entries()) for (const e of Object.values(st.ents)) if (e.under && !st.ents[e.under]) errors.push({ line: scene.steps[i].line, msg: `${e.id} hangs under ${e.under}, which is gone` });
  // a token's chip is small: a long label is cut on the stage; say it in the caption or a note, or send an arrow
  const warnings: SceneError[] = [];
  const longTok = (label: string, line: number, what: string) => { if ([...label].length > TOKEN_CHARS) warnings.push({ line, msg: `${what} "${label}" is ${[...label].length} characters; a token shows at most about ${TOKEN_CHARS}, so the stage cuts it. Put the detail in the caption or a note, or write send arrow "..." (an arrow's label may be longer)` }); };
  for (const op of [...scene.setup, ...scene.steps.flatMap((s) => s.ops)]) {
    if (op.op === "send" && op.show === "token" && op.label) longTok(op.label, op.line, "the token's label");
    if (op.op === "add" && op.decl.kind === "token" && op.decl.label) longTok(op.decl.label, op.line, `token ${op.decl.id}`);
  }
  return { scene, frames, fx: r.fx, errors: dedupe(errors), warnings: dedupe(warnings), aspect };
}
const dedupe = (es: SceneError[]) => { const seen = new Set<string>(); return es.filter((e) => { const k = `${e.line}:${e.msg}`; if (seen.has(k)) return false; seen.add(k); return true; }); };

// ---------------------------------------------------------------- the LLM view: the entity list, short, then the captions
// each step's movements follow its caption as "a -> b: label", whether the page shows a token, an arrow or both
export function sceneLlm(c: Compiled): string {
  const first = play({ ...c.scene, steps: [{ caption: "", line: 0, ops: [] }] }).states[0];
  const lines: string[] = [];
  const name = (e: Ent) => (e.label && e.label !== e.id ? `${e.kind} ${e.id} "${e.label}"` : `${e.kind} ${e.id}`);
  const desc = (id: string): string => {
    const e = first.ents[id];
    if (["array", "list", "stack", "queue"].includes(e.kind)) return `${e.kind} ${e.id}${e.label ? ` "${e.label}"` : ""}${e.kind === "queue" && e.kids.length ? " (front first)" : e.kind === "stack" && e.kids.length ? " (top first)" : ""}: ${(e.kind === "stack" ? [...e.kids].reverse() : e.kids).map((k) => first.ents[k].label).join(", ") || "empty"}`;
    if (e.kind === "table" || e.kind === "row") return `${e.kind} ${e.id}: ${(e.cells ?? []).join(", ")}`;
    if (e.kind === "buckets") return `buckets ${e.id}${e.label ? ` "${e.label}"` : ""} (${e.kids.length})${e.kids.some((k) => first.ents[k].kids.length) ? ` [${e.kids.filter((k) => first.ents[k].kids.length).map((k) => `${k}: ${first.ents[k].kids.map((x) => first.ents[x].label).join(", ")}`).join("; ")}]` : ""}`;
    const kids = e.kids.map(desc);
    return `${name(e)}${e.anchor ? ` at ${e.anchor}` : ""}${e.under ? ` under ${e.under}${e.side ? ` ${e.side}` : ""}` : ""}${kids.length ? ` [${kids.join(", ")}]` : ""}`;
  };
  const roots = [...first.root, ...Object.values(first.ents).filter((e) => e.anchor).map((e) => e.id)];
  if (roots.length) lines.push(`Starts with: ${roots.map(desc).join("; ")}.`);
  if (first.conns.length) lines.push(`Connected: ${first.conns.map((x) => `${x.from} ${x.style} ${x.to}${x.label ? ` "${x.label}"` : ""}`).join(", ")}.`);
  if (first.layers.length) {
    const on = (L: number) => Object.values(first.ents).filter((e) => !e.anchor && e.kind !== "row" && !(e.parent && first.ents[e.parent] && layerIndex(first, e.parent) === L) && layerIndex(first, e.id) === L).map((e) => e.id);
    lines.push(`Layers, top to bottom: ${first.layers.map((l, L) => `${l.id}${l.label !== l.id ? ` "${l.label}"` : ""}${on(L).length ? ` (${on(L).join(", ")})` : ""}`).join("; ")}.`);
  }
  if (first.families.length) {
    const of = (id: string) => [...Object.values(first.ents).filter((e) => e.family === id).map((e) => e.id), ...first.conns.filter((x) => x.family === id).map((x) => `${x.from} -> ${x.to}`)];
    lines.push(`Families, one colour each: ${first.families.map((k) => `${k.id}${k.label !== k.id ? ` "${k.label}"` : ""}${of(k.id).length ? ` (${of(k.id).join(", ")})` : ""}`).join("; ")}.`);
  }
  const moves = (s: SceneStep) => s.ops.filter((o): o is Extract<Op, { op: "send" }> => o.op === "send").map((o) => `\n   ${o.path.join(" -> ")}${o.label ? `: ${o.label}` : ""}`).join("");
  return `Animation, ${c.scene.steps.length} steps. ${lines.join(" ")}\n\n${c.scene.steps.map((s, i) => `${i + 1}. ${s.caption}${moves(s)}`).join("\n")}`;
}
