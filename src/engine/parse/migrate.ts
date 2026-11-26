// Lane parse: `dh migrate` - a page's animation blocks rewritten to format 12 (the caller prints the diff; nothing is
// written here). The page gets `format: 12` in its front matter; a graph family becomes a role of its own block (`role name cN: words`,
// fmt12), and a role no line declares goes under `roles:`. A graph-engine block keeps its look with `look=classic` on its fence line.
import { parseDoc } from "../../core/dh-lib";
import { pageRoles } from "../../core/stage-roles";
import { isStage } from "../../core/stage";
import type { EngineSrc, Model } from "../types";
import { lowerGraph } from "./lower-graph";
import { lowerStage } from "./lower-stage";
import { print12 } from "./print12";

function parts(nodes: any[], out: any[]) { for (const n of nodes) if (n?.kind === "part") { out.push(n); if (n.nodes) parts(n.nodes, out); if (n.items) for (const it of n.items) parts(it.nodes, out); } }

/** the Model of one old-form block (the front end the old rules would pick) */
export function lowerBlock(src: EngineSrc): Model {
  const head = src.body.split("\n@step")[0];
  return isStage(src.fence, head) ? lowerStage(src) : lowerGraph(src);
}

export function migrate(page: string): string {
  const doc = parseDoc("page.dh.md", page);
  if (String((doc.fm ?? {}).format ?? "") === "12") return page;
  const roles = pageRoles(doc.fm).roles;
  const ps: any[] = []; parts(doc.body, ps);
  const lines = page.split("\n");
  const newRoles: Record<string, number> = {};
  const edits: { open: number; close: number; text: string[] }[] = [];
  for (const p of ps) {
    if (p.name !== "animation") continue;
    const m = lowerBlock({ body: p.body, line0: p.bodyLine, fence: { ...p.attrs }, roles, format12: false });
    const refused = m.problems.filter((x) => !x.warn);
    if (refused.length) throw new Error(`line ${refused[0].line}: ${refused[0].msg} (migrate reads the old block first; fix this and run again)`);
    const used = new Set<string>();
    const note = (r: string | null | undefined) => { if (r && r !== "plain" && !(r in roles) && !/^c[1-8]$/.test(r)) used.add(r); };
    for (const t of Object.values(m.things)) note(t.role);
    for (const r of Object.values(m.relations)) note(r.role);
    for (const s of [...m.steps, { facts: m.setup }]) for (const f of s.facts) if (f.k === "rel" || f.k === "say") note(f.role);
    // fmt12: a graph family is a role of its block (print12 writes `role name cN: words`), so its words stay in the colour key and two
    // blocks' families never clash on the page; only a role no line declares goes to the front matter
    for (const r of used) if (!m.roles[r]?.label) newRoles[r] = m.roles[r]?.colour || (Object.keys(newRoles).length % 8) + 1;
    const open = lines[p.line - 1];
    const fence = m.origin === "graph10" && m.look === "classic" && !/\blook=/.test(open) ? open.replace(/\s*$/, " look=classic") : open;
    edits.push({ open: p.line - 1, close: p.endLine - 1, text: [fence, ...print12(m, roles).split("\n")] });
  }
  for (const e of edits.sort((a, b) => b.open - a.open)) lines.splice(e.open, e.close - e.open, ...e.text);
  return withFrontMatter(lines.join("\n"), doc.fmRaw, newRoles);
}

function withFrontMatter(text: string, fmRaw: string, add: Record<string, number>): string {
  const roleLines = Object.entries(add).map(([n, c]) => `  ${n}: c${c}`);
  if (!/^---\n/.test(text)) return `---\nformat: 12${roleLines.length ? "\nroles:\n" + roleLines.join("\n") : ""}\n---\n${text}`;
  const end = text.indexOf("\n---\n", 3);
  let fm = text.slice(4, end);
  const rest = text.slice(end);
  if (roleLines.length) {
    const fl = fm.split("\n"), at = fl.findIndex((l) => /^roles:\s*$/.test(l));
    if (at < 0) { if (fl.some((l) => /^roles:/.test(l))) throw new Error("the front matter writes roles: in one line; write it as a block (one role per line) and run again"); fl.push("roles:", ...roleLines); }
    else { let j = at + 1; while (j < fl.length && /^\s+/.test(fl[j])) j++; fl.splice(j, 0, ...roleLines); }
    fm = fl.join("\n");
  }
  void fmRaw;
  return `---\n${fm}\nformat: 12${rest}`;
}
