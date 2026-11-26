// The example server answers byte-range requests (owner feedback, point 27): a browser seeks in audio and video by asking
// for a range, and Safari on an iPhone cannot seek at all from a server that answers 200 with the whole file.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { byteRange } from "../example/serve";

describe("byteRange", () => {
  test("the forms of the Range header", () => {
    expect(byteRange("bytes=0-99", 1000)).toEqual([0, 99]);
    expect(byteRange("bytes=100-", 1000)).toEqual([100, 999]);
    expect(byteRange("bytes=-100", 1000)).toEqual([900, 999]);
    expect(byteRange("bytes=900-5000", 1000)).toEqual([900, 999]);
    expect(byteRange("bytes=0-0", 1000)).toEqual([0, 0]);
  });
  test("no usable range: the whole file; an impossible one: 416", () => {
    expect(byteRange(null, 1000)).toBeNull();
    expect(byteRange("items=0-5", 1000)).toBeNull();
    expect(byteRange("bytes=0-5,10-20", 1000)).toBeNull();
    expect(byteRange("bytes=x-5", 1000)).toBeNull();
    expect(byteRange("bytes=1000-", 1000)).toBe("bad");
    expect(byteRange("bytes=500-100", 1000)).toBe("bad");
    expect(byteRange("bytes=-0", 1000)).toBe("bad");
  });
});

describe("example/serve.ts over HTTP", () => {
  let dir = "", proc: ReturnType<typeof Bun.spawn> | undefined, base = "";
  const bytes = new Uint8Array(5000).map((_, i) => i % 251);
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "dh-serve-range-"));
    mkdirSync(join(dir, "media")); writeFileSync(join(dir, "media/a.mp3"), bytes); writeFileSync(join(dir, "media/a.unknownext"), bytes);
    const s = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("") }); const port = s.port; s.stop(true);
    proc = Bun.spawn(["bun", resolve(import.meta.dir, "../example/serve.ts"), dir, String(port)], { stdout: "pipe", stderr: "inherit" });
    base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + "/media/a.mp3", { method: "HEAD" }); break; } catch { await Bun.sleep(50); } }
  });
  afterAll(() => { proc?.kill(); if (dir) rmSync(dir, { recursive: true, force: true }); });
  test("a plain request says it takes ranges and names the audio type", async () => {
    const r = await fetch(base + "/media/a.mp3");
    expect(r.status).toBe(200);
    expect(r.headers.get("accept-ranges")).toBe("bytes");
    expect(r.headers.get("content-type")).toBe("audio/mpeg");
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(bytes);
  });
  test("a range is answered 206 with exactly those bytes and a Content-Range", async () => {
    const r = await fetch(base + "/media/a.mp3", { headers: { Range: "bytes=1000-1999" } });
    expect(r.status).toBe(206);
    expect(r.headers.get("content-range")).toBe("bytes 1000-1999/5000");
    expect(r.headers.get("content-length")).toBe("1000");
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(bytes.slice(1000, 2000));
    const tail = await fetch(base + "/media/a.mp3", { headers: { Range: "bytes=4990-" } });
    expect(tail.status).toBe(206); expect(tail.headers.get("content-range")).toBe("bytes 4990-4999/5000");
  });
  test("a range past the end is 416 with the size", async () => {
    const r = await fetch(base + "/media/a.mp3", { headers: { Range: "bytes=9000-" } });
    expect(r.status).toBe(416);
    expect(r.headers.get("content-range")).toBe("bytes */5000");
  });
  test("the strict security headers stay on a ranged answer", async () => {
    const r = await fetch(base + "/media/a.mp3", { headers: { Range: "bytes=0-9" } });
    expect(r.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
