// This package is the source of this file: edit it here. It began as a copy of the private prototype's composed stage (0.7.0).
// The composed stage (format version 11; 0.7.0): an animation is composed by default. One stage of fixed
// design width (the column's width), geometry computed once over all steps (a thing has one place for the whole
// scene; later things have reserved places), connectors drawn after layout, colour by the page's roles.
// `layout=graph` (or another engine layout, or 3d) on the fence sends a scene to the graph engine (tools/scene.ts).
//
// ```animation
// title: Ordering | one request, end to end
// ## Browsers
// client b1..b3: laptop; phone; tablet | sends GET /orders
//... about 2,000 sessions
// ## Servers
// service s0,s1: api 0; api 1 | answers in JSON
// + (a) worker a; (b) worker b
// @step Ask: Each browser asks one server.
// b1,b2 -> s0: GET
// ```
//
// Pure: no DOM, no node modules. Parsing is one linear pass with hand-written scans; layout charges docBudget.
import { docBudget } from "./stage-budget";
import { rolesUsed, sameColourRoles } from "./stage-roles";
import {
  type Line, type Item, type Problem, type Font, type StageBlock, type ParseCtx, type Box, type LayoutOut, StageError,
  LINE_H, PAD, measure, wrap, longestWord, parts, colon, chip, shift, expandIds, range, ID_RE, forbidden, textLines,
  blockFor, blockByOp, blockByMore, blockWords,
  setPhoneLines,
  setPhoneFont,
} from "./stage-core";
import { oldWord, KEEP_WORDS, type WordScope } from "./stage-words"; // renamed words say the new one
import { PHONE, phonePer, wholeAt, moreInFreeCell, headingRect, setPhone } from "./stage-phone"; // denser phone forms
import "./stage-blocks"; // registers the built-in blocks (track, grid, rows, map, list, sheet, time)
import { type Card, type Cards, newCards, parseCardLine, parseCardBody, subToneProblem, cardStepLine, CARD_STEP_WORDS, cardNeed as cNeed, cardMin as cMin, measureCard, drawCard as cDraw, pillSlots, cardText as cText, cardFacts, topCard, badgeRows, insideN, drawLegend, keyEntry, keyEntryW, KEY_SEP, sayRoom, drawSays, setCardPad, CARD_PX as CARD_PAD_NOW, subsAt } from "./stage-cards"; // what a card holds
export type { Card } from "./stage-cards";
export { measure } from "./stage-core";

export const ENGINE_LAYOUTS = ["graph", "row", "column", "grid", "tree", "free"];
/** Is this ```animation fence a composed stage? Yes unless it asks for the graph engine (an engine layout, 3d, a kind). */
export function isStage(attrs: Record<string, string>, head?: string): boolean {
  if (attrs.layout && attrs.layout !== "stage") return false;
  if (attrs.view === "3d" || attrs.only || attrs.kind) return false;
  if (!attrs.layout && head !== undefined && looksLikeGraph(head)) return false;
  return true;
}
const ENGINE_WORDS = new Set(["box", "circle", "pill", "cylinder", "cloud", "person", "diamond", "text", "dot", "initial", "final", "group", "array", "list", "stack", "queue", "tree", "graph", "grid", "buckets", "table", "record", "token", "pointer", "layer", "row", "map", "family", "camera", "note", "set", "focus", "push"]);
/** A scene written for the graph engine (format version 6 to 10) with no layout= on its fence: its setup declares
 * things the engine's way ("box a \"A\"", "a -> b") and has no lane, card or head block of the composed stage. */
export function looksLikeGraph(head: string): boolean {
  let engine = 0, composed = 0;
  for (const raw of head.split("\n")) {
    const t = raw.trim(); if (!t || t.startsWith("//")) continue;
    const w = t.split(" ")[0];
    if (t.startsWith("## ") || t.startsWith("... ") || t.startsWith("+ ") || /^(title|track|sheet|time|carry|where|zoom):/.test(t) || t.startsWith("=> ") || (!ENGINE_WORDS.has(w) && /^[a-z][a-z0-9-]* [\w.,-]+: /.test(t))) composed++;
    else if (ENGINE_WORDS.has(w) || /^[\w.-]+ (->|-->|--|<->) [\w.-]+/.test(t) || !t.includes(": ")) engine++;
  }
  return engine > 0 && composed === 0;
}
export const WIDE_W = 1000;   // the design width a build lays out at; the browser lays out again at its column's width
export const NARROW_W = 340;  // under this many pixels per lane the stage stacks lanes and bands
export const MAX_LINES = 400, MAX_CARDS = 120, MAX_EDGES = 400;
/** gridRoute's search state, kept between routes: an entry counts only when its stamp is this route's (no refill per route) */
let routeDist = new Float64Array(0), routePrev = new Int32Array(0), routeStamp = new Uint32Array(0), routeGen = 0;
/** the work one step of the router's search counts for (a pop and up to four pushes on its heap), so charged work tracks time */
const ROUTE_STEP_WORK = 8;
/** One stage's own budget for a compile, or for one plan at one width (site/src/stage.tsx stageWork): each gets a fresh
 * one, so a page of many stages, resized again and again, never drains one budget, and a runaway source is refused (its
 * still form) instead of keeping a page busy. Every part of a layout counts: the router's grid and search, the scans for
 * a free place, each try of a wider gap. Measured on the 28-scene page and the Format page, all 7 widths: the
 * heaviest real plan needs 9,453,090 work (about 0.5 s) and 5,752,560 memory; the caps are 4x that. A scene of 100 to 300
 * connectors is refused in about 1.5 s. */
export const STAGE_WORK = 38_000_000, STAGE_MEMORY = 24_000_000;

// ---------------------------------------------------------------- the model
/** a lane, or a band under lanes (span); an "across" band runs its cards left to right, one row per card line */
export type Lane = { title: string; cards: Card[]; more: string[]; span?: [string, string]; line: number; across?: boolean; breaks?: number[]; above?: boolean /* "## X above A..B": the band over its lanes */; row?: boolean /* "layout: row": its cards side by side */ };
export type Edge = { from: string; to: string; label: string; role?: string; dash: boolean; step: number; line: number; hop?:number; copy?:number; copyLabel?:boolean; back?: boolean; fromPill?: string; toPill?: string; tone?: string; keep?: boolean /* "keep a -> b: words": the words stay while the line does */ };
/** an edge label in a tone ("a -> b (bad): dropped") is plain words in that tone beside the line, not a chip */
/** a toned connector label is words in the label size: large, as the originals set "dropped" */
const TONE_F: Font = "title";
const EDGE_TONES: Record<string, string> = { good: "good", bad: "bad", warn: "warn", accent: "acc" };
const KEY_TONES: Record<string,string> = {"[good]":"good","[bad]":"bad","[warn]":"warn","[accent]":"acc","[plain]":"plain"};
export type Step = {
  title: string; caption: string; line: number;
  show: string[]; light: string[]; dark?: boolean; hide: string[]; heads: [number, boolean][] /* "hide ## Title" / "show ## Title" */; edges: Edge[]; cuts?: { from: string; to: string; line: number }[]; tags: [string[], string, string?][]; says: [string, string, string?][]; insides: [string, string][]; keys: [string, string, string?][];
  foot: string[]; footInk?: (string | undefined)[]; notes: string[][]; formula: string[]; panels: { block: StageBlock; node: any; line: number }[];
  clear?: boolean; all?: boolean; beside?: number[];
};
export type Model = {
  /** hide: the steps a hidden card shows in (only cards a step hides) */
  shownOn?: Map<string, number[]>;
  title: string; note: string; lanes: Lane[]; steps: Step[]; head: { block: StageBlock; node: any; at: number }[]; lanesAt: number; panelsAt?: number;
  roles: Record<string, number>; cards: Map<string, Card>; zoom: boolean; cx: Cards; notesAbove: boolean; notesRoomy?: boolean; headOn?: Map<number, number[]> /* lane headings shown only in some steps */; linesStraight?: boolean /* "lines: straight" */; flowOff?: boolean /* "flow: off": no moving dots on this scene's connectors */; theme?: Record<string, string>; keyTop?: boolean; keyAt?: "top right" | "bottom right";
};
export type Plan = { w: number; h: number; items: Item[]; narrow: boolean; phone?: boolean; fills?: Record<string, [string, string]> }; // fills: the page's role fills (theme fill-cN), light and dark // phone: drawn in the phone type sizes
export type Compiled = { model: Model; errors: Problem[]; warnings: Problem[] };

// ---------------------------------------------------------------- parsing
function lines(src: string, base: number): Line[] {
  const out: Line[] = [];
  src.split("\n").forEach((raw, i) => {
    const t0 = raw.replace(/\t/g, "  "), t = t0.trim();
    if (!t || t.startsWith("// ")) return;
    out.push({ n: base + i, ind: t0.length - t0.trimStart().length, t });
  });
  return out;
}
/** @step "Title: caption" -> title and caption; with no ": " the caption is the title. */
export function stepTitle(s: string): [string, string] {
  const k = s.indexOf(": ");
  if (k > 0 && k <= 48) return [s.slice(0, k).trim(), s.slice(k + 2).trim()];
  return [s.trim(), s.trim()];
}
const STEP_WORDS = ["show", "show all", "clear", "beside", "light", "hide", "cut", "tag", "say", "inside", "key", "foot", "note"];

/** roles: the page's role list (role name -> colour number 1..8), from the front matter */
export function compileStage(head: string, steps: { title: string; raw: string; line: number }[], base: number, info: Record<string, string>, roles: Record<string, number> = {}): Compiled {
  const errors: Problem[] = [], warnings: Problem[] = [];
  const problem = (line: number, msg: string) => errors.push({ line, msg });
  const m: Model = { title: info.title ?? "", note: "", lanes: [], steps: [], head: [], lanesAt: -1, roles, cards: new Map(), zoom: false, cx: newCards(), notesAbove: false };
  const roleSet = new Set(Object.keys(roles));
  for (const [k, v] of Object.entries(info)) if (k.startsWith("theme:")) (m.theme ??= {})[k.slice(6)] = v; // the page's stage tokens (front matter "theme:")
  const captions: {step:number;text:string;keep?:boolean}[]=[];
  const ctx: ParseCtx = { roles: roleSet, problem, ids: new Set(), steps: steps.length, caption:(step,text,keep)=>{docBudget().charge("stage caption",text.length+1,text.length);captions.push({step,text,keep});} };
  const budget = docBudget();
  const hl = lines(head, base);
  const total = hl.length + steps.reduce((a, s) => a + s.raw.split("\n").length + 1, 0);
  budget.charge("stage scene", total, total);
  if (total > MAX_LINES) problem(base, `a scene holds at most ${MAX_LINES} lines; this one has ${total}: split it`);
  const checkText = (l: Line) => { const f = forbidden(l.t); if (f) problem(l.n, `no ${f}`); };
  const needRole = (r: string, line: number) => {
    if (roleSet.has(r)) return true;
    const known = [...roleSet];
    problem(line, `"${r}" is not a role of this page; ${known.length ? `the page declares ${known.join(", ")}` : "the page declares none"}: add it under roles: in the front matter`);
    return false;
  };
  const scope = (): WordScope => ({ heads: new Set(m.head.map((h) => h.block.word)), roles: roleSet });
  // ---- the setup
  let cur: Card[] = [], headBlock: { block: StageBlock; node: any } | null = null;
  for (let i = 0; i < hl.length; i++) {
    const l = hl[i]; checkText(l);
    const body: Line[] = []; while (i + 1 < hl.length && hl[i + 1].ind > l.ind) body.push(hl[++i]);
    // a renamed word (tools/stage-words.ts): say the new one
    // (the line is still read: a block that has not renamed yet still draws it)
    { const sc = scope(); const was = oldWord(l.t, "setup", sc); if (was) problem(l.n, was); for (const b of body) { const x = oldWord(b.t, "under", sc, l.t); if (x) problem(b.n, x); } }
    try {
      if (l.t.startsWith("## ")) {
        const h = l.t.slice(3).trim(), b0 = h.indexOf(" under "), o0 = h.indexOf(" above "), above = o0 >= 0 && (b0 < 0 || o0 < b0), u0 = above ? o0 : b0, a0 = h.indexOf(" across "), across = a0 >= 0 && (u0 < 0 || a0 < u0), u = across ? a0 : u0;
        const title = u >= 0 ? h.slice(0, u).trim() : h;
        let span: [string, string] | undefined;
        if (u >= 0) { const r = h.slice(u + (across ? 8 : 7)).trim(), k = r.indexOf(".."); if (k < 0) throw new StageError(l.n, `"${across ? "across" : above ? "above" : "under"}" names the lanes it spans: "## ${title} ${across ? "across" : above ? "above" : "under"} First..Last"`); span = [r.slice(0, k).trim(), r.slice(k + 2).trim()]; }
        if (m.lanesAt < 0) m.lanesAt = m.head.length;
        m.lanes.push({ title: title === "_" ? "" : title, cards: [], more: [], span, line: l.n, across: across || undefined, above: (!across && above) || undefined }); cur = []; headBlock = null;
        for (const b of body) throw new StageError(b.n, "a lane heading has nothing indented under it; write its cards on the lines after it");
        continue;
      }
      if (l.t === "next row") { const lane = m.lanes.at(-1); if (!lane?.across) throw new StageError(l.n, `"next row" goes in a band written "## Title across A..B": its cards run left to right, and "next row" starts the row under them`); (lane.breaks ??= []).push(lane.cards.length); continue; }
      if (l.t.startsWith("... ")) { const lane = m.lanes.at(-1); if (!lane) throw new StageError(l.n, `"..." (and more) goes under a lane`); lane.more.push(l.t.slice(4).trim()); continue; }
      if (l.t.startsWith("+ ")) throw new StageError(l.n, "badges (+ (a) text) go indented under the cards they belong to");
      if (headBlock?.block.claim && headBlock.block.claim(headBlock.node, l, body, ctx)) continue;
      const c = colon(l.t);
      const word = (c ? c[0] : l.t).split(" ")[0];
      if (c && c[0] === "title") { const [t, n] = [c[1].split(" | ")[0], c[1].split(" | ").slice(1).join(" | ")]; m.title = t.trim(); m.note = n.trim(); continue; }
      if (l.t === "panels") { if (m.panelsAt !== undefined) throw new StageError(l.n, `"panels" places the step panels once`); for (const b of body) throw new StageError(b.n, "nothing is indented under panels"); m.panelsAt = m.head.length; headBlock = null; continue; }
      if (c && c[0] === "zoom") { m.zoom = true; continue; }
      // "layout: row" under a lane's heading: its cards stand side by side across the lane's width
      if (c && c[0] === "layout") {
        if (c[1].trim() !== "row") throw new StageError(l.n, `"layout: row" lays this lane's cards side by side across its width; "row" is the one layout`);
        const lane = m.lanes.at(-1);
        if (!lane || lane.cards.length || lane.span) throw new StageError(l.n, `"layout: row" goes under a lane's heading ("## Title"), before its cards`);
        lane.row = true; continue;
      }
      // "notes: above": the steps' notes, formulas and footnotes go above the swapped panels instead of under them
      if (c && c[0] === "notes" && c[1].trim() === "roomy") { m.notesRoomy = true; continue; }
      // "flow: off": the scene's connectors draw no moving dot
      // "lines: straight": a side arrow with nothing in its way is one straight line
      if (c && c[0] === "lines") { if (c[1].trim() !== "straight") throw new StageError(l.n, `"lines: straight" draws this scene's arrows as straight lines where nothing is in the way; "straight" is the one value`); m.linesStraight = true; continue; }
      if (c && c[0] === "flow") { if (c[1].trim() !== "off") throw new StageError(l.n, `"flow: off" turns this scene's moving dots off; "off" is the one value (the dots are on by default)`); m.flowOff = true; continue; }
      if (c && c[0] === "notes") { if (c[1].trim() !== "above") throw new StageError(l.n, `notes takes one place: "notes: above" (the notes over the panels; by default they come under them), or "notes: roomy" (a tall note zone in a worksheet)`); if (m.notesAbove) throw new StageError(l.n, "notes: above is written once"); m.notesAbove = true; continue; }
      if (c && c[0] === "align") { if (c[1].trim() !== "top") throw new StageError(l.n, `"align: top" is the one alignment: cards of a row share one top, and each lane's last card reaches the row's foot`); m.cx.align = true; continue; }
      // "key at: top right": the key is a legend at the stage's top right, a small swatch and its words per entry; by default it stays at the bottom left
      if (c && c[0] === "key at") { const v = c[1].trim(); if (v !== "top right" && v !== "bottom right" && v !== "bottom left") throw new StageError(l.n, `the key takes one place: "key at: top right" or "key at: bottom right" (a legend of small swatches at that corner) or "key at: bottom left" (the default)`); m.keyTop = v !== "bottom left"; m.keyAt = v === "bottom left" ? undefined : v; continue; }
      const hb = blockFor(word);
      if (hb && hb.kind === "head") {
        const arg = c && c[0] === word ? c[1] : l.t.slice(word.length).trim();
        const node = hb.parse({ word, arg, body, line: l.n }, ctx); headBlock = { block: hb, node }; m.head.push({ ...headBlock, at: m.head.length }); continue;
      }
      const mb = blockByMore(word);
      if (mb && c) { const owner = m.head.find((h) => h.block === mb); if (!owner) throw new StageError(l.n, `"${word}:" goes after a ${mb.word} line`); mb.op!(owner.node, { word, arg: c[1], body, line: l.n, step: 0 }, ctx); continue; }
      if (hb && hb.kind === "panel") throw new StageError(l.n, `"${word}" is a panel: write it under a @step, where it shows`);
      if (!c) throw new StageError(l.n, `this line does not read: a card is "role id: title | second line", a lane is "## Title"; the words of a setup are ${["##", "...", "title:", "layout: row", "flow: off", "lines: straight", ...blockWords().filter((w) => blockFor(w)!.kind === "head")].join(", ")}`);
      // a card: "role ids: title; title | sub | sub", with what it holds indented under it (tools/stage-cards.ts)
      let lineT = l.t, rowUnder: [string, string] | undefined;
      { // "role id under A..B: title": a band with no heading under lanes A to B, holding this card (as "## _ under A..B")
        const sp = c[0].indexOf(" "), un0 = sp < 0 ? -1 : c[0].indexOf(" under ", sp), ab0 = sp < 0 ? -1 : c[0].indexOf(" above ", sp), above = ab0 >= 0 && (un0 < 0 || ab0 < un0), un = above ? ab0 : un0;
        if (un >= 0) {
          const r = c[0].slice(un + 7).trim(), k = r.indexOf("..");
          if (k < 0) throw new StageError(l.n, `"${above ? "above" : "under"}" names the lanes it spans: "${c[0].slice(0, un)} ${above ? "above" : "under"} First..Last: title"`);
          lineT = c[0].slice(0, un) + ": " + c[1];
          const rl = m.lanes.at(-1), ra = r.slice(0, k).trim(), rb = r.slice(k + 2).trim();
          // in a "layout: row" lane: under two cards of that row, not a band under lanes
          const isCard = (id: string) => !!rl?.cards.some((q) => q.id === id);
          if (!above && rl?.row && !rl.span && (isCard(ra) || isCard(rb))) {
            const ia = rl.cards.findIndex((q) => q.id === ra && !q.under), ib = rl.cards.findIndex((q) => q.id === rb && !q.under);
            if (ia < 0 || ib < 0 || ib < ia) throw new StageError(l.n, `"under" in a row names two cards of this row, left to right: "${c[0].slice(0, un)} under ${rl.cards.filter((q) => !q.under).slice(0, 2).map((q) => q.id).join("..") || "a..b"}: title"`);
            rowUnder = [ra, rb];
          } else {
          if (m.lanesAt < 0) m.lanesAt = m.head.length;
          m.lanes.push({ title: "", cards: [], more: [], span: [r.slice(0, k).trim(), r.slice(k + 2).trim()], line: l.n, above: above || undefined });
          }
        }
      }
      if (!m.lanes.length) m.lanes.push({ title: "", cards: [], more: [], line: l.n });
      const add = (card: Card) => {
        needRole(card.role, l.n);
        for (const x of card.subs) { const pr = subToneProblem(x, roleSet); if (pr) throw new StageError(card.line, pr); }
        if (m.cards.has(card.id) || m.cx.pills.has(card.id)) throw new StageError(card.line, `"${card.id}" is declared twice`);
        m.cards.set(card.id, card); ctx.ids.add(card.id);
      };
      cur = parseCardLine(lineT, l.n, m.lanes.length - 1);
      if (rowUnder && cur.length !== 1) throw new StageError(l.n, `"under" in a row holds one card`);
      for (const card of cur) { if (rowUnder) card.under = rowUnder; add(card); m.lanes.at(-1)!.cards.push(card); }
      parseCardBody(m, cur, body, ctx, add);
      if (m.cards.size > MAX_CARDS) throw new StageError(l.n, `a scene holds at most ${MAX_CARDS} cards`);
    } catch (e) { if (e instanceof StageError) problem(e.line, e.message); else throw e; }
  }
  void headBlock;
  ctx.lanes = m.lanes.filter((x) => !x.span).map((x) => x.title); // a head block may name lanes (time "axis:")
  for (const h of m.head) try { h.block.check?.(h.node, ctx); } catch (e) { if (e instanceof StageError) problem(e.line, e.message); else throw e; }
  // spans name lanes
  const names = m.lanes.filter((x) => !x.span).map((x) => x.title);
  for (const lane of m.lanes) if (lane.span) for (const n of lane.span) if (!names.includes(n)) problem(lane.line, `"${n}" is not a lane above (${names.filter(Boolean).join(", ")})`);
  // ---- the steps
  const all = () => m.cards.keys();
  const known = (ids: string[], line: number) => ids.filter((id) => { if (m.cards.has(id)) return true; problem(line, `"${id}" is not a card of this scene${m.cards.size ? ` (${[...m.cards.keys()].slice(0, 12).join(", ")}${m.cards.size > 12 ? ", ..." : ""})` : ""}`); return false; });
  if (steps.length === 1) problem(steps[0].line, "a scene has at least 2 steps, or none (a still scene)");
  let nEdges = 0;
  const hidden = new Set<string>();
  steps.forEach((s, si) => {
    const k = si + 1, [title, caption] = stepTitle(s.title);
    const st: Step = { title, caption, line: s.line, show: [], light: [], hide: [], heads: [], edges: [], tags: [], says: [], insides: [], keys: [], foot: [], notes: [], formula: [], panels: [] };
    m.steps.push(st);
    const sl = lines(s.raw, s.line + 1).flatMap(l=>{
      if(l.ind)return[l];const keep=l.t.startsWith("keep "),text=keep?l.t.slice(5):l.t,arrows:{at:number;end:number;text:string}[]=[];let quote="";
      budget.charge("connector chain",text.length,text.length);
      for(let j=0;j<text.length;j++){const ch=text[j];if(quote){if(ch===quote)quote="";continue;}if(ch==='"'||ch==="`"){quote=ch;continue;}if(ch!==" ")continue;for(const a of[" --> "," -> "," <-- "," <- "]){if(text.startsWith(a,j)){arrows.push({at:j,end:j+a.length,text:a});j+=a.length-2;break;}}}
      budget.charge("connector chain hops",arrows.length,arrows.length);if(arrows.length<2)return[l];
      const first=text.slice(0,arrows[0].at).trim();if(first.includes(":")||first.split(",").some(id=>!id.trim()||/\s/.test(id.trim())))return[l];
      const chunks=[text.slice(0,arrows[0].at),...arrows.map((a,j)=>text.slice(a.end,arrows[j+1]?.at??text.length))],out:(Line&{hop:number})[]=[];let from=chunks[0].trim();
      for(let j=0;j<arrows.length;j++){out.push({...l,hop:j,t:(keep?"keep ":"")+from+arrows[j].text+chunks[j+1].trim()});from=(colon(chunks[j+1].trim())?.[0]??chunks[j+1]).replace(/ x[23]$/,"").replace(/ \([^)]*\)$/,"").trim();}
      return out;
    });
    let panelEnd = -1; // the source line right after the last panel
    for (let i = 0; i < sl.length; i++) {
      const l0 = sl[i], li = i; checkText(l0);
      const body: Line[] = []; while (i + 1 < sl.length && sl[i + 1].ind > l0.ind) body.push(sl[++i]);
      const was = oldWord(l0.t, "step", scope());
      if (was) { problem(l0.n, was); continue; }
      // "keep at 30: words", "keep mark t1 3: good": the word after keep, from this step on
      const keep = l0.t.startsWith("keep ") && KEEP_WORDS.includes(l0.t.slice(5).split(" ")[0].replace(/:$/, ""));
      // "keep a -> b: words": a connector whose words stay while its line stays, drawn once
      const keepEdge = !keep && l0.t.startsWith("keep ") && !!findArrow(l0.t.slice(5));
      const l: Line = keep || keepEdge ? { ...l0, t: l0.t.slice(5).trimStart() } : l0;
      try {
        const word = l.t.split(" ")[0].replace(/:$/, "");
        const c = colon(l.t);
        const opArg = () => (c && c[0].split(" ")[0] === word ? c[0].slice(word.length).trim() + (c[1] !== undefined ? ": " + c[1] : "") : l.t.slice(word.length).trim());
        // a step word two blocks may own (at; show and light for a block's own ids): each owner in source order
        const offer = (): boolean => {
          const own = m.head.filter((h) => h.block.ops?.includes(word)), shared = own.length > 1 || word === "show" || word === "light" || word === "hide";
          for (const h of own) if (h.block.op!(h.node, { word, arg: opArg(), body, line: l.n, step: k, keep, shared }, ctx) !== false) return true;
          return false;
        };
        if (keep && word === "mark" && cardStepLine(m, k, l, ctx, true)) continue; // "keep mark id token: tone remark" holds a card token's mark from this step
        if (keep && !m.head.some((h) => h.block.ops?.includes(word))) throw new StageError(l.n, `"keep ${word}" works on a block that owns "${word}"${blockByOp(word) ? ` (a ${blockByOp(word)!.word}): declare one in the setup` : ""}`);
        if (keep && offer()) continue;
        if (!keep && cardStepLine(m, k, l, ctx)) continue; // the card words (CARD_WORDS in tools/stage-cards.ts)
        if (l.t.startsWith("= ")) { st.formula.push(...parts(l.t.slice(2), " | ")); continue; }
        if (l.t === "clear") { st.clear = true; continue; }
        if (l.t === "show all") { st.all = true; continue; }
        // "cut a --> b": a red cross on that connector, or between the two cards when none joins them
        if (word === "cut") {
          const rest = l.t.slice(4), ar = findArrow(rest);
          if (!ar) throw new StageError(l.n, `"cut" names a connector: cut a --> b (or cut a -> b)`);
          const fs = known(expandIds(rest.slice(0, ar.at), all()), l.n), ts = known(expandIds(rest.slice(ar.at + ar.len), all()), l.n);
          for (const a of fs) for (const b of ts) (st.cuts ??= []).push(ar.back ? { from: b, to: a, line: l.n } : { from: a, to: b, line: l.n });
          continue;
        }
        // "hide ## Title" / "show ## Title": a lane or band heading (its full title or the start of it, one of them)
        if ((word === "hide" || word === "show") && l.t.slice(word.length).trim().startsWith("## ")) {
          const want = l.t.slice(word.length).trim().slice(3).trim(), ls = m.lanes.map((x, i) => [x, i] as const).filter(([x]) => x.title && x.title.startsWith(want));
          const hit = ls.find(([x]) => x.title === want) ?? (ls.length === 1 ? ls[0] : undefined);
          if (!want || !hit) throw new StageError(l.n, `"${word} ## Title" names one lane or band heading; ${ls.length > 1 ? "several start so: write more of it" : `the headings are ${m.lanes.filter((x) => x.title).map((x) => `"${x.title}"`).join(", ") || "untitled"}`}`);
          st.heads.push([hit[1], word === "show"]); continue;
        }
        if (word === "hide") { // cards are the stage's; other ids (a worksheet's results) go to the block that owns them
          const raw = expandIds(l.t.slice(word.length), all());
          if ((!raw.length || !raw.every((id) => m.cards.has(id))) && offer()) continue;
          st.hide.push(...known(raw, l.n)); continue;
        }
        if (l.t === "beside" || l.t.startsWith("beside ")) { const ws = l.t.length > 6 ? parts(l.t.slice(7), ",").map((x) => Number(x.trim())) : []; if (ws.some((x) => !Number.isInteger(x) || x < 1 || x > 9)) throw new StageError(l.n, `"beside" lays this step's panels side by side; optional shares are whole numbers 1 to 9: beside 1, 2`); st.beside = ws; continue; }
        // "light none": this step lights no card (not even its connectors' senders)
        if (word === "light" && !c && l.t.slice(word.length).trim() === "none") { st.dark = true; continue; }
        if (word === "show" || word === "light") {
          // cards are the stage's; other ids (a matrix's cards, a bin, a bar, a column) go to the block that owns them
          const raw = expandIds((c ? c[0] : l.t).slice(word.length), all());
          if ((c || !raw.length || !raw.every((id) => m.cards.has(id))) && offer()) continue;
          const ids = known(raw, l.n); if (c) problem(l.n, `a card takes no words on "${word}": "${word} ${raw.join(", ")}", then "say ${raw[0] ?? "id"}: words"`);
          st[word].push(...ids); continue;
        }
        if (word === "tag" && c?.[0].includes("..") && offer()) continue; // a time row owns a numeric range tag
        if ((word === "tag" || word === "say" || word === "inside") && c) {
          let idt = c[0].slice(word.length).trim(), srole: string | undefined; const pr0 = idt.lastIndexOf(" (");
          if ((word === "say" || word === "tag") && pr0 > 0 && idt.endsWith(")")) { srole = idt.slice(pr0 + 2, -1); idt = idt.slice(0, pr0); needRole(srole, l.n); } // "say id (role): text", "tag ids (role): text": the chip in another role's colour
          const ids = known(expandIds(idt, all()), l.n);
          if (word === "tag") st.tags.push([ids, c[1], srole]); else if (word === "say") for (const id of ids) st.says.push([id, c[1], srole]);
          else for (const id of ids) { st.insides.push([id, c[1]]); m.cards.get(id)!.inside = true; }
          continue;
        }
        if (word === "key" && c) { const [r,flag,...extra]=c[0].slice(4).trim().split(/\s+/); if(extra.length||flag&&!Object.hasOwn(KEY_TONES,flag))throw new StageError(l.n,"a key takes one role and at most one tone: key job [warn]: words"); needRole(r,l.n); for(const t of parts(c[1],";"))st.keys.push(flag?[r,t,KEY_TONES[flag]]:[r,t]); continue; }
        if (word === "foot" && c) { // "foot (warn): words" / "foot (store): words": a tone or a role before the colon, as "say id (role): words"
          const fw = c[0].slice(4).trim(); let ink: string | undefined;
          if (fw) { const t = fw.startsWith("(") && fw.endsWith(")") ? fw.slice(1, -1).trim() : ""; if (!t || (!EDGE_TONES[t] && !roleSet.has(t))) { problem(l.n, `a foot line takes a tone (good, bad, warn, accent) or a role in brackets before the colon: "foot (warn): words"`); continue; } ink = EDGE_TONES[t] ? `${EDGE_TONES[t]}:ink` : `role:${t}:line`; }
          st.foot.push(c[1]); (st.footInk ??= [])[st.foot.length - 1] = ink; continue;
        }
        if (word === "note" && c && c[0] === "note") { st.notes.push(parts(c[1], " | ")); continue; }
        const pb = blockFor(word);
        if (pb && (pb.kind === "panel" || pb.panel)) { const arg = l.t.slice(word.length).trim(), node = pb.parse({ word, arg, body, line: l.n }, ctx), prev = st.panels.at(-1); if (prev && prev.block === pb && panelEnd === li && pb.join?.(prev.node, node)) { panelEnd = i + 1; continue; } st.panels.push({ block: pb, node, line: l.n }); panelEnd = i + 1; continue; } // a panel right under one of its word may join it
        const owners = m.head.filter((h) => h.block.ops?.includes(word));
        if (owners.length) { if (offer()) continue; throw new StageError(l.n, `no ${owners.map((h) => h.block.word).join(" or ")} of this scene has what "${l.t}" names`); }
        const ob = blockByOp(word);
        if (ob) throw new StageError(l.n, `"${word}" works on a ${ob.word}: declare one in the setup`);
        // a connector: "a, b -> c, d (role): label"; --> dashed
        const arrow = findArrow(l.t);
        if (arrow) {
          const lhs = l.t.slice(0, arrow.at).trim(); let rhs = l.t.slice(arrow.at + arrow.len).trim(), label = "";
          const q = colon(rhs); if (q) { rhs = q[0]; label = q[1]; }
          // a tone goes before the colon, with the marks: "a -> b (bad): words"
          { const tw = label.match(/^(.*\S) \((good|bad|warn|accent)\)$/); if (tw) throw new StageError(l.n, `a connector's tone goes before the colon: say "${l.t.slice(0, l.t.indexOf(label)).replace(/:\s*$/, "")} (${tw[2]}): ${tw[1]}" instead`); }
          let times = 1; if (/ x[23]$/.test(rhs)) { times = +rhs.slice(-1); rhs = rhs.slice(0, -3).trimEnd(); } // "a -> b x2: label": two connectors per pair (one per replica, say)
          const copyLabels=times>1&&label.includes("|")?label.split("|").map(s=>s.trim()):undefined;
          if(copyLabels&&(copyLabels.length!==times||copyLabels.some(s=>!s)))throw new StageError(l.n,`x${times} takes one label or ${times} labels separated by | (use _ for an unlabelled copy)`);
          let role: string | undefined, tone: string | undefined; const pr = rhs.lastIndexOf(" (");
          if (pr > 0 && rhs.endsWith(")")) { const w0 = rhs.slice(pr + 2, -1); rhs = rhs.slice(0, pr); if (EDGE_TONES[w0]) tone = EDGE_TONES[w0]; else { role = w0; needRole(role, l.n); } }
          // an end may be a pill ("p1 -> b"): the connector leaves (or reaches) its card at that pill
          const ends = (s0: string) => { const pills: Record<string, string> = {}; const ids = expandIds(s0, [...all(), ...m.cx.pills.keys()]).map((id) => { const bq = !m.cards.has(id) && !m.cx.pills.has(id) ? /^(.+)\.([a-z0-9]{1,3})$/i.exec(id) : null, bc = bq && m.cards.get(bq[1]); if (bq && bc && bc.badges.length) { if (!bc.badges.some((x) => x.b === bq[2])) throw new StageError(l.n, `"${bq[1]}" has no badge (${bq[2]}): its badges are ${bc.badges.map((x) => "(" + x.b + ")").join(", ")}`); pills[bq[1] + "#badge:" + id] = "badge:" + id; return bq[1] + "#badge:" + id; } if (m.cards.has(id) || !m.cx.pills.has(id)) return id; const holder = [...m.cards.values()].find((c) => c.pills.includes(id)); if (!holder) return id; pills[holder.id + "#" + id] = id; return holder.id + "#" + id; }); return { ids: known(ids.map((x) => x.split("#")[0]), l.n).map((id, i) => [id, pills[ids[i]]] as [string, string | undefined]) }; };
          const fs = ends(lhs).ids, ts = ends(rhs).ids;
          const added=fs.length*ts.length*times;if(nEdges+added>MAX_EDGES)throw new StageError(l.n,`a scene holds at most ${MAX_EDGES} connectors`);
          for (const [f, fp] of fs) for (const [t, tp] of ts) for (let x = 0; x < times; x++) st.edges.push({ from: f, to: t, label:copyLabels?(copyLabels[x]==="_"?"":copyLabels[x]):label, role, tone, dash: arrow.dash, step: k, line: l.n, ...((l0 as Line&{hop?:number}).hop!==undefined?{hop:(l0 as Line&{hop?:number}).hop}:{}), back: arrow.back,...(times>1?{copy:x}:{}),...(copyLabels?{copyLabel:true}:{}), ...(fp ? { fromPill: fp } : {}), ...(tp ? { toPill: tp } : {}), ...(keepEdge ? { keep: true } : {}) });
          nEdges += added;
          continue;
        }
        throw new StageError(l.n, `this step line does not read. A step's words: ${[...new Set([...STEP_WORDS, ...CARD_STEP_WORDS, "a -> b: label", "a --> b", "= formula", ...blockWords().filter((w) => (blockFor(w)!.kind === "panel" || blockFor(w)!.panel)), ...blockWords().flatMap((w) => blockFor(w)!.ops ?? [])])].join(", ")}${/^(box|pill|circle|group|cylinder|send|move|camera|highlight)\b/.test(l.t) ? `. This reads like a graph scene: write layout=graph on the fence` : ""}`);
      } catch (e) { if (e instanceof StageError) problem(e.line, e.message); else throw e; }
    }
    for (const id of st.show) { const cd = m.cards.get(id)!; if (!hidden.has(id)) cd.from = Math.max(cd.from, k); }
    for (const id of st.hide) hidden.add(id);
  });
  // A block may put a marker's words in the existing step caption instead of painting a second label.
  for(const c of captions)for(let k=Math.max(1,c.step);k<=(c.keep||!c.step?m.steps.length:c.step);k++){
    budget.charge("stage caption steps", 1);const s=m.steps[k-1];if(s&&!s.caption.includes(c.text))s.caption+=" "+c.text;
  }
  // a lane heading hidden by "hide ## Title" shows again from a later "show ## Title"
  for (const li of new Set(m.steps.flatMap((s) => s.heads.map(([i]) => i)))) {
    const on: number[] = []; let vis = true;
    for (let k = 1; k <= m.steps.length; k++) { for (const [i, sh] of m.steps[k - 1].heads) if (i === li) vis = sh; if (vis) on.push(k); }
    (m.headOn ??= new Map()).set(li, on);
  }
  // hide: a hidden card shows from its first step until its hide, and again from a later show; its place stays reserved
  for (const id of hidden) {
    const c = m.cards.get(id)!, on: number[] = []; let vis = true;
    for (let k = c.from; k <= m.steps.length; k++) { const s = m.steps[k - 1]; if (s.hide.includes(id)) vis = false; else if (s.show.includes(id)) vis = true; if (vis) on.push(k); }
    (m.shownOn ??= new Map()).set(id, on);
  }
  // a graph scene written without layout=graph
  if (!m.cards.size && !m.head.length && hl.some((l) => /^(box|pill|circle|group|cylinder|person|cloud|text|array|queue|stack)\s/.test(l.t)))
    errors.splice(0, errors.length, { line: base, msg: "this reads like a graph scene (box, pill, group ...): write layout=graph on the fence, or write it as a composed scene (SPEC.md, the composed stage)" });
  // a grid shown again in another step with the same cards keeps their height: one that loses its value chip keeps the
  // chip's row (zero movement between steps; journey steps 4-5)
  type GridNode = { items: { title: string; subs: string[]; v?: string }[]; reserve?: boolean };
  const grids = m.steps.flatMap((s) => s.panels.filter((p) => p.block.word === "grid").map((p) => p.node as GridNode));
  const sig = (g: GridNode) => g.items.map((it) => it.title + "|" + it.subs.join("|")).join("\n"), withV = new Set(grids.filter((g) => g.items.some((it) => it.v)).map(sig));
  for (const g of grids) if (!g.items.some((it) => it.v) && withV.has(sig(g))) g.reserve = true;
  // roles may share a colour across a page, never within one stage: two roles of one colour here would read as one
  for (const [n, names] of sameColourRoles(rolesUsed(m, roles), roles)) problem(base, `this scene draws ${names.map((x) => `"${x}"`).join(" and ")} in one colour (c${n}): a page may give one colour to several roles, but one scene's roles each need their own colour; give one of them another colour under roles:`);
  return { model: m, errors, warnings };
}
function findArrow(t: string): { at: number; len: number; dash: boolean; back: boolean } | null {
  // the first " -> ", " --> ", " <- " outside the label (the label follows ": ")
  const stop = t.indexOf(": "), lim = stop < 0 ? t.length : stop;
  for (const [a, dash, back] of [[" --> ", true, false], [" -> ", false, false], [" <-- ", true, true], [" <- ", false, true]] as const) {
    const k = t.indexOf(a); if (k >= 0 && k < lim) return { at: k, len: a.length, dash, back };
  }
  return null;
}

