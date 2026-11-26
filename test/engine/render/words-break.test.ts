// render2 (page2's review): a box's words never break badly ("web-" / "3", "checkout-overview." / "json") and a graph
// scene's boxes share one title size (long paths at 390: one bold and large, two thin and small).
import { expect, test } from "bun:test";
import { compile } from "../../../src/engine/pipeline";
import { fencesOf } from "../parse/fixtures";
import { atSizes } from "../../../src/engine/render/font";
import { badBreak } from "../../../src/engine/render/prims/fit";
import type { Prim } from "../../../src/engine/types";

const page = (look: string, body: string) => `---\nformat: 12\n${look ? `look: ${look}\n` : ""}roles:\n  plain: c0\n  app: c1\n---\n\n\`\`\`animation\n${body}\n\`\`\`\n`;
const PATHS = "layout: graph\nplain src [box]: features/checkout/observability/contract.yaml\nplain out [box]: internal/wiring/registry/providers.go\nplain dash [box]: observability/dashboards/checkout-overview.json\nsrc -> out: task gen\nsrc -> dash\n@step The contract is the one source.\nlight src\n@step One run generates both files from it.\nlight out, dash";
const PODS = "layout: graph\nplain n [box]: node\n  app w1 [pill]: web-1\n  app w2 [pill]: web-2\n  app w3 [pill]: web-3\n  app c1 [pill]: cache-1\n@step Go.\nlight w3";
const titles = (f: Prim[]) => f.flatMap((p) => (p.k === "text" && p.key.endsWith(":title") ? [p] : []));

test("a bad break is one inside a word that leaves 2 characters or a file's extension alone", () => {
  expect(badBreak("web-3", ["web-", "3"])).toBe(true);
  expect(badBreak("observability/dashboards/checkout-overview.json", ["observability/", "dashboards/", "checkout-overview.", "json"])).toBe(true);
  expect(badBreak("observability/dashboards/checkout-overview.json", ["observability/", "dashboards/", "checkout-", "overview.json"])).toBe(false);
  expect(badBreak("a long title of words", ["a long title", "of words"])).toBe(false);
});
for (const look of ["", "stage"]) for (const [name, body] of [["paths", PATHS], ["pods", PODS]]) test(`${name}${look ? ", look stage" : ""}: no bad break, one title size`, () => {
  const c = compile(fencesOf("p.dh.md", page(look, body), "p")[0].src);
  for (const w of [1178, 800, 356, 341]) atSizes(w < 480, () => {
    for (let k = 0; k < c.states.length; k++) {
      const ts = titles(c.plan(w).frame(k)).filter((p) => p.k === "text" && p.font !== "lane");
      for (const p of ts) if (p.k === "text") expect(badBreak(c.model.things[p.id!]?.title ?? "", p.lines)).toBe(false);
      expect(new Set(ts.map((p) => (p.k === "text" ? p.font : ""))).size).toBeLessThanOrEqual(1);
    }
  });
});
