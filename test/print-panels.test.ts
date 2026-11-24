// Print (SPEC 4.1) in a real browser: a sheet cannot be clicked, so every tab panel and every accordion row prints open,
// each tab's panel under its own title (the tab bar is not printed), whether or not the reader ever opened it; after
// printing the page is as the reader left it. With scripts off the tabs print the same (CSS only); the accordion rows
// open by CSS where the browser has ::details-content. Skipped when google-chrome is not installed, or with DH_CDP_TEST=0.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { which } from "bun";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, normalize } from "node:path";
import type { Page } from "../scripts/cdp";

const withBrowser = !!which("google-chrome") && process.env.DH_CDP_TEST !== "0";
const MD = "# Print panels\n\nSome words first.\n\n:::tabs\n#### First tab\nWords of the first tab.\n#### Second tab\nWords of the second tab.\n#### Third tab\nWords of the third tab.\n:::\n\n:::accordion\n#### First row\nBody of the first row.\n#### Second row\nBody of the second row.\n:::\n\nSome words last.\n";

let dir = "", server: ReturnType<typeof Bun.serve> | null = null, page: Page | null = null;
beforeAll(async () => {
  if (!withBrowser) return;
  dir = mkdtempSync(join(tmpdir(), "dh-print-panels-"));
  const make = Bun.spawnSync(["bun", "-e", `
    import React from "react"; import { renderToString } from "react-dom/server";
    import { DhDocument } from "${join(import.meta.dir, "../src/react/index")}";
    import { documentJson } from "${join(import.meta.dir, "../src/react/hydrate")}";
    import { parse } from "${join(import.meta.dir, "../src/index")}";
    import { buildCss } from "${join(import.meta.dir, "../scripts/build-css")}";
    const doc = parse(${JSON.stringify(MD)});
    await Bun.write(${JSON.stringify(join(dir, "body.html"))}, renderToString(React.createElement(DhDocument, { doc })));
    await Bun.write(${JSON.stringify(join(dir, "doc.json"))}, documentJson(doc));
    await Bun.write(${JSON.stringify(join(dir, "styles.css"))}, buildCss());`], { cwd: join(import.meta.dir, ".."), env: { ...process.env } });
  if (make.exitCode !== 0) throw new Error("the server HTML was not made: " + make.stderr.toString().slice(0, 2000));
  const r = Bun.spawnSync(["bun", "build", join(import.meta.dir, "print-panels-page.tsx"), "--outdir", dir, "--format=esm", "--target=browser", "--entry-naming=[name].[ext]"], { cwd: join(import.meta.dir, ".."), env: { ...process.env } });
  if (r.exitCode !== 0) throw new Error("the test page did not build: " + r.stderr.toString().slice(0, 2000));
  const body = await Bun.file(join(dir, "body.html")).text(), json = await Bun.file(join(dir, "doc.json")).text();
  const shell = (js: boolean) => `<!doctype html><html><head><meta charset="utf-8"><title>print panels</title><link rel="stylesheet" href="styles.css"></head><body><div id="root">${body}</div><script type="application/json" id="doc">${json}</script>${js ? '<script type="module" src="print-panels-page.js"></script>' : ""}</body></html>`;
  writeFileSync(join(dir, "index.html"), shell(true));
  writeFileSync(join(dir, "nojs.html"), shell(false));
  const TYPES: Record<string, string> = { html: "text/html; charset=utf-8", js: "text/javascript", css: "text/css" };
  server = Bun.serve({ port: 0, hostname: "127.0.0.1", async fetch(req) {
    const file = normalize(join(dir, decodeURIComponent(new URL(req.url).pathname).replace(/^\/$/, "/index.html")));
    if (!file.startsWith(dir + "/") || !(await Bun.file(file).exists())) return new Response("not found", { status: 404 });
    return new Response(Bun.file(file), { headers: { "Content-Type": TYPES[file.split(".").pop()!] ?? "application/octet-stream" } });
  } });
  const { launch } = await import("../scripts/cdp");
  page = await launch();
}, 90000);
afterAll(async () => { await page?.close(); server?.stop(true); if (dir) rmSync(dir, { recursive: true, force: true }); });

type Seen = { panels: boolean[]; titles: string[]; bar: boolean; rows: boolean[]; open: number };
const SEE = `(() => {
  // drawn: laid out and not skipped (a closed row's body keeps a size under content-visibility: hidden in Chrome)
  const h = (e) => e.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true }) && e.getBoundingClientRect().height > 0;
  const panels = [...document.querySelectorAll(".tab-panel")];
  return { panels: panels.map(h), titles: panels.map((p) => getComputedStyle(p, "::before").content), bar: getComputedStyle(document.querySelector(".tab-bar")).display !== "none",
    rows: [...document.querySelectorAll(".acc-item .acc-body")].map(h), open: document.querySelectorAll(".acc-item[open]").length };
})()`;
async function load(file: string, media: "screen" | "print"): Promise<Page> {
  const p = page!;
  await p.viewport(800, 900);
  await p.send("Emulation.setEmulatedMedia", { media, features: [] });
  await p.goto(`http://127.0.0.1:${server!.port}/${file}`);
  if (file === "index.html") for (let i = 0; i < 50 && !(await p.eval<boolean>("!!window.__ready")); i++) await p.sleep(100);
  await p.sleep(300);
  return p;
}

describe.skipIf(!withBrowser)("print: every tab panel and every accordion row, open", () => {
  test("on screen: one tab panel, the tab bar, closed rows (as before)", async () => {
    const s = await (await load("index.html", "screen")).eval<Seen>(SEE);
    expect(s.panels).toEqual([true, false, false]);
    expect(s.bar).toBe(true);
    expect(s.titles.every((t) => t === "none" || t === "normal")).toBe(true);
    expect(s.rows).toEqual([false, false]);
  }, 60000);
  test("printing: every panel under its own title, no tab bar, every row open; afterprint: as the reader left it", async () => {
    const p = await load("index.html", "print");
    await p.eval(`document.querySelectorAll(".acc-item")[1].open = true`); // the reader opened the second row
    await p.eval(`dispatchEvent(new Event("beforeprint"))`);
    const s = await p.eval<Seen>(SEE);
    expect(s.panels).toEqual([true, true, true]);
    expect(s.titles).toEqual(['"First tab"', '"Second tab"', '"Third tab"']);
    expect(s.bar).toBe(false);
    expect(s.rows).toEqual([true, true]);
    await p.eval(`dispatchEvent(new Event("afterprint"))`);
    const a = await p.eval<{ open: boolean[] }>(`({ open: [...document.querySelectorAll(".acc-item")].map((d) => d.open) })`);
    expect(a.open).toEqual([false, true]);
  }, 60000);
  test("scripts off: the same, by CSS alone", async () => {
    const s = await (await load("nojs.html", "print")).eval<Seen>(SEE);
    expect(s.panels).toEqual([true, true, true]);
    expect(s.titles).toEqual(['"First tab"', '"Second tab"', '"Third tab"']);
    expect(s.bar).toBe(false);
    expect(s.rows).toEqual([true, true]);
    expect(s.open).toBe(0); // nothing was changed: CSS opened them for the sheet only
  }, 60000);
});
