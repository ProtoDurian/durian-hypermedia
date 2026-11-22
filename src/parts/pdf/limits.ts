// The PDF part's caps (format version 11). Every key starts with the part's name; parse() reads them from the Limits it is
// given, so a host can lower (or raise) them like any other cap. What a PDF holds (its bytes, its pages) is known only in the
// browser: parse copies these into the data and the view checks them when the file loads, before pdf.js parses it.
/** bytes of the file, and pages of the document */
export const LIMITS = { pdfPages: 500, pdfBytes: 20 * 1024 * 1024 };
/** for text nobody reviewed (chat): smaller files */
export const UNTRUSTED_LIMITS: typeof LIMITS = { ...LIMITS, pdfPages: 200, pdfBytes: 8 * 1024 * 1024 };
