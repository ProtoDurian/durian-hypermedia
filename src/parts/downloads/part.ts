// The downloads part (format version 11): a card per file, a line each. Pure.
//
//   ```downloads title="Files for this guide"
//   media/q3-report.pdf "Q3 report" 2.4 MB sha256=<64 hex>
//   media/requests.csv "Raw data" note="one row per request"
//   ```
//
// A line is `<address> ["label"] [size] [sha256=|sha512=<hex>] [note=...]`. The size, the checksum and the note are the
// author's words about the file; nothing is fetched, here or in the view, until the reader presses Download.
import { definePart, type PartFileRef } from "../types";
import { bodyLines, extOf, firstWord, iconOf, isDecimal, isHex, nameOf, unknownKeys, urlRefusal, type Err } from "./media";

export const DOWNLOADS_KEYS = ["id", "title", "llm"];
export interface DownloadFile { src: string; label: string; name: string; icon: string; size: string; bytes: number | null; algo: "sha256" | "sha512" | ""; sum: string; note: string; line: number }
export interface DownloadsSpec { title: string; files: DownloadFile[]; errors: Err[] }

const UNITS: Record<string, number> = { B: 1, KB: 1000, MB: 1000 * 1000, GB: 1000 * 1000 * 1000 };
/** "2.4 MB" to bytes (decimal units, the way a file manager or a web page states them) */
export const sizeToBytes = (n: number, unit: string) => Math.round(n * UNITS[unit]);
export const humanSize = (bytes: number): string => {
  if (bytes < 1000) return `${bytes} B`;
  for (const [u, k] of [["KB", 1e3], ["MB", 1e6], ["GB", 1e9]] as const) { const v = bytes / k; if (v < 1000 || u === "GB") return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${u}`; }
  return `${bytes} B`;
};

type Tok = { kind: "label"; v: string } | { kind: "kv"; k: string; v: string } | { kind: "word"; v: string };
const isKeyChar = (c: string) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || (c >= "0" && c <= "9");
const blank = (c: string) => c === " " || c === "\t";
/** the words of the rest of a line, in one pass: "a label", key=value, key="a value", or a bare word */
function tokens(s: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    if (blank(s[i])) { i++; continue; }
    if (s[i] === '"') {
      const close = s.indexOf('"', i + 1);
      if (close >= 0) { out.push({ kind: "label", v: s.slice(i + 1, close) }); i = close + 1; continue; }
    }
    let k = i;
    while (k < s.length && isKeyChar(s[k])) k++;
    if (k > i && s[k] === "=") {
      if (s[k + 1] === '"') {
        const close = s.indexOf('"', k + 2);
        if (close >= 0) { out.push({ kind: "kv", k: s.slice(i, k), v: s.slice(k + 2, close) }); i = close + 1; continue; }
      }
      let e = k + 1;
      while (e < s.length && !blank(s[e])) e++;
      out.push({ kind: "kv", k: s.slice(i, k), v: s.slice(k + 1, e) });
      i = e;
      continue;
    }
    let e = i;
    while (e < s.length && !blank(s[e])) e++;
    out.push({ kind: "word", v: s.slice(i, e) });
    i = e;
  }
  return out;
}
/** "2.4MB" (a number and a unit joined): [number, UNIT] or null */
function joinedSize(w: string): [string, string] | null {
  let i = w.length;
  while (i > 0 && !(w[i - 1] >= "0" && w[i - 1] <= "9")) i--;
  const num = w.slice(0, i), unit = w.slice(i).toUpperCase();
  return num && isDecimal(num) && Object.hasOwn(UNITS, unit) ? [num, unit] : null;
}

export function parseDownloads(body: string, baseLine: number, attrs: Record<string, string>, line: number, lim: { downloadsFiles: number }, budget: import("../../core/budget").Budget): DownloadsSpec {
  const errors: Err[] = [];
  unknownKeys(attrs, DOWNLOADS_KEYS, "downloads", line, errors);
  const files: DownloadFile[] = [];
  const seen = new Map<string, number>();
  for (const { text: s, line: l } of bodyLines(body, baseLine, budget)) {
    if (files.length >= lim.downloadsFiles) { errors.push({ line: l, msg: `downloads: more than ${lim.downloadsFiles} files (the cap)` }); break; }
    budget.charge(2 + (s.length >> 3), 1);
    const [url, rest] = firstWord(s);
    const why = urlRefusal(url);
    if (why) { errors.push({ line: l, msg: `downloads: "${url}" is not allowed: ${why}` }); continue; }
    if (seen.has(url)) errors.push({ line: l, msg: `downloads: "${url}" is listed twice (first at line ${seen.get(url)})` });
    seen.set(url, l);
    const f: DownloadFile = { src: url, label: "", name: nameOf(url), icon: iconOf(url), size: "", bytes: null, algo: "", sum: "", note: "", line: l };
    const toks = tokens(rest);
    for (let k = 0; k < toks.length; k++) {
      const t = toks[k];
      if (t.kind === "label") { if (f.label) errors.push({ line: l, msg: `downloads: a second label "${t.v}" on one line` }); f.label = t.v; continue; }
      if (t.kind === "kv") {
        const key = t.k.toLowerCase();
        if (key === "md5" || key === "sha1") { errors.push({ line: l, msg: `downloads: ${key}= is a weak checksum; use sha256= (shasum -a 256 <file>)` }); continue; }
        if (key === "sha256" || key === "sha512") {
          const want = key === "sha256" ? 64 : 128, hex = isHex(t.v);
          if (!hex || t.v.length !== want) errors.push({ line: l, msg: `downloads: ${key}= is ${want} hex characters; this one has ${t.v.length}${hex ? "" : " and is not all hex"}` });
          else { f.algo = key; f.sum = t.v.toLowerCase(); }
          continue;
        }
        if (key === "note") { f.note = t.v; continue; }
        errors.push({ line: l, msg: `downloads: unknown key "${t.k}=" (a line takes sha256=, sha512= and note=)` });
        continue;
      }
      const w = t.v;
      const joined = joinedSize(w);
      if (joined) { f.size = `${joined[0]} ${joined[1]}`; f.bytes = sizeToBytes(+joined[0], joined[1]); continue; }
      if (isDecimal(w)) {
        const nx = toks[k + 1]?.kind === "word" ? (toks[k + 1] as { v: string }).v.toUpperCase() : "";
        if (nx && Object.hasOwn(UNITS, nx)) { f.size = `${w} ${nx}`; f.bytes = sizeToBytes(+w, nx); k++; continue; }
        errors.push({ line: l, msg: `downloads: the size "${w}" needs a unit (B, KB, MB or GB), like 2.4 MB` });
        continue;
      }
      errors.push({ line: l, msg: `downloads: "${w}" is not a size (2.4 MB), a "label" or a key=value` });
    }
    files.push(f);
  }
  if (!files.length && !errors.some((e) => e.msg.includes("the cap"))) errors.push({ line, msg: `downloads: no files; one a line, like media/report.pdf "Q3 report" 2.4 MB sha256=<64 hex>` });
  return { title: attrs.title ?? "", files, errors };
}

export function downloadsLlm(d: DownloadsSpec): string {
  return `Downloads: ${d.title || "files"}.\n` + d.files.map((f) => {
    const bits = [f.icon === "document" && extOf(f.src) === "pdf" ? "PDF" : extOf(f.src).toUpperCase() || "file", f.size, f.sum ? `${f.algo} ${f.sum.slice(0, 6)}...${f.sum.slice(-4)}` : ""].filter(Boolean);
    return `- ${f.label || f.name}: ${f.src} (${bits.join(", ")})${f.note ? ` ${f.note}.` : ""}${f.sum ? `\n  ${f.algo}: ${f.sum}` : ""}`;
  }).join("\n");
}

/** the files a downloads list names, for the Node entry: each file's stated size and checksum must be the file's */
export function downloadsFiles(d: DownloadsSpec, limits: { downloadsCheckBytes: number }): PartFileRef[] {
  return d.files.map((f) => ({
    path: f.src, line: f.line, readMax: limits.downloadsCheckBytes,
    hash: f.sum && f.algo ? { algo: f.algo, hex: f.sum } : undefined,
    check: ({ size }) => {
      if (f.bytes === null) return [];
      // the stated size must be what the file's size rounds to, at the precision written (2.4 MB means 2.35 to 2.45 MB)
      const dot = f.size.indexOf("."), sp = f.size.indexOf(" ");
      const decimals = dot < 0 ? 0 : sp - dot - 1;
      const half = (decimals ? 0.5 * 10 ** -decimals : 0.5) * UNITS[f.size.slice(sp + 1)];
      return Math.abs(size - f.bytes) > half ? [`${f.src} is ${humanSize(size)} (${size} bytes), not ${f.size}; write the size the file has`] : [];
    },
  }));
}

export default definePart<DownloadsSpec>({
  name: "downloads",
  form: "fenced",
  steps: false,
  llmKind: "own",
  parse: (input, ctx) => parseDownloads(input.body, input.bodyLine, input.attrs, input.line, ctx.limits, ctx.budget),
  llm: (d) => downloadsLlm(d),
  files: (d, { limits }) => downloadsFiles(d, limits),
  check: (d) => d.errors.map((e) => ({ line: e.line, message: e.msg })),
});
