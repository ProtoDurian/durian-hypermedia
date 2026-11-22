// Safety: the input is untrusted (an agent or a stranger may have written it).
// Every link and image URL goes through a policy; every size has a cap, and going over a cap gives an error block, never a crash.

/** What a URL is used for. */
export type UrlKind = "link" | "image";
/** The host's hook: return the URL to use (it may rewrite it), or null to drop it (the text stays, without a link). */
export type UrlPolicy = (url: string, kind: UrlKind) => string | null;

/** The caps. A host may lower or raise any of them with parse(text, { limits: { ... } }). */
export interface Limits {
  /** the whole input, in UTF-8 bytes */
  maxInputBytes: number;
  /** blocks in the document (Markdown blocks, parts and the blocks inside containers) */
  maxBlocks: number;
  /** nesting of lists, quotes and inline marks inside Markdown */
  maxDepth: number;
  /** things on an animation's stage (entities, list values) */
  maxAnimEntities: number;
  /** steps of an animation */
  maxAnimSteps: number;
  /** characters of one animation's source */
  maxAnimChars: number;
  /** layout work of one animation (playing, laying out, routing and placing its steps), in units of about one small
   *  step of a loop; and of every animation on the page together, so a page cannot restart the spend (core/work.ts) */
  maxAnimWork: number;
  maxPageAnimWork: number;
  /** data points of one chart (all series together) */
  maxChartPoints: number;
  /** items of one tier list or alignment grid */
  maxItems: number;
  /** characters of one mermaid diagram */
  maxMermaidChars: number;
  /** steps of any stepped part (terminal, file tree, editor, code walk, mermaid) */
  maxSteps: number;
  /** work of one part's expressions (a chart's let, x and series, or one reader action on it): steps, value slots, characters of text */
  maxEvalSteps: number;
  maxEvalValues: number;
  maxEvalChars: number;
  /** the same for the whole page: every part of one parse() call draws from it, so a page cannot restart the spend */
  maxPageEvalSteps: number;
  maxPageEvalValues: number;
  maxPageEvalChars: number;
  /** aliases (`*name`) one YAML text may use, whatever the names are spelled with; checked before the YAML is parsed */
  maxYamlAliases: number;
  /** characters of one YAML text (front matter, one chart), and of all of a page's YAML texts together; checked before
   *  the YAML is parsed */
  maxYamlChars: number;
  maxPageYamlChars: number;
  /** keys and flow collections of one YAML text, and of all of a page's YAML texts together, counted from the text before
   *  it is parsed (see yamlKeyCount): a YAML parser may take time growing with the square of the keys of one map */
  maxYamlKeys: number;
  maxPageYamlKeys: number;
}
export const LIMITS: Limits = {
  maxInputBytes: 1_000_000,
  maxBlocks: 2_000,
  maxDepth: 12,
  maxAnimEntities: 300,
  maxAnimSteps: 200,
  maxAnimChars: 40_000,
  maxAnimWork: 15_000_000,
  maxPageAnimWork: 64_000_000,
  maxChartPoints: 5_000,
  maxItems: 500,
  maxMermaidChars: 20_000,
  maxSteps: 200,
  maxEvalSteps: 100_000,
  maxEvalValues: 50_000,
  maxEvalChars: 50_000,
  maxPageEvalSteps: 300_000,
  maxPageEvalValues: 400_000,
  maxPageEvalChars: 400_000,
  maxYamlAliases: 16,
  maxYamlChars: 20_000,
  maxPageYamlChars: 100_000,
  maxYamlKeys: 1_000,
  maxPageYamlKeys: 8_000,
};

// HTML character references an attacker may use to hide a scheme ("&#106;avascript:", "javascript&colon;")
const NAMED: Record<string, string> = { colon: ":", tab: "\t", newline: "\n", sol: "/", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", lpar: "(", rpar: ")", period: ".", num: "#", percnt: "%" };
export function decodeRefs(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (m, r: string) => {
    if (r[0] === "#") { const n = r[1] === "x" || r[1] === "X" ? parseInt(r.slice(2), 16) : parseInt(r.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ""; }
    return NAMED[r.toLowerCase()] ?? m;
  });
}
/** The URL's scheme in lower case ("https", "javascript"), "" for a relative URL. Control characters and spaces are
 *  ignored first, the way browsers ignore them ("java\tscript:" is javascript:). */
export function schemeOf(url: string): string {
  let s = decodeRefs(url);
  try { s = decodeURIComponent(s); } catch { /* keep it as it is */ }
  s = s.replace(/[\u{0}-\u{20}\u{7f}-\u{9f}\u{ad}\u{34f}\u{61c}\u{115f}\u{1160}\u{17b4}\u{17b5}\u{180b}-\u{180f}\u{200b}-\u{200f}\u{2028}-\u{202e}\u{2060}-\u{206f}\u{3164}\u{fe00}-\u{fe0f}\u{feff}\u{ffa0}\u{fff0}-\u{fff8}]/gu, "");
  const m = s.match(/^([a-z][a-z0-9+.-]*):/i);
  return m ? m[1].toLowerCase() : "";
}
const LINK_SCHEMES = new Set(["http", "https", "mailto"]);
const IMAGE_SCHEMES = new Set(["https"]);
/** The default policy: links to http, https, mailto, a relative path or an #anchor; images from https or a relative
 *  path. Everything else (javascript:, data:, vbscript:, file:, blob: ...) is dropped. */
export const defaultUrlPolicy: UrlPolicy = (url, kind) => {
  const u = url.trim();
  if (!u || u.length > 2048) return null;
  const sch = schemeOf(u);
  if (sch === "") return /^\s*\/\/|\\/.test(u) && kind === "image" ? null : u;   // a protocol-relative image goes to another host: no
  return (kind === "image" ? IMAGE_SCHEMES : LINK_SCHEMES).has(sch) ? u : null;
};
/** Run the host's policy, then the default rules again: a policy may rewrite a URL but never let a script URL through. */
export function applyUrlPolicy(url: string, kind: UrlKind, policy: UrlPolicy | undefined): string | null {
  const first = policy ? policy(url, kind) : defaultUrlPolicy(url, kind);
  if (first == null) return null;
  const sch = schemeOf(first);
  if (["javascript", "vbscript", "data", "file", "blob", "filesystem"].includes(sch)) return null;
  return first;
}

/** UTF-8 length without allocating the encoded bytes. */
export function utf8Bytes(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1; else if (c < 0x800) n += 2; else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; } else n += 3;
  }
  return n;
}
