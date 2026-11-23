#!/usr/bin/env bun
// Build dist/: one ESM file per entry point (dependencies left as imports, so a host's bundler dedupes and tree-shakes
// them), shared chunks, and dist/styles.css. Types are the TypeScript sources (package.json "types" points at src/).
//   bun scripts/build.ts [--out <dir>]     (default: dist/)
// JSX is built for production (react/jsx-runtime, never react/jsx-dev-runtime, which a production React does not have).
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildCss } from "./build-css";

// Bun builds the server and node entries with development JSX when NODE_ENV is unset or "development" as Bun starts,
// whatever `jsx.development` says, and setting it from inside is too late: so the build runs itself again as production
// (a test runner sets NODE_ENV=test, which hid this).
if (process.env.NODE_ENV !== "production") {
  const again = Bun.spawnSync([process.execPath, ...process.argv.slice(1)], { env: { ...process.env, NODE_ENV: "production" }, stdout: "inherit", stderr: "inherit" });
  process.exit(again.exitCode ?? 1);
}

const PKG = resolve(import.meta.dir, "..");
const pkg = await Bun.file(join(PKG, "package.json")).json();
const entries = Object.entries(pkg.exports as Record<string, any>).filter(([, v]) => typeof v === "object" && v.bun && !(v.bun as string).startsWith("./src/node/")).map(([, v]) => join(PKG, v.bun as string));
const external = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {}), "react/jsx-runtime", "react-dom/client", "react-dom/server", "codehike/code", "codehike/utils/token-transitions", "three/examples/jsm/utils/BufferGeometryUtils.js"];
const args = process.argv.slice(2);
const OUT = resolve(args.includes("--out") ? args[args.indexOf("--out") + 1] : join(PKG, "dist"));
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const r = await Bun.build({ entrypoints: entries, outdir: OUT, root: join(PKG, "src"), splitting: true, format: "esm", target: "browser", jsx: { runtime: "automatic", development: false },  minify: false, external, naming: { entry: "[dir]/[name].js", chunk: "chunks/[name]-[hash].js" }, define: { "process.env.NODE_ENV": "process.env.NODE_ENV" } });
if (!r.success) { console.error(r.logs); process.exit(1); }
// the server entry and the node entry (src/node/: files, which the browser never loads) run on Bun or Node: build them for that target
const s = await Bun.build({ entrypoints: [join(PKG, "src/server.ts"), join(PKG, "src/node/files.ts")], outdir: OUT, root: join(PKG, "src"), format: "esm", target: "node", jsx: { runtime: "automatic", development: false },  external, naming: { entry: "[dir]/[name].js" } });
if (!s.success) { console.error(s.logs); process.exit(1); }
writeFileSync(join(OUT, "styles.css"), buildCss());
console.log(`dist: ${r.outputs.length + s.outputs.length} files, styles.css`);
