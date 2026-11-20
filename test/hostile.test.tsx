// Untrusted input: each hostile fixture is one attack, and each is neutralised.
import { describe, expect, test } from "bun:test";
import { parse, defaultUrlPolicy, applyUrlPolicy, schemeOf } from "../src/index";
import { fixtures, html, taskBlock } from "./helpers";

const H = Object.fromEntries(fixtures("hostile").map((f) => [f.name.replace(/^hostile\//, "").replace(/\.dh\.md$/, ""), f.text]));
const render = (k: string) => { const d = parse(H[k], { blocks: [taskBlock] }); return { d, out: html(d) }; };
// what must never appear in rendered HTML
function safe(out: string) {
  expect(out).not.toMatch(/<script[\s>]/i);
  expect(out).not.toMatch(/<(iframe|object|embed|foreignObject|style)[\s>]/i);
  for (const tag of out.matchAll(/<[a-zA-Z][^>]*>/g)) for (const a of tag[0].matchAll(/\s([a-zA-Z_:][-\w:.]*)(?:=("[^"]*"|'[^']*'|[^\s>]+))?/g)) expect(a[1].toLowerCase().startsWith("on")).toBe(false);   // no event handler attribute
  expect(out).not.toMatch(/(href|src)\s*=\s*"\s*(javascript|vbscript|data|file|blob):/i);
  expect(out).not.toMatch(/(href|src)\s*=\s*"[^"]*&#/i);               // no encoded scheme sneaks through
}
// the JSON a server puts in the page cannot close its script tag
const json = (d: unknown) => JSON.stringify(d).replace(/</g, "\\u003c");

describe("hostile fixtures", () => {
  for (const k of Object.keys(H)) test(`${k}: renders safe`, () => { const { d, out } = render(k); safe(out); expect(json(d)).not.toMatch(/<\/script/i); });

  test("raw HTML shows as text", () => {
    const { out } = render("01-raw-html-script");
    expect(out).toContain("&lt;script&gt;window.__pwned");
    expect(out).toContain("&lt;iframe");
  });
  test("inline HTML shows as text", () => { expect(render("02-raw-html-inline").out).toContain("&lt;img src=x onerror="); });
  test("javascript links lose the link, keep the text", () => {
    const { out } = render("03-javascript-links");
    for (const t of ["plain", "upper", "entity", "hex entity", "named colon", "tab inside", "percent", "spaces"]) expect(out).toContain(t);
    expect(out).not.toMatch(/<a [^>]*href=/i);
  });
  test("data, vbscript, file, blob and http images are dropped", () => {
    const { out } = render("04-data-vbscript-file-links");
    expect(out).not.toMatch(/<a [^>]*href=/i);
    expect(out).not.toMatch(/<img /i);
  });
  test("hidden characters in a scheme", () => { expect(render("05-zero-width-scheme").out).not.toMatch(/<a [^>]*href=/i); });
  test("mermaid: the init directive is dropped, the source is text", () => {
    const { d, out } = render("06-mermaid-attacks");
    const m = d.blocks.find((b) => b.type === "mermaid") as any;
    expect(m.steps[0].src).not.toContain("%%{");
    expect(d.problems.some((p) => p.message.includes("directives are dropped"))).toBe(true);
    expect(out).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });
  test("HTML in every part's text is text", () => {
    const { d, out } = render("07-html-in-part-text");
    expect(d.blocks.filter((b) => b.type === "error")).toEqual([]);
    expect(out).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });
  test("deep nesting is refused as text", () => { const { d } = render("08-deep-nesting"); expect(d.problems.some((p) => p.message.includes("nested deeper"))).toBe(true); });
  test("an animation with too many things is refused", () => { const { d } = render("09-animation-too-many-things"); expect(d.blocks.some((b) => b.type === "error" && b.part === "animation" && /limit is 300/.test(b.message))).toBe(true); });
  test("an animation with too many steps is refused", () => { const { d } = render("10-animation-too-many-steps"); expect(d.blocks.some((b) => b.type === "error" && /steps; the limit/.test(b.message))).toBe(true); });
  test("a chart with too many points is refused", () => { const { d } = render("11-chart-too-many-points"); expect(d.blocks.some((b) => b.type === "error" && b.part === "chart")).toBe(true); });
  test("a YAML alias bomb is refused", () => {
    const { d } = render("12-yaml-alias-bomb");
    expect(d.problems.some((p) => p.message.includes("anchors and aliases"))).toBe(true);
    expect(d.blocks.some((b) => b.type === "error" && b.part === "chart")).toBe(true);
  });
  test("an unclosed fence: one error block, the page as text", () => { const { d } = render("13-unclosed-fence"); expect(d.blocks[0].type).toBe("error"); expect(d.blocks[1].type).toBe("markdown"); });
  test("an unknown container is an error block", () => { const { d } = render("14-unknown-container"); expect(d.blocks.some((b) => b.type === "error" && /not a part/.test(b.message))).toBe(true); });
  test("every id starts with dh-", () => {
    const { out } = render("15-id-clobbering");
    const ids = [...out.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(2);
    for (const id of ids) expect(id.startsWith("dh-")).toBe(true);
    expect(out).toContain('href="#dh-location"');
  });
  test("a host block that throws becomes an error block", () => { const { d } = render("16-host-block-throws"); expect(d.blocks.some((b) => b.type === "error" && /needs id/.test(b.message))).toBe(true); });
  test("broken front matter: ignored with a message", () => { const { d, out } = render("17-front-matter-broken"); expect(d.problems[0].message).toContain("front matter"); expect(out).toContain("still renders"); });
  test("a banner with HTML: text, kind info, no link", () => {
    const { d, out } = render("18-banner-html");
    expect(d.banner?.kind).toBe("info");
    expect(out).toContain("&lt;img src=x");
    expect(out).not.toMatch(/<a [^>]*href=/i);
  });
});

describe("the URL policy", () => {
  test("default", () => {
    expect(defaultUrlPolicy("https://a.example/x", "link")).toBe("https://a.example/x");
    expect(defaultUrlPolicy("mailto:a@example.com", "link")).toBe("mailto:a@example.com");
    expect(defaultUrlPolicy("./p.md", "link")).toBe("./p.md");
    expect(defaultUrlPolicy("#x", "link")).toBe("#x");
    expect(defaultUrlPolicy("http://a.example/i.png", "image")).toBeNull();
    expect(defaultUrlPolicy("//a.example/i.png", "image")).toBeNull();
    for (const u of ["javascript:x", " JAVASCRIPT:x", "java\tscript:x", "&#106;avascript:x", "%6Aavascript:x", "data:text/html,x", "vbscript:x", "file:///x"]) expect(defaultUrlPolicy(u, "link")).toBeNull();
    expect(schemeOf("java\u{200b}script:x")).toBe("javascript");
  });
  test("a host policy can rewrite, never let a script URL through", () => {
    const pol = (u: string) => (u.startsWith("/") ? `https://cdn.example${u}` : "javascript:alert(1)");
    expect(applyUrlPolicy("/a.png", "image", pol)).toBe("https://cdn.example/a.png");
    expect(applyUrlPolicy("x", "link", pol)).toBeNull();
  });
  test("parse uses the host policy", () => {
    const d = parse("[a](/docs) ![b](/i.png)", { urlPolicy: (u, k) => (k === "image" ? null : `https://h.example${u}`) });
    const out = html(d);
    expect(out).toContain('href="https://h.example/docs"');
    expect(out).not.toContain("<img");
  });
});
