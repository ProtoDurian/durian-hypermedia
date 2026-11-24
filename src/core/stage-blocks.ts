// This package is the source of this file: edit it here. It began as a copy of the private prototype's composed stage (0.7.0).
import {boxTone} from "./stage-box-paint";
// The composed stage's built-in blocks: the phase strip (track), the panels a step swaps in
// (grid, rows, map, list) and, in their own files, the worksheet (stage-sheet.ts) and time (stage-time.ts).
// Each block: parse its lines, lay itself out in a box of a given width, list its facts for the LLM view.
import { most, type Item, type Line, type StageBlock, type Box, type LayoutOut, type ParseCtx, StageError, LINE_H, registerBlock, measure, wrap, wrapRoom, parts, colon, verdict, chip, shift, textLines, longestWord } from "./stage-core";
import "./stage-sheet";
import { hasTimeAxis } from "./stage-time";
import "./stage-slanes";
import "./stage-units";
import "./stage-panels2";
import "./stage-bins";
import "./stage-columns";
import "./stage-bars";
import "./stage-nest"; // wrappers as boxes inside boxes
import "./stage-cells"; // a wordless cell row in a panel

// ---------------------------------------------------------------- track: a phase strip, and the step's place on it
// track: client find, open | server read, answer | store save (role, then its phases; groups split by " | ")
// carry: one request (a chip under the phase the step is at)
// where: region east · tenant demo (one line under the strip)
// form: chips (one row of two-line chips: the first word over the rest; no arrows)
// place: beside where (wide stage: the where words at the left, the phases on the same line at the right)
// in a step: at open (or at open..answer)
type Track = { phases: { role: string; name: string }[]; carry: string; where: string; at: Map<number, [number, number]>; line: number; scope:ParseCtx; chips?: boolean; beside?: boolean; arrows?: boolean; roleChips?:boolean };
registerBlock({
  word: "track", kind: "head", ops: ["at"], more: ["carry", "where", "form", "place"],
  parse(inp, ctx): Track {
    const phases = parts(inp.arg, " | ").flatMap((g) => {
      const sp = g.indexOf(" "); if (sp < 0) throw new StageError(inp.line, `a track group is "role phase, phase": "${g}" names no phase`);
      const role = g.slice(0, sp); if (!ctx.roles.has(role)) ctx.problem(inp.line, `"${role}" is not a role of this page; the page declares ${[...ctx.roles].join(", ") || "none"}`);
      return parts(g.slice(sp + 1), ",").map((name) => ({ role, name }));
    });
    if (phases.length < 2) throw new StageError(inp.line, "a track has at least 2 phases");
    if (phases.length > 24) throw new StageError(inp.line, "a track has at most 24 phases");
    return { phases, carry: "", where: "", at: new Map(), line: inp.line,scope:ctx };
  },
  op(t: Track, op, ctx) {
    if (op.word === "carry") { t.carry = op.arg; return; }
    if (op.word === "where") { t.where = op.arg; return; }
    if (op.word === "place") { if (op.arg.replace(/^:\s*/, "").trim() !== "beside where") { ctx.problem(op.line, `a track's place is "place: beside where" (the phases at the right of the where line)`); return; } t.beside = true; return; }
    if (op.word === "form") { const v = op.arg.replace(/^:\s*/, "").trim(); if (v !== "chips" && v !== "chips | arrows" && v !== "chips | roles") { ctx.problem(op.line, `a track form is "form: chips" (one row of two-line chips, the first word over the rest, no arrows) or "form: chips | arrows" (the same, an arrow between neighbours), or form: chips | roles (declared colours with an active outline)`); return; } t.chips = true;if(v==="chips | roles")t.roleChips=true;else delete t.roleChips; t.arrows = v === "chips | arrows" || undefined; return; } // "| arrows"
    const [a, b] = op.arg.includes("..") ? op.arg.split("..").map((x) => x.trim()) : [op.arg.trim(), op.arg.trim()];
    const ia = t.phases.findIndex((p) => p.name === a), ib = t.phases.findIndex((p) => p.name === b);
    if (ia < 0 || ib < 0) { if (op.shared) return false; ctx.problem(op.line, `"${ia < 0 ? a : b}" is not a phase of the track (${t.phases.map((p) => p.name).join(", ")})`); return; }
    t.at.set(op.step, [Math.min(ia, ib), Math.max(ia, ib)]);
  },
  layout(t: Track, box: Box): LayoutOut {
    if (t.chips) return chipsTrack(t, box);
    const items: Item[] = [], n = t.phases.length, gap = 9;
    const need = Math.max(...t.phases.map((p) => measure(p.name, "sub") + 14));
    // on a phone, one row of pills each as wide as its own name (12 px of air) when equal widths would wrap
    const own = t.phases.map((p) => measure(p.name, "sub") + 12), ownSum = own.reduce((a, b) => a + b, 0) + (n - 1) * gap;
    const fit = box.narrow && !t.carry && Math.floor((box.w + gap) / (need + gap)) < n && ownSum <= box.w;
    const per = fit ? n : Math.max(1, Math.min(n, Math.floor((box.w + gap) / (need + gap))));
    const journey=!hasTimeAxis(t.scope),rows = Math.ceil(n / per), w0 = (box.w - (per - 1) * gap) / per, rowH = 26 + (t.carry ? 24 : 6)+(journey&&rows>1?12:0);
    const ws = fit ? own.map((o) => o + ((box.w - ownSum) * o) / (ownSum - (n - 1) * gap)) : own.map(() => w0), xs = ws.map((_, i) => (fit ? ws.slice(0, i).reduce((a, b) => a + b, 0) + i * gap : (i % per) * (w0 + gap)));
    t.phases.forEach((p, i) => {
      const x = xs[i], w = ws[i], y = Math.floor(i / per) * rowH, hot: number[] = [], done: number[] = [];
      for (const [k, [a, b]] of t.at) { if (i >= a && i <= b) hot.push(k); else if (i < a) done.push(k); }
      const edge=i&&journey?{edge:`phase:${i-1}>phase:${i}`,from:`phase:${i-1}`,to:`phase:${i}`}:undefined;
      if (i % per) items.push({ k: "tri", x: x - gap / 2 - 3, y: y + 13, ink: "muted",bar:edge });
      else if(edge){const px=(per-1)*(w0+gap)+3,py=y-rowH+28;items.push({k:"path",pts:[[px,py],[px,y-8],[3,y-8],[3,y-2]],ink:"line-2",arrow:true,bar:edge});}
      // rc.2 MUST 4: only the step's place looks current; the last phase was thick and never faded, so two read as "now"
      items.push({ k: "box", x, y, w, h: 26, fill: `role:${p.role}:soft`, stroke: `role:${p.role}:line`, r: 8, cls: "stg-phase", id: `phase:${i}`, bar: { kind: "track", id: `phase:${i}`, label: p.name, role: p.role }, hot, dim: [...t.at.keys()].filter((k) => !hot.includes(k)) });
      items.push({ k: "text", x: x + w / 2, y: y + 17, s: wrap(p.name, w - 8, "sub", 1)[0], f: "sub", ink: "ink", anchor: "middle", hot, dim: [...t.at.keys()].filter((k) => !hot.includes(k)), tip: p.name });
      // rc.2 MUST 5: the carried chip is centred under its phase but never past the strip's ends (a phone's first phase is narrow)
      if (t.carry) for (const [k, [a]] of t.at) if (a === i) items.push(...shift(chip(carryX(x + w / 2, t.carry, box.w), y + 29, t.carry, "acc") /* the carried thing keeps one colour along the strip */.items, 0, 0, { from: k, to: k }));
    });
    let h = rows * rowH;
    if (t.where) { const l = textLines(0, h, box.w, [t.where], "sub", "muted"); items.push(...l.items); h += l.h; }
    return { h: h + 4, items };
  },
  facts(t: Track, step) {
    if (step === 0) return [`Phases: ${t.phases.map((p) => p.name).join(", ")}.${t.where ? ` Where: ${t.where}.` : ""}`];
    const at = t.at.get(step); if (!at) return [];
    const names = t.phases.slice(at[0], at[1] + 1).map((p) => p.name);
    return [`At: ${names.join(" to ")}${t.carry ? ` (carrying ${t.carry})` : ""}.`];
  },
} satisfies StageBlock<Track>);

