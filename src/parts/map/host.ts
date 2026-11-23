import type { Camera, LL } from "./model";

/** A base layer draws only the map beneath the part's own pins, regions, routes and controls. */
export interface Basemap { setView(view: Camera): void; resize(): void; destroy(): void }
/** Host capabilities, never read from Markdown. The optional provider entry constructs these adapters. */
export interface MapHost {
  provider?: string;
  attribution?: string;
  openBasemap?: (element: HTMLElement, first: Camera) => Promise<Basemap>;
  route?: (way: string, stops: LL[]) => Promise<LL[] | null>;
}
