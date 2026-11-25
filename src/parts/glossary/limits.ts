// The glossary's caps (format version 11). Every key starts with the part's name; the host can lower or raise them.
/** terms in one page (front matter and every block together), characters of a term's name, characters of a meaning, other names of a term */
export const LIMITS = { glossaryTerms: 200, glossaryLabel: 60, glossaryDef: 600, glossaryAliases: 5 };
/** for text nobody reviewed (chat): half the terms, a shorter meaning */
export const UNTRUSTED_LIMITS: typeof LIMITS = { ...LIMITS, glossaryTerms: 100, glossaryDef: 400 };
