// The sequence part's caps (format version 11). Every key starts with the part's name; parse() reads them from the
// Limits it is given, so a host can lower (or raise) them like any other cap.
/** participants (columns), lines (participants and messages, blocks and notes together) and how deep blocks nest */
export const LIMITS = { sequenceParticipants: 12, sequenceItems: 200, sequenceDepth: 3 };
/** for text nobody reviewed (chat): a shorter story */
export const UNTRUSTED_LIMITS: typeof LIMITS = { ...LIMITS, sequenceItems: 120 };
