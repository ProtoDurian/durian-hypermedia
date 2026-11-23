// The video part: parse, LLM view, every refusal, its caps in both sets, the doubling test (budget charges counted at n and
// 2n, never time) and the hostile fixtures. The timed body it shares with audio is tested in ../audio/audio.test.ts too.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse, check, LIMITS, UNTRUSTED_LIMITS } from "../../index";
import { Budget, partLimitsOf } from "../../core/budget";
import video, { parseVideo, videoLlm, isStreamHost } from "./part";

const fence = (body: string, info = "") => `# Page\n\n\`\`\`video${info ? " " + info : ""}\n${body}\n\`\`\`\n`;
const big = () => new Budget({ steps: 1e12, values: 1e12, chars: 1e12 });
const errorsOf = (src: string, opts: Record<string, unknown> = {}) => check(parse(src, { path: "p.dh.md", ...opts })).filter((p) => p.level === "error" && !/token/.test(p.message)).map((p) => p.message);
const has = (list: string[], re: RegExp) => list.some((m) => re.test(m));
const p = (body: string, attrs: Record<string, string> = { src: "a.mp4" }, lim: any = LIMITS) => parseVideo(body, 3, attrs, 3, lim, big());
const body = `source: media/c.webm
captions: media/c.en.vtt "English" default
captions: media/c.es.vtt "Español"
thumbs: media/c.thumbs.vtt
chapter 0:00 Start
chapter 0:42 Answer the questions
chapter 1:30 The result`;
const attrs = { src: "media/c.mp4", poster: "media/c.jpg", title: "Creating a project", duration: "1:58" };

describe("video: parse and the LLM view", () => {
  test("parse, the block, the plain JSON data and no problems", () => {
    const v = p(body, attrs);
    expect(v.errors).toEqual([]);
    expect(v.sources).toEqual(["media/c.webm"]); expect(v.captions.map((c) => [c.label, c.default])).toEqual([["English", true], ["Español", false]]); expect(v.thumbs).toBe("media/c.thumbs.vtt"); expect(v.chapters.length).toBe(3);
    const doc = parse(fence(body, 'src="media/c.mp4" poster="media/c.jpg" title="Creating a project" duration=1:58'), { path: "p.dh.md" });
    const b = doc.blocks.find((x) => x.type === "video")!;
    if (!b || b.type !== "video") throw new Error("not video");
    expect(b.llmKind).toBe("own");
    expect(JSON.parse(JSON.stringify(b.data))).toEqual(b.data);
    expect(b.data.caps).toEqual({ vttCues: 5000, transcriptLines: 2000, transcriptBytes: 1_000_000, vttBytes: 1_000_000, thumbsBytes: 1_000_000 });
    expect(check(doc)).toEqual([]);
  });
  test("the LLM view, and the page's LLM view carries it", () => {
    const want = "Video: Creating a project (1:58), media/c.mp4. Chapters: 0:00 Start; 0:42 Answer the questions; 1:30 The result. Captions: English, Español.";
    expect(videoLlm(p(body, attrs))).toBe(want);
    expect(parse(fence(body, 'src="media/c.mp4" poster="media/c.jpg" title="Creating a project" duration=1:58'), { path: "p.dh.md" }).llm).toContain(want);
    expect(videoLlm(p("0:05 Ana: hello", { src: "a.mp4" }))).toBe("Video: a.mp4, a.mp4.\n\n0:05 Ana: hello");
  });
  test("a long transcript is the content: the 400-token rule does not ask for :::llm", () => {
    const long = Array.from({ length: 120 }, (_, i) => `${Math.floor(i / 12)}:${String((i % 12) * 5).padStart(2, "0")} Ana: a line of the transcript that says some words for the test, number ${i}`).join("\n");
    expect(check(parse(fence(long, 'src="a.mp4"'), { path: "p.dh.md" })).filter((q) => q.level === "error")).toEqual([]);
    expect(video.llmExempt?.(p(long))).toBe(true);
    expect(video.llmExempt?.(p(""))).toBe(false);
  });
  test("flags are bare words: clip makes a silent loop", () => {
    const doc = parse(fence("", 'src="a.mp4" clip'), { path: "p.dh.md" });
    const b = doc.blocks.find((x) => x.type === "video")!;
    if (!b || b.type !== "video") throw new Error("not video");
    expect([b.data.clip, b.data.loop]).toEqual([true, true]);
    expect(check(doc)).toEqual([]);
  });
  test("a stream host is found by a scan of the host name", () => {
    for (const u of ["https://www.youtube.com/watch?v=a", "http://youtu.be/x", "https://player.vimeo.com/video/1", "https://youtube-nocookie.com/embed/x"]) expect(isStreamHost(u)).toBe(true);
    for (const u of ["https://example.com/youtube.com/a.mp4", "media/a.mp4", "https://notvimeo.com/a.mp4"]) expect(isStreamHost(u)).toBe(false);
  });
});

