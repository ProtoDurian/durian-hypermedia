// This package is the source of this file: edit it here. It began as a copy of the private prototype's composed stage (0.7.0).
// nest: wrappers as boxes inside boxes (row 5). Each line under the head is one wrapper, inside the one
// above it; each has a role, a title, a size and its fields. Every box keeps one place for the whole scene, so a
// wrapper put round (or taken off) never moves what is inside it.
//
// nest: Wrapped so far | outside in <- a heading, then a small note (both optional); a size "_" is none
// link fr: Ethernet frame | 117 bytes | to 00:00:5E:00:53:01; from 00:00:5E:00:53:0A; > FCS 0e be 36 b7
// ip pk: IPv4 packet | 99 bytes | TTL 64; from 192.0.2.10; to 203.0.113.80
// app rq: HTTP request | 37 bytes | GET / HTTP/1.1; Host: example.com
//
// A field "> x" sits at the box's end, under what it holds (a trailer, like Ethernet's FCS). In a step:
// show fr the wrapper comes in from this step (its place is kept from the start); after an unwrap or a hide, it comes back
// light pk the wrapper is lit in this step; "light pk: TTL 64" lights that one field of it instead
// fields pk: a; * b; - c its fields from this step on; "* x" is lit and "- x" struck, both in this step only
// set pk: TTL 64 => TTL 63 one field changed: the new value lit and the old one struck beside it, in this step only
// unwrap fr the wrapper comes off what it holds (which stays): dashed, its title struck, in this step;
// gone after it until a show
// hide fr gone from this step on, with no mark (until a show)
// title arp: ARP reply a new title from this step on
import { type Item, type StageBlock, type ParseCtx, StageError, LINE_H, registerBlock, measure, wrap, parts, colon, expandIds, ID_RE } from "./stage-core";
import { docBudget } from "./stage-budget";

type Field = { s: string; lit: boolean; struck: boolean; end: boolean };
type Set = { step: number; fields: Field[]; changes: [string, string][] };
type Level = { id: string; role: string; title: string; size: string; line: number; ev: { step: number; k: "show" | "unwrap" | "hide"; line: number }[]; lit: number[]; litF: { step: number; s: string }[]; sets: Set[]; titles: { step: number; s: string }[] };
type Nest = { title: string; note: string; levels: Level[]; line: number };

const GAP = 14, FF: "mono" = "mono"; // fields in the mono font: its width is exact, so runs never overlap
function fieldsOf(s: string): Field[] {
  docBudget().charge("nest fields", s.length + 1, s.length);
  return parts(s, ";").map((raw) => {
    let t = raw, lit = false, struck = false, end = false;
    for (let i = 0; i < 3; i++) {
      if (t.startsWith("> ")) { end = true; t = t.slice(2); }
      else if (t.startsWith("* ")) { lit = true; t = t.slice(2); }
      else if (t.startsWith("- ")) { struck = true; t = t.slice(2); }
    }
    return { s: t.trim(), lit, struck, end };
  }).filter((f) => f.s);
}
const plain = (fs: Field[]) => fs.filter((f) => !f.struck).map((f) => ({ ...f, lit: false }));
/** the fields a level shows in step k: struck and lit marks only in the step that wrote them */
function at(l: Level, k: number): Field[] {
  let cur: Set | null = null;
  for (const s of l.sets) if (s.step <= k) cur = s;
  if (!cur) return [];
  const fs = cur.step === k ? cur.fields : plain(cur.fields), lf = l.litF.filter((x) => x.step === k).map((x) => x.s);
  return lf.length ? fs.map((f) => (!f.struck && lf.includes(f.s) ? { ...f, lit: true } : f)) : fs;
}
/** the steps a level shows in, and the steps it is taken off in (shown dashed) */
function seen(l: Level, steps: number): { on: number[]; off: number[] } {
  const on: number[] = [], off: number[] = [];
  let vis = !l.ev.length || l.ev[0].k !== "show" || l.ev[0].step === 1;
  for (let k = 1; k <= steps; k++) {
    const e = l.ev.find((x) => x.step === k);
    if (e?.k === "show") vis = true;
    if (e?.k === "unwrap") { off.push(k); on.push(k); vis = false; continue; }
    if (e?.k === "hide") vis = false;
    if (vis) on.push(k);
  }
  return { on, off };
}
const titleAt = (l: Level, k: number) => { let t = l.title; for (const x of l.titles) if (x.step <= k) t = x.s; return t; };
const key = (fs: Field[]) => fs.map((f) => `${f.lit ? "*" : ""}${f.struck ? "-" : ""}${f.end ? ">" : ""}${f.s}`).join("\n");

