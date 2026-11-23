import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LIMITS, UNTRUSTED_LIMITS } from "../src/index";
import { Budget } from "../src/core/budget";
import { DhContext } from "../src/react/context";
import { parseAudio } from "../src/parts/audio/part";
import { parseVideo } from "../src/parts/video/part";
import { parseLottie } from "../src/parts/lottie/part";
import { parsePdf } from "../src/parts/pdf/part";
import AudioView from "../src/parts/audio/view";
import VideoView from "../src/parts/video/view";
import LottieView from "../src/parts/lottie/view";
import PdfView from "../src/parts/pdf/view";

const budget = () => new Budget({ steps: 1e9, values: 1e9, chars: 1e9 });
const host = "https://media.example/";
const specs = () => ({
  audio: parseAudio(`peaks: ${host}peaks.json\ntranscript: ${host}transcript.vtt`, 1, { src: `${host}audio.mp3` }, 1, UNTRUSTED_LIMITS, budget()),
  video: parseVideo(`source: ${host}other.webm\ncaptions: ${host}captions.vtt "English" default\nthumbs: ${host}thumbs.vtt\ntranscript: ${host}transcript.vtt`, 1, { src: `${host}video.mp4`, poster: `${host}poster.jpg` }, 1, UNTRUSTED_LIMITS, budget()),
  lottie: parseLottie("alt: Loading", 1, { src: `${host}animation.json` }, 1, UNTRUSTED_LIMITS, budget()),
  pdf: parsePdf("", 1, { src: `${host}document.pdf` }, 1, UNTRUSTED_LIMITS, budget()),
});

type Policy = (u: string, k: "image" | "link") => string | null;

