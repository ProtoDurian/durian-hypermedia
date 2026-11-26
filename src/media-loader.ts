// The host media loader (v0.8.0): the types, and the pure rules that decide what a loader may be asked and what it may return.
// No DOM, no React: parse() reads the claimed prefixes through here too (a part's parse accepts `media:x.mp4` only when the host claims `media:`).
//
// A host passes `loadMedia` (and, to take a scheme or a path form its urlPolicy would refuse, `mediaPrefixes`) to <Document>.
// Every media part asks it before it loads bytes or sets a source. See ADOPT.md "The host media loader" and SECURITY.md.
import { applyUrlPolicy, schemeOf, type UrlPolicy } from "./safety";

/** What the part is loading: an image (also a poster), a video or audio file, a PDF, a Lottie file, or a text file (captions, peaks, transcripts, thumbs). */
export type MediaKind = "image" | "video" | "audio" | "pdf" | "lottie" | "text";

export interface MediaRequest {
  /** the address as the author wrote it (after the host's urlPolicy and the default rules, unless a claimed prefix: then exactly as written, trimmed) */
  url: string;
  kind: MediaKind;
  /** the part asking: "video", "audio", "gallery", "compare-image", "pdf", "lottie", or "markdown" for an image in prose */
  part: string;
  /** what the file is for inside the part, when it matters: "poster", "source", "captions", "thumbs", "transcript", "peaks", "before", "after" */
  role?: string;
  /** the most bytes this file may have: reading past it is wasted, stop there and answer { refused } (or an objectUrl). A file over it is refused here. */
  maxBytes: number;
  /** aborted when the part unmounts or the address changes: stop the work. A blob URL you answered with is yours to revoke now. */
  signal: AbortSignal;
}

/** What the loader answers. Exactly one of these shapes. */
export type MediaResult =
  /** a `blob:` URL the host made; the host owns it (we never revoke it: revoke it when `signal` aborts). The best answer for a video or audio file: nothing is copied or counted */
  | { objectUrl: string }
  /** the file's bytes; the kind's byte cap applies, and a blob we make from them is revoked when the part unmounts */
  | { bytes: Uint8Array | ArrayBuffer }
  /** the host will not serve it; the part shows its refused state with this reason (shortened to 200 characters) */
  | { refused: string }
  /** not mine: load it the usual way (the address already passed the urlPolicy). Taken as a refusal for a claimed prefix. */
  | { useDefault: true };

export type LoadMedia = (req: MediaRequest) => Promise<MediaResult>;

/** The part-facing outcome of asking: an address to use, bytes, a refusal, or "the usual way" with the checked address. */
export type MediaOutcome =
  | { kind: "url"; url: string; own: boolean }      // own: the host's blob: URL (true), or the usual checked address (false)
  | { kind: "bytes"; bytes: Uint8Array<ArrayBuffer>; release: () => void }   // release: give the bytes back to the page's total once they are no longer held
  | { kind: "refused"; reason: string };

/** The byte cap for a `{bytes}` answer where the part has no cap of its own (a source set on an element). The fetch-based kinds use their part's caps. */
export const MEDIA_BYTE_CAPS: Record<"image" | "video" | "audio", number> = { image: 32 * 1024 * 1024, video: 512 * 1024 * 1024, audio: 64 * 1024 * 1024 };

/** The most loader bytes one page holds at once: bytes being read, and blobs made from bytes that are still on the page (released when a part unmounts or its address changes). Counted per loader function. */
export const MEDIA_PAGE_BYTES = 256 * 1024 * 1024;
/** The loader bytes a page holds: one per document (DocumentView keeps it in its context). Without one, a total per loader function. */
export interface MediaTotal { used: number }
export type Host = { loader?: LoadMedia; prefixes?: readonly string[]; urlPolicy?: UrlPolicy; pageBytes?: number; total?: MediaTotal };
const totals = new WeakMap<object, MediaTotal>();

