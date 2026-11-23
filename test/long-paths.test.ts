// Long paths in animation labels (SPEC 6.15): a label breaks only after a "/", keeps its file's name and never loses it.
import { describe, expect, test } from "bun:test";
import { compileScene, phoneInfo, type Compiled } from "../src/core/scene";
import { hasPath, pathTail, wrapPath } from "../src/core/path-wrap";

const scene = (src: string): Compiled => {
  const head: string[] = [], steps: { title: string; raw: string; line: number }[] = [];
  src.split("\n").forEach((l, i) => { const m = l.match(/^@step\s*(.*)$/); if (m) steps.push({ title: m[1], raw: "", line: i }); else if (steps.length) steps[steps.length - 1].raw += (steps[steps.length - 1].raw ? "\n" : "") + l; else head.push(l); });
  return compileScene(head.join("\n"), steps, 0, {});
};
const box = (c: Compiled, k: number, id: string) => c.frames[k].boxes.find((b) => b.id === id)!;


describe("long paths in labels", () => {
  const path = "internal/wiring/registry/providers.go";
  const paths = [path, "features/checkout/observability/contract.yaml", "observability/dashboards/checkout-overview.json", "src/modules/payments/adapters/primary/http/routes.generated.ts"];
  // the rule, worked out from the author's text: a drawn line ends after a "/" (or at a space), and nothing is lost
  for (const p of paths) for (const shape of ["box", "cylinder", "pill", "diamond", "circle"]) test(`${shape} ${p}: whole segments at 1280, 390 and 360`, () => {
    const head = `${shape} a "${p}"\nbox b "task gen"\na -> b "${p}"`;
    const steps = [{ title: "one", raw: "highlight b", line: 4 }, { title: "two", raw: "highlight b", line: 6 }];
    const wide = compileScene(head, steps, 0, {});
    for (const c of [wide, compileScene(head, steps, 0, phoneInfo(wide, {}, 354)), compileScene(head, steps, 0, phoneInfo(wide, {}, 324))]) {
      for (const lines of [box(c, 0, "a").lines, c.frames[0].edges[0].lines]) {
        expect(lines.join("")).toBe(p);
        for (const l of lines.slice(0, -1)) expect(l.endsWith("/")).toBe(true);
      }
    }
  });
  test("a path with far too many segments keeps its first one and the file's name", () => {
    const deep = `${Array.from({ length: 14 }, (_, k) => `packages-number-${k}`).join("/")}/main.go`;
    const c = scene(`box a "${deep}"\n@step one\nhighlight a\n@step two\nhighlight a`);
    const lines = box(c, 0, "a").lines;
    expect(lines[0].startsWith("packages-number-0/")).toBe(true);
    expect(lines).toContain("…/");
    expect(lines.at(-1)).toContain("main.go");
  });
  test("one line (a chip) keeps the end of a path", () => {
    const c = scene(`box a\ntoken t "${path}" at a\n@step one\nhighlight a\n@step two\nhighlight a`);
    expect(box(c, 0, "t").lines?.join("") ?? "").toEndWith("providers.go");
  });
});

describe("the path helpers are one pass", () => {
  test("hasPath, pathTail and wrapPath on long input", () => {
    const big = "a/".repeat(50000) + "b";
    expect(hasPath(big)).toBe(true);
    expect(hasPath("a//b /c d/")).toBe(false);
    expect(pathTail("internal/wiring/providers.go", (t) => t.length <= 16)).toBe("…/providers.go");
    const t0 = performance.now();
    wrapPath("x/".repeat(2000), 11, 120, 2, (s) => s.length * 6, (w) => [w]);
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});
