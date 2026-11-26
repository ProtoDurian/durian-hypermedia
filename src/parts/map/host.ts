import type { Camera, LL } from "./model";
import type { UrlPolicy } from "../../safety";

/** Per-document policy and status for a base layer; supplied by the map part. */
export interface BasemapContext { urlPolicy?: UrlPolicy; onStatus?: (reason: string | null) => void }

/** A base layer draws only the map beneath the part's own pins, regions, routes and controls. */
export interface Basemap { setView(view: Camera): void; resize(): void; destroy(): void }
/** Host capabilities, never read from Markdown. The optional provider entry constructs these adapters. */
export interface MapHost {
  provider?: string;
  attribution?: string;
  openBasemap?: (element: HTMLElement, first: Camera, context?: BasemapContext) => Promise<Basemap>;
  route?: (way: string, stops: LL[]) => Promise<LL[] | null>;
}
