// This package is the source of this file: edit it here. It began as a copy synced from a private prototype (scripts/sync.ts, now frozen).
// scenes: a scene inside a scene (format version 10).
//   scene seg "Transport, up close" layout=row     in the setup: a scene of its own, with its own things, layout and
//     box snd "sender"                             steps; its lines run to "end" (indenting them is only for the eye)
//     ...
//   end
//   @step Up close: one segment.                   a step that enters: the camera flies into a4, the overview is left
//   enter seg from a4                              out, and the scene seg is shown (its setup)
//   @step ...                                      the steps that follow change seg, not the overview
//   @step Back at the overview.                    a step that leaves: seg shrinks away and the overview comes back
//   leave                                          where it was left, the camera flying out of a4
// Each scene is played and laid out on its own, over the whole story (a step in another scene changes nothing in it),
// so sizes, kept slots and the still rule hold in each, and the overview is exactly where it was left. The frames shown
// are, per step, those of the scene the story is in. Pure: tools/scene.ts calls compileNested; the stages call sceneMove.
import type { Scene, SceneStep, SceneError, Compiled, Op, Frame, Fx, Rect } from "./scene";

// how deep scenes may go: the overview, a scene inside it, a scene inside that
export const MAX_DEPTH = 2;
// a scene's own steps, each visit (after the step that enters): fewer would be a single picture, better as a step
export const MIN_SUB_STEPS = 2;
export interface SubScene { id: string; label: string; line: number; attrs: Record<string, string>; setup: Op[] }
export interface Nest {
  scenes: { id: string; label: string }[]; // [0] is the overview (id "")
  path: string[][];                         // per step: the scenes the story is in, outermost first ([] = the overview)
  via: (string | null)[];                   // per step that enters or leaves: the thing entered from (in the outer scene)
  enter: (string | null)[];                 // per step that enters: the scene it enters; per step that leaves: null
  leave: (string | null)[];                 // per step that leaves: the scene it leaves
  parts: Compiled[];                        // each scene laid out on its own over the whole story, in scenes' order
}
const SCENE_KEYS = ["layout", "dir", "size", "fill"];
export const sceneId = (c: Compiled, k: number) => c.nest?.path[k]?.at(-1) ?? "";

// ---------------------------------------------------------------- parsing: the setup's scene blocks
// returns the overview's setup lines and each scene's lines; errors name the line
export function splitScenes(head: string, base: number, errors: SceneError[]): { main: [string, number][]; subs: { id: string; label: string; line: number; attrs: Record<string, string>; lines: [string, number][] }[] } {
  const main: [string, number][] = [], subs: { id: string; label: string; line: number; attrs: Record<string, string>; lines: [string, number][] }[] = [];
  let cur: (typeof subs)[number] | null = null;
  head.split("\n").forEach((l, i) => {
    const ln = base + i, t = l.trim();
    const m = t.match(/^scene\b\s*(.*)$/);
    if (m) {
      if (cur) { errors.push({ line: ln, msg: `scene ${cur.id} is still open (no "end" line): close it with end before the next scene; scenes are not written inside each other, a scene enters another with enter` }); }
      const r = m[1].match(/^([A-Za-z0-9_][\w.-]*)(?:\s+"([^"]*)")?((?:\s+[A-Za-z]+=\S+)*)\s*$/);
      if (!r) { errors.push({ line: ln, msg: `a scene is: scene <id> "label" [layout=...] [dir=...] [size=...], its setup lines, then end` }); cur = { id: `?${ln}`, label: "", line: ln, attrs: {}, lines: [] }; subs.push(cur); return; }
      const attrs: Record<string, string> = {};
      for (const kv of r[3].trim().split(/\s+/).filter(Boolean)) {
        const [k, v] = kv.split("=");
        if (!SCENE_KEYS.includes(k)) errors.push({ line: ln, msg: `scene ${r[1]}: unknown key "${k}" (keys: ${SCENE_KEYS.join(", ")})` });
        else attrs[k] = v;
      }
      if (r[1] === "all" || r[1] === "overview") errors.push({ line: ln, msg: `"${r[1]}" is a reserved word; give the scene another id` });
      if (subs.some((s) => s.id === r[1])) errors.push({ line: ln, msg: `scene ${r[1]} is declared twice` });
      cur = { id: r[1], label: r[2] ?? r[1], line: ln, attrs, lines: [] };
      subs.push(cur);
      return;
    }
    if (t === "end") {
      if (!cur) errors.push({ line: ln, msg: `end closes a scene, and no scene is open here` });
      cur = null;
      return;
    }
    (cur ? cur.lines : main).push([l, ln]);
  });
  if (cur) errors.push({ line: (cur as { line: number }).line, msg: `scene ${(cur as { id: string }).id} has no "end" line: its setup lines run to a line end` });
  return { main, subs };
}

