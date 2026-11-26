// Seeking, the parts of it that need no browser: a jump that missed is noticed, the wave maps a click to a time (and a time back), and the
// player's markup has the slider, the skip buttons and their words. The real clicks, drag and keys are in test/audio-seek.test.tsx.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "bun:test";
import { parse } from "../../index";
import { UI } from "../../ui/ui";
import type { PartBlock, PartViewProps } from "../types";
import type { AudioSpec } from "./part";
import View, { seekMissed, waveMap } from "./view";

describe("a jump that missed", () => {
  test("landing where it was asked is fine; landing seconds away is a miss", () => {
    expect(seekMissed(30, 30, 57)).toBe(false);
    expect(seekMissed(30, 30.9, 57)).toBe(false);
    expect(seekMissed(45, 12, 57)).toBe(true);     // a server with no byte ranges: the browser stays inside what it has loaded
    expect(seekMissed(45, 0, 57)).toBe(true);
  });
  test("the end of the file and an unknown length are never a miss", () => {
    expect(seekMissed(56.5, 57, 57)).toBe(false);
    expect(seekMissed(10, 0, 0)).toBe(false);
    expect(seekMissed(NaN, 0, 57)).toBe(false);
  });
});

describe("the wave maps a click to a time", () => {
  test("without chapters, x is time in proportion; the map is its own inverse", () => {
    const m = waveMap(60, 600, [], 3);
    for (const t of [0, 6, 30, 54, 60]) expect(m.tOf(m.xOf(t))).toBeCloseTo(t, 1);
    expect(m.tOf(300)).toBeCloseTo(30, 1);
  });
  test("with chapters (gaps in the wave), a click still lands on the time under it", () => {
    const m = waveMap(57, 360, [0, 24, 38], 3);
    for (const t of [1, 23, 25, 37, 39, 56]) expect(m.tOf(m.xOf(t))).toBeCloseTo(t, 1);
  });
});

const block = (extra: string) => parse(`# T\n\n\`\`\`audio src="media/talk.mp3" duration=0:57 ${extra}\nchapter 0:00 A\n\`\`\`\n`, { path: "p.dh.md" }).blocks.find((b) => b.type === "audio") as PartBlock<AudioSpec>;
const draw = (b: PartBlock<AudioSpec>) => renderToStaticMarkup(<View {...({ block: b, data: b.data, static: "", ui: UI.en, stage: { width: 358, theme: "light", motion: "off", report() {} } } satisfies PartViewProps<AudioSpec>)} />);

describe("the player's markup", () => {
  test("the wave is a focusable slider with its range and value", () => {
    const html = draw(block(""));
    expect(html).toMatch(/class="am-wave"[^>]*role="slider"/);
    expect(html).toMatch(/tabindex="0"/);
    expect(html).toMatch(/aria-valuemin="0"/);
    expect(html).toMatch(/aria-valuemax="57"/);
  });
  test("skip=10 gives a back and a forward button saying how far; no skip, none", () => {
    const html = draw(block("skip=10"));
    expect(html).toContain('aria-label="Back 10 seconds"');
    expect(html).toContain('aria-label="Forward 10 seconds"');
    expect(draw(block(""))).not.toContain("Forward");
  });
});
