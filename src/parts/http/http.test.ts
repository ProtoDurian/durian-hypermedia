// The http part: parse, the LLM view (as written), every refusal, the secret rule, its caps in both sets, the doubling
// test (budget charges counted at n and 2n, never time), the drawn message (static markup, live and static) and the
// hostile fixtures.
import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse, check, LIMITS, UNTRUSTED_LIMITS } from "../../index";
import { Budget, partLimitsOf } from "../../core/budget";
import http, { curlOf, jsonTree, looksLikeHttp, parseHttp, secretHeaders, statusClass } from "./part";
import HttpView from "./view";

// Key-shaped header values are put together at run time, so the source holds no literal that a secret scanner flags.
const HEX32 = Array.from({ length: 32 }, (_, i) => "0123456789abcdef"[(i * 7 + 5) % 16]).join("");
const LIVE_KEY = ["sk", "live", "Q7mzR2".repeat(4)].join("_");
const BASIC = btoa(["user", "password"].join(":"));
const fence = (body: string, info = "") => `# Page\n\n\`\`\`http${info ? " " + info : ""}\n${body}\n\`\`\`\n`;
const MSG = `POST /v1/orders HTTP/1.1
Host: api.example.com
Content-Type: application/json
Authorization: Bearer <token>

{ "sku": "tea", "qty": 2 }

HTTP/1.1 201 Created
Content-Type: application/json

{ "id": "o-7", "status": "open" }`;
const big = () => new Budget({ steps: 1e12, values: 1e12, chars: 1e12 });
const all = (src: string) => check(parse(src, { path: "p.dh.md" }));
const errorsOf = (src: string) => all(src).filter((p) => p.level === "error").map((p) => p.message);
const warnsOf = (src: string) => all(src).filter((p) => p.level === "warn").map((p) => p.message);
const lim = LIMITS;
const P = (body: string, attrs: Record<string, string> = {}, l = lim, b?: Budget) => parseHttp(body, 1, attrs, l, b);
const props = (data: ReturnType<typeof parseHttp>, st?: string | false) => ({ data, block: { id: "x", line: 1, attrs: {}, llm: "" } as any, ui: {} as any, static: st, stage: { width: 600, theme: "light" as const, motion: "on" as const, report() {} } });
const html = (body: string, st?: string | false, attrs: Record<string, string> = {}) => renderToStaticMarkup(React.createElement(HttpView, props(P(body, attrs), st)));

