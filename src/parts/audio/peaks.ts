// `bun src/parts/audio/peaks.ts <audio file>`: writes the audio part's peaks file (the BBC audiowaveform JSON format) next
// to the file, with ffmpeg. A tool for an author, not part of the page: the part draws its wave from this file before the
// sound starts. Without a peaks file the browser decodes the file instead (same origin, under audioDecodeBytes).
//   bun src/parts/audio/peaks.ts <file> [--out <file.peaks.json>] [--per <samples per peak, default 400 at 8 kHz>]
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { LIMITS } from "./limits";

export function writePeaks(file: string, out = file.split(".").slice(0, -1).join(".") + ".peaks.json", per = 400): { out: string; length: number } {
  const ff = process.env.DH_FFMPEG || "ffmpeg";
  const r = spawnSync(ff, ["-v", "error", "-i", file, "-f", "s16le", "-ac", "1", "-ar", "8000", "-"], { maxBuffer: 512 << 20 });
  if (r.error || r.status !== 0) throw new Error(`ffmpeg could not read ${file} (is ffmpeg installed? DH_FFMPEG names it): ${r.error?.message ?? String(r.stderr).slice(0, 200)}`);
  const s = new Int16Array(r.stdout.buffer, r.stdout.byteOffset, Math.floor(r.stdout.byteLength / 2));
  while (Math.ceil(s.length / per) > LIMITS.audioWaveformSamples) per *= 2;   // stay under the cap the browser checks
  const data: number[] = [];
  for (let i = 0; i < s.length; i += per) {
    let lo = 0, hi = 0;
    for (let k = i; k < Math.min(s.length, i + per); k++) { if (s[k] < lo) lo = s[k]; if (s[k] > hi) hi = s[k]; }
    data.push(Math.round((lo / 32768) * 127), Math.round((hi / 32768) * 127));
  }
  writeFileSync(out, JSON.stringify({ version: 2, channels: 1, sample_rate: 8000, samples_per_pixel: per, bits: 8, length: data.length / 2, data }));
  return { out, length: data.length / 2 };
}
if (import.meta.main) {
  const a = process.argv.slice(2), opt = (k: string) => { const i = a.indexOf(k); return i >= 0 ? a.splice(i, 2)[1] : undefined; };
  const out = opt("--out"), per = opt("--per");
  if (!a[0]) { console.error("usage: peaks <audio file> [--out <file.peaks.json>] [--per <n>]"); process.exit(2); }
  try { const r = writePeaks(a[0], out, per ? +per : undefined); console.log(`wrote ${r.out}: ${r.length} peaks`); } catch (e: any) { console.error(e.message); process.exit(1); }
}
