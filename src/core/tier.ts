// This package is the source of this file: edit it here. It began as a copy synced from a private prototype (scripts/sync.ts, now frozen).
// The tier list part (format version 8): pure, shared by the parser (dh-lib), doccheck and the browser (site/src/tier.tsx).
//
//   ```tierlist title="Databases for a small team"
//   S: Postgres (does everything), SQLite
//   A: MySQL, "Redis, as a cache"
//   D: Access
//   ```
//
// One line per tier: the tier's name, a colon, then its items separated by commas. An item may carry a short note in
// brackets after it. The tiers are S, A, B, C, D unless a first line `tiers:` names others (and picks their colours):
//
//   tiers: Must [good], Should [c6], Could [c3], Won't [bad]
//
// The tier lines read the same as the LLM view, so what a person writes is what an LLM reads.
export interface Err { line: number; msg: string }
export interface Item { name: string; note: string }
export interface TierRow { name: string; colour: string; items: Item[]; line: number }
export interface TierSpec { title: string; tiers: TierRow[]; declared: boolean; errors: Err[] }

export const TIER_COLOURS = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "good", "warn", "bad"];
export const DEFAULT_TIERS = ["S", "A", "B", "C", "D"];
// a tier with no colour of its own takes one by its place from the top: pink, orange, yellow, green, blue ...
const BY_PLACE = ["c7", "c5", "c3", "c8", "c6", "c4", "c2", "c1"];
export const tierColourAt = (k: number) => BY_PLACE[k % BY_PLACE.length];

