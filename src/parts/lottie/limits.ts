// The Lottie part's caps (format version 11). Every key starts with the part's name; parse() reads them from the Limits it
// is given, so a host can lower (or raise) them like any other cap. What a Lottie file holds (its size, frames, layers) is
// known only in the browser: parse copies these into the data and the view checks them when the file loads, before the
// library is fetched.
/** bytes of the file, frames of the animation, layers and values (nodes) of the file */
export const LIMITS = { lottieBytes: 1024 * 1024, lottieFrames: 3600, lottieLayers: 500, lottieNodes: 200_000 };
/** for text nobody reviewed (chat): smaller files */
export const UNTRUSTED_LIMITS: typeof LIMITS = { ...LIMITS, lottieBytes: 256 * 1024, lottieFrames: 1800, lottieLayers: 200, lottieNodes: 50_000 };
