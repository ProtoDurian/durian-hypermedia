// This package is the source of this file: edit it here. It began as a copy of the private prototype's composed stage (0.7.0).
// Bins (stage block "bins"): things in an inventory, named bins, and per step the things that drop into a bin.
// A thing may be dropped again in a later step: it moves to another bin (a re-bin). A bin may appear at a later step
// (`from 2`) with its place reserved from the start. Counts per bin, the leftover and a running total are worked out
// and drawn by the block; an optional ledger lists every thing with the number of its bin per step.
//
// bins: Sorting the post | parcels
// items p1..p8: parcel 1; parcel 2; parcel 3; parcel 4; parcel 5; parcel 6; parcel 7; parcel 8
// bin ops a "Light": under 1 kg | goes by letter
// bin api b "Heavy": over 1 kg
// bin job c "Odd" from 3: needs a form (shown from step 3; its place is reserved from the start)
// ledger: Parcel | Bin (optional: a list of every thing and its bin number per step)
// inventory: off (optional: no inventory frame, when every thing is binned in step 1)
// @step First: The light ones go first.
// into a: p1, p2, p3
// @step Rest: The heavy ones follow; p1 moves to the odd bin.
// into b: p4..p6
// into c: p1
//
// `items 40: parcel` is 40 unnamed units (small squares); `into a: 12` takes the next 12 left in the inventory.
// Every place is worked out once for all steps: a thing has one slot in the inventory and one reserved slot in every
// bin it ever sits in. Linear time; one hand-written scan per line; every loop charges the document budget.
import { type Item, type StageBlock, type Box, type LayoutOut, StageError, ID_RE, registerBlock, measure, wrap, parts, colon, expandIds } from "./stage-core";
import { docBudget } from "./stage-budget";

export const BINS_LIMITS = { units: 200, bins: 8 } as const;

type Bin = { role: string; id: string; label: string; rule: string; subs: string[]; from: number };
type Unit = { id: string; label: string; anon: boolean; hist: { step: number; bin: string }[] };
type Ledger = { head: string; col: string; base: number };
type Drop = { step: number; bin: string; ids: string[]; moved: { id: string; from: string }[] };
type Bins = { title: string; noun: string; bins: Bin[]; units: Unit[]; byId: Map<string, Unit>; drops: Drop[]; ledger?: Ledger; inventory: boolean; line: number; table?: boolean; lit: { step: number; bin: string; text: string }[]; shown: Set<string> };

/** the bin a thing is in at step s (undefined: still in the inventory) */
const binAt = (u: Unit, s: number): string | undefined => { let b: string | undefined; for (const h of u.hist) if (h.step <= s) b = h.bin; return b; };
const lastBin = (u: Unit) => u.hist.at(-1)?.bin;
const COUNT_RE = /^\d+$/;

