// Lane parse: a format 11 composed-stage block -> Model (DESIGN 2.7). The old parser (src/core/stage.ts compileStage)
// reads the block; lanes become regions, cards things, step show/hide/light/tag/say/connector arrays facts. Head blocks
// are handed on verbatim (`layoutWords[layout]`); a block's step words become `layout` facts; columns/bars/units become
// chart things (kinds dots / bar / units). `tag` becomes `is` (replaces, never stacks).
import type { EngineSrc, Fact, Id, Model, Region, Relation, Step, Thing } from "../types";
import { compileStage, type Compiled } from "../../core/stage";
import { blockFor, blockByMore, colon } from "../../core/stage-core";
import { emptyModel, expandIds, infoOf, problem, rolesOf, slug, splitBody, toneOf } from "./common";
import { blockParts } from "../layouts/block-parts"; // blocks2

type RL = { n: number; ind: number; t: string };
const rawLines = (src: string, base: number): RL[] => {
  const out: RL[] = [];
  src.split("\n").forEach((raw, i) => {
    const t0 = raw.replace(/\t/g, "  "), t = t0.trim();
    if (!t || t.startsWith("// ")) return;
    out.push({ n: base + i, ind: t0.length - t0.trimStart().length, t });
  });
  return out;
};
const withBody = (ls: RL[], i: number): [RL[], number] => { const body: RL[] = []; let j = i; while (j + 1 < ls.length && ls[j + 1].ind > ls[i].ind) body.push(ls[++j]); return [body, j]; };
const bodyText = (l: RL, body: RL[]) => body.map((b) => " ".repeat(Math.max(0, b.ind - l.ind - 2)) + b.t);

/** which layout owns each head block's words */
const HEAD_LAYOUT: Record<string, string> = { sheet: "sheet", time: "timeline", matrix: "grid", bins: "grid", nest: "wrap", track: "track" };
const CHART_HEAD: Record<string, "dots" | "bar" | "units"> = { columns: "dots", bars: "bar", units: "units" };
/** words that mean something on cards too: a line is the block's only when its ids are not cards */
const GENERIC = new Set(["show", "light", "hide", "tag", "dim", "fill", "move", "tone", "set", "title", "arrow", "dot", "mark", "off", "tile", "value", "text", "state", "dashed", "cross"]);
const TAIL = new Set(["good", "bad", "warn", "acc", "accent", "hot", "muted", "off", "corner", "plain"]);
const SETUP_ONLY = new Set(["##", "...", "title", "layout", "lines", "flow", "notes", "align", "key at", "zoom", "panels", "next row"]);

