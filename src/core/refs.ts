// References (format version 11): `[[<type>:<name> "label"]]` stands for a part the host keeps. The package never
// fetches it: the host's resolveReference({ type, name }) answers pending, ready (the part's source) or failed.
//   - on a paragraph of its own it is a block; inside a sentence it is a chip; inside code it is text
//   - interactive and svg exist only as references: their code never sits in the page
//   - a name is letters, digits, ".", "-" and "_", at most 128 characters: never a path, a scheme or a URL
//
// Work: the Markdown reader tries scanRef at every "[[" it meets, once. The scan reads forward only, stops at a line end,
// at the next "[[" and after a fixed number of characters, so the work of one start is bounded and the starts together
// read each character a small constant number of times. No regular expression reads author text here.
import { PARTS, ALIASES } from "./dh-lib";

/** Types that exist only as references: their source (HTML, CSS, script, raw SVG) never sits in the page. */
export const REFERENCE_ONLY = ["interactive", "svg"] as const;
/** The longest name a reference may have. */
export const REF_NAME_MAX = 128;
/** The longest type word and label the scanner reads (longer is not a reference, or a refused one). */
export const REF_TYPE_MAX = 32;
export const REF_LABEL_MAX = 200;
// how far one start reads at most: "[[", the type, ":", twice the longest name, the label in quotes, spaces, "]]"
const WINDOW = 2 + REF_TYPE_MAX + 1 + 2 * REF_NAME_MAX + REF_LABEL_MAX + 2 + 16 + 2;

/** Whether a type word names a part a reference may stand for: a fenced part of the format (or a host block, which
 *  parse() adds to the format's list while it runs), or a reference-only type. */
export function isReferenceType(type: string): boolean {
  if ((REFERENCE_ONLY as readonly string[]).includes(type)) return true;
  const t = ALIASES[type] ?? type;
  return Object.prototype.hasOwnProperty.call(PARTS, t) && PARTS[t].form === "fenced";
}

export interface RefScan {
  /** the index just after the closing "]]" */
  end: number;
  type: string;
  name: string;
  /** the label as written between the quotes, or null */
  label: string | null;
  /** why the reference is refused (a bad name, a bad label), or null */
  bad: string | null;
}

const isLower = (c: number) => c >= 0x61 && c <= 0x7a;
const isDigit = (c: number) => c >= 0x30 && c <= 0x39;
const isUpper = (c: number) => c >= 0x41 && c <= 0x5a;
const isSp = (c: number) => c === 0x20 || c === 0x09;

/**
 * Read a reference that starts at `pos` ("[[" there), reading no further than `max`. null: this is not a reference
 * (the text stays text). A reference with a known type but a bad name or label comes back with `bad` set.
 */
export function scanRef(src: string, pos: number, max: number, known: (type: string) => boolean = isReferenceType): RefScan | null {
  if (src.charCodeAt(pos) !== 0x5b || src.charCodeAt(pos + 1) !== 0x5b) return null;
  const stop = Math.min(max, pos + WINDOW);
  let i = pos + 2;
  // the type: a lower case letter, then lower case letters, digits and dashes
  if (i >= stop || !isLower(src.charCodeAt(i))) return null;
  const t0 = i;
  while (i < stop && i - t0 < REF_TYPE_MAX + 1) { const c = src.charCodeAt(i); if (isLower(c) || isDigit(c) || c === 0x2d) i++; else break; }
  if (i - t0 > REF_TYPE_MAX || src.charCodeAt(i) !== 0x3a) return null;
  const type = src.slice(t0, i);
  if (!known(type)) return null;
  i++;
  // the name: everything up to a space, a quote, "]" or the line end (what it may hold is judged after)
  const n0 = i;
  while (i < stop) {
    const c = src.charCodeAt(i);
    if (isSp(c) || c === 0x22 || c === 0x5d || c === 0x0a || c === 0x0d || (c === 0x5b && src.charCodeAt(i + 1) === 0x5b)) break;
    i++;
  }
  const name = src.slice(n0, i);
  let bad: string | null = nameProblem(name);
  let label: string | null = null;
  let j = i;
  while (j < stop && isSp(src.charCodeAt(j))) j++;
  if (src.charCodeAt(j) === 0x22) {
    // the label: up to the next quote on the same line
    const l0 = j + 1;
    let k = l0;
    while (k < stop && k - l0 <= REF_LABEL_MAX) { const c = src.charCodeAt(k); if (c === 0x22 || c === 0x0a || c === 0x0d) break; k++; }
    if (src.charCodeAt(k) === 0x22 && k - l0 <= REF_LABEL_MAX) {
      label = src.slice(l0, k);
      j = k + 1;
      while (j < stop && isSp(src.charCodeAt(j))) j++;
    } else {
      bad ??= k - l0 > REF_LABEL_MAX ? `the label is longer than ${REF_LABEL_MAX} characters; write a shorter one` : "the label has no closing quote; write the label in double quotes on one line";
      return closeAfter(src, j, stop, type, name, null, bad);
    }
  }
  if (src.charCodeAt(j) === 0x5d && src.charCodeAt(j + 1) === 0x5d && j + 2 <= max) return { end: j + 2, type, name, label: label === "" ? null : label, bad };
  bad ??= `after the name comes only a label in double quotes, then "]]": [[${type}:${name.slice(0, 40) || "name"} "label"]]`;
  return closeAfter(src, j, stop, type, name, label, bad);
}
// a reference that went wrong inside: it ends at the next "]]" on the line, if one is near (else it is not a reference)
function closeAfter(src: string, from: number, stop: number, type: string, name: string, label: string | null, bad: string): RefScan | null {
  for (let k = from; k + 1 < stop; k++) {
    const c = src.charCodeAt(k);
    if (c === 0x0a || c === 0x0d) return null;
    if (c === 0x5b && src.charCodeAt(k + 1) === 0x5b) return null;
    if (c === 0x5d && src.charCodeAt(k + 1) === 0x5d) return { end: k + 2, type, name, label, bad };
  }
  return null;
}

