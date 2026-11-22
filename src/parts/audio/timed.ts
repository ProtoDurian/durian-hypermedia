// What audio and video share (format version 11): the body lines (chapters, markers, transcript lines, files), the
// options (duration, start, speeds, skip, transcript) and WebVTT. Pure, linear, hand scans only. It lives in the first of
// the two folders (audio); video imports it from here.
import type { Budget } from "../../core/budget";
import { firstWord, afterColon, bodyLines, digitsOnly, extOf, fmtTime, isDigit, isTimeWord, parseTime, TONES, urlRefusal, VIDEO_EXT, type Err } from "../downloads/media";
import { isSpace } from "../kit/text";

export interface Chapter { t: number; title: string; line: number }
export interface Marker { t: number; title: string; tone: string; line: number }
export interface Cue { t: number; speaker: string; text: string; line: number }
export interface CaptionFile { src: string; label: string; default: boolean; line: number }
export interface Timed { chapters: Chapter[]; markers: Marker[]; cues: Cue[]; transcriptFile: string | null; peaks: string | null; thumbs: string | null; sources: string[]; captions: CaptionFile[] }
/** the caps a timed body reads (audio and video give their own names to the same four) */
export interface TimedCaps { transcriptLines: number; chapters: number; markers: number; captionFiles: number }

export const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
export interface BodyOpts { part: "audio" | "video"; duration: number | null; errors: Err[]; allow: ("peaks" | "source" | "captions" | "thumbs" | "marker")[]; caps: TimedCaps }

/** "[colour]" at the end of a marker's text: [title, colour] (colour null when there is none) */
function markerParts(rest: string): [string, string | null] {
  if (rest.endsWith("]")) {
    const open = rest.lastIndexOf("[");
    if (open > 0 && isSpace(rest[open - 1]) && !rest.slice(open + 1, -1).includes("]") && rest.slice(0, open).trim()) return [rest.slice(0, open).trim(), rest.slice(open + 1, -1)];
  }
  return [rest, null];
}
/** `Speaker: text` at the start of a transcript line's words: [speaker, text]; speaker "" when there is none. The speaker is
 *  at most 29 characters, does not start with a colon or a digit, and the colon is followed by a space. */
export function speakerOf(s: string): [string, string] {
  const c = s[0];
  if (!c || c === ":" || isDigit(c)) return ["", s];
  const k = s.indexOf(":");
  if (k < 1 || k > 29 || !isSpace(s[k + 1])) return ["", s];
  const text = s.slice(k + 1).trim();
  return text ? [s.slice(0, k).trim(), text] : ["", s];
}

/** `captions: <file.vtt> "Label" [default]` after the colon: [file, label, default] or null when it is not that shape */
function captionsParts(rest: string): [string, string, boolean] | null {
  const [u, tail] = firstWord(rest);
  if (!u) return null;
  if (!tail) return [u, "", false];
  if (tail === "default") return [u, "", true];
  if (tail[0] !== '"') return null;
  const close = tail.indexOf('"', 1);
  if (close < 0) return null;
  const after = tail.slice(close + 1);
  if (after === "") return [u, tail.slice(1, close), false];
  return isSpace(after[0]) && after.trim() === "default" ? [u, tail.slice(1, close), true] : null;
}

