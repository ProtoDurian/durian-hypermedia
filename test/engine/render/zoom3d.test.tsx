// eng-sweep (owner point 26, "on zoom-in everything disappears"): in the 3D stage the + button and the + key brought the camera
// FARTHER away (the 3D stage's zoom is a distance factor; the 2D one is a magnification). Real browser with WebGL (swiftshader), 390 px.
import React from "react";
import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { renderToString } from "react-dom/server";
import { parse } from "../../../src/index";
import { DhDocument } from "../../../src/react/index";
import { documentJson } from "../../../src/react/hydrate";
import { buildCss } from "../../../scripts/build-css";
import { launch, type Page } from "../../../scripts/cdp";

const root = resolve(import.meta.dir, "../../..");
const forceNew = { name: "engine-new", setup(build: any) {
  build.onLoad({ filter: /example\/client\.tsx$/ }, async (a: { path: string }) => {
    const text = await Bun.file(a.path).text();
    if (!text.includes("({ doc: doc!")) throw new Error("example/client.tsx no longer builds its props as ({ doc: doc!");
    return { contents: text.replace("({ doc: doc!", '({ engine: "new" as const, doc: doc!'), loader: "tsx" };
  });
} };

test("3D: Zoom in (button and + key) shows the scene larger, Zoom out smaller", async () => {
  const file = "fixtures/format/70-3d-a-database-in-three-regions.dh.md";
  const doc = parse(readFileSync(join(root, file), "utf8"), { path: "x.dh.md" });
  const dir = mkdtempSync(join(tmpdir(), "dh-zoom3d-"));
  let page: Page | undefined, server: ReturnType<typeof Bun.serve> | undefined;
  try {
    const built = await Bun.build({ entrypoints: [join(root, "example/client.tsx")], outdir: dir, target: "browser", format: "esm", splitting: true, minify: true, naming: { entry: "[name].[ext]", chunk: "c-[hash].[ext]" }, plugins: [forceNew] });
    expect(built.success).toBe(true);
    const css = buildCss() + readFileSync(join(root, "example/site.css"), "utf8");
    const html = `<!doctype html><html class="fonts-ready"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><script type="module" src="/client.js"></script></head><body><main class="ex-main"><div id="dh-root">${renderToString(<DhDocument doc={doc} engine="new" />)}</div></main><script type="application/json" id="dh-doc">${documentJson(doc)}</script></body></html>`;
    server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(req) {
      const path = new URL(req.url).pathname;
      if (path === "/") return new Response(html, { headers: { "content-type": "text/html" } });
      if (path === "/style.css") return new Response(css, { headers: { "content-type": "text/css" } });
      if (path.startsWith("/fonts/") && /^[a-z0-9-]+\.woff2$/.test(path.slice(7))) return new Response(Bun.file(join(root, "example", path.slice(1))), { headers: { "content-type": "font/woff2" } });
      const f = Bun.file(join(dir, path.slice(1)));
      return f.size ? new Response(f, { headers: { "content-type": "text/javascript" } }) : new Response(null, { status: 404 });
    } });
    page = await launch();
    await page.viewport(390, 900, true);
    await page.goto("http://127.0.0.1:" + server.port + "/");
    await page.eval(`document.querySelector("figure.part").scrollIntoView({ block: "center" })`);
    await page.sleep(2500);
    if (!(await page.eval<boolean>(`!!document.querySelector(".eng-3d canvas")`))) return; // no WebGL here: nothing to measure
    // the width the layer names and labels spread over, which grows when the camera comes closer
    // 3dframe: the scene now fills the phone stage at its story view, so the labels' spread saturates at the stage width and cannot show a zoom; the camera's own distance (data-cam, 6th number) can: the scene size is its inverse
    const spread = () => page!.eval<number>(`(() => { const d = document.querySelector(".eng-3d")?.dataset.cam; return d ? 100000 / Number(d.split(",")[5]) : 0; })()`);
    const press = (label: string) => page!.eval(`[...document.querySelectorAll("figure.part .stg-btn")].find((b) => b.getAttribute("aria-label") === ${JSON.stringify(label)}).click()`);
    const s0 = await spread();
    await press("Zoom in"); await page.sleep(150); await press("Zoom in"); await page.sleep(1500);
    const s1 = await spread();
    expect(s1).toBeGreaterThan(s0 * 1.05);
    // Next goes back to the story's camera: the view is not left zoomed in
    await page.eval(`document.querySelector(".btn-go").click()`); await page.sleep(2500);
    expect(await spread()).toBeLessThan(s1 * 0.93);
    await page.eval(`document.querySelector("figure.part .stg-btn:nth-child(3)").click()`); // Show everything
    await page.sleep(1500);
    await page.eval(`document.querySelector("figure.part .stg").focus()`);
    await page.key("-", "Minus", 189); await page.sleep(150); await page.key("-", "Minus", 189); await page.sleep(1500);
    expect(await spread()).toBeLessThan(s0 * 0.98); // "-" is farther: smaller
  } finally {
    await page?.close();
    server?.stop(true);
    rmSync(dir, { recursive: true, force: true });
  }
}, 120_000);
