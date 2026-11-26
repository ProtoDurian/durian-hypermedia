// Lane parse: a Model written as format 12 text (the inverse of parse12; `migrate` uses it).
import type { Fact, Id, Model, Region, Relation, Thing } from "../types";
import { slug } from "./common";

const ARROWS: Record<string, string> = { arrow: "->", dashed: "-->", line: "--", both: "<->", lost: "-x", stream: "~>" };
export const SETUP_HEADS: Record<string, string> = { time: "timeline", sheet: "sheet", labels: "sheet", spacing: "sheet", track: "track", carry: "track", where: "track", form: "track", place: "track", nest: "wrap", matrix: "grid", bins: "grid" };
export const STAGE_OPTS = ["lines", "flow", "notes", "align", "key-at", "zoom", "legacy-layout", "lanes-at"]; // eng-migrate2: lanes-at

const enc = (v: string) => v.replace(/%/g, "%25").replace(/"/g, "%22");
export const dec = (v: string) => v.replace(/%22/g, '"').replace(/%25/g, "%");
const quoteIf = (w: string) => (/[\s"]/.test(w) ? `"${enc(w)}"` : w);
const vlist = (v: string[]) => (v.some((x) => /[\s,]/.test(x)) ? v.join(", ") : v.join(" ")) || "-";

export function printFact(m: Model, f: Fact): string[] {
  const ids = (a: Id[]) => a.map((x) => (/\s/.test(x) ? `"${x}"` : x)).join(", ");
  switch (f.k) {
    case "show": case "hide": return [`${f.k} ${ids(f.ids)}`];
    case "at": return [`${ids(f.ids)} at ${f.place}`];
    case "in": return [`${ids(f.ids)} in ${f.place}${f.side ? " " + f.side : ""}${f.after ? " after " + f.after : ""}`];
    case "is": return [`${ids(f.ids)} is ${f.words ?? "-"}`];
    case "text": return [`text ${f.id}: ${f.lines.join(" | ")}`];
    case "tone": return [`tone ${ids(f.ids)} ${f.tone}`];
    case "dim": return [`dim ${ids(f.ids)}${f.on ? "" : " off"}`];
    case "values": return [`${f.id}${f.series ? "." + (f.series + 1) : ""} = ${vlist(f.values)}${f.from.length ? " from " + ids(f.from) : ""}`];
    case "clear": return ["clear"];
    case "rel": {
      const r: Relation | undefined = m.relations[f.rel];
      const [a, b] = r ? [r.from, r.to] : f.rel.replace(/#\d+$/, "").split("->");
      return [`${a} ${ARROWS[f.style] ?? "->"} ${b}${f.role ? ` (${f.role})` : ""}${(f.words ?? (r && !r.setup ? r.label : null)) ? ": " + (f.words ?? r?.label) : ""}`];
    }
    case "light": return [`light ${ids(f.ids)}${f.note ? ": " + f.note : ""}`];
    case "say": return [`say ${f.id}${f.side ? " " + f.side : ""}${f.role ? ` (${f.role})` : ""}: ${f.words}`];
    case "note": return [`note: ${f.words}`];
    case "foot": return [`foot${f.tone ? ` (${f.tone})` : ""}: ${f.words}`];
    case "split": return [`split ${f.id} into ${f.into.map((x, i) => (f.labels[i] ? `${x}=${quoteIf(f.labels[i])}` : x)).join(" ")}`];
    case "merge": return [`merge ${f.ids.join(" ")} into ${f.into}`];
    case "drop": return [`drop ${f.ids.join(" ")}${f.at ? " at " + f.at : ""}`];
    case "focus": return [`focus ${f.target}`];
    case "zoom": return [f.into ? `zoom into ${f.into.join(" ")}` : `zoom out${f.all ? " all" : ""}`];
    case "lift": return [`lift ${f.ids.join(" ")}`];
    case "putback": return [`put back${f.ids.length ? " " + f.ids.join(" ") : ""}`];
    case "enter": return [`enter ${f.scene} from ${f.from}`];
    case "leave": return [`leave${f.scene ? " " + f.scene : ""}`];
    case "layers": return [`layers ${f.apart ? "apart" : "together"}`];
    case "camera": return [`camera ${f.ids === "all" ? "all" : f.ids.join(" ")}${f.close ? " close" : ""}${f.far ? " far" : ""}${f.turn ? " turn=" + f.turn : ""}${f.tilt ? " tilt=" + f.tilt : ""}`];
    case "then": return ["then"];
    case "pace": return [`pace ${f.pace}`];
    case "layout": return [`${f.word}${f.arg ? " " + f.arg : ""}`, ...f.body.map((b) => "  " + b)];
  }
}

function printThing(m: Model, t: Thing, depth: number, out: string[], kids: Record<string, Thing[]>) {
  const pad = "  ".repeat(depth);
  const flags = [...t.flags];
  if (t.chart) for (const f of [...t.chart.flags]) if (!flags.includes(f)) flags.push(f);
  const k0 = { ...t.keys }; if (t.parent && !m.things[t.parent]) k0.parent = t.parent; // a cell of a data structure (h.2) is a place, not a thing
  const keys = Object.entries(k0).map(([k, v]) => ` ${k}="${enc(v)}"`).join("");
  const dataThing = !t.chart && ((t.layout && ["array", "list", "stack", "queue", "map"].includes(t.layout)) || t.flags.includes("row") || t.flags.includes("table"));
  if (dataThing) { if (t.title) k0.title = t.title; if (t.lines.length) k0.lines = t.lines.join(" | "); }
  const keys2 = Object.entries(k0).map(([k, v]) => ` ${k}="${enc(v)}"`).join("");
  let rest = "";
  if (t.chart) rest = [t.chart.title, ...(t.chart.unit ? [t.chart.unit] : [])].join(" | ");
  else if (dataThing) rest = !t.values ? "" : t.layout === "map" ? t.values.join(", ") : vlist(t.values);
  else rest = [t.title, ...t.lines].join(" | ");
  out.push(`${pad}${t.role ?? "plain"} ${t.id}${flags.length ? ` [${flags.map(quoteIf).join(" ")}]` : ""}${keys2}${rest ? ": " + rest : ""}`);
  if (t.chart) {
    const c = t.chart;
    if (c.x.length) out.push(`${pad}  x: ${c.x.join(", ")}`);
    for (const [k, v] of Object.entries(c.opts)) for (const line of v.split("\n")) out.push(`${pad}  ${k}${line ? ": " + line : ":"}`);
    for (const s of c.series) out.push(`${pad}  series ${JSON.stringify(s.name)} ${s.role ?? "-"}: ${s.values.join(" ")}`);
  }
  for (const k of kids[t.id] ?? []) printThing(m, k, depth + 1, out, kids);
}

/** fmt12: a step line that reads back as the same title and caption: a `: ` the reader's sentence holds is written `\: ` where
 *  parse12 would take it for the title's end (the first one within 48 characters) */
export function stepLine(title: string, caption: string): string {
  const esc = (s: string, all: boolean) => s.replace(/: /g, (x, i: number) => (all || i <= 48 ? "\\: " : x));
  return title === caption ? esc(title, false) : `${esc(title, true)}: ${caption}`;
}

/** the setup and steps of a Model as format 12 text (no fence line). `page`: the page's roles (name -> colour); every other role
 *  the Model has (a graph family, a role with words for the colour key) is written as a `role name cN: words` line of this block */
export function print12(m: Model, page?: Record<string, number>, nested = false): string {
  const out: string[] = [];
  if (m.title || m.note) out.push(`title: ${m.title ?? ""}${m.note ? " | " + m.note : ""}`);
  out.push(`layout: ${m.layout}`);
  // fmt12: the block's own roles (a graph family keeps its colour and its words in the key), never the page's (unless changed)
  if (!nested) for (const [name, r] of Object.entries(m.roles)) if (r.label || (page && page[name] !== r.colour)) out.push(`role ${name} c${r.colour}${r.label ? ": " + r.label : ""}`);
  // eng-migrate2: `lanes-at: N` (an old stage's lanes come after its first N head blocks: a time strip over the lanes) only when it says so
  for (const k of STAGE_OPTS) if (m.fence[k] && (k !== "lanes-at" || Number(m.fence[k]) > 0)) out.push(`${k}: ${m.fence[k]}`);
  const kids: Record<string, Thing[]> = {}; const roots: Thing[] = [];
  // eng-blocks2: parts (layouts/parts.ts) are made again by the front end from the layout's words: never printed
  const isPart = (id: string) => !!m.things[id]?.flags.includes("part");
  const own = (facts: Fact[]) => facts.filter((f) => !("ids" in f && Array.isArray(f.ids) && f.ids.length > 0 && f.ids.every(isPart)));
  for (const id of m.order) { if (isPart(id)) continue; const t = m.things[id]; if (t.parent && m.things[t.parent]) (kids[t.parent] ??= []).push(t); else roots.push(t); }
  const regionLine = (r: Region) => {
    const flags = [...r.flags.map(quoteIf)];
    if (r.id !== slug(r.title, "")) flags.push(`id=${r.id}`);
    return `## ${r.title || "_"}${flags.length ? ` [${flags.join(" ")}]` : ""}`;
  };
  let region: string | null = null;
  const printed = new Set<string>();
  for (const t of [...roots.filter((x) => !x.region), ...roots.filter((x) => x.region)]) {
    if (t.region !== region && t.region) { const r = m.regions.find((x) => x.id === t.region); if (r) { out.push(regionLine(r)); printed.add(r.id); region = t.region; } }
    printThing(m, t, 0, out, kids);
  }
  for (const r of m.regions) if (!printed.has(r.id)) out.push(regionLine(r)); // an empty region
  const later = lastingLines(m); // fmt12
  for (const r of Object.values(m.relations)) if (r.setup || later.has(r.id)) out.push(`${r.from} ${ARROWS[r.style]} ${r.to}${r.role ? ` (${r.role})` : ""}${r.label ? ": " + r.label : ""}`);
  if (later.size) out.push(`hide ${[...later].join(", ")}`);
  for (const f of own(m.setup)) out.push(...printFact(m, f));
  for (const [layout, words] of Object.entries(m.layoutWords)) {
    for (const w of words) {
      const head = SETUP_HEADS[w.word] === layout || (SETUP_HEADS[w.word] && layout === SETUP_HEADS[w.word]);
      if (head) out.push(`${w.word}${w.arg ? " " + w.arg : ""}`, ...w.body.map((b) => "  " + b));
      else out.push(`  + ${w.word}${w.arg ? " " + w.arg : ""}`, ...w.body.map((b) => "    " + b));
    }
  }
  for (const [sid, sub] of Object.entries(m.scenes)) {
    const attrs = Object.entries(sub.fence).filter(([k, v]) => k !== "graph-src" && m.fence[k] !== v).map(([k, v]) => ` ${k}=${enc(v).replace(/\s/g, "%20")}`).join("");
    out.push(`scene ${sid}${sub.title ? ` "${sub.title}"` : ""}${attrs}`, ...print12(sub, page, true).split("\n").map((x) => "  " + x), "end");
  }
  for (const s of m.steps) {
    out.push(`@step ${stepLine(s.title, s.caption)}`); // fmt12: the whole old line stays the caption
    out.push(...oneLine(inBeats(m, own(s.facts)).map((f) => ({ f, ls: f.k === "rel" && later.has(f.rel) && f.words === null ? [`show ${f.rel}`] : printFact(m, f) }))));
  }
  return out.join("\n");
}

/** render3: relations an author wrote on one line (`m -> s, t: 12 each`: one source line, the same words) are written on one line
 *  again, so the stage keeps their words once for the bundle; two lines that say the same words stay two lines (stage 18) */
export function oneLine(rows: { f: Fact; ls: string[] }[]): string[] {
  const re = /^(\S+) (\S+) (\S+)((?: \([\w-]+\))?)(: .*)$/;
  const out: string[] = [];
  let last: { src: number; a: string[]; arrow: string; b: string[]; tail: string } | null = null;
  const flush = () => { if (last) out.push(`${last.a.join(", ")} ${last.arrow} ${last.b.join(", ")}${last.tail}`); last = null; };
  for (const { f, ls } of rows) {
    const m = f.k === "rel" && ls.length === 1 ? re.exec(ls[0]) : null;
    if (!m || f.k !== "rel") { flush(); out.push(...ls); continue; }
    const [, a, arrow, b, role, words] = m, tail = role + words;
    if (last && last.src === f.src.line && last.arrow === arrow && last.tail === tail) {
      if (last.a.length === 1 && last.a[0] === a && !last.b.includes(b)) { last.b.push(b); continue; }
      if (last.b.length === 1 && last.b[0] === b && !last.a.includes(a)) { last.a.push(a); continue; }
    }
    flush(); last = { src: f.src.line, a: [a], arrow, b: [b], tail };
  }
  flush();
  return out;
}

/** fmt12: lines an old graph scene draws in a step with a label that stays on the line (`dev -> repo "task gen"`). In format 12 a
 *  step's `a -> b: words` is words for that step only, so such a line is written in the setup with its label, hidden there,
 *  and shown by its step (`show dev->repo`): the label stays on every later step, as the old scene drew it */
export function lastingLines(m: Model): Set<string> {
  const out = new Set<string>(), lost = new Set<string>();
  for (const s of m.steps) for (const f of s.facts) {
    if (f.k !== "rel") continue;
    const r = m.relations[f.rel];
    if (r && !r.setup && r.label && f.words === null && f.style !== "lost" && f.style !== "stream" && !/#/.test(r.id)) out.add(r.id); else lost.add(f.rel);
  }
  if (m.steps.some((s) => s.facts.some((f) => f.k === "clear"))) return new Set(); // `clear` takes step lines away, not setup ones
  for (const id of lost) out.delete(id);
  return out;
}

/** eng-migrate2: a step's facts with `then` between the hops of a chain (`c -> r` then `r -> s`): format 12 allows one hop per
 *  beat (DESIGN 2.2), so a relay the old stage drew in one step reads as one step in two beats, played in order */
export function inBeats(m: Model, facts: Fact[]): Fact[] {
  const out: Fact[] = [];
  let beat: Relation[] = [];
  const sendOf = (f: Fact): Relation | null => {
    if (f.k !== "rel" || f.style === "stream") return null;
    const r = m.relations[f.rel]; if (!r) return null;
    const words = f.words ?? (!r.setup ? r.label : null); // printFact writes a step relation's own label as its words
    return words !== null || f.style === "lost" ? r : null;
  };
  for (const f of facts) {
    if (f.k === "then") beat = [];
    const r = sendOf(f);
    if (r && beat.some((x) => x.to === r.from || r.to === x.from) && out.length) { out.push({ k: "then", src: f.src }); beat = []; }
    if (r) beat.push(r);
    out.push(f);
  }
  return out;
}
