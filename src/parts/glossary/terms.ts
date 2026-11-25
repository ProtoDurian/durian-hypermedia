// The glossary's terms (format version 11): reading them (a block, front matter), the small Markdown of a meaning, and finding
// them in prose. Pure: no DOM, no React. Every scan is one pass over the text with a charge; no regular expression runs over
// author text, and the names are never made into a regular expression (they are walked as an Aho-Corasick machine).
import type { Budget } from "../../core/budget";
import { isSpace } from "../kit/text";

export interface GlossLimits { glossaryTerms: number; glossaryLabel: number; glossaryDef: number; glossaryAliases: number }
export const GLOSS_KEYS = ["id", "title"];
/** a piece of a meaning: plain text, `code`, **bold**, *italic* or a link (https only) */
export type DefSeg = { t: string; b?: boolean; i?: boolean; code?: boolean; href?: string };
export interface Term { id: string; label: string; also: string[]; def: string; segs: DefSeg[]; line: number; from: "block" | "front" | "host" }
export interface GlossError { line: number; msg: string }

const isIdCh = (c: string) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || (c >= "0" && c <= "9") || c === "_" || c === "." || c === "-";
/** letters and digits made into words joined by "-", the ends trimmed ("Bounded context" -> "bounded-context") */
export function slug(s: string): string {
  let out = "", dash = false;
  for (const ch of s.toLowerCase()) {
    if ((ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9")) { if (dash && out) out += "-"; dash = false; out += ch; } else dash = true;
  }
  return out;
}

/** "the next position at or after `from` where pred holds", found once and kept: for increasing `from` the whole scan is one pass */
function finder(s: string, pred: (c: number) => boolean) {
  let at = -2;
  return (from: number): number => {
    if (at === -1) return -1;
    if (at >= from) return at;
    let j = from;
    while (j < s.length && !pred(s.charCodeAt(j))) j++;
    at = j < s.length ? j : -1;
    return at;
  };
}

/** The meaning as small Markdown (`code`, **bold**, *italic*, [text](https://...)) in segments; nothing else is read. One pass. */
export function defSegs(def: string, budget?: Budget): DefSeg[] {
  budget?.charge(def.length + 1, 0, 0);
  const out: DefSeg[] = [];
  const n = def.length;
  const tick = finder(def, (c) => c === 96), star = finder(def, (c) => c === 42), close = finder(def, (c) => c === 93), nl = finder(def, (c) => c === 10);
  const stop = finder(def, (c) => c === 41 || c === 32 || (c >= 9 && c <= 13) || c === 160 || c === 0x2028 || c === 0x2029 || c === 0xfeff || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) || c === 0x202f || c === 0x205f || c === 0x3000);
  const clean = (a: number, b: number) => { const k = nl(a); return k < 0 || k >= b; };
  let at = 0, i = 0;
  const text = (a: number, b: number) => { if (b > a) out.push({ t: def.slice(a, b) }); };
  while (i < n) {
    const c = def.charCodeAt(i);
    let end = -1, seg: DefSeg | null = null;
    if (c === 96) { const j = tick(i + 1); if (j > i + 1 && clean(i + 1, j)) { seg = { t: def.slice(i + 1, j), code: true }; end = j + 1; } }
    else if (c === 42) {
      if (def.charCodeAt(i + 1) === 42) { const j = star(i + 2); if (j > i + 2 && def.charCodeAt(j + 1) === 42 && clean(i + 2, j)) { seg = { t: def.slice(i + 2, j), b: true }; end = j + 2; } }
      else { const j = star(i + 1); if (j > i + 1 && clean(i + 1, j)) { seg = { t: def.slice(i + 1, j), i: true }; end = j + 1; } }
    } else if (c === 91) {
      const j = close(i + 1);
      if (j > i + 1 && clean(i + 1, j) && def.charCodeAt(j + 1) === 40) {
        const s = j + 2, p = def.startsWith("https://", s) ? s + 8 : def.startsWith("http://", s) ? s + 7 : -1;
        if (p > 0) { const e = stop(p); if (e > p && def.charCodeAt(e) === 41) { seg = { t: def.slice(i + 1, j), href: def.slice(s, e) }; end = e + 1; } }
      }
    }
    if (seg) { text(at, i); out.push(seg); at = i = end; } else i++;
  }
  text(at, n);
  return out;
}
export const defPlain = (segs: DefSeg[]): string => segs.map((s) => s.t).join("");

/** One `term` line, read by hand: `term [id] "name" [also "a", "b"]: meaning`. null: not a term line. */
export function termLine(t: string): { id: string | null; label: string; also: string[]; rest: string } | null {
  const n = t.length;
  if (!t.startsWith("term") || !isSpace(t[4])) return null;
  let i = 4;
  while (i < n && isSpace(t[i])) i++;
  let id: string | null = null;
  if (t[i] !== "\"") {
    let j = i;
    while (j < n && isIdCh(t[j])) j++;
    if (j === i || !isSpace(t[j])) return null;
    id = t.slice(i, j);
    i = j;
    while (i < n && isSpace(t[i])) i++;
    if (t[i] !== "\"") return null;
  }
  let e = t.indexOf("\"", i + 1);
  if (e < 0) return null;
  const label = t.slice(i + 1, e);
  i = e + 1;
  const also: string[] = [];
  let k = i;
  while (k < n && isSpace(t[k])) k++;
  if (k > i && t.startsWith("also", k) && isSpace(t[k + 4])) {
    k += 4;
    while (k < n && isSpace(t[k])) k++;
    for (;;) {
      if (t[k] !== "\"") return null;
      e = t.indexOf("\"", k + 1);
      if (e < 0) return null;
      also.push(t.slice(k + 1, e));
      k = e + 1;
      let m = k;
      while (m < n && isSpace(t[m])) m++;
      if (t[m] !== ",") break;
      m++;
      while (m < n && isSpace(t[m])) m++;
      k = m;
    }
    i = k;
  }
  while (i < n && isSpace(t[i])) i++;
  if (t[i] !== ":") return null;
  i++;
  while (i < n && isSpace(t[i])) i++;
  return { id, label, also, rest: t.slice(i) };
}

/** A glossary block: one `term` line (and its indented continuation lines) per term. One pass; charges the budget for every line. */
export function parseGlossaryBlock(body: string, base: number, lim: GlossLimits, budget?: Budget): { terms: Term[]; errors: GlossError[] } {
  const terms: Term[] = [], errors: GlossError[] = [];
  const lines = body.split("\n");
  budget?.charge(lines.length + 1, 0, 0);
  let cur: { id: string; label: string; also: string[]; def: string; line: number } | null = null;
  const end = () => {
    if (!cur) return;
    const def = cur.def.trim();
    if (!def) errors.push({ line: cur.line, msg: `the term "${cur.label}" has no meaning after the colon; write the meaning after the colon` });
    else if (def.length > lim.glossaryDef) errors.push({ line: cur.line, msg: `the meaning of "${cur.label}" is at most ${lim.glossaryDef} characters; shorten it` });
    else { budget?.charge(4, 1, 0); terms.push({ ...cur, def, segs: defSegs(def, budget), from: "block" }); }
    cur = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i], line = base + i, t = raw.trim();
    budget?.charge(2 + (raw.length >> 4), 0, 0);
    if (!t || t.startsWith("//")) { if (!t) end(); continue; }
    if (isSpace(raw[0]) && cur) { if (cur.def.length <= lim.glossaryDef) cur.def += " " + t.slice(0, lim.glossaryDef + 1); continue; }
    end();
    if (terms.length >= lim.glossaryTerms) { errors.push({ line, msg: `more than ${lim.glossaryTerms} terms; split the glossary` }); break; }
    const m = termLine(t);
    if (!m) { errors.push({ line, msg: `a line is: term "UL": the meaning (or term ul "UL" also "ubiquitous language": the meaning); got "${t.slice(0, 50)}"` }); continue; }
    const label = m.label.trim();
    if (!label) { errors.push({ line, msg: `a term needs a name in the quotes` }); continue; }
    if (label.length > lim.glossaryLabel) { errors.push({ line, msg: `a term is at most ${lim.glossaryLabel} characters` }); continue; }
    if (m.rest.length > lim.glossaryDef * 2) { errors.push({ line, msg: `the meaning of "${label}" is at most ${lim.glossaryDef} characters; shorten it` }); continue; }
    const also = m.also.map((x) => x.trim()).filter(Boolean);
    const id = m.id ?? slug(label);
    if (!id || !isIdText(id)) { errors.push({ line, msg: `the id "${id}" is letters, digits, - _ . (give one: term my-id "${label}": ...)` }); continue; }
    if (also.length > lim.glossaryAliases) errors.push({ line, msg: `"${label}" has ${also.length} other names; the most is ${lim.glossaryAliases}` });
    cur = { id, label, also: also.slice(0, lim.glossaryAliases), def: m.rest, line };
  }
  end();
  return { terms, errors };
}
const isIdText = (s: string) => { for (const c of s) if (!isIdCh(c)) return false; return s.length > 0; };

