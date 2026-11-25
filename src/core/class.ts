// ```class: classes as records, relations in words, drawn by the animation engine.
import { build, NAME_RE, q, tailOf, type Diagram, type DiagramIn } from "./diagram";
import { endLabel, joinBrackets } from "./scan";

type What = "class" | "abstract" | "interface" | "enum" | "data";
type Word = "extends" | "implements" | "owns" | "has" | "uses" | "->";
interface Member { text: string; isStatic: boolean; isAbstract: boolean; method: boolean }
interface Cls { id: string; label: string; what: What; note: string; colour: string; members: Member[]; line: number; step: number; declared: boolean }
interface Rel { a: string; b: string; word: Word; na: string; nb: string; label: string; line: number; step: number }

const RELS: Word[] = ["extends", "implements", "owns", "has", "uses", "->"];
const DECL = /^(abstract\s+class|class|interface|enum|record)\s+(?!extends\b|implements\b|owns\b|has\b|uses\b)([^\s:"]+)(.*)$/;
const NAME_OF: Record<What, string> = { class: "class", abstract: "abstract class", interface: "interface", enum: "enum", data: "record" };
const MULT = "1, 0..1, *, 0..*, 1..* or n..m (2..5)";
const goodMult = (m: string) => {
  if (["1", "0..1", "*", "0..*", "1..*"].includes(m)) return true;
  const r = m.match(/^(\d+)\.\.(\d+)$/);
  return !!r && +r[1] <= +r[2];
};
const count = (m: string) => ({ "1": "1", "0..1": "0 or 1", "*": "0 or more", "0..*": "0 or more", "1..*": "1 or more" } as Record<string, string>)[m] ?? m.replace("..", " to ");

export function classDiagram(p: DiagramIn): Diagram {
  return build(p, { layout: "graph", dir: "down", apart: "1" }, (out, err, _warn, lines) => {
    const all = new Map<string, Cls>(), rels: Rel[] = [], notes: { text: string; line: number }[] = [];
    const written = new Set<string>();
    let open: Cls | null = null, openStep = -1;
    const see = (id: string, line: number, step: number): Cls | null => {
      if (!NAME_RE.test(id)) { err(line, `"${id}" is not a class name: one word of letters, digits, - _ . (class List "List<T>" gives it the name a reader sees)`); return null; }
      let c = all.get(id);
      if (!c) all.set(id, (c = { id, label: id, what: "class", note: "", colour: "", members: [], line, step, declared: false }));
      else c.step = Math.min(c.step, step);
      return c;
    };
    for (const l of lines) {
      try {
        if (l.indent) {
          if (!open || openStep !== l.step) { err(l.line, `"${l.text}" is indented, so it is a member, and no class is above it: write class <Name> first, its members indented under it`); continue; }
          let t = l.text, sign = "";
          const s = t.match(/^([+#~-])\s*(?=[^\s-])/);
          if (s) { sign = s[1]; t = t.slice(s[0].length); }
          let isStatic = false, isAbstract = false;
          for (let w = t.match(/^(static|abstract)\s+/); w; w = t.match(/^(static|abstract)\s+/)) { if (w[1] === "static") isStatic = true; else isAbstract = true; t = t.slice(w[0].length); }
          if (!/[A-Za-z0-9_]/.test(t)) { err(l.line, `"${l.text}" has no name: a member is + total(): Money or - lines: Line[]`); continue; }
          open.members.push({ text: `${sign ? `${sign} ` : ""}${t}`, isStatic, isAbstract, method: t.split(":")[0].includes("(") });
          continue;
        }
        const d = l.text.match(DECL);
        if (d && !d[3].trim().startsWith("->")) {
          const what: What = d[1].startsWith("abstract") ? "abstract" : d[1] === "record" ? "data" : (d[1] as What);
          let tail = d[3].trim(), values: string[] = [];
          const colon = colonAt(tail);
          if (colon >= 0) {
            if (what !== "enum") { err(l.line, `only an enum lists its values after a colon (enum Status: open, paid); a ${d[1]}'s members go on indented lines under it`); continue; }
            values = tail.slice(colon + 1).split(",").map((x) => x.trim()).filter(Boolean);
            tail = tail.slice(0, colon);
          }
          const t = tailOf(tail, `${d[1]} ${d[2]}`);
          if (t.rest) { err(l.line, `${d[1]} ${d[2]}: cannot read "${t.rest}"; a relation is a line of its own (${d[2]} ${/^(extends|implements|owns|has|uses)\b/.test(t.rest) ? t.rest : "extends Base"})`); continue; }
          const c = see(d[2], l.line, l.step);
          open = null;
          if (!c) continue;
          if (c.declared) { err(l.line, `${c.id} is declared twice (first at line ${c.line}): put all its members under one`); continue; }
          Object.assign(c, { declared: true, what, note: t.note, colour: t.colour, line: l.line, label: t.label ?? c.id });
          c.members.push(...values.map((v) => ({ text: v, isStatic: false, isAbstract: false, method: false })));
          if (t.note) notes.push({ text: t.note, line: l.line });
          open = c; openStep = l.step;
          continue;
        }
        open = null;
        const rel = readRel(l.text);
        if (typeof rel === "string") { err(l.line, rel); continue; }
        const a = see(rel.a, l.line, l.step), b = a && see(rel.b, l.line, l.step);
        if (!a || !b) continue;
        if (a === b && (rel.word === "extends" || rel.word === "implements")) { err(l.line, `${a.id} cannot ${rel.word === "extends" ? "extend" : "implement"} itself`); continue; }
        const key = `${rel.a} ${rel.word} ${rel.b} ${rel.label}`;
        if (written.has(key)) { err(l.line, `${rel.a} ${rel.word} ${rel.b} is written twice`); continue; }
        written.add(key);
        rels.push({ ...rel, line: l.line, step: l.step });
      } catch (e) { err(l.line, (e as Error).message); }
    }

    // ---- parents above children: a parent is written before what extends it
    const up = new Map<string, Rel[]>();
    for (const r of rels) if (r.word === "extends" || r.word === "implements") { const of = up.get(r.a); if (of) of.push(r); else up.set(r.a, [r]); }
    const order: Cls[] = [], state = new Map<string, 1 | 2>();
    let looped = false;
    const path: string[] = [];
    const put = (id: string) => {
      if (state.get(id) === 2) return;
      state.set(id, 1);
      for (const r of up.get(id) ?? []) {
        if (state.get(r.b) === 1) {
          if (!looped) err(r.line, `${[...path.slice(path.indexOf(r.b)), id, r.b].filter((x, k, xs) => !k || x !== xs[k - 1]).join(" -> ")}: a cycle of extends and implements; a class cannot be above itself, so take one of these relations out`);
          looped = true;
          continue;
        }
        path.push(id); put(r.b); path.pop();
      }
      state.set(id, 2); order.push(all.get(id)!);
    };
    // at most one level of calls per class, and the caps stop a page with more classes than that
    if (all.size <= 500) for (const id of all.keys()) put(id);

    // ---- the scene
    for (const c of order) {
      const fields = [...c.members.filter((m) => !m.method), ...c.members.filter((m) => m.method)];
      const split = fields.findIndex((m) => m.method);
      const cells = fields.flatMap((m, k) => {
        const tags = [m.isStatic && "static", m.isAbstract && "abstract"].filter(Boolean).join(" ");
        // a type may end in brackets (Line []); only our own tags may follow a space
        const text = joinBrackets(m.text);
        return [...(split > 0 && k === split ? ["---"] : []), q(`${text}${tags ? ` [${tags}]` : ""}`)];
      });
      out.decl(`record c.${c.id} ${q(c.label)} as=${c.what}${out.use(c.colour)}${c.note ? ` note=${q(c.note)}` : ""}${cells.length ? `: ${cells.join(", ")}` : ""}`, c.line, c.step);
    }
    const pairs = new Set<string>();
    const drawn = [...rels.filter((r) => r.word === "extends" || r.word === "implements"), ...rels.filter((r) => r.word !== "extends" && r.word !== "implements")];
    for (const r of drawn) {
      const parent = r.word === "extends" || r.word === "implements", from = parent ? r.b : r.a, to = parent ? r.a : r.b;
      const pair = [from, to].sort().join(" "), also = from === to || pairs.has(pair);
      pairs.add(pair);
      const a = `c.${from}`, b = `c.${to}`;
      const line = r.word === "extends" ? `${a} -- ${b} start=triangle`
        : r.word === "implements" ? `${a} --> ${b} start=triangle end=none`
        : r.word === "owns" ? `${a} -- ${b} start=diamond`
        : r.word === "has" ? `${a} -- ${b} start=hollow`
        : r.word === "uses" ? `${a} --> ${b} end=open`
        : `${a} -> ${b} end=open`;
      out.add(`${line}${r.na ? ` start-label="${r.na}"` : ""}${r.nb ? ` end-label="${r.nb}"` : ""}${also ? " also=yes" : ""}${r.label ? ` ${q(r.label)}` : ""}`, r.line, r.step);
    }

    // ---- the LLM view
    const inline = new Set<Rel>();
    const about = [...all.values()].filter((c) => c.declared).map((c) => {
      const said = (["extends", "implements"] as const).flatMap((w) => {
        const rs = (up.get(c.id) ?? []).filter((r) => r.word === w);
        rs.forEach((r) => inline.add(r));
        return rs.length ? [` ${w} ${rs.map((r) => r.b).join(", ")}`] : [];
      }).join("");
      const ms = c.members.map((m) => `${m.text}${m.isStatic ? " (static)" : ""}${m.isAbstract ? " (abstract)" : ""}`);
      return `${NAME_OF[c.what]} ${c.id}${c.label !== c.id ? ` "${c.label}"` : ""}${said}${ms.length ? `: ${ms.join(c.what === "enum" ? ", " : "; ")}` : ""}${c.note ? ` (${c.note})` : ""}`;
    });
    const said = rels.filter((r) => !inline.has(r)).map((r) => {
      const n = r.nb ? `${count(r.nb)} ` : "", verb = r.label ? `, "${r.label}"` : "";
      if (r.word === "extends" || r.word === "implements") return `${r.a} ${r.word} ${r.b}.`;
      if (r.word === "owns") return `${r.a} owns ${n}${r.b} (composition${verb}).`;
      if (r.word === "has") return `${r.a} has ${n}${r.b} (aggregation${verb}).`;
      if (r.word === "uses") return `${r.a} uses ${r.b} (dependency${verb}).`;
      return `${r.a} ${r.label || "is linked to"} ${n}${r.b} (association${r.na ? `; each ${r.b} has ${count(r.na)} ${r.a}` : ""}).`;
    });
    const steps = p.steps.map((s, k) => `${k + 1}. ${s.title}`).join("\n");
    return {
      llm: [`Class diagram${p.attrs.title ? `: ${p.attrs.title}` : ""}.`, about.join("\n"), said.join(" "), steps].filter(Boolean).join("\n\n"),
      shape: JSON.stringify([[...all.values()].map((c) => [c.id, c.what, c.step, c.colour, c.members.length, !!c.note]), rels.map((r) => [r.a, r.word, r.b, r.na, r.nb, r.step])]),
      texts: [...[...all.values()].flatMap((c) => [c.label, c.note]), ...rels.map((r) => r.label)],
      notes,
      things: all.size, links: rels.length,
      rows: [...all.values()].reduce((n, c) => n + c.members.length, 0),
    };
  });
}

function colonAt(s: string): number {
  let inQ = false;
  for (let i = 0; i < s.length; i++) { if (s[i] === '"') inQ = !inQ; else if (!inQ && s[i] === ":") return i; }
  return -1;
}

function readRel(text: string): Omit<Rel, "line" | "step"> | string {
  const { body, label } = endLabel(text);
  const badMult = (m: string) => `"${m}" is not a multiplicity: write ${MULT}`;
  if (body.includes("->")) {
    const sides = body.split("->").map((x) => x.trim().split(/\s+/).filter(Boolean));
    if (sides.length !== 2 || !sides[0].length || sides[0].length > 2 || !sides[1].length || sides[1].length > 2) return `an association is A [m] -> [n] B "label" (Order 0..* -> 1 Customer "placed by")`;
    const [a, na = ""] = sides[0], nb = sides[1].length === 2 ? sides[1][0] : "", b = sides[1][sides[1].length - 1];
    for (const m of [na, nb]) if (m && !goodMult(m)) return badMult(m);
    return { a, b, word: "->", na, nb, label };
  }
  const w = body.split(/\s+/);
  const unknown = `cannot read "${text}": the six relations are ${RELS.join(", ")} (Circle extends Shape, Order owns 1..* Line, Order 0..* -> 1 Customer); a class is class <Name>, abstract class, interface, enum or record`;
  if (w.length < 3 || !(RELS as string[]).includes(w[1])) return unknown;
  const word = w[1] as Word;
  if (word === "owns" || word === "has") {
    if (w.length > 4) return `${word} takes a multiplicity and a class: ${w[0]} ${word} 1..* Line`;
    if (w.length === 4 && !goodMult(w[2])) return badMult(w[2]);
    return { a: w[0], b: w[w.length - 1], word, na: "", nb: w.length === 4 ? w[2] : "", label };
  }
  if (w.length !== 3) return `${word} takes one class: ${w[0]} ${word} ${w[w.length - 1]}`;
  return { a: w[0], b: w[2], word, na: "", nb: "", label };
}
