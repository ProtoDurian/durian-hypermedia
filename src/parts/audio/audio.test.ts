// The audio part: parse, LLM view, every refusal, its caps in both sets, the doubling test (budget charges counted at n and
// 2n, never time), WebVTT and peaks, and the hostile fixtures. The shared timed body (audio and video) is tested here too.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse, check, LIMITS, UNTRUSTED_LIMITS } from "../../index";
import { Budget, partLimitsOf } from "../../core/budget";
import audio, { parseAudio, audioLlm } from "./part";
import { parseVtt, speakerOf } from "./timed";
import { barsOf, peaksOf } from "./peaks-data";
import { fmtTime } from "../downloads/media";
import { waveMap } from "./view";

const fence = (body: string, info = "") => `# Page\n\n\`\`\`audio${info ? " " + info : ""}\n${body}\n\`\`\`\n`;
const big = () => new Budget({ steps: 1e12, values: 1e12, chars: 1e12 });
const errorsOf = (src: string, opts: Record<string, unknown> = {}) => check(parse(src, { path: "p.dh.md", ...opts })).filter((p) => p.level === "error" && !/token/.test(p.message)).map((p) => p.message);
const has = (list: string[], re: RegExp) => list.some((m) => re.test(m));
const p = (body: string, attrs: Record<string, string> = { src: "a.mp3" }, lim: any = LIMITS) => parseAudio(body, 5, attrs, 5, lim, big());
const body = `peaks: media/e.peaks.json
chapter 0:00 Welcome
chapter 3:20 The bug
chapter 9:45 The fix
marker 5:02 The crash [bad]
0:00 Ana: Welcome back.
0:04 Ben: Today we look at a crash.
5:10 Plain line with no speaker`;
const attrs = { src: "media/e.mp3", title: "Episode 12: the crash", wave: "mirror", duration: "12:34", skip: "15", tone: "c3", speeds: "0.75,1,2" };