// a flow of fields in width w: each field a run of words, wrapped inside the width; returns the runs and the height
type Run = { x: number; y: number; s: string; f: Field };
function flow(fs: Field[], w: number): { runs: Run[]; h: number } {
  const runs: Run[] = []; let x = 0, y = 0;
  const lh = LINE_H.mono + 3;
  for (const f of fs) {
    docBudget().charge("nest flow", f.s.length + 1);
    const fw = measure(f.s, FF);
    if (x > 0 && x + fw > w) { x = 0; y += lh; }
    if (fw <= w) { runs.push({ x, y, s: f.s, f }); x += fw + GAP; continue; }
    const rows = wrap(f.s, w, FF, 6);
    rows.forEach((r, i) => { runs.push({ x: 0, y: y + i * lh, s: r, f }); });
    x = measure(rows[rows.length - 1], FF) + GAP; y += (rows.length - 1) * lh;
  }
  return { runs, h: fs.length ? y + lh : 0 };
}

registerBlock({
  word: "nest", kind: "head", ops: ["show", "light", "fields", "set", "unwrap", "hide", "title"],
  parse(inp, ctx: ParseCtx): Nest {
    const [title = "", ...note] = inp.arg.split(" | ").map((x) => x.trim());
    const n: Nest = { title, note: note.join(" | "), levels: [], line: inp.line };
    if (!inp.body.length) throw new StageError(inp.line, "a nest lists its wrappers under it, outside first: link fr: Ethernet frame | 117 bytes | to ...; from ...");
    if (inp.body.length > 8) throw new StageError(inp.body[8].n, "a nest holds at most 8 wrappers");
    for (const l of inp.body) {
      docBudget().charge("nest line", l.t.length + 1, l.t.length);
      if (l.ind !== inp.body[0].ind) throw new StageError(l.n, "a nest's wrappers have one indentation; the order says which is inside which (outside first)");
      const c = colon(l.t), head = c ? /^([a-z][\w-]*) ([A-Za-z][\w.-]*)$/.exec(c[0]) : null;
      if (!c || !head) throw new StageError(l.n, `a wrapper is "role id: title | size | field; field": "${l.t}" does not read`);
      const [role, id] = [head[1], head[2]];
      if (!ctx.roles.has(role)) ctx.problem(l.n, `"${role}" is not a role of this page; the page declares ${[...ctx.roles].join(", ") || "none"}`);
      if (!ID_RE.test(id) || ctx.ids.has(id)) throw new StageError(l.n, `"${id}" is used twice in this scene: give each wrapper its own id`);
      ctx.ids.add(id);
      const [t = "", size = "", ...fs] = c[1].split(" | ").map((x) => x.trim());
      if (!t) throw new StageError(l.n, "a wrapper needs a title");
      const lv: Level = { id, role, title: t, size: size === "_" ? "" : size, line: l.n, ev: [], lit: [], litF: [], sets: [], titles: [] };
      if (fs.length) lv.sets.push({ step: 1, fields: fieldsOf(fs.join(" | ")), changes: [] });
      n.levels.push(lv);
    }
    return n;
  },
  op(n: Nest, op, ctx) {
    const mine = (s: string) => { const ids = expandIds(s, n.levels.map((l) => l.id)); return ids.length && ids.every((id) => n.levels.some((l) => l.id === id)) ? ids.map((id) => n.levels.find((l) => l.id === id)!) : null; };
    if (op.word === "title") {
      const c = colon(op.arg), ls = c ? mine(c[0]) : null;
      if (!c || !ls || ls.length !== 1 || !c[1].trim()) { if (op.shared) return false; ctx.problem(op.line, `title names one wrapper of this nest and its new title: title ${n.levels[0].id}: words`); return; }
      ls[0].titles.push({ step: op.step, s: c[1].trim() }); return;
    }
    if (op.word === "fields" || op.word === "set") {
      const c = colon(op.arg), ls = c ? mine(c[0]) : null;
      if (!c || !ls || ls.length !== 1) { if (op.shared) return false; ctx.problem(op.line, `${op.word} names one wrapper of this nest: ${op.word === "set" ? `set ${n.levels[0].id}: TTL 64 => TTL 63` : `fields ${n.levels[0].id}: a; b; * lit; - struck`}`); return; }
      const lv = ls[0], here = lv.sets.find((s) => s.step === op.step);
      if (op.word === "fields") {
        if (here) { ctx.problem(op.line, `${lv.id} has its fields twice in step ${op.step}: write them once, before any set`); return; }
        lv.sets.push({ step: op.step, fields: fieldsOf(c[1]), changes: [] }); lv.sets.sort((a, b) => a.step - b.step);
        return;
      }
      const set = here ?? { step: op.step, fields: plain(at(lv, op.step - 1)), changes: [] };
      for (const ch of parts(c[1], ";")) {
        const k = ch.indexOf(" => ");
        if (k < 0) { ctx.problem(op.line, `set changes a field: old => new ("${ch}" has no " => ")`); return; }
        const old = ch.slice(0, k).trim(), now = ch.slice(k + 4).trim(), i = set.fields.findIndex((f) => !f.struck && !f.lit && f.s === old);
        if (i < 0) { ctx.problem(op.line, `${lv.id} has no field "${old}" in step ${op.step} (it has: ${plain(set.fields).map((f) => f.s).join("; ")})`); return; }
        const end = set.fields[i].end;
        set.fields.splice(i, 1, { s: old, lit: false, struck: true, end }, { s: now, lit: true, struck: false, end });
        set.changes.push([old, now]);
      }
      if (!here) { lv.sets.push(set); lv.sets.sort((a, b) => a.step - b.step); }
      return;
    }
    const lc = op.word === "light" ? colon(op.arg) : null, lone = lc ? mine(lc[0]) : null;
    if (lc && lone?.length === 1) {
      const lv = lone[0], fs = at(lv, op.step);
      for (const want of parts(lc[1], ";")) { if (!fs.some((f) => !f.struck && f.s === want)) { ctx.problem(op.line, `${lv.id} has no field "${want}" in step ${op.step}`); return; } lv.litF.push({ step: op.step, s: want }); }
      return;
    }
    const ls = mine(op.arg);
    if (!ls) { if (op.shared) return false; ctx.problem(op.line, `"${op.arg}" is not a wrapper of this nest (${n.levels.map((l) => l.id).join(", ")})`); return; }
    for (const lv of ls) {
      if (op.word === "light") { lv.lit.push(op.step); continue; }
      if (lv.ev.some((e) => e.step === op.step)) { ctx.problem(op.line, `${lv.id} is shown, unwrapped or hidden twice in step ${op.step}`); return; }
      const last = lv.ev[lv.ev.length - 1];
      if (op.word === "show" && last?.k === "show") { ctx.problem(op.line, `${lv.id} is shown twice: show it once, in the step it comes in (or unwrap or hide it first)`); return; }
      if (op.word !== "show" && last && last.k !== "show") { ctx.problem(op.line, `${lv.id} is already gone: show it again first`); return; }
      lv.ev.push({ step: op.step, k: op.word as "show" | "unwrap" | "hide", line: op.line });
    }
  },
  layout(n: Nest, box) {
    const items: Item[] = [], steps = Math.max(1, box.steps), inset = box.narrow ? 8 : 14, pad = box.narrow ? 8 : 12;
    let y = 0;
    if (n.title) { for (const s of wrap(n.title, box.w, "lane", 2)) { items.push({ k: "text", x: 0, y: y + 13, s, f: "lane", ink: "ink" }); y += LINE_H.lane; } }
    if (n.note) { for (const s of wrap(n.note, box.w, "sub", 2)) { items.push({ k: "text", x: 0, y: y + 12, s, f: "sub", ink: "muted" }); y += LINE_H.sub; } }
    if (n.title || n.note) y += 6;
    // each level's field width, its header height, its field and trailer heights (the most over every step)
    const L = n.levels, depth = L.length;
    const fw = L.map((_, i) => Math.max(40, box.w - 2 * i * inset - 2 * pad));
    const sizeW = (lv: Level) => (lv.size ? measure(lv.size, "sub") + 10 : 0);
    // every title a level has over the steps, each with the steps it shows in; the head is as tall as the tallest
    const heads = L.map((lv, i) => { const m = new Map<string, number[]>(); for (let k = 1; k <= steps; k++) { const t = titleAt(lv, k); if (!m.has(t)) m.set(t, []); m.get(t)!.push(k); } return [...m].map(([t, ks]) => ({ rows: wrap(t, Math.max(40, fw[i] - sizeW(lv)), "small-b", 2), ks })); });
    const kinds = L.map((lv) => { docBudget().charge("nest steps", steps); const m = new Map<string, { fs: Field[]; on: number[] }>(); for (let k = 1; k <= steps; k++) { const fs = at(lv, k), kk = key(fs); if (!m.has(kk)) m.set(kk, { fs, on: [] }); m.get(kk)!.on.push(k); } return [...m.values()]; });
    const top = L.map((_, i) => Math.max(0, ...kinds[i].map((g) => flow(g.fs.filter((f) => !f.end), fw[i]).h)));
    const end = L.map((_, i) => Math.max(0, ...kinds[i].map((g) => flow(g.fs.filter((f) => f.end), fw[i]).h)));
    const headH = (i: number) => Math.max(...heads[i].map((x) => x.rows.length)) * LINE_H["small-b"] + 4;
    // heights from the inside out
    const h: number[] = new Array(depth).fill(0);
    for (let i = depth - 1; i >= 0; i--) h[i] = pad + headH(i) + top[i] + (i < depth - 1 ? (top[i] ? 6 : 0) + h[i + 1] + 8 : 0) + (end[i] ? end[i] + 4 : 0) + pad - 4;
    let by = y;
    for (let i = 0; i < depth; i++) {
      const lv = L[i], x = i * inset, w = box.w - 2 * i * inset, leaf = i === depth - 1, { on, off } = seen(lv, steps);
      const lit = lv.lit.filter((k) => on.includes(k));
      items.push({ k: "box", x, y: by, w, h: h[i], r: 8, fill: `role:${lv.role}:${leaf ? "soft" : "plane"}`, stroke: `role:${lv.role}:line`, cls: leaf ? "scn-shape" : "scn-frame", role: lv.role, id: lv.id, on: on.filter((k) => !off.includes(k)), ...(lit.length ? { hot: lit } : {}), bar: { kind: leaf ? "card" : "frame", id: lv.id, label: lv.title, role: lv.role } });
      if (off.length) items.push({ k: "box", x, y: by, w, h: h[i], r: 8, fill: "none", stroke: `role:${lv.role}:line`, dash: true, on: off, hot: off });
      let ty = by + pad;
      for (const hd of heads[i]) {
        const plainOn = hd.ks.filter((k) => on.includes(k) && !off.includes(k)), struckOn = hd.ks.filter((k) => off.includes(k));
        hd.rows.forEach((s, r) => {
          if (plainOn.length) items.push({ k: "text", x: x + pad, y: ty + 11 + r * LINE_H["small-b"], s, f: "small-b", ink: `role:${lv.role}:ink`, on: plainOn });
          if (struckOn.length) items.push({ k: "text", x: x + pad, y: ty + 11 + r * LINE_H["small-b"], s, f: "small-b", ink: `role:${lv.role}:ink`, strike: true, on: struckOn });
        });
      }
      if (lv.size) items.push({ k: "text", x: x + w - pad, y: by + pad + 11, s: lv.size, f: "sub", ink: "muted", anchor: "end", on });
      ty = by + pad + headH(i);
      const fieldItems = (fs: Field[], y0: number, gon: number[]) => {
        const show = gon.filter((k) => on.includes(k)); if (!show.length) return;
        for (const r of flow(fs, fw[i]).runs) {
          const rx = x + pad + r.x, ry = y0 + r.y, tw = measure(r.s, FF);
          if (r.f.lit) items.push({ k: "box", x: rx - 3, y: ry, w: tw + 6, h: LINE_H.mono + 2, r: 4, fill: "acc:soft", stroke: "acc:line", on: show });
          items.push({ k: "text", x: rx, y: ry + 12, s: r.s, f: FF, ink: r.f.struck ? "muted" : r.f.lit ? "acc:ink" : "ink", ...(r.f.struck ? { strike: true } : {}), on: show });
        }
      };
      for (const g of kinds[i]) fieldItems(g.fs.filter((f) => !f.end), ty, g.on);
      const endY = by + h[i] - pad - end[i];
      for (const g of kinds[i]) fieldItems(g.fs.filter((f) => f.end), endY, g.on);
      by = ty + top[i] + (top[i] ? 6 : 0);
    }
    return { h: y + h[0] + 2, items };
  },
  facts(n: Nest, step) {
    const out: string[] = [];
    const say = (fs: Field[]) => fs.filter((f) => !f.struck).map((f) => f.s).join("; ");
    if (step === 0) {
      out.push(`${n.title || "Wrappers, outside in"}${n.note ? ` (${n.note})` : ""}:`);
      n.levels.forEach((lv, i) => {
        const fs = at(lv, 1), first = lv.ev[0]?.k === "show" && lv.ev[0].step > 1 ? lv.ev[0].step : 0;
        out.push(`${"  ".repeat(i)}- ${lv.title} (${lv.role})${lv.size ? `, ${lv.size}` : ""}${first ? `, from step ${first}` : ""}${fs.length ? `: ${say(fs)}` : ""}`);
      });
      return out;
    }
    for (const lv of n.levels) {
      docBudget().charge("nest facts", lv.sets.length + lv.ev.length + 1);
      const e = lv.ev.find((x) => x.step === step);
      const t = titleAt(lv, step), tn = lv.titles.find((x) => x.step === step);
      if (tn) out.push(`${titleAt(lv, step - 1)} is now ${t}.`);
      const holds = n.levels.slice(n.levels.indexOf(lv) + 1).some((x) => seen(x, step).on.includes(step));
      if (e?.k === "show" && step > 1) out.push(!holds ? `${t} comes in.` : lv.ev.some((x) => x.k !== "show" && x.step < step) ? `A new ${t} is put round it.` : `${t} is put round what it holds.`);
      if (e?.k === "unwrap") out.push(`${t} is taken off.`);
      if (e?.k === "hide") out.push(`${t} is gone.`);
      if (lv.lit.includes(step)) out.push(`Lit: ${t}.`);
      const set = step > 1 ? lv.sets.find((s) => s.step === step) : undefined;
      const lf = lv.litF.filter((x) => x.step === step).map((x) => x.s);
      if (lf.length) out.push(`Lit: ${lf.join("; ")} (${t}).`);
      const same = set && !set.changes.length && key(plain(set.fields)) === key(plain(at(lv, step - 1))) && lv.sets.some((x) => x.step < step);
      if (same) { const lit = set!.fields.filter((f) => f.lit).map((f) => f.s); if (lit.length) out.push(`Lit: ${lit.join("; ")} (${t}).`); }
      else if (set?.changes.length) out.push(`${t}: ${set.changes.map(([a, b]) => `${a} becomes ${b}`).join("; ")}.`);
      else if (set) {
        const lit = set.fields.filter((f) => f.lit).map((f) => f.s), old = set.fields.filter((f) => f.struck).map((f) => f.s);
        out.push(`${t}: ${say(set.fields)}.${lit.length ? ` Lit: ${lit.join("; ")}.` : ""}${old.length ? ` Was: ${old.join("; ")}.` : ""}`);
      }
    }
    return out;
  },
} satisfies StageBlock<Nest>);