describe("video: every refusal names the line and the fix", () => {
  const run = (info: string, b = "") => errorsOf(fence(b, info));
  test("the options", () => {
    expect(has(run('src="a.mp3"'), /not a video file \(mp4, m4v, webm, ogv, mov, m3u8\)/)).toBe(true);
    expect(has(run('src="https://www.youtube.com/watch?v=abc"'), /YouTube or Vimeo address is not allowed/)).toBe(true);
    expect(has(run('src="https://vimeo.com/123"'), /YouTube or Vimeo/)).toBe(true);
    expect(has(run('src="a.mp4" autoplay'), /autoplay is not allowed/)).toBe(true);
    expect(has(run('src="a.mp4" clip volume=off'), /a clip is a silent loop; it takes no volume=/)).toBe(true);
    expect(has(run('src="a.mp4" clip autoplay'), /autoplay is not allowed/)).toBe(true);
    expect(has(run('src="a.mp4" poster=p.txt'), /poster .* is not an image/)).toBe(true);
    expect(has(run('src="a.mp4" poster=javascript:1'), /poster .* is not allowed/)).toBe(true);
    expect(has(run('src="data:video/mp4;base64,AA"'), /not allowed/)).toBe(true);
    expect(has(run('src="a.mp4" height=xl'), /height="xl" is s, m or l/)).toBe(true);
    expect(has(run('src="a.mp4" colour=c1'), /unknown option "colour"/)).toBe(true);
    expect(has(run(""), /video: no src/)).toBe(true);
    expect(run('src="a.m3u8"').length).toBe(0);
    expect(run('src="a.mp4" clip loop').length).toBe(0);
  });
  test("the body", () => {
    expect(has(run('src="a.mp4"', 'captions: a.vtt "A" default\ncaptions: b.vtt "B" default'), /two captions are marked default/)).toBe(true);
    expect(has(run('src="a.mp4"', 'captions: a.srt "A"'), /is not \.vtt/)).toBe(true);
    expect(has(run('src="a.mp4"', "captions: a.vtt"), /needs a label in quotes/)).toBe(true);
    expect(has(run('src="a.mp4"', 'captions: a.vtt "A" maybe'), /captions: <file\.vtt> "Label" \[default\]/)).toBe(true);
    expect(has(run('src="a.mp4"', "thumbs: t.json"), /is not \.vtt/)).toBe(true);
    expect(has(run('src="a.mp4"', "source: a.txt"), /is not a video file/)).toBe(true);
    expect(has(run('src="a.mp4"', "peaks: p.json"), /"peaks:" is for audio only/)).toBe(true);
    expect(has(run('src="a.mp4"', "marker 0:10 X"), /"marker" is for audio only/)).toBe(true);
    expect(has(run('src="a.mp4" clip', "chapter 0:00 A"), /a clip is a short silent loop; it takes no captions/)).toBe(true);
    expect(has(run('src="a.mp4" duration=0:30', "chapter 1:00 Late"), /past duration/)).toBe(true);
    expect(has(run('src="a.mp4"', "hello there"), /is not a line this part knows/)).toBe(true);
  });
});