describe("http: parse and the LLM view", () => {
  test("a request and its response, in a block with no problems", () => {
    const doc = parse(fence(MSG), { path: "p.dh.md" });
    const b = doc.blocks.find((x) => x.type === "http")!;
    expect(b).toBeDefined();
    if (b.type !== "http") throw new Error("not http");
    const r = b.data;
    expect(r.req!.method).toBe("POST");
    expect(r.req!.headers.length).toBe(3);
    expect(r.req!.body).toBe('{ "sku": "tea", "qty": 2 }');
    expect(r.res!.status).toBe(201);
    expect(r.res!.reason).toBe("Created");
    expect(r.res!.body).toContain('"id": "o-7"');
    expect(b.llmKind).toBe("as-is");
    expect(check(doc)).toEqual([]);
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });
  test("a response alone, and a request alone", () => {
    expect(P("HTTP/1.1 404 Not Found\nContent-Type: text/plain\n\nnope").res!.body).toBe("nope");
    expect(P("GET /x HTTP/1.1\nHost: example.com").req!.body).toBe("");
    expect(P("GET /x").req!.version).toBe("HTTP/1.1");
    expect(P("HTTP/2 200").res).toMatchObject({ version: "HTTP/2", status: 200, reason: "" });
  });
  test("status colour words by class", () => {
    expect([200, 301, 404, 503, 101].map(statusClass)).toEqual(["good", "acc", "warn", "bad", "muted"]);
  });
  test("Copy as curl", () => {
    expect(P(MSG).curl).toBe(`curl -X POST 'https://api.example.com/v1/orders' -H 'Content-Type: application/json' -H 'Authorization: Bearer <token>' --data-raw '{ "sku": "tea", "qty": 2 }'`);
    expect(P("GET /x HTTP/1.1").curl).toBeNull();   // no host
    expect(P("GET https://example.com/a?b=1 HTTP/1.1").curl).toBe("curl 'https://example.com/a?b=1'");
    expect(P("POST /a HTTP/1.1\nHost: example.com\n\nit's").curl).toContain(`'it'\\''s'`);
    expect(P("GET /a HTTP/1.1\nHost: 192.0.2.7:8080").curl).toBe("curl 'http://192.0.2.7:8080/a'");
    expect(curlOf(P("GET /a HTTP/1.1\nHost: example.com").req!)).toBe("curl 'https://example.com/a'");
  });
  test("a JSON body is a foldable tree", () => {
    const t = jsonTree('{"a":[1,2,{"b":null}],"c":"x"}', lim)!;
    expect(t.k).toBe("obj");
    expect((t as any).kids.length).toBe(2);
    expect(jsonTree("not json", lim)).toBeNull();
    expect(jsonTree("[".repeat(40) + "]".repeat(40), lim)).toBeNull();   // too deep stays text
    expect(P(MSG).reqTree).not.toBeNull();
    expect(P("GET /a HTTP/1.1\n\nplain words").reqTree).toBeNull();
  });
  test("the LLM view is the message as written", () => {
    const doc = parse(fence(MSG), { path: "p.dh.md" });
    expect(doc.llm).toContain("POST /v1/orders HTTP/1.1");
    expect(doc.llm).toContain("HTTP/1.1 201 Created");
  });
  test("a :::llm after it replaces its LLM view", () => {
    const doc = parse(fence(MSG) + "\n:::llm\nCreating an order returns 201.\n:::\n", { path: "p.dh.md" });
    expect(doc.llm).toContain("Creating an order returns 201.");
    expect(doc.llm).not.toContain("HTTP/1.1 201 Created");
  });
  test("a windows line end is read like a unix one", () => {
    expect(P("GET /a HTTP/1.1\r\nHost: example.com\r\n").req!.headers[0]).toMatchObject({ name: "Host", value: "example.com" });
  });
  test("looksLikeHttp", () => {
    expect(looksLikeHttp("\n\nGET /a HTTP/1.1")).toBe(true);
    expect(looksLikeHttp("HTTP/1.1 200 OK")).toBe(true);
    expect(looksLikeHttp("curl -X POST https://example.com")).toBe(false);
    expect(looksLikeHttp("FETCH /a")).toBe(false);
  });
});

describe("http: refusals and warnings name the line and the fix", () => {
  test("a body that is not a message stays a code block (a warning, no error)", () => {
    const src = fence("curl -X POST https://example.com\nsome output");
    expect(errorsOf(src)).toEqual([]);
    expect(warnsOf(src).some((m) => m.includes("http:") && m.includes("stays a plain code block"))).toBe(true);
    expect(P("curl -X POST https://example.com").plain).toBe(true);
  });
  test("a header line that is not a header, naming the line", () => {
    const p = all(fence("GET /a HTTP/1.1\nHost: example.com\nthis is not a header\n")).find((x) => x.level === "error")!;
    expect(p.message).toMatch(/http: .*not a header/);
    expect(p.line).toBe(6);   // fence on 3, the request on 4, Host on 5, the bad line on 6
  });
  test("after the request comes its response", () => {
    expect(errorsOf(fence("GET /a HTTP/1.1\n\nbody\n\nsomething else")).some((m) => /after the request comes its response/.test(m)) || P("GET /a HTTP/1.1\n\nbody\n\nsomething else").req!.body.includes("something else")).toBe(true);
    expect(errorsOf(fence("GET /a HTTP/1.1\nHost: example.com\n\nHTTP/1.1 200 OK\nbroken header line")).some((m) => /not a header/.test(m))).toBe(true);
  });
  test("an unknown fence key", () => { expect(errorsOf(fence("GET /a HTTP/1.1", "colour=red")).join()).toMatch(/unknown key "colour"/); });
  test("a secret in a sensitive header is refused (write <token>)", () => {
    const bad = (h: string) => errorsOf(fence(`GET /a HTTP/1.1\nHost: example.com\n${h}`)).some((m) => m.includes("real-looking secret"));
    expect(bad(`Authorization: Bearer ${HEX32}`)).toBe(true);
    expect(bad("Cookie: session=abcdef0123456789")).toBe(true);
    expect(bad(`X-Api-Key: ${LIVE_KEY}`)).toBe(true);
    expect(bad(`X-Session-Token: ${HEX32}`)).toBe(true);
    expect(bad("Authorization: Bearer <token>")).toBe(false);
    expect(bad("X-Api-Key: ${API_KEY}")).toBe(false);
    expect(bad("Cookie: session=<session>")).toBe(false);
    expect(bad("Authorization: Bearer ...")).toBe(false);
    expect(bad("Authorization: Bearer redacted-redacted")).toBe(false);
    expect(bad("Accept: application/json")).toBe(false);
    expect(secretHeaders(P(`GET /a HTTP/1.1\nAuthorization: Basic ${BASIC}`).req!.headers).length).toBe(1);
  });
  test("a refused secret is not drawn", () => {
    const h = html(`GET /a HTTP/1.1\nAuthorization: Bearer ${HEX32}`);
    expect(h).toContain("cw-error");
    expect(h).not.toContain(HEX32.slice(0, 8));
  });
});

