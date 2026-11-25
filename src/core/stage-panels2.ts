// This package is the source of this file: edit it here. It began as a copy of the private prototype's composed stage (0.7.0).
import {boxTone} from "./stage-box-paint";
// More panels a step swaps in: chips (kept and struck words in columns), calc (a formula
// box), card (one card with cards inside, chips coming in, and a right column).
import { type Item, type Line, type StageBlock, type Box, type LayoutOut, StageError, LINE_H, registerBlock, measure, drawnW, wrap, wrapRoom, parts, colon, chip, shift, textLines, type Font, type Paint } from "./stage-core";

// a text line's look from its prefix: "* " accent, "! " warning, "~ " small and muted, "= " the role's ink, "== " big in
// the role's ink, "> " indented; anything else plain
type Styled = { s: string; f: Font; ink: Paint; indent: number };
export function styled(l: string, role: string | null): Styled {
  let indent = 0; while (l.startsWith("> ")) { indent++; l = l.slice(2); }
  const roleInk = role ? `role:${role}:ink` : "acc:ink";
  if (l.startsWith("== ")) return { s: l.slice(3), f: "big", ink: roleInk, indent };
  if (l.startsWith("= ")) return { s: l.slice(2), f: "body", ink: roleInk, indent };
  if (l.startsWith("* ")) return { s: l.slice(2), f: "body", ink: "acc:ink", indent };
  if (l.startsWith("! ")) return { s: l.slice(2), f: "body", ink: "warn:ink", indent };
  if (l.startsWith("~ ")) return { s: l.slice(2), f: "sub", ink: "muted", indent };
  return { s: l, f: "body", ink: "ink", indent };
}
/** `tight`: a phone's pitch: lines 1 px apart over their own height instead of 3 to 5 */
function styledLines(x: number, y: number, w: number, ls: string[], role: string | null, tight = false): LayoutOut {
  const items: Item[] = []; let h = 0;
  for (const l of ls) {
    const st = styled(l, role), ix = x + st.indent * 22, lh = st.f === "big" ? LINE_H.big + 2 : st.f === "sub" ? LINE_H.sub + (tight ? 0 : 3) : LINE_H.body + (tight ? 1 : 5);
    for (const row of wrap(st.s, w - st.indent * 22, st.f, 4)) { items.push({ k: "text", x: ix, y: y + h + lh - 5, s: row, f: st.f, ink: st.ink }); h += lh; }
  }
  return { h, items };
}
const roleCheck = (r: string, line: number, ctx: { roles: Set<string>; problem: (n: number, m: string) => void }) => { if (!ctx.roles.has(r)) ctx.problem(line, `"${r}" is not a role of this page; the page declares ${[...ctx.roles].join(", ") || "none"}`); };

