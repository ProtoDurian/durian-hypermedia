// Test helper (lanes): a hand-built Model for a composed-stage block, as parse/lower-stage.ts will give it: the block's
// verbatim source in fence["stage-src"], things for the cards, relations for the connectors, states with all visible.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compileStage } from "../../../src/core/stage";
import { beginDocument } from "../../../src/core/stage-budget";
import { measure, wrap } from "../../../src/core/stage-core";
import type { Fact, LayoutCtx, LayoutInput, Model, Relation, Step, StepState, Thing, ThingState } from "../../../src/engine/types";
import type { StageSrc } from "../../../src/engine/layouts/lanes/stage-src";

export const ROOT = join(import.meta.dir, "../../..");
export const FIX = join(import.meta.dir, "fixtures");

export type Block = { src: StageSrc; roles: Record<string, number>; title: string };

/** the first ```animation fence of a page, and the page's roles (front matter `roles: { a: c1 }` or an indented list) */
export function blockOf(file: string): Block {
  const text = readFileSync(file, "utf8");
  const fm = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? "";
  const roles: Record<string, number> = { plain: 0 };
  const inline = /^roles:\s*\{(.*)\}/m.exec(fm)?.[1];
  if (inline) for (const m of inline.matchAll(/([\w-]+):\s*c(\d)/g)) roles[m[1]] = +m[2];
  for (const m of fm.matchAll(/^\s+([\w-]+):\s*c(\d)\s*$/gm)) roles[m[1]] = +m[2];
  const body = /```animation[^\n]*\n([\s\S]*?)```/.exec(text)![1];
  const i = body.indexOf("@step ");
  const head = i < 0 ? body : body.slice(0, i);
  const steps = i < 0 ? [] : body.slice(i).split(/^@step /m).slice(1).map((s, k) => { const nl = s.indexOf("\n"); return { title: s.slice(0, nl < 0 ? undefined : nl), raw: nl < 0 ? "" : s.slice(nl + 1), line: 100 + k * 10 }; });
  return { src: { head, steps, base: 1, info: {} }, roles, title: /^title:\s*(.*)$/m.exec(head)?.[1] ?? "" };
}

const S = { line: 0 };
export function modelOf(b: Block, stash = true): Model {
  beginDocument();
  const c = compileStage(b.src.head, b.src.steps, b.src.base, b.src.info, b.roles);
  const things: Record<string, Thing> = {}, order: string[] = [];
  const regions = c.model.lanes.map((l, i) => ({ id: `lane${i}`, title: l.title, flags: l.span ? [l.above ? "above" : "under", `${l.span[0]}..${l.span[1]}`] : l.across ? ["across"] : ([] as string[]), src: S }));
  for (const [id, card] of c.model.cards) {
    order.push(id);
    things[id] = { id, role: card.role === "plain" ? null : card.role, title: card.title, lines: card.subs, flags: [], shape: "box", layout: null, container: card.kids.length > 0, parent: card.parent ?? null, region: regions[card.lane]?.id ?? null, order: order.length, values: null, keys: {}, chart: null, src: S };
  }
  const relations: Record<string, Relation> = {};
  c.model.steps.forEach((st, k) => { for (const e of st.edges) { const id = `${e.from}->${e.to}`; relations[id] ??= { id, from: e.from, to: e.to, style: e.dash ? "dashed" : "arrow", label: null, role: null, setup: false, src: S }; void k; } });
  const steps: Step[] = c.model.steps.map((s) => ({ title: s.title, caption: s.caption, facts: [] as Fact[], src: S }));
  const model: Model = {
    format: 12, origin: "stage11", title: c.model.title || null, note: null, look: "stage", view: "2d", layout: "lanes",
    roles: Object.fromEntries(Object.entries(b.roles).map(([k, v]) => [k, { colour: v, label: null }])),
    regions, things, order, relations, setup: [], steps, scenes: {}, fence: stash ? { "stage-src": JSON.stringify(b.src) } : {}, layoutWords: {}, problems: [],
  };
  return model;
}
export function statesOf(model: Model): StepState[] {
  const st = (): ThingState => ({ visible: true, at: null, in: null, side: null, is: null, text: null, tone: null, dim: false, values: null, lifted: false, open: false });
  return [0, ...model.steps.map((_, i) => i + 1)].map((step) => ({ step, things: Object.fromEntries(model.order.map((id) => [id, st()])), relations: Object.fromEntries(Object.keys(model.relations).map((id) => [id, { visible: true }])), focus: "all" as const, zoom: [], layersApart: false, scene: null, camera: null, layout: {} }));
}
export function inputOf(model: Model): LayoutInput {
  return { model, states: statesOf(model), container: null, members: model.order.filter((i) => !model.things[i].parent), regions: model.regions };
}
export const ctxOf = (width: number, problems: { line: number; msg: string; warn?: boolean }[] = []): LayoutCtx => ({
  width, phone: width < 480, look: "stage", measure: (t, f) => measure(t, f), wrap: (t, w, f, m) => wrap(t, w, f, m), child: () => { throw new Error("lanes never lays out a child itself"); }, problem: (p) => problems.push(p),
});
