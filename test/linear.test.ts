// parse() takes time linear in its input (0.6.2): for each shape of ordinary text, and for each part, 8 times the text
// takes about 8 times as long. Time is the only measure that covers the whole of parse() (the Markdown reader's own
// work is counted in test/markdown-work.test.ts), so: the best of several runs, after a warm-up, and a wide margin.
// Linear text gives about 5 to 12 here; text that is quadratic gives 40 to 64 (0.6.0 and 0.6.1 fail this test on
// prose, lists, tables, quotes, links and long paragraphs).
import { describe, expect, test } from "bun:test";
import { parse } from "../src/index";
import { mixed, only, piece, grow, part, type Piece } from "./text-gen";

/** At most this many times longer for 8 times the text (linear is about 8; quadratic about 64). */
const MOST = 20;
// the smaller size of each shape: 8 KB, or less where 8 times it would pass one of the part's own caps
const SMALL: Record<string, number> = { fileTreeSteps: 1536, animationSteps: 900, mermaid: 2400, chart: 2400, tierList: 1200, alignment: 3000 };
const shapes: [string, (bytes: number) => string][] = [
  ["mixed", mixed],
  ...(Object.keys(piece) as Piece[]).map((k): [string, (b: number) => string] => [k, (b) => only(k, b)]),
  ...Object.entries(grow),
  ...Object.entries(part),
];

const opts = { frontMatter: false } as const;
// a chart's data past the YAML caps (SECURITY.md) is refused before it is read: this test raises them, as a host may,
// to time the chart itself
const wide = { frontMatter: false, limits: { maxYamlNodes: 1e7, maxPageYamlNodes: 1e8, maxYamlChars: 1e8, maxPageYamlChars: 1e9 } } as const;
let use: typeof opts | typeof wide = opts;
/** The fastest of several parses (at least 5, and for at least 40 ms in all). */
function best(src: string): number {
  let b = Infinity;
  const until = performance.now() + 40;
  for (let i = 0; i < 5 || (i < 50 && performance.now() < until); i++) {
    const t = performance.now(); parse(src, use); b = Math.min(b, performance.now() - t);
  }
  return b;
}
function ratio(f: (b: number) => string, small: number): { r: number; a: number; b: number } {
  const s1 = f(small), s8 = f(small * 8);
  const a = best(s1), b = best(s8);
  return { r: b / Math.max(a, 0.01), a, b };
}

describe("8 times the text takes about 8 times as long", () => {
  for (let i = 0; i < 10; i++) parse(mixed(8192), opts);
  for (const [name, f] of shapes) {
    test(name, () => {
      const small = SMALL[name] ?? 8192;
      use = name === "chart" ? wide : opts;
      // the larger text is read for real: no part of it is refused by a cap
      const d = parse(f(small * 8), use);
      expect(d.blocks.filter((b) => b.type === "error").map((b: any) => b.message)).toEqual([]);
      expect(d.problems.map((p) => p.message)).toEqual([]);
      // a busy machine can stall one run: measure again before calling it a failure
      let m = ratio(f, small);
      for (let k = 0; k < 2 && m.r > MOST; k++) m = ratio(f, small);
      if (m.r > MOST) throw new Error(`${name}: ${(small / 1024).toFixed(1)} KB took ${m.a.toFixed(2)} ms, 8 times that ${m.b.toFixed(2)} ms (x${m.r.toFixed(1)}; at most x${MOST})`);
      expect(m.r).toBeLessThanOrEqual(MOST);
    }, 60_000);
  }
});
