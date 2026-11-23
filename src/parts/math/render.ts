// Maths (format version 11): TeX to an element tree, by KaTeX at parse time. Pure: no DOM, no React.
//
// KaTeX writes markup; a small reader takes that markup into a tree and accepts only the tags, attributes and styles KaTeX writes,
// so the page can never get anything else from it. The page runs no maths script and never sets an HTML string.
// Fonts: KaTeX's font files are under the SIL Open Font Licence, which is not on the list of licences the package may bundle (MIT,
// BSD, Apache-2.0). So KaTeX writes MathML only: the browser draws it with its own maths font, no font file and no stylesheet.
import katex from "katex";
import type { Budget } from "../../core/budget";

export interface MathNode { t: string; a?: Record<string, string>; c: (MathNode | string)[] }
export class MathError extends Error { constructor(msg: string, public pos?: number) { super(msg); } }

/** KaTeX's own caps: macro expansions and the size of one rule or space, in em (a formula may not make a page-sized box) */
export const MAX_EXPAND = 200;
export const MAX_SIZE = 20;

// commands that make links, HTML or pictures: KaTeX's `trust` stays off, and the check refuses them by name
export const MATH_BANNED = ["href", "url", "htmlClass", "htmlData", "htmlId", "htmlStyle", "includegraphics"];

/** The banned command a formula uses, by a hand scan (no pattern over author text): its name and position, or null. */
export function bannedIn(tex: string): { name: string; at: number } | null {
  for (let i = tex.indexOf("\\"); i >= 0; i = tex.indexOf("\\", i + 1)) {
    for (const name of MATH_BANNED) {
      if (!tex.startsWith(name, i + 1)) continue;
      const after = tex.charCodeAt(i + 1 + name.length);
      if (!((after >= 65 && after <= 90) || (after >= 97 && after <= 122))) return { name, at: i };
    }
    if (tex[i + 1] === "\\") i++;
  }
  return null;
}
/** `\label{...}` dropped (KaTeX has \tag but no \label: a label names nothing here), by a hand scan. */
function dropLabels(tex: string): string {
  if (!tex.includes("\\label")) return tex;
  let out = "", at = 0;
  for (let i = tex.indexOf("\\label"); i >= 0; i = tex.indexOf("\\label", at)) {
    let j = i + 6;
    while (j < tex.length && (tex[j] === " " || tex[j] === "\t" || tex[j] === "\n")) j++;
    const close = tex[j] === "{" ? tex.indexOf("}", j) : -1;
    if (close < 0 || tex.slice(j + 1, close).includes("{")) { out += tex.slice(at, i + 6); at = i + 6; continue; }
    out += tex.slice(at, i); at = close + 1;
  }
  return out + tex.slice(at);
}

