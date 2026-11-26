// eng-sweep (owner point 28, zoom-in breakage): a reader who zoomed in and then presses Next must not see the camera jump back to the
// story's frame and glide from there: the step's glide starts from the view on screen. Real browser, 390 px wide (phone), the same
// page the example site draws, engine "new" forced as scripts/match.ts does.
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
const SRC = '# Glide\n\n```animation\nbox a "alpha"\nbox b "beta"\nbox c "gamma"\na -> b\nb -> c\n@step First\nhighlight a\n@step Second\nhighlight c\n```\n';
const forceNew = { name: "engine-new", setup(build: any) {
  build.onLoad({ filter: /example\/client\.tsx$/ }, async (a: { path: string }) => {
    const text = await Bun.file(a.path).text();
    if (!text.includes("({ doc: doc!")) throw new Error("example/client.tsx no longer builds its props as ({ doc: doc!");
    return { contents: text.replace("({ doc: doc!", '({ engine: "new" as const, doc: doc!'), loader: "tsx" };
  });
} };

test("zoom in, then Next: the first frame of the glide is the view the reader had, not the story's frame", async () => {
  const doc = parse(SRC, { path: "p.dh.md" });
  const dir = mkdtempSync(join(tmpdir(), "dh-glide-"));
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
    for (const width of [1280, 390]) {
      await page.viewport(width, 900, width < 600);
      await page.goto("http://127.0.0.1:" + server.port + "/");
      await page.eval(`document.querySelector("figure.part").scrollIntoView({ block: "center" })`);
      await page.sleep(700);
      const vb = () => page!.eval<number[]>(`document.querySelector("svg.eng-svg").getAttribute("viewBox").split(/\\s+/).map(Number)`);
      const start = await vb();
      await page.eval(`document.querySelector(".stg").focus()`);
      await page.key("+", "Equal", 187); await page.sleep(100); await page.key("+", "Equal", 187); await page.sleep(400);
      const zoomed = await vb();
      expect(zoomed[2]).toBeLessThan(start[2] * 0.8); // the zoom took
      // sample the first frames of the step the reader asks for
      const first = await page.eval<number[]>(`new Promise((res) => { const svg = document.querySelector("svg.eng-svg"); document.querySelector(".btn-go").click(); requestAnimationFrame(() => requestAnimationFrame(() => res(svg.getAttribute("viewBox").split(/\\s+/).map(Number)))); })`);
      // within the first two frames the view has moved a little way from the zoomed view, not the whole way to the story's frame
      expect(Math.abs(first[2] - zoomed[2])).toBeLessThan(Math.abs(start[2] - zoomed[2]) * 0.5);
      await page.sleep(2600);
      const end = await vb();
      expect(Math.abs(end[2] - start[2])).toBeLessThan(start[2] * 0.6 + 1); // it glided on to the story's own frame for step 2
    }
  } finally {
    await page?.close();
    server?.stop(true);
    rmSync(dir, { recursive: true, force: true });
  }
}, 120_000);
