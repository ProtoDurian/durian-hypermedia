// The host media loader (0.8.0): what a loader may be asked, and what it may return. Fake loaders only; no network, no DOM.
import { describe, expect, test } from "bun:test";
import { parse } from "../src/index";
import { applyUrlPolicy } from "../src/safety";
import { askLoader, MEDIA_PAGE_BYTES, blobType, claimedBy, cleanPrefixes, cssUrl, newMade, resolveSources, revokeMade, spriteOk, type LoadMedia, type MediaKind, type MediaResult } from "../src/media-loader";
import { mediaBytes, mediaText } from "../src/parts/downloads/media-fetch";

const sig = () => new AbortController().signal;
const bytes = (n: number, fill = 1) => new Uint8Array(n).fill(fill);
const loaderOf = (r: MediaResult | (() => Promise<MediaResult>), seen: { url: string; kind: string; part: string; role?: string }[] = []): LoadMedia => async (q) => { seen.push({ url: q.url, kind: q.kind, part: q.part, role: q.role }); return typeof r === "function" ? r() : r; };
const KINDS: MediaKind[] = ["image", "video", "audio", "pdf", "lottie", "text"];

describe("claimed prefixes", () => {
  test("only a name and a colon, or @; never a web, script or data scheme", () => {
    expect(cleanPrefixes(["media:", "@", "Media:", "javascript:", "data:", "blob:", "https:", "http:", "file:", "x", "", "a b:", "m:"])).toEqual(["media:", "@", "m:"]);
    expect(cleanPrefixes(undefined)).toEqual([]);
  });
  test("an address is claimed only when it begins with the prefix as written", () => {
    const p = ["media:", "@"];
    expect(claimedBy("media:q3.pdf", p)).toBe(true);
    expect(claimedBy("MEDIA:q3.pdf", p)).toBe(true);
    expect(claimedBy("@notes/a.png", p)).toBe(true);
    expect(claimedBy("m&#101;dia:q3.pdf", p)).toBe(false);
    expect(claimedBy("java\tscript:1", p)).toBe(false);
    expect(claimedBy("media/q3.pdf", p)).toBe(false);
    expect(claimedBy("media:q3.pdf", [])).toBe(false);
  });
});

