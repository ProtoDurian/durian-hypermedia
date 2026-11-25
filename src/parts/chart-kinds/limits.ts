// The chart-kinds part's caps (format version 11): histogram, boxplot, violin, funnel, waterfall, treemap, sunburst and
// calendar. Every key starts with the part's name; parse() reads them from the Limits it is given, so a host can lower
// (or raise) them like any other cap. The page's work budget is charged on top: the density of a violin costs about 48
// steps a value, a sort about log2(n) a value, so a very large list is refused by the budget before it reaches a cap here.
/** raw values of one chart (all series or lists together), values of one violin chart, bins, lists or names of one
 *  boxplot / violin / waterfall, series of a histogram, marks, stages of a funnel, steps, entries of a tree, levels of a
 *  tree, days of a calendar, characters of a tree entry's name */
export const LIMITS = {
  chartKindsValues: 5000, chartKindsViolinValues: 1500, chartKindsBins: 400, chartKindsCategories: 40, chartKindsSeries: 4,
  chartKindsMarks: 8, chartKindsStages: 20, chartKindsSteps: 20, chartKindsTreeNodes: 2000, chartKindsTreeDepth: 8,
  chartKindsDays: 740, chartKindsLabel: 60,
};
/** for text nobody reviewed (chat): about half the data, shallower trees, a year and a few days of calendar */
export const UNTRUSTED_LIMITS: typeof LIMITS = {
  ...LIMITS, chartKindsValues: 2500, chartKindsViolinValues: 750, chartKindsBins: 200, chartKindsCategories: 20, chartKindsSteps: 10,
  chartKindsTreeNodes: 1000, chartKindsTreeDepth: 6, chartKindsDays: 400,
};
