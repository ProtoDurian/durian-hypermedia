// Inline marks in captions, speech and notes (SPEC 6.15): `code`, **bold** and *italic*, and nothing else.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compileScene, sceneLlm, type Compiled } from "../src/core/scene";
import { codeSpans, hasMarks, plain, spans, unclosedTick } from "../src/core/inline";
import { parseDoc, structureOf } from "../src/core/dh-lib";
import { check, parse } from "../src/index";
import { html } from "./helpers";
import { setRich } from "../src/ui/inline-dom";

// a scene from its source text, as the page would hand it to the engine
function scene(src: string, info: Record<string, string> = {}): Compiled {
  const head: string[] = [], steps: { title: string; raw: string; line: number }[] = [];
  src.split("\n").forEach((l, i) => {
    const m = l.match(/^@step\s*(.*)$/);
    if (m) steps.push({ title: m[1], raw: "", line: i });
    else if (steps.length) steps[steps.length - 1].raw += (steps[steps.length - 1].raw ? "\n" : "") + l;
    else head.push(l);
  });
  return compileScene(head.join("\n"), steps, 0, info);
}
const msgs = (c: Compiled) => c.errors.map((e) => e.msg).join(" | ");

describe("inline marks in captions, speech and notes", () => {
  const show = (s: string) => spans(s).map((x) => `${x.code ? "C" : ""}${x.b ? "B" : ""}${x.i ? "I" : ""}:${x.t}`).join("|");
  test("the three marks, and code keeps what is in it", () => {
    expect(show("run `task gen` first")).toBe(":run |C:task gen|: first");
    expect(show("**never** by *hand*.")).toBe("B:never|: by |I:hand|:.");
    expect(show("`a*b*` and **use `gen` now**")).toBe("C:a*b*|: and |B:use |CB:gen|B: now");
    expect(show("生成**文件**后")).toBe(":生成|B:文件|:后");
  });
  test("a star that is not a mark stays a star", () => {
    for (const s of ["2 * 3 * 4", "*.ts,*.js", "a*b*c", "match *.proto and *.go", "**open", "x ** y"]) expect(show(s)).toBe(`:${s}`);
  });
  test("other Markdown and HTML stay text", () => {
    for (const s of ["[a](https://example.com)", "<b>hi</b>", "_not_ italic"]) expect(show(s)).toBe(`:${s}`);
  });
  test("an unclosed backtick is refused with its line", () => {
    for (const [src, line] of [["box a\n@step run `gen\nhighlight a\n@step two\nhighlight a", 1], ["box a\n@step one\nsay a: the `gen\n@step two\nhighlight a", 2], ['box a note="the `gen"\n@step one\nhighlight a\n@step two\nhighlight a', 0]] as const) {
      const e = scene(src).errors.find((x) => x.msg.includes("not closed"));
      expect(e?.line).toBe(line);
      expect(e?.msg).toContain("`code`");
    }
  });
  test("backticks in a stage label are a warning", () => {
    const c = scene('box a "`gen`"\n@step one\nhighlight a\n@step two\nhighlight a');
    expect(c.warnings.find((w) => w.msg.includes("backticks"))?.line).toBe(0);
    expect(msgs(c)).toBe("");
  });
  test("speech is wrapped and sized without the marks, and the LLM view keeps them", () => {
    const c = scene('box a\n@step Run `gen`.\nsay a: run `task gen` now\n@step **Done**.\nhighlight a');
    const m = c.frames[0].marks.find((x) => x.kind === "say")!;
    expect(m.lines.join(" ")).toBe("run task gen now");
    expect(sceneLlm(c)).toContain("1. Run `gen`.");
    expect(sceneLlm(c)).toContain("2. **Done**.");
  });
  test("a translation must keep a caption's code spans", () => {
    const doc = (cap: string) => parseDoc("x.dh.md", `---\ntitle: X\ndescription: Y\n---\n\n# X\n\n\`\`\`animation\nbox a\n@step ${cap}\nhighlight a\n@step two\nhighlight a\n\`\`\`\n`);
    const en = JSON.stringify(structureOf(doc("Run `gen`.")));
    expect(JSON.stringify(structureOf(doc("Lancer `gen`.")))).toBe(en);
    expect(JSON.stringify(structureOf(doc("Lancer `generer`.")))).not.toBe(en);
  });
});

describe("inline marks in a rendered page", () => {
  const src = "---\ntitle: T\ndescription: D\n---\n\n# T\n\n```animation layout=graph\nbox a \"A\" note=\"keeps the `id`\"\n@step Run `task gen`, **never** by *hand*.\nsay a: run `task gen` now\n@step two\nhighlight a\n```\n";
  test("a caption draws code, bold and italic as elements, never as HTML text", () => {
    const out = html(parse(src));
    expect(out).toContain('<code class="scn-code"');
    expect(out).toContain("<strong>never</strong>");
    expect(out).toContain("<em>hand</em>");
    const cap = out.slice(out.indexOf("scn-cap"), out.indexOf("</div>", out.indexOf("scn-cap")));
    expect(cap).not.toContain("`");
  });
  test("an unclosed backtick is a doccheck error", () => {
    const bad = src.replace("Run `task gen`", "Run `task gen");
    expect(check(bad).some((p) => /not closed/.test(p.message))).toBe(true);
    expect(check(src).filter((p) => p.level === "error")).toEqual([]);
  });
  test("the LLM view keeps the marks", () => {
    expect(sceneLlm(scene("box a\n@step Run `gen`, **now**.\nhighlight a\n@step two\nhighlight a"))).toContain("1. Run `gen`, **now**.");
  });
  test("the helpers: plain, hasMarks, unclosedTick and codeSpans", () => {
    expect(plain("run `a b` **c** *d*")).toBe("run a b c d");
    expect(hasMarks("plain words")).toBe(false);
    expect(hasMarks("a `b`")).toBe(true);
    expect(unclosedTick("a `b")).toBe(true);
    expect(codeSpans("x `a` y `b`")).toEqual(["`a`", "`b`"]);
  });
  test("one pass: ten times the text takes about ten times the work", () => {
    const t = (n: number) => { const s = ("`a` **b** *c* x * y ".repeat(n)); const t0 = performance.now(); spans(s); return performance.now() - t0; };
    t(2000);
    const small = Math.max(t(5000), 0.05), big = t(50000);
    expect(big / small).toBeLessThan(40);
    expect(() => spans("**".repeat(30000))).not.toThrow();
    expect(() => spans("`".repeat(30000))).not.toThrow();
  });
});
