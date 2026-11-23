// The diff part's caps (format version 11). Every key starts with the part's name; parse() reads them from the
// Limits it is given, so a host can lower (or raise) them like any other cap.
/** lines and files in one diff; characters and words (tokens) of a changed line that still gets word marks; the edit length jsdiff may search to */
export const LIMITS = { diffLines: 4000, diffFiles: 40, diffWordLine: 1200, diffWordTokens: 300, diffEditLength: 60 };
/** for text nobody reviewed (chat): a smaller diff and cheaper word marks */
export const UNTRUSTED_LIMITS: typeof LIMITS = { ...LIMITS, diffLines: 2000, diffFiles: 20, diffWordLine: 600, diffWordTokens: 150, diffEditLength: 40 };