// ---------------------------------------------------------------- layout: once, over all steps
type Rect = { x: number; y: number; w: number; h: number };
const VGAP = 14, LANE_HEAD = 44, CARD_PX = 11;
const WVGAP = 21; // between the cards of a lane on the wide stage (the reference design: 21 px; fault 2)
const SPREAD = 0.92; // a short lane of several cards spreads over this share of the lane before it (the reference design: 0.92; fault 2)
const CARD_PAD = () => CARD_PAD_NOW; // the card's padding as laid out now (tighter on a phone)
// what a card holds and its size: tools/stage-cards.ts; tags above and says under a card are reserved here
const marks = new WeakMap<Model, { tags: Set<string>; says: Set<string>; slots: ReturnType<typeof pillSlots> }>();
function marksOf(m: Model) {
  let x = marks.get(m);
  if (!x) { x = { tags: new Set(m.steps.flatMap((s) => s.tags.flatMap(([ids]) => ids))), says: new Set(m.steps.flatMap((s) => s.says.map(([id]) => id))), slots: pillSlots(m) }; marks.set(m, x); }
  return x;
}
/** a card with a big "**" value line in some step (its value centred) */
const bigLine = (m: Model, c: Card) => subsAt(m, c).some((ss) => ss.some((x) => x.startsWith("** ")));
const cardH = (m: Model, c: Card, w: number) => { const k = marksOf(m); return measureCard(m, c, w, k.tags, k.says, k.slots).h; };
const cardNeed = (m: Model) => (c: Card) => cNeed(m, c);
const cardMin = (m: Model) => (c: Card) => cMin(m, c);

/** Lay a scene out at width `w` (CSS pixels at scale 1). Narrow (lanes stacked) when the lanes do not fit side by side. */
/** the steps a lane's "and more" line shows in: from its first card's step until a band under that lane comes in (the
 * line steps aside for the band; the same on a phone, where the band is drawn elsewhere: the hero's "32 fields" at s5) */
function moreSteps(m: Model, l: Lane): { from: number; to?: number } {
  const names = m.lanes.filter((q) => !q.span && (q.cards.length + q.more.length > 0 || q.title)).map((q) => q.title), li = names.indexOf(l.title), from = l.cards[0]?.from ?? 1;
  if (!l.title || li < 0) return { from };
  const at = Math.min(Infinity, ...m.lanes.filter((b) => b.span && !b.above).filter((b) => { const a = names.indexOf(b.span![0]), z = names.indexOf(b.span![1]); return a >= 0 && z >= 0 && li >= Math.min(a, z) && li <= Math.max(a, z); }).flatMap((b) => b.cards.map((c) => c.from)));
  return Number.isFinite(at) && at > from ? { from, to: at - 1 } : { from };
}
/** a phone plan whose connectors never use the right-hand channel is laid out again
 * without it (the lanes take that width), kept only when its connectors still need no channel */
