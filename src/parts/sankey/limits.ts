// The sankey part's caps (format version 11). Every key starts with the part's name; parse() reads them from the
// Limits it is given, so a host can lower (or raise) them like any other cap.
/** flows, nodes and @step lines of one sankey */
export const LIMITS = { sankeyFlows: 300, sankeyNodes: 120, sankeySteps: 30 };
/** for text nobody reviewed (chat): half the flows and nodes (the layout costs about nodes times flows) */
export const UNTRUSTED_LIMITS: typeof LIMITS = { ...LIMITS, sankeyFlows: 150, sankeyNodes: 60 };
