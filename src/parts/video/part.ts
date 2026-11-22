// The video part (format version 11): our controls over the browser's video element. Pure: the parse, the checks and the LLM
// view. The timed body (chapters, transcript lines, files) is read by the code audio and video share (../audio/timed).
//
//   ```video src="media/create.mp4" poster="media/create.jpg" title="Creating a project" duration=1:58
//   captions: media/create.en.vtt "English" default
//   thumbs: media/create.thumbs.vtt
//   chapter 0:00 Start
//   ```
import { definePart } from "../types";
import type { Budget } from "../../core/budget";
import { HEIGHTS, IMAGE_EXT, VIDEO_EXT, checkSrc, extOf, flag, fmtTime, onOff, titleOf, unknownKeys, urlRefusal, type Err } from "../downloads/media";
import { durationOf, parseTimedBody, skipOf, speedsOf, startOf, transcriptMode, transcriptText, type Timed } from "../audio/timed";

export const VIDEO_KEYS = ["id", "src", "title", "poster", "clip", "loop", "start", "height", "duration", "speed", "speeds", "skip", "volume", "download", "transcript", "autoplay", "llm"];
export interface VideoSpec extends Timed {
  src: string; poster: string; title: string; clip: boolean; loop: boolean; start: number; height: string; duration: number | null; speed: boolean; speeds: number[]; skip: number; volume: boolean; download: boolean;
  transcript: "open" | "closed" | "off"; caps: { vttCues: number; transcriptLines: number }; errors: Err[];
}
export type VideoLimits = { videoTranscriptLines: number; videoChapters: number; videoCaptionFiles: number; videoVttCues: number };

export function parseVideo(body: string, baseLine: number, attrs: Record<string, string>, line: number, lim: VideoLimits, budget: Budget): VideoSpec {
  const errors: Err[] = [];
  unknownKeys(attrs, VIDEO_KEYS, "video", line, errors);
  if (attrs.autoplay !== undefined) errors.push({ line, msg: `video: autoplay is not allowed; a reader presses Play (a short silent loop is clip)` });
  const src0 = attrs.src ?? "";
  const stream = isStreamHost(src0);
  if (stream) errors.push({ line, msg: `video: a YouTube or Vimeo address is not allowed as src (those embeds phone home and are not in this version); host the file and give its address` });
  const src = stream ? src0 : checkSrc(attrs.src, VIDEO_EXT, "video", "a video file", line, errors, ["m3u8"]);
  const duration = durationOf(attrs, "video", line, errors);
  const clip = flag(attrs, "clip");
  if (clip) for (const k of ["volume", "speed", "speeds", "skip", "download", "transcript"]) if (attrs[k] !== undefined) errors.push({ line, msg: `video: a clip is a silent loop; it takes no ${k}= (drop it, or drop clip)` });
  if (attrs.poster) { const why = urlRefusal(attrs.poster); if (why) errors.push({ line, msg: `video: poster "${attrs.poster}" is not allowed: ${why}` }); else if (!IMAGE_EXT.includes(extOf(attrs.poster))) errors.push({ line, msg: `video: poster "${attrs.poster}" is not an image (${IMAGE_EXT.join(", ")})` }); }
  const height = attrs.height ?? "m";
  if (!HEIGHTS.includes(height)) errors.push({ line, msg: `video: height="${height}" is s, m or l` });
  const b = parseTimedBody(body, baseLine, { part: "video", duration, errors, allow: ["source", "captions", "thumbs"], caps: { transcriptLines: lim.videoTranscriptLines, chapters: lim.videoChapters, markers: 0, captionFiles: lim.videoCaptionFiles } }, budget);
  const defaults = b.captions.filter((c) => c.default);
  if (defaults.length > 1) errors.push({ line: defaults[1].line, msg: `video: two captions are marked default; only one may be` });
  if (clip && (b.captions.length || b.cues.length || b.chapters.length)) errors.push({ line, msg: `video: a clip is a short silent loop; it takes no captions, chapters or transcript` });
  return {
    src, poster: attrs.poster ?? "", title: attrs.title ?? "", clip, loop: flag(attrs, "loop") || clip, start: startOf(attrs, "video", line, errors, duration), height, duration,
    speed: onOff(attrs, "speed", true, "video", line, errors), speeds: speedsOf(attrs, "video", line, errors), skip: skipOf(attrs, "video", line, errors), volume: onOff(attrs, "volume", true, "video", line, errors),
    download: onOff(attrs, "download", false, "video", line, errors), transcript: transcriptMode(attrs, "video", line, errors), ...b,
    caps: { vttCues: lim.videoVttCues, transcriptLines: lim.videoTranscriptLines }, errors,
  };
}

/** a YouTube or Vimeo address (the host name, compared by a scan: no regular expression over author text) */
export function isStreamHost(u: string): boolean {
  const t = u.trim().toLowerCase();
  const sch = t.startsWith("https://") ? 8 : t.startsWith("http://") ? 7 : 0;
  if (!sch) return false;
  let e = sch;
  while (e < t.length && t[e] !== "/" && t[e] !== "?" && t[e] !== "#") e++;
  const host = t.slice(sch, e);
  for (const h of ["youtube.com", "youtu.be", "youtube-nocookie.com", "vimeo.com"]) if (host === h || host.endsWith("." + h)) return true;
  return false;
}

const dur = (s: number | null) => (s === null ? "" : ` (${fmtTime(s)})`);
export function videoLlm(v: VideoSpec): string {
  const head = `Video: ${titleOf(v)}${dur(v.duration)}, ${v.src}.${v.chapters.length ? ` Chapters: ${v.chapters.map((c) => `${fmtTime(c.t)} ${c.title}`).join("; ")}.` : ""}${v.captions.length ? ` Captions: ${v.captions.map((c) => c.label).join(", ")}.` : ""}`;
  return v.cues.length ? `${head}\n\n${transcriptText(v.cues)}` : head;
}

export default definePart<VideoSpec>({
  name: "video",
  form: "fenced",
  steps: false,
  llmKind: "own",
  parse: (input, ctx) => parseVideo(input.body, input.bodyLine, input.attrs, input.line, ctx.limits, ctx.budget),
  llm: (v) => videoLlm(v),
  llmExempt: (v) => v.cues.length > 0,   // the transcript is the content: the 400-token rule does not ask for :::llm
  check: (v) => v.errors.map((e) => ({ line: e.line, message: e.msg })),
});