// ---------------------------------------------------------------- chips N: kept and struck words in N columns
// chips 3: kept: the words in by; the rest are dropped
// + name=web; + zone=east; - pod=web-1; - instance=192.0.2.10:8080
// ~ a small note line
// => api: name="web",zone="east"
type ChipsP = { cols: number; title: string; items: { ok: boolean; s: string }[]; after: ({ text: string } | { role: string; s: string })[] };
registerBlock({
  word: "chips", kind: "panel",
  parse(inp, ctx): ChipsP {
    const c = colon(inp.arg) ?? [inp.arg, ""];
    const cols = c[0] ? +c[0] : 3;
    if (!Number.isInteger(cols) || cols < 1 || cols > 6) throw new StageError(inp.line, "chips takes a number of columns, 1 to 6: chips 3: title");
    const p: ChipsP = { cols, title: c[1], items: [], after: [] };
    for (const l of inp.body) {
      if (l.t.startsWith("+ ") || l.t.startsWith("- ")) { if (p.after.length) throw new StageError(l.n, "the + and - items come first, then notes and => chips"); for (const x of parts(l.t, ";")) { if (x[0] !== "+" && x[0] !== "-") throw new StageError(l.n, `an item starts with + (kept) or - (struck): "${x}"`); p.items.push({ ok: x[0] === "+", s: x.slice(1).trim() }); } continue; }
      if (l.t.startsWith("=> ")) { const q = colon(l.t.slice(3)); if (!q) throw new StageError(l.n, `a wide chip is "=> role: text"`); roleCheck(q[0], l.n, ctx); p.after.push({ role: q[0], s: q[1] }); continue; }
      p.after.push({ text: l.t });
    }
    if (p.items.length > 60) throw new StageError(inp.line, "chips holds at most 60 items");
    return p;
  },
  layout(p: ChipsP, box: Box): LayoutOut {
    const items: Item[] = []; let y = 0;
    if (p.title) { const t = textLines(0, 0, box.w, [p.title], "body", "ink"); items.push(...t.items); y = t.h + 6; }
    const need = Math.max(80, ...p.items.map((it) => measure(it.s, "body") + 20));
    const cols = Math.max(1, Math.min(p.cols, Math.floor((box.w + 10) / (Math.min(need, 160) + 10)))), cw = (box.w - (cols - 1) * 10) / cols;
    // on a phone the chips flow by their own widths, several to a row (one column of chips made the journey's phone stack
    // 911 px tall); a chip wider than the row takes the whole row and wraps (up to 3 lines) instead of being cut
    if (box.narrow) {
      let fx = 0, fy = y; const gap = 8;
      for (const it of p.items) {
        const nat = Math.max(measure(it.s, "body"), drawnW(it.s, "body")) + 18 /* as drawn: words stay inside */, long = nat > box.w, w = long ? box.w : nat;
        if (fx > 0 && fx + w > box.w) { fx = 0; fy += 34; }
        const ls = long ? wrapRoom(it.s, w - 18, "body", 3) : [it.s], bh = 26 + (ls.length - 1) * 17, tone = it.ok ? "good" : "bad";
        items.push({ k: "box", x: fx, y: fy, w, h: bh, fill: `${tone}:soft`, stroke: `${tone}:line`, r: 6, cls: "stg-kept", bar: { kind: "chip", label: it.s } }, ...ls.map((s, i) => ({ k: "text" as const, x: fx + 9, y: fy + 17.5 + i * 17, s, f: "body" as const, ink: it.ok ? "ink" : "bad:ink", strike: !it.ok, tip: it.s })) as Item[]);
        if (long) { fy += bh + 8; fx = 0; } else fx += w + gap;
      }
      y = (fx > 0 ? fy + 34 : fy) + (p.items.length ? 8 : 0);
    }
    let col = 0, rowY = y, rowH = 34;
    if (!box.narrow) p.items.forEach((it) => {
      const long = box.narrow && measure(it.s, "body") > cw - 16, full = long && cols > 1;
      if (full && col) { rowY += rowH; col = 0; rowH = 34; }
      const w = full ? box.w : cw, ls = long ? wrap(it.s, w - 16, "body", 3) : [wrap(it.s, cw - 16, "body", 1)[0]], bh = 26 + (ls.length - 1) * 17;
      const x = col * (cw + 10), yy = rowY, tone = it.ok ? "good" : "bad";
      items.push({ k: "box", x, y: yy, w, h: bh, fill: `${tone}:soft`, stroke: `${tone}:line`, r: 6, cls: "stg-kept", bar: { kind: "chip", label: it.s } }, ...ls.map((s, i) => ({ k: "text" as const, x: x + 9, y: yy + 17.5 + i * 17, s, f: "body" as const, ink: it.ok ? "ink" : "bad:ink", strike: !it.ok, tip: it.s })));
      rowH = Math.max(rowH, bh + 8);
      if (full || ++col >= cols) { rowY += rowH; col = 0; rowH = 34; }
    });
    if (!box.narrow) y = rowY + (col ? rowH : 0) + (p.items.length ? 8 : 0);
    for (const a of p.after) {
      if ("text" in a) { const t = styledLines(0, y, box.w, [a.text], null); items.push(...t.items); y += t.h + 2; continue; }
      const lines = wrap(a.s, box.w - 24, "body", box.narrow ? 6 : 2), h = 14 + lines.length * LINE_H.body; // a phone shows the whole result
      items.push({ k: "box", x: 0, y: y + 4, w: box.w, h, fill: `role:${a.role}:soft`, stroke: `role:${a.role}:line`, r: 8, cls: "scn-shape", role: a.role, bar: { kind: "worksheet-row", label: a.s, role: a.role } }); // the result row (the reference design draws it as a worksheet row)
      lines.forEach((l, i) => items.push({ k: "text", x: 12, y: y + 4 + 18 + i * LINE_H.body, s: l, f: "body", ink: `role:${a.role}:ink`, tip: a.s }));
      y += h + 10;
    }
    return { h: y, items };
  },
  facts: (p: ChipsP) => [`${p.title ? p.title + ": " : ""}kept ${p.items.filter((i) => i.ok).map((i) => i.s).join(", ") || "none"}; struck ${p.items.filter((i) => !i.ok).map((i) => i.s).join(", ") || "none"}.`, ...p.after.map((a) => ("text" in a ? styled(a.text, null).s : a.s))],
} satisfies StageBlock<ChipsP>);

