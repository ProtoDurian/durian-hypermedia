export const LIMITS = { stacktraceLines: 2000 };
export const UNTRUSTED_LIMITS: typeof LIMITS = { ...LIMITS, stacktraceLines: 1000 };
