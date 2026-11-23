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
// Version 9 adds the story words (tools/story.ts): a token splits into pieces and merges back, waits in a container,
// is dropped; several things move together; a closed thing shows its inside when the story zooms into it.
import { MAX_PIECES, piecesOf, moveToken, splitToken, mergeTokens, applyStory, stepChecks, hiddenBy, openSet, llmLines, type Ctx } from "./story";
import { recordFields, recordLayout, fieldFont, fieldText, fieldLlm, parseField, RECORD_AS, type Field } from "./record";
import { endsOf, glyphRect, glyphOf, markAt, END_CLEAR, type Ends } from "./line-ends";
// format version 10 (tools/depth.ts): 3D-only scenes, nested zooms, closed=hidden, lift and put back, the 3D labels rule
import { liftOp, putBackOp, depthChecks, onlyChecks, applyDepth, stepPart, depthLlm, LABELS, type DepthState, type DepthFx } from "./depth";

// ---------------------------------------------------------------- the vocabulary (SPEC.md section 6)
import { parseCamera, CLOSE_SCALE, FAR_GROW, type CamView } from "./camera";
import { sideOk, PORT_GAP, facing, routeGeom, pieceAt, routeLine, routeAll, routable, placed, bestRoute, flipRoute, meet, sideRoom, wallRect, wiggles, FAN, type Route, type Placed, type Req } from "./route";
// format version 10: a scene inside a scene (tools/scenes.ts), and maps, get and put (tools/data.ts)
import { splitScenes, compileNested, nestedLlm, type SubScene, type Nest } from "./scenes";
import { mapEntries, mapOps, markMap, applyPut, applyGet, dataChecks, mapDesc, dataLlm } from "./data";
import { chipW } from "./chipw";
import { narrowWins, storyFocus, leastScale } from "./readable";
import { slideWhole } from "./edge10";
// the layout work of a compile is counted and charged to the animation's budget (core/work.ts)
import { work, metered, animPartBudget } from "./work";
import { hasMarks, lineRuns, plain, unclosedTick } from "./inline";
export const SHAPES = ["box", "circle", "pill", "cylinder", "cloud", "person", "diamond", "text", "dot", "initial", "final"] as const;
export const CONTAINERS = ["group", "array", "list", "stack", "queue", "tree", "graph", "grid", "buckets", "table", "record"] as const;
export const OVERLAYS = ["token", "pointer"] as const;
export const KINDS = [...SHAPES, ...CONTAINERS, ...OVERLAYS, "row", "map"] as const;
export const LAYOUTS = ["row", "column", "grid", "tree", "graph", "free"] as const;
export const TONES = ["plain", "acc", "good", "warn", "hot", "muted"] as const;
export const ARROWS = ["->", "-->", "--", "<->"] as const;
export const OPS = ["add", "remove", "move", "swap", "set", "highlight", "say", "note", "send", "push", "pop", "split", "merge", "camera", "focus", "spotlight", "zoom", "drop", "lift", "enter", "leave", "put", "get"] as const;
// format version 9: the author's control of motion. In a step, a line "then" starts the next beat: the changes after it
// start when the ones before it end. "pace slow" or "pace fast" sets the step's speed. "spotlight <id> ..." dims
// everything else for this step. "say <id> above: text" (or below, left, right) says where the speech goes.
// "move <id> to <c> path=arc" travels on an arc instead of straight
export const PACES = ["slow", "normal", "fast"] as const;
export const SIDES = ["above", "below", "left", "right"] as const;
export const PATHS = ["straight", "arc"] as const;
export const MAX_BEATS = 6;
// the layer words (format version 5): "layer" declares one in the setup; "split layers", "stack layers" and "focus" change the view
export const LAYER_OPS = ["split layers", "stack layers", "focus <layer>", "focus all"] as const;
const SETUP_OPS = ["note", "push", "camera", "set", "focus"];
const DECL_KEYS = ["tone", "dim", "down", "layout", "dir", "cols", "pos", "count", "note", "layer", "size", "is", "level", "fill", "closed", "buckets", "as"];
const CONN_KEYS = ["is", "start", "end", "start-label", "end-label", "also"];
const SET_KEYS = ["label", "tone", "dim", "down", "layout", "dir", "cols", "layer", "size", "is", "level", "fill", "closed"];
// fill (format version 7): a family's thing has its family's border; its soft fill is on (soft, the default) or off (none),
// per scene (```animation fill=none) or per thing (fill=none). Words stay in ink either way
export const FILLS = ["soft", "none"] as const;
// level=0..100: a meter inside a thing (load, a queue's depth, progress); set level= moves it
// the room a meter takes at the bottom of a thing, and its bar's height (format version 10 fix: 7, was 4, read as a line)
export const METER_ROOM = 12, METER_H = 7;
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
export interface Decl { kind: string; id: string; label: string | null; parent: string | null; under: string | null; side: "left" | "right" | null; place: Place; anchor: string | null; kv: Record<string, string>; values: string[] | null; fields?: { id: string; field: Field }[]; }
export type Op =
  | { op: "add"; decl: Decl; line: number }
  // format version 11: ends (a mark or a word at an end); also: a second line beside one there, or a loop
  | { op: "conn"; chain: string[]; styles: string[]; label: string; is: string | null; line: number; ends?: Ends; also?: true }
  | { op: "remove"; ids: string[]; conns: [string, string][]; line: number }
  // ids: several things that move together (one hop); into: a token goes into a container instead of sitting at it
  | { op: "move"; id: string; to: string; place: Place; under: string | null; side: "left" | "right" | null; path?: string; line: number; ids?: string[]; into?: boolean }
  | { op: "swap"; a: string; b: string; line: number }
  | { op: "set"; id: string; kv: Record<string, string>; line: number }
  | { op: "highlight"; ids: string[]; tone: string; line: number }
  | { op: "say"; id: string; text: string; at?: string; line: number }
  | { op: "spotlight"; ids: string[]; line: number }
  | { op: "note"; id: string; text: string; line: number }
  | { op: "send"; label: string; path: string[]; show: string; is: string | null; line: number; as?: string | null }
  | { op: "push"; s: string; label: string; as: string | null; line: number }
  | { op: "pop"; s: string; to: string | null; line: number }
  | { op: "split"; id: string; into: { id: string; label: string | null }[]; line: number }
  | { op: "merge"; ids: string[]; into: { id: string; label: string | null }; line: number }
  | { op: "camera"; ids: string[] | null; view: CamView; line: number }
  | { op: "layer"; id: string; label: string | null; note: string; line: number }
  | { op: "family"; id: string; label: string | null; line: number }
  | { op: "layers"; mode: "split" | "stack"; line: number }
  | { op: "focus"; layer: string | null; line: number }
  // format version 9 (tools/story.ts): zoom into a thing's inside (id) or out (null); drop a token (lost), at a thing it
  // travels to; join: the pieces of a split token become it again (merge msg)
  | { op: "zoom"; id: string | null; line: number; ids?: string[]; all?: boolean }
  // format version 10 (tools/depth.ts, 3D only): lift things out of their boxes; put them back (ids null: all)
  | { op: "lift"; ids: string[]; line: number }
  | { op: "putback"; ids: string[] | null; line: number }
  | { op: "drop"; ids: string[]; at: string | null; line: number }
  | { op: "join"; id: string; line: number }
  // format version 10: enter a scene inside the scene from a thing, leave it (tools/scenes.ts); put and get on a map
  // or an array (tools/data.ts)
  | { op: "enter"; id: string; from: string; line: number }
  | { op: "leave"; id: string | null; line: number }
  | { op: "put"; m: string; key: string; value: string; line: number }
  | { op: "get"; m: string; key: string; line: number };
