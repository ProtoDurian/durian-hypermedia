// The sparkline's caps (format version 11). Every key starts with the part's name; the host can lower or raise them.
/** numbers in one :spark[...] (a sparkline is a glance: aggregate the data) */
export const LIMITS = { sparkValues: 200 };
/** for text nobody reviewed (chat): half as many numbers */
export const UNTRUSTED_LIMITS: typeof LIMITS = { ...LIMITS, sparkValues: 100 };
