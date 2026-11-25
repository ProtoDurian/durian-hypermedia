// Citations (format version 11): `[@key]` in the text (Pandoc's form), a ```references block holding the list as small YAML, and our
// own formatter for three styles: apa, ieee, chicago (author-date). A citation-style engine is not used (its licences are not
// ours to bundle), so the formatter is ours: about the fields below, the three styles, and nothing else. Pure: no DOM, no React.
import type { Budget } from "../../core/budget";
import { yamlParse } from "../../host/yaml";

export const STYLES = ["apa", "ieee", "chicago"] as const;
export type Style = (typeof STYLES)[number];
export const REF_TYPES = ["article", "book", "chapter", "web", "report", "talk", "software"];
export const REF_KEYS = ["id", "type", "author", "title", "in", "year", "volume", "issue", "pages", "doi", "publisher", "url", "accessed", "editor", "edition", "version", "place", "number", "note"];
/** what the limits of one parse give this file (a subset of the part's LIMITS) */
export interface Caps { entries: number; authors: number; text: number; cites: number }
export const capsOf = (l: { referencesEntries: number; referencesAuthors: number; referencesText: number; referencesCites: number }): Caps => ({ entries: l.referencesEntries, authors: l.referencesAuthors, text: l.referencesText, cites: l.referencesCites });

export interface Ref { id: string; type: string; author: string[]; title: string; in: string; year: string; volume: string; issue: string; pages: string; doi: string; publisher: string; url: string; accessed: string; editor: string[]; edition: string; version: string; place: string; number: string; note: string }
export interface Seg { t: string; i?: boolean; href?: string }
export interface RefsProblem { line: number; msg: string; level: "error" | "warn" }

const isAlnum = (c: string | undefined) => c !== undefined && ((c >= "0" && c <= "9") || (c >= "A" && c <= "Z") || (c >= "a" && c <= "z"));
const isDigit = (c: string) => c >= "0" && c <= "9";
const isWs = (c: string | undefined) => c === " " || c === "\t" || c === "\n" || c === "\r";
/** a key: a letter or digit, then letters, digits and `_ . : -` */
export function isKey(s: string): boolean {
  if (!s || !isAlnum(s[0])) return false;
  for (let i = 1; i < s.length; i++) if (!isAlnum(s[i]) && s[i] !== "_" && s[i] !== "." && s[i] !== ":" && s[i] !== "-") return false;
  return true;
}
/** the link of a reference: a DOI becomes https://doi.org/..., else its url */
export function refLink(r: Ref): string { return r.doi ? `https://doi.org/${r.doi}` : r.url; }
/** a bare DOI: "10." + 4 to 9 digits + "/" + a suffix with no space, angle bracket or quote */
export function isDoi(s: string): boolean {
  if (!s.startsWith("10.")) return false;
  const slash = s.indexOf("/");
  if (slash < 7 || slash > 12) return false;
  for (let i = 3; i < slash; i++) if (!isDigit(s[i])) return false;
  const suffix = s.slice(slash + 1);
  if (!suffix) return false;
  for (const ch of suffix) if (ch === "<" || ch === ">" || ch === '"' || isWs(ch)) return false;
  return true;
}
/** the host's URL policy for a reference's link here: http and https only (no data:, blob:, javascript:) */
export function urlOk(u: string): boolean {
  const lower = u.slice(0, 8).toLowerCase();
  if (!(lower.startsWith("http://") || lower.startsWith("https://")) || u.length <= (lower.startsWith("https") ? 8 : 7)) return false;
  for (const ch of u) if (isWs(ch) || ch === "<" || ch === ">" || ch === '"' || ch === "'") return false;
  return true;
}
/** a four-digit year with an optional letter (2020a) */
const isYear = (s: string) => (s.length === 4 || (s.length === 5 && s[4] >= "a" && s[4] <= "z")) && isDigit(s[0]) && isDigit(s[1]) && isDigit(s[2]) && isDigit(s[3]);
const isIsoDate = (s: string) => s.length === 10 && s[4] === "-" && s[7] === "-" && [0, 1, 2, 3, 5, 6, 8, 9].every((i) => isDigit(s[i]));