// beat: for each op, the beat it is in (0, then 1 after a "then" line ...); beats: how many; pace: slow, normal or fast
export interface SceneStep { caption: string; line: number; ops: Op[]; beat?: number[]; beats?: number; pace?: string }
// narrow: the phone layout (the renderer asks for it on a stage under NARROW pixels): the stage's own row or
// left-to-right graph runs top to bottom instead, so a wide scene is not drawn tiny
// phone: the phone's spacing (PHONE: the same type sizes, tighter padding, gaps and wrap widths), so more of a scene
// fits a phone at a size where its words stay readable; the narrow layout always uses it
// only3d (format version 10): the scene has no flat form; labels: the 3D labels rule, part (default) or all
export interface Scene { attrs: { layout: string; dir: string; view: string; size: string; fill?: string; narrow?: boolean; phone?: boolean; only3d?: boolean; still?: boolean; fit?: number; entered?: boolean; apart?: boolean; labels?: string }; setup: Op[]; steps: SceneStep[]; texts: string[]; subs?: SubScene[] }

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
  if (info.pace && !(PACES as readonly string[]).includes(info.pace)) errors.push({ line: base - 1, msg: `pace=${info.pace}: pace is slow, normal or fast` });
  // format version 10: ```animation 3d only (no flat form); labels=all keeps every label in 3D while a step plays
  if (info.only) { if (info.only === "3d" && (info.view ?? "3d") === "3d") { scene.attrs.only3d = true; scene.attrs.view = "3d"; } else errors.push({ line: base - 1, msg: `only goes after 3d: \`\`\`animation 3d only (a scene without it can always be opened flat or in 3D)` }); }
  if (info.labels) { if ((LABELS as readonly string[]).includes(info.labels)) scene.attrs.labels = info.labels; else errors.push({ line: base - 1, msg: `labels=${info.labels}: labels is part (the default: in 3D, while a step plays, only who takes part shows a label) or all` }); }
  // format version 11 (tools/whole.ts): the room a rank may take in the layout that shows a scene whole
  if (info.fit && +info.fit > 0) scene.attrs.fit = +info.fit;
  // format version 11: a state machine's groups leave their middle free, for the lines that come in from above
  if (info.entered) scene.attrs.entered = true;
  // and a class or ER diagram lays out each group of joined things on its own
  if (info.apart) scene.attrs.apart = true;
  if (info.kind) errors.push({ line: base - 1, msg: `animation kinds are gone since format version 4 (got "${info.kind}"): write \`\`\`animation (or \`\`\`animation 3d), then entities and steps (SPEC.md section 6)` });
  const read = (text: string, line: number, setup: boolean, into: Op[]) => {
    const t = text.trim();
    if (!t || t.startsWith("//")) return;
    try { const op = parseLine(t, line, setup, scene.texts); if (op) into.push(op); } catch (e) { errors.push({ line, msg: (e as Error).message }); }
  };
  // format version 10: the setup's scene blocks (scene <id> "label" ... end) are scenes of their own (tools/scenes.ts)
  const nest = splitScenes(head, base, errors);
  nest.main.forEach(([l, ln]) => read(l, ln, true, scene.setup));
  for (const sb of nest.subs) { const setup: Op[] = []; sb.lines.forEach(([l, ln]) => read(l, ln, true, setup)); if (sb.label) scene.texts.push(sb.label); (scene.subs ??= []).push({ id: sb.id, label: sb.label, line: sb.line, attrs: sb.attrs, setup }); }
  for (const s of steps) {
    if (!s.title) errors.push({ line: s.line, msg: "@step needs a caption: the sentence a reader sees for this step" });
    else scene.texts.push(s.title);
    const ops: Op[] = [], beat: number[] = [];
    let b = 0, pace = "normal", thenLine = 0;
    s.raw.split("\n").forEach((l, i) => {
      const ln = s.line + 1 + i, x = l.trim();
      if (x === "then") {
        if (!ops.length || beat[beat.length - 1] !== b) errors.push({ line: ln, msg: "then starts the next beat of a step: put at least one change before it, and one after it" });
        else if (b + 1 >= MAX_BEATS) errors.push({ line: ln, msg: `a step has at most ${MAX_BEATS} beats; split it into steps, each with its own caption` });
        else { b++; thenLine = ln; }
        return;
      }
      const pm = x.match(/^pace\b\s*(.*)$/);
      if (pm) {
        if (!(PACES as readonly string[]).includes(pm[1])) errors.push({ line: ln, msg: `pace is slow, normal or fast: pace slow` });
        else pace = pm[1];
        return;
      }
      const before = ops.length;
      read(l, ln, false, ops);
      for (let k = before; k < ops.length; k++) beat.push(b);
    });
    if (b > 0 && beat[beat.length - 1] !== b) errors.push({ line: thenLine, msg: "then starts the next beat of a step: put at least one change after it" });
    scene.steps.push({ caption: s.title, line: s.line, ops, beat, beats: b + 1, pace });
  }
  // format version 11: no @step at all is a still scene: the setup, drawn once
  if (!steps.length && !scene.subs?.length) {
    scene.attrs.still = true;
    if (!scene.setup.some((o) => o.op === "add") && !errors.length) errors.push({ line: base - 1, msg: 'a still scene needs something to draw: box api "API", or add 2 or more @step lines for a story' });
  } else if (steps.length < 2) errors.push({ line: base - 1, msg: "an animation needs at least 2 @step lines (or none, for a still scene)" });
  // inline marks (SPEC 6.15): code in a caption, speech or a note opens and closes
  const ticks = (text: string, line: number, what: string) => { if (text && unclosedTick(text)) errors.push({ line, msg: `${what} has a backtick that is not closed: write \`code\` with one before and one after` }); };
  for (const st of steps) ticks(st.title, st.line, "this caption");
  for (const op of [...scene.setup, ...(scene.subs ?? []).flatMap((x) => x.setup), ...scene.steps.flatMap((x) => x.ops)]) {
    if (op.op === "say") ticks(op.text, op.line, `say ${op.id}`);
    else if (op.op === "note") ticks(op.text, op.line, `note ${op.id}`);
    else if (op.op === "layer") ticks(op.note, op.line, `layer ${op.id}'s note`);
    else if (op.op === "add" && op.decl.kv.note) ticks(op.decl.kv.note, op.line, `${op.decl.id}'s note`);
  }
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
  if (w0 === "scene" || w0 === "end") throw new Error(setup ? `"${w0}" here: a scene is declared in the overview's setup, not inside another scene (scene <id> "label", its lines, then end); one scene enters another with enter` : `a scene is declared in the setup, before the first @step: scene <id> "label", its lines, then end; a step enters it with enter <id> from <thing>`);
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
      // move <id> [<id> ...] to|into <id> [under <id> [left|right]] [after <id>|before <id>|first]
      // several ids move together, as one hop (format version 9); a token goes "into" a container, or sits "at" a thing with "to"
      const w = words, k = w.findIndex((x) => x === "to" || x === "into");
      if (k < 1 || !w[k + 1]) throw new Error("move needs: move <id> to <container or anchor> (several move together: move a b to c)");
      const ids = w.slice(0, k);
      const dup = ids.find((x, j) => ids.indexOf(x) !== j);
      if (dup) throw new Error(`move names ${dup} twice`);
      const { place, under, side } = clauses(w.slice(k + 2));
      noTail();
      for (const kk of Object.keys(kv)) if (kk !== "path") throw new Error(`move: unknown key "${kk}" (move takes path=arc or path=straight)`);
      if (kv.path && !(PATHS as readonly string[]).includes(kv.path)) throw new Error(`path=${kv.path}: a move's path is straight (the default) or arc`);
      return { op: "move", id: ids[0], ...(ids.length > 1 ? { ids } : {}), ...(w[k] === "into" ? { into: true } : {}), to: w[k + 1], place, under, side, ...(kv.path ? { path: kv.path } : {}), line };
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
    case "say": {
      need(1, "an id and a text: say db: 3 rows"); if (!tail) throw new Error("say needs a text after a colon: say db: 3 rows");
      if (words.length > 2 || (words[1] && !(SIDES as readonly string[]).includes(words[1]))) throw new Error(`say takes an id, then where (above, below, left or right) if you want one: say db above: 3 rows`);
      texts.push(tail); return { op: "say", id: words[0], text: tail, ...(words[1] ? { at: words[1] } : {}), line };
    }
    case "spotlight": need(1, "one id or more: spotlight db cache"); noTail(); return { op: "spotlight", ids: words, line };
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
      // send ... as <id> (format version 9): the token stays where it arrives, as a token entity later lines can move
      let as: string | null = null;
      const ai = rest.findIndex((x, j) => x.t === "word" && x.v === "as" && j > 0 && rest[j - 1].t === "word" && rest[j - 2]?.t === "arrow");
      if (ai >= 0) {
        if (ai !== rest.length - 2 || rest[ai + 1].t !== "word" || !ID_RE.test(rest[ai + 1].v)) throw new Error(`"as <id>" comes last and names the token: send "msg" a -> b as m`);
        as = rest[ai + 1].v; rest = rest.slice(0, ai);
      }
      const show = rest[0]?.t === "word" && (SEND_SHOWS as readonly string[]).includes(rest[0].v) && rest[1] && rest[1].t !== "arrow" ? rest.shift()!.v : "token";
      const label = rest[0]?.t === "str" ? rest.shift()!.v : "";
      const path: string[] = [];
      rest.forEach((x, i) => { if (i % 2 === 0) { if (x.t !== "word") throw new Error(`send: expected an id, got "${x.v}"`); path.push(x.v); } else if (x.v !== "->") throw new Error(`send goes along "->": send "label" a -> b -> c`); });
      if (path.length < 2) throw new Error(`send needs a path: send "label" a -> b (or send arrow "label" a -> b, send both ...)`);
      // one hop per step (format version 7): a request that goes a -> b -> c in one step is hard to follow; each hop is
      // its own step, with its own caption. A stream is a steady flow, not one request: it may run a longer path
      if (path.length > 2 && show !== "stream") throw new Error(`one hop per step: "${path.join(" -> ")}" moves ${path.length - 1} hops at once; send ${path[0]} -> ${path[1]} in this step, and ${path[1]} -> ${path[2]} in a step of its own with its own caption`);
      noTail(); if (label) texts.push(label);
      if (as && (show === "arrow" || show === "stream")) throw new Error(`send ${show} leaves no token behind; "as ${as}" works with a token: send "${label || "msg"}" ${path.join(" -> ")} as ${as}`);
      return { op: "send", label, path, show, is: isKv[0]?.v ?? null, line, ...(as ? { as } : {}) };
    }
    case "split": case "merge": {
      // split a into b ["label"] c ["label"];  merge a b into c ["label"]
      const i = rest.findIndex((x) => x.t === "word" && x.v === "into");
      // merge <token> (format version 9): the pieces of a split token become it again
      if (i < 0 && w0 === "merge" && rest.length === 1 && rest[0].t === "word") { noTail(); return { op: "join", id: rest[0].v, line }; }
      if (i < 0) throw new Error(w0 === "split" ? `split needs: split <id> into <id> ["label"] <id> ["label"], or split <token> into 4 ["label"]` : `merge needs: merge <id> <id> into <id> ["label"], or merge <token> (its pieces become it again)`);
      const before = rest.slice(0, i).filter((x) => x.t === "word").map((x) => x.v);
      // split <id> into <n> ["label"] (format version 9): n pieces, <id>.1 ... <id>.n, labelled "label 1" ... (or "1/n" ...)
      if (w0 === "split" && rest[i + 1]?.t === "word" && /^\d+$/.test(rest[i + 1].v)) {
        const lab = rest[i + 2]?.t === "str" ? rest[i + 2].v : null;
        if (before.length !== 1 || rest.length !== i + (lab != null ? 3 : 2)) throw new Error(`split by count takes one id, a number and an optional label: split msg into 4 "seg"`);
        noTail();
        const into = piecesOf(before[0], +rest[i + 1].v, lab);
        texts.push(...into.map((n) => n.label));
        return { op: "split", id: before[0], into, line };
      }
      const after: { id: string; label: string | null }[] = [];
      for (const x of rest.slice(i + 1)) { if (x.t === "word") after.push({ id: x.v, label: null }); else if (x.t === "str" && after.length) { after[after.length - 1].label = x.v; texts.push(x.v); } }
      noTail();
      if (w0 === "split") { if (before.length !== 1 || after.length < 2) throw new Error(`split takes one id and at least two new ids: split s1 into s1a "a-m" s1b "n-z"`); if (after.length > MAX_PIECES) throw new Error(`split ${before[0]} makes ${after.length} pieces; a split makes 2 to ${MAX_PIECES} (more cannot be read on the stage)`); return { op: "split", id: before[0], into: after, line }; }
      if (before.length < 2 || after.length !== 1) throw new Error(`merge takes at least two ids and one new id: merge a b into ab "a-z"`);
      return { op: "merge", ids: before, into: after[0], line };
    }
    // the author's camera words (format version 9, tools/camera.ts): close, far, turn=, tilt=
    case "camera": { noTail(); const c = parseCamera(words, kv); return { op: "camera", ids: c.ids, view: c.view, line }; }
    case "focus": noTail(); if (words.length !== 1) throw new Error("focus takes one layer, or all: focus app, focus all"); return { op: "focus", layer: words[0] === "all" ? null : words[0], line };
    // format version 9 (tools/story.ts)
    case "zoom":
      noTail();
      // format version 10: several things at one level (zoom into n1 n2), and zoom out all
      if (words.length === 2 && words[0] === "into" && !strs.length) return { op: "zoom", id: words[1], line };
      if (words.length > 2 && words[0] === "into" && !strs.length && !words.includes("into", 1)) { const ids = words.slice(1); const dup = ids.find((x, j) => ids.indexOf(x) !== j); if (dup) throw new Error(`zoom into names ${dup} twice`); return { op: "zoom", id: ids[0], ids, line }; }
      if (words.length === 1 && words[0] === "out" && !strs.length) return { op: "zoom", id: null, line };
      if (words.length === 2 && words[0] === "out" && words[1] === "all" && !strs.length) return { op: "zoom", id: null, all: true, line };
      throw new Error(`zoom takes: zoom into <id> [<id> ...] (the camera flies in and the inside opens; zooms nest), zoom out (back one level), or zoom out all`);
    // format version 10 (tools/depth.ts): lift things out of their boxes, put them back (3D only)
    case "lift": {
      noTail();
      if (!words.length || strs.length || Object.keys(kv).length) throw new Error(`lift takes ids: lift fe web2 (they rise out of their boxes)`);
      const dup = words.find((x, j) => words.indexOf(x) !== j); if (dup) throw new Error(`lift names ${dup} twice`);
      return { op: "lift", ids: words, line };
    }
    // format version 10 (tools/scenes.ts, tools/data.ts)
    case "enter":
      noTail();
      if (words.length === 3 && words[1] === "from" && !strs.length && !Object.keys(kv).length) return { op: "enter", id: words[0], from: words[2], line };
      throw new Error(`enter takes: enter <scene> from <thing> (the camera flies into the thing, and the scene inside is shown)`);
    case "leave":
      noTail();
      if (words.length <= 1 && !strs.length && !Object.keys(kv).length) return { op: "leave", id: words[0] ?? null, line };
      throw new Error(`leave takes nothing, or the scene's id: leave, or leave seg (back to where the story was before it entered)`);
    case "put":
      // format version 10 (tools/depth.ts): "put back [<id> ...]" (no colon) settles lifted things back; with a colon it is a map's put
      if (words[0] === "back" && tail == null) { if (strs.length || Object.keys(kv).length) throw new Error(`put back [<id> ...]: lifted things settle back into their places (without ids: all of them)`); return { op: "putback", ids: words.length > 1 ? words.slice(1) : null, line }; }
      if (words.length !== 2 || strs.length || Object.keys(kv).length || !tail) throw new Error(`put takes a map, a key and a value after a colon: put cache u9: Cy (or put back [<id> ...], 3D only: lifted things settle back)`);
      texts.push(tail);
      return { op: "put", m: words[0], key: words[1], value: tail, line };
    case "get":
      noTail();
      if (words.length !== 2 || strs.length || Object.keys(kv).length) throw new Error(`get takes a map and a key (get cache u7), or an array and an index (get ids 3)`);
      return { op: "get", m: words[0], key: words[1], line };
    case "drop": {
      noTail();
      const k = words.indexOf("at"), ids = k < 0 ? words : words.slice(0, k), at = k < 0 ? null : words[k + 1] ?? null;
      if (!ids.length || strs.length || (k >= 0 && (!at || words.length !== k + 2))) throw new Error(`drop needs a token: drop seg3 (lost where it is), or drop seg3 at router (it travels there and is lost)`);
      return { op: "drop", ids, at, line };
    }
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
  // format version 11: a record's values are its fields
  if (kv.as != null && kind !== "record") throw new Error(`as= says what kind of record it is (record ${id} as=interface), and ${id} is a ${kind}`);
  if (kv.as != null && !(RECORD_AS as readonly string[]).includes(kv.as)) throw new Error(`as=${kv.as}: a record is ${RECORD_AS.join(", ")}`);
  const fields = kind === "record" ? recordFields(id, tail) : undefined;
  const vals = tail != null && kind !== "record" ? (kind === "map" ? mapEntries(tail, id) : values(tail)) : null;
  const takesValues = ["array", "list", "stack", "queue", "table", "row", "map"];
  if (kv.buckets && (kind !== "map" || !/^[1-9]$|^1[0-6]$/.test(kv.buckets))) throw new Error(kind !== "map" ? `${kind} ${id}: buckets= is for a map (map ${id} "label" buckets=4: key: value); a bucket list of its own is buckets ${id} count=4` : `buckets=${kv.buckets}: a number from 1 to 16`);
  if (vals && !takesValues.includes(kind)) throw new Error(`${kind} takes no ": values" (only ${takesValues.join(", ")} do)`);
  if ((kind === "row" || kind === "table") && !vals?.length) throw new Error(`${kind} needs its cells after a colon: ${kind} ${id}${kind === "row" ? " in t" : ""}: 1, alice`);
  // a token sits at a thing, or (format version 9) waits in a container: a queue, a host's buffer
  if (kind === "pointer" && !c.anchor) throw new Error(`a pointer sits on something: pointer ${id} "label" at <id>`);
  if (kind === "token" && !c.anchor && !c.parent) throw new Error(`a token sits at a thing or waits in a container: token ${id} "label" at <id>, or token ${id} "label" in <container>`);
  if (kind === "token" && c.anchor && c.parent) throw new Error(`token ${id} is either at a thing or in a container, not both`);
  if (c.anchor && !(OVERLAYS as readonly string[]).includes(kind)) throw new Error(`only a token or a pointer sits "at" an entity; use "in <container>" to put ${id} inside one`);
  if (kv.closed && !/^(yes|no|hidden)$/.test(kv.closed)) throw new Error(`closed=${kv.closed}: closed is yes or no (yes: its inside is drawn faint), or hidden (its inside is not drawn until the story zooms in)`);
  if (kind === "buckets" && !kv.count) throw new Error(`buckets needs count=: buckets h "hash table" count=5`);
  if (vals) texts.push(...(kind === "map" ? vals.map((v) => v.slice(v.indexOf(":") + 1).trim()) : vals).filter((v) => !/^-?\d+(\.\d+)?$/.test(v)));
  if (fields) texts.push(...fields.map((x) => fieldText(x.field)));
  return { kind, id, label, parent: c.parent, under: c.under, side: c.side, place: c.place, anchor: c.anchor, kv, values: vals, ...(fields ? { fields } : {}) };
}
function parseConn(toks0: Tok[], line: number, texts: string[]): Op {
  const chain: string[] = [], styles: string[] = [];
  let label = "", is: string | null = null;
  const kv: Record<string, string> = {};
  for (const x of toks0) if (x.t === "kv") { if (!CONN_KEYS.includes(x.k!)) throw new Error(`a connection takes is=<family>, start= and end= (line ends), start-label= and end-label=, and also=yes, not ${x.k}=`); if (x.k === "is") is = x.v; else kv[x.k!] = x.v; }
  if (kv.also != null && kv.also !== "yes") throw new Error(`also=${kv.also}: write also=yes for a second line between the same two things, or a loop from a thing to itself`);
  const ends = endsOf(kv);
  const toks = toks0.filter((x) => x.t !== "kv");
  toks.forEach((x, i) => {
    if (x.t === "str") { if (i !== toks.length - 1) throw new Error(`a connection's label comes last: a -> b "label"`); label = x.v; texts.push(x.v); return; }
    if (chain.length === styles.length) { if (x.t !== "word") throw new Error(`expected an id, got "${x.v}"`); chain.push(x.v); }
    else { if (x.t !== "arrow") throw new Error(`expected an arrow (${ARROWS.join(" ")}) between ids, got "${x.v}"`); styles.push(x.v); }
  });
  if (chain.length < 2 || chain.length !== styles.length + 1) throw new Error(`a connection is: a -> b, a --> b (dashed), a -- b (a line), a <-> b, or a chain a -> b -> c`);
  if (chain.length > 2 && (ends || kv.also)) throw new Error("line ends belong to one line: write a chain's lines one by one (a -> b end=open)");
  for (const t of [ends?.ta, ends?.tb]) if (t) texts.push(t);
  return { op: "conn", chain, styles, label, is, line, ...(ends ? { ends } : {}), ...(kv.also ? { also: true as const } : {}) };
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
  closed?: boolean;       // closed=yes (format version 9): its inside is drawn faint, without words, until the story zooms in
  hide?: boolean;         // closed=hidden (format version 10): its inside is not drawn at all until the story zooms in
  ghost?: string;         // a kept slot (format version 9): the id of the thing that is here in other steps; takes room, never drawn
  as?: string;            // format version 11: what a record is (class, interface, entity ...); its fields have it too
  field?: Field;          // format version 11: one row of a record
  map?: number;           // format version 10 (tools/data.ts): a map (a table of key and value, 0, or this many buckets)
}
export interface Layer { id: string; label: string; note: string }
export interface Conn { key: number; from: string; to: string; style: string; label: string; family: string | null; ends?: Ends; also?: true }
export interface Family { id: string; label: string }
export interface State extends StoryState, DepthState { ents: Record<string, Ent>; root: string[]; conns: Conn[]; camera: string[] | null; view?: CamView; next: number; counters: Record<string, number>; layers: Layer[]; spread: boolean; focus: string | null; families: Family[] }
// format version 9: the thing the story zoomed into and the camera (and its words) before it; the pieces of each split token
export interface StoryState { zoom?: string | null; zoomCam?: string[] | null; zoomView?: CamView; pieces?: Record<string, { ids: string[]; label: string }> }
// what one step does on top of the state: shown in that step only
// touched: the ids this step adds, moves, changes, sends along, highlights or makes speak; the story camera keeps them in frame
// beats (format version 9): beat[id] is the beat that changes it, sendBeat/sayBeat by index, connBeat by connector key;
// spot: the keys a spotlight keeps lit (everything else dims); arc: the ids that travel on an arc
export interface Fx extends DepthFx { beats?: number; pace?: string; beat?: Record<string, number>; sendBeat?: number[]; sayBeat?: number[]; connBeat?: Record<number, number>; spot?: number[]; arc?: string[]; highlights: { key: number; tone: string }[]; says: { key: number; text: string; at?: string }[]; sends: { label: string; path: number[]; show: string; family: string | null; as?: string; landed?: true }[]; spawn: Record<number, number>; merge: Record<number, number>; enter: number[]; touched: string[]; dropped?: { key: number; at: number | null }[]; moved?: { id: string; line: number }[] }
// dropped (format version 9): tokens lost this step (at: the thing each travelled to first); moved: tokens that moved this step (one hop each)

const isContainer = (k: string) => (CONTAINERS as readonly string[]).includes(k) || k === "bucket";
const isOverlay = (k: string) => (OVERLAYS as readonly string[]).includes(k);
// (a copy costs about a unit for every 4 characters of its JSON, written and read back)
const clone = (s: State): State => { const t = JSON.stringify(s); work(t.length / 4); return JSON.parse(t); };
class Refuse extends Error {}

export function play(scene: Scene): { states: State[]; fx: Fx[]; errors: SceneError[]; subs: State[][] } {
  const errors: SceneError[] = [];
  let s: State = { ents: {}, root: [], conns: [], camera: null, next: 1, counters: {}, layers: [], spread: false, focus: null, families: [] };
  const states: State[] = [], fx: Fx[] = [];
  // subs[k]: the stage at the end of each beat of step k but the last (format version 9), so a thing added in one beat
  // and moved in the next is seen in both places
  const subs: State[][] = [];
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
    // beats (format version 9): what each change touches, sends, says or connects starts in its own beat
    f.beats = st.beats ?? 1; f.pace = st.pace ?? "normal"; f.beat = {}; f.sendBeat = []; f.sayBeat = []; f.connBeat = {}; f.arc = [];
    const sub: State[] = [];
    st.ops.forEach((op, j) => {
      const b = st.beat?.[j] ?? 0;
      work(8 + Object.keys(s.ents).length * 3 + s.conns.length * 3 + f.touched.length);
      if (j > 0 && b !== (st.beat?.[j - 1] ?? 0)) sub.push(clone(s));
      const n0 = f.touched.length, ents0 = new Set(Object.keys(s.ents)), conns0 = new Map(s.conns.map((c) => [c.key, c]));
      apply([op], f);
      for (const id of f.touched.slice(n0)) if (f.beat![id] == null) f.beat![id] = b;
      for (const id of ents0) if (!s.ents[id] && f.beat![id] == null) f.beat![id] = b; // removed
      for (const id of Object.keys(s.ents)) if (!ents0.has(id) && f.beat![id] == null) f.beat![id] = b; // added (a push's item, a split's parts)
      while (f.sendBeat!.length < f.sends.length) f.sendBeat!.push(b);
      while (f.sayBeat!.length < f.says.length) f.sayBeat!.push(b);
      for (const c of s.conns) if (!conns0.has(c.key)) f.connBeat![c.key] = b;
      for (const [k] of conns0) if (!s.conns.some((c) => c.key === k)) f.connBeat![k] = b;
      if (op.op === "move" && op.path === "arc") f.arc!.push(op.id);
    });
    // one hop per step, also across lines: a send that starts where another send of this step ends is a second hop
    const sends = st.ops.filter((o): o is Extract<Op, { op: "send" }> => o.op === "send" && o.show !== "stream");
    for (const b of sends) {
      const a = sends.find((x) => x !== b && x.path[x.path.length - 1] === b.path[0]);
      if (a) errors.push({ line: b.line, msg: `one hop per step: ${a.path.join(" -> ")} then ${b.path.join(" -> ")} in one step is two hops; move "${b.label || b.path.join(" -> ")}" to a step of its own, with its own caption` });
    }
    // a token moves one hop per step; a step never points at what a closed thing hides (tools/story.ts)
    errors.push(...stepChecks(s, st.ops, f), ...dataChecks(s, st.ops));
    // a lifted thing never moves; something removed is no longer lifted (format version 10, tools/depth.ts)
    errors.push(...depthChecks(s, st.ops, f));
    states.push(clone(s));
    subs.push(sub);
    fx.push(f);
  }
  // format version 11: a still scene is its setup, as one frame in which nothing moves
  if (!scene.steps.length && scene.attrs.still) { states.push(clone(s)); subs.push([]); fx.push({ highlights: [], says: [], sends: [], spawn: {}, merge: {}, enter: [], touched: [], beats: 1 }); }
  return { states, fx, errors, subs };
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
  if (!isContainer(p.kind)) throw new Refuse(`"${parent}" is a ${p.kind}, not a container: only ${CONTAINERS.filter((k) => k !== "record").join(", ")} hold entities (to give it things, declare it as group ${parent} "${p.label}")`);
  if (kind === "row" && p.kind !== "table") throw new Refuse(`a row goes in a table, and "${parent}" is a ${p.kind}`);
  if (p.kind === "table" && kind !== "row") throw new Refuse(`a table holds rows: row r1 in ${parent}: 1, alice`);
  if (p.kind === "record") throw new Refuse(`a record holds only its own fields; write them after its colon: record ${p.id}: id: uuid, name: text`);
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

