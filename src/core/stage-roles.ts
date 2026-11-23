// This package is the source of this file: edit it here. It began as a copy of the private prototype's composed stage (0.7.0).
// The page's roles (ROLES-API.md): declared once in the front matter, each with one of the 8 role colours.
// roles:
// client: { label: "the browser", colour: c1 }
// service: c3 # short form: only a colour
// store: {} # no colour: the lowest free one, in the order of this list
// c0 is the neutral (slate) colour: only when a role asks for it, never given out in order. Several roles may share a colour
// across a page; one stage may not draw two roles of one colour (sameColourRoles).
// Pure. The colours helper may move this into the shared parser; the stage only needs role -> colour number.
export const ROLE_RE = /^[a-z][a-z0-9-]*$/;
export type Roles = { roles: Record<string, number>; labels: Record<string, string>; errors: string[]; theme?: Record<string, string> };
/** page-level stage tokens (front matter "theme:"): how a page's stages look, never a word in a scene. "sheet-outcome": the
 * worksheet's outcome column ends level with the last group (level, the default) or is a fixed panel at least 0.312 of
 * the stage's width tall (panel: the reference design's merger, 306 of 980 and 345 of 1104 in its two pages). */
export const THEME_TOKENS: Record<string, string[]> = { "sheet-outcome": ["level", "panel"] };
/** "fill-c1".. "fill-c8", "fill-c0": a role colour's fill (cards, groups, lanes, panels) on this page's stages, light then dark:
 * fill-c1: "#EEF0FF #1E2340" (the default palette is unchanged) */
export const FILL_TOKEN = /^fill-c([0-8])$/, FILL_VALUE = /^#[0-9A-Fa-f]{6} #[0-9A-Fa-f]{6}$/;
function pageTheme(fm: any, errors: string[]): Record<string, string> | undefined {
  const t = fm && typeof fm === "object" ? fm.theme : undefined;
  if (t == null) return undefined;
  if (typeof t !== "object" || Array.isArray(t)) { errors.push(`theme: is a map of stage tokens: theme: { sheet-outcome: panel }`); return undefined; }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(t)) {
    if (FILL_TOKEN.test(k)) { if (!FILL_VALUE.test(String(v))) { errors.push(`theme: ${k} is two colours, light then dark: "#EEF0FF #1E2340", not "${v}"`); continue; } out[k] = String(v); continue; }
    const ok = THEME_TOKENS[k];
    if (!ok) { errors.push(`theme: "${k}" is not a stage token (${Object.keys(THEME_TOKENS).join(", ")}, fill-c0 to fill-c8)`); continue; }
    if (!ok.includes(String(v))) { errors.push(`theme: ${k} is ${ok.join(" or ")}, not "${v}"`); continue; }
    out[k] = String(v);
  }
  return out;
}
export function pageRoles(fm: any): Roles {
  const out: Roles = { roles: {}, labels: {}, errors: [] };
  out.theme = pageTheme(fm, out.errors);
  const r = fm && typeof fm === "object" ? fm.roles : undefined;
  if (r == null) return out;
  if (typeof r !== "object" || Array.isArray(r)) { out.errors.push("roles: is a map of role names: roles: { client: c1, store: {} }"); return out; }
  const names = Object.keys(r);
  const taken = new Map<number, string>(), later: string[] = [];
  for (const name of names) {
    if (!ROLE_RE.test(name)) { out.errors.push(`"${name}" is not a role name: lower-case letters, digits and hyphens`); continue; }
    const v = r[name], c = typeof v === "string" ? v : v && typeof v === "object" ? v.colour ?? v.color : undefined;
    if (v && typeof v === "object" && typeof v.label === "string") out.labels[name] = v.label;
    if (c == null) { later.push(name); continue; }
    const m = /^c([0-8])$/.exec(String(c));
    if (!m) { out.errors.push(`roles: ${name}: "${c}" is not a role colour (c1 to c8, or c0 the neutral)`); continue; }
    // a page may give one colour to several roles (a long page has more roles than colours); ONE stage may not use two
    // roles of one colour (sameColourRoles, checked per stage), so no scene is ambiguous
    if (!taken.has(+m[1])) taken.set(+m[1], name); out.roles[name] = +m[1];
  }
  for (const name of later) { let n = 1; while (taken.has(n) && n <= 8) n++; if (n > 8) { out.errors.push(`roles: ${name}: no colour left`); continue; } taken.set(n, name); out.roles[name] = n; }
  return out;
}

/** the roles one stage draws that share a colour: [colour, names] for each colour two or more of them take */
export function sameColourRoles(used: Iterable<string>, roles: Record<string, number>): [number, string[]][] {
  const by = new Map<number, string[]>();
  for (const r of new Set(used)) { const n = roles[r]; if (n === undefined) continue; by.set(n, [...(by.get(n) ?? []), r]); }
  return [...by].filter(([, v]) => v.length > 1).map(([n, v]) => [n, v.sort()] as [number, string[]]).sort((a, b) => a[0] - b[0]);
}
/** every role name a compiled model refers to: a "role" or "tag" field naming a role, or a "role:<name>" paint */
export function rolesUsed(model: unknown, roles: Record<string, number>): Set<string> {
  const out = new Set<string>(), seen = new WeakSet<object>(), stack: unknown[] = [model];
  while (stack.length) {
    const v = stack.pop();
    if (typeof v === "string") { const m = /^role:([a-z][a-z0-9-]*)/.exec(v); if (m && roles[m[1]] !== undefined) out.add(m[1]); continue; }
    if (!v || typeof v !== "object" || seen.has(v)) continue;
    seen.add(v);
    if (v instanceof Map) { for (const [k, x] of v) stack.push(k, x); continue; }
    if (v instanceof Set || Array.isArray(v)) { for (const x of v) stack.push(x); continue; }
    for (const [k, x] of Object.entries(v)) {
      if ((k === "role" || k === "tag") && typeof x === "string" && roles[x] !== undefined) out.add(x);
      if (k !== "roles") stack.push(x); // the page's role map itself is not a use
    }
  }
  return out;
}