const NAME_HINT = `a name is letters, digits, ".", "-" and "_" (at most ${REF_NAME_MAX}), and the host finds the part by it`;
/** Why a reference name is refused, with the fix, or null when it is a good name. One pass over the name. */
export function nameProblem(name: string): string | null {
  if (!name) return `the name is empty; ${NAME_HINT}`;
  if (name.length > REF_NAME_MAX) return `the name is ${name.length > 2 * REF_NAME_MAX ? "more than " + 2 * REF_NAME_MAX : name.length} characters; at most ${REF_NAME_MAX}`;
  let colon = -1, slash = false, other = -1, dots = false;
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    if (isLower(c) || isUpper(c) || isDigit(c) || c === 0x2d || c === 0x5f) continue;
    if (c === 0x2e) { if (i === 0 || name.charCodeAt(i - 1) === 0x2e) dots = true; continue; }
    if (c === 0x3a) { if (colon < 0) colon = i; continue; }
    if (c === 0x2f || c === 0x5c) { slash = true; continue; }
    if (other < 0) other = i;
  }
  const low = name.toLowerCase();
  if (low.startsWith("//") || low.startsWith("www.") || (colon > 0 && name.startsWith("//", colon + 1))) return `the name is a URL; the package never fetches: store the part with the host and give it a name (${NAME_HINT})`;
  if (colon >= 0) return `the name has a scheme ("${name.slice(0, Math.min(colon + 1, 20))}"); ${NAME_HINT}`;
  if (slash || dots) return `the name is a path; ${NAME_HINT}`;
  if (other >= 0) return `the name holds "${String.fromCodePoint(name.codePointAt(other)!)}"; ${NAME_HINT}`;
  return null;
}

/** A reference as the source writes it (what the LLM view keeps). */
export function refText(type: string, name: string, label: string | null): string {
  return `[[${type}:${name}${label != null ? ` "${label}"` : ""}]]`;
}

/** The markdown-it inline rule: a reference where one starts, as a "dh-reference" token. */
export function referenceRule(state: any, silent: boolean): boolean {
  // silent is markdown-it's look ahead for the end of a link's text: a token there that starts at "[" makes it give up the
  // link (it takes it for a link inside a link), so the brackets are left to it as text; the chip is made when the link's
  // text is read for real
  if (silent) return false;
  const src: string = state.src, pos: number = state.pos;
  if (src.charCodeAt(pos) !== 0x5b || src.charCodeAt(pos + 1) !== 0x5b) return false;
  const r = scanRef(src, pos, state.posMax);
  if (!r) return false;
  const t = state.push("dh-reference", "", 0);
  t.content = src.slice(pos, r.end);
  t.markup = t.content;
  t.meta = { type: r.type, name: r.name, label: r.label, bad: r.bad };
  state.pos = r.end;
  return true;
}