/** "form: chips": one row of chips as wide as the stage allows, each two lines: the phase's first word
 * (a number, most often) in bold over the rest of its name, which wraps inside the chip (never cut); no arrows. A phone
 * (or any width too narrow for one row) wraps the row into as many rows as it needs, every chip as wide as the widest
 * word asks. The step's place lights its chips, the others go faint, as in the strip; one place for every step. */
/** a carried chip's centre: under its phase, moved in so the whole chip stays inside the strip (0..w) */
const carryX = (cx: number, s: string, w: number) => { const cw = chip(0, 0, s, "acc").w; return Math.max(cw / 2, Math.min(w - cw / 2, cx)); };
function chipsTrack(t: Track, box: Box): LayoutOut {
  const items: Item[] = [], n = t.phases.length, gap = t.arrows ? 16 : 8, PADX = 8, journey = !hasTimeAxis(t.scope);
  const split = (s: string) => { const sp = s.indexOf(" "); return sp < 0 ? [s, ""] : [s.slice(0, sp), s.slice(sp + 1).trim()]; };
  const parts0 = t.phases.map((p) => split(p.name));
  // "place: beside where": on a wide stage the where words sit at the left and the chips, one line each
  // (the first word in bold, then the rest), at the right of the same line, when both fit; else (and on a phone) as below
  // (on a phone, or when they do not fit beside it: rows of the same one-line chips, the where words under them)
  if (t.beside && t.where && !t.carry) {
    const cw = Math.max(...parts0.map(([a, b]) => (measure(a, "small-b") + (b ? 5 + measure(b, "sub") : 0)) * 1.1)) + 2 * PADX + 6, g = t.arrows ? 20 : 12;
    const sum = n * cw + (n - 1) * g, ww = measure(t.where, "sub");
    if (!box.narrow && ww + 24 + sum <= box.w) return besideWhere(t, box, parts0, cw, box.w - sum, 0, g, PADX);
    if (cw <= box.w) return besideWhere(t, box, parts0, cw, 0, Math.max(1, Math.floor((box.w + g) / (cw + g))), g, PADX);
  }
  // the least chip width: its widest single word (or the number) never cut
  const least = Math.max(...parts0.map(([a, b]) => Math.max(measure(a, "small-b"), ...b.split(" ").filter(Boolean).map((w) => measure(w, "sub"))) + 2 * PADX));
  const per = Math.max(1, Math.min(n, Math.floor((box.w + gap) / (least + gap)))), rows = Math.ceil(n / per);
  const cw = (box.w - (per - 1) * gap) / per;
  const lines = parts0.map(([, b]) => (b ? wrap(b, cw - 2 * PADX, "sub", Infinity) : []));
  const ch = 10 + LINE_H["small-b"] + Math.max(0, ...lines.map((l) => l.length)) * LINE_H.sub + 4, rowH = ch + (t.carry ? 30 : 0) + gap;
  t.phases.forEach((p, i) => {
    const x = (i % per) * (cw + gap), y = Math.floor(i / per) * rowH, hot: number[] = [];
    for (const [k, [a, b]] of t.at) if (i >= a && i <= b) hot.push(k);
    // a phase before the step's place is done (a chip in the good tone over it, its words
    // in the good tone's ink), the place is lit, a later phase is faded; a step with no place leaves the strip plain
    const done = t.roleChips?[]:[...t.at].filter(([, [a]]) => i < a).map(([k]) => k), dim = t.roleChips?[]:[...t.at].filter(([, [, b]]) => i > b).map(([k]) => k), when = { hot, dim };
    // before the first place no phase is reached: every phase is future, a surface chip with a
    // dashed grey border and its words in ink (the role-filled chip is hidden then: its border would show through the dashes)
    const all = Array.from({ length: Math.max(1, t.scope.steps) }, (_, k) => k + 1), first = Math.min(Infinity, ...t.at.keys()), future = t.roleChips?[]:all.filter((k) => k < first);
    // "form: chips | arrows": a small arrow in the gap before each chip that has a neighbour on its left in the same row
    if (t.arrows && i % per) items.push({ k: "tri", x: x - gap / 2 - 3, y: y + ch / 2, ink: "muted", ...(journey ? { bar: { edge: `phase:${i - 1}>phase:${i}`, from: `phase:${i - 1}`, to: `phase:${i}` } } : {}) });
    items.push({ k: "box", x, y, w: cw, h: ch, fill: `role:${p.role}:soft`, stroke: `role:${p.role}:line`, r: 8, cls: "stg-phase", id: `phase:${i}`, bar: { kind: "track", id: `phase:${i}`, label: p.name, role: p.role }, ...when, ...(future.length ? { on: all.filter((k) => !future.includes(k)) } : {}) });
    if (future.length) items.push({ k: "box", x, y, w: cw, h: ch, fill: "surface", stroke: "line-2", dash: true, r: 8, cls: "stg-phase stg-phase-future", on: future, bar: { kind: "track", id: `phase:${i}`, label: p.name, tone: "future" } });
    if (done.length) items.push({ k: "box", x, y, w: cw, h: ch, fill: "good:soft", stroke: "good:line", r: 8, cls: "stg-phase stg-phase-done", on: done, bar: { kind: "track", id: `phase:${i}`, label: p.name, tone: "good" } });
    // each word once per step, in its chip's look: plain (or lit), done (good ink) or faded (muted ink at full strength,
    // 4.5:1 on the faded fill); the copies show on steps that never overlap
    const plain = all.filter((k) => !dim.includes(k) && !done.includes(k) && !future.includes(k));
    const words = (it: Item): Item[] => (dim.length || done.length || future.length ? [{ ...it, hot, on: plain } as Item, { ...it, ink: "good:ink", on: done } as Item, { ...it, ink: "muted", on: dim } as Item, { ...it, ink: "ink", on: future } as Item] : [{ ...it, hot } as Item]).filter((x) => (x as any).on?.length !== 0);
    // the number and the name are ONE text run in one style ("2 Announced", as the
    // original's label), the number on the first line and the name's wrapped lines under it, each line centred
    let label = parts0[i][0]; const breaks: number[] = [], rest = parts0[i][1]; let at = 0;
    for (const l of lines[i]) { let sp = false; while (rest[at] === " ") { at++; sp = true; } if (sp || !breaks.length) label += " "; breaks.push(label.length); label += l; at += l.length; }
    items.push(...words({ k: "text", x: x + cw / 2, y: y + 6 + LINE_H["small-b"] - 3, s: label, f: "sub", ink: "ink", anchor: "middle", ...(breaks.length ? { breaks, pitch: LINE_H.sub } : {}) }));
    if (t.carry) for (const [k, [a]] of t.at) if (a === i) items.push(...shift(chip(carryX(x + cw / 2, t.carry, box.w), y + ch + 3, t.carry, "acc").items, 0, 0, { from: k, to: k }));
  });
  let h = rows * rowH - gap;
  if (t.where) { const l = textLines(0, h + 4, box.w, [t.where], "sub", "muted"); items.push(...l.items); h += l.h + 4; }
  return { h: h + 4, items };
}