// ---------- reading the list ----------
// Every value of a reference is text: "10-20", "2020" and "2026-11-20" must stay as written (a YAML reader may turn them into numbers or
// dates, or cut them), so each plain value is quoted before the list is read.
export function quoteScalars(body: string): string {
  return body.split("\n").map((l) => {
    let i = 0;
    while (isWs(l[i])) i++;
    let from = i;
    if (l[i] === "-" && isWs(l[i + 1])) { i++; while (isWs(l[i])) i++; from = i; }
    const prefix = l.slice(0, from);
    let k = i;
    while (k < l.length && (isAlnum(l[k]) || l[k] === "_" || l[k] === "-")) k++;
    const key = l.slice(i, k);
    if (!key || !(key[0] >= "A" && key[0] <= "z") || l[k] !== ":" || !(l[k + 1] === " " || l[k + 1] === "\t") || !REF_KEYS.includes(key)) return l;
    let v = l.slice(k + 1).trim();
    if (!v) return l;
    if ("\"'[{|>&*!".includes(v[0])) return l;
    const hash = v.indexOf(" #");
    if (hash >= 0) v = v.slice(0, hash).trimEnd();
    return `${prefix}${key}: '${v.split("'").join("''")}'`;
  }).join("\n");
}
const lineOfId = (body: string, id: string): number => {
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    let t = lines[i].trim();
    if (t.startsWith("-")) t = t.slice(1).trim();
    if (!t.startsWith("id:")) continue;
    const v = t.slice(3).trim().replace(/^["']|["']$/g, "");
    if (v === id) return i;
  }
  return 0;
};
export function parseRefs(body: string, attrs: Record<string, string>, base: number, caps: Caps, budget: Budget): { refs: Ref[]; style: Style; problems: RefsProblem[] } {
  const problems: RefsProblem[] = [];
  const err = (line: number, msg: string) => problems.push({ line, msg, level: "error" });
  const warn = (line: number, msg: string) => problems.push({ line, msg, level: "warn" });
  let style: Style = "apa";
  if (attrs.style !== undefined) { if (!(STYLES as readonly string[]).includes(attrs.style)) err(base, `unknown style "${attrs.style.slice(0, 20)}" (styles: ${STYLES.join(", ")})`); else style = attrs.style as Style; }
  for (const k of Object.keys(attrs)) if (!["id", "style", "title", "llm", "static"].includes(k)) err(base, `unknown key "${k.slice(0, 20)}" (keys: style, title)`);
  budget.charge(body.length / 8 + 10, 0, body.length / 4);
  let data: unknown;
  try { data = yamlParse(quoteScalars(body)); } catch (e) { err(base, `the list is not valid YAML: ${String((e as Error).message).split("\n")[0].slice(0, 120)}`); return { refs: [], style, problems }; }
  if (!Array.isArray(data) || !data.length) { err(base, "the list needs entries: each starts with `- id: key`"); return { refs: [], style, problems }; }
  if (data.length > caps.entries) { err(base, `${data.length} references; the most is ${caps.entries}`); return { refs: [], style, problems }; }
  const refs: Ref[] = [], seen = new Map<string, number>();
  for (const raw of data) {
    budget.charge(24, 1);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) { err(base, "each reference is a set of fields: - id: key, type: article, author: ..."); continue; }
    const o = raw as Record<string, unknown>;
    const id = String(o.id ?? "");
    const at = id ? base + lineOfId(body, id) : base;
    if (!id) { err(base, "a reference needs an id (the key `[@id]` cites)"); continue; }
    if (!isKey(id)) err(at, `reference id "${id.slice(0, 40)}": use letters, digits and - _ . : (no spaces)`);
    if (seen.has(id)) { err(at, `reference id "${id}" is used twice (first at line ${seen.get(id)})`); continue; }
    seen.set(id, at);
    for (const k of Object.keys(o)) if (!REF_KEYS.includes(k)) err(at, `reference ${id}: unknown key "${k.slice(0, 20)}" (keys: ${REF_KEYS.join(", ")})`);
    const type = String(o.type ?? "article");
    if (!REF_TYPES.includes(type)) err(at, `reference ${id}: unknown type "${type.slice(0, 20)}" (types: ${REF_TYPES.join(", ")})`);
    const s = (k: string) => (o[k] == null ? "" : String(o[k]).trim());
    const names = (k: string) => s(k).split(";").map((x) => x.trim()).filter(Boolean);
    const r: Ref = { id, type, author: names("author"), title: s("title"), in: s("in"), year: s("year"), volume: s("volume"), issue: s("issue"), pages: s("pages"), doi: s("doi"), publisher: s("publisher"), url: s("url"), accessed: s("accessed"), editor: names("editor"), edition: s("edition"), version: s("version"), place: s("place"), number: s("number"), note: s("note") };
    if (!r.title) err(at, `reference ${id} has no title`);
    if (!r.author.length && !(type === "web" && r.publisher)) err(at, `reference ${id} has no author (a web page may give a publisher instead)`);
    if (r.author.length > caps.authors) err(at, `reference ${id} has ${r.author.length} authors; the most is ${caps.authors}`);
    for (const k of ["title", "in", "publisher", "note"] as const) if (r[k].length > caps.text) err(at, `reference ${id}: ${k} is over ${caps.text} characters`);
    for (const k of ["author", "editor"] as const) if (r[k].some((a) => a.length > 120)) err(at, `reference ${id}: a name in ${k} is over 120 characters`);
    for (const k of ["volume", "issue", "pages", "doi", "url", "accessed", "edition", "version", "place", "number", "year"] as const) if (r[k].length > 300) err(at, `reference ${id}: ${k} is over 300 characters`);
    if (!r.year) warn(at, `reference ${id} has no year; it shows as "n.d."`);
    else if (!isYear(r.year)) err(at, `reference ${id}: year is four digits, like 2020 (or 2020a, 2020b for two in one year)`);
    if (r.doi && !isDoi(r.doi)) err(at, `reference ${id}: doi must be the bare DOI, like 10.1234/jbs.2020.4 (not a link)`);
    if (r.url && !urlOk(r.url)) err(at, `reference ${id}: url "${r.url.slice(0, 40)}" is not an http or https link (data:, blob: and javascript: are never allowed)`);
    if (r.accessed && !isIsoDate(r.accessed)) err(at, `reference ${id}: accessed is a date, like 2026-11-20`);
    refs.push(r);
  }
  return { refs, style, problems };
}

