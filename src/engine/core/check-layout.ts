// Lane gate2: the layout-quality checks authors see (DESIGN lane H, review M1 item 1.1 last row). `check.ts` reads the
// source and the states; this file reads the PLAN: what the layouts drew, at a desktop and a phone width. It ports the
// pure checks the old engines hold (src/core/scene.ts `crossWarnings`, `minFont` + `MIN_PX`, `overlaps`, the "nothing
// untouched moves" rule of the match harness) to primitives, so every layout and every format gets them.
//
// Every message is a WARNING (`warn: true`) with the line of the step it is about, never a refusal: a layout that
// breaks a rule is the layout's bug or the story's (too many lines at once), and the author is told which step.
//   - small:   words drawn under 11 px on the screen (the phone floor, tools/readable.ts)
//   - cross:   two lines that cross away from the thing they share (the router found no way around)
//   - moved:   a thing that is not moved by the step but sits elsewhere (the still rule)
//   - overlap: words over words, a token or a note over a shape
// Same finding in the next step is said once; the same finding at both widths is one message ("at 1000 and 390 px").
import type { Compiled, Id, Plan, Prim, Problem, Rect, StepState } from "../types";
import { FONT, LINE_H, PHONE_FONT, type Font } from "../../core/stage-core";
import { atSizes, measureAt } from "../render/font";
import { meet, placed } from "../../core/route";
import { pathPoints } from "../render/route";
import { CHIP_H, chipW } from "../render/prims";

/** the smallest words a reader may be shown, in pixels on the screen (src/core/scene.ts MIN_PX) */
export const MIN_PX = 11;
/** the widths a story is checked at: a desktop stage and a phone */
export const CHECK_WIDTHS = [1000, 390] as const;
/** how far a thing that should stay still may drift before it counts (the harness's 3 px) */
const STILL_PX = 3;
/** words overlap when their boxes overlap by more than this much (the harness's 2 x 3 px) */
const OVERLAP_X = 2, OVERLAP_Y = 3;
/** at most this many names in one message */
const NAMES = 3;

type Finding = { kind: "small" | "cross" | "moved" | "overlap"; step: number; sig: string; msg: string };

const list = (xs: string[]) => xs.slice(0, NAMES).join(", ") + (xs.length > NAMES ? `, and ${xs.length - NAMES} more` : "");

/** the size of a font in stage units at a width (a phone has its own sizes, stage-core PHONE_FONT) */
const fontPx = (font: Font, phone: boolean): number => (phone ? PHONE_FONT[font] : undefined) ?? FONT[font].size;

/** the drawn box of a text prim: (x, y) is the baseline of its first line (render/prims.ts conventions) */
function textBox(p: Prim & { k: "text" }, phone: boolean): Rect {
  const w = Math.max(0, ...p.lines.map((l) => measureAt(l, p.font, phone))), pitch = LINE_H[p.font] ?? 16;
  return { x: p.anchor === "middle" ? p.x - w / 2 : p.anchor === "end" ? p.x - w : p.x, y: p.y - pitch + 4, w, h: p.lines.length * pitch };
}
const overlapBy = (a: Rect, b: Rect) => ({ x: Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), y: Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) });
const hits = (a: Rect, b: Rect, m = 1) => { const o = overlapBy(a, b); return o.x > m && o.y > m; };

/** how much bigger or smaller the stage is shown than drawn: the renderer shows `max(plan.w, width)` stage units in `width` px
 *  (render/svg.tsx wholeOf and viewOf), so a stage wider than its box is shrunk */
const scaleOf = (plan: Plan) => plan.width / Math.max(1, plan.w, plan.width);

/** the step's source line: its `@step`, or (the setup) the line of the first thing */
const lineOf = (c: Compiled, step: number) => (step > 0 ? c.model.steps[step - 1]?.src.line : c.model.things[c.model.order[0]]?.src.line) ?? 1;

