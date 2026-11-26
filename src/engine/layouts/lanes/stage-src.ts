// Lanes: the composed stage's source for a Model, for GEOMETRY only (where the lanes, the cards and their parts sit, and
// the lines between them). A format 11 block keeps its verbatim source in `model.fence["stage-src"]` (written by
// parse/lower-stage.ts); any other Model (format 12, or lowered from the graph engine) is printed back to the stage's
// words here. What a card shows is drawn from the Model (lanes/cards.ts), never from this text, so the print only has
// to make the stage reserve the right room:
// - a card's words, its state chip (`is` prints as a tag: the stage keeps a strip above the card), its values (a line);
// - a shape taller than a card (cylinder, person, circle, diamond, cloud) gets the lines of room it needs;
// - tokens and pointers are not cards: they sit at a thing, and the engine draws them there from the core's state;
// - a line's lost (`-x`) and stream (`~>`) forms print as a plain line: the renderer draws their motion from the event.
// A step word the lanes layout cannot place is refused with its line (`in`: a card keeps its place in its lane).
import type { Fact, Model, Problem, Thing } from "../../types";
import { badgesOf, recordKeysOf, tokensOf } from "./words"; // eng-migrate2
import { blockFor } from "../../../core/stage-core"; // eng-migrate2

export type StageSrc = { head: string; steps: { title: string; raw: string; line: number }[]; base: number; info: Record<string, string>; problems?: Problem[] };

export const STASH = "stage-src";

export function stashOf(model: Model): StageSrc | null {
  const s = model.fence[STASH]; if (!s) return null;
  try { const o = JSON.parse(s) as StageSrc; return o && typeof o.head === "string" && Array.isArray(o.steps) ? { ...o, info: o.info ?? {}, base: o.base ?? 1 } : null; } catch { return null; }
}

export function stageSrcOf(model: Model): StageSrc { return stashOf(model) ?? printStage(model); }

/** the page's roles as the stage reads them: name -> colour number */
export const stageRoles = (model: Model): Record<string, number> => Object.fromEntries(Object.entries(model.roles).map(([k, v]) => [k, v.colour]));

const ids = (a: string[]) => a.join(",");
/** things that sit at a thing rather than in a lane */
export const sitsAt = (t: Thing | undefined): boolean => !!t && (t.shape === "token" || t.shape === "ref");
/** lines of room a shape needs over a card's (render/prims.ts thingNeed: a person's icon, a cylinder's lid ...) */
const SHAPE_ROOM: Partial<Record<Thing["shape"], number>> = { cylinder: 1, person: 2, circle: 2, diamond: 3, cloud: 2 };

function thingLine(t: Thing, how = ""): string {
  const pad = Array.from({ length: SHAPE_ROOM[t.shape] ?? 0 }, () => "~ ·");
  const vals = t.values?.length ? [t.values.join("  ")] : [];
  const lines = [t.title || "_", ...t.lines, ...vals, ...pad].filter((x, i) => i === 0 || x);
  return `${t.role ?? "plain"} ${t.id}${how}: ${lines.join(" | ")}`;
}

// eng-migrate2: what the stage reads under a card (stage-cards.ts parseCardBody), from the keys parse/lower-stage.ts keeps:
// badges, `badges: stacked`, `ends: on this card`, `spacing: roomy`, tokens, a record's keys (with their first values)
function cardBody(t: Thing): string[] {
  const out: string[] = [], k = t.keys;
  const bs = badgesOf(k); if (bs.length) out.push(`+ ${bs.map((b) => `(${b.b}) ${b.s}`).join("; ")}`);
  if (k.stacked === "yes") out.push(`badges: stacked${k.plainBadges === "yes" ? " plain" : ""}`);
  if (k.endsHere === "yes") out.push("ends: on this card");
  if (k.roomy === "yes") out.push("spacing: roomy");
  const toks = tokensOf(k); if (toks.length) out.push(`tokens: ${toks.join(" ")}`);
  const rk = recordKeysOf(k);
  if (rk.length) { let v0: Record<string, string> = {}; try { v0 = k.vals0 ? JSON.parse(k.vals0) : {}; } catch { /* none */ } out.push(`keys: ${rk.map((x) => (v0[x] !== undefined ? `${x} = ${v0[x]}` : x)).join("; ")}`); }
  return out;
}
/** a pill: a chip that sits in a card's foot (stage-cards.ts pillLine); its role only when it is not its card's */
const isPill = (t: Thing | undefined): boolean => !!t && t.shape === "pill" && !!t.parent;
/** a chart the stage drew as a head block (`columns`, `bars`, `units`: parse/lower-stage.ts chartThing keeps `keys.headAt`) */
const isStageChart = (t: Thing | undefined): boolean => !!t?.chart && t.keys.headAt !== undefined;
/** a head word and its argument as the stage reads it back (`nest: On the link`, `column sb: Submit`): the same argument either way */
const headLine = (word: string, arg: string): string => (!arg ? word : arg.includes(": ") ? `${word} ${arg}` : `${word}: ${arg}`);