/** one-line phase chips of one width: beside the where words (per 0: one row from x0), or in rows of per under which the
 * where words go (a phone) */
function besideWhere(t: Track, box: Box, parts0: string[][], cw: number, x0: number, per: number, gap: number, PADX: number): LayoutOut {
  // beside the where words a chip is 28 tall with 8 under it (the original rail); in rows (a phone) 24 tall, 6 apart
  const items: Item[] = [], ch = per ? 24 : 28, rg = per ? 6 : 8, all = Array.from({ length: Math.max(1, t.scope.steps) }, (_, k) => k + 1), n = t.phases.length;
  const rows = per ? Math.ceil(n / per) : 1, wy = per ? rows * (ch + rg) + 4 : ch / 2 + 4;
  for (const l of per ? wrap(t.where, box.w, "sub", Infinity) : [t.where]) items.push({ k: "text", x: 0, y: (items.length ? 16 * items.length : 0) + (per ? wy + 8 : wy), s: l, f: "sub", ink: "muted" });
  const whereH = per ? items.length * 16 + 4 : 0;
  t.phases.forEach((p, i) => {
    const x = per ? (i % per) * (cw + gap) : x0 + i * (cw + gap), y = per ? Math.floor(i / per) * (ch + rg) : 0, hot: number[] = [];
    // "form: chips | arrows": a small arrow in the gap before a chip with a neighbour on its left in the same row
    if (t.arrows && (per ? i % per : i)) items.push({ k: "tri", x: x - gap / 2 - 3, y: y + ch / 2, ink: "muted", ...(!hasTimeAxis(t.scope) ? { bar: { edge: `phase:${i - 1}>phase:${i}`, from: `phase:${i - 1}`, to: `phase:${i}` } } : {}) });
    for (const [k, [a, b]] of t.at) if (i >= a && i <= b) hot.push(k);
    // a phase before the step's place is done (good), the place is lit, a later phase is not reached yet: a dashed outline
    // on the stage colour, its words muted (as the original rail); a step with no place has reached none
    const done = t.roleChips?[]:[...t.at].filter(([, [a]]) => i < a).map(([k]) => k), dim = t.roleChips?[]:all.filter((k) => !t.at.has(k) || i > t.at.get(k)![1]), when = { hot };
    // (the role chip is hidden on those steps: its solid border would show through the dashes)
    items.push({ k: "box", x, y, w: cw, h: ch, fill: `role:${p.role}:soft`, stroke: `role:${p.role}:line`, r: 8, cls: "stg-phase", id: `phase:${i}`, bar: { kind: "track", id: `phase:${i}`, label: p.name, role: p.role }, ...when, ...(dim.length ? { on: all.filter((k) => !dim.includes(k)) } : {}) });
    if (dim.length) items.push({ k: "box", x, y, w: cw, h: ch, fill: "surface", stroke: "line-2", dash: true, r: 8, cls: "stg-phase stg-phase-later", on: dim, bar: { kind: "track", id: `phase:${i}`, label: p.name, tone: "future" } }); // the phase on those steps (its role chip is hidden)
    if (done.length) items.push({ k: "box", x, y, w: cw, h: ch, fill: "good:soft", stroke: "good:line", r: 8, cls: "stg-phase stg-phase-done", on: done, bar: { kind: "track", id: `phase:${i}`, label: p.name, tone: "good" } });
    const plain = all.filter((k) => !dim.includes(k) && !done.includes(k));
    const words = (it: Item): Item[] => (dim.length || done.length ? [{ ...it, hot, on: plain } as Item, { ...it, ink: "good:ink", on: done } as Item, { ...it, ink: "muted", on: dim } as Item] : [{ ...it, hot } as Item]).filter((q) => (q as any).on?.length !== 0);
    // the phase's whole name centred in the chip as ONE text run in one style ("2 Announced", as the original's label;
    // a lone number run paired with other numbers of the scene in the bar's stale check)
    items.push(...words({ k: "text", x: x + cw / 2, y: y + ch / 2 + 4, s: p.name, f: "sub", ink: "ink", anchor: "middle" }));
  });
  return { h: per ? rows * (ch + rg) - rg + 4 + whereH : ch + 8, items };
}

