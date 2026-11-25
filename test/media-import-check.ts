import { runInNewContext } from "node:vm";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

function browser() {
  let timers = 0, scans = 0;
  const tag = () => ({ style: {}, setAttribute() {}, getContext: () => ({ fillRect() {} }) });
  const context: any = {
    console, TextEncoder, TextDecoder, URL, URLSearchParams, AbortController,
    navigator: { userAgent: "" },
    document: { createElement: tag, createElementNS: tag, readyState: "complete", getElementsByTagName: () => [], getElementsByClassName: () => { scans++; return []; } },
    setInterval: () => { timers++; return 1; }, clearInterval() {},
    setTimeout: () => { timers++; return 1; }, clearTimeout() {},
  };
  context.window = context; context.self = context;
  return { context, stats: () => ({ timers, scans, lottie: !!context.lottie, bodymovin: !!context.bodymovin, exported: !!context.__dhImported && Object.keys(context.__dhImported).length > 0 }) };
}

const dir = mkdtempSync(join(tmpdir(), "dh-media-import-"));
try {
  const imports = [];
  const entries = ["src/index.ts", "src/react/index.tsx", "src/react/strict.tsx", "src/parts/generated/react.tsx", ...["dist/react/index.js", "dist/react/strict.js"].filter((e) => existsSync(resolve(import.meta.dir, "..", e)))];
  for (const entry of entries) {
    const file = join(dir, "entry.ts");
    await Bun.write(file, `import * as dh from ${JSON.stringify(resolve(import.meta.dir, "..", entry))}; globalThis.__dhImported = dh;`);
    const r = await Bun.build({ entrypoints: [file], target: "browser", format: "iife", minify: true, define: { "import.meta.url": '"https://page.example/package.js"', "process.env.NODE_ENV": '"development"' } });
    if (!r.success) throw new Error(String(r.logs));
    const b = browser();
    runInNewContext(await r.outputs[0].text(), b.context, { timeout: 20_000 });
    await new Promise<void>((done) => setImmediate(done));
    imports.push(b.stats());
  }
  const b = browser();
  runInNewContext(await Bun.file(require.resolve("lottie-web/build/player/lottie_light")).text(), b.context, { timeout: 20_000 });
  process.stdout.write(JSON.stringify({ imports, control: b.stats() }));
} finally { rmSync(dir, { recursive: true, force: true }); }