/** a stage chart block (`columns 12 store: caption | unit` ...) from its chart thing */
function chartHead(t: Thing): string[] {
  const c = t.chart!, o = c.opts, out: string[] = [];
  const word = c.kind === "dots" ? "columns" : c.kind === "bar" ? "bars" : "units";
  if (word === "units") {
    if (o.body !== undefined) return [`units ${o.total ?? ""}: ${[c.title, ...(c.unit ? [c.unit] : [])].join(" | ")}`, ...o.body.split("\n").map((b) => `  ${b}`)];
    const g = c.x.map((x, i) => `${x} ${c.series[0]?.values[i] ?? 0}`).join(", ");
    return [`units ${o.total ?? ""}${g ? `: ${g}` : ""}`];
  }
  const n = Number(t.keys.n) || c.x.length;
  out.push(`${word} ${n}${c.series[0]?.role ? ` ${c.series[0].role}` : ""}: ${c.title}${c.unit ? ` | ${c.unit}` : ""}`);
  for (const w of ["axis", "every", "line", "tabs", "tone"]) for (const v of (o[w] ?? "").split("\n").filter(Boolean)) out.push(`  ${w} ${v}`);
  if (c.x.length && !c.x.every((x, i) => x === String(i))) out.push(`  labels: ${c.x.join(", ")}`);
  return out;
}
/** a stage bar block's step words, from what parse/lower-stage.ts stageBars kept (opts["bar-steps"]) */
function barSteps(t: Thing, k: number): string[] {
  let all: Record<string, Record<string, any>> = {}; try { all = JSON.parse(t.chart?.opts["bar-steps"] ?? "{}"); } catch { /* none */ }
  const s = all[String(k)]; if (!s) return [];
  const lab = (i: number) => t.chart!.x[i] ?? String(i), out: string[] = [];
  if (s.peak !== undefined) out.push(`peak: ${s.peak}`);
  if (s.limit) out.push(`limit ${s.limit.v}: ${s.limit.s}`);
  if (s.head) out.push(`heading: ${[].concat(s.head).join(" | ")}`);
  if (s.big) out.push(`big: ${[].concat(s.big).join(" | ")}`);
  if (s.bar) out.push(`light ${lab(s.bar.i)}${s.bar.s ? `: ${s.bar.s}` : ""}`);
  if (s.moves?.length) out.push(`move ${s.moves.map((m: { from: number; to: number; k: number }) => `${m.k} from ${lab(m.from)} to ${lab(m.to)}`).join("; ")}`);
  for (const [i, tone] of s.tone ?? []) out.push(`tone ${lab(i)} ${tone ?? "off"}`);
  return out;
}