describe("http: caps in both sets", () => {
  test("its caps are in LIMITS and UNTRUSTED_LIMITS", () => {
    expect(LIMITS.httpHeaders).toBe(80);
    expect(LIMITS.httpLines).toBe(600);
    for (const k of ["httpLines", "httpHeaders", "httpJsonDepth", "httpJsonNodes", "httpChars"] as const) {
      expect(LIMITS[k]).toBeGreaterThan(0);
      expect(UNTRUSTED_LIMITS[k]).toBeLessThanOrEqual(LIMITS[k]);
    }
  });
  test("more than 80 headers, over 600 lines, over the characters", () => {
    expect(errorsOf(fence("GET /a HTTP/1.1\n" + Array.from({ length: 90 }, (_, i) => `X-${i}: v`).join("\n"))).join()).toMatch(/more than 80 headers/);
    expect(errorsOf(fence("POST /a HTTP/1.1\n\n" + "x\n".repeat(700))).join()).toMatch(/the most is 600/);
    expect(errorsOf(fence("POST /a HTTP/1.1\n\n" + "x".repeat(70_000))).join()).toMatch(/the most is 60000/);
  });
  test("at the host's own cap, and the strict set", () => {
    const body = "GET /a HTTP/1.1\n" + Array.from({ length: 12 }, (_, i) => `X-${i}: v`).join("\n");
    expect(errorsOf(fence(body))).toEqual([]);
    expect(check(parse(fence(body), { path: "p.dh.md", limits: { httpHeaders: 10 } })).some((p) => /more than 10 headers/.test(p.message))).toBe(true);
    const many = "GET /a HTTP/1.1\n" + Array.from({ length: 50 }, (_, i) => `X-${i}: v`).join("\n");
    expect(errorsOf(fence(many))).toEqual([]);
    expect(check(parse(fence(many), { path: "p.dh.md", limits: UNTRUSTED_LIMITS })).some((p) => /more than 40 headers/.test(p.message))).toBe(true);
  });
  test("a deep JSON ends fast and stays text", () => {
    const t = Date.now();
    const d = P("POST /a HTTP/1.1\n\n" + "[".repeat(5000) + "]".repeat(5000));
    expect(d.req!.body.length).toBe(10_000);
    expect(d.reqTree).toBeNull();
    expect(Date.now() - t).toBeLessThan(1000);
  });
  test("over the page's work budget: refused with the part's name, drawn as an error, never a hang", () => {
    const body = "GET /a HTTP/1.1\n\n" + Array.from({ length: 590 }, () => "some body line").join("\n");
    const doc = parse(fence(body), { path: "p.dh.md", limits: { maxEvalSteps: 300 } });
    const err = doc.blocks.find((b) => b.type === "error");
    expect(err && err.type === "error" && err.message).toMatch(/^the http part does too much work/);
    expect(doc.llm).toContain("[http not shown: the http part does too much work");
  });
});

