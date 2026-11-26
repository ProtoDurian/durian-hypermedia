// speed: how fast a stepped part plays (owner feedback 17). One choice for the whole page: the reader sets it on any
// player and every player on the page follows (an event), and it is kept for the tab (session storage, when the browser
// allows it). Play's pause between steps and the motion inside a step are divided by it.
import { useEffect, useState } from "react";

export const SPEEDS = [0.5, 1, 1.5, 2] as const;
const KEY = "dh-step-speed", EVENT = "dh-step-speed";

/** the speed a page starts with: the tab's last choice, else 1 */
export function savedSpeed(): number {
  try {
    const v = Number(sessionStorage.getItem(KEY));
    return (SPEEDS as readonly number[]).includes(v) ? v : 1;
  } catch { return 1; }
}
/** the next speed in the cycle 0.5, 1, 1.5, 2, 0.5 ... */
export const nextSpeed = (s: number) => SPEEDS[(SPEEDS.indexOf(s as (typeof SPEEDS)[number]) + 1) % SPEEDS.length];
/** how a speed reads on its button: 0.5×, 1×, 1.5×, 2× */
export const speedText = (s: number) => `${s}×`;

/** The page's step speed and a function that moves it to the next one (every player on the page follows). */
export function useSpeed(): [number, () => void] {
  const [s, setS] = useState(1); // the server draws 1×; the browser reads the tab's choice after hydrating
  useEffect(() => {
    setS(savedSpeed());
    const on = (e: Event) => setS((e as CustomEvent<number>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  const cycle = () => {
    const v = nextSpeed(s);
    try { sessionStorage.setItem(KEY, String(v)); } catch { /* private mode: this page only */ }
    window.dispatchEvent(new CustomEvent(EVENT, { detail: v }));
  };
  return [s, cycle];
}