/** Front matter: `glossary:` a map of term to meaning. */
export function parseGlossaryFront(fm: unknown, lim: GlossLimits, budget?: Budget): { terms: Term[]; errors: GlossError[] } {
  const terms: Term[] = [], errors: GlossError[] = [];
  const g = (fm as { glossary?: unknown } | null | undefined)?.glossary;
  if (g == null) return { terms, errors };
  if (typeof g !== "object" || Array.isArray(g)) { errors.push({ line: 1, msg: `front matter glossary: is a map, one term a line (glossary:  UL: the words a team agrees on)` }); return { terms, errors }; }
  for (const [k, v] of Object.entries(g as Record<string, unknown>)) {
    budget?.charge(4, 0, 0);
    if (terms.length >= lim.glossaryTerms) { errors.push({ line: 1, msg: `front matter glossary: more than ${lim.glossaryTerms} terms; split the glossary` }); break; }
    if (typeof v !== "string" || !v.trim()) { errors.push({ line: 1, msg: `front matter glossary: "${k.slice(0, 30)}" needs its meaning as text` }); continue; }
    if (k.length > lim.glossaryLabel) { errors.push({ line: 1, msg: `front matter glossary: a term is at most ${lim.glossaryLabel} characters` }); continue; }
    if (v.length > lim.glossaryDef * 2 || v.trim().length > lim.glossaryDef) { errors.push({ line: 1, msg: `front matter glossary: the meaning of "${k.slice(0, 30)}" is at most ${lim.glossaryDef} characters` }); continue; }
    const def = v.trim();
    terms.push({ id: slug(k) || k, label: k, also: [], def, segs: defSegs(def, budget), line: 1, from: "front" });
  }
  return { terms, errors };
}