export function lowerStage(src: EngineSrc): Model {
  const sp = splitBody(src.body, src.line0);
  const info: Record<string, string> = {};
  if (src.fence.title) info.title = src.fence.title;
  const model = emptyModel(src, "stage11");
  model.fence["stage-src"] = JSON.stringify({ head: sp.head, steps: sp.steps, base: sp.base, info });
  rolesOf(model, src.roles);
  const c: Compiled = compileStage(sp.head, sp.steps, sp.base, info, src.roles);
  for (const e of c.errors) problem(model, e.line, e.msg);
  for (const w of c.warnings) problem(model, w.line, w.msg, true);
  const m = c.model;
  model.title = m.title || null; model.note = m.note || null; model.layout = "lanes";
  if (m.zoom) model.fence.zoom = "yes";
  if (m.notesAbove) model.fence["notes"] = "above";
  if (m.notesRoomy) model.fence["notes"] = "roomy";
  if (m.linesStraight) model.fence.lines = "straight";
  if (m.flowOff) model.fence.flow = "off";
  if (m.keyAt) model.fence["key-at"] = m.keyAt;
  if (m.cx.align) model.fence.align = "top";
  model.fence["lanes-at"] = String(m.lanesAt);

  // ---- lanes -> regions
  const ids: string[] = [], seen = new Set<string>();
  m.lanes.forEach((l, i) => {
    let id = slug(l.title, `row${i + 1}`); while (seen.has(id)) id += "-" + i; seen.add(id); ids.push(id);
    const flags: string[] = [];
    if (l.span) flags.push(l.belowTime ? "below-time" : l.across ? "across" : l.above ? "above" : "under", `${l.span[0]}..${l.span[1]}`);
    if (l.row) flags.push("row");
    if (l.breaks?.length) flags.push(`breaks=${l.breaks.join(",")}`);
    for (const x of l.more) flags.push(`more=${x}`);
    const r: Region = { id, title: l.title, flags, src: { line: l.line }, layout: "lanes" };
    model.regions.push(r);
  });
  const regionOf = (title: string): string | null => { const k = m.lanes.findIndex((l) => l.title === title && !l.span); return k < 0 ? null : ids[k]; };

  // ---- cards -> things
  const setup: Fact[] = model.setup;
  for (const card of m.cards.values()) {
    const keys: Record<string, string> = {};
    if (card.badges.length) keys.badges = JSON.stringify(card.badges);
    if (card.pills.length) keys.pills = card.pills.join(",");
    if (card.tokens.length) keys.tokens = card.tokens.join(",");
    if (card.keys.length) keys.keys = card.keys.join(",");
    if (card.under) keys.under = card.under.join("..");
    for (const f of ["roomy", "endsHere", "inside", "stacked", "plainBadges"] as const) if (card[f]) keys[f] = "yes";
    if (card.vals0) keys.vals0 = JSON.stringify(card.vals0);
    const t: Thing = {
      id: card.id, role: card.role === "plain" ? null : card.role, title: card.title, lines: [...card.subs], flags: [], shape: "box", layout: null,
      container: card.kids.length > 0, parent: card.parent ?? null, region: ids[card.lane] ?? (card.parent ? model.things[card.parent]?.region ?? null : null), order: model.order.length,
      values: null, keys, chart: null, src: { line: card.line },
    };
    model.things[t.id] = t; model.order.push(t.id);
    if (card.tag) setup.push({ k: "is", ids: [t.id], words: card.tag, src: { line: card.line } });
    if (card.state) setup.push({ k: "is", ids: [t.id], words: card.state.s, src: { line: card.line } });
    // eng-lanes2: a setup state word's tone (`[- shut]` bad, a chip form role) as a step's state-tone fact carries it
    // eng-migrate2: a good one too, so a state word stays a state word (not a tag) when the scene is written again in format 12
    if (card.state) t.keys.stateTone = `${card.state.tone}${card.state.gone ? " gone" : ""}`;
  }

  for (let again = true; again; ) { again = false; for (const t of Object.values(model.things)) if (!t.region && t.parent && model.things[t.parent]?.region) { t.region = model.things[t.parent].region; again = true; } } // a card inside a card is in its holder's lane
  for (const pill of m.cx.pills.values()) {
    if (model.things[pill.id]) continue;
    model.things[pill.id] = { id: pill.id, role: pill.role === "plain" ? null : pill.role, title: pill.s, lines: [], flags: ["pill"], shape: "pill", layout: null, container: false, parent: pill.home || null, region: model.things[pill.home]?.region ?? null, order: model.order.length, values: null, keys: {}, chart: null, src: { line: pill.line } };
    model.order.push(pill.id);
    if (model.things[pill.home]) model.things[pill.home].container = true;
  }

  // ---- head blocks: handed on verbatim, or chart things
  const cardLines = new Set([...m.cards.values()].map((x) => x.line)), laneLines = new Set(m.lanes.map((l) => l.line));
  const charts: { id: Id; word: string; labels: string[] }[] = [];
  const hl = rawLines(sp.head, sp.base);
  let cur: { word: string; key: string; chart: Thing | null } | null = null;
  let chartN = 0;
  const addWord = (key: string, e: { word: string; arg: string; body: string[]; src: { line: number } }) => { (model.layoutWords[key] ??= []).push(e); };
  for (let i = 0; i < hl.length; i++) {
    const l = hl[i]; const [body, j] = withBody(hl, i); i = j;
    const col = colon(l.t), word = (col ? col[0] : l.t).split(" ")[0];
    // a time block's own zoom words (zoom: / zoom ticks: / zoom row ...) are claimed by the block, not the stage-level zoom
    if (l.t.startsWith("## ") || l.t.startsWith("... ") || ((SETUP_ONLY.has(word) || (col && SETUP_ONLY.has(col[0]))) && !(cur && word === "zoom"))) { if (l.t.startsWith("## ")) cur = null; continue; }
    const hb = blockFor(word);
    if (hb && hb.kind === "head") {
      const arg = col && col[0] === word ? col[1] : l.t.slice(word.length).trim();
      const key = HEAD_LAYOUT[word] ?? "chart";
      if (CHART_HEAD[word]) {
        const th = chartThing(model, word, arg, l, body, ++chartN, m.head.findIndex((h) => h.block === hb));
        if (word === "bars") stageBars(th, m.head[Number(th.keys.headAt)]?.node); // eng-stagebars
        if (word === "columns") stageColumns(th, m.head[Number(th.keys.headAt)]?.node);
        cur = { word, key, chart: th }; charts.push({ id: th.id, word, labels: th.chart!.x });
      } else { addWord(key, { word, arg, body: bodyText(l, body), src: { line: l.n } }); cur = { word, key, chart: null }; }
      continue;
    }
    if (cardLines.has(l.n) || laneLines.has(l.n)) { cur = null; continue; }
    const mb = blockByMore(word);
    if (mb && col) {
      const key = HEAD_LAYOUT[mb.word] ?? "chart";
      if (CHART_HEAD[mb.word]) { const th = charts.find((c) => c.word === mb.word); if (th) { chartMore(model.things[th.id], word, col[1]); continue; } }
      addWord(key, { word, arg: col[1], body: bodyText(l, body), src: { line: l.n } }); continue;
    }
    if (cur) { // a line the block claimed
      const arg = col && col[0] === word ? col[1] : l.t.slice(word.length).trim();
      if (cur.chart) chartMore(cur.chart, word, arg); else addWord(cur.key, { word, arg, body: bodyText(l, body), src: { line: l.n } });
    }
  }
  const panelWords = new Set(["chips", "calc", "card", "cells", "grid", "rows", "map", "list", "units"]);
  // blocks2: a scene with no lanes and no cards is drawn by one head-block layout (or the grid for panels only); its panels are the
  // grid layout's words (a counted-squares panel too), not chart things. A lanes scene keeps the old way (the lanes layout draws them).
  const famsEarly = new Set(m.head.map((h) => HEAD_LAYOUT[h.block.word] ?? "").filter(Boolean));
  const hasPanels = m.steps.some((s) => s.panels.length);
  if (!m.head.length && hasPanels) famsEarly.add("grid");
  const headLayout = !m.lanes.length && !m.cards.size && famsEarly.size === 1;
  const opWords = new Set<string>(m.head.flatMap((h) => h.block.ops ?? []));

  // ---- steps -> facts
  const relKey = (e: { from: string; to: string; copy?: number }) => `${e.from}->${e.to}${e.copy ? "#" + (e.copy + 1) : ""}`;
  const cardId = (id: string) => m.cards.has(id) || m.cx.pills.has(id);
  let panelUnits: Id[] = []; // a units panel is shown in its own step only
  m.steps.forEach((st, k) => {
    const facts: Fact[] = [];
    if (panelUnits.length) { facts.push({ k: "hide", ids: panelUnits, src: { line: st.line } }); panelUnits = []; }
    const L = (line: number) => ({ line });
    const at = L(st.line);
    for (const [h, on] of st.heads) if (ids[h]) facts.push({ k: on ? "show" : "hide", ids: [ids[h]], src: at });
    if (st.clear) facts.push({ k: "clear", src: at });
    if (st.all) facts.push({ k: "show", ids: [...m.cards.keys()], src: at });
    if (st.show.length) facts.push({ k: "show", ids: st.show, src: at });
    if (st.hide.length) facts.push({ k: "hide", ids: st.hide, src: at });
    for (const e of st.edges) {
      const id = relKey(e);
      const style: Relation["style"] = e.dash ? "dashed" : "arrow";
      if (!model.relations[id]) model.relations[id] = { id, from: e.from, to: e.to, style, label: null, role: e.role ?? null, setup: false, src: L(e.line) };
      facts.push({ k: "rel", rel: id, words: e.label || null, style, role: e.role ?? null, src: L(e.line) });
    }
    for (const x of st.cuts ?? []) facts.push({ k: "layout", word: "cut", arg: `${x.from} --> ${x.to}`, body: [], src: L(x.line) });
    for (const [tids, words] of st.tags) facts.push({ k: "is", ids: tids, words, src: at });
    // the card words of this step (stage-cards.ts CardStep): text, title, state, tone, dim, dashed, cross, move, fill, mark, light on pills
    const cs = m.cx.steps[k];
    if (cs) {
      for (const [id, lit] of cs.lit) facts.push({ k: "light", ids: [id], ...(lit ? { note: lit } : {}), src: at });
      for (const [id, t] of cs.title) facts.push({ k: "layout", word: "title", arg: `${id}: ${t}`, body: [], src: at });
      for (const [id, ls] of cs.text) facts.push({ k: "text", id, lines: ls, src: at });
      for (const [id, s] of cs.state) { facts.push({ k: "is", ids: [id], words: s ? s.s : null, src: at }); if (s) facts.push({ k: "layout", word: "state-tone", arg: `${id} ${s.tone}${s.gone ? " gone" : ""}`, body: [], src: at }); }
      for (const [id, t] of cs.tone) facts.push({ k: "tone", ids: [id], tone: t === null ? "off" : toneOf(t) ?? "off", src: at });
      for (const [id, on] of cs.ghost) facts.push({ k: "dim", ids: [id], on, src: at });
      for (const [id, on] of cs.dash) facts.push({ k: "layout", word: "dashed", arg: `${id}${on ? "" : " off"}`, body: [], src: at });
      for (const [id, on] of cs.cross) facts.push({ k: "layout", word: "cross", arg: `${id}${on ? "" : " off"}`, body: [], src: at });
      for (const [id, on] of cs.crossC) facts.push({ k: "layout", word: "cross", arg: `${id} corner${on ? "" : " off"}`, body: [], src: at });
      for (const [id, to] of cs.move) facts.push({ k: "at", ids: [id], place: to, src: at });
      for (const [id, key, v] of cs.fill) facts.push({ k: "layout", word: "fill", arg: `${id} ${key}: ${v}`, body: [], src: at });
      for (const c of cs.chips) facts.push({ k: "layout", word: "mark", arg: `${c.card} ${c.idx.map((i) => "#" + (i + 1)).join(", ")}: ${c.tone}${c.remark ? " " + c.remark : ""}`, body: [], src: at });
    }
    for (const [id, text, side] of st.says) facts.push({ k: "say", id, words: text, ...(side ? { side: side as "above" } : {}), src: at });
    if (st.light.length) facts.push({ k: "light", ids: st.light, src: at });
    for (const [id, text] of st.insides) facts.push({ k: "layout", word: "inside", arg: `${id}: ${text}`, body: [], src: at });
    for (const kx of st.keys) facts.push({ k: "layout", word: "key", arg: kx.filter((x) => x !== undefined && x !== true && x !== false).join(": "), body: [], src: at });
    for (const n of st.notes) facts.push({ k: "note", words: n.join(" | "), src: at });
    st.foot.forEach((f, i) => facts.push({ k: "foot", words: f, tone: st.footInk?.[i] ?? null, src: at }));
    if (st.formula.length) facts.push({ k: "layout", word: "=", arg: st.formula.join(" | "), body: [], src: at });
    // the block words and panels of this step, from its raw lines
    const raw = sp.steps[k];
    if (raw) {
      const panelLines = new Set(st.panels.map((p) => p.line));
      const sl = rawLines(raw.raw, raw.line + 1);
      for (let i = 0; i < sl.length; i++) {
        const l = sl[i]; const [body, j] = withBody(sl, i); i = j;
        const keep = l.t.startsWith("keep "), t = keep ? l.t.slice(5) : l.t, col = colon(t), word = (col ? col[0] : t).split(" ")[0].replace(/:$/, "");
        const arg = t.slice(word.length).replace(/^:/, "").trim();
        const isPanel = panelLines.has(l.n) || (panelWords.has(word) && blockFor(word)?.kind === "panel");
        if (isPanel && word === "units" && !headLayout) {
          const id = `units${++chartN}`; unitsThing(model, id, arg, l, body, -1);
          facts.push({ k: "show", ids: [id], src: L(l.n) }); panelUnits.push(id); continue;
        }
        if (isPanel) { facts.push({ k: "layout", word, arg, body: bodyText(l, body), src: L(l.n) }); continue; }
        // render2: a step's "beside" (its panels side by side, by shares) is the grid layout's word; it was dropped, so a card and
        // its counted squares stacked (stage 14)
        if (word === "beside" && headLayout && famsEarly.has("grid")) { facts.push({ k: "layout", word, arg, body: [], src: L(l.n) }); continue; }
        if (!keep && !opWords.has(word)) continue;
        // charts: counts / values are numbers of that chart
        const ch = charts.find((x) => (CHART_HEAD[x.word] === "dots" && word === "counts") || (CHART_HEAD[x.word] === "bar" && (word === "values" || word === "bars")));
        if (ch && (word === "counts" || word === "values" || word === "bars")) {
          const list = (word === "counts" ? (arg.indexOf(": ") >= 0 && /^\d+$/.test(arg.slice(0, arg.indexOf(": "))) ? arg.slice(arg.indexOf(": ") + 2) : arg) : arg).split(/[\s,]+/).filter(Boolean);
          facts.push({ k: "values", id: ch.id, values: list, from: [], src: L(l.n) }); continue;
        }
        let idsOf = (col ? col[0].slice(word.length) : arg.split(":")[0]).trim();
        { const w = idsOf.split(/\s+/); while (w.length > 1 && TAIL.has(w[w.length - 1])) w.pop(); if (["tone", "dim", "dashed", "cross"].includes(word)) idsOf = w.join(" "); }
        if (word === "light") {
          const lc = charts.find((x) => x.labels.length && expandRange(idsOf, x.labels).length);
          if (lc) { facts.push({ k: "light", ids: expandRange(idsOf, lc.labels).map((lab) => `${lc.id}.${lab}`), src: L(l.n) }); continue; }
        }
        { // eng-stagebars: the bars' own step words are the chart's (opts["bar-steps"], stageBars below), not layout words
          const bars = charts.find((x) => CHART_HEAD[x.word] === "bar");
          if (bars && !keep && (BAR_WORDS.has(word) || (word === "move" && barMove(bars.labels, arg)) || (word === "tone" && expandRange(idsOf, bars.labels).length))) continue;
        }
        if (!keep && GENERIC.has(word) && expandIds(idsOf || arg).every((x) => cardId(x) || ids.includes(x) || x === "all")) continue; // a card word: the arrays above hold it
        if (keep) facts.push({ k: "layout", word: "keep", arg: t, body: bodyText(l, body), src: L(l.n) }); // keep at 6 [bad]: x -> word keep, arg "at 6 [bad]: x"
        else facts.push({ k: "layout", word, arg, body: bodyText(l, body), src: L(l.n) });
      }
    }
    const step: Step = { title: st.title, caption: st.caption, facts, src: L(st.line) };
    model.steps.push(step);
  });
  void regionOf;
  // a scene of one head block family and no lane or card is that family's layout (the lanes layout hosts head blocks beside lanes)
  if (!m.lanes.length && !m.cards.size) {
    const fams = new Set(m.head.map((h) => (HEAD_LAYOUT[h.block.word] ?? "")).filter(Boolean));
    if (!m.head.length && m.steps.some((s) => s.panels.length)) fams.add("grid");
    if (fams.size === 1) model.layout = [...fams][0] as Model["layout"];
  }
  blockParts(model); // blocks2: what a head-block layout shows at a step is Model things and facts, made here once
  return model;
}

