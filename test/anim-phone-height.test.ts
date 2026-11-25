// A phone stage's height is in the server's page (no load shift, SPEC 6.14): for every phone layout width the server
// writes the stage's shape (the phone's layout, and its calm height worked out for a fixed phone window, PHONE_WIN, not
// the reader's window), and parts.css picks it with a container query; the phone rule holds it to min(680px, 82svh).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { compileScene, useNarrow } from "../src/core/scene";
import { phoneScene } from "../src/core/readable";
import { calmHeight, PHONE_WIN } from "../src/core/calm";
import { Animation, phoneAr, stageArVars } from "../src/ui/anim";
import { UI } from "../src/ui/ui";
import { WHOLE_WS } from "../src/core/whole";

const HEAD = Array.from({ length: 6 }, (_, k) => `box s${k} "service number ${k}"`).join("\n") + "\n" + Array.from({ length: 5 }, (_, k) => `s${k} -> s${k + 1}`).join("\n");
const STEPS = ["highlight s0", "zoom into s1", "zoom out", "highlight s5"];
const wide = compileScene(HEAD, STEPS.map((r, k) => ({ title: `step ${k + 1}`, raw: r, line: 20 + k })), 0, {});
const PHONE = WHOLE_WS.filter((b) => b < 480);

describe("a phone stage's height is in the server's page", () => {
  test("every phone layout width has the shape the browser draws there, worked out without the reader's window", () => {
    // Arrange
    const was = (globalThis as any).innerHeight;
    (globalThis as any).innerHeight = 500; // a short window must not change it
    try {
      // Act
      const vars = stageArVars(wide)!;
      // Assert
      for (const b of PHONE) {
        const cp = phoneScene(wide, useNarrow(wide, b))!, h = calmHeight(cp, b, PHONE_WIN);
        expect(vars[`--ar${b}`]).toBe((h ? b / h : cp.aspect).toFixed(3));
        expect(phoneAr(wide, b)!.toFixed(3)).toBe(vars[`--ar${b}`]);
      }
    } finally { (globalThis as any).innerHeight = was; }
  });
  test("the server's HTML carries them, and the stylesheet picks one per width", () => {
    const html = renderToString(React.createElement(Animation, { src: { head: HEAD, steps: STEPS.map((r, k) => ({ title: `step ${k + 1}`, raw: r, line: 20 + k })), base: 1, info: {} }, ui: UI.en, srText: null }));
    expect(html).toContain("data-wa");
    expect(html).toContain(`--ar384:${phoneAr(wide, 384)!.toFixed(3)}`);
    const css = readFileSync(join(import.meta.dir, "../src/ui/parts.css"), "utf8");
    for (const b of PHONE) expect(css).toContain(`@container (min-width: ${b}px) { .scn[data-wa] > .scn-stage { aspect-ratio: var(--ar${b}, var(--ar)); } }`);
    // one phone height rule for every stage (a class added by the script changed it: a load shift)
    expect(css).toContain("@media (max-width: 560px) { .scn-stage { min-height: min(62svh, 360px); max-height: min(680px, 82svh); }");
    expect(css).not.toContain(".scn.is-tall .scn-stage { max-height");
  });
  test("a 3D-only scene's control row and hint are in the server's page (they appeared on load: the part grew 64 px)", () => {
    const src = { head: HEAD, steps: STEPS.map((r, k) => ({ title: `step ${k + 1}`, raw: r, line: 20 + k })), base: 1, info: { only: "3d", view: "3d", zoom: "yes" } };
    const html = renderToString(React.createElement(Animation, { src, ui: UI.en, srText: null }));
    expect(html).toContain('class="scn-hint"');
    expect(html).toContain("scn-tools");
  });
});