let noChannel = false;
const usesChannel = (p: Plan, w: number) => p.items.some((it) => it.k === "path" && (it as { arrow?: boolean }).arrow && (it as { pts: [number, number][] }).pts.some(([x]) => x > w - NPAD - CHAN + 2));
export function layoutStage(m: Model, w: number): Plan {
  try {
    fellGaps.clear(); bandRoom = null;
    let p = layoutAt(m, w), kept: Map<number, [number, number]> | null = null;
    // when lines between two stacked rows fall back to the right edge, their gap grows
    // over the upper row's caption ("above") and under the gap's heading row ("below"): each gap tries every 4 px pair up
    // to BAND_GAP_MAX, then the stage takes, within BAND_ROOM_MAX in all, the pairs that send the most lines through
    // their gaps (fewest px on a tie); a gap no room helps stays as it was
    if (fellGaps.size) {
      const base = new Map(fellGaps), room = new Map<number, [number, number]>();
      // every try is work the layout does: it counts on the stage's budget (STAGE_WORK), so a stage whose tries run long
      // is refused (its still form) instead of keeping a page busy
      const tryRoom = (g: number, ab: [number, number]) => { bandRoom = new Map([[g, ab]]); layoutAt(m, w); return fellGaps.get(g) ?? 0; };
      // per gap: the best gain for each px spent
      const menus = [...base].slice(0, BAND_GAPS).map(([g, n0]) => { const by = new Map<number, { ab: [number, number]; gain: number }>();
        for (let ra = 0; ra <= BAND_GAP_MAX; ra += 4) for (let rb = 0; ra + rb <= BAND_GAP_MAX; rb += 4) { if (!ra && !rb) continue; const gain = n0 - tryRoom(g, [ra, rb]), px = ra + rb, was = by.get(px); if (gain > 0 && (!was || gain > was.gain)) by.set(px, { ab: [ra, rb], gain }); }
        return { g, opts: [...by].map(([px, o]) => ({ px, ...o })) }; });
      // the stage: the best mix within BAND_ROOM_MAX (a few gaps, a few options each)
      let best = { gain: 0, px: 0, pick: [] as { g: number; ab: [number, number] }[] };
      const walk = (k: number, px: number, gain: number, pick: { g: number; ab: [number, number] }[]) => {
        if (gain > best.gain || (gain === best.gain && gain > 0 && px < best.px)) best = { gain, px, pick };
        if (k === menus.length) return;
        walk(k + 1, px, gain, pick);
        for (const o of menus[k].opts) if (px + o.px <= BAND_ROOM_MAX) walk(k + 1, px + o.px, gain + o.gain, [...pick, { g: menus[k].g, ab: o.ab }]);
      };
      walk(0, 0, 0, []);
      for (const { g, ab } of best.pick) room.set(g, ab);
      if (room.size) { kept = room; bandRoom = room; p = layoutAt(m, w); }
      bandRoom = null;
    }
    if (p.phone && m.steps.some((st) => st.edges.length) && !usesChannel(p, w)) {
      try { noChannel = true; bandRoom = kept; const q = layoutAt(m, w); if (!q.items.some((it) => it.k === "path" && (it as { pts: [number, number][] }).pts.some(([x]) => x > w - NPAD / 2))) p = q; } finally { noChannel = false; bandRoom = null; }
    }
    // "hide ## Title" / "show ## Title": a lane heading shows only in its steps; its place stays
    if (m.headOn?.size) for (const [li, on] of m.headOn) { const t = m.lanes[li]?.title; if (!t) continue; p.items = p.items.map((it) => (it.k === "text" && it.f === "lane" && (it.s === t || (it as { tip?: string }).tip === t) ? ({ ...it, on: on.length ? on : [0] } as Item) : it)); }
    const fills = Object.entries(m.theme ?? {}).filter(([k]) => /^fill-c[0-8]$/.test(k)); if (fills.length) p.fills = Object.fromEntries(fills.map(([k, v]) => [k.slice(5), v.split(" ") as [string, string]]));
    return p;
  } finally { setPhone(false); setCardPad(false); setPhoneLines(false); setPhoneFont(false); } // phone badge rows only inside a narrow layout
}
function layoutAt(m: Model, w: number): Plan {
  const budget = docBudget();
  moreW.clear();
  budget.charge("stage layout", 50 + m.cards.size * 8 + m.steps.length * 4, m.cards.size * 4);
  const items: Item[] = [], n = m.steps.length || 1;
  const box: Box = { w: w - 2 * PAD, narrow: false, steps: n, stepTitles: m.steps.map((s) => s.title), theme: m.theme };
  box.noteH = (nw: number) => Math.max(0, ...m.steps.map((s) => stepBand(s, { ...box, w: nw }).h)); // a head block with a side column runs it down beside the notes
  const main = m.lanes.filter((l) => !l.span && l.cards.length + l.more.length > 0 || (!l.span && l.title));
  const minLanes = main.reduce((a, l) => a + Math.max(LANE_MIN, ...l.cards.map(cardMin(m))), 0) + Math.max(0, main.length - 1) * 56;
  // a phone stacks lanes; a lone lane takes the phone form too (its cards a row by the least height)
  const narrow = (main.length > 1 && minLanes > w - 2 * PAD) || (w < 480 && main.some((l) => l.cards.length > 1));
  box.narrow = narrow || w < 480;
  setPhone(box.narrow); setCardPad(box.narrow); setPhoneLines(box.narrow); setPhoneFont(box.narrow);
  let y = 8;
  // "key at: top right": the key as a legend at the top right, a small swatch and its words per entry, each from the step that writes it
  if (m.keyAt === "top right") { const lg = drawLegend(m.steps.flatMap((s, si) => s.keys.map(([r, t, tone]) => ({ r, t, tone, k: si + 1 }))), box.w); if (lg.h) { items.push(...shift(lg.items, PAD, y)); y += lg.h + 10; } }
  let slot: { x: number; y: number; w: number; grow?: string[]; under?: boolean } | undefined;
  let laneFoot = -1, laneTop = 0; // the lanes' foot and top
  let free: Rect | undefined;
  // the note band above ("notes: above") and the block placed right after it share one place when
  // they are never on screen in the same steps (a time block that appears later, "show <name>"): the block starts at the
  // band's top, and the place is as tall as the taller of the two; each keeps that one place for the whole scene
  let bandPlace: { at: number; h: number; steps: Set<number> } | undefined;
  // the other order (notes under, the default): the block placed last, when nothing took room after it; the notes start at its top
  let lastPlaced: { top: number; end: number; n: number; steps: Set<number> } | undefined;
  const stepsOf = (it: Item) => { const o = it as { on?: number[]; from?: number; to?: number }; if (o.on) return o.on; const a: number[] = []; for (let k = o.from ?? 1; k <= (o.to || m.steps.length); k++) a.push(k); return a; };
  const shareBand = (out: LayoutOut, top: number) => {
    const b = bandPlace; bandPlace = undefined;
    if (!b || out.slot || !out.items.length || top - b.at < 8) return;
    if (out.items.some((it) => stepsOf(it).some((k) => b.steps.has(k)))) return;
    const d = top - b.at; items.push(...shift(items.splice(items.length - out.items.length), 0, -d)); y = Math.max(b.at + b.h + 6, y - d);
  };
  const place = (out: LayoutOut) => { box.footLeft = out.footLeft; items.push(...shift(out.items, PAD, y)); if (out.slot) slot = { x: PAD + out.slot.x, y: y + out.slot.y, w: out.slot.w, grow: out.slot.grow, under: out.slot.under }; y += out.h + 12; };
  const rects = new Map<string, Rect & { lane: number }>(), inner = new Map<string, Rect>();
  // panels: one region, as tall as the tallest step's panels; each step's panels show in that step only
  // (inset from the stage's edges; a step's lone full-width frame grows to the region's height, so the stage never looks empty).
  // A step that says "beside" lays its panels side by side by shares of the width (stacked on a phone); the setup line
  // "panels" places the region between head blocks (by default it comes after them).
  let PIN = box.narrow ? 0 : 10; const pbox: Box = { ...box, w: box.w - 2 * PIN }; // PIN, pbox.w: moved right of a lone card (beside, below)
  let peer: { x: number; y: number; w: number; bottom: number; steps?: number[] } | undefined;
  // where a head's aside sits in the panel row's right slot (wide): in those steps a step's notes keep to the left column
  let asideCols: { w: number; steps: Set<number> } | undefined;
  const stepPanels = (s: Step) => {
    if (!s.beside || Math.max(s.panels.length,s.beside.length) < 2 || box.narrow) { let h = 0; const outs = s.panels.map((p) => { const o = { out: p.block.layout(p.node, pbox), x: 0, dy: h, w: pbox.w, side: false }; h += o.out.h + (box.narrow ? PHONE.panelGap : 36); return o; }); return { outs, h }; }
    const sh = Array.from({length:Math.max(s.panels.length,s.beside.length)},(_,i)=>s.beside![i]??1), tot = sh.reduce((x, y) => x + y, 0), room = pbox.w - 20 * (sh.length - 1);
    let x = 0; const outs = s.panels.map((p, i) => { const pw = (room * sh[i]) / tot, o = { out: p.block.layout(p.node, { ...pbox, w: pw, beside: true }), x, dy: 0, w: pw, side: true }; x += pw + 20; return o; });
    return { outs, h: Math.max(...outs.map((o) => o.out.h)) + 36 };
  };
  // "notes: above": the note band region first (never in a head block's slot), then the panels
  const placeBand = (sl0?: { x: number; y: number; w: number; grow?: string[]; under?: boolean }) => {
    // slot.under (a worksheet on a phone): the stage's own band, sized as under everything, but right under the block's
    // groups; what was drawn from there down (the outcome column) moves under the notes, so a column's notes stay with it
    const under = sl0?.under ? sl0 : undefined, sl = under ? undefined : sl0;
    const bbox: Box = sl ? { ...box, w: sl.w } : box;
    const bandH = Math.max(0, ...m.steps.map((s) => stepBand(s, bbox).h));
    if (!bandH) return;
    if (under) { const lift = bandH + 6; for (let q = 0; q < items.length; q++) { const it = items[q]; if (it.k === "path" ? it.pts.every((p) => p[1] >= under.y) : it.y >= under.y) items[q] = shift([it], 0, lift)[0]; } y += lift - bandH - 6; }
    // in a slot: each step's note at its own height (at least a title and two lines) and a little room; "notes: roomy" asks a tall zone that every step's note fills
    const noteSteps = new Set(m.steps.flatMap((s, si) => (stepBand(s, bbox).h ? [si + 1] : [])));
    // a note band right under the block placed just before it, sharing none of its steps, shares its place
    const belowCard = !sl && !under && !m.notesAbove && panelH <= 0 && lastPlaced && lastPlaced.end === y && ![...noteSteps].some((k) => lastPlaced!.steps.has(k)) ? lastPlaced : undefined;
    const room = sl && m.notesRoomy ? Math.round(box.w * 0.14) : 0, fill = sl ? Math.max(room ? bandH : Math.max(bandH, 34 + 2 * LINE_H.body) + 16, room) : bandH, at = sl ? sl.y : under ? under.y : belowCard ? belowCard.top : y;
    // is the place empty in that step (no box already drawn there that shows in it)?
    const roomAt = (si: number, top: number, h: number) => !items.some((it) => it.k === "box" && it.y < top + h && it.y + it.h > top && (it.on ? it.on.includes(si + 1) : si + 1 >= (it.from ?? 1) && (!it.to || si + 1 <= it.to)));
    const own = !sl && panelH > 0 && !m.notesAbove; let end = 0;
    m.steps.forEach((s, si) => { const sb = own && asideCols?.steps.has(si + 1) ? { ...bbox, w: asideCols.w } : bbox; const sy = own && (s.panels.length || roomAt(si, ends[si] ?? at, stepBand(s, sb).h)) ? ends[si] ?? at : at, /* a step with no panels rises into the empty panel place only when no lane box shows there in that step */ b = stepBand(s, sb, own ? 0 : sl && !room ? Math.max(stepBand(s, sb).h, 34 + 2 * LINE_H.body) + 16 : fill); items.push(...shift(b.items, sl ? sl.x : PAD, sy, { from: si + 1, to: si + 1 })); end = Math.max(end, sy + b.h + 6); });
    if (!sl && !own && m.notesAbove) bandPlace = { at, h: bandH, steps: noteSteps };
    y = sl ? Math.max(y, at + fill + 12) : own ? Math.max(y, end) : belowCard ? Math.max(belowCard.end, at + bandH + 6) : y + bandH + 6;
    // slot.grow: the block's boxes that run down to the foot of the notes it holds (a worksheet's outcome column)
    if (sl?.grow) for (const it of items) if (it.k === "box" && it.id && sl.grow.includes(it.id)) it.h = Math.max(it.h, at + fill - it.y);
  };
  // (with notes above, nothing follows the panels but the key: the last panel keeps a small gap, not the notes' 36)
  const tail = m.notesAbove ? 24 : 0;
  let panelH = 0;
  const ends: number[] = []; // where each step's own panels end: its notes sit right under them
  let panelSpan: { start: number; end: number; top: number; h: number } | undefined; // the last panel row's items, for an aside's head room
  const panelRegion = () => {
    peer = undefined;
    if (m.notesAbove) placeBand();
    panelH = Math.max(0, ...m.steps.map((s) => stepPanels(s).h - (s.panels.length ? tail : 0)));
    if (!panelH) return;
    const spanStart = items.length;
    m.steps.forEach((s, si) => {
      stepPanels(s).outs.forEach(({ out, x, dy, w: sw, side }, pi) => {
        const f0 = out.items[0];
        // a lone full-width frame, or each frame of a "beside" row, grows to the region's height (side by side, one height) (a phone keeps each frame its own height: no empty box under the words)
        if (!box.narrow && (s.panels.length === 1 || side) && f0?.k === "box" && f0.x === 0 && f0.y === 0 && f0.w >= sw - 1 && f0.h >= out.h - 1 && f0.cls === "scn-frame") out.items[0] = { ...f0, h: Math.max(f0.h, panelH - (box.narrow ? PHONE.panelGap : 36)) };
        // the panel is a region with its own title from the source, for the bar: a frame of the panel's
        // own that already is a region (a full-width card is a lane, a calc a band) takes the title; else an unpainted box under it
        // (untitled when the panel's frame is a card with that same title: the card is the thing, one name is one item).
        // Card collections retain a labelled layout region; ignore excludes that unpainted wrapper from the semantic inventory.
        const t0 = panelTitle(s.panels[pi]), g = out.items[0], t = t0 && !out.items.some((it) => it.bar?.label === t0) ? t0 : "";
        const frame = g?.k === "box" && g.x === 0 && g.y === 0 && g.w >= sw - 1 && g.h >= out.h - 1 && REGION_KINDS.has(String(g.bar?.kind)) ? g : undefined;
        if (frame) { if (t && !frame.bar!.label) out.items[0] = { ...frame, bar: { ...frame.bar, label: t } }; }
        else out.items.unshift({ k: "box", x: 0, y: 0, w: sw, h: Math.max(out.h, g?.k === "box" && g.x === 0 && g.y === 0 ? g.h : 0), fill: "none", stroke: "none", r: 0, cls: "stg-region", bar: out.items.some(it=>it.bar?.kind==="card")?{kind:"panel",...(t0?{label:t0}:{}),ignore:1}:t?{kind:"panel",label:t}:{kind:"panel"} });
        items.push(...shift(out.items, PAD + PIN + x, y + dy, { from: si + 1, to: si + 1 }));
        ends[si] = Math.max(ends[si] ?? y, y + dy + ((g0) => Math.max(out.h, g0?.k === "box" ? g0.h : 0))(out.items[0]) + 14);
      });
      ends[si] ??= y;
    });
    // a step's notes sit under its own panels (placeBand, later): the region keeps room for them, so a head block placed
    // after the panels (a time block and its caption) starts under the notes, not under them
    if (!m.notesAbove) m.steps.forEach((s, si) => { const bh = s.panels.length ? stepBand(s, box).h : 0; if (bh) panelH = Math.max(panelH, ends[si] + bh + 6 - y); });
    const filled=m.steps.filter(s=>s.panels.length),lone=(s:typeof m.steps[number])=>s.panels.length===1&&s.beside?.length===2;
    // steps with other panels (a full-width grid) keep the slot only in the steps where it is free; the next head
    // takes it when its aside shows in no other step (a grid fills step 4)
    if(filled.some(lone)){
      const shares=filled.filter(lone).map(s=>s.beside![0]/(s.beside![0]+s.beside![1]));
      const left=box.narrow?0:Math.max(...shares.map(r=>(pbox.w-20)*r+20));
      const free=m.steps.map((s,i)=>!s.panels.length||lone(s)?i+1:0).filter(Boolean);
      peer={x:PIN+left,y,w:pbox.w-left,bottom:y+panelH,...(filled.every(lone)?{}:{steps:free})};
    }
    panelSpan = { start: spanStart, end: items.length, top: y, h: panelH };
    y += panelH;
  };
  // the panels reuse the lanes' place when the steps that have panels hide every card of those lanes ("hide"):
  // the first lanes (A) show only before; the later lanes (B, may be none) only from then on, with the panels under them.
  // A and B both start at the lanes' top, the stage is as tall as the taller of the two, and A's own things (headings,
  // regions, connectors) are gone in the later steps. Nothing moves: each thing keeps one place for the whole scene.
  const cardOn = (id: string, k: number) => m.shownOn?.get(id)?.includes(k) ?? k >= m.cards.get(id)!.from;
  const panelSteps = new Set(m.steps.flatMap((s, si) => (s.panels.length ? [si + 1] : [])));
  const laneOn = (l: Lane, k: number) => l.cards.some((c) => cardOn(c.id, k));
  const nA = m.lanes.findIndex((l) => [...panelSteps].some((k) => laneOn(l, k)));
  const A = nA < 0 ? m.lanes.length : nA, laterSteps = new Set(panelSteps);
  for (const l of m.lanes.slice(A)) for (let k = 1; k <= m.steps.length; k++) if (laneOn(l, k)) laterSteps.add(k);
  const setOf = (ls: Lane[]) => new Set(ls.flatMap((l) => l.cards.map((c) => c.id)));
  const idsA = setOf(m.lanes.slice(0, A)), idsB = setOf(m.lanes.slice(A));
  const reuse = m.panelsAt === undefined && m.cards.size > 0 && panelSteps.size > 0 && A > 0 && !m.lanes.some((l) => l.span)
    && [...laterSteps].every((k) => [...idsA].every((id) => !cardOn(id, k)))
    && (!idsB.size || m.steps.every((st) => st.edges.every((e) => !idsB.has(topCard(m, e.from)) && !idsB.has(topCard(m, e.to)))));
  let reused = false, laneItems: [number, number] = [0, 0], laterItems: [number, number] = [0, 0];
  // a model of some lanes only (B: lanes renumbered from 0, no connectors; its cards keep their own lane in rects)
  const lanesOnly = (from: number): Model => {
    const ls = m.lanes.slice(from).map((l) => ({ ...l, cards: l.cards.map((c) => ({ ...c, lane: c.lane - from })) })), cards = new Map(m.cards);
    for (const l of ls) for (const c of l.cards) cards.set(c.id, c);
    return { ...m, lanes: ls, cards, steps: m.steps.map((st) => ({ ...st, edges: [] })) };
  };
  const lanesHere = () => {
    box.footLeft = undefined;
    const top0 = y; laneTop = y;
    if (reuse && idsB.size) {
      // a wide stage whose later lanes are one lone card, on screen in every panel step: the card at the left (about 30%),
      // the panels at its right from the same top, as the originals draw a ledger beside its steps
      const bLanes = m.lanes.slice(A).filter((l) => l.cards.length), lone = !box.narrow && bLanes.length === 1 && bLanes[0].cards.length === 1
        && [...panelSteps].every((k) => cardOn(bLanes[0].cards[0].id, k)) && m.steps.every((st) => !st.beside);
      const bw = lone ? Math.round(0.3 * w) : w;
      // B first (its own items keep their steps), then A last: the narrow connectors read the last lanes' layout
      const bAt = items.length, rb = lanesLayout(lanesOnly(A), bw, narrow, top0, rects, inner); items.push(...rb.items); laterItems = [bAt, items.length];
      if (lone) {
        for (const id of idsB) { const r = rects.get(id); if (r) rects.set(id, { ...r, lane: r.lane + A }); }
        const at = items.length, ra = lanesLayout({ ...m, lanes: m.lanes.slice(0, A) }, w, narrow, top0, rects, inner); items.push(...ra.items); laneItems = [at, items.length];
        const keepPIN = PIN, keepW = pbox.w; PIN = bw - PAD + 24; pbox.w = box.w - PIN - 10; pbox.inset = true;
        // the panels take the place of the lanes they cover, heading row included, when none of those lanes is on screen in a
        // panel step (the originals: a step's card from the lanes' top); else level with the lone card (fault 2)
        const coversHeads = [...panelSteps].every((k) => m.lanes.slice(0, A).every((l) => l.cards.every((c) => !cardOn(c.id, k))));
        free = undefined; y = coversHeads ? top0 : top0 + LANE_HEAD; panelRegion(); PIN = keepPIN; pbox.w = keepW; pbox.inset = undefined;
        y = Math.max(y, rb.bottom + 12, ra.bottom + 12); reused = true; return;
      }
      for (const id of idsB) { const r = rects.get(id); if (r) rects.set(id, { ...r, lane: r.lane + A }); }
      const at = items.length, ra = lanesLayout({ ...m, lanes: m.lanes.slice(0, A) }, w, narrow, top0, rects, inner); items.push(...ra.items); laneItems = [at, items.length];
      free = undefined; y = rb.bottom + 12; panelRegion(); y = Math.max(y, ra.bottom + 12); reused = true; return;
    }
    const at = items.length, r = lanesLayout(m, w, narrow, y, rects, inner); items.push(...r.items); laneItems = [at, items.length];
    free = reuse ? undefined : r.free; laneFoot = r.bottom; y = r.bottom + 12;
    if (reuse) { y = top0; panelRegion(); y = Math.max(y, r.bottom + 12); reused = true; }
  };
  m.head.forEach((h, i) => {
    if (i === m.panelsAt) panelRegion();
    if (i === m.lanesAt) { bandPlace = undefined; lanesHere(); }
    const offered=peer;peer=undefined;
    box.footLeft = undefined;
    const lanes=items.flatMap((it)=>it.k==="box"&&it.cls==="stg-region"&&it.bar?.kind==="lane"&&it.bar.label?[{title:String(it.bar.label),x:it.x-PAD,w:it.w}]:[]); // lane columns laid out so far
    const out=h.block.layout(h.node,{...(offered?{...box,aside:{w:offered.w,...(offered.steps?{steps:offered.steps}:{})}}:box),lanes});
    if (offered && (out.aside || !offered.steps)) bandPlace = undefined;
    if(offered&&out.aside){
      const at=box.narrow?Math.max(y,offered.bottom):offered.y;
      items.push(...shift(out.aside.items,PAD+offered.x,at));
      y=Math.max(y,at+out.aside.h+12);
      // the aside's own words (an inset's caption or bracket) head the row: the panels beside it start level with its body (the originals)
      const head=out.aside.head??0;
      if(head>0&&!box.narrow&&!m.notesAbove&&panelSpan&&panelSpan.top===offered.y){
        // in every step whose panel shares the row with the slot (a lone two-share panel), so one panel never shifts between steps; a full-width panel keeps the row's top
        const shows=new Set<number>(m.steps.flatMap((st,si)=>st.panels.length===1&&st.beside?.length===2?[si+1]:[]));
        for(let k=panelSpan.start;k<panelSpan.end;k++){const it=items[k];if(shows.has(it.from??1))items[k]=shift([it],0,head)[0];}
        for(let k=0;k<ends.length;k++)if(ends[k]!==undefined&&shows.has(k+1))ends[k]+=head;
        y=Math.max(y,...m.steps.map((st,si)=>shows.has(si+1)&&st.panels.length?(ends[si]??panelSpan!.top)+(m.notesAbove?0:stepBand(st,box).h)+6:0),panelSpan.top+Math.max(0,...m.steps.map((st,si)=>shows.has(si+1)?0:(ends[si]??panelSpan!.top)-panelSpan!.top)));
      }
      if(!box.narrow&&!m.notesAbove){
        // the steps the aside shows in: there a step's notes stay under its own panel, in the left column, and the row keeps their room
        const shows=new Set<number>();for(let k=1;k<=m.steps.length;k++)if(out.aside.items.some(it=>(it.on?it.on.includes(k):k>=(it.from??1)&&(!it.to||k<=it.to))))shows.add(k);
        asideCols={w:Math.max(120,offered.x-24),steps:shows};
        m.steps.forEach((s,si)=>{if(!shows.has(si+1)||!s.panels.length)return;const bh=stepBand(s,{...box,w:asideCols!.w}).h;if(bh)y=Math.max(y,(ends[si]??offered.y)+bh+6);});
      }
    }
    const top = y; place(out); shareBand(out, top);
    lastPlaced = offered || out.slot ? undefined : { top, end: y, n: items.length, steps: new Set(out.items.flatMap(stepsOf)) };
  });
  if (m.lanesAt < 0 || m.lanesAt >= m.head.length) if (m.cards.size || m.lanes.some((l) => l.title)) lanesHere();
  if (!reused && (m.panelsAt === undefined || m.panelsAt >= m.head.length)) panelRegion();
  const connAt = items.length;
  // connectors and their labels, after layout
  // a connector to or from a card inside a card starts or ends at the card that holds it
  const top = m.cards.size && [...m.cards.values()].some((c) => c.parent) ? { ...m, steps: m.steps.map((s) => ({ ...s, edges: s.edges.map((e) => ({ ...e, from: topCard(m, e.from), to: topCard(m, e.to), fromPill: e.fromPill ?? (topCard(m, e.from) !== e.from ? "card:" + e.from : undefined), toPill: e.toPill ?? (topCard(m, e.to) !== e.to ? "card:" + e.to : undefined) })) })) } : m; //... at the height of the inner card
  pillBox = (p: string, k: number) => p.startsWith("card:") ? inner.get(p.slice(5)) : items.find((it) => it.k === "box" && typeof it.id === "string" && (p.startsWith("badge:") ? it.id === p : it.id.startsWith(`pill:${p}@`)) && (it.on ? it.on.includes(k) : k >= (it.from ?? 1) && (!it.to || k <= it.to))) as Rect | undefined;
  labelObs = items.filter((it) => it.k === "box" && it.cls !== "stg-region");
  headObs = items.filter((it) => it.k === "text" && it.f === "lane"); // lane and band headings
  if (rects.size) items.push(...connectors(top, reused && idsB.size ? new Map([...rects].filter(([id]) => !idsB.has(id))) : rects, w, narrow));
  const connEnd = items.length;
  const rectOf = (id: string) => rects.get(id) ?? inner.get(id)!;
  // cuts: a red cross at the middle of the connector it names, shown in that step; with no such connector,
  // halfway along the part of the line between the two cards' centres that is outside both cards
  m.steps.forEach((s, si) => {
    for (const c of s.cuts ?? []) {
      const k = si + 1, a = topCard(m, c.from), b = topCard(m, c.to);
      // the connector's route in this step, else the route it takes in another step (the cut stands where that line would arrive)
      const line = (items.slice(connAt, connEnd).find((it) => it.k === "path" && (it.id === `${a}>${b}` || it.id === `${b}>${a}`) && (it.on ? it.on.includes(k) : k >= (it.from ?? 1) && (!it.to || k <= it.to))) ?? items.slice(connAt, connEnd).find((it) => it.k === "path" && it.id === `${a}>${b}`)) as Extract<Item, { k: "path" }> | undefined;
      let pt: [number, number];
      if (line) {
        const seg = line.pts.slice(1).map((q, i) => Math.hypot(q[0] - line.pts[i][0], q[1] - line.pts[i][1])), tot = seg.reduce((x, y) => x + y, 0), half = Math.max(tot / 2, tot - 16); /* near the target end, just before the arrowhead, as the reference design draws it */
        let acc = 0, i = 0; while (i < seg.length - 1 && acc + seg[i] < half) acc += seg[i++];
        const u = seg[i] ? (half - acc) / seg[i] : 0, p0 = line.pts[i], p1 = line.pts[i + 1] ?? p0; pt = [p0[0] + (p1[0] - p0[0]) * u, p0[1] + (p1[1] - p0[1]) * u];
      } else {
        const ra = rectOf(c.from), rb = rectOf(c.to), ca = [ra.x + ra.w / 2, ra.y + ra.h / 2], cb = [rb.x + rb.w / 2, rb.y + rb.h / 2];
        const inR = (r: Rect, x: number, y: number) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
        const out = Array.from({ length: 201 }, (_, j) => j / 200).filter((t) => { const x = ca[0] + (cb[0] - ca[0]) * t, y = ca[1] + (cb[1] - ca[1]) * t; return !inR(ra, x, y) && !inR(rb, x, y); });
        const len = Math.hypot(cb[0] - ca[0], cb[1] - ca[1]) || 1, t = out.length ? Math.max((out[0] + out.at(-1)!) / 2, out.at(-1)! - 16 / len) : 0.5; pt = [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t];
      }
      const z = 7, on = edgeSteps(m, k), id = `cut:${c.from}>${c.to}`;
      items.push({ k: "path", pts: [[pt[0] - z, pt[1] - z], [pt[0] + z, pt[1] + z]], ink: "bad:ink", w: 3, id, from: k, on } as Item, { k: "path", pts: [[pt[0] - z, pt[1] + z], [pt[0] + z, pt[1] - z]], ink: "bad:ink", w: 3, id, from: k, on } as Item);
    }
  });
  // tags and says, in the places the lanes reserved
  m.steps.forEach((s, si) => {
    const k = si + 1;
    for (const [ids, t, tr] of s.tags) for (const id of ids) { const r = rectOf(id); const tp = `role:${tr ?? m.cards.get(id)!.role}`, c = chip(0, 0, t, tp); const cx = Math.min(r.x + r.w - c.w / 2 - (inner.has(id) ? 0 : 6), w - (narrow ? NPAD : PAD) - c.w / 2); items.push(...shift(chip(cx, narrow ? r.y - PHONE.tagLift : r.y - 20, t, tp).items, 0, 0, { from: k, to: 0 })); }
    { const by = new Map<string, string[]>(); const sr0 = new Map<string, string>(); for (const [id, t, sr] of s.says) { (by.get(id) ?? by.set(id, []).get(id)!).push(t); if (sr && !sr0.has(id)) sr0.set(id, sr); } for (const [id, ts] of by) items.push(...drawSays(ts, rectOf(id), `role:${sr0.get(id) ?? m.cards.get(id)!.role}`, w, narrow ? NPAD : PAD, k, nav.sayW.get(id))); } // says wrap to their card and stack
    // inside: a chip in the card's bottom row (under each badge when they share one row), this step only
    for (const [id, t] of s.insides) {
      const r = rectOf(id), c = m.cards.get(id)!, rows = badgeRows(c, r.w), per = c.badges.length && rows === 1 ? c.badges.length : 1, bw = (r.w - 12 - (per - 1) * 6) / per;
      for (let j = 0; j < per; j++) { const cx = per > 1 ? r.x + 6 + j * (bw + 6) + Math.min(bw / 2, measure(t, "chip") / 2 + 12) : r.x + r.w / 2; items.push(...shift(chip(cx, r.y + r.h - 25, t, `role:${c.role}`).items, 0, 0, { from: k, to: k })); }
      // a phone whose badges stack: one chip per badge, stacked at the foot
      const n = insideN(c, r.w); for (let j = 1; j < n; j++) items.push(...shift(chip(r.x + r.w / 2, r.y + r.h - 25 - j * 26, t, `role:${c.role}`).items, 0, 0, { from: k, to: k }));
    }
  });
  // reused place: the lanes' things are gone in the panels' steps
  if (reused) { const n = m.steps.length; for (const [a, b] of [laneItems, [connAt, connEnd]] as [number, number][]) for (let q = a; q < b; q++) {
    const it = items[q], on: number[] = []; for (let k = 1; k <= n; k++) if (!laterSteps.has(k) && (it.on ? it.on.includes(k) : k >= (it.from ?? 1) && (!it.to || k <= it.to))) on.push(k);
    items[q] = { ...it, on: on.length ? on : [0] } as Item; }
    // the later lanes' own things (headings, regions) only in the later steps: they share the first lanes' place
    for (let q = laterItems[0]; q < laterItems[1]; q++) { const it = items[q], on: number[] = []; for (let k = 1; k <= n; k++) if (laterSteps.has(k) && (it.on ? it.on.includes(k) : k >= (it.from ?? 1) && (!it.to || k <= it.to))) on.push(k); items[q] = { ...it, on: on.length ? on : [0] } as Item; } }
  // notes, formula and footnotes: one region under the panels, each shown in its step
  // (in a head block's slot when it offers one and no panel comes between; a lone note fills the region's height)
  if (!m.notesAbove) placeBand(slot && !panelH ? slot : undefined);
  // the key: shown from the step that writes it
  // "key at: bottom right": the legend right-aligned at the lanes' foot when nothing is drawn there, else under the stage
  if (m.keyAt === "bottom right") {
    const lg = drawLegend(m.steps.flatMap((s, si) => s.keys.map(([r, t, tone]) => ({ r, t, tone, k: si + 1 }))), box.w);
    if (lg.h) {
      const KEY_IN = 8, dx = PAD - KEY_IN; // 8 px in from the right edge, so its words never touch a frame's edge
      const xs = lg.items.map((it: any) => it.x), lx = dx + Math.min(...xs) - 8;
      const hit = (y0: number) => items.some((it: any) => {
        // a frame the legend sits wholly inside (a lane, band, panel or row) is a container, not in the way; a card never is
        if (it.k === "box") return it.cls !== "stg-region" && it.x < w && it.x + it.w > lx && it.y < y0 + lg.h + 6 && it.y + it.h > y0 - 6 && !(["lane", "band", "panel", "worksheet-row"].includes(it.bar?.kind) && it.x <= lx && it.x + it.w >= w - PAD - KEY_IN + 4 && it.y <= y0 - 3 && it.y + it.h >= y0 + lg.h + 3);
        if (it.k === "text") { const tw = measure(it.s, it.f), tx = it.anchor === "middle" ? it.x - tw / 2 : it.anchor === "end" ? it.x - tw : it.x; return tx < w && tx + tw > lx && it.y - 12 < y0 + lg.h + 6 && it.y + 4 > y0 - 6; }
        if (it.k === "path") return it.pts.some((p: number[], j: number) => { const q = it.pts[j + 1] ?? p; return Math.max(p[0], q[0]) > lx - 6 && Math.min(p[1], q[1]) < y0 + lg.h + 8 && Math.max(p[1], q[1]) > y0 - 8; });
        return false;
      });
      // the lowest free place at the right in the stage's lower half (beside the last rows' content when that leaves room), else under the stage
      const bottom = y - 12 - lg.h; let at = -1;
      for (let yy = Math.floor(bottom); yy >= Math.max(8, bottom / 2); yy -= 2) if (!hit(yy)) { at = yy; break; }
      if (at >= 0) items.push(...shift(lg.items, dx, at));
      else { const ly = y - 8; items.push(...shift(lg.items, PAD, ly)); y = ly + lg.h + 6; } // under the stage, 4 px under its content (the stage grows by the legend, not by a second gap)
    }
  }
  const keys = m.keyTop ? [] : m.steps.flatMap((s, si) => s.keys.map(([r, t, tone]) => ({ r, t, tone, k: si + 1 })));
  // in the first lane's free space when it fits (one box, a line per entry), else a row of entries under the stage;
  // each entry is a small swatch in its role's colour and its words (kind chip)
  const kh = 10 + keys.length * 18;
  // (the box may reach into half the gap beside the lane when no connector passes there)
  const kw = Math.max(0, ...keys.map((kk) => keyEntryW(kk.t) + 24));
  const clear = (x: number, y0: number, w0: number, h0: number) => !items.some((it) => it.k === "path" && it.pts.some(([px, py]) => px > x - 6 && px < x + w0 + 6 && py > y0 - 6 && py < y0 + h0 + 6) || it.k === "path" && (() => { const xs = it.pts.map((p) => p[0]), ys = it.pts.map((p) => p[1]); return Math.min(...xs) < x + w0 + 6 && Math.max(...xs) > x - 6 && Math.min(...ys) < y0 + h0 + 6 && Math.max(...ys) > y0 - 6; })());
  const fw = free && kh <= free.h ? (kw <= free.w ? free.w : kw <= free.w + 44 && clear(free.x, free.y + free.h - kh, kw, kh) ? kw : 0) : 0;
  if (keys.length && free && fw) {
    const ky = free.y + free.h - kh;
    items.push({ k: "box", x: free.x, y: ky, w: fw, h: kh, fill: "surface", stroke: "line-2", r: 8, from: Math.min(...keys.map((kk) => kk.k)), bar: { kind: "legend" } }); // the key is one legend box, its entries inside (the hero's original)
    keys.forEach((kk, i) => items.push(...keyEntry(free!.x + 12, ky + 18 + i * 18, kk, false)));
  } else if (keys.length && narrow && keys.every((kk) => keyEntryW(kk.t) + 24 <= box.w)) {
    // on a phone one box under the stage, a line per entry (the row of boxes takes a row each)
    items.push({ k: "box", x: PAD, y, w: box.w, h: kh, fill: "surface", stroke: "line-2", r: 8, from: Math.min(...keys.map((kk) => kk.k)), bar: { kind: "legend" } }); // the key is one legend box, its entries inside (the hero's original)
    keys.forEach((kk, i) => items.push(...keyEntry(PAD + 12, y + 18 + i * 18, kk, false)));
    y += kh + 4;
  } else if (keys.length) {
    // rows of entries at the bottom left, left to right (an entry wider than the stage keeps its own row)
    let x = 0, row = 0, right = 0; const at = items.length;
    for (const kk of keys) {
      const kw = keyEntryW(kk.t);
      if (x && x + kw > box.w) { x = 0; row++; }
      items.push(...shift(keyEntry(x, row * 22 + 14, kk, false), PAD, y));
      right = Math.max(right, x + kw); x += kw + KEY_SEP;
    }
    // one unpainted legend box around the rows (the hero's original key is one legend)
    items.splice(at, 0, { k: "box", x: PAD - 4, y: y - 3, w: Math.min(box.w + 8, right + 10), h: (row + 1) * 22 + 2, fill: "none", stroke: "none", r: 0, cls: "stg-legend", from: Math.min(...keys.map((kk) => kk.k)), bar: { kind: "legend" } });
    y += (row + 1) * 22 + 4;
  }
  budget.charge("stage items", items.length, items.length);
  // 'lines: straight' on a phone: a lane heading a straight line runs through is drawn last, over the line, with
  // the stage's colour round its letters, so the line stops at them
  if (narrow) {
    const lines = items.filter((it): it is Extract<Item, { k: "path" }> => it.k === "path" && (m.linesStraight || thruPaths.has(it)));
    const over = (t: Extract<Item, { k: "text" }>) => { const x0 = t.x - 2, x1 = t.x + measure(t.s, t.f) + 2, y0 = t.y - 12, y1 = t.y + 4;
      return lines.some((p) => p.pts.slice(1).some((q, i) => { const o = p.pts[i]; return Math.abs(o[0] - q[0]) < 1 && o[0] > x0 && o[0] < x1 && Math.min(o[1], q[1]) < y1 && Math.max(o[1], q[1]) > y0; })); };
    const lift = items.filter((it) => it.k === "text" && it.f === "lane" && (it.anchor ?? "start") === "start" && over(it));
    if (lift.length) { const set = new Set(lift); const rest = items.filter((it) => !set.has(it)); items.length = 0; items.push(...rest, ...lift.map((t) => ({ ...t, halo: true }) as Item)); }
  }
  return { w, h: Math.ceil(y + 6), items, narrow, ...(box.narrow ? { phone: true } : {}) };
}
const LANE_MIN = 130;
const REGION_KINDS = new Set(["lane", "band", "panel", "bin", "track", "table"]);
/** a panel's own title in the source (list, chips and card name one; a map's is the word after "map"); "" when it has none */
export function panelTitle(p: { block: StageBlock; node: any }): string { const t = p.block.word === "map" ? p.node?.label : p.node?.title; return typeof t === "string" ? t.trim() : ""; }
function stepBand(s: Step, box: Box, fill = 0): LayoutOut {
  const items: Item[] = []; let h = 0;
  const lone = s.notes.length === 1 && !s.formula.length && !s.foot.length;
  for (const note of s.notes) {
    const [t, ...ls] = note, inner = box.w - 28;
    // the note's title wraps to the band
    const tl = wrap(t, inner, "title", 6), th = (tl.length - 1) * LINE_H.title;
    const body = textLines(14, 26 + th, inner, ls, "body", "ink");
    const hh = lone ? Math.max(34 + th + body.h, fill) : 34 + th + body.h;
    items.push({ k: "box", x: 0, y: h, w: box.w, h: hh, fill: "surface-2", stroke: "stg-note-line", r: 10, cls: "stg-note-strip", bar: { kind: "band", label: t } }, ...tl.map((q, i) => ({ k: "text", x: 14, y: h + 20 + i * LINE_H.title, s: q, f: "title", ink: "ink", tip: tl.length > 1 ? t : undefined }) as Item), ...shift(body.items, 0, h));
    h += hh + 8;
  }
  if (s.formula.length) {
    const [f0, ...rest] = s.formula, fw = Math.min(box.w, Math.max(measure(f0, "big"), ...rest.map((x) => measure(x, "body"))) + 32);
    const lines0 = wrap(f0, fw - 32, "big", 3), body = textLines(16, 14 + lines0.length * LINE_H.big, fw - 32, rest, "body", "ink-2");
    const hh = 20 + lines0.length * LINE_H.big + body.h;
    items.push({ k: "box", x: 0, y: h, w: fw, h: hh, fill: "good:soft", stroke: "good:line", r: 10, thick: true, bar: { kind: "band", label: f0 } });
    lines0.forEach((l, i) => items.push({ k: "text", x: 16, y: h + 8 + (i + 1) * LINE_H.big - 6, s: l, f: "big", ink: "good:ink" }));
    items.push(...shift(body.items, 0, h + 4));
    h += hh + 8;
  }
  // a foot line in its own tone or role ink ("foot (warn): words"), else muted
  s.foot.forEach((t, i) => { const x = box.footLeft ?? 0, f = textLines(x, h, box.w - x, [t], "sub", (s.footInk?.[i] ?? "muted")); items.push(...f.items); h += f.h; }); if (s.foot.length) h += 4;
  return { h, items };
}