// split at the commas that are not inside "quotes" or (brackets)
export function splitList(s: string): string[] {
  const out: string[] = []; let cur = "", depth = 0, quote = false;
  for (const c of s) {
    if (c === '"') quote = !quote;
    else if (!quote && c === "(") depth++;
    else if (!quote && c === ")" && depth) depth--;
    if (c === "," && !depth && !quote) { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}
// "name (note)", or "a name, with a comma" in quotes (then the note may follow the quote)
export function parseItem(raw: string): Item | string {
  const s = raw.trim();
  let name = s, note = "";
  const q = s.match(/^"([^"]*)"\s*(.*)$/);
  let rest = s;
  if (q) { name = q[1].trim(); rest = q[2]; if (!rest) return name ? { name, note: "" } : "an item has an empty name"; if (!rest.startsWith("(")) return `after the quoted name "${name}" only a (note) may follow, found "${rest.slice(0, 20)}"`; }
  if (q || s.endsWith(")")) {
    if (!rest.endsWith(")")) return q ? `the note after "${name}" is not closed: end it with )` : "an item is cut off";
    let depth = 0, at = -1;
    for (let i = rest.length - 1; i >= 0; i--) { if (rest[i] === ")") depth++; else if (rest[i] === "(") { depth--; if (!depth) { at = i; break; } } }
    if (at < 0) return `a note is never opened: "${s.slice(0, 30)}" has a ) with no (`;
    note = rest.slice(at + 1, -1).trim();
    if (!q) name = rest.slice(0, at).trim();
  }
  if (!name) return "an item has an empty name; write it before its (note), or in quotes";
  if (/[()]/.test(name) && !q) return `the name "${name}" holds a bracket; put the whole name in quotes ("${name}") or move the bracket's text into a (note)`;
  return { name, note };
}
// the other way: an item as a person writes it
export function itemText(it: Item): string {
  const name = /[,()"]/.test(it.name) ? `"${it.name.replace(/"/g, "'")}"` : it.name;
  return it.note ? `${name} (${it.note})` : name;
}
const eq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function parseTier(body: string, baseLine = 1, title = ""): TierSpec {
  const errors: Err[] = [];
  const err = (line: number, msg: string) => errors.push({ line, msg });
  const lines = body.split("\n");
  let tiers: TierRow[] = DEFAULT_TIERS.map((name, k) => ({ name, colour: tierColourAt(k), items: [], line: baseLine }));
  let declared = false, seenAny = false;
  const seenTier = new Set<string>();
  const where = new Map<string, string>(); // item (lower case) -> the tier it is in
  lines.forEach((raw, i) => {
    const line = baseLine + i;
    const t = raw.trim();
    if (!t) return;
    const d = t.match(/^tiers\s*:\s*(.*)$/);
    if (d) {
      if (declared) { err(line, `a second "tiers:" line; name all the tiers on one line`); return; }
      if (seenAny) { err(line, `the "tiers:" line comes first, before the tier lines`); return; }
      declared = true;
      const names = splitList(d[1]);
      tiers = [];
      names.forEach((n, k) => {
        const m = n.match(/^(.*?)\s*\[([^\]]*)\]$/);
        const name = (m ? m[1] : n).trim();
        let colour = m ? m[2].trim().toLowerCase() : tierColourAt(k);
        if (!name) { err(line, `the "tiers:" line has an empty tier name; write it like "tiers: Must [good], Should, Could"`); return; }
        if (/[:\[\]]/.test(name)) err(line, `tier name "${name}" may not hold : [ or ]`);
        if (m && !TIER_COLOURS.includes(colour)) { err(line, `tier "${name}": unknown colour "${m[2].trim()}"; colours are ${TIER_COLOURS.join(", ")}`); colour = tierColourAt(k); }
        if (tiers.some((x) => eq(x.name, name))) { err(line, `tier "${name}" is named twice on the "tiers:" line`); return; }
        tiers.push({ name, colour, items: [], line });
      });
      if (!names.filter(Boolean).length) err(line, `the "tiers:" line names no tier; write it like "tiers: Must [good], Should, Could"`);
      return;
    }
    seenAny = true;
    const c = t.indexOf(":");
    if (c <= 0) { err(line, `"${t.slice(0, 40)}" is not a tier line; write the tier's name, a colon, then its items: S: Postgres, SQLite`); return; }
    const name = t.slice(0, c).trim();
    const tier = tiers.find((x) => eq(x.name, name));
    if (!tier) { err(line, `there is no tier "${name}": the tiers are ${tiers.map((x) => x.name).join(", ")}${declared ? "; add it to the tiers: line or fix the name" : `; to use other names, start with a line like "tiers: Must, Should, Could"`}`); return; }
    if (seenTier.has(tier.name)) { err(line, `tier "${tier.name}" has two lines; put all its items on one line`); return; }
    seenTier.add(tier.name);
    tier.line = line;
    const rest = t.slice(c + 1).trim();
    if (!rest) return; // an empty tier is a row with nothing in it
    for (const raw of splitList(rest)) {
      if (!raw) { err(line, `tier "${tier.name}" has an empty item (two commas in a row, or a comma at the end); remove the extra comma`); continue; }
      const it = parseItem(raw);
      if (typeof it === "string") { err(line, `tier "${tier.name}": ${it}`); continue; }
      const key = it.name.toLowerCase();
      if (where.has(key)) { err(line, `"${it.name}" is in tier ${where.get(key) === tier.name ? `${tier.name} twice` : `${where.get(key)} and in tier ${tier.name}`}; each item sits in one tier`); continue; }
      where.set(key, tier.name);
      tier.items.push(it);
    }
  });
  if (!errors.length && !tiers.some((x) => x.items.length)) err(baseLine, `the tier list has no items; add a line like "S: Postgres (does everything), SQLite"`);
  return { title, tiers, declared, errors };
}

// what an LLM reads: one line per tier, top tier first
export function tierLlm(spec: TierSpec): string {
  const head = `Tier list${spec.title ? `: ${spec.title}` : ""} (top tier first)`;
  return `${head}\n${spec.tiers.map((t) => `${t.name}: ${t.items.length ? t.items.map(itemText).join(", ") : "(empty)"}`).join("\n")}`;
}
