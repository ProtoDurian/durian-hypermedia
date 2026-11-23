// This package is the source of this file: edit it here. It began as a copy of the private prototype's composed stage (0.7.0).
// The composed stage's cards: what a card holds and how it is drawn. A card is one kind on every step:
// its place and size are set once for the whole scene (the largest of its steps), and a step only changes its words,
// its tone, its pills and its marks. tools/stage.ts places the cards in lanes and bands and calls these.
//
// host h: barn keeper | baskets: 2 <- a card
// worker w1: worker one [- OFF] | serves <- a card inside it (one level), with a state word on its title row
// + (a) barrow a; (b) barrow b <- badges
// + (a) <- a letter chip before the title (no row of its own)
// pill p1,p2: route a · ok; route b · slow <- pills, a stack at the card's foot; a step can move them
// tokens: sum by ( a, b ) ( pick( x ) ) <- token chips, in order, wrapped
// keys: Name; Kind; Owner <- a record: keys on the left, "..." until a step fills them
// spacing: roomy <- the record's rows spaced wider (ROOMY_GAP more each)
// ends: on this card <- arrows to or from the cards inside it end on this card's edge
//
// Step words (each from its step on, until changed): text id: lines | line; state id: [+ ON]; tone ids bad (or off);
// ghost ids (or off); dash ids (or off); move p1,p2 to card; fill id Key, Key: value; value. This step only:
// light p1: note (a pill lit, with a note at its right end); chip id tok, tok: tone | remark.
// Pure: no DOM. Hand-written linear scans; loops over author text charge docBudget.
import { badgeGeo } from "./stage-phone"; // badge rows on a phone
import { docBudget } from "./stage-budget";
import { type Item, type Line, type ParseCtx, type Font, StageError, LINE_H, measure, wrap, wrapRoom, longestWord, parts, colon, verdict, range, expandIds, ID_RE } from "./stage-core";

export let CARD_PX = 11;
let CARD_PT = 10;
/** a card's side and top padding, tighter on a phone (the stage sets it around a narrow layout) */
export let SUB_MAX = 3; // a card second line's lines; 8 on a phone
export let TITLE_MAX = 2; // a card title's lines; 3 on a phone
let PHONE_CARDS = false;
export const setCardPad = (phone: boolean) => { PHONE_CARDS = phone; ROOMY_GAP = phone ? 4 : 9; CARD_PX = phone ? 7 : 11; CARD_PT = phone ? 7 : 10; TITLE_MAX = phone ? 8 : 2; SUB_MAX = phone ? 8 : 3; HEAD_F = phone ? "title" : "big"; };
// a "** words" headline: big on a wide stage; on a phone the title size (13.5 px, bold), so the card grows no taller than a title line
export let HEAD_F: Font = "big";
export const MAX_KIDS = 12, MAX_PILLS = 64, MAX_TOKENS = 64, MAX_KEYS = 24;
const TONES = ["good", "bad", "warn", "accent"];
/** a tone word to its paint ("accent" paints with the page's acc tokens) */
const paintOf = (t: string) => (t === "accent" ? "acc" : t);
const CORNER_X = 26, CORNER_W = CORNER_X + 8; // a corner x ("cross ids corner": the original's big x) and its gap
const TAG_W = 17; // a title-row letter chip ("+ (a)")
const PILL_H = 22, PILL_GAP = 5, TOK_H = 20, TOK_GAP = 6, TOK_PX = 8, KID_GAP = 8, REC_GAP = 12;
let ROOMY_GAP = 9; // a phone: 4

// ---------------------------------------------------------------- the model
export type State = { s: string; tone: string };
export type Card = {
  id: string; role: string; title: string; subs: string[]; badges: { b: string; s: string }[]; tag?: string; lane: number; from: number; line: number;
  kids: string[]; parent?: string; pills: string[]; tokens: string[]; keys: string[]; roomy?: boolean; endsHere?: boolean; state?: State;
  /** "role id under A..B: title" in a "layout: row" lane: the card stands under row cards A to B, as wide as they are */
  under?: [string, string];
  /** the stage's "inside" chip row at the card's foot (tools/stage.ts) */
  inside?: boolean;
  /** "badges: stacked": its badges one per row, top to bottom */
  stacked?: boolean;
  /** "badges: stacked plain": the same rows, words only, no letter chip (the letters still name the rows for ends) */
  plainBadges?: boolean;
  /** a record key written "Key = value" starts with that value instead of "..." */
  vals0?: Record<string, string>;
};
export type Pill = { id: string; s: string; role: string; home: string; line: number };
/** what a step changes on cards (each from its step on unless said) */
export type CardStep = {
  text: [string, string[]][]; title: [string, string][]; state: [string, State | null][]; tone: [string, string | null][]; ghost: [string, boolean][]; dash: [string, boolean][]; cross: [string, boolean][]; crossC: [string, boolean][];
  move: [string, string][]; lit: [string, string][]; chips: { card: string; idx: number[]; tone: string; remark: string; keep?: boolean }[]; fill: [string, string, string][];
};
export type Cards = { pills: Map<string, Pill>; steps: CardStep[]; align: boolean };
export const newCards = (): Cards => ({ pills: new Map(), steps: [], align: false });
const newStep = (): CardStep => ({ text: [], title: [], state: [], tone: [], ghost: [], dash: [], cross: [], crossC: [], move: [], lit: [], chips: [], fill: [] });

/** the least the stage needs from its model here */
export type CardHost = { cards: Map<string, Card>; cx: Cards; roles: Record<string, number>; steps: { light: string[]; dark?: boolean; show: string[]; says?: [string, string, string?][] }[]; head?: { block: { ops?: string[] } }[]; shownOn?: Map<string, number[]> };
/** a card's items, kept to the steps it is shown in (show and hide); a card with no show or hide keeps them all */
export function keepShown(h: CardHost, id: string, its: Item[]): Item[] {
  const on = h.shownOn?.get(id); if (!on) return its;
  return its.map((it) => { const k = on.filter((j) => (it.on ? it.on.includes(j) : j >= (it.from ?? 1) && (!it.to || j <= it.to))); return { ...it, on: k.length ? k : [0] } as Item; });
}

// ---------------------------------------------------------------- parsing a card line and what is indented under it
/** "role ids: title; title | sub | sub" -> the cards it declares (not yet registered) */
export function parseCardLine(t: string, n: number, lane: number): Card[] {
  const c = colon(t);
  if (!c) throw new StageError(n, `this line does not read: a card is "role id: title | second line"`);
  const sp = c[0].indexOf(" ");
  if (sp < 0) throw new StageError(n, `a card is "role id: title": "${c[0]}" names no id`);
  const role = c[0].slice(0, sp), idText = c[0].slice(sp + 1).trim();
  const r = range(idText);
  if (!r && idText.includes("..")) throw new StageError(n, `"${idText}" is not a range: write first..last with the same letters and at most 64 numbers (p1..p6)`);
  const ids = r ?? parts(idText, ",");
  const [titles0, ...subs] = c[1].split(" | ").map((x) => x.trim());
  const v = verdict(titles0), titles = v.v !== undefined ? v.text : titles0;
  const state: State | undefined = v.v !== undefined ? { s: v.v, tone: v.chip ? "role" : v.ok ? "good" : "bad" } : undefined;
  const ts = ids.length > 1 ? parts(titles, ";") : [titles.trim()]; // one id: a ";" is part of its title
  if (ts.length > 1 && ts.length !== ids.length) throw new StageError(n, `${ids.length} ids but ${ts.length} titles: give one title per id (a; b; c), or one for all`);
  return ids.map((id, k) => {
    if (!ID_RE.test(id)) throw new StageError(n, `"${id}" is not an id: letters, digits, -, _ and ., starting with a letter`);
    return { id, role, title: ts[k] ?? ts[0] ?? id, subs, badges: [], lane, from: 1, line: n, kids: [], pills: [], tokens: [], keys: [], state: state && { ...state } };
  });
}

/** The lines indented under a card line: badges, pills, tokens, keys and (under a top card) cards inside it.
 * `add` registers a card (the stage checks the role and the id); returns nothing, throws StageError to refuse. */
