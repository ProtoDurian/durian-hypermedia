// Peaks for the audio wave (format version 11): the BBC audiowaveform JSON read into 0..1 peaks, and the bars drawn from
// them. Pure; the view calls these when the peaks file has loaded.

/** BBC audiowaveform JSON ({ bits, data: [min, max, ...] }) to peaks from 0 to 1; null when it is not that, or over `maxSamples` */
export function peaksOf(json: any, maxSamples: number): number[] | null {
  if (!json || !Array.isArray(json.data) || json.data.length < 2) return null;
  const bits = json.bits === 16 ? 16 : 8, top = 2 ** (bits - 1);
  const n = Math.floor(json.data.length / 2);
  if (n > maxSamples) return null;
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) { const lo = Math.abs(+json.data[2 * i] || 0), hi = Math.abs(+json.data[2 * i + 1] || 0); out[i] = Math.min(1, Math.max(lo, hi) / top); }
  return out;
}
/** `n` bars from the peaks: each bar the loudest of its share */
export function barsOf(peaks: number[], n: number): number[] {
  const out = new Array<number>(n).fill(0);
  if (!peaks.length || n <= 0) return out;
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i * peaks.length) / n), b = Math.max(a + 1, Math.floor(((i + 1) * peaks.length) / n));
    let m = 0;
    for (let k = a; k < b && k < peaks.length; k++) if (peaks[k] > m) m = peaks[k];
    out[i] = m;
  }
  return out;
}
