// llm3: the lanes layout's own lines of the LLM view (LayoutPlugin.llm; core/llm.ts places a `Step k: ` line under step k).
// A lanes scene hosts the composed stage (lanes.ts layStage), and that stage holds facts the Model's things do not: the
// blocks it draws beside the lanes (a bar or column chart's axis, values, peak and limit; counted units; a timeline), the
// key, and the card words only the lanes layout reads (a title change, crossed out, dashed, a fill, marked chips). The
// core already says what every thing shows, its tone, chip, lines and moves; these are the rest, in the stage blocks' own
// words (each block's `facts`). Heads another layout reads itself (sheet, nest, track, time, matrix, bins) are left to it.
import { compileStage, STAGE_WORK, STAGE_MEMORY, type Compiled } from "../../../core/stage";
import { withStageBudget, newBudget } from "../../../core/stage-budget";
import type { Model } from "../../types";
import { stageRoles, stageSrcOf } from "./stage-src";
import { badgesOf } from "./words";

/** head words whose layout speaks for them (layouts/sheet.ts, time.ts, grid.ts) */
const SPOKEN_ELSEWHERE = new Set(["sheet", "labels", "spacing", "nest", "track", "carry", "where", "form", "place", "time", "matrix", "bins"]);
const TONE: Record<string, string> = { acc: "accent", bad: "bad", good: "good", warn: "warn" };

const held = new WeakMap<Model, Compiled | null>();
function stageOf(model: Model): Compiled | null {
  if (held.has(model)) return held.get(model)!;
  let c: Compiled | null = null;
  try {
    const src = stageSrcOf(model);
    const info: Record<string, string> = { ...src.info };
    if (model.title && info.title === undefined) info.title = model.title;
    c = withStageBudget(newBudget(STAGE_WORK, STAGE_MEMORY), () => compileStage(src.head, src.steps, src.base, info, stageRoles(model)));
  } catch { c = null; }
  held.set(model, c);
  return c;
}

export function lanesLlm(model: Model): string[] {
  const c = stageOf(model); if (!c) return [];
  const m = c.model, out: string[] = [];
  const heads = m.head.filter((h) => !SPOKEN_ELSEWHERE.has(h.block.word));
  // a card's badges (`[a: worker a]` on its edge) are lanes-only words the core does not describe
  for (const id of model.order) { const bs = badgesOf(model.things[id].keys); if (bs.length) out.push(`${id} has badges: ${bs.map((b) => `${b.b}: ${b.s}`).join("; ")}.`); }
  for (const h of heads) out.push(...h.block.facts(h.node, 0));
  m.steps.forEach((s, si) => {
    const k = si + 1, f: string[] = [];
    for (const h of heads) f.push(...h.block.facts(h.node, k));
    for (const [r, t, tone, dash] of s.keys) f.push(`Key (${r}${tone ? `, ${TONE[tone] ?? tone}` : ""}${dash ? ", dashed" : ""}): ${t}.`);
    const st = m.cx.steps[si];
    if (st) {
      for (const [id, t] of st.title) f.push(`${id} is now titled: ${t}.`);
      for (const [id, x] of [...st.cross, ...st.crossC]) f.push(x ? `${id} is crossed out.` : `${id} is no longer crossed out.`);
      for (const [id, d] of st.dash) f.push(d ? `${id} is dashed (not there yet).` : `${id} is solid.`);
      for (const ch of st.chips) { const card = m.cards.get(ch.card); f.push(`${ch.card}: ${ch.idx.map((i) => String(card?.tokens[i] ?? `#${i + 1}`).replace(/^\W+/, "")).join(", ")} (${ch.tone}${ch.remark ? `: ${ch.remark}` : ""}${ch.keep ? ", from now on" : ""}).`); }
      const fills = new Map<string, string[]>(); for (const [id, key, v] of st.fill) (fills.get(id) ?? fills.set(id, []).get(id)!).push(`${key} = ${v}`);
      for (const [id, kv] of fills) f.push(`${id}: ${kv.join(", ")}.`);
    }
    out.push(...f.map((x) => `Step ${k}: ${x}`));
  });
  return out;
}
