// Words in the shared sources that belong to the people and projects that made the format, not to a public package.
// The list lives next to the sources, outside this package (public-rewrites.json in the source folder), so the words
// themselves are never published. scripts/sync.ts and scripts/fixtures.ts pass every copied text through publicText();
// scripts/hygiene.ts checks the result.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

let rules: [RegExp, string][] = [];
export function loadRewrites(src: string): number {
  const f = join(src, "public-rewrites.json");
  rules = existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")).rules as [string, string, string][]).map(([p, fl, to]) => [new RegExp(p, fl), to]) : [];
  return rules.length;
}
export function publicText(s: string): string {
  for (const [re, to] of rules) s = s.replace(re, to);
  return s;
}
