// The venn part's caps (format version 11). Every key starts with the part's name; parse() reads them from the Limits it
// is given, so a host can lower (or raise) them like any other cap.
/** names in one figure (a count is not a name) */
export const LIMITS = { vennNames: 120 };
/** for text nobody reviewed (chat): fewer names */
export const UNTRUSTED_LIMITS: typeof LIMITS = { ...LIMITS, vennNames: 60 };