// ---------------------------------------------------------------- calc: a formula box
// calc
// hash = crc32(key) × 31
// * = 0x51c2
// == api: server = hash mod 4 = 2
// ~ same key, same number everywhere
type CalcP = { lines: string[]; role: string | null };
registerBlock({
  word: "calc", kind: "panel",
  parse(inp, ctx): CalcP {
    if (!inp.body.length) throw new StageError(inp.line, "calc has its lines indented under it");
    let role: string | null = null;
    const lines = inp.body.map((l) => { const m = /^(==? )([a-z][a-z0-9-]*): (.*)$/.exec(l.t); if (m && ctx.roles.has(m[2])) { role = m[2]; return m[1] + m[3]; } return l.t; });
    return { lines, role };
  },
  layout(p: CalcP, box: Box): LayoutOut {
    // a phone keeps 8 px over the first line and 13 under the last; a wide stage its roomy frame
    const ph = box.narrow, body = styledLines(ph ? 12 : 16, ph ? 8 : 26, box.w - (ph ? 24 : 32), p.lines, p.role, ph), fh = body.h + (ph ? 21 : 56);
    return { h: fh, items: [{ k: "box", x: 0, y: 0, w: box.w, h: fh, fill: "surface-2", stroke: "line", r: 10, cls: "scn-frame", bar: { kind: "band" } }, ...body.items] };
  },
  facts: (p: CalcP) => [p.lines.map((l) => styled(l, null).s).join("; ") + "."],
} satisfies StageBlock<CalcP>);

