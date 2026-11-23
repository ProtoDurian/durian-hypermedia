// ```er: entities as records, crow's-foot relationships, drawn by the animation engine.
import { build, NAME_RE, q, tailOf, type Diagram, type DiagramIn } from "./diagram";
import { around, columnWords, joinBrackets } from "./scan";

const RIGHT = /^(\S+)\s+([^\s"]+)(?:\s+"([^"]*)")?$/;

interface Col { name: string; type: string; keys: string[]; fk: { entity: string; col: string } | null; line: number }
interface Entity { id: string; label: string; note: string; colour: string; cols: Col[]; line: number; step: number }
interface Rel { a: string; b: string; ca: string; cb: string; verb: string; line: number; step: number; guess?: true }

const CARD: Record<string, string> = { "1": "one", "0..1": "zero-or-one", "1..*": "one-or-many", "0..*": "zero-or-many" };
const KEYS = ["pk", "fk", "unique", "null"];
const AMOUNT: Record<string, string> = { "1": "exactly 1", "0..1": "0 or 1", "1..*": "1 or more", "0..*": "0 or more" };
const article = (w: string) => (/^[aeio]/i.test(w) ? "an" : "a");
const plural = (w: string) => (/[^aeiou]y$/i.test(w) ? `${w.slice(0, -1)}ies` : /(s|x|z|ch|sh)$/i.test(w) ? `${w}es` : `${w}s`);
const some = (card: string, id: string) => `${AMOUNT[card]} ${card === "1" || card === "0..1" ? id : plural(id)}`;

export function erDiagram(p: DiagramIn): Diagram {
  return build(p, { layout: "graph", dir: "right", apart: "1" }, (out, err, warn, lines) => {
    const all = new Map<string, Entity>(), rels: Rel[] = [], notes: { text: string; line: number }[] = [];
    const lights: { id: string; col: string; line: number; step: number }[] = [];
    const named = new Map<Entity, Map<string, Col>>(); // each entity's columns by name
    const colsOf = (e: Entity) => e.cols.length > 10 ? `${e.cols.slice(0, 10).map((c) => c.name).join(", ")}, ...` : e.cols.map((c) => c.name).join(", ");
    let open: Entity | null = null, openStep = -1;
    for (const l of lines) {
      try {
        if (l.indent) {
          if (!open || openStep !== l.step) { err(l.line, `"${l.text}" is indented, so it is a column, and no entity is above it: write entity <id> "Label" first, its columns indented under it`); continue; }
          if (/^(pk|primary|primary_key)\b\s*(\(|key\b|[^\s]+\s*,)/i.test(l.text)) { err(l.line, "a key of several columns has no line of its own: write pk on each of its columns (order_id uuid pk)"); continue; }
          const col = readCol(l.text, l.line);
          if (typeof col === "string") { err(l.line, col); continue; }
          if (named.get(open)!.has(col.name)) { err(l.line, `${open.id}.${col.name} is written twice`); continue; }
          open.cols.push(col);
          named.get(open)!.set(col.name, col);
          continue;
        }
        const word = l.text.split(/\s+/)[0];
        open = word === "entity" || word === "pk" ? open : null;
        if (word === "pk") { err(l.line, "a key of several columns has no line of its own: write pk on each of its columns (order_id uuid pk)"); continue; }
        if (word === "entity" && !/^entity\s+\S+\s*--/.test(l.text)) {
          open = null;
          const body = l.text.slice(6).trim(), id = body.split(/\s+/)[0], t = tailOf(body.slice(id.length), `entity ${id}`);
          if (!id || !NAME_RE.test(id)) { err(l.line, `entity needs a name of letters, digits, - _ . (entity order "Order")`); continue; }
          if (t.rest) { err(l.line, `entity ${id}: cannot read "${t.rest}"; columns go on indented lines under it`); continue; }
          if (all.has(id)) { err(l.line, `entity ${id} is declared twice (first at line ${all.get(id)!.line}): put all its columns under one`); continue; }
          open = { id, label: t.label ?? id, note: t.note, colour: t.colour, cols: [], line: l.line, step: l.step };
          openStep = l.step;
          all.set(id, open);
          named.set(open, new Map());
          if (t.note) notes.push({ text: t.note, line: l.line });
          continue;
        }
        if (word === "highlight" && !l.text.includes("--")) {
          const what = l.text.slice(9).trim();
          if (l.step < 0) { err(l.line, "highlight is what a step does: put it under a @step line"); continue; }
          if (!what) { err(l.line, "highlight needs an entity or a column: highlight order.customer_id"); continue; }
          for (const w of what.split(/\s+/)) { const dot = w.indexOf("."); lights.push({ id: dot < 0 ? w : w.slice(0, dot), col: dot < 0 ? "" : w.slice(dot + 1), line: l.line, step: l.step }); }
          continue;
        }
        const lead = l.text.match(/^(\S+)\s+/), m = lead && around(l.text.slice(lead[0].length), "--", RIGHT);
        if (!lead || !m) { err(l.line, `cannot read "${l.text}": a relationship is a <card> -- <card> b "verb" (customer 1 -- 0..* order "places"); an entity is entity <id> "Label"; a step may highlight <entity>[.column]`); continue; }
        const a = lead[1], ca = m.left, [, cb, b, verb = ""] = m.right;
        const bad = [ca, cb].find((c) => !(c in CARD));
        if (bad) { err(l.line, `"${bad}" is not a cardinality: the four are ${Object.keys(CARD).join(", ")}`); continue; }
        rels.push({ a, b, ca, cb, verb, line: l.line, step: l.step });
      } catch (e) { err(l.line, (e as Error).message); }
    }
    const some10 = [...all.keys()].slice(0, 10).join(", "), kept: Rel[] = [];
    for (const r of rels) {
      const no = [r.a, r.b].find((id) => !all.has(id));
      if (no) err(r.line, `there is no entity "${no}": declare it (entity ${no}), or use one of ${some10}`);
      else kept.push(r);
    }
    rels.length = 0;
    for (const r of kept) rels.push(r);
    const fks: { child: Entity; col: Col; parent: Entity; to: Col }[] = [];
    for (const child of all.values()) for (const col of child.cols) {
      if (!col.fk) continue;
      const parent = all.get(col.fk.entity);
      if (!parent) { err(col.line, `fk -> ${col.fk.entity}.${col.fk.col}: there is no entity "${col.fk.entity}"; declare it (entity ${col.fk.entity}) or fix the name`); continue; }
      const to = named.get(parent)!.get(col.fk.col);
      if (!to) { err(col.line, `fk -> ${parent.id}.${col.fk.col}: ${parent.id} has no column "${col.fk.col}" (its columns: ${colsOf(parent) || "none"})`); continue; }
      fks.push({ child, col, parent, to });
    }
    // a line for each key: the author's, else many-to-one and a word to say it
    const joins = new Map<Rel, (typeof fks)[number]>();
    const between = new Map<string, { of: Rel[]; used: number; to: Set<Col> }>(); // the author's lines of each pair
    const pairOf = (a: string, b: string) => (a < b ? `${a} ${b}` : `${b} ${a}`);
    for (const r of rels) {
      const k = pairOf(r.a, r.b);
      if (!between.has(k)) between.set(k, { of: [], used: 0, to: new Set() });
      between.get(k)!.of.push(r);
    }
    for (const f of fks) {
      const theirs = between.get(pairOf(f.parent.id, f.child.id));
      if (theirs && theirs.used < theirs.of.length) { joins.set(theirs.of[theirs.used++], f); theirs.to.add(f.to); continue; }
      // a key of several columns is one line; a second key to the same column is a line of its own
      if (theirs && !theirs.to.has(f.to)) continue;
      const one = f.col.keys.includes("null") ? "0..1" : "1";
      const r: Rel = { a: f.parent.id, b: f.child.id, ca: one, cb: "0..*", verb: "", line: f.col.line, step: Math.max(f.child.step, f.parent.step), guess: true };
      rels.push(r); joins.set(r, f);
      warn(f.col.line, `${f.child.id}.${f.col.name} has no relationship line, so it is drawn many-to-one: say it with ${f.parent.id} ${one} -- 0..* ${f.child.id} "verb"`);
    }

    // ---- the scene
    const at = new Map<string, string>();
    for (const e of all.values()) {
      const cells = e.cols.map((c) => {
        at.set(`${e.id}.${c.name}`, `r.${e.id}.${c.name}`);
        return q(`${c.name}${c.type ? `: ${joinBrackets(c.type)}` : ""}${c.keys.length ? ` [${c.keys.join(" ")}]` : ""}`);
      });
      out.decl(`record r.${e.id} ${q(e.label)} as=entity${out.use(e.colour)}${e.note ? ` note=${q(e.note)}` : ""}${cells.length ? `: ${cells.join(", ")}` : ""}`, e.line, e.step);
    }
    const pairs = new Set<string>();
    for (const r of rels) {
      const f = joins.get(r);
      let a = `r.${r.a}`, b = `r.${r.b}`;
      if (f) {
        const pk = `r.${f.parent.id}.${f.to.name}`, fk = `r.${f.child.id}.${f.col.name}`;
        if (f.parent.id === r.a && f.child.id === r.b) { a = pk; b = fk; } else { a = fk; b = pk; }
      }
      const pair = [a, b].sort().join(" "), also = a === b || pairs.has(pair);
      pairs.add(pair);
      const step = Math.max(r.step, all.get(r.a)!.step, all.get(r.b)!.step);
      out.add(`${a} -- ${b} start=${CARD[r.ca]} end=${CARD[r.cb]}${also ? " also=yes" : ""}${r.verb ? ` ${q(r.verb)}` : ""}`, r.line, step);
    }
    const trail: string[][] = p.steps.map(() => []);
    for (const h of lights) {

      const e = all.get(h.id);
      if (!e) { err(h.line, `highlight ${h.id}: there is no entity "${h.id}" (entities: ${some10})`); continue; }
      if (h.col && !named.get(e)!.has(h.col)) { err(h.line, `highlight ${h.id}.${h.col}: ${h.id} has no column "${h.col}" (its columns: ${colsOf(e)})`); continue; }
      out.add(`highlight ${h.col ? `r.${h.id}.${h.col}` : `r.${h.id}`}`, h.line, h.step);
      trail[h.step].push(h.col ? `${h.id}.${h.col}` : h.id);
    }

    // ---- the LLM view
    const about = [...all.values()].map((e) => {
      const cols = e.cols.map((c) => [c.name, c.type, ...c.keys.filter((k) => k !== "fk"), c.fk && `fk -> ${c.fk.entity}.${c.fk.col}`].filter(Boolean).join(" "));
      return `${e.id}${e.label !== e.id ? ` (${e.label})` : ""}${cols.length ? `: ${cols.join("; ")}` : ""}${e.note ? ` (${e.note})` : ""}`;
    });
    const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
    const said = rels.map((r) => `${cap(article(r.a))} ${r.a} ${r.verb || "has"} ${some(r.cb, r.b)}; ${article(r.b)} ${r.b} ${r.ca === "1" || r.ca === "0..1" ? "belongs to" : "goes with"} ${some(r.ca, r.a)}.`);
    const steps = p.steps.map((s, k) => `${k + 1}. ${s.title}${trail[k].length ? `\n   lit: ${trail[k].join(", ")}` : ""}`).join("\n");
    return {
      llm: [`ER diagram${p.attrs.title ? `: ${p.attrs.title}` : ""}.`, about.join("\n"), said.join(" "), steps].filter(Boolean).join("\n\n"),
      shape: JSON.stringify([[...all.values()].map((e) => [e.id, e.step, e.colour, !!e.note, e.cols.map((c) => [c.name, c.keys, c.fk])]), rels.map((r) => [r.a, r.ca, r.cb, r.b, r.step]), lights.map((h) => [h.id, h.col, h.step])]),
      texts: [...[...all.values()].flatMap((e) => [e.label, e.note]), ...rels.map((r) => r.verb)],
      notes,
      things: all.size, links: rels.length,
      rows: [...all.values()].reduce((n, e) => n + e.cols.length, 0),
    };
  });
}

// name type [pk] [fk -> entity.column] [unique] [null]; a type of several words is in quotes
function readCol(text: string, line: number): Col | string {
  const ws = columnWords(text);
  const name = ws[0] ?? "";
  if (!NAME_RE.test(name) || name.includes(".")) return `"${name}" is not a column name: one word of letters, digits, - and _`;
  const typed = ws.length > 1 && !KEYS.includes(ws[1]) && ws[1] !== "->";
  const col: Col = { name, type: typed ? ws[1] : "", keys: [], fk: null, line };
  for (let i = typed ? 2 : 1; i < ws.length; i++) {
    const k = ws[i];
    if (!KEYS.includes(k)) return `"${k}" is not a column key: the keys are ${KEYS.join(", ")}; a column is name type [pk] [fk -> entity.column] [unique] [null], and a type of two words goes in quotes ("double precision")`;
    if (col.keys.includes(k)) return `${name} says ${k} twice`;
    col.keys.push(k);
    if (k !== "fk") continue;
    const to = ws[i + 1] === "->" ? ws[i + 2] ?? "" : "", dot = to.lastIndexOf(".");
    if (dot < 1 || dot === to.length - 1) return `fk names the column it points at: ${name} ${col.type || "uuid"} fk -> customer.id`;
    col.fk = { entity: to.slice(0, dot), col: to.slice(dot + 1) };
    i += 2;
  }
  return col;
}