describe("audio: parse and the LLM view", () => {
  test("parse", () => {
    const a = p(body, attrs);
    expect(a.errors).toEqual([]);
    expect(a.chapters.map((c) => [c.t, c.title])).toEqual([[0, "Welcome"], [200, "The bug"], [585, "The fix"]]);
    expect(a.markers).toEqual([{ t: 302, title: "The crash", tone: "bad", line: 9 }]);
    expect(a.cues.map((c) => [c.t, c.speaker, c.text])).toEqual([[0, "Ana", "Welcome back."], [4, "Ben", "Today we look at a crash."], [310, "", "Plain line with no speaker"]]);
    expect(a.peaks).toBe("media/e.peaks.json"); expect(a.duration).toBe(754); expect(a.skip).toBe(15); expect(a.speeds).toEqual([0.75, 1, 2]); expect(a.wave).toBe("mirror"); expect(a.tone).toBe("c3");
    expect(a.transcript).toBe("closed"); expect(a.speed).toBe(true); expect(a.volume).toBe(true); expect(a.download).toBe(false); expect(a.loop).toBe(false);
    expect(a.caps).toEqual({ peaksBytes: 1_000_000, waveformSamples: 20000, decodeBytes: 20 * 1024 * 1024, vttCues: 5000, transcriptLines: 2000 });
  });
  test("a block with plain JSON data; the strict set puts its smaller browser caps into the data", () => {
    const doc = parse(fence(body, 'src="media/e.mp3" duration=12:34'), { path: "p.dh.md", limits: UNTRUSTED_LIMITS });
    const b = doc.blocks.find((x) => x.type === "audio")!;
    if (!b || b.type !== "audio") throw new Error("not audio");
    expect(b.llmKind).toBe("own");
    expect(JSON.parse(JSON.stringify(b.data))).toEqual(b.data);
    expect(b.data.caps.peaksBytes).toBe(UNTRUSTED_LIMITS.audioPeaksBytes);
    expect(check(parse(fence(body, 'src="media/e.mp3" duration=12:34'), { path: "p.dh.md" }))).toEqual([]);
  });
  test("defaults", () => {
    const a = p("");
    expect(a.errors).toEqual([]); expect(a.wave).toBe("bars"); expect(a.height).toBe("m"); expect(a.tone).toBe("acc"); expect(a.skip).toBe(0); expect(a.speeds).toEqual([0.75, 1, 1.25, 1.5, 2]);
  });
  test("the LLM view is the plain form, then the transcript as written; the page's LLM view carries it", () => {
    const want = `Audio: Episode 12: the crash (12:34), media/e.mp3. Chapters: 0:00 Welcome; 3:20 The bug; 9:45 The fix. Markers: 5:02 The crash.\n\n0:00 Ana: Welcome back.\n0:04 Ben: Today we look at a crash.\n5:10 Plain line with no speaker`;
    expect(audioLlm(p(body, attrs))).toBe(want);
    expect(audioLlm(p("", { src: "media/x.mp3" }))).toBe("Audio: x.mp3, media/x.mp3.");
    expect(parse(fence(body, 'src="media/e.mp3" title="Episode 12: the crash" duration=12:34 skip=15 tone=c3 wave=mirror speeds=0.75,1,2'), { path: "p.dh.md" }).llm).toContain(want);
  });
  test("a :::llm after it replaces its LLM view", () => {
    const doc = parse(fence("0:00 Ana: Hi", 'src="a.mp3"') + "\n:::llm\nA short talk.\n:::\n", { path: "p.dh.md" });
    expect(doc.llm).toContain("A short talk.");
  });
  test("flags are bare words (loop, compact)", () => {
    const doc = parse(fence("", 'src="a.mp3" compact loop download=on'), { path: "p.dh.md" });
    const b = doc.blocks.find((x) => x.type === "audio")!;
    if (!b || b.type !== "audio") throw new Error("not audio");
    expect([b.data.compact, b.data.loop, b.data.download]).toEqual([true, true, true]);
    expect(check(doc)).toEqual([]);
  });
  test("a long transcript is the content: the 400-token rule does not ask for :::llm", () => {
    const long = Array.from({ length: 120 }, (_, i) => `${fmtTime(i * 5)} Ana: a line of the transcript that says some words for the test, number ${i}`).join("\n");
    expect(check(parse(fence(long, 'src="media/e.mp3" duration=12:00'), { path: "p.dh.md" })).filter((q) => q.level === "error")).toEqual([]);
    expect(audio.llmExempt?.(p(long))).toBe(true);
    expect(audio.llmExempt?.(p("peaks: a.json"))).toBe(false);
  });
  test("speaker and times, by hand scans", () => {
    expect(speakerOf("Ana: hi")).toEqual(["Ana", "hi"]); expect(speakerOf("12 apples: x")).toEqual(["", "12 apples: x"]); expect(speakerOf("no colon")).toEqual(["", "no colon"]);
    expect(speakerOf("a".repeat(30) + ": x")).toEqual(["", "a".repeat(30) + ": x"]); expect(speakerOf("Ana:hi")).toEqual(["", "Ana:hi"]);
    expect(fmtTime(75)).toBe("1:15");
  });
});

