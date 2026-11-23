// This package is the source of this file: edit it here. It began as a copy of the private prototype's composed stage (0.7.0).
// a wordless cell row in a step panel (32 kept and 4 new).
// cells a: 32, +4 new <- a row of 32 plain small cells, then 4 in the accent tone; "a" the row's badge
// labels: 0..31 | 32-35 new <- optional: one entry per group; "x..y" under the group's first and last cell,
// one word centred under the group, "_" none
// Lines written one under the other are one panel (rows aligned, one under the other). The cells' places depend only on
// the width and the row's count: every line keeps a label band under it, so a cell stays put when labels come and go.
import { type Item, type StageBlock, StageError, registerBlock, colon, parts, measure, fontSize } from "./stage-core";
import { docBudget } from "./stage-budget";

type Group = { n: number; accent: boolean; word: string };
type Label = { a: string; b?: string } | null;
type Row = { badge: string; role: string; groups: Group[]; total: number; labels?: Label[] };
type Cells = { rows: Row[] };
const MAX_CELLS = 64, MAX_GROUPS = 8, MAX_ROWS = 8;
const FORM = `a cell row is "cells a: 32, +4 new": a badge, a colon, then the groups' counts ("+4 new": 4 cells in the accent tone, named new)`;

function parseRow(arg: string, body: { n: number; t: string }[], line: number, roles: Set<string>): Row {
  docBudget().charge("cells source", arg.length + 1, arg.length);
  const c = colon(arg);
  if (!c || !c[1].trim()) throw new StageError(line, FORM);
  const badge = c[0].trim();
  if (badge && !/^[a-z0-9]{1,3}$/i.test(badge)) throw new StageError(line, `a cell row's badge is one short word (1 to 3 letters or digits) before the colon: "cells a: 32, +4 new"`);
  const raw = parts(c[1], ",");
  if (raw.length > MAX_GROUPS) throw new StageError(line, `a cell row has at most ${MAX_GROUPS} groups; join some`);
  const groups: Group[] = []; let total = 0;
  for (const g of raw) {
    docBudget().charge("cells groups", g.length + 1, 1);
    const accent = g.startsWith("+"), s = accent ? g.slice(1) : g, sp = s.indexOf(" "), num = sp < 0 ? s : s.slice(0, sp);
    if (!/^\d{1,4}$/.test(num) || +num < 1) throw new StageError(line, `a cell group is a positive whole count ("32", or "+4 new" for 4 cells in the accent tone): "${g}"`);
    total += +num;
    if (total > MAX_CELLS) throw new StageError(line, `a cell row holds at most ${MAX_CELLS} cells; this one asks for more`);
    groups.push({ n: +num, accent, word: sp < 0 ? "" : s.slice(sp + 1).trim() });
  }
  docBudget().charge("cells row", total, total); // before any cell is made
  let labels: Label[] | undefined;
  for (const l of body) {
    docBudget().charge("cells labels", l.t.length + 1, l.t.length);
    const lc = colon(l.t);
    if (!lc || lc[0] !== "labels") throw new StageError(l.n, `under a cell row goes one line, "labels: 0..31 | 32-35 new" (one entry per group)`);
    if (labels) throw new StageError(l.n, "a cell row's labels are written once");
    const es = lc[1].split(" | ").map((x) => x.trim());
    if (es.length !== groups.length || es.some((e) => !e)) throw new StageError(l.n, `labels has one entry per group (${groups.length}), split by " | ": "labels: 0..31 | 32-35 new" ("_" for none)`);
    labels = es.map((e, i) => {
      if (e === "_") return null;
      const k = e.indexOf("..");
      if (k < 0) return { a: e };
      const a = e.slice(0, k).trim(), b = e.slice(k + 2).trim();
      if (!a || !b || a.includes(" ") || b.includes(" ")) throw new StageError(l.n, `"x..y" names a group's first and last cell, one word each: "0..31"`);
      if (groups[i].n === 1) throw new StageError(l.n, `a one-cell group's label is one word, not "x..y"`);
      return { a, b };
    });
  }
  return { badge, role: badge && roles.has(badge) ? badge : "", groups, total, labels };
}