export function parseTimedBody(body: string, baseLine: number, o: BodyOpts, budget: Budget): Timed {
  const t: Timed = { chapters: [], markers: [], cues: [], transcriptFile: null, peaks: null, thumbs: null, sources: [], captions: [] };
  const err = (line: number, msg: string) => o.errors.push({ line, msg: `${o.part}: ${msg}` });
  const total = o.caps.transcriptLines + o.caps.chapters + o.caps.markers;
  let lastCue = -1, lastCh = -1;
  const pastEnd = (time: number, line: number, what: string) => { if (o.duration !== null && time > o.duration) err(line, `${what} at ${fmtTime(time)} is past duration=${fmtTime(o.duration)}`); };
  const lines = bodyLines(body, baseLine, budget);
  let n = 0;
  for (const { text: s, line } of lines) {
    if (++n > total + 50) { err(line, `more than ${total} lines (the cap); shorten it`); break; }
    budget.charge(1 + (s.length >> 5), 0, 0);
    let m: string | null;
    if ((m = afterColon(s, "peaks:")) !== null) {
      if (!o.allow.includes("peaks")) { err(line, `"peaks:" is for audio only`); continue; }
      if (!m) { err(line, `"peaks:" needs a .json file`); continue; }
      const why = urlRefusal(m);
      if (why) { err(line, `peaks file "${m}" is not allowed: ${why}`); continue; }
      if (extOf(m) !== "json") { err(line, `peaks file "${m}" is not .json (the BBC audiowaveform format; bun src/parts/audio/peaks.ts <file> writes one)`); continue; }
      t.peaks = m; continue;
    }
    if ((m = afterColon(s, "source:")) !== null) {
      if (!o.allow.includes("source")) { err(line, `"source:" is for video only`); continue; }
      const why = urlRefusal(m);
      if (why) { err(line, `source "${m}" is not allowed: ${why}`); continue; }
      if (!VIDEO_EXT.includes(extOf(m))) { err(line, `source "${m}" is not a video file (${VIDEO_EXT.join(", ")})`); continue; }
      t.sources.push(m); continue;
    }
    if ((m = afterColon(s, "captions:")) !== null) {
      if (!o.allow.includes("captions")) { err(line, `"captions:" is for video only`); continue; }
      const cp = captionsParts(m);
      if (!cp) { err(line, `captions: <file.vtt> "Label" [default]`); continue; }
      const [u, label, dflt] = cp;
      const why = urlRefusal(u);
      if (why) { err(line, `captions file "${u}" is not allowed: ${why}`); continue; }
      if (extOf(u) !== "vtt") { err(line, `captions file "${u}" is not .vtt (WebVTT)`); continue; }
      if (!label) { err(line, `captions: ${u} needs a label in quotes, like captions: ${u} "English"`); continue; }
      if (t.captions.length >= o.caps.captionFiles) { err(line, `more than ${o.caps.captionFiles} caption files (the cap)`); continue; }
      t.captions.push({ src: u, label, default: dflt, line }); continue;
    }
    if ((m = afterColon(s, "thumbs:")) !== null) {
      if (!o.allow.includes("thumbs")) { err(line, `"thumbs:" is for video only`); continue; }
      const why = urlRefusal(m);
      if (why) { err(line, `thumbs file "${m}" is not allowed: ${why}`); continue; }
      if (extOf(m) !== "vtt") { err(line, `thumbs file "${m}" is not .vtt (a WebVTT file whose cues name an image)`); continue; }
      t.thumbs = m; continue;
    }
    if ((m = afterColon(s, "transcript:")) !== null) {
      const why = urlRefusal(m);
      if (why) { err(line, `transcript file "${m}" is not allowed: ${why}`); continue; }
      if (extOf(m) !== "vtt" && extOf(m) !== "srt") { err(line, `transcript file "${m}" is not .vtt or .srt`); continue; }
      t.transcriptFile = m; continue;
    }
    const [w1, r1] = firstWord(s);
    if (w1 === "chapter") {
      const [tw, title] = firstWord(r1);
      if (!isTimeWord(tw) || !title) { err(line, `a chapter line is "chapter 3:20 The bug"`); continue; }
      const time = parseTime(tw);
      if (time === null) { err(line, `chapter time "${tw}" is not m:ss or h:mm:ss`); continue; }
      if (t.chapters.length >= o.caps.chapters) { err(line, `more than ${o.caps.chapters} chapters (the cap)`); continue; }
      if (time <= lastCh) err(line, `chapter ${fmtTime(time)} is not after the one before (${fmtTime(lastCh)}); chapters go in time order`);
      lastCh = time; pastEnd(time, line, "chapter");
      t.chapters.push({ t: time, title, line }); continue;
    }
    if (w1 === "marker") {
      const [tw, rest] = firstWord(r1);
      if (!isTimeWord(tw) || !rest) { err(line, `a marker line is "marker 5:02 The crash [bad]"`); continue; }
      if (!o.allow.includes("marker")) { err(line, `"marker" is for audio only`); continue; }
      const time = parseTime(tw);
      if (time === null) { err(line, `marker time "${tw}" is not m:ss or h:mm:ss`); continue; }
      if (t.markers.length >= o.caps.markers) { err(line, `more than ${o.caps.markers} markers (the cap)`); continue; }
      const [title, col] = markerParts(rest);
      const tn = col === null ? "acc" : col.trim().toLowerCase();
      if (!TONES.includes(tn)) { err(line, `marker colour [${col}] is not a colour word (${TONES.join(", ")})`); continue; }
      pastEnd(time, line, "marker");
      t.markers.push({ t: time, title, tone: tn, line }); continue;
    }
    if (isTimeWord(w1) && r1) {
      const time = parseTime(w1);
      if (time === null) { err(line, `time "${w1}" is not m:ss or h:mm:ss`); continue; }
      if (t.cues.length >= o.caps.transcriptLines) { err(line, `more than ${o.caps.transcriptLines} transcript lines (the cap)`); continue; }
      if (time < lastCue) err(line, `transcript line at ${fmtTime(time)} is before the one above it (${fmtTime(lastCue)}); lines go in time order`);
      lastCue = Math.max(lastCue, time); pastEnd(time, line, "transcript line");
      const [sp, text] = speakerOf(r1);
      t.cues.push({ t: time, speaker: sp, text, line }); continue;
    }
    err(line, `"${s.slice(0, 40)}" is not a line this part knows: ${o.part === "audio" ? "peaks: <file>, transcript: <file>, chapter m:ss Title, marker m:ss Title [colour], or a transcript line m:ss Speaker: text" : "source: <file>, captions: <file> \"Label\", thumbs: <file>, transcript: <file>, chapter m:ss Title, or a transcript line m:ss Speaker: text"}`);
  }
  return t;
}