// ---------------------------------------------------------------- grid N: cards in N columns, each with a verdict
// grid 2
// host: web-1 | 192.0.2.10 · up [+ kept]
// host: web-9 | 192.0.2.19 · draining [- not ready: drop]
type GridItem = { tone?:string; dashed?:boolean; role: string; title: string; subs: string[]; ok?: boolean; v?: string; chip?: boolean };
type Grid = { cols: number; items: GridItem[]; reserve?: boolean /* the same cards carry a value in another step: on a phone keep its row (390); the wide stage keeps the reference design's heights and landings */ };
const rowItem = (l: Line, ctx: { roles: Set<string>; problem: (n: number, m: string) => void }): GridItem => {
  const dashed=l.t.endsWith(" [dashed]"),vd = verdict(dashed?l.t.slice(0,-9):l.t), c = colon(vd.text);
  const tone=c?boxTone(c[0],l.n):undefined;if(c&&tone)c[0]=tone.text;
  if (!c || c[0].includes(" ")) throw new StageError(l.n, `a grid item is "role: title | second line", with an optional verdict [+ kept] or [- why]`);
  if (!ctx.roles.has(c[0])) ctx.problem(l.n, `"${c[0]}" is not a role of this page; the page declares ${[...ctx.roles].join(", ") || "none"}`);
  const [title, ...subs] = c[1].split(" | ").map((x) => x.trim());
  return { role: c[0], title, subs,...(tone?.tone?{tone:tone.tone}:{}),...(dashed?{dashed:true}:{}), ok: vd.ok, v: vd.v, chip: vd.chip };
};
registerBlock({
  word: "grid", kind: "panel",
  parse(inp, ctx): Grid {
    const cols = inp.arg ? +inp.arg : 2;
    if (!Number.isInteger(cols) || cols < 1 || cols > 6) throw new StageError(inp.line, "grid takes a number of columns, 1 to 6: grid 2");
    if (!inp.body.length) throw new StageError(inp.line, "a grid lists its items indented under it");
    if (inp.body.length > 60) throw new StageError(inp.line, "a grid holds at most 60 items");
    return { cols, items: inp.body.map((l) => rowItem(l, ctx)) };
  },
  layout(g: Grid, box: Box): LayoutOut {
    const vw = Math.max(0, ...g.items.map((it) => (it.v && !it.chip ? measure((it.ok ? "✓ " : "✗ ") + it.v, "sub") + 26 : 0)));
    const need = Math.max(...g.items.map((it) => Math.max(longestWord(it.title, "title"), ...it.subs.map((s) => longestWord(s, "sub"))) + 24)) + (vw ? Math.max(vw, 110) + 14 : 0);
    const cols = Math.max(1, Math.min(g.cols, Math.floor((box.w + 12) / (need + 12)))), w0 = (box.w - (cols - 1) * 12) / cols;
    // a wide row of plain cards keeps them card-sized and spreads them (not wide bands)
    const capped = !box.narrow && cols > 1 && !vw && w0 > Math.max(300, need), w = capped ? Math.max(300, need) : w0, gx = capped ? (box.w - cols * w) / (cols - 1) : 12;
    const side = !box.narrow && vw && w - Math.max(vw, 110) - 14 > 140 /* a phone puts the verdict under the name, so the name keeps one line */, bw = side ? Math.min(Math.max(vw, 150), w * 0.42) : w - 20;
    // a phone: the whole name on its own lines, the verdict chip (its own width) at the end of the card's last line when
    // every card's last line leaves it room; else under the name (112 -> ~60 each)
    const vText = (it: (typeof g.items)[number]) => (it.ok ? "✓ " : "✗ ") + it.v;
    const pside = !!(box.narrow && vw && g.items.every((it) => {
      if (!it.v || it.chip) return !it.chip;
      const t = wrap(it.title, w - 22, "title", most(2)), sl = it.subs.flatMap((x) => wrap(x, w - 22, "sub", most(2)));
      const last = sl.length ? measure(sl.at(-1)!, "sub") : measure(t.at(-1)!, "title");
      return 12 + last + 14 + measure(vText(it), "sub") + 26 + 10 <= w;
    }));
    // Compact verdict records in several authored columns are worksheet rows; a separately boxed single-column summary is a card.
    const roomy = (!side && !pside) || g.items.some((it) => it.chip); // side verdicts: a compact list; a chip under each card: room around it
    const items: Item[] = [], hs: number[] = [];
    // a card line takes the lines it needs: a clamp never drops a fact (raziel, rc.3: the layers story lost 'bytes 1001 to 1059')
    const lay = g.items.map((it) => { const tw = side && !it.chip ? w - bw - 30 : w - 22; const t = wrap(it.title, tw, "title", most(2)), s = it.subs.flatMap((x) => wrapRoom(x, tw, "sub", Infinity, 8)); return { t, s, h: (roomy ? 18 : pside ? 8 : 10) + t.length * LINE_H.title + s.length * LINE_H.sub + ((it.v && (!(side || pside) || it.chip)) || (g.reserve && roomy && box.narrow) ? 44 : 0) + (roomy ? 16 : pside ? 8 : 6) }; });
    for (let r = 0; r * cols < g.items.length; r++) hs.push(Math.max(...lay.slice(r * cols, r * cols + cols).map((x) => x.h)));
    const top = box.narrow || !roomy ? 0 : 38; // air above a grid of cards with a chip under each
    let y = 0;
    g.items.forEach((it, i) => {
      const r = Math.floor(i / cols), x = (i % cols) * (w + gx), yy = top + hs.slice(0, r).reduce((a, b) => a + b + (roomy ? 14 : pside ? 6 : 8), 0) /* a phone's compact list: 6 px gaps */, h = hs[r], L = lay[i];
      items.push({ k: "box", x, y: yy, w, h, fill: it.dashed?"none":it.tone?`${it.tone}:soft`:`role:${it.role}:soft`, stroke: it.dashed?"muted":it.tone?`${it.tone}:ink`:`role:${it.role}:line`, ...(it.dashed?{dash:true}:{}), thick: !roomy, r: 9, cls: "scn-shape", ...(!it.tone&&!it.dashed?{role:it.role}:{}), bar: { kind: it.title && (roomy || g.cols === 1) ? "card" : "worksheet-row", label: it.title, ...(!it.tone&&!it.dashed?{role:it.role}:it.tone&&!it.dashed?{tone:it.tone}:{}), column: `g${i % cols}` } });
      let ty = yy + (roomy ? 18 : pside ? 8 : 10), lastY = 0;
      for (const t of L.t) { ty += LINE_H.title; items.push({ k: "text", x: x + 12, y: ty - 4, s: t, f: "title", ink: it.dashed?"muted":it.tone?`${it.tone}:ink`:"ink" }); lastY = ty - 4; }
      for (const s of L.s) { ty += LINE_H.sub; items.push({ k: "text", x: x + 12, y: ty - 3, s, f: "sub", ink: it.tone&&!it.dashed?`${it.tone}:ink`:"muted" }); lastY = ty - 3; }

      if (it.v) {
        const tone = it.chip ? `role:${it.role}` : it.ok ? "good" : "bad", sd = side && !it.chip, cbw = it.chip ? Math.min(w - 20, measure(it.v, "sub") + 30) : pside ? measure(vText(it), "sub") + 26 : bw, vx = sd ? x + w - bw - 10 : pside && !it.chip ? x + w - cbw - 10 : x + 10, vy = sd ? yy + h / 2 - 11 : pside && !it.chip ? lastY - 14 : yy + h - 36; /* clear of the name's descenders */
        items.push({ k: "box", x: vx, y: vy, w: cbw, h: 22, fill: `${tone}:soft`, stroke: `${tone}:line`, r: 6, cls: "stg-verdict", bar: { kind: "chip", label: it.v } }, { k: "text", x: vx + cbw / 2, y: vy + 15, s: wrap((it.chip ? "" : it.ok ? "✓ " : "✗ ") + it.v, cbw - 8, "sub", 1)[0], f: "sub", ink: `${tone}:ink`, anchor: "middle", tip: it.v });
      }
      y = Math.max(y, yy + h);
    });
    return { h: y, items };
  },
  facts: (g: Grid) => g.items.map((it) => `${it.title}${it.subs.length ? ` (${it.subs.join("; ")})` : ""}${it.v ? (it.chip ? `: ${it.v}` : `: ${it.ok ? "kept" : "dropped"}${it.v === (it.ok ? "kept" : "dropped") ? "" : ", " + it.v}`) : ""}.`),
} satisfies StageBlock<Grid>);

/** words of several pieces, each in its own ink, wrapped as one run of body text at width w (a word wider than w
 * is broken by wrap); line baselines as textLines puts them */
/** on a phone, two neighbouring text columns whose every cell fits half the row's width
 * (no word broken, two lines at most) share a line of the row, the same pairs in every full row */