// ---------------------------------------------------------------- compiling: each scene on its own, then per step the one shown
export function compileNested(scene: Scene, errors: SceneError[], compileParsed: (s: Scene, e: SceneError[]) => Compiled): Compiled {
  const subs = scene.subs ?? [];
  const ids = ["", ...subs.map((s) => s.id)];
  const n = scene.steps.length;
  const ops: Op[][][] = ids.map(() => scene.steps.map(() => []));
  const beats: number[][][] = ids.map(() => scene.steps.map(() => []));
  const path: string[][] = [], via: (string | null)[] = [], enter: (string | null)[] = [], leave: (string | null)[] = [];
  type Visit = { id: string; k: number; line: number; steps: number };
  const stack: { id: string; from: string; k: number; line: number; v: Visit }[] = [];
  const visits: Visit[] = [];
  const err = (line: number, msg: string) => errors.push({ line, msg });
  scene.steps.forEach((st, k) => {
    const ctl = st.ops.filter((o): o is Extract<Op, { op: "enter" } | { op: "leave" }> => o.op === "enter" || o.op === "leave");
    via[k] = null; enter[k] = null; leave[k] = null;
    if (ctl.length) {
      const o = ctl[0];
      const other = st.ops.find((x) => x !== o);
      if (other) err(other.line, `a step that ${o.op === "enter" ? "enters" : "leaves"} a scene does only that (the camera flies ${o.op === "enter" ? "in" : "out"}); put this change in the next step, with its own caption`);
      if (o.op === "enter") {
        const sc = subs.find((s) => s.id === o.id);
        if (!sc) err(o.line, `enter ${o.id}: no scene ${o.id}${subs.length ? ` (scenes: ${subs.map((s) => s.id).join(", ")})` : `; declare it in the setup: scene ${o.id} "label", its lines, then end`}`);
        else if (stack.some((x) => x.id === o.id)) err(o.line, `enter ${o.id}: the story is already in ${o.id}; leave it first`);
        else if (stack.length >= MAX_DEPTH) err(o.line, `enter ${o.id}: scenes go ${MAX_DEPTH} deep at most (the overview, a scene in it, a scene in that); leave one first, or show this in the scene you are in`);
        else {
          const v: Visit = { id: o.id, k, line: o.line, steps: 0 };
          stack.push({ id: o.id, from: o.from, k, line: o.line, v });
          visits.push(v);
          via[k] = o.from; enter[k] = o.id;
        }
      } else {
        const top = stack.at(-1);
        if (!top) err(o.line, `leave: the story is in the overview, not in a scene; there is nothing to leave`);
        else if (o.id && o.id !== top.id) err(o.line, `leave ${o.id}: the story is in ${top.id}${stack.length > 1 ? ` (inside ${stack.slice(0, -1).map((x) => x.id).join(" > ")})` : ""}, not ${o.id}; write leave, or leave ${top.id}`);
        else {
          const v = top.v;
          if (v.steps < MIN_SUB_STEPS) err(o.line, `scene ${top.id} has ${v.steps} step${v.steps === 1 ? "" : "s"} of its own on this visit (after the one that enters, line ${v.line}); give it at least ${MIN_SUB_STEPS}, or show it as a step of the overview`);
          stack.pop();
          via[k] = top.from; leave[k] = top.id;
        }
      }
    } else {
      const j = ids.indexOf(stack.at(-1)?.id ?? "");
      ops[j][k] = st.ops;
      beats[j][k] = st.beat ?? [];
      // a step of the scene the story is in counts for that visit (also after a deeper scene was left)
      const top = stack.at(-1);
      if (top) top.v.steps++;
    }
    path[k] = stack.map((x) => x.id);
  });
  for (const x of stack) err(x.line, `the story ends inside scene ${x.id}: add a step that leaves it (leave), so the reader comes back to the overview`);
  for (const s of subs) if (!visits.some((v) => v.id === s.id)) err(s.line, `scene ${s.id} is declared but never entered: add a step with enter ${s.id} from <thing>`);
  // each scene, played and laid out over the whole story: in a step of another scene, nothing changes in it
  const parts = ids.map((id, j) => {
    const sub = subs.find((s) => s.id === id);
    const virt: Scene = {
      attrs: { ...scene.attrs, ...(sub ? Object.fromEntries(Object.entries(sub.attrs).filter(([k]) => k !== "narrow")) : {}) } as Scene["attrs"],
      // the overview's families are the whole story's: a family keeps its colour in every scene (layers are each scene's own)
      setup: sub ? [...scene.setup.filter((o) => o.op === "family"), ...sub.setup] : scene.setup,
      steps: scene.steps.map((st, k): SceneStep => ({ caption: st.caption, line: st.line, ops: ops[j][k], beat: beats[j][k], beats: ops[j][k].length ? st.beats : 1, pace: st.pace })),
      texts: scene.texts,
    };
    // on a phone, each scene takes its own narrow layout when it is wide itself (the overview's shape says nothing of it)
    if (sub && scene.attrs.phone) virt.attrs = { ...virt.attrs, narrow: compileParsed({ ...virt, attrs: { ...virt.attrs, phone: false, narrow: false } }, []).aspect > 1.4 };
    const e: SceneError[] = [];
    const c = compileParsed(virt, e);
    // a scene's own count of steps is the story's: only the story's own rule about steps is kept (said once, above)
    errors.push(...c.errors.filter((x) => !/at least 2 @step/.test(x.msg)));
    return c;
  });
  // the thing a step enters from must be on the stage of the scene it leaves
  scene.steps.forEach((st, k) => {
    if (!enter[k] || !via[k]) return;
    const outer = path[k].length > 1 ? path[k][path[k].length - 2] : "";
    const f = parts[ids.indexOf(outer)].frames[k];
    if (!f?.boxes.some((b) => b.key > 0 && b.id === via[k])) err(st.ops.find((o) => o.op === "enter")!.line, `enter ${enter[k]} from ${via[k]}: no ${via[k]} on the stage of ${outer ? `scene ${outer}` : "the overview"} at this step; name a thing that is there`);
  });
  // an id lives in one scene: the same id in two scenes would make the LLM view and the reader's notes ambiguous
  const owner = new Map<string, string>();
  parts.forEach((c, j) => { for (const f of c.frames) for (const b of f.boxes) if (b.key > 0 && !b.ent.ghost) { const o = owner.get(b.id); if (o == null) owner.set(b.id, ids[j]); else if (o !== ids[j]) { owner.set(b.id, ids[j]); err(subs.find((s) => s.id === (ids[j] || o))?.line ?? 0, `"${b.id}" is in ${o ? `scene ${o}` : "the overview"} and in ${ids[j] ? `scene ${ids[j]}` : "the overview"}; an id names one thing in one scene: rename one`); } } });
  // keys: each scene's own range, so a stage never takes a thing of one scene for a thing of another
  parts.forEach((c, j) => { if (j) offsetKeys(c, j * KEY_STEP); });
  const at = (k: number) => parts[ids.indexOf(path[k].at(-1) ?? "")];
  const frames = scene.steps.map((_, k) => at(k).frames[k]);
  scene.steps.forEach((_, k) => { if (leave[k] && via[k]) leaveTouch(frames[k], via[k]!); });
  const fx = scene.steps.map((_, k) => at(k).fx[k]);
  const beatF = scene.steps.map((_, k) => at(k).beats?.[k] ?? []);
  const warnings = parts.flatMap((c) => c.warnings);
  // the stage keeps one size for the whole story: the overview's shape (a scene inside is framed into it)
  return { scene, frames, fx, errors: dedupe(errors), warnings: dedupe(warnings), aspect: parts[0].aspect, beats: beatF, nest: { scenes: [{ id: "", label: "" }, ...subs.map((s) => ({ id: s.id, label: s.label }))], path, via, enter, leave, parts } };
}
// "where we left it" (format version 10, fix): a step that leaves a scene touches the thing the scene was entered from,
// with the tokens and pointers at it, so the story's camera frames it (in 3D on a phone too, site/src/least3d.ts)
export function leaveTouch(f: Frame, via: string) {
  const b = f.boxes.find((x) => x.key > 0 && x.id === via);
  if (!b) return;
  const at = f.boxes.filter((x) => x.key > 0 && (x.kind === "token" || x.kind === "pointer") && x.ent.anchor === via).map((x) => x.key);
  f.touched = [...new Set([...f.touched, b.key, ...at])];
}
const dedupe = (es: SceneError[]) => { const seen = new Set<string>(); return es.filter((e) => { const k = `${e.line}:${e.msg}`; if (seen.has(k)) return false; seen.add(k); return true; }); };

