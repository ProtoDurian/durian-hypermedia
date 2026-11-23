// Print (SPEC 4.1) in a real browser: a part that never got its turn to hydrate still prints whole and static. Before the
// page prints, printUnseen() draws it (static) where the server's HTML stood, and hides that HTML; after printing both go
// back. Skipped when google-chrome is not installed, or with DH_CDP_TEST=0.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { which } from "bun";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, normalize } from "node:path";
import type { Page } from "../scripts/cdp";

const withBrowser = !!which("google-chrome") && process.env.DH_CDP_TEST !== "0";
const MD = "# Print\n\nSome words first.\n\n```terminal title=\"setup\"\n$ echo first\none\n$ echo second\ntwo\n$ echo third\nthree\n```\n\n```filetree\n@step Start\napp/\n  one.ts\n@step Done\napp/\n  one.ts\n  two.ts\n```\n";

let dir = "", server: ReturnType<typeof Bun.serve> | null = null, page: Page | null = null;
beforeAll(async () => {
  if (!withBrowser) return;
  dir = mkdtempSync(join(tmpdir(), "dh-print-unseen-"));
  // the server's HTML and the page's JSON, made in a child process (the same React the page bundles)
  const make = Bun.spawnSync(["bun", "-e", `
    import React from "react"; import { renderToString } from "react-dom/server";
    import { DhDocument } from "${join(import.meta.dir, "../src/react/index")}";
    import { documentJson } from "${join(import.meta.dir, "../src/react/hydrate")}";
    import { parse } from "${join(import.meta.dir, "../src/index")}";
    const doc = parse(${JSON.stringify(MD)});
    await Bun.write(${JSON.stringify(join(dir, "body.html"))}, renderToString(React.createElement(DhDocument, { doc })));
    await Bun.write(${JSON.stringify(join(dir, "doc.json"))}, documentJson(doc));`], { cwd: join(import.meta.dir, "..") });
  if (make.exitCode !== 0) throw new Error("the server HTML was not made: " + make.stderr.toString().slice(0, 2000));
  const r = Bun.spawnSync(["bun", "build", join(import.meta.dir, "print-unseen-page.tsx"), "--outdir", dir, "--format=esm", "--target=browser", "--entry-naming=[name].[ext]"], { cwd: join(import.meta.dir, "..") });
  if (r.exitCode !== 0) throw new Error("the test page did not build: " + r.stderr.toString().slice(0, 2000));
  const body = await Bun.file(join(dir, "body.html")).text(), json = await Bun.file(join(dir, "doc.json")).text();
  writeFileSync(join(dir, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><title>print unseen</title></head><body><div id="root">${body}</div><script type="application/json" id="doc">${json}</script><script type="module" src="print-unseen-page.js"></script></body></html>`);
  const TYPES: Record<string, string> = { html: "text/html; charset=utf-8", js: "text/javascript" };
  server = Bun.serve({ port: 0, hostname: "127.0.0.1", async fetch(req) {
    const file = normalize(join(dir, decodeURIComponent(new URL(req.url).pathname).replace(/^\/$/, "/index.html")));
    if (!file.startsWith(dir + "/") || !(await Bun.file(file).exists())) return new Response("not found", { status: 404 });
    return new Response(Bun.file(file), { headers: { "Content-Type": TYPES[file.split(".").pop()!] ?? "application/octet-stream" } });
  } });
  const { launch } = await import("../scripts/cdp");
  page = await launch();
}, 90000);
afterAll(async () => { await page?.close(); server?.stop(true); if (dir) rmSync(dir, { recursive: true, force: true }); });

type Seen = { waiting: number; liveThird: boolean; copies: number; copyThird: boolean; copyStatic: number; copyControls: number; treeTwo: boolean; hidden: boolean; after: number; shown: boolean };
describe.skipIf(!withBrowser)("print draws a part that never hydrated, static", () => {
  test("beforeprint: a static copy where the server's HTML stood; afterprint: back as it was", async () => {
    const p = page!;
    await p.goto(`http://127.0.0.1:${server!.port}/index.html`);
    for (let i = 0; i < 80; i++) { if (await p.eval<number>(`window.__order ? window.__order.waiting().length : 0`) >= 2) break; await p.sleep(100); }
    const s = await p.eval<Seen>(`(() => {
      const vis = (n) => !!n && getComputedStyle(n).display !== "none";
      const termEls = () => [...document.querySelectorAll("#root .term")].filter((t) => !t.closest(".dh-print-copy"));
      const r = { waiting: window.__order.waiting().length, liveThird: termEls().some((t) => vis(t) && t.textContent.includes("echo third")) };
      dispatchEvent(new Event("beforeprint"));
      const copies = [...document.querySelectorAll(".dh-print-copy")];
      Object.assign(r, { copies: copies.length, copyThird: copies.some((c) => c.textContent.includes("echo third")), copyStatic: copies.filter((c) => c.querySelector("[data-dh-static]")).length,
        copyControls: copies.reduce((n, c) => n + c.querySelectorAll(".ctl").length, 0), treeTwo: copies.some((c) => c.textContent.includes("two.ts")), hidden: termEls().every((t) => !vis(t)) });
      dispatchEvent(new Event("afterprint"));
      Object.assign(r, { after: document.querySelectorAll(".dh-print-copy").length, shown: termEls().every((t) => vis(t)) });
      return r; })()`);
    expect(s.waiting).toBeGreaterThanOrEqual(2);
    expect(s.liveThird).toBe(false);          // the server's HTML: the first command only
    expect(s.copies).toBe(s.waiting);
    expect(s.copyThird).toBe(true);           // printed: every command typed
    expect(s.treeTwo).toBe(true);             // printed: the last tree
    expect(s.copyStatic).toBe(s.copies);
    expect(s.copyControls).toBe(0);
    expect(s.hidden).toBe(true);              // the server's HTML does not print twice
    expect(s.after).toBe(0);
    expect(s.shown).toBe(true);
  }, 60000);
});