// ---------- the marks in the text ----------
export interface Cite { key: string; locator: string }
export interface CiteGroup { start: number; end: number; cites: Cite[] }
/** One piece of a group: `@key` or `@key, locator`; null when it is neither. */
function onePiece(p: string): Cite | null {
  const t = p.trim();
  if (t[0] !== "@") return null;
  let k = 1;
  while (k < t.length && (isAlnum(t[k]) || t[k] === "_" || t[k] === "." || t[k] === ":" || t[k] === "-")) k++;
  const key = t.slice(1, k);
  if (!isKey(key)) return null;
  let rest = t.slice(k);
  if (!rest.trim()) return { key, locator: "" };
  rest = rest.trimStart();
  if (rest[0] !== ",") return null;
  const locator = rest.slice(1).trim();
  return locator ? { key, locator } : null;
}
/** The `[@key]` groups of one text run, with their positions: `[@a]`, `[@a, p. 12]`, `[@a; @b]` (not followed by `(`, `:` or `[`). Hand scan: each `]` is searched for once. */
export function citeGroups(text: string, budget?: Budget, maxLen = 400): CiteGroup[] {
  const out: CiteGroup[] = [];
  let close = -2;
  for (let i = text.indexOf("[@"); i >= 0;) {
    budget?.charge(4);
    if (close !== -1 && close < i) close = text.indexOf("]", i);
    if (close === -1) break;
    const next = text[close + 1];
    let group: Cite[] | null = null;
    if (close - i <= maxLen && next !== "(" && next !== ":" && next !== "[") {
      group = [];
      for (const piece of text.slice(i + 1, close).split(";")) { const c = onePiece(piece); if (!c) { group = null; break; } group.push(c); }
    }
    if (group && group.length) { out.push({ start: i, end: close + 1, cites: group }); i = text.indexOf("[@", close + 1); }
    else i = text.indexOf("[@", i + 2);
  }
  return out;
}