describe("askLoader", () => {
  const host = (loader?: LoadMedia, extra: Record<string, unknown> = {}) => ({ loader, prefixes: ["media:", "@"], ...extra });
  for (const kind of KINDS) {
    test(`${kind}: bytes within the cap, copied`, async () => {
      const src = bytes(10, 7), seen: any[] = [];
      const o = await askLoader("media:f.bin", kind, "p", "r", 10, host(loaderOf({ bytes: src }, seen)), sig());
      expect(o.kind).toBe("bytes");
      if (o.kind === "bytes") { expect([...o.bytes]).toEqual([...src]); src.fill(9); expect(o.bytes[0]).toBe(7); }
      expect(seen).toEqual([{ url: "media:f.bin", kind, part: "p", role: "r" }]);
    });
    test(`${kind}: bytes over the cap are refused`, async () => {
      const o = await askLoader("media:f.bin", kind, "p", undefined, 9, host(loaderOf({ bytes: bytes(10) })), sig());
      expect(o).toEqual({ kind: "refused", reason: "the file is over its 9 byte cap" });
    });
    test(`${kind}: an ArrayBuffer is bytes too, and a blob: objectUrl is taken as it is`, async () => {
      const a = await askLoader("media:f", kind, "p", undefined, 100, host(loaderOf({ bytes: new ArrayBuffer(4) })), sig());
      expect(a.kind === "bytes" && a.bytes.byteLength).toBe(4);
      const u = await askLoader("media:f", kind, "p", undefined, 100, host(loaderOf({ objectUrl: "blob:https://app.example/1c9a" })), sig());
      expect(u).toEqual({ kind: "url", url: "blob:https://app.example/1c9a", own: true });
    });
    test(`${kind}: a refusal carries its reason, shortened and cleaned`, async () => {
      const o = await askLoader("media:f", kind, "p", undefined, 100, host(loaderOf({ refused: "not yours\u0007\n" + "x".repeat(400) })), sig());
      expect(o.kind).toBe("refused");
      if (o.kind === "refused") { expect(o.reason.length).toBeLessThanOrEqual(200); expect(o.reason.startsWith("not yours")).toBe(true); expect(/[\u0000-\u001f]/.test(o.reason)).toBe(false); }
    });
  }
  test("an objectUrl that is not blob: is refused (data:, javascript:, https:, a blob: inside a longer word)", async () => {
    for (const u of ["data:image/png;base64,AA==", "javascript:alert(1)", "https://x.example/a.png", "file:///etc/hosts", "media:x", " blob:https://a/1", "xblob:https://a/1", "blob:\nhttps://a/1", ""]) {
      const o = await askLoader("media:f", "image", "p", undefined, 100, host(loaderOf({ objectUrl: u })), sig());
      expect(o.kind).toBe("refused");
    }
  });
  test("an answer of the wrong shape, a throw and a rejection are refusals; the loader's message is not shown", async () => {
    for (const bad of [undefined, null, 5, "x", {}, { bytes: "abc" }, { objectUrl: 4 }] as unknown[]) {
      const o = await askLoader("media:f", "image", "p", undefined, 100, host((async () => bad) as unknown as LoadMedia), sig());
      expect(o.kind).toBe("refused");
    }
    const t = await askLoader("media:f", "image", "p", undefined, 100, host((async () => { throw new Error("secret path /srv/x"); }) as LoadMedia), sig());
    expect(t).toEqual({ kind: "refused", reason: "the host could not load this file" });
  });
  test("a claimed address goes only to the loader, never through the urlPolicy; a refused control character stops it first", async () => {
    const seen: any[] = [];
    const deny = () => null;
    const o = await askLoader(" media:q3.pdf ", "pdf", "pdf", undefined, 100, host(loaderOf({ bytes: bytes(3) }, seen), { urlPolicy: deny }), sig());
    expect(o.kind).toBe("bytes");
    expect(seen[0].url).toBe("media:q3.pdf");
    const bad = await askLoader("media:a\u0000b.pdf", "pdf", "pdf", undefined, 100, host(loaderOf({ bytes: bytes(3) }, seen), { urlPolicy: deny }), sig());
    expect(bad.kind).toBe("refused");
    expect(seen).toHaveLength(1);
  });
  test("a claimed address with useDefault, or with no loader, is refused: it is never loaded the usual way", async () => {
    const d = await askLoader("media:f.png", "image", "p", undefined, 100, host(loaderOf({ useDefault: true })), sig());
    expect(d.kind).toBe("refused");
    const n = await askLoader("media:f.png", "image", "p", undefined, 100, { prefixes: ["media:"] }, sig());
    expect(n.kind).toBe("refused");
  });
  test("any other address passes the urlPolicy first, exactly as with no loader", async () => {
    const seen: any[] = [];
    const drop = await askLoader("https://tracker.example/p.png", "image", "p", undefined, 100, host(loaderOf({ bytes: bytes(1) }, seen), { urlPolicy: () => null }), sig());
    expect(drop.kind).toBe("refused");
    expect(seen).toHaveLength(0);
    const rewrite = await askLoader("a.png", "image", "p", undefined, 100, host(loaderOf({ useDefault: true }, seen), { urlPolicy: (u: string) => "/files/" + u }), sig());
    expect(rewrite).toEqual({ kind: "url", url: "/files/a.png", own: false });
    expect(seen[0].url).toBe("/files/a.png");
  });
  test("an author-written blob: is refused by applyUrlPolicy and never reaches the loader, with or without a loader", async () => {
    expect(applyUrlPolicy("blob:https://a.example/1", "image", undefined)).toBeNull();
    expect(applyUrlPolicy("blob:https://a.example/1", "image", () => "blob:https://a.example/1")).toBeNull();
    const seen: any[] = [];
    for (const u of ["blob:https://a.example/1", "BLOB:https://a.example/1", "bl\tob:https://a.example/1", "data:image/png;base64,AA=="]) {
      const o = await askLoader(u, "image", "p", undefined, 100, host(loaderOf({ objectUrl: "blob:https://a.example/2" }, seen)), sig());
      expect(o.kind).toBe("refused");
      const q = await askLoader(u, "image", "p", undefined, 100, { prefixes: ["media:"] }, sig());
      expect(q.kind).toBe("refused");
    }
    expect(seen).toHaveLength(0);
  });
  test("no loader: the answer is applyUrlPolicy alone (the 0.7.0 path)", async () => {
    expect(await askLoader("media/a.png", "image", "p", undefined, 1, {}, sig())).toEqual({ kind: "url", url: "media/a.png", own: false });
    expect((await askLoader("media:a.png", "image", "p", undefined, 1, {}, sig())).kind).toBe("refused");
  });
  test("an aborted request is dropped", async () => {
    const ac = new AbortController();
    const o = await askLoader("media:f", "image", "p", undefined, 100, host(loaderOf(async () => { ac.abort(); return { bytes: bytes(1) }; })), ac.signal);
    expect(o).toEqual({ kind: "refused", reason: "cancelled" });
  });
});

