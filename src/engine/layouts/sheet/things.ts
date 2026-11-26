// Lane sheet: the format 12 form. A container thing laid out as `sheet`, `wrap` or `track` holds its parts as things
// (indent = held by the thing above); they are written back as the entries lowerStage hands over for a format 11 scene,
// so one reading (blocks.ts) serves both forms.
//   wrap:  each child is a wrapper, outside first (a child of a child is not nested: the order says inside):
//          `role id [..]: title | size | field; field`  (Thing.lines = size, fields)
//   sheet: each container child is a group (`role id: title | note`) holding rows (`role id: label` with `values`);
//          a child with the flag `outcome` is the outcome column; `labels=a,b,c` in the container's keys names the columns
//   track: each child is a phase (`role id: name`), a run of one role is one group; `carry=`, `where=`, `form=`, `place=` in keys
import type { Id, LayoutName, Model, Src, Thing } from "../../types";

export type Entry = { word: string; arg: string; body: string[]; src: Src };
const kidsOf = (m: Model, id: Id): Thing[] => m.order.map((i) => m.things[i]).filter((t) => t.parent === id);
const roleOf = (m: Model, t: Thing): string => t.role ?? (m.roles.plain ? "plain" : Object.keys(m.roles)[0] ?? "plain");
const text = (t: Thing) => [t.title, ...t.lines].filter((x, i) => i === 0 || x !== "").join(" | ");

/** the entries of a container thing of this lane, or [] when it holds nothing (the scene then uses `layoutWords`) */
export function entriesOf(m: Model, c: Thing, layout: LayoutName): Entry[] {
  const kids = kidsOf(m, c.id);
  if (!kids.length) return [];
  const at = (t: Thing): Src => ({ line: t.src.line });
  const keys = c.keys ?? {};
  if (layout === "wrap") {
    return [{ word: "nest", arg: text(c), body: kids.map((k) => `${roleOf(m, k)} ${k.id}: ${[k.title, k.lines[0] || "_", ...k.lines.slice(1)].join(" | ")}`), src: at(c) }];
  }
  if (layout === "track") {
    const groups: { role: string; names: string[] }[] = [];
    for (const k of kids) { const r = roleOf(m, k), g = groups.at(-1); if (g && g.role === r) g.names.push(k.title || k.id); else groups.push({ role: r, names: [k.title || k.id] }); }
    const out: Entry[] = [{ word: "track", arg: groups.map((g) => `${g.role} ${g.names.join(", ")}`).join(" | "), body: [], src: at(c) }];
    for (const w of ["carry", "where", "form", "place"]) if (keys[w]) out.push({ word: w, arg: keys[w], body: [], src: at(c) });
    return out;
  }
  // sheet
  const out: Entry[] = [{ word: "sheet", arg: text(c), body: [], src: at(c) }];
  if (keys.labels) out.push({ word: "labels", arg: keys.labels.split(",").join(", "), body: [], src: at(c) });
  if (keys.spacing) out.push({ word: "spacing", arg: keys.spacing, body: [], src: at(c) });
  for (const g of kids) {
    if (g.flags.includes("outcome")) { out.push({ word: "=>", arg: `${roleOf(m, g)} ${g.id}: ${text(g)}`, body: [], src: at(g) }); continue; }
    const rows = kidsOf(m, g.id).map((r) => {
      const v = r.values ?? (r.lines[0] ? r.lines[0].split(/\s+/) : []);
      return `${roleOf(m, r)} ${r.id}${r.title && r.title !== r.id ? ` "${r.title}"` : ""}: ${v.map((x) => (x === "" ? "_" : x)).join(" ")}`;
    });
    out.push({ word: roleOf(m, g), arg: `${g.id}: ${text(g)}`, body: rows, src: at(g) });
  }
  return out;
}
