// MUST 5 (rc.3 review): at 390 the map was cut at the right ("Customer" showed as "Cu", the evolution words off screen),
// because it kept its 640 px layout and needed a sideways swipe. A phone now lays the map out at the width it has.
import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { LIMITS } from "../../index";
import { UI, type Ui } from "../../ui/ui";
import { parseWardley, STAGES } from "./part";
import { layoutWardley, WARDLEY_MIN_W } from "./layout";
import { textW } from "../kit/text";
import WardleyView from "./view";

const SRC = `anchor customer "Customer" visible=0.95 evolution=0.6\ncomponent cup "Cup of tea" visible=0.8 evolution=0.6\ncomponent tea "Tea" visible=0.6 evolution=0.8\ncomponent kettle "Kettle" visible=0.45 evolution=0.4\ncomponent power "Power" visible=0.1 evolution=0.85\ncustomer -> cup\ncup -> tea\ncup -> kettle\nkettle -> power\nnote "Kettles are a product now" visible=0.3 evolution=0.1\n@step The kettle is a product we buy.\nhighlight kettle\n@step A smart kettle moves it further to the right.\nevolve kettle 0.65 "smart kettle"`;
const spec = parseWardley(SRC, 1, "A tea shop", LIMITS);
const view = (width: number) => renderToString(<WardleyView data={spec} block={{} as any} ui={UI.en as Ui} static={undefined} stage={{ width, theme: "light", motion: "on", report: () => {} }} />);

describe("wardley on a phone: laid out at the width it has", () => {
  for (const W of [374, 340, WARDLEY_MIN_W]) test(`at ${W} px: every label, evolved label and note inside the map; the stage words fit their band`, () => {
    const L = layoutWardley(spec, undefined, W);
    expect(L.w).toBe(W);
    expect(L.minW).toBe(W); // drawn at its own width: words at their size, no swipe
    for (const lab of L.labels) { expect(lab.box.l).toBeGreaterThanOrEqual(0); expect(lab.box.r).toBeLessThanOrEqual(L.w); if (lab.evBox) { expect(lab.evBox.l).toBeGreaterThanOrEqual(0); expect(lab.evBox.r).toBeLessThanOrEqual(L.w); } }
    for (const n of L.notes) { expect(n.x).toBeGreaterThanOrEqual(0); expect(n.x + n.w).toBeLessThanOrEqual(L.w); }
    const band = (L.w - L.l - 12) / 4; // neighbouring stage words never meet
    for (let k = 0; k + 1 < STAGES.length; k++) expect(band - textW(STAGES[k], 12) / 2 - textW(STAGES[k + 1], 12) / 2).toBeGreaterThan(4);
  });
  test("the view: at a 390 phone's stage it draws at the room inside the box with no swipe hint; on a wide stage and on the server it keeps 640 (the server keeps its hint, which CSS shows only on a narrow stage)", () => {
    const phone = view(358), wide = view(900), server = view(0);
    expect(phone).toContain('viewBox="0 0 340 440"'); expect(phone).not.toContain("wardley-hint"); expect(phone).toContain("min-width:340px");
    expect(wide).toContain('viewBox="0 0 640 440"'); expect(server).toContain('viewBox="0 0 640 440"');
    expect(server).toContain("wardley-hint");
    expect(phone).toContain(">Customer<");
  });
  test("narrower than the least width, the map keeps the least width and says it scrolls", () => {
    const tiny = view(250);
    expect(tiny).toContain(`viewBox="0 0 ${WARDLEY_MIN_W} 440"`); expect(tiny).toContain("wardley-hint");
  });
});
