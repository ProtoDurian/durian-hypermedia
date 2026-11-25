// A stand-in for node:fs. The package never reads or lists files: parse, llmView and check work on the text they are given.
// Code references to repo files (not @file) therefore render as "no code" with the reason; a made-up @file works fully.
const no = (what: string) => { throw new Error(`durian-markdown does not read files (${what}); pass the text instead`); };
export function existsSync(_p: string): boolean { return false; }
export function readFileSync(p: string, _enc?: string): string { return no(`readFileSync ${String(p).split("/").pop()}`); }
export function readdirSync(_p: string, _o?: unknown): any[] { return []; }
export function statSync(p: string): { isFile(): boolean; isDirectory(): boolean } { return no(`statSync ${String(p).split("/").pop()}`); }
