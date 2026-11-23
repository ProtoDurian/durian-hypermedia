// The layers example (0.7.0-rc.3): one request packet from a laptop's browser through a switch, a home router and two
// internet routers to a server, and the first packet of the answer back, told on the composed stage in ten scenes.
// The page is the Format page's example of its own (fixtures/stage/example-layers.dh.md, made by scripts/fixtures.ts).
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse, check, llmView } from "../../src/index";
import { DhDocument } from "../../src/react/index";
import { beginDocument, endDocument } from "../../src/core/stage-budget";
import { EXAMPLES } from "../../scripts/fixtures";

const FILE = join(import.meta.dir, "../../fixtures/stage/example-layers.dh.md");
const text = readFileSync(FILE, "utf8");
const fences = [...text.matchAll(/^```animation([^\n]*)\n([\s\S]*?)^```$/gm)].map((m) => ({ info: m[1].trim(), src: m[2] }));
afterEach(() => { endDocument(); beginDocument(); });

describe("the layers example", () => {
  test("scripts/fixtures.ts makes it from the source's samples/layers.dh.md", () => { expect(EXAMPLES).toContain("layers"); });

  test("ten composed scenes with their steps; the tenth is still (the bare word static)", () => {
    expect(fences.length).toBe(10);
    expect(fences.map((f) => (f.src.match(/^@step /gm) ?? []).length)).toEqual([7, 6, 6, 5, 10, 11, 6, 6, 9, 0]);
    expect(fences.map((f) => f.info)).toEqual([...Array(9).fill(""), "static"]);
    const doc = parse(text, { path: "example-layers.dh.md" });
    const stages = doc.blocks.filter((b) => b.type === "animation" && b.stage);
    expect(stages.length).toBe(10);
    expect(doc.blocks.filter((b) => b.type === "error")).toEqual([]);
    expect(check(doc).filter((p) => p.level === "error")).toEqual([]);
    const last = stages.at(-1)!; expect(last.type === "animation" && last.attrs?.static).toBe("");
  });

  test("six roles, one per layer, each its own colour", () => {
    const fm = text.slice(0, text.indexOf("\n---\n", 4));
    const roles = [...fm.matchAll(/^  ([a-z]+): \{ label: "[^"]*", colour: c(\d) \}$/gm)].map((m) => [m[1], m[2]]);
    expect(roles.map(([r]) => r)).toEqual(["app", "sec", "tcp", "ip", "link", "signal"]);
    expect(new Set(roles.map(([, c]) => c)).size).toBe(6);
  });

  test("it draws on the server, every scene a stage, the tenth still", () => {
    const doc = parse(text, { path: "example-layers.dh.md" });
    const html = renderToStaticMarkup(React.createElement(DhDocument, { doc }));
    expect((html.match(/class="stg(?: stg-static)?"/g) ?? []).length).toBe(10);
    expect((html.match(/class="stg stg-static"/g) ?? []).length).toBe(1);
  });

  test("the LLM view carries the packet's facts hop by hop", () => {
    const v = llmView(parse(text, { path: "example-layers.dh.md" }));
    for (const s of ["203.0.113.80", "198.51.100.7", "TTL 61", "00:00:5E:00:53:B2", "source port 40001"]) expect(v).toContain(s);
  });

  test("no address outside the ranges kept for documentation (and the default route, 0.0.0.0/0)", () => {
    for (const m of text.matchAll(/\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g)) {
      const a = m.slice(1, 4).join(".");
      expect(["192.0.2", "198.51.100", "203.0.113", "0.0.0"]).toContain(a);
    }
  });
});

describe("the bare word static on a fence", () => {
  test("```animation static is a still animation, not an old animation kind", () => {
    const doc = parse("---\nroles: { client: c1, server: c3 }\n---\n# T\n\n```animation static\n## Clients\nclient c1: the browser\n## Servers\nserver s1: the API\n@step Ask: asks.\nc1 -> s1: GET\n@step Answer: answers.\ns1 -> c1: 200\n```\n", { path: "t.dh.md" });
    expect(check(doc).filter((p) => p.level === "error")).toEqual([]);
    const b = doc.blocks.find((x) => x.type === "animation");
    expect(b && b.type === "animation" && b.attrs?.static).toBe("");
    expect(b && b.type === "animation" && b.attrs?.kind).toBeUndefined();
  });
  test("static=<step> and static=false keep their values", () => {
    for (const [w, v] of [["static=2", "2"], ["static=false", "false"]]) {
      const doc = parse(`# T\n\n\`\`\`animation ${w}\nbox a "A"\nbox b "B"\n@step one\na -> b\n@step two\nb -> a\n\`\`\`\n`, { path: "t.dh.md" });
      const b = doc.blocks.find((x) => x.type === "animation");
      expect(b && b.type === "animation" && b.attrs?.static).toBe(v);
    }
  });
});
