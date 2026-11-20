#!/usr/bin/env bun
// Make fixtures/format/: one fixture per section of the Format page source (samples/parts.dh.md), so the fixtures
// follow the format as it grows (every chart kind and option, tier lists, alignment grids, 2D and 3D animation ...).
//   bun scripts/fixtures.ts [<source folder>]      (scripts/sync.ts runs it too)
// A section that reads code from a repo (repo=) is left out: the package reads no files; the hand-written fixtures
// in fixtures/ cover those parts with made-up @file code. The banner section becomes a page with a banner.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { publicText, loadRewrites } from "./public-text";

const PKG = resolve(import.meta.dir, "..");
export function makeFormatFixtures(src: string): string[] {
  loadRewrites(src);
  const raw = publicText(readFileSync(join(src, "samples/parts.dh.md"), "utf8"));
  const fmEnd = raw.indexOf("\n---\n", 4) + 5;
  const sections = raw.slice(fmEnd).split(/\n(?=## )/).filter((s) => s.startsWith("## "));
  const out = join(PKG, "fixtures/format");
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const made: string[] = [];
  let k = 0;
  for (const sec of sections) {
    const title = sec.split("\n")[0].replace(/^## /, "").trim();
    let body = sec.split("\n").slice(1).join("\n").replace(/^\n+|\s+$/g, "");
    if (/\brepo=/.test(body)) continue;
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    let fm = `title: "${title.replace(/"/g, "'")}"\ndescription: A fixture made from the Format page section of the same name.`;
    if (title === "Banner") {
      const y = body.match(/```yaml\n([\s\S]*?)```/);
      if (y) { fm += `\n${y[1].trimEnd()}`; body = body.replace(/```yaml\n[\s\S]*?```/, "").trim(); }
    }
    const name = `${String(++k).padStart(2, "0")}-${slug}.dh.md`;
    writeFileSync(join(out, name), `---\n${fm}\n---\n\n## ${title}\n\n${body}\n`);
    made.push(name);
  }
  return made;
}
if (import.meta.main) {
  const made = makeFormatFixtures(resolve(process.argv[2] ?? join(PKG, "..")));
  console.log(`fixtures/format: ${made.length} fixtures`);
}