// ---------------------------------------------------------------- card: one card, cards inside it, chips coming in, a right column
// card store: the store |:8080/write on both replicas
// in: (a=1.5, n=1); (a=2.5, n=1)
// a: replica a | a: 1.5 + 2.5 | = 4.0 · n = 2
// b: replica b | same partials, same sum | = 4.0
// card store: The store now holds
// metric{
// > name="web",
// right:
// * blue words are added on output
// card ops: config | read by every worker
// workers: 3
// beside:
// job: worker 1 | reads the config
// Cards after "beside:" stand in a row to the right of the card (under it on a phone), with a dashed arrow to them;
// plain lines after them are small lines under that row.
type Inner = { role: string; title: string; lines: string[] };
type CardP = { tone?:string; role: string; title: string; sub: string; ins: string[]; insRole?: string; inner: Inner[]; left: string[]; right: string[]; beside: Inner[]; under: string[]; wide: boolean };
registerBlock({
  word: "card", kind: "panel",
  parse(inp, ctx): CardP {
    const c = colon(inp.arg); if (!c) throw new StageError(inp.line, `a card panel is "card role: title | its second line"`);
    const tone=boxTone(c[0],inp.line);c[0]=tone.text;roleCheck(c[0], inp.line, ctx);
    const [title, ...sub] = c[1].split(" | ");
    const p: CardP = { role: c[0],...(tone.tone?{tone:tone.tone}:{}), title: title.trim(), sub: sub.join(" | ").trim(), ins: [], inner: [], left: [], right: [], beside: [], under: [], wide: false };
    let side: "left" | "right" = "left", beside = false;
    for (const l of inp.body) {
      if (l.t === "beside:") { if (beside) throw new StageError(l.n, "beside: is written once"); beside = true; continue; }
      if (beside) {
        // a card "role: title | line", or a plain line: a small line under the cards beside
        const q = colon(l.t); if (!q || q[0].includes(" ") || !ctx.roles.has(q[0]) && !l.t.includes(" | ")) { if (!p.beside.length) throw new StageError(l.n, `beside: starts with a card, "role: title | line"`); p.under.push(l.t); continue; }
        roleCheck(q[0], l.n, ctx); const [bt, ...ls] = q[1].split(" | ").map((x) => x.trim()); p.beside.push({ role: q[0], title: bt, lines: ls });
        if (p.beside.length > 8) throw new StageError(l.n, "beside: holds at most 8 cards"); continue;
      }
      if (l.t === "right:") { side = "right"; continue; }
      if (l.t.startsWith("in: ")) { p.ins.push(...parts(l.t.slice(4), ";")); continue; }
      { const q = /^in ([a-z][a-z0-9-]*): (.+)$/.exec(l.t); if (q) { roleCheck(q[1], l.n, ctx); p.insRole = q[1]; p.ins.push(...parts(q[2], ";")); continue; } } // "in role: a; b": the chips in that role's colour
      const q = colon(l.t);
      if (q && ctx.roles.has(q[0]) && l.t.includes(" | ")) { const [t, ...ls] = q[1].split(" | ").map((x) => x.trim()); p.inner.push({ role: q[0], title: t, lines: ls }); continue; }
      // "; " splits a line into display lines, as in a rows cell (no new word)
      p[side].push(...l.t.split(" ; ").map((x) => x.trim()).filter(Boolean));
    }
    if (beside && !p.beside.length) throw new StageError(inp.line, "beside: lists cards under it");
    if (p.beside.length && p.ins.length) throw new StageError(inp.line, "a card has either in: chips or beside: cards, not both");
    p.wide = !p.ins.length && !p.beside.length;
    return p;
  },
  layout(p: CardP, box: Box): LayoutOut {
    const items: Item[] = [];
    const narrow = box.narrow || box.w < 560;
    // a phone: 12 px side padding, 8 over the title and under the last line, the tight line pitch
    const ph = box.narrow, PX = ph ? 12 : 16;
    const insW = p.ins.length ? Math.max(...p.ins.map((s) => measure(s, "body") + 60)) : 0;
    // beside: the card takes about 28% of the stage's width at its left; its cards share the row to its right
    const Ws = box.w + 28, side = p.beside.length > 0 && !narrow, bx0 = Math.max(0, 0.02 * Ws - 14);
    const cw = side ? Math.max(240, 0.28 * Ws) : p.ins.length && !narrow ? Math.min(box.w - insW - 30, Math.max(360, box.w * 0.38)) : box.w;
    const cx = side ? bx0 : box.w - cw;
    let y = ph ? 8 : 12;
    // the title wraps to the card
    const head: Item[] = []; for (const t of wrap(p.title, cw - 2 * PX, "title", 3)) { head.push({ k: "text", x: cx + PX, y: y + 13, s: t, f: "title", ink: "ink", tip: t === p.title ? undefined : p.title }); y += LINE_H.title; } y += 20 - LINE_H.title;
    if (p.sub) for (const s of wrap(p.sub, cw - 2 * PX, "sub", 2)) { head.push({ k: "text", x: cx + PX, y: y + 11, s, f: "sub", ink:p.tone?`${p.tone}:ink`:"muted" }); y += LINE_H.sub; }
    y += ph ? 4 : 8;
    // the cards inside: side by side when they fit
    if (p.inner.length) {
      const per = narrow ? 1 : p.inner.length, iw = (cw - 2 * PX - (per - 1) * 12) / per;
      const ih = Math.max(...p.inner.map((c) => 34 + c.lines.reduce((a, l) => a + wrap(styled(l, c.role).s, iw - 24, "sub", 3).length * LINE_H.sub, 0)));
      p.inner.forEach((c, j) => {
        const x = cx + PX + (j % per) * (iw + 12), yy = y + Math.floor(j / per) * (ih + 10);
        head.push({ k: "box", x, y: yy, w: iw, h: ih, fill: `role:${c.role}:soft`, stroke: `role:${c.role}:line`, r: 8, cls: "scn-shape", role: c.role, bar: { kind: "card", label: c.title, role: c.role } }, { k: "text", x: x + 12, y: yy + 20, s: c.title, f: "title", ink: "ink" });
        let ly = yy + 28;
        for (const l of c.lines) { const st = styled(l, p.role); for (const s of wrapRoom(st.s, iw - 24, "sub", 3, 10)) { head.push({ k: "text", x: x + 12, y: ly + 11, s, f: "sub", ink: st.ink === "ink" ? "ink-2" : st.ink }); ly += LINE_H.sub; } }
      });
      y += Math.ceil(p.inner.length / per) * (ih + 10);
    }
    // its own lines: a left column and, when wide enough, a right one
    const twoCols = p.right.length && !narrow;
    const lw = twoCols ? (cw - 2 * PX) * 0.52 : cw - 2 * PX;
    const L = styledLines(cx + PX, y, lw, p.left, p.role, ph), R = p.right.length ? styledLines(twoCols ? cx + PX + lw + 24 : cx + PX, twoCols ? y : y + L.h + 8, twoCols ? cw - 2 * PX - lw - 24 : cw - 2 * PX, p.right, p.role, ph) : { h: 0, items: [] };
    head.push(...L.items, ...R.items);
    y += twoCols ? Math.max(L.h, R.h) : L.h + (R.h ? R.h + 8 : 0);
    const h = y + (ph ? 8 : 12);
    items.push({ k: "box", x: cx, y: 0, w: cw, h, fill:p.tone?`${p.tone}:soft`:`role:${p.role}:soft`, stroke:p.tone?`${p.tone}:ink`:`role:${p.role}:line`, r: 12, cls: "scn-frame", ...(!p.tone?{role:p.role}:{}), thick: true, bar: { kind: cw >= box.w - 1 && !p.beside.length && !box.beside && !box.inset ? "panel" : "card", label:p.title,...(p.tone?{tone:p.tone}:{role:p.role}) } } /* a full-width card is the step's panel (the reference design: journey step 6) */, ...head);
    if (p.beside.length) {
      // the cards beside: a row from about 37% to 95.6% of the stage's width, centred on the card, an arrow from the card
      // to the first; on a phone, two a row under the card, a short arrow down to them
      const per = side ? p.beside.length : Math.min(2, p.beside.length), gap = 12;
      const ax = side ? Math.max(cx + cw + 40, 0.37 * Ws - 14) : 0, aw = side ? Math.max(per * 60, Math.min(box.w, 0.956 * Ws - 14) - ax) : box.w;
      const bw = (aw - (per - 1) * gap) / per;
      const bh = Math.max(...p.beside.map((c) => 34 + c.lines.reduce((a, l) => a + wrap(styled(l, c.role).s, bw - 24, "sub", 3).length * LINE_H.sub, 0)));
      const rows = Math.ceil(p.beside.length / per), top = side ? Math.max(0, (h - bh) / 2) : h + 24;
      p.beside.forEach((c, j) => {
        const x = ax + (j % per) * (bw + gap), yy = top + Math.floor(j / per) * (bh + 10);
        items.push({ k: "box", x, y: yy, w: bw, h: bh, fill: `role:${c.role}:soft`, stroke: `role:${c.role}:line`, r: 8, cls: "scn-shape", role: c.role, bar: { kind: "card", label: c.title, role: c.role } }, { k: "text", x: x + 12, y: yy + 20, s: wrap(c.title, bw - 24, "title", 1)[0], f: "title", ink: "ink", tip: c.title });
        let ly = yy + 28;
        for (const l of c.lines) { const st = styled(l, c.role); for (const s of wrap(st.s, bw - 24, "sub", 3)) { items.push({ k: "text", x: x + 12, y: ly + 11, s, f: "sub", ink: st.ink === "ink" ? "ink-2" : st.ink }); ly += LINE_H.sub; } }
      });
      if (side) items.push({ k: "path", pts: [[cx + cw + 2, top + bh / 2], [ax - 3, top + bh / 2]], ink: `role:${p.role}:line`, dash: true, arrow: true, w: 1.5, bar: { edge: 1 } });
      else { const fx = Math.max(cx + 12, Math.min(cx + cw - 12, ax + bw / 2)); items.push({ k: "path", pts: [[fx, h + 2], [fx, top - 3]], ink: `role:${p.role}:line`, dash: true, arrow: true, w: 1.5, bar: { edge: 1 } }); } // straight down into the first card (not the gap between two)
      let bottom = top + rows * (bh + 10) - 10;
      if (p.under.length) { const u = textLines(ax, bottom + 6, aw, p.under, "sub", "muted"); items.push(...u.items); bottom += 6 + u.h; }
      return { h: side ? Math.max(h, bottom) : bottom, items };
    }
    // the chips coming in: a column at its left (above it on a phone)
    if (p.ins.length) {
      const colX = narrow ? 0 : cx - 30 - insW, top = narrow ? 0 : 38 + Math.max(0, (h - 38 - p.ins.length * 40) / 2); // centred in the body, under the card's title row
      if (narrow) { const moved = shift(items.splice(0), 0, p.ins.length * 40 + 4); items.push(...moved); }
      p.ins.forEach((s, j) => items.push(...shift(chip(colX + insW / 2, top + j * 40 + 6, s, `role:${p.insRole ?? p.role}`, insW, "body").items, 0, 0)));
      return { h: narrow ? h + p.ins.length * 40 + 4 : Math.max(h, top + p.ins.length * 40), items };
    }
    return { h, items };
  },
  facts: (p: CardP) => [`${p.title}${p.sub ? ` (${p.sub})` : ""}${p.ins.length ? `; in: ${p.ins.join(", ")}` : ""}${p.inner.length ? `; ${p.inner.map((c) => `${c.title}: ${c.lines.map((l) => styled(l, null).s).join(", ")}`).join("; ")}` : ""}${p.left.length ? `; ${p.left.map((l) => styled(l, null).s).join(" ")}` : ""}${p.right.length ? `; ${p.right.map((l) => styled(l, null).s).join(" ")}` : ""}${p.beside.length ? `; beside it: ${p.beside.map((c) => `${c.title}${c.lines.length ? " (" + c.lines.map((l) => styled(l, null).s).join(", ") + ")" : ""}`).join("; ")}${p.under.length ? "; " + p.under.join(" ") : ""}` : ""}.`],
} satisfies StageBlock<CardP>);