export function parseCardBody(h: CardHost, cur: Card[], body: Line[], ctx: ParseCtx, add: (c: Card) => void) {
  if (!body.length) return;
  const budget = docBudget(); budget.charge("stage card lines", body.length, body.length);
  const ind = body[0].ind;
  let stackAt = 0;
  for (let i = 0; i < body.length; i++) {
    const b = body[i];
    if (b.ind < ind) throw new StageError(b.n, "this line is indented less than the line above it: line up what belongs to one card");
    const sub: Line[] = []; while (i + 1 < body.length && body[i + 1].ind > b.ind) sub.push(body[++i]);
    if (b.ind > ind) throw new StageError(b.n, "indent one step under a card: its badges, pills, tokens, keys and the cards inside it");
    const t = b.t;
    if (t.startsWith("+ ")) {
      if (sub.length) throw new StageError(sub[0].n, "nothing is indented under badges");
      const lone = /^\(([a-z0-9]{1,3})\)$/i.exec(t.slice(2).trim()); // "+ (a)": a letter chip in the title row
      if (lone) { for (const c of cur) { if (c.tag) throw new StageError(b.n, `a card holds one title-row letter chip`); c.tag = lone[1]; } continue; }
      const bs = parts(t.slice(2), ";").map((x) => { const q = /^\(([a-z0-9]{1,3})\) (.+)$/i.exec(x); if (!q) throw new StageError(b.n, `a badge is "(a) its words" (or "+ (a)" alone: a letter chip in the title row)`); return { b: q[1], s: q[2] }; });
      for (const c of cur) c.badges.push(...bs);
      continue;
    }
    const word = t.split(" ")[0].replace(/:$/, "");
    if (word === "ends") { // "ends: on this card": arrows to or from its inner cards end on this card's edge, level with them
      const q = colon(t); if (!q || q[0] !== "ends" || q[1].trim() !== "on this card") throw new StageError(b.n, `a holder card's ends line is "ends: on this card" (arrows to or from the cards inside it end on its edge)`);
      if (sub.length) throw new StageError(sub[0].n, "nothing is indented under ends");
      for (const card of cur) card.endsHere = true; continue;
    }
    if (word === "badges") { // "badges: stacked": one badge per row, top to bottom; a connector end "card.a" leaves level with badge (a)
      const q = colon(t); const how = q && q[0] === "badges" ? q[1].trim().split(/\s+/).join(" ") : ""; if (how !== "stacked" && how !== "stacked plain") throw new StageError(b.n, `a card's badges line is "badges: stacked" (its badges one per row, top to bottom) or "badges: stacked plain" (the same rows, words only)`);
      if (sub.length) throw new StageError(sub[0].n, "nothing is indented under badges");
      for (const card of cur) { card.stacked = true; if (how === "stacked plain") card.plainBadges = true; } stackAt = b.n; continue;
    }
    if (word === "spacing") { // "spacing: roomy": the record's rows spaced wider (the sheet's word)
      const c = colon(t); if (!c || c[0] !== "spacing" || c[1].trim() !== "roomy") throw new StageError(b.n, `a card's spacing is "spacing: roomy" (its record's rows spaced wider)`);
      if (sub.length) throw new StageError(sub[0].n, "nothing is indented under spacing");
      for (const card of cur) card.roomy = true; continue;
    }
    if (word === "pill" || word === "tokens" || word === "keys") {
      if (sub.length) throw new StageError(sub[0].n, `nothing is indented under ${word}`);
      if (word === "pill") { pillLine(h, cur, b, ctx); continue; }
      const c = colon(t);
      if (c && word === "keys" && c[0] === "keys roomy") throw new StageError(b.n, `say "spacing: roomy" under the card instead (and "keys: ..." as before)`);
      if (!c || c[0] !== word) throw new StageError(b.n, `write "${word}: ..."`);
      if (word === "tokens") {
        const toks = c[1].split(" ").filter((x) => x !== "");
        budget.charge("stage tokens", toks.length, toks.length);
        for (const card of cur) { card.tokens.push(...toks); if (card.tokens.length > MAX_TOKENS) throw new StageError(b.n, `a card holds at most ${MAX_TOKENS} tokens`); }
        if (!toks.length) throw new StageError(b.n, `"tokens:" lists the tokens, split by spaces`);
      } else {
        const ks = qparts(c[1], ";");
        if (!ks.length) throw new StageError(b.n, `"keys:" lists the record's keys, split by ";"`);
        for (const card of cur) {
          for (const k0 of ks) {
            const eq = k0.indexOf(" = "), k = eq < 0 ? k0 : k0.slice(0, eq).trim();
            if (card.keys.includes(k)) throw new StageError(b.n, `the key "${k}" is listed twice`);
            card.keys.push(k); if (eq >= 0) (card.vals0 ??= {})[k] = k0.slice(eq + 3).trim();
          }
          if (card.keys.length > MAX_KEYS) throw new StageError(b.n, `a record holds at most ${MAX_KEYS} keys`);
        }
      }
      continue;
    }
    // a card inside the card
    if (cur.length !== 1) throw new StageError(b.n, "cards go inside a card declared alone (one id on its line)");
    const parent = cur[0];
    if (parent.parent) throw new StageError(b.n, "a card inside a card holds no card: one level only");
    const kids = parseCardLine(t, b.n, parent.lane);
    for (const k of kids) { k.parent = parent.id; add(k); parent.kids.push(k.id); }
    if (parent.kids.length > MAX_KIDS) throw new StageError(b.n, `a card holds at most ${MAX_KIDS} cards`);
    parseCardBody(h, kids, sub, ctx, add);
  }
  if (stackAt) for (const c of cur) if (!c.badges.length) throw new StageError(stackAt, `"badges: stacked" stacks the card's badges: give it badges ("+ (a) words; (b) words")`);
}
function pillLine(h: CardHost, cur: Card[], b: Line, ctx: ParseCtx) {
  const c = colon(b.t); if (!c) throw new StageError(b.n, `a pill line is "pill ids: words; words"`);
  const head = parts(c[0].slice(4), " ");
  let role: string | undefined, idText: string;
  if (head.length === 2) { role = head[0]; idText = head[1]; if (!ctx.roles.has(role)) ctx.problem(b.n, `"${role}" is not a role of this page; the page declares ${[...ctx.roles].join(", ") || "none"}`); }
  else if (head.length === 1) idText = head[0];
  else throw new StageError(b.n, `a pill line is "pill ids: words" or "pill role ids: words"`);
  if (cur.length !== 1) throw new StageError(b.n, "pills go under a card declared alone (one id on its line)");
  const r = range(idText), ids = r ?? parts(idText, ",");
  if (!r && idText.includes("..")) throw new StageError(b.n, `"${idText}" is not a range (p1..p6)`);
  const ts = ids.length > 1 ? parts(c[1], ";") : [c[1].trim()];
  if (ts.length !== ids.length && ts.length !== 1) throw new StageError(b.n, `${ids.length} pills but ${ts.length} texts: give one per pill (a; b), or one for all`);
  for (const [k, id] of ids.entries()) {
    if (!ID_RE.test(id)) throw new StageError(b.n, `"${id}" is not an id`);
    if (h.cx.pills.has(id) || h.cards.has(id)) throw new StageError(b.n, `"${id}" is declared twice`);
    h.cx.pills.set(id, { id, s: ts[k] ?? ts[0], role: role ?? cur[0].role, home: cur[0].id, line: b.n });
    cur[0].pills.push(id); ctx.ids.add(id);
  }
  if (h.cx.pills.size > MAX_PILLS) throw new StageError(b.n, `a scene holds at most ${MAX_PILLS} pills`);
}

