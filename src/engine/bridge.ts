// The bridge from a page's ```animation block to the one engine (integrator). The host picks the engine with
// DocumentProps / DhSettings `engine`: "old" (the two old engines), "new" (the one engine; its errors show), or "auto"
// (the one engine where it draws this block at a desktop and a phone width, else the old engines: the safety net). A page whose front matter says `format: 12` always needs the new engine.
import type { AnimationBlock } from "../types";
import type { Compiled, EngineSrc } from "./types";
import { compile } from "./pipeline";

export type EngineMode = "old" | "auto" | "new";
/** the default: every animation draws through the one engine; a host sets "old" to keep the old engines while they exist */
export const ENGINE_DEFAULT: EngineMode = "new";

/** what the engine reads from a block: rebuilt body, fence words, the page's roles, `format: 12` */
export function engineSrcOf(block: Pick<AnimationBlock, "anim" | "engine">): EngineSrc {
  const a = block.anim;
  const body = [a.head, ...a.steps.map((s) => `@step ${s.title}\n${s.raw}`)].join("\n").replace(/\n+$/, "");
  return { body, line0: a.base, fence: { ...a.info }, roles: block.engine?.roles ?? {}, format12: !!block.engine?.format12 };
}

/** the two widths the safety net draws at: a desktop page's and a 390 px phone's live plan (screenPlanWidth of their stage
 *  box, 1178 and 356). hydrate: both are widths the server draws (render/svg.tsx ENG_SSR_W) and the widths a browser on those
 *  screens keeps, so the plans this check makes in the browser are the ones the stage draws anyway (was 968 and 380, which
 *  the browser laid out only for this check) */
export const TRY_WIDTHS: readonly number[] = [1178, 356];

export type Tried = { c: Compiled | null; err: string | null; /** widths this call planned */ widths: number[] };
const cache = new WeakMap<object, Tried>();
/**
 * compile a block and lay it out at a desktop and a phone width of the page's own (TRY_WIDTHS), every step; null (with
 * the reason) when any part is not built. Warnings do not count: an old block's words that no layout owns are read by
 * the lanes adapter from the block's own text (layouts/lanes/stage-src.ts), so they still take effect.
 */
export function tryEngine(block: Pick<AnimationBlock, "anim" | "engine">): Tried {
  const hit = cache.get(block); if (hit) return hit;
  let out: Tried;
  const widths: number[] = [];
  try {
    const c = compile(engineSrcOf(block));
    const refused = c.problems.filter((p) => !p.warn);
    if (refused.length) throw new Error(refused.map((p) => `line ${p.line}: ${p.msg}`).join("; "));
    for (const w of TRY_WIDTHS) { widths.push(w); const p = c.plan(w); for (let k = 0; k < c.states.length; k++) p.frame(k); }
    const laid = c.problems.filter((p) => !p.warn); // a layout may refuse while it places (ctx.problem)
    if (laid.length) throw new Error(laid.map((p) => `line ${p.line}: ${p.msg}`).join("; "));
    out = { c, err: null, widths };
  } catch (e) { out = { c: null, err: e instanceof Error ? e.message : String(e), widths }; }
  cache.set(block, out);
  return out;
}