// eng-stagebars: the stage's bar words become the bar kind's own options (charts/xy/stagebars.ts reads them)
const BAR_WORDS = new Set(["peak", "limit", "heading", "big"]);
/** a bar move ("2 from Fri to Mon; 1 from Sat to Tue"): every part names two bars of this chart */
const barMove = (labels: string[], arg: string) => arg.split(";").every((p) => { const m = /^\s*\d+ from (.+?) to (.+?)\s*$/.exec(p); return !!m && labels.includes(m[1].trim()) && labels.includes(m[2].trim()); });
/** a `columns` block: the most dots any column holds in any step (its places, with the ones its dots left), so the columns' height never changes between steps */
function stageColumns(th: Thing, node: { counts: Map<number, number[]>; gaps: Map<number, number[][]> } | undefined) {
  let most = 0;
  for (const [k, xs] of node?.counts ?? []) xs.forEach((c, i) => { most = Math.max(most, c + (node!.gaps.get(k)?.[i]?.length ?? 0)); });
  if (most) th.chart!.opts.max = String(most);
}
/** the chart thing of a `bars` block: it draws as the stage did (opts.stage), with the steps' own words (peak, limit, heading, big, light, move, tone) as JSON */
function stageBars(th: Thing, node: { steps: Map<number, Record<string, unknown>>; most?: number } | undefined) {
  const ch = th.chart!; ch.opts.stage = "bars";
  if (node?.most) ch.opts["bar-most"] = String(node.most); // the largest value and limit of the whole story: the scale never changes between steps
  const steps: Record<string, Record<string, unknown>> = {};
  for (const [k, s] of node?.steps ?? []) {
    if (k < 1) continue;
    const o: Record<string, unknown> = {};
    for (const f of ["peak", "limit", "head", "big", "bar"]) if (s[f] !== undefined) o[f] = s[f];
    if ((s.moves as unknown[] | undefined)?.length) o.moves = s.moves;
    if ((s.tone as unknown[] | undefined)?.length) o.tone = s.tone;
    if (Object.keys(o).length) steps[String(k)] = o;
  }
  if (Object.keys(steps).length) ch.opts["bar-steps"] = JSON.stringify(steps);
}