function lanesLayout(m: Model, w: number, narrow: boolean, top: number, rects: Map<string, Rect & { lane: number }>, inner: Map<string, Rect>): { items: Item[]; bottom: number; free?: Rect } {
  const items: Item[] = [];
  nav.sayW.clear();
  const main = m.lanes.map((l, i) => ({ l, i })).filter((x) => !x.l.span);
  const spans = m.lanes.map((l, i) => ({ l, i })).filter((x) => x.l.span);
  // reserved room above a card (a tag chip) and below it (a say chip)
  const { tags: tagged, says: said, slots } = marksOf(m);
  const drawCard = (c: Card, r: Rect) => { rects.set(c.id, { ...r, lane: c.lane }); items.push(...hideSteps(m, c.id, cDraw(m, c, r, tagged, said, inner, slots))); };
  // each lane and band is a region with its own title on it (the bar matches regions by name): drawn first, unpainted
  const region = (kind: "lane" | "band", l: Lane, x: number, y: number, rw: number, rh: number) => items.push({ k: "box", x, y, w: rw, h: Math.max(0, rh), fill: "none", stroke: "none", r: 0, cls: "stg-region", from: l.cards[0]?.from ?? 1, bar: l.title ? { kind, label: l.title } : { kind } });
  const grow = new Map<string, number>(), lone = new Set<string>(); // a lone card beside a stack (wide form): its least height
  const hOf = (c: Card, lw: number) => Math.max(cardH(m, c, lw), grow.get(c.id) ?? 0);
  let bottom = top;
  nav.deskHeads.length = 0; // lane headings on a wide stage: connector labels keep clear
  if (!narrow) {
    // widths: each lane gets what its cards ask, the gaps what their labels ask; then all is scaled to the stage
    const RG = 28; // between the cards of a row: room for an arrow
    const rowLong = (l: Lane) => Math.max(1, ...(placesOf(m, l.cards) ?? [[l.cards]]).flatMap((p) => p.map((r) => r.length)));
    const need = main.map(({ l }) => l.row ? Math.max(LANE_MIN, measure(l.title, "lane") + 4, rowLong(l) * Math.max(...l.cards.map(cardNeed(m))) + (rowLong(l) - 1) * RG) : Math.max(LANE_MIN, measure(l.title, "lane") + 4, ...l.cards.map(cardNeed(m))));
    const minW = main.map(({ l }) => Math.max(LANE_MIN, ...l.cards.map(cardMin(m))));
    const stackAt = (li: number) => main[li].l.cards.reduce((a, c, j) => a + cardH(m, c, need[li]) + (j ? WVGAP : 0), 0);
    const H0 = Math.max(0, ...main.map((_, li) => stackAt(li)));
    const loneRoom = (li: number) => {
      const c = main[li].l.cards[0], grown = li > 0 && main[li - 1].l.cards.length > 1 ? Math.round(stackAt(li - 1) * 0.75) : 0;
      const free = (H0 - Math.max(cardH(m, c, need[li]), grown)) / 2;
      return Math.max(free - (tagged.has(c.id) ? 24 : 0), free - sayRoom(m, c.id, need[li]));
    };
    const gaps = main.slice(1).map((_, gi) => {
      const a = main[gi].i, b = main[gi + 1].i;
      const labels = m.steps.flatMap((s) => s.edges.filter((e) => { const la = m.cards.get(e.from)!.lane, lb = m.cards.get(e.to)!.lane; return (la === a && lb === b) || (la === b && lb === a); }).map((e) => e.label)).filter(Boolean);
      // into a lane of one card the label can stand above or below that card, so the gap need not hold it all; only
      // when that card leaves a label's room above or below it in the lane (else it went over the
      // lane's heading or above the stage)
      const one = main[gi + 1].l.cards.length === 1, room = one && loneRoom(gi + 1) >= 26;
      // a label over a lone card hangs into the gap only by what the card does not hold (the reference design: the gap is the overhang; fault 2)
      const narrowW = (t: string) => Math.max(64, Math.min(measure(t, "chip") * 0.5 + 24, measure(t, "chip") + 18 - need[gi + 1] + 12)), fits = (t: string) => measure(t, "chip") + 24 <= narrowW(t);
      return Math.max(64, ...labels.map((t) => (one && (room || fits(t)) ? narrowW(t) : measure(t, "chip") + 50)));
    });
    const room = w - 2 * PAD - gaps.reduce((a, b) => a + b, 0);
    let ws = need.slice(); const sum = ws.reduce((a, b) => a + b, 0);
    if (sum > room) { // shrink the lanes that can wrap, never under their least width
      let over = sum - room;
      for (let pass = 0; pass < 4 && over > 0.5; pass++) {
        const give = ws.map((x, i) => Math.max(0, x - minW[i])), gt = give.reduce((a, b) => a + b, 0);
        if (!gt) break;
        ws = ws.map((x, i) => x - (give[i] / gt) * Math.min(over, gt)); over = ws.reduce((a, b) => a + b, 0) - room;
      }
    } else { const extra = room - sum; ws = ws.map((x) => x + (extra * x) / sum); }
    // a 'layout: row' lane lends width to the tallest other lane while that lane gets shorter, the row keeps all its
    // cards on one line and none of them grows
    if (main.some(({ l }) => l.row)) {
      const stackH = (li: number, lw: number) => main[li].l.cards.reduce((a, c, j) => a + cardH(m, c, lw) + (j ? WVGAP : 0), 0);
      // the row as rowPlan draws it: each group its count a line (by its longest least width) and its card width; a card
      // under two of them as wide as they are. [counts a line, height]
      const rowShape = (li: number, lw: number): [string, number] => {
        const l = main[li].l, base = l.cards.filter((c) => !c.under), places = placesOf(m, base) ?? [[base]]; const pers: number[] = []; let h = 0;
        for (const p of places) { let ph = 0;
          for (const r of p) { if (!r.length) continue; const least = Math.max(...r.map(cardMin(m))), per = Math.max(1, Math.min(r.length, Math.floor((lw + RG) / (least + RG)))), cw = (lw - (per - 1) * RG) / per;
            pers.push(per); const lines = Math.ceil(r.length / per); let gh = lines * Math.max(...r.map((c) => cardH(m, c, cw))) + (lines - 1) * VGAP;
            for (const u of l.cards.filter((c) => c.under && r.some((q) => q.id === c.under![0]))) { const ia = r.findIndex((q) => q.id === u.under![0]), ib = r.findIndex((q) => q.id === u.under![1]), n = Math.abs(ib - ia) + 1; gh += VGAP + cardH(m, u, n * cw + (n - 1) * RG); }
            ph = Math.max(ph, gh); }
          h += ph; }
        return [pers.join(","), h];
      };
      const rowOk = (li: number, lw: number) => { const [p0, h0] = rowShape(li, ws[li]), [p1, h1] = rowShape(li, lw); return p0 === p1 && h1 <= h0; };
      for (let n = 0; n < 12; n++) {
        const hh = main.map(({ l }, li) => (l.row ? -1 : stackH(li, ws[li]))), t = hh.indexOf(Math.max(...hh));
        if (t < 0 || hh[t] <= 0) break;
        let moved = false;
        for (let d = 4; d <= 96 && !moved; d += 4) {
          if (stackH(t, ws[t] + d) >= hh[t]) continue;
          const r = main.findIndex(({ l }, li) => l.row && rowOk(li, ws[li] - d));
          if (r < 0) break;
          ws[r] -= d; ws[t] += d; moved = true;
        }
        if (!moved) break;
      }
    }
    let x = PAD; const lx: number[] = [];
    ws.forEach((lw, i) => { lx.push(x); x += lw + (gaps[i] ?? 0); });
    // a lane's lone card next to a lane of several grows to 75% of their stack (a store beside its writers); one with a big
    // "**" value spans the whole stack, the value centred
    main.forEach(({ l }, li) => {
      if (l.cards.length !== 1 || li === 0) return;
      const p = main[li - 1].l; if (p.cards.length < 2 || p.row) return;
      const stack = p.cards.reduce((a, c, j) => a + cardH(m, c, ws[li - 1]) + (j ? WVGAP : 0), 0);
      grow.set(l.cards[0].id, Math.round(bigLine(m, l.cards[0]) ? stack : stack * 0.75)); lone.add(l.cards[0].id); // with a big value: as tall as the whole stack
    });
    // a lane of cards with badges beside a lane of the same: its cards stand as tall as their neighbours
    main.forEach(({ l }, li) => {
      const p = li ? main[li - 1].l : null;
      if (!p || l.row || p.row || l.cards.length < 2 || p.cards.length < 2 || ![...l.cards, ...p.cards].every((c) => c.badges.length)) return;
      const ph = Math.max(...p.cards.map((c) => cardH(m, c, ws[li - 1])));
      for (const c of l.cards) if (cardH(m, c, ws[li]) < ph) grow.set(c.id, ph);
    });
    // room between two stacked cards of a lane for a labelled connector that joins them (its label sits beside the line)
    const stackLabel = (a: string, b: string) => m.steps.some((s) => s.edges.some((e) => e.label && ((e.from === a && e.to === b) || (e.from === b && e.to === a))));
    const sayGap = (c: Card) => sayRoom(m, c.id, ws[main.findIndex(({ l }) => l.cards.includes(c))] ?? w);
    const gapOf = (c: Card, j: number) => (j ? (tagged.has(c.id) ? 24 : WVGAP) : tagged.has(c.id) ? 16 : 0) + (j && stackLabel(c.id, (main.find(({ l }) => l.cards.includes(c))!.l.cards[j - 1]).id) ? 28 : 0) + (j ? Math.max(0, sayGap((main.find(({ l }) => l.cards.includes(c))!.l.cards[j - 1])) - 2) : 0);
    // a lane's runs of cards with the same shown steps; a run never on screen with the run(s) in the
    // place above it shares that place, which is as tall as its tallest run, so nothing moves between steps and no room
    // stays reserved for a group that is gone. A lane with no such run is stacked as before.
    // "layout: row": the cards side by side, as many a line as fit (all of the longest run when they can), each run of a
    // place from its first slot; a strip above each line for the labels of the arrows between neighbours
    const rowPlan = (l: Lane, li: number) => {
      // each run of cards shown in the same steps gets its own count a line and width (a group of long names does not
      // narrow the others); runs never on screen together share the place
      const lw = ws[li], base = l.cards.filter((c) => !c.under), places = placesOf(m, base) ?? [[base]];
      const ids = new Set(l.cards.map((c) => c.id));
      const strip = m.steps.some((s) => s.edges.some((e) => e.label && ids.has(topCard(m, e.from)) && ids.has(topCard(m, e.to)))) ? 24 : 0;
      const cross = m.steps.some((s) => s.edges.some((e) => ids.has(topCard(m, e.from)) !== ids.has(topCard(m, e.to))));
      // the labels of arrows between neighbours stand under the line, at each gap (as the originals draw them)
      const above = Math.max(cross ? 20 : 0, l.cards.some((c) => tagged.has(c.id)) ? 16 : 0), below = strip;
      for (const c of l.cards) rowAbove.set(c.id, 0);
      const at = new Map<string, number>(), atX = new Map<string, number>(), atW = new Map<string, number>(), atH = new Map<string, number>(); let cur = 0;
      for (const p of places) {
        let end = cur;
        for (const r0 of p) {
          const r = r0, unders = l.cards.filter((c) => c.under && r.some((q) => q.id === c.under![0])); if (!r.length) continue;
          // a run whose cards each take lines from one and the same card
          // of another lane, and none between themselves, stands in one column beside it, so each line is short
          const fanOf = (c: Card) => m.steps.flatMap((st) => st.edges).filter((e) => e.from === c.id || e.to === c.id).map((e) => topCard(m, e.from === c.id ? e.to : e.from));
          const fans = r.map(fanOf), fan = fans.every((o) => o.length > 0 && o.every((x) => !ids.has(x))) && new Set(fans.flat()).size === 1;
          const least = Math.max(...r.map(cardMin(m))), per0 = Math.max(1, Math.min(r.length, Math.floor((lw + RG) / (least + RG)))), per = fan && r.length > 1 ? 1 : per0, cw = (lw - (per - 1) * RG) / per;
          const ch = Math.max(...r.map((c) => hOf(c, cw))), say = Math.max(0, ...r.map((c) => sayRoom(m, c.id, cw))), lineH = above + ch + below + say;
          // a fan column: no line runs between its cards, so they stack a card gap apart (a card's own words under it)
          const fanStep = (c: Card) => ch + sayRoom(m, c.id, cw) + WVGAP;
          let fy = cur + above;
          r.forEach((c, i) => { at.set(c.id, fan && per === 1 ? fy : cur + Math.floor(i / per) * (lineH + VGAP) + above); fy += fanStep(c); atX.set(c.id, (i % per) * (cw + RG)); atW.set(c.id, cw); atH.set(c.id, ch); });
          const lines = Math.ceil(r.length / per); let foot = fan && per === 1 ? fy - WVGAP + below : cur + lines * lineH + (lines - 1) * VGAP;
          // a card under two cards of the row: its own line, from the first one's left edge to the last one's right edge
          for (const u of unders) {
            const xa = atX.get(u.under![0]), xb = atX.get(u.under![1]), wb = atW.get(u.under![1]);
            const x0 = xa ?? 0, uw = xa !== undefined && xb !== undefined && wb !== undefined ? xb + wb - xa : lw, uh = hOf(u, uw);
            at.set(u.id, foot + VGAP + above); atX.set(u.id, x0); atW.set(u.id, uw); atH.set(u.id, uh); foot += VGAP + above + uh + sayRoom(m, u.id, uw);
          }
          end = Math.max(end, foot);
        }
        cur = end + VGAP;
      }
      return { at, atX, atW, atH, h: cur - VGAP };
    };
    rowAbove.clear();
    const shared = main.map(({ l }, li) => {
      if (l.row && l.cards.length) return rowPlan(l, li);
      const places = placesOf(m, l.cards);
      if (!places) return null;
      const at = new Map<string, number>(); let cur = 0;
      for (const p of places) {
        const j0 = l.cards.indexOf(p[0][0]); let end = cur;
        for (const r of p) { let yy = cur; r.forEach((c, i) => { yy += gapOf(c, i ? l.cards.indexOf(c) : j0); at.set(c.id, yy); yy += hOf(c, ws[li]); }); end = Math.max(end, yy); }
        cur = end;
      }
      return { at, h: cur } as { at: Map<string, number>; h: number; atX?: Map<string, number>; atW?: Map<string, number>; atH?: Map<string, number> };
    });
    const hs = main.map(({ l }, li) => (shared[li]?.h ?? l.cards.reduce((a, c, j) => a + hOf(c, ws[li]) + gapOf(c, j), 0)) + (l.more.length ? 8 + l.more.length * LINE_H.sub : 0) + (l.cards.length && !l.row ? sayGap(l.cards.at(-1)!) : 0));
    // a band, as wide as the lanes it names: its heading, then its cards (or its rows, "across"), from y; its bottom
    const band = (l: Lane, y: number): number => {
      const a = main.findIndex(({ l: q }) => q.title === l.span![0]), b = main.findIndex(({ l: q }) => q.title === l.span![1]);
      if (a < 0 || b < 0) return y;
      const x0 = lx[Math.min(a, b)], x1 = lx[Math.max(a, b)] + ws[Math.max(a, b)], btop = y, ri = items.length;
      // a heading wider than the band wraps onto lines of its own; one that fits keeps its one line
      if (l.title) { const hl = measure(l.title, "lane") <= x1 - x0 ? [l.title] : wrap(l.title, x1 - x0, "lane", 6); hl.forEach((t, k) => items.push({ k: "text", x: x0, y: y + 12 + k * LINE_H.lane, s: t, f: "lane", ink: "muted", ...(hl.length > 1 ? { tip: l.title } : {}) })); y += 20 + (hl.length - 1) * LINE_H.lane; }
      if (l.across) y = acrossRows(l, x0, x1, y);
      else { for (const c of l.cards) { const h = hOf(c, x1 - x0); drawCard(c, { x: x0, y, w: x1 - x0, h }); y += h + 10; } y -= 10; }
      const before = items.splice(ri); region("band", l, x0, btop, x1 - x0, y - btop); items.push(...before);
      return y;
    };
    const climbs = (l: Lane) => m.steps.some((s) => s.edges.some((e) => l.cards.some((c) => c.id === e.from || c.id === e.to)));
    // "## X above A..B": the bands above come first, from the stage's top; the lanes start under them,
    // with the room a band under them leaves for its connectors
    for (const { l } of spans) if (l.above) { const y = band(l, top); if (y > top) top = y + (climbs(l) ? 28 : 14); }
    bottom = top;
    const H = Math.max(0, ...hs), y0 = top + (main.some(({ l }) => l.title) ? LANE_HEAD : 4) + (!narrow && fanInGroups(m).length ? 28 : 0);
    // a short lane of several cards spreads them over most of the tallest lane (its cards stand level with their neighbours)
    const hs0 = hs.slice(), tgt = (li: number) => (li > 0 ? hs0[li - 1] * SPREAD : 0);
    const spread = main.map(({ l }, li) => (!shared[li] && l.cards.length > 1 && hs0[li] < tgt(li) ? (tgt(li) - hs0[li]) / (l.cards.length - 1) : 0));
    spread.forEach((s, li) => { if (s) hs[li] = tgt(li); });
    let lane0End = 0;
    const span: [number, number][] = []; // where each lane's cards really are: a grown store is centred on its neighbours' cards
    main.forEach(({ l }, li) => {
      region("lane", l, lx[li], top, ws[li], y0 + H - top);
      if (l.title) { items.push({ k: "text", x: lx[li], y: top + 16, s: l.title, f: "lane", ink: "muted" }); nav.deskHeads.push({ x: lx[li], y: top + 3, w: measure(l.title, "lane"), h: 17 }); }
      // centred in the row, or (align: top) from its top, the lane's last card reaching the row's foot
      let yy = y0 + (m.cx.align ? 0 : (H - hs[li]) / 2);
      const sh = shared[li];
      if (sh) { const y1 = yy; l.cards.forEach((c) => { const y = y1 + sh.at.get(c.id)!, h = sh.atH?.get(c.id) ?? hOf(c, ws[li]); drawCard(c, { x: lx[li] + (sh.atX?.get(c.id) ?? 0), y, w: sh.atW?.get(c.id) ?? ws[li], h }); span[li] = [Math.min(span[li]?.[0] ?? y, y), Math.max(span[li]?.[1] ?? y + h, y + h)]; }); yy = y1 + sh.h; }
      else l.cards.forEach((c, j) => { let h = hOf(c, ws[li]) + (m.cx.align && j === l.cards.length - 1 ? H - hs[li] : 0); yy += gapOf(c, j) + (j ? spread[li] : 0); if (lone.has(c.id) && span[li - 1]) { const [s0, s1] = span[li - 1]; if (bigLine(m, c) && s1 - s0 >= h) { yy = s0; h = s1 - s0; } else yy = (s0 + s1) / 2 - h / 2; } /* a grown store sits centred on its neighbours' real cards; one with a big value spans them, top to bottom */ drawCard(c, { x: lx[li], y: yy, w: ws[li], h }); span[li] = [Math.min(span[li]?.[0] ?? yy, yy), yy + h]; yy += h; });
      if (l.cards.length && !l.row) yy += sayGap(l.cards.at(-1)!);
      // "and more" sits at the lane's left under its last card; connectors that climb to that card keep to its right
      // an "and more" line steps aside when a band under its lane comes in (the band takes that room)
      const names = main.map((x) => x.l.title), bandAt = Math.min(Infinity, ...spans.filter(({ l: b }) => !b.above).filter(({ l: b }) => { const a = names.indexOf(b.span![0]), z = names.indexOf(b.span![1]); return a >= 0 && z >= 0 && li >= Math.min(a, z) && li <= Math.max(a, z); }).flatMap(({ l: b }) => b.cards.map((c) => c.from)));
      const mFrom = l.cards[0]?.from ?? 1, mTo = Number.isFinite(bandAt) && bandAt > mFrom ? bandAt - 1 : undefined;
      l.more.forEach((t, j) => items.push({ k: "text", x: lx[li] + 4, y: yy + 8 + (j + 1) * LINE_H.sub - 3, s: `… ${t}`, f: "sub", ink: "muted", from: mFrom, ...(mTo ? { to: mTo } : {}) }));
      if (l.more.length && l.cards.length) moreW.set(l.cards.at(-1)!.id, Math.max(...l.more.map((t) => measure(`… ${t}`, "sub"))) + 4);
      if (li === 0) lane0End = yy + (l.more.length ? 8 + l.more.length * LINE_H.sub : 0);
    });
    bottom = y0 + H;
    // spans: under the lanes they name, as wide as those lanes; room above for the connectors that climb to them
    for (const { l } of spans) {
      if (l.above) continue; // drawn above the lanes
      const a = main.findIndex(({ l: q }) => q.title === l.span![0]), b = main.findIndex(({ l: q }) => q.title === l.span![1]);
      if (a < 0 || b < 0) continue;
      bottom = band(l, bottom + (climbs(l) ? 28 : 14));
    }
    // the first lane's free space at the bottom (no band under it): the key may go there
    const under0 = spans.some(({ l }) => !l.above && [l.span![0], l.span![1]].includes(main[0]?.l.title ?? "\0") || main.findIndex(({ l: q }) => q.title === l.span![0]) === 0);
    const fy = lane0End + 14, fb = under0 ? y0 + H : bottom;
    return { items, bottom, free: main.length > 1 && fb - fy > 30 ? { x: lx[0], y: fy, w: ws[0], h: fb - fy } : undefined };
  }
  // an "across" band: each card line is a row, left to right, centred; the gaps hold the labels of the connectors between
  function acrossRows(l: Lane, x0: number, x1: number, y: number): number {
    const rows: Card[][] = [];
    l.cards.forEach((c, i) => { if (!rows.length || l.breaks?.includes(i)) rows.push([]); rows.at(-1)!.push(c); }); // one row, and a new one at each "next row"
    const ids = new Set(l.cards.map((c) => c.id)), es = m.steps.flatMap((s) => s.edges).filter((e) => ids.has(e.from) && ids.has(e.to));
    const gap = Math.max(40, ...es.filter((e) => e.label).map((e) => measure(e.label, "chip") + 60)); // the label and some line on each side of it
    const per = Math.max(...rows.map((r) => r.length)), cw = Math.max(60, (x1 - x0 - (per - 1) * gap) / per);
    rows.forEach((row, ri) => {
      if (ri) y += es.length ? 60 : 12;
      const tw = row.length * cw + (row.length - 1) * gap, sx = x0 + (x1 - x0 - tw) / 2, h = Math.max(...row.map((c) => hOf(c, cw)));
      row.forEach((c, q) => drawCard(c, { x: sx + q * (cw + gap), y, w: cw, h }));
      y += h;
    });
    return y;
  }
  // narrow: lanes one under another; cards side by side when two fit; spans after the lanes; the gaps between lanes
  // hold the connectors and their labels
  // a channel at the right holds the connectors that pass other cards; each lane's gap below it holds labels
  const anyEdge = m.steps.some((s) => s.edges.length);
  const iw = w - 2 * NPAD - (anyEdge && !noChannel ? CHAN : 0);
  nav.chanX = NPAD + iw + 6; nav.gapY.clear(); nav.order.clear(); nav.heads.length = 0; nav.sideY.clear();
  // cards side by side in one row that a connector joins: a gap for its arrow, and a strip under the row for its labels
  const sideOf = (ids: string[]) => { const set = new Set(ids), es = m.steps.flatMap((s) => s.edges).filter((e) => set.has(topCard(m, e.from)) && set.has(topCard(m, e.to)) && topCard(m, e.from) !== topCard(m, e.to)); return { gap: es.length ? 24 : 8, strip: es.some((e) => e.label) ? 26 : 0 }; };
  const strip = (ids: string[], at: number) => { for (const id of ids) nav.sideY.set(id, at); };
  let y = top;
  const all = [...spans.filter((x) => x.l.above), ...main, ...spans.filter((x) => !x.l.above)]; // a band above is the first row
  // a run of lanes of one card each (no "and more", not a band) sits side by side, as many a row as fit;
  // every other lane is one row of its own. A row is one stacked lane for the connectors' gaps and labels.
  const one = (x: { l: Lane }) => !x.l.span && x.l.cards.length === 1 && !x.l.more.length;
  const least = (c: Card) => Math.max(140, Math.min(cardMin(m)(c), 150));
  const groups: { l: Lane; i: number }[][] = [];
  for (const x of all) { const g = groups.at(-1); if (g && one(x) && one(g[0])) g.push(x); else groups.push([x]); }
  const rows: { l: Lane; i: number }[][] = [];
  for (const g of groups) {
    if (g.length === 1 || !one(g[0])) { rows.push(g); continue; }
    let k = 0;
    while (k < g.length) {
      let n = 1, wsum = least(g[k].l.cards[0]);
      while (k + n < g.length && wsum + 8 + least(g[k + n].l.cards[0]) <= iw) { wsum += 8 + least(g[k + n].l.cards[0]); n++; }
      rows.push(g.slice(k, k + n)); k += n;
    }
  }
  rows.forEach((row, ri) => row.forEach((x) => nav.order.set(x.i, ri)));
  // a lane's heading shares the gap above it with that gap's connector labels when they fit beside it
  // (the first lane's, the strip its tags reserve); the cards a row are the count that makes the lane least tall
  // with every word whole; "and more" goes in the last row's free cells when it fits there
  // the widest one step's labels: each step draws only its own (a sum over all steps reserved rows no step needs; hero phone +48 px)
  const gapLabels = (gi: number) => { const seen = new Set<string>(); let most = 0; for (const s of m.steps) { let lw = 0; for (const e of s.edges) { if (!e.label) continue; const a = nav.order.get(m.cards.get(e.from)!.lane) ?? 0, b = nav.order.get(m.cards.get(e.to)!.lane) ?? 0; const k = phoneLabelKey(m, e); if (seen.has(k)) continue; seen.add(k); if (Math.min(a, b) !== gi) continue; lw += measure(e.label, "chip") + 24; } /* one label per line and sender: in the gap of its first connector */ most = Math.max(most, lw); } return most; };
  // the widest one label of a gap: a heading stays in its gap when it fits beside that one, and further labels take more
  // label rows (each 22 px, less than a heading's own 26 px row; the hero's three POST labels beside "Packers")
  const gapWidest = (gi: number) => { let most = 0; for (const s of m.steps) for (const e of s.edges) { if (!e.label) continue; const a = nav.order.get(m.cards.get(e.from)!.lane) ?? 0, b = nav.order.get(m.cards.get(e.to)!.lane) ?? 0; if (Math.min(a, b) === gi) most = Math.max(most, measure(e.label, "chip") + 24); } return most; };
  const headInGap = (ri: number) => ri > 0 && rows[ri].length === 1 && !!rows[ri][0].l.title && headingRect(rows[ri][0].l.title, NPAD, 0).w + Math.min(gapLabels(ri - 1), gapWidest(ri - 1)) <= w - 2 * NPAD;
  const gapRowW = (gi: number) => gapLabels(gi) + (gapLabels(gi) && headInGap(gi + 1) ? headingRect(rows[gi + 1][0].l.title, NPAD, 0).w : 0);
  const whole = (c: Card, cw: number) => (c.kids.length || c.pills.length || c.tokens.length || c.keys.length || c.state) ? cw >= cardMin(m)(c) : wholeAt(cDraw(m, c, { x: 0, y: 0, w: cw, h: hOf(c, cw) }, tagged, said, new Map(), slots), [{ s: c.title, f: "title" }, ...c.subs.map((s) => ({ s, f: "sub" as const })), ...c.badges.map((b) => ({ s: b.s, f: "sub" as const }))], cw - 2 * CARD_PAD());
  const recs: { at: number; top: number; heads: number; end: number; next: number }[] = [];
  rows.forEach((row, ri) => {
    const ltop = y, at = items.length;
    recs[ri] = { at, top: y, heads: nav.heads.length, end: 0, next: 0 };
    if (row.length > 1) {
      // side by side: a gap wide enough for an arrow when a connector joins two of them
      const sd = sideOf(row.map((x) => x.l.cards[0].id)), gap = sd.gap, cw = (iw - (row.length - 1) * gap) / row.length;
      const titled = row.some((x) => x.l.title), extraTop = row.some((x) => tagged.has(x.l.cards[0].id)) ? PHONE.tagTop : 0;
      if (titled) y += 24;
      y += extraTop;
      const h = Math.max(...row.map((x) => hOf(x.l.cards[0], cw)));
      row.forEach((x, q) => {
        const cx = NPAD + q * (cw + gap);
        if (x.l.title) { const t = wrap(x.l.title, cw, "lane", 1)[0]; items.push({ k: "text", x: cx, y: ltop + 16, s: t, f: "lane", ink: "muted", tip: t === x.l.title ? undefined : x.l.title }); }
        drawCard(x.l.cards[0], { x: cx, y, w: cw, h });
      });
      { const said = row.map((x) => x.l.cards[0].id).filter((id) => sayRoom(m, id, cw) > 0); if (said.length === 1) nav.sayW.set(said[0], iw); } // a row's lone say wraps to the row's width
      y += h + 6 + Math.max(0, ...row.map((x) => sayRoom(m, x.l.cards[0].id, nav.sayW.get(x.l.cards[0].id) ?? cw))); // 6 px to the lanes' edge, as a lane's last row
      if (sd.strip) { strip(row.map((x) => x.l.cards[0].id), y - 6); y += sd.strip; }
      const before = items.splice(at);
      row.forEach((x, q) => region("lane", x.l, NPAD + q * (cw + gap), ltop, cw, y - ltop));
      items.push(...before);
    } else {
      const l0 = row[0].l, lg = sideOf(l0.cards.map((c) => c.id)).gap; // wider when a connector joins cards of this lane
      // a row's label strip (a connector beside in the row, or a labelled one down to a later card of the lane)
      const stripOf = (cards: Card[], a: number, b: number) => { const cr = cards.slice(a, b), sd = cr.length > 1 ? sideOf(cr.map((c) => c.id)) : { strip: 0 }, here = new Set(cr.map((c) => c.id)), later = new Set(cards.slice(b).map((c) => c.id));
        const down = m.steps.some((s) => s.edges.some((e) => e.label && ((here.has(topCard(m, e.from)) && later.has(topCard(m, e.to))) || (later.has(topCard(m, e.from)) && here.has(topCard(m, e.to))))));
        return sd.strip || down ? 26 : 0; };
      const choose = (cards: Card[]) => {
        const per0 = Math.max(1, Math.min(cards.length, Math.floor((iw + 8) / (Math.max(140, ...cards.map((c) => Math.min(cardMin(m)(c), 150))) + 8)))); // long words break at -. / _:
        const rowExtra = (a: number, b: number, cw: number) => (cards.slice(a, b).some((c) => tagged.has(c.id)) ? PHONE.tagTop : 0) + Math.max(0, ...cards.slice(a, b).map((c) => sayRoom(m, c.id, cw))) + stripOf(cards, a, b);
        return phonePer(cards.length, iw, (q, cw) => hOf(cards[q], cw), (q, cw) => whole(cards[q], cw), rowExtra, per0, lg);
      };
      // the second lines every card of the lane shares (one card line, the same lines on every step): once for the lane
      const shared = sharedLines(m, l0.cards), sharedTxt = shared ? shared.flatMap((t) => wrap(t, iw, "sub", 4)) : [];
      let pick = choose(l0.cards), l = l0;
      if (shared) { const folded = l0.cards.map((c) => ({ ...c, subs: [] })), b = choose(folded); if (b.h + sharedTxt.length * LINE_H.sub + 4 < pick.h) { pick = b; l = { ...l0, cards: folded }; } }
      const fold = l !== l0, sharedFrom = Math.min(...l0.cards.map((c) => c.from));
      const per = pick.per;
      let cw = (iw - (per - 1) * lg) / per, x0 = NPAD;
      let inlineAt: [number, number] | null = null; // where the shared line sits after the heading, on its baseline
      // a lane of one card: its heading at the card's left when the card stays whole there and that is shorter than a
      // heading row
      const c1 = l.cards.length === 1 && !fold && !l.more.length && l.title && !(ri === 0 && tagged.has(l.cards[0].id)) && !headInGap(ri) ? l.cards[0] : undefined;
      const bw = c1 ? headingRect(l.title, 0, 0).w + 6 : 0, beside = !!c1 && iw - bw >= PHONE.cardMinW && whole(c1, iw - bw) && hOf(c1, iw - bw) + sayRoom(m, c1.id, iw - bw) < hOf(c1, iw) + sayRoom(m, c1.id, iw) + 26;
      if (l.title) {
        const r0 = l.cards.slice(0, per), tags0 = r0.filter((c) => tagged.has(c.id));
        // the first lane: in the strip its first row's tags reserve, left of every tag
        const tagLeft = Math.min(...tags0.map((c) => { const q = r0.indexOf(c), rx = NPAD + q * (cw + lg), cwid = Math.max(...m.steps.flatMap((s) => s.tags.filter(([ids]) => ids.includes(c.id)).map(([, t]) => measure(t, "chip") + 18))); return Math.min(rx + cw - cwid / 2 + 6, w - NPAD - cwid / 2) - cwid / 2; }));
        const hw = headingRect(l.title, NPAD, 0).w, sw = fold && sharedTxt.length === 1 ? measure(sharedTxt[0], "sub") + 6 : 1e9;
        if (headInGap(ri)) { const gy = nav.gapY.get(ri - 1)!; items.push({ k: "text", x: NPAD, y: gy + 14, s: l.title, f: "lane", ink: "muted" }); const room = w - 2 * NPAD - gapLabels(ri - 1); if (hw + sw <= room) { inlineAt = [NPAD + hw, gy + 14]; nav.heads.push(headingRect(l.title, NPAD - 3, gy), { x: NPAD + hw - 3, y: gy, w: sw, h: 20 }); } else nav.heads.push(headingRect(l.title, NPAD - 3, gy)); }
        else if (ri === 0 && tags0.length && hw + NPAD <= tagLeft && (!fold || hw + sw + NPAD <= tagLeft)) { items.push({ k: "text", x: NPAD, y: y + 14, s: l.title, f: "lane", ink: "muted" }); if (hw + sw + NPAD <= tagLeft) inlineAt = [NPAD + hw, y + 14]; y += 8; }
        else if (beside) { items.push({ k: "text", x: NPAD, y: y + 16, s: l.title, f: "lane", ink: "muted" }); x0 = NPAD + bw; cw = iw - bw; }
        else {
          // a heading wider than the phone wraps onto lines of its own
          const hl = hw <= iw ? [l.title] : wrap(l.title, iw, "lane", 6);
          // each line carries the whole heading (tip), so "hide/show ## Title" shows it in the heading's steps only
          hl.forEach((t, k) => items.push({ k: "text", x: NPAD, y: y + 14 + k * LINE_H.lane, s: t, f: "lane", ink: "muted", ...(hl.length > 1 ? { tip: l.title } : {}) }));
          if (hl.length === 1 && hw + sw <= iw) inlineAt = [NPAD + hw, y + 14]; y += 26 + (hl.length - 1) * LINE_H.lane;
        }
      }
      if (fold) {
        if (inlineAt) items.push({ k: "text", x: inlineAt[0], y: inlineAt[1], s: sharedTxt[0], f: "sub", ink: "muted", from: sharedFrom });
        else for (const t of sharedTxt) { items.push({ k: "text", x: NPAD, y: y + LINE_H.sub - 3, s: t, f: "sub", ink: "muted", from: sharedFrom }); y += LINE_H.sub; }
        if (!inlineAt) y += 4;
      }
      let moreDone = false;
      // runs of cards never on screen together share one place here too (each run from the place's top)
      const places = fold ? null : placesOf(m, l.cards), chunks = places ?? [[l.cards]];
      for (const place of chunks) { const top0 = y; let end = y; for (const run of place) { y = top0; const last = run === chunks.at(-1)!.at(-1);
      // the rows: per cards each, in the source's order (it is meaning: a chain reads left to right; top down)
      const rs = run, cuts: [number, number][] = [];
      for (let j = 0; j < rs.length; j += per) cuts.push([j, Math.min(j + per, rs.length)]);
      for (const [j, je] of cuts) {
        const row = rs.slice(j, je), extraTop = row.some((c) => tagged.has(c.id)) ? PHONE.tagTop : 0;
        y += extraTop;
        const h = Math.max(...row.map((c) => hOf(c, cw)));
        row.forEach((c, q) => drawCard(c, { x: x0 + q * (cw + lg), y, w: cw, h }));
        if (last && je >= rs.length && row.length < per) {
          const fx = NPAD + row.length * (cw + lg), mi = moreInFreeCell(l.more, fx, y, NPAD + iw - fx, h);
          if (mi) { items.push(...mi.map((it) => ({ ...it, ...moreSteps(m, l) }))); moreDone = true; }
        }
        { const said = row.map((c) => c.id).filter((id) => sayRoom(m, id, cw) > 0); if (said.length === 1) nav.sayW.set(said[0], iw); }
        // the lane's last row keeps 6 px to the lane's edge (10 between rows, and before an "and more" line):, hero
        const lastRow = last && je >= rs.length && (moreDone || !l.more.length) && !stripOf(rs, j, je);
        y += h + (lastRow ? 6 : PHONE.rowGap) + Math.max(0, ...row.map((c) => sayRoom(m, c.id, nav.sayW.get(c.id) ?? cw)));
        if (stripOf(rs, j, je)) { strip(row.map((c) => c.id), y - 6); y += 26; }
      }
      end = Math.max(end, y); } y = end; }
      y += bandRoom?.get(ri)?.[0] ?? 0; // room for level stretches between the cards and the caption
      // an "and more" line: 14 a line, its words 9 px under the cards (was 20 a line)
      // when lines cross the gap under the lane, its one "and more" line joins the heading's
      // line where it fits after the words there; its own line stays, empty, as room for the lines' level stretches
      const crossed = m.steps.some((st) => st.edges.some((e) => { const a = nav.order.get(m.cards.get(e.from)!.lane) ?? -1, b = nav.order.get(m.cards.get(e.to)!.lane) ?? -1; return Math.min(a, b) <= ri && Math.max(a, b) > ri; }));
      const headIt = items.slice(at).find((it): it is Extract<Item, { k: "text" }> => it.k === "text" && it.f === "lane" && (it.s === l.title || it.tip === l.title));
      const lineEnd = headIt ? Math.max(...items.slice(at).filter((it): it is Extract<Item, { k: "text" }> => it.k === "text" && Math.abs(it.y - headIt.y) < 0.5).map((it) => (it.anchor === "middle" ? it.x + measure(it.s, it.f) / 2 : it.anchor === "end" ? it.x : it.x + measure(it.s, it.f)))) : Infinity;
      if (!moreDone && crossed && headIt && l.more.length === 1 && lineEnd + 12 + measure(l.more[0], "sub") <= NPAD + iw) { items.push({ k: "text", x: lineEnd + 12, y: headIt.y, s: l.more[0], f: "sub", ink: "muted", ...moreSteps(m, l) }); y += LINE_H.sub - 2; }
      else if (!moreDone) l.more.forEach((t) => { items.push({ k: "text", x: NPAD + iw / 2, y: y + 9, s: t, f: "sub", ink: "muted", anchor: "middle", ...moreSteps(m, l) }); y += LINE_H.sub - 2; });
      { const before = items.splice(at); region(l.span ? "band" : "lane", l, NPAD, ltop, iw, y - ltop); items.push(...before); }
    }
    // the gap's row (labels, a heading) sits above the runs into the next lane's cards: its words end 9 px over them
    // labels that do not fit one row of the gap take more rows (22 px each), the first row highest
    if (ri < rows.length - 1) { const more = gapLabels(ri) ? Math.max(0, Math.ceil(gapRowW(ri) / (w - 2 * NPAD)) - 1) * 22 : 0; // a heading in the gap that a line from (or to) a card inside a card crosses into the next row keeps 8 px under its words, so the
      // line's run under them leaves room for its arrowhead (was 4: the head hid in the card's corner)
      const into = !gapLabels(ri) && headInGap(ri + 1) && m.steps.some((st) => st.edges.some((e) => { const a = nav.order.get(m.cards.get(e.from)!.lane) ?? -1, b = nav.order.get(m.cards.get(e.to)!.lane) ?? -1; return (e.fromPill?.startsWith("card:") || e.toPill?.startsWith("card:") || topCard(m, e.from) !== e.from || topCard(m, e.to) !== e.to) && Math.min(a, b) <= ri && Math.max(a, b) === ri + 1; })) ? 4 : 0;
      const g = (gapLabels(ri) ? PHONE.laneGap : headInGap(ri + 1) ? PHONE.laneGapHead : PHONE.laneGapPlain) + more + into; nav.gapY.set(ri, gapLabels(ri) || headInGap(ri + 1) ? y + g - 25 - more - into : y + g / 2 - 6); y += g; }
    if (ri < rows.length - 1) y += bandRoom?.get(ri)?.[1] ?? 0; // and under the gap's heading row
    recs[ri].end = items.length; recs[ri].next = y;
  });
  // stacked rows whose cards are never on screen together share one place, as
  // tall as the tallest; each row keeps its own items, shown in its own steps (its heading and region too), and the rows
  // after move up by the room saved. Rows that are on screen together stack as before.
  {
    const vis = rows.map((row) => new Set(row.flatMap((x) => x.l.cards.flatMap((c) => visOf(m, c)))));
    const place: number[][] = [];
    rows.forEach((_, ri) => { const p = place.at(-1); if (p && vis[ri].size && p.every((q) => vis[q].size && ![...vis[ri]].some((k) => vis[q].has(k)))) p.push(ri); else place.push([ri]); });
    if (place.some((p) => p.length > 1)) {
      let cur = recs[0].top;
      for (const p of place) {
        let end = cur;
        for (const ri of p) {
          const r = recs[ri], dy = cur - r.top, ids = new Set(rows[ri].flatMap((x) => x.l.cards.map((c) => c.id))), steps = [...vis[ri]].sort((a, b) => a - b);
          const own = (it: Item) => (p.length > 1 && it.on === undefined && it.to === undefined ? { ...it, on: steps } as Item : it);
          if (dy || p.length > 1) items.splice(r.at, r.end - r.at, ...shift(items.slice(r.at, r.end), 0, dy).map(own));
          if (dy) {
            for (const id of ids) { const q = rects.get(id); if (q) rects.set(id, { ...q, y: q.y + dy }); const c = m.cards.get(id)!; for (const k of c.kids) { const qi = inner.get(k); if (qi) inner.set(k, { ...qi, y: qi.y + dy }); } if (nav.sideY.has(id)) nav.sideY.set(id, nav.sideY.get(id)! + dy); }
            if (nav.gapY.has(ri)) nav.gapY.set(ri, nav.gapY.get(ri)! + dy);
            for (let h = r.heads; h < (recs[ri + 1]?.heads ?? nav.heads.length); h++) nav.heads[h] = { ...nav.heads[h], y: nav.heads[h].y + dy };
          }
          end = Math.max(end, cur + (r.next - r.top));
        }
        cur = end;
      }
      y = cur;
    }
  }
  nav.laneRects = []; // lane heading boxes
  nav.laneTexts = items.filter((it): it is Item & { k: "text" } => it.k === "text" && it.f === "lane");
  nav.texts = items.flatMap((it) => {
    if (it.k !== "text" || it.f === "chip") return [];
    const tw = measure(it.s, it.f), x0 = it.anchor === "middle" ? it.x - tw / 2 : it.anchor === "end" ? it.x - tw : it.x;
    // the steps its words show in (a lane heading: its "hide/show ## Title" steps), for the gap router
    const li = it.f === "lane" ? m.lanes.findIndex((l) => l.title === it.s || l.title === (it as { tip?: string }).tip) : -1, n = m.steps.length || 1;
    const on = li >= 0 && m.headOn?.has(li) ? m.headOn.get(li)! : it.on ?? (it.from || it.to ? Array.from({ length: n }, (_, k) => k + 1).filter((k) => k >= (it.from ?? 1) && (!it.to || k <= it.to)) : undefined);
    const r: Rect & { on?: number[] } = { x: x0 - 2, y: it.y - 12, w: tw + 4, h: 16, ...(on ? { on } : {}) };
    if ([...rects.values()].some((c) => r.x >= c.x && r.x + r.w <= c.x + c.w && r.y >= c.y && r.y + r.h <= c.y + c.h)) return [];
    if (it.f === "lane") nav.laneRects.push(r);
    return [r];
  });
  return { items, bottom: y };
}