/** a text cell drawn as a boxed chip (a "[chip]" row): an inset box around its words, stamped as a chip for the bar */
function cellChip(c: Cell, x: number, y: number, w: number, h: number): Item {
  const label = c.lines.map((l) => toneOf(l)[0]).join(" ");
  // a dropped cell ("-..."): a dashed chip (the original's "drops it, no drain")
  // a role cell ("=> role: words" in a [chip] row): the same chip in the role's colours
  if (c.role) return { k: "box", x, y, w, h, fill: `role:${c.role}:soft`, stroke: `role:${c.role}:line`, r: 6, role: c.role, ...(c.dropped ? { dash: true } : {}), cls: "scn-shape stg-cell-chip", bar: { kind: "chip", label, role: c.role } };
  return { k: "box", x, y, w, h, fill: "surface", stroke: "line", r: 6, ...(c.dropped ? { dash: true } : {}), cls: c.dropped ? "scn-shape stg-cell-chip stg-cell-dropped" : "scn-shape stg-cell-chip", bar: { kind: "chip", label } };
}
function phonePairs(rs: { cells: Cell[] }[], r: { cells: Cell[] }, half: number): Set<number> {
  const pairs = new Set<number>(), nc = Math.max(0, ...rs.map((q) => q.cells.length)), full = rs.filter((q) => q.cells.length === nc);
  const fits = (j: number) => full.length > 0 && full.every((q) => { const c = q.cells[j]; return !c.chip && !c.blank && c.lines.every((l) => longestWord(toneOf(l)[0], "sub") <= half && wrap(toneOf(l)[0], half, "sub", 9).length <= 2); });
  if (r.cells.length === nc) for (let j = 0; j + 1 < nc; j++) if (fits(j) && fits(j + 1)) { pairs.add(j); j++; }
  return pairs;
}
function flowLine(segs: { s: string; ink: string; lead?: "sep" | "gap" }[], x0: number, y0: number, w: number): LayoutOut {
  // a phone row, flowed: a piece that fits the width stays whole (a short cell never splits); a longer one flows by word.
  // Between cells a " · " (sep), between a cell's lines a wider gap: neither is drawn at a line's start or end
  const sp = measure(" ", "body"), sepW = measure(" · ", "body"), gapW = 2 * sp + 4;
  // a row that needs two lines breaks between cells when both halves then fit a line: the first cells on one line,
  // the rest on the next (no short last cell alone on a line; the same break in every row of a table)
  const oneW = (gs: typeof segs) => gs.reduce((a, g, i) => a + (i ? (g.lead === "sep" ? sepW : g.lead === "gap" ? gapW : sp) : 0) + measure(g.s, "body"), 0);
  if (oneW(segs) > w) for (let k = 1; k < segs.length; k++) if (segs[k].lead === "sep" && oneW(segs.slice(0, k)) <= w && oneW(segs.slice(k)) <= w) {
    const a = flowLine(segs.slice(0, k), x0, y0, w), b = flowLine([{ ...segs[k], lead: undefined }, ...segs.slice(k + 1)], x0, y0 + a.h, w);
    return { h: a.h + b.h, items: [...a.items, ...b.items] };
  }
  const items: Item[] = []; let x = 0, line = 0;
  const yAt = () => y0 + (line + 1) * LINE_H.body - 4;
  for (const g of segs) {
    const whole = measure(g.s, "body") <= w, chunks = whole ? [g.s] : g.s.split(" ").filter(Boolean).flatMap((wd) => wrap(wd, w, "body", 99));
    let cur: Item | undefined;
    chunks.forEach((c, i) => {
      const cw = measure(c, "body"), lead = i ? "space" : g.lead ?? "space", lw = x > 0 ? (lead === "sep" ? sepW : lead === "gap" ? gapW : sp) : 0;
      if (x > 0 && x + lw + cw > w) { line++; x = 0; cur = undefined; }
      const lw2 = x > 0 ? lw : 0;
      if (lw2 && lead === "sep") items.push({ k: "text", x: x0 + x + (sepW - measure("·", "body")) / 2, y: yAt(), s: "·", f: "body", ink: "muted" });
      if (cur && lead === "space" && lw2) { (cur as any).s += " " + c; }
      else { cur = { k: "text", x: x0 + x + lw2, y: yAt(), s: c, f: "body", ink: g.ink as any }; items.push(cur); }
      x += lw2 + cw;
    });
  }
  return { h: (line + 1) * LINE_H.body, items };
}

