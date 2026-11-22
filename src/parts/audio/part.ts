// The audio part (format version 11): a player of our own, with a wave drawn from a peaks file that moves while it plays.
// Pure: the parse, the checks and the LLM view. What a file holds (its length, its samples) is known only in the browser,
// so those caps travel in the data (`caps`) and the view checks them when the file loads.
//
//   ```audio src="media/episode.mp3" title="Episode 12" wave=bars
//   peaks: media/episode.peaks.json
//   chapter 0:00 Welcome
//   marker 5:02 The crash [bad]
//   0:00 Ana: Welcome back.
//   ```
import { definePart, type PartFileRef } from "../types";
import type { Budget } from "../../core/budget";
import { AUDIO_EXT, HEIGHTS, checkSrc, flag, fmtTime, onOff, titleOf, tone, unknownKeys, type Err } from "../downloads/media";
import { durationOf, parseTimedBody, skipOf, speedsOf, startOf, transcriptMode, transcriptText, type Timed } from "./timed";

export const WAVE_STYLES = ["bars", "line", "mirror", "dots", "live"];
export const AUDIO_KEYS = ["id", "src", "title", "wave", "height", "compact", "tone", "speed", "speeds", "skip", "start", "loop", "volume", "download", "transcript", "duration", "autoplay", "llm"];
/** the caps the browser checks when a file loads, copied into the data by parse (the view never reads a constant) */
export interface AudioCaps { peaksBytes: number; waveformSamples: number; decodeBytes: number; vttCues: number; transcriptLines: number }
export interface AudioSpec extends Timed {
  src: string; title: string; wave: string; height: string; compact: boolean; tone: string; speed: boolean; speeds: number[]; skip: number; start: number; loop: boolean;
  volume: boolean; download: boolean; transcript: "open" | "closed" | "off"; duration: number | null; caps: AudioCaps; errors: Err[];
}
export type AudioLimits = { audioTranscriptLines: number; audioChapters: number; audioMarkers: number; audioVttCues: number; audioWaveformSamples: number; audioPeaksBytes: number; audioDecodeBytes: number };

export function parseAudio(body: string, baseLine: number, attrs: Record<string, string>, line: number, lim: AudioLimits, budget: Budget): AudioSpec {
  const errors: Err[] = [];
  unknownKeys(attrs, AUDIO_KEYS, "audio", line, errors);
  if (attrs.autoplay !== undefined) errors.push({ line, msg: `audio: autoplay is not allowed; a reader presses Play` });
  const src = checkSrc(attrs.src, AUDIO_EXT, "audio", "an audio file", line, errors);
  const duration = durationOf(attrs, "audio", line, errors);
  const wave = attrs.wave ?? "bars";
  if (!WAVE_STYLES.includes(wave)) errors.push({ line, msg: `audio: wave="${wave}" is not a style (${WAVE_STYLES.join(", ")})` });
  const height = attrs.height ?? "m";
  if (!HEIGHTS.includes(height)) errors.push({ line, msg: `audio: height="${height}" is s, m or l` });
  const t = parseTimedBody(body, baseLine, { part: "audio", duration, errors, allow: ["peaks", "marker"], caps: { transcriptLines: lim.audioTranscriptLines, chapters: lim.audioChapters, markers: lim.audioMarkers, captionFiles: 0 } }, budget);
  return {
    src, title: attrs.title ?? "", wave, height, compact: flag(attrs, "compact"), tone: tone(attrs.tone, "audio", "tone=", line, errors),
    speed: onOff(attrs, "speed", true, "audio", line, errors), speeds: speedsOf(attrs, "audio", line, errors), skip: attrs.skip === undefined ? 0 : skipOf(attrs, "audio", line, errors),
    start: startOf(attrs, "audio", line, errors, duration), loop: flag(attrs, "loop"), volume: onOff(attrs, "volume", true, "audio", line, errors),
    download: onOff(attrs, "download", false, "audio", line, errors), transcript: transcriptMode(attrs, "audio", line, errors), duration, ...t,
    caps: { peaksBytes: lim.audioPeaksBytes, waveformSamples: lim.audioWaveformSamples, decodeBytes: lim.audioDecodeBytes, vttCues: lim.audioVttCues, transcriptLines: lim.audioTranscriptLines }, errors,
  };
}

const dur = (s: number | null) => (s === null ? "" : ` (${fmtTime(s)})`);
const list = (xs: string[]) => xs.join("; ");

export function audioLlm(a: AudioSpec): string {
  const head = `Audio: ${titleOf(a)}${dur(a.duration)}, ${a.src}.${a.chapters.length ? ` Chapters: ${list(a.chapters.map((c) => `${fmtTime(c.t)} ${c.title}`))}.` : ""}${a.markers.length ? ` Markers: ${list(a.markers.map((c) => `${fmtTime(c.t)} ${c.title}`))}.` : ""}`;
  return a.cues.length ? `${head}\n\n${transcriptText(a.cues)}` : head;
}

/** the audio file and the files its body names: they must exist */
export const audioFiles = (a: AudioSpec, line: number): PartFileRef[] => [...(a.src ? [{ path: a.src, line }] : []), ...a.files];

export default definePart<AudioSpec>({
  name: "audio",
  form: "fenced",
  steps: false,
  llmKind: "own",
  parse: (input, ctx) => parseAudio(input.body, input.bodyLine, input.attrs, input.line, ctx.limits, ctx.budget),
  llm: (a) => audioLlm(a),
  files: (a, { line }) => audioFiles(a, line),
  llmExempt: (a) => a.cues.length > 0,   // the transcript is the content: the 400-token rule does not ask for :::llm
  check: (a) => a.errors.map((e) => ({ line: e.line, message: e.msg })),
});
