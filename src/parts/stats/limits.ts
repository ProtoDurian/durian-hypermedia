// The stats part's caps (format version 11). Every key starts with the part's name; parse() reads them from the
// Limits it is given, so a host can lower (or raise) them like any other cap.
/** tiles in one stats block; numbers in one tile's sparkline; characters in a name, a value, a glyph or a sub-line; characters in a note */
export const LIMITS = { statsTiles: 12, statsSpark: 60, statsText: 60, statsNote: 120 };
/** for text nobody reviewed (chat): fewer tiles, a shorter sparkline and note */
export const UNTRUSTED_LIMITS: typeof LIMITS = { ...LIMITS, statsTiles: 8, statsSpark: 40, statsNote: 80 };
