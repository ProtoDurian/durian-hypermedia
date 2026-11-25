import { LIMITS } from "./limits";
export interface QueryCaps { maxQueryChars: number; readerQueryChars: number; maxDepth: number; maxResults: number; regexChars: number; regexProgram: number; regexRepeat: number; jsonChars: number; steps: number; values: number; chars: number }
export const logCaps = (l: typeof LIMITS): QueryCaps => ({ maxQueryChars: l.logQueryChars, readerQueryChars: l.logReaderQueryChars, maxDepth: l.logQueryDepth, maxResults: l.logQueryResults, regexChars: l.logRegexChars, regexProgram: l.logRegexProgram, regexRepeat: l.logRegexRepeat, jsonChars: l.logQueryJsonChars, steps: l.logReaderSteps, values: l.logReaderValues, chars: l.logReaderChars });
/** Defaults serve direct callers; document parsers always supply their host's caps. */
export const DEFAULT_CAPS = logCaps(LIMITS);
