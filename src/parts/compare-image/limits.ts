// The compare-image part's caps (format version 11). Every key starts with the part's name; parse() reads them from the
// Limits it is given, so a host can lower (or raise) them like any other cap.
/** characters in an alt text, in a label, and in an image address */
export const LIMITS = { compareImageAlt: 300, compareImageLabel: 40, compareImageUrl: 500 };
/** for text nobody reviewed (chat): shorter alt text and addresses */
export const UNTRUSTED_LIMITS: typeof LIMITS = { ...LIMITS, compareImageAlt: 200, compareImageUrl: 300 };