function factLines(f: Fact, model: Model, problems: Problem[]): string[] {
  const cards = (a: string[]) => a.filter((id) => !sitsAt(model.things[id]));
  switch (f.k) {
    case "show": { const c = cards(f.ids); return c.length ? [`show ${ids(c)}`] : []; }
    case "hide": { const c = cards(f.ids); return c.length ? [`hide ${ids(c)}`] : []; }
    case "at": { const c = cards(f.ids); return c.length ? [`move ${ids(c)} to ${f.place}`] : []; }
    case "in": {
      const c = cards(f.ids);
      if (c.length) problems.push({ line: f.src.line, msg: `${ids(c)} in ${f.place}: in a lanes layout a card keeps its place in its lane; make it a [token] that sits at ${f.place} (\`${c[0]} at ${f.place}\`), or use a layout that moves things (graph, tree)` });
      return [];
    }
    case "is": { const c = cards(f.ids); return f.words === null || !c.length ? [] : [`tag ${ids(c)}: ${f.words}`]; }
    case "text": return sitsAt(model.things[f.id]) ? [] : [`text ${f.id}: ${f.lines.join(" | ")}`];
    case "dim": { const c = cards(f.ids); return c.length ? [f.on ? `dim ${ids(c)}` : `dim ${ids(c)} off`] : []; }
    case "tone": { const c = cards(f.ids); return c.length ? [`tone ${ids(c)} ${f.tone}`] : []; }
    case "clear": return ["clear"];
    case "rel": {
      const r = model.relations[f.rel]; if (!r || sitsAt(model.things[r.from]) || sitsAt(model.things[r.to])) return [];
      const arrow = f.style === "dashed" || r.style === "dashed" ? "-->" : "->";
      return [`${r.from} ${arrow} ${r.to}${f.role ? ` (${f.role})` : ""}${f.words ? `: ${f.words}` : ""}`];
    }
    case "light": {
      // eng-migrate2: a stage chart's categories (`columns.Jul`) are lit by their labels, as the stage wrote them; a bar block's
      // lights are its own step words (barSteps)
      const part = (id: string) => { const d = id.indexOf("."); const t = d > 0 ? model.things[id.slice(0, d)] : undefined; return isStageChart(t) ? t! : null; };
      const labs = f.ids.filter((id) => part(id) && part(id)!.chart!.kind !== "bar").map((id) => id.slice(id.indexOf(".") + 1));
      const c = cards(f.ids.filter((id) => !part(id)));
      return [...(c.length ? [`light ${ids(c)}${f.note ? `: ${f.note}` : ""}`] : []), ...(labs.length ? [`light ${labs.join(", ")}`] : [])];
    }
    case "values": { // eng-migrate2: a stage chart's numbers, in its block's own step word
      const t = model.things[f.id]; if (!isStageChart(t) || f.series) return [];
      return t!.chart!.kind === "dots" ? [`counts ${f.values.length}: ${f.values.join(", ")}`] : t!.chart!.kind === "bar" ? [`values: ${f.values.join(" ")}`] : [];
    }
    case "say": return sitsAt(model.things[f.id]) ? [] : [`say ${f.id}: ${f.words}`];
    case "note": return [`note: ${f.words}`];
    case "foot": return [`foot${f.tone ? ` (${f.tone})` : ""}: ${f.words}`];
    case "layout": if (f.word === "state-tone") return []; // eng-migrate2: written with its state word (stateLine)
      return [`${f.word}${f.arg ? ` ${f.arg}` : ""}`, ...f.body.map((b) => `  ${b}`)]; // eng-migrate2: the body stays indented under its word
    default: return [];
  }
}

/** eng-migrate2: lines of one step that join one card to several (`cfg -> s1`, `cfg -> db`, both `: polled`) are one line, as the stage
 *  wrote them (`cfg -> s1, db: polled`): on a phone the stage writes their words once.
 *  render3: only relations the author wrote as one line (one source line) are joined; two lines that say the same words
 *  (`a -> m: 30 crates`, `b -> m: 30 crates`) stay two, so each arrow keeps its own label (stage 18) */
export function joinRels(input: { l: string; src: number }[]): string[] {
  const re = /^(\S+) (-->|->) (\S+)((?: \([\w-]+\))?)((?:: .*)?)$/;
  const out: string[] = []; let last: { a: string[]; arrow: string; b: string[]; role: string; words: string } | null = null;
  const flush = () => { if (last) out.push(`${last.a.join(",")} ${last.arrow} ${last.b.join(", ")}${last.role}${last.words}`); last = null; };
  let lastSrc = -1; // render3
  for (const { l, src } of input) {
    const m = re.exec(l);
    if (!m || src < 0) { flush(); out.push(l); continue; }
    const [, a, arrow, b, role, words] = m;
    if (last && lastSrc === src && last.arrow === arrow && last.role === role && last.words === words && words) {
      if (last.a.length === 1 && last.a[0] === a && !last.b.includes(b)) { last.b.push(b); continue; }
      if (last.b.length === 1 && last.b[0] === b && !last.a.includes(a)) { last.a.push(a); continue; }
    }
    flush(); last = { a: [a], arrow, b: [b], role, words }; lastSrc = src;
  }
  flush();
  return out;
}