/** A host's word list (ParseOptions.glossary): `{ term, aliases?, def }` each. Checked like the front matter, with the same caps; the first problem of an
 *  entry drops the entry. The terms are `from: "host"`, on line 1. */
export function parseGlossaryHost(host: unknown, lim: GlossLimits, budget?: Budget): { terms: Term[]; errors: GlossError[] } {
  const terms: Term[] = [], errors: GlossError[] = [];
  if (host == null) return { terms, errors };
  const bad = (msg: string) => errors.push({ line: 1, msg: `the host's glossary: ${msg}` });
  if (!Array.isArray(host)) { bad("is a list of { term, aliases, def }"); return { terms, errors }; }
  for (let i = 0; i < host.length; i++) {
    budget?.charge(4, 0, 0);
    if (terms.length >= lim.glossaryTerms) { bad(`more than ${lim.glossaryTerms} terms; the rest are not marked`); break; }
    const e = host[i] as { term?: unknown; aliases?: unknown; def?: unknown } | null;
    const at = `entry ${i + 1}`;
    if (!e || typeof e !== "object") { bad(`${at} is not { term, aliases, def }`); continue; }
    if (typeof e.term !== "string" || !e.term.trim()) { bad(`${at} needs a term as text`); continue; }
    const label = e.term.trim();
    if (label.length > lim.glossaryLabel) { bad(`a term is at most ${lim.glossaryLabel} characters (${at})`); continue; }
    if (typeof e.def !== "string" || !e.def.trim()) { bad(`"${label.slice(0, 30)}" needs its meaning as text`); continue; }
    const def = e.def.trim();
    if (def.length > lim.glossaryDef) { bad(`the meaning of "${label.slice(0, 30)}" is at most ${lim.glossaryDef} characters`); continue; }
    let also: string[] = [];
    if (e.aliases !== undefined) {
      if (!Array.isArray(e.aliases) || e.aliases.some((x) => typeof x !== "string")) { bad(`the other names of "${label.slice(0, 30)}" are a list of text`); continue; }
      also = (e.aliases as string[]).map((x) => x.trim()).filter(Boolean);
      if (also.length > lim.glossaryAliases || also.some((x) => x.length > lim.glossaryLabel)) { bad(`"${label.slice(0, 30)}" has more than ${lim.glossaryAliases} other names, or one over ${lim.glossaryLabel} characters`); continue; }
    }
    terms.push({ id: slug(label) || label, label, also, def, segs: defSegs(def, budget), line: 1, from: "host" });
  }
  return { terms, errors };
}

