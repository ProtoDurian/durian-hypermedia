// The gallery part's caps (format version 11). Every key starts with the part's name; parse() reads them from the Limits it
// is given, so a host can lower (or raise) them like any other cap.
/** images in one gallery */
export const LIMITS = { galleryImages: 60 };
/** for text nobody reviewed (chat): fewer images */
export const UNTRUSTED_LIMITS: typeof LIMITS = { ...LIMITS, galleryImages: 30 };