// ---------- KaTeX's markup into an element tree ----------
const MATHML_TAGS = ["math", "semantics", "annotation", "mrow", "mi", "mn", "mo", "mtext", "mspace", "msup", "msub", "msubsup", "mfrac", "msqrt", "mroot", "munder", "mover", "munderover", "mtable", "mtr", "mtd", "mpadded", "mphantom", "mstyle", "menclose", "mmultiscripts", "mprescripts", "none", "merror"];
export const MATH_TAGS = new Set(["span", "svg", "path", "line", "g", "use", ...MATHML_TAGS]);
const ATTRS_OK = new Set(["class", "style", "d", "viewBox", "width", "height", "xmlns", "preserveAspectRatio", "x1", "x2", "y1", "y2", "stroke-width", "stroke", "fill", "aria-hidden", "focusable", "linebreak", "encoding", "display", "stretchy", "fence", "separator", "lspace", "rspace", "mathvariant", "mathsize", "mathcolor", "mathbackground", "scriptlevel", "displaystyle", "columnalign", "columnspacing", "rowspacing", "columnlines", "rowlines", "rowalign", "columnspan", "rowspan", "depth", "voffset", "linethickness", "accent", "accentunder", "minsize", "maxsize", "symmetric", "largeop", "movablelimits", "notation", "form", "title", "alttext"]);
const isNameChar = (c: number) => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 45 || c === 58;
const isClassChar = (c: number) => isNameChar(c) || c === 32 || c === 46;
const STYLE_PROPS = new Set(["height", "width", "top", "left", "right", "bottom", "margin-left", "margin-right", "margin-top", "margin-bottom", "vertical-align", "border-bottom-width", "border-top-width", "border-right-width", "border-left-width", "border-bottom-style", "border-top-style", "border-right-style", "border-left-style", "border-style", "border-width", "margin", "padding", "border-color", "min-width", "max-width", "color", "background-color", "font-size", "padding-left", "padding-right", "padding-top", "padding-bottom", "position", "display", "line-height", "font-family", "font-style", "font-weight"]);
const isStyleChar = (c: number) => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 45 || c === 43 || c === 35 || c === 46 || c === 44 || c === 40 || c === 41 || c === 37 || c === 32;
const allChars = (s: string, ok: (c: number) => boolean, max: number) => { if (s.length > max) return false; for (let i = 0; i < s.length; i++) if (!ok(s.charCodeAt(i))) return false; return true; };
const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
/** the character references KaTeX writes (&amp; &lt; &gt; &quot; &#...;), by a hand scan */
function unent(s: string): string {
  let at = s.indexOf("&");
  if (at < 0) return s;
  let out = "", from = 0;
  while (at >= 0) {
    const semi = s.indexOf(";", at);
    if (semi < 0 || semi - at > 10) { at = s.indexOf("&", at + 1); continue; }
    const e = s.slice(at + 1, semi);
    let ch: string | undefined = ENT[e];
    if (e[0] === "#") {
      const cp = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      ch = cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : "";
    }
    if (ch === undefined) { at = s.indexOf("&", at + 1); continue; }
    out += s.slice(from, at) + ch; from = semi + 1; at = s.indexOf("&", from);
  }
  return out + s.slice(from);
}
function okStyle(v: string): boolean {
  let at = 0;
  while (at <= v.length) {
    let semi = v.indexOf(";", at);
    if (semi < 0) semi = v.length;
    const d = v.slice(at, semi);
    at = semi + 1;
    if (!d.trim()) continue;
    const k = d.indexOf(":");
    if (k < 0) return false;
    const prop = d.slice(0, k).trim().toLowerCase(), val = d.slice(k + 1).trim();
    if (!STYLE_PROPS.has(prop) || !val || !allChars(val, isStyleChar, 80)) return false;
  }
  return true;
}

