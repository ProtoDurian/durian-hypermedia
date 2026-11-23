// The Node entry's local-file checks: a temp folder with real files, an injected reader that proves a refused path is never
// read, every refusal, the read caps, nested parts, and that the pure entries never reach src/node/.
import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parse, LIMITS, UNTRUSTED_LIMITS } from "../index";
import { CAP_BYTES, checkLocalFiles, isRemote, refusal, type FileReader } from "./files";
import { pdfPageCount } from "../parts/pdf/part";

const tmp = mkdtempSync(join(tmpdir(), "dh-files-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const root = join(tmp, "site"), outside = join(tmp, "outside");
mkdirSync(join(root, "docs/media"), { recursive: true });
mkdirSync(join(root, "public/img"), { recursive: true });
mkdirSync(outside, { recursive: true });
const csv = "a,b\n1,2\n";
const lottie = { v: "5.7.0", fr: 30, ip: 0, op: 60, w: 100, h: 100, assets: [], layers: [{ ty: 4, nm: "dh-c1", ks: {}, shapes: [{ ty: "gr", nm: "dh-warn", it: [] }] }] };
writeFileSync(join(root, "docs/media/data.csv"), csv);
writeFileSync(join(root, "docs/media/ok.json"), JSON.stringify(lottie));
writeFileSync(join(root, "docs/media/expr.json"), JSON.stringify({ ...lottie, layers: [{ ty: 4, ks: { o: { a: 0, k: 1, x: "var $bm_rt = 1;" } } }] }));
writeFileSync(join(root, "docs/media/fonts.json"), JSON.stringify({ ...lottie, fonts: { list: [{ fName: "A", fFamily: "A", fStyle: "Regular", fOrigin: "g", fPath: "https://fonts.example/a.css" }] }, chars: [] }));
writeFileSync(join(root, "docs/media/broken.json"), "{ not json");
writeFileSync(join(root, "docs/media/talk.mp3"), "ID3");
writeFileSync(join(root, "docs/media/poster.jpg"), "jpg");
writeFileSync(join(root, "docs/media/cap.vtt"), "WEBVTT\n");
const pdf3 = "%PDF-1.4\n1 0 obj<</Type/Pages/Count 3>>endobj\n2 0 obj<</Type /Page>>endobj\n3 0 obj<</Type\n/Page /Parent 1 0 R>>endobj\n4 0 obj<</Type/Page>>endobj\n";
writeFileSync(join(root, "docs/media/three.pdf"), pdf3);
writeFileSync(join(root, "docs/media/fake.pdf"), "hello");
writeFileSync(join(root, "docs/media/packed.pdf"), "%PDF-1.5\n1 0 obj<</Filter/FlateDecode>>stream\nxx\nendstream endobj\n");
writeFileSync(join(root, "public/img/logo.png"), "png");
writeFileSync(join(outside, "secret.json"), JSON.stringify(lottie));
try { symlinkSync(outside, join(root, "docs/media/link")); } catch { /* no links on this disk: that test skips */ }
const sha = (s: string, a = "sha256") => createHash(a).update(s).digest("hex");

const page = (parts: string) => `# Page\n\n${parts}\n`;
const run = (parts: string, o: Parameters<typeof checkLocalFiles>[1] = {}, path = "docs/page.dh.md") => checkLocalFiles(parse(page(parts), { path }), { root, ...o });
const msgs = (parts: string, o?: Parameters<typeof checkLocalFiles>[1]) => run(parts, o).map((i) => i.message);
/** the page parsed with these caps (a part copies the caps it checks in the browser into its data) */
const msgsL = (parts: string, limits: typeof LIMITS) => checkLocalFiles(parse(page(parts), { path: "docs/page.dh.md", limits }), { root, limits }).map((i) => i.message);
const has = (list: string[], re: RegExp) => list.some((m) => re.test(m));
const dl = (body: string) => "```downloads\n" + body + "\n```";
const lot = (src: string, alt = "alt: A box.") => "```lottie src=\"" + src + "\"\n" + alt + "\n```";

describe("good pages: every file is there and right", () => {
  test("a download with its size and checksum, a Lottie with its slots, a video with poster and captions, an audio, a gallery", () => {
    const parts = [
      dl(`media/data.csv "Rows" ${csv.length} B sha256=${sha(csv)}`),
      lot("media/ok.json", "alt: A box.\ncolours: dh-c1 = c1, dh-warn = warn"),
      "```video src=\"media/talk.mp3.mp4\"\n```".replace("talk.mp3.mp4", "talk.mp4"),
      "```audio src=\"media/talk.mp3\"\n```",
      "```gallery\n![Logo](media/poster.jpg \"x\")\n![Logo](/img/logo.png)\n```",
    ];
    writeFileSync(join(root, "docs/media/talk.mp4"), "mp4");
    const out = run(parts.join("\n\n"), { roots: [join(root, "public")] });
    // the absolute /img/logo.png is refused (an absolute path), everything else passes
    expect(out.map((i) => i.message)).toEqual([expect.stringContaining("/img/logo.png is an absolute path")]);
    expect(run(parts.slice(0, 4).join("\n\n"))).toEqual([]);
  });
  test("a file in an extra root is found; a remote address is skipped; a query and a fragment are dropped", () => {
    expect(run("```gallery\n![Logo](img/logo.png)\n```", { roots: [join(root, "public")] })).toEqual([]);
    expect(run("```gallery\n![Logo](https://example.com/a.png)\n![x](//example.com/b.png)\n```")).toEqual([]);
    expect(run("```gallery\n![Logo](media/poster.jpg?v=3#top)\n```")).toEqual([]);
  });
  test("a page at the root reads beside itself; a page outside the root is read as if at the root", () => {
    writeFileSync(join(root, "top.png"), "x");
    expect(run("```gallery\n![A](top.png)\n```", {}, "page.dh.md")).toEqual([]);
    expect(run("```gallery\n![A](top.png)\n```", {}, "../elsewhere/page.dh.md")).toEqual([]);
  });
  test("parts inside tabs and accordions are checked too", () => {
    const m = msgs(":::tabs\n## One\n" + dl("media/gone.csv") + "\n:::");
    expect(has(m, /gone\.csv is not a file/)).toBe(true);
  });
});

describe("every refusal names the line and the fix", () => {
  test("a missing file: an error on its line", () => {
    const out = run(dl("media/data.csv 1 B\nmedia/gone.csv 1 B"));
    expect(out.length).toBe(2); // the wrong size of the first, the missing second
    const miss = out.find((i) => /gone\.csv/.test(i.message))!;
    expect(miss.level).toBe("error"); expect(miss.line).toBe(5); expect(miss.message).toMatch(/^downloads: media\/gone\.csv is not a file under/);
  });
  test("a folder is not a file", () => { expect(has(msgs(dl("media 1 B")), /media is not a file/)).toBe(true); });
  test("a wrong size says what the file has", () => {
    expect(msgs(dl("media/data.csv 2.4 MB"))).toEqual([`downloads: media/data.csv is ${csv.length} B (${csv.length} bytes), not 2.4 MB; write the size the file has`]);
    expect(run(dl(`media/data.csv ${csv.length} B`))).toEqual([]);
    expect(run(dl("media/data.csv 0.008 KB"))).toEqual([]); // 8 bytes, written at 3 decimals of KB
  });
  test("a wrong checksum says it differs and how to write it, and prints no hash", () => {
    const bad = "0".repeat(64);
    expect(msgs(dl(`media/data.csv sha256=${bad}`))).toEqual(["downloads: media/data.csv: the sha256 checksum differs; write what `shasum -a 256 data.csv` prints"]);
    const bad5 = "0".repeat(128);
    const m5 = msgs(dl(`media/data.csv sha512=${bad5}`));
    expect(has(m5, /media\/data\.csv: the sha512 checksum differs; write what `shasum -a 512 data\.csv` prints/)).toBe(true);
    expect(m5.join(" ")).not.toContain(sha(csv, "sha512"));
    expect(run(dl(`media/data.csv sha512=${sha(csv, "sha512")}`))).toEqual([]);
  });
  test("a wrong checksum never prints a hash of the file", () => {
    const out = msgs(dl(`media/data.csv sha256=${"0".repeat(64)}`)).join(" ");
    expect(out).not.toContain(sha(csv));
    expect(out.replace(/0{64}/, "")).not.toMatch(/[0-9a-f]{40,}/);
  });
  test("an encoded .. is refused before anything is read", () => {
    const reads: string[] = [];
    const reader: FileReader = { stat: (p) => { reads.push("stat " + p); return { size: 1 }; }, read: (p) => { reads.push("read " + p); return new Uint8Array(1); } };
    writeFileSync(join(tmp, ".env"), "SECRET=1");
    const paths = ["%2e%2e/.env", "%2E%2E/.env", "..%2f.env", "%2e%2e%2f.env", "media/%2e%2e/%2e%2e/.env", "%252e%252e/.env", "%25252e%25252e/.env", "%2e./.env", ".%2e/.env", "%5c..%5c.env", "..%5c.env", "%2fetc/passwd", "a%00b.csv", "%2e%2e/%2e%2e/%2e%2e/.env"];
    const out = run(paths.map((p) => dl(`${p} 1 B sha256=${"0".repeat(64)}`)).join("\n\n"), { reader });
    expect(reads).toEqual([]);
    expect(out.length).toBe(paths.length);
    expect(out.every((i) => i.level === "error" && /is an absolute path|has a \.\. in it|has a null character/.test(i.message) && /it is not read/.test(i.message))).toBe(true);
    expect(out.map((i) => i.message).join(" ")).not.toMatch(/[0-9a-f]{40,}/);
  });
  test("a Lottie that is not JSON, has an expression, or lacks a colour slot", () => {
    expect(msgs(lot("media/broken.json"))).toEqual(["lottie: media/broken.json is not valid JSON"]);
    expect(has(msgs(lot("media/expr.json")), /lottie: media\/expr\.json: the file has an expression/)).toBe(true);
    expect(has(msgs(lot("media/fonts.json")), /^lottie: media\/fonts\.json: fonts: font 1 is refused: .*\(fPath\)/)).toBe(true);
    expect(has(msgs(lot("media/ok.json", "alt: A box.\ncolours: dh-nope = c1")), /lottie: colours: media\/ok\.json has no layer or shape named "dh-nope" \(names it has: dh-c1, dh-warn\)/)).toBe(true);
  });
  test("audio and video: a missing poster, caption file, thumbs file or peaks file", () => {
    const m = msgs("```video src=\"media/talk.mp3\" poster=\"media/no.jpg\"\ncaptions: media/no.vtt \"English\"\nthumbs: media/no-thumbs.vtt\n```\n\n```audio src=\"media/talk.mp3\"\npeaks: media/no.peaks.json\ntranscript: media/no.vtt\n```");
    for (const f of ["no.jpg", "no.vtt", "no-thumbs.vtt", "no.peaks.json"]) expect(has(m, new RegExp(`${f.split(".").join("\\.")} is not a file`))).toBe(true);
  });
  test("paths that leave the page's folder are refused and never read", () => {
    const reads: string[] = [];
    const reader: FileReader = { stat: (p) => { reads.push("stat " + p); return { size: 1 }; }, read: (p) => { reads.push("read " + p); return new Uint8Array(1); } };
    const out = run(dl("../../outside/secret.json 1 B sha256=" + sha("x")) + "\n\n" + dl("media/../../x.csv 1 B") + "\n\n" + dl("/etc/passwd 1 B"), { reader });
    expect(reads).toEqual([]);
    expect(out.length).toBe(3);
    expect(out.every((i) => i.level === "error" && /is an absolute path|has a \.\. in it/.test(i.message) && /it is not read/.test(i.message))).toBe(true);
  });
  test("a link that leads outside the root is refused", () => {
    let linked = true; try { statSync(join(root, "docs/media/link")); } catch { linked = false; }
    if (!linked) return;
    const m = msgs(lot("media/link/secret.json"));
    expect(has(m, /is a link that leads outside the root; it is not read/)).toBe(true);
  });
  test("the helpers", () => {
    for (const p of ["https://a.b/c", "data:image/png;base64,AA", "//cdn/x", "blob:x", "mailto:a@b.c"]) expect(isRemote(p)).toBe(true);
    for (const p of ["a/b:c.png", "media/x.png", ":x", "./a.png", "a.png"]) expect(isRemote(p)).toBe(false);
    expect(refusal("media/a.png")).toBeNull();
    expect(refusal("a/../b")).toMatch(/\.\./); expect(refusal("/a")).toMatch(/absolute/); expect(refusal("C:\\a")).toMatch(/absolute/); expect(refusal("a\0b")).toMatch(/null/);
    expect(refusal("a..b/c")).toBeNull();
    expect(refusal("%2e%2e/x")).toMatch(/\.\./); expect(refusal("a%2F..%2fb")).toMatch(/\.\./); expect(refusal("%252e%252e/x")).toMatch(/\.\./); expect(refusal("%2fetc")).toMatch(/absolute/); expect(refusal("a%00b")).toMatch(/null/);
    expect(refusal("100%.csv")).toBeNull(); expect(refusal("a%2eb/c%20d.png")).toBeNull();
  });
});

describe("pdf: it is a PDF, within its cap, with the page the part names", () => {
  const pdf = (attrs: string) => "```pdf src=\"media/" + attrs + "\n```";
  test("a good one, and the page counting", () => {
    expect(run(pdf('three.pdf" page=3'))).toEqual([]);
    expect(pdfPageCount(new TextEncoder().encode(pdf3))).toBe(3);
    const n = (s: string) => pdfPageCount(new TextEncoder().encode(s));
    expect(n("%PDF-1.5 /Type /Pages /Type /Pagesx")).toBeNull();      // /Pages is the tree, never a page
    expect(n("/Type/Page/Parent 1 0 R /Type/Page>>")).toBe(2);       // no space after /Type
    expect(n("/Type /Page /Type/Pages /Type  /Page")).toBe(2);        // a space, and two
    expect(n("/Type\r\n/Page\n/Type\t/Page")).toBe(2);              // any white space
    expect(n("/Type /Page/Type /Pages")).toBe(1);                     // a page right before a tree
    expect(n("/Type /Page")).toBe(1); expect(n("/Type /Pag")).toBeNull(); expect(n("")).toBeNull();
  });
  test("a page past the end, a file that is not a PDF, a PDF over its cap", () => {
    expect(msgs(pdf('three.pdf" page=4'))).toEqual(["pdf: page=4 is past the end; media/three.pdf has 3 pages"]);
    expect(msgs(pdf('fake.pdf"'))).toEqual(["pdf: media/fake.pdf is not a PDF file (it does not start with %PDF-)"]);
    expect(has(msgsL(pdf('three.pdf"'), { ...LIMITS, pdfBytes: 10 }), /pdf: media\/three\.pdf is \d+ KB; PDF files may be at most \d+ KB/)).toBe(true);
    expect(has(msgsL(pdf('three.pdf"'), { ...LIMITS, pdfPages: 2 }), /has 3 pages; a pdf part shows at most 2/)).toBe(true);
  });
  test("a PDF with its pages packed in object streams is not page-checked, only found", () => {
    expect(run(pdf('packed.pdf" page=9'))).toEqual([]);
  });
});

describe("reading is capped", () => {
  const reader = (size: number, reads: number[]): FileReader => ({ stat: () => ({ size }), read: (_p, max) => { reads.push(max); return new Uint8Array(Math.min(max, size)); } });
  test("a file over the part's cap is not read: the checksum is skipped with a warning, the size is still checked", () => {
    const reads: number[] = [];
    const lim = { ...LIMITS, downloadsCheckBytes: 4 };
    const out = run(dl(`media/data.csv 1 MB sha256=${sha(csv)}`), { limits: lim, reader: reader(csv.length, reads) });
    expect(reads).toEqual([]);
    expect(out.map((i) => i.level)).toEqual(["warn", "error"]);
    expect(out[0].message).toBe(`downloads: media/data.csv is ${csv.length} bytes; the checksum is not checked past 4 bytes`);
    expect(out[1].message).toBe(`downloads: media/data.csv is ${csv.length} B (${csv.length} bytes), not 1 MB; write the size the file has`);
  });
  test("the strict set reads less than the authored set, and a host's own cap wins", () => {
    expect(UNTRUSTED_LIMITS.downloadsCheckBytes).toBeLessThan(LIMITS.downloadsCheckBytes);
    expect(LIMITS.downloadsCheckBytes).toBeLessThanOrEqual(CAP_BYTES);
    const reads: number[] = [];
    run(dl(`media/data.csv sha256=${sha(csv)}`), { reader: reader(10, reads) });
    expect(reads).toEqual([LIMITS.downloadsCheckBytes]);
    reads.length = 0;
    run(dl(`media/data.csv sha256=${sha(csv)}`), { reader: reader(10, reads), limits: UNTRUSTED_LIMITS });
    expect(reads).toEqual([UNTRUSTED_LIMITS.downloadsCheckBytes]);
    reads.length = 0;
    run(dl(`media/data.csv sha256=${sha(csv)}`), { reader: reader(10, reads), maxBytes: 20 });
    expect(reads).toEqual([20]);
    reads.length = 0;
    run(dl(`media/data.csv sha256=${sha(csv)}`), { reader: reader(10, reads), maxBytes: 5 });
    expect(reads).toEqual([]); // over the host's cap: not read
  });
  test("a Lottie over its cap is refused with the part's own words, and not read", () => {
    const reads: number[] = [];
    const out = run(lot("media/ok.json"), { reader: reader(LIMITS.lottieBytes + 10, reads) });
    expect(reads).toEqual([]);
    expect(out.map((i) => i.message)).toEqual([expect.stringMatching(/^lottie: media\/ok\.json: the file is \d+ KB; Lottie files may be at most 1024 KB/)]);
  });
  test("a file is read once however many parts name it", () => {
    const reads: number[] = [];
    run(dl(`media/data.csv sha256=${sha(csv)}\nmedia/data.csv sha256=${sha(csv)}`), { reader: reader(10, reads) });
    expect(reads.length).toBe(1);
  });
  test("a many-file page does bounded work: 100 files, each stat'ed once", () => {
    let stats = 0;
    const r: FileReader = { stat: () => { stats++; return { size: 1 }; }, read: () => new Uint8Array(1) };
    run(dl(Array.from({ length: 100 }, (_, k) => `media/f${k}.csv 1 B`).join("\n")), { reader: r });
    expect(stats).toBe(100);
  });
});

describe("the page and the pure entries never reach src/node/", () => {
  const src = resolve(import.meta.dir, "..");
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === "node" || e.name === "vendor" ? [] : files(join(dir, e.name))) : /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) ? [join(dir, e.name)] : []));
  test("no source file outside src/node imports it", () => {
    const hits = files(src).filter((f) => !f.endsWith("server.ts") && /from\s+["'][^"']*\/node\/files["']|["']durian-hypermedia\/node["']/.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
  test("nothing src/index.ts or the strict react entry imports, however far, is under src/node/", () => {
    // the import graph by hand (the build cannot run here without reading outside the folder): follow every relative import
    const seen = new Set<string>(), todo = [join(src, "index.ts"), join(src, "react/strict.tsx")];
    const spec = /(?:from|import)\s*\(?\s*["'](\.[^"']*)["']/g;
    while (todo.length) {
      const f = todo.pop()!;
      if (seen.has(f)) continue;
      seen.add(f);
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(spec)) {
        const base = resolve(dirname(f), m[1]);
        const hit = [base, base + ".ts", base + ".tsx", join(base, "index.ts"), join(base, "index.tsx")].find((c) => { try { return statSync(c).isFile(); } catch { return false; } });
        if (hit) todo.push(hit);
      }
    }
    expect(seen.size).toBeGreaterThan(100);
    expect([...seen].filter((f) => f.startsWith(join(src, "node") + "/"))).toEqual([]);
    expect([...seen].filter((f) => /from\s*["']node:/.test(readFileSync(f, "utf8")) && !f.includes("/vendor/"))).toEqual([]);
  });
  test("the entry is exported by name and built for node, not for a browser", async () => {
    const pkg = await Bun.file(join(src, "../package.json")).json();
    expect(pkg.exports["./node"]).toEqual({ types: "./src/node/files.ts", bun: "./src/node/files.ts", import: "./dist/node/files.js" });
    const build = readFileSync(join(src, "../scripts/build.ts"), "utf8");
    expect(build).toContain('startsWith("./src/node/")');
    expect(build).toContain('target: "node"');
  });
});