/** `Jul..Dec`, `Jan, Mar`, `7..12` (by number) against a chart's labels: the labels named, in order ([] when any is not a label) */
function expandRange(text: string, labels: string[]): string[] {
  const out: string[] = [];
  for (const raw of text.split(",").map((x) => x.trim()).filter(Boolean)) {
    const r = raw.indexOf("..");
    if (r > 0) { const a = labels.indexOf(raw.slice(0, r).trim()), b = labels.indexOf(raw.slice(r + 2).trim()); if (a < 0 || b < a) return []; out.push(...labels.slice(a, b + 1)); continue; }
    if (!labels.includes(raw)) return [];
    out.push(raw);
  }
  return out;
}

function chartMore(t: Thing, word: string, arg: string) {
  const ch = t.chart!;
  if (word === "labels") { ch.x = arg.split(",").map((x) => x.trim()).filter(Boolean); return; }
  if (word === "every") { ch.opts.every = arg; return; }
  if (word === "values") { ch.series[0].values = arg.split(/[\s,]+/).filter(Boolean).map(Number); return; }
  ch.opts[word] = ch.opts[word] ? ch.opts[word] + "\n" + arg : arg;
}

/** `columns 12 store: caption | unit` (+ `every`, `labels:`), `bars 7 team: title | unit` (+ `axis`, `line`, `labels:` ...), `units 64: kept 16 ...` */
function chartThing(model: Model, word: string, arg: string, l: RL, body: RL[], n: number, headAt: number): Thing {
  const kind = CHART_HEAD[word];
  const id = n === 1 ? word : `${word}${n}`;
  if (word === "units") return unitsThing(model, id, arg, l, body, headAt);
  const k = arg.indexOf(": "), head = (k < 0 ? arg.replace(/:$/, "") : arg.slice(0, k)).trim(), rest = k < 0 ? "" : arg.slice(k + 2);
  const [nTxt, role = ""] = head.split(" ");
  const [caption = "", unit = ""] = rest.split(" | ").map((x) => x.trim());
  const count = /^\d+$/.test(nTxt ?? "") ? +nTxt : 0;
  const spec = {
    kind, title: word === "units" ? "" : caption, unit: unit || null,
    x: count ? Array.from({ length: count }, (_, i) => String(i)) : [], series: [{ name: "", role: role || null, values: [] as number[] }], flags: [] as string[], opts: {} as Record<string, string>,
  };
  if (word === "units") { spec.opts.total = head; spec.opts.groups = rest; }
  const t: Thing = {
    id, role: role || null, title: caption, lines: [], flags: ["chart", kind], shape: "box", layout: null, container: false, parent: null, region: null,
    order: model.order.length, values: null, keys: { headAt: String(headAt), n: String(count) }, chart: spec, src: { line: l.n },
  };
  model.things[id] = t; model.order.push(id);
  for (const b of body) { const col = colon(b.t); const w = (col ? col[0] : b.t).split(" ")[0]; chartMore(t, w, col && col[0] === w ? col[1] : b.t.slice(w.length).trim()); }
  if (word === "units" && body.length) spec.opts.body = body.map((b) => b.t).join("\n");
  return t;
}

