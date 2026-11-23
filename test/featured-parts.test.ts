import { expect, test } from "bun:test";
import { exampleSections } from "../example/catalog";
test("Fishbone and Sankey are the first examples, with every other fixture listed once", () => {
  const page = (file: string, group = "Format") => ({ file, group, title: file, href: file + ".html" });
  const pages = [page("ordinary.md", "Hand-written"), page("format/01-other.dh.md"), page("format/00-sankey.dh.md"), page("format/00-fishbone.dh.md")];
  const files = exampleSections(pages, ["Hand-written", "Format"]).flatMap(s => s.pages.map(p => p.file));
  expect(files.slice(0, 2)).toEqual(["format/00-fishbone.dh.md", "format/00-sankey.dh.md"]);
  expect(files.slice(2)).toEqual(["ordinary.md", "format/01-other.dh.md"]);
  expect(new Set(files).size).toBe(pages.length);
});