// ------------------------------------------------------------------ small words
function small(plan: Plan, step: number, frame: Prim[]): Finding[] {
  const k = scaleOf(plan), words: [string, number][] = [];
  for (const p of frame) {
    if (p.k === "text") { const px = fontPx(p.font, plan.phone) * k; if (px < MIN_PX - 0.05 && p.lines.some((l) => l.trim())) words.push([p.lines.find((l) => l.trim())!.trim(), px]); }
    else if (p.k === "chip") { const px = fontPx("chip", plan.phone) * k; if (px < MIN_PX - 0.05) words.push([p.words, px]); }
  }
  if (!words.length) return [];
  const least = Math.min(...words.map((w) => w[1]));
  const names = [...new Set(words.map((w) => `"${w[0].length > 24 ? w[0].slice(0, 23) + "…" : w[0]}"`))];
  return [{ kind: "small", step, sig: `${words.length}`, msg: `${words.length} words are drawn under ${MIN_PX} px (the smallest ${Math.round(least * 10) / 10} px: ${list(names)}): a reader cannot read them; give the scene less width to fill, or fewer things per row` }];
}

// ------------------------------------------------------------------ crossing lines
function cross(c: Compiled, plan: Plan, step: number, frame: Prim[]): Finding[] {
  const index = new Map(c.model.order.map((id, i) => [id, i] as const));
  const lines = frame.filter((p): p is Prim & { k: "path" } => p.k === "path" && p.key.startsWith("rel:") && !!p.id).flatMap((p) => {
    const rel = c.model.relations[p.id!], pts = pathPoints(p.d);
    if (!rel || pts.length < 2) return [];
    return [{ rel, pl: placed(pts, [index.get(rel.from) ?? -1, index.get(rel.to) ?? -2]) }];
  });
  const pairs: string[] = [];
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) if (meet(lines[i].pl, lines[j].pl).cross) pairs.push(`${lines[i].rel.from} -> ${lines[i].rel.to} and ${lines[j].rel.from} -> ${lines[j].rel.to}`);
  if (!pairs.length) return [];
  return [{ kind: "cross", step, sig: pairs.join(";"), msg: `${pairs.length === 1 ? "two lines cross" : `${pairs.length} pairs of lines cross`} (${pairs[0]}${pairs.length > 1 ? ", ..." : ""}): put the things a line joins next to each other, in the order of where their lines come from, or show fewer lines at once` }];
}

// ------------------------------------------------------------------ still things that move
/** a step that moves the camera or the stage's shape (lift, layers apart, a scene change) moves things by design */
const reshapes = (a: StepState, b: StepState) => a.layersApart !== b.layersApart || a.scene !== b.scene || a.focus !== b.focus || a.zoom.length !== b.zoom.length;

function moved(c: Compiled, plan: Plan, step: number): Finding[] {
  if (step === 0) return [];
  const a = c.states[step - 1], b = c.states[step], mo = c.motions[step];
  if (!a || !b || reshapes(a, b)) return [];
  const goes = new Set<Id>([...(mo?.move ?? []).map((m) => m.id), ...(mo?.enter ?? []), ...(mo?.exit ?? [])]);
  // a thing that is lifted, put back, or inside a thing that moves, moves with it
  const up = (id: Id): Id | null => b.things[id]?.in ?? c.model.things[id]?.parent ?? null;
  const rides = (id: Id) => { for (let x: Id | null = id, n = 0; x && n < 64; x = up(x), n++) if (goes.has(x)) return true; return false; };
  const before = plan.rects(step - 1), after = plan.rects(step), drifted: string[] = [];
  for (const [id, r] of Object.entries(after)) {
    const o = before[id], sa = a.things[id], sb = b.things[id];
    if (!o || !sa?.visible || !sb?.visible || rides(id) || sa.lifted !== sb.lifted || sa.at !== sb.at || sa.open !== sb.open) continue;
    const d = Math.hypot(r.x - o.x, r.y - o.y);
    if (d > STILL_PX) drifted.push(`${id} (${Math.round(d)} px)`);
  }
  if (!drifted.length) return [];
  return [{ kind: "moved", step, sig: drifted.join(";"), msg: `${drifted.length} ${drifted.length === 1 ? "thing" : "things"} the step does not move ${drifted.length === 1 ? "sits" : "sit"} elsewhere than in the step before (${list(drifted)}): a layout places things once for the whole story; say \`in\` or \`at\` if they should move` }];
}

