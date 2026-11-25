// The downloads part's caps (format version 11). Every key starts with the part's name; parse() reads them from the
// Limits it is given, so a host can lower (or raise) them like any other cap.
/** files in one downloads list, and the bytes the Node entry reads of one file to check its checksum */
export const LIMITS = { downloadsFiles: 100, downloadsCheckBytes: 64 * 1024 * 1024 };
/** for text nobody reviewed (chat): a shorter list and a smaller file to read */
export const UNTRUSTED_LIMITS: typeof LIMITS = { ...LIMITS, downloadsFiles: 40, downloadsCheckBytes: 16 * 1024 * 1024 };
