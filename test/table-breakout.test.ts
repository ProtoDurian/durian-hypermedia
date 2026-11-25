// A table wider than the text column (0.7.0-rc.3, the owner's row 8: at 1680 px the widest table lost its last columns).
// On a wide screen a top-level table leaves the column, as wide as its columns need and at most the page less 16 px
// each side, centred on the column; a table that fits keeps the column; tables inside other things keep their box;
// print keeps the column. CSS only (no script runs here): the page paints at its final width, so nothing moves on load.
// Real browser; skipped when google-chrome is not installed, or with DH_CDP_TEST=0.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { which } from "bun";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, normalize } from "node:path";
import type { Page } from "../scripts/cdp";

const withBrowser = !!which("google-chrome") && process.env.DH_CDP_TEST !== "0";
const tok = (i: number, j: number) => `Cell${i}x${j}LongUnbrokenWordAbcdefgh`; // no break opportunity: a column is at least this wide
const row = (i: number, n: number) => `| ${Array.from({ length: n }, (_, j) => tok(i, j)).join(" | ")} |`;
const wide = (n: number) => [`| ${Array.from({ length: n }, (_, j) => `Column ${j + 1}`).join(" | ")} |`, `|${Array(n).fill("---").join("|")}|`, row(1, n), row(2, n)].join("\n");
const MD = `# Tables\n\nSome words.\n\n${wide(4)}\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n${wide(9)}\n\n- a list\n\n  ${wide(4).split("\n").join("\n  ")}\n`;
const COL = 800;

let dir = "", server: ReturnType<typeof Bun.serve> | null = null, page: Page | null = null;
beforeAll(async () => {
  if (!withBrowser) return;
  dir = mkdtempSync(join(tmpdir(), "dh-table-breakout-"));
  const make = Bun.spawnSync(["bun", "-e", `
    import React from "react"; import { renderToString } from "react-dom/server";
    import { DhDocument } from "${join(import.meta.dir, "../src/react/index")}";
    import { parse } from "${join(import.meta.dir, "../src/index")}";
    import { buildCss } from "${join(import.meta.dir, "../scripts/build-css")}";
    await Bun.write(${JSON.stringify(join(dir, "body.html"))}, renderToString(React.createElement(DhDocument, { doc: parse(${JSON.stringify(MD)}) })));
    await Bun.write(${JSON.stringify(join(dir, "styles.css"))}, buildCss());`], { cwd: join(import.meta.dir, "..") });
  if (make.exitCode !== 0) throw new Error("the page was not made: " + make.stderr.toString().slice(0, 2000));
  const body = await Bun.file(join(dir, "body.html")).text();
  writeFileSync(join(dir, "page.css"), `body { margin: 0; } .col { width: min(${COL}px, 100% - 32px); margin: 0 auto; }`);
  writeFileSync(join(dir, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><title>tables</title><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="page.css"></head><body><main class="col">${body}</main></body></html>`);
  const TYPES: Record<string, string> = { html: "text/html; charset=utf-8", css: "text/css" };
  server = Bun.serve({ port: 0, hostname: "127.0.0.1", async fetch(req) {
    const file = normalize(join(dir, decodeURIComponent(new URL(req.url).pathname).replace(/^\/$/, "/index.html")));
    if (!file.startsWith(dir + "/") || !(await Bun.file(file).exists())) return new Response("not found", { status: 404 });
    return new Response(Bun.file(file), { headers: { "Content-Type": TYPES[file.split(".").pop()!] ?? "application/octet-stream" } });
  } });
  const { launch } = await import("../scripts/cdp");
  page = await launch();
}, 90000);
afterAll(async () => { await page?.close(); server?.stop(true); if (dir) rmSync(dir, { recursive: true, force: true }); });

type Box = { l: number; r: number; w: number; scrolls: boolean };
type Seen = { vw: number; col: Box; t: Box[]; pageScrollsX: boolean };
async function look(w: number, media: "screen" | "print" = "screen"): Promise<Seen> {
  const p = page!;
  await p.viewport(w, 900);
  await p.send("Emulation.setEmulatedMedia", { media, features: [] });
  await p.goto(`http://127.0.0.1:${server!.port}/index.html`);
  await p.sleep(300);
  return p.eval<Seen>(`(() => {
    const box = (e) => { const b = e.getBoundingClientRect(); return { l: Math.round(b.left * 2) / 2, r: Math.round(b.right * 2) / 2, w: Math.round(b.width * 2) / 2, scrolls: e.scrollWidth > e.clientWidth + 1 }; };
    return { vw: document.documentElement.clientWidth, col: box(document.querySelector(".dh-doc")), t: [...document.querySelectorAll(".table-wrap")].map(box),
      pageScrollsX: document.documentElement.scrollWidth > document.documentElement.clientWidth }; })()`);
}

describe.skipIf(!withBrowser)("a table wider than the text column", () => {
  test("1680 px: it leaves the column, shows every column, centred on the column, inside the page", async () => {
    const s = await look(1680);
    const [w4] = s.t;
    expect(s.col.w).toBe(COL);
    expect(w4.w).toBeGreaterThan(COL);          // wider than the column...
    expect(w4.scrolls).toBe(false);              // ...and every column shows
    expect(Math.abs((w4.l + w4.r) / 2 - (s.col.l + s.col.r) / 2)).toBeLessThanOrEqual(0.5);
    expect(w4.l).toBeGreaterThanOrEqual(16);
    expect(w4.r).toBeLessThanOrEqual(s.vw - 16);
    expect(s.pageScrollsX).toBe(false);
  }, 60000);
  test("a table that fits keeps the column exactly; one in a list keeps its box", async () => {
    const s = await look(1680);
    const [, small, , listed] = s.t;
    expect([small.l, small.w]).toEqual([s.col.l, s.col.w]);
    expect(listed.w).toBeLessThan(COL);
    expect(listed.scrolls).toBe(true);
  }, 60000);
  test("wider than the page: at most the page less 16 px each side, and it scrolls (its fade and swipe line, table-more.ts)", async () => {
    const s = await look(1680);
    const nine = s.t[2];
    expect(nine.w).toBe(s.vw - 32);
    expect(nine.l).toBe(16);
    expect(nine.scrolls).toBe(true);
    expect(s.pageScrollsX).toBe(false);
  }, 60000);
  test("a window narrower than the column's need: the table stays inside the page", async () => {
    for (const w of [1000, 820, 390]) {
      const s = await look(w);
      for (const t of s.t) { expect(t.l).toBeGreaterThanOrEqual(0); expect(t.r).toBeLessThanOrEqual(s.vw); }
      expect(s.pageScrollsX).toBe(false);
    }
  }, 60000);
  test("print: every table keeps the column", async () => {
    const s = await look(1680, "print");
    for (const t of [s.t[0], s.t[1], s.t[2]]) expect([t.l, t.w]).toEqual([s.col.l, s.col.w]);
  }, 60000);
});