/** Reads KaTeX's markup. Accepts only the tags and attributes KaTeX writes; anything else is a MathError. */
export function readMarkup(html: string, maxNodes: number): MathNode {
  const root: MathNode = { t: "#root", c: [] };
  const stack: MathNode[] = [root];
  let nodes = 0, i = 0;
  const n = html.length;
  while (i < n) {
    const lt = html.indexOf("<", i);
    const end = lt < 0 ? n : lt;
    if (end > i) stack[stack.length - 1].c.push(unent(html.slice(i, end)));
    if (lt < 0) break;
    const gt = html.indexOf(">", lt);
    if (gt < 0) throw new MathError("maths output is cut off");
    const tag = html.slice(lt + 1, gt);
    i = gt + 1;
    if (tag[0] === "/") {
      const name = tag.slice(1).trim();
      const top = stack.pop();
      if (!top || top.t !== name || !stack.length) throw new MathError("maths output has a closing tag that does not match");
      continue;
    }
    const self = tag.endsWith("/");
    const body = self ? tag.slice(0, -1) : tag;
    let p = 0;
    while (p < body.length && isNameChar(body.charCodeAt(p))) p++;
    const name = body.slice(0, p);
    if (!name) throw new MathError("maths output has a tag it should not");
    if (!MATH_TAGS.has(name)) throw new MathError(`maths output has a <${name}> tag, which is not allowed`);
    const a: Record<string, string> = {};
    while (p < body.length) {
      if (body[p] !== " " && body[p] !== "\n" && body[p] !== "\t") throw new MathError(`maths output has an attribute it should not: ${body.slice(p, p + 30)}`);
      while (p < body.length && (body[p] === " " || body[p] === "\n" || body[p] === "\t")) p++;
      if (p >= body.length) break;
      const ks = p;
      while (p < body.length && isNameChar(body.charCodeAt(p))) p++;
      const k = body.slice(ks, p);
      if (!k) throw new MathError(`maths output has an attribute it should not: ${body.slice(p, p + 30)}`);
      let v = "";
      if (body[p] === "=") {
        if (body[p + 1] !== '"') throw new MathError(`maths output has an attribute it should not: ${body.slice(ks, ks + 30)}`);
        const q = body.indexOf('"', p + 2);
        if (q < 0) throw new MathError("maths output is cut off");
        v = unent(body.slice(p + 2, q)); p = q + 1;
      }
      if (!ATTRS_OK.has(k)) throw new MathError(`maths output has an attribute "${k}", which is not allowed`);
      if (k === "class" && !allChars(v, isClassChar, 200)) throw new MathError("maths output has a class name it should not");
      if (k === "style" && !okStyle(v)) throw new MathError("maths output has a style it should not");
      a[k] = v;
    }
    if (++nodes > maxNodes) throw new MathError("a formula that makes too large an output");
    const node: MathNode = { t: name, c: [] };
    if (Object.keys(a).length) node.a = a;
    stack[stack.length - 1].c.push(node);
    if (!self) stack.push(node);
  }
  if (stack.length !== 1) throw new MathError("maths output is cut off");
  const kids = root.c.filter((x) => typeof x !== "string" || x.trim());
  if (kids.length !== 1 || typeof kids[0] === "string") throw new MathError("maths output is not one element");
  return kids[0];
}

// ---------- plain letters for the MathML mode ----------
// KaTeX's MathML writes italic and bold letters as the Unicode "mathematical alphanumeric" characters (U+1D400 and up). A machine
// without a maths font draws those as empty boxes, and MathML's own automatic italics use the same characters. So in "mathml" mode
// they are put back to plain letters (Latin and Greek), with a class that says italic or bold; the stylesheet sets the style.
function plainLetter(cp: number): { ch: string; cls: string } | null {
  const R = (lo: number, n: number, base: number, cls: string) => (cp >= lo && cp < lo + n ? { ch: String.fromCodePoint(base + cp - lo), cls } : null);
  if (cp === 0x210e) return { ch: "h", cls: "math-it" };
  const greekCap = (lo: number, cls: string) => { if (cp < lo || cp > lo + 24) return null; const i = cp - lo; return { ch: String.fromCodePoint(i === 17 ? 0x3f4 : i < 17 ? 0x391 + i : 0x3a3 + i - 18), cls }; };
  const variants: Record<number, number> = { 0x1d715: 0x2202, 0x1d716: 0x3f5, 0x1d717: 0x3d1, 0x1d718: 0x3f0, 0x1d719: 0x3d5, 0x1d71a: 0x3f1, 0x1d71b: 0x3d6 };
  if (variants[cp]) return { ch: String.fromCodePoint(variants[cp]), cls: "math-it" };
  return R(0x1d434, 26, 65, "math-it") ?? R(0x1d44e, 26, 97, "math-it") ?? greekCap(0x1d6e2, "math-it") ?? R(0x1d6fc, 25, 0x3b1, "math-it")
    ?? R(0x1d400, 26, 65, "math-bf") ?? R(0x1d41a, 26, 97, "math-bf") ?? R(0x1d468, 26, 65, "math-bf math-it") ?? R(0x1d482, 26, 97, "math-bf math-it") ?? R(0x1d7ce, 10, 48, "math-bf");
}
function plainLetters(n: MathNode | string): void {
  if (typeof n === "string") return;
  if (n.t === "mi" || n.t === "mn" || n.t === "mtext" || n.t === "mo") {
    const cls = new Set<string>();
    n.c = n.c.map((x) => {
      if (typeof x !== "string") return x;
      let out = "";
      for (const ch of x) { const m = plainLetter(ch.codePointAt(0)!); if (m) { out += m.ch; m.cls.split(" ").forEach((c) => cls.add(c)); } else out += ch; }
      return out;
    });
    // MathML italicizes a one-letter <mi> by itself; it is done here with a class instead (mathvariant bold and italic likewise)
    const mv = n.a?.mathvariant;
    const one = n.t === "mi" && n.c.length === 1 && typeof n.c[0] === "string" && [...(n.c[0] as string)].length === 1;
    if (n.t === "mi" && one && !mv && !cls.size) cls.add("math-it");
    if (mv === "bold" || mv === "bold-italic") cls.add("math-bf");
    if (mv === "italic" || mv === "bold-italic") cls.add("math-it");
    if (cls.size) { const a = { ...(n.a ?? {}) }; if (mv === "bold" || mv === "bold-italic" || mv === "italic") delete a.mathvariant; a.class = [...(a.class ? [a.class] : []), ...cls].join(" "); n.a = a; }
    return;
  }
  for (const c of n.c) plainLetters(c);
}

