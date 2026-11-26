// Test helpers for the grid layout: a tiny stand-in for the front-end (what parse/lower-stage hands the layout, ./grid/CONTRACT.md),
// so the layout is tested alone, before and after the parser lands. Made-up content only.
import { measure, wrap } from "../../../src/core/stage-core";
import { setPhoneFont } from "../../../src/core/stage-core";
import type { Fact, LayoutCtx, LayoutInput, Model, Placed, Problem, StepState, Thing } from "../../../src/engine/types";

export type Raw = { line: number; ind: number; t: string };
const raw = (text: string, line0: number): Raw[] => text.split("\n").map((r, i) => ({ line: line0 + i, ind: r.length - r.trimStart().length, t: r.trim() })).filter((x) => x.t);

/** the fence text of a stage block: its head lines and its steps, as the stage splits them */
export function splitFence(src: string) {
  const parts = src.split(/^@step /m);
  return { head: parts[0], steps: parts.slice(1).map((s) => { const nl = s.indexOf("\n"); return { title: nl < 0 ? s : s.slice(0, nl), raw: nl < 0 ? "" : s.slice(nl + 1) }; }) };
}
export const PANEL_WORDS = ["grid", "rows", "map", "list", "card", "calc", "cells", "chips"];
const HEADS = ["matrix", "bins"];
const OPS = ["show", "light", "into"];

/** the words of the grid layout out of a stage fence, as the front-end hands them (heads verbatim, step facts as layout facts) */
export function lowerGrid(src: string, roles: Record<string, number> = { client: 1, server: 2, store: 3, job: 4, cache: 5, ops: 6, plain: 0 }): Model {
  const { head, steps } = splitFence(src);
  const hl = raw(head, 1);
  const layoutWords: Model["layoutWords"] = {};
  let inHead = false;
  for (let i = 0; i < hl.length; i++) {
    const l = hl[i], body: string[] = []; while (i + 1 < hl.length && hl[i + 1].ind > l.ind) { const b = hl[++i]; body.push(" ".repeat(Math.max(0, b.ind - l.ind - 2)) + b.t); }
    if (/^(title|track|carry|where|panels|notes):/.test(l.t)) { inHead = false; continue; }
    const colon = l.t.indexOf(": "), col = colon > 0 ? l.t.slice(0, colon) : null, w0 = (col ?? l.t).split(" ")[0];
    if (HEADS.includes(w0)) {
      const arg = col === w0 ? l.t.slice(colon + 2) : l.t.slice(w0.length).trim();
      (layoutWords.grid ??= []).push({ word: w0, arg, body, src: { line: l.line } }); inHead = true; continue;
    }
    if (inHead) { const arg = col === w0 ? l.t.slice(colon + 2) : l.t.slice(w0.length).trim(); layoutWords.grid!.push({ word: w0, arg, body, src: { line: l.line } }); }
  }
  const msteps = steps.map((s, si) => {
    const facts: Fact[] = [];
    const ls = raw(s.raw, 100 * (si + 1));
    for (let i = 0; i < ls.length; i++) {
      const l = ls[i], body: string[] = []; while (i + 1 < ls.length && ls[i + 1].ind > l.ind) body.push(" ".repeat(ls[++i].ind) + ls[i].t);
      const keep = l.t.startsWith("keep "), t = keep ? l.t.slice(5) : l.t, c = t.indexOf(": "), word = (c > 0 ? t.slice(0, c) : t).split(" ")[0];
      if (keep && PANEL_WORDS.includes(t.split(" ")[0])) { facts.push({ k: "layout", word: "keep", arg: t, body, src: { line: l.line } }); continue; }
      if (PANEL_WORDS.includes(word) || OPS.includes(word) || word === "beside") facts.push({ k: "layout", word: keep ? "keep" : word, arg: keep ? t : t.slice(word.length).trim(), body, src: { line: l.line } });
    }
    return { title: s.title.split(": ")[0], caption: s.title, facts, src: { line: 100 * (si + 1) - 1 } };
  });
  return emptyModel({ layoutWords, steps: msteps, roles: Object.fromEntries(Object.keys(roles).map((r) => [r, { colour: roles[r], label: null }])) });
}

export function emptyModel(over: Partial<Model> = {}): Model {
  return { format: 12, origin: "stage11", title: null, note: null, look: "stage", view: "2d", layout: "grid", roles: {}, regions: [], things: {}, order: [], relations: {}, setup: [], steps: [], scenes: {}, fence: {}, layoutWords: {}, problems: [], ...over };
}

/** a Thing with defaults */
export const thing = (id: string, over: Partial<Thing> = {}): Thing => ({ id, role: null, title: id, lines: [], flags: [], shape: "box", layout: null, container: false, parent: null, region: null, order: 0, values: null, keys: {}, chart: null, src: { line: 1 }, ...over });

/** states 0..n for a model: everything visible, in its declared parent, unless `over(step, id)` says otherwise */
export function states(model: Model, over: (step: number, id: string) => Partial<StepState["things"][string]> = () => ({})): StepState[] {
  return Array.from({ length: model.steps.length + 1 }, (_, step) => ({
    step, focus: "all" as const, zoom: [], layersApart: false, scene: null, camera: null, layout: {}, relations: {},
    things: Object.fromEntries(model.order.map((id) => [id, { visible: true, at: null, in: model.things[id].parent, side: null, is: null, text: null, tone: null, dim: false, values: null, lifted: false, open: false, ...over(step, id) }])),
  }));
}

export function ctxAt(width: number, problems: Problem[] = []): LayoutCtx {
  const phone = width < 480;
  setPhoneFont(phone);
  return { width, phone, look: "stage", measure: (t, f) => measure(t, f), wrap: (t, w, f, max) => wrap(t, w, f, max), child: (_id: string, _avail?: number) => { throw new Error("no child here"); }, problem: (p) => problems.push(p) };
}
export const inputOf = (model: Model, sts: StepState[] = states(model), container: string | null = null, members: string[] = []): LayoutInput => ({ model, states: sts, container, members, regions: model.regions });
export type { Placed };