// ---------------------------------------------------------------- keys: one range per scene
export const KEY_STEP = 100000;
function offsetKeys(c: Compiled, off: number) {
  const k = (x: number) => (x > 0 ? x + off : x);
  const rec = (r: Record<number, number>) => Object.fromEntries(Object.entries(r).map(([a, b]) => [k(+a), k(b)]));
  const frame = (f: Frame) => {
    for (const b of f.boxes) { if (b.key > 0) { b.key = k(b.key); b.ent = { ...b.ent, key: b.key }; } }
    for (const e of f.edges) { e.from = k(e.from); e.to = k(e.to); e.key = `${off}:${e.key}`; }
    for (const m of f.marks) m.at = k(m.at);
    for (const s of f.sends) s.path = s.path.map(k);
    f.touched = f.touched.map(k);
    if (f.look) f.look = f.look.map(k);
    // who takes part (the 3D labels rule) lives in the same range, or a scene inside the scene shows no label while a step plays
    if (f.part) f.part = f.part.map(k);
  };
  const fxOf = (x: Fx) => {
    x.highlights = x.highlights.map((h) => ({ ...h, key: k(h.key) }));
    x.says = x.says.map((s) => ({ ...s, key: k(s.key) }));
    x.sends = x.sends.map((s) => ({ ...s, path: s.path.map(k) }));
    x.spawn = rec(x.spawn); x.merge = rec(x.merge);
    x.enter = x.enter.map(k);
    if (x.dropped) x.dropped = x.dropped.map((d) => ({ key: k(d.key), at: d.at == null ? null : k(d.at) }));
    if (x.spot) x.spot = x.spot.map(k);
    if (x.connBeat) x.connBeat = rec(x.connBeat);
  };
  c.frames.forEach(frame);
  c.beats?.forEach((bs) => bs.forEach(frame));
  c.fx.forEach(fxOf);
}

