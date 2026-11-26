// Audio can be skipped ahead (owner feedback, point 27): in a real browser, a click and a drag on the wave, the skip buttons
// (forward and back) and the arrow keys on the focused wave all move the sound, at 1280 and 390 px, from a server that answers
// byte-range requests (as example/serve.ts does; Safari on an iPhone cannot seek from one that does not).
import React from "react";
import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { renderToString } from "react-dom/server";
import { parse } from "../src/index";
import { DhDocument } from "../src/react/index";
import { documentJson } from "../src/react/hydrate";
import { buildCss } from "../scripts/build-css";
import { launch, type Page } from "../scripts/cdp";
import { byteRange } from "../example/serve";

const root = resolve(import.meta.dir, "..");
const SRC = '# Talk\n\n```audio src="media/talk.mp3" title="A page that talks" duration=0:57 skip=10\npeaks: media/talk.peaks.json\nchapter 0:00 Welcome\nchapter 0:24 Middle\n```\n';

test("click, drag, skip buttons and arrow keys all move the sound, at 1280 and 390, from a server that answers byte ranges", async () => {
  const doc = parse(SRC, { path: "p.dh.md" });
  const dir = mkdtempSync(join(tmpdir(), "dh-audio-seek-"));
  let page: Page | undefined, server: ReturnType<typeof Bun.serve> | undefined;
  const ranges: string[] = [];
  try {
    const built = await Bun.build({ entrypoints: [join(root, "example/client.tsx")], outdir: dir, target: "browser", format: "esm", splitting: true, minify: true, naming: { entry: "[name].[ext]", chunk: "c-[hash].[ext]" }, define: { "process.env.NODE_ENV": '"production"' } });
    expect(built.success).toBe(true);
    const css = buildCss() + readFileSync(join(root, "example/site.css"), "utf8");
    const html = `<!doctype html><html class="fonts-ready"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><script type="module" src="/client.js"></script></head><body><main class="ex-main"><div id="dh-root">${renderToString(<DhDocument doc={doc} />)}</div></main><script type="application/json" id="dh-doc">${documentJson(doc)}</script></body></html>`;
    const media = Bun.file(join(root, "src/parts/audio/media/talk.mp3"));
    server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(req) {
      const path = new URL(req.url).pathname;
      if (path === "/favicon.ico") return new Response(null, { status: 204 });
      const headers = { "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; media-src 'self'" };
      if (path === "/") return new Response(html, { headers: { ...headers, "content-type": "text/html" } });
      if (path === "/style.css") return new Response(css, { headers: { ...headers, "content-type": "text/css" } });
      if (path.startsWith("/fonts/") && /^[a-z0-9-]+\.woff2$/.test(path.slice(7))) return new Response(Bun.file(join(root, "example", path.slice(1))), { headers: { ...headers, "content-type": "font/woff2" } });
      if (path === "/media/talk.peaks.json") return new Response(Bun.file(join(root, "src/parts/audio/media/talk.peaks.json")), { headers: { ...headers, "content-type": "application/json" } });
      if (path === "/media/talk.mp3") {
        const h = req.headers.get("range"); if (h) ranges.push(h);
        const r = byteRange(h, media.size), base = { ...headers, "content-type": "audio/mpeg", "accept-ranges": "bytes" };
        if (r === "bad") return new Response(null, { status: 416, headers: { ...base, "content-range": `bytes */${media.size}` } });
        if (r) return new Response(media.slice(r[0], r[1] + 1), { status: 206, headers: { ...base, "content-range": `bytes ${r[0]}-${r[1]}/${media.size}` } });
        return new Response(media, { headers: base });
      }
      return new Response(Bun.file(join(dir, path.slice(1))), { headers: { ...headers, "content-type": "text/javascript" } });
    }});
    page = await launch();
    const at = async () => page!.eval<number>(`+document.querySelector('.am audio').currentTime.toFixed(1)`);
    const press = (label: string) => page!.eval(`[...document.querySelectorAll('.am .m-ctl')].find((b) => (b.getAttribute('aria-label') || '').toLowerCase().startsWith('${label}')).click()`);
    for (const width of [1280, 390]) {
      await page.viewport(width, 900, width < 600);
      await page.goto("http://127.0.0.1:" + server.port + "/");
      await page.eval(`new Promise((r) => { const a = document.querySelector('.am audio'); if (a.readyState >= 1) r(true); else a.addEventListener('loadedmetadata', () => r(true)); })`);
      await page.eval(`document.querySelector('.am').scrollIntoView({ block: 'center' })`);
      await page.sleep(200);
      const r = await page.eval<{ x: number; y: number; w: number; h: number }>(`(() => { const b = document.querySelector('.am-wave').getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`);
      const px = (f: number) => r.x + r.w * f, py = r.y + r.h / 2;
      // a click on the wave
      await page.mouse("mouseMoved", px(0.5), py); await page.mouse("mousePressed", px(0.5), py, "left", 1); await page.mouse("mouseReleased", px(0.5), py, "left", 0);
      await page.sleep(300); expect(Math.abs((await at()) - 28.5)).toBeLessThan(3);
      // a drag ahead, and back
      await page.drag(px(0.2), py, px(0.8), py, { steps: 8 }); await page.sleep(300); expect(Math.abs((await at()) - 45.6)).toBeLessThan(3);
      await page.drag(px(0.8), py, px(0.1), py, { steps: 8 }); await page.sleep(300); expect(Math.abs((await at()) - 5.7)).toBeLessThan(3);
      // the skip buttons, forward then back
      const a0 = await at(); await press("forward"); await page.sleep(300); expect(await at()).toBeCloseTo(a0 + 10, 0);
      await press("back"); await page.sleep(300); expect(await at()).toBeCloseTo(a0, 0);
      // the arrow keys on the focused wave
      await page.eval(`document.querySelector('.am-wave').focus()`);
      await page.key("ArrowRight", "ArrowRight", 39); await page.sleep(300); expect(await at()).toBeCloseTo(a0 + 5, 0);
      await page.key("ArrowLeft", "ArrowLeft", 37); await page.sleep(300); expect(await at()).toBeCloseTo(a0, 0);
      // the wave moved with the sound (its slider value follows) and no "cannot jump" note was shown
      expect(await page.eval<number>(`+document.querySelector('.am-wave').getAttribute('aria-valuenow')`)).toBe(Math.round(a0));
      expect(await page.eval<boolean>(`!!document.querySelector('.am .m-note')`)).toBe(false);
      if (width < 600) {
        // a finger drag along the wave moves the sound (the wave takes sideways touch, the page keeps up and down)
        await page.touch("touchStart", [{ x: px(0.2), y: py }]);
        for (let k = 1; k <= 8; k++) { await page.touch("touchMove", [{ x: px(0.2) + (r.w * 0.6 * k) / 8, y: py }]); await page.sleep(30); }
        await page.touch("touchEnd", []); await page.sleep(300);
        expect(Math.abs((await at()) - 45.6)).toBeLessThan(3);
        // a finger that starts on the wave and swipes up scrolls the page: the browser ends the drag; the wave must not stay where the finger left it
        await page.touch("touchStart", [{ x: px(0.7), y: py }]);
        for (let k = 1; k <= 6; k++) { await page.touch("touchMove", [{ x: px(0.7) + k, y: py - k * 12 }]); await page.sleep(30); }
        await page.touch("touchEnd", []);
        await page.sleep(300);
        await page.eval(`document.querySelector('.am audio').play().catch(() => {})`);
        await page.sleep(1500);
        const now = await page.eval<{ t: number; v: number; playing: boolean }>(`(() => { const a = document.querySelector('.am audio'); return { t: a.currentTime, v: +document.querySelector('.am-wave').getAttribute('aria-valuenow'), playing: !a.paused }; })()`);
        expect(now.playing).toBe(true);
        expect(Math.abs(now.v - now.t)).toBeLessThan(2);   // the wave follows the sound again (before: it stayed where the cancelled drag left it)
        await page.eval(`document.querySelector('.am audio').pause()`);
      }
    }
  } finally {
    await page?.close();
    server?.stop(true);
    rmSync(dir, { recursive: true, force: true });
  }
}, 120_000);