// the table form (`form: table`, needs a ledger): every thing is one row (its label, then one "→ bin" column per
// step), every bin is a tall column to the right, and a thing's chip sits in its own row of the bin it is in.
// No inventory, no counts, no running total: the rows are the inventory. A moved chip keeps its bin's colour, thick.
// On a phone the columns would be too narrow for a bin's name or a chip's words: the rows keep the full width, and
// every bin follows under them as a full-width box (its name, rule and notes on top) with a chip, in words, for each
// stay of a thing in it. Every slot is fixed for all steps; a chip shows while the thing is in that bin.
function stackedLayout(t: Bins, box: Box): LayoutOut {
  const items: Item[] = [], w = box.w, S = Math.max(1, box.steps), PAD = 10, colW = 28;
  docBudget().charge("bins stacked", t.units.length * (S + t.bins.length) + 16, t.units.length * 4);
  const base = t.ledger!.base, binNo = new Map(t.bins.map((b, i) => [b.id, i + base])), labW = w - S * colW - 4;
  let y = 0;
  if (t.title) for (const s of wrap(t.title, w, "body", 2)) { y += 16; items.push({ k: "text", x: 0, y: y - 3, s, f: "body", ink: "ink", tip: t.title }); }
  if (t.ledger!.head) for (const s of wrap(t.ledger!.head, w, "sub", 3)) { y += 14; items.push({ k: "text", x: 0, y: y - 3, s, f: "sub", ink: "muted" }); }
  y += 6;
  for (const u of t.units) {
    const L = wrap(u.label, labW, "body", 3), h = 15 * L.length + 6, cy = y + h / 2;
    L.forEach((s, k) => items.push({ k: "text", x: 0, y: cy - (L.length - 1) * 7.5 + k * 15 + 4, s, f: "body", ink: "ink", tip: u.label }));
    for (let s = 1; s <= S; s++) {
      const now = binAt(u, s), before = s > 1 ? binAt(u, s - 1) : undefined, moved = s > 1 && before !== undefined && now !== before;
      if (now === undefined) continue;
      const b = t.bins.find((x) => x.id === now)!;
      items.push({ k: "text", x: labW + 4 + (s - 1) * colW, y: cy + 4, s: `→ ${binNo.get(now)}`, f: moved ? "small-b" : "sub", ink: moved ? "warn:ink" : `role:${b.role}:ink`, from: s, to: 0, bar: { column: `bins-step-${s}` } });
    }
    y += h;
  }
  const per = 2, gap = 6, cw = (w - 2 * PAD - (per - 1) * gap) / per;
  for (const b of t.bins) {
    y += 10; const top = y, win = { from: b.from, to: 0 };
    const head = wrap(b.label, w - 2 * PAD, "title", 3), rule = [b.rule, ...b.subs].filter(Boolean).flatMap((x) => wrap(x, w - 2 * PAD, "sub", 3));
    const slots = t.units.flatMap((u) => u.hist.map((h, k) => ({ u, h, k })).filter(({ h }) => h.bin === b.id));
    const lines = slots.map(({ u }) => wrap(u.label, cw - 12, "chip", 3)), chipH = 8 + 14 * Math.max(1, ...lines.map((l) => l.length));
    const notes = t.lit.filter((q) => q.bin === b.id && q.text).map((q) => ({ q, L: wrap(q.text!, w - 2 * PAD, "sub", 3) }));
    let iy = top + 8;
    const text: Item[] = [];
    for (const s of head) { iy += 16; text.push({ k: "text", x: PAD, y: iy - 4, s, f: "title", ink: "ink", tip: b.label, ...win }); }
    for (const s of rule) { iy += 14; text.push({ k: "text", x: PAD, y: iy - 3, s, f: "sub", ink: "muted", ...win }); }
    iy += 6;
    const chips: Item[] = [];
    slots.forEach(({ u, h, k }, i) => {
      const to = u.hist[k + 1] ? u.hist[k + 1].step - 1 : 0, cx = PAD + (i % per) * (cw + gap), cy = iy + Math.floor(i / per) * (chipH + gap), w2 = { from: h.step, to, hot: [h.step] };
      chips.push({ k: "box", x: cx, y: cy, w: cw, h: chipH, fill: `role:${b.role}:soft`, stroke: `role:${b.role}:line`, r: 8, cls: "scn-shape stg-chip", role: b.role, id: `unit:${u.id}@${b.id}`, thick: k > 0, ...w2 });
      lines[i].forEach((ln, q) => chips.push({ k: "text", x: cx + cw / 2, y: cy + 4 + 14 * (q + 1) - 3 + (chipH - 8 - 14 * lines[i].length) / 2, s: ln, f: "chip", ink: `role:${b.role}:ink`, anchor: "middle", tip: u.label, ...w2 }));
    });
    iy += Math.ceil(slots.length / per) * (chipH + gap);
    for (const { q, L } of notes) for (const s of L) { iy += 14; text.push({ k: "text", x: PAD, y: iy - 3, s, f: "sub", ink: `role:${b.role}:ink`, from: q.step, to: q.step }); }
    y = iy + 8;
    items.push({ k: "box", x: 0, y: top, w, h: y - top, fill: `role:${b.role}:soft`, stroke: `role:${b.role}:line`, r: 10, cls: "scn-frame", role: b.role, id: `bin:${b.id}`, ...win, bar: { kind: "bin", id: b.id, label: b.label } }, ...text, ...chips);
  }
  return { h: y + 4, items };
}

