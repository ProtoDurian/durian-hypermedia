// The video part's caps (format version 11). Every key starts with the part's name; parse() reads them from the Limits it
// is given, so a host can lower (or raise) them like any other cap. File caps are checked when a captions, thumbs or
// transcript file loads: parse copies them into the data and the view checks them.
/** transcript lines, chapters and caption files of one video; cues and bytes of captions, thumbs and transcript files */
export const LIMITS = { videoTranscriptLines: 2000, videoChapters: 200, videoCaptionFiles: 12, videoVttCues: 5000, videoTranscriptBytes: 1_000_000, videoVttBytes: 1_000_000, videoThumbsBytes: 1_000_000 };
/** for text nobody reviewed (chat): shorter lists */
export const UNTRUSTED_LIMITS: typeof LIMITS = { ...LIMITS, videoTranscriptLines: 1000, videoChapters: 100, videoCaptionFiles: 6, videoVttCues: 2000, videoTranscriptBytes: 256_000, videoVttBytes: 256_000, videoThumbsBytes: 256_000 };
