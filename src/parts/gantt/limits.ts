// The gantt part's caps (format version 11). Every key starts with the part's name; parse() reads them from the
// Limits it is given, so a host can lower (or raise) them like any other cap.
/** tasks, @step lines, sections, `after` arrows and the days the chart may span (a typo in a year must not draw
 *  thousands of years) */
export const LIMITS = { ganttTasks: 200, ganttSteps: 30, ganttSections: 30, ganttDeps: 600, ganttSpanDays: 3700 };
/** for text nobody reviewed (chat): half the tasks and arrows, fewer steps, five years of days */
export const UNTRUSTED_LIMITS: typeof LIMITS = { ...LIMITS, ganttTasks: 100, ganttSteps: 15, ganttSections: 15, ganttDeps: 300, ganttSpanDays: 1850 };