describe("blob types and sources set on an element", () => {
  test("a blob type comes from the extension and must fit the kind", () => {
    expect(blobType("media:a.PNG?x=1", "image")).toBe("image/png");
    expect(blobType("@clips/a.mp4", "video")).toBe("video/mp4");
    expect(blobType("media:a.mp3", "audio")).toBe("audio/mpeg");
    expect(blobType("media:a.mp3", "video")).toBeNull();
    expect(blobType("media:a.html", "image")).toBeNull();
    expect(blobType("media:a", "image")).toBeNull();
  });
  test("bytes become a blob that is revoked; an objectUrl stays the host's; refusals keep their reason", async () => {
    const made = newMade(), revoked: string[] = [], real = { c: URL.createObjectURL, r: URL.revokeObjectURL };
    let n = 0;
    URL.createObjectURL = ((b: Blob) => { expect(b.type).toBe("image/png"); return `blob:https://app.example/m${++n}`; }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = ((u: string) => { revoked.push(u); }) as typeof URL.revokeObjectURL;
    try {
      const l: LoadMedia = async (q) => q.url === "media:a.png" ? { bytes: bytes(4) } : q.url === "media:b.png" ? { objectUrl: "blob:https://app.example/own" } : q.url === "media:c.txt" ? { bytes: bytes(2) } : { refused: "no such file" };
      const res = await resolveSources("gallery", [
        { url: "media:a.png", kind: "image" }, { url: "media:b.png", kind: "image" }, { url: "media:c.txt", kind: "image" }, { url: "media:d.png", kind: "image" }, { url: "https://x.example/a.png", kind: "image" }, { url: null, kind: "image" },
      ], { loader: l, prefixes: ["media:"], urlPolicy: (u) => (u.startsWith("https://x.example") ? null : u) }, sig(), made);
      expect(res[0]).toEqual({ status: "ready", src: "blob:https://app.example/m1" });
      expect(res[1]).toEqual({ status: "ready", src: "blob:https://app.example/own" });
      expect(res[2]).toMatchObject({ status: "refused" });
      expect(res[3]).toEqual({ status: "refused", reason: "no such file" });
      expect(res[4]).toMatchObject({ status: "refused" });
      expect(res[5]).toMatchObject({ status: "refused" });
      expect(made.urls).toEqual(["blob:https://app.example/m1"]);
      revokeMade(made);
      expect(revoked).toEqual(["blob:https://app.example/m1"]);   // only the blob made here; the host's own is never revoked
      expect(made.urls).toEqual([]);
      expect(made.releases).toEqual([]);
    } finally { URL.createObjectURL = real.c; URL.revokeObjectURL = real.r; }
  });
  test("bytes over the kind's cap never become a blob", async () => {
    const made = newMade();
    const res = await resolveSources("audio", [{ url: "media:a.mp3", kind: "audio" }], { loader: async () => ({ bytes: new Uint8Array(64 * 1024 * 1024 + 1) }), prefixes: ["media:"] }, sig(), made);
    expect(res[0]).toMatchObject({ status: "refused" });
    expect(made.urls).toEqual([]);
  });
  test("svg is not a blob type for loader bytes (a same-origin svg document); other image types are", () => {
    expect(blobType("media:a.svg", "image")).toBeNull();
    expect(blobType("media:a.webp", "image")).toBe("image/webp");
  });
  test("an unknown file type gives its bytes back to the page's total", async () => {
    const l: LoadMedia = async () => ({ bytes: bytes(90) });
    const host = { loader: l, prefixes: ["media:"], pageBytes: 100 }, made = newMade();
    const a = await resolveSources("gallery", [{ url: "media:a.txt", kind: "image" }], host, sig(), made);
    expect(a[0]).toMatchObject({ status: "refused" });
    const b = await askLoader("media:b", "pdf", "p", undefined, 1000, host, sig());
    expect(b.kind).toBe("bytes");   // the first answer was released, so there was room
    if (b.kind === "bytes") b.release();
  });
});

describe("what the loader is told, and the page's total", () => {
  test("the loader is told the cap (maxBytes) of the file it is asked for", async () => {
    const seen: number[] = [];
    const l: LoadMedia = async (q) => { seen.push(q.maxBytes); return { refused: "x" }; };
    await askLoader("media:a", "pdf", "pdf", undefined, 123, { loader: l, prefixes: ["media:"] }, sig());
    await resolveSources("video", [{ url: "media:a.mp4", kind: "video" }, { url: "media:a.png", kind: "image" }], { loader: l, prefixes: ["media:"] }, sig(), newMade());
    expect(seen).toEqual([123, 512 * 1024 * 1024, 32 * 1024 * 1024]);
  });
  test("the page's total is 256 MiB by default", () => { expect(MEDIA_PAGE_BYTES).toBe(256 * 1024 * 1024); });
  test("one page may hold only its total of loader bytes at once; releasing gives room back", async () => {
    const l: LoadMedia = async () => ({ bytes: bytes(50) });
    const host = { loader: l, prefixes: ["media:"], pageBytes: 100 };
    const ask = (n: string) => askLoader("media:" + n, "pdf", "p", undefined, 1000, host, sig());
    const a = await ask("a"), b = await ask("b"), c = await ask("c");
    expect([a.kind, b.kind, c.kind]).toEqual(["bytes", "bytes", "refused"]);
    if (a.kind === "bytes") { a.release(); a.release(); }   // twice: counted once
    const d = await ask("d");
    expect(d.kind).toBe("bytes");
    expect((await ask("e")).kind).toBe("refused");
    if (b.kind === "bytes") b.release();
    if (d.kind === "bytes") d.release();
  });
  test("another loader function has a total of its own; mediaBytes gives its bytes back when it returns", async () => {
    const mk = (): LoadMedia => async () => ({ bytes: bytes(99) });
    const l1 = mk(), l2 = mk(), l3 = mk();
    expect((await askLoader("media:a", "pdf", "p", undefined, 1000, { loader: l1, prefixes: ["media:"], pageBytes: 100 }, sig())).kind).toBe("bytes");
    expect((await askLoader("media:a", "pdf", "p", undefined, 1000, { loader: l2, prefixes: ["media:"], pageBytes: 100 }, sig())).kind).toBe("bytes");
    const via = (cap: number, s?: AbortSignal) => askLoader("media:a", "pdf", "p", undefined, cap, { loader: l3, prefixes: ["media:"], pageBytes: 100 }, s ?? sig());
    await mediaBytes("media:a", 1000, undefined, via);
    await mediaBytes("media:a", 1000, undefined, via);   // the second read would be refused if the first had kept its share
  });
});

describe("a thumbnail sprite name is the author's text (it goes into CSS)", () => {
  test("nothing that can end the CSS string, start another url() or hide in whitespace is a sprite address", () => {
    for (const bad of ['sprite.jpg"), url("/pixel?leak=1', "a'b.jpg", "a(b).jpg", "a\\b.jpg", "a b.jpg", "a\tb.jpg", "a\nb.jpg", "a\u0000b.jpg", "a\u2028b.jpg", ""]) expect(spriteOk(bad)).toBe(false);
    for (const good of ["media/create.sprite.jpg", "https://cdn.example/s.jpg?v=2&w=160", "blob:https://app.example/1c9a-22", "s%20p.jpg"]) expect(spriteOk(good)).toBe(true);
    expect(spriteOk("a".repeat(2049))).toBe(false);
  });
  test("cssUrl quotes the address and escapes what could end the string, as a second line of defence", () => {
    expect(cssUrl("media/s.jpg")).toBe('url("media/s.jpg")');
    expect(cssUrl('x"),url("y')).toBe('url("x\\22 ),url(\\22 y")');
    expect(cssUrl("a\\b")).toBe('url("a\\5c b")');
  });
  test("the default urlPolicy lets such a name through as one string (why the part must refuse it)", () => {
    expect(applyUrlPolicy('sprite.jpg"), url("/pixel?leak=1', "image", undefined)).not.toBeNull();
  });
});

describe("mediaBytes and mediaText with a loader (pdf, lottie, captions, peaks, transcripts)", () => {
  test("bytes within the cap are returned and fetch is never called", async () => {
    const real = globalThis.fetch; let calls = 0;
    globalThis.fetch = (async () => { calls++; throw new Error("no network"); }) as unknown as typeof fetch;
    try {
      for (const kind of ["pdf", "lottie", "text"] as MediaKind[]) {
        const via = (cap: number, s?: AbortSignal) => askLoader("media:f", kind, "p", undefined, cap, { loader: loaderOf({ bytes: new TextEncoder().encode('{"v":1}') }), prefixes: ["media:"] }, s ?? sig());
        expect(await mediaText("media:f", 100, undefined, via)).toBe('{"v":1}');
        expect((await mediaBytes("media:f", 100, undefined, via)).byteLength).toBe(7);
      }
      expect(calls).toBe(0);
    } finally { globalThis.fetch = real; }
  });
  test("bytes over the cap and a refusal throw", async () => {
    const via = (r: MediaResult) => (cap: number, s?: AbortSignal) => askLoader("media:f", "pdf", "p", undefined, cap, { loader: loaderOf(r), prefixes: ["media:"] }, s ?? sig());
    await expect(mediaBytes("media:f", 5, undefined, via({ bytes: bytes(6) }))).rejects.toThrow(/5 byte cap/);
    await expect(mediaBytes("media:f", 50, undefined, via({ refused: "sign in first" }))).rejects.toThrow("sign in first");
  });
  test("a loader's blob: address is fetched under the same cap", async () => {
    const real = globalThis.fetch, asked: string[] = [];
    globalThis.fetch = (async (u: string) => { asked.push(u); return new Response(new Uint8Array(20)); }) as unknown as typeof fetch;
    try {
      const via = (cap: number, s?: AbortSignal) => askLoader("media:f", "pdf", "p", undefined, cap, { loader: loaderOf({ objectUrl: "blob:https://app.example/9" }), prefixes: ["media:"] }, s ?? sig());
      await expect(mediaBytes("media:f", 10, undefined, via)).rejects.toThrow(/10 byte cap/);
      expect((await mediaBytes("media:f", 20, undefined, via)).byteLength).toBe(20);
      expect(asked).toEqual(["blob:https://app.example/9", "blob:https://app.example/9"]);
    } finally { globalThis.fetch = real; }
  });
  test("no loader: the plain fetch of 0.7.0", async () => {
    const real = globalThis.fetch, asked: string[] = [];
    globalThis.fetch = (async (u: string) => { asked.push(u); return new Response("hello"); }) as unknown as typeof fetch;
    try { expect(await mediaText("https://x.example/a.vtt", 100)).toBe("hello"); expect(asked).toEqual(["https://x.example/a.vtt"]); } finally { globalThis.fetch = real; }
  });
});

describe("parse(): mediaPrefixes", () => {
  const f = (name: string, info: string, body = "") => `# P\n\n\`\`\`${name} ${info}\n${body}\n\`\`\`\n`;
  /** every error a part reports about its addresses (data.errors) and every error block */
  const errs = (src: string, o: Record<string, unknown> = {}) => {
    const d = parse(src, { path: "p.dh.md", ...o });
    return [...d.blocks.flatMap((b: any) => (b.type === "error" ? [b.message] : (b.data?.errors ?? []).map((e: any) => e.msg))), ...d.problems.filter((p) => p.level === "error").map((p) => p.message)] as string[];
  };
  const CASES: [string, string, string][] = [
    ["pdf", 'src="media:q3.pdf"', ""], ["lottie", 'src="media:a.json"', "alt: A box fills with blocks."], ["video", 'src="media:c.mp4" poster="media:c.jpg"', ""], ["audio", 'src="media:a.mp3"', "peaks: media:a.peaks.json"],
    ["gallery", "", '![A](media:a.png "One")\n![B](@b/c.png "Two")'], ["compare-image", "", 'before: media:a.png "Before"\nafter: @b.png "After"'],
  ];
  for (const [name, info, body] of CASES) {
    test(`${name}: media: is refused as in 0.7.0, accepted when the host claims it`, () => {
      const src = f(name, info, body);
      expect(errs(src).length).toBeGreaterThan(0);
      expect(errs(src, { mediaPrefixes: ["media:", "@"] })).toEqual([]);
    });
  }
  test("claiming other schemes does not open data:, blob:, javascript: or file:", () => {
    for (const u of ["data:video/mp4;base64,AA==", "blob:https://a.example/1.mp4", "javascript:alert(1).mp4", "file:///a.mp4"]) {
      expect(errs(f("video", `src="${u}"`), { mediaPrefixes: ["media:", "data:", "blob:", "javascript:", "file:"] }).length).toBeGreaterThan(0);
    }
  });
  test("a Markdown image keeps a claimed address as written, and refuses it otherwise; blob: is refused either way", () => {
    const img = (u: string, o: Record<string, unknown> = {}) => { const b = parse(`![A chart](${u})\n`, { path: "p.dh.md", ...o }).blocks[0] as any; return b.md[0].c.find((x: any) => x.t === "img").src as string | null; };
    expect(img("media:chart.png")).toBeNull();
    expect(img("media:chart.png", { mediaPrefixes: ["media:"] })).toBe("media:chart.png");
    expect(img("@a/chart.png", { mediaPrefixes: ["@"] })).toBe("@a/chart.png");
    expect(img("blob:https://a.example/1", { mediaPrefixes: ["media:"] })).toBeNull();
    expect(img("https://x.example/a.png", { mediaPrefixes: ["media:"] })).toBe("https://x.example/a.png");
  });
  test("the claim is scoped to one parse() call", () => {
    expect(errs(f("pdf", 'src="media:q3.pdf"'), { mediaPrefixes: ["media:"] })).toEqual([]);
    expect(errs(f("pdf", 'src="media:q3.pdf"')).length).toBeGreaterThan(0);
  });
});
