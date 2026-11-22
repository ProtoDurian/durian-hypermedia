// Short random pieces of Markdown and of the parts' syntax, each repeated into a page (0.6.2): every rule that reads
// ahead must take one pass, so 8 times the page takes about 8 times as long in parse(), llmView() and check().
// Seeded: the same pieces every run. DH_FUZZ_UNITS raises the count and DH_FUZZ_SEED changes the pieces, for a long run
// by hand (the pieces found by such runs are kept in KNOWN below).
import { describe, expect, test } from "bun:test";
import { parse, check, llmView } from "../src/index";
import { mixed } from "./text-gen";

const A = ["_", "*", "~", "(", ")", "[", "]", "!", "<", ">", "`", "\\", "|", ":", "#", "-", "+", "=", "&", ";", "@", ".", "/", "'", "\"", " ", "  ", "\t", "\n", "\n\n",
  "a", "1", "é", "www.", "http://", "https://", "ftp://", "mailto:", "a@b", ".co", "=https://", "key:http://", "\"https://", ":kbd[", ":mouse[", ":::", ":::tabs\n",
  "::toc\n", "#### ", "##### ", "- ", "1. ", "> ", "> **Tip:** ", "```", "~~", "**", "[x]", "](", "&amp;", "code:", ".dh.md", "@step ", "@file ", "---", "{", "}", "$", "\r"];
// pieces earlier runs found (each was slower than linear before 0.6.2 was tagged)
const KNOWN = ["_www.", "_www.a", "a_www.", "url=https://x_.", "=http://a_", "x.dh.md#](", "#]({.dh.md", "}.dh.md#](", "(http://a_(http://a.b!!"];
const UNITS = Number(process.env.DH_FUZZ_UNITS ?? 400);
const SEED = Number(process.env.DH_FUZZ_SEED ?? 20261122);
/** At most this many times longer for 8 times the text (linear is about 8; quadratic about 64). */
const MOST = 20;

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const of = (u: string, bytes: number) => u.repeat(Math.ceil(bytes / u.length));
const opts = { frontMatter: false } as const;
/** ms of parse(), llmView() and check() on one text */
function cost(s: string): number[] {
  let t = performance.now(); const d = parse(s, opts); const p = performance.now() - t;
  t = performance.now(); llmView(d); const v = performance.now() - t;
  t = performance.now(); check(d); const c = performance.now() - t;
  return [p, v, c];
}
const best = (s: string, n: number) => { let b = [Infinity, Infinity, Infinity]; for (let i = 0; i < n; i++) b = cost(s).map((x, j) => Math.min(x, b[j])); return b; };
/** the first of parse, llmView, check that grows faster than linear on this piece, or null */
function superlinear(u: string): string | null {
  const a = best(of(u, 2048), 1), b = best(of(u, 16384), 1);
  // quick look; a slow one is measured again, best of several, before it counts
  if (!b.some((x, i) => x > 8 && x > a[i] * MOST)) return null;
  for (let k = 0; k < 2; k++) {
    const a2 = best(of(u, 2048), 5), b2 = best(of(u, 16384), 5);
    const at = b2.findIndex((x, i) => x > 8 && x > a2[i] * MOST);
    if (at < 0) return null;
    if (k === 1) return `${["parse", "llmView", "check"][at]} on ${JSON.stringify(u)}: 2 KB ${a2[at].toFixed(1)} ms, 16 KB ${b2[at].toFixed(1)} ms`;
  }
  return null;
}

describe("short pieces repeated take time linear in the page", () => {
  for (let i = 0; i < 20; i++) parse(mixed(4096), opts);
  test("the pieces earlier runs found", () => {
    expect(KNOWN.map(superlinear).filter(Boolean)).toEqual([]);
  }, 120_000);
  test(`${UNITS} seeded random pieces`, () => {
    const r = rng(SEED), found: string[] = [];
    for (let n = 0; n < UNITS; n++) {
      const u = Array.from({ length: 1 + Math.floor(r() * 4) }, () => A[Math.floor(r() * A.length)]).join("");
      const bad = superlinear(u);
      if (bad) found.push(bad);
    }
    expect(found).toEqual([]);
  }, 280_000);
});