// ---------------------------------------------------------------- connectors (after layout)
const NPAD = 8, CHAN = 22;
/** the second lines all the cards of a lane share, when they come from one card line of two or more ids,
 * the same lines on every step, and nothing else of theirs is drawn under them (a phone draws them once for the lane) */
function sharedLines(m: Model, cards: Card[]): string[] | null {
  if (cards.length < 2 || !cards[0].subs.length) return null;
  const c0 = cards[0], key = JSON.stringify(c0.subs), ids = new Set(cards.map((c) => c.id));
  if (cards.some((c) => c.line !== c0.line || JSON.stringify(c.subs) !== key)) return null;
  if (m.cx.steps.some((st) => st.text.some(([id]) => ids.has(id)))) return null;
  // said once for the lane, it says so: "each: …"
  return [`each: ${c0.subs[0]}`, ...c0.subs.slice(1)];
}
/** the steps a card is on screen in */
function visOf(m: Model, c: Card): number[] { return m.shownOn?.get(c.id) ?? Array.from({ length: Math.max(0, m.steps.length - c.from + 1) }, (_, i) => c.from + i); }
/** a lane's cards as places of groups: a run is cards with the same shown steps; a run never on screen with the
 * groups of the place before it shares that place. null when every place holds one group (the lane stacks as before) */
function placesOf(m: Model, cards: Card[]): Card[][][] | null {
  const runs: { key: string; vis: Set<number>; cards: Card[] }[] = [];
  for (const c of cards) { const v = visOf(m, c), key = v.join(","), r = runs.at(-1); if (r && r.key === key) r.cards.push(c); else runs.push({ key, vis: new Set(v), cards: [c] }); }
  // a place holds groups never on screen together, each from the place's top; a run that meets the place's last group
  // (a card shown from a later step, as a scene's second and third Ticket) stacks under it in that group, when it never
  // meets the place's other groups; the place is as tall as its tallest group
  const places: (typeof runs)[] = [], meets = (a: Set<number>, b: Set<number>) => !a.size || !b.size || [...a].some((k) => b.has(k));
  for (const r of runs) {
    const p = places.at(-1), last = p?.at(-1);
    if (p && !p.some((o) => meets(r.vis, o.vis))) p.push({ ...r, cards: [...r.cards], vis: new Set(r.vis) });
    else if (p && last && p.length > 1 && p.slice(0, -1).every((o) => !meets(r.vis, o.vis))) { last.cards.push(...r.cards); for (const k of r.vis) last.vis.add(k); }
    else places.push([{ ...r, cards: [...r.cards], vis: new Set(r.vis) }]);
  }
  return places.every((p) => p.length === 1) ? null : places.map((p) => p.map((r) => r.cards));
}
/** what the narrow lanes leave for the connectors: the channel's x, each stacked lane's gap below it, lane order */
const moreW = new Map<string, number>();
/** extra room per lane gap (row index) for lines that would otherwise fall back to the right edge:
 * [over the upper lane's caption, under the gap's heading row]. fellGaps: per gap, how many lines between its two rows
 * the last narrow pass sent to the edge (a line across more rows than two: no gap's room is its way, so not counted). */
