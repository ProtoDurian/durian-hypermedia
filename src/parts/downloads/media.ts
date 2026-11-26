// Shared by the media parts (format version 11: downloads, gallery, audio, video, lottie, pdf). Pure: no DOM, no React, no
// node modules, and no regular expression that can backtrack over author text (hand scans only). It lives in the first of
// the six folders; the other five import it from here.
//
// The URL rule here is the structural one (what no address may ever be). The host's own `urlPolicy` is applied by each
// view (applyUrlPolicy), because a part's parse() does not receive the policy.
import type { Budget } from "../../core/budget";
import { claimedWhileParsing } from "../../media-loader";
import { COLOUR_WORDS, isSpace, type Err } from "../kit/text";

export type { Err };

// ---------- words ----------
export const TONES = COLOUR_WORDS;
export const AUDIO_EXT = ["mp3", "m4a", "aac", "wav", "ogg", "oga", "opus", "weba", "flac"];
export const VIDEO_EXT = ["mp4", "m4v", "webm", "ogv", "mov"];
export const IMAGE_EXT = ["png", "jpg", "jpeg", "gif", "webp", "avif", "svg"];
export const HEIGHTS = ["s", "m", "l"];
export const FILE_ICONS = ["document", "sheet", "archive", "image", "audio", "video", "code", "text", "other"];
const ICON_BY_EXT: Record<string, string> = {
  pdf: "document", doc: "document", docx: "document", odt: "document", rtf: "document", epub: "document", ppt: "document", pptx: "document", key: "document",
  csv: "sheet", xls: "sheet", xlsx: "sheet", ods: "sheet", tsv: "sheet",
  zip: "archive", gz: "archive", tgz: "archive", tar: "archive", xz: "archive", bz2: "archive", "7z": "archive", rar: "archive", dmg: "archive", deb: "archive", rpm: "archive",
  png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", svg: "image", avif: "image",
  mp3: "audio", m4a: "audio", wav: "audio", ogg: "audio", opus: "audio", flac: "audio", aac: "audio",
  mp4: "video", webm: "video", mov: "video", m4v: "video", ogv: "video",
  ts: "code", tsx: "code", js: "code", mjs: "code", py: "code", rs: "code", go: "code", cs: "code", sh: "code", json: "code", yaml: "code", yml: "code", toml: "code", html: "code", css: "code",
  txt: "text", md: "text", log: "text",
};

// ---------- hand scans ----------
export const isDigit = (c: string) => c >= "0" && c <= "9";
/** the string is only digits, and between min and max of them */
export function digitsOnly(s: string, min = 1, max = Infinity): boolean {
  if (s.length < min || s.length > max) return false;
  for (let i = 0; i < s.length; i++) if (!isDigit(s[i])) return false;
  return true;
}
/** the string is hex digits only (lower or upper case) */
export function isHex(s: string): boolean {
  for (let i = 0; i < s.length; i++) { const c = s[i]; if (!(isDigit(c) || (c >= "a" && c <= "f") || (c >= "A" && c <= "F"))) return false; }
  return s.length > 0;
}
/** a decimal number as written: digits, and an optional "." with digits ("2.4", not "-1", not ".5") */
export function isDecimal(s: string): boolean {
  const dot = s.indexOf(".");
  return dot < 0 ? digitsOnly(s) : digitsOnly(s.slice(0, dot)) && digitsOnly(s.slice(dot + 1));
}
/** the first word of a trimmed line (up to the first white space) and the rest, trimmed */
export function firstWord(s: string): [string, string] {
  let i = 0;
  while (i < s.length && !isSpace(s[i])) i++;
  return [s.slice(0, i), s.slice(i).trim()];
}
/** the line starts with `head` (a word ending in a colon, any case): the rest, trimmed; else null */
export function afterColon(t: string, head: string): string | null {
  return t.length >= head.length && t.slice(0, head.length).toLowerCase() === head ? t.slice(head.length).trim() : null;
}
/** a letter or digit of a key name */
const isWordChar = (c: string) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || isDigit(c);

// ---------- file names ----------
/** the part of an address before its ? or # */
export function pathOf(url: string): string {
  let e = 0;
  while (e < url.length && url[e] !== "?" && url[e] !== "#") e++;
  return url.slice(0, e);
}
/** the lower case extension of an address ("" when the last name has no dot, or the extension is not letters and digits) */
export function extOf(url: string): string {
  const p = pathOf(url);
  const slash = p.lastIndexOf("/"), dot = p.lastIndexOf(".");
  if (dot < 0 || dot < slash || dot === p.length - 1) return "";
  const e = p.slice(dot + 1);
  for (let i = 0; i < e.length; i++) if (!isWordChar(e[i])) return "";
  return e.toLowerCase();
}
export const iconOf = (url: string) => ICON_BY_EXT[extOf(url)] ?? "other";
export function nameOf(url: string): string {
  const p = pathOf(url);
  const n = p.slice(p.lastIndexOf("/") + 1) || url;
  try { return decodeURIComponent(n); } catch { return n; }
}

// ---------- the URL rule ----------
/** Why an address may never be used, or null. A relative path, an absolute path and http(s) pass; no space or control
 *  character, no backslash, no protocol-relative `//`, and no other scheme (data:, blob:, javascript:, file: ...). */
