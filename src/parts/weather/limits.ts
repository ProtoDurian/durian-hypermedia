// The weather part's caps (format version 11). Every key starts with the part's name; parse() reads them from the Limits it
// is given, so a host can lower (or raise) them like any other cap.
/** forecast lines (days or hours) in one part, characters in one line, characters in one note */
export const LIMITS = { weatherRows: 200, weatherLineChars: 400, weatherNoteChars: 160 };
/** for text nobody reviewed (chat): fewer lines */
export const UNTRUSTED_LIMITS: typeof LIMITS = { ...LIMITS, weatherRows: 100 };