describe("video: caps in both sets", () => {
  test("its caps are in LIMITS and UNTRUSTED_LIMITS", () => {
    expect([LIMITS.videoTranscriptLines, LIMITS.videoChapters, LIMITS.videoCaptionFiles, LIMITS.videoVttCues]).toEqual([2000, 200, 12, 5000]);
    for (const k of Object.keys(LIMITS).filter((x) => x.startsWith("video"))) expect((UNTRUSTED_LIMITS as any)[k]).toBeLessThanOrEqual((LIMITS as any)[k]);
  });
  test("caption files, chapters and transcript lines stop at their caps, at the host's own cap, and in the strict set", () => {
    const caps = Array.from({ length: 13 }, (_, i) => `captions: c${i}.vtt "L${i}"`).join("\n");
    expect(has(errorsOf(fence(caps, 'src="a.mp4"')), /more than 12 caption files/)).toBe(true);
    expect(has(errorsOf(fence(caps.split("\n").slice(0, 7).join("\n"), 'src="a.mp4"'), { limits: UNTRUSTED_LIMITS }), /more than 6 caption files/)).toBe(true);
    const ch = Array.from({ length: 201 }, (_, i) => `chapter ${Math.floor(i / 60)}:${String(i % 60).padStart(2, "0")} c${i}`).join("\n");
    expect(has(errorsOf(fence(ch, 'src="a.mp4"')), /more than 200 chapters/)).toBe(true);
    expect(has(errorsOf(fence("0:01 a\n0:02 b\n0:03 c", 'src="a.mp4"'), { limits: { videoTranscriptLines: 2 } }), /more than 2 transcript lines/)).toBe(true);
  });
  test("over the page's work budget: refused with the part's name, drawn as an error, never a hang", () => {
    const text = Array.from({ length: 1500 }, (_, i) => `${Math.floor(i / 60)}:${String(i % 60).padStart(2, "0")} Ana: ${"word ".repeat(10)}`).join("\n");
    const doc = parse(fence(text, 'src="a.mp4"'), { path: "p.dh.md", limits: { maxEvalSteps: 2000 } });
    const err = doc.blocks.find((b) => b.type === "error");
    expect(err && err.type === "error" && err.message).toMatch(/^the video part does too much work/);
    expect(doc.llm).toContain("[video not shown: the video part does too much work");
  });
});

describe("video: linear (the doubling test, charges counted)", () => {
  const cost = (make: (n: number) => string, n: number) => { const bb = big(); parseVideo(make(n), 1, { src: "a.mp4", duration: "9:59" }, 1, { ...LIMITS, videoTranscriptLines: 1e9, videoChapters: 1e9, videoCaptionFiles: 1e9 }, bb); return bb.steps + bb.values + bb.chars; };
  const cases: [string, (n: number) => string][] = [
    ["chapters", (n) => Array.from({ length: n }, (_, i) => `chapter ${Math.floor(i / 60)}:${String(i % 60).padStart(2, "0")} Part ${i}`).join("\n")],
    ["caption files", (n) => Array.from({ length: n }, (_, i) => `captions: media/c${i}.vtt "Language ${i}"`).join("\n")],
    ["transcript lines", (n) => Array.from({ length: n }, (_, i) => `${Math.floor((i % 599) / 60)}:${String((i % 599) % 60).padStart(2, "0")} Ana: line number ${i}`).join("\n")],
  ];
  for (const [what, make] of cases) test(`${what}: twice the input costs at most about twice`, () => {
    for (const n of [50, 200, 800]) { const r = cost(make, 2 * n) / cost(make, n); expect(r).toBeGreaterThan(1.5); expect(r).toBeLessThan(2.3); }
  });
  test("a long line is read once", () => {
    const b1 = big(), b2 = big();
    parseVideo("captions: " + "x".repeat(20_000), 1, { src: "a.mp4" }, 1, LIMITS, b1);
    parseVideo("captions: " + "x".repeat(40_000), 1, { src: "a.mp4" }, 1, LIMITS, b2);
    expect(b2.steps / b1.steps).toBeLessThan(2.2);
  });
});

describe("video: fixtures", () => {
  const dir = join(import.meta.dir, "fixtures");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".dh.md"))) {
    const text = readFileSync(join(dir, f), "utf8");
    if (f.startsWith("good-")) test(`${f}: no problems, every video drawn`, () => {
      const doc = parse(text, { path: f });
      expect(check(doc)).toEqual([]);
      expect(doc.blocks.filter((x) => x.type === "video").length).toBeGreaterThan(0);
    });
    if (f.startsWith("hostile-")) test(`${f}: refused with a message, within its budget, in both sets`, () => {
      for (const limits of [LIMITS, UNTRUSTED_LIMITS]) {
        const errs = check(parse(text, { path: f, limits })).filter((q) => q.level === "error");
        expect(errs.length).toBeGreaterThan(0);
        expect(errs.every((q) => q.line >= 1)).toBe(true);
      }
      expect(() => parseVideo(text, 1, { src: "a.mp4" }, 1, LIMITS, new Budget(partLimitsOf(LIMITS), null, null, "the video part"))).not.toThrow();
    });
  }
});

test("the definition matches its folder", () => {
  expect(video.name).toBe("video");
  expect(video.steps).toBe(false);
});
