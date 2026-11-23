// This package is the source of this file: edit it here. It began as a copy synced from a private prototype (scripts/sync.ts, now frozen).
// A scene inside a scene, on the stage (format version 10; the engine is tools/scenes.ts).
// - the camera of a step into or out of a scene: it flies into the thing entered from, and the scene inside grows from
//   the middle; going out, the scene shrinks away and the camera flies out of that thing
// - the caption's chip: which scene the reader is in
// - "All steps": a scene's steps are a list inside the step that enters it
// - the slider: a band under the steps of each scene
import React from "react";
import { Rich } from "./inline";
import { center, pad, fitAspect, type Compiled, type Rect } from "../core/scene";
import { ZOOM_THROUGH, stepScene, type SceneMove } from "../core/scenes";

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpR = (a: Rect, b: Rect, t: number): Rect => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t) });
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smooth = (t: number) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
const grow = (r: Rect, k: number): Rect => { const c = center(r); return { x: c.x - (r.w * k) / 2, y: c.y - (r.h * k) / 2, w: r.w * k, h: r.h * k }; };

// the 2D camera at this moment of a move between scenes; v is the story's view of the frame shown
export function moveCam(mv: SceneMove, v: Rect, ar: number): Rect {
  const e = ease(mv.p);
  const into = mv.via ? fitAspect(pad(mv.via, 6), ar) : grow(v, 1 / ZOOM_THROUGH);
  if (mv.dir === "in") return mv.half === 0 ? lerpR(v, into, e) : lerpR(grow(v, ZOOM_THROUGH), v, e);
  return mv.half === 0 ? lerpR(v, grow(v, ZOOM_THROUGH), e) : lerpR(into, v, e);
}
// how strongly the stage is drawn: the scene that is left fades out at the end of its half, the next fades in
export const moveO = (mv: SceneMove | null) => (!mv ? 1 : mv.half === 0 ? 1 - smooth((mv.p - 0.55) / 0.45) : smooth(mv.p / 0.45));

// the depth of a step in the list of all steps: a step that enters sits with the scene it leaves; the scene's own steps
// one level in; the step that leaves is back out
export const listDepth = (c: Compiled, k: number) => (!c.nest ? 0 : c.nest.enter[k] ? c.nest.path[k].length - 1 : c.nest.path[k].length);

export function SceneChip({ c, k, ui }: { c: Compiled; k: number; ui: Record<string, any> }) {
  const s = stepScene(c, k);
  if (!s.depth) return null;
  const t = s.trail.join(" › ");
  return <span className="scn-where" title={`${ui.inScene ?? "Inside"}: ${t}`}><span className="scn-where-k">{ui.inScene ?? "Inside"} ·</span> {t}</span>;
}

type Item = { k: number; sub: Item[] };
function tree(c: Compiled, n: number): Item[] {
  const root: Item[] = [], stack: { d: number; list: Item[] }[] = [{ d: 0, list: root }];
  for (let k = 0; k < n; k++) {
    const d = listDepth(c, k);
    while (stack.length > 1 && stack[stack.length - 1].d > d) stack.pop();
    while (stack[stack.length - 1].d < d) { const top = stack[stack.length - 1].list, last = top[top.length - 1]; if (!last) break; stack.push({ d: stack[stack.length - 1].d + 1, list: last.sub }); }
    stack[stack.length - 1].list.push({ k, sub: [] });
  }
  return root;
}
// "All steps": numbered by the story's own count, a scene's steps inside the step that enters it
export function StepList({ c, titles, i, go }: { c: Compiled; titles: string[]; i: number; go: (k: number) => void }) {
  const list = (items: Item[]): React.ReactNode => (
    <ol start={(items[0]?.k ?? 0) + 1}>{items.map((it) => <li key={it.k} value={it.k + 1}><button type="button" className={it.k === i ? "is-cur" : undefined} onClick={() => go(it.k)}><Rich text={titles[it.k]} /></button>{it.sub.length > 0 && <div className="scn-sub" data-scene={stepScene(c, it.sub[0].k).label}>{list(it.sub)}</div>}</li>)}</ol>
  );
  return <>{list(tree(c, titles.length))}</>;
}

// the slider's bands: where each visit to a scene runs, from the step that enters to the one before it leaves
export function sceneBands(c: Compiled): { from: number; to: number; label: string; depth: number }[] {
  const N = c.nest;
  if (!N) return [];
  const out: { from: number; to: number; label: string; depth: number }[] = [];
  N.enter.forEach((id, k) => {
    if (!id) return;
    let e = k + 1; while (e < N.path.length && N.path[e].includes(id)) e++;
    out.push({ from: k, to: e - 1, label: N.scenes.find((s) => s.id === id)?.label ?? id, depth: N.path[k].length });
  });
  return out;
}