export function urlRefusal(url: string): string | null {
  const u = url.trim();
  if (!u) return "it is empty";
  for (let i = 0; i < url.length; i++) { const c = url.charCodeAt(i); if (c <= 0x20 || c === 0x7f || c === 0x5c || (c >= 0x80 && c <= 0x9f) || c === 0x2028 || c === 0x2029 || isSpace(url[i])) return "it has a space or a control character"; }
  if (u.startsWith("//")) return "it is protocol-relative; write https://";
  const sch = schemeWord(u);
  if (sch && sch !== "http" && sch !== "https" && !claimedWhileParsing(u)) return `${sch}: URLs are not allowed (only http, https or a path)`;
  return null;
}
/** the lower case scheme of an address ("" for a path): letters first, then letters, digits, + . -, then a colon */
export function schemeWord(u: string): string {
  const c0 = u[0];
  if (!c0 || !((c0 >= "a" && c0 <= "z") || (c0 >= "A" && c0 <= "Z"))) return "";
  for (let i = 1; i < u.length; i++) {
    const c = u[i];
    if (c === ":") return u.slice(0, i).toLowerCase();
    if (!(isWordChar(c) || c === "+" || c === "." || c === "-")) return "";
  }
  return "";
}

// ---------- times ----------
/** `m:ss` or `h:mm:ss` (a fraction of a second is allowed) to seconds; null when it is not a media time */
export function parseTime(s: string): number | null {
  const parts = s.trim().split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  let sec = parts[parts.length - 1], frac = "";
  const dot = sec.indexOf(".");
  if (dot >= 0) { frac = sec.slice(dot + 1); sec = sec.slice(0, dot); if (!digitsOnly(frac, 1, 3)) return null; }
  if (!digitsOnly(sec, 2, 2) || +sec > 59) return null;
  const mm = parts[parts.length - 2];
  if (!digitsOnly(mm, 1, 3)) return null;
  let h = 0;
  if (parts.length === 3) { if (!digitsOnly(parts[0])) return null; h = +parts[0]; if (+mm > 59) return null; }
  return h * 3600 + +mm * 60 + +sec + (frac ? +("0." + frac) : 0);
}
/** the word is a time as a transcript or chapter line writes it: m:ss or h:mm:ss (one or two digits first) */
export function isTimeWord(w: string): boolean {
  const p = w.split(":");
  if (p.length < 2 || p.length > 3) return false;
  return digitsOnly(p[0], 1, 2) && digitsOnly(p[1], 2, 2) && (p.length < 3 || digitsOnly(p[2], 2, 2));
}
export function fmtTime(sec: number, forceHours = false): string {
  const t = Math.max(0, Math.floor(sec + 1e-6));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h || forceHours ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/** the body's lines, trimmed, with blank lines and // comments dropped. Charges a step and a value a line, and a step
 *  for each 16 characters (every loop over author text pays first). These parts take no steps: `@step` is just a line. */
export function bodyLines(body: string, baseLine: number, budget: Budget): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = [];
  let line = baseLine;
  for (let from = 0; from <= body.length; line++) {
    let to = body.indexOf("\n", from);
    if (to < 0) to = body.length;
    const raw = body.slice(from, to);
    from = to + 1;
    budget.charge(1 + (raw.length >> 4), 1);
    const t = raw.trim();
    if (t && !t.startsWith("//")) out.push({ text: t, line });
    if (to === body.length) break;
  }
  return out;
}
export function unknownKeys(attrs: Record<string, string>, known: string[], part: string, line: number, errors: Err[]): void {
  for (const k of Object.keys(attrs)) if (!known.includes(k)) errors.push({ line, msg: `${part}: unknown option "${k}" (options: ${known.filter((x) => x !== "llm").join(", ")})` });
}
export const flag = (a: Record<string, string>, k: string) => a[k] === "true" || a[k] === "on" || a[k] === "yes";
export function onOff(a: Record<string, string>, k: string, dflt: boolean, part: string, line: number, errors: Err[]): boolean {
  if (a[k] === undefined) return dflt;
  if (a[k] === "on" || a[k] === "true") return true;
  if (a[k] === "off" || a[k] === "false") return false;
  errors.push({ line, msg: `${part}: ${k}= is on or off, not "${a[k]}"` });
  return dflt;
}
/** check a `src` (a file of one of these kinds): the address rule, then the extension. Returns the address as written. */
export function checkSrc(url: string | undefined, exts: string[], part: string, what: string, line: number, errors: Err[], extra: string[] = []): string {
  if (!url) { errors.push({ line, msg: `${part}: no src; write src="media/file.${exts[0]}"` }); return ""; }
  const why = urlRefusal(url);
  if (why) { errors.push({ line, msg: `${part}: src "${url}" is not allowed: ${why}` }); return url; }
  const e = extOf(url);
  if (!exts.includes(e) && !extra.includes(e)) errors.push({ line, msg: `${part}: src "${url}" is not ${what} (${[...exts, ...extra].join(", ")})` });
  return url;
}
export function tone(v: string | undefined, part: string, what: string, line: number, errors: Err[], dflt = "acc"): string {
  if (v === undefined) return dflt;
  if (!TONES.includes(v)) { errors.push({ line, msg: `${part}: ${what}"${v}" is not a colour word (${TONES.join(", ")})` }); return dflt; }
  return v;
}
export const titleOf = (spec: { title: string; src?: string }) => spec.title || (spec.src ? nameOf(spec.src) : "");
