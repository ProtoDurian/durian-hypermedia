// list ... | <role> (0.7.0-rc.3, rc.3 review Row 3): a list panel takes a role after "|", so a table written as a list
// (a NAT table, a neighbour cache) is told apart by its family like the cards and rows beside it: its box in the family's
// fill and border. "roomy" and a role may be given together. doccheck refuses a role the page does not declare. Before,
// a list took only "roomy" after "|" and was always the neutral surface with a hairline.
import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compileStage, layoutStage } from "../../src/core/stage";
import { beginDocument } from "../../src/core/stage-budget";

beforeEach(() => beginDocument());
const ROLES = { table: 8, link: 5 };
const LIST = "  state: established\n  to: 198.51.100.7:40001 becomes 192.0.2.10:51514";
const stage = (head: string) => compileStage("title: t", [{ title: "One: x", raw: `${head}\n${LIST}`, line: 2 }, { title: "Two: y", raw: "foot: done", line: 20 }], 1, {}, ROLES);
const frame = (head: string, w = 1000) => (layoutStage(stage(head).model, w).items as any[]).find((i) => i.k === "box" && i.cls === "scn-frame" && i.bar?.label === "NAT table");

describe("list ... | <role>", () => {
  for (const w of [1000, 360]) test(`"list NAT table | table": the box in the family's fill and border (${w})`, () => {
    expect(stage("list NAT table | table").errors).toEqual([]);
    const b = frame("list NAT table | table", w);
    expect(b.fill).toBe("role:table:plane"); expect(b.stroke).toBe("role:table:line"); expect(b.role).toBe("table");
  });
  test('"roomy" and a role together; a plain list keeps the neutral box', () => {
    expect(stage("list NAT table | roomy table").errors).toEqual([]);
    const r = frame("list NAT table | roomy table"); expect(r.fill).toBe("role:table:plane");
    const n = frame("list NAT table"); expect(n.fill).toBe("surface"); expect(n.stroke).toBe("line-2");
  });
  test("a role the page does not declare is refused, naming the page's roles; two roles are refused", () => {
    expect(stage("list NAT table | nat").errors.map((e) => e.msg).join("\n")).toMatch(/"nat" is not a role of this page; the page declares table, link/);
    expect(stage("list NAT table | table link").errors.map((e) => e.msg).join("\n")).toMatch(/a list takes roomy, a role or both after "\|"/);
  });
  test("the layers example draws its NAT table list in the table family and its neighbour cache list in link", () => {
    const text = readFileSync(join(import.meta.dir, "../../fixtures/stage/example-layers.dh.md"), "utf8");
    expect(text).toContain("\nlist NAT table T8 | table\n");
    expect(text).toContain("\nlist neighbour cache | link\n");
  });
});
