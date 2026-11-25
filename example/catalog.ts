/** The example index keeps each fixture in one section. */
export type ExamplePage = { group: string; file: string; title: string; href: string };
export function exampleSections(pages: ExamplePage[], groups: string[]): { title: string; pages: ExamplePage[] }[] {
  const featured = ["format/00-fishbone.dh.md", "format/00-sankey.dh.md"].flatMap(file => pages.filter(p => p.file === file));
  const rest = groups.map(title => ({ title, pages: pages.filter(p => p.group === title && !featured.includes(p)) }));
  return featured.length ? [{ title: "Start here", pages: featured }, ...rest] : rest;
}