const NEVER = new Set(["javascript", "vbscript", "data", "file", "blob", "filesystem", "http", "https", "mailto", "about", "ws", "wss", "ftp", "chrome", "view-source"]);
/** Keep the prefixes a host may claim: `name:` (letters, digits, + . -; not a web, script or data scheme) or `@`. Lower case; the rest are dropped. */
export function cleanPrefixes(list: readonly string[] | undefined): readonly string[] {
  if (!list) return [];
  const out: string[] = [];
  for (const p of list) {
    if (typeof p !== "string") continue;
    const q = p.toLowerCase();
    if (q === "@" || (/^[a-z][a-z0-9+.-]{0,31}:$/.test(q) && !NEVER.has(q.slice(0, -1)))) { if (!out.includes(q)) out.push(q); }
  }
  return out;
}
/** The address begins, exactly as written (no entity, no control character, any case), with one of the host's claimed prefixes. */
export function claimedBy(url: string, prefixes: readonly string[]): boolean {
  if (!prefixes.length) return false;
  const u = url.trim().toLowerCase();
  return prefixes.some((p) => u.startsWith(p));
}
/** Why a claimed address is refused before the loader sees it, or null: too long, a space or control character, a backslash. */
export function claimedRefusal(url: string): string | null {
  const u = url.trim();
  if (!u || u.length > 2048) return "the address is empty or too long";
  for (let i = 0; i < u.length; i++) { const c = u.charCodeAt(i); if (c <= 0x20 || c === 0x7f || c === 0x5c || (c >= 0x80 && c <= 0x9f) || c === 0x2028 || c === 0x2029) return "the address has a space or a control character"; }
  return null;
}

const MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif",
  mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", ogv: "video/ogg", mov: "video/quicktime",
  mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", weba: "audio/webm", flac: "audio/flac",
};
/** (svg is left out on purpose: an SVG blob is a same-origin document that scripts if opened on its own; SECURITY.md) The type of a blob made from loader bytes, by the address's extension; null (refused) when it is not a known image, video or audio type for that kind. */
export function blobType(url: string, kind: MediaKind): string | null {
  let p = url; for (let i = 0; i < p.length; i++) if (p[i] === "?" || p[i] === "#") { p = p.slice(0, i); break; }
  const slash = p.lastIndexOf("/"), dot = p.lastIndexOf(".");
  const e = dot > slash && dot < p.length - 1 ? p.slice(dot + 1).toLowerCase() : "";
  const m = MIME[e];
  return m && m.startsWith(kind + "/") ? m : null;
}

const cleanReason = (s: unknown): string => String(s ?? "").replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ").trim().slice(0, 200) || "the host did not allow this file";

/**
 * Ask the host's loader about one address. Pure but for the loader call.
 *  - A claimed address skips the urlPolicy (it is never put in the page); every other address passes applyUrlPolicy first, exactly as with no loader.
 *  - Whatever the loader returns is checked here: an objectUrl must be `blob:`, bytes must be within `cap`, anything else is a refusal.
 *  - A loader that throws or rejects is a refusal with a fixed reason (its message is not shown).
 * With no loader this is applyUrlPolicy alone, so a page without a loader behaves as in 0.7.0.
 */
export async function askLoader(
  url: string, kind: MediaKind, part: string, role: string | undefined, cap: number,
  host: Host, signal: AbortSignal,
): Promise<MediaOutcome> {
  const { loader, urlPolicy } = host;
  if (!loader) {
    const u = applyUrlPolicy(url, "image", urlPolicy);
    return u == null ? { kind: "refused", reason: "the address is not allowed here" } : { kind: "url", url: u, own: false };
  }
  const claimed = claimedBy(url, host.prefixes ?? []);
  let asked: string;
  if (claimed) {
    const why = claimedRefusal(url); if (why) return { kind: "refused", reason: why };
    asked = url.trim();
  } else {
    const u = applyUrlPolicy(url, "image", urlPolicy);
    if (u == null) return { kind: "refused", reason: "the address is not allowed here" };
    asked = u;
  }
  let r: unknown;
  try { r = await loader({ url: asked, kind, part, ...(role ? { role } : {}), maxBytes: cap, signal }); } catch { return { kind: "refused", reason: "the host could not load this file" }; }
  if (signal.aborted) return { kind: "refused", reason: "cancelled" };
  if (!r || typeof r !== "object") return { kind: "refused", reason: "the host's loader gave no answer" };
  const o = r as Record<string, unknown>;
  if ("refused" in o && o.refused !== undefined && o.refused !== false) return { kind: "refused", reason: cleanReason(o.refused) };
  if (o.useDefault === true) return claimed ? { kind: "refused", reason: "the host's loader did not take this address" } : { kind: "url", url: asked, own: false };
  if (typeof o.objectUrl === "string") {
    const b = o.objectUrl;
    if (b.length > 2048 || claimedRefusal(b) || schemeOf(b) !== "blob" || !b.toLowerCase().startsWith("blob:")) return { kind: "refused", reason: "the host's loader returned an address that is not a blob: URL" };
    return { kind: "url", url: b, own: true };
  }
  const by = o.bytes;
  if (by instanceof Uint8Array || by instanceof ArrayBuffer) {
    if (by.byteLength > cap) return { kind: "refused", reason: `the file is over its ${cap} byte cap` };
    const total = host.total ?? totals.get(loader) ?? (totals.set(loader, { used: 0 }), totals.get(loader)!);
    if (total.used + by.byteLength > (host.pageBytes ?? MEDIA_PAGE_BYTES)) return { kind: "refused", reason: "the page already holds the most loader bytes it may (answer with an objectUrl for big files)" };
    total.used += by.byteLength;
    let held = true; const n = by.byteLength;
    const release = () => { if (held) { held = false; total.used -= n; } };
    const view = by instanceof Uint8Array ? by : new Uint8Array(by);
    const copy = new Uint8Array(view.byteLength); copy.set(view);   // a copy: a loader that keeps writing to its buffer cannot change what was checked
    return { kind: "bytes", bytes: copy, release };
  }
  return { kind: "refused", reason: "the host's loader gave an answer that is not objectUrl, bytes or refused" };
}

