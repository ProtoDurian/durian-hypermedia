// An animation block carries `texts`: the strings the scene compiler reads as labels, captions, say and note texts, in
// story order. animationTexts(block) gives the same list. Tools that read the Document JSON (a word checker, say) use
// either, and never reach into scene internals.
import { describe, expect } from "bun:test";
import { test } from "./old-engine";
import { parse, animationTexts, type AnimationBlock } from "../src/index";
import { animOf, parseDoc } from "../src/core/dh-lib";
import { fixtures } from "./helpers";

const page = (body: string) => `---\ntitle: T\ndescription: D\n---\n\n## A\n\n\`\`\`animation\n${body}\n\`\`\`\n`;
const blockOf = (body: string): AnimationBlock => {
  const doc = parse(page(body), { path: "t.dh.md" });
  const b = doc.blocks.find((x) => x.type === "animation");
  if (!b || b.type !== "animation") throw new Error(`no animation block: ${JSON.stringify(doc.blocks)}`);
  return b;
};
// the doc as a tool reads it: serialised, parsed again
const overJson = (b: AnimationBlock): AnimationBlock => JSON.parse(JSON.stringify(b));

describe("animation texts", () => {
  test("label: quoted labels, on entities and on connectors", () => {
    const b = blockOf(`pill web "Web server"\npill db "Database"\nweb -> db "reads"`);
    expect(b.texts).toEqual(["Web server", "Database", "reads"]);
    expect(animationTexts(b)).toEqual(b.texts);
  });
  test("caption: every step title, in order", () => {
    const b = blockOf(`pill a\npill b\n@step The first caption.\na -> b\n@step The second caption.\nremove a -> b`);
    expect(b.texts).toEqual(["The first caption.", "The second caption."]);
    expect(animationTexts(b)).toEqual(b.texts);
  });
  test("say: the speech bubble text", () => {
    const b = blockOf(`pill a\n@step One.\nsay a: three rows\n@step Two.`);
    expect(b.texts).toEqual(["One.", "three rows", "Two."]);
    expect(animationTexts(b)).toEqual(b.texts);
  });
  test("note: the note a click shows, from a note line and from note=", () => {
    const b = blockOf(`pill a note="holds users"\npill b\nnote b: the other one\n@step One.\n@step Two.`);
    expect(b.texts).toEqual(["holds users", "the other one", "One.", "Two."]);
    expect(animationTexts(b)).toEqual(b.texts);
  });
  test("no texts at all: texts is []", () => {
    const b = blockOf(`pill a\npill b\na -> b`);
    expect(b.texts).toEqual([]);
    expect(animationTexts(b)).toEqual([]);
    expect(JSON.parse(JSON.stringify(b)).texts).toEqual([]);
  });
  test("story order: setup first, then each step's caption before its own changes", () => {
    const b = blockOf(`pill a "A"\npill b "B"\n@step Cap 1.\nsay a: hello\n@step Cap 2.\nset b label=C\nnote b: n`);
    expect(b.texts).toEqual(["A", "B", "Cap 1.", "hello", "Cap 2.", "C", "n"]);
  });
  test("it is the compiler's own list, and survives the JSON a tool reads", () => {
    const b = blockOf(`pill a "A"\n@step One.\nsay a: hi\n@step Two.`);
    const node = parseDoc("t.dh.md", page(`pill a "A"\n@step One.\nsay a: hi\n@step Two.`)).body.find((n: any) => n.name === "animation") as any;
    expect(b.texts).toEqual(animOf(node).scene.texts);
    expect(overJson(b).texts).toEqual(b.texts);
  });
  test("animationTexts works on a block from JSON that has no texts field (older output)", () => {
    const b = blockOf(`pill a "A"\n@step One.\nsay a: hi\n@step Two.`);
    const old: any = overJson(b); delete old.texts;
    expect(animationTexts(old)).toEqual(["A", "One.", "hi", "Two."]);
  });
  test("an animation inside a tab carries texts too", () => {
    const doc = parse(`---\ntitle: T\ndescription: D\n---\n\n:::tabs\n\n## One\n\n\`\`\`animation\npill a "A"\n@step S1.\n@step S2.\n\`\`\`\n\n:::\n`, { path: "t.dh.md" });
    const tabs = doc.blocks.find((x) => x.type === "tabs") as any;
    const anim = tabs.items[0].body.find((x: any) => x.type === "animation") as AnimationBlock;
    expect(anim.texts).toEqual(["A", "S1.", "S2."]);
  });
  test("every animation block of every fixture has texts equal to animationTexts", () => {
    let seen = 0;
    const visit = (bs: any[]) => { for (const b of bs) {
      if (b.type === "animation") { seen++; expect(Array.isArray(b.texts)).toBe(true); expect(animationTexts(b)).toEqual(b.texts); expect(b.texts.every((t: unknown) => typeof t === "string")).toBe(true); }
      if (b.type === "tabs" || b.type === "accordion") for (const it of b.items) visit(it.body);
      if (b.type === "human") visit(b.body);
    } };
    for (const dir of ["", "format"]) for (const f of fixtures(dir)) visit(parse(f.text, { path: f.name }).blocks);
    expect(seen).toBeGreaterThan(10);
  });
});
