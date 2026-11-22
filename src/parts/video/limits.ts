// The video part's caps (format version 11). Every key starts with the part's name; parse() reads them from the Limits it
// is given, so a host can lower (or raise) them like any other cap. The cue cap is known only when a captions, thumbs or
// transcript file loads: parse copies it into the data and the view checks it.
/** transcript lines, chapters and caption files of one video; cues of one captions, thumbs or transcript file */
export const LIMITS = { videoTranscriptLines: 2000, videoChapters: 200, videoCaptionFiles: 12, videoVttCues: 5000 };
/** for text nobody reviewed (chat): shorter lists */
export const UNTRUSTED_LIMITS: typeof LIMITS = { ...LIMITS, videoTranscriptLines: 1000, videoChapters: 100, videoCaptionFiles: 6, videoVttCues: 2000 };
