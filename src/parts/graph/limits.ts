// The graph part's caps (format version 11). Every key starts with the part's name; parse() reads them from the Limits it
// is given, so a host can lower (or raise) them like any other cap.
/** nodes, edges and groups of one graph, how many groups deep a group may sit, and the nodes over which only the groups are drawn first */
export const LIMITS = { graphNodes: 2000, graphEdges: 5000, graphGroups: 300, graphDepth: 6, graphFoldFirst: 300 };
/** for text nobody reviewed (chat): half the nodes, edges and groups (the layouts and the force run grow with them) */
export const UNTRUSTED_LIMITS: typeof LIMITS = { ...LIMITS, graphNodes: 1000, graphEdges: 2500, graphGroups: 150 };
