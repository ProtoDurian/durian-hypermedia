import { afterEach, describe, expect, test } from "bun:test";
import { mediaBytes, mediaText } from "../src/parts/downloads/media-fetch";

const original = globalThis.fetch;
afterEach(() => { globalThis.fetch = original; });
function response(bytes: Uint8Array, chunk: number, headers: Record<string, string> = {}, status = 200) {
  let offset = 0, reads = 0, cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(c) { reads++; if (offset === bytes.length) c.close(); else { c.enqueue(bytes.subarray(offset, offset + chunk)); offset = Math.min(bytes.length, offset + chunk); } },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  const res = new Response(body, { headers, status });
  globalThis.fetch = (async () => res) as unknown as typeof fetch;
  return { res, stats: () => ({ bytes: offset, reads, cancelled }) };
}

describe("media response bytes are capped", () => {
  test("bytes at the cap are read exactly", async () => {
    const bytes = Uint8Array.from({ length: 128 }, (_, i) => i);
    const r = response(bytes, 7);
    const out = await mediaBytes("file", bytes.length);
    expect(out).toEqual(bytes); expect(out.buffer.byteLength).toBe(bytes.length);
    expect(r.res.body!.locked).toBe(false); expect(r.stats().cancelled).toBe(false);
  });
  for (const headers of [{}, { "content-length": "1" }, { "content-length": "invalid" }] as Record<string, string>[]) {
    test("stream bytes are capped", async () => {
      const r = response(new Uint8Array(1024), 32, headers);
      await expect(mediaBytes("file", 128)).rejects.toThrow("byte cap");
      expect(r.stats()).toEqual({ bytes: 160, reads: 5, cancelled: true });
      expect(r.res.body!.locked).toBe(false);
    });
  }
  test("declared bytes are capped before reading", async () => {
    const r = response(new Uint8Array(1024), 32, { "content-length": "1024" });
    await expect(mediaBytes("file", 128)).rejects.toThrow("byte cap");
    expect(r.stats()).toEqual({ bytes: 0, reads: 0, cancelled: true });
    expect(r.res.body!.locked).toBe(false);
  });
  test("UTF-8 bytes are capped before text decoding", async () => {
    const text = "é🌸".repeat(16), bytes = new TextEncoder().encode(text);
    response(bytes, 7); expect(await mediaText("file", bytes.length)).toBe(text);
    const r = response(bytes, 7);
    await expect(mediaText("file", text.length)).rejects.toThrow("byte cap");
    expect(r.stats().cancelled).toBe(true);
  });
  test("HTTP errors cancel the body", async () => {
    const r = response(new Uint8Array(100), 1, {}, 404);
    await expect(mediaBytes("file", 128)).rejects.toThrow("HTTP 404");
    expect(r.stats()).toEqual({ bytes: 0, reads: 0, cancelled: true });
  });
  test("a response without a stream is refused", async () => {
    globalThis.fetch = (async () => new Response(null)) as unknown as typeof fetch;
    await expect(mediaBytes("file", 128)).rejects.toThrow("readable body");
  });
  test("reader failures release the body", async () => {
    const res = new Response(new ReadableStream({ pull(c) { c.error(new Error("stream failed")); } }, { highWaterMark: 0 }));
    globalThis.fetch = (async () => res) as unknown as typeof fetch;
    await expect(mediaBytes("file", 128)).rejects.toThrow("stream failed");
    expect(res.body!.locked).toBe(false);
  });
  test("invalid caps start no request", async () => {
    let requests = 0; globalThis.fetch = (async () => { requests++; return new Response(""); }) as unknown as typeof fetch;
    for (const cap of [NaN, Infinity, -1, 0.5]) await expect(mediaBytes("file", cap)).rejects.toThrow("byte cap");
    expect(requests).toBe(0);
  });
  test("the load signal reaches fetch", async () => {
    const controller = new AbortController(); let signal: AbortSignal | null | undefined;
    globalThis.fetch = (async (_: unknown, init?: RequestInit) => { signal = init?.signal; return new Response("ok"); }) as unknown as typeof fetch;
    expect(await mediaText("file", 2, controller.signal)).toBe("ok");
    expect(signal).toBe(controller.signal);
  });
  test("byte copying grows linearly", async () => {
    async function work(n: number) {
      const set = Uint8Array.prototype.set; let copies = 0;
      Uint8Array.prototype.set = function (source: ArrayLike<number>, offset?: number) { copies += source.length; return set.call(this, source, offset); };
      try {
        const r = response(new Uint8Array(n), 1024);
        const out = await mediaBytes("file", n);
        expect(out.length).toBe(n); expect(copies).toBeLessThanOrEqual(n * 3);
        return { copies, reads: r.stats().reads };
      } finally { Uint8Array.prototype.set = set; }
    }
    const a = await work(256 * 1024), b = await work(512 * 1024);
    console.info("media copy work doubling ratio:", b.copies / a.copies);
    expect(b.copies).toBeLessThanOrEqual(a.copies * 2.2);
    expect(b.reads).toBeLessThanOrEqual(a.reads * 2);
  });
});
