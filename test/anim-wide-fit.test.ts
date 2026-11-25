// A scene with steps wider than its stage on a laptop is never cut at the stage's right edge (SPEC 6.14): at the least
// size (11 px words) it lays out top to bottom when that fits; else the reader may drag it sideways (the shaded edge and
// "more beyond the edge" say so). Before, with no zoom on the fence, it was cut with no way to see the rest.
import { describe, expect, test } from "bun:test";
import { compileScene } from "../src/core/scene";
import { phoneScene } from "../src/core/readable";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { Animation, cutAt, laptopArVars, laptopKey } from "../src/ui/anim";
import { UI } from "../src/ui/ui";
import { WHOLE_WS, layoutWidth } from "../src/core/whole";

const steps = (head: string, ...raw: string[]) => compileScene(head, raw.map((r, k) => ({ title: `step ${k + 1}`, raw: r, line: 10 + 5 * k })), 0, {});
// a made-up row of ten services, side by side: about 1,300 px wide at its natural size
const ROW = Array.from({ length: 10 }, (_, k) => `box s${k} "service number ${k}"`).join("\n");

describe("a scene wider than its laptop stage", () => {
  test("is cut in its wide layout at an 800 px stage, and fits top to bottom", () => {
    // Arrange
    const wide = steps(ROW, "highlight s0", "highlight s9");
    const narrow = phoneScene(wide, true);
    // Act, Assert
    expect(cutAt(wide, 798)).toBe(true);
    expect(cutAt(narrow, 798)).toBe(false);
    expect(laptopKey(wide, narrow, 798)).toBe("narrow");
  });
  test("a scene that fits keeps its wide layout", () => {
    const small = steps(`box a "a"\nbox b "b"\na -> b`, "highlight a", "highlight b");
    expect(cutAt(small, 798)).toBe(false);
    expect(laptopKey(small, phoneScene(small, true), 798)).toBe("wide");
  });
  test("no load shift: the server writes the narrow layout's shape for every laptop width that takes it", () => {
    // Arrange
    const wide = steps(ROW, "highlight s0", "highlight s9"), narrow = phoneScene(wide, true)!;
    // Act
    const vars = laptopArVars(wide)!;
    const html = renderToString(React.createElement(Animation, { src: { head: ROW, steps: [{ title: "one", raw: "highlight s0", line: 20 }, { title: "two", raw: "highlight s9", line: 25 }], base: 1, info: {} }, ui: UI.en, srText: null }));
    // Assert: each layout width the browser can take (the stage's width, in 16 px steps) has the shape it draws there
    for (const b of WHOLE_WS.filter((x) => x >= 480)) expect(vars[`--ar${b}`] ?? "wide").toBe(laptopKey(wide, narrow, layoutWidth(b)) === "narrow" ? narrow.aspect.toFixed(3) : "wide");
    expect(vars["--ar784"]).toBe(narrow.aspect.toFixed(3));
    expect(html).toContain("data-wa");
    expect(html).toContain(`--ar784:${narrow.aspect.toFixed(3)}`);
    const css = readFileSync(join(import.meta.dir, "../src/ui/parts.css"), "utf8");
    expect(css).toContain("@container (min-width: 784px) { .scn[data-wa] > .scn-stage { aspect-ratio: var(--ar784, var(--ar)); } }");
  });
  test("a scene that fits writes no shapes", () => {
    expect(laptopArVars(steps(`box a "a"\nbox b "b"\na -> b`, "highlight a", "highlight b"))).toBeNull();
  });
  test("on a stage wide enough for the row, the row stays", () => {
    const wide = steps(ROW, "highlight s0", "highlight s9");
    expect(laptopKey(wide, phoneScene(wide, true), 2400)).toBe("wide");
  });
});
