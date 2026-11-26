// Data and tree layouts own headings in decor (including item counts); the graph parent supplies only the frame.
import { FAMILY, type LayoutCtx, type Prim, type Rect, type Thing, type ThingState } from "../../types";
import { thingPrims } from "../../render/prims";

export function structureMember(t: Thing, state: ThingState, rect: Rect, ctx: LayoutCtx): Prim[] | null {
  if (!t.layout || !["data", "tree"].includes(FAMILY[t.layout])) return null;
  return thingPrims(t, state, rect, ctx.look, ctx.phone).filter((p) => p.key !== `t:${t.id}:title`);
}
