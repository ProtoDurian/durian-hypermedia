// A text turned about its anchor: a chart kind's word along a ring's radius (the sunburst's names) carries the class
// `kd-rot<deg>` (clockwise degrees; `kd-rotn<deg>` for a negative turn). Both painters (render/svg.tsx, charts/paint.tsx) read it here.
/** the turn in degrees (clockwise) a class asks for; 0 when it asks for none */
export const rotOf = (cls?: string): number => { const m = /(?:^|\s)kd-rot(n?)(\d+(?:\.\d+)?)(?:\s|$)/.exec(cls ?? ""); return m ? (m[1] ? -1 : 1) * +m[2] : 0; };
/** the class that asks for a turn of `deg` degrees */
export const rotCls = (deg: number): string => `kd-rot${deg < 0 ? "n" : ""}${Math.abs(Math.round(deg * 10) / 10)}`;