// ---------------------------------------------------------------- the stages: a step into or out of a scene
// From step a to step b the story changes scene: the stage zooms through. In its first half it shows a's scene, the
// camera flying into the thing entered from (or, going out, the scene shrinking away); in its second half b's scene,
// coming up from inside that thing (or, going in, growing from the middle). Nothing tweens between two scenes.
export interface SceneMove { dir: "in" | "out"; half: 0 | 1; p: number; frame: Frame; via: Rect | null; viaKey: number | null; scene: string }
export const ZOOM_THROUGH = 2.6; // how far the camera starts away (going in) or ends away (going out), times the view
export function sceneMove(c: Compiled, a: number, b: number, t: number): SceneMove | null {
  const N = c.nest;
  if (!N || a === b) return null;
  const pa = N.path[a] ?? [], pb = N.path[b] ?? [];
  if (pa.join(">") === pb.join(">")) return null;
  // in: b is deeper than a (or a sibling scene); the thing entered from is in the shallower scene's frame
  const dir: "in" | "out" = pb.length >= pa.length ? "in" : "out";
  const shallow = dir === "in" ? a : b, deep = dir === "in" ? b : a, dp = dir === "in" ? pb : pa, sp = dir === "in" ? pa : pb;
  // the scene that was entered: the deep side's first scene below what both share; the thing from the step that entered it
  let cp = 0; while (cp < sp.length && sp[cp] === dp[cp]) cp++;
  const want = dp[Math.min(cp, dp.length - 1)];
  let k = deep; while (k > 0 && N.enter[k] !== want) k--;
  const name = N.via[k];
  const half: 0 | 1 = t < 0.5 ? 0 : 1, p = half ? (t - 0.5) * 2 : t * 2;
  const frame = c.frames[half ? b : a];
  const sf = c.frames[shallow];
  const box = name ? sf.boxes.find((x) => x.key > 0 && x.id === name) ?? null : null;
  return { dir, half, p, frame, via: box ? { x: box.x, y: box.y, w: box.w, h: box.h } : null, viaKey: box?.key ?? null, scene: (half ? pb : pa).at(-1) ?? "" };
}
// the frames of one scene (for the stage's "show everything" and the 3D floor plan)
export function sceneFrames(c: Compiled, k: number): Frame[] {
  const N = c.nest;
  if (!N) return c.frames;
  const id = N.path[k]?.at(-1) ?? "";
  return N.parts[N.scenes.findIndex((s) => s.id === id)]?.frames ?? c.frames;
}
// per step, for the captions and the list of all steps: the scene's label and how deep it is
// trail: the labels of every scene the story is in, outermost first (a scene two deep shows where it is)
export function stepScene(c: Compiled, k: number): { label: string; depth: number; id: string; trail: string[] } {
  const N = c.nest;
  if (!N) return { label: "", depth: 0, id: "", trail: [] };
  const id = N.path[k]?.at(-1) ?? "";
  const lab = (x: string) => N.scenes.find((s) => s.id === x)?.label ?? x;
  return { id, depth: N.path[k]?.length ?? 0, label: lab(id), trail: (N.path[k] ?? []).map(lab) };
}

