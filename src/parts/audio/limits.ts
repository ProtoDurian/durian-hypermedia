// The audio part's caps (format version 11). Every key starts with the part's name; parse() reads them from the Limits it
// is given, so a host can lower (or raise) them like any other cap. The three that name a file's size (peaks, decode, the
// waveform) are known only in the browser: parse copies them into the data and the view checks them when the file loads.
/** transcript lines, chapters and markers of one player; cues of a transcript file; samples of a wave; bytes of a peaks file; bytes of an audio file decoded in the browser to draw its wave */
export const LIMITS = { audioTranscriptLines: 2000, audioChapters: 200, audioMarkers: 200, audioVttCues: 5000, audioWaveformSamples: 20000, audioPeaksBytes: 1_000_000, audioDecodeBytes: 20 * 1024 * 1024 };
/** for text nobody reviewed (chat): shorter lists, smaller files */
export const UNTRUSTED_LIMITS: typeof LIMITS = { ...LIMITS, audioTranscriptLines: 1000, audioChapters: 100, audioMarkers: 100, audioVttCues: 2000, audioWaveformSamples: 10000, audioPeaksBytes: 500_000, audioDecodeBytes: 10 * 1024 * 1024 };
