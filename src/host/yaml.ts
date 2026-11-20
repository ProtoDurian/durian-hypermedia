// YAML for front matter and chart data. Bun has a YAML parser built in; anywhere else the host sets one once:
//   import { parse } from "yaml"; setYamlParser(parse);
type YamlParse = (text: string) => unknown;
let custom: YamlParse | null = null;
export function setYamlParser(fn: YamlParse | null): void { custom = fn; }
export function yamlParse(text: string): any {
  if (custom) return custom(text);
  const B = (globalThis as any).Bun;
  if (B?.YAML?.parse) return B.YAML.parse(text);
  throw new Error("durian-hypermedia: no YAML parser; call setYamlParser() (for example with parse from the yaml package)");
}