// what the story words (tools/story.ts) borrow from the engine
const CTX: Ctx = { ent, drop, newEnt, insertAt, kidsOf, isContainer, refuse: (m) => new Refuse(m) };
function applyOp(s: State, op: Op, f: Fx) {
  switch (op.op) {
    case "zoom": case "drop": case "join": applyStory(s, op, f, CTX); return;
    case "lift": liftOp(s, op.ids, f, CTX, (id) => hiddenBy(s, id)); return;
    case "putback": putBackOp(s, op.ids, f, CTX); return;
    // format version 10 (tools/data.ts): a map is a table (key, value) or buckets, plus one entry per key
    case "put": applyPut(s, op, f, (decl) => applyOp(s, { op: "add", decl, line: op.line }, f), (m) => new Refuse(m)); return;
    case "get": applyGet(s, op, f, (m) => new Refuse(m)); return;
    case "enter": case "leave": return; // tools/scenes.ts takes these out before a scene is played
    case "add": {
      const d = op.decl;
      if (d.kind === "map") { const m = mapOps(d, op.line); applyOp(s, m.head, f); markMap(s, d); for (const x of m.entries) applyOp(s, x, f); return; }
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
      if (d.kv.closed) { if (!isContainer(d.kind)) throw new Refuse(`closed=: only a thing that holds things has an inside to close, and ${d.id} is a ${d.kind}; declare it as group ${d.id} "${d.label ?? d.id}" closed=yes`); e.closed = d.kv.closed !== "no"; if (d.kv.closed === "hidden") e.hide = true; }
      f.touched.push(d.id);
      e.under = d.under; e.side = d.side; e.anchor = d.anchor;
      if (!d.anchor) insertAt(kidsOf(s, d.parent), d.id, d.place, s);
      f.enter.push(e.key);
      if (d.kind === "record") {
        e.label = d.label || d.id; e.layout = "column";
        if (d.kv.as) e.as = d.kv.as;
        for (const x of d.fields ?? []) {
          const r = newEnt(s, { kind: "field", id: x.id, label: fieldText(x.field), parent: e.id }, { field: { ...x.field }, ...(d.kv.as ? { as: d.kv.as } : {}) });
          e.kids.push(r.id); f.enter.push(r.key);
        }
        return;
      }
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
        if (a === b && !op.also) throw new Refuse(`"${a}" cannot connect to itself (a loop on purpose: ${a} -> ${a} also=yes)`);
        if (a !== b && (isInside(s, a, b) || isInside(s, b, a))) throw new Refuse(`${a} and ${b}: a connector cannot join a container to something inside it`);
        if (!op.also && s.conns.some((c) => (c.from === a && c.to === b) || (c.from === b && c.to === a))) throw new Refuse(`${a} and ${b} are already connected (a second line on purpose: also=yes)`);
        const c: Conn = { key: s.next++, from: a, to: b, style: op.styles[i], label: op.label, family: op.is ? needFamily(s, op.is) : null, ...(op.ends ? { ends: op.ends } : {}), ...(op.also ? { also: true as const } : {}) };
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
      // several things move together (format version 9): each as if it had its own line, in the order written
      if (op.ids && op.ids.length > 1) { for (const id of op.ids) applyOp(s, { ...op, id, ids: undefined }, f); return; }
      const e = ent(s, op.id);
      const to = ent(s, op.to, "target");
      if (isOverlay(e.kind)) { if (to.id === e.id) throw new Refuse(`${op.id} cannot move to itself`); moveToken(s, e, to, !!op.into, op.place, f, op.line, CTX); return; }
      if (op.to === op.id || isInside(s, op.to, op.id)) throw new Refuse(`${op.id} cannot move into itself`);
      if (e.kind === "field") throw new Refuse(`${e.id} is a field: it stays in its record (highlight it, or set ${e.id} label="name: type")`);
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
        if (k === "label") {
          e.label = v;
          if (e.field) { try { e.field = { ...parseField(v), ...(e.field.band ? { band: true as const } : {}) }; } catch (err) { throw new Refuse((err as Error).message); } }
        }
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
        // format version 10: a step may hide a thing's smaller parts again, or show them, without a zoom
        else if (k === "closed") { if (!isContainer(e.kind)) throw new Refuse(`closed=: only a thing that holds things has an inside to close, and ${op.id} is a ${e.kind}`); if (!/^(yes|no|hidden)$/.test(v)) throw new Refuse(`closed=${v}: closed is yes or no, or hidden`); e.closed = v !== "no"; e.hide = v === "hidden" ? true : undefined; }
      }
      return;
    }
    case "highlight": for (const id of op.ids) { f.highlights.push({ key: ent(s, id).key, tone: op.tone }); f.touched.push(id); } return;
    case "say": f.says.push({ key: ent(s, op.id).key, text: op.text, ...(op.at ? { at: op.at } : {}) }); f.touched.push(op.id); return;
    case "spotlight": f.spot = [...(f.spot ?? []), ...op.ids.map((id) => ent(s, id).key)]; f.touched.push(...op.ids); return;
    case "note": ent(s, op.id).note = op.text; return;
    case "send": {
      f.sends.push({ label: op.label, path: op.path.map((id) => ent(s, id).key), show: op.show, family: op.is ? needFamily(s, op.is) : ent(s, op.path[0]).family, ...(op.as ? { as: op.as } : {}) });
      f.touched.push(...op.path);
      // send ... as m (format version 9): the token stays where it arrives, as token m
      // (at a queue, a stack or a list it joins it, as an item; anywhere else it sits at the end)
      if (op.as) {
        const end = ent(s, op.path[op.path.length - 1]), joins = ["queue", "stack", "list"].includes(end.kind);
        const e = newEnt(s, { kind: "token", id: op.as, label: op.label || op.as, parent: joins ? end.id : null }, { anchor: joins ? null : end.id, family: f.sends[f.sends.length - 1].family });
        if (joins) end.kids.push(e.id);
        f.enter.push(e.key); f.touched.push(op.as); (f.moved ??= []).push({ id: op.as, line: op.line });
      }
      return;
    }
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
      if (op.to && isOverlay(s.ents[id].kind)) {
        // a token taken from a queue (format version 9) goes into a container, or sits at a thing
        const to = ent(s, op.to, "target");
        moveToken(s, s.ents[id], to, isContainer(to.kind), {}, f, op.line, CTX);
      } else if (op.to) {
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
      if (e.kind === "field") throw new Refuse(`${e.id} is a field of a record; it does not split`);
      if (isContainer(e.kind)) throw new Refuse(`split works on a shape or a token, and "${op.id}" is a container; add new containers and move what is inside`);
      if (isOverlay(e.kind)) { splitToken(s, e, op.into, f, CTX); return; }
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
      if (es.some((e) => isOverlay(e.kind))) { mergeTokens(s, es, op.into, f, CTX); return; }
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
    case "camera": if (op.ids) for (const id of op.ids) ent(s, id); s.camera = op.ids; s.view = op.view; return;
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
  if (s.camera) { s.camera = s.camera.filter((c) => c !== id); if (!s.camera.length) { s.camera = null; if (s.view) s.view = { ...s.view, close: false }; } }
}

// ---------------------------------------------------------------- layout: where everything sits (world units ~ CSS pixels)
export interface Rect { x: number; y: number; w: number; h: number }
export interface Pt { x: number; y: number }
// layer: the layer it sits on (index from the top); ly: its y inside its layer's band (the 3D stage puts every layer
// on the same floor plan, so a band's own offset is taken off)
// size: its size name; lines: its label, wrapped; lbl: where its words are (a container's heading), for the overlap check
export interface Box extends Rect { key: number; id: string; kind: string; label: string; depth: number; container: boolean; parentKind: string | null; index: string | null; ent: Ent; head: number; layer: number; ly: number; size: SizeName; lines: string[]; lbl: Rect | null; cc: number; fill: "soft" | "none"; pcc: number; faint?: boolean; hidden?: boolean; vis?: number; lift?: boolean }
// hidden, vis, lift (format version 10, tools/depth.ts): inside a closed=hidden thing not open (not drawn); drawn at vis
// (outside a deep zoom, or not lifted while things are); lifted out of its box (the 3D stage raises it)
// faint (format version 9): inside a closed thing the story has not zoomed into: drawn faint, its words hidden (lbl null)
// a connector's label: lines, and where it sits (t along the curve, o off it, sideways), so a moving connector keeps it
// cc: the family colour (1..PALETTE), 0 for none; fill: its family tint on (soft) or off (none); pcc: the family colour
// of the container it sits in (a thing of the same family as its container draws without a tint, so it stands out)
// bend: how far its middle bows sideways (to the right of its way), so it runs around a thing instead of through it
// rt (format version 10): its route (tools/route.ts): the sides it leaves from, spread along them, straight or at right
// angles; null: the old curve with its bow (a circle's lines, a list's arrows, or when no route clears the words)
export interface Edge { key: string; from: number; to: number; style: string; label: string; implicit: boolean; cc: number; lines: string[]; lt: number; lo: number; lw: number; lh: number; lr: Rect | null; bend: number; rt?: Route | null; part?: boolean; ends?: Ends; also?: true; tags?: EndTag[] }
// format version 11: a word near an end: t along the line and o beside it, so it follows the line while it moves
export interface EndTag { end: "a" | "b"; text: string; t: number; o: number; r: Rect }
// what a step puts on top of the stage: a sent token's resting chip, an arrow's label, speech. Each is placed next to
// the thing it belongs to (dx, dy: its corner from that thing's centre), where it covers no label and no shape
export interface Mark { kind: "send" | "alabel" | "say"; at: number; text: string; lines: string[]; r: Rect; dx: number; dy: number; side: "up" | "down" | "left" | "right" | "on" }
// a send: the curves between the things on its path (an arrow drawn along them, or a token travelling them)
// seg, t, ox, oy: an arrow's label sits t along curve seg, moved by (ox, oy)
// rts (format version 10): each hop's route (its connector's, when it runs along one), or null for the old curve
export interface SendGeom { show: string; label: string; cc: number; path: number[]; offs: number[]; bends: number[]; rts?: (Route | null)[]; chip: number | null; alabel: number | null; seg: number; t: number; ox: number; oy: number; landed?: true }
// layers: the declared layers (none: every nesting level is one, unnamed); bands: the 2D stage draws them as bands;
// levels: how many layers there are; spread: split apart (3D); focus: the layer the story looks at, or null
// look: the keys the story's camera frames (null: everything, or the focused layer); touched: the keys this step touches
export interface Frame { boxes: Box[]; edges: Edge[]; bounds: Rect; camera: Rect; layers: Layer[]; bands: boolean; levels: number; spread: boolean; focus: number | null; look: number[] | null; size: SizeName; marks: Mark[]; sends: SendGeom[]; touched: number[]; families: Family[]; phone?: boolean; view?: CamView; part?: number[] }

// text width: Latin about 7.3 per character at 13px, CJK about 13, Indic scripts about 8.6
const chW = (ch: string) => { const c = ch.codePointAt(0)!; return c >= 0x2e80 ? 13 : c >= 0x0900 && c <= 0x0dff ? 8.6 : /[A-Z@#%&mwMW]/.test(ch) ? 8.6 : /[ilj.,:;'|!]/.test(ch) ? 3.8 : 7.1; };
export function textW(s: string, size = 13): number {
  work(1 + s.length);
  let w = 0;
  for (const ch of s) w += chW(ch);
  return (w * size) / 13;
}
// textW(s, size) <= maxW, the same sum stopped as soon as it is over (every character adds to it): a long word is
// measured only as far as a line goes
function fitsIn(s: string, size: number, maxW: number): boolean {
  let w = 0, n = 0;
  for (const ch of s) { w += chW(ch); n++; if ((w * size) / 13 > maxW) { work(1 + n); return false; } }
  work(1 + n);
  return (w * size) / 13 <= maxW;
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
// lines have room (format version 9): a connector, or a list's or a bucket's arrow, shows at least MIN_LINE units of
// line between its two shapes; things side by side that a line joins get LINK_GAP between them
export const MIN_LINE = 32;
export const LINK_GAP = 38;
// a label wraps at its size's maxW, at most 3 lines; a token's chip is one line, cut with "…" (the full text is in its title)
export const MAX_LINES = 3;
export const headH = (z: SizeTok) => Math.round(z.head + 14);
// a heading is set semibold with a little letter spacing: about a tenth wider than body text
export const headW = (s: string, z: SizeTok) => textW(s, z.head) * 1.1 + s.length * z.head * 0.03;

// where a long word may break (format version 10): just after the last of its own separators (- _ . / :) that still
// fits on the line, leaving at least 2 characters on each side; 0 when there is none
// (fits must hold for every start of w up to the longest that fits, and for none longer: widths only add up. So the
// longest start that fits is found by halving, and only the separators below it are looked at)
export function longBreak(w: string, fits: (t: string) => boolean): number {
  const top = longestFit(2, w.length - 2, (k) => fits(w.slice(0, k)));
  work(1 + Math.max(0, top));
  for (let k = top; k >= 2; k--) if (/[-_./:]/.test(w[k - 1])) return k;
  return 0;
}
// the largest k from lo to hi with ok(k), when ok holds up to some k and not after it; lo - 1 when none
function longestFit(lo: number, hi: number, ok: (k: number) => boolean): number {
  if (hi < lo) return lo - 1;
  if (ok(hi)) return hi;
  let a = lo - 1, b = hi; // ok(a) holds (or a is below lo), ok(b) does not
  while (b - a > 1) { const m = (a + b) >> 1; if (ok(m)) a = m; else b = m; }
  return a;
}
export function wrapText(s: string, font: number, maxW: number, maxLines = MAX_LINES): string[] {
  work(8 + s.length / 2);
  const fits = (t: string) => fitsIn(t, font, maxW + 0.5);
  const lines: string[] = [];
  let cur = "";
  // (once there are more lines than maxLines the answer is known: the first maxLines, the last cut with "…"; a long
  // label is not wrapped to its end)
  words: for (const word of s.split(/\s+/).filter(Boolean)) {
    if (lines.length > maxLines) break;
    work(2 + word.length);
    // a word longer than a line breaks after its own separator (- _ . / :) when one fits (format version 10: a name
    // such as service-web-replica-b-7f9c keeps its parts whole, no hyphen added); else it is cut where it overflows,
    // with a hyphen only inside a plain word of letters
    // (what is left of the word is all letters once the cuts are past its last other character)
    let other = -1;
    for (let i = 0; i < word.length; i++) { const c = word.charCodeAt(i); if (!((c >= 65 && c <= 90) || (c >= 97 && c <= 122))) other = i; }
    let w = word, at = 0;
    while (!fits(w)) {
      const sep = longBreak(w, fits);
      if (sep > 0) { if (cur) { lines.push(cur); cur = ""; } lines.push(w.slice(0, sep)); w = w.slice(sep); at += sep; if (lines.length > maxLines) break words; continue; }
      // the longest start that fits with a hyphen (2 to its length - 1), else 1
      const k = w.length - 1 > 1 ? Math.max(1, longestFit(2, w.length - 1, (j) => fits(w.slice(0, j) + "-"))) : w.length - 1;
      const hy = w.length && other < at ? "-" : "";
      if (cur) { lines.push(cur); cur = ""; }
      lines.push(w.slice(0, k) + hy);
      w = w.slice(k); at += k;
      if (lines.length > maxLines) break words;
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
    // a token waiting in a container (format version 9): the same chip as a token at a thing
    case "token": { const t = cut(text, CHIP.font, CHIP.maxW); return { w: chipW(t, CHIP.font) + 2 * CHIP.px + TOKEN_DOT, h: CHIP.h, lines: [t] }; }
    // format version 11: a state machine's start dot and end ring
    case "initial": return { w: 18, h: 18, lines: [] };
    case "final": return { w: 22, h: 22, lines: [] };
    case "text": { const lines = wrap(1.4); return { w: linesW(lines, z.font) + 4, h: lines.length * z.lh + 4, lines }; }
    case "dot": { const lines = wrap(); return { w: Math.max(18, linesW(lines, z.font) + 4), h: 16 + (lines.length ? 4 + lines.length * z.lh : 0), lines }; }
    case "person": { const I = personIcon(z), lines = wrap(); return { w: Math.max(I + 10, linesW(lines, z.font) + 6), h: I + 4 + lines.length * z.lh, lines }; }
    case "circle": { const lines = wrap(0.75); const d = Math.max(z.minH + 10, linesW(lines, z.font) + 2 * z.py + 10, lines.length * z.lh + 2 * z.py + 10); return { w: d, h: d, lines }; }
    case "cylinder": { const ry = cylRy(z), lines = wrap(); return { w: Math.max(z.minW, linesW(lines, z.font) + 2 * z.px), h: Math.max(z.minH + 2 * ry, lines.length * z.lh + 2 * z.py + 2 * ry), lines }; }
    case "cloud": { const lines = wrap(); return { w: Math.max(z.minW * 1.3, linesW(lines, z.font) + 2 * z.px + 40), h: Math.max(z.minH + 20, lines.length * z.lh + 2 * z.py + 24), lines }; }
    case "diamond": { const lines = wrap(0.8); return { w: Math.max(z.minW * 1.25, linesW(lines, z.font) * 1.5 + 2 * z.px), h: Math.max(z.minH * 1.4, lines.length * z.lh * 1.7 + 2 * z.py), lines }; }
    case "pill": { const lines = wrap(); const h = Math.max(z.minH - 4, lines.length * z.lh + 2 * z.py - 2); return { w: Math.max(z.minW, linesW(lines, z.font) + 2 * z.px + (lines.length > 1 ? h * 0.3 : 6)), h, lines }; }
    default: { const lines = wrap(); return { w: Math.max(z.minW, linesW(lines, z.font) + 2 * z.px), h: Math.max(z.minH, lines.length * z.lh + 2 * z.py) + (e.level != null ? METER_ROOM : 0), lines }; }
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
// segs (format version 10): a routed line is several pieces (straight runs and rounded corners), lens their lengths
export interface Geom { P: Pt; c1: Pt; c2: Pt; Q: Pt; segs?: Geom[]; lens?: number[] }
// off: moves the whole curve sideways (to the right of its way), so an arrow drawn over a connector sits beside it
// rt: a route (format version 10) draws the line the router chose instead of the curve
export function connGeom(a: Rect, b: Rect, ak: string, bk: string, straight = false, off = 0, bend = 0, rt: Route | null = null): Geom {
  if (rt) return routeGeom(a, b, rt, off, ak, bk);
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
  if (g.segs) { const [p, tt] = pieceAt(g, t); return bezAt(p, tt); }
  const u = 1 - t;
  return { x: u * u * u * g.P.x + 3 * u * u * t * g.c1.x + 3 * u * t * t * g.c2.x + t * t * t * g.Q.x, y: u * u * u * g.P.y + 3 * u * u * t * g.c1.y + 3 * u * t * t * g.c2.y + t * t * t * g.Q.y };
}
export function bezTan(g: Geom, t: number): Pt {
  if (g.segs) { const [p, tt] = pieceAt(g, t); return bezTan(p, tt); }
  const u = 1 - t;
  const x = 3 * u * u * (g.c1.x - g.P.x) + 6 * u * t * (g.c2.x - g.c1.x) + 3 * t * t * (g.Q.x - g.c2.x), y = 3 * u * u * (g.c1.y - g.P.y) + 6 * u * t * (g.c2.y - g.c1.y) + 3 * t * t * (g.Q.y - g.c2.y);
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
}
// a point t along the curve, moved o sideways (to the right of its way)
export function bezOff(g: Geom, t: number, o: number): Pt { const p = bezAt(g, t), d = bezTan(g, t); return { x: p.x - d.y * o, y: p.y + d.x * o }; }
export const bezPath = (g: Geom): string => g.segs ? `M${g.P.x.toFixed(1)} ${g.P.y.toFixed(1)}` + g.segs.map((c) => `C${c.c1.x.toFixed(1)} ${c.c1.y.toFixed(1)} ${c.c2.x.toFixed(1)} ${c.c2.y.toFixed(1)} ${c.Q.x.toFixed(1)} ${c.Q.y.toFixed(1)}`).join("") : `M${g.P.x.toFixed(1)} ${g.P.y.toFixed(1)}C${g.c1.x.toFixed(1)} ${g.c1.y.toFixed(1)} ${g.c2.x.toFixed(1)} ${g.c2.y.toFixed(1)} ${g.Q.x.toFixed(1)} ${g.Q.y.toFixed(1)}`;

export const sampleGeom = (g: Geom, n = 64): Pt[] => (work(g.segs ? g.segs.length * 9 : n + 1), g.segs ? routeLine(g) : Array.from({ length: n + 1 }, (_, i) => bezAt(g, i / n)));
// a connector's own geometry, as every stage draws it
export const edgeGeom = (e: Edge, a: Box | Rect & { kind: string }, b: Box | Rect & { kind: string }, off = 0) => connGeom(a, b, a.kind, b.kind, e.implicit, off, e.bend, e.rt ?? null);
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
// route every connector of a frame (format version 10). words: what a line must not cross (a container's heading only
// once headings have their place); shapes: the things. A connector keeps the old curve (rt null) when no route clears
// the words and things and that curve does
// format version 11: where a word near an end goes: just past its mark, beside the line, off every other word and line
function endTags(ed: Edge, a: Box, b: Box, labels: Rect[], shapes: Rect[], lines: Map<string, Pt[]>): EndTag[] {
  const g = edgeGeom(ed, a, b), pts = sampleGeom(g), len = pts.slice(1).reduce((n, p, i) => n + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0) || 1;
  const out: EndTag[] = [];
  for (const end of ["a", "b"] as const) {
    const text = end === "a" ? ed.ends!.ta : ed.ends!.tb;
    if (!text) continue;
    const w = textW(text, CHIP.font) + 4, h = CHIP.lh;
    const m = markAt(ed.style, ed.ends, end), from = (m ? glyphOf(m).len : 4) + 4;
    const cands: { r: Rect; t: number; o: number }[] = [];
    for (const extra of [0, 8, 18, 30, 46]) for (const far of [0, 7, 16]) for (const side of end === "a" ? [1, -1] : [-1, 1]) {
      const d0 = Math.min(from + extra, len * 0.45), d1 = bezTan(g, end === "a" ? d0 / len : 1 - d0 / len);
      // along the line the word needs room for its half, beside it the same
      const d = Math.min(d0 + Math.abs(d1.x) * w / 2 + Math.abs(d1.y) * h / 2, len * 0.45), t = end === "a" ? d / len : 1 - d / len, u = bezTan(g, t);
      const o = side * (Math.abs(u.y) * w / 2 + Math.abs(u.x) * h / 2 + 3 + far), p = bezOff(g, t, o);
      cands.push({ r: { x: p.x - w / 2, y: p.y - h / 2, w, h }, t, o });
    }
    const best = pick(cands, labels, shapes, [], [...lines.values()]);
    labels.push(best.r);
    out.push({ end, text, t: best.t, o: best.o, r: best.r });
  }
  return out;
}
function routeEdges(edges: Edge[], byKey: Map<number, Box>, all: Box[], shapes: Rect[], heads: boolean) {
  const same = (r: Rect, x: Rect) => r.x === x.x && r.y === x.y && r.w === x.w;
  const reqs: Req[] = [], idx: Edge[] = [];
  const fixed: Placed[] = [];
  // the outermost container around x that does not hold y (or x itself)
  const byId = new Map(all.filter((x) => x.key > 0).map((x) => [x.id, x]));
  const chain = (x: Box) => { const out: Box[] = [x]; let p = x.ent.parent ? byId.get(x.ent.parent) : undefined; while (p) { out.push(p); p = p.ent.parent ? byId.get(p.ent.parent) : undefined; } return out; };
  const outer = (x: Box, y: Box): Rect => { const cy = new Set(chain(y).map((c) => c.key)); return chain(x).filter((c) => !cy.has(c.key)).pop() ?? x; };
  // where lines may run: the scene and a margin (a line out there would leave the story's view)
  const area = pad(union(all), 24);
  const conts = all.filter((x) => x.container);
  work(16 + all.length * 4 + edges.length * 4);
  // a tree's edges from one parent (not circles: theirs run between the centres) leave from their own points along its
  // bottom, in the order of the children, each a straight line (format version 10)
  const kids = new Map<number, Edge[]>();
  for (const ed of edges) { const a = byKey.get(ed.from)!, b = byKey.get(ed.to)!; if (ed.implicit && ed.key.startsWith("t") && routable(a, b) && b.y >= a.y + a.h) kids.set(a.key, [...(kids.get(a.key) ?? []), ed]); }
  for (const [pk, es] of kids) {
    if (es.length < 2) continue;
    const p = byKey.get(pk)!;
    es.sort((x, y) => byKey.get(x.to)!.x - byKey.get(y.to)!.x);
    const room = sideRoom(p, "b"), sp = Math.min(FAN, (2 * room) / (es.length - 1));
    es.forEach((ed, i) => { ed.rt = { sa: "b", sb: "t", oa: (i - (es.length - 1) / 2) * sp, ob: 0, m: 0.5, line: true }; });
  }
  // format version 11: a loop from a thing to itself leaves and comes back on its freest side
  const loops = new Map<number, number>();
  for (const ed of edges) {
    if (ed.from !== ed.to) continue;
    const a = byKey.get(ed.from)!, n = loops.get(a.key) ?? 0;
    loops.set(a.key, n + 1);
    let best: Route | null = null, least = Infinity;
    for (const s of ["r", "l", "t", "b"] as const) {
      if (!sideOk(a, s)) continue;
      const room = sideRoom(a, s), o = Math.min(room, Math.max(9, room * 0.6));
      const rt: Route = { sa: s, sb: s, oa: -o, ob: o, m: END_CLEAR + 4 + n * 12 }, pts = sampleGeom(connGeom(a, a, a.kind, a.kind, false, 0, 0, rt));
      const busy = edges.filter((x) => x !== ed && (x.from === a.key) !== (x.to === a.key)).filter((x) => { const o2 = byKey.get(x.from === a.key ? x.to : x.from)!; const f = facing(a, o2); return f?.[0] === s; }).length;
      const hits = shapes.filter((r) => !same(r, a) && lineThrough(pts, r, 2)).length * 4 + all.filter((x) => x.key !== a.key && x.lbl && lineThrough(pts, x.lbl, 2)).length * 2 + busy + (room < 9 ? 3 : 0);
      if (hits < least) { least = hits; best = rt; }
    }
    ed.rt = best; ed.bend = 0;
    fixed.push(placed(sampleGeom(edgeGeom(ed, a, a), 24), [a.key, a.key]));
  }
  for (const ed of edges) {
    if (ed.from === ed.to) continue;
    const a = byKey.get(ed.from)!, b = byKey.get(ed.to)!;
    // (its words, things and containers: a pass over every box)
    work(all.length * 4 + shapes.length * 2);
    if (ed.implicit || !routable(a, b)) { fixed.push(placed(sampleGeom(edgeGeom(ed, a, b), 24), [a.key, b.key])); continue; }
    // format version 11: a line keeps off the heading of the queue or stack it ends at; a record's own rows are no obstacle to it
    const own = (x: Box) => [a, b].some((e) => e.kind === "record" && x.ent.parent === e.id);
    // another record is one thing to a line: its rows lie inside it
    const inner = (x: Box) => x.kind === "field" && !own(x);
    const words = [...all.filter((x) => x.lbl && x.key !== a.key && x.key !== b.key && !own(x) && !inner(x) && (heads || !x.container || x.key < 0 || x.kind === "record")).map((x) => x.lbl!), ...[a, b].filter((x) => (x.kind === "queue" || x.kind === "stack") && x.lbl).map((x) => x.lbl!)];
    const mine = all.filter((x) => own(x) || inner(x));
    const others = all.filter((x) => x.kind === "record" && x.key !== a.key && x.key !== b.key && x.id !== a.ent.parent && x.id !== b.ent.parent);
    const held = new Set([...chain(a), ...chain(b)].map((c) => c.key));
    reqs.push({ id: ed.key, a, b, words, shapes: [...shapes.filter((r) => !same(r, a) && !same(r, b) && !mine.some((x) => same(r, x)) && !others.some((x) => same(r, x) && r.h === x.h)), ...others], ga: outer(a, b), gb: outer(b, a), area, conts: conts.filter((c) => c.key !== a.key && c.key !== b.key), away: conts.filter((c) => !held.has(c.key) && c.kind !== "layer"), ...(ed.ends?.a || ed.ends?.b || ed.ends?.ta || ed.ends?.tb ? { clear: END_CLEAR } : {}) });
    idx.push(ed);
  }
  // a circle's lines and a list's arrows keep their curve, with the least bow that clears what is in their way
  for (const ed of edges) {
    if (ed.implicit || ed.from === ed.to) continue;
    const a = byKey.get(ed.from)!, b = byKey.get(ed.to)!;
    if (routable(a, b)) continue;
    work(all.length * 2);
    const words = all.filter((x) => x.lbl && x.key !== a.key && x.key !== b.key && (heads || !x.container || x.key < 0)).map((x) => x.lbl!);
    ed.bend = chooseBend(a, b, words, 0, shapes.filter((r) => !same(r, a) && !same(r, b)));
  }
  const got = routeAll(reqs, fixed);
  got.forEach((c, i) => {
    const ed = idx[i], r = reqs[i];
    if (c && c.hard === 0) { ed.rt = c.rt; ed.bend = 0; return; }
    const bend = chooseBend(r.a as Box, r.b as Box, r.words, 0, r.shapes);
    const pts = sampleGeom(connGeom(r.a, r.b, r.a.kind, r.b.kind, false, 0, bend), 40);
    const hits = r.words.filter((w) => lineThrough(pts, w, 2)).length + r.shapes.filter((w) => lineThrough(pts, w, -6)).length;
    if (!c || hits < c.hard) { ed.rt = null; ed.bend = bend; } else { ed.rt = c.rt; ed.bend = 0; }
  });
}
// a send's hop with no connector under it, drawn as an arrow or a stream (format version 10): its own route, clear of
// the lines already drawn; null keeps the old curve (with bend), when that clears more
function routeHop(a: Box, b: Box, words: Rect[], shapes: Rect[], lines: Pt[][], keys: [number, number][], off: number, conts?: Box[]): { rt: Route | null; bend: number } {
  const bend = chooseBend(a, b, words, off, shapes);
  if (!routable(a, b)) return { rt: null, bend };
  // conts (format version 10): the containers, so it neither runs along their edges nor through one that holds neither end
  const held = (x: Box) => { const out = new Set<string>(); let p: string | null | undefined = x.ent.parent; while (p) { out.add(p); p = conts?.find((c) => c.id === p)?.ent.parent; } return out; };
  const hold = conts ? new Set([...held(a), ...held(b)]) : null;
  const req: Req = { id: "send", a, b, words, shapes, ...(conts ? { conts: conts.filter((c) => c.key !== a.key && c.key !== b.key), away: conts.filter((c) => c.key !== a.key && c.key !== b.key && !hold!.has(c.id) && c.kind !== "layer") } : {}) };
  const c = bestRoute(req, null, lines.map((l, i) => placed(l, keys[i])), off);
  if (!c) return { rt: null, bend };
  if (c.hard === 0) return { rt: c.rt, bend: 0 };
  const pts = sampleGeom(connGeom(a, b, a.kind, b.kind, false, off, bend), 40);
  const hits = words.filter((w) => lineThrough(pts, w, 2)).length + shapes.filter((w) => lineThrough(pts, w, -6)).length;
  return hits < c.hard ? { rt: null, bend } : { rt: c.rt, bend: 0 };
}
// ---------------------------------------------------------------- placing small things where they cover nothing
export const hit = (a: Rect, b: Rect, m = 0) => a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;
const area = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
// the first candidate that covers nothing; else the one that covers least (labels weigh more than shapes)
// soft: the edges of containers; crossing one is allowed, but a free spot that does not is better
// lines: the connectors and arrows drawn on the stage; a small thing on one is as bad as one on a label
// format version 10: what a step puts on top keeps this far off every line (a line is 2 wide, an arrowhead 5 each side)
export const LINE_CLEAR = 4;
// near (format version 10): what straying costs (a tag far from its dot, or in a box its dot is not in), so a near
// spot with a small fault beats a clean one 60 units off
function pick<T extends { r: Rect }>(cands: T[], labels: Rect[], shapes: Rect[], soft: Rect[] = [], lines: Pt[][] = [], near?: (r: Rect) => number): T {
  let best = cands[0], bestScore = Infinity;
  // (each line a candidate tests is counted by lineThrough)
  const per = 2 + soft.length + labels.length + shapes.length + lines.length;
  for (const c of cands) {
    work(per);
    let s = near ? near(c.r) : 0;
    // format version 10: resting on a line (closer than LINE_CLEAR, by an arrowhead) costs; with near, more than straying (a tag stays clear of lines first, then near)
    for (const ln of lines) if (lineThrough(ln, c.r, 0)) s += near ? 490 : 90; else if (lineThrough(ln, c.r, -LINE_CLEAR)) s += near ? 250 : 45;
    for (const e of soft) if (hit(c.r, e, 2)) s += 6;
    // (with near, covering a word, a thing or a line still outweighs any straying: a tag never sits on one to stay close)
    for (const l of labels) if (hit(c.r, l, 2)) s += 4 * (area(c.r, l) + 20) + (near ? 400 : 0);
    for (const sh of shapes) if (hit(c.r, sh, 1)) s += area(c.r, sh) + 10 + (near ? 400 : 0);
    if (s === 0) return c;
    if (s < bestScore) { bestScore = s; best = c; }
  }
  return best;
}
// format version 10: a tag within NEAR_OK of what it names costs nothing more; past it, NEAR_COST a unit, and STRAY_COST
// in a container that does not hold what it names
export const NEAR_OK = 18, NEAR_COST = 2, STRAY_COST = 40;
const gapPt = (p: Pt, r: Rect) => Math.hypot(Math.max(r.x - p.x, 0, p.x - r.x - r.w), Math.max(r.y - p.y, 0, p.y - r.y - r.h));
function nearTo(pts: Pt[], boxes: Box[]): (r: Rect) => number {
  const cs = boxes.filter((b) => b.container && b.key > 0 && b.kind !== "layer" && !b.hidden);
  const at = pts.length === 1 ? pts[0] : null;
  return (r) => {
    work(pts.length + cs.length);
    const g = Math.min(...pts.map((p) => gapPt(p, r)));
    const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    const stray = at && cs.some((b) => c.x > b.x && c.x < b.x + b.w && c.y > b.y && c.y < b.y + b.h && !(at.x > b.x - 3 && at.x < b.x + b.w + 3 && at.y > b.y - 3 && at.y < b.y + b.h + 3));
    return Math.max(0, g - NEAR_OK) * NEAR_COST + (stray ? STRAY_COST : 0);
  };
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
export function layoutState(s: State, attrs: { layout: string; dir: string; fit?: number; entered?: boolean; apart?: boolean; size?: string; fill?: string; room?: number; narrow?: boolean; phone?: boolean }, story: [string, string][] = [], keep: Map<string, [number, number]> = new Map(), heads: Map<string, number> | null = null): Frame {
  // a story link to a thing that is not here now goes to its kept slot, so a graph places the slot where the thing goes
  const slotOf = new Map<string, string>();
  for (const e of Object.values(s.ents)) if (e.ghost && !s.ents[e.ghost] && !slotOf.has(e.ghost)) slotOf.set(e.ghost, e.id);
  const real = (id: string) => (s.ents[id] ? id : slotOf.get(id) ?? null);
  const links: [string, string][] = [...s.conns.map((c) => [c.from, c.to] as [string, string]), ...story.map(([a, b]) => [real(a), real(b)] as [string, string]).filter(([a, b]) => a && b)];
  // one layout: a few dozen units for each thing (measured, placed, its colour and layer found) and each line
  work(32 + Object.keys(s.ents).length * (72 + s.families.length + s.layers.length) + links.length * 8);
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
  const kept = (e: Ent, w: number, h: number): [number, number] => { const k = keep.get(`${e.kind}:${e.ghost ?? e.id}`); return k ? [Math.max(w, k[0]), Math.max(h, k[1])] : [w, h]; };
  const rootLayout0 = attrs.layout === "auto" ? (links.some(([a, b]) => top(s, a) !== top(s, b)) ? "graph" : "row") : attrs.layout;
  const rootLayout = attrs.narrow && rootLayout0 === "row" ? "column" : rootLayout0;
  const rootDir = attrs.narrow ? "down" : attrs.dir;
  // when the narrow layout turns a graph downward, a column whose things connect outside it turns into a row, so their
  // lines leave side by side instead of running down through each other
  const within = (id: string, c: string) => { for (let x: string | null = id, n = 0; x && n < 64; x = s.ents[x]?.parent ?? null, n++) if (x === c) return true; return false; };
  const turned = new Set(attrs.narrow && rootLayout0 === "graph" ? Object.values(s.ents).filter((e) => isContainer(e.kind) && e.layout === "column" && (work(e.kids.length * (1 + links.length)), e.kids).some((k) => links.some(([a, b]) => (a === k && !within(b, e.id)) || (b === k && !within(a, e.id))))).map((e) => e.id) : []);
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
    const kids = e.kids.filter((k) => !(isOverlay(s.ents[k].kind) && s.ents[k].anchor));
    if (e.kind === "record") return measureRecord(e, kids, z);
    // a queue in a row reads the way things flow (format version 8): new items join at the back (left) and the front,
    // where a worker takes from, is on the right, by what reads it; in a column the front is at the top
    const lay0 = e.kind === "table" ? "table" : e.kind === "stack" ? "stack" : layoutOf(e);
    const gap0 = gapOf(e.kind, z), gap = ["row", "column", "grid"].includes(lay0) && joined(kids) ? Math.max(gap0, LINK_GAP) : gap0;
    const [iw, ih] = place(id, kids, e.kind === "queue" && lay0 === "row" ? "queue" : lay0, e.dir, e.cols, gap, z);
    const hh = e.label && e.kind !== "bucket" ? headH(z) : 0;
    const bare = ["array", "list", "queue"].includes(e.kind) && !e.label;
    const pad = bare ? 0 : e.kind === "bucket" ? 4 : z.pad;
    const idx = e.kind === "array" ? 16 : 0;
    const lead = e.kind === "bucket" ? 34 : 0;
    head.set(id, hh);
    const [w, h] = kept(e, Math.max(iw + 2 * pad + lead, hh ? (headW(e.label, z) + 2 * z.pad + 6) * (attrs.entered && e.kind === "group" ? 2 : 1) : 0, e.kind === "bucket" ? 120 : 40), Math.max(Math.max(ih, e.kind === "bucket" ? 32 : 0) + 2 * pad + hh + idx, 40));
    // what it holds sits in the padded inner box: a row from the left (so a thing that moves between floors keeps its
    // shaft), any other layout centred
    const ox = pad + lead + (e.kind === "queue" && lay0 === "row" ? Math.max(0, w - 2 * pad - lead - iw) : rowLike(e) ? 0 : Math.max(0, (w - 2 * pad - lead - iw) / 2));
    for (const k of kids) { const r = rel.get(k)!; rel.set(k, { ...r, x: r.x + ox, y: r.y + pad + hh }); }
    size.set(id, [w, h]);
    return [w, h];
  };
  // format version 11: a record's rows fill its width, one under the other under its title band
  const measureRecord = (e: Ent, kids: string[], z: SizeTok): [number, number] => {
    const m = recordLayout(e.label, e.as ?? "", kids.map((k) => s.ents[k].field!), z, !!attrs.phone, textW, (t, font, max) => wrapEven(t, font, max));
    const [w, h] = kept(e, m.w, m.head.h + m.rows.reduce((n, r) => n + r.h, 0));
    (e as any)._head = m.head;
    head.set(e.id, m.head.h);
    let y = m.head.h;
    kids.forEach((k, i) => {
      (s.ents[k] as any)._row = m.rows[i];
      lines.set(k, [s.ents[k].label]);
      size.set(k, [w, m.rows[i].h]); rel.set(k, { x: 0, y, w, h: m.rows[i].h });
      y += m.rows[i].h;
    });
    size.set(e.id, [w, h]);
    return [w, h];
  };
  // two of these things are joined by a line (between them, or between anything inside them)
  const joined = (kids: string[]) => { if (kids.length < 2) return false; work(kids.length * 4 + links.length * 4); const names = new Map(kids.flatMap((k) => [[k, k], [s.ents[k]?.ghost ?? k, k]] as [string, string][])); const own = (id: string) => { for (let x: string | null = id, n = 0; x && n < 64; x = s.ents[x]?.parent ?? null, n++) if (names.has(x)) return names.get(x)!; return null; }; return links.some(([a, b]) => { const p = own(a), q = own(b); return !!p && !!q && p !== q; }); };
  const gapOf = (kind: string, z: SizeTok) => (kind === "array" ? 4 : kind === "list" ? LINK_GAP : kind === "bucket" ? LINK_GAP : kind === "stack" ? 4 : kind === "queue" ? 6 : kind === "table" ? 0 : z.gap);
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
    // format version 11: lines with marks or words at their ends need more room between the ranks
    if (layout === "graph") return graphLayout(s, kids, size, set, dir, gap, links, attrs.room ?? 0, s.conns.some((c) => c.ends) ? END_CLEAR + CHIP.lh : 0, owner ? 0 : attrs.fit ?? 0, !owner && !!attrs.apart);
    // row (a queue's row: the newest on the left, the front on the right)
    const h = Math.max(...sz.map((x) => x[1]));
    let x = 0;
    for (const k of layout === "queue" ? [...kids].reverse() : kids) { const [kw, kh] = size.get(k)!; set(k, x, (h - kh) / 2); x += kw + gap; }
    return [x - gap, h];
  };
  const rootKids = s.root.filter((k) => !(isOverlay(s.ents[k].kind) && s.ents[k].anchor));
  const open = openSet(s);
  const lay = (id: string) => layerIndex(s, id);
  // layers as bands: when the top-level things sit on two or more declared layers, the stage is a column of bands,
  // one per layer (top first), and the n-th thing of every band shares one column, so stacks line up; containers in a
  // column share its width, so what moves between them goes straight up or down
  const banded = s.layers.length > 0 && new Set(rootKids.map(lay)).size > 1;
  const bandRects: { L: number; r: Rect }[] = [];
  let rw = 0, rh = 0;
  if (banded) {
    const BP = Z0.pad + 2, CG = Z0.gap * 3;
    // a line between two bands shows at least MIN_LINE
    const BG = links.some(([a, b]) => s.ents[a] && s.ents[b] && lay(top(s, a)) !== lay(top(s, b))) ? Math.max(Z0.gap * 0.8, MIN_LINE + 6 - 2 * BP) : Z0.gap * 0.8;
    for (const k of rootKids) measure(k);
    work(s.layers.length * (rootKids.length + 4));
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
  } else [rw, rh] = place(null, rootKids, rootLayout, rootDir, 3, rootLayout === "graph" ? Math.round(Z0.gap * 1.6) : joined(rootKids) ? Math.max(LINK_GAP, Math.round(Z0.gap * 2.2)) : Math.round(Z0.gap * 2.2), Z0);
  const bandY = (id: string) => (banded ? bandRects[lay(top(s, id))]?.r.y ?? 0 : 0);
  // absolute positions, top-down
  const absolute = (id: string, ox: number, oy: number, depth: number) => {
    const e = s.ents[id], r = rel.get(id)!;
    if (e.ghost) return; // a kept slot: room only
    const x = ox + r.x, y = oy + r.y;
    const p = e.parent ? s.ents[e.parent] : null;
    const index = p?.kind === "array" ? (work(p.kids.length), String(p.kids.indexOf(id))) : null;
    const sn = sizeOf(id), z = DZ[sn];
    const container = isContainer(e.kind);
    const ls = container ? (e.label ? [e.label] : []) : lines.get(id) ?? [];
    const rect = { x, y, w: r.w, h: r.h };
    const hh = head.get(id) ?? 0;
    const lbl = e.kind === "record" ? { x: x + 4, y: y + 3, w: r.w - 8, h: hh - 6 }
      : e.kind === "field" ? { x: x + 6, y: y + 3, w: r.w - 12, h: r.h - 6 }
      : container
      ? (hh && e.label ? { x: x + z.pad + (heads?.get(id) ?? 0) * Math.max(0, r.w - 2 * z.pad - headW(e.label, z) - 2), y: y + 4, w: headW(e.label, z) + 2, h: hh - 6 } : e.kind === "bucket" ? { x, y, w: 30, h: r.h } : null)
      : e.kind === "row" || e.kind === "token" ? rect : labelBox(isSlot(e.kind, p?.kind ?? null) ? "box" : e.kind, rect, ls, z, e.level != null);
    const by = hiddenBy(s, id, open), faint = !!by, hidden = !!by && hiddenDeep(s, id, open);
    boxes.set(id, { key: e.key, id, kind: e.kind, label: e.label, ...rect, depth, container, parentKind: p?.kind ?? null, index, ent: e, head: hh, layer: lay(id), ly: y - bandY(id), size: sn, lines: ls, lbl: faint ? null : lbl, cc: ccOf(id), fill: fillOf(id), pcc: ccOf(e.parent), ...(faint ? { faint } : {}), ...(hidden ? { hidden } : {}) });
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
  const edges: Edge[] = s.conns.filter((c) => boxes.has(c.from) && boxes.has(c.to)).map((c) => ({ key: `c${c.key}`, from: boxes.get(c.from)!.key, to: boxes.get(c.to)!.key, style: c.style, label: c.label, implicit: false, cc: c.family ? s.families.findIndex((x) => x.id === c.family) + 1 : 0, lines: [], lt: 0.5, lo: 0, lw: 0, lh: 0, lr: null, bend: 0, ...(c.ends ? { ends: c.ends } : {}), ...(c.also ? { also: true as const } : {}) }));
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
  // every connector gets its route (format version 10, tools/route.ts): lines on one side of a thing fan out, run
  // straight or at right angles, and cross no word, no thing and no other line where the layout allows; a connector
  // no route clears keeps the old curve that bows around what is in its way
  routeEdges(edges, byKey, [...bandBoxes, ...boxes.values()], shapes, !!heads);
  const edgeLine = new Map(edges.map((ed) => { const a = byKey.get(ed.from)!, b = byKey.get(ed.to)!; return [ed.key, sampleGeom(edgeGeom(ed, a, b))]; }));
  // format version 11: no word sits on a line's end shape
  for (const ed of edges) {
    if (!ed.ends) continue;
    const g = edgeGeom(ed, byKey.get(ed.from)!, byKey.get(ed.to)!);
    for (const side of ["a", "b"] as const) {
      const m = markAt(ed.style, ed.ends, side);
      if (!m) continue;
      const t = bezTan(g, side === "a" ? 0 : 1);
      labels.push(glyphRect(m, side === "a" ? g.P : g.Q, side === "a" ? t : { x: -t.x, y: -t.y }, PORT_GAP));
    }
  }
  // the words near the ends come first: they have the least room to move
  for (const ed of edges) if (ed.ends?.ta || ed.ends?.tb) ed.tags = endTags(ed, byKey.get(ed.from)!, byKey.get(ed.to)!, labels, shapes, edgeLine);
  // a connector's label: on its middle if that is free, else beside it or further along
  for (const ed of edges) {
    if (!ed.label) continue;
    work(edges.length + 16);
    const a = byKey.get(ed.from)!, b = byKey.get(ed.to)!;
    const g = edgeGeom(ed, a, b);
    ed.lines = wrapEven(ed.label, CHIP.font, chipOf(attrs.phone).edgeW, 2);
    ed.lw = Math.max(24, linesW(ed.lines, CHIP.font) + 14); ed.lh = ed.lines.length * CHIP.lh + 4;
    const cands: { r: Rect; t: number; o: number }[] = [];
    for (const t of [0.5, 0.38, 0.62, 0.28, 0.72]) for (const o of [0, ed.lh / 2 + 8, -(ed.lh / 2 + 8)]) { const p = bezOff(g, t, o); cands.push({ r: { x: p.x - ed.lw / 2, y: p.y - ed.lh / 2, w: ed.lw, h: ed.lh }, t, o }); }
    const rest = [...edgeLine].filter(([k]) => k !== ed.key).map(([, v]) => v);
    let best = pick(cands, labels, shapes, [], rest);
    // format version 11: two lines side by side: a word still on the other's word or line moves out by its own extent
    if (labels.some((l) => hit(best.r, l, 2)) || rest.some((ln) => lineThrough(ln, best.r, 0))) {
      const more = [...cands];
      for (const t of [0.5, 0.38, 0.62, 0.28, 0.72]) for (const side of [1, -1]) {
        const u = bezTan(g, t), o = side * (Math.abs(u.y) * ed.lw / 2 + Math.abs(u.x) * ed.lh / 2 + 5), p = bezOff(g, t, o);
        more.push({ r: { x: p.x - ed.lw / 2, y: p.y - ed.lh / 2, w: ed.lw, h: ed.lh }, t, o });
      }
      best = pick(more, labels, shapes, [], rest);
    }
    ed.lt = best.t; ed.lo = best.o; ed.lr = best.r;
    labels.push(best.r);
  }
  // tokens and pointers sit next to their anchor (a token by its top-right corner, a pointer above it), never on a label
  for (const e of Object.values(s.ents)) {
    if (!isOverlay(e.kind) || !e.anchor) continue;
    work(edges.length + 16);
    const a = boxes.get(e.anchor);
    if (!a) continue;
    const text = cut(e.label, CHIP.font, CHIP.maxW);
    const tw = e.kind === "token" ? chipW(text, CHIP.font) : textW(text, CHIP.font);
    let r: Rect;
    if (e.kind === "pointer") {
      const w = Math.max(16, tw + 6), h = 30;
      r = pick(around(a, w, h, ["up", "down"], 2), labels, shapes, [], [...edgeLine.values()]).r;
    } else {
      const w = tw + 2 * CHIP.px + TOKEN_DOT, h = CHIP.h;
      // format version 10: then just right, or just left, of the middle of its top, where a line in a column arrives
      const cands = [{ r: { x: a.x + a.w - w + 6, y: a.y - h - 3, w, h } }, { r: { x: a.x + a.w / 2 + 6, y: a.y - h - 3, w, h } }, { r: { x: a.x + a.w / 2 - w - 6, y: a.y - h - 3, w, h } }, ...around(a, w, h, ["up", "right", "down", "left"])];
      r = pick(cands, labels, shapes, [], [...edgeLine.values()]).r;
    }
    labels.push(r);
    const faint = !!hiddenBy(s, e.id, open), hidden = faint && hiddenDeep(s, e.id, open);
    boxes.set(e.id, { key: e.key, id: e.id, kind: e.kind, label: e.label, ...r, depth: 99, container: false, parentKind: null, index: null, ent: e, head: 0, layer: lay(e.anchor), ly: r.y - bandY(e.anchor), size: "s", lines: [text], lbl: faint ? null : r, cc: ccOf(e.id), fill: fillOf(e.id), pcc: 0, ...(faint ? { faint } : {}), ...(hidden ? { hidden } : {}) });
  }
  const all = [...bandBoxes, ...boxes.values()];
  // (format version 11) an arrow's label belongs to the scene too: one that sticks out of every box made the camera,
  // which keeps within the scene, clip it to a letter
  const shownKey = new Set([...boxes.values()].filter((b) => !b.hidden).map((b) => b.key));
  const edgeWords = edges.filter((e) => e.lr && e.label && shownKey.has(e.from) && shownKey.has(e.to)).map((e) => e.lr as Rect);
  const bounds = all.length ? union([...all, ...edgeWords]) : { x: 0, y: 0, w: Math.max(rw, 100), h: Math.max(rh, 60) };
  const focus = s.focus ? s.layers.findIndex((l) => l.id === s.focus) : -1;
  const onFocus = focus < 0 ? [] : banded ? bandBoxes.filter((b) => b.layer === focus) : all.filter((b) => b.layer === focus);
  const cam = s.camera ? union(s.camera.map((id) => boxes.get(id)).filter(Boolean) as Rect[]) : onFocus.length ? union(onFocus) : bounds;
  const levels = s.layers.length || Math.max(1, ...all.map((b) => b.layer + 1));
  return { boxes: all, edges, bounds, camera: pad(cam, 12), layers: s.layers, bands: banded, levels, spread: s.spread, focus: focus < 0 ? null : focus, look: s.camera ? s.camera.map((id) => boxes.get(id)?.key).filter((k): k is number => k != null) : null, size: sz0, marks: [], sends: [], touched: [], families: s.families, phone: !!attrs.phone, view: s.view };
}
// inside a closed=hidden thing that is not open (format version 10): not drawn at all
function hiddenDeep(s: State, id: string, open: Set<string>): boolean {
  let e: Ent | undefined = s.ents[id];
  if (e?.anchor) e = s.ents[e.anchor];
  for (let n = 0; e && n < 64; n++) { const p: Ent | undefined = e.parent ? s.ents[e.parent] : undefined; if (!p) return false; if (p.hide && !open.has(p.id)) return true; e = p; }
  return false;
}
const top = (s: State, id: string): string => { let e = s.ents[id]; while (e?.parent) e = s.ents[e.parent]; return e?.id ?? id; };
export function union(rs: Rect[]): Rect {
  if (!rs.length) return { x: 0, y: 0, w: 100, h: 60 };
  const x = Math.min(...rs.map((r) => r.x)), y = Math.min(...rs.map((r) => r.y));
  return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y };
}
export const pad = (r: Rect, p: number): Rect => ({ x: r.x - p, y: r.y - p, w: r.w + 2 * p, h: r.h + 2 * p });
export const center = (r: Rect): Pt => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

// format version 10: a token sent along a connector travels beside it, not on it. On the line its dot (with the ring
// that parts it from what is under it) ran over the connector's own label and came to rest on its arrowhead. TOKEN_OFF
// clears an arrowhead (half its width, 5) and the dot's ring (9.5); further off, on whichever side is free, when a word
// is in the way of the dot (a word's box grown by the ring)
export const TOKEN_OFF = 15;
// a token chip: room for its dot before the words (with measured widths, tools/chipw.ts, the dot keeps 2.5 px clear)
export const TOKEN_DOT = 8;
const TOKEN_RING = 9.5;
function tokenOff(snd: { path: number[] }, a: Box, b: Box, f: Frame, shapes: Rect[], edgeRt: Map<string, Route | null>): number {
  const ert = edgeRt.get(`${a.key}>${b.key}`) ?? null;
  if (!ert) return 0; // a circle's or a list's old curve: no route to run beside
  const words = [...f.edges.map((x) => x.lr), ...f.boxes.filter((x) => x.key !== a.key && x.key !== b.key).map((x) => x.lbl)].filter((r): r is Rect => !!r);
  const things = shapes.filter((r) => !(r.x === a.x && r.y === a.y) && !(r.x === b.x && r.y === b.y));
  // the first side offset that is clear; else the one that covers least (a word under the dot itself weighs most)
  let best = TOKEN_OFF, bestN = Infinity;
  for (const o of [TOKEN_OFF, -TOKEN_OFF, 19, -19, 24, -24, 30, -30, 36, -36, 44, -44, 52, -52]) {
    const pts = sampleGeom(connGeom(a, b, a.kind, b.kind, false, o, 0, ert));
    const n = words.filter((r) => lineThrough(pts, r, -TOKEN_RING)).length + 4 * words.filter((r) => lineThrough(pts, r, -4)).length + 4 * things.filter((r) => lineThrough(pts, r, -2)).length;
    if (n === 0) return o;
    if (n < bestN) { bestN = n; best = o; }
  }
  return best;
}
// format version 10: a line's end is at its thing: within the gap a line stops short of it and a little more, of the
// part a line meets (tools/route.ts wallRect); of a pill, of its round ends
const atEnd = (p: Pt, b: Box) => {
  const r = wallRect(b);
  if (b.kind === "pill") { const k = Math.min(r.w, r.h) / 2, y = r.y + r.h / 2; const cx = Math.max(r.x + k, Math.min(r.x + r.w - k, p.x)); return Math.hypot(p.x - cx, p.y - y) - k <= 6; }
  return p.x >= r.x - 6 && p.x <= r.x + r.w + 6 && p.y >= r.y - 6 && p.y <= r.y + r.h + 6;
};
// may an arrow run on its connector (see decorate)? no other send of the step that is drawn as a line runs between the
// same two things, either way (format version 10: with a connector's label too; beside it, it read as a doubled wire,
// and the stage draws that label again over the arrow)
// the connector a send rides: with two lines between a pair (format version 11), the one that points its way
const edgeFor = (edges: Edge[], a: number, b: number) => edges.find((x) => x.from === a && x.to === b) ?? edges.find((x) => x.from === b && x.to === a);
function onLine(snd: { path: number[]; show: string }, a: Box, b: Box, f: Frame, all: { path: number[]; show: string }[]): boolean {
  const e = edgeFor(f.edges, a.key, b.key);
  if (!e) return false;
  const uses = (s: { path: number[] }) => s.path.some((k, i) => i > 0 && ((s.path[i - 1] === a.key && k === b.key) || (s.path[i - 1] === b.key && k === a.key)));
  return !all.some((s) => s !== snd && s.show !== "token" && uses(s));
}
// ---------------------------------------------------------------- what a step adds on top: sends, arrows, speech
// placed after the layout, where they cover no label and no shape; the renderers draw them where this puts them
export function decorate(f: Frame, fx: Fx | undefined, touchedIds: string[] = []): Frame {
  work(16 + f.boxes.length * 16 + f.edges.length * 8 + touchedIds.length * 2);
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
  // a send along a connector runs on its route (format version 10), turned round when it goes the other way
  const edgeRt = new Map<string, Route | null>();
  for (const e of f.edges) { edgeRt.set(`${e.from}>${e.to}`, e.rt ?? null); if (!edgeRt.has(`${e.to}>${e.from}`)) edgeRt.set(`${e.to}>${e.from}`, e.rt ? flipRoute(e.rt) : null); }
  const lines: Pt[][] = f.edges.map((e) => { const a = byKey.get(e.from), b = byKey.get(e.to); return a && b ? sampleGeom(edgeGeom(e, a, b)) : []; });
  const lineKeys: [number, number][] = f.edges.map((e) => [e.from, e.to]);
  const plan = (fx?.sends ?? []).map((snd) => {
    work(16 + snd.path.length * (8 + f.boxes.length + f.edges.length + lines.length));
    const path = snd.path.filter((k) => byKey.has(k));
    if (path.length < 2) return null;
    // an arrow drawn over a connector sits beside it (to the right of its way), so a call and its reply do not overlap
    // extra: more bow than its connector's, when no side offset alone clears the words
    const extra = path.slice(1).map(() => 0);
    // ownWay (format version 10): hops with no room beside their connector (a pill's short side already holds two
    // lines); each takes a way of its own, as a send with no connector does, rather than start in empty space
    const ownWay = new Set<number>();
    const offs = path.slice(1).map((k, i) => {
      if (!(conn.has(`${path[i]}>${k}`) || conn.has(`${k}>${path[i]}`))) return 0;
      if (snd.show === "token") return tokenOff(snd, byKey.get(path[i])!, byKey.get(k)!, f, shapes, edgeRt);
      // beside the connector; further off, on whichever side is free, when a connector's chip or a word is in the way
      const a = byKey.get(path[i])!, b = byKey.get(k)!;
      const words = [...f.edges.map((x) => x.lr), ...f.boxes.filter((x) => x.key !== a.key && x.key !== b.key).map((x) => x.lbl)].filter((r): r is Rect => !!r);
      const eb = edgeBend.get(`${a.key}>${b.key}`) ?? 0;
      const things = shapes.filter((r) => !(r.x === a.x && r.y === a.y) && !(r.x === b.x && r.y === b.y));
      const ert = edgeRt.get(`${a.key}>${b.key}`) ?? null;
      // format version 10: an arrow drawn right beside its connector read as a doubled line; when the connector has no
      // words of its own and no other send runs it in this step (a call and its reply), the arrow draws itself on the
      // connector instead, lighting it up from end to end
      if (ert && onLine(snd, a, b, f, fx?.sends ?? [])) return 0;
      if (ert) {
        // beside its connector, clear of words and things, and meeting no other line (no crossing, no touch, not at one point)
        const others = lines.map((l, j) => placed(l, lineKeys[j])).filter((p) => !((p.ends[0] === a.key && p.ends[1] === b.key) || (p.ends[0] === b.key && p.ends[1] === a.key)));
        for (const o of [7, -7, 5, -5, 10, -10, 13, -13, 17, -17, 23, -23, 28, -28, 34, -34, 40, -40]) {
          const pts = sampleGeom(connGeom(a, b, a.kind, b.kind, false, o, 0, ert));
          if (words.some((r) => lineThrough(pts, r, 0)) || things.some((r) => lineThrough(pts, r, -4))) continue;
          // format version 10: so far off that its ends leave the two things' sides (it started in empty space)
          if (!atEnd(pts[0], a) || !atEnd(pts[pts.length - 1], b)) continue;
          const me = placed(pts, [a.key, b.key]);
          const n = others.reduce((t, p) => { const m = meet(me, p); return t + m.cross * 3 + m.touch * 2 + m.bunch; }, 0);
          if (n === 0) return o;
        }
        // format version 10: no clean spot beside it: a way of its own, as a send with no connector takes
        ownWay.add(i); return 0;
      }
      for (const x of [0, 25, -25, 45, -45, 70, -70, 100, -100]) for (const o of [7, -7, 12, -12, 17, -17, 23, -23]) { const pts = sampleGeom(connGeom(a, b, a.kind, b.kind, false, o, eb + x)); if (!words.some((r) => lineThrough(pts, r, 0)) && !things.some((r) => lineThrough(pts, r, -4))) { extra[i] = x; return o; } }
      return 7;
    });
    // each hop: its connector's route and bow; a hop drawn with no connector under it gets a route of its own
    const rts: (Route | null)[] = [];
    const bends = path.slice(1).map((k, i) => {
      const a = byKey.get(path[i])!, b = byKey.get(k)!; const eb = edgeBend.get(`${a.key}>${b.key}`);
      if (eb != null && !ownWay.has(i)) { rts.push(edgeRt.get(`${a.key}>${b.key}`) ?? null); return eb + extra[i]; }
      if (snd.show === "token") { rts.push(null); return 0; }
      // a hop with a way of its own beside a connector (ownWay) also keeps off the connectors' labels
      const hw = [...f.boxes.filter((x) => x.lbl && x.key !== a.key && x.key !== b.key).map((x) => x.lbl!), ...(ownWay.has(i) ? f.edges.map((x) => x.lr).filter((r): r is Rect => !!r) : [])], hs = shapes.filter((r) => !(r.x === a.x && r.y === a.y) && !(r.x === b.x && r.y === b.y));
      let hop = routeHop(a, b, hw, hs, lines, lineKeys, offs[i], ownWay.has(i) ? f.boxes.filter((x) => x.container && x.key > 0) : undefined);
      // kept clear of the containers it may wiggle (a grid path's small steps): then the way without them
      if (ownWay.has(i) && hop.rt && wiggles(sampleGeom(connGeom(a, b, a.kind, b.kind, false, offs[i], 0, hop.rt))) > 0) hop = routeHop(a, b, hw, hs, lines, lineKeys, offs[i]);
      rts.push(hop.rt);
      return hop.bend;
    });
    const geo = path.slice(1).map((k, i) => { const a = byKey.get(path[i])!, b = byKey.get(k)!; return connGeom(a, b, a.kind, b.kind, false, offs[i], bends[i], rts[i]); });
    const own = snd.show === "token" ? [] : geo.map((g) => sampleGeom(g));
    lines.push(...own);
    if (snd.show !== "token") lineKeys.push(...path.slice(1).map((k, i): [number, number] => [path[i], k]));
    return { snd, path, offs, bends, rts, geo, own, ownWay };
  });
  for (const pl of plan) {
    if (!pl) continue;
    work(16 + pl.path.length * (f.edges.length + lines.length * (1 + pl.own.length)));
    const { snd, path, offs, bends, rts, geo, own, ownWay } = pl;
    // format version 10: a hop drawn on its connector is one wire with it: the connector's line is its own too
    const ridden = new Set(path.slice(1).map((k, i) => (offs[i] === 0 && !ownWay.has(i) ? f.edges.findIndex((e) => (e.from === path[i] && e.to === k) || (e.from === k && e.to === path[i])) : -1)).filter((j) => j >= 0 && f.edges[j].rt));
    const others = lines.filter((l, j) => !own.includes(l) && !ridden.has(j));
    const g: SendGeom = { show: snd.show, label: snd.label, cc: snd.family ? f.families.findIndex((c) => c.id === snd.family) + 1 : 0, path, offs, bends, ...(rts.some(Boolean) ? { rts } : {}), chip: null, alabel: null, seg: 0, t: 0.5, ox: 0, oy: 0 };
    const last = geo[geo.length - 1], end = byKey.get(path[path.length - 1])!;
    // a send that leaves its token (send ... as m) has no chip of its own: the token entity is its chip
    if (snd.label && snd.show === "token" && !snd.as) {
      // (a stream's and an arrow's label are placed below, by the middle of the path)
      // the token rests at its end, by the side it came in on; its chip sits next to it, off every label
      const text = cut(snd.label, CHIP.font, CHIP.maxW);
      const w = chipW(text, CHIP.font) + 2 * CHIP.px, h = CHIP.h;
      const dot: Rect = { x: last.Q.x - 6, y: last.Q.y - 6, w: 12, h: 12 };
      // format version 10: then a ring of spots near the dot, before the spots around the thing it rests at
      const ring: { r: Rect; side: "up" | "down" | "left" | "right" }[] = [];
      for (const d of [8, 14, 20, 26]) for (let k = 0; k < 16; k++) { const ang = (k * Math.PI) / 8, ux = Math.cos(ang), uy = Math.sin(ang); const cx = last.Q.x + ux * (d + w / 2), cy = last.Q.y + uy * (d + h / 2); ring.push({ r: { x: cx - w / 2, y: cy - h / 2, w, h }, side: Math.abs(ux) > Math.abs(uy) ? (ux > 0 ? "right" : "left") : uy > 0 ? "down" : "up" }); }
      const best = pick([...around(dot, w, h, ["up", "right", "down", "left"], 3), ...ring, ...around(end, w, h, ["up", "down", "right", "left"])], labels, shapes, soft, lines, nearTo([last.Q], f.boxes));
      g.chip = mark({ kind: "send", at: end.key, text: snd.label, lines: [text], r: best.r, side: best.side });
    } else if (snd.label && !snd.as) {
      // an arrow's label sits by the middle of the arrow, beside it if the middle is taken
      const lines = wrapEven(snd.label, CHIP.font, chipOf(f.phone).edgeW, 2);
      const w = Math.max(linesW(lines, CHIP.font) * 1.08, ...lines.map((l) => chipW(l, CHIP.font))) + 2 * CHIP.px, h = lines.length * CHIP.lh + 4; // its words are semi-bold (format version 10: measured widths, tools/chipw.ts)
      const mid = Math.floor((geo.length - 1) / 2), gm = geo[mid];
      const cands: { r: Rect; t: number; ox: number; oy: number }[] = [];
      // format version 10: more spots along the arrow (from 0.2 to 0.8), so its label stays by it
      for (const t of [0.5, 0.38, 0.62, 0.3, 0.7, 0.44, 0.56, 0.24, 0.76, 0.2, 0.8]) for (const o of [h / 2 + 6, -(h / 2 + 6), 0, h + 10, -(h + 10)]) { const p = bezOff(gm, t, o), q = bezAt(gm, t); cands.push({ r: { x: p.x - w / 2, y: p.y - h / 2, w, h }, t, ox: p.x - q.x, oy: p.y - q.y }); }
      // then rings around the middle of the arrow, further and further out
      const q = bezAt(gm, 0.5);
      for (const rr of [w / 2 + 14, w / 2 + 34, w / 2 + 60, w / 2 + 90]) for (let k = 0; k < 12; k++) { const ox = Math.cos((k * Math.PI) / 6) * rr, oy = Math.sin((k * Math.PI) / 6) * rr * 0.6; cands.push({ r: { x: q.x + ox - w / 2, y: q.y + oy - h / 2, w, h }, t: 0.5, ox, oy }); }
      const best = pick(cands, labels, shapes, soft, others, nearTo(sampleGeom(gm, 24), []));
      g.seg = mid; g.t = best.t; g.ox = best.ox; g.oy = best.oy;
      g.alabel = mark({ kind: "alabel", at: path[mid + 1], text: snd.label, lines, r: best.r, side: "on" });
    }
    if (snd.landed) g.landed = true;
    sends.push(g);
  }
  for (const sy of fx?.says ?? []) {
    work(16 + sy.text.length * 4);
    const a = byKey.get(sy.key);
    if (!a) continue;
    const words = wrapEven(plain(sy.text), CHIP.font + 0.5, chipOf(f.phone).sayW, 2);
    const wordsW = hasMarks(sy.text) ? Math.max(...lineRuns(sy.text, words, CHIP.font + 0.5, textW).map((r) => r.w)) : linesW(words, CHIP.font + 0.5);
    const w = wordsW + 22, h = words.length * CHIP.lh + 10;
    // then rings around the thing, further and further out
    const c = center(a), ring: { r: Rect; side: "up" | "down" | "left" | "right" }[] = [];
    for (const rr of [0.5, 0.75, 1.05, 1.4, 1.8]) for (let k = 0; k < 16; k++) { const ang = (k * Math.PI) / 8, ox = Math.cos(ang) * (a.w / 2 + w / 2 + 12) * rr * 1.4, oy = Math.sin(ang) * (a.h / 2 + h / 2 + 12) * rr * 1.6; ring.push({ r: { x: c.x + ox - w / 2, y: c.y + oy - h / 2, w, h }, side: Math.abs(ox) > Math.abs(oy) ? (ox > 0 ? "right" : "left") : oy > 0 ? "down" : "up" }); }
    // say <id> above|below|left|right: that side first (format version 9); still never over a word
    const want = ({ above: "up", below: "down", left: "left", right: "right" } as const)[sy.at as "above"] ?? null;
    const sides: ("up" | "down" | "left" | "right")[] = want ? [want, ...(["up", "down", "right", "left"] as const).filter((x) => x !== want)] : ["up", "down", "right", "left"];
    const best = pick([...around(a, w, h, sides, 9), ...(want ? ring.filter((x) => x.side === want) : []), ...ring], labels, shapes, soft, lines);
    mark({ kind: "say", at: a.key, text: sy.text, lines: words, r: best.r, side: best.side });
  }
  const touched = [...new Set(touchedIds.map((id) => byId.get(id)?.key).filter((k): k is number => k != null))];
  // the lines count too (format version 10): a line that runs around things stays in the story's view
  const lineBox = lines.filter((l) => l.length).map((l) => { const xs = l.map((p) => p.x), ys = l.map((p) => p.y); const x = Math.min(...xs), y = Math.min(...ys); return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }; });
  const bounds = marks.length || lineBox.length ? union([f.bounds, ...marks.map((m) => m.r), ...lineBox]) : f.bounds;
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
    if (b.faint) continue; // a closed thing's inside shows no words
    if (b.kind === "layer" || b.kind === "table" || (b.container && b.head && b.label)) m = Math.min(m, z.head);
    if (b.lines?.length && !b.container && b.kind !== "token") m = Math.min(m, b.kind === "field" ? fieldFont(z) : z.font);
    if (b.kind === "field" && (b.ent.field?.tags.length ?? 0)) m = Math.min(m, 11);
  }
  return m;
}
// the least words a phone may show, in pixels on the screen, and the least scale that gives them
export const MIN_PX = 11;
export const phoneLeast = (f: Frame) => MIN_PX / minFont(f);
// the story's view of a step on a stage of shape ar, px pixels wide: what the author framed (camera, focus, else
// everything) plus what the step touches, with a margin. On a stage px wide it is drawn no smaller than the scale at
// which its smallest words are MIN_PX on the screen (format version 10, tools/readable.ts: on every screen; version 8
// did this on a phone only); when what the step touches does not fit at that scale, it frames the step's focus. The
// reader drags to see the rest
export function storyView(f: Frame, ar: number, px = 0): Rect {
  let t = touchedRect(f);
  // the least scale, where the smallest words reach MIN_PX (small words are hard to read)
  const least = leastScale(f, px);
  // (format version 10) when what the step touches does not fit at the least scale, the camera frames the step's
  // focus: where it ends up, with as much of the way there as fits
  if (px && t) { const pf = storyFocus(f, px / least, ar); if (pf?.cut) t = union(pf.keep); }
  // the author's camera words (format version 9, tools/camera.ts): close flies in (a tight margin, up to CLOSE_SCALE
  // times natural size), far pulls back (the framed area grows on every side)
  const close = !!f.view?.close && f.look != null, far = !!f.view?.far;
  const want0 = pad(t ? union([f.camera, t]) : f.camera, close ? 4 : MARGIN);
  const want = far ? pad(want0, Math.max(want0.w, want0.h) * FAR_GROW) : want0;
  // never drawn larger than 1.5 times natural size, so a small scene does not fill the stage with huge words
  const most = close ? CLOSE_SCALE : 1.5;
  let v = fitAspect(want, ar, px ? Math.max(320 * 0.5 * (1.5 / most), px / most) : 320 * (1.5 / most));
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
  // format version 9: the view never runs past the scene on one side while it cuts it on the other: it stays within
  // the scene (with a margin), or is centred on it where the scene is smaller than the view
  const inScene = (v0: Rect): Rect => {
    const S = pad(f.bounds, MARGIN);
    const axis = (p: number, s: number, bp: number, bs: number) => (s >= bs ? bp + (bs - s) / 2 : Math.min(Math.max(p, bp), bp + bs - s));
    const v2 = { ...v0, x: axis(v0.x, v0.w, S.x, S.w), y: axis(v0.y, v0.h, S.y, S.h) };
    return !t || inside(pad(t, 4), v2) ? v2 : v0;
  };
  v = inScene(v);
  // format version 9: on a laptop the view never cuts a thing (or a container's heading) in half at its edge: it grows
  // to show it whole if it may, else it slides to take it in or leave it out, as long as what the step touches stays in
  { // (format version 10, fix-edge: on a phone too, growing no further than the least size)
    const maxW = px ? Math.max(v.w, px / least) : Infinity;
    const tr = t ? pad(t, 4) : null;
    const keeps = (r: Rect) => !tr || inside(tr, r);
    for (let n = 0; n < 8; n++) {
      const cut = cutBy(f, v);
      if (!cut.length) break;
      const r = cut[0];
      const g = fitAspect(pad(union([v, r]), 6), ar);
      if (g.w <= maxW + 0.5 && keeps(g)) { v = g; continue; }
      // slide: just enough to take it in, else just enough to leave it out
      const dIn = { x: r.x < v.x ? r.x - 6 - v.x : r.x + r.w > v.x + v.w ? r.x + r.w + 6 - (v.x + v.w) : 0, y: r.y < v.y ? r.y - 6 - v.y : r.y + r.h > v.y + v.h ? r.y + r.h + 6 - (v.y + v.h) : 0 };
      const dOut = { x: r.x < v.x ? r.x + r.w + 2 - v.x : r.x + r.w > v.x + v.w ? r.x - 2 - (v.x + v.w) : 0, y: r.y < v.y ? r.y + r.h + 2 - v.y : r.y + r.h > v.y + v.h ? r.y - 2 - (v.y + v.h) : 0 };
      const vin = { ...v, x: v.x + dIn.x, y: v.y + dIn.y }, vout = { ...v, x: v.x + dOut.x, y: v.y + dOut.y };
      if (Math.abs(r.w) <= v.w && Math.abs(r.h) <= v.h && keeps(vin) && cutBy(f, vin).length < cut.length) { v = vin; continue; }
      if (keeps(vout) && cutBy(f, vout).length < cut.length) { v = vout; continue; }
      break;
    }
  }

  { const v2 = inScene(v); if (px && px < NARROW ? true : cutBy(f, v2).length <= cutBy(f, v).length) v = v2; }
  // (format version 10, tools/edge10.ts) on every screen it then slides to cut the fewest things at its edge
  return slideWhole(f, v, t);
}
// what a view cuts in half: things (with their words) and container headings partly in it, biggest first
export function cutBy(f: Frame, v: Rect): Rect[] {
  const rs: Rect[] = [];
  for (const b of f.boxes) {
    // a layer band's name; a thing with its words; a container's heading, and a container that would fit in the view
    if (b.key <= 0) { if (b.lbl && hit(b.lbl, v, -1) && !inside(b.lbl, v)) rs.push(b.lbl); continue; }
    if (b.hidden) continue; // not drawn (format version 10)
    // (format version 10) in a close-up, a thing inside a closed neighbour shows no words: it may be cut too
    if (f.view?.close && b.faint) continue;
    const r = b.container ? b.lbl : b.lbl ? union([b, b.lbl]) : b;
    if (r && hit(r, v, -1) && !inside(r, v)) rs.push(r);
    // (not in a close-up, camera close or zoom into: there its neighbours may be cut)
    if (!f.view?.close && b.container && b.w <= v.w && b.h <= v.h && hit(b, v, -1) && !inside(b, v)) rs.push(b);
  }
  // (format version 11) an arrow's label, a send's label and speech are words too: the view takes them in whole or leaves them out
  const drawn = new Set(f.boxes.filter((b) => !b.hidden && !b.faint).map((b) => b.key));
  for (const e of f.edges) if (e.lr && e.label && drawn.has(e.from) && drawn.has(e.to) && hit(e.lr, v, -1) && !inside(e.lr, v)) rs.push(e.lr);
  for (const m of f.marks) if ((m.kind === "say" || m.kind === "alabel") && hit(m.r, v, -1) && !inside(m.r, v)) rs.push(m.r);
  return rs.sort((p, q) => q.w * q.h - p.w * p.h);
}
const inside = (r: Rect, v: Rect) => r.x >= v.x - 0.5 && r.y >= v.y - 0.5 && r.x + r.w <= v.x + v.w + 0.5 && r.y + r.h <= v.y + v.h + 0.5;
// in frame: each touched thing (with its words) and each mark is fully inside the view and outside every control
// (controls: rectangles in world units); returns how many there are and how many are in frame
export function inFrame(f: Frame, v: Rect, controls: Rect[] = []): { total: number; ok: number } {
  const set = new Set(f.touched);
  // (format version 10) a step whose touched things do not fit the view at the least scale counts its focus
  const pf = storyFocus(f, v.w, v.w / v.h);
  if (pf?.cut) { const ok = pf.keep.filter((r) => inside(r, v) && !controls.some((c) => hit(r, c))).length; return { total: pf.keep.length, ok }; }
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
// own2 (format version 10): a send on its connector: the connector's label is its own too
export interface Line { pts: Pt[]; own: Rect | null; own2?: Rect | null; send: boolean; ends: [number, number] }
// a send's hop drawn on its connector (format version 10): no offset, the connector's own route
// the connectors a send of this frame runs along (the 3D labels rule: such a connector takes part in the step)
export const ridden = (f: Frame): Set<string> => { const out = new Set<string>(); work(f.sends.reduce((n, g) => n + g.path.length, 0) * (2 + f.edges.length)); for (const g of f.sends) for (let k = 0; k + 1 < g.path.length; k++) { const e = ridesOn(f, g, k); if (e) out.add(e.key); } return out; };
export function ridesOn(f: Frame, g: SendGeom, k: number): Edge | null {
  if (g.show === "token" || g.offs[k]) return null;
  const a = g.path[k], b = g.path[k + 1], rt = g.rts?.[k] ?? null;
  const e = edgeFor(f.edges, a, b);
  if (!e || !e.rt || !rt) return null;
  const want = e.from === a ? e.rt : flipRoute(e.rt);
  return want.sa === rt.sa && want.sb === rt.sb && !rt.way === !want.way && Math.abs(want.oa - rt.oa) < 0.5 && Math.abs(want.ob - rt.ob) < 0.5 ? e : null;
}
export function frameLines(f: Frame): Line[] {
  // (each connector looks for a send that rides it: every hop of every send, each a pass over the connectors)
  const P = f.sends.reduce((n, g) => n + g.path.length, 0);
  work(f.boxes.length + f.edges.length * (8 + P * f.edges.length) + P * (8 + f.edges.length));
  const byKey = new Map(f.boxes.map((b) => [b.key, b]));
  // a routed line (format version 10): its straight runs as they are, each rounded corner in short pieces
  const smp = (g: Geom, n = 72) => (g.segs ? routeLine(g) : Array.from({ length: n + 1 }, (_, i) => bezAt(g, i / n)));
  const out: Line[] = [];
  // a connector a send runs on: that send's label is its own too (one wire)
  const rider = (e: Edge) => { for (const g of f.sends) if (g.alabel != null && g.path.some((_, k) => k + 1 < g.path.length && ridesOn(f, g, k)?.key === e.key)) return f.marks[g.alabel]?.r ?? null; return null; };
  for (const e of f.edges) { const a = byKey.get(e.from), b = byKey.get(e.to); if (a && b) out.push({ pts: smp(edgeGeom(e, a, b)), own: e.lr, own2: rider(e), send: false, ends: [a.key, b.key] }); }
  for (const g of f.sends) {
    if (g.show === "token") continue;
    const own = g.alabel != null ? f.marks[g.alabel]?.r ?? null : null;
    for (let k = 0; k + 1 < g.path.length; k++) { const a = byKey.get(g.path[k]), b = byKey.get(g.path[k + 1]); if (a && b) out.push({ pts: smp(connGeom(a, b, a.kind, b.kind, false, g.offs[k], g.bends[k] ?? 0, g.rts?.[k] ?? null)), own, own2: ridesOn(f, g, k)?.lr ?? null, send: true, ends: [a.key, b.key] }); }
  }
  return out;
}
// does a polyline run through a rectangle (shrunk by m, so a line that only grazes an edge does not count)?
export function lineThrough(pts: Pt[], r: Rect, m = 1.5): boolean {
  work(pts.length);
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
    if (w.r === ln.own || w.r === ln.own2) continue;
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
  const ch = (id: string | null) => (work(kids.length), kids).filter((k) => (s.ents[k].under ?? null) === id);
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
function graphLayout(s: State, kids: string[], size: Map<string, [number, number]>, set: (k: string, x: number, y: number) => void, dir: string, gap: number, links: [string, string][], room = 0, endRoom = 0, fit = 0, apart = false): [number, number] {
  // a label sits beside a vertical arrow and across a horizontal one: leave it room
  const LAYER = endRoom + (dir === "down" ? Math.max(50, Math.min(90, room ? 2 * CHIP.lh + 30 : 0)) : Math.max(84, Math.min(CHIP.edgeW + 50, room + 40)));
  const idx = new Map(kids.map((k, i) => [k, i]));
  work(4 * kids.length + 8 * links.length);
  // a connector between anything inside two children counts as an edge between the two children
  const owner = (id: string): string | null => { let e = s.ents[id]; while (e) { if (idx.has(e.id)) return e.id; e = e.parent ? s.ents[e.parent] : (undefined as any); } return null; };
  const out = new Map<string, Set<string>>(kids.map((k) => [k, new Set()]));
  for (const [x, y] of links) { const a = owner(x), b = owner(y); if (a && b && a !== b) out.get(a)!.add(b); }
  if (apart) {
    // format version 11: things no line joins are no reason to bend one: each joined group is its own block
    const seen = new Set<string>(), groups: string[][] = [];
    for (const k of kids) {
      if (seen.has(k)) continue;
      const g = new Set([k]), todo = [k];
      seen.add(k);
      for (let u = todo.pop(); u !== undefined; u = todo.pop()) for (const v of kids) if (!seen.has(v) && (out.get(u)!.has(v) || out.get(v)!.has(u))) { seen.add(v); g.add(v); todo.push(v); }
      groups.push(kids.filter((x) => g.has(x)));
    }
    if (groups.length > 1) {
      // blocks go across the way the lines run, and under each other where they would not fit
      const GROUP_GAP = gap * 2;
      let x = 0, y = 0, rowH = 0, W = 0, H = 0;
      for (const g of groups.sort((p, q) => q.length - p.length)) {
        const at = new Map<string, [number, number]>();
        const [w, h] = graphLayout(s, g, size, (k, a, b) => at.set(k, [a, b]), dir, gap, links, room, endRoom, fit);
        if (dir === "down" && fit && x && x + w > fit) { x = 0; y += rowH + LAYER; rowH = 0; }
        for (const [k, [a, b]] of at) set(k, x + a, y + b);
        W = Math.max(W, x + w); H = Math.max(H, y + h); rowH = Math.max(rowH, h);
        if (dir === "down") x += w + GROUP_GAP; else y += h + GROUP_GAP;
      }
      return [W, H];
    }
  }
  // drop the edges that close a loop (depth-first, in the order the author wrote things)
  const state = new Map<string, number>(); const back = new Set<string>();
  const dfs = (u: string) => { state.set(u, 1); for (const v of out.get(u)!) { if (state.get(v) === 1) back.add(`${u}>${v}`); else if (!state.get(v)) dfs(v); } state.set(u, 2); };
  for (const k of kids) if (!state.get(k)) dfs(k);
  const layer = new Map<string, number>();
  const lay = (u: string): number => { if (layer.has(u)) return layer.get(u)!; layer.set(u, 0); work(kids.length); let L = 0; for (const k of kids) if (out.get(k)!.has(u) && !back.has(`${k}>${u}`)) L = Math.max(L, lay(k) + 1); layer.set(u, L); return L; };
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
      const bc = (k: string) => { work(kids.length); const ps = kids.filter((p) => layer.get(p) === L - 1 && out.get(p)!.has(k)); return ps.length ? ps.reduce((a, p) => a + pos.get(p)!, 0) / ps.length : pos.get(k)!; };
      layers[L].sort((a, b) => bc(a) - bc(b) || idx.get(a)! - idx.get(b)!);
      setPos();
    }
  }
  const across = (k: string) => (dir === "down" ? size.get(k)![0] : size.get(k)![1]);
  const along = (k: string) => (dir === "down" ? size.get(k)![1] : size.get(k)![0]);
  // format version 11: a rank too wide for a scene that shows whole goes over several rows
  const WRAP_CHANNEL = 56, split = new Set<string[]>();
  if (fit && dir === "down") {
    for (let L = layers.length - 1; L >= 0; L--) {
      const rows: string[][] = [[]];
      let w = -gap;
      for (const k of layers[L]) {
        if (rows[rows.length - 1].length && w + gap + across(k) > fit) { rows.push([]); w = -gap; }
        rows[rows.length - 1].push(k); w += gap + across(k);
      }
      if (rows.length > 1) { layers.splice(L, 1, ...rows); for (const r of rows) split.add(r); }
    }
  }
  // rows of one rank leave a channel for the lines to the row behind
  const gapIn = layers.map((l, L) => (split.has(l) && L + 1 < layers.length && l.length > 1 ? Math.max(gap, WRAP_CHANNEL) : gap));
  const span = layers.map((l, L) => l.reduce((a, k) => a + across(k) + gapIn[L], -gapIn[L]));
  const maxSpan = Math.max(...span);
  let at = 0;
  layers.forEach((l, L) => {
    const thick = Math.max(...l.map(along));
    let c = (maxSpan - span[L]) / 2;
    for (const k of l) {
      const off = (thick - along(k)) / 2;
      if (dir === "down") set(k, c, at + off); else set(k, at + off, c);
      c += across(k) + gapIn[L];
    }
    at += thick + LAYER;
  });
  at -= LAYER;
  return dir === "down" ? [maxSpan, at] : [at, maxSpan];
}

// ---------------------------------------------------------------- everything at once, for doccheck, the LLM view and the renderer
// warnings: what doccheck says but does not refuse (a token's label too long for its chip)
// beats[k]: the frames at the end of each beat of step k but the last (empty for a step of one beat)
// nest (format version 10): the scenes inside the scene, which one each step is in, and each scene on its own (tools/scenes.ts)
// src (format version 10): what it was compiled from, so the phone can compile its own layouts (tools/phone.ts)
export interface Compiled { scene: Scene; frames: Frame[]; fx: Fx[]; errors: SceneError[]; warnings: SceneError[]; aspect: number; beats?: Frame[][]; nest?: Nest; src?: { head: string; steps: { title: string; raw: string; line: number }[]; base: number; info: Record<string, string> } }
export const TOKEN_CHARS = 18;
// below this stage width (pixels) a scene is drawn with its narrow layout when it is wide (more than 1.4 wide per unit
// of height), or when the narrow layout keeps whole more steps at readable words (format version 10, tools/phone.ts)
export const NARROW = 480;
export const useNarrow = (c: Compiled, px: number) => px > 0 && px < NARROW && narrowWins(c, px);
// what a phone stage (under NARROW pixels) draws: the phone's tokens, and the narrow layout when the scene is wide
export const phoneInfo = (wide: Compiled, info: Record<string, string>, px: number): Record<string, string> => ({ ...info, phone: "1", ...(useNarrow(wide, px) ? { narrow: "1" } : {}) });
// ---------------------------------------------------------------- kept slots (format version 9)
// Things a step does not change stay where they are. In a group, a grid, a graph and the stage itself, a thing that
// leaves (moves out, is removed, or is not added yet) leaves its slot empty, so the things around it do not close up:
// each such container lays out, on every step, every thing it ever holds, in one order that agrees with every step,
// and an absent thing is a slot of its size that is never drawn. Data structures (array, list, stack, queue, bucket,
// table) and trees close up on purpose: a queue moving up is what a pop means. When the order of a container's things
// changes between steps (the author moved one before another), that container closes up as before.
const SLOT_KINDS = new Set(["group", "graph", "grid"]);
const ROOT = "\u0000root";
// keep: once the sizes are known, two things that are never in a container at the same time, of the same kind and
// size, share one slot (a job that leaves a worker and the next job that comes in sit in the same place)
export function keepSlots(states: State[], keep?: Map<string, [number, number]>): State[] {
  const lists = new Map<string, { k: number; l: string[] }[]>();
  const ref = new Map<string, Ent>(); // container > thing: the thing as it is there, the first time
  const visible = (s: State, ids: string[]) => ids.filter((k) => s.ents[k] && !isOverlay(s.ents[k].kind));
  states.forEach((s, k) => {
    const add = (c: string, kids: string[]) => { work(4 + kids.length * 3); const l = lists.get(c) ?? []; l.push({ k, l: kids }); lists.set(c, l); for (const x of kids) if (!ref.has(`${c}>${x}`)) ref.set(`${c}>${x}`, s.ents[x]); };
    add(ROOT, visible(s, s.root));
    work(Object.keys(s.ents).length);
    for (const e of Object.values(s.ents)) if (SLOT_KINDS.has(e.kind) && e.layout !== "tree") add(e.id, visible(s, e.kids));
  });
  // one order that agrees with every step: a topological order of "comes before", ties by first appearance; then the
  // slots: each thing takes the first slot it can share, else a new one at the end
  const slotsOf = new Map<string, string[][]>();
  for (const [c, ls] of lists) {
    // (every check below that looks through a list is counted: T, the things of every step together)
    const T = ls.reduce((n, { l }) => n + l.length, 0);
    work(ls.length + T);
    // (every thing in the order it first appears: a set says what is already in the list)
    const seen: string[] = [], seenSet = new Set<string>();
    for (const { l } of ls) for (const x of l) if (!seenSet.has(x)) { seenSet.add(x); seen.push(x); }
    if (ls.every(({ l }) => l.length === seen.length)) continue; // the same things on every step: nothing to keep
    const before = new Map(seen.map((x) => [x, new Set<string>()]));
    for (const { l } of ls) for (let i = 0; i + 1 < l.length; i++) before.get(l[i + 1])!.add(l[i]);
    const out: string[] = [], ordered = new Set<string>();
    const left = [...seen];
    while (left.length) {
      const i = left.findIndex((x) => (work(2 + before.get(x)!.size), [...before.get(x)!].every((p) => ordered.has(p))));
      if (i < 0) break;
      work(left.length);
      const x = left.splice(i, 1)[0];
      out.push(x); ordered.add(x);
    }
    if (left.length) continue; // the author reordered things here: it closes up
    // (the steps each thing is here in: one set per step)
    work(T + out.length * ls.length);
    const inStep = ls.map(({ l }) => new Set(l));
    const life = new Map(out.map((x) => [x, new Set(ls.filter((_, i) => inStep[i].has(x)).map(({ k }) => k))]));
    const sizeKey = (x: string) => { const e = ref.get(`${c}>${x}`)!; const z = keep?.get(`${e.kind}:${x}`); return z ? `${e.kind}:${Math.round(z[0])}x${Math.round(z[1])}` : null; };
    const slots: string[][] = [], slotOf = new Map<string, number>();
    for (const x of out) {
      let at = -1;
      if (keep) for (let si = 0; si < slots.length && at < 0; si++) {
        const occ = slots[si];
        work(4 + occ.length * (4 + ls.length) + 2 * T);
        if (sizeKey(x) == null || occ.some((o) => sizeKey(o) !== sizeKey(x))) continue;
        if (occ.some((o) => [...life.get(o)!].some((k) => life.get(x)!.has(k)))) continue;
        const fits = ls.every(({ l }) => { const p = l.indexOf(x); if (p < 0) return true; return l.every((y, j) => { const sy = slotOf.get(y); return sy == null || y === x || (sy < si ? j < p : sy > si ? j > p : true); }); });
        if (fits) at = si;
      }
      if (at < 0) { slots.push([x]); at = slots.length - 1; } else slots[at].push(x);
      slotOf.set(x, at);
    }
    slotsOf.set(c, slots);
  }
  if (!slotsOf.size) return states;
  return states.map((s0, k) => {
    const s: State = clone(s0);
    for (const [c, slots] of slotsOf) {
      work(4 + slots.length * 2);
      if (c !== ROOT && !s.ents[c]) continue;
      const kids = c === ROOT ? s.root : s.ents[c].kids;
      const here = new Set(visible(s, kids));
      const overlays = kids.filter((x) => !here.has(x));
      const next: string[] = [];
      for (const occ of slots) {
        const real = occ.find((x) => here.has(x));
        if (real) { next.push(real); continue; }
        // an empty slot: the room of the thing that was here last (or comes next)
        work(occ.length * (2 + Math.log2(occ.length + 1)) * (lists.get(c) ?? []).reduce((n, e) => n + 1 + e.l.length, 0));
        const lastK = (x: string) => Math.max(-1, ...(lists.get(c) ?? []).filter((e) => e.k <= k && e.l.includes(x)).map((e) => e.k));
        const id = [...occ].sort((p, q) => lastK(q) - lastK(p))[0];
        const r = ref.get(`${c}>${id}`)!;
        const gid = `${id}\u0000slot\u0000${c}`;
        s.ents[gid] = { ...JSON.parse(JSON.stringify(r)), id: gid, ghost: id, kids: [], parent: c === ROOT ? null : c, anchor: null, under: null, side: null, note: "" };
        next.push(gid);
      }
      work(here.size * (1 + next.length));
      for (const x of here) if (!next.includes(x)) next.push(x);
      const all = [...next, ...overlays];
      if (c === ROOT) s.root = all; else s.ents[c].kids = all;
    }
    return s;
  });
}

// every compile draws from a budget of its own (a part of the page's, in parse()): over it, it throws a BudgetError
export function compileScene(head: string, steps: { title: string; raw: string; line: number }[], base: number, info: Record<string, string> = {}): Compiled {
  return metered(animPartBudget(), () => {
    work(head.length + steps.reduce((n, s) => n + s.raw.length + s.title.length + 8, 0));
    const { scene, errors } = parseScene(head, steps, base, info);
    // format version 10: a scene with scenes inside it compiles each on its own (tools/scenes.ts)
    const c = scene.subs?.length || scene.steps.some((st) => st.ops.some((o) => o.op === "enter" || o.op === "leave")) ? compileNested(scene, errors, compileParsed) : compileParsed(scene, errors);
    c.src = { head, steps, base, info };
    return c;
  });
}
// one scene, parsed: played, laid out step by step, sized once for the whole story
export function compileParsed(scene: Scene, errors: SceneError[]): Compiled {
  const r = play(scene);
  errors.push(...r.errors);
  const story: [string, string][] = [];
  for (const st of r.states) { work(1 + st.conns.length * (1 + story.length)); for (const c of st.conns) if (!story.some(([a, b]) => a === c.from && b === c.to)) story.push([c.from, c.to]); }
  // one size per thing for the whole story: lay out every step, keep each thing's largest size, lay out again until
  // nothing grows (a lift that fills with people, or moves to another floor, keeps its size; so does its floor)
  const labelsOf = [...scene.setup, ...scene.steps.flatMap((st) => st.ops)].flatMap((o) => (o.op === "conn" ? [o.label] : o.op === "send" && o.show !== "token" ? [o.label] : []));
  work(labelsOf.reduce((n, l) => n + 8 + (l ? l.length * 8 : 0), 0));
  const room = Math.max(0, ...labelsOf.filter(Boolean).map((l) => Math.max(...wrapEven(l, CHIP.font, chipOf(scene.attrs.phone).edgeW, 2).map((x) => textW(x, CHIP.font))) + 2 * CHIP.px));
  let keep = new Map<string, [number, number]>();
  let frames: Frame[] = [];
  // the story in order: each step's beats, then the step; laid out together, so sizes and kept slots agree
  const seq: State[] = [], where: { k: number; b: number }[] = [];
  r.states.forEach((st, k) => { (r.subs[k] ?? []).forEach((x, b) => { seq.push(x); where.push({ k, b }); }); seq.push(st); where.push({ k, b: -1 }); });
  let slotted = keepSlots(seq);
  const grow = () => {
    for (let pass = 0; pass < 6; pass++) {
      frames = slotted.map((st) => layoutState(st, { ...scene.attrs, room }, story, keep));
      let grew = false;
      const next = new Map(keep);
      for (const f of frames) for (const b of f.boxes) {
        if (b.key < 0 || b.kind === "token" || b.kind === "pointer" || b.kind === "row" || b.kind === "field") continue;
        const k = `${b.kind}:${b.id}`, o = next.get(k);
        if (!o || b.w > o[0] + 0.5 || b.h > o[1] + 0.5) { next.set(k, [Math.max(b.w, o?.[0] ?? 0), Math.max(b.h, o?.[1] ?? 0)]); grew = true; }
      }
      keep = next;
      if (!grew) break;
    }
  };
  grow();
  // now that sizes are known, things never in a container together share a slot (format version 9); containers are
  // measured again with that plan (what they hold keeps its size)
  slotted = keepSlots(seq, keep);
  const conts = new Set(seq.flatMap((st) => Object.values(st.ents).filter((e) => isContainer(e.kind)).map((e) => `${e.kind}:${e.id}`)));
  keep = new Map([...keep].filter(([k]) => !conts.has(k)));
  grow();
  const deco = (fs: Frame[]) => fs.map((f, i) => decorate(f, r.fx[i], r.fx[i]?.touched ?? []));
  // split the laid-out sequence into the steps' frames and their beats' frames
  const beatFrames: Frame[][] = r.states.map(() => []);
  // format version 10 (tools/depth.ts): what is lifted, and what fades (outside a deep zoom, or not lifted)
  const mainOf = (all: Frame[]) => { const out: Frame[] = []; all.forEach((f, j) => { const w = where[j]; work(8 + f.boxes.length * 8); applyDepth(f, slotted[j], r.fx[w.k]?.touched ?? []); if (w.b < 0) out.push(f); else beatFrames[w.k][w.b] = decorate(f, undefined, []); }); return out; };
  frames = deco(mainOf(frames));
  // each container's heading slides along its top (left, right, middle ...) to where no line in the whole story
  // crosses it; the same place on every step, so it never jumps
  const heads = new Map<string, number>();
  const lineSets = frames.map((f) => frameLines(f));
  const ids = [...new Set(frames.flatMap((f) => f.boxes.filter((b) => b.container && b.kind !== "record" && b.key > 0 && b.head && b.lbl).map((b) => b.id)))];
  for (const id of ids) {
    let best = 0, bestN = Infinity;
    for (const frac of [0, 1, 0.5, 0.25, 0.75]) {
      let n = 0;
      frames.forEach((f, i) => {
        const b = f.boxes.find((x) => x.id === id && x.container && x.key > 0);
        work(f.boxes.length + lineSets[i].length * 2);
        if (!b?.lbl) return;
        const z = tokens(scene.attrs.phone)[b.size], rr = { ...b.lbl, x: b.x + z.pad + frac * Math.max(0, b.w - 2 * z.pad - b.lbl.w) };
        for (const ln of lineSets[i]) if (!ln.ends.includes(b.key) && lineThrough(ln.pts, rr)) n++;
      });
      if (n < bestN) { bestN = n; best = frac; }
      if (n === 0) break;
    }
    if (best) heads.set(id, best);
  }
  frames = deco(mainOf(slotted.map((st) => layoutState(st, { ...scene.attrs, room }, story, keep, heads))));
  // one stage size for every step, so the buttons never move: the shape of everything the story ever shows
  const all = union([...frames, ...beatFrames.flat()].map((f) => f.bounds));
  // a scene with layers, or one that opens in 3D, gets a taller stage (at most 1.5 wide per unit of height): in 3D its layers stack upward
  const layered = scene.attrs.view === "3d" || frames.some((f) => f.layers.length);
  // the narrow (phone) layout may be taller than wide: down to 0.62 wide per unit of height; (format version 10,
  // fix-edge) so may the phone layout, so a tall scene gets a tall phone stage instead of losing its top or bottom
  const aspect = Math.min(layered ? 1.5 : 2.4, Math.max(scene.attrs.narrow || scene.attrs.phone ? 0.62 : 1.25, all.w / Math.max(all.h, 1)));
  // an entity off-stage (a tree node whose parent is not in the tree) is caught here
  for (const [i, st] of r.states.entries()) for (const e of Object.values(st.ents)) if (e.under && !st.ents[e.under]) errors.push({ line: scene.steps[i]?.line ?? scene.setup[0]?.line ?? 1, msg: `${e.id} hangs under ${e.under}, which is gone` });
  // a token's chip is small: a long label is cut on the stage; say it in the caption or a note, or send an arrow
  const warnings: SceneError[] = [];
  const longTok = (label: string, line: number, what: string) => { if ([...label].length > TOKEN_CHARS) warnings.push({ line, msg: `${what} "${label}" is ${[...label].length} characters; a token shows at most about ${TOKEN_CHARS}, so the stage cuts it. Put the detail in the caption or a note, or write send arrow "..." (an arrow's label may be longer)` }); };
  for (const op of [...scene.setup, ...scene.steps.flatMap((s) => s.ops)]) {
    if (op.op === "send" && op.show === "token" && op.label) longTok(op.label, op.line, "the token's label");
    if (op.op === "add" && op.decl.kind === "token" && op.decl.label) longTok(op.decl.label, op.line, `token ${op.decl.id}`);
    // words on the stage are plain, so a backtick there would be drawn as one
    const on = op.op === "add" ? op.decl.label : op.op === "conn" || op.op === "send" || op.op === "push" || op.op === "layer" || op.op === "family" ? op.label : op.op === "set" ? op.kv.label : null;
    if (on?.includes("`")) warnings.push({ line: op.line, msg: `the label "${on}" has backticks: words on the stage are plain text, so write it without them (inline code works in captions, say and note=)` });
  }
  // the 3D-only words in a scene that is not 3D only; who takes part in each step (the 3D labels rule)
  errors.push(...onlyChecks([...scene.setup, ...scene.steps.flatMap((s) => s.ops)], !!scene.attrs.only3d));
  // (what a zoom reveals takes part in that step too: a hidden inside, and, format version 10 fix, a faint one that opens)
  // (step 1 has no frame before it: there, what a zoom of hidden insides opens was hidden in the setup)
  const zoomed0 = new Set(scene.steps[0]?.ops.flatMap((o) => (o.op === "zoom" && o.id ? o.ids ?? [o.id] : [])) ?? []);
  frames.forEach((f, k) => { work(16 + f.boxes.length * (f.boxes.length + 16) + f.edges.length * 4); const was = new Set(k ? frames[k - 1].boxes.filter((b) => b.hidden || b.faint).map((b) => b.key) : f.boxes.filter((b) => { for (let x = b.ent.parent, n = 0; x && n < 64; x = r.states[0].ents[x]?.parent ?? null, n++) if (zoomed0.has(x) && r.states[0].ents[x]?.hide) return true; return false; }).map((b) => b.key)); const opened = scene.steps[k]?.ops.flatMap((o) => (o.op === "zoom" && o.id ? o.ids ?? [o.id] : [])) ?? []; const p = stepPart(f, k ? frames[k - 1] : null, f.boxes.filter((b) => !b.hidden && !b.faint && was.has(b.key)).map((b) => b.key), opened, ridden); if (p) f.part = p; });
  // (a step that touches nothing and frames nothing in particular keeps every label: f.part stays unset)
  // a step with beats draws its connectors from the beat frames: they get the step's verdict too (a send of the beat
  // that runs along one, or both its ends taking part)
  frames.forEach((f, k) => { if (!f.part) return; work(f.edges.length + (beatFrames[k] ?? []).reduce((n, bf) => n + 4 + bf.edges.length * 4, 0)); const p = new Set(f.part), main = new Map(f.edges.map((e) => [e.key, e.part])); for (const bf of beatFrames[k] ?? []) { const used = ridden(bf); for (const e of bf.edges) e.part = used.has(e.key) || main.get(e.key) === true || (p.has(e.from) && p.has(e.to)); } });
  warnings.push(...crossWarnings(frames, scene));
  return { scene, frames, fx: r.fx, errors: dedupe(errors), warnings: dedupe(warnings), aspect, beats: beatFrames };
}
// lines that still cross (format version 10): the router found no way around (the things are placed so that no line
// can go around another). doccheck says which two, in which step, and how to fix it; it does not refuse
export function crossWarnings(frames: Frame[], scene: Scene): SceneError[] {
  const out: SceneError[] = [];
  let last = "";
  frames.forEach((f, k) => {
    const id = new Map(f.boxes.map((b) => [b.key, b.id]));
    const ls = frameLines(f).map((l) => ({ l, p: placed(l.pts, l.ends) }));
    work(f.boxes.length + ls.length * ls.length);
    const pairs: string[] = [];
    for (let i = 0; i < ls.length; i++) for (let j = i + 1; j < ls.length; j++) if (meet(ls[i].p, ls[j].p).cross) pairs.push(`${id.get(ls[i].l.ends[0])} -> ${id.get(ls[i].l.ends[1])} and ${id.get(ls[j].l.ends[0])} -> ${id.get(ls[j].l.ends[1])}`);
    // the same crossings as the step before are said once
    const sig = pairs.join(";");
    if (!pairs.length || sig === last) { last = sig; return; }
    last = sig;
    out.push({ line: scene.steps[k]?.line ?? 1, msg: `${pairs.length === 1 ? "two lines cross" : `${pairs.length} pairs of lines cross`} in this step (${pairs[0]}${pairs.length > 1 ? ", ..." : ""}): no way around is free. Put the things a line joins next to each other, in the order of where their lines come from, or show fewer lines at once` });
  });
  return out;
}
const dedupe = (es: SceneError[]) => { const seen = new Set<string>(); return es.filter((e) => { const k = `${e.line}:${e.msg}`; if (seen.has(k)) return false; seen.add(k); return true; }); };

// ---------------------------------------------------------------- the LLM view: the entity list, short, then the captions
// each step's movements follow its caption as "a -> b: label", whether the page shows a token, an arrow or both
const endWords = (e?: Ends) => {
  const at = (m: string | undefined, t: string | undefined, w: string) => (m || t ? [`${w} ${[m, t && `"${t}"`].filter(Boolean).join(" ")}`] : []);
  const all = e ? [...at(e.a, e.ta, "start"), ...at(e.b, e.tb, "end")] : [];
  return all.length ? ` (${all.join("; ")})` : "";
};
export function sceneLlm(c: Compiled): string {
  if (c.nest) return nestedLlm(c, sceneLlm);
  const first = play({ ...c.scene, steps: [{ caption: "", line: 0, ops: [] }] }).states[0];
  const lines: string[] = [];
  const name = (e: Ent) => (e.label && e.label !== e.id ? `${e.kind} ${e.id} "${e.label}"` : `${e.kind} ${e.id}`) + (e.hide ? " closed, inside hidden" : e.closed ? " closed" : "");
  const desc = (id: string): string => {
    const e = first.ents[id];
    if (e.map != null) return mapDesc(first, e);
    if (["array", "list", "stack", "queue"].includes(e.kind)) return `${e.kind} ${e.id}${e.label ? ` "${e.label}"` : ""}${e.kind === "queue" && e.kids.length ? " (front first)" : e.kind === "stack" && e.kids.length ? " (top first)" : ""}: ${(e.kind === "stack" ? [...e.kids].reverse() : e.kids).map((k) => first.ents[k].label).join(", ") || "empty"}`;
    if (e.kind === "record") return `record ${e.id}${e.label !== e.id ? ` "${e.label}"` : ""}${e.as ? ` (${e.as})` : ""}${e.kids.length ? `: ${e.kids.map((k) => fieldLlm(first.ents[k].field!)).join("; ")}` : ""}`;
    if (e.kind === "table" || e.kind === "row") return `${e.kind} ${e.id}: ${(e.cells ?? []).join(", ")}`;
    if (e.kind === "buckets") return `buckets ${e.id}${e.label ? ` "${e.label}"` : ""} (${e.kids.length})${e.kids.some((k) => first.ents[k].kids.length) ? ` [${e.kids.filter((k) => first.ents[k].kids.length).map((k) => `${k}: ${first.ents[k].kids.map((x) => first.ents[x].label).join(", ")}`).join("; ")}]` : ""}`;
    const kids = e.kids.map(desc);
    return `${name(e)}${e.anchor ? ` at ${e.anchor}` : ""}${e.under ? ` under ${e.under}${e.side ? ` ${e.side}` : ""}` : ""}${kids.length ? ` [${kids.join(", ")}]` : ""}`;
  };
  const roots = [...first.root, ...Object.values(first.ents).filter((e) => e.anchor).map((e) => e.id)];
  if (roots.length) lines.push(`Starts with: ${roots.map(desc).join("; ")}.`);
  if (first.conns.length) lines.push(`Connected: ${first.conns.map((x) => `${x.from} ${x.style} ${x.to}${x.label ? ` "${x.label}"` : ""}${endWords(x.ends)}`).join(", ")}.`);
  if (first.layers.length) {
    const on = (L: number) => Object.values(first.ents).filter((e) => !e.anchor && e.kind !== "row" && !(e.parent && first.ents[e.parent] && layerIndex(first, e.parent) === L) && layerIndex(first, e.id) === L).map((e) => e.id);
    lines.push(`Layers, top to bottom: ${first.layers.map((l, L) => `${l.id}${l.label !== l.id ? ` "${l.label}"` : ""}${on(L).length ? ` (${on(L).join(", ")})` : ""}`).join("; ")}.`);
  }
  if (first.families.length) {
    const of = (id: string) => [...Object.values(first.ents).filter((e) => e.family === id).map((e) => e.id), ...first.conns.filter((x) => x.family === id).map((x) => `${x.from} -> ${x.to}`)];
    lines.push(`Families, one colour each: ${first.families.map((k) => `${k.id}${k.label !== k.id ? ` "${k.label}"` : ""}${of(k.id).length ? ` (${of(k.id).join(", ")})` : ""}`).join("; ")}.`);
  }
  // format version 11: a still scene is only what is there
  if (c.scene.attrs.still) return lines.join(" ");
  // what moves in each step: sends, then (format version 9) what tokens do: move, split, merge, drop, and a zoom
  const r = play(c.scene);
  const before = (k: number) => (k ? r.states[k - 1] : first);
  const moves = (s: SceneStep, k: number) => s.ops.filter((o): o is Extract<Op, { op: "send" }> => o.op === "send").map((o) => `\n   ${o.path.join(" -> ")}${o.label ? `: ${o.label}` : ""}`).join("") + (r.states[k] ? [...llmLines(before(k), r.states[k], s.ops), ...dataLlm(before(k), r.states[k], s.ops), ...depthLlm(before(k), r.states[k], s.ops, r.fx[k])].map((l) => `\n   ${l}`).join("") : "");
  return `Animation, ${c.scene.steps.length} steps${c.scene.attrs.only3d ? ", 3D only" : ""}. ${lines.join(" ")}\n\n${c.scene.steps.map((s, i) => `${i + 1}. ${s.caption}${moves(s, i)}`).join("\n")}`;
}