/** Model -> the stage's words, for the stage's geometry (the fallback for blocks with no stashed source) */
export function printStage(model: Model): StageSrc {
  const problems: Problem[] = [];
  const head: string[] = [];
  if (model.title) head.push(`title: ${model.title}${model.note ? ` | ${model.note}` : ""}`);
  // eng-migrate2: the stage's own options (format 12 keeps them as setup words: align, lines, flow, notes, key-at, zoom)
  const fo = model.fence;
  if (fo.align === "top") head.push("align: top");
  if (fo.lines === "straight") head.push("lines: straight");
  if (fo.flow === "off") head.push("flow: off");
  if (fo.notes === "above" || fo.notes === "roomy") head.push(`notes: ${fo.notes}`);
  if (fo["key-at"]) head.push(`key at: ${fo["key-at"]}`);
  if (fo.zoom) head.push(`zoom: ${fo.zoom}`);
  const part = (t: Thing) => t.flags.includes("part");
  const kids = (parent: string | null, region: string | null) => model.order.map((i) => model.things[i]).filter((t) => !sitsAt(t) && !isPill(t) && !part(t) && t.parent === parent && (parent !== null || t.region === region));
  const pills = (id: string) => model.order.map((i) => model.things[i]).filter((t) => isPill(t) && t.parent === id);
  const regionOf = (t: Thing) => model.regions.find((r) => r.id === t.region);
  const emit = (t: Thing, depth: number, out: string[]) => {
    const pad = "  ".repeat(depth);
    if (isStageChart(t)) { out.push(...chartHead(t).map((l) => pad + l)); return; }
    const how = regionOf(t)?.flags.includes("below-time") && !t.parent ? " below time" : t.keys.under ? ` under ${t.keys.under}` : "";
    out.push(`${pad}${thingLine(t, how)}`);
    for (const b of cardBody(t)) out.push(`${pad}  ${b}`);
    for (const p of pills(t.id)) out.push(`${pad}  pill ${p.role && p.role !== t.role ? `${p.role} ` : ""}${p.id}: ${p.title}`);
    for (const c of kids(t.id, null)) emit(c, depth + 1, out);
  };
  // eng-migrate2: cards side by side with one role, the same lines and nothing under them are one line (`client b1..b4: a; b; c; d | line`),
  // as the stage wrote them: on a phone their shared lines are written once, under the lane heading
  const plainCard = (t: Thing) => !isStageChart(t) && t.shape === "box" && !t.flags.length && !pills(t.id).length && !kids(t.id, null).length && !t.keys.under && !t.title.includes(";") && !regionOf(t)?.flags.includes("below-time");
  const runs = (ts: Thing[], breaks: number[]) => {
    const out: { at: number; ts: Thing[] }[] = [];
    ts.forEach((t, i) => {
      const last = out[out.length - 1], prev = last?.ts[last.ts.length - 1];
      if (prev && !breaks.includes(i) && plainCard(t) && plainCard(prev) && prev.role === t.role && prev.lines.join("|") === t.lines.join("|") && cardBody(prev).join("|") === cardBody(t).join("|") && t.lines.length) last.ts.push(t);
      else out.push({ at: i, ts: [t] });
    });
    return out;
  };
  const runLine = (ts: Thing[]) => `${ts[0].role ?? "plain"} ${ts.map((t) => t.id).join(",")}: ${ts.map((t) => t.title || "_").join("; ")}${ts[0].lines.length ? ` | ${ts[0].lines.join(" | ")}` : ""}`;
  // the setup in the order it is written: loose cards and stage charts, regions with their cards, head blocks (a time
  // block over the lanes stays over them)
  type Block = { line: number; lines: string[] };
  const blocks: Block[] = [];
  for (const t of kids(null, null)) { const out: string[] = []; emit(t, 0, out); blocks.push({ line: t.src.line, lines: out }); }
  for (const r of model.regions) {
    const out: string[] = [], fl = r.flags, sp = fl.findIndex((x) => x === "across" || x === "above" || x === "under");
    const below = fl.includes("below-time");
    if (!below) out.push(`## ${r.title || "_"}${sp >= 0 ? ` ${fl[sp]} ${fl[sp + 1]}` : ""}`);
    if (fl.includes("row")) out.push("layout: row");
    const breaks = (fl.find((x) => x.startsWith("breaks=")) ?? "breaks=").slice(7).split(",").filter(Boolean).map(Number);
    runs(kids(null, r.id), breaks).forEach((run) => { if (breaks.includes(run.at)) out.push("next row"); if (run.ts.length > 1) out.push(runLine(run.ts), ...cardBody(run.ts[0]).map((b) => `  ${b}`)); else emit(run.ts[0], 0, out); });
    for (const x of fl.filter((y) => y.startsWith("more="))) out.push(`... ${x.slice(5)}`);
    blocks.push({ line: r.src.line, lines: out });
  }
  // the head blocks in the stage's order: a chart at its own place (keys.headAt), the others' heads in the order written, each
  // with the lines it claims; the lanes after the first `lanes-at` of them (0: the lanes first)
  const charts = model.order.map((i) => model.things[i]).filter((t) => isStageChart(t) && !t.parent && !t.region);
  const groups: string[][] = [];
  for (const w of Object.values(model.layoutWords).flat().sort((a, b) => a.src.line - b.src.line)) {
    const ls = [headLine(w.word, w.arg), ...w.body.map((b) => `  ${b}`)];
    if (blockFor(w.word)?.kind === "head" || !groups.length) groups.push(ls); else groups[groups.length - 1].push(...ls);
  }
  const heads: string[][] = [], n = charts.length + groups.length;
  for (const t of charts) {
    const out: string[] = [], k = Number(t.keys.headAt); emit(t, 0, out);
    if (Number.isInteger(k) && k >= 0 && k < n && !heads[k]) heads[k] = out; else groups.push(out); // a place out of range or taken: after the others
  }
  for (let k = 0, g = 0; k < n; k++) if (!heads[k]) heads[k] = groups[g++] ?? [];
  const at = Math.max(0, Math.min(heads.length, Number(fo["lanes-at"]) || 0));
  const lanes = blocks.filter((b) => !charts.some((t) => t.src.line === b.line)).sort((x, y) => x.line - y.line);
  for (const h of heads.slice(0, at)) head.push(...h);
  for (const b of lanes) head.push(...b.lines);
  for (const h of heads.slice(at)) head.push(...h);
  for (const f of model.setup) if (f.k === "layout") head.push(...factLines(f, model, problems));
  const bars = model.order.map((i) => model.things[i]).filter((t) => isStageChart(t) && t.chart!.kind === "bar");
  // eng-migrate2: a state word (a card's `[+ open]`: keys.stateTone in the setup, a `state-tone` word beside it in a step) is
  // written as the stage's state, not as a tag: the stage writes it in the card's corner and keeps no strip above the card
  const SIGN: Record<string, string> = { good: "+", bad: "-", role: "=" };
  const stateLine = (id: string, words: string, tone: string) => (tone.split(" ").includes("gone") ? `state ${id}: gone` : `state ${id}: [${SIGN[tone.split(" ")[0]] ?? "+"} ${words}]`);
  const withStates = (facts: Fact[], setup: boolean): string[] => facts.flatMap((f) => linesOf(f, facts, setup));
  const linesOf = (f: Fact, facts: Fact[], setup: boolean): string[] => {
    if (f.k !== "is" || f.ids.length !== 1 || f.words === null) return factLines(f, model, problems);
    const id = f.ids[0], st = facts.find((g) => g.k === "layout" && g.word === "state-tone" && g.arg.trim().split(/\s+/)[0] === id) as Extract<Fact, { k: "layout" }> | undefined;
    const tone = st ? st.arg.trim().split(/\s+/).slice(1).join(" ") : setup ? model.things[id]?.keys.stateTone : undefined;
    return tone !== undefined ? [stateLine(id, f.words, tone || "good")] : factLines(f, model, problems);
  };
  // render3: each step line with the source line of its relation (-1: not a relation), for joinRels
  const withSrc = (facts: Fact[]) => facts.flatMap((f) => linesOf(f, facts, false).map((l) => ({ l, src: f.k === "rel" ? f.src.line : -1 })));
  // the setup's facts and relations are the first step's first lines (the stage has no step 0)
  const pre = [...withStates(model.setup.filter((f) => f.k !== "layout"), true),
    ...Object.values(model.relations).filter((r) => r.setup && !sitsAt(model.things[r.from]) && !sitsAt(model.things[r.to])).map((r) => `${r.from} ${r.style === "dashed" ? "-->" : "->"} ${r.to}${r.role ? ` (${r.role})` : ""}${r.label ? `: ${r.label}` : ""}`)];
  let line = 1;
  const steps = model.steps.map((s, i) => {
    const raw = [...(i === 0 ? pre : []), ...joinRels(withSrc(s.facts)), ...bars.flatMap((t) => barSteps(t, i + 1))].join("\n");
    return { title: s.title && s.caption && s.caption !== s.title ? `${s.title}: ${s.caption}` : s.title || s.caption, raw, line: (line += 10) };
  });
  return { head: head.join("\n"), steps, base: 1, info: {}, problems };
}
