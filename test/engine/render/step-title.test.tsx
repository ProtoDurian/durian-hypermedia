// fmt12: an author's step title is never dropped (brant's ruling, 26 Nov): the caption leads with it in bold ("Title."), and
// the step control names each step by it (the slider's value text and tooltip; Back and Next name the step they go to).
import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { parse, llmView } from "../../../src/index";
import { DhDocument } from "../../../src/react/index";

const page = `---\nformat: 12\n---\n\n\`\`\`animation\nlayout: graph\nplain a: A\nplain b: B\na -> b\n@step Start: The client asks.\nlight a\n@step Why?: Because it can.\nlight b\n@step A sentence with no title.\nlight a\n\`\`\`\n`;
const html = renderToString(React.createElement(DhDocument, { doc: parse(page, { path: "t.dh.md" }) as any, engine: "new" }));
const cap = (/<p class="stg-cap" data-bar-caption="">([\s\S]*?)<\/p>/.exec(html) ?? [])[1] ?? "";

describe("a step's title shows", () => {
  test("the caption leads with the title in bold, with a full stop", () => {
    expect(cap).toContain('<strong class="eng-step-title">Start<!-- -->.</strong>');
    expect(cap.replace(/<[^>]+>/g, "")).toBe("Start. The client asks.");
  });
  test("a title that ends in its own mark gets no second one; a step with no title shows its sentence alone", () => {
    const rooms = [...html.matchAll(/<p class="stg-cap stg-cap-room" aria-hidden="true">([\s\S]*?)<\/p>/g)].map((x) => x[1].replace(/<[^>]+>/g, ""));
    expect(rooms).toEqual(["Start. The client asks.", "Why? Because it can.", "A sentence with no title."]);
  });
  test("the step control names the step by its title", () => {
    expect(html).toMatch(/aria-valuetext="Step 1 \/ 3: Start"/);
    expect(html).toMatch(/class="ctl-range"[^>]*title="Start"|title="Start"[^>]*class="ctl-range"/);
    expect(html).toMatch(/class="btn btn-go"[^>]*title="Why\?"/);
  });
  test("the LLM view keeps Title: caption", () => {
    const v = llmView(parse(page, { path: "t.dh.md" }));
    expect(v).toContain("Start: The client asks.");
    expect(v).toContain("Why?: Because it can.");
  });
});

test("fmt12: the colour key shows each role's line colour too (a stroke beside its box swatch)", () => {
  const p = `---\nformat: 12\n---\n\n\`\`\`animation\nrole db c3: databases\nlayout: graph\ndb a: A\ndb b: B\na -> b (db)\n@step One: A sends.\nlight a\n\`\`\`\n`;
  const h = renderToString(React.createElement(DhDocument, { doc: parse(p, { path: "k.dh.md" }) as any, engine: "new" }));
  const key = /<span class="eng-legend"[\s\S]*?databases/.exec(h)?.[0] ?? "";
  expect(key).toContain('class="eng-key-box"');
  expect(key).toMatch(/class="eng-key-line" style="[^"]*background:var\(--c3\)/);
});