/** units: x = the groups (kept, added, removed, leaving, gone), series[0] = the one grid's counts, opts.total = squares;
 * a panel (caption | note, with indented `role total: kept 8, leaving 4` rows): one series per row (role = the row's role),
 * opts.badges = the rows' badge roles, opts.total = the rows' totals, opts.text = the panel's own lines */
function unitsThing(model: Model, id: string, arg: string, l: RL, body: RL[], headAt: number): Thing {
  const groups = (txt: string): [string, number][] => txt.split(",").map((g) => g.trim().split(/\s+/)).filter((g) => g[0]).map((g) => [g[0], +g[1]]);
  const x: string[] = [], series: { name: string; role: string | null; values: number[] }[] = [], opts: Record<string, string> = {};
  let title = "", unit: string | null = null;
  const put = (names: string[], vals: Map<string, number>) => { for (const nm of names) if (!x.includes(nm)) x.push(nm); void vals; };
  if (body.length) {
    const [cap, ...note] = arg.split(" | "); title = cap.trim(); unit = note.join(" | ").trim() || null;
    const rows: { role: string; badge: string; total: string; g: [string, number][] }[] = [], text: string[] = [];
    for (const b of body) {
      const c = colon(b.t), m = c && /^([\w-]+)(?: \(([\w-]+)\))? (\S+)$/.exec(c[0]);
      if (m && /^\d/.test(m[3])) { rows.push({ role: m[1], badge: m[2] ?? m[1], total: m[3], g: groups(c![1]) }); put(groups(c![1]).map((g) => g[0]), new Map()); } else text.push(b.t);
    }
    for (const r of rows) series.push({ name: r.role, role: r.role, values: x.map((nm) => r.g.find((g) => g[0] === nm)?.[1] ?? 0) });
    opts.badges = rows.map((r) => r.badge).join(","); opts.total = rows.map((r) => r.total).join(",");
    if (text.length) opts.text = text.join("\n");
  } else {
    const k = arg.indexOf(": "), head = (k < 0 ? arg : arg.slice(0, k)).trim(), g = groups(k < 0 ? "" : arg.slice(k + 2));
    put(g.map((e) => e[0]), new Map()); series.push({ name: "", role: null, values: g.map((e) => e[1]) }); opts.total = head;
  }
  const spec = { kind: "units" as const, title, unit, x, series, flags: [] as string[], opts };
  const t: Thing = {
    id, role: null, title, lines: [], flags: ["chart", "units"], shape: "box", layout: null, container: false, parent: null, region: null,
    order: model.order.length, values: null, keys: { headAt: String(headAt) }, chart: spec, src: { line: l.n },
  };
  model.things[id] = t; model.order.push(id);
  return t;
}
