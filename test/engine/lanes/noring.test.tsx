// eng-lanes2: a lit lanes card keeps its id (data-id: tips, the 3D host, the match harness) and loses only the renderer's
// ring: its lit look is the stage's thicker border (eng-noring).
import { afterAll, beforeAll, expect, test } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { join } from "node:path";
import { compile } from "../../../src/engine/pipeline";
import { EngineStage } from "../../../src/engine/render/svg";
import { UI } from "../../../src/ui/ui";
import { fencesOf, ROOT } from "../parse/fixtures";
import { useStandin } from "../render/standin";

let restore = () => {};
beforeAll(() => { restore = useStandin(); });
afterAll(() => restore());

test("fixture 01 step 1 (light s0,s1): the lit cards keep data-id and stg-hot, no eng-ring is drawn", () => {
  const [fe] = fencesOf(join(ROOT, "fixtures/stage/01-animation-a-composed-stage.dh.md"));
  const html = renderToString(<EngineStage compiled={compile(fe.src)} ui={UI.en} />);
  expect(html).toContain('data-step="1"');
  expect(html).toMatch(/data-id="s0"[^>]*class="[^"]*stg-hot[^"]*eng-noring/);
  expect(html).not.toContain("eng-ring");
});
