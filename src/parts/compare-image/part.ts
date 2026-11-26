// The compare-image part (format version 11): two images and a slider between them. Pure.
//
//   ```compare-image title="The editor" before="Light" after="Dark" start=50 direction=horizontal
//   before: images/editor-light.png "The editor in the light theme"
//   after: images/editor-dark.png "The editor in the dark theme"
//   ```
//
// Each image line is `<role>: <address> "<alt text>"`; the alt text is required (it is the LLM view and what a screen
// reader says). The address goes through a URL policy here (a relative path, http or https, an image file; never data:,
// blob: or javascript:) and again through the host's own policy when the view draws it. Hand scans only.
import { definePart } from "../types";
import { isSpace, type Err } from "../kit/text";
import { claimedWhileParsing } from "../../media-loader";
import type { Budget } from "../../core/budget";

export const CI_KEYS = ["id", "title", "before", "after", "start", "direction", "ratio", "fit", "llm", "static"];
export const IMAGE_EXT = ["png", "jpg", "jpeg", "webp", "gif", "avif", "svg"];
export interface Img { src: string; alt: string }
export interface CompareImage { before: Img; after: Img; beforeLabel: string; afterLabel: string; start: number; vertical: boolean; ratio: string; fit: "cover" | "contain" }
export interface CompareImageData { title: string; ci: CompareImage | null; errors: Err[] }
export interface Lim { compareImageAlt: number; compareImageLabel: number; compareImageUrl: number }

const isDigit = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9";
const allDigits = (s: string) => { if (!s) return false; for (const c of s) if (!isDigit(c)) return false; return true; };