// ------------------------------------------------------------------ overlaps
function overlaps(c: Compiled, step: number, frame: Prim[], phone: boolean): Finding[] {
  const st = c.states[step];
  // words over words (the harness's `overlap`: more than 2 x 3 px)
  const words: { r: Rect; w: string; key: string }[] = [];
  for (const p of frame) {
    if (p.k === "text" && p.lines.some((l) => l.trim())) words.push({ r: textBox(p, phone), w: p.lines.find((l) => l.trim())!.trim(), key: p.key });
    else if (p.k === "chip") words.push({ r: { x: p.x, y: p.y, w: atSizes(phone, () => chipW(p.words)), h: CHIP_H }, w: p.words, key: p.key });
  }
  const pairs: string[] = [];
  for (let i = 0; i < words.length; i++) for (let j = i + 1; j < words.length; j++) {
    const o = overlapBy(words[i].r, words[j].r);
    if (o.x > OVERLAP_X && o.y > OVERLAP_Y) pairs.push(`"${words[i].w.slice(0, 20)}" over "${words[j].w.slice(0, 20)}"`);
  }
  // a token or a pointer over a shape it does not sit at (src/core/scene.ts `overlaps`: smalls against shapes)
  const smalls = frame.filter((p): p is Prim & { k: "box" } => p.k === "box" && (p.shape === "token" || p.shape === "ref") && !!p.id);
  const shapes = frame.filter((p): p is Prim & { k: "box" } => p.k === "box" && !p.container && !["text", "token", "ref", "dot"].includes(p.shape) && !!p.id);
  for (const s of smalls) for (const sh of shapes) {
    if (s.id === sh.id || st?.things[s.id!]?.at === sh.id) continue;
    if (hits(s.rect, sh.rect, 1)) pairs.push(`${s.id} over ${sh.id}`);
  }
  if (!pairs.length) return [];
  return [{ kind: "overlap", step, sig: pairs.join(";"), msg: `${pairs.length === 1 ? "two things overlap" : `${pairs.length} overlaps`} (${list(pairs)}): give them room, or show fewer things in this step` }];
}

// ------------------------------------------------------------------ the entry point
export interface LayoutFinding { line: number; step: number; width: number; kind: Finding["kind"]; msg: string }

/** every finding with its step and width, same-as-the-step-before findings left out */
export function layoutFindings(c: Compiled, widths: readonly number[] = CHECK_WIDTHS): LayoutFinding[] {
  const out: LayoutFinding[] = [];
  for (const width of widths) {
    const plan = c.plan(width);
    const last = new Map<Finding["kind"], string>();
    for (let k = 0; k < c.states.length; k++) {
      const frame = plan.frame(k);
      const now = [...small(plan, k, frame), ...cross(c, plan, k, frame), ...moved(c, plan, k), ...overlaps(c, k, frame, plan.phone)];
      for (const f of now) {
        if (last.get(f.kind) === f.sig) continue; // said in the step before
        out.push({ line: lineOf(c, f.step), step: f.step, width, kind: f.kind, msg: f.msg });
      }
      last.clear();
      for (const f of now) last.set(f.kind, f.sig);
    }
  }
  return out;
}

/** The layout warnings of a compiled story, as doccheck problems (every one `warn: true`, with the step's line):
 *  one message per step and finding, said once when it holds at both widths ("at 1000 and 390 px"). */
export function checkLayout(c: Compiled, widths: readonly number[] = CHECK_WIDTHS): Problem[] {
  const by = new Map<string, LayoutFinding & { widths: number[] }>();
  for (const f of layoutFindings(c, widths)) {
    const key = `${f.step}|${f.kind}|${f.msg}`;
    const hit = by.get(key);
    if (hit) hit.widths.push(f.width); else by.set(key, { ...f, widths: [f.width] });
  }
  return [...by.values()].map((f) => ({ line: f.line, warn: true, msg: `step ${f.step}, at ${f.widths.join(" and ")} px: ${f.msg}` })).sort((a, b) => a.line - b.line);
}