registerBlock({
  word: "cells", kind: "panel",
  parse(inp, ctx): Cells { return { rows: [parseRow(inp.arg, inp.body, inp.line, ctx.roles)] }; },
  join(prev: Cells, next: Cells) { if (prev.rows.length + next.rows.length > MAX_ROWS) return false; prev.rows.push(...next.rows); return true; },
  layout(n: Cells, box) {
    const items: Item[] = [], narrow = box.narrow;
    const cw = narrow ? 11 : 14, ch = narrow ? 18 : 22, gap = narrow ? 4 : 4.5, pitch = cw + gap;
    const fs = fontSize("sub"), band = Math.ceil(fs) + 5; // a label band under every line of cells
    const bx = n.rows.some((r) => r.badge) ? 25 : 0;
    const cols = Math.max(1, Math.floor((box.w - bx - 2 + gap) / pitch));
    let y = 2;
    for (const [ri, r] of n.rows.entries()) {
      docBudget().charge("cells layout", r.total + 1, r.total);
      const lines = Math.ceil(r.total / cols), cx = (i: number) => bx + (i % cols) * pitch, ln = (i: number) => Math.floor(i / cols);
      // the labels: each in the first band of its line where it meets no other label
      type L = { s: string; x: number; left: number; w: number; line: number; anchor: "start" | "middle" | "end"; ink: string; band?: number };
      const ls: L[] = []; let at = 0;
      for (const [gi, g] of r.groups.entries()) {
        const lab = r.labels?.[gi], first = at, last = at + g.n - 1, ink = g.accent ? "acc:ink" : "muted"; at += g.n;
        if (!lab) continue;
        const put = (s: string, line: number, anchor: L["anchor"], x0: number) => {
          const w = measure(s, "sub"), x = anchor === "start" ? Math.max(0, Math.min(x0, box.w - w)) : anchor === "end" ? Math.min(box.w, Math.max(x0, w)) : Math.min(box.w - w / 2, Math.max(x0, w / 2));
          ls.push({ s, x, left: anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2, w, line, anchor, ink });
        };
        if (lab.b) { put(lab.a, ln(first), "start", cx(first)); put(lab.b, ln(last), "end", cx(last) + cw); }
        else { const from = Math.max(first, ln(last) * cols); put(lab.a, ln(last), "middle", (cx(from) + cx(last) + cw) / 2); }
      }
      const bands = Array.from({ length: lines }, () => [] as L[][]);
      for (const l of ls) {
        const bs = bands[l.line]; let k = 0;
        while (bs[k]?.some((o) => l.left < o.left + o.w + 4 && o.left < l.left + l.w + 4)) k++;
        (bs[k] ??= []).push(l); l.band = k;
      }
      const top: number[] = []; let yy = y;
      for (let j = 0; j < lines; j++) { top.push(yy); yy += ch + band * Math.max(1, bands[j].length); }
      if (r.badge) {
        const by = y + (ch - 17) / 2;
        items.push({ k: "box", x: 0, y: by, w: 17, h: 17, r: 4, fill: r.role ? "none" : "surface-2", stroke: r.role ? "none" : "stg-cell-line", cls: "stg-tag", bar: { kind: "chip", label: r.badge, id: `cells:${ri}:badge`, ...(r.role ? { role: r.role } : {}) } });
        items.push(r.role ? { k: "badge", x: 0, y: by, s: r.badge, role: r.role } : { k: "text", x: 8.5, y: by + 12.5, s: r.badge, f: "small-b", ink: "ink", anchor: "middle" });
      }
      let i = 0;
      for (const g of r.groups) for (let q = 0; q < g.n; q++, i++) {
        const id = `cells:${ri}:${i}`;
        items.push({ k: "box", x: cx(i), y: top[ln(i)], w: cw, h: ch, r: 3, fill: g.accent ? "acc:soft" : "surface-2", stroke: g.accent ? "acc:line" : "stg-cell-line", ...(g.accent ? { thick: true } : {}), cls: "scn-shape stg-cell", id, bar: { kind: "chip", id, ...(g.accent ? { tone: "accent" } : {}) } });
      }
      for (const l of ls) items.push({ k: "text", x: l.x, y: top[l.line] + ch + 2 + l.band! * band + fs, s: l.s, f: "sub", ink: l.ink, anchor: l.anchor });
      y = yy + 2;
    }
    return { h: y + 2, items };
  },
  facts(n: Cells) {
    return n.rows.map((r) => {
      docBudget().charge("cells facts", r.groups.length + 1);
      // said once: "Row a: 32 cells (0 to 31), then 4 new cells (32-35 new)."; an accent group's word names it, else "accent"
      const gs = r.groups.map((g, i) => {
        const l = r.labels?.[i], lab = l ? ` (${l.b ? `${l.a} to ${l.b}` : l.a})` : "", word = g.word || (g.accent ? "accent" : "");
        return `${g.n}${word ? " " + word : ""} ${g.n === 1 ? "cell" : "cells"}${lab}`;
      });
      return `Row${r.badge ? " " + r.badge : ""}: ${gs.join(", then ")}.`;
    });
  },
} satisfies StageBlock<Cells>);
