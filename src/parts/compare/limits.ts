// The compare part's caps (format version 11). Every key starts with the part's name; parse() reads them from the
// Limits it is given, so a host can lower (or raise) them like any other cap.
/** options (columns), rows (criteria), characters in a value, characters in a note, characters in an option or criterion name */
export const LIMITS = { compareOptions: 8, compareRows: 40, compareValue: 120, compareNote: 300, compareName: 80 };
/** for text nobody reviewed (chat): fewer rows, shorter notes */
export const UNTRUSTED_LIMITS: typeof LIMITS = { ...LIMITS, compareRows: 25, compareNote: 200 };