function tableLayout(t: Bins, box: Box): LayoutOut {
  const items: Item[] = [], w = box.w, S = Math.max(1, box.steps), PAD = 10, narrow = box.narrow;
  docBudget().charge("bins table", t.units.length * (S + t.bins.length) + 16, t.units.length * 4);
  const base = t.ledger!.base, binNo = new Map(t.bins.map((b, i) => [b.id, i + base]));
  const colW = narrow ? 28 : 46, ledW = narrow ? Math.round(w * 0.56) : Math.round(Math.max(240, w * 0.33)), labW = ledW - S * colW - 4;
  const BX = ledW + (narrow ? 6 : 24), gapB = narrow ? 6 : 16, nB = t.bins.length, bw = (w - BX - (nB - 1) * gapB) / nB;
  const dots = narrow || bw < 120 || t.units.some((u) => u.anon || !u.label);
  const slotW = dots ? 14 : bw - 2 * PAD;
  const chipLines = new Map(t.units.map((u) => [u.id, dots ? [] : wrap(u.label, slotW - 12, "chip", 3)]));
  const slotH = dots ? 14 : 8 + 14 * Math.max(1, ...[...chipLines.values()].map((x) => x.length));
  const labLines = t.units.map((u) => wrap(u.label, labW, "body", narrow ? 3 : 2));
  const rowH = t.units.map((_, i) => Math.max(slotH, 15 * labLines[i].length) + (narrow ? 8 : 12));
  // header: the title and the ledger's head line on the left; each bin's name at the top of its column
  let hy = 0; const head: Item[] = [];
  if (t.title) for (const s of wrap(t.title, ledW, "body", 2)) { hy += 16; head.push({ k: "text", x: 0, y: hy - 3, s, f: "body", ink: "ink", tip: t.title }); }
  if (t.ledger!.head) for (const s of wrap(t.ledger!.head, ledW, "sub", 3)) { hy += 14; head.push({ k: "text", x: 0, y: hy - 3, s, f: "sub", ink: "muted" }); }
  // on a phone, the words every bin's name starts with go once into the header at the left when a word of a
  // name is wider than its column ("merger shard: 0, 1, 2"); each bin keeps the rest of its name (no word broken or cut)
  const binW = bw - (narrow ? 8 : 2 * PAD), names = t.bins.map((b) => b.label.split(" "));
  let lead = 0; while (narrow && names.every((n) => n.length > lead + 1 && n[lead] === names[0][lead])) lead++;
  const tooWide = narrow && t.bins.some((b) => b.label.split(" ").some((x) => measure(x, "chip") > binW));
  const shared = tooWide && lead > 0 && names.every((n) => n.slice(lead).every((x) => measure(x, "chip") <= binW)) ? names[0].slice(0, lead).join(" ") : "";
  if (shared) for (const s of wrap(`${shared}: ${names.map((n) => n.slice(lead).join(" ")).join(", ")}`, ledW, "sub", 4)) { hy += 14; head.push({ k: "text", x: 0, y: hy - 3, s, f: "sub", ink: "muted" }); }
  const binLab = t.bins.map((b, i) => wrap(shared ? names[i].slice(lead).join(" ") : b.label, binW, narrow ? "chip" : "title", narrow ? 3 : 2)), binRule = t.bins.map((b) => [b.rule, ...b.subs].filter(Boolean).flatMap((x) => wrap(x, bw - 2 * PAD, "sub", 2)).slice(0, 3));
  const binHdr = Math.max(...t.bins.map((_, i) => 12 + binLab[i].length * 16 + binRule[i].length * 14)) + 8;
  const top = 0, rowsTop = Math.max(hy + 8, binHdr);
  items.push(...head.map((it) => ({ ...it, y: (it as any).y + Math.max(0, rowsTop - hy - 8) })));
  const rowY: number[] = []; let ry = rowsTop;
  for (const h of rowH) { rowY.push(ry); ry += h; }
  const bottom = ry + (narrow ? 8 : 24) + (t.lit.some((q) => q.text) ? 30 : 0);
  // the rows: label, then the bin number per step (shown from its step on)
  t.units.forEach((u, i) => {
    const cy = rowY[i] + rowH[i] / 2;
    labLines[i].forEach((s, k) => items.push({ k: "text", x: 0, y: cy - (labLines[i].length - 1) * 7.5 + k * 15 + 4, s, f: "body", ink: "ink", tip: u.label }));
    for (let s = 1; s <= S; s++) {
      const now = binAt(u, s), before = s > 1 ? binAt(u, s - 1) : undefined, moved = s > 1 && before !== undefined && now !== before;
      if (now === undefined) continue;
      const b = t.bins.find((x) => x.id === now)!;
      items.push({ k: "text", x: labW + 4 + (s - 1) * colW, y: cy + 4, s: `→ ${binNo.get(now)}`, f: moved ? "small-b" : "sub", ink: moved ? "warn:ink" : `role:${b.role}:ink`, from: s, to: 0, bar: { column: `bins-step-${s}` } });
    }
  });
  // the bins: tall columns; each stay of a thing is a chip in the thing's row
  t.bins.forEach((b, j) => {
    const x = BX + j * (bw + gapB), win = { from: b.from, to: 0 }, hot = [...new Set([...t.drops.filter((d) => d.bin === b.id).map((d) => d.step), ...t.lit.filter((q) => q.bin === b.id).map((q) => q.step)])];
    items.push({ k: "box", x, y: top, w: bw, h: bottom - top, fill: `role:${b.role}:soft`, stroke: `role:${b.role}:line`, r: 10, cls: "scn-frame", role: b.role, id: `bin:${b.id}`, hot, ...win, bar: { kind: "bin", id: b.id, label: b.label } });
    binLab[j].forEach((s, k) => items.push({ k: "text", x: x + (narrow ? 4 : PAD), y: top + 12 + (k + 1) * 16 - 4, s, f: narrow ? "chip" : "title", ink: "ink", tip: b.label, ...win }));
    binRule[j].forEach((s, k) => items.push({ k: "text", x: x + PAD, y: top + 12 + binLab[j].length * 16 + (k + 1) * 14 - 3, s, f: "sub", ink: "muted", ...win }));
    for (const q of t.lit.filter((q) => q.bin === b.id && q.text)) wrap(q.text, bw - 2 * PAD, "sub", 2).forEach((s, k, all) => items.push({ k: "text", x: x + PAD, y: bottom - 8 - (all.length - 1 - k) * 14, s, f: "sub", ink: `role:${b.role}:ink`, from: q.step, to: q.step }));
    t.units.forEach((u, i) => u.hist.forEach((h, k) => {
      if (h.bin !== b.id) return;
      const to = u.hist[k + 1] ? u.hist[k + 1].step - 1 : 0, sx = x + (bw - slotW) / 2, sy = rowY[i] + (rowH[i] - slotH) / 2, moved = k > 0;
      const win2 = { from: h.step, to, hot: [h.step] };
      items.push({ k: "box", x: sx, y: sy, w: slotW, h: slotH, fill: `role:${b.role}:soft`, stroke: `role:${b.role}:line`, r: dots ? 3 : 8, cls: dots ? "scn-shape" : "scn-shape stg-chip", role: b.role, id: `unit:${u.id}@${b.id}`, thick: moved, ...win2 });
      const L = chipLines.get(u.id)!;
      L.forEach((ln, q) => items.push({ k: "text", x: sx + slotW / 2, y: sy + 4 + 14 * (q + 1) - 3 + (slotH - 8 - 14 * L.length) / 2, s: ln, f: "chip", ink: `role:${b.role}:ink`, anchor: "middle", tip: u.label, ...win2 }));
    }));
  });
  return { h: bottom + 4, items };
}