// ---------- parse time ----------
// parse() runs inside withMediaPrefixes(), the way it runs inside withIdPrefix(): while it runs, a part's structural address rule (urlRefusal) and the
// Markdown image rule let an address that begins with a claimed prefix through. Scoped with try/finally, so nothing leaks to the next parse().
let parsing: readonly string[] = [];
export function withMediaPrefixes<T>(list: readonly string[] | undefined, fn: () => T): T {
  const prev = parsing; parsing = cleanPrefixes(list);
  try { return fn(); } finally { parsing = prev; }
}
/** the address begins with a prefix the host claimed for this parse() call */
export const claimedWhileParsing = (url: string): boolean => parsing.length > 0 && claimedBy(url, parsing);

// ---------- sources set on an element ----------
export interface MediaItem { url: string | null | undefined; kind: "image" | "video" | "audio"; role?: string }
/** idle: not asked yet (the part is not near the viewport, or the reader has not pressed Play); loading: asked, no answer yet */
export type MediaSrc = { status: "ready"; src: string } | { status: "idle" } | { status: "loading" } | { status: "refused"; reason: string };
/** What a part made from loader bytes and must give back when it goes: the blob URLs (revoked) and the page-total share (released) */
export interface Made { urls: string[]; releases: (() => void)[] }
export const newMade = (): Made => ({ urls: [], releases: [] });

/**
 * Ask the loader for each item and turn the answers into addresses an element may use: the loader's own blob: URL as it is, or a blob made here from
 * `{bytes}` (its address is pushed on `made` so the caller can revoke it when the part unmounts). Never rejects.
 */
export async function resolveSources(part: string, items: readonly MediaItem[], host: Host, signal: AbortSignal, made: Made): Promise<MediaSrc[]> {
  return Promise.all(items.map(async (it): Promise<MediaSrc> => {
    if (it.url == null || it.url === "") return { status: "refused", reason: "the address is not allowed here" };
    const o = await askLoader(it.url, it.kind, part, it.role, MEDIA_BYTE_CAPS[it.kind], host, signal);
    if (o.kind === "refused") return { status: "refused", reason: o.reason };
    if (o.kind === "url") return { status: "ready", src: o.url };
    const type = blobType(it.url, it.kind);
    if (!type) { o.release(); return { status: "refused", reason: "the file type is not one this part shows" }; }
    const u = URL.createObjectURL(new Blob([o.bytes], { type }));
    if (signal.aborted) { URL.revokeObjectURL(u); o.release(); return { status: "refused", reason: "cancelled" }; }
    made.urls.push(u); made.releases.push(o.release);
    return { status: "ready", src: u };
  }));
}
/** Revoke (and forget) every blob URL a part made from loader bytes. */
export function revokeMade(made: Made): void {
  for (const u of made.urls.splice(0)) { try { URL.revokeObjectURL(u); } catch { /* gone already */ } }
  for (const r of made.releases.splice(0)) r();
}

// ---------- thumbnail sprite addresses ----------
/** A sprite address may go into a CSS `url("...")` only when nothing in it can end the string, start another url() or hide in whitespace: a name from
 *  a captions-style file is the author's text, and the host's urlPolicy saw it as one string. Refused: any quote, parenthesis, backslash, whitespace or control character. */
export function spriteOk(u: string): boolean { return u.length > 0 && u.length <= 2048 && !/[\s"'()\\\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(u); }
/** `url("...")` for an address that passed spriteOk, with the characters that could end the string escaped anyway */
export function cssUrl(u: string): string { return `url("${u.replace(/[\\"\n\r\f]/g, (c) => "\\" + c.charCodeAt(0).toString(16) + " ")}")`; }
