// The timeline part's caps (format version 11). Every key starts with the part's name; parse() reads them from the Limits
// it is given, so a host can lower (or raise) them like any other cap.
/** events in one timeline */
export const LIMITS = { timelineEvents: 80 };
/** for text nobody reviewed (chat): fewer events */
export const UNTRUSTED_LIMITS: typeof LIMITS = { ...LIMITS, timelineEvents: 50 };