registerBlock({
  word: "bins", kind: "head", ops: ["into", "show", "light"],
  parse(inp): Bins {
    const [title = "", noun = ""] = inp.arg.split(" | ").map((x) => x.trim());
    return { title, noun: noun || "items", bins: [], units: [], byId: new Map(), drops: [], inventory: true, line: inp.line, lit: [], shown: new Set() };
  },
  claim(t: Bins, l, body, ctx) {
    if (l.t === "inventory: off" || l.t === "inventory: on") { t.inventory = l.t.endsWith("on"); return true; }
    if (l.t === "form: table") { t.table = true; t.inventory = false; return true; }
    if (l.t === "ledger" || l.t.startsWith("ledger: ")) {
      const [h = "", c0 = ""] = l.t.slice(8).split(" | ").map((x) => x.trim());
      let c = c0, base = 1; const fk = c0.lastIndexOf(" from ");
      if (fk >= 0 && COUNT_RE.test(c0.slice(fk + 6).trim())) { base = +c0.slice(fk + 6); c = c0.slice(0, fk).trim(); }
      else if (c0.startsWith("from ") && COUNT_RE.test(c0.slice(5).trim())) { base = +c0.slice(5); c = ""; }
      t.ledger = { head: h || "Item", col: c || "Bin", base }; return true;
    }
    const bin = l.t.startsWith("bin "), items = l.t.startsWith("items ");
    if (!bin && !items) return false;
    for (const b of body) throw new StageError(b.n, `a ${bin ? "bin" : "items"} line is one line: nothing is indented under it`);
    docBudget().charge("bins lines", l.t.length + 1, l.t.length);
    if (bin) {
      const c = colon(l.t.slice(4)) ?? [l.t.slice(4), ""];
      let from = 1; const fk = c[0].lastIndexOf(" from ");
      if (fk > 0 && COUNT_RE.test(c[0].slice(fk + 6).trim())) { from = +c[0].slice(fk + 6); c[0] = c[0].slice(0, fk); if (from < 1) throw new StageError(l.n, `"from" names a step, 1 or more: bin job c "Odd" from 3: rule`); }
      const q = c[0].indexOf(' "'), label = q > 0 && c[0].endsWith('"') ? c[0].slice(q + 2, -1) : "";
      const [role, id] = (q > 0 ? c[0].slice(0, q) : c[0]).trim().split(" ");
      if (!id) throw new StageError(l.n, `a bin is: bin role id "label": the rule | a second line (here: ${l.t})`);
      if (!ID_RE.test(id)) throw new StageError(l.n, `"${id}" is not an id: letters, digits, -, _ and ., starting with a letter`);
      if (!ctx.roles.has(role)) ctx.problem(l.n, `"${role}" is not a role of this page; the page declares ${[...ctx.roles].join(", ") || "none"}`);
      if (t.bins.some((x) => x.id === id)) throw new StageError(l.n, `bin "${id}" is declared twice`);
      if (t.bins.length >= BINS_LIMITS.bins) throw new StageError(l.n, `bins holds at most ${BINS_LIMITS.bins} bins`);
      const [rule = "", ...subs] = c[1].split(" | ").map((x) => x.trim());
      t.bins.push({ role, id, label: label || id, rule, subs, from });
      return true;
    }
    // items p1..p8: label; label... | items 40: label
    const rest = l.t.slice(6), c = colon(rest) ?? [rest, ""];
    const spec = c[0].trim(), labels = parts(c[1], ";");
    if (COUNT_RE.test(spec)) {
      const n = +spec;
      if (n < 1 || n + t.units.length > BINS_LIMITS.units) throw new StageError(l.n, `a scene holds at most ${BINS_LIMITS.units} items (this line makes it ${t.units.length + n})`);
      for (let i = 0; i < n; i++) { const id = `#${t.units.length + 1}`; const u = { id, label: labels[0] ?? "", anon: true, hist: [] }; t.units.push(u); t.byId.set(id, u); }
      docBudget().charge("bins items", n, n);
      return true;
    }
    const ids = expandIds(spec, []);
    if (!ids.length) throw new StageError(l.n, `items is "items p1..p8: label" (ids, then the words) or "items 40: label" (a count)`);
    if (labels.length > 1 && labels.length !== ids.length) throw new StageError(l.n, `${ids.length} ids but ${labels.length} labels: give one label per id (a; b; c), or one for all`);
    if (t.units.length + ids.length > BINS_LIMITS.units) throw new StageError(l.n, `a scene holds at most ${BINS_LIMITS.units} items (this line makes it ${t.units.length + ids.length})`);
    docBudget().charge("bins items", ids.length, ids.length);
    ids.forEach((id, k) => {
      if (!ID_RE.test(id)) throw new StageError(l.n, `"${id}" is not an id: letters, digits, -, _ and ., starting with a letter`);
      if (t.byId.has(id)) throw new StageError(l.n, `item "${id}" is declared twice`);
      const u = { id, label: labels.length > 1 ? labels[k] : labels[0] ?? id, anon: false, hist: [] };
      t.units.push(u); t.byId.set(id, u);
    });
    return true;
  },
  op(t: Bins, op, ctx) {
    // "show c": a bin that comes in this step (its place is reserved from the start); "light a: words": a bin lit, a note in it
    if (op.word === "show" || op.word === "light") {
      const c0 = colon(op.arg), ids = expandIds(c0 ? c0[0] : op.arg, t.bins.map((b) => b.id));
      if (!ids.length || ids.some((id) => !t.bins.some((b) => b.id === id))) { if (op.shared) return false; ctx.problem(op.line, `"${ids.find((id) => !t.bins.some((b) => b.id === id)) ?? op.arg}" is not a bin of this scene (${t.bins.map((b) => b.id).join(", ")})`); return; }
      for (const id of ids) {
        const b = t.bins.find((x) => x.id === id)!;
        if (op.word === "light") { t.lit.push({ step: op.step, bin: id, text: c0 ? c0[1].trim() : "" }); continue; }
        if (t.shown.has(id)) { ctx.problem(op.line, `bin ${id} is shown twice: show it once, in the step it comes in`); return; }
        if (t.drops.some((d) => d.bin === id && d.step < op.step)) { ctx.problem(op.line, `bin ${id} takes things before step ${op.step}: show it in the first step it takes them, or earlier`); return; }
        t.shown.add(id); b.from = op.step;
      }
      return;
    }
    const c = colon(op.arg);
    if (!c || !c[1]) { ctx.problem(op.line, `into names a bin and what drops into it: into a: p1, p2   or   into a: 4`); return; }
    if (!t.bins.length || !t.units.length) { ctx.problem(op.line, `into needs bins: declare "bin role id \\"label\\": rule" and "items p1..p8: label" in the setup, under "bins:"`); return; }
    const bin = t.bins.find((b) => b.id === c[0].trim());
    if (!bin) { ctx.problem(op.line, `"${c[0].trim()}" is not a bin of this scene (${t.bins.map((b) => b.id).join(", ")})`); return; }
    if (op.step < bin.from) { ctx.problem(op.line, `bin ${bin.id} appears from step ${bin.from}: it cannot take things in step ${op.step}`); return; }
    docBudget().charge("bins drop", c[1].length + 1, c[1].length);
    let ids: string[];
    if (COUNT_RE.test(c[1].trim())) {
      const n = +c[1].trim(), left = t.units.filter((u) => !u.hist.length);
      if (n < 1 || n > left.length) { ctx.problem(op.line, `into ${bin.id}: ${n} asks for ${n} but ${left.length} are left in the inventory`); return; }
      ids = left.slice(0, n).map((u) => u.id);
    } else {
      ids = expandIds(c[1], t.units.map((u) => u.id));
      const bad = ids.filter((id) => !t.byId.has(id));
      if (bad.length) { ctx.problem(op.line, `"${bad[0]}" is not an item of this scene (${t.units.slice(0, 12).map((u) => u.id).join(", ")}${t.units.length > 12 ? ", ..." : ""})`); return; }
      const seen = new Set<string>();
      for (const id of ids) {
        const u = t.byId.get(id)!;
        if (seen.has(id)) { ctx.problem(op.line, `"${id}" is written twice in this line`); return; }
        seen.add(id);
        if (lastBin(u) === bin.id) { ctx.problem(op.line, `"${id}" is already in bin ${bin.id}: name another bin to move it`); return; }
        if (u.hist.at(-1)?.step === op.step) { ctx.problem(op.line, `"${id}" already moved in step ${op.step}: a thing moves once per step`); return; }
      }
    }
    const moved: Drop["moved"] = [];
    for (const id of ids) { const u = t.byId.get(id)!, was = lastBin(u); if (was) moved.push({ id, from: was }); u.hist.push({ step: op.step, bin: bin.id }); }
    t.drops.push({ step: op.step, bin: bin.id, ids, moved });
  },
  layout(t: Bins, box: Box): LayoutOut {
    const items: Item[] = [], w = box.w, S = box.steps;
    docBudget().charge("bins layout", t.units.length * 6 + t.bins.length * 8 + 16, t.units.length * 6);
    if (t.table && t.ledger && t.bins.length && t.units.length) return box.w < 480 ? stackedLayout(t, box) : tableLayout(t, box);
    if (!t.bins.length || !t.units.length) {
      const l = wrap("bins needs bin lines and items lines in the setup", w, "sub", 2);
      l.forEach((s, i) => items.push({ k: "text", x: 0, y: 14 + i * 14, s, f: "sub", ink: "warn:ink" }));
      return { h: 8 + l.length * 14, items };
    }
    const when = (s: number) => (s ? { from: s, to: s } : {});
    const stepsL = S > 0 ? Array.from({ length: S }, (_, i) => i + 1) : [0];
    const N = t.units.length, PAD = 10, S1 = Math.max(1, S);
    const binNo = new Map(t.bins.map((b, i) => [b.id, i + (t.ledger?.base ?? 1)]));
    // what each step has done so far
    const inBinsAt = (s: number) => t.units.filter((u) => binAt(u, s || S1) !== undefined).length;
    const countAt = (b: string, s: number) => t.units.filter((u) => binAt(u, s || S1) === b).length;
    // slot size: chips with their words, or small squares when there are many or none have words
    const dots = !(t.units.every((u) => !u.anon && u.label) && N <= 48);
    const innerW = w - 2 * PAD, gap = dots ? 4 : 6;
    const slotW = dots ? 14 : Math.min(innerW, box.narrow ? w * 0.45 : N <= 24 ? 170 : 130, Math.max(36, ...t.units.map((u) => measure(u.label, "chip") + 16)));
    // a label that does not fit one line wraps to more (never cut): every chip is as tall as the tallest
    const chipLines = new Map(t.units.map((u) => [u.id, dots ? [] : wrap(u.label, slotW - 12, "chip", 4)]));
    const slotH = dots ? 14 : 8 + 14 * Math.max(1, ...[...chipLines.values()].map((x) => x.length));
    const chip = (x: number, y: number, u: Unit, paint: { fill: string; stroke: string; ink: string; role?: string }, win: { from?: number; to?: number; hot?: number[] }, id?: string, thick?: boolean): Item[] =>
      [{ k: "box", x, y, w: slotW, h: slotH, fill: paint.fill, stroke: paint.stroke, r: dots ? 3 : 11, cls: dots ? "scn-shape" : "scn-shape stg-chip", role: paint.role, id, thick, ...win },
        ...chipLines.get(u.id)!.map((ln, k) => ({ k: "text", x: x + slotW / 2, y: y + 4 + 14 * (k + 1) - 3 + (slotH - 8 - 14 * chipLines.get(u.id)!.length) / 2, s: ln, f: "chip", ink: paint.ink, anchor: "middle", tip: u.label, ...win } as Item))];
    const ghost = (x: number, y: number, from: number): Item => ({ k: "box", x, y, w: slotW, h: slotH, fill: "none", stroke: "scn-faint-edge", r: dots ? 3 : 11, dash: true, cls: "stg-slot", from });
    let y = 0;
    if (t.title) { items.push({ k: "text", x: 0, y: 14, s: wrap(t.title, w, "lane", 1)[0], f: "lane", ink: "ink", tip: t.title }); y = 24; }
    // the inventory
    if (t.inventory) {
      const per = Math.max(1, Math.floor((innerW + gap) / (slotW + gap))), rows = Math.ceil(N / per), invH = 32 + rows * (slotH + gap) - gap + 10;
      items.push({ k: "box", x: 0, y, w, h: invH, fill: "surface", stroke: "line-2", r: 10, cls: "scn-frame", id: "bins:inventory" });
      items.push({ k: "text", x: PAD, y: y + 20, s: "Inventory", f: "small-b", ink: "ink-2" });
      for (const s of stepsL) items.push({ k: "text", x: w - PAD, y: y + 20, s: `${N - inBinsAt(s)} left`, f: "small-b", ink: "muted", anchor: "end", ...when(s) });
      t.units.forEach((u, i) => {
        const x = PAD + (i % per) * (slotW + gap), yy = y + 32 + Math.floor(i / per) * (slotH + gap), d = u.hist[0]?.step;
        if (d === undefined || d > 1) items.push(...chip(x, yy, u, { fill: "surface-2", stroke: "scn-faint-edge", ink: "ink" }, { from: 1, to: d === undefined ? 0 : d - 1 }));
        if (d !== undefined) items.push(ghost(x, yy, d));
      });
      y += invH + 12;
    }
    // the ledger (beside the bins on a wide stage, above them on a narrow one) and the bins
    const ledW = t.ledger ? (box.narrow ? w : Math.min(300, Math.max(210, w * 0.3))) : 0;
    const ledLines = t.ledger ? t.units.map((u) => wrap(u.label, ledW - 2 * PAD - 70, "sub", 3)) : [], rowHs = ledLines.map((x) => 8 + 14 * x.length), ledH = t.ledger ? 32 + rowHs.reduce((a, b) => a + b, 0) + 8 : 0;
    const stacked = !!t.ledger && box.narrow, bx = t.ledger && !stacked ? ledW + 12 : 0, BW = t.ledger && !stacked ? w - bx : w, top = y;
    if (t.ledger) {
      items.push({ k: "box", x: 0, y, w: ledW, h: ledH, fill: "surface", stroke: "line-2", r: 10, cls: "scn-frame", id: "bins:ledger" });
      items.push({ k: "text", x: PAD, y: y + 20, s: wrap(t.ledger.head, ledW * 0.6, "small-b", 1)[0], f: "small-b", ink: "ink-2" });
      items.push({ k: "text", x: ledW - PAD, y: y + 20, s: wrap(t.ledger.col, ledW * 0.3, "small-b", 1)[0], f: "small-b", ink: "ink-2", anchor: "end" });
      let ry = y + 32;
      t.units.forEach((u, i) => {
        const yy = ry + 14; ry += rowHs[i];
        ledLines[i].forEach((ln, k) => items.push({ k: "text", x: PAD, y: yy + 14 * k, s: ln, f: "sub", ink: "ink", tip: u.label }));
        for (const s of stepsL) {
          const now = binAt(u, s || S1), before = s > 1 ? binAt(u, s - 1) : undefined, moved = s > 1 && before !== undefined && now !== before;
          const text = now === undefined ? "–" : moved ? `${binNo.get(before!)} → ${binNo.get(now)}` : String(binNo.get(now));
          items.push({ k: "text", x: ledW - PAD, y: yy, s: text, f: moved ? "small-b" : "sub", ink: moved ? "warn:ink" : "muted", anchor: "end", ...when(s) });
        }
      });
      if (stacked) y += ledH + 12;
    }
    const minBin = Math.max(slotW + 2 * PAD + 70, 160), cols = box.narrow ? 1 : Math.max(1, Math.min(t.bins.length, Math.floor((BW + 12) / (minBin + 12)))), bw = (BW - (cols - 1) * 12) / cols;
    const slotsPer = Math.max(1, Math.floor((bw - 2 * PAD + gap) / (slotW + gap)));
    const lay = t.bins.map((b) => {
      const label = wrap(`${t.ledger ? binNo.get(b.id) + ". " : ""}${b.label}`, bw - 2 * PAD - 66, "title", 2), rule = [b.rule, ...b.subs].filter(Boolean).flatMap((x) => wrap(x, bw - 2 * PAD, "sub", 2)).slice(0, 4);
      // one reserved slot for each stay of a thing in this bin, in the order the stays begin
      const stays: { u: Unit; from: number; to: number; first: boolean }[] = [];
      for (const u of t.units) u.hist.forEach((h, k) => { if (h.bin === b.id) stays.push({ u, from: h.step, to: u.hist[k + 1] ? u.hist[k + 1].step - 1 : 0, first: k === 0 }); });
      stays.sort((p, q) => p.from - q.from);
      const hdr = 10 + label.length * 16 + rule.length * 14 + 8, rowsB = Math.max(1, Math.ceil(stays.length / slotsPer));
      // a lit bin's note: one reserved place at the bin's foot, as tall as its longest note
      const notes = t.lit.filter((x) => x.bin === b.id && x.text).map((x) => ({ step: x.step, lines: wrap(x.text, bw - 2 * PAD, "sub", 2) }));
      const noteH = notes.length ? Math.max(...notes.map((x) => x.lines.length)) * 14 + 6 : 0;
      return { b, label, rule, stays, hdr, notes, noteH, h: hdr + rowsB * (slotH + gap) - gap + 12 + noteH };
    });
    const bottoms: number[] = [];
    let by = stacked ? top + ledH + 12 : top;
    for (let r = 0; r * cols < lay.length; r++) {
      const row = lay.slice(r * cols, r * cols + cols), h = Math.max(...row.map((x) => x.h));
      row.forEach((L, j) => {
        const x = bx + j * (bw + 12), b = L.b, win = { from: b.from, to: 0 }, hot = [...new Set([...t.drops.filter((d) => d.bin === b.id).map((d) => d.step), ...t.lit.filter((x) => x.bin === b.id).map((x) => x.step)])];
        items.push({ k: "box", x, y: by, w: bw, h, fill: `role:${b.role}:soft`, stroke: `role:${b.role}:line`, r: 10, cls: "scn-frame", role: b.role, id: `bin:${b.id}`, hot, ...win, bar: { kind: "bin", id: b.id, label: b.label } });
        L.label.forEach((s, i) => items.push({ k: "text", x: x + PAD, y: by + 10 + (i + 1) * 16 - 4, s, f: "title", ink: "ink", tip: b.label, ...win }));
        L.rule.forEach((s, i) => items.push({ k: "text", x: x + PAD, y: by + 10 + L.label.length * 16 + (i + 1) * 14 - 3, s, f: "sub", ink: "muted", ...win }));
        L.notes.forEach((n) => n.lines.forEach((s, i) => items.push({ k: "text", x: x + PAD, y: by + h - 8 - L.noteH + 6 + (i + 1) * 14 - 3, s, f: "sub", ink: `role:${b.role}:ink`, ...when(n.step) })));
        for (const s of stepsL.filter((q) => q >= b.from || q === 0)) {
          items.push({ k: "text", x: x + bw - PAD, y: by + 30, s: String(countAt(b.id, s)), f: "big", ink: `role:${b.role}:ink`, anchor: "end", ...when(s) });
          const add = t.drops.filter((d) => d.bin === b.id && d.step === s).reduce((a, d) => a + d.ids.length, 0);
          if (add) items.push({ k: "text", x: x + bw - PAD, y: by + 46, s: `+${add}`, f: "small-b", ink: "acc:ink", anchor: "end", ...when(s) });
        }
        L.stays.forEach((st, i) => {
          const sx = x + PAD + (i % slotsPer) * (slotW + gap), sy = by + L.hdr + Math.floor(i / slotsPer) * (slotH + gap), id = `unit:${st.u.id}@${b.id}`;
          const moved = !st.first, paint = { fill: `role:${b.role}:soft`, stroke: moved ? "warn:line" : `role:${b.role}:line`, ink: `role:${b.role}:ink`, role: b.role };
          items.push(...chip(sx, sy, st.u, paint, { from: st.from, to: st.to, hot: [st.from] }, id, moved));
          if (st.to) items.push(ghost(sx, sy, st.to + 1));
        });
      });
      by += h + 12; bottoms.push(by);
    }
    y = stacked ? by : Math.max(by, top + ledH + 12);
    // the running total
    for (const s of stepsL) items.push({ k: "text", x: PAD, y: y + 12, s: `Total: ${inBinsAt(s)} of ${N} ${t.noun} in bins · ${N - inBinsAt(s)} left`, f: "body", ink: "ink-2", ...when(s) });
    return { h: y + 20, items };
  },
  facts(t: Bins, step) {
    if (step === 0) {
      const named = t.units.every((u) => !u.anon) && t.units.length <= 24;
      return [`${t.title ? t.title + ": " : ""}${t.units.length} ${t.noun}${t.inventory ? " in the inventory" : ""}${named ? ` (${t.units.map((u) => u.label).join(", ")})`
        : ""}. Bins: ${t.bins.map((b, i) => `${t.ledger ? i + t.ledger.base + ". " : ""}${b.label}${b.rule ? ` (${b.rule})` : ""}${b.from > 1 ? `, from step ${b.from}` : ""}`).join("; ")}.`];
    }
    const lit = t.lit.filter((x) => x.step === step && x.text).map((x) => `${t.bins.find((b) => b.id === x.bin)!.label}: ${x.text}.`), shown = t.bins.filter((b) => b.from === step && step > 1).map((b) => `${b.label} comes in.`);
    const ds = t.drops.filter((d) => d.step === step); if (!ds.length) return [...shown, ...lit];
    const done = t.units.filter((u) => binAt(u, step) !== undefined).length, label = (id: string) => t.byId.get(id)!;
    return [...shown, ...ds.map((d) => {
      const b = t.bins.find((x) => x.id === d.bin)!, us = d.ids.map(label), named = us.every((u) => !u.anon) && us.length <= 24;
      const mv = d.moved.length ? `; moved from ${[...new Set(d.moved.map((m) => t.bins.find((x) => x.id === m.from)!.label))].join(", ")}: ${d.moved.map((m) => label(m.id).label).join(", ")}` : "";
      return `Into ${b.label}: ${named ? us.map((u) => u.label).join(", ") : `${us.length} ${t.noun}`} (${t.units.filter((u) => binAt(u, step) === d.bin).length} in it now${mv}).`;
    }), `Total: ${done} of ${t.units.length} in bins, ${t.units.length - done} left.`, ...lit];
  },
} satisfies StageBlock<Bins>);
