// Lottie in a real browser, under a strict CSP with require-trusted-types-for 'script': a file is kept inside its part (the
// page outside the part gains no element, head is unchanged), a refused file says why, and a good file still plays and
// draws. Skipped when google-chrome is not installed, or with DH_CDP_TEST=0.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { which } from "bun";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, normalize, resolve } from "node:path";
import type { Page } from "../scripts/cdp";

const withBrowser = !!which("google-chrome") && process.env.DH_CDP_TEST !== "0";
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; require-trusted-types-for 'script'";

const glyph = { ch: "A", size: 40, style: "Regular", w: 60, fFamily: "F", data: { shapes: [{ ty: "gr", it: [{ ty: "sh", ks: { a: 0, k: { c: true, i: [[0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0]], v: [[0, 0], [30, -70], [60, 0]] } } }, { ty: "fl", c: { a: 0, k: [0, 0, 0, 1] }, o: { a: 0, k: 100 } }, { ty: "tr", p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } }] }] } };
const textLayer = { ddd: 0, ind: 1, ty: 5, nm: "t", ks: { o: { a: 0, k: 100 }, p: { a: 0, k: [20, 80, 0] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] }, r: { a: 0, k: 0 } }, ip: 0, op: 30, st: 0, t: { d: { k: [{ s: { s: 40, f: "F", t: "AA", j: 0, tr: 0, lh: 48, ls: 0, fc: [0, 0, 0] }, t: 0 }] }, p: {}, m: { g: 1, a: { a: 0, k: [0, 0] } }, a: [] } };
const base = { v: "5.7.0", fr: 30, ip: 0, op: 30, w: 100, h: 100, assets: [] as any[], layers: [] as any[] };
const FILES: Record<string, unknown> = {
  "good.json": JSON.parse(readFileSync(resolve(import.meta.dir, "../src/parts/lottie/media/build.json"), "utf8")),
  "good-glyphs.json": { ...base, fonts: { list: [{ fName: "F", fFamily: "F", fStyle: "Regular", ascent: 75, origin: 0, fPath: "", fClass: "" }] }, chars: [glyph], layers: [textLayer] },
  "fonts-link.json": { ...base, fonts: { list: [
    { fName: "A", fFamily: "A", fStyle: "Regular", fOrigin: "g", fPath: "https://fonts.example/page.css" },
    { fName: "B", fFamily: "B", fStyle: "Regular", fOrigin: "p", fPath: "x" },
    { fName: "C", fFamily: "C", fStyle: "Regular", fOrigin: "t", fPath: "https://fonts.example/kit.css" },
  ] } },
  "fonts-system.json": { ...base, fonts: { list: [{ fName: "S", fFamily: "Arial", fStyle: "Regular", fOrigin: "n" }] }, layers: [textLayer] },
  "fonts-glyph-class.json": { ...base, fonts: { list: [{ fName: "F", fFamily: "F", fStyle: "Regular", fClass: "fixed", fOrigin: "p", fPath: "x" }] }, chars: [glyph], layers: [textLayer] },
  "ids.json": { ...base, layers: [{ ty: 4, ind: 1, ks: {}, ln: "root", cl: "fixed", ip: 0, op: 30, st: 0, shapes: [{ ty: "gr", ln: "x2", cl: "y2", it: [] }] }] },
};

