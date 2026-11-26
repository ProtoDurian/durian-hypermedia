// Grid layout, the ported words: the swimlane matrix and bins (head blocks) and the step panels (grid N, rows, map, list,
// card, calc, cells, chips), read from the words the front-end hands the layout and laid out by the stage's own block code.
// Port, not rewrite: `core/stage-slanes.ts`, `stage-bins.ts`, `stage-blocks.ts`, `stage-panels2.ts`, `stage-cells.ts` keep
// their parsing and their measured layout; this file reads the Model into the shape those blocks expect.
//
// What the front-end hands this layout (parse/lower-stage.ts, ENGINE.md section 3, CONTRACT.md):
//   model.layoutWords.grid[]   entries in source order. A head block's entry has word "matrix" | "bins", arg = the text after
//       `word:`, body = its own indented lines (indentation relative, children at 0). Every setup line the block claims follows as
//       an entry of its own: word = the line's first word, arg = the rest (`client c: Browser | the person` is word "client",
//       arg "c: Browser | the person"; `ledger: Photo | Album` is word "ledger", arg "Photo | Album"), body = its children
//       (a lane's cell lines). The line is put back together and offered to the head's `claim`.
//   step facts `{ k: "layout", word, arg, body, src }`: the panel words (grid rows map list card calc cells chips), `beside`,
//       `into`, and the ids a head owns in `show` / `light`; a repeated panel is word "keep <word>" (or the bare word with
//       nothing under it); a plain show/light fact with ids is read too.
import "../../../core/stage-blocks"; // registers the blocks
import { blockFor, blockByMore, StageError, parts, colon, type Line, type StageBlock, type ParseCtx, type Box, type LayoutOut } from "../../../core/stage-core";
import type { Fact, Model, Problem } from "../../types";

export type Head = { block: StageBlock; node: any; word: string; line: number };
export type PanelRef = { block: StageBlock; node: any; line: number };
export type StepPanels = { panels: PanelRef[]; beside?: number[] };
export type Legacy = { heads: Head[]; steps: StepPanels[]; problems: Problem[]; hasPanels: boolean };

export const PANEL_WORDS = ["grid", "rows", "map", "list", "card", "calc", "cells", "chips", "units"] as const; // units: the counted squares panel (blocks2: no longer a chart thing nobody draws)
/** the setup words the grid layout owns (the heads) and the step words (panels, the head ops that are no card words) */
export const HEAD_WORDS = ["matrix", "bins"] as const;
export const STEP_WORDS = [...PANEL_WORDS, "into", "beside", "keep"] as const;

/** raw text lines to the stage's Lines: indentation = the count of leading spaces, blank lines dropped, n = source line */
export function toLines(raw: string[], line0: number): Line[] {
  const out: Line[] = [];
  raw.forEach((r, i) => { const t = r.trim(); if (t) out.push({ n: line0 + i, ind: r.length - r.trimStart().length, t }); });
  return out;
}
/** the lines deeper than lines[i], taken after it (the stage's `body`) */
const bodyOf = (ls: Line[], i: number): Line[] => { const out: Line[] = []; while (i + 1 + out.length < ls.length && ls[i + 1 + out.length].ind > ls[i].ind) out.push(ls[i + 1 + out.length]); return out; };

const cache = new WeakMap<Model, Legacy>();
export function readLegacy(model: Model): Legacy {
  const hit = cache.get(model); if (hit) return hit;
  const out = parse(model); cache.set(model, out); return out;
}

