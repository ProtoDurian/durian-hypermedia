// rows <role> (0.7.0-rc.3, rc.3 review Row 3): a rows block takes a role, so a table drawn as rows (a routing table, a
// MAC table) is told apart by its family like the cards beside it: each row's box in the family's fill and border, a
// plain row's words in its ink. doccheck refuses a role the page does not declare. Before, "rows" took only "plain" and
// every row was the neutral surface with a hairline, so the layers example's routing and MAC tables stayed white.
import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compileStage, layoutStage } from "../../src/core/stage";
import { beginDocument } from "../../src/core/stage-budget";

beforeEach(() => beginDocument());
const ROLES = { table: 8, link: 5 };
const TABLE = "  ^ routing table | next hop | out\n  192.0.2.0/24 | on this network | copper\n  * 0.0.0.0/0 | * 198.51.100.6 | * fibre";
const stage = (word: string) => compileStage("title: t", [{ title: "One: x", raw: `${word}\n${TABLE}`, line: 2 }, { title: "Two: y", raw: "foot: done", line: 20 }], 1, {}, ROLES);
const frames = (word: string, w = 1000) => (layoutStage(stage(word).model, w).items as any[]).filter((i) => i.k === "box" && i.bar?.kind === "worksheet-row");

describe("rows <role>", () => {
  for (const w of [1000, 360]) test(`"rows table": each row's box in the family's fill and border (${w})`, () => {
    expect(stage("rows table").errors).toEqual([]);
    const f = frames("rows table", w);
    expect(f.length).toBe(2);
    for (const b of f) { expect(b.fill).toBe("role:table:plane"); expect(b.stroke).toBe("role:table:line"); expect(b.role).toBe("table"); }
  });
  test('plain "rows" keeps the neutral rows', () => {
    for (const b of frames("rows")) { expect(b.fill).toBe("surface"); expect(b.stroke).toBe("line-2"); }
  });
  test('"rows plain table": the words of a plain row in the family\'s ink; toned words keep their tone', () => {
    const c = stage("rows plain table"); expect(c.errors).toEqual([]);
    const t = (layoutStage(c.model, 1000).items as any[]).filter((i) => i.k === "text");
    expect(t.find((x) => x.s === "192.0.2.0/24").ink).toBe("role:table:ink");
    expect(t.find((x) => x.s === "0.0.0.0/0").ink).toBe("acc:ink");
  });
  test("a role the page does not declare is refused, naming the page's roles; two roles are refused", () => {
    expect(stage("rows route").errors.map((e) => e.msg).join("\n")).toMatch(/"route" is not a role of this page; the page declares table, link/);
    expect(stage("rows table link").errors.map((e) => e.msg).join("\n")).toMatch(/rows takes "plain" \(a compact table\), a role/);
  });
  test("the layers example draws its routing tables in the table family and the switch's MAC table in link", () => {
    const text = readFileSync(join(import.meta.dir, "../../fixtures/stage/example-layers.dh.md"), "utf8");
    const lines = text.split("\n"), word = (head: RegExp) => lines.filter((_, i) => head.test(lines[i + 1] ?? "")).map((l) => l.trim());
    expect(word(/^\s+\^ (routing table T\d|the server's table T5) \|/)).toEqual(["rows table", "rows table", ...Array(6).fill("rows plain table") /* section 6 (rc.5) */, "rows table", "rows plain table", "rows plain table"]);
    expect(word(/^\s+\^ the switch's MAC table \|/)).toEqual(["rows link", "rows link"]);
  });
});
