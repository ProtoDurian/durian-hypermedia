// Test helper (lane render): a plain stand-in layout so the renderer can be tried on real models before the layout
// lanes land. It is not a layout lane's work: members sit in rows (regions as columns), each sized by the renderer's
// own thingNeed, containers hold their members below their heading. Every member keeps one place for the story.
import type { Id, LayoutName, LayoutPlugin, Placed, Rect } from "../../../src/engine/types";
import { LAYOUTS } from "../../../src/engine/types";
import { LAYOUT } from "../../../src/engine/layouts";
import { thingNeed } from "../../../src/engine/render/prims";

const GAP = 44, PAD = 12, HEAD = 30;
export const Standin = (name: LayoutName): LayoutPlugin => ({
  name,
  place(input, ctx): Placed {
    const { model, states, members, regions } = input;
    const size = (id: Id) => {
      const t = model.things[id];
      if (t.container || members.length === 0) {
        const c = ctx.child(id);
        if (c.w > 0) return { w: Math.max(c.w + 2 * PAD, thingNeed(t, [], ctx.phone).w), h: c.h + HEAD + PAD };
      }
      return thingNeed(t, states.map((s) => s.things[id]).filter(Boolean), ctx.phone);
    };
    const cols: Id[][] = [];
    if (regions.length) for (const r of regions) cols.push(members.filter((id) => model.things[id].region === r.id));
    const rest = members.filter((id) => !cols.flat().includes(id));
    const per = Math.max(1, Math.floor((ctx.width - 20) / 200));
    if (!regions.length) for (let i = 0; i < rest.length; i += per) cols.push(rest.slice(i, i + per));
    else if (rest.length) cols.push(rest);
    const at: Record<Id, Rect> = {};
    let W = 0, H = 0;
    if (regions.length) {
      let x = input.container ? PAD : 10;
      for (const col of cols) {
        let y = input.container ? HEAD : 34, cw = 0;
        for (const id of col) { const s = size(id); at[id] = { x, y, w: s.w, h: s.h }; y += s.h + GAP; cw = Math.max(cw, s.w); }
        x += cw + GAP; W = Math.max(W, x - GAP + 10); H = Math.max(H, y - GAP + 10);
      }
    } else {
      let y = input.container ? HEAD : 20;
      for (const row of cols) {
        let x = input.container ? PAD : 10, rh = 0;
        for (const id of row) { const s = size(id); at[id] = { x, y, w: s.w, h: s.h }; x += s.w + GAP; rh = Math.max(rh, s.h); W = Math.max(W, x - GAP + 10); }
        y += rh + GAP; H = Math.max(H, y - GAP + 10);
      }
    }
    if (!input.container) W = Math.max(W, Math.min(ctx.width, 300));
    return {
      w: members.length ? W : 0, h: members.length ? H : 0,
      at: (step) => Object.fromEntries(Object.entries(at).filter(([id]) => states[step]?.things[id]?.visible)),
      decor: () => regions.map((r, i) => {
        const col = cols[i] ?? []; const x = Math.min(...col.map((id) => at[id]?.x ?? 0));
        return { k: "text" as const, key: `region:${r.id}`, x: Number.isFinite(x) ? x : 10, y: 20, lines: [r.title], font: "lane" as const, anchor: "start" as const, ink: "muted" as const };
      }),
    };
  },
});
/** put the stand-in in place of every layout that is not built; returns a function that puts them back */
export function useStandin(): () => void {
  const saved = { ...LAYOUT };
  for (const n of LAYOUTS) {
    try { LAYOUT[n].place({ model: { things: {}, order: [] } as any, states: [], container: null, members: [], regions: [] }, { width: 400, phone: false, look: "stage", measure: () => 0, wrap: (t) => [t], child: () => ({ w: 0, h: 0, at: () => ({}), decor: () => [] }), problem: () => {} }); }
    catch (e) { if (String(e).includes("not built yet")) LAYOUT[n] = Standin(n); }
  }
  return () => { Object.assign(LAYOUT, saved); };
}