let bandRoom: Map<number, [number, number]> | null = null;
const BAND_ROOM_MAX = 24, BAND_GAP_MAX = 12, BAND_GAPS = 3;
const fellGaps = new Map<number, number>();
const nav = { deskHeads: [] as Rect[], chanX: 0, gapY: new Map<number, number>(), order: new Map<number, number>(), heads: [] as Rect[], texts: [] as (Rect & { on?: number[] })[], laneTexts: [] as (Item & { k: "text" })[], laneRects: [] as Rect[], sideY: new Map<string, number>(), sayW: new Map<string, number>() };
/** narrow: down (or up) out of the card, across the gap under its row to the channel, along it, into the target */
/** the phone's lines that run straight through a lane heading: their headings go over them, with a halo */
const thruPaths = new WeakSet<Item>();
function narrowConnectors(m: Model, rects: Map<string, Rect & { lane: number }>, w: number): Item[] {
  const items: Item[] = [], n = m.steps.length, es = m.steps.flatMap((s) => s.edges);
  fellGaps.clear();
  const ends = new Map<string, number>(); // spread the ends on one side of a card
  const slotOf = (key: string) => { const k = ends.get(key) ?? 0; ends.set(key, k + 1); return k; };
  let live = rects;
  const drawnOnce = new Map<string, { pts: [number, number][]; curve: "v" | "round" | "h"; step:number }>();
  const pathKey=(e:Edge)=>`${e.from}>${e.to}|${e.fromPill??""}|${e.toPill??""}|${e.copy??0}`;
  const again=(e:Edge)=>{const p=drawnOnce.get(pathKey(e));return p&&p.step!==e.step?p:undefined;};
  // before the right-edge channel, a route through the gaps: from the source's edge a
  // short way into the gap band, level to a point over (or under) the target, into it; or, with a card in the way, up
  // (or down) a gap between card columns to the band by the target, level, into it. Every stretch keeps clear of cards,
  // of a lane's words (captions, headings) and of the stretches of lines shown in the same steps.
  const occ: { a: [number, number]; b: [number, number]; on: number[] }[] = [];
  // the label rows of the gaps (labels go there after the lines): no level stretch runs along one
  const labelRows = [...new Set(es.filter((e) => e.label).map((e) => Math.min(nav.order.get(m.cards.get(e.from)!.lane) ?? -1, nav.order.get(m.cards.get(e.to)!.lane) ?? -1)))].flatMap((gi) => { const gy = nav.gapY.get(gi); return gy === undefined ? [] : [[gy - 4, gy + 24] as [number, number]]; });
  const sharesStep = (a: number[], b: number[]) => a.some((k) => b.includes(k));
  const hitsCard = (xa: number, ya: number, xb: number, yb: number, skip: string[], pad: number) => [...live].some(([id, r]) => !skip.includes(id) && Math.max(xa, xb) > r.x - pad && Math.min(xa, xb) < r.x + r.w + pad && Math.max(ya, yb) > r.y - pad && Math.min(ya, yb) < r.y + r.h + pad);
  const shownWith = (r: Rect & { on?: number[] }, on?: number[]) => !on || !r.on || r.on.some((k) => on.includes(k));
  const hitsText = (xa: number, ya: number, xb: number, yb: number, pad: number, on?: number[]) => nav.texts.some((r) => shownWith(r, on) && Math.max(xa, xb) > r.x - pad && Math.min(xa, xb) < r.x + r.w + pad && Math.max(ya, yb) > r.y - pad && Math.min(ya, yb) < r.y + r.h + pad);
  const hitsOcc = (xa: number, ya: number, xb: number, yb: number, on: number[]) => occ.some((q) => sharesStep(q.on, on) && (Math.abs(ya - yb) < 0.5
    ? Math.abs(q.a[1] - q.b[1]) < 0.5 && Math.abs(q.a[1] - ya) < 4 && Math.min(Math.max(xa, xb), Math.max(q.a[0], q.b[0])) - Math.max(Math.min(xa, xb), Math.min(q.a[0], q.b[0])) > -2
    : Math.abs(q.a[0] - q.b[0]) < 0.5 && Math.abs(q.a[0] - xa) < 4 && Math.min(Math.max(ya, yb), Math.max(q.a[1], q.b[1])) - Math.max(Math.min(ya, yb), Math.min(q.a[1], q.b[1])) > -2));
  const segOk = (a: [number, number], b: [number, number], skip: string[], on: number[], first: boolean) => {
    // the first stretch leaves its own card: it may touch only that card; level legs keep 4 px from cards, 3 px from words
    const level = Math.abs(a[1] - b[1]) < 0.5;
    if (level && labelRows.some(([y0, y1]) => a[1] > y0 && a[1] < y1)) return false;
    if (hitsCard(a[0], a[1], b[0], b[1], first ? skip : skip.slice(1), level ? 4 : 2)) return false; // skip: [source, target]
    if (hitsText(a[0], a[1], b[0], b[1], level ? 6 : 1, on)) return false; // never through (or close along) a lane's words
    return !hitsOcc(a[0], a[1], b[0], b[1], on);
  };
  const gapRoute = (e: Edge, f: Rect, t: Rect, fx: number, fy: number, ty: number, down: boolean, on: number[]): [number, number][] | null => {
    const dir = down ? 1 : -1, skip = [e.from, e.to], span = Math.abs(ty - fy);
    if (span < 20) return null;
    const lens = (ps: [number, number][]) => ps.slice(1).reduce((a, p, k) => a + Math.abs(p[0] - ps[k][0]) + Math.abs(p[1] - ps[k][1]), 0);
    const ok = (ps: [number, number][]) => ps.slice(1).every((p, k) => segOk(ps[k], p, skip, on, k === 0)) && Math.abs(ps.at(-1)![1] - ps.at(-2)![1]) >= 8;
    // into the target where it overlaps the source, else along it; a jog under 6 px is no jog (straight instead)
    const entries: number[] = []; for (let x = t.x + 12; x <= t.x + t.w - 12; x += 4) if (Math.abs(x - fx) >= 6) entries.push(x);
    const levels = (from: number, toward: number) => { const out: number[] = []; for (let d = 4; d < Math.abs(toward - from) - 8; d += 2) out.push(from + Math.sign(toward - from) * d); return out; };
    let best: [number, number][] | null = null, bl = Infinity;
    const take = (ps: [number, number][]) => { const l = lens(ps); if (l < bl && ok(ps)) { best = ps; bl = l; } };
    // straight, where the source's port is over the target (passing behind words, never a card)
    if (fx >= t.x + 8 && fx <= t.x + t.w - 8 && !hitsCard(fx, fy, fx, ty, skip, 2) && !hitsText(fx, fy, fx, ty, 1) && !hitsOcc(fx, fy, fx, ty, on)) return [[fx, fy], [fx, ty]];
    // else the shortest way with the fewest turns (a Z through the band, or up a gap between card columns, or more)
    // a way that wraps round a lane heading (a level stretch over its words and another
    // under them) reads worse than the side channel
    const g0 = gridRoute(e, t, fx, fy, ty, down, on, ok);
    // an inner upright that runs within 4 px of a card it passes, alone in a gap of 16 px or
    // more, moves to the middle of that gap (it read as leaving that card)
    const g = g0 && g0.map((p) => [...p] as [number, number]);
    if (g) for (let k = 1; k + 2 < g.length; k++) {
      const [ax, ay] = g[k], [bx, by] = g[k + 1]; if (Math.abs(ax - bx) > 0.5) continue;
      const ya = Math.min(ay, by), yb = Math.max(ay, by), side = [...live.values()].filter((r) => r.y < yb && r.y + r.h > ya);
      const lft = Math.max(-Infinity, ...side.filter((r) => r.x + r.w <= ax + 0.5).map((r) => r.x + r.w)), rgt = Math.min(Infinity, ...side.filter((r) => r.x >= ax - 0.5).map((r) => r.x));
      if (!Number.isFinite(lft) || !Number.isFinite(rgt) || rgt - lft < 16 || Math.min(ax - lft, rgt - ax) >= 4) continue;
      if (occ.some((q) => sharesStep(q.on, on) && Math.abs(q.a[0] - q.b[0]) < 0.5 && q.a[0] > lft && q.a[0] < rgt && Math.max(q.a[1], q.b[1]) > ya && Math.min(q.a[1], q.b[1]) < yb)) continue;
      const mx = Math.round((lft + rgt) / 2), tryP = g.map((p, j) => (j === k || j === k + 1 ? [mx, p[1]] : [...p]) as [number, number]);
      if (ok(tryP)) { g[k][0] = mx; g[k + 1][0] = mx; }
    }
    // a Z (down, across, down) from one row of a "layout: row" lane to the next runs 10 px over the target, under the
    // labels of the row's own lines, not along the source's edge through them (an "across" band keeps its way)
    const cf0 = m.cards.get(e.from), ct0 = m.cards.get(e.to), rowWrap = !!cf0 && !!ct0 && cf0.lane === ct0.lane && !!m.lanes[ct0.lane]?.row && !m.lanes[ct0.lane]?.across && Math.abs(f.y - t.y) > 1;
    if (g && rowWrap && g.length === 4 && Math.abs(g[0][0] - g[1][0]) < 0.5 && Math.abs(g[1][1] - g[2][1]) < 0.5) {
      const ym = Math.round(g[3][1] - (down ? 10 : -10)), tryP = g.map((p, j) => (j === 1 || j === 2 ? [p[0], ym] : [...p]) as [number, number]);
      if (Math.abs(ym - g[1][1]) > 2 && ok(tryP)) { g[1][1] = ym; g[2][1] = ym; }
    }
    const levelsAt = (r: Rect, below: boolean) => !!g && g.slice(1).some((p, k) => Math.abs(p[1] - g[k][1]) < 0.5 && (below ? p[1] > r.y + r.h : p[1] < r.y) && Math.max(p[0], g[k][0]) > r.x && Math.min(p[0], g[k][0]) < r.x + r.w);
    // a way of four turns or more that crosses another line of its steps loses to the side
    // channel (ledger -> pickers up a gap across packers -> store read as feeding the store)
    const crosses = !!g && g.slice(1).some((p, k) => { const o = g[k], hz = Math.abs(o[1] - p[1]) < 0.5; return occ.some((q) => { if (!sharesStep(q.on, on)) return false; const qh = Math.abs(q.a[1] - q.b[1]) < 0.5, qv = Math.abs(q.a[0] - q.b[0]) < 0.5; if (hz && qv) return q.a[0] > Math.min(o[0], p[0]) + 0.5 && q.a[0] < Math.max(o[0], p[0]) - 0.5 && o[1] > Math.min(q.a[1], q.b[1]) + 0.5 && o[1] < Math.max(q.a[1], q.b[1]) - 0.5; if (!hz && qh) return o[0] > Math.min(q.a[0], q.b[0]) + 0.5 && o[0] < Math.max(q.a[0], q.b[0]) - 0.5 && q.a[1] > Math.min(o[1], p[1]) + 0.5 && q.a[1] < Math.max(o[1], p[1]) - 0.5; return false; }); });
    if (g && g.length >= 6 && crosses) return null;
    return g && nav.laneRects.some((r) => levelsAt(r, false) && levelsAt(r, true)) ? null : g;
  };
  // the last try before the channel: the shortest way with the fewest turns on a 2 px grid between the two cards' rows,
  // within the cards' span (never out in the channel), by the same rules
  // inner: the source is a card inside a box (its id); the box is then no obstacle, that card is the line's source
  const MOVES = [[1, 0, 0], [-1, 0, 0], [0, 1, 1], [0, -1, 1]] as const;
  const gridRoute = (e: Edge, t: Rect, fx: number, fy: number, ty: number, down: boolean, on: number[], ok: (ps: [number, number][]) => boolean, inner?: { id: string; r: Rect; others: Rect[] }): [number, number][] | null => {
    const dir = down ? 1 : -1, cards = [...live].filter(([id]) => id !== e.from && id !== e.to && id !== inner?.id).map(([, r]): Rect => r).concat(inner?.others ?? []), ends2 = [inner ? inner.r : live.get(e.from)!, live.get(e.to)!];
    const xr = Math.max(...[...live.values()].map((r) => r.x + r.w)), xl = Math.min(...[...live.values()].map((r) => r.x));
    // on whole even px (the port moves under 1 px onto it), so a gap of 8 px holds two lines 4 px apart
    const x0 = 2 * Math.ceil(xl / 2), nx = Math.floor((xr - x0) / 2) + 1, y0 = Math.min(fy, ty), ny = Math.floor(Math.abs(ty - fy) / 2) + 1;
    if (nx * ny > 40000) return null;
    // the router's work counts (stage budget): its grid up front, then every step of its search (charged in batches)
    const routeBudget = docBudget(); routeBudget.charge("stage route grid", nx * ny, nx * ny);
    const X = (i: number) => x0 + 2 * i, Y = (j: number) => y0 + 2 * j;
    const inside = (x: number, y: number, r: Rect) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
    const near = (x: number, y: number, r: Rect, pad: number) => x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad;
    const occH = occ.filter((q) => sharesStep(q.on, on) && Math.abs(q.a[1] - q.b[1]) < 0.5), occV = occ.filter((q) => sharesStep(q.on, on) && Math.abs(q.a[0] - q.b[0]) < 0.5);
    // blocked cells, marked rect by rect (strictly inside a rect grown by its pad)
    const hBad = new Uint8Array(nx * ny), vBad = new Uint8Array(nx * ny);
    const mark = (g: Uint8Array, xa: number, ya: number, xb: number, yb: number) => {
      const i0 = Math.max(0, Math.floor((xa - x0) / 2) + 1), i1 = Math.min(nx - 1, Math.ceil((xb - x0) / 2) - 1), j0 = Math.max(0, Math.floor((ya - y0) / 2) + 1), j1 = Math.min(ny - 1, Math.ceil((yb - y0) / 2) - 1);
      for (let j = j0; j <= j1; j++) g.fill(1, j * nx + i0, j * nx + i1 + 1);
    };
    const rect = (g: Uint8Array, r: Rect, pad: number) => mark(g, r.x - pad, r.y - pad, r.x + r.w + pad, r.y + r.h + pad);
    for (const r of ends2) { rect(hBad, r, 0); rect(vBad, r, 0); rect(hBad, r, 4); }
    for (const r of cards) { rect(hBad, r, 4); rect(vBad, r, 2); }
    for (const r of nav.texts) if (shownWith(r, on)) { rect(hBad, r, 6); rect(vBad, r, 2); }
    for (const [a, b] of labelRows) mark(hBad, -1e9, a, 1e9, b);
    for (const q of occH) mark(hBad, Math.min(q.a[0], q.b[0]) - 2, q.a[1] - 4, Math.max(q.a[0], q.b[0]) + 2, q.a[1] + 4);
    for (const q of occV) mark(vBad, q.a[0] - 4, Math.min(q.a[1], q.b[1]) - 2, q.a[0] + 4, Math.max(q.a[1], q.b[1]) + 2);
    const si = Math.round((fx - x0) / 2), sj = Math.round((fy - y0) / 2);
    if (si < 0 || si >= nx) return null;
    // the ends: a point over (or under) the target from which a clear straight run of 8 px or more goes into it
    const goal = new Uint8Array(nx * ny); let goals = 0;
    for (let x = t.x + 12; x <= t.x + t.w - 12; x += 2) { const i = Math.round((x - x0) / 2); if (i < 0 || i >= nx || Math.abs(X(i) - fx) < 6) continue;
      for (let j = Math.round((ty - y0) / 2) - dir; j >= 0 && j < ny && !vBad[j * nx + i]; j -= dir) if ((ty - Y(j)) * dir >= 8 && !goal[j * nx + i]) { goal[j * nx + i] = 1; goals++; } }
    if (!goals) return null;
    // states: node * 2 + (0 level, 1 upright); a turn costs 24 px
    const N = nx * ny, hd: number[] = [], hs: number[] = [];
    if (routeStamp.length < N * 2) { routeDist = new Float64Array(N * 2); routePrev = new Int32Array(N * 2); routeStamp = new Uint32Array(N * 2); routeGen = 0; }
    if (++routeGen === 0xffffffff) { routeStamp.fill(0); routeGen = 1; }
    const dist = routeDist, prev = routePrev, stamp = routeStamp, gen = routeGen;
    const push = (d: number, st: number) => { hd.push(d); hs.push(st); let c = hd.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (hd[p] <= hd[c]) break; const td = hd[p], ts = hs[p]; hd[p] = hd[c]; hs[p] = hs[c]; hd[c] = td; hs[c] = ts; c = p; } };
    let popD = 0, popS = 0;
    const pop = () => { popD = hd[0]; popS = hs[0]; const ld = hd.pop()!, ls = hs.pop()!; const n = hd.length; if (n) { hd[0] = ld; hs[0] = ls; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m2 = c; if (l < n && hd[l] < hd[m2]) m2 = l; if (r < n && hd[r] < hd[m2]) m2 = r; if (m2 === c) break; const td = hd[m2], ts = hs[m2]; hd[m2] = hd[c]; hs[m2] = hs[c]; hd[c] = td; hs[c] = ts; c = m2; } } };
    // out of the source: 4 px straight (its first stretch may touch only its own card)
    const s0 = (sj + 2 * dir) * nx + si; if (sj + 2 * dir < 0 || sj + 2 * dir >= ny || vBad[s0]) return null;
    dist[s0 * 2 + 1] = 4; prev[s0 * 2 + 1] = -1; stamp[s0 * 2 + 1] = gen; push(4, s0 * 2 + 1);
    let end = -1, steps = 0;
    while (hd.length) {
      if (++steps === 1024) { routeBudget.charge("stage route search", steps * ROUTE_STEP_WORK); steps = 0; }
      pop(); const d = popD, st = popS; if (d > dist[st]) continue;
      const k = st >> 1, o = st & 1, i = k % nx, j = (k - i) / nx;
      if (goal[k] && (o === 1 || !vBad[k])) { end = st; break; }
      for (let q = 0; q < 4; q++) {
        const di = MOVES[q][0], dj = MOVES[q][1], oo = MOVES[q][2];
        const ii = i + di, jj = j + dj; if (ii < 0 || ii >= nx || jj < 0 || jj >= ny) continue;
        const kk = jj * nx + ii, bad = oo ? vBad : hBad; if (bad[k] || bad[kk]) continue;
        if (oo !== o && (hBad[k] || vBad[k])) continue;
        // an upright beside something it keeps clear of costs less: lines pack to one side of a narrow gap, room for the next
        const hug = oo === 1 && ((ii > 0 && vBad[kk - 1]) || (ii < nx - 1 && vBad[kk + 1]));
        const nd = d + 2 + (oo === 1 && !hug ? 0.5 : 0) + (oo !== o ? 24 : 0), ns = kk * 2 + oo; if (stamp[ns] !== gen || nd < dist[ns]) { dist[ns] = nd; prev[ns] = st; stamp[ns] = gen; push(nd, ns); }
      }
    }
    routeBudget.charge("stage route search", steps * ROUTE_STEP_WORK);
    if (end < 0) return null;
    const path: [number, number][] = []; for (let st = end; st >= 0; st = prev[st]) { const k = st >> 1, i = k % nx; path.push([X(i), Y((k - i) / nx)]); }
    path.push([X(si), fy]); path.reverse(); path.push([path.at(-1)![0], ty]);
    const ps: [number, number][] = [path[0]]; for (let q = 1; q < path.length; q++) { const a = ps.at(-1)!, b = path[q], c = path[q + 1]; if (c && ((a[0] === b[0] && b[0] === c[0]) || (a[1] === b[1] && b[1] === c[1]))) continue; ps.push(b); }
    return ok(ps) ? ps : null;
  };
  const scans = docBudget();
  const free = (x: number, y0: number, y1: number, skip: string[]) => (scans.charge("stage route scan", live.size + 1), true) && ![...live].some(([id, r]) => !skip.includes(id) && x > r.x - 3 && x < r.x + r.w + 3 && Math.max(y0, y1) > r.y && Math.min(y0, y1) < r.y + r.h);
  // lane headings in the gaps: labels keep clear. A label keeps clear only of what is drawn in one of its
  // own steps (on: its steps; none: every step), so a later step reuses the places of labels no longer drawn
  const taken: (Rect & { on?: number[] })[] = [...nav.heads];
  es.forEach((e0, i) => {
    if (relabelOf(m, e0)) return; // the connector is already drawn: this line only relabels it
    const e = e0.back ? { ...e0, from: e0.to, to: e0.from, fromPill: e0.toPill, toPill: e0.fromPill } : e0;
    live = liveOf(m, rects, e);
    const f = rects.get(e.from)!, t = rects.get(e.to)!, down = t.y >= f.y, role = e.role ?? m.cards.get(e.from)!.role;
    const fp = e.fromPill ? pillBox(e.fromPill, e.step) : undefined, tp = e.toPill ? pillBox(e.toPill, e.step) : undefined; // an end at a pill leaves (or reaches) the card under (or over) it
    const fx = fp ? fp.x + fp.w / 2 : f.x + f.w * Math.min(0.85, 0.3 + 0.12 * slotOf(e.from + (down ? "b" : "t"))), tx = tp ? tp.x + tp.w / 2 : t.x + t.w * Math.min(0.85, 0.3 + 0.12 * slotOf(e.to + (down ? "t" : "b")));
    const fy = down ? f.y + f.h : f.y, ty = down ? t.y : t.y + t.h;
    let pts: [number, number][], curve: "v" | "round" | "h", gr: [number, number][] | null = null, sibs: Rect[] = [];
    // straight down (or up) where the two cards overlap, at the x nearest the port that passes no card and no lane words
    const lo = Math.max(f.x, t.x) + 10, hi = Math.min(f.x + f.w, t.x + t.w) - 10, x0 = Math.max(lo, Math.min(hi, fx));
    const clearX = (x: number) => free(x, fy, ty, [e.from, e.to]) && !nav.texts.some((r) => x > r.x - 3 && x < r.x + r.w + 3 && Math.max(fy, ty) > r.y && Math.min(fy, ty) < r.y + r.h);
    let vx: number | null = null;
    if (Math.abs(fx - tx) < f.w && t.x < f.x + f.w && f.x < t.x + t.w && hi >= lo) for (let d = 0; d <= hi - lo && vx === null; d += 4) { if (x0 + d <= hi && clearX(x0 + d)) vx = x0 + d; else if (x0 - d >= lo && clearX(x0 - d)) vx = x0 - d; }
    // 'lines: straight': where only a lane heading in the gap is in the way, the line still runs straight
    // down; the heading is drawn over it with the stage's colour round its letters (layoutStage), never a loop round the box
    if (vx === null && m.linesStraight && t.x < f.x + f.w && f.x < t.x + t.w && hi >= lo) { const clear2 = (x: number) => free(x, fy, ty, [e.from, e.to]) && !nav.texts.some((r) => !nav.laneRects.includes(r) && x > r.x - 3 && x < r.x + r.w + 3 && Math.max(fy, ty) > r.y && Math.min(fy, ty) < r.y + r.h); for (let d = 0; d <= hi - lo && vx === null; d += 4) { if (x0 + d <= hi && clear2(x0 + d)) vx = x0 + d; else if (x0 - d >= lo && clear2(x0 - d)) vx = x0 - d; } }
    // an end at a card inside a card goes sideways from (or into) that card's own right
    // edge, through the side channel (the phone's sideways end), never across another card inside it
    const fc = e.fromPill?.startsWith("card:") ? fp : undefined, tc = e.toPill?.startsWith("card:") ? tp : undefined;
    if (fc || tc) vx = null;
    // a card at the foot of its box drops straight into a target under it where the two
    // overlap, 10 px in from both, past no card and no words (no run down the box's side and under it)
    let drop: [number, number][] | null = null;
    // a card inside a box indented from the lane's edge, with a target under that strip:
    // out of the card's left side, down the strip, into the target (its own short route, not round the box's far side);
    // a lane heading in its way moves right of the line when it still fits
    if (fc && !tc && down && f.x - t.x >= 32 && f.y + f.h - (fc.y + fc.h) > 16) {
      const gx = Math.round(t.x + Math.max(10, Math.min(t.w * 0.3, (f.x - t.x) / 2))), ys = fc.y + fc.h / 2;
      const inWay = (r: Rect) => gx > r.x - 3 && gx < r.x + r.w + 3 && t.y > r.y && ys < r.y + r.h;
      const heads = nav.laneTexts.filter((it) => { const tw = measure(it.s, "lane"); return inWay({ x: it.x - 2, y: it.y - 12, w: tw + 4, h: 16 }); });
      const others = nav.texts.filter((r) => inWay(r) && !heads.some((it) => Math.abs(r.x - (it.x - 2)) < 1 && Math.abs(r.y - (it.y - 12)) < 1));
      const fitsRight = heads.every((it) => gx + 8 + measure(it.s, "lane") <= w - NPAD);
      if (free(gx, ys, t.y - 1, [e.from, e.to]) && !others.length && fitsRight) {
        for (const it of heads) { const r = nav.texts.find((q) => Math.abs(q.x - (it.x - 2)) < 1 && Math.abs(q.y - (it.y - 12)) < 1); it.x = gx + 8; if (r) r.x = it.x - 2; }
        drop = [[fc.x, ys], [gx, ys], [gx, t.y]];
      }
    }
    if (!drop && fc && !tc && down && f.y + f.h - (fc.y + fc.h) <= 16) {
      const a = Math.max(fc.x, t.x) + 10, b = Math.min(fc.x + fc.w, t.x + t.w) - 10, y0 = fc.y + fc.h, mid = (a + b) / 2;
      const ok = (x: number) => free(x, y0 + 1, t.y - 1, [e.from, e.to]) && !nav.texts.some((r) => x > r.x - 3 && x < r.x + r.w + 3 && t.y > r.y && y0 < r.y + r.h);
      for (let d = 0; b >= a && d <= (b - a) / 2 && !drop; d += 4) for (const x of [mid + d, mid - d]) if (!drop && x >= a && x <= b && ok(x)) drop = [[x, y0], [x, t.y]];
    }
    if (!fc && !tc && Math.abs(f.y - t.y) < 1 && (t.x >= f.x + f.w - 1 || f.x >= t.x + t.w - 1)) { const lr = t.x >= f.x + f.w - 1, foot = Math.min(f.y + f.h, t.y + t.h), mid = f.y + f.h / 2;
      // a labelled one between tall cards runs near their foot, by its label in the strip under the gap (the label
      // stood 150 px under its arrow); others at the middle as before
      const copies=es.filter(x=>x.step===e0.step&&x.from===e0.from&&x.to===e0.to&&!!x.back===!!e0.back&&!relabelOf(m,x)),hi=Math.min(f.y+f.h,t.y+t.h),lo=Math.max(f.y,t.y);
      const targetKids=m.cards.get(e.to)?.kids??[],targetKid=copies.length>1&&targetKids.length>=copies.length?pillBox(`card:${targetKids[copies.indexOf(e0)]}`,e.step):undefined;
      const entryY=targetKid?targetKid.y+targetKid.h/2:NaN;
      const my = Number.isFinite(entryY)&&entryY>=lo+8&&entryY<=hi-8?entryY:copies.length>1?lo+8+(hi-lo-16)*(copies.indexOf(e0)+1)/(copies.length+1):e.label && foot - mid > 30 ? Math.max(Math.max(f.y, t.y) + 10, foot - 14 - 8 * slotOf(`${[e.from, e.to].sort().join("|")}|foot|${e.step}`)) : mid; pts = lr ? [[f.x + f.w, my], [t.x, my]] : [[f.x, my], [t.x + t.w, my]]; curve = "h"; } // side by side in one row
    else if (drop) { pts = drop; curve = drop.length > 2 ? "round" : "v"; }
    // a card inside a box with nothing of the box under it leaves by its foot, out through the
    // box's, and takes its own way to a card under the box (not the side channel with the box's other lines)
    else if (fc && !tc && down && t.y > f.y + f.h + 4 && (sibs = (m.cards.get(e.from)?.kids ?? []).filter((k) => k !== e.fromPill!.slice(5)).map((k) => pillBox(`card:${k}`, e.step)).filter((r): r is NonNullable<typeof r> => !!r)) && !sibs.some((r) => r.y >= fc.y + fc.h - 0.5 && r.x < fc.x + fc.w && fc.x < r.x + r.w)
      && (gr = ((): [number, number][] | null => { const lo2 = Math.max(fc.x, t.x) + 10, hi2 = Math.min(fc.x + fc.w, t.x + t.w) - 10, mid = Math.max(lo2, Math.min(hi2, fc.x + fc.w / 2)), on2 = edgeSteps(m, e.step, e), y0 = fc.y + fc.h;
        for (let d = 0; d <= hi2 - lo2; d += 2) for (const x of [mid - d, mid + d]) if (x >= lo2 && x <= hi2 && free(x, y0 + 1, ty - 1, [e.from, e.to]) && !hitsOcc(x, y0, x, ty, on2) && !nav.texts.some((r) => shownWith(r, on2) && x > r.x - 3 && x < r.x + r.w + 3 && ty > r.y && y0 < r.y + r.h)) return [[x, y0], [x, ty]];
        return null; })() ?? (t.y <= f.y + f.h + 12 ? null : gridRoute(e, t, fc.x + fc.w / 2, fc.y + fc.h, ty, true, edgeSteps(m, e.step, e), (ps) => ps.slice(1).every((p2, k) => k === 0 || segOk(ps[k], p2, [e.from, e.to], edgeSteps(m, e.step, e), false)) && Math.abs(ps.at(-1)![1] - ps.at(-2)![1]) >= 8, { id: e.fromPill!.slice(5), r: fc, others: sibs })))) { pts = gr; curve = gr.length === 2 ? "v" : "round"; }
    else if (vx !== null) { pts = [[vx, fy], [vx, ty]]; curve = "v"; }
    else if (!fc && !tc && !(f.lane === t.lane && m.lanes[t.lane]?.row && !m.cards.get(e.from)?.under && !m.cards.get(e.to)?.under && Math.abs(f.y - t.y) < 1) && !again(e) && (gr = gapRoute(e, f, t, fx, fy, ty, down, edgeSteps(m, e.step, e)))) { pts = gr; curve = "round"; }
    else {
      { const a = nav.order.get(f.lane) ?? -1, b = nav.order.get(t.lane) ?? -1; if (Math.abs(a - b) === 1) fellGaps.set(Math.min(a, b), (fellGaps.get(Math.min(a, b)) ?? 0) + 1); }
      const cx = nav.chanX + (i % 4) * 4, o = (i % 3) * 2;
      const runY = (y: number, xa: number, xb: number, edge: number) => { for (const r of nav.texts) if (Math.max(xa, xb) > r.x && Math.min(xa, xb) < r.x + r.w && y > r.y - 2 && y < r.y + r.h + 2) return edge < r.y ? Math.max(edge + 2, r.y - 3) : Math.min(edge - 2, r.y + r.h + 3); return y; };
      // the room between an end and the next card past it (on the side the line leaves or enters), over the line's run
      const room = (r: Rect, xa: number, xb: number, below: boolean) => { let d = Infinity; for (const q of live.values()) { if (q === r || Math.max(xa, xb) <= q.x || Math.min(xa, xb) >= q.x + q.w) continue; if (below ? q.y >= r.y + r.h - 0.5 : q.y + q.h <= r.y + 0.5) d = Math.min(d, below ? q.y - (r.y + r.h) : r.y - (q.y + q.h)); } return d; };
      // a side end: from the card's right edge straight to the channel, when no card stands between
      const sideOk = (r: Rect, y: number) => ![...live.values()].some((q) => q !== r && q.x >= r.x + r.w - 0.5 && q.x < cx && y > q.y && y < q.y + q.h);
      const fRoom = room(f, fx, cx, down), tRoom = room(t, tx, cx, !down);
      // stacked cards 10 px apart leave no room for a line to turn in, nor for the arrowhead: such an end goes out sideways
      const fs = fc ? fc.y + fc.h / 2 : down ? f.y + f.h - 12 - 6 * slotOf(e.from + "r") : f.y + 12 + 6 * slotOf(e.from + "r"), sideF = !!fc || (fRoom < 24 && sideOk(f, fs));
      // a last level stretch that would run along a say of its steps (the words under the card
      // above) comes in at the card's side instead
      const sayIn = down && !tc && (() => { const on2 = edgeSteps(m, e.step, e); return on2.some((k) => { const st = m.steps[k - 1]; if (!st) return false; const by = new Map<string, string[]>(); for (const [id, tx2] of st.says) (by.get(id) ?? by.set(id, []).get(id)!).push(tx2); return [...by].some(([id, tsx]) => { const r = rects.get(id); return !!r && drawSays(tsx, r, "role:x", w, NPAD, k, nav.sayW.get(id)).some((it) => it.k === "box" && it.x < cx && it.x + it.w > t.x && it.y < t.y && it.y + it.h > t.y - 22); }); }); })();
      const ts = tc ? tc.y + tc.h / 2 : down ? t.y + 12 + 6 * slotOf(e.to + "r") : t.y + t.h - 12 - 6 * slotOf(e.to + "r"), sideT = !!tc || ((tRoom < 24 || sayIn) && sideOk(t, ts));
      // the last stretch before the arrowhead keeps 14 px where the gap allows (it was 5, the head hid in the corner)
      // (a line from one line of a "layout: row" lane to the next keeps 8 px: the row's label strip above stays clear)
      const rowWrap = !!m.lanes[t.lane]?.row && f.lane === t.lane && Math.abs(f.y - t.y) > 1;
      const lead = rowWrap ? Math.min(8, Math.max(5, Number.isFinite(tRoom) ? tRoom / 2 : 8)) : Math.max(5 + o, Math.min(14 + o, Number.isFinite(tRoom) ? tRoom / 2 : 14 + o));
      const y1 = runY(down ? fy + 5 + o : fy - 5 - o, fx, cx, fy), y2 = runY(down ? ty - lead : ty + lead, tx, cx, ty);
      const head0: [number, number][] = sideF ? [[(fc ?? f).x + (fc ?? f).w, fs], [cx, fs]] : [[fx, fy], [fx, y1], [cx, y1]];
      // from the channel, a line enters near the card's channel side: clear of the straight lines into its left part
      const cxT = Math.max(t.x + 12, t.x + t.w - 22 - 12 * slotOf(e.to + "c"));
      const tail: [number, number][] = sideT ? [[cx, ts], [(tc ?? t).x + (tc ?? t).w, ts]] : [[cx, y2], [cxT, y2], [cxT, ty]];
      pts = [...head0, ...tail]; curve = "round";
      // a side-channel route that ends in a stub under 8 px or runs closer than 4 px along a card
      // takes the gap instead where that is clear: down, across under the source's row, down into the target
      const faulty = (ps: [number, number][]) => {
        const [lx, ly] = ps.at(-1)!, [px, py] = ps.at(-2)!; if (Math.hypot(lx - px, ly - py) < 8) return true;
        return ps.slice(1).some(([x2, y2], k) => { const [x1, y1] = ps[k]; return [...live].some(([id, r]) => id !== e.from && id !== e.to && (Math.abs(y1 - y2) < 0.5 ? Math.min(Math.max(x1, x2), r.x + r.w) - Math.max(Math.min(x1, x2), r.x) > 2 && y1 > r.y - 4 && y1 < r.y + r.h + 4 : Math.min(Math.max(y1, y2), r.y + r.h) - Math.max(Math.min(y1, y2), r.y) > 2 && x1 > r.x - 4 && x1 < r.x + r.w + 4)); });
      };
      if (down && !fc && !tc && !sideF && !sideT && ty - fy >= 30 && faulty(pts)) {
        const level = (y: number, xa: number, xb: number) => (scans.charge("stage route scan", live.size + nav.texts.length + 1), true) && ![...live].some(([, r]) => Math.max(xa, xb) > r.x - 4 && Math.min(xa, xb) < r.x + r.w + 4 && y > r.y - 4 && y < r.y + r.h + 4) && !nav.texts.some((r) => Math.max(xa, xb) > r.x - 3 && Math.min(xa, xb) < r.x + r.w + 3 && y > r.y - 3 && y < r.y + r.h + 3);
        const ups = (x: number, ya: number, yb: number) => free(x, ya, yb, [e.from, e.to]) && !nav.texts.some((r) => x > r.x - 3 && x < r.x + r.w + 3 && Math.max(ya, yb) > r.y && Math.min(ya, yb) < r.y + r.h);
        const ys: number[] = []; for (let y = fy + 6; y <= ty - 8; y += 1) if (level(y, fx, cxT) && ups(fx, fy, y) && ups(cxT, y, ty)) ys.push(y); else if (ys.length) break;
        if (ys.length) { const ym = ys[Math.floor(ys.length / 2)]; pts = [[fx, fy], [fx, ym], [cxT, ym], [cxT, ty]]; }
      }
    }
    // a line that hooks round a lane heading (three turns or more, out one way and back the other), where its two cards overlap
    // and only lane headings are in the way, runs straight instead: the heading goes over it with the stage's colour
    // round its letters (as 'lines: straight'), crossed at a space between its words where one is in reach
    let thru = false;
    const hook = new Set(pts.slice(1).map((p, k) => Math.sign(Math.round(p[0] - pts[k][0]))).filter((d) => d !== 0)).size > 1;
    if (!m.linesStraight && pts.length >= 5 && hook && !fc && !tc && hi >= lo && t.x < f.x + f.w && f.x < t.x + t.w) {
      const on = edgeSteps(m, e.step, e), yA = Math.min(fy, ty), yB = Math.max(fy, ty);
      const crossed = (x: number) => nav.laneTexts.filter((it) => { const tw = measure(it.s, "lane"); return x > it.x - 3 && x < it.x + tw + 3 && yB > it.y - 12 && yA < it.y + 4; });
      const okX = (x: number) => free(x, fy, ty, [e.from, e.to]) && !hitsOcc(x, fy, x, ty, on) && !nav.texts.some((r) => !nav.laneRects.includes(r) && x > r.x - 3 && x < r.x + r.w + 3 && yB > r.y && yA < r.y + r.h);
      const inSpace = (x: number) => crossed(x).every((it) => [...it.s].some((ch, k) => ch === " " && x > it.x + measure(it.s.slice(0, k), "lane") + 1 && x < it.x + measure(it.s.slice(0, k + 1), "lane") - 1));
      let best: number | null = null, bs = Infinity;
      for (let x = Math.ceil(lo); x <= hi; x += 1) if (okX(x)) { const sc = (inSpace(x) ? 0 : 1000) + Math.abs(x - fx); if (sc < bs) { bs = sc; best = x; } }
      if (best !== null && crossed(best).length) { pts = [[best, fy], [best, ty]]; curve = "v"; thru = true; }
    }
    { const k=pathKey(e),q=again(e);if(q){pts=q.pts.map(x=>[...x] as [number,number]);curve=q.curve;}else if(!drawnOnce.has(k))drawnOnce.set(k,{pts,curve,step:e.step}); }
    { const on = edgeSteps(m, e.step, e); for (let k = 1; k < pts.length; k++) occ.push({ a: pts[k - 1], b: pts[k], on }); }
    items.push({ k: "path", pts, curve, ink: `role:${role}:wire`, dash: e.dash, arrow: true, from: e.step, on: edgeSteps(m, e.step, e), hot: lit(m, e.step), flow: !m.flowOff, id: `${e.from}>${e.to}`, bar: { edge: 1, from: m.cards.get(e.from)!.title, to: m.cards.get(e.to)!.title } });
    if (thru) thruPaths.add(items.at(-1)!);
  });
  // a channel line into a card's top and a channel line out of that card's top, in one step,
  // meet the card at its channel side instead: the one going out leaves it higher, on the inner lane; the one coming in
  // enters lower, from the outer lane, so they never cross at the card (foreman -> ledger, ledger -> pickers)
  {
    type P = Extract<Item, { k: "path" }>;
    const paths = items.filter((it): it is P => it.k === "path");
    const lane = (x: number) => x >= nav.chanX - 0.5;
    for (const [id, c] of rects) {
      const ins = paths.filter((q) => String(q.id).endsWith(`>${id}`) && q.pts.length >= 4 && Math.abs(q.pts.at(-1)![1] - c.y) < 0.5 && lane(q.pts.at(-3)![0]) && Math.abs(q.pts.at(-3)![1] - q.pts.at(-2)![1]) < 0.5);
      const outs = paths.filter((q) => String(q.id).startsWith(`${id}>`) && q.pts.length >= 4 && Math.abs(q.pts[0][1] - c.y) < 0.5 && q.pts[1][1] < c.y && lane(q.pts[2][0]) && Math.abs(q.pts[1][1] - q.pts[2][1]) < 0.5);
      for (const P of ins) for (const Q of outs) {
        if (!(P.on ?? []).some((k) => (Q.on ?? []).includes(k))) continue;
        const lp = P.pts.at(-3)![0], lq = Q.pts[2][0]; if (lp <= lq + 2) continue;
        const right = c.x + c.w, yu = Math.round(c.y + Math.min(c.h * 0.35, 18)), yl = Math.round(c.y + Math.max(c.h * 0.7, Math.min(c.h - 8, 36)));
        if (yl - yu < 8) continue;
        const oq = JSON.stringify(Q.pts), op = JSON.stringify(P.pts);
        const nq: [number, number][] = [[right, yu], [lq, yu], ...Q.pts.slice(3).map((p) => [...p] as [number, number])];
        const np: [number, number][] = [...P.pts.slice(0, -3).map((p) => [...p] as [number, number]), [lp, yl], [right, yl]];
        for (const it of paths) { const o = JSON.stringify(it.pts); if (it.id === Q.id && o === oq) it.pts = nq.map((p) => [...p] as [number, number]); else if (it.id === P.id && o === op) it.pts = np.map((p) => [...p] as [number, number]); }
      }
    }
  }
  // two lines from one card's side down the channel into tops of cards, in one step, are
  // nested, never sharing a stretch: the one to the nearer card leaves higher, takes the outer lane and turns last; the
  // one to the farther card leaves lower, takes the inner lane and turns 8 px higher (a copy in another step follows)
  {
    type P = Extract<Item, { k: "path" }>;
    // out of a card's side to the channel, down it, then left into a card's top (5 points) or its side (4 points)
    const side = (q: P) => { const p = q.pts; return (p.length === 5 || p.length === 4) && p[1][0] >= nav.chanX - 0.5 && Math.abs(p[0][1] - p[1][1]) < 0.5 && Math.abs(p[1][0] - p[2][0]) < 0.5 && Math.abs(p[2][1] - p[3][1]) < 0.5 && p[3][0] < p[2][0] && (p.length === 4 || (Math.abs(p[3][0] - p[4][0]) < 0.5 && p[4][1] > p[3][1])); };
    const ps = items.filter((it): it is P => it.k === "path" && side(it as P));
    const cards = [...rects.values()];
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const A = ps[i], B = ps[j]; if (String(A.id).split(">")[0] !== String(B.id).split(">")[0] || !(A.on ?? []).some((k) => (B.on ?? []).includes(k))) continue;
      if (Math.abs(A.pts[0][0] - B.pts[0][0]) > 0.5 || Math.abs(A.pts[0][1] - B.pts[0][1]) > 3) continue;
      // turning at different heights (cards in different rows): the one that turns higher takes the inner lane and leaves
      // lower, the other the outer lane and leaves higher, so neither crosses the other
      if (Math.abs(A.pts[2][1] - B.pts[2][1]) > 3) {
        const [hi, lo] = A.pts[2][1] < B.pts[2][1] ? [A, B] : [B, A], xo = Math.max(A.pts[1][0], B.pts[1][0]), xi = Math.min(A.pts[1][0], B.pts[1][0]);
        if (xo - xi < 4 || hi.pts[3][0] > xi) continue;
        const s0 = (A.pts[0][1] + B.pts[0][1]) / 2, sx = A.pts[0][0], olds = [hi, lo].map((q) => JSON.stringify(q.pts));
        const nh: [number, number][] = [[sx, s0 + 3], [xi, s0 + 3], [xi, hi.pts[2][1]], ...hi.pts.slice(3).map((p) => [...p] as [number, number])];
        const nl: [number, number][] = [[sx, s0 - 3], [xo, s0 - 3], [xo, lo.pts[2][1]], ...lo.pts.slice(3).map((p) => [...p] as [number, number])];
        for (const it of items) if (it.k === "path") { const o = JSON.stringify(it.pts); if (it.id === hi.id && o === olds[0]) it.pts = nh.map((p) => [...p] as [number, number]); else if (it.id === lo.id && o === olds[1]) it.pts = nl.map((p) => [...p] as [number, number]); }
        continue;
      }
      if (A.pts.length !== 5 || B.pts.length !== 5) continue;
      const [near, far] = A.pts[3][0] >= B.pts[3][0] ? [A, B] : [B, A], xo = Math.max(A.pts[1][0], B.pts[1][0]), xi = Math.min(A.pts[1][0], B.pts[1][0]);
      if (xo - xi < 4) continue;
      const s0 = (A.pts[0][1] + B.pts[0][1]) / 2, sx = A.pts[0][0], yLow = Math.max(A.pts[2][1], B.pts[2][1]), yHigh = yLow - 8, fx2 = far.pts[3][0];
      if (yHigh < s0 + 12 || cards.some((r) => yHigh > r.y - 3 && yHigh < r.y + r.h + 3 && fx2 < r.x + r.w && xi > r.x)) continue;
      const olds = [near, far].map((q) => JSON.stringify(q.pts));
      const nn: [number, number][] = [[sx, s0 - 3], [xo, s0 - 3], [xo, yLow], [near.pts[3][0], yLow], [near.pts[4][0], near.pts[4][1]]];
      const nf: [number, number][] = [[sx, s0 + 3], [xi, s0 + 3], [xi, yHigh], [fx2, yHigh], [far.pts[4][0], far.pts[4][1]]];
      for (const it of items) if (it.k === "path") { const o = JSON.stringify(it.pts); if (it.id === near.id && o === olds[0]) it.pts = nn.map((p) => [...p] as [number, number]); else if (it.id === far.id && o === olds[1]) it.pts = nf.map((p) => [...p] as [number, number]); }
    }
  }
  // labels: one per label and step in the gap between the two lanes, side by side; a line of one pair keeps its own
  const seen = new Set<string>();
  for (const e of es) {
    if (!e.label) continue;
    const la = nav.order.get(m.cards.get(e.from)!.lane) ?? 0, lb = nav.order.get(m.cards.get(e.to)!.lane) ?? 0, gi = Math.min(la, lb);
    // one label per line and sender, in the gap of its first connector (the hero's one 'ledger file; checked' to two lanes)
    const key = phoneLabelKey(m, e); if (seen.has(key)) continue; seen.add(key);
    const fr = rects.get(e.from)!, tr = rects.get(e.to)!, upper = fr.y <= tr.y ? e.from : e.to, side = Math.abs(fr.y - tr.y) < 1 ? nav.sideY.get(e.from) : fr.lane === tr.lane ? nav.sideY.get(upper) : undefined;
    let gy = side ?? nav.gapY.get(gi) ?? (tr.y - 14); const cw = measure(e.label, "chip") + 18;
    let cx = side !== undefined && Math.abs(fr.y - tr.y) < 1 ? Math.max(NPAD + cw / 2, Math.min(w - NPAD - cw / 2, (Math.min(fr.x + fr.w, tr.x + tr.w) + Math.max(fr.x, tr.x)) / 2)) : NPAD + cw / 2;
    // the steps it is drawn in: a neutral connector's label for its steps, a data label its own step only (as wide; cecde04), a kept one its line's steps
    const on = (m.roles[e.role ?? m.cards.get(e.from)!.role] ?? 0) === 0 || e.keep ? labelSteps(m, e) : [e.step], meets = (r: { on?: number[] }) => (scans.charge("stage label scan", 1), true) && (!r.on || r.on.some((k) => on.includes(k)));
    // a box drawn before the connectors is in the way only when on screen in one of the label's steps (a card of
    // another group sharing the place is not; a scene at 390)
    const shownIn = (r: { on?: number[]; from?: number; to?: number }) => (r.on ? r.on.some((k) => on.includes(k)) : on.some((k) => k >= (r.from ?? 1) && (!r.to || k <= r.to)));
    while (taken.some((r) => meets(r) && cx + cw / 2 > r.x && cx - cw / 2 < r.x + r.w && gy + 20 > r.y && gy < r.y + r.h) && cx + cw / 2 < w - NPAD) cx += 8;
    // no room left in the row: the next label row in the same gap (the hero's three fan-out labels on a phone)
    const clash = () => taken.some((r) => meets(r) && cx + cw / 2 > r.x && cx - cw / 2 < r.x + r.w && gy + 20 > r.y && gy < r.y + r.h);
    if (cx + cw / 2 > w - NPAD && side === undefined) { const x0 = cx; cx = NPAD + cw / 2; gy += 22; while (clash() && cx + cw / 2 < w - NPAD) cx += 8; if (clash()) { cx = x0; gy -= 22; } }
    cx = Math.max(NPAD + cw / 2, Math.min(cx, w - NPAD - cw / 2)); // never past the stage's edge
    // a plain label of ONE line stands by that line on a phone: beside an upright stretch where it crosses the gap, or on a
    // level stretch it fits on; else the gap's place above (picture check: labels sat by a lane title)
    let ly = gy;
    if (!e.tone && ownLine(m, e)) {
      const own = items.find((it) => it.k === "path" && (it as any).id === `${e.from}>${e.to}` && (!it.on || it.on.some((k) => on.includes(k)))) as any;
      const segs0 = own ? (own.pts as [number, number][]).slice(1).map((q, i) => [own.pts[i], q] as const) : [];
      // phone lines run upright or level, so a stretch's bounds give its distance to the label exactly
      const far = (x: number, y: number) => segs0.every(([a, b]) => Math.max(x - cw / 2 - Math.max(a[0], b[0]), 0, Math.min(a[0], b[0]) - (x + cw / 2)) + Math.max(y - Math.max(a[1], b[1]), 0, Math.min(a[1], b[1]) - (y + 20)) > 12);
      if (own && far(cx, gy)) { // only a label whose gap place is away from its own line moves
        const segs = segs0;
        const cands: [number, number][] = [];
        for (const [a, b] of segs) if (Math.abs(a[0] - b[0]) < 1 && Math.abs(a[1] - b[1]) >= 24) { const lo = Math.min(a[1], b[1]) + 2, hi = Math.max(a[1], b[1]) - 22; for (const dy of [0, 12, -12, 24, -24]) { const y0 = Math.max(lo, Math.min(hi, (a[1] + b[1]) / 2 - 10 + dy)); cands.push([a[0] + 6 + cw / 2, y0], [a[0] - 6 - cw / 2, y0]); } }
        // on a level stretch: centred on it, else a little lower or higher, still on it
        for (const [a, b] of segs) if (Math.abs(a[1] - b[1]) < 1 && Math.abs(a[0] - b[0]) >= cw + 12) cands.push([(a[0] + b[0]) / 2, a[1] - 10]);
        for (const [a, b] of segs) if (Math.abs(a[1] - b[1]) < 1 && Math.abs(a[0] - b[0]) >= cw + 12) cands.push([(a[0] + b[0]) / 2, a[1] - 3], [(a[0] + b[0]) / 2, a[1] - 17]);
        // a level stretch too short for its chip (between two cards side by side): under the gap, slid sideways away from other lines
        for (const [a, b] of segs) if (Math.abs(a[1] - b[1]) < 1 && Math.abs(a[0] - b[0]) < cw + 12) { const mx = (a[0] + b[0]) / 2; for (const d of [0, -12, 12, -24, 24, -36, 36]) cands.push([mx + d, gy]); }
        const free = ([x, y]: [number, number]) => x - cw / 2 >= NPAD && x + cw / 2 <= w - NPAD && y >= 2
          && !labelObs.some((r: any) => r.k === "box" && shownIn(r) && x + cw / 2 > r.x && x - cw / 2 < r.x + r.w && y + 20 > r.y && y < r.y + r.h)
          && ![...liveOf(m, rects, e).values()].some((r) => x + cw / 2 > r.x && x - cw / 2 < r.x + r.w && y + 20 > r.y && y < r.y + r.h)
          && !taken.some((r) => meets(r) && x + cw / 2 > r.x && x - cw / 2 < r.x + r.w && y + 20 > r.y && y < r.y + r.h)
          // 14 px or more from every other line shown with it, so it never reads as that line's label
          && !items.some((it: any) => it.k === "path" && it !== own && (!it.on || it.on.some((k: number) => on.includes(k))) && (it.pts as [number, number][]).slice(1).some((q, i) => { const p0 = it.pts[i]; return Math.max(x - cw / 2 - Math.max(p0[0], q[0]), 0, Math.min(p0[0], q[0]) - (x + cw / 2)) + Math.max(y - Math.max(p0[1], q[1]), 0, Math.min(p0[1], q[1]) - (y + 20)) < 14; }));
        const hit = cands.find(free); if (hit) { cx = hit[0]; ly = hit[1]; }
      }
    }
    // a label between two cards of one row that another line in its steps runs through stands above the pair instead
    //
    if (!e.tone && side !== undefined && Math.abs(fr.y - tr.y) < 1) {
      const crossed = (x: number, y: number) => items.some((it: any) => it.k === "path" && it.id !== `${e.from}>${e.to}` && (!it.on || it.on.some((k: number) => on.includes(k))) && (it.pts as [number, number][]).slice(1).some((q, i) => { const a = it.pts[i]; return Math.max(a[0], q[0]) > x - cw / 2 && Math.min(a[0], q[0]) < x + cw / 2 && Math.max(a[1], q[1]) > y && Math.min(a[1], q[1]) < y + 20; }));
      const up = Math.min(fr.y, tr.y) - 22;
      const textAt = (y: number) => headObs.some((t: any) => shownIn(t) && y + 20 > t.y - 14 && y < t.y + 4); // never level with a lane or band heading
      if (crossed(cx, ly) && up >= 2 && !crossed(cx, up) && !textAt(up) && ![...nav.heads, ...nav.texts].some((r) => cx + cw / 2 > r.x && cx - cw / 2 < r.x + r.w && up + 20 > r.y - 2 && up < r.y + r.h + 2) && ![...liveOf(m, rects, e).values()].some((r) => cx + cw / 2 > r.x && cx - cw / 2 < r.x + r.w && up + 20 > r.y && up < r.y + r.h)
        && !labelObs.some((r: any) => r.k === "box" && shownIn(r) && cx + cw / 2 > r.x && cx - cw / 2 < r.x + r.w && up + 20 > r.y && up < r.y + r.h)
        && !taken.some((r) => meets(r) && cx + cw / 2 > r.x && cx - cw / 2 < r.x + r.w && up + 20 > r.y && up < r.y + r.h)) ly = up;
    }
    // a chip never sits on an arrowhead shown with it; it moves to the nearest free place, up or down its
    // line first, then sideways (the hero's "copy out" on both arrows into the store)
    if (!e.tone) {
      // the drawn heads (site/src/stage.tsx head: `head` px back from the tip, 0.6 of it each side), 1 px more
      const heads = items.flatMap((it: any) => { if (it.k !== "path" || !it.arrow || !shownIn(it)) return []; const [px, py] = it.pts.at(-2), [qx, qy] = it.pts.at(-1), dx = Math.sign(Math.round(qx - px)), dy = dx ? 0 : Math.sign(qy - py), L = it.head ?? 10; return [{ x: Math.min(qx, qx - dx * L) - (dx ? 1 : 7), y: Math.min(qy, qy - dy * L) - (dy ? 1 : 7), w: Math.abs(dx) * L + (dx ? 2 : 14), h: Math.abs(dy) * L + (dy ? 2 : 14) }]; });
      const box = (x: number, y: number, r: Rect) => x + cw / 2 > r.x && x - cw / 2 < r.x + r.w && y + 20 > r.y && y < r.y + r.h;
      // the steps' says, drawn after the lines, in the places their cards reserved
      const sayBoxes = on.flatMap((k) => { const st = m.steps[k - 1]; if (!st) return []; const by = new Map<string, string[]>(); for (const [id, t] of st.says) (by.get(id) ?? by.set(id, []).get(id)!).push(t); return [...by].flatMap(([id, ts]) => { const r = rects.get(id); return r ? drawSays(ts, r, "role:x", w, NPAD, k, nav.sayW.get(id)).filter((it): it is Extract<Item, { k: "box" }> => it.k === "box") : []; }); });
      const clear = (x: number, y: number) => x - cw / 2 >= NPAD && x + cw / 2 <= w - NPAD && y >= 2 && !heads.some((r) => box(x, y, r))
        && ![...labelObs, ...items].some((r: any) => r.k === "box" && r.cls !== "stg-region" && shownIn(r) && box(x, y, r)) && ![...liveOf(m, rects, e).values()].some((r) => box(x, y, r))
        && !taken.some((r) => meets(r) && box(x, y, r)) && !sayBoxes.some((r) => box(x, y, r)) && !headObs.some((t: any) => shownIn(t) && box(x, y, { x: t.x - 4, y: t.y - 14, w: measure(t.s, t.f) + 8, h: 18 }));
      if (heads.some((r) => box(cx, ly, r))) {
        const cands: [number, number][] = [];
        for (let d = 2; d <= 40; d += 2) cands.push([cx, ly - d], [cx, ly + d]);
        for (let d = 4; d <= 120; d += 4) cands.push([cx - d, ly], [cx + d, ly]);
        const ok = cands.find(([x, y]) => clear(x, y)); if (ok) [cx, ly] = ok;
      }
    }
    taken.push({ x: cx - cw / 2 - 3, y: ly, w: cw + 6, h: 20, on });
    if (e.tone) {
      // a toned label on a phone stands beside its own line where it crosses the gap, never across it
      let tx = cx, anchor: "middle" | "start" | "end" = "middle"; const ty = gy + 14, lw = measure(e.label, TONE_F);
      const own = items.find((it) => it.k === "path" && (it as any).id === `${e.from}>${e.to}` && (!it.on || it.on.some((k) => on.includes(k)))) as any;
      const seg = own && (own.pts as [number, number][]).slice(1).map((q, i) => [own.pts[i], q]).find(([a, b]) => Math.abs(a[0] - b[0]) < 1 && Math.min(a[1], b[1]) <= ty - 4 && Math.max(a[1], b[1]) >= ty - 8);
      if (seg) { const sx = seg[0][0]; if (sx + 6 + lw <= w - NPAD) { tx = sx + 6; anchor = "start"; } else { tx = sx - 6; anchor = "end"; } }
      items.push({ k: "text", x: tx, y: ty, s: e.label, f: TONE_F, ink: `${e.tone}:ink`, anchor, bar: { "edge-label": e.label }, from: e.step, on, hot: lit(m, e.step) } as Item); continue;
    }
    items.push(...shift(chip(cx, ly, e.label, `role:${e.role ?? m.cards.get(e.from)!.role}`, 0, "chip", { kind: "chip", label: e.label, "edge-label": e.label }).items, 0, 0, { from: e.step, on, hot: lit(m, e.step) } /* phone, as the wide stage: a neutral connector's label stays for its steps, a data label speaks in its own step (cecde04) */));
  }
  return items;
}
type Placed ={ e: Edge; a: [number, number]; b: [number, number]; side: "lr" | "rl" | "tb" | "bt" | "same"; pts: [number, number][]; curve: "h" | "v" | "round" | "line"; dup?: number; copy?: number };
/** the place of a pill at a step (set by the layout before the connectors are drawn) */
let pillBox: (p: string, k: number) => Rect | undefined = () => undefined;
/** every box drawn before the connectors (cards, cards inside cards, pills, a track's phases; not the lane regions): a
 * connector label keeps off those shown in its steps */
