// The references part's caps (format version 11). Every key starts with the part's name.
/** entries in the list; authors of one entry; characters in one text field; cites on a page */
export const LIMITS = { referencesEntries: 400, referencesAuthors: 30, referencesText: 600, referencesCites: 2000 };
/** for text nobody reviewed (chat) */
export const UNTRUSTED_LIMITS: typeof LIMITS = { ...LIMITS, referencesEntries: 100, referencesAuthors: 12, referencesText: 300, referencesCites: 500 };