// ---------------------------------------------------------------- rows: a table of aligned cells per row
// rows
// web-1; 192.0.2.10 | hash = 0x51; bucket 3 | => server: server 3 | as planned
// ! a line of its own, in the warning tone, between rows
// A cell's lines are split by "; "; a line that starts "! " is a warning, "* " the accent, "~ " muted; "=> role: text"
// is a chip in that role. A first line "^ a | b | c" heads the columns. `rows plain` is a compact table: no box per row,
// one line per row (a cell's lines joined), chips as words in their role's ink. `rows <role>` (or `rows plain <role>`) draws
// the rows in that family: each row's box in its fill and border, a plain row's words in its ink.
type Cell = { lines: string[]; chip?: { role: string; s: string }; role?: string /* "=> role: words" in a [chip] row: the row's boxed cell in that role's colours, its own height */; blank?: boolean /* "_": nothing drawn, the column kept */; dropped?: boolean /* "-...": a dashed chip in a [chip] row */ };
type Rows = { rows: ({ cells: Cell[]; boxed?: boolean /* "[chip]": each cell a boxed chip in the row */ } | { note: string })[]; head: string[]; plain: boolean; role?: string /* "rows <role>": the rows in that family's fill and border, plain rows in its ink */ };
const toneOf = (l: string): [string, string] => (l.startsWith("! ") ? [l.slice(2), "warn:ink"] : l.startsWith("* ") ? [l.slice(2), "acc:ink"] : l.startsWith("~ ") ? [l.slice(2), "muted"] : [l, ""]);
registerBlock({
  word: "rows", kind: "panel",
  parse(inp, ctx): Rows {
    const words = (inp.arg ?? "").split(/\s+/).filter(Boolean), plain = words.includes("plain"), named = words.filter((w) => w !== "plain");
    if (named.length > 1 || words.length - named.length > 1) throw new StageError(inp.line, `rows takes "plain" (a compact table), a role (the rows in its colours) or both: "rows plain", "rows table", "rows plain table"`);
    const role = named[0];
    if (role && !ctx.roles.has(role)) ctx.problem(inp.line, `"${role}" is not a role of this page; the page declares ${[...ctx.roles].join(", ") || "none"} (rows takes "plain", a role or both)`);
    const hl = inp.body[0]?.t.startsWith("^ ") ? inp.body[0] : null, body = hl ? inp.body.slice(1) : inp.body;
    if (!body.length) throw new StageError(inp.line, "rows lists its rows indented under it");
    if (body.length > 40) throw new StageError(inp.line, "rows holds at most 40 rows");
    for (const l of body) if (l.t.startsWith("^ ")) throw new StageError(l.n, "the column heads (^ a | b) are the first line under rows");
    const head = hl ? hl.t.slice(2).split(" | ").map((x) => (x.trim() === "_" ? "" : x.trim())) : []; // "_": a column with no head
    const rows = body.map((l) => {
      if (!l.t.includes(" | ")) return { note: l.t };
      // "... [chip]" at the end of a row: each of its cells is drawn as a boxed chip inside the row's own height
      const boxed = / \[chip\]$/.test(l.t), lt = boxed ? l.t.replace(/ \[chip\]$/, "") : l.t;
      return { ...(boxed ? { boxed } : {}), cells: lt.split(" | ").map((c): Cell => {
        const t = c.trim();
        if (t.startsWith("=> ")) { const q = colon(t.slice(3)); if (!q) throw new StageError(l.n, `a chip cell is "=> role: text"`); if (!ctx.roles.has(q[0])) ctx.problem(l.n, `"${q[0]}" is not a role of this page; the page declares ${[...ctx.roles].join(", ") || "none"}`); return boxed ? { lines: parts(q[1], " ; "), role: q[0] } : { lines: [], chip: { role: q[0], s: q[1] } }; }
        if (t === "_") return { lines: [], blank: true };
        if (t === "-") throw new StageError(l.n, `a dropped cell is "- words": the words that are dropped (a blank cell is "_")`);
        if (t.startsWith("- ")) return { lines: parts(t.slice(2), " ; "), dropped: true };
        return { lines: parts(t, " ; ") };
      }) };
    });
    const ns = new Set(rows.flatMap((r) => ("cells" in r ? [r.cells.length] : [])));
    if (ns.size > 1) throw new StageError(inp.line, `every row has the same number of cells (here ${[...ns].join(" and ")})`);
    if (head.length && ns.size && !ns.has(head.length)) throw new StageError(hl!.n, `${head.length} column heads but the rows have ${[...ns][0]} cells`);
    return { rows, head, plain, ...(role && ctx.roles.has(role) ? { role } : {}) };
  },
  layout(t: Rows, box: Box): LayoutOut {
    const rs = t.rows.filter((r): r is { cells: Cell[] } => "cells" in r), nc = rs[0]?.cells.length ?? 0;
    // "rows <role>": each row's box in the family's fill and border; a plain row's words in its ink
    const frame = t.role ? { fill: `role:${t.role}:plane`, stroke: `role:${t.role}:line`, role: t.role } : { fill: "surface", stroke: "line-2" };
    const plainInk = t.role ? `role:${t.role}:ink` : "ink";
    const one = (c: Cell) => (c.chip ? c.chip.s : c.lines.map((l) => toneOf(l)[0]).join("  "));
    const cellNeed = (c: Cell) => (t.plain ? measure(one(c), "body") + 8 : c.chip ? measure(c.chip.s, "body") + 28 : Math.max(0, ...c.lines.map((l) => measure(toneOf(l)[0], "sub") + 4)));
    const need = Array.from({ length: nc }, (_, j) => Math.max(40, t.head[j] ? measure(t.head[j], "sub") + 8 : 0, ...rs.map((r) => cellNeed(r.cells[j]))));
    const inner = box.w - 24 - (nc - 1) * 16, sum = need.reduce((a, b) => a + b, 0);
    const stacked = box.narrow || sum > inner * 1.25;
    // a plain table that must shrink keeps each column at least as wide as its longest word, so an address or a prefix
    // is not broken inside (raziel, rc.3: routing table T3 at 800 split '198.51.100.200/31'); the others give up the room
    const least = Array.from({ length: nc }, (_, j) => (t.plain ? Math.max(0, ...rs.map((r) => Math.max(0, ...one(r.cells[j]).split(" ").map((x) => measure(x, "body") + 8)))) : 0)), lsum = least.reduce((a2, b) => a2 + b, 0);
    const ws = stacked ? need.map(() => box.w - 24) : need.map((x) => (x * inner) / sum);
    if (!stacked && t.plain && lsum < inner && ws.some((x, j) => x < least[j])) {
      const low = ws.map((x, j) => x < least[j]), fixed = least.reduce((a2, b, j) => a2 + (low[j] ? b : 0), 0), rest = ws.reduce((a2, b, j) => a2 + (low[j] ? 0 : b), 0);
      ws.forEach((x, j) => { ws[j] = low[j] ? least[j] : Math.max(least[j], (x * (inner - fixed)) / rest); });
    }
    const xs = ws.map((_, j) => 12 + (stacked ? 0 : ws.slice(0, j).reduce((a, b) => a + b + 16, 0)));
    const items: Item[] = []; let y = 0;
    // the column heads, small and muted, over the cells (a phone with stacked cells lists them on one line)
    if (t.head.length) {
      if (stacked) { const l = textLines(12, 0, box.w - 24, [t.head.filter(Boolean).join(" · ")], "sub", "muted"); items.push(...l.items); y = l.h + 4; }
      else { t.head.forEach((s, j) => s && items.push({ k: "text", x: t.plain ? Math.round(xs[j]) : xs[j], y: 14, s: wrap(s, ws[j], "sub", 1)[0], f: "sub", ink: "muted", tip: s, bar: { column: `r${j}` } })); y = 22; }
    }
    // a phone's compact row (the journey's owner rows 190 -> ~125 px): cells' lines at 17 px, 4 px between
    // cells, and a chip at the end of the line before it when it fits there (else on its own line); every word kept, 11 px+.
    // Two short text columns share a line in two halves: see rowPairs
    const halfW = (box.w - 36) / 2;
    const compact = (r: { cells: Cell[]; boxed?: boolean }, pairs: Set<number>, y: number) => {
        const its: Item[] = []; let ly = y + 8, prev: { x: number; y: number } | null = null, pairTop = 0, pairEnd = 0, ends = 0;
        r.cells.forEach((c, j) => {
          if (c.chip) {
            const cw = measure(c.chip.s, "sub") + 18, ls = wrap(c.chip.s, box.w - 24 - 18, "sub", 3), long = ls.length > 1 || cw > box.w - 24;
            const at = !long && prev && prev.x + 10 + cw <= box.w - 12 ? { x: prev.x + 10, y: prev.y - 14 } : null;
            const bx = at ? at.x : 12, by = at ? at.y : ly, bw = long ? box.w - 24 : cw, bh = 20 + (ls.length - 1) * 17;
            its.push({ k: "box", x: bx, y: by, w: bw, h: bh, fill: `role:${c.chip.role}:soft`, stroke: `role:${c.chip.role}:line`, thick: true, r: 7, cls: "scn-shape", role: c.chip.role, bar: { kind: "chip", label: c.chip.s, role: c.chip.role } }, ...ls.map((cs, q) => ({ k: "text", x: bx + bw / 2, y: by + 14 + q * 17, s: cs, f: "sub", ink: `role:${c.chip!.role}:ink`, anchor: "middle", tip: c.chip!.s }) as Item));
            if (!at) { ly += bh + 4; prev = null; } else ends++;
            return;
          }
          const right = pairs.has(j - 1), cx = right ? 12 + halfW + 12 : 12, cw = pairs.has(j) || right ? halfW : box.w - 24;
          if (c.blank) return; // "_": nothing drawn
          if (pairs.has(j)) pairTop = ly; if (right) { pairEnd = ly; ly = pairTop; }
          const top = ly, at0 = its.length;
          c.lines.forEach((l, k) => { const [txt, tone] = toneOf(l); for (const s of wrap(txt, cw, "sub", most(3))) { its.push({ k: "text", x: cx, y: ly + 13, s, f: "sub", bar: { column: `r${j}` }, ink: tone || (k ? "muted" : "ink") }); prev = { x: cx + measure(s, "sub"), y: ly + 13 }; ly += 17; } });
          if ((r as { boxed?: boolean }).boxed) its.splice(at0, 0, cellChip(c, cx - 4, top + 1, cw + 8, ly - top + 1)); // 4 px round the words: two halves stay 4 px apart
          if (right) ly = Math.max(ly, pairEnd);
          ly += 4;
        });
        return { its, ly, ends };
    };
    // a row pairs its two short columns when that makes it shorter and every chip keeps its place at the end of a line
    const rowPairs = (r: { cells: Cell[] }) => { const pp = phonePairs(rs, r, halfW); if (!pp.size) return pp; const a = compact(r, pp, 0), b = compact(r, new Set(), 0); return a.ly < b.ly && a.ends >= b.ends ? pp : new Set<number>(); };
    for (const r of t.rows) {
      if ("note" in r) { const l = textLines(6, y, box.w - 12, [r.note], "sub", "muted"); items.push(...l.items); y += l.h + 4; continue; }
      if (t.plain) {
        // one line per row: a cell's lines joined, chips as words in their role's ink; a phone wraps the joined row
        const ink = (c: Cell) => (c.chip ? `role:${c.chip.role}:ink` : toneOf(c.lines[0] ?? "")[1] || plainInk);
        if (stacked) {
          // a phone wraps the joined row, each cell's line in its own tone (a moved value stays toned: )
          const segs = r.cells.flatMap((c, j) => (c.chip ? [{ s: c.chip.s, ink: `role:${c.chip.role}:ink` }] : c.lines.map((l) => ({ s: toneOf(l)[0], ink: toneOf(l)[1] || plainInk }))).map((g, q) => ({ ...g, lead: (q ? "gap" : "sep") as "gap" | "sep" })));
          const fl = flowLine(segs, 12, y, box.w - 24); items.push(...fl.items); y += fl.h + 6; continue;
        }
        // x on a whole pixel: thin stems ("11") at a fractional x blur into grey and lose their role colour
        // a cell takes the lines it needs: a cut cell dropped a fact (raziel, rc.3: the layers story's routing table T3 at 800 lost
        // 'chosen' and the /31 /30 /26 prefixes); a row of one-line cells keeps its 24 px. Widths by measure(), the page font's
        // (raziel on ec6cf6ab: the wider drawn estimate narrowed T4's other columns and wrapped cells that fit)
        const cl = r.cells.map((c, j) => wrap(one(c), ws[j], "body", Infinity)), n = Math.max(1, ...cl.map((x) => x.length));
        r.cells.forEach((c, j) => cl[j].forEach((s, q) => items.push({ k: "text", x: Math.round(xs[j]), y: y + 17 + q * LINE_H.body, s, f: "body", ink: ink(c), tip: one(c), bar: { column: `r${j}` } })));
        y += 24 + (n - 1) * LINE_H.body; continue;
      }
      if (stacked) {
        const { its, ly } = compact(r, rowPairs(r), y);
        const h = ly - 4 + 8 - y;
        items.push({ k: "box", x: 0, y, w: box.w, h, ...frame, r: 9, cls: "scn-frame", bar: { kind: "worksheet-row" } }, ...its); y += h + 8; continue;
      }
      const chipLines = (c: Cell, w: number) => wrap(c.chip!.s, w - 8, "body", most(1)); // a phone: a long chip takes more lines
      // cells side by side (a wide stage): a cell's lines at the sub line height and a pad of 18, a row of two lines ~50 px
      // as the originals draw it; stacked cells keep 19 and 20
      const ls = stacked ? 19 : LINE_H.sub, pad = stacked ? 20 : 18;
      const cellH = (c: Cell, w: number) => (c.chip ? 32 + (chipLines(c, w).length - 1) * LINE_H.body : c.lines.reduce((a, l) => a + wrap(toneOf(l)[0], w, "sub", most(3)).length * ls, 0));
      const half = 0, pairs = new Set<number>();
      const wOf = (j: number) => (pairs.has(j) || pairs.has(j - 1) ? half : ws[j]), xOf = (j: number) => (pairs.has(j - 1) ? xs[j] + half + 12 : xs[j]);
      const hs = r.cells.map((c, j) => cellH(c, wOf(j)));
      const slotH = hs.map((x, j) => (pairs.has(j) ? Math.max(x, hs[j + 1] ?? 0) : pairs.has(j - 1) ? 0 : x));
      const h = (stacked ? slotH.reduce((a, b, j) => a + b + (pairs.has(j - 1) ? 0 : 6), 0) : Math.max(...hs)) + pad;
      const its: Item[] = [{ k: "box", x: 0, y, w: box.w, h, ...frame, r: 9, cls: "scn-frame", bar: { kind: "worksheet-row" } }];
      let sy = y + 10;
      r.cells.forEach((c, j) => {
        const cy = stacked ? (pairs.has(j - 1) ? sy - slotH[j - 1] - 6 : sy) : y + pad / 2 + (h - pad - hs[j]) / 2, cw = wOf(j), cx = xOf(j);
        if (c.chip) its.push({ k: "box", x: cx, y: cy, w: cw, h: 32 + (chipLines(c, cw).length - 1) * LINE_H.body, fill: `role:${c.chip.role}:soft`, stroke: `role:${c.chip.role}:line`, thick: true, r: 7, cls: "scn-shape", role: c.chip.role, bar: { kind: "chip", label: c.chip.s, role: c.chip.role } }, ...chipLines(c, cw).map((cs, q) => ({ k: "text", x: cx + cw / 2, y: cy + 20 + q * LINE_H.body, s: cs, f: "body", ink: `role:${c.chip!.role}:ink`, anchor: "middle", tip: c.chip!.s }) as Item));
        else { if (r.boxed && !c.blank) its.push(cellChip(c, cx - 6, y + 4, cw + 12, h - 8)); let ly = cy; c.lines.forEach((l, k) => { const [txt, tone] = toneOf(l); for (const s of wrap(txt, cw, "sub", most(3))) { its.push({ k: "text", x: cx, y: ly + ls - 5, s, f: "sub", bar: { column: `r${j}` }, ink: tone || (k ? "muted" : "ink") }); ly += ls; } }); }
        if (!pairs.has(j - 1)) sy += slotH[j] + 6;
      });
      items.push(...its); y += h + 10;
    }
    return { h: y, items };
  },
  facts: (t: Rows) => [...(t.head.length ? [`Columns: ${t.head.filter(Boolean).join(" | ")}`] : []), ...t.rows.map((r) => ("note" in r ? r.note.replace(/^! /, "") : r.cells.map((c) => (c.chip ? c.chip.s : c.lines.map((l) => toneOf(l)[0]).join(", "))).join(" | ")))],
} satisfies StageBlock<Rows>);