let labelObs: Item[] = [];
let headObs: Item[] = [];
/** connectors of one step with the same words into one card, two or more, from one side,
 * where a lane stands between a source and the target: they come in over the cards, into the target's top, one label */
function fanInGroups(m: Model): Edge[][] {
  const g = new Map<string, Edge[]>();
  for (const st of m.steps) for (const e of st.edges) if (e.label && !e.tone) { const k = `${e.label}|${e.step}|${topCard(m, e.to)}`; (g.get(k) ?? g.set(k, []).get(k)!).push(e); }
  return [...g.values()].filter((es) => {
    if (es.length < 2) return false;
    const lt = m.cards.get(topCard(m, es[0].to))?.lane, ls = es.map((e) => m.cards.get(topCard(m, e.from))?.lane);
    if (lt === undefined || ls.some((l) => l === undefined || l === lt) || m.lanes[lt]?.span) return false;
    const left = ls.every((l) => l! < lt), right = ls.every((l) => l! > lt);
    return (left || right) && ls.some((l) => Math.abs(l! - lt) > 1) && ls.every((l) => !m.lanes[l!]?.span);
  });
}
/** each row card's label strip above it (0 or 24); a line from elsewhere passes over it */
const rowAbove = new Map<string, number>();
/** the cards on screen in a connector's steps: the only ones its line and its label keep clear of
 * (in a shared place, the other group's cards are not there) */
function liveOf<R>(m: Model, rects: Map<string, R>, e: Edge): Map<string, R> {
  const ks = edgeSteps(m, e.step, e), on = (id: string) => { const s0 = m.shownOn?.get(id); return s0 ? ks.some((k) => s0.includes(k)) : ks.some((k) => k >= (m.cards.get(id)?.from ?? 1)); };
  return m.shownOn?.size ? new Map([...rects].filter(([id]) => on(id))) : rects;
}
/** move a connector's end to its pill: on the card's edge it leaves by, level with the pill (or above/below its middle);
 * an end at a card inside a card (own) leaving by a side sits on that card's own side edge */
function pinToPill(pts: [number, number][], end: 0 | 1, r: Rect, pr: Rect | undefined, own = false) {
  if (!pr) return;
  const i = end === 0 ? 0 : pts.length - 1, j = end === 0 ? 1 : pts.length - 2, [ox, oy] = pts[i];
  let nx = ox, ny = oy;
  if (Math.abs(ox - (r.x + r.w)) < 1 || Math.abs(ox - r.x) < 1) { ny = pr.y + pr.h / 2; if (own) nx = Math.abs(ox - r.x) < 1 ? pr.x : pr.x + pr.w; } else nx = pr.x + pr.w / 2;
  pts[i] = [nx, ny];
  if (j >= 0 && j !== i && pts.length > 2) { const [px, py] = pts[j]; pts[j] = [Math.abs(px - ox) < 1 ? nx : px, Math.abs(py - oy) < 1 ? ny : py]; }
}
/** where a toned label stands: at a point along its line, from just past the middle, just below (else above) a level or slanted
 * stretch or right of an upright one; first a spot clear of every card, 8 px off both end cards and 12 px off the arrowhead,
 * else one that covers no card and no other label; the words always stay by their own line */