describe("http: linear (the doubling test, charges counted)", () => {
  const caps = { ...LIMITS, httpLines: 1e9, httpHeaders: 1e9, httpChars: 1e9, httpJsonNodes: 1e9, httpJsonDepth: 1e9 };
  const body = (n: number) => "POST /v1/a HTTP/1.1\nHost: example.com\n" + Array.from({ length: n }, (_, k) => `X-H${k}: value ${k}`).join("\n") + "\n\n{" + Array.from({ length: n }, (_, k) => `"k${k}": [${k}, "v${k}", null]`).join(",") + "}\n\nHTTP/1.1 200 OK\nX-A: b\n\n" + Array.from({ length: n }, (_, k) => `line ${k}`).join("\n");
  const cost = (n: number) => { const b = big(); parseHttp(body(n), 1, {}, caps, b); return b.steps + b.values + b.chars; };
  test("twice the input costs at most about twice", () => {
    for (const n of [50, 200, 800]) {
      const r = cost(2 * n) / cost(n);
      expect(r).toBeGreaterThan(1.5);
      expect(r).toBeLessThan(2.3);
    }
  });
  test("a long line is read once, in time", () => {
    for (const mk of [(n: number) => `GET /a HTTP/1.1\nX-Long: ${"a ".repeat(n)}`, (n: number) => `GET /a HTTP/1.1\nAuthorization: ${"<".repeat(n)}`, (n: number) => `GET /a HTTP/1.1\nCookie: ${"a=b;".repeat(n)}`, (n: number) => `GET /a HTTP/1.1\nX-A: ${"$".repeat(n)}`, (n: number) => `POST /a HTTP/1.1\n\n${"{".repeat(n)}`]) {
      const b1 = big(), b2 = big();
      const t = Date.now();
      parseHttp(mk(20_000), 1, {}, caps, b1);
      parseHttp(mk(40_000), 1, {}, caps, b2);
      expect(Date.now() - t).toBeLessThan(1500);
      expect(b2.steps / b1.steps).toBeLessThan(2.3);
    }
  });
});

describe("http: the message is drawn", () => {
  test("method chip, folded headers, status chip, a Copy button", () => {
    const many = "GET /a?x=1&y=2 HTTP/1.1\nHost: example.com\n" + Array.from({ length: 9 }, (_, i) => `X-H${i}: v${i}`).join("\n") + "\n\nHTTP/1.1 503 Service Unavailable\nRetry-After: 5";
    const h = html(many);
    for (const w of ["http-method", "4 more headers", "tone-bad", "Copy as curl", "<b>x</b>", 'data-dh-slot="status"']) expect(h).toContain(w);
  });
  test("a JSON body is drawn as a tree with fold buttons", () => {
    const h = html(MSG);
    expect(h).toContain("j-fold");
    expect(h).toContain("j-key");
  });
  test("static draws every header and the whole tree, with no buttons, marked static", () => {
    const many = "GET /a HTTP/1.1\nHost: example.com\n" + Array.from({ length: 9 }, (_, i) => `X-H${i}: v${i}`).join("\n") + "\n\n" + '{"a":{"b":{"c":{"d":1}}}}';
    const live = html(many), s = html(many, "");
    expect(live).not.toContain("data-dh-static");
    expect(s).toContain("data-dh-static");
    expect(s).toContain("X-H8");
    expect(s).not.toContain("more headers");
    expect(s).not.toContain("Copy as curl");
    expect(s).not.toContain("<button");
    expect(s).toContain("&quot;d&quot;");
  });
  test("the title, and a plain block draws its text", () => {
    expect(html(MSG, undefined, { title: "Create an order" })).toContain("Create an order");
    const plain = html("curl -X POST https://example.com");
    expect(plain).toContain("<pre");
    expect(plain).toContain("curl -X POST");
  });
  test("no HTML string sink", () => {
    const src = readFileSync(join(import.meta.dir, "view.tsx"), "utf8");
    expect(src).not.toMatch(new RegExp([["inner", "HTML"].join(""), ["dangerouslySetInner", "HTML"].join(""), ["insertAdjacent", "HTML"].join(""), "document\\.write", "eval\\(", "new Function"].join("|")));
  });
});

describe("http: fixtures", () => {
  const dir = join(import.meta.dir, "fixtures");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".dh.md"))) {
    const text = readFileSync(join(dir, f), "utf8");
    if (f.startsWith("good-")) test(`${f}: no problems, every http drawn`, () => {
      const doc = parse(text, { path: f });
      expect(check(doc)).toEqual([]);
      expect(doc.blocks.filter((b) => b.type === "http").length).toBeGreaterThan(0);
    });
    if (f.startsWith("hostile-")) test(`${f}: refused with a message, within its budget, in both sets`, () => {
      for (const limits of [LIMITS, UNTRUSTED_LIMITS]) {
        const doc = parse(text, { path: f, limits });
        const e = check(doc).filter((p) => p.level === "error");
        expect(e.length).toBeGreaterThan(0);
        expect(e.every((p) => p.line >= 1)).toBe(true);
      }
      const b = new Budget(partLimitsOf(LIMITS), null, null, "the http part");
      expect(() => parseHttp(text, 1, {}, LIMITS, b)).not.toThrow();
    });
  }
});

test("the definition matches its folder", () => {
  expect(http.name).toBe("http");
  expect(http.steps).toBe(false);
  expect(http.llmKind).toBe("as-is");
});