describe("audio: every refusal names the line and the fix", () => {
  const run = (info: string, b = "") => errorsOf(fence(b, info));
  test("the options", () => {
    expect(has(run(""), /audio: no src; write src=/)).toBe(true);
    expect(has(run('src="a.txt"'), /not an audio file \(mp3, m4a, aac, wav, ogg, oga, opus, weba, flac\)/)).toBe(true);
    expect(has(run('src="a.mp4"'), /not an audio file/)).toBe(true);
    expect(has(run('src="data:audio/mpeg;base64,AA"'), /not allowed: data: URLs/)).toBe(true);
    expect(has(run('src="a.mp3" autoplay'), /autoplay is not allowed; a reader presses Play/)).toBe(true);
    expect(has(run('src="a.mp3" wave=zigzag'), /wave="zigzag" is not a style \(bars, line, mirror, dots, live\)/)).toBe(true);
    expect(has(run('src="a.mp3" tone=pink'), /tone="pink" is not a colour word/)).toBe(true);
    expect(has(run('src="a.mp3" colour=c1'), /unknown option "colour"/)).toBe(true);
    expect(has(run('src="a.mp3" start=9:99'), /start= is m:ss/)).toBe(true);
    expect(has(run('src="a.mp3" duration=abc'), /duration= is m:ss or h:mm:ss/)).toBe(true);
    expect(has(run('src="a.mp3" skip=7'), /skip= is 10, 15 or 30/)).toBe(true);
    expect(has(run('src="a.mp3" speeds=9'), /speeds= is up to 8 numbers/)).toBe(true);
    expect(has(run('src="a.mp3" transcript=maybe'), /transcript= is open, closed or off/)).toBe(true);
    expect(has(run('src="a.mp3" height=xl'), /height="xl" is s, m or l/)).toBe(true);
    expect(has(run('src="a.mp3" speed=fast'), /speed= is on or off/)).toBe(true);
    expect(run('src="a.mp3"').length).toBe(0);
  });
  test("the body", () => {
    expect(has(run('src="a.mp3" duration=1:00', "chapter 0:30 A\nchapter 0:10 B"), /chapter 0:10 is not after the one before \(0:30\)/)).toBe(true);
    expect(has(run('src="a.mp3" duration=1:00', "chapter 0:30 A\nchapter 2:00 B"), /chapter at 2:00 is past duration=1:00/)).toBe(true);
    expect(has(run('src="a.mp3"', "0:30 Ana: x\n0:10 Ben: y"), /transcript line at 0:10 is before the one above it/)).toBe(true);
    expect(has(run('src="a.mp3" duration=1:00', "1:30 Ana: x"), /transcript line at 1:30 is past duration/)).toBe(true);
    expect(has(run('src="a.mp3"', "transcript: notes.txt"), /is not \.vtt or \.srt/)).toBe(true);
    expect(has(run('src="a.mp3"', "peaks: p.xml"), /is not \.json/)).toBe(true);
    expect(has(run('src="a.mp3"', "peaks:"), /"peaks:" needs a \.json file/)).toBe(true);
    expect(has(run('src="a.mp3"', "hello there"), /is not a line this part knows/)).toBe(true);
    expect(has(run('src="a.mp3"', "marker 0:10 X [pink]"), /not a colour word/)).toBe(true);
    expect(has(run('src="a.mp3"', "marker soon"), /a marker line is "marker 5:02 The crash \[bad\]"/)).toBe(true);
    expect(has(run('src="a.mp3"', "chapter soon"), /a chapter line is "chapter 3:20 The bug"/)).toBe(true);
    expect(has(run('src="a.mp3"', "source: a.mp4"), /"source:" is for video only/)).toBe(true);
    expect(has(run('src="a.mp3"', "captions: a.vtt \"A\""), /"captions:" is for video only/)).toBe(true);
    expect(has(run('src="a.mp3"', "peaks: javascript:1"), /not allowed/)).toBe(true);
  });
  test("every message carries the real line of the fence's lines", () => {
    const m = check(parse(fence("chapter 0:30 A\nchapter 0:10 B", 'src="a.mp3"'), { path: "p.dh.md" })).find((x) => /not after/.test(x.message))!;
    expect(m.line).toBe(5);
  });
});

describe("audio: caps in both sets", () => {
  test("its caps are in LIMITS and UNTRUSTED_LIMITS", () => {
    expect([LIMITS.audioTranscriptLines, LIMITS.audioChapters, LIMITS.audioMarkers, LIMITS.audioVttCues, LIMITS.audioWaveformSamples, LIMITS.audioPeaksBytes, LIMITS.audioDecodeBytes]).toEqual([2000, 200, 200, 5000, 20000, 1_000_000, 20 * 1024 * 1024]);
    for (const k of Object.keys(LIMITS).filter((x) => x.startsWith("audio"))) expect((UNTRUSTED_LIMITS as any)[k]).toBeLessThanOrEqual((LIMITS as any)[k]);
  });
  test("transcript lines, chapters and markers stop at their caps, at the host's own cap, and in the strict set", () => {
    const lines = Array.from({ length: 2001 }, (_, i) => `${fmtTime(i)} a`).join("\n");
    expect(has(errorsOf(fence(lines, 'src="a.mp3"')), /more than 2000 transcript lines/)).toBe(true);
    const ch = Array.from({ length: 201 }, (_, i) => `chapter ${fmtTime(i)} c${i}`).join("\n");
    expect(has(errorsOf(fence(ch, 'src="a.mp3"')), /more than 200 chapters/)).toBe(true);
    const mk = Array.from({ length: 201 }, (_, i) => `marker ${fmtTime(i)} m${i}`).join("\n");
    expect(has(errorsOf(fence(mk, 'src="a.mp3"')), /more than 200 markers/)).toBe(true);
    expect(has(errorsOf(fence("0:01 a\n0:02 b\n0:03 c\n0:04 d", 'src="a.mp3"'), { limits: { audioTranscriptLines: 3 } }), /more than 3 transcript lines \(the cap\)/)).toBe(true);
    expect(has(errorsOf(fence(ch.split("\n").slice(0, 120).join("\n"), 'src="a.mp3"'), { limits: UNTRUSTED_LIMITS }), /more than 100 chapters/)).toBe(true);
  });
  test("over the page's work budget: refused with the part's name, drawn as an error, never a hang", () => {
    const big2 = Array.from({ length: 1500 }, (_, i) => `${fmtTime(i)} Ana: ${"word ".repeat(10)}`).join("\n");
    const doc = parse(fence(big2, 'src="a.mp3"'), { path: "p.dh.md", limits: { maxEvalSteps: 2000 } });
    const err = doc.blocks.find((b) => b.type === "error");
    expect(err && err.type === "error" && err.message).toMatch(/^the audio part does too much work/);
    expect(doc.llm).toContain("[audio not shown: the audio part does too much work");
  });
});

