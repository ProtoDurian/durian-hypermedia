// The http part's caps (format version 11). Every key starts with the part's name; parse() reads them from the
// Limits it is given, so a host can lower (or raise) them like any other cap.
/** lines and characters in one message block; headers in one message; levels and nodes of a JSON body drawn as a tree */
export const LIMITS = { httpLines: 600, httpHeaders: 80, httpJsonDepth: 24, httpJsonNodes: 3000, httpChars: 60_000 };
/** for text nobody reviewed (chat): shorter messages, fewer headers, a smaller JSON tree */
export const UNTRUSTED_LIMITS: typeof LIMITS = { ...LIMITS, httpLines: 300, httpHeaders: 40, httpJsonDepth: 16, httpJsonNodes: 1500, httpChars: 30_000 };