/** Every term of the page: front matter, then the blocks (then a host's list: a host term the page defines, by name or id, is left out: the page's wins). */
export function allTerms(front: Term[], blocks: Term[], host: Term[] = []): { terms: Term[]; dups: { term: Term; first: Term; why: string }[] } {
  const terms: Term[] = [], dups: { term: Term; first: Term; why: string }[] = [];
  const names = new Map<string, Term>(), ids = new Map<string, Term>();
  const add = (t: Term, local: boolean) => {
    const keys = [t.label, ...t.also].map((x) => x.toLowerCase());
    // a host term that meets a page term is left out without a word (the page's wins); two host terms that meet are a problem
    for (const k of keys) {
      const f = names.get(k);
      if (f) { if (local || f.from === "host") dups.push({ term: t, first: f, why: `"${k}" is already defined` }); return; }
    }
    const idf = ids.get(t.id);
    if (idf) { if (local || idf.from === "host") dups.push({ term: t, first: idf, why: `the id "${t.id}" is already used` }); return; }
    for (const k of keys) names.set(k, t);
    ids.set(t.id, t);
    terms.push(t);
  };
  for (const t of [...front, ...blocks]) add(t, true);
  for (const t of host) add({ ...t, from: "host" }, false);
  return { terms, dups };
}

// ---------------------------------------------------------------- finding the terms in a text

export interface Found { from: number; to: number; term: Term }
/** The names of the terms as an Aho-Corasick machine. Built once per page; a text is walked once, whatever the names. */
export interface Matcher { names: number; find(text: string, budget: Budget): Found[] }

const WORD_NON_ASCII = /^[\p{L}\p{N}]$/u;
/** a letter, a digit, "_" or "-": the characters a term may not touch on either side (a whole word) */
function isWordCp(cp: number): boolean {
  if (cp < 128) return (cp >= 48 && cp <= 57) || (cp >= 65 && cp <= 90) || (cp >= 97 && cp <= 122) || cp === 95 || cp === 45;
  return WORD_NON_ASCII.test(String.fromCodePoint(cp));
}
const wordBefore = (s: string, i: number): boolean => {
  if (i <= 0) return false;
  const c = s.charCodeAt(i - 1);
  if (c >= 0xdc00 && c <= 0xdfff && i >= 2) { const h = s.charCodeAt(i - 2); if (h >= 0xd800 && h <= 0xdbff) return isWordCp(s.codePointAt(i - 2)!); }
  return isWordCp(c);
};
const wordAt = (s: string, i: number): boolean => i < s.length && isWordCp(s.codePointAt(i)!);

