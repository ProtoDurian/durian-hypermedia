// render3: a sent token becomes an item (format 95). `send "seg 1" app -> buf as s1` lowers to `app -> buf: seg 1`, `show s1`,
// `s1 in buf`: the words were drawn twice at step 1, on the line and as the item in the buffer. The send keeps its dot, not its words.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fencesOf, ROOT } from "../parse/fixtures";
import { compile } from "../../../src/engine/pipeline";
import { migrate } from "../../../src/engine/parse/migrate";
import type { EngineSrc } from "../../../src/engine/types";

const FILE = "fixtures/format/95-animation-sent-items.dh.md";
describe("a send whose words become an item", () => {
  const text = readFileSync(join(ROOT, FILE), "utf8");
  for (const [form, page] of [["old", text], ["format 12", migrate(text)]] as const) test(form, () => {
    const c = compile(fencesOf(join(ROOT, FILE), page, form)[0].src);
    expect(c.motions[1].events.filter((e) => e.k === "send").map((e) => [e.k === "send" && e.rel, e.k === "send" && e.words])).toEqual([["app->buf", null]]);
  });
  test("a send whose words are no token it brings keeps them", () => {
    const src: EngineSrc = { body: "layout: graph\nplain a [box]: a\nplain b [box]: b\nplain t [token]: job\n@step One\na -> b: hello\nt at b", line0: 1, fence: {}, roles: {}, format12: true };
    const c = compile(src);
    expect(c.motions[1].events.filter((e) => e.k === "send").map((e) => e.k === "send" && e.words)).toEqual(["hello"]);
  });
});
