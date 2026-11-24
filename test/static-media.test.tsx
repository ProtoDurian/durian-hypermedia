// rc.3 review, row 2: under a page's `static: true` the carousel (arrows, dots), the PDF (page buttons, zoom, search) and
// the Lottie (play, slider, speed) kept their controls. Static (SPEC 4.1) drops them: the carousel shows every image as a
// grid, the PDF one page with no toolbar, the Lottie its still frame with no control row; the fence's own `static` too.
import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { DhDocument } from "../src/react/index";
import { parse } from "../src/index";

const html = (md: string) => renderToString(<DhDocument doc={parse(md)} />);
const fm = (body: string) => `---\nstatic: true\n---\n# Page\n\n${body}`;
const page = (body: string) => `# Page\n\n${body}`;
const car = (f = "") => '```gallery title="Pictures" view=carousel loop' + f + '\n![A harbour](media/harbour.svg "Harbour")\n![A forest](media/forest.svg "Forest")\n![Dunes](media/dunes.svg "Dunes")\n```\n';
const pdf = (f = "") => '```pdf src="media/sample.pdf" title="A document" page=1' + f + "\n```\n";
const lot = (f = "") => '```lottie src="media/build.json" title="A build" loop' + f + "\nalt: A box fills with blocks.\n```\n";

describe("static drops the media controls", () => {
  test("carousel: live has arrows and dots; page static and fence static show every image as a grid, no arrows or dots", () => {
    const live = html(page(car()));
    expect(live).toContain("gl-car"); expect(live).toContain("gl-next"); expect(live).toContain("gl-dots");
    for (const h of [html(fm(car())), html(page(car(" static")))]) {
      expect(h).not.toContain("gl-car"); expect(h).not.toContain("gl-next"); expect(h).not.toContain("gl-dots");
      expect(h).toContain("gl-grid"); expect(h).toContain("data-dh-static");
      expect((h.match(/class="gl-cell"/g) ?? []).length).toBe(3);
    }
  });
  test("PDF: live has its toolbar (page buttons, zoom, find); static has none", () => {
    const live = html(page(pdf()));
    expect(live).toContain('data-dh-slot="toolbar"');
    for (const h of [html(fm(pdf())), html(page(pdf(" static")))]) {
      expect(h).not.toContain('data-dh-slot="toolbar"'); expect(h).not.toContain('type="number"'); expect(h).toContain("data-dh-static");
    }
  });
  test("Lottie: live has play, slider and speed; static has no control row", () => {
    const live = html(page(lot()));
    expect(live).toContain("lt-row"); expect(live).toContain('data-dh-slot="play"');
    for (const h of [html(fm(lot())), html(page(lot(" static")))]) {
      expect(h).not.toContain("lt-row"); expect(h).not.toContain('data-dh-slot="play"'); expect(h).not.toContain('type="range"'); expect(h).toContain("data-dh-static");
    }
  });
});
