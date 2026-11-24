import React from "react";
import { test, expect } from "bun:test";
import { renderToString } from "react-dom/server";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parse } from "../src/index";
import { DhDocument } from "../src/react/index";
import { documentJson } from "../src/react/hydrate";
import { buildCss } from "../scripts/build-css";
import { launch, type Page } from "../scripts/cdp";

const root = resolve(import.meta.dir, "..");

test("fishbone paints every current-step cause within 300 ms, in both layouts and themes", async () => {
  // Use the public Format sample: the first step and the last each add causes.
  const doc = parse(readFileSync(join(root, "fixtures/format/00-fishbone.dh.md"), "utf8"));
  const expected = doc.blocks.find(b => b.type === "fishbone");
  if (!expected || expected.type !== "fishbone") throw new Error("public fishbone sample missing");
  const dir = mkdtempSync(join(tmpdir(), "dh-fish-paint-"));
  let page: Page | undefined;
  let server: ReturnType<typeof Bun.serve> | undefined;
  try {
    const built = await Bun.build({
      entrypoints: [join(root, "example/client.tsx")], outdir: dir,
      target: "browser", format: "esm", splitting: true, minify: true,
      naming: { entry: "[name].[ext]", chunk: "c-[hash].[ext]" },
      define: { "process.env.NODE_ENV": '"production"' },
    });
    expect(built.success).toBe(true);
    const css = buildCss() + readFileSync(join(root, "example/site.css"), "utf8");
    const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><script type="module" src="/client.js"></script></head><body><main class="ex-main"><div id="dh-root">${renderToString(<DhDocument doc={doc} />)}</div></main><script type="application/json" id="dh-doc">${documentJson(doc)}</script></body></html>`;
    server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(req) {
      const path = new URL(req.url).pathname;
      if (path === "/favicon.ico") return new Response(null, { status: 204 });
      const headers = { "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; require-trusted-types-for 'script'" };
      if (path === "/") return new Response(html, { headers: { ...headers, "content-type": "text/html" } });
      if (path === "/style.css") return new Response(css, { headers: { ...headers, "content-type": "text/css" } });
      return new Response(Bun.file(join(dir, path.slice(1))), { headers: { ...headers, "content-type": "text/javascript" } });
    }});
    page = await launch();
    const mismatches: string[] = [];
    for (const width of [1280, 390]) for (const dark of [false, true]) {
      await page.viewport(width, 900, width < 600);
      await page.dark(dark);
      await page.goto("http://127.0.0.1:" + server.port + "/");
      await page.eval("document.fonts.ready.then(() => true)");
      for (let step = 0; step < expected.data.steps.length; step++) {
        if (step) await page.eval('document.querySelector(".dh-fish button.btn-go").click()');
        await page.sleep(300); // the new step must already be readable
        const state = await page.eval<{ count: number; box: { x: number; y: number; width: number; height: number } }>(`(() => {
          const fish = document.querySelector(".dh-fish");
          const svg = [...fish.querySelectorAll("svg")].find(s => s.getBoundingClientRect().width > 0);
          const r = svg.getBoundingClientRect();
          return { count: svg.querySelectorAll('[data-dh-slot="cause"]').length,
            box: { x: r.x, y: r.y, width: r.width, height: r.height } };
        })()`);
        const count = expected.data.categories.flatMap(c => c.causes).filter(c => c.step <= step).length;
        expect(state.count).toBe(count);
        const before = await page.send("Page.captureScreenshot", { format: "png", clip: { ...state.box, scale: 1 }, captureBeyondViewport: true });
        // The settled step must paint exactly like its inactive-animation state. DOM opacity alone misses an SVG paint cache bug.
        await page.eval('document.querySelector(".dh-fish").querySelectorAll(".fish-bone,.fish-cause").forEach(e => e.style.animation = "none")');
        const after = await page.send("Page.captureScreenshot", { format: "png", clip: { ...state.box, scale: 1 }, captureBeyondViewport: true });
        if (before.data !== after.data) mismatches.push(width + "/" + (dark ? "dark" : "light") + "/step" + (step + 1));
      }
    }
    expect(mismatches).toEqual([]);
  } finally {
    await page?.close();
    server?.stop(true);
    rmSync(dir, { recursive: true, force: true });
  }
}, 120_000);

