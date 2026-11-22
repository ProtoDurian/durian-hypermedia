// The downloads part's caps (format version 11). Every key starts with the part's name; parse() reads them from the
// Limits it is given, so a host can lower (or raise) them like any other cap.
/** files in one downloads list */
export const LIMITS = { downloadsFiles: 100 };
/** for text nobody reviewed (chat): a shorter list */
export const UNTRUSTED_LIMITS: typeof LIMITS = { ...LIMITS, downloadsFiles: 40 };
