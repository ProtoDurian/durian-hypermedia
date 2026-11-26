// Lanes: the cards, drawn from the Model and the core's states. The composed stage is called for geometry only: where
// each card sits and how big it is (the still rule, the phone's stacking), and where its parts sit inside it (the rows of a
// record, the token chips, the pill slots, the badges, the strip a state chip is kept above it). What a card shows comes
// from the Model and StepState: its title (Thing.title, or a step's `title`), its lines (ThingState.text, else
// Thing.lines), its state chip (ThingState.is), tone, dim, shape and flags, its pills' places (ThingState.at), its token
// words and record keys (Thing.keys) and the card words core hands on as layout facts (lanes/words.ts).
// The card itself is drawn by thingPrims (render/prims.ts); this file adds the stage's parts a plain thing does not have.
import type { Item } from "../../../core/stage-core";
import { LINE_H, measure, wrap, type Font } from "../../../core/stage-core";
import { PHONE } from "../../../core/stage-phone";
import { CHIP_H, chipW, thingPrims } from "../../render/prims";
import { TITLE_GAP } from "../../render/prims/fit";
import type { Id, Look, Model, Prim, Rect, Thing, ThingState, Tone } from "../../types";
import { idOfBox, isWire } from "./items";
import { badgesOf, recordKeysOf, toneWord, tokensOf, type CardStep } from "./words";

const PAD = 14, NPAD = 8;               // the stage's side margins (stage-core.ts PAD, stage.ts NPAD)
const TOK_H = 20, REC_GAP = 12;          // stage-cards.ts
const CARD_PX = (phone: boolean) => (phone ? 7 : 11);
const CARD_PT = (phone: boolean) => (phone ? 7 : 10);

/** where a card's parts sit, read once from the stage's items (the same on every step) */
export interface CardGeo {
  /** the top of the first part under the card's words (cards inside, tokens, a record, pills, badges); null: none */
  extrasTop: number | null;
  tokens: (Rect | null)[];
  rows: number[];                       // a record's rows: the first line's baseline of each key
  vx: number | null;                    // a record's value column
  badges: { b: string; rect: Rect; letter: { x: number; y: number } | null; text: { x: number; y: number } | null }[];
  /** the slot each pill has in this card */
  pills: Record<Id, Rect>;
  /** the stage keeps a strip above the card for a state chip */
  tagStrip: boolean;
}

export const SLOT = "stg-chart-slot";
const rectOf = (it: { x: number; y: number; w: number; h: number }): Rect => ({ x: it.x, y: it.y, w: it.w, h: it.h });
const inside = (x: number, y: number, r: Rect, e = 0.5) => x >= r.x - e && x <= r.x + r.w + e && y >= r.y - e && y <= r.y + r.h + e;
const shown = (it: Item, k: number): boolean => (it.on ? it.on.includes(k) : k >= (it.from ?? 1) && (!it.to || k <= it.to));
const isCardBox = (it: Item, model: Model): boolean => it.k === "box" && !!it.id && !!model.things[it.id] && it.cls !== SLOT && (it.cls === "scn-shape" || it.cls === "scn-frame");
/** a state chip the stage keeps above a card (a `tag`): a chip box that lasts to the end, carries no line's words and sits
 * on the strip over the card (20 px above it; on a phone, PHONE.tagLift) */
const isTagChip = (it: Item): it is Extract<Item, { k: "box" }> => it.k === "box" && it.cls === "stg-chip" && it.bar?.kind === "chip" && it.bar["edge-label"] === undefined && !it.on && !it.to;
const overCard = (it: Extract<Item, { k: "box" }>, r: Rect) => (Math.abs(it.y - (r.y - 20)) < 1 || Math.abs(it.y - (r.y - PHONE.tagLift)) < 1) && it.x + it.w / 2 >= r.x - 1 && it.x + it.w / 2 <= r.x + r.w + 1;

/** the stage's item indices that draw a card (its box, words, chips, parts) at step k: these are drawn from the Model
 * instead, so the layout's decor leaves them out. A chip's words go with their chip. */
