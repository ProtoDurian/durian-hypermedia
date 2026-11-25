/** Places, shapes, points and value overlays in one map; geometry is bundled, never fetched from author text. */
export const LIMITS = { mapPlaces: 100, mapShapes: 50, mapPoints: 2000, mapFills: 300, mapArcs: 200, mapGeoPoints: 60000 };
export const UNTRUSTED_LIMITS: typeof LIMITS = { ...LIMITS, mapPlaces: 50, mapShapes: 25, mapPoints: 1000, mapFills: 150, mapArcs: 100 };
