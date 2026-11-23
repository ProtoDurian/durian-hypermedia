// Format version 11, what the graph engine's animation draws: a still scene (no steps) has no player and, unless its
// fence says zoom or 3d, no toolbar, pan or zoom (SPEC 6.14); a scene with steps keeps its player and its story camera,
// and the reader's camera only when asked; static (SPEC 4.1) is one step drawn whole and flat, with its step list.
// Server rendering only (no browser).
import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { parse } from "../src/index";
import { Animation } from "../src/ui/anim";
import { UI } from "../src/ui/ui";
import { html } from "./helpers";

const BODY = 'box a "app" note="the front"\nbox b "database"\na -> b';
const STEPS = `${BODY}\n@step one\nhighlight a\n@step two\nhighlight b`;
const page = (word: string, body = BODY) => html(parse(`---\ntitle: T\n---\n\n\`\`\`animation${word}\n${body}\n\`\`\`\n`) as any);
const draw = (src: string, info: Record<string, string> = {}, st?: string | false) => {
  const [head, ...rest] = src.split(/^@step /m);
  const steps = rest.map((r, k) => { const [t, ...b] = r.split("\n"); return { title: t.trim(), raw: b.join("\n"), line: 10 * (k + 1) }; });
  return renderToString(React.createElement(Animation, { src: { head, steps, base: 1, info }, ui: UI.en, srText: null, static: st }));
};

describe("a still scene (no steps)", () => {
  test("draws, with no player, no toolbar, no empty strip and no how-to-move line", () => {
    const h = page("");
    expect(h).toContain("scn-svg");
    for (const word of ["scn-bar", "scn-tools", "scn-hint", "scn-caps", "cw-error"]) expect(h).not.toContain(word);
    expect(h).toContain("is-fixed");
    expect(h).toContain("is-still");
  });
  test("its colour key stays: words, not a control", () => {
    const h = draw(`family f "front"\n${BODY.replace('note="the front"', 'note="the front" is=f')}`);
    expect(h).toContain("scn-legend");
    expect(h).not.toContain("scn-tools");
  });
  test("the fence may say zoom, or 3d", () => {
    for (const word of [" zoom", " 3d", " 3d zoom"]) {
      const h = page(word);
      expect(h).toContain("scn-tools");
      expect(h).not.toContain("is-fixed");
    }
  });
  test("the page's checks take the word zoom and a still scene", () => {
    for (const word of ["", " zoom", " 3d zoom"]) {
      const d = parse(`---\ntitle: T\n---\n\n\`\`\`animation${word}\n${BODY}\n\`\`\`\n`) as any;
      expect((d.issues ?? []).filter((i: any) => i.level === "error")).toEqual([]);
    }
  });
});

describe("a scene with steps", () => {
  test("keeps its player and captions; the reader's camera only when the fence says zoom", () => {
    const plain = draw(STEPS), zoom = draw(STEPS, { zoom: "yes" });
    expect(plain).toContain("scn-caps");
    expect(plain).not.toContain("scn-tools");
    expect(plain).toContain("is-steady");
    expect(zoom).toContain("scn-tools");
    expect(zoom).not.toContain("is-steady");
  });
});

describe("static (SPEC 4.1) on the graph engine", () => {
  test("one step, whole and flat: no player, no camera, the static marker and its step list", () => {
    const h = draw(STEPS, {}, "1");
    expect(h).toContain('data-dh-static="true"');
    expect(h).toContain('data-static="1"');
    expect(h).toContain("dh-static-steps");
    for (const word of ["scn-caps", "scn-tools", "scn-hint", 'aria-roledescription="animation"']) expect(h).not.toContain(word);
  });
  test("the fence's static= reaches the engine (before: the animation part passed no static at all)", () => {
    const h = page(" static=2", STEPS);
    expect(h).toContain('data-static="2"');
  });
  test("static=false keeps the player", () => {
    expect(draw(STEPS, {}, false)).toContain("scn-caps");
  });
});
