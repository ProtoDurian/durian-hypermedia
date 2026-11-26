// The stage measures words at the phone's sizes or the stage's own through a module flag (core/stage-core.ts setPhoneFont).
// The renderer never leaves that flag changed: every measure here says which sizes it wants and puts the flag back.
import { FONT, fontSize, measure, setPhoneFont, type Font } from "../../core/stage-core";

/** whether the flag is set now (the phone's title size differs from the stage's) */
export const phoneNow = (): boolean => fontSize("title") !== FONT.title.size;
/** run `f` with the phone's sizes on or off, and put the flag back after */
export function atSizes<T>(phone: boolean, f: () => T): T {
  const was = phoneNow(); if (was === phone) return f();
  setPhoneFont(phone);
  try { return f(); } finally { setPhoneFont(was); }
}
/** `measure` at the phone's sizes or the stage's own */
export const measureAt = (s: string, f: Font, phone: boolean): number => atSizes(phone, () => measure(s, f));