/** The scheme of an address ("https", "data"), "" for a relative path: letters, digits, + . - then a colon. */
function schemeOf(url: string): string {
  if (!((url[0] >= "a" && url[0] <= "z") || (url[0] >= "A" && url[0] <= "Z"))) return "";
  for (let i = 1; i < url.length; i++) {
    const c = url[i];
    if (c === ":") return url.slice(0, i);
    if (!((c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || isDigit(c) || c === "+" || c === "." || c === "-")) return "";
  }
  return "";
}

/** The part's URL policy: a relative path, http or https, to an image file. Null when the address is fine. */
export function imageUrlProblem(url: string, maxLen = 500): string | null {
  if (!url) return "the image has no address";
  if (url.length > maxLen) return `the address is over ${maxLen} characters`;
  const scheme = schemeOf(url);
  if (scheme && scheme.toLowerCase() !== "http" && scheme.toLowerCase() !== "https" && !claimedWhileParsing(url)) return `the address starts with "${scheme.slice(0, 20)}:", which a host never loads here (a relative path, http or https only)`;
  if (url.startsWith("//")) return "an address that starts with // is not a path or an http(s) address";
  if (url.includes("\\")) return "an address with a backslash is not a path or an http(s) address; use /";
  const cut = (() => { let i = 0; while (i < url.length && url[i] !== "?" && url[i] !== "#") i++; return i; })();
  const path = url.slice(0, cut);
  for (let from = 0; from <= path.length;) {
    let to = path.indexOf("/", from);
    if (to < 0) to = path.length;
    if (to - from === 2 && path[from] === "." && path[from + 1] === ".") return "an address with .. in it leaves the folder";
    from = to + 1;
  }
  const dot = path.lastIndexOf("."), ext = (dot >= 0 ? path.slice(dot + 1) : path).toLowerCase();
  if (!IMAGE_EXT.includes(ext)) return `"${path.slice(path.lastIndexOf("/") + 1).slice(0, 60)}" is not an image file (${IMAGE_EXT.join(", ")})`;
  return null;
}

/** One image line: `before: <address> "alt text"`. `noAlt` when only the address is there; null when it is not an image line. */
export function imageLine(t: string): { role: "before" | "after"; src: string; alt: string } | { role: "before" | "after"; src: string; noAlt: true } | null {
  const role = t.startsWith("before") ? "before" : t.startsWith("after") ? "after" : null;
  if (!role) return null;
  let i = role.length;
  while (isSpace(t[i])) i++;
  if (t[i] !== ":") return null;
  i++;
  while (isSpace(t[i])) i++;
  const a = i;
  while (i < t.length && !isSpace(t[i])) i++;
  const src = t.slice(a, i);
  if (!src) return null;
  while (isSpace(t[i])) i++;
  if (i >= t.length) return { role, src, noAlt: true };
  if (t[i] !== '"') return null;
  i++;
  let alt = "";
  for (;;) {
    if (i >= t.length) return null;
    const c = t[i];
    if (c === "\\" && i + 1 < t.length) { const n = t[i + 1]; alt += n === '"' || n === "\\" ? n : c + n; i += 2; continue; }
    if (c === '"') break;
    alt += c; i++;
  }
  i++;
  while (isSpace(t[i])) i++;
  return i >= t.length ? { role, src, alt } : null;
}

export function parseCompareImage(body: string, bodyLine: number, line: number, attrs: Record<string, string>, lim: Lim, budget?: Budget): CompareImageData {
  const errors: Err[] = [];
  const title = attrs.title ?? "";
  for (const k of Object.keys(attrs)) if (!CI_KEYS.includes(k)) errors.push({ line, msg: `unknown key "${k.slice(0, 40)}" (keys: ${CI_KEYS.filter((x) => x !== "id").join(", ")})` });
  const got: Partial<Record<"before" | "after", Img>> = {};
  let at = bodyLine;
  for (let from = 0; from <= body.length; at++) {
    let to = body.indexOf("\n", from);
    if (to < 0) to = body.length;
    const raw = body.slice(from, to);
    from = to + 1;
    budget?.charge(1 + (raw.length >> 4), 0, 0);
    const t = raw.trim();
    if (t && !t.startsWith("//")) {
      const m = imageLine(t);
      if (!m) errors.push({ line: at, msg: `a line is: before: <address> "alt text" or after: <address> "alt text"; got "${t.slice(0, 40)}"` });
      else if ("noAlt" in m) errors.push({ line: at, msg: `${m.role}: needs the alt text in double quotes after the address (${m.role}: ${m.src.slice(0, 60)} "what the picture shows")` });
      else if (got[m.role]) errors.push({ line: at, msg: `${m.role}: is given twice; a comparison has one before and one after image` });
      else {
        budget?.charge(1, 1, m.alt.length + m.src.length);
        const p = imageUrlProblem(m.src, lim.compareImageUrl);
        if (p) errors.push({ line: at, msg: `${m.role}: ${p}` });
        if (!m.alt.trim()) errors.push({ line: at, msg: `${m.role}: the alt text is empty; say what the picture shows` });
        if (m.alt.length > lim.compareImageAlt) errors.push({ line: at, msg: `${m.role}: the alt text is at most ${lim.compareImageAlt} characters` });
        got[m.role] = { src: m.src, alt: m.alt };
      }
    }
    if (to === body.length) break;
  }
  for (const k of ["before", "after"] as const) if (!got[k]) errors.push({ line: bodyLine, msg: `compare-image needs a "${k}: <address> \\"alt text\\"" line` });
  const lab = (k: "before" | "after", d: string) => { const v = attrs[k] ?? d; if (!v.trim() || v.length > lim.compareImageLabel) errors.push({ line, msg: `${k}= is a label of 1 to ${lim.compareImageLabel} characters` }); return v; };
  const beforeLabel = lab("before", "Before"), afterLabel = lab("after", "After");
  let start = 50;
  if (attrs.start !== undefined) { if (!allDigits(attrs.start) || attrs.start.length > 3 || +attrs.start > 100) errors.push({ line, msg: `start= is a percentage from 0 to 100 (start=50)` }); else start = +attrs.start; }
  if (attrs.direction && !["horizontal", "vertical"].includes(attrs.direction)) errors.push({ line, msg: `direction= is horizontal (a bar you drag left and right) or vertical (up and down)` });
  if (attrs.ratio) { const c = attrs.ratio.indexOf(":"), w = attrs.ratio.slice(0, c), h = attrs.ratio.slice(c + 1); if (c < 0 || !allDigits(w) || !allDigits(h) || w.length > 2 || h.length > 2) errors.push({ line, msg: `ratio= is width:height (ratio=16:9)` }); }
  if (attrs.fit && !["cover", "contain"].includes(attrs.fit)) errors.push({ line, msg: `fit= is cover or contain` });
  if (errors.length || !got.before || !got.after) return { title, ci: null, errors };
  return { title, ci: { before: got.before, after: got.after, beforeLabel, afterLabel, start, vertical: attrs.direction === "vertical", ratio: attrs.ratio ?? "", fit: attrs.fit === "contain" ? "contain" : "cover" }, errors };
}

/** The LLM view: the two labels and the two alt texts. A body that did not read stays a code block as written. */
export function compareImageLlm(d: CompareImageData, body: string): string {
  const c = d.ci;
  if (!c || d.errors.length) return "```compare-image\n" + body.replace(/\n+$/, "") + "\n```";
  return `${d.title ? `${d.title}: ` : ""}${c.beforeLabel} and ${c.afterLabel}\n- ${c.beforeLabel}: ${c.before.alt}\n- ${c.afterLabel}: ${c.after.alt}`;
}

export default definePart<CompareImageData>({
  name: "compare-image",
  form: "fenced",
  steps: false,
  llmKind: "own",
  parse: (input, ctx) => parseCompareImage(input.body, input.bodyLine, input.line, input.attrs, ctx.limits, ctx.budget),
  llm: (d, input) => compareImageLlm(d, input.body),
  check: (d) => d.errors.map((e) => ({ line: e.line, message: e.msg })),
});