// ---------------------------------------------------------------- map: one thing on the left, what it becomes on the right
// map relabel
// server: web-1
// port 8080
// to
// + kept: name; + kept: zone; - dropped: debug
type MapP = { label: string; role: string; title: string; left: string[]; right: { ok: boolean; s: string }[] };
registerBlock({
  word: "map", kind: "panel",
  parse(inp, ctx): MapP {
    const to = inp.body.findIndex((l) => l.t === "to");
    const first = inp.body[0] && colon(inp.body[0].t);
    if (!first || to < 1) throw new StageError(inp.line, `a map is: its first line "role: title", lines about it, a line "to", then "+ kept; - dropped" items`);
    if (!ctx.roles.has(first[0])) ctx.problem(inp.body[0].n, `"${first[0]}" is not a role of this page; the page declares ${[...ctx.roles].join(", ") || "none"}`);
    const right = inp.body.slice(to + 1).flatMap((l) => parts(l.t, ";").map((x) => { if (x[0] !== "+" && x[0] !== "-") throw new StageError(l.n, `an item after "to" starts with + (kept) or - (dropped)`); return { ok: x[0] === "+", s: x.slice(1).trim() }; }));
    return { label: inp.arg, role: first[0], title: first[1], left: inp.body.slice(1, to).map((l) => l.t), right };
  },
  layout(p: MapP, box: Box): LayoutOut {
    const items: Item[] = [], narrow = box.narrow || box.w < 620;
    const lw = narrow ? box.w : box.w * 0.42, aw = narrow ? 0 : Math.max(70, measure(p.label, "sub") + 20), rw = narrow ? box.w : box.w - lw - aw;
    const left = textLines(14, 28, lw - 28, p.left, "sub", "ink-2");
    const per = rw > 420 ? 2 : 1, cw = (rw - 24 - (per - 1) * 8) / per;
    const lh = Math.max(36 + left.h, narrow ? 0 : Math.ceil(p.right.length / per) * 28 + 20);
    items.push({ k: "box", x: 0, y: 0, w: lw, h: lh, fill: `role:${p.role}:soft`, stroke: `role:${p.role}:line`, r: 10, cls: "scn-shape", role: p.role }, { k: "text", x: 14, y: 21, s: p.title, f: "title", ink: "ink" }, ...left.items);
    let rx = lw + aw, ry = 0;
    if (narrow) { items.push({ k: "path", pts: [[box.w / 2, lh + 2], [box.w / 2, lh + 30]], ink: `role:${p.role}:line`, arrow: true }, { k: "text", x: box.w / 2 + 10, y: lh + 20, s: p.label, f: "sub", ink: "muted" }); rx = 0; ry = lh + 34; }
    else items.push({ k: "path", pts: [[lw + 6, lh / 2], [lw + aw - 6, lh / 2]], ink: `role:${p.role}:line`, arrow: true }, { k: "text", x: lw + aw / 2, y: lh / 2 - 8, s: p.label, f: "sub", ink: "muted", anchor: "middle" });
    const rh = Math.ceil(p.right.length / per) * 28 + 20;
    items.push({ k: "box", x: rx, y: ry, w: rw, h: narrow ? rh : lh, fill: "none", stroke: "line-2", r: 10, dash: true });
    p.right.forEach((it, j) => {
      const x = rx + 12 + (j % per) * (cw + 8), y = ry + 10 + Math.floor(j / per) * 28, tone = it.ok ? "good" : "bad", s = wrap(it.s, cw - 16, "sub", 1)[0];
      items.push({ k: "box", x, y, w: cw, h: 22, fill: `${tone}:soft`, stroke: `${tone}:line`, r: 6 }, { k: "text", x: x + 8, y: y + 15, s, f: "sub", ink: it.ok ? "ink" : "bad:ink", strike: !it.ok, tip: it.s });
    });
    return { h: narrow ? ry + rh : lh, items };
  },
  facts: (p: MapP) => [`${p.title}${p.left.length ? ` (${p.left.join("; ")})` : ""}, ${p.label}: kept ${p.right.filter((r) => r.ok).map((r) => r.s).join(", ") || "nothing"}; dropped ${p.right.filter((r) => !r.ok).map((r) => r.s).join(", ") || "nothing"}.`],
} satisfies StageBlock<MapP>);

