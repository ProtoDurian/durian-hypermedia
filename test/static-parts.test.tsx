// Static (SPEC 4.1) on the terminal, file tree, editor and code walk: the fence's own `static` (the bare word, a step
// number or a step title, or `static=false`), the page's front matter `static: true`, and the host's option draw one
// state whole on the server, with no control row; doccheck names a static value that is not a step.
import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { DhDocument } from "../src/react/index";
import { parse, check } from "../src/index";

const html = (md: string, props: Record<string, unknown> = {}) => renderToString(<DhDocument doc={parse(md)} {...props} />);
const controls = (h: string) => /class="ctl\b/.test(h);
const term = (fence = "") => "```terminal" + fence + "\n$ echo first\none\n$ echo second\ntwo\n$ echo third\nthree\n```\n";
const tree = (fence = "") => "```filetree" + fence + "\n@step Start\napp/\n  one.ts\n@step Grow\napp/\n  one.ts\n  two.ts\n@step Done\napp/\n  one.ts\n  two.ts\n  three.ts\n```\n";
const editor = (fence = "") => "```editor" + fence + "\n@file src/a.ts (open)\nexport const a = 'first';\n@step Second\n@@ src/a.ts\n-export const a = 'first';\n+export const a = 'second';\n@step Third\n@@ src/a.ts\n-export const a = 'second';\n+export const a = 'third';\n```\n";
const walk = (fence = "") => "```codewalk" + fence + "\n@file src/g.ts\nexport function g(n: string) {\n  const c = n.trim();\n  return c;\n}\n@step src/g.ts focus=2\nTrim the name first.\n@step src/g.ts#L3 focus=3\nThen return it.\n```\n";
const fm = (body: string, v = "true") => `---\nstatic: ${v}\n---\n# Page\n\n${body}`;

describe("static on the terminal, file tree, editor and code walk", () => {
  test("terminal: live shows the first command with controls; static types every command, no controls", () => {
    const live = html(term()), st = html(term(" static")), two = html(term(" static=2"));
    expect(live).not.toContain("echo third"); expect(controls(live)).toBe(true); expect(live).not.toContain("data-dh-static");
    expect(st).toContain("echo third"); expect(controls(st)).toBe(false); expect(st).toContain("data-dh-static");
    expect(two).toContain("echo second"); expect(two).not.toContain("echo third"); expect(controls(two)).toBe(false);
  });
  test("file tree: static draws the last tree (or the step named), no controls", () => {
    const live = html(tree()), st = html(tree(" static")), named = html(tree(' static="Grow"'));
    expect(live).not.toContain("three.ts"); expect(controls(live)).toBe(true);
    expect(st).toContain("three.ts"); expect(controls(st)).toBe(false);
    expect(named).toContain("two.ts"); expect(named).not.toContain("three.ts");
  });
  test("editor: static shows the file after the last edit (static=1: after the first), no controls", () => {
    const live = html(editor()), st = html(editor(" static")), one = html(editor(" static=1"));
    expect(controls(live)).toBe(true); expect(live).not.toContain("data-dh-static");
    expect(st).toContain("data-dh-static"); expect(controls(st)).toBe(false); expect(st).toContain("third"); expect(st).not.toMatch(/&#x27;second&#x27;;<\/span><\/span><\/div><\/div><\/div>/);
    expect(one).toContain("data-dh-static");
  });
  test("code walk: static shows the last step's note as the current one, no controls", () => {
    const live = html(walk()), st = html(walk(" static"));
    expect(controls(live)).toBe(true); expect(controls(st)).toBe(false); expect(st).toContain("data-dh-static");
    const active = (h: string) => /class="cw-note is-active"[^]*?<\/div>/.exec(h)?.[0] ?? "";
    expect(active(live)).toContain("Trim the name first."); expect(active(st)).toContain("Then return it.");
  });
  test("front matter static: true makes every part static; a fence's static=false stays live; the host's option wins", () => {
    for (const body of [term(), tree(), editor(), walk()]) { const h = html(fm(body)); expect(h).toContain("data-dh-static"); expect(controls(h)).toBe(false); }
    expect(html(fm(term(" static=false")))).not.toContain("data-dh-static");
    expect(html(fm(term(), "false"))).not.toContain("data-dh-static");
    expect(html(term(), { static: "" })).toContain("data-dh-static");
    expect(html(fm(term()), { static: false })).not.toContain("data-dh-static");
  });
  test("the bare word static is static=\"\" on any part, never an animation's kind", () => {
    expect(parse(term(" static")).blocks[0]).toMatchObject({ attrs: { static: "" } });
    const a = parse("```animation static\nbox a \"A\"\n@step one\n@step two\n```\n").blocks[0] as any;
    expect(a.attrs.static).toBe(""); expect(a.attrs.kind).toBeUndefined();
  });
  test("doccheck: static=<n> in range, static=<title> names a step, front matter static is true or false", () => {
    const msgs = (md: string) => check(parse(md)).map((p) => p.message).join("\n");
    expect(msgs(term(" static=3"))).not.toMatch(/static/);
    expect(msgs(term(" static=4"))).toMatch(/static=4 is not a step; the steps are 1 to 3/);
    expect(msgs(term(" static=x"))).toMatch(/its steps have no titles/);
    expect(msgs(tree(' static="Grow"'))).not.toMatch(/static/);
    expect(msgs(tree(' static="Nope"'))).toMatch(/names no step; write a step's number or its exact title/);
    expect(msgs(fm("text\n", "maybe"))).toMatch(/static: in the front matter is true/);
    expect(msgs(fm("text\n", "true"))).not.toMatch(/static/);
  });
  test("static=<title> reaches the renderer as its step number", () => {
    expect((parse(tree(' static="Grow"')).blocks[0] as any).attrs.static).toBe("2");
  });
});

test("the live and still pair fixture: no problems, its static terminal and file tree drawn static, the live ones not", async () => {
  const md = await Bun.file(new URL("../fixtures/format/81-static-live-and-still.dh.md", import.meta.url)).text();
  const d = parse(md);
  expect(check(d).map((p) => p.message)).toEqual([]);
  const h = renderToString(<DhDocument doc={d} />);
  expect((h.match(/class="term"[^>]*data-dh-static/g) ?? []).length).toBe(1);
  expect((h.match(/class="fx"[^>]*data-dh-static/g) ?? []).length).toBe(1);
  expect((h.match(/class="term"/g) ?? []).length).toBe(2);
});
