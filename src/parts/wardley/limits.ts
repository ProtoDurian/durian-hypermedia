// The wardley part's caps (format version 11). Every key starts with the part's name; parse() reads them from the Limits
// it is given, so a host can lower (or raise) them like any other cap.
/** components (anchors count) in one map */
export const LIMITS = { wardleyComponents: 60 };
/** for text nobody reviewed (chat): a smaller map */
export const UNTRUSTED_LIMITS: typeof LIMITS = { ...LIMITS, wardleyComponents: 40 };
