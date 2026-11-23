// durian-hypermedia/node: what only a machine with files can check (format version 11). The parser and the core checks
// are pure and never touch a disk; this entry reads the local files a page's parts name (a download's size and checksum,
// that a Lottie file is a Lottie and has the colour slots the page uses, that a poster, a caption file or an audio file
// is there) and returns the same issues the core check does. It is imported by name, never from "durian-hypermedia".
//
//   import { parse } from "durian-hypermedia";
//   import { checkLocalFiles } from "durian-hypermedia/node";
//   const issues = checkLocalFiles(parse(text, { path: "docs/guide.dh.md" }), { root: process.cwd() });
//
// Every path is read under `root` and nowhere else: an absolute path, a `..`, a path that resolves (also through a
// symbolic link) outside the root, is refused and never read. A path with a scheme (https:, data:) or `//` is not a
// local file and is skipped. Reading is capped (CAP_BYTES here, and the part's own cap in its LIMITS).
import { createHash } from "node:crypto";
import { closeSync, fstatSync, openSync, readSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type { Document, Block } from "../types";
import { FOLDER_PARTS } from "../parts/generated/registry";
import { LIMITS, type Limits } from "../safety";
import type { PartFileRef } from "../parts/types";

/** one thing the check found (the same shape as the core check's Problem) */
export interface FileIssue { line: number; level: "error" | "warn"; message: string }
/** What the check reads files with: a test, or a host with a virtual disk, passes its own. */
export interface FileReader {
  /** the file's size, or null when there is no such file (a folder is no file) */
  stat(path: string): { size: number } | null;
  /** the first `max` bytes of the file */
  read(path: string, max: number): Uint8Array;
  /** where a link really leads (without it, only the written path is checked against the root) */
  realpath?(path: string): string;
}
export interface FileCheckOptions {
  /** the folder every path must stay inside (default: the working directory) */
  root?: string;
  /** more folders to look in for a path, after the page's own folder, such as the site's public folder; each is its own root */
  roots?: string[];
  /** the caps the page was parsed with (default LIMITS) */
  limits?: Limits;
  /** the most bytes read of one file when its part sets no cap of its own (default CAP_BYTES) */
  maxBytes?: number;
  reader?: FileReader;
}
/** the most bytes one file is read for (a part's own cap may be lower, never higher) */
export const CAP_BYTES = 64 * 1024 * 1024;

const nodeReader: FileReader = {
  stat(p) {
    let fd = -1;
    try { fd = openSync(p, "r"); const s = fstatSync(fd); return s.isFile() ? { size: s.size } : null; } catch { return null; } finally { if (fd >= 0) closeSync(fd); }
  },
  read(p, max) {
    const fd = openSync(p, "r");
    try {
      const size = Math.min(max, fstatSync(fd).size), buf = new Uint8Array(size);
      let got = 0;
      while (got < size) { const n = readSync(fd, buf, got, size - got, got); if (n <= 0) break; got += n; }
      return got === size ? buf : buf.subarray(0, got);
    } finally { closeSync(fd); }
  },
  realpath: (p) => realpathSync(p),
};

/** A path with a scheme (`https:`, `data:`) or `//` is not a file on this disk. */
export function isRemote(p: string): boolean {
  if (p.startsWith("//")) return true;
  const c = p.indexOf(":");
  if (c < 1) return false;
  for (let i = 0; i < c; i++) {
    const ch = p[i];
    const ok = (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || (i > 0 && ((ch >= "0" && ch <= "9") || ch === "+" || ch === "." || ch === "-"));
    if (!ok) return false;
  }
  // a path segment before the first slash is a scheme; "a/b:c" is a file name with a colon
  const slash = p.indexOf("/");
  return slash < 0 || c < slash;
}
/** the path without its ?query and #fragment */
const cleanPath = (p: string) => { let e = 0; while (e < p.length && p[e] !== "?" && p[e] !== "#") e++; return p.slice(0, e); };
const DECODES = 4;
/** the path with its %-escapes decoded once; a path with a bad escape is kept as written (the same rule locate() reads it by) */
const decodeOnce = (p: string) => { try { return decodeURIComponent(p); } catch { return p; } };
const refusalOf = (p: string): string | null => {
  if (p.includes("\0")) return "has a null character";
  if (isAbsolute(p) || p.startsWith("/") || p.startsWith("\\") || (p.length > 1 && p[1] === ":")) return "is an absolute path";
  for (const seg of p.split(/[\\/]/)) if (seg === "..") return "has a .. in it";
  return null;
};
/** why a written path is refused, or null: the path as written and after every %-decoding (a few rounds) is checked */
export function refusal(p: string): string | null {
  let cur = p;
  for (let i = 0; i <= DECODES; i++) {
    const bad = refusalOf(cur);
    if (bad) return bad;
    const next = decodeOnce(cur);
    if (next === cur) return null;
    cur = next;
  }
  return refusalOf(cur) ?? "is encoded too deeply";
}
const inside = (root: string, p: string) => { const r = relative(root, p); return r === "" || (!r.startsWith("..") && !isAbsolute(r)); };

/** Find the file a path means: beside the page, then in each extra root. null when there is none; throws a reason (a string) when a link leads out. */
function locate(written: string, bases: { dir: string; root: string }[], fs: FileReader): { file: string; size: number } | null {
  const decoded = decodeOnce(cleanPath(written));
  for (const { dir, root } of bases) {
    const file = resolve(dir, decoded);
    if (!inside(root, file)) continue;
    const st = fs.stat(file);
    if (!st) continue;
    if (fs.realpath) {
      let real: string, realRoot: string;
      try { real = fs.realpath(file); realRoot = fs.realpath(root); } catch { continue; }
      if (!inside(realRoot, real)) throw "is a link that leads outside the root";
    }
    return { file, size: st.size };
  }
  return null;
}

/** every part block of a page, also inside tabs, accordions and human blocks */
function* partBlocks(blocks: Block[]): Generator<Block> {
  for (const b of blocks) {
    yield b;
    if (b.type === "tabs" || b.type === "accordion") for (const it of b.items) yield* partBlocks(it.body);
    else if (b.type === "human") yield* partBlocks(b.body);
  }
}

/**
 * The checks that need files: for every part that names local files (`files()` in its definition), each file must be
 * there, and the part's own rules and checksum must hold. Returns issues in page order; never throws for a bad file.
 */
export function checkLocalFiles(doc: Document, opts: FileCheckOptions = {}): FileIssue[] {
  const fs = opts.reader ?? nodeReader;
  const limits = opts.limits ?? LIMITS;
  const cap = opts.maxBytes ?? CAP_BYTES;
  const root = resolve(opts.root ?? process.cwd());
  // the page's own folder, under the root (a page outside the root is read as if it sat at the root)
  const at = doc.path ? resolve(root, doc.path) : root;
  const pageDir = inside(root, at) ? dirname(at) : root;
  const bases = [{ dir: pageDir, root }, ...(opts.roots ?? []).map((r) => ({ dir: resolve(r), root: resolve(r) }))];
  const issues: FileIssue[] = [];
  const seen = new Map<string, { size: number; bytes?: Uint8Array; capped: number }>();
  for (const b of partBlocks(doc.blocks)) {
    const def = (FOLDER_PARTS as Record<string, { files?: (d: any, c: { limits: Limits; line: number }) => PartFileRef[] }>)[b.type];
    if (!def?.files) continue;
    const name = b.type, say = (line: number, level: "error" | "warn", m: string) => issues.push({ line, level, message: `${name}: ${m}` });
    let refs: PartFileRef[];
    try { refs = def.files((b as { data: unknown }).data, { limits, line: b.line }); } catch (e) { say(b.line, "warn", `its files could not be listed (${(e as Error).message})`); continue; }
    for (const ref of refs) {
      const written = ref.path;
      if (!written || isRemote(written)) continue;
      const clean = cleanPath(written);
      const bad = refusal(clean);
      if (bad) { say(ref.line, "error", `${written} ${bad}; a media path is written relative to the page (media/talk.mp3), and it is not read`); continue; }
      let found: ReturnType<typeof locate>;
      try { found = locate(written, bases, fs); } catch (why) { say(ref.line, "error", `${written} ${why}; it is not read`); continue; }
      if (!found) { say(ref.line, "error", `${written} is not a file under ${relative(process.cwd(), root) || "."}; write the path of a file beside the page, or add its folder to the roots`); continue; }
      const limit = Math.min(cap, ref.readMax ?? cap);
      const wantsBytes = !!ref.hash || !!ref.json || !!ref.bytes;
      let bytes: Uint8Array | undefined;
      const tooBig = found.size > limit;
      if (wantsBytes && !tooBig) {
        const hit = seen.get(found.file);
        if (hit?.bytes && hit.capped >= found.size) bytes = hit.bytes;
        else { try { bytes = fs.read(found.file, limit); } catch (e) { say(ref.line, "error", `${written} could not be read (${(e as Error).message})`); continue; } seen.set(found.file, { size: found.size, bytes, capped: limit }); }
      }
      if (wantsBytes && tooBig && ref.hash) say(ref.line, "warn", `${written} is ${found.size} bytes; the checksum is not checked past ${limit} bytes`);
      let json: unknown;
      if (ref.json && bytes) {
        try { json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { say(ref.line, "error", `${written} is not valid JSON`); continue; }
      }
      if (ref.hash && bytes) {
        if (createHash(ref.hash.algo).update(bytes).digest("hex") !== ref.hash.hex) say(ref.line, "error", `${written}: the ${ref.hash.algo} checksum differs; write what \`shasum -a ${ref.hash.algo === "sha256" ? 256 : 512} ${clean.slice(clean.lastIndexOf("/") + 1)}\` prints`);
      }
      if (ref.check) for (const m of ref.check({ size: found.size, json, bytes: ref.bytes ? bytes : undefined })) say(ref.line, "error", m);
    }
  }
  return issues;
}