// ---------- names ----------
/** "Smith, Jane" or "Jane Smith" -> family and given. A name without a comma is "Given Family". */
export function nameParts(a: string): { family: string; given: string } {
  const c = a.indexOf(",");
  if (c >= 0) return { family: a.slice(0, c).trim(), given: a.slice(c + 1).trim() };
  const w = a.trim().split(/\s+/);
  return w.length === 1 ? { family: w[0], given: "" } : { family: w[w.length - 1], given: w.slice(0, -1).join(" ") };
}
const initials = (g: string, dots = true) => g.split(/\s+/).filter(Boolean).map((w) => w.split("-").map((x) => x[0]?.toUpperCase() + (dots ? "." : "")).join("-")).join(" ");
const sentence = (s: string) => (/[.!?]$/.test(s) ? s : s + ".");
const range = (p: string, dash: boolean) => (dash ? p.replace(/\s*-+\s*/g, "–") : p);
const joinSegs = (...xs: (Seg | string | null | false | undefined)[]): Seg[] => xs.filter(Boolean).map((x) => (typeof x === "string" ? { t: x } : x as Seg));
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const fmtDate = (d: string, long: boolean) => { if (!isIsoDate(d)) return d; const mo = MONTHS[+d.slice(5, 7) - 1] ?? d.slice(5, 7); return long ? `${mo} ${+d.slice(8)}, ${d.slice(0, 4)}` : `${mo.slice(0, 3)}. ${+d.slice(8)}, ${d.slice(0, 4)}`; };

