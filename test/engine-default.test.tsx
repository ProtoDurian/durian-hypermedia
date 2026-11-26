// The page draws every animation with the one engine unless the host says engine "old" (src/engine/bridge.ts).
import { describe, expect, test } from "bun:test";
import { parse, check } from "../src/index";
import { ENGINE_DEFAULT } from "../src/engine/bridge";
import { html } from "./helpers";

const page = (body: string) => `---\ntitle: T\ndescription: D\n---\n\n\`\`\`animation\n${body}\n\`\`\`\n`;
const GOOD = 'box a "app"\nbox b "database"\na -> b\n@step one\nhighlight a\n@step two\nhighlight b';

describe("the default engine", () => {
  test("is the one engine", () => { expect(ENGINE_DEFAULT).toBe("new"); });
  test("an animation draws through it: no old-engine markup, whichever engine a host names", () => {
    const doc = parse(page(GOOD));
    const byDefault = html(doc), explicit = html(doc, "new");
    expect(byDefault).toBe(explicit);
    expect(byDefault).toContain("<svg");
    expect(byDefault).not.toContain("scn-caps"); // the old animation's caption strip
    expect(html(doc, "old")).toContain("scn-caps"); // a host can still ask for the old engines while they exist
  });
  test("a block the engine refuses shows its refusal with the line, not the old engine's drawing", () => {
    const bad = page('box a "app"\n@step one\nhighlight nosuchthing');
    const out = html(parse(bad));
    expect(out).toContain("dh-error");
    expect(out).toMatch(/line \d+:/);
    expect(out).not.toContain("scn-caps");
    expect(check(parse(bad)).some((p) => p.level === "error")).toBe(true);
  });
});