// ---------------------------------------------------------------- list: key and value lines, kept and struck items
// list Settings
// timeout: 30 s
// retries: 3
// - the old flag
// list Replays | roomy (rows with the reference design's thick spacing; filling a card)
type ListP = { title: string; tone?:string; roomy?: boolean; rows: (({ k: string; v: string } | { ok: boolean; s: string })&{tone?:string;rowTone?:string})[] };
/** "| roomy" rows, measured on the reference design's a scene (at a 1178 px stage: title to first row and row
 * pitch 28 px; 42 px under the last row; its phone is the same drawing scaled to 0.73: 21 and 31): the gap between rows,
 * the first row's top and the room under the last row's baseline */
const ROOMY = { wide: { gap: 12, top: 36, under: 42 }, phone: { gap: 5, top: 29, under: 31 } };
registerBlock({
  word: "list", kind: "panel",
  parse(inp): ListP {
    if (!inp.body.length) throw new StageError(inp.line, "a list has its lines indented under it: key: value, + kept, - struck");
    const m = /^(.*?)\s*\|\s*(\S+)$/.exec(inp.arg);
    if (m && m[2] !== "roomy") throw new StageError(inp.line, `a list takes one option after "|": roomy ("list ${m[1]} | roomy"), not "${m[2]}"`);
    const title=boxTone(m?m[1]:inp.arg,inp.line);
    return { title:title.text,...(title.tone?{tone:title.tone}:{}), ...(m ? { roomy: true } : {}), rows: inp.body.map((l) => { if (l.t.startsWith("- ") || l.t.startsWith("+ ")) return { ok: l.t[0] === "+", s: l.t.slice(2) }; const rowTone=/^\((good|bad|warn|accent)\)\s+/.exec(l.t),line=rowTone?l.t.slice(rowTone[0].length):l.t;const c = colon(line); if (!c) throw new StageError(l.n, `a list line is "key: value", "+ kept" or "- struck"`); const toned=/^\((good|bad|warn|accent)\)\s+/.exec(c[1]);return { k:c[0], v:toned?c[1].slice(toned[0].length):c[1],...(rowTone?{rowTone:rowTone[1]==="accent"?"acc":rowTone[1]}:{}),...(toned?{tone:toned[1]==="accent"?"acc":toned[1]}:rowTone?{tone:rowTone[1]==="accent"?"acc":rowTone[1]}:{}) }; }) };
  },
  layout(p: ListP, box: Box): LayoutOut {
    const kw = Math.min(box.w * 0.4, Math.max(0, ...p.rows.map((r) => ("k" in r ? measure(r.k, "small-b") + 16 : 0))));
    // a phone: 4 px between rows (6 wide), the first row 2 px closer to the title
    const R = p.roomy ? ROOMY[box.narrow ? "phone" : "wide"] : null;
    const items: Item[] = [], rg = R ? R.gap : box.narrow ? 4 : 6; let y = R && p.title ? R.top : p.title ? (box.narrow ? 28 : 30) : 10;
    if (p.title) items.push({ k: "text", x: 14, y: 21, s: p.title, f: "title", ink:"ink" });
    for (const r of p.rows) {
      // the key column is as wide as its widest key, up to 40% of the panel; a longer key wraps inside it, so it never
      // runs into its value (the row is as tall as the taller of the two)
      if ("k" in r) { const v = wrap(r.v, box.w - kw - 32, "sub", most(3)), ks = wrap(r.k, kw - 10, "small-b", most(3)); ks.forEach((s, i) => items.push({ k: "text", x: 14, y: y + 13 + i * LINE_H.sub, s, f: "small-b", ink:r.rowTone?`${r.rowTone}:ink`:"ink-2" })); v.forEach((s, i) => items.push({ k: "text", x: 14 + kw, y: y + 13 + i * LINE_H.sub, s, f: "sub", ink:r.tone?`${r.tone}:ink`:"ink" })); y += Math.max(v.length, ks.length) * LINE_H.sub + rg; }
      else { const s = wrap(r.s, box.w - 40, "sub", most(2)); s.forEach((t, i) => items.push({ k: "text", x: 26, y: y + 13 + i * LINE_H.sub, s: t, f: "sub", ink: r.ok ? "good:ink" : "bad:ink", strike: !r.ok })); items.push({ k: "text", x: 14, y: y + 13, s: r.ok ? "+" : "−", f: "small-b", ink: r.ok ? "good:ink" : "bad:ink" }); y += s.length * LINE_H.sub + (R ? rg : 6); }
    }
    // roomy: the room under the last row's baseline (y - rg - 3) as measured; else 6 px under the last row
    const h = R ? y - rg - 3 + R.under : y + 6;
    items.unshift({ k: "box", x: 0, y: 0, w: box.w, h, fill:p.tone?`${p.tone}:soft`:"surface", stroke:p.tone?`${p.tone}:ink`:"line-2", r: 9, cls: "scn-frame", ...(p.title?{bar:{kind:"card",label:p.title,...(p.tone?{tone:p.tone}:{})}}:{}) });
    return { h, items };
  },
  facts: (p: ListP) => [`${p.title ? p.title + ": " : ""}${p.rows.map((r) => ("k" in r ? `${r.k}: ${r.v}` : `${r.ok ? "kept" : "struck"}: ${r.s}`)).join("; ")}.`],
} satisfies StageBlock<ListP>);
