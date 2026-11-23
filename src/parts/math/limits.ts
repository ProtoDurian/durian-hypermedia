// The maths part's caps (format version 11). Every key starts with the part's name.
/** characters of one formula; formulas on a page; nodes KaTeX's markup may have (one formula's tree) */
export const LIMITS = { mathChars: 4000, mathFormulas: 600, mathNodes: 60_000 };
/** for text nobody reviewed (chat): fewer and smaller formulas */
export const UNTRUSTED_LIMITS: typeof LIMITS = { ...LIMITS, mathChars: 1500, mathFormulas: 150, mathNodes: 20_000 };
