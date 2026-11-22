// The Lottie part (format version 11): lottie-web's light build (no expressions, so no eval), loaded when the part scrolls
// near. Pure here: the parse, the checks and the LLM view. What the file holds is checked in the browser (check.ts).
//
//   ```lottie src="media/loading.json" title="What happens while it builds" loop
//   alt: A box fills with blocks, one row at a time, then a tick appears.
//   colours: dh-c1 = c1, dh-warn = warn
//   ```
import { definePart } from "../types";
import type { Budget } from "../../core/budget";
import { HEIGHTS, TONES, afterColon, checkSrc, flag, nameOf, unknownKeys, bodyLines, type Err } from "../downloads/media";
import type { LottieCaps } from "./check";

export const LOTTIE_KEYS = ["id", "src", "title", "loop", "speed", "start", "height", "llm"];
export interface LottieSpec { src: string; title: string; alt: string; loop: boolean; speed: number; paused: boolean; height: string; colours: { name: string; tone: string }[]; caps: LottieCaps; errors: Err[] }
export type LottieLimits = { lottieBytes: number; lottieFrames: number; lottieLayers: number; lottieNodes: number };

const isNameChar = (c: string) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || (c >= "0" && c <= "9") || c === "_" || c === "." || c === "-";
const allOf = (s: string, ok: (c: string) => boolean) => { if (!s) return false; for (let i = 0; i < s.length; i++) if (!ok(s[i])) return false; return true; };
const isAlnum = (c: string) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || (c >= "0" && c <= "9");

export function parseLottie(body: string, baseLine: number, attrs: Record<string, string>, line: number, lim: LottieLimits, budget: Budget): LottieSpec {
  const errors: Err[] = [];
  unknownKeys(attrs, LOTTIE_KEYS, "lottie", line, errors);
  const src = checkSrc(attrs.src, ["json"], "lottie", "a Lottie file", line, errors);
  let alt = "";
  const colours: { name: string; tone: string }[] = [];
  for (const { text: s, line: l } of bodyLines(body, baseLine, budget)) {
    let m: string | null;
    if ((m = afterColon(s, "alt:")) !== null) { alt = m; continue; }
    if ((m = afterColon(s, "colours:") ?? afterColon(s, "colors:")) !== null) {
      for (const pair of m.split(",")) {
        budget.charge(1 + (pair.length >> 4), 1);
        const eq = pair.indexOf("=");
        const name = eq < 0 ? "" : pair.slice(0, eq).trim(), word = eq < 0 ? "" : pair.slice(eq + 1).trim();
        if (!allOf(name, isNameChar) || !allOf(word, isAlnum)) { errors.push({ line: l, msg: `lottie: colours: "${pair.trim()}" is not "name = colour"; write colours: dh-c1 = c1, dh-warn = warn` }); continue; }
        if (!TONES.includes(word)) { errors.push({ line: l, msg: `lottie: colours: "${word}" is not a theme colour word (${TONES.join(", ")})` }); continue; }
        colours.push({ name, tone: word });
      }
      continue;
    }
    errors.push({ line: l, msg: `lottie: "${s.slice(0, 40)}" is not a line this part knows: alt: <what it shows>, colours: dh-c1 = c1` });
  }
  if (!alt) errors.push({ line, msg: `lottie: no alt: line; say what the animation shows (for screen readers and the LLM view), like alt: A box fills with blocks, then a tick appears.` });
  let speed = 1;
  if (attrs.speed !== undefined) { speed = attrs.speed.trim() === "" ? NaN : +attrs.speed; if (!(speed >= 0.25 && speed <= 4)) { errors.push({ line, msg: `lottie: speed= is a number from 0.25 to 4` }); speed = 1; } }
  if (attrs.start !== undefined && attrs.start !== "paused" && attrs.start !== "play") errors.push({ line, msg: `lottie: start= is paused or play` });
  if (attrs.height !== undefined && !HEIGHTS.includes(attrs.height)) errors.push({ line, msg: `lottie: height="${attrs.height}" is s, m or l` });
  return { src, title: attrs.title ?? "", alt, loop: flag(attrs, "loop"), speed, paused: attrs.start === "paused", height: attrs.height ?? "m", colours, caps: { bytes: lim.lottieBytes, frames: lim.lottieFrames, layers: lim.lottieLayers, nodes: lim.lottieNodes }, errors };
}

export function lottieLlm(l: LottieSpec): string { return `Lottie animation: ${l.title || nameOf(l.src)}. ${l.alt}`; }

export default definePart<LottieSpec>({
  name: "lottie",
  form: "fenced",
  steps: false,
  llmKind: "own",
  parse: (input, ctx) => parseLottie(input.body, input.bodyLine, input.attrs, input.line, ctx.limits, ctx.budget),
  llm: (l) => lottieLlm(l),
  check: (l) => l.errors.map((e) => ({ line: e.line, message: e.msg })),
  dependencies: ["lottie-web"],
});