/** Every name of every term, the first letter in either case, the rest as written; null when there is no name. */
export function matcher(terms: Term[], budget?: Budget): Matcher | null {
  const next: Map<number, number>[] = [new Map()];
  const out: number[] = [-1], depth: number[] = [0];
  const owner: Term[] = [];
  let names = 0;
  for (const t of terms) {
    for (const nm of [t.label, ...t.also]) {
      if (!nm) continue;
      const first = String.fromCodePoint(nm.codePointAt(0)!), rest = nm.slice(first.length);
      const variants = new Set([first.toLowerCase() + rest, first.toUpperCase() + rest]);
      budget?.charge(nm.length * 2 + 2, 0, 0);
      for (const v of variants) {
        let s = 0;
        for (let i = 0; i < v.length; i++) {
          const c = v.charCodeAt(i);
          let d = next[s].get(c);
          if (d === undefined) { d = next.length; next.push(new Map()); out.push(-1); depth.push(depth[s] + 1); next[s].set(c, d); }
          s = d;
        }
        if (out[s] < 0) { owner.push(t); out[s] = owner.length - 1; names++; }
      }
    }
  }
  if (!names) return null;
  const fail: number[] = new Array(next.length).fill(0), dict: number[] = new Array(next.length).fill(-1);
  budget?.charge(next.length * 2 + 1, 0, 0);
  const queue: number[] = [];
  for (const d of next[0].values()) queue.push(d);
  for (let q = 0; q < queue.length; q++) {
    const s = queue[q];
    for (const [c, d] of next[s]) {
      let f = fail[s];
      while (f && !next[f].has(c)) f = fail[f];
      fail[d] = next[f].get(c) ?? 0;
      if (fail[d] === d) fail[d] = 0;
      dict[d] = out[fail[d]] >= 0 ? fail[d] : dict[fail[d]];
      queue.push(d);
    }
  }
  return {
    names,
    find(text: string, budget: Budget): Found[] {
      const n = text.length;
      budget.charge(n, 0, 0);
      // per start, the longest name that is a whole word there (the ends are checked as a match is reported)
      let endAt: Int32Array | null = null, ownerAt: Int32Array | null = null;
      let s = 0;
      for (let i = 0; i < n; i++) {
        const c = text.charCodeAt(i);
        while (s && !next[s].has(c)) s = fail[s];
        s = next[s].get(c) ?? 0;
        let v = out[s] >= 0 ? s : dict[s];
        if (v < 0 || wordAt(text, i + 1)) continue;
        for (; v >= 0; v = dict[v]) {
          budget.charge(1, 0, 0);
          const start = i + 1 - depth[v];
          if (wordBefore(text, start)) continue;
          if (!endAt) { endAt = new Int32Array(n + 1); ownerAt = new Int32Array(n + 1); }
          if (i + 1 > endAt[start]) { endAt[start] = i + 1; ownerAt![start] = out[v]; }
        }
      }
      const found: Found[] = [];
      if (!endAt) return found;
      for (let i = 0, last = 0; i < n; i++) if (endAt[i] > 0 && i >= last) { found.push({ from: i, to: endAt[i], term: owner[ownerAt![i]] }); last = endAt[i]; }
      return found;
    },
  };
}

/** The LLM view of a glossary: the terms as a list, once. */
export const glossaryLlm = (terms: Term[]): string => `Glossary:\n${terms.map((t) => `- **${t.label}**${t.also.length ? ` (also: ${t.also.join(", ")})` : ""}: ${t.def}`).join("\n")}`;
