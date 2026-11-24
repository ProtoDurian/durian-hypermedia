// SPEC 6.13 opens with a short table of the stage's core words (0.7.0-rc.3, the rc.2 second review's SHOULD-FIX 5: "a short
// 'core words' table first, with the long tail after"). Every example in it is real: the page built from them checks clean.
import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse, check } from "../../src/index";
import { beginDocument, endDocument } from "../../src/core/stage-budget";

afterEach(() => { endDocument(); beginDocument(); });
const SPEC = readFileSync(join(import.meta.dir, "../../SPEC.md"), "utf8");
const at = SPEC.indexOf("### 6.13 "), core = SPEC.indexOf("**Core words.**", at), first = SPEC.indexOf("\n- **Roles (colours)**", at);
const rows = SPEC.slice(core, first).split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| To draw") && !l.startsWith("| ---"));
const cells = (l: string) => l.slice(2, -2).split(/ (?<!\\)\| /).map((c) => c.replace(/\\\|/g, "|"));

// the examples, in a page's order: the front matter, the setup, then the steps; and a still stage with a head block
const PAGE = "---\nroles: { client: c1, server: c2, store: c3 }\n---\n# T\n\n```animation\n## Browsers\nclient b1..b4: laptop; phone; tablet; kiosk\n## Servers\nserver s0: api 0 | answers in JSON\nserver s1: api 1\n## Storage\nstore db: orders database\n  store f1: ground floor\n@step Ask: Each browser asks one server.\nb1 --> s0: GET\nlight s0,s1\ntag b1: to api 0\n@step Read: reads.\ns0 --> db (store): SELECT\ntone s1 bad\nsay db: one primary\n@step Key: key.\nkey client: browser to server\n```\n\n```animation static\ntime: 0..60 | seconds\nrow client a \"a\": x 0..10\n@step One: one.\n@step Two: two.\n```\n";

test("SPEC 6.13 opens with the core words table, before the long tail, in 3 columns", () => {
  expect(core).toBeGreaterThan(at); expect(core).toBeLessThan(first);
  expect(rows.length).toBeGreaterThanOrEqual(12);
  for (const r of rows) expect(cells(r).length).toBe(3);
});

test("every example in the table is in a page that checks clean", () => {
  const doc = parse(PAGE, { path: "t.dh.md" });
  expect(check(doc).filter((p) => p.level === "error").map((p) => p.message)).toEqual([]);
  for (const r of rows) {
    const ex = cells(r)[2].match(/^`+ ?(.*?) ?`+$/)![1].replace(/^```animation static$/, "```animation static");
    const want = ex.startsWith("roles:") ? "roles: { client: c1, server: c2" : ex.trim();
    expect({ ex, inPage: PAGE.includes(want) }).toEqual({ ex, inPage: true });
  }
});
