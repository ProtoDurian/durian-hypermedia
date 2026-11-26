// Lane core2: `dh migrate <file>` (parse/migrate-cli.ts): prints the diff, writes only with --write.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { migrateCommand, unifiedDiff, type MigrateIo } from "../../../src/engine/parse/migrate-cli";
import { check } from "../../../src/index";

const page = readFileSync(join(import.meta.dir, "../../../fixtures/format/48-animation-binary-search-tree-insert.dh.md"), "utf8");
const make = (files: Record<string, string>) => {
  const log = { out: [] as string[], err: [] as string[], writes: [] as string[] };
  const io: MigrateIo = { read: (p) => { if (!(p in files)) throw new Error("no such file"); return files[p]; }, write: (p, t) => { files[p] = t; log.writes.push(p); }, out: (s) => log.out.push(s), err: (s) => log.err.push(s) };
  return { io, log, files };
};

describe("dh migrate", () => {
  test("prints the diff and does not write without --write", () => {
    const { io, log, files } = make({ "p.dh.md": page });
    expect(migrateCommand(["p.dh.md"], io)).toBe(0);
    expect(log.writes).toEqual([]);
    expect(files["p.dh.md"]).toBe(page);
    const text = log.out.join("\n");
    expect(text).toContain("+format: 12");
    expect(text).toContain("-add token k \"6\" at n8");
    expect(text).toContain("+k at n8");
    expect(text).toContain("not written");
  });
  test("--write writes the page, which then reads as format 12 with no error", () => {
    const { io, log, files } = make({ "p.dh.md": page });
    expect(migrateCommand(["p.dh.md", "--write"], io)).toBe(0);
    expect(log.writes).toEqual(["p.dh.md"]);
    expect(files["p.dh.md"]).toContain("format: 12");
    expect(check(files["p.dh.md"], { path: "p.dh.md" }).filter((p) => p.level === "error")).toEqual([]);
  });
  test("a page already in format 12 has nothing to change", () => {
    const { io, log } = make({ "p.dh.md": page });
    migrateCommand(["p.dh.md", "--write"], io);
    const again = make({ "p.dh.md": io.read("p.dh.md") });
    expect(migrateCommand(["p.dh.md", "--write"], again.io)).toBe(0);
    expect(again.log.writes).toEqual([]);
    expect(again.log.out.join("\n")).toContain("nothing to change");
    void log;
  });
  test("a block the old reader refuses stops the migration, naming its line, and writes nothing", () => {
    const bad = page.replace("move k to n3", "frobnicate k");
    const { io, log } = make({ "p.dh.md": bad });
    expect(migrateCommand(["p.dh.md", "--write"], io)).toBe(1);
    expect(log.err.join("\n")).toMatch(/p\.dh\.md: line \d+: /);
    expect(log.writes).toEqual([]);
  });
  test("wrong arguments and a missing file", () => {
    const { io, log } = make({});
    expect(migrateCommand([], io)).toBe(2);
    expect(migrateCommand(["a", "b"], io)).toBe(2);
    expect(migrateCommand(["a", "--force"], io)).toBe(2);
    expect(migrateCommand(["gone.dh.md"], io)).toBe(1);
    expect(log.err.join("\n")).toContain("no such file");
  });
});

describe("unifiedDiff", () => {
  test("hunks carry 3 lines of context and the right counts", () => {
    const a = Array.from({ length: 20 }, (_, i) => `l${i}`).join("\n");
    const b = a.replace("l10", "L10");
    expect(unifiedDiff(a, b, "x")).toBe(["--- x", "+++ x (format 12)", "@@ -8,7 +8,7 @@", " l7", " l8", " l9", "-l10", "+L10", " l11", " l12", " l13"].join("\n"));
    expect(unifiedDiff(a, a, "x")).toBe("");
  });
});