function toneSpot(pts: [number, number][], s: string, rects: Map<string, Rect>, taken: Rect[], ends: string[]): { x: number; y: number; anchor: "middle" | "start"; box: Rect } {
  const lw = measure(s, TONE_F), segs = pts.slice(1).map((q, i) => ({ a: pts[i], b: q, l: Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]) })), tot = segs.reduce((x, g) => x + g.l, 0) || 1;
  const at = (fr: number) => { let d = fr * tot; for (const g of segs) { if (d <= g.l || g === segs.at(-1)) { const u = g.l ? Math.min(1, d / g.l) : 0; return { x: g.a[0] + (g.b[0] - g.a[0]) * u, y: g.a[1] + (g.b[1] - g.a[1]) * u, up: Math.abs(g.b[1] - g.a[1]) > Math.abs(g.b[0] - g.a[0]), sl: g.b[0] !== g.a[0] ? (g.b[1] - g.a[1]) / (g.b[0] - g.a[0]) : 0 }; } d -= g.l; } return { x: pts[0][0], y: pts[0][1], up: false, sl: 0 }; };
  const spot = (fr: number, other: boolean) => { const q = at(fr); return q.up ? { x: other ? q.x - 6 - lw : q.x + 6, y: q.y + 4, anchor: "start" as const, box: { x: other ? q.x - 6 - lw : q.x + 6, y: q.y - 9, w: lw, h: 16 } } : (() => { const off = Math.abs(q.sl) * lw / 2; return { x: q.x, y: other ? q.y + 17 + off : q.y - 6 - off, anchor: "middle" as const, box: { x: q.x - lw / 2, y: other ? q.y + 3 + off : q.y - 20 - off, w: lw, h: 18 } }; })(); }; // a slanted line: off by its rise over half the words
  const clear = (r: Rect) => ![...rects].some(([id, c]) => !ends.includes(id) && r.x < c.x + c.w && r.x + r.w > c.x && r.y < c.y + c.h && r.y + r.h > c.y) && !taken.some((c) => r.x < c.x + c.w && r.x + r.w > c.x && r.y < c.y + c.h && r.y + r.h > c.y) && ![...rects].some(([id, c]) => ends.includes(id) && r.x < c.x + c.w - 1 && r.x + r.w > c.x + 1 && r.y < c.y + c.h - 1 && r.y + r.h > c.y + 1);
  const tip = pts.at(-1)!, offTip = (r: Rect) => Math.max(r.x - tip[0], 0, tip[0] - (r.x + r.w)) + Math.max(r.y - tip[1], 0, tip[1] - (r.y + r.h)) >= 12;
  const roomy = (r: Rect) => ![...rects].some(([id, c]) => ends.includes(id) && r.x < c.x + c.w + 8 && r.x + r.w > c.x - 8 && r.y < c.y + c.h + 3 && r.y + r.h > c.y - 3);
  // between two cards side by side: first just BELOW the line, in the gap, 8 px off the target (and its arrowhead), 4 off the source
  // (clear of the packer)
  const src = rects.get(ends[0]), tgt = rects.get(ends[1]);
  if (src && tgt && (src.x + src.w <= tgt.x || tgt.x + tgt.w <= src.x)) {
    const toRight = tgt.x > src.x, left = toRight ? src.x + src.w + 4 : tgt.x + tgt.w + 8, right = toRight ? tgt.x - 8 : src.x - 4;
    const lineY = (x: number) => { const g = segs.find((q) => Math.min(q.a[0], q.b[0]) <= x && Math.max(q.a[0], q.b[0]) >= x && Math.abs(q.b[0] - q.a[0]) > 1); return g ? g.a[1] + ((g.b[1] - g.a[1]) / (g.b[0] - g.a[0])) * (x - g.a[0]) : undefined; };
    // the words in the gap when they fit, else from the source side on, under whichever card they pass beneath
    const x0 = right - left >= lw ? Math.max(left, Math.min(right - lw, (left + right) / 2 - lw / 2)) : toRight ? left : right - lw;
    const ys = [x0, x0 + lw / 2, x0 + lw].map(lineY).filter((v): v is number => v !== undefined);
    if (ys.length) {
      let top = Math.max(...ys) + 3;
      for (const c of [src, tgt]) if (x0 < c.x + c.w && x0 + lw > c.x && c.y < top + 18 && c.y + c.h > top) top = Math.max(top, c.y + c.h + 2);
      const box = { x: x0, y: top, w: lw, h: 18 };
      if (top - Math.max(...ys) <= 20 && clear(box) && offTip(box)) return { x: x0 + lw / 2, y: top + 14, anchor: "middle" as const, box };
    }
  }
  for (const fr of [0.5, 0.55, 0.45, 0.65, 0.35, 0.75]) for (const other of [true, false]) { const c = spot(fr, other); if (clear(c.box) && roomy(c.box) && offTip(c.box)) return c; }
  for (const fr of [0.55, 0.45, 0.65, 0.35, 0.75]) for (const other of [true, false]) { const c = spot(fr, other); if (clear(c.box)) return c; }
  return spot(0.55, true);
}
function connectors(m: Model, rects: Map<string, Rect & { lane: number }>, w: number, narrow: boolean): Item[] {
  if (narrow) return narrowConnectors(m, rects, w);
  const items: Item[] = [], n = m.steps.length;
  const es = m.steps.flatMap((s) => s.edges);
  const placed: Placed[] = [];
  // which side each end leaves from
  const sides = (f: Rect, t: Rect): Placed["side"] => {
    if (!narrow) { if (t.x >= f.x + f.w - 1) return "lr"; if (t.x + t.w <= f.x + 1) return "rl"; return t.y >= f.y + f.h ? "tb" : t.y + t.h <= f.y ? "bt" : "same"; }
    if (t.y >= f.y + f.h - 1) return "tb"; if (t.y + t.h <= f.y + 1) return "bt"; return t.x >= f.x + f.w ? "lr" : t.x + t.w <= f.x ? "rl" : "same";
  };
  const ports = new Map<string, { p: Placed; end: "a" | "b"; o: number }[]>();
  const dupN = new Map<string, number>(), copyN = new Map<string, number>();
  for (const e of es) {
    if (relabelOf(m, e)) continue; // the connector is already drawn: this line only relabels it
    const [fa, ta] = e.back ? [e.to, e.from] : [e.from, e.to]; // a back arrow "a <- b" is drawn from b to a
    const f = rects.get(fa)!, t = rects.get(ta)!;
    const pk = fa < ta ? fa + ">" + ta : ta + ">" + fa; dupN.set(pk, (dupN.get(pk) ?? -1) + 1);
    const ck = fa + ">" + ta + "|" + e.step; copyN.set(ck, (copyN.get(ck) ?? -1) + 1); // the copies of an "x2" pair, within its step
    const side = sides(f, t), p: Placed = { e: { ...e, from: fa, to: ta, ...(e.back ? { fromPill: e.toPill, toPill: e.fromPill } : {}) }, dup: dupN.get(pk), copy: copyN.get(ck), a: [0, 0], b: [0, 0], side, pts: [], curve: side === "lr" || side === "rl" ? "h" : "v" };
    placed.push(p);
    const fs = side === "lr" ? "r" : side === "rl" ? "l" : side === "tb" ? "b" : side === "bt" ? "t" : "r", ts = side === "lr" ? "l" : side === "rl" ? "r" : side === "tb" ? "t" : side === "bt" ? "b" : "r";
    (ports.get(fa + "|" + fs) ?? ports.set(fa + "|" + fs, []).get(fa + "|" + fs)!).push({ p, end: "a", o: fs === "l" || fs === "r" ? t.y + t.h / 2 : t.x + t.w / 2 });
    (ports.get(ta + "|" + ts) ?? ports.set(ta + "|" + ts, []).get(ta + "|" + ts)!).push({ p, end: "b", o: ts === "l" || ts === "r" ? f.y + f.h / 2 : f.x + f.w / 2 });
  }
  // fanned ports: the ends on one side are spread along it, ordered by where the other end is; one end per pair
  for (const [key, list] of ports) {
    const [id, side] = key.split("|"), r = rects.get(id)!;
    const uniq: number[] = []; const slot = new Map<string, number>();
    list.sort((p, q) => p.o - q.o);
    for (const it of list) { const other = (it.end === "a" ? it.p.e.to : it.p.e.from) + "#" + (it.p.dup ?? 0); if (!slot.has(other)) { slot.set(other, uniq.length); uniq.push(it.o); } }
    for (const it of list) {
      const other = (it.end === "a" ? it.p.e.to : it.p.e.from) + "#" + (it.p.dup ?? 0), f = (slot.get(other)! + 1) / (uniq.length + 1);
      const pt: [number, number] = side === "r" ? [r.x + r.w, r.y + r.h * (0.2 + 0.6 * f)] : side === "l" ? [r.x, r.y + r.h * (0.2 + 0.6 * f)] : side === "t" ? [r.x + r.w * (0.15 + 0.7 * f), r.y] : moreW.has(id) && !narrow ? [r.x + moreW.get(id)! + 16 + (r.w - moreW.get(id)! - 28) * f, r.y + r.h] : [r.x + r.w * (0.15 + 0.7 * f), r.y + r.h];
      it.p[it.end] = pt;
    }
  }
  // a straight climb from a band to the card right above it, when nothing is between; else up the gap beside the lane
  let live = rects;
  const blocked = (x: number, y0: number, y1: number, skip: string[]) => [...live].some(([id, r]) => !skip.includes(id) && x > r.x - 4 && x < r.x + r.w + 4 && Math.max(y0, y1) > r.y && Math.min(y0, y1) < r.y + r.h);
  const clearSeg = (a: [number, number], b: [number, number], skip: string[]) => ![...live].some(([id, r]) => { if (skip.includes(id)) return false; for (let u = 0.02; u < 1; u += 0.02) { const x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u; if (x > r.x - 2 && x < r.x + r.w + 2 && y > r.y - 2 && y < r.y + r.h + 2) return true; } return false; });
  const crossesH = (y: number, x0: number, x1: number, skip: string[]) => [...live].some(([id, r]) => !skip.includes(id) && y > r.y - 4 && y < r.y + r.h + 4 && Math.max(x0, x1) > r.x && Math.min(x0, x1) < r.x + r.w);
  const fanTop = new Map<Placed, { group: Placed[]; px: number }>();
  for (const es of fanInGroups(m)) {
    const grp = placed.filter((p) => !(p as { labelOnly?: boolean }).labelOnly && es.some((e) => e.step === p.e.step && e.from === p.e.from && e.to === p.e.to && e.label === p.e.label)); if (grp.length < 2) continue;
    const t = rects.get(grp[0].e.to)!, tc = t.x + t.w / 2, left = rects.get(grp[0].e.from)!.x < t.x;
    // nearest source first: the lowest rail and the port nearest its side; a farther source rides higher and lands
    // further in, so no two lines cross
    grp.sort((a, b) => Math.abs(rects.get(a.e.from)!.x - tc) - Math.abs(rects.get(b.e.from)!.x - tc));
    const step = Math.min(44, (t.w * 0.5) / grp.length);
    grp.forEach((p, i) => fanTop.set(p, { group: grp, px: left ? t.x + t.w * 0.3 + i * step : t.x + t.w * 0.7 - i * step }));
  }
  for (const p of placed) {
    live = liveOf(m, rects, p.e);
    const fan = fanTop.get(p);
    if (fan) {
      const f = rects.get(p.e.from)!, t = rects.get(p.e.to)!, i = fan.group.indexOf(p), rail = Math.min(f.y, t.y) - 10 - 9 * i, sx = f.x + f.w / 2;
      p.a = [sx, f.y]; p.b = [fan.px, t.y]; p.pts = [p.a, [sx, rail], [fan.px, rail], p.b]; p.curve = "round"; continue;
    }
    // layout: row: neighbours on one line of a row are joined level along the row's middle; a line from
    // another lane comes in over the row's label strip and drops onto the row card's top (no label in its way)
    {
      const cf = m.cards.get(topCard(m, p.e.from)), ct = m.cards.get(topCard(m, p.e.to)), f = rects.get(p.e.from)!, t = rects.get(p.e.to)!;
      const rowF = !!cf && !!m.lanes[cf.lane]?.row && rowAbove.has(cf.id), rowT = !!ct && !!m.lanes[ct.lane]?.row && rowAbove.has(ct.id);
      if (rowF && rowT && cf!.lane === ct!.lane && Math.abs(f.y - t.y) < 1 && f.h === t.h) {
        const lo = Math.min(f.x + f.w, t.x + t.w), hi = Math.max(f.x, t.x);
        if (![...live].some(([id, r]) => id !== p.e.from && id !== p.e.to && r.x >= lo - 1 && r.x + r.w <= hi + 1 && Math.abs(r.y - f.y) < 1)) {
          const y = f.y + f.h / 2; p.a = [f.x < t.x ? f.x + f.w : f.x, y]; p.b = [f.x < t.x ? t.x : t.x + t.w, y]; p.pts = [p.a, p.b]; p.curve = "h"; continue;
        }
      }
      if (rowF !== rowT && cf && ct && cf.lane !== ct.lane) {
        // straight across when the way is clear (the original's workshop arrow into the card under the row)
        { const r = rowT ? t : f, o = rowT ? f : t, ty = Math.max(r.y + 8, Math.min(r.y + r.h - 8, (Math.max(r.y, o.y) + Math.min(r.y + r.h, o.y + o.h)) / 2)), ox = o.x < r.x ? o.x + o.w : o.x, rx = o.x < r.x ? r.x : r.x + r.w;
          if (ty > o.y + 4 && ty < o.y + o.h - 4 && !crossesH(ty, Math.min(ox, rx), Math.max(ox, rx), [p.e.from, p.e.to])) {
            const pa: [number, number] = [ox, ty], pb: [number, number] = [rx, ty];
            if (rowT) { p.a = pa; p.b = pb; } else { p.a = pb; p.b = pa; }
            p.pts = [p.a, p.b]; p.curve = m.linesStraight ? "line" : "h"; continue;
          } }
        const r = rowT ? t : f, o = rowT ? f : t, id = rowT ? ct.id : cf.id, cy = r.y - (rowAbove.get(id) ? 28 : 8), cx = r.x + r.w / 2;
        const gx = o.x < r.x ? Math.min(...[...rects].filter(([k]) => m.cards.get(topCard(m, k))?.lane === m.cards.get(id)!.lane).map(([, q]) => q.x)) - 10 : Math.max(...[...rects].filter(([k]) => m.cards.get(topCard(m, k))?.lane === m.cards.get(id)!.lane).map(([, q]) => q.x + q.w)) + 10;
        const oe: [number, number] = rowT ? p.a : p.b, oy = oe[1];
        if (!crossesH(oy, Math.min(oe[0], gx), Math.max(oe[0], gx), [p.e.from, p.e.to]) && !crossesH(cy, Math.min(gx, cx), Math.max(gx, cx), [p.e.from, p.e.to])) {
          const pts: [number, number][] = [oe, [gx, oy], [gx, cy], [cx, cy], [cx, r.y]];
          if (rowT) { p.b = [cx, r.y]; p.pts = pts; } else { p.a = [cx, r.y]; p.b = oe; p.pts = pts.reverse(); }
          p.curve = "round"; continue;
        }
      }
    }
    const [ax, ay] = p.a, skip = [p.e.from, p.e.to];
    let [bx, by] = p.b;
    if (p.side === "bt" || p.side === "tb") {
      const t = rects.get(p.e.to)!, f = rects.get(p.e.from)!;
      // the copies of an "x2" pair climbing from a wide source land at a quarter and three quarters of the target (the
      // reference design's foreman arrows into picker field 31 and packer field 1; the review)
      const n = (copyN.get(p.e.from + ">" + p.e.to + "|" + p.e.step) ?? 0) + 1;
      let quarter = false;
      if (n > 1 && !narrow) { const qx = t.x + (t.w * ((p.copy ?? 0) + 0.5)) / n; if (qx > f.x + 12 && qx < f.x + f.w - 12) { p.a = [qx, ay]; bx = qx; quarter = true; } }
      // keep the line straight when the target is right above (or below): move its end over the source's port
      if (quarter) { /* both ends set */ }
      else if (ax > t.x + 12 && ax < t.x + t.w - 12) bx = ax;
      else if (bx > f.x + 12 && bx < f.x + f.w - 12 && !narrow) { /* source port moves under the target */ p.a = [bx, ay]; }
      p.b = [bx, by];
      if (!blocked(p.a[0], p.a[1], by, skip) && Math.abs(p.a[0] - bx) < 1) { p.pts = [p.a, [bx, by]]; p.curve = "v"; continue; }
      // up (or down) the gap beside the target, then into its side
      const gx = t.x - 8 > PAD ? t.x - 10 : t.x + t.w + 10, ty = t.y + t.h / 2;
      p.b = [gx < t.x ? t.x : t.x + t.w, ty];
      p.pts = [p.a, [gx, p.a[1] + (p.side === "bt" ? -10 : 10)], [gx, ty], p.b]; p.curve = "round"; continue;
    }
    if (p.side === "same") { const f = rects.get(p.e.from)!, t = rects.get(p.e.to)!; const gx = Math.max(f.x + f.w, t.x + t.w) + 14; p.a = [f.x + f.w, f.y + f.h / 2]; p.b = [t.x + t.w, t.y + t.h / 2]; p.pts = [p.a, [gx, p.a[1]], [gx, p.b[1]], p.b]; p.curve = "round"; continue; }
    // left to right (or back): a curve in the gap; when lanes in between hold cards on the way, through a free row
    const lo = Math.min(ax, bx), hi = Math.max(ax, bx);
    const mid = [...live].filter(([id, r]) => !skip.includes(id) && r.x > lo && r.x + r.w < hi);
    if (!mid.length || !crossesH((ay + by) / 2, lo, hi, skip) && !mid.some(([, r]) => r.y < Math.max(ay, by) && r.y + r.h > Math.min(ay, by))) { p.pts = [p.a, [bx, by]]; p.curve = m.linesStraight && clearSeg(p.a, [bx, by], skip) ? "line" : "h"; continue; }
    // a free row across the lanes in between: the free height nearest the straight line
    const want = (ay + by) / 2, cands: number[] = [];
    const ys = mid.map(([, r]) => r).sort((a, b) => a.y - b.y);
    cands.push(ys[0].y - 12); for (let i = 0; i + 1 < ys.length; i++) if (ys[i + 1].y - (ys[i].y + ys[i].h) > 12) cands.push((ys[i].y + ys[i].h + ys[i + 1].y) / 2); cands.push(ys.at(-1)!.y + ys.at(-1)!.h + 12);
    const cy = cands.filter((c) => !crossesH(c, lo, hi, skip)).sort((a, b) => Math.abs(a - want) - Math.abs(b - want))[0] ?? want;
    const x1 = Math.min(...mid.map(([, r]) => r.x)) - 8, x2 = Math.max(...mid.map(([, r]) => r.x + r.w)) + 8;
    p.pts = ax < bx ? [p.a, [x1, cy], [x2, cy], [bx, by]] : [p.a, [x2, cy], [x1, cy], [bx, by]]; p.curve = "h";
  }
  // ends at a pill: on the card's edge, level with (or under) the pill
  // an inner card's end: on its own edge, unless its holder says "ends: on this card" (then on the holder's edge; level with it)
  const ownEnd = (pill: string, holder: string) => pill.startsWith("card:") && !m.cards.get(holder)?.endsHere;
  // zero movement: a connector drawn again between the same ends keeps the path it had (the ends were spread
  // per step, so one arrow moved when its neighbour went; the Format page's market morning, steps 2 to 3)
  { const had = new Map<string, Placed>();
    for (const p of [...placed].sort((a, b) => a.e.step - b.e.step)) { if ((p as { labelOnly?: boolean }).labelOnly) continue; const k = `${p.e.from}>${p.e.to}|${p.e.fromPill ?? ""}|${p.e.toPill ?? ""}|${p.side}|${p.copy ?? 0}` /* each copy of an "x2" pair keeps its own path */, q = had.get(k);
      if (q) { p.a = [...q.a] as [number, number]; p.b = [...q.b] as [number, number]; p.pts = q.pts.map((x) => [...x] as [number, number]); p.curve = q.curve; } else had.set(k, p); } }
  for (const p of placed) { if (p.e.fromPill) pinToPill(p.pts, 0, rects.get(p.e.from)!, pillBox(p.e.fromPill, p.e.step), ownEnd(p.e.fromPill, p.e.from)); if (p.e.toPill) pinToPill(p.pts, 1, rects.get(p.e.to)!, pillBox(p.e.toPill, p.e.step), ownEnd(p.e.toPill, p.e.to)); }
  // draw: dimmed after their step, lit in it and in the last step; the role colours a connector (its source's by default)
  for (const p of placed) {
    const role = p.e.role ?? m.cards.get(p.e.from)!.role;
    if ((p as any).labelOnly) continue;
    items.push({ k: "path", pts: p.pts, curve: p.curve, ink: `role:${role}:wire`, dash: p.e.dash, arrow: true, from: p.e.step, on: edgeSteps(m, p.e.step, p.e), hot: lit(m, p.e.step), flow: !m.flowOff, id: `${p.e.from}>${p.e.to}`, bar: { edge: 1, from: m.cards.get(p.e.from)!.title, to: m.cards.get(p.e.to)!.title } });
  }
  // a relabel's words ride the line it relabels
  for (const e of es) { const r0 = relabelOf(m, e); if (!r0 || !e.label) continue; const p0 = placed.find((p) => p.e.step === r0.step && p.e.line === r0.line && (p.e.from === r0.from || p.e.from === r0.to) && (p.e.to === r0.to || p.e.to === r0.from) && (!e.copyLabel||(p.e.copy??0)===(r0.copy??0))); if (p0) placed.push({ ...p0, e: { ...e, from: p0.e.from, to: p0.e.to }, labelOnly: true } as Placed); }
  // labels: one per label, step and gap (a line of one pair keeps its own), on the line of the bundle's first connector, in the gap the layout reserved
  // a source that fans one label out to several targets (side to side) gets its own label at its own end (fault 4)
  const fanTo = new Map<string, Set<string>>();
  for (const p of placed) if (p.e.label && (p.side === "lr" || p.side === "rl")) { const k = `${p.e.label}|${p.e.step}|${p.e.from}`; (fanTo.get(k) ?? fanTo.set(k, new Set()).get(k)!).add(p.e.to); }
  const fansOut = (p: Placed) => (p.side === "lr" || p.side === "rl") && (fanTo.get(`${p.e.label}|${p.e.step}|${p.e.from}`)?.size ?? 0) > 1;
  const seen = new Map<string, Placed[]>();
  for (const p of placed) if (p.e.label) { const fan = fanTop.get(p), g = fan ? `fan|${p.e.label}|${p.e.step}|${p.e.to}|${ownLine(m,p.e)}` : `${p.e.label}|${p.e.step}|${ownLine(m, p.e)}|${fansOut(p) ? "src:" + p.e.from + "|" : ""}${p.side === "lr" || p.side === "rl" ? Math.round(Math.min(p.a[0], p.b[0])) : "v" + p.e.from}`; (seen.get(g) ?? seen.set(g, []).get(g)!).push(p); }
  const taken: (Rect & { on?: number[] })[] = []; // a label keeps clear only of labels drawn in one of its steps
  for (const group of seen.values()) {
    const p = group.slice().sort((a, b) => Math.min(a.a[1], a.b[1]) - Math.min(b.a[1], b.b[1]))[0];
    // a label in a tone is words beside its own line, near where it comes in (never moved off the line)
    if (p.e.tone) { const at = toneSpot(p.pts, p.e.label, rects, taken.filter((r) => !r.on || r.on.includes(p.e.step)), [p.e.from, p.e.to]); taken.push({ ...at.box, on: p.e.keep ? labelSteps(m, p.e) : [p.e.step] }); items.push({ k: "text", x: at.x, y: at.y, s: p.e.label, f: TONE_F, ink: `${p.e.tone}:ink`, anchor: at.anchor, bar: { "edge-label": p.e.label }, from: p.e.step, ...(p.e.keep ? { on: labelSteps(m, p.e) } : { to: p.e.step }), hot: lit(m, p.e.step) } as Item); continue; }
    const role = p.e.role ?? m.cards.get(p.e.from)!.role, t = p.e.label, cw = measure(t, "chip") + 18;
    let cx: number, cy: number;
    const fan = fanTop.get(p);
    if(p.e.copyLabel&&m.steps[p.e.step-1].edges.some(e=>e.from===p.e.from&&e.to===p.e.to&&e.copy!==p.e.copy&&e.label!==p.e.label)){
      cx=(p.a[0]+p.b[0])/2;const lineY=(p.a[1]+p.b[1])/2;cy=lineY+(p.e.copy!%2?4:-24)-Math.floor(p.e.copy!/2)*24;
    }
    else if (fan) { const t = rects.get(p.e.to)!, xs = fan.group.map((q) => fanTop.get(q)!.px), lft = rects.get(p.e.from)!.x < t.x; cx = ownLine(m,p.e)?fan.px+(lft?1:-1)*(cw/2+6):lft ? Math.max(...xs) + cw / 2 + 10 : Math.min(...xs) - cw / 2 - 10; cy = t.y - 24; }
    else if (group.length > 1 && (p.side === "tb" || p.side === "bt")) { const xs = group.map((g) => g.a[0]); cx = (Math.min(...xs) + Math.max(...xs)) / 2; cy = (p.a[1] + p.b[1]) / 2 - 10; } // one label over a vertical bundle: centred over all of it
    else if ((p.side === "lr" || p.side === "rl") && (() => { const cf = m.cards.get(p.e.from)!, ct = m.cards.get(p.e.to)!; return cf.lane === ct.lane && !!m.lanes[cf.lane]?.row && Math.abs(rects.get(p.e.from)!.y - rects.get(p.e.to)!.y) < 1; })()) {
      // neighbours of a row (layout: row): the label stands under the line, at the gap between them
      cx = (p.a[0] + p.b[0]) / 2; cy = Math.max(rects.get(p.e.from)!.y + rects.get(p.e.from)!.h, rects.get(p.e.to)!.y + rects.get(p.e.to)!.h) + 2;
    }
    else if (p.side === "lr" || p.side === "rl") {
      if (fansOut(p)) { /* centred in the gap between its source and the nearest target, over its own lines (the original's place) */ const src = rects.get(p.e.from)!, tg = group.map((g) => rects.get(g.e.to)!).filter(Boolean); const near = p.side === "lr" ? Math.min(...tg.map((r) => r.x)) : Math.max(...tg.map((r) => r.x + r.w)), mid = p.side === "lr" ? (src.x + src.w + near) / 2 : (near + src.x) / 2; cx = p.side === "lr" ? Math.max(src.x + src.w + cw / 2 + 8, Math.min(mid, near - cw / 2 - 8)) : Math.min(src.x - cw / 2 - 8, Math.max(mid, near + cw / 2 + 8)); cy = p.a[1] - 24; } else {
      // the label stands at the target's top corner on the side the bundle comes in (above a lone target: its one way in), clear of the arrowheads
      const src = rects.get(p.e.from)!, tgt = rects.get(p.e.to)!, lone = !m.lanes[m.cards.get(p.e.to)!.lane]?.cards.some((c) => c.id !== p.e.to);
      if (lone) { cx = tgt.x + tgt.w / 2; cy = tgt.y - 30; }
      else if (p.side === "lr") { cx = Math.max(src.x + src.w + cw / 2 + 2, tgt.x - cw / 2 - 4); cy = tgt.y - 8; }
      else { cx = Math.min(src.x - cw / 2 - 2, tgt.x + tgt.w + cw / 2 + 4); cy = tgt.y - 8; }
      }
    }
    else if (p.pts.length === 2) { cx = (p.pts[0][0] + p.pts[1][0]) / 2; cy = (p.pts[0][1] + p.pts[1][1]) / 2 - 10; }
    else { const k = Math.floor((p.pts.length - 1) / 2); cx = (p.pts[k][0] + p.pts[k + 1][0]) / 2; cy = (p.pts[k][1] + p.pts[k + 1][1]) / 2 - 10; }
    if (p.pts.length === 2 && Math.abs(p.pts[0][0] - p.pts[1][0]) < 1) cx += cw / 2 + 6; // a straight vertical line: its label beside it
    // a vertical bundle's label never sits on one of the bundle's own lines: it takes the widest gap between them ("x2" pairs)
    if (group.length > 1 && (p.side === "tb" || p.side === "bt")) {
      const xs = [...new Set(group.map((g) => Math.round(g.a[0])))].sort((u, v) => u - v);
      if (xs.some((x) => x > cx - cw / 2 - 4 && x < cx + cw / 2 + 4)) { let best = -1; for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] > best) { best = xs[i] - xs[i - 1]; cx = (xs[i] + xs[i - 1]) / 2; } }
    }
    // not on a card, not on another label: slide along the line's gap
    let tries = 0;
    const lon = edgeSteps(m, p.e.step, p.e), seenIn = (it: Item) => lon.some((k) => (it.on ? it.on.includes(k) : k >= (it.from ?? 1) && (!it.to || k <= it.to)));
    const onBox = () => labelObs.some((r) => r.k === "box" && cx + cw / 2 > r.x && cx - cw / 2 < r.x + r.w && cy + 20 > r.y && cy < r.y + r.h && seenIn(r));
    live = liveOf(m, rects, p.e);
    const hit = () => cy < 2 || onBox() || nav.deskHeads.some((r) => cx + cw / 2 > r.x && cx - cw / 2 < r.x + r.w && cy + 20 > r.y && cy < r.y + r.h) || [...live.values()].some((r) => cx + cw / 2 > r.x && cx - cw / 2 < r.x + r.w && cy + 20 > r.y && cy < r.y + r.h) || taken.some((r) => (!r.on || r.on.some((k) => lon.includes(k))) && cx + cw / 2 > r.x && cx - cw / 2 < r.x + r.w && cy + 20 > r.y && cy < r.y + r.h);
    // a label at its target's corner that meets a box tries the corner's other side, then along its line
    if (!fansOut(p) && (p.side === "lr" || p.side === "rl")) {
      const tgt = rects.get(p.e.to)!, lone = !m.lanes[m.cards.get(p.e.to)!.lane]?.cards.some((c) => c.id !== p.e.to);
      const len = p.pts.slice(1).reduce((a, q, i) => a + Math.hypot(q[0] - p.pts[i][0], q[1] - p.pts[i][1]), 0);
      const along = (fr: number): [number, number] => { let d = len * fr; for (let i = 1; i < p.pts.length; i++) { const [x0, y0] = p.pts[i - 1], [x1, y1] = p.pts[i], sl = Math.hypot(x1 - x0, y1 - y0); if (d <= sl || i === p.pts.length - 1) { const u = sl ? Math.min(1, d / sl) : 0; return [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u - 10]; } d -= sl; } return [cx, cy]; };
      // a label of ONE line stands on that line, from its middle outward (never at the target's corner first)
      const own: [number, number][] = group.length === 1 ? [0.5, 0.4, 0.6, 0.3, 0.7].map(along).map(([x, y]) => [x, y - 10]) : [];
      const cands: [number, number][] = [...own, [cx, cy], [cx, lone ? tgt.y + tgt.h + 10 : tgt.y + tgt.h - 12], ...[0.5, 0.35, 0.65, 0.2, 0.8].map(along)];
      const clampX = (x: number) => Math.max(PAD + cw / 2, Math.min(w - PAD - cw / 2, x));
      const ok = cands.find(([x, y]) => { cx = clampX(x); cy = y; return !hit(); });
      if (ok) { cx = clampX(ok[0]); cy = ok[1]; } else { cx = cands[0][0]; cy = cands[0][1]; }
    }
    while (hit() && tries++ < 12) cy += tries % 2 ? -24 * tries : 24 * tries;
    cx = Math.max(PAD + cw / 2, Math.min(w - PAD - cw / 2, cx));
    taken.push({ x: cx - cw / 2, y: cy, w: cw, h: 20, on: lon });
    if (p.e.tone) { items.push({ k: "text", x: cx, y: cy + 14, s: t, f: TONE_F, ink: `${p.e.tone}:ink`, anchor: "middle", bar: { "edge-label": t }, from: p.e.step, ...(p.e.keep ? { on: labelSteps(m, p.e) } : { to: p.e.step }), hot: lit(m, p.e.step) } as Item); continue; }
    items.push(...shift(chip(cx, cy, t, `role:${role}`, 0, "chip", { kind: "chip", label: t, "edge-label": t }).items, 0, 0, { from: p.e.step, ...((m.roles[role] ?? 0) === 0 || p.e.keep ? { on: (p as { labelOnly?: boolean }).labelOnly ? edgeSteps(m, p.e.step, p.e) : labelSteps(m, p.e) } : { to: p.e.step }), hot: lit(m, p.e.step) } /* a data label speaks in its own step; the line stays; a neutral (control, config) connector's label stays while its line shows (the original's config label at its last step) */));
  }
  return items;
}

// ---------------------------------------------------------------- the LLM view: the facts in order, per step
export function stageLlm(c: Compiled): string {
  const m = c.model, out: string[] = [];
  if (m.title) out.push(`${m.title}${m.note ? ` (${m.note})` : ""}`);
  const cardText = (k: Card) => cText(m, k);
  for (const l of m.lanes) {
    const cs = l.cards.filter((k) => k.from === 1);
    if (!cs.length && !l.more.length) continue;
    out.push(`${l.title || "Also"}${l.span ? ` (${l.across ? "across" : l.above ? "above" : "under"} ${l.span[0]} to ${l.span[1]})` : ""}: ${[...cs.map(cardText), ...l.more].join("; ")}.`);
  }
  for (const h of m.head) out.push(...h.block.facts(h.node, 0));
  const name = (id: string) => m.cards.get(id)?.title ?? id;
  m.steps.forEach((s, si) => {
    const k = si + 1, f: string[] = [];
    const shown = [...m.cards.values()].filter((c) => c.from === k && k > 1 && !(c.parent && m.cards.get(c.parent)!.from === k));
    if (shown.length) f.push(`Now shown: ${shown.map(cardText).join("; ")}.`);
    if (s.hide.length) f.push(`Gone: ${s.hide.map(name).join(", ")}.`);
    const groups = new Map<string, Edge[]>();
    for (const e of s.edges) { const g = `${e.label}|${e.tone}|${e.dash}|${e.back}`; (groups.get(g) ?? groups.set(g, []).get(g)!).push(e); }
    for (const es of groups.values()) {
      const end = (id: string, p?: string) => (p?.startsWith("badge:") ? `${m.cards.get(id)?.badges.find((x) => x.b === p.slice(p.lastIndexOf(".") + 1))?.s ?? p} (on ${name(id)})` : p ? `${m.cx.pills.get(p)?.s ?? p} (on ${name(id)})` : name(id)); // an end at a pill names it
      const pairs = es.map((e) => (e.back ? `${end(e.to, e.toPill)} to ${end(e.from, e.fromPill)}` : `${end(e.from, e.fromPill)} to ${end(e.to, e.toPill)}`));
      f.push(`${es[0].label ? es[0].label + ": " : ""}${pairs.join(", ")}${es[0].dash ? " (dashed)" : ""}.`);
    }
    if (s.cuts?.length) f.push(`Cut: ${s.cuts.map((x) => `${name(x.from)} to ${name(x.to)}`).join(", ")}.`);
    if (s.clear) f.push("The earlier connectors are gone.");
    if (s.all) f.push("Every connector of the scene shows.");
    for (const [ids, t] of s.tags) f.push(`${ids.map(name).join(", ")}: ${t}.`);
    for (const [id, t] of s.says) f.push(`${name(id)} says: ${t}.`);
    f.push(...cardFacts(m, k));
    for (const [id, t] of s.insides) f.push(`${name(id)} holds: ${t}.`);
    for (const h of m.head) f.push(...h.block.facts(h.node, k));
    for (const p of s.panels) f.push(...p.block.facts(p.node, k));
    for (const n of s.notes) f.push(n.length > 1 ? `${n[0]}: ${n.slice(1).join(" ")}` : n[0]);
    if (s.formula.length) f.push(s.formula.join("; "));
    for (const t of s.foot) f.push(t);
    for (const [r, t, tone] of s.keys) f.push(`Key (${r}${tone?", "+(tone==="acc"?"accent":tone):""}): ${t}.`);
    out.push(`${k}. ${s.title}: ${s.caption === s.title ? "" : s.caption}${f.length ? "\n   " + f.join("\n   ") : ""}`.replace(/: \n/, ":\n").replace(/: $/, ""));
  });
  return out.join("\n");
}
export type { Item, Problem };
/** hide: a hidden card's items show only in the steps it is shown (its place stays). */
function hideSteps(m: Model, id: string, its: Item[]): Item[] {
  const on = m.shownOn?.get(id); if (!on) return its;
  return its.map((it) => { const k = on.filter((j) => (it.on ? it.on.includes(j) : j >= (it.from ?? 1) && (!it.to || j <= it.to))); return { ...it, on: k.length ? k : [0] } as Item; });
}
/** The steps a connector of step `k` shows in: from k until a later step says `clear`, and every step that says `show all`. */
export function edgeSteps(m: Model, k: number, e?: Edge): number[] {
  const out: number[] = [];
  const seen = (id: string, j: number) => { const on = m.shownOn?.get(id); return !on || on.includes(j); };
  for (let j = k; j <= m.steps.length; j++) { if (j > k && m.steps[j - 1].clear) break; out.push(j); }
  m.steps.forEach((s, i) => { if (s.all && !out.includes(i + 1)) out.push(i + 1); });
  return e ? out.filter((j) => seen(e.from, j) && seen(e.to, j)) : out;
}
const lit = (m: Model, k: number) => [k, ...m.steps.flatMap((s, i) => (s.all && i + 1 !== k ? [i + 1] : []))];
/** A connector written again while the same one (same ends and direction) still shows draws no second line: it only
 * gives that line its words from this step (a scene's "rb --> m (bad): dropped" on the step-2 arrow). */
const relabels = new WeakMap<Model["steps"], Map<Edge, Edge>>();
function relabelOf(m: Model, e: Edge): Edge | undefined {
  let r = relabels.get(m.steps);
  if (!r) {
    r = new Map(); const all = m.steps.flatMap((s) => s.edges);
    for (const x of all) { const p = all.find((y) => y.step < x.step && y.from === x.from && y.to === x.to && !!y.back === !!x.back && (y.copy??0)===(x.copy??0) && !r!.has(y) && edgeSteps(m, y.step, y).includes(x.step)); if (p) r.set(x, p); }
    relabels.set(m.steps, r);
  }
  return r.get(e);
}
/** a connector's label shows in its steps until the same connector is written again with words: from that step the new
 * words show instead (one label, never two; the hero's step-6 repeat of its ledger line) */
function labelSteps(m: Model, e: Edge): number[] {
  const on = edgeSteps(m, e.step, e), later = m.steps.flatMap((s) => s.edges).filter((x) => { const r = x.label && x.step > e.step ? relabelOf(m, x) : undefined; return !!r && r.step === e.step && r.from === e.from && r.to === e.to && (r.copy??0)===(e.copy??0) && !!r.back === !!e.back; }).map((x) => x.step);
  return later.length ? on.filter((j) => j < Math.min(...later)) : on;
}
/** a phone label's key: one per label, step and line, and one per sender when the line has several (each picker's
 * POST on the hero; as the reference design and the wide stage draw them) */
function phoneLabelKey(m: Model, e: Edge): string {
  const same = m.steps[e.step - 1].edges.filter((x) => x.line === e.line && x.label === e.label);
  const fans = new Set(same.map((x) => x.from)).size > 1 && new Set(same.map((x) => x.to)).size > 1; // several senders, each to several targets
  return `${e.label}|${e.step}|${ownLine(m, e)}${fans ? "|" + e.from : ""}`;
}
/** A connector line of one pair keeps its own label; the pairs of a line like "a, b -> c: label" share one per gap. */
const pairsOf = new WeakMap<Model["steps"], Map<string, number>>();
function ownLine(m: Model, e: Edge): string {
  let n = pairsOf.get(m.steps);
  if (!n) { n = new Map(); for (const s of m.steps) for (const x of s.edges) {const key=`${x.step}|${x.line}|${x.hop??""}`;n.set(key,(n.get(key)??0)+1);} pairsOf.set(m.steps, n); }
  return (n.get(`${e.step}|${e.line}|${e.hop??""}`) ?? 0) > 1 ? "" : `${e.line}:${e.hop??""}`;
}