// ---------- in the text ----------
/** "Smith & Lee, 2020" (apa), "Smith and Lee 2020" (chicago) */
export function authorYear(r: Ref, style: "apa" | "chicago"): string {
  const fam = r.author.map((a) => nameParts(a).family);
  const names = fam.length === 0 ? [r.publisher || r.title] : fam;
  const who = names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} ${style === "apa" ? "&" : "and"} ${names[1]}` : names.length === 3 && style === "chicago" ? `${names[0]}, ${names[1]}, and ${names[2]}` : `${names[0]} et al.`;
  return `${who}${style === "apa" ? ", " : " "}${r.year || "n.d."}`;
}
/** The label of one mark: "Smith & Lee, 2020, p. 12", "Smith and Lee 2020, 12" or "1". */
export function citeLabel(r: Ref, style: Style, num: number, locator: string): string {
  if (style === "ieee") return locator ? `${num}, ${locator}` : String(num);
  if (style === "apa") return `${authorYear(r, "apa")}${locator ? `, ${locator}` : ""}`;
  return `${authorYear(r, "chicago")}${locator ? `, ${locator.replace(/^(pp?)\.\s*/, "")}` : ""}`;
}

// ---------- the list ----------
function authorsApa(r: Ref): string {
  if (!r.author.length) return "";
  const f = r.author.map((a) => { const n = nameParts(a); return n.given ? `${n.family}, ${initials(n.given)}` : n.family; });
  if (f.length === 1) return f[0];
  if (f.length <= 20) return `${f.slice(0, -1).join(", ")}, & ${f[f.length - 1]}`;
  return `${f.slice(0, 19).join(", ")}, ... ${f[f.length - 1]}`;
}
function authorsChicago(r: Ref): string {
  if (!r.author.length) return "";
  const f = r.author.map((a, i) => { const n = nameParts(a); return !n.given ? n.family : i === 0 ? `${n.family}, ${n.given}` : `${n.given} ${n.family}`; });
  return f.length === 1 ? f[0] : `${f.slice(0, -1).join(", ")}, and ${f[f.length - 1]}`;
}
function authorsIeee(r: Ref): string {
  if (!r.author.length) return "";
  const f = r.author.map((a) => { const n = nameParts(a); return n.given ? `${initials(n.given)} ${n.family}` : n.family; });
  if (f.length > 6) return `${f[0]} et al.`;
  return f.length === 1 ? f[0] : f.length === 2 ? `${f[0]} and ${f[1]}` : `${f.slice(0, -1).join(", ")}, and ${f[f.length - 1]}`;
}

/** One list entry as styled segments (italics for journals and books; the link is its own segment). `dash`: en dash in page ranges. */
export function formatRef(r: Ref, style: Style, dash = true): Seg[] {
  const link = refLink(r);
  const L = link ? { t: link, href: link } : null;
  const year = r.year || "n.d.";
  if (style === "apa") {
    const who = authorsApa(r) || (r.publisher && r.type === "web" ? r.publisher : "");
    const head = who ? sentence(who) + " " : "";
    const date = `(${year}). `;
    const title = (italic: boolean) => italic ? { t: sentence(r.title), i: true } : { t: sentence(r.title) };
    switch (r.type) {
      case "article": return joinSegs(head + date, sentence(r.title) + " ", r.in && { t: r.in, i: true }, r.volume && { t: `, ${r.volume}`, i: true }, r.issue && `(${r.issue})`, r.pages && `, ${range(r.pages, dash)}`, ". ", L);
      case "book": return joinSegs(head + date, { t: r.title + (r.edition ? ` (${r.edition} ed.)` : ""), i: true }, ". ", r.publisher && `${sentence(r.publisher)} `, L);
      case "chapter": return joinSegs(head + date, sentence(r.title) + " ", "In ", r.editor.length ? `${r.editor.map((e) => { const n = nameParts(e); return n.given ? `${initials(n.given)} ${n.family}` : n.family; }).join(" & ")} (Ed${r.editor.length > 1 ? "s" : ""}.), ` : "", r.in && { t: r.in, i: true }, r.pages && ` (pp. ${range(r.pages, dash)})`, ". ", r.publisher && `${sentence(r.publisher)} `, L);
      case "web": return joinSegs(head + date, title(true), " ", r.publisher && who !== r.publisher && `${sentence(r.publisher)} `, r.accessed && L ? `Retrieved ${fmtDate(r.accessed, true)}, from ` : "", L);
      case "report": return joinSegs(head + date, { t: r.title, i: true }, r.number ? ` (Report No. ${r.number}). ` : ". ", r.publisher && `${sentence(r.publisher)} `, L);
      case "talk": return joinSegs(head + date, { t: r.title, i: true }, " [Conference session]. ", r.in && `${sentence(r.in)} `, L);
      default: return joinSegs(head + date, { t: r.title, i: true }, ` (${r.version ? `Version ${r.version}` : "Computer software"})${r.version ? " [Computer software]" : ""}. `, r.publisher && `${sentence(r.publisher)} `, L);
    }
  }
  if (style === "chicago") {
    const who = authorsChicago(r) || (r.publisher && r.type === "web" ? r.publisher : "");
    const head = who ? sentence(who) + " " : "";
    const quoted = `“${sentence(r.title)}” `;
    switch (r.type) {
      case "article": return joinSegs(head + `${year}. ` + quoted, r.in && { t: r.in, i: true }, r.volume && ` ${r.volume}`, r.issue && ` (${r.issue})`, r.pages && `: ${range(r.pages, dash)}`, ". ", L);
      case "book": return joinSegs(head + `${year}. `, { t: r.title, i: true }, ". ", r.place && `${r.place}: `, r.publisher && `${sentence(r.publisher)} `, L);
      case "chapter": return joinSegs(head + `${year}. ` + quoted, "In ", r.in && { t: r.in, i: true }, r.editor.length ? `, edited by ${r.editor.map((e) => { const n = nameParts(e); return n.given ? `${n.given} ${n.family}` : n.family; }).join(" and ")}` : "", r.pages && `, ${range(r.pages, dash)}`, ". ", r.place && `${r.place}: `, r.publisher && `${sentence(r.publisher)} `, L);
      case "web": return joinSegs(head + `${year}. ` + quoted, r.publisher && who !== r.publisher && `${sentence(r.publisher)} `, r.accessed && `Accessed ${fmtDate(r.accessed, true)}. `, L);
      case "report": return joinSegs(head + `${year}. `, { t: r.title, i: true }, r.number ? ` (${r.number}). ` : ". ", r.place && `${r.place}: `, r.publisher && `${sentence(r.publisher)} `, L);
      case "talk": return joinSegs(head + `${year}. ` + quoted, "Paper presented at ", r.in || "a conference", ". ", L);
      default: return joinSegs(head + `${year}. `, { t: r.title, i: true }, r.version ? `. Version ${r.version}` : "", ". ", r.publisher && `${sentence(r.publisher)} `, L);
    }
  }
  // ieee
  const who = authorsIeee(r) || (r.publisher && r.type === "web" ? r.publisher : "");
  const head = who ? who + ", " : "";
  switch (r.type) {
    case "article": return joinSegs(head + `“${r.title},” `, r.in && { t: r.in, i: true }, r.volume && `, vol. ${r.volume}`, r.issue && `, no. ${r.issue}`, r.pages && `, pp. ${range(r.pages, dash)}`, `, ${year}`, r.doi ? `, doi: ${r.doi}.` : ".", !r.doi && r.url ? " " : "", !r.doi && L);
    case "book": return joinSegs(head, { t: r.title, i: true }, r.edition ? `, ${r.edition} ed` : "", ". ", r.place && `${r.place}: `, r.publisher && `${r.publisher}, `, `${year}.`, L && " ", L);
    case "chapter": return joinSegs(head + `“${r.title},” in `, r.in && { t: r.in, i: true }, r.editor.length ? `, ${r.editor.map((e) => { const n = nameParts(e); return n.given ? `${initials(n.given)} ${n.family}` : n.family; }).join(" and ")}, Ed${r.editor.length > 1 ? "s" : ""}.` : "", r.publisher && `, ${r.publisher}`, `, ${year}`, r.pages && `, pp. ${range(r.pages, dash)}`, ".", L && " ", L);
    case "web": return joinSegs(head + `“${r.title},” `, r.publisher && who !== r.publisher && `${r.publisher}, `, `${year}. [Online]. Available: `, L, r.accessed && ` (accessed ${fmtDate(r.accessed, false)})`, ".");
    case "report": return joinSegs(head + `“${r.title},” `, r.publisher && `${r.publisher}, `, r.number ? `Rep. ${r.number}, ` : "", `${year}.`, L && " ", L);
    case "talk": return joinSegs(head + `“${r.title},” `, r.in && `${r.in}, `, `${year}.`, L && " ", L);
    default: return joinSegs(head, { t: r.title, i: true }, r.version ? `, version ${r.version}` : "", ". ", r.publisher && `${r.publisher}, `, `${year}.`, L && " ", L);
  }
}
/** A reference as one plain string (the LLM view and the popover's text). */
export const plainRef = (r: Ref, style: Style) => formatRef(r, style, false).map((s) => s.t).join("").replace(/\s+/g, " ").trim();

// ---------- the whole page ----------
export interface RefDoc {
  style: Style;
  refs: Ref[];                       // in the order the list shows them
  num: Record<string, number>;       // the number of each reference (ieee: in order of first cite)
  uses: Record<string, number>;      // how many times each key is cited
  missing: { key: string; near: string | null }[];   // cites of a key not in the list
  cites: number;
}
/** Orders and numbers the list. `texts` are the page's Markdown texts, in page order (code is left out). */
export function refDoc(refs: Ref[], style: Style, texts: readonly string[], caps: Caps, budget: Budget): RefDoc {
  const byId = new Map(refs.map((r) => [r.id, r]));
  const num: Record<string, number> = {}, uses: Record<string, number> = {}, missing: RefDoc["missing"] = [];
  let n = 0, cites = 0;
  for (const t of texts) {
    if (!t.includes("[@")) continue;
    budget.charge(t.length / 8 + 1);
    for (const g of citeGroups(withoutCode(t), budget)) for (const c of g.cites) {
      if (++cites > caps.cites) continue;
      if (!byId.has(c.key)) { missing.push({ key: c.key, near: nearest(c.key, [...byId.keys()], budget) }); continue; }
      uses[c.key] = (uses[c.key] ?? 0) + 1;
      if (!(c.key in num)) num[c.key] = ++n;
    }
  }
  let ordered: Ref[];
  if (style === "ieee") {
    const cited = refs.filter((r) => r.id in num).sort((a, b) => num[a.id] - num[b.id]);
    ordered = [...cited, ...refs.filter((r) => !(r.id in num))];
    ordered.forEach((r) => { if (!(r.id in num)) num[r.id] = ++n; });
  } else {
    const key = (r: Ref) => `${(r.author.length ? nameParts(r.author[0]).family : r.publisher || r.title).toLowerCase()}\u0000${r.year}\u0000${r.title.toLowerCase()}`;
    ordered = [...refs].sort((a, b) => key(a).localeCompare(key(b), "en"));
    refs.forEach((r) => { if (!(r.id in num)) num[r.id] = ++n; });
  }
  return { style, refs: ordered, num, uses, missing, cites };
}
/** a Markdown text with its fenced code and code spans blanked (same length), so a `[@key]` in code is not a cite */
export function withoutCode(t: string): string {
  if (!t.includes("`")) return t;
  const out: string[] = [];
  let i = 0;
  while (i < t.length) {
    if (t[i] !== "`") { const j = t.indexOf("`", i); const end = j < 0 ? t.length : j; out.push(t.slice(i, end)); i = end; continue; }
    let run = 0;
    while (t[i + run] === "`") run++;
    const fence = "`".repeat(run);
    const close = t.indexOf(fence, i + run);
    const end = close < 0 ? i + run : close + run;
    out.push(" ".repeat(end - i));
    i = end;
  }
  return out.join("");
}
function nearest(key: string, ids: string[], budget: Budget): string | null {
  let best: string | null = null, d = Infinity;
  for (const id of ids) { budget.charge(key.length + 1); const x = lev(key.toLowerCase(), id.toLowerCase()); if (x < d) { d = x; best = id; } }
  return best !== null && d <= Math.max(2, Math.floor(key.length / 3)) ? best : null;
}
function lev(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 6 || a.length > 80 || b.length > 80) return 99;
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return m[a.length][b.length];
}

/** LLM view of the list: `References:` then one line per reference, `- [id] formatted`. */
export function refsLlm(d: Pick<RefDoc, "refs" | "style">): string {
  return ["References:", ...d.refs.map((r) => `- [${r.id}] ${plainRef(r, d.style)}`)].join("\n");
}
