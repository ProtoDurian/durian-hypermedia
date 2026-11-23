// The built dist is production JSX: it never imports react/jsx-dev-runtime, and it imports and renders with NODE_ENV=production.
import { afterAll, expect, test } from "bun:test";
import { readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const PKG = resolve(import.meta.dir, ".."), OUT = join(PKG, "dist", "_prod-check");
afterAll(() => rmSync(OUT, { recursive: true, force: true }));
const files = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? files(join(d, n)) : [join(d, n)]));

test("the build makes production JSX, and the built entries import and render under NODE_ENV=production", async () => {
  const b = Bun.spawnSync(["bun", "scripts/build.ts", "--out", OUT], { cwd: PKG, stdout: "pipe", stderr: "pipe" });
  expect(b.exitCode).toBe(0);
  const js = files(OUT).filter((f) => f.endsWith(".js"));
  expect(js.length).toBeGreaterThan(10);
  for (const f of js) expect(readFileSync(f, "utf8")).not.toContain("jsx-dev-runtime");
  const script = `import React from "react"; import { renderToString } from "react-dom/server";
    const { parse } = await import(${JSON.stringify(join(OUT, "index.js"))});
    const mod = await import(${JSON.stringify(join(OUT, "react/document.js"))});
    const doc = parse("# Hi\\n\\nSome *text*.\\n");
    console.log(renderToString(React.createElement(mod.default, { doc })).includes("Some"));`;
  const r = Bun.spawnSync(["bun", "-e", script], { cwd: PKG, env: { ...process.env, NODE_ENV: "production" }, stdout: "pipe", stderr: "pipe" });
  expect(r.stderr.toString()).toBe("");
  expect(r.stdout.toString().trim()).toBe("true");
}, 120_000);