describe("audio: WebVTT, peaks, bars, the wave", () => {
  const b = () => new Budget({ steps: 1e9, values: 1e9, chars: 1e9 });
  test("parseVtt: WebVTT and SRT, tags removed, milliseconds, settings after the end time", () => {
    const v = parseVtt("WEBVTT\n\nNOTE x\n\n1\n00:00:01.500 --> 00:00:03.000\nHello <b>there</b>\nsecond line\n\n00:01:02.250 --> 00:01:04.000 align:start\nAgain\n", b(), 5000);
    expect(v).toEqual([{ start: 1.5, end: 3, text: "Hello there\nsecond line" }, { start: 62.25, end: 64, text: "Again" }]);
    expect(parseVtt("1\r\n00:00:01,000 --> 00:00:02,000\r\nsrt line\r\n", b(), 5000)[0]).toEqual({ start: 1, end: 2, text: "srt line" });
    expect(parseVtt("not a caption file", b(), 5000)).toEqual([]);
    expect(parseVtt("a --> b\nx", b(), 5000)).toEqual([]);
  });
  test("the cue cap and the budget", () => {
    const vtt = "WEBVTT\n\n" + Array.from({ length: 6000 }, (_, i) => `00:00:${String(i % 60).padStart(2, "0")}.000 --> 00:00:${String(i % 60).padStart(2, "0")}.500\nline ${i}\n`).join("\n");
    expect(parseVtt(vtt, b(), 5000).length).toBe(5000);
    expect(parseVtt(vtt, b(), 100).length).toBe(100);
    const hostile = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n" + "x\n".repeat(500000);
    const t0 = performance.now();
    expect(() => parseVtt(hostile, new Budget({ steps: 1000, values: 1e6, chars: 1e6 }), 5000)).toThrow(/audio|work|steps/i);
    expect(performance.now() - t0).toBeLessThan(500);
  });
  test("peaksOf reads the BBC audiowaveform format and nothing else, and honours its cap", () => {
    expect(peaksOf({ version: 2, bits: 8, data: [-64, 127, -10, 20] }, 100)).toEqual([127 / 128, 20 / 128]);
    expect(peaksOf({ bits: 16, data: [-16384, 8192] }, 100)).toEqual([0.5]);
    expect(peaksOf({ data: "x" }, 100)).toBeNull(); expect(peaksOf(null, 100)).toBeNull(); expect(peaksOf({ data: [1] }, 100)).toBeNull();
    expect(peaksOf({ bits: 8, data: new Array(2 * 20001).fill(1) }, 20000)).toBeNull();
    expect(peaksOf({ bits: 8, data: new Array(2 * 20000).fill(1) }, 20000)?.length).toBe(20000);
  });
  test("barsOf takes the loudest of each share", () => {
    expect(barsOf([0.1, 0.9, 0.2, 0.3], 2)).toEqual([0.9, 0.3]); expect(barsOf([], 3)).toEqual([0, 0, 0]); expect(barsOf([0.2, 0.4, 0.6], 3)).toEqual([0.2, 0.4, 0.6]);
  });
  test("the wave maps time to x and back, with a gap at each chapter", () => {
    const m = waveMap(100, 306, [0, 50], 6);
    expect(m.usable).toBe(300); expect(m.xOf(0)).toBeCloseTo(0, 6); expect(m.xOf(49.99)).toBeLessThan(m.xOf(50)); expect(m.xOf(50) - m.xOf(49.999)).toBeGreaterThan(5.9);
    expect(m.xOf(100)).toBeCloseTo(306, 4);
    for (const t of [0, 10, 25, 49, 51, 75, 100]) expect(m.tOf(m.xOf(t))).toBeCloseTo(t, 1);
  });
});

