export const LIMITS = { traceSpans: 2000, traceLines: 6000, traceDepth: 80, traceName: 120, traceAttrs: 24, traceValue: 240, traceLogs: 500, traceServices: 40, traceText: 400, traceServiceLabel: 60, traceOpen: 99 };
export const UNTRUSTED_LIMITS: typeof LIMITS = { ...LIMITS };