// ---------------------------------------------------------------- the LLM view: steps inside a scene, indented under the step that enters
export function nestedLlm(c: Compiled, one: (c: Compiled) => string): string {
  const N = c.nest!;
  const parsed = N.parts.map((p) => {
    const txt = one(p);
    const [head, ...rest] = txt.split("\n\n");
    const items = new Map<number, string[]>();
    let cur = -1;
    for (const l of rest.join("\n\n").split("\n")) { const m = l.match(/^(\d+)\. /); if (m) { cur = +m[1] - 1; items.set(cur, [l]); } else if (cur >= 0 && l) items.get(cur)!.push(l); }
    return { start: head.replace(/^Animation, \d+ steps\.\s*/, ""), items };
  });
  const subs = N.scenes.slice(1);
  const lines: string[] = [];
  c.scene.steps.forEach((st, k) => {
    const depth = N.enter[k] ? N.path[k].length - 1 : N.path[k].length;
    const ind = "   ".repeat(depth);
    const j = N.scenes.findIndex((s) => s.id === (N.path[k].at(-1) ?? ""));
    if (N.enter[k]) {
      const sc = N.scenes.find((s) => s.id === N.enter[k])!;
      lines.push(`${ind}${k + 1}. ${st.caption}`);
      lines.push(`${ind}   enters scene ${sc.id}${sc.label !== sc.id ? ` "${sc.label}"` : ""} from ${N.via[k]}. ${parsed[j].start}`);
    } else if (N.leave[k]) {
      const sc = N.scenes.find((s) => s.id === N.leave[k])!;
      const back = N.path[k].at(-1);
      lines.push(`${ind}${k + 1}. ${st.caption}`);
      lines.push(`${ind}   leaves scene ${sc.id}: back to ${back ? `scene ${back}` : "the overview"}, as it was, at ${N.via[k]}`);
    } else for (const l of parsed[j].items.get(k) ?? [`${k + 1}. ${st.caption}`]) lines.push(ind + l);
  });
  return `Animation, ${c.scene.steps.length} steps, with ${subs.length} scene${subs.length > 1 ? "s" : ""} inside it (${subs.map((s) => `${s.id} "${s.label}"`).join(", ")}): steps in a scene are indented under the step that enters it. ${parsed[0].start}\n\n${lines.join("\n")}`;
}
