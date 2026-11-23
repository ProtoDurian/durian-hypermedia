// The built dist is production JSX: no file in it names react/jsx-dev-runtime, and a page renders through
// dist/server.js under Node with NODE_ENV=production. The build runs with NODE_ENV unset here on purpose: a test runner
// sets NODE_ENV=test, and only an unset or "development" NODE_ENV made Bun build the server entry with development JSX.
import { afterAll, expect, test } from "bun:test";
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const PKG = resolve(import.meta.dir, ".."), OUT = join(PKG, "dist", "_prod-check");
afterAll(() => rmSync(OUT, { recursive: true, force: true }));
const files = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? files(join(d, n)) : [join(d, n)]));
const envWithout = (k: string) => Object.fromEntries(Object.entries(process.env).filter(([n]) => n !== k)) as Record<string, string>;

test("the build makes production JSX in every file, also when NODE_ENV is unset", () => {
  const b = Bun.spawnSync(["bun", "scripts/build.ts", "--out", OUT], { cwd: PKG, env: envWithout("NODE_ENV"), stdout: "pipe", stderr: "pipe" });
  expect(b.exitCode).toBe(0);
  const all = files(OUT);
  expect(all.filter((f) => f.endsWith(".js")).length).toBeGreaterThan(10);
  expect(all.filter((f) => readFileSync(f, "latin1").includes("jsx-dev-runtime")).map((f) => f.slice(OUT.length + 1))).toEqual([]);
}, 120_000);

test("a page renders through dist/server.js and the React document under Node with NODE_ENV=production", () => {
  const script = join(OUT, "prod-render.mjs");
  writeFileSync(script, `import React from "react"; import { renderToString } from "react-dom/server";
    const { parse, highlight } = await import(${JSON.stringify(join(OUT, "server.js"))});
    const mod = await import(${JSON.stringify(join(OUT, "react/document.js"))});
    const doc = await highlight(parse("# Hi\\n\\nSome *text*.\\n\\n\`\`\`ts\\nconst a = 1;\\n\`\`\`\\n"));
    const html = renderToString(React.createElement(mod.default, { doc }));
    console.log(html.includes("Some") && html.includes("const"));`);
  const r = Bun.spawnSync(["node", script], { cwd: PKG, env: { ...process.env, NODE_ENV: "production" }, stdout: "pipe", stderr: "pipe" });
  expect(r.stderr.toString()).toBe("");
  expect(r.stdout.toString().trim()).toBe("true");
}, 120_000);