// ---------------------------------------------------------------- step words
/** The card step words, idea -> the word an author writes: a rename is one line here (the parsing below reads only this). */
export const CARD_WORDS = { text: "text", title: "title", state: "state", tone: "tone", ghost: "dim", dash: "dashed", cross: "cross", move: "move", fill: "fill", chip: "mark", light: "light" } as const;
type Idea = keyof typeof CARD_WORDS;
const W = CARD_WORDS, IDEA = new Map<string, Idea>(Object.entries(CARD_WORDS).map(([idea, w]) => [w, idea as Idea]));
export const CARD_STEP_WORDS = Object.values(CARD_WORDS).map((w) => (w === W.light ? `${w} (pills)` : w));
/** split on a separator outside "double quotes"; quotes around a part are dropped ("Fn, Window" is one key). Linear. */
export function qparts(s: string, sep: string): string[] {
  const out: string[] = []; let cur = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') { q = !q; cur += ch; continue; }
    if (!q && s.startsWith(sep, i)) { out.push(cur); cur = ""; i += sep.length - 1; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((x) => { const t = x.trim(); return t.length > 1 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t; }).filter((x) => x !== "");
}
/** A step line about cards: true when it was one (and recorded or refused), false to let the stage read it. */
export function cardStepLine(h: CardHost, k: number, l: Line, ctx: ParseCtx, keep = false): boolean {
  const word = l.t.split(" ")[0].replace(/:$/, ""), idea = IDEA.get(word);
  if (!idea) return false;
  if (keep && idea !== "chip") return false; // "keep" holds a card's token mark only ("keep mark id token: tone remark")
  while (h.cx.steps.length < k) h.cx.steps.push(newStep());
  const st = h.cx.steps[k - 1];
  const c = colon(l.t), rest = l.t.slice(word.length).trim(), head = c ? c[0].slice(word.length).trim() : rest;
  const cardIds = (s: string) => {
    const ids = expandIds(s, h.cards.keys());
    for (const id of ids) if (!h.cards.has(id)) throw new StageError(l.n, `"${id}" is not a card of this scene${h.cards.size ? ` (${[...h.cards.keys()].slice(0, 12).join(", ")}${h.cards.size > 12 ? ", ..." : ""})` : ""}`);
    return ids;
  };
  /** a head block of this scene owns this word too (the sheet's mark and dim, the bars' move): give lines that are not about cards back */
  const shared = () => !!h.head?.some((x) => x.block.ops?.includes(word));
  const mine = (s: string) => expandIds(s, h.cards.keys()).every((id) => h.cards.has(id));
  const onOff = (t: string): [string, boolean] => (t.endsWith(" off") ? [t.slice(0, -4), false] : [t, true]);
  try {
    switch (idea) {
      case "light": {
        const ids = expandIds(head, h.cx.pills.keys());
        if (!c && !(ids.length && ids.every((id) => h.cx.pills.has(id)))) return false;
        if (!ids.length || !ids.every((id) => h.cx.pills.has(id))) { if (ids.some((id) => h.cx.pills.has(id))) throw new StageError(l.n, `"${W.light} ...: note" lights pills; light the cards on a line of their own`); return false; }
        for (const id of ids) st.lit.push([id, c ? c[1].trim() : ""]);
        return true;
      }
      case "title": {
        if (!c) return false;
        if (shared() && !mine(head)) return false;
        for (const id of cardIds(head)) st.title.push([id, c[1].trim()]);
        return true;
      }
      case "text": {
        if (!c) return false;
        if (shared() && !mine(head)) return false;
        const ls = parts(c[1], " | "); for (const x of ls) { const pr = subToneProblem(x, ctx.roles); if (pr) throw new StageError(l.n, pr); }
        for (const id of cardIds(head)) st.text.push([id, ls]);
        return true;
      }
      case "state": {
        if (!c) return false;
        const v = verdict(c[1].trim());
        const s: State | null = c[1].trim() === "off" ? null : v.v !== undefined && v.text === "" ? { s: v.v, tone: v.chip ? "role" : v.ok ? "good" : "bad" } : null;
        if (!s && c[1].trim() !== "off") throw new StageError(l.n, `a state is "[+ word]" (good), "[- word]" (bad), "[= word]" (the card's role) or "off"`);
        for (const id of cardIds(head)) st.state.push([id, s]);
        return true;
      }
      case "tone": {
        const sp = rest.lastIndexOf(" ");
        if (sp < 0) throw new StageError(l.n, `"${W.tone} ids good|bad|warn|acc|off"`);
        const tone = rest.slice(sp + 1);
        if (shared() && !mine(rest.slice(0, sp))) return false;
        if (tone !== "off" && !TONES.includes(tone)) throw new StageError(l.n, `"${tone}" is not a tone: ${TONES.join(", ")} or off`);
        for (const id of cardIds(rest.slice(0, sp))) st.tone.push([id, tone === "off" ? null : tone]);
        return true;
      }
      case "cross": { // "cross ids": a large X over the card from this step on (down; gone; "cross ids off" undoes it)
        if (c) return false;
        const [ids0, on] = onOff(rest), corner = /(^| )corner$/.test(ids0), ids = corner ? ids0.replace(/ ?corner$/, "") : ids0; // "cross ids corner": a small x at the title row's right end
        for (const id of cardIds(ids)) (corner ? st.crossC : st.cross).push([id, on]);
        return true;
      }
      case "ghost": case "dash": {
        if (c) return false;
        const [ids, on] = onOff(rest);
        // "dim" takes a card's pills by their ids too (the card stays strong)
        const pillIds = idea === "ghost" ? expandIds(ids, [...h.cards.keys(), ...h.cx.pills.keys()]) : [];
        if (pillIds.length && pillIds.some((id) => h.cx.pills.has(id) && !h.cards.has(id))) {
          for (const id of pillIds) { if (h.cx.pills.has(id) && !h.cards.has(id)) st.ghost.push([id, on]); else for (const cid of cardIds(id)) st.ghost.push([cid, on]); }
          return true;
        }
        if (shared() && !mine(ids)) return false;
        for (const id of cardIds(ids)) (idea === "ghost" ? st.ghost : st.dash).push([id, on]);
        return true;
      }
      case "move": {
        const k2 = rest.lastIndexOf(" to ");
        if (shared() && !expandIds(k2 < 0 ? rest : rest.slice(0, k2), h.cx.pills.keys()).some((id) => h.cx.pills.has(id))) return false; // no pill: another block's move (bars)
        if (k2 < 0) throw new StageError(l.n, `"${W.move} p1,p2 to card"`);
        const to = rest.slice(k2 + 4).trim(); cardIds(to);
        for (const id of expandIds(rest.slice(0, k2), h.cx.pills.keys())) { if (!h.cx.pills.has(id)) throw new StageError(l.n, `"${id}" is not a pill of this scene (${[...h.cx.pills.keys()].slice(0, 12).join(", ") || "none"})`); st.move.push([id, to]); }
        return true;
      }
      case "fill": {
        if (!c) return false;
        const sp = head.indexOf(" "), id = sp < 0 ? head : head.slice(0, sp);
        if (shared() && !h.cards.has(id)) return false;
        if (!id) throw new StageError(l.n, `"${W.fill} id Key, Key: value; value"`);
        cardIds(id);
        const card = h.cards.get(id)!, keys = qparts(sp < 0 ? "" : head.slice(sp + 1), ","), vals = qparts(c[1], ";");
        if (!card.keys.length) throw new StageError(l.n, `"${id}" has no keys: write "keys: a; b" under it`);
        if (!keys.length) throw new StageError(l.n, `"${W.fill} ${id}" names the keys it fills: ${W.fill} ${id} ${card.keys[0]}: value`);
        if (vals.length !== keys.length && vals.length !== 1) throw new StageError(l.n, `${keys.length} keys but ${vals.length} values: one per key (a; b), or one for all`);
        keys.forEach((key, j) => { if (!card.keys.includes(key)) throw new StageError(l.n, `"${key}" is not a key of ${id} (${card.keys.join(", ")}); a key with a comma is quoted: "a, b"`); st.fill.push([id, key, vals[j] ?? vals[0]]); });
        return true;
      }
      case "chip": {
        if (!c) return false;
        const sp = head.indexOf(" "); if (sp < 0) { if (shared()) return false; throw new StageError(l.n, `"${W.chip} id token, token: tone remark"`); }
        const id = head.slice(0, sp); if (!h.cards.get(id)?.tokens.length && (shared() || keep)) return false;
        cardIds(id);
        const card = h.cards.get(id)!; if (!card.tokens.length) throw new StageError(l.n, `"${id}" has no tokens: write "tokens: ..." under it`);
        const v = c[1].trim(), vs = v.indexOf(" "), tone = vs < 0 ? v : v.slice(0, vs), rm = vs < 0 ? [] : [v.slice(vs + 1).trim()];
        if (!TONES.includes(tone)) throw new StageError(l.n, `"${tone}" is not a tone: ${TONES.join(", ")}`);
        const idx = qparts(head.slice(sp + 1), ",").map((ref) => tokenIndex(card, ref, l.n));
        st.chips.push({ card: id, idx, tone, remark: rm.join(" | "), keep: keep || undefined });
        return true;
      }
    }
  } catch (e) { if (e instanceof StageError) { ctx.problem(e.line, e.message); return true; } throw e; }
  return false;
}
const bare = (s: string) => { let e = s.length; while (e > 1 && (s[e - 1] === "," || s[e - 1] === ";")) e--; return s.slice(0, e); };
/** a token by its words (the first one; a trailing comma does not count) or by its place, #3 */
function tokenIndex(card: Card, ref: string, n: number): number {
  if (ref.startsWith("#") && /^#\d+$/.test(ref)) { const i = +ref.slice(1) - 1; if (i < 0 || i >= card.tokens.length) throw new StageError(n, `${card.id} has ${card.tokens.length} tokens; there is no ${ref}`); return i; }
  const i = card.tokens.findIndex((t) => t === ref || bare(t) === ref);
  if (i < 0) throw new StageError(n, `"${ref}" is not a token of ${card.id} (${card.tokens.slice(0, 12).map(bare).join(" ")}${card.tokens.length > 12 ? " ..." : ""}); or name it by its place, #1`);
  return i;
}

// ---------------------------------------------------------------- per-step state, computed once
type Timeline<T> = T[]; // index k-1
function timeline<T>(n: number, first: T, ops: (k: number) => T | undefined): Timeline<T> {
  const out: T[] = []; let cur = first;
  for (let k = 1; k <= n; k++) { const o = ops(k); if (o !== undefined) cur = o; out.push(cur); }
  return out;
}
function lastOf<T>(list: [string, T][], id: string): T | undefined { let v: T | undefined; for (const [i, x] of list) if (i === id) v = x; return v; }
const nSteps = (h: CardHost) => Math.max(1, h.steps.length);
const stepX = (h: CardHost, k: number) => h.cx.steps[k - 1] ?? newStep();
/** the card's title at each step ("title id: words" from that step on) */
export const titleAt = (h: CardHost, c: Card) => timeline<string>(nSteps(h), c.title, (k) => lastOf(stepX(h, k).title, c.id));
export const subsAt = (h: CardHost, c: Card) => timeline<string[]>(nSteps(h), c.subs, (k) => lastOf(stepX(h, k).text, c.id));
const stateAt = (h: CardHost, c: Card) => timeline<State | null>(nSteps(h), c.state ?? null, (k) => lastOf(stepX(h, k).state, c.id));
const toneAt = (h: CardHost, c: Card) => timeline<string | null>(nSteps(h), null, (k) => lastOf(stepX(h, k).tone, c.id));
const crossCAt = (h: CardHost, c: Card) => timeline<boolean>(nSteps(h), false, (k) => lastOf(stepX(h, k).crossC, c.id));
/** room for a corner x on the title row, on every step when any step marks it (nothing moves) */
const cornerW = (h: CardHost, c: Card) => (h.cx.steps.some((s) => s.crossC.some(([id]) => id === c.id)) ? CORNER_W : 0);
const crossAt = (h: CardHost, c: Card) => timeline<boolean>(nSteps(h), false, (k) => lastOf(stepX(h, k).cross, c.id));
const ghostAt = (h: CardHost, c: Card) => timeline<boolean>(nSteps(h), false, (k) => lastOf(stepX(h, k).ghost, c.id));
const dashAt = (h: CardHost, c: Card) => timeline<boolean>(nSteps(h), false, (k) => lastOf(stepX(h, k).dash, c.id));
/** where each pill is at each step */
export function pillPlaces(h: CardHost): Map<string, Timeline<string>> {
  const out = new Map<string, Timeline<string>>();
  for (const p of h.cx.pills.values()) out.set(p.id, timeline(nSteps(h), p.home, (k) => lastOf(stepX(h, k).move, p.id)));
  return out;
}
/** a pill's lines at a card's width; room is kept at
 * its right for the widest note it is ever lit with, so its lines are the same in every step */
export function pillLines(h: CardHost, pid: string, cardW: number): string[] {
  const p = h.cx.pills.get(pid)!, notes = h.cx.steps.flatMap((st) => st.lit.filter(([id, t]) => id === pid && t).map(([, t]) => measure(t, "small-b") + 10));
  return wrap(p.s, cardW - 2 * CARD_PX - 20 - Math.max(0, ...notes), "chip", 4);
}
const pillH = (n: number) => PILL_H + (n - 1) * LINE_H.chip;
/** each card's pill slots: the pills that ever sit in it, in the order they come (a pill keeps its slot in a card) */
function pillSlots(h: CardHost): Map<string, string[]> {
  const slots = new Map<string, string[]>(), add = (card: string, p: string) => { const s = slots.get(card) ?? slots.set(card, []).get(card)!; if (!s.includes(p)) s.push(p); };
  for (const c of h.cards.values()) for (const p of c.pills) add(c.id, p);
  const places = pillPlaces(h);
  // moved pills take their slots in the order the step's move line lists them, not their first card's order
  for (let k = 1; k <= nSteps(h); k++) { for (const [p] of stepX(h, k).move) { const tl = places.get(p); if (tl) add(tl[k - 1], p); } for (const [p, tl] of places) add(tl[k - 1], p); }
  return slots;
}
/** each record value at each step ("..." until filled) */
function valuesAt(h: CardHost, c: Card): Map<string, Timeline<string>> {
  const out = new Map<string, Timeline<string>>();
  for (const key of c.keys) out.set(key, timeline(nSteps(h), c.vals0?.[key] ?? "...", (k) => { let v: string | undefined; for (const [id, kk, val] of stepX(h, k).fill) if (id === c.id && kk === key) v = val; return v; }));
  return out;
}
/** group steps 1..n with the same key into runs: [from, to, key] */
function runs<T>(tl: Timeline<T>, eq: (a: T, b: T) => boolean = (a, b) => a === b): [number, number, T][] {
  const out: [number, number, T][] = [];
  tl.forEach((v, i) => { const last = out.at(-1); if (last && eq(last[2], v)) last[1] = i + 1; else out.push([i + 1, i + 1, v]); });
  return out;
}

// ---------------------------------------------------------------- says: chips under a card, wrapped to its width, stacked
/** a say's lines at a card's width: " | " splits lines, each wraps (at most 3 rows) */
export const sayLines = (t: string, w: number) => parts(t, " | ").flatMap((x) => wrap(x, Math.max(40, w - 18), "chip", 5));
const SAY_LINE = 14, SAY_GAP = 3;
const sayH = (n: number) => 6 + SAY_LINE * n;
/** the room a card keeps under it for its says: the most any one step stacks there (22 for one line, as before) */
export function sayRoom(h: Pick<CardHost, "steps">, id: string, w: number): number {
  let best = 0;
  for (const s of h.steps) { let t = 0, n = 0; for (const [i, x] of s.says ?? []) if (i === id) { t += sayH(sayLines(x, w).length); n++; } if (n) best = Math.max(best, 2 + t + (n - 1) * SAY_GAP); }
  return best;
}
/** one step's says under a card, stacked: chips as wide as their words, at most the card (or the stage) */
export function drawSays(says: string[], r: Rect, paint: string, stageW: number, pad: number, step: number, ww = r.w): Item[] {
  const out: Item[] = []; let y = r.y + r.h + 5;
  for (const t of says) {
    const lines = sayLines(t, ww), cw = Math.min(Math.max(ww, 60), Math.max(...lines.map((x) => measure(x, "chip"))) + 18), hh = sayH(lines.length);
    const cx = Math.max(pad + cw / 2, Math.min(stageW - pad - cw / 2, r.x + r.w / 2));
    out.push({ k: "box", x: cx - cw / 2, y, w: cw, h: hh, fill: `${paint}:soft`, stroke: `${paint}:line`, r: 10, cls: "stg-chip", bar: { kind: "chip", label: t }, from: step, to: step } as Item);
    lines.forEach((x, i) => out.push({ k: "text", x: cx, y: y + 14 + i * SAY_LINE, s: x, f: "chip", ink: `${paint}:ink`, anchor: "middle", from: step, to: step } as Item));
    y += hh + SAY_GAP;
  }
  return out;
}

// ---------------------------------------------------------------- measuring
type Rect = { x: number; y: number; w: number; h: number };
const tagged = (h: CardHost, id: string, tags: Set<string>) => tags.has(id);
/** the widest a card would like to be */
export function cardNeed(h: CardHost, c: Card): number {
  const st = Math.max(0, ...stateAt(h, c).map((s) => (s ? measure(s.s, "small-b") + 12 : 0))) + (c.tag ? TAG_W + 6 : 0) + cornerW(h, c);
  const subW = Math.max(0, ...subsAt(h, c).flat().map((x) => subMeasure(x, measure)));
  const kids = c.kids.map((id) => cardNeed(h, h.cards.get(id)!) + 2 * CARD_PX);
  const pills = c.pills.map((p) => measure(h.cx.pills.get(p)!.s, "chip") + 70);
  const toks = Math.min(560, c.tokens.reduce((a, t) => a + tokW(t) + TOK_GAP, 0)) + 2 * CARD_PX;
  const rec = c.keys.length ? recCols(h, c).kw + REC_GAP + Math.max(...[...valuesAt(h, c).values()].flat().map((v) => measure(v, "sub"))) + 2 * CARD_PX : 0;
  return Math.max(...titleAt(h, c).map((t) => measure(t, titleFont(t))).map((x) => x + st + 2 * CARD_PX + 2), subW + 2 * CARD_PX + 2, c.stacked ? Math.max(...c.badges.map((b) => measure(b.s, "sub") + (c.plainBadges ? 20 : 40)), 0) + 12 : c.badges.reduce((a, b) => a + measure(b.s, "sub") + 40, 12), ...kids, ...pills, c.tokens.length ? toks : 0, rec);
}
/** the least width a card can wrap to */
export function cardMin(h: CardHost, c: Card): number {
  const st = Math.max(0, ...stateAt(h, c).map((s) => (s ? measure(s.s, "small-b") + 12 : 0))) + (c.tag ? TAG_W + 6 : 0) + cornerW(h, c);
  const kids = c.kids.map((id) => cardMin(h, h.cards.get(id)!) - 2);
  const toks = Math.max(0, ...c.tokens.map((t) => tokW(t)));
  const rec = c.keys.length ? recCols(h, c).kw + REC_GAP + 60 : 0;
  return Math.max(longestWord(c.title, titleFont(c.title)) + st, ...subsAt(h, c).flat().map((x) => subMeasure(x, longestWord)), ...c.badges.map((b) => measure(b.s, "sub") + (c.plainBadges ? 20 : 34)),
    ...kids, ...c.pills.map((p) => Math.min(140, measure(h.cx.pills.get(p)!.s, "chip") + 20)), toks, rec) + 2 * CARD_PX + 2;
}
/** a record key's lines: a key longer than its column wraps whole words inside it, never into its value and never cut
 * (3 lines at most) */
const keyLines = (key: string, kw: number) => wrap(key, kw, "sub", 3);
/** a record value's lines: 2 on a wide card; on a phone up to 8, so a long value wraps whole instead of "…" */
const valLines = (v: string, vw: number) => wrap(v, vw, "sub", PHONE_CARDS ? 8 : 2);
/** the key column: as wide as the widest key, at most 180 and 2/5 of the card; on a wide card a longer key gets up to 45% */
function recCols(h: CardHost, c: Card, inner = 1e9) { const most = Math.max(...c.keys.map((k) => measure(k, "sub"))), long = most > 180 && !PHONE_CARDS; return { kw: Math.min(long ? inner * 0.45 : 180, long ? inner * 0.45 : inner * 0.4, most) }; }
/** how many "inside" chips a card's foot holds: one row; on a phone whose badges stack, one chip per badge, stacked
 * (the wide stage draws one per badge in the badges' one row):, the hero's 6 'samples' */
export function insideN(c: Card, w: number): number { return !c.inside ? 0 : PHONE_CARDS && c.badges.length > 1 && badgeRows(c, w) > 1 ? c.badges.length : 1; }
export function badgeRows(c: Card, w: number): number {
  if (!c.badges.length) return 0;
  if (c.stacked) return c.badges.length; // "badges: stacked"
  // one row when each badge's words fit its equal share of the row
  const inner = w - 12, share = (inner - (c.badges.length - 1) * 6) / c.badges.length;
  return c.badges.every((b) => measure(b.s, "sub") + badgeGeo().need <= share) ? 1 : c.badges.length;
}
/** a token chip: its words without a trailing comma in the box, the comma just after it */
const tokW = (t: string) => measure(bare(t), "chip") + 2 * TOK_PX + (bare(t).length < t.length ? measure(t.slice(bare(t).length), "chip") + 4 : 0);
/** the token chips laid out in rows: x, row of each; and which rows hold a remark at some step */
function tokenRows(h: CardHost, c: Card, inner: number) {
  const pos: { x: number; row: number; w: number }[] = []; let x = 0, row = 0;
  for (const t of c.tokens) {
    const tw = Math.min(inner, tokW(t));
    if (x && x + tw > inner) { x = 0; row++; }
    pos.push({ x, row, w: tw }); x += tw + TOK_GAP;
  }
  const remarkRows = new Set<number>();
  for (const s of h.cx.steps) for (const ch of s.chips) if (ch.card === c.id && ch.remark) remarkRows.add(pos[ch.idx[ch.idx.length - 1]].row);
  return { pos, rows: c.tokens.length ? row + 1 : 0, remarkRows };
}
/** a card's lines as drawn: "** words" a big centred headline (2 lines at most), "* words" in the card's colour, else muted */
/** a card line's look from its marks, the panel lines' meanings (one meaning per spelling): "> " indented (repeatable),
 * "** " the headline, "* " the card's colour, "= " body size in the card's colour, ". " body size in plain ink, "~ " small and
 * muted (the default look said out loud), "(tone) " / "(role) " that ink; anything else small and muted */
const IND = 14;
type SubStyle = { text: string; f: Font; head: boolean; hi: boolean; ink?: string; indent: number };
function subStyle(t0: string): SubStyle {
  let t = t0, indent = 0; while (t.startsWith("> ")) { indent++; t = t.slice(2); }
  if (t.startsWith("** ")) return { text: t.slice(3), f: HEAD_F, head: true, hi: true, indent };
  if (t.startsWith("* ")) return { text: t.slice(2), f: "sub", head: false, hi: true, indent };
  if (t.startsWith("= ")) return { text: t.slice(2), f: "body", head: false, hi: true, indent };
  if (t.startsWith(". ")) return { text: t.slice(2), f: "body", head: false, hi: false, ink: "ink", indent };
  if (t.startsWith("~ ")) return { text: t.slice(2), f: "sub", head: false, hi: false, indent };
  const ink = subInk(t); return { text: ink ? t.replace(SUB_TONE, "") : t, f: "sub", head: false, hi: false, ink, indent };
}
const plainSub = (x: string) => subStyle(x).text;
const subMeasure = (x: string, fn: (s: string, f: Font) => number) => { const st = subStyle(x); return fn(st.text, st.f) + st.indent * IND; };
/** "(good) words" / "(store) words": a card line in a tone's or a role's ink (the stage's tone-before-words form) */
const SUB_TONE = /^\(([a-z][a-z0-9_-]*)\) (?=\S)/;
const TONE_INK: Record<string, string> = { good: "good:ink", bad: "bad:ink", warn: "warn:ink", accent: "acc:ink" };
const subInk = (x: string): string | undefined => { const q = SUB_TONE.exec(x); return q ? TONE_INK[q[1]] ?? `role:${q[1]}:ink` : undefined; };
/** a card line's tone or role must be one the page knows: the problem, else null */
export function subToneProblem(x: string, roles: Set<string>): string | null {
  const q = SUB_TONE.exec(x); if (!q || TONE_INK[q[1]] || roles.has(q[1])) return null;
  return `"(${q[1]})" is not a tone or a role of this page: a card line takes (good), (bad), (warn), (accent) or a role in brackets before its words`;
}
function subLines(ss: string[], inner: number): { s: string; f: Font; h: number; hi: boolean; head: boolean; ink?: string; indent: number }[] {
  const out: { s: string; f: Font; h: number; hi: boolean; head: boolean; ink?: string; indent: number }[] = [];
  for (const t0 of ss) {
    const { text, f, head, hi, ink, indent } = subStyle(t0);
    for (const x of wrapRoom(text, inner - indent * IND, f, head ? 2 : SUB_MAX, 5)) out.push({ s: x, f, h: LINE_H[f], hi, head, ink, indent });
  }
  return out;
}
type Measured = { title: string[]; subH: number; recH: number[]; tok: ReturnType<typeof tokenRows>; kids: { id: string; h: number; top: number; bottom: number }[]; slots: string[]; h: number; stW: number };
/** the card's parts for a width: the height is the largest any step needs */
// a long title (a sentence, as on a band of one card) is set in the body weight
export const titleFont = (t: string): "title" | "body" => (t.length > 48 ? "body" : "title");
export function measureCard(h: CardHost, c: Card, w: number, tags: Set<string>, says: Set<string> | unknown, slotsOf = pillSlots(h)): Measured {
  const inner = w - 2 * CARD_PX;
  const stW = Math.max(0, ...stateAt(h, c).map((s) => (s ? measure(s.s, "small-b") + 10 : 0))) + (c.tag ? TAG_W + 6 : 0) + cornerW(h, c);
  // "_": no title (a band heading says it); a title a step changes keeps the room of its longest version
  const tl = (t: string) => (t === "_" ? (stW ? [""] : []) : wrap(t, inner - stW, titleFont(t), TITLE_MAX));
  const titleH = (t: string) => tl(t).length * LINE_H[titleFont(t)];
  const title = titleAt(h, c).map(tl).reduce((a, x) => (x.length > a.length ? x : a), tl(c.title));
  const tH = Math.max(titleH(c.title), ...titleAt(h, c).map(titleH));
  const subH = Math.max(0, ...subsAt(h, c).map((ss) => subLines(ss, inner).reduce((a, l) => a + l.h, 0)));
  const vw = inner - recCols(h, c, inner).kw - REC_GAP, vals = valuesAt(h, c);
  const kw0 = recCols(h, c, inner).kw, recH = c.keys.map((k) => Math.max(keyLines(k, kw0).length, ...vals.get(k)!.map((v) => valLines(v, vw).length)) * LINE_H.sub + (c.roomy ? ROOMY_GAP : 0)); // the row as tall as its taller side
  const tok = tokenRows(h, c, inner);
  const kids = c.kids.map((id) => { const kc = h.cards.get(id)!; return { id, h: measureCard(h, kc, inner, tags, says, slotsOf).h, top: tagged(h, id, tags) ? 22 : 0, bottom: sayRoom(h, id, inner) }; });
  const slots = slotsOf.get(c.id) ?? [];
  let H = CARD_PT + tH + subH;
  if (recH.length) H += 6 + recH.reduce((a, b) => a + b, 0);
  if (tok.rows) H += 6 + tok.rows * (TOK_H + TOK_GAP) + tok.remarkRows.size * LINE_H.sub;
  if (kids.length) H += 6 + kids.reduce((a, k) => a + k.top + k.h + k.bottom + KID_GAP, 0) - KID_GAP + 4;
  if (slots.length) H += 8 + slots.reduce((a, pid) => a + pillH(pillLines(h, pid, w).length) + PILL_GAP, 0) - PILL_GAP;
  H += (c.badges.length ? badgeRows(c, w) * badgeGeo().pitch + 4 : 4) + 26 * insideN(c, w);
  return { title, subH, recH, tok, kids, slots, h: H + 4, stW };
}

// ---------------------------------------------------------------- drawing
const same = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
/** Draw a card in `r` (its height may be more than it needs: pills and badges sit at its foot). `kind` is the bar's
 * kind for the card ("card"), `inner` gets the rect of each card inside it (for tags and says). */
export function drawCard(h: CardHost, c: Card, r: Rect, tags: Set<string>, says: Set<string>, inner: Map<string, Rect>, slotsOf = pillSlots(h)): Item[] {
  const n = nSteps(h), M = measureCard(h, c, r.w, tags, says, slotsOf), out: Item[] = [];
  const from = c.parent ? Math.max(c.from, h.cards.get(c.parent)!.from) : c.from;
  // the step's actors are lit: the cards "light" names; without light, a step's connectors light their senders, and a card it shows
  // is lit unless the step only sends to it (the hero: the pickers send; the packers do not)
  const hot = h.steps.flatMap((s, si) => { const es = ((s as any).edges ?? []) as { from: string; to: string }[]; if (s.dark) return []; if (s.light.some((id) => h.cards.has(id))) return s.light.includes(c.id) ? [si + 1] : []; return es.some((e) => e.from === c.id) || (s.show.includes(c.id) && !es.some((e) => e.to === c.id)) ? [si + 1] : []; });
  const ghost = ghostAt(h, c), dim = ghost.flatMap((g, i) => (g ? [i + 1] : []));
  const when = (it: Item, f = from, t = 0): Item => ({ ...it, from: Math.max(f, from), to: t, hot: it.hot ?? hot, dim: it.dim ?? dim } as Item);
  // the box: one run per tone and dash; the same place on every step
  const tone = toneAt(h, c), dash = dashAt(h, c), hasKids = c.kids.length > 0;
  for (const [a, b, [tn, ds]] of runs(tone.map((t, i) => [t, dash[i]] as [string | null, boolean]), same)) {
    if (b < from) continue;
    const p = tn ? paintOf(tn) : `role:${c.role}`;
    out.push(when({ k: "box", x: r.x, y: r.y, w: r.w, h: r.h, fill: tn ? `${paintOf(tn)}:soft` : `role:${c.role}:soft`, stroke: `${p}:line`, r: 9, dash: ds, cls: hasKids ? "scn-frame" : "scn-shape", id: c.id, role: tn ? undefined : c.role, bar: { kind: "card", id: c.id, label: c.title === "_" ? undefined : c.title, role: tn ? `tone:${tn}` : c.role } }, a, b === n ? 0 : b));
  }
  // the title, and its state word at the right of the first line
  let y = r.y + CARD_PT;
  for (const [a, b, tt] of runs(titleAt(h, c))) { if (b < from) continue; const tf = titleFont(tt), ls = tt === "_" ? [] : wrap(tt, r.w - 2 * CARD_PX - M.stW, tf, TITLE_MAX); ls.forEach((x, q) => out.push(when({ k: "text", x: r.x + CARD_PX + (c.tag && q === 0 ? TAG_W + 6 : 0), y: r.y + CARD_PT + (q + 1) * LINE_H[tf] - 4, s: x, f: tf, ink: "ink", tip: ls.length > 1 || x.endsWith("…") ? tt : undefined }, a, b === nSteps(h) ? 0 : b))); }
  y += M.title.length * LINE_H.title;
  // "+ (a)": a letter chip at the start of the title row, the title after it (kind chip; labelled with its letter)
  if (c.tag) {
    const tx = r.x + CARD_PX, ty = r.y + CARD_PT + Math.max(0, (LINE_H.title - TAG_W) / 2) - 2, br = h.roles[c.tag] !== undefined ? c.tag : c.role;
    out.push(when({ k: "box", x: tx, y: ty, w: TAG_W, h: TAG_W, fill: "none", stroke: "none", r: 4, cls: "stg-tag", bar: { kind: "chip", label: c.tag } }), when({ k: "badge", x: tx, y: ty, s: c.tag, role: br }));
  }
  for (const [a, b, s] of runs(stateAt(h, c), same)) if (s && b >= from) out.push(when({ k: "text", x: r.x + r.w - CARD_PX - cornerW(h, c), y: r.y + CARD_PT + LINE_H.title - 4, s: s.s, f: "small-b", ink: s.tone === "role" ? `role:${c.role}:ink` : `${s.tone}:ink`, anchor: "end" }, a, b === n ? 0 : b));
  // the lines: one version per run of steps, in one reserved height
  // a card drawn taller than its parts (a lone card beside a stack), with a big "**" line and nothing under its lines: the
  // lines stand in the middle of the spare room, the title at the top
  const lift = r.h > M.h + 1 && !c.keys.length && !c.kids.length && !M.tok.pos.length && subsAt(h, c).some((ss) => ss.some((x) => x.startsWith("** "))) ? (r.h - M.h) / 2 : 0;
  for (const [a, b, ss] of runs(subsAt(h, c), same)) {
    if (b < from) continue;
    let yy = y + lift; // a headline card's lines lifted to the middle of a taller box
    // a plain text card with a headline: the headline and its lines stand as one group, centred across the card
    const ls = subLines(ss, r.w - 2 * CARD_PX), group = ls.some((l) => l.head) && !c.kids.length && !c.pills.length && !c.tokens.length && !c.keys.length && !c.badges.length && !c.inside;
    // "* words": a line in the card's own colour; "** words": a headline, big and centred, in that colour
    for (const l of ls) { yy += l.h; const mid = l.head || (group && !l.indent); out.push(when({ k: "text", x: mid ? r.x + r.w / 2 : r.x + CARD_PX + l.indent * IND, y: yy - (l.f === "big" ? 7 : l.f === "title" ? 4 : l.f === "body" ? 4 : 3), s: l.s, f: l.f, ink: l.ink ?? (l.hi ? `role:${c.role}:ink` : "muted"), anchor: mid ? "middle" : undefined }, a, b === n ? 0 : b)); }
  }
  y += M.subH;
  // the record: keys on the left, values ("..." until filled) in a column at their right
  if (c.keys.length) {
    y += 6;
    const kw = recCols(h, c, r.w - 2 * CARD_PX).kw, vx = r.x + CARD_PX + kw + REC_GAP, vw = r.w - 2 * CARD_PX - kw - REC_GAP, vals = valuesAt(h, c);
    const half = c.roomy ? ROOMY_GAP / 2 : 0; // a roomy row: its words in the middle of the row
    c.keys.forEach((key, j) => {
      keyLines(key, kw).forEach((ks, q) => out.push(when({ k: "text", x: r.x + CARD_PX, y: y + half + (q + 1) * LINE_H.sub - 3, s: ks, f: "sub", ink: "muted", tip: key, bar: q ? undefined : { column: `${c.id}:key` } } as Item)));
      for (const [a, b, v] of runs(vals.get(key)!)) {
        if (b < from) continue;
        // a filled value on a card with a tone is written in that tone's ink
        const vt = tone[a - 1] ?? null; // runs are 1-based steps, a timeline is 0-based
        valLines(v, vw).forEach((line, q) => out.push(when({ k: "text", x: vx, y: y + half + (q + 1) * LINE_H.sub - 3, s: line, f: "sub", ink: v === "..." ? "muted" : vt ? `${paintOf(vt)}:ink` : "ink", bar: q ? undefined : { column: `${c.id}:value` } } as Item, a, b === n ? 0 : b)));
      }
      y += M.recH[j];
    });
  }
  // token chips: plain on every step; a step boxes some in a tone, with a remark under their row
  if (c.tokens.length) {
    y += 6;
    const rowY = (row: number) => y + row * (TOK_H + TOK_GAP) + [...M.tok.remarkRows].filter((x) => x < row).length * LINE_H.sub;
    const marks = new Map<number, { k: number; tone: string; keep?: boolean }[]>(), remarks: { k: number; idx: number; s: string; tone: string; keep?: boolean }[] = [];
    h.cx.steps.forEach((s, si) => { for (const ch of s.chips) if (ch.card === c.id) { for (const i of ch.idx) (marks.get(i) ?? marks.set(i, []).get(i)!).push({ k: si + 1, tone: ch.tone, keep: ch.keep }); if (ch.remark) remarks.push({ k: si + 1, idx: ch.idx[ch.idx.length - 1], s: ch.remark, tone: ch.tone, keep: ch.keep }); } });
    // "keep mark": from its step until the next kept mark on that token; a one-step mark wins on its own step
    const toneAtK = (i: number, k: number) => { const ms = marks.get(i) ?? []; const one = ms.find((m) => m.k === k && !m.keep); if (one) return one.tone; const kept = ms.filter((m) => m.keep && m.k <= k).at(-1); return kept ? kept.tone : null; };
    const remarkOn = (rm: (typeof remarks)[number]) => { if (!rm.keep) return [rm.k]; const next = (marks.get(rm.idx) ?? []).filter((m) => m.keep && m.k > rm.k).map((m) => m.k)[0] ?? n + 1; const out: number[] = []; for (let k = rm.k; k < next; k++) if (!remarks.some((o) => o !== rm && o.idx === rm.idx && o.k === k && !o.keep)) out.push(k); return out; };
    c.tokens.forEach((t, i) => {
      const p = M.tok.pos[i], tx = r.x + CARD_PX + p.x, ty = rowY(p.row);
      const tl = timeline<string | null>(n, null, (k) => toneAtK(i, k));
      for (const [a, b, tn] of runs(tl)) {
        if (b < from) continue;
        const bw = Math.min(p.w, measure(bare(t), "chip") + 2 * TOK_PX);
        out.push(when({ k: "box", x: tx, y: ty, w: bw, h: TOK_H, fill: tn ? `${paintOf(tn)}:soft` : "surface", stroke: tn ? `${paintOf(tn)}:line` : "line", r: 5, thick: !!tn, cls: "stg-chip", id: `${c.id}#${i + 1}`, bar: { kind: "chip", id: `${c.id}#${i + 1}`, label: bare(t) } }, a, b === n ? 0 : b));
      }
      const bw = Math.min(p.w, measure(bare(t), "chip") + 2 * TOK_PX);
      out.push(when({ k: "text", x: tx + bw / 2, y: ty + 14, s: wrap(bare(t), bw - 6, "chip", 1)[0], f: "chip", ink: "ink", anchor: "middle", tip: t }));
      if (bare(t).length < t.length) out.push(when({ k: "text", x: tx + bw + 1, y: ty + 14, s: t.slice(bare(t).length), f: "chip", ink: "ink-2" }));
    });
    for (const rm of remarks) {
      const p = M.tok.pos[rm.idx], rx = Math.min(r.x + CARD_PX + p.x, r.x + r.w - CARD_PX - Math.min(r.w - 2 * CARD_PX, measure(rm.s, "sub")));
      const on = remarkOn(rm); if (!on.length) continue;
      const it = when({ k: "text", x: rx, y: rowY(p.row) + TOK_H + LINE_H.sub - 2, s: wrap(rm.s, r.w - 2 * CARD_PX, "sub", 1)[0], f: "sub", ink: `${paintOf(rm.tone)}:ink`, tip: rm.s, hot: [] }, rm.k, rm.keep ? on.at(-1)! : rm.k);
      out.push(rm.keep ? { ...it, on } as Item : it);
    }
    y += M.tok.rows * (TOK_H + TOK_GAP) + M.tok.remarkRows.size * LINE_H.sub;
  }
  // cards inside: stacked, full inner width, each in its place for the whole scene
  if (M.kids.length) {
    y += 6;
    for (const k of M.kids) {
      y += k.top;
      const kr = { x: r.x + CARD_PX, y, w: r.w - 2 * CARD_PX, h: k.h };
      inner.set(k.id, kr);
      // a card inside keeps to its own shown steps too
      out.push(...keepShown(h, k.id, drawCard(h, h.cards.get(k.id)!, kr, tags, says, inner, slotsOf)).map((it) => (dim.length ? { ...it, dim: [...new Set([...(it.dim ?? []), ...dim])] } : it)));
      y += k.h + k.bottom + KID_GAP;
    }
  }
  // pills: a stack at the foot (above the badges); a slot stays blank while its pill is in another card
  const bRows = (c.badges.length ? badgeRows(c, r.w) * badgeGeo().pitch + 4 : 4) + 26 * insideN(c, r.w);
  if (M.slots.length) {
    const places = pillPlaces(h);
    let py = r.y + r.h - 4 - bRows - M.slots.reduce((a, pid) => a + pillH(pillLines(h, pid, r.w).length) + PILL_GAP, 0) + PILL_GAP;
    for (const pid of M.slots) {
      const pl = pillLines(h, pid, r.w), ph = pillH(pl.length);
      const p = h.cx.pills.get(pid)!, tl = places.get(pid)!.map((card) => card === c.id);
      for (const [a, b, here] of runs(tl)) {
        if (!here || b < from) continue;
        const lit = (k: number) => lastOf(stepX(h, k).lit, pid);
        const hotK: number[] = []; for (let k = a; k <= b; k++) if (lit(k) !== undefined) hotK.push(k);
        const pd = timeline<boolean>(n, false, (k) => lastOf(stepX(h, k).ghost, pid)).flatMap((g, i) => (g ? [i + 1] : [])); // "dim <pill>": that pill faint from that step
        const pw = r.w - 2 * CARD_PX, px = r.x + CARD_PX, pr = { from: a, to: b === n ? 0 : b, hot: hotK, dim: pd.length ? [...new Set([...dim, ...pd])].sort((x, y) => x - y) : dim };
        out.push({ k: "box", x: px, y: py, w: pw, h: ph, fill: "surface", stroke: `role:${p.role}:line`, r: PILL_H / 2, cls: "stg-pill", id: `pill:${pid}@${c.id}`, bar: { kind: "chip", id: `pill:${pid}`, label: p.s }, ...pr } as Item);
        const notes = hotK.map((k) => [k, lit(k)!] as [number, string]).filter(([, s]) => s);
        pl.forEach((t, q) => out.push({ k: "text", x: px + 10, y: py + 15 + q * LINE_H.chip, s: t, f: "chip", ink: `role:${p.role}:ink`, tip: pl.length > 1 || t !== p.s ? p.s : undefined, ...pr } as Item));
        for (const [k, s] of notes) out.push({ k: "text", x: px + pw - 10, y: py + 15, s, f: "small-b", ink: `role:${p.role}:ink`, anchor: "end", from: k, to: k, hot: [k] } as Item);
      }
      py += ph + PILL_GAP;
    }
  }
  // "cross ids": one large X corner to corner over the card, in the struck look (thin; faded: its words stay readable)
  for (const [a, b, on] of runs(crossAt(h, c))) if (on && b >= from) out.push(when({ k: "box", x: r.x + 6, y: r.y + 6, w: r.w - 12, h: r.h - 12, fill: "none", stroke: "none", cls: "stg-cross" }, a, b === n ? 0 : b));
  // "cross ids corner": the original's big bold x in the card's top-right corner, in the bad tone
  for (const [a, b, on] of runs(crossCAt(h, c))) if (on && b >= from) out.push(when({ k: "box", x: r.x + r.w - 6 - CORNER_X, y: r.y + 6, w: CORNER_X, h: CORNER_X, fill: "none", stroke: "none", cls: "stg-cross-corner" }, a, b === n ? 0 : b));
  // badges (as before)
  if (c.badges.length) {
    const rows = badgeRows(c, r.w), per = rows === 1 ? c.badges.length : 1, bw = (r.w - 12 - (per - 1) * 6) / per, G = badgeGeo(); // a lower row on a phone
    c.badges.forEach((b, j) => {
      const bx = r.x + 6 + (j % per) * (bw + 6), by = r.y + r.h - 6 - 26 * insideN(c, r.w) - rows * G.pitch + Math.floor(j / per) * G.pitch + 2, br = h.roles[b.b] !== undefined ? b.b : c.role;
      out.push(when({ k: "box", x: bx, y: by, w: bw, h: G.h, fill: `role:${br}:soft`, stroke: `role:${br}:line`, r: 6, role: br, id: `badge:${c.id}.${b.b}`, bar: { kind: "card", label: b.s, role: br } }), ...(c.plainBadges ? [] : [when({ k: "badge", x: bx + 5, y: by + G.gy, s: b.b, role: br })]), when({ k: "text", x: bx + (c.plainBadges ? 8 : G.tx), y: by + G.ty, s: wrap(b.s, bw - (c.plainBadges ? 8 : G.tx) - 4, "sub", 1)[0], f: "sub", ink: "ink", tip: b.s }));
    });
  }
  return out;
}
export { pillSlots };

// ---------------------------------------------------------------- the LLM view
/** a card as the LLM reads it, with what it holds */
export function cardText(h: CardHost, c: Card): string {
  const bits: string[] = [];
  if (c.tag) bits.push(`(${c.tag})`); // a title-row letter chip
  if (c.state) bits.push(c.state.s);
  if (c.subs.length) bits.push(c.subs.map(plainSub).join("; "));
  let s = c.title === "_" ? bits.join("; ") : `${c.title}${bits.length ? ` (${bits.join("; ")})` : ""}`;
  if (c.badges.length) s += ` [${c.badges.map((b) => (c.plainBadges ? b.s : `${b.b}: ${b.s}`)).join("; ")}]`;
  if (c.keys.length) s += ` {${c.keys.map((k) => `${k}: ${c.vals0?.[k] ?? "..."}`).join("; ")}}`;
  if (c.tokens.length) s += ` tokens: ${c.tokens.join(" ")}`;
  if (c.pills.length) s += ` pills: ${c.pills.map((p) => h.cx.pills.get(p)!.s).join("; ")}`;
  const kids = c.kids.map((id) => h.cards.get(id)!).filter((k) => k.from <= Math.max(1, c.from)); // a card shown later is told in its step
  if (kids.length) s += `, holding: ${kids.map((k) => cardText(h, k)).join("; ")}`;
  return s;
}
/** what step k changes on cards, as sentences */
export function cardFacts(h: CardHost, k: number): string[] {
  const st = h.cx.steps[k - 1]; if (!st) return [];
  const name = (id: string) => h.cards.get(id)?.title ?? id, pill = (id: string) => h.cx.pills.get(id)?.s ?? id, f: string[] = [];
  for (const [id, t] of st.title) f.push(`${name(id)} is now titled: ${t}.`);
  for (const [id, ls] of st.text) f.push(`${name(id)} now reads: ${ls.map(plainSub).join("; ") || "(nothing)"}.`); // "* words" is drawn in the card's colour; the LLM view reads the words
  for (const [id, s] of st.state) f.push(s ? `${name(id)}: ${s.s}.` : `${name(id)}: no state.`);
  for (const [id, t] of st.tone) f.push(t ? `${name(id)} is ${t === "bad" ? "in trouble" : t === "good" ? "good" : t === "warn" ? "a warning" : "in focus"}.` : `${name(id)} is back to normal.`);
  for (const [id, x] of [...st.cross, ...st.crossC]) f.push(x ? `${name(id)} is crossed out.` : `${name(id)} is no longer crossed out.`);
  for (const [id, g] of st.ghost) { const pn = h.cx.pills.get(id); const nm = pn && !h.cards.has(id) ? `the pill "${pn.s}"` : name(id); f.push(g ? `${nm} fades.` : `${nm} is back.`); }
  for (const [id, d] of st.dash) f.push(d ? `${name(id)} is dashed (not there yet).` : `${name(id)} is solid.`);
  for (const [p, to] of st.move) f.push(`${pill(p)} moves to ${name(to)}.`);
  for (const [p, note] of st.lit) f.push(`${pill(p)}${note ? `: ${note}` : " is lit"}.`);
  for (const ch of st.chips) { const c = h.cards.get(ch.card)!; f.push(`${name(ch.card)}: ${ch.idx.map((i) => bare(c.tokens[i])).join(", ")} (${ch.tone}${ch.remark ? `: ${ch.remark}` : ""}${ch.keep ? ", from now on" : ""}).`); }
  const fills = new Map<string, string[]>(); for (const [id, key, v] of st.fill) (fills.get(id) ?? fills.set(id, []).get(id)!).push(`${key} = ${v}`);
  for (const [id, kv] of fills) f.push(`${name(id)}: ${kv.join(", ")}.`);
  return f;
}
/** the words a person reads (translations keep them) */
export function cardTexts(h: CardHost, c: Card): string[] {
  return [...(c.title === "_" ? [] : [c.title]), ...c.subs, ...c.badges.map((b) => b.s), ...c.keys, ...c.pills.map((p) => h.cx.pills.get(p)!.s), ...(c.state ? [c.state.s] : []), ...c.kids.flatMap((id) => cardTexts(h, h.cards.get(id)!))];
}
/** the top card a card sits in (itself when it is not inside one): connectors start and end there */
export const topCard = (h: { cards: Map<string, Card> }, id: string) => { let c = h.cards.get(id); while (c?.parent) c = h.cards.get(c.parent); return c?.id ?? id; };
export type { Font };

// ---------------------------------------------------------------- the key: a legend at the stage's top right
/** The scene's key entries ("key role: words; words"), each a small swatch in its role's colour with its words beside it,
 * in rows at the top right of the stage, right-aligned (the last row ends at the stage's right edge). Each entry shows from
 * the step that writes it; its place is kept from the start, so nothing moves. An entry wider than the stage wraps its words
 * (up to 3 lines). Returns the items (relative to the stage's content box) and the height used. */
export const KEY_SW = 16, KEY_GAP = 6, KEY_SEP = 18, KEY_ROW = 6;
export function drawLegend(keys: { r: string; t: string; k: number; tone?: string }[], w: number): { items: Item[]; h: number } {
  if (!keys.length) return { items: [], h: 0 };
  const lh = LINE_H.sub, room = Math.max(40, w - KEY_SW - KEY_GAP);
  const ents = keys.map((kk) => { const ls = measure(kk.t, "sub") <= room ? [kk.t] : wrap(kk.t, room, "sub", 3); return { ...kk, ls, w: KEY_SW + KEY_GAP + Math.max(...ls.map((l) => measure(l, "sub"))), h: Math.max(KEY_SW, ls.length * lh) }; });
  // rows, filled left to right in the order written, then each row pushed to the right edge
  const rows: (typeof ents)[] = [[]]; let x = 0;
  for (const e of ents) { if (rows.at(-1)!.length && x + KEY_SEP + e.w > w) { rows.push([]); x = 0; } x += (rows.at(-1)!.length ? KEY_SEP : 0) + e.w; rows.at(-1)!.push(e); }
  const items: Item[] = []; let y = 0;
  for (const row of rows) {
    const rw = row.reduce((a, e) => a + e.w, 0) + KEY_SEP * (row.length - 1), rh = Math.max(...row.map((e) => e.h));
    let ex = w - rw;
    for (const e of row) {
      const when = { from: e.k };
      // one entry: the swatch (kind chip, no label, as the originals stamp it) and its words beside it
      items.push({ k: "box", x: ex, y: y + (Math.min(e.h, lh) - KEY_SW) / 2, w: KEY_SW, h: KEY_SW, ...keyPaint(e), r: 3, cls: "stg-key", bar: { kind: "chip" }, ...when }); // wordless, as the originals stamp the swatch; its words are the text beside it
      e.ls.forEach((l, i) => items.push({ k: "text", x: ex + KEY_SW + KEY_GAP, y: y + i * lh + lh - 4, s: l, f: "sub", ink: "ink-2", ...when }));
      ex += e.w + KEY_SEP;
    }
    y += rh + KEY_ROW;
  }
  return { items, h: y - KEY_ROW };
}
/** One key entry on a text baseline: the swatch (kind chip, no label) and its words beside it. */
export const keyEntryW = (t: string) => KEY_SW + KEY_GAP + measure(t, "sub");
/** "chip": the swatch is a wordless chip (a corner legend, as a scene's original); false: inside a legend box, unstamped (the hero's) */
const keyPaint=(key:{r:string;tone?:string})=>key.tone==="plain"?{fill:"surface-2",stroke:"muted"}:{fill:key.tone?`${key.tone}:soft`:`role:${key.r}:soft`,stroke:key.tone?`${key.tone}:line`:`role:${key.r}:line`};
export function keyEntry(x: number, base: number, kk: { r: string; t: string; k: number; tone?: string }, chip = true): Item[] {
  const when = { from: kk.k };
  return [
    { k: "box", x, y: base - 12, w: KEY_SW, h: KEY_SW, ...keyPaint(kk), r: 3, cls: "stg-key", ...(chip ? { bar: { kind: "chip" } } : {}), ...when }, // wordless, as the originals stamp it
    { k: "text", x: x + KEY_SW + KEY_GAP, y: base, s: kk.t, f: "sub", ink: "ink-2", ...when },
  ];
}