function parse(model: Model): Legacy {
  const problems: Problem[] = [];
  const problem = (line: number, msg: string) => problems.push({ line, msg });
  const n = model.steps.length;
  const ctx: ParseCtx = { roles: new Set(Object.keys(model.roles)), problem, ids: new Set(), steps: n };
  const guard = <T>(line: number, fn: () => T): T | undefined => { try { return fn(); } catch (e) { if (e instanceof StageError) { problem(e.line, e.message); return undefined; } throw e; } };

  // ---- the setup: head blocks, each with the lines it claims
  const heads: Head[] = [];
  let cur: Head | null = null;
  for (const w of model.layoutWords.grid ?? []) {
    const hb = blockFor(w.word);
    if (hb && hb.kind === "head") {
      const own = toLines(w.body, w.src.line + 1);
      const node = guard(w.src.line, () => hb.parse({ word: w.word, arg: w.arg, body: own, line: w.src.line }, ctx));
      cur = node === undefined ? null : { block: hb, node, word: w.word, line: w.src.line }; if (cur) heads.push(cur);
      continue;
    }
    if (!cur) { if (!hb) problem(w.src.line, `"${w.word}" is not a word of the grid layout (its heads: ${HEAD_WORDS.join(", ")})`); continue; }
    const head = cur;
    guard(w.src.line, () => {
      // the claimed line, put back together: "word rest", else "word: rest"; its children sit deeper than it
      const kids = toLines(w.body, w.src.line + 1).map((l) => ({ ...l, ind: l.ind + 1 }));
      for (const t of [`${w.word} ${w.arg}`.trim(), `${w.word}: ${w.arg}`]) {
        const l: Line = { n: w.src.line, ind: 0, t };
        if (head.block.claim?.(head.node, l, kids, ctx)) return;
      }
      const mb = blockByMore(w.word);
      if (mb === head.block) { head.block.op!(head.node, { word: w.word, arg: w.arg, body: kids, line: w.src.line, step: 0 }, ctx); return; }
      throw new StageError(w.src.line, `this line does not read under ${head.word}: "${w.word} ${w.arg}".slice(0, 50)`);
    });
  }
  for (const h of heads) guard(h.line, () => h.block.check?.(h.node, ctx));

  // ---- the steps: panels, `beside`, `keep`, and the head ops
  const steps: StepPanels[] = [];
  let hasPanels = false;
  model.steps.forEach((s, si) => {
    const k = si + 1, st: StepPanels = { panels: [] }; steps.push(st);
    let lastPanelFact = -2;
    s.facts.forEach((f, fi) => {
      const lf = layoutFact(f); if (!lf) return;
      guard(lf.line, () => {
        let { word, arg } = lf; const body = toLines(lf.body, lf.line + 1);
        if (word === "beside") {
          const ws = arg.trim() ? parts(arg, ",").map((x) => Number(x.trim())) : [];
          if (ws.some((x) => !Number.isInteger(x) || x < 1 || x > 9)) throw new StageError(lf.line, `"beside" lays this step's panels side by side; optional shares are whole numbers 1 to 9: beside 1, 2`);
          st.beside = ws; return;
        }
        let keep = false;
        if (word.startsWith("keep ")) { arg = `${word.slice(5)} ${arg}`.trim(); word = "keep"; }
        // a panel word with nothing under it, after a panel of that word in an earlier step, is the stage's "keep <word>" (the lowering drops the "keep")
        if (word !== "keep" && !arg && !lf.body.length && steps.slice(0, -1).some((p) => p.panels.some((x) => x.block === blockFor(word))) && blockFor(word)?.kind === "panel") { arg = word; word = "keep"; }
        if (word === "keep") {
          const [w0, ...rest] = arg.trim().split(/\s+/); const kb = blockFor(w0);
          if (kb && (kb.kind === "panel" || kb.panel) && !rest.length) { // "keep grid": the last step's panel of that word again
            const was = steps.slice(0, -1).reverse().map((p) => p.panels.filter((x) => x.block === kb)).find((ps) => ps.length);
            if (!was) { problem(lf.line, `"keep ${w0}" shows the last step's ${w0} panel again; no step before this one has one`); return; }
            st.panels.push(...was.map((x) => ({ ...x, line: lf.line }))); hasPanels = true; return;
          }
          keep = true; word = w0; arg = rest.join(" ");
        }
        const pb = blockFor(word);
        if (!keep && pb && (pb.kind === "panel" || pb.panel)) {
          const node = pb.parse({ word, arg, body, line: lf.line }, ctx), prev = st.panels.at(-1);
          hasPanels = true;
          if (prev && prev.block === pb && lastPanelFact === fi - 1 && pb.join?.(prev.node, node)) { lastPanelFact = fi; return; } // a panel right under one of its word may join it
          st.panels.push({ block: pb, node, line: lf.line }); lastPanelFact = fi; return;
        }
        // a head's own step word (into, show, light ...): each owner in source order until one takes it
        const own = heads.filter((h) => h.block.ops?.includes(word));
        const shared = own.length > 1 || word === "show" || word === "light" || word === "hide";
        for (const h of own) if (h.block.op!(h.node, { word, arg, body, line: lf.line, step: k, keep, shared }, ctx) !== false) return;
        if (lf.generic) return; // a plain show/light fact of some other layout's card: not an error here
        if (own.length) throw new StageError(lf.line, `no ${own.map((h) => h.block.word).join(" or ")} of this scene has what "${word} ${arg}" names`);
        // a word of the grid layout whose block the scene did not declare is an error; any other layout fact (at, mark, cut, key ...) is another layout's
        const mine = HEAD_WORDS.map((w) => blockFor(w)).filter((b) => b?.ops?.includes(word));
        if (mine.length && word !== "show" && word !== "light") throw new StageError(lf.line, `"${word}" works on a ${mine[0]!.word}: declare one in the setup`);
      });
    });
  });
  return { heads, steps, problems, hasPanels };
}

/** a step fact as the old (word, arg, body): a layout fact verbatim, a plain show/light fact as the stage's own line */
function layoutFact(f: Fact): { word: string; arg: string; body: string[]; line: number; generic?: boolean } | null {
  if (f.k === "layout") return { word: f.word, arg: f.arg, body: f.body, line: f.src.line };
  if (f.k === "show" || f.k === "light") {
    if (!f.ids.length) return null;
    const note = f.k === "light" ? f.note : undefined;
    return { word: f.k, arg: f.ids.join(", ") + (note ? `: ${note}` : ""), body: [], line: f.src.line, generic: true };
  }
  return null;
}

/** the old Box a block lays out in */
export const boxFor = (model: Model, w: number, narrow: boolean): Box => ({ w, narrow, steps: model.steps.length, stepTitles: model.steps.map((s) => s.title) });

export type { LayoutOut };