// the same formula twice on a page is drawn once (and charged once); the cache is per process and bounded
const cache = new Map<string, MathNode>();

/**
 * TeX into an element tree. Throws MathError (KaTeX cannot read it, or it asks for a link or HTML) or BudgetError (too much work for
 * the page). `maxChars` and `maxNodes` are the caps of this parse (LIMITS, UNTRUSTED_LIMITS or the host's own).
 */
export function renderMath(tex: string, display: boolean, caps: { chars: number; nodes: number }, budget: Budget): MathNode {
  if (tex.length > caps.chars) throw new MathError(`a formula of ${tex.length} characters; the most is ${caps.chars}`);
  if (!tex.trim()) throw new MathError("an empty formula");
  const key = `${display ? "B" : "I"}${tex}`;
  const hit = cache.get(key);
  if (hit) return hit;
  tex = dropLabels(tex);
  const bad = bannedIn(tex);
  if (bad) throw new MathError(`\\${bad.name} makes a link or HTML, which a formula may not (links go in the text around it)`, bad.at);
  // work first: the input's size times a fixed factor; KaTeX's own expansion is capped by maxExpand below
  budget.charge(40 + tex.length * 12);
  let html: string;
  try {
    html = katex.renderToString(tex, { displayMode: display, output: "mathml", throwOnError: true, trust: false, strict: "ignore", maxExpand: MAX_EXPAND, maxSize: MAX_SIZE, minRuleThickness: 0.04 });
  } catch (e) {
    if (e instanceof RangeError) throw new MathError("a formula nested too deeply");
    const err = e as { message?: unknown; position?: unknown };
    throw new MathError(cleanMessage(String(err?.message ?? e)), typeof err?.position === "number" ? err.position : undefined);
  }
  budget.charge(html.length / 8, 0, html.length);
  const tree = readMarkup(html, caps.nodes);
  plainLetters(tree);
  cache.set(key, tree);
  if (cache.size > 2000) cache.delete(cache.keys().next().value as string);
  return tree;
}
/** KaTeX's message without its prefix, the underline mark and the context it prints after "at position N:" */
function cleanMessage(m: string): string {
  if (m.startsWith("KaTeX parse error:")) m = m.slice(18).trim();
  m = m.split("̲").join("");
  const k = m.indexOf(" at position ");
  if (k >= 0) { const colon = m.indexOf(":", k); if (colon >= 0) m = m.slice(0, colon); }
  return m;
}

/** The TeX of a tree made from `renderMath` (its annotation), for the plain text a reader copies. */
export function mathSource(n: MathNode): string {
  const find = (x: MathNode | string): string | null => { if (typeof x === "string") return null; if (x.t === "annotation") return x.c.filter((y) => typeof y === "string").join(""); for (const k of x.c) { const r = find(k); if (r != null) return r; } return null; };
  return find(n) ?? "";
}