async function draw(view: any, spec: any, policy: Policy, fetcher: typeof fetch, captions = false) {
  const internals = (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
  const previous = internals.ReactCurrentDispatcher.current;
  const effects: (() => void | (() => void))[] = [], cleanups: (() => void)[] = [];
  const globals: Record<string, unknown> = {
    fetch: fetcher,
    location: new URL("https://page.example/page"),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    document: { documentElement: {}, addEventListener() {}, removeEventListener() {} },
    MutationObserver: class { observe() {} disconnect() {} },
    addEventListener() {}, removeEventListener() {}, cancelAnimationFrame() {},
  };
  const saved = Object.fromEntries(Object.keys(globals).map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  for (const [k, v] of Object.entries(globals)) Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  try {
    internals.ReactCurrentDispatcher.current = {
      useContext: () => ({ urlPolicy: policy }),
      useState: (v: any) => [captions && v === -1 ? 0 : typeof v === "function" ? v() : v, () => {}],
      useRef: (v: any) => ({ current: v }),
      useEffect: (f: () => void | (() => void)) => effects.push(f),
      useMemo: (f: () => any) => f(), useCallback: (f: any) => f,
    };
    const tree = view({ data: spec });
    internals.ReactCurrentDispatcher.current = previous;
    for (const f of effects) { const c = f(); if (c) cleanups.push(c); }
    for (let i = 0; i < 200; i++) await Promise.resolve();
    return tree;
  } finally {
    internals.ReactCurrentDispatcher.current = previous;
    for (const c of cleanups.reverse()) c();
    for (const k of Object.keys(globals)) { const d = saved[k]; if (d) Object.defineProperty(globalThis, k, d); else Reflect.deleteProperty(globalThis, k); }
  }
}

function body() {
  let reads = 0, cancelled = false;
  const response = new Response(new ReadableStream<Uint8Array>({
    pull(c) { if (reads === 20) c.close(); else { reads++; c.enqueue(new Uint8Array(16).fill(120)); } },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 }));
  return { response, stats: () => ({ reads, cancelled }) };
}

describe("media loads are capped", () => {
  for (const name of ["lottie", "pdf", "peaks", "decode", "audio transcript", "video transcript", "captions", "thumbs"]) {
    test(`${name} bytes are capped`, async () => {
      const work: number[] = [];
      for (const cap of [64, 128]) {
        const s = specs();
        for (const x of [s.audio, s.video, s.lottie, s.pdf]) for (const k of ["bytes", "peaksBytes", "decodeBytes", "vttBytes", "transcriptBytes", "thumbsBytes"]) (x.caps as any)[k] = cap;
        const target = ({ lottie: "animation.json", pdf: "document.pdf", peaks: "peaks.json", decode: "audio.mp3", "audio transcript": "transcript.vtt", "video transcript": "transcript.vtt", captions: "captions.vtt", thumbs: "thumbs.vtt" } as Record<string, string>)[name];
        const b = body(), calls: string[] = [];
        const fetcher = (async (u: any) => { calls.push(String(u)); return b.response; }) as typeof fetch;
        const policy: Policy = (u) => u.endsWith(target) ? (name === "decode" ? "/audio.mp3" : u) : null;
        const v = name === "lottie" ? LottieView : name === "pdf" ? PdfView : ["peaks", "decode", "audio transcript"].includes(name) ? AudioView : VideoView;
        const data = v === LottieView ? s.lottie : v === PdfView ? s.pdf : v === AudioView ? s.audio : s.video;
        await draw(v, data, policy, fetcher, name === "captions");
        expect(calls.length).toBeGreaterThan(0);
        expect(b.stats().reads).toBeLessThanOrEqual(cap / 16 + 1);
        expect(b.stats().cancelled).toBe(true);
        work.push(b.stats().reads);
      }
      expect(work[1]).toBeLessThanOrEqual(work[0] * 2);
    });
  }
});

describe("media addresses use the host image policy", () => {
  test("draw makes no refused media request", async () => {
    const s = specs(), asked: [string, string][] = [], fetched: string[] = [];
    const policy: Policy = (u, k) => { asked.push([u, k]); return k === "image" ? null : u; };
    const fetcher = (async (u: any) => { fetched.push(String(u)); return new Response(""); }) as typeof fetch;
    for (const [view, data] of [[AudioView, s.audio], [VideoView, s.video], [LottieView, s.lottie], [PdfView, s.pdf]] as const) {
      const tree = await draw(view, data, policy, fetcher, view === VideoView);
      const html = renderToStaticMarkup(<DhContext.Provider value={{} as any}>{tree}</DhContext.Provider>);
      expect(html).not.toMatch(/(?:src|poster)="https:\/\/media\.example/);
    }
    expect(fetched).toEqual([]);
    expect(asked.length).toBeGreaterThan(10);
    expect(asked.every(([, k]) => k === "image")).toBe(true);
  });
  test("address policy work grows linearly", async () => {
    async function work(n: number) {
      const data = specs().video; data.sources = Array.from({ length: n }, (_, i) => `${host}${i}.webm`);
      let calls = 0;
      await draw(VideoView, data, () => { calls++; return null; }, (() => { throw new Error("refused address fetched"); }) as any, true);
      return calls;
    }
    const a = await work(32), b = await work(64);
    console.info("media policy work doubling ratio:", b / a);
    expect(a).toBeGreaterThan(32); expect(b).toBeLessThanOrEqual(a * 2);
  });
  test("the host rewrite is used by media loads", async () => {
    const asked: string[] = [], fetched: string[] = [];
    const data = specs().audio;
    await draw(AudioView, data, (u, k) => { asked.push(k); return u.endsWith("transcript.vtt") ? "/safe.vtt" : null; }, (async (u: any) => { fetched.push(u); return new Response("WEBVTT\n"); }) as typeof fetch);
    expect(fetched).toEqual(["/safe.vtt"]); expect(asked.every((k) => k === "image")).toBe(true);
  });
  test("file byte caps travel with both presets and host overrides", () => {
    for (const preset of [LIMITS, UNTRUSTED_LIMITS]) {
      for (const k of ["audioTranscriptBytes", "videoTranscriptBytes", "videoVttBytes", "videoThumbsBytes"] as const) {
        expect((preset as any)[k]).toBeGreaterThan(0);
        expect((UNTRUSTED_LIMITS as any)[k]).toBeLessThan((LIMITS as any)[k]);
      }
    }
    const a = parseAudio("", 1, { src: "a.mp3" }, 1, { ...LIMITS, audioTranscriptBytes: 123 } as any, budget());
    const v = parseVideo("", 1, { src: "a.mp4" }, 1, { ...LIMITS, videoTranscriptBytes: 234, videoVttBytes: 345, videoThumbsBytes: 456 } as any, budget());
    expect((a.caps as any).transcriptBytes).toBe(123);
    expect(v.caps).toMatchObject({ transcriptBytes: 234, vttBytes: 345, thumbsBytes: 456 });
  });
});