let dir = "", server: ReturnType<typeof Bun.serve> | null = null, page: Page | null = null;
beforeAll(async () => {
  if (!withBrowser) return;
  dir = mkdtempSync(join(tmpdir(), "dh-lottie-host-"));
  // built in a child process: a Bun.build inside the test runner can fail to resolve relative imports on its first call
  const r = Bun.spawnSync(["bun", "build", join(import.meta.dir, "lottie-host-page.tsx"), "--outdir", dir, "--splitting", "--format=esm", "--target=browser", "--entry-naming=[name].[ext]", "--chunk-naming=c-[hash].[ext]", "--production"], { cwd: resolve(import.meta.dir, ".."), env: { ...process.env, NODE_ENV: "production" }, stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error("the test page did not build: " + r.stderr.toString().slice(0, 2000));
  writeFileSync(join(dir, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><title>lottie host</title><script type="module" src="lottie-host-page.js"></script></head><body><div id="root"></div></body></html>`);
  for (const [name, json] of Object.entries(FILES)) writeFileSync(join(dir, name), JSON.stringify(json));
  const TYPES: Record<string, string> = { html: "text/html; charset=utf-8", js: "text/javascript", json: "application/json", css: "text/css" };
  server = Bun.serve({ port: 0, hostname: "127.0.0.1", async fetch(req) {
    const file = normalize(join(dir, decodeURIComponent(new URL(req.url).pathname).replace(/^\/$/, "/index.html")));
    if (!file.startsWith(dir + "/") || !(await Bun.file(file).exists())) return new Response("not found", { status: 404 });
    return new Response(Bun.file(file), { headers: { "Content-Type": TYPES[file.split(".").pop()!] ?? "application/octet-stream", "Content-Security-Policy": CSP } });
  } });
  const { launch } = await import("../scripts/cdp");
  page = await launch();
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__errs = []; addEventListener("error", (e) => window.__errs.push(String(e.message))); addEventListener("unhandledrejection", (e) => window.__errs.push("rejection " + String(e.reason))); window.__csp = []; document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(e.effectiveDirective + " " + (e.blockedURI || "")));` });
}, 60000);
afterAll(async () => { await page?.close(); server?.stop(true); if (dir) rmSync(dir, { recursive: true, force: true }); });

type Seen = { errs: string[]; outside: string[]; inPart: string[]; toHead: number; toBody: number; headSame: boolean; bodyKids: number; bodyKidsBefore: number; err: string; paths: number; frames: string[]; csp: string[]; tt: number };
async function open(name: string, watchFrames = false): Promise<Seen> {
  const p = page!;
  await p.goto(`http://127.0.0.1:${server!.port}/index.html?f=${name}`);
  for (let i = 0; i < 60; i++) { if (await p.eval<boolean>(`!!document.querySelector(".lt .m-err") || !!document.querySelector(".lt-holder svg")`)) break; await p.sleep(100); }
  const frames: string[] = [];
  if (watchFrames) for (let i = 0; i < 8; i++) { frames.push(await p.eval<string>(`document.querySelector(".lt-frame")?.textContent ?? ""`)); await p.sleep(150); }
  await p.sleep(400); // the player's font timers run for a moment after it draws
  return p.eval<Seen>(`(() => { const s = window.__lt; if (!s) throw new Error("the test page did not run: " + JSON.stringify(window.__errs) + " " + JSON.stringify(window.__csp)); return { errs: window.__errs, outside: s.outside, inPart: s.inPart, toHead: s.toHead, toBody: s.toBody, headSame: document.head.innerHTML === s.head, bodyKids: document.body.children.length, bodyKidsBefore: s.bodyKids,
    err: document.querySelector(".lt .m-err")?.textContent ?? "", paths: document.querySelectorAll(".lt-holder svg path").length, frames: ${JSON.stringify(frames)}, csp: window.__csp, tt: window.__csp.filter((x) => x.startsWith("require-trusted-types-for")).length }; })()`);
}
const clean = (s: Seen) => ({ outside: s.outside, inPart: s.inPart, toHead: s.toHead, toBody: s.toBody, headSame: s.headSame, bodyKids: s.bodyKids - s.bodyKidsBefore, tt: s.tt });
const NOTHING = { outside: [], inPart: [], toHead: 0, toBody: 0, headSame: true, bodyKids: 0, tt: 0 };

describe.skipIf(!withBrowser)("lottie in a real browser: kept inside the part", () => {
  test("refused (1): the page gains nothing outside the part", async () => {
    const s = await open("fonts-link.json");
    expect(clean(s)).toEqual(NOTHING);
    expect(s.err).toMatch(/fonts: font 1 is refused/);
  }, 30000);
  test("refused (2): the page gains nothing outside the part", async () => {
    const s = await open("fonts-system.json");
    expect(clean(s)).toEqual(NOTHING);
    expect(s.err).toMatch(/\(chars\)/);
  }, 30000);
  test("refused (3): the page gains nothing outside the part", async () => {
    const s = await open("fonts-glyph-class.json");
    expect(clean(s)).toEqual(NOTHING);
    expect(s.err).toMatch(/fonts: font 1 is refused/);
  }, 30000);
  test("kept inside the part: the drawing names nothing the page could share", async () => {
    const s = await open("ids.json");
    expect(clean(s)).toEqual(NOTHING);
    expect(s.err).toBe("");
    expect(await page!.eval<number>(`document.querySelectorAll(".lt-holder [id='root'], .lt-holder [id='x2'], .lt-holder .fixed, .lt-holder .y2").length`)).toBe(0);
  }, 30000);
  test("a good file plays and draws, and adds nothing outside the part", async () => {
    const s = await open("good.json", true);
    expect(clean(s)).toEqual(NOTHING);
    expect(s.err).toBe("");
    expect(s.paths).toBeGreaterThan(0);
    expect(new Set(s.frames.filter(Boolean)).size).toBeGreaterThan(1);   // the frame label moves: it plays
    expect(s.csp).toEqual([]);
  }, 30000);
  test("text the file draws itself draws, and adds nothing outside the part", async () => {
    const s = await open("good-glyphs.json");
    expect(clean(s)).toEqual(NOTHING);
    expect(s.err).toBe("");
    expect(s.paths).toBeGreaterThan(0);
    expect(s.csp).toEqual([]);
  }, 30000);
});