export function speedsOf(a: Record<string, string>, part: string, line: number, errors: Err[]): number[] {
  if (a.speeds === undefined) return SPEEDS;
  const l = a.speeds.split(",").map((x) => (x.trim() === "" ? NaN : +x.trim()));
  if (!l.length || l.some((x) => !Number.isFinite(x) || x < 0.25 || x > 4) || l.length > 8) { errors.push({ line, msg: `${part}: speeds= is up to 8 numbers from 0.25 to 4, like speeds=0.75,1,1.25,1.5,2` }); return SPEEDS; }
  return l;
}
export function durationOf(a: Record<string, string>, part: string, line: number, errors: Err[]): number | null {
  if (a.duration === undefined) return null;
  const d = parseTime(a.duration);
  if (d === null) { errors.push({ line, msg: `${part}: duration= is m:ss or h:mm:ss, like duration=12:34` }); return null; }
  return d;
}
export function startOf(a: Record<string, string>, part: string, line: number, errors: Err[], duration: number | null): number {
  if (a.start === undefined) return 0;
  const d = parseTime(a.start);
  if (d === null) { errors.push({ line, msg: `${part}: start= is m:ss or h:mm:ss, like start=1:20` }); return 0; }
  if (duration !== null && d > duration) errors.push({ line, msg: `${part}: start=${a.start} is past duration=${fmtTime(duration)}` });
  return d;
}
export function transcriptMode(a: Record<string, string>, part: string, line: number, errors: Err[]): "open" | "closed" | "off" {
  if (a.transcript === undefined) return "closed";
  if (a.transcript === "open" || a.transcript === "closed" || a.transcript === "off") return a.transcript;
  errors.push({ line, msg: `${part}: transcript= is open, closed or off (a transcript file goes on its own line: transcript: file.vtt)` });
  return "closed";
}
export function skipOf(a: Record<string, string>, part: string, line: number, errors: Err[]): number {
  if (a.skip === undefined) return 10;
  if (a.skip !== "10" && a.skip !== "15" && a.skip !== "30") { errors.push({ line, msg: `${part}: skip= is 10, 15 or 30 seconds` }); return 10; }
  return +a.skip;
}

// ---------- WebVTT (captions, transcript files, thumbnails) ----------
export interface VttCue { start: number; end: number; text: string }
/** one "00:00:01.500" or "1:02.250" (comma or dot) to seconds; null when it is not one */
function vttTime(s: string): number | null {
  const t = s.trim(), sep = Math.max(t.lastIndexOf("."), t.lastIndexOf(","));
  if (sep < 0) return null;
  const frac = t.slice(sep + 1), head = t.slice(0, sep).split(":");
  if (!digitsOnly(frac, 1, 3) || head.length < 2 || head.length > 3) return null;
  const sec = head[head.length - 1], min = head[head.length - 2];
  if (!digitsOnly(sec, 2, 2) || !digitsOnly(min, 1, 2)) return null;
  if (head.length === 3 && !digitsOnly(head[0])) return null;
  return (head.length === 3 ? +head[0] * 3600 : 0) + +min * 60 + +sec + +("0." + frac.padEnd(3, "0"));
}
/** the text with tags like <b> removed (a tag runs from "<" to the next ">"; a "<" with no ">" stays) */
function stripTags(s: string): string {
  let out = "", i = 0;
  while (i < s.length) {
    const lt = s.indexOf("<", i);
    if (lt < 0) { out += s.slice(i); break; }
    const gt = s.indexOf(">", lt + 1);
    if (gt < 0) { out += s.slice(i); break; }
    out += s.slice(i, lt); i = gt + 1;
  }
  return out;
}
/** Parses WebVTT or SRT text. Charges `budget` for every line; stops at `maxCues`. Tags in the text are removed (captions are drawn as text). */
export function parseVtt(text: string, budget: Budget, maxCues: number): VttCue[] {
  const out: VttCue[] = [];
  const lines = text.split("\r\n").join("\n").split("\r").join("\n").split("\n");
  for (let i = 0; i < lines.length && out.length < maxCues; i++) {
    const ln = lines[i];
    budget.charge(1 + (ln.length >> 4), 0, 0);
    const arrow = ln.indexOf("-->");
    if (arrow < 0) continue;
    const a = vttTime(ln.slice(0, arrow));
    // the end time is the next word after the arrow (settings like align:start follow it)
    const b = vttTime(firstWord(ln.slice(arrow + 3).trim())[0]);
    if (a === null || b === null) continue;
    const body: string[] = [];
    while (++i < lines.length) {
      const bl = lines[i];
      budget.charge(1 + (bl.length >> 4), 0, bl.length);
      if (bl.trim() === "") break;
      body.push(bl);
    }
    out.push({ start: a, end: b, text: stripTags(body.join("\n")).trim() });
  }
  return out;
}

/** the transcript as an LLM reads it: `m:ss Speaker: text`, a line each */
export const transcriptText = (cues: Cue[]): string => cues.map((c) => `${fmtTime(c.t)} ${c.speaker ? c.speaker + ": " : ""}${c.text}`).join("\n");
