// The host media loader in a real browser (Chrome), under a strict CSP with require-trusted-types-for 'script' and blob: allowed for img, media and
// connect. A server records every request it gets, so the checks are about the network, not only the DOM:
//   - an address the loader claims (media:, @path) never reaches the server, and no claimed address is in the page's markup;
//   - blobs made from loader bytes are drawn, then revoked when the page unmounts; a blob the host made is not revoked by the package;
//   - nothing is asked for before it is needed: a far image waits for the viewport, a video and an audio file wait for Play;
//   - a thumbnail sprite name that ends the CSS string and starts a second url() adds no request (with and without a loader).
// Skipped when google-chrome is not installed, or with DH_CDP_TEST=0.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { which } from "bun";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, normalize, resolve } from "node:path";
import type { Page } from "../scripts/cdp";

const withBrowser = !!which("google-chrome") && process.env.DH_CDP_TEST !== "0";
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; media-src 'self' blob:; connect-src 'self' blob:; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; require-trusted-types-for 'script'";
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP8z8Dwn4GBgYGJAQoAHhgCAh6X4CYAAAAASUVORK5CYII="), (c) => c.charCodeAt(0));

let dir = "", server: ReturnType<typeof Bun.serve> | null = null, page: Page | null = null;
const ledger: string[] = [];
beforeAll(async () => {
  if (!withBrowser) return;
  dir = mkdtempSync(join(tmpdir(), "dh-media-loader-"));
  // built in a child process (a Bun.build inside the test runner can fail to resolve relative imports on its first call)
  const r = Bun.spawnSync(["bun", "build", join(import.meta.dir, "media-loader-page.tsx"), "--outdir", dir, "--splitting", "--format=esm", "--target=browser", "--entry-naming=[name].[ext]", "--chunk-naming=c-[hash].[ext]", "--production"], { cwd: resolve(import.meta.dir, ".."), env: { ...process.env, NODE_ENV: "production" }, stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error("the test page did not build: " + r.stderr.toString().slice(0, 2000));
  writeFileSync(join(dir, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><title>media loader</title><style>.vm-seek{display:block;height:24px}</style><script type="module" src="media-loader-page.js"></script></head><body><div id="root"></div></body></html>`);
  const TYPES: Record<string, string> = { html: "text/html; charset=utf-8", js: "text/javascript", css: "text/css" };
  server = Bun.serve({ port: 0, hostname: "127.0.0.1", async fetch(req) {
    const url = new URL(req.url), path = decodeURIComponent(url.pathname);
    ledger.push(path + url.search);
    const h = { "Content-Security-Policy": CSP, "X-Content-Type-Options": "nosniff" };
    if (path === "/t.vtt") return new Response(`WEBVTT\n\n00:00:00.000 --> 00:00:30.000\nsprite.jpg"), url("/pixel?leak=1\n\n00:00:30.000 --> 00:01:00.000\n/sprite-ok.png#xywh=0,0,2,2\n`, { headers: { ...h, "Content-Type": "text/vtt" } });
    if (path === "/sprite-ok.png") return new Response(PNG, { headers: { ...h, "Content-Type": "image/png" } });
    if (path === "/pixel" || path === "/v.mp4") return new Response("x", { headers: h });
    const file = normalize(join(dir, path.replace(/^\/$/, "/index.html")));
    if (!file.startsWith(dir + "/") || !(await Bun.file(file).exists())) return new Response("not found", { status: 404, headers: h });
    return new Response(Bun.file(file), { headers: { ...h, "Content-Type": TYPES[file.split(".").pop()!] ?? "application/octet-stream" } });
  } });
  const { launch } = await import("../scripts/cdp");
  page = await launch();
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__csp = []; window.__errs = []; document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(e.effectiveDirective + " " + e.blockedURI)); addEventListener("error", (e) => window.__errs.push(String(e.message).slice(0, 200))); addEventListener("unhandledrejection", (e) => window.__errs.push("rejection " + String(e.reason).slice(0, 200)));` });
  await page.viewport(1000, 800, false);
}, 90000);
afterAll(async () => { await page?.close(); server?.stop(true); if (dir) rmSync(dir, { recursive: true, force: true }); });

const open = async (query: string) => { ledger.length = 0; await page!.goto(`http://127.0.0.1:${server!.port}/index.html?${query}`); await page!.sleep(1800); };
const asked = () => page!.eval<string[]>(`window.__asked.map((a) => a.replace(/:\\d+$/, ""))`);

describe.skipIf(!withBrowser)("the host media loader in a real browser", () => {
  test("what is asked for, and when: near parts at once, a far image on scroll, video and audio on Play", async () => {
    await open("case=loader");
    let a = await asked();
    for (const want of ["markdown/image/:media:one.png", "markdown/image/:media:secret.png", "gallery/image/:@dir/two.png", "compare-image/image/after:media:own.png", "lottie/lottie/:media:spin.json", "pdf/pdf/:media:nope.pdf", "video/image/poster:media:clip.jpg"]) expect(a).toContain(want);
    expect(a.filter((x) => /far\.png|clip\.mp4|talk\.mp3/.test(x))).toEqual([]);   // not near, not played
    const maxBytes = await page!.eval<string[]>(`window.__asked.filter((a) => /pdf\\/pdf|clip.jpg|spin/.test(a))`);
    expect(maxBytes.every((x) => /:\d+$/.test(x))).toBe(true);   // the loader is told the cap of each file
    // Play: the video, then the audio, are asked for when pressed
    await page!.eval(`document.querySelector(".vm-bigplay").click()`); await page!.sleep(800);
    a = await asked(); expect(a).toContain("video/video/:media:clip.mp4"); expect(a.filter((x) => /talk\.mp3/.test(x))).toEqual([]);
    await page!.eval(`document.querySelector(".am .m-play").click()`); await page!.sleep(800);
    a = await asked(); expect(a).toContain("audio/audio/:media:talk.mp3");
    // scrolling brings the far image near
    await page!.eval(`window.scrollTo(0, document.body.scrollHeight)`); await page!.sleep(1200);
    a = await asked(); expect(a).toContain("markdown/image/:media:far.png");
  }, 60000);
  test("print and a static page hold every image: far images are asked for without scrolling", async () => {
    await open("case=loader");
    expect((await asked()).filter((x) => /far\.png/.test(x))).toEqual([]);
    await page!.send("Emulation.setEmulatedMedia", { media: "print" }); await page!.sleep(1200);   // print media (the browser's own print preview, a PDF capture)
    expect(await asked()).toContain("markdown/image/:media:far.png");
    await page!.send("Emulation.setEmulatedMedia", { media: "" });
    await open("case=loader&static=1");   // a static page (DocumentProps.static)
    expect(await asked()).toContain("markdown/image/:media:far.png");
  }, 60000);
  test("a play() the browser refuses after the loader's answer shows the Play button again, and the second press plays inside the click", async () => {
    for (const [press, sel] of [[".vm-bigplay", "video"], [".am .m-play", "audio"]] as const) {
      await open("case=loader&stubplay=1");
      await page!.eval(`document.querySelector("${press}").click()`); await page!.sleep(900);
      const s1 = await page!.eval<any>(`({ plays: window.__playCalls ?? 0, ready: !!document.querySelector(".m-note") && /Ready: press play/.test(document.body.innerText), bigplay: !!document.querySelector(".vm-bigplay"), failed: /could not be loaded/.test(document.body.innerText) })`);
      expect(s1.plays).toBeGreaterThan(0);        // it was tried, and refused
      expect(s1.ready).toBe(true);
      expect(s1.failed).toBe(false);
      if (sel === "video") expect(s1.bigplay).toBe(true);
      const before = (await asked()).filter((x) => /clip\.mp4|talk\.mp3/.test(x)).length;
      const s2 = await page!.eval<any>(`(() => { window.__allowPlay = true; const n = window.__playCalls; document.querySelector("${press}").click(); return { synchronous: window.__playCalls - n, hadSrc: window.__playHadSrc }; })()`);
      expect(s2.synchronous).toBe(1);             // play() ran inside the click
      expect(s2.hadSrc).toBe(true);               // with the file already at hand
      await page!.sleep(500);
      expect((await asked()).filter((x) => /clip\.mp4|talk\.mp3/.test(x)).length).toBe(before);   // it was not asked for again
    }
  }, 90000);
  test("what is drawn: bytes, a host blob and a refusal with its reason; svg bytes and an author's blob: are refused; nothing claimed is in the page", async () => {
    await open("case=loader");
    const s = await page!.eval<any>(`(() => { const d = document.querySelector(".dh-doc"); return {
      imgs: [...d.querySelectorAll("img")].map((i) => ({ alt: i.alt, blob: i.src.startsWith("blob:"), w: i.naturalWidth })),
      off: [...d.querySelectorAll(".dh-img-off")].map((e) => e.textContent + "|" + (e.title || "")),
      errs: [...d.querySelectorAll(".m-err, .cw-error, .dh-error")].map((e) => e.textContent.slice(0, 120)),
      poster: !!document.querySelector("video[poster^='blob:']"), claimed: /(src|href|poster)="(media:|@)/.test(document.body.innerHTML), forged: document.body.innerHTML.includes("/forged"), csp: window.__csp, errors: window.__errs }; })()`);
    expect(s.imgs.filter((i: any) => i.blob && i.w === 2).length).toBeGreaterThanOrEqual(5);   // prose bytes, prose host blob, gallery x2, compare x2
    expect(s.off).toContain("Prose refused|you cannot open this file");
    expect(s.off.some((x: string) => x.startsWith("Prose svg|the file type is not one this part shows"))).toBe(true);
    expect(s.off.some((x: string) => x.startsWith("Forged|"))).toBe(true);
    expect(s.errs.join(" ")).toContain("the host's loader did not take this address");   // a claimed pdf the loader does not serve
    expect(s.poster).toBe(true);
    expect(s.claimed).toBe(false);
    expect(s.forged).toBe(false);
    expect(s.csp).toEqual([]);
    expect(s.errors).toEqual([]);
  }, 60000);
  test("the network: a claimed address and an author blob: never reach the server; only the page and its script do", async () => {
    await open("case=loader");
    await page!.eval(`document.querySelector(".vm-bigplay").click(); window.scrollTo(0, document.body.scrollHeight)`); await page!.sleep(1500);
    const bad = ledger.filter((p) => !/^\/(index\.html|media-loader-page\.js|c-[\w-]+\.js|favicon\.ico)?(\?.*)?$/.test(p));
    expect(bad).toEqual([]);
  }, 60000);
  test("revocation: every blob made from bytes is revoked on unmount; the host's own blob is left alone", async () => {
    await open("case=loader");
    await page!.eval(`document.querySelector(".vm-bigplay").click(); window.scrollTo(0, document.body.scrollHeight)`); await page!.sleep(1500);
    const r = await page!.eval<any>(`(() => { const hostBlobs = window.__host.slice(); const made = window.__made.filter((u) => !hostBlobs.includes(u)); const before = window.__revoked.length; window.__unmount();
      return new Promise((res) => setTimeout(() => res({ made: made.length, revokedMade: made.filter((u) => window.__revoked.includes(u)).length, hostRevoked: hostBlobs.filter((u) => window.__revoked.includes(u)).length, csp: window.__csp }), 400)); })()`);
    expect(r.made).toBeGreaterThanOrEqual(5);
    expect(r.revokedMade).toBe(r.made);
    expect(r.hostRevoked).toBe(0);
    expect(r.csp).toEqual([]);
  }, 60000);
  for (const loader of ["0", "1"]) {
    test(`a thumbnail sprite name that starts a second url() adds no request (${loader === "1" ? "with" : "without"} a loader)`, async () => {
      await open(`case=sprite&loader=${loader}`);
      if (loader === "1") await page!.eval(`document.querySelector(".vm-bigplay")?.click()`);
      const hover = async (f: number) => { const r = await page!.eval<{ x: number; y: number; w: number }>(`(() => { const r = document.querySelector(".vm-seek").getBoundingClientRect(); return { x: r.left, y: r.top + r.height / 2, w: r.width }; })()`); await page!.mouse("mouseMoved", r.x + r.w * f, r.y); await page!.sleep(900); };
      await hover(0.2);   // the cue with the hostile name
      const hostile = await page!.eval<string>(`getComputedStyle(document.querySelector(".vm-thumb") ?? document.body).backgroundImage`);
      await hover(0.8);   // the cue with a good name: the hover works, so the first result means something
      expect(ledger.filter((p) => p.startsWith("/pixel"))).toEqual([]);
      expect(ledger.some((p) => p.startsWith("/sprite-ok.png"))).toBe(true);
      expect(hostile).not.toContain("pixel");
    }, 60000);
  }
});
