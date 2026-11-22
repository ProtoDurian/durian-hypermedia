// The fishbone part's caps (format version 11). Every key starts with the part's name; parse() reads them from the
// Limits it is given, so a host can lower (or raise) them like any other cap.
/** causes (first level) of one fishbone, and sub-causes (second level) of one fishbone */
export const LIMITS = { fishboneCauses: 60, fishboneSubCauses: 240 };
/** for text nobody reviewed (chat): fewer sub-causes */
export const UNTRUSTED_LIMITS: typeof LIMITS = { ...LIMITS, fishboneSubCauses: 120 };