describe("audio: linear (the doubling test, charges counted)", () => {
  const cost = (make: (n: number) => string, n: number) => { const bb = big(); parseAudio(make(n), 1, { src: "a.mp3", duration: "9:59" }, 1, { ...LIMITS, audioTranscriptLines: 1e9, audioChapters: 1e9, audioMarkers: 1e9 }, bb); return bb.steps + bb.values + bb.chars; };
  const time = (i: number) => `${Math.floor(i / 60)}:${String(i % 60).padStart(2, "0")}`;
  const cases: [string, (n: number) => string][] = [
    ["transcript lines", (n) => Array.from({ length: n }, (_, i) => `${time(i % 599)} Ana: line number ${i} with some words`).join("\n")],
    ["chapters", (n) => Array.from({ length: n }, (_, i) => `chapter ${Math.floor(i / 60)}:${String(i % 60).padStart(2, "0")} Part ${i}`).join("\n")],
    ["markers", (n) => Array.from({ length: n }, (_, i) => `marker ${time(i % 599)} Flag ${i} [c2]`).join("\n")],
  ];
  for (const [what, make] of cases) test(`${what}: twice the input costs at most about twice`, () => {
    for (const n of [50, 200, 800]) { const r = cost(make, 2 * n) / cost(make, n); expect(r).toBeGreaterThan(1.5); expect(r).toBeLessThan(2.3); }
  });
  test("a long line is read once", () => {
    const b1 = big(), b2 = big();
    parseAudio("0:00 " + "x ".repeat(10_000), 1, { src: "a.mp3" }, 1, LIMITS, b1);
    parseAudio("0:00 " + "x ".repeat(20_000), 1, { src: "a.mp3" }, 1, LIMITS, b2);
    expect(b2.steps / b1.steps).toBeLessThan(2.2);
  });
  test("a VTT file: cues", () => {
    const vtt = (n: number) => "WEBVTT\n\n" + Array.from({ length: n }, (_, i) => `00:00:${String(i % 60).padStart(2, "0")}.000 --> 00:00:${String(i % 60).padStart(2, "0")}.500\nCue ${i}\n`).join("\n");
    const c = (n: number) => { const bb = big(); parseVtt(vtt(n), bb, 1e9); return bb.steps + bb.chars; };
    for (const n of [50, 200, 800]) { const r = c(2 * n) / c(n); expect(r).toBeGreaterThan(1.5); expect(r).toBeLessThan(2.3); }
  });
});

describe("audio: fixtures", () => {
  const dir = join(import.meta.dir, "fixtures");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".dh.md"))) {
    const text = readFileSync(join(dir, f), "utf8");
    if (f.startsWith("good-")) test(`${f}: no problems, every player drawn`, () => {
      const doc = parse(text, { path: f });
      expect(check(doc)).toEqual([]);
      expect(doc.blocks.filter((x) => x.type === "audio").length).toBeGreaterThan(0);
    });
    if (f.startsWith("hostile-")) test(`${f}: refused with a message, within its budget, in both sets`, () => {
      for (const limits of [LIMITS, UNTRUSTED_LIMITS]) {
        const errs = check(parse(text, { path: f, limits })).filter((q) => q.level === "error");
        expect(errs.length).toBeGreaterThan(0);
        expect(errs.every((q) => q.line >= 1)).toBe(true);
      }
      expect(() => parseAudio(text, 1, { src: "a.mp3" }, 1, LIMITS, new Budget(partLimitsOf(LIMITS), null, null, "the audio part"))).not.toThrow();
    });
  }
});

test("the definition matches its folder", () => {
  expect(audio.name).toBe("audio");
  expect(audio.steps).toBe(false);
});
