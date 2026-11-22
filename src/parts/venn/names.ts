// A list of names with notes, as a venn region holds them (format version 11): `Ana, "Cy, the third" (a note), Dee (writes all)`.
// Hand scans, one pass each: no regular expression runs over author text.
export interface Item { name: string; note: string }

/** split at the commas that are not inside "quotes" or (brackets) */
export function splitList(s: string): string[] {
  const out: string[] = [];
  let from = 0, depth = 0, quote = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') quote = !quote;
    else if (!quote && c === "(") depth++;
    else if (!quote && c === ")" && depth) depth--;
    else if (c === "," && !depth && !quote) { out.push(s.slice(from, i).trim()); from = i + 1; }
  }
  out.push(s.slice(from).trim());
  return out;
}

/** "name (note)", or "a name, with a comma" in quotes (then the note may follow the quote); a message when it is not an item */
export function parseItem(raw: string): Item | string {
  const s = raw.trim();
  let name = s, rest = s, note = "", quoted = false;
  const close = s[0] === '"' ? s.indexOf('"', 1) : -1;
  if (close > 0) {
    quoted = true;
    name = s.slice(1, close).trim();
    rest = s.slice(close + 1).trimStart();
    if (!rest) return name ? { name, note: "" } : "an item has an empty name";
    if (!rest.startsWith("(")) return `after the quoted name "${name}" only a (note) may follow, found "${rest.slice(0, 20)}"`;
  }
  if (quoted || s.endsWith(")")) {
    if (!rest.endsWith(")")) return quoted ? `the note after "${name}" is not closed: end it with )` : "an item is cut off";
    let depth = 0, at = -1;
    for (let i = rest.length - 1; i >= 0; i--) { if (rest[i] === ")") depth++; else if (rest[i] === "(") { depth--; if (!depth) { at = i; break; } } }
    if (at < 0) return `a note is never opened: "${s.slice(0, 30)}" has a ) with no (`;
    note = rest.slice(at + 1, -1).trim();
    if (!quoted) name = rest.slice(0, at).trim();
  }
  if (!name) return "an item has an empty name; write it before its (note), or in quotes";
  if (!quoted && (name.includes("(") || name.includes(")"))) return `the name "${name}" holds a bracket; put the whole name in quotes ("${name}") or move the bracket's text into a (note)`;
  return { name, note };
}