export function cardItems(items: Item[], model: Model, k: number): Set<number> {
  const out = new Set<number>();
  const cards: Rect[] = [];
  const all: Rect[] = [];
  items.forEach((it) => { if (it.k === "box" && isCardBox(it, model) && shown(it, k)) { all.push(rectOf(it)); if (!model.things[it.id!].parent) cards.push(rectOf(it)); } });
  const within = (x: number, y: number) => cards.some((r) => inside(x, y, r));
  const isTokenId = (id: string) => { const m = /^(.+)#\d+$/.exec(id); return !!m && !!model.things[m[1]]; };
  items.forEach((it, i) => {
    if (!shown(it, k)) return;
    switch (it.k) {
      case "box": {
        if (it.cls === SLOT) return;
        const id = it.id ?? "";
        const own = isCardBox(it, model) || id.startsWith("badge:") || id.startsWith("pill:") || isTokenId(id) || it.cls === "stg-tag"
          || ((it.cls === "stg-cross" || it.cls === "stg-cross-corner") && within(it.x, it.y))
          || (isTagChip(it) && all.some((r) => overCard(it, r)));
        if (own) out.add(i);
        return;
      }
      case "text": {
        // a chip's words, every line of them, go with the chip (a line's words, a say, an `inside` chip stay; a tag goes):
        // its box is right before its first line
        let j = i - 1; if (it.f === "chip") while (j > 0 && items[j]?.k === "text" && (items[j] as Extract<Item, { k: "text" }>).f === "chip") j--;
        const prev = items[j];
        // (a token chip is a run of boxes, one per tone, and its words follow the last, which may not show at this step:
        // the words go by what the chip is, not by which of its boxes shows)
        if (prev?.k === "box" && prev.cls === "stg-chip") { if (out.has(j) || isTokenId(prev.id ?? "") || (isTagChip(prev) && all.some((r) => overCard(prev, r)))) out.add(i); return; }
        if (within(it.x, it.y)) out.add(i);
        return;
      }
      case "badge": if (within(it.x, it.y)) out.add(i); return;
      case "path": if (!isWire(it) && it.bar?.ignore && it.pts.length && within(it.pts[0][0], it.pts[0][1])) out.add(i); return;
      default: return;
    }
  });
  return out;
}

/** every card's parts, from the stage's items */
export function cardGeos(items: Item[], model: Model): Record<Id, CardGeo> {
  const out: Record<Id, CardGeo> = {};
  const geo = (id: Id): CardGeo => (out[id] ??= { extrasTop: null, tokens: [], rows: [], vx: null, badges: [], pills: {}, tagStrip: false });
  const top = (id: Id, y: number) => { const g = geo(id); g.extrasTop = g.extrasTop === null ? y : Math.min(g.extrasTop, y); };
  const rects: Record<Id, Rect> = {};
  for (const it of items) if (it.k === "box" && isCardBox(it, model) && !rects[it.id!]) rects[it.id!] = rectOf(it);
  for (const [id, r] of Object.entries(rects)) { const p = model.things[id].parent; if (p && rects[p]) top(p, r.y); }
  items.forEach((it, i) => {
    if (it.k === "box" && it.id) {
      const tok = /^(.+)#(\d+)$/.exec(it.id);
      if (tok && model.things[tok[1]]) { const g = geo(tok[1]), j = +tok[2] - 1; if (!g.tokens[j]) g.tokens[j] = rectOf(it); top(tok[1], it.y); return; }
      const pill = /^pill:(.+)@(.+)$/.exec(it.id);
      if (pill && model.things[pill[2]]) { const g = geo(pill[2]); g.pills[pill[1]] ??= rectOf(it); top(pill[2], it.y); return; }
      const badge = /^badge:(.+)\.([^.]+)$/.exec(it.id);
      if (badge && model.things[badge[1]]) {
        const g = geo(badge[1]);
        if (!g.badges.some((b) => b.b === badge[2])) {
          const a = items[i + 1], b = items[i + 2];
          const letter = a?.k === "badge" ? { x: a.x, y: a.y } : null, text = a?.k === "text" ? a : b?.k === "text" ? b : null;
          g.badges.push({ b: badge[2], rect: rectOf(it), letter, text: text ? { x: text.x, y: text.y } : null });
        }
        top(badge[1], it.y); return;
      }
    }
    if (it.k === "text" && typeof it.bar?.column === "string") {
      const m = /^(.+):(key|value)$/.exec(it.bar.column); if (!m || !model.things[m[1]]) return;
      const g = geo(m[1]);
      if (m[2] === "key") { g.rows.push(it.y); top(m[1], it.y - LINE_H.sub + 3); } else if (g.vx === null) g.vx = it.x;
    }
  });
  // a record's keys are written once (the same items on every step)
  for (const g of Object.values(out)) g.rows = [...new Set(g.rows)];
  for (const it of items) if (isTagChip(it)) for (const [id, r] of Object.entries(rects)) if (overCard(it, r)) geo(id).tagStrip = true;
  return out;
}

const bareTok = (s: string) => { let e = s.length; while (e > 1 && (s[e - 1] === "," || s[e - 1] === ";")) e--; return s.slice(0, e); };
/** a card line's own style marks (stage-cards.ts subStyle): the words the line says, without them */
export function plainLine(t: string): string {
  let s = t; while (s.startsWith("> ")) s = s.slice(2);
  const m = /^(\*\* |\* |= |\. |~ )/.exec(s); if (m) s = s.slice(m[1].length);
  return s.replace(/^\(([a-z][a-z0-9_-]*)\) (?=\S)/, "");
}
const RULE = /^-{3,}$/;
/** a state word's tone (lower-stage.ts state-tone): good, bad, warn ...; "role" (a chip form) is the card's role ink */
const STATE_TONE: Record<string, Tone> = { good: "good", bad: "bad", warn: "warn", accent: "accent", acc: "accent" };
const CORNER_W = 34; // stage-cards.ts CORNER_W: a corner x and its gap

/** a card line's look from its marks (the stage's rule, stage-cards.ts subStyle): "> " indents (repeatable), "** " the
 * headline (big, centred), "* " the card's colour, "= " body size in the card's colour, ". " body size in plain ink,
 * "~ " small and muted, "(tone) " / "(role) " that ink; anything else small and muted. null: a plain line */
type LineLook = { f: Font; ink: "muted" | "ink" | "role" | "tone"; role?: string | null; tone?: Tone | null; indent: number; mid: boolean };
const TONE_OF: Record<string, Tone> = { good: "good", bad: "bad", warn: "warn", accent: "accent" };
export function lineLook(t0: string, role: string | null, roles: Record<string, unknown>, phone: boolean): LineLook | null {
  let t = t0, indent = 0; while (t.startsWith("> ")) { indent++; t = t.slice(2); }
  const base = { indent, mid: false };
  if (t.startsWith("** ")) return { ...base, f: phone ? "title" : "big", ink: "role", role, mid: true };
  if (t.startsWith("* ")) return { ...base, f: "sub", ink: "role", role };
  if (t.startsWith("= ")) return { ...base, f: "body", ink: "role", role };
  if (t.startsWith(". ")) return { ...base, f: "body", ink: "ink" };
  if (t.startsWith("~ ")) return indent ? { ...base, f: "sub", ink: "muted" } : null;
  const q = /^\(([a-z][a-z0-9_-]*)\) (?=\S)/.exec(t);
  if (q && TONE_OF[q[1]]) return { ...base, f: "sub", ink: "tone", tone: TONE_OF[q[1]] };
  if (q && roles[q[1]]) return { ...base, f: "sub", ink: "role", role: q[1] };
  return indent ? { ...base, f: "sub", ink: "muted" } : null;
}
/** the stage's baseline lift per font (stage-cards.ts drawCard) */
const LIFT: Partial<Record<Font, number>> = { big: 7, title: 4, body: 4, sub: 3 };
/** a card's lines as the stage drew them when any has a look of its own: each line wrapped in its own font to the card's
 * width, one text per drawn line, in its font and ink, a line under the other by its own height; the words are the
 * Model's. When that makes more or fewer lines than the room thingPrims filled, the plain prim stays */
function styledLines(p: Extract<Prim, { k: "text" }>, raw: string[], t: Thing, r: Rect, roles: Record<string, unknown>, phone: boolean): Prim[] | null {
  const looks = raw.map((l) => lineLook(l, t.role, roles, phone));
  if (!looks.some(Boolean)) return null;
  const plain: LineLook = { f: "sub", ink: p.ink === "muted" ? "muted" : "ink", indent: 0, mid: false };
  const rows = raw.flatMap((l, i) => { const lk = looks[i] ?? plain; return wrap(plainLine(l), r.w - 2 * CARD_PX(phone) - lk.indent * 14, lk.f).map((words) => ({ words, lk })); });
  if (rows.length !== p.lines.length) return null;
  let yy = p.y - LINE_H.sub + (LIFT.sub ?? 3);
  return rows.map(({ words, lk }, i): Prim => {
    yy += LINE_H[lk.f];
    return { ...p, key: i ? `${p.key}:${i}` : p.key, lines: [words], runs: undefined, font: lk.f, ink: lk.ink, role: lk.role ?? p.role, tone: lk.tone ?? p.tone,
      x: lk.mid ? r.x + r.w / 2 : p.x + lk.indent * 14, anchor: lk.mid ? "middle" : p.anchor, y: yy - (LIFT[lk.f] ?? 3) };
  });
}

export interface CardCtx {
  model: Model; step: number; cs: CardStep; phone: boolean; look: Look; width: number;
  geo: Record<Id, CardGeo>;
}

/** what a lanes card says at a step: the words the drawing must hold (tests compare against this) */
export function cardWords(t: Thing, st: ThingState, cs: CardStep): { title: string; lines: string[]; is: string | null } {
  const title = cs.title[t.id] ?? t.title;
  return { title: title === "_" ? "" : title, lines: (st.text ?? t.lines).filter((l) => !RULE.test(l)).map(plainLine), is: st.is };
}

/** a thing at a step, in the rect the stage gave it */
export function cardPrims(t: Thing, st: ThingState, r: Rect, c: CardCtx): Prim[] {
  const { model, cs, phone, look } = c;
  const g = c.geo[t.id];
  // a pill in a card's slot: the stage's pill (a rounded row, its words at the left, a light's note at the right)
  if (t.shape === "pill" && t.parent && model.things[t.parent]) return pillPrims(t, st, r, c);
  const words = cardWords(t, st, cs);
  const state = cs.stateTone[t.id], gone = !!state?.gone;
  const card = t.shape === "box" && look !== "classic" && !t.chart;
  // the words keep to the top of the card, above its parts; the stage measured the card for its words with its own
  // padding (stage-cards.ts measureCard: CARD_PT, the title, the lines, 6 px), so the room is that, plus the padding
  // thingPrims keeps under them and the gap it keeps between the title and the lines
  const bottom = (g?.extrasTop ?? r.y + r.h - 2) - 6;
  const room: Rect = card ? { x: r.x, y: r.y, w: r.w, h: Math.max(20, bottom - r.y + CARD_PT(phone) + 6) } : r;
  const view: Thing = { ...t, title: words.title, lines: words.lines, container: card ? false : t.container };
  const tagged = !!g?.tagStrip;
  // a stage card's state word (`[+ open]`, `state id: [+ word]`) is no chip: the stage writes it in the card's top-right
  // corner (below); a tag sits on the strip kept above the card
  const sv: ThingState = { ...st, text: null, is: tagged || card ? null : st.is, dim: st.dim || gone, tone: gone ? null : st.tone };
  // a stage card's lines sit right under its title (stage-cards.ts drawCard: no gap; the stage placed the line words in
  // the lane gaps by that), so the gap thingPrims keeps between them is taken back
  const raw = thingPrims(view, sv, room, look, phone), titled = card && raw.some((p) => p.key === `t:${t.id}:title`);
  const out = raw.map((p): Prim => {
    if (titled && p.k === "text" && (p.key === `t:${t.id}:lines` || p.key === `t:${t.id}:vals`)) return { ...p, y: p.y - TITLE_GAP };
    if (p.key !== `t:${t.id}` || p.k !== "box") return p;
    // a stage card: a tone paints the whole card in that tone, its role colour gives way (stage-cards.ts drawCard); a lit
    // card is the stage's thicker border, so the box is eng-noring (the renderer would ring a thing a light names too)
    const toned = card && !!p.tone;
    return { ...p, ...(card ? { cls: p.cls ? `${p.cls} eng-noring` : "eng-noring" } : {}), role: toned ? null : p.role, rect: r, container: card ? undefined : t.container || undefined, dashed: cs.dashed.has(t.id) || t.flags.includes("dashed") || undefined, lit: cs.lit.has(t.id) || undefined };
  });
  // the state chip on the strip the stage keeps above the card (stage.ts: tags, in the places the lanes reserved)
  if (tagged && st.is) {
    const cw = measure(st.is, "chip") + 18, kid = !!t.parent, pad = phone ? NPAD : PAD;
    const cx = Math.min(r.x + r.w - cw / 2 - (kid ? 0 : 6), c.width - pad - cw / 2);
    const y0 = phone ? r.y - PHONE.tagLift : r.y - 20;
    out.push({ k: "chip", key: `t:${t.id}:is`, id: t.id, x: cx - chipW(st.is) / 2, y: y0 + (20 - CHIP_H) / 2, words: st.is, role: t.role, cls: sv.dim ? "eng-state eng-dim eng-top" : "eng-state eng-top" });
  }
  // a card's lines with looks of their own (marks): one text per line, as the stage drew them
  const li = card ? out.findIndex((p) => p.key === `t:${t.id}:lines`) : -1, lp = out[li];
  if (lp?.k === "text") { const sl = styledLines(lp, (st.text ?? t.lines).filter((l) => !RULE.test(l)), t, r, model.roles, phone); if (sl) out.splice(li, 1, ...sl); }
  // a state word: small bold words at the card's top right, in its tone (good unless a step says another; a chip form in
  // the card's role ink), as the stage drew it (stage-cards.ts drawCard); a state gone is not written
  if (card && !tagged && st.is && !gone) {
    const tn = state?.tone ?? "good", tone = STATE_TONE[tn] ?? null;
    out.push({ k: "text", key: `t:${t.id}:is`, id: t.id, x: r.x + r.w - CARD_PX(phone) - (cs.corner.has(t.id) ? CORNER_W : 0), y: r.y + CARD_PT(phone) + LINE_H.title - 4, lines: [st.is], font: "small-b", anchor: "end",
      ink: tone ? "tone" : "role", tone, role: t.role, cls: sv.dim ? "eng-state eng-dim" : "eng-state" });
  }
  if (g) out.push(...partsPrims(t, st, r, g, c));
  // `cross id`: a large thin X over the card; `cross id corner`: a bold x in its top-right corner
  if (cs.cross.has(t.id)) { const x0 = r.x + 6, y0 = r.y + 6, x1 = r.x + r.w - 6, y1 = r.y + r.h - 6; out.push({ k: "path", key: `t:${t.id}:cross`, id: t.id, d: `M${x0} ${y0}L${x1} ${y1}M${x1} ${y0}L${x0} ${y1}`, role: null, width: "line", cls: "stg-cross" }); }
  if (cs.corner.has(t.id)) { const x0 = r.x + r.w - 32 + 4, y0 = r.y + 10, x1 = r.x + r.w - 10, y1 = r.y + 28; out.push({ k: "path", key: `t:${t.id}:corner`, id: t.id, d: `M${x0} ${y0}L${x1} ${y1}M${x1} ${y0}L${x0} ${y1}`, role: null, width: "line", cls: "stg-cross-corner" }); }
  return out;
}

/** a card's token chips, record and badges, in the places the stage gave them, with the Model's words */
function partsPrims(t: Thing, st: ThingState, r: Rect, g: CardGeo, c: CardCtx): Prim[] {
  const { cs, phone, model } = c, out: Prim[] = [];
  const dim = st.dim || !!cs.stateTone[t.id]?.gone ? " eng-dim" : "";
  const tone = st.tone && st.tone !== "off" ? st.tone : null;
  const px = CARD_PX(phone), inner = r.x + r.w - px;
  // token chips: plain, or boxed in a tone this step (`mark`), with a remark under their row
  const toks = tokensOf(t.keys), marks = cs.marks[t.id];
  toks.forEach((tok, i) => {
    const tr = g.tokens[i]; if (!tr) return;
    const m = marks?.get(i), tn = toneWord(m?.tone);
    out.push({ k: "rect", key: `t:${t.id}:tok${i}`, rect: { x: tr.x, y: tr.y, w: tr.w, h: TOK_H }, fill: tn ? "soft" : "faint", tone: tn, edge: tn ? "role" : "line", r: 5, cls: `stg-chip${tn ? " stg-thick" : ""}${dim}` });
    const b = bareTok(tok);
    out.push({ k: "text", key: `t:${t.id}:tok${i}:t`, x: tr.x + tr.w / 2, y: tr.y + 14, lines: [wrap(b, tr.w - 6, "chip", 1)[0] ?? b], font: "chip", anchor: "middle", ink: "ink", cls: dim.trim() || undefined });
    if (b.length < tok.length) out.push({ k: "text", key: `t:${t.id}:tok${i}:p`, x: tr.x + tr.w + 1, y: tr.y + 14, lines: [tok.slice(b.length)], font: "chip", anchor: "start", ink: "muted", cls: `stg-ink-2${dim}` });
    if (m?.remark) {
      const fits = tr.x + measure(m.remark, "sub") <= inner - 4;
      out.push({ k: "text", key: `t:${t.id}:tok${i}:r`, x: fits ? tr.x : inner, y: tr.y + TOK_H + LINE_H.sub - 2, lines: [wrap(m.remark, r.w - 2 * px, "sub", 1)[0] ?? m.remark], font: "sub", anchor: fits ? "start" : "end", ink: tn ? "tone" : "ink", tone: tn, cls: dim.trim() || undefined });
    }
  });
  // a record: keys on the left, values ("..." until a step fills them) in a column at their right
  const keys = recordKeysOf(t.keys);
  if (keys.length && g.vx !== null) {
    const kx = r.x + px, kw = g.vx - REC_GAP - kx, vw = inner - g.vx;
    keys.forEach((key, j) => {
      const y = g.rows[j]; if (y === undefined) return;
      out.push({ k: "text", key: `t:${t.id}:key${j}`, x: kx, y, lines: wrap(key, kw, "sub", 3), font: "sub", anchor: "start", ink: "muted", cls: dim.trim() || undefined });
      const v = cs.fill[t.id]?.[key] ?? "...";
      out.push({ k: "text", key: `t:${t.id}:val${j}`, x: g.vx!, y, lines: wrap(v, vw, "sub", phone ? 8 : 2), font: "sub", anchor: "start", ink: v === "..." ? "muted" : tone ? "tone" : "ink", tone: v === "..." ? null : tone, cls: dim.trim() || undefined });
    });
  }
  // badges: a row (or stack) at the card's foot, a letter chip and words in each
  const bs = badgesOf(t.keys), plain = t.keys.plainBadges === "yes";
  for (const b of bs) {
    const at = g.badges.find((x) => x.b === b.b); if (!at) continue;
    const br = model.roles[b.b] ? b.b : t.role, R = at.rect;
    // a lit card's badges are lit with it (the stage's lit box: blocks.css stg-w-hot)
    out.push({ k: "rect", key: `t:${t.id}:badge:${b.b}`, rect: R, fill: "soft", role: br, edge: "role", r: 6, cls: [dim.trim(), cs.lit.has(t.id) && !dim ? "stg-w-hot" : ""].filter(Boolean).join(" ") || undefined });
    if (!plain && at.letter) out.push(
      { k: "rect", key: `t:${t.id}:badge:${b.b}:l`, rect: { x: at.letter.x, y: at.letter.y, w: 17, h: 17 }, fill: "role", role: br, edge: "role", r: 4, cls: `stg-box stg-badge pf-line${dim}` }, // the role's line colour, strong (time.css)
      { k: "text", key: `t:${t.id}:badge:${b.b}:lt`, x: at.letter.x + 8.5, y: at.letter.y + 12.5, lines: [b.b], font: "small-b", anchor: "middle", ink: "ink", cls: `stg-badge-t pi-surface${dim}` });
    if (at.text) { const tx = at.text.x - R.x; out.push({ k: "text", key: `t:${t.id}:badge:${b.b}:t`, x: at.text.x, y: at.text.y, lines: [wrap(b.s, R.w - tx - 4, "sub", 1)[0] ?? b.s], font: "sub", anchor: "start", ink: "ink", cls: dim.trim() || undefined }); }
  }
  return out;
}

/** a pill in the slot of the card it is in now (ThingState.at, else the card it was written under) */
function pillPrims(t: Thing, st: ThingState, r: Rect, c: CardCtx): Prim[] {
  const dim = st.dim ? "eng-dim" : undefined;
  const lines = wrap(t.title, Math.max(20, r.w - 20), "chip", 4);
  const out: Prim[] = [
    { k: "box", key: `t:${t.id}`, id: t.id, shape: "pill", rect: r, role: t.role, tone: st.tone && st.tone !== "off" ? st.tone : null, dim: st.dim || undefined, lit: c.cs.lit.has(t.id) || !!c.cs.notes[t.id] || undefined, cls: "stg-pill" },
    { k: "text", key: `t:${t.id}:title`, id: t.id, x: r.x + 10, y: r.y + 15, lines, font: "chip", anchor: "start", ink: t.role ? "role" : "ink", role: t.role, cls: dim },
  ];
  const note = c.cs.notes[t.id];
  if (note) out.push({ k: "text", key: `t:${t.id}:note`, id: t.id, x: r.x + r.w - 10, y: r.y + 15, lines: [note], font: "small-b", anchor: "end", ink: t.role ? "role" : "ink", role: t.role, cls: dim });
  return out;
}

/** a pill's rect at a step: its slot in the card it is in */
export function pillRect(model: Model, geo: Record<Id, CardGeo>, id: Id, st: ThingState | undefined): Rect | null {
  const t = model.things[id]; if (!t || t.shape !== "pill" || !t.parent) return null;
  const card = st?.at ?? st?.in ?? t.parent;
  return geo[card]?.pills[id] ?? geo[t.parent]?.pills[id] ?? null;
}

export { idOfBox };
