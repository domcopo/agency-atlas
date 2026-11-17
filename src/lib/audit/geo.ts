// State outlines for the audit's region map, plus the math to place towns on them.
// Outlines are simplified public boundaries (a few dozen points), good for a slide,
// not for surveying. Add a state by adding its outline here. Pure: no network.

export type LngLat = [number, number];

export interface StateShape {
  code: string;
  name: string;
  /** Outline, [longitude, latitude], clockwise from the north-west corner. */
  outline: LngLat[];
  /** Big cities drawn faintly for orientation (not markets). */
  landmarks: { name: string; at: LngLat }[];
}

export const STATES: Record<string, StateShape> = {
  OH: {
    code: "OH",
    name: "Ohio",
    outline: [
      [-84.806, 41.696], // Indiana / Michigan corner
      [-83.454, 41.732], // Michigan line meets Lake Erie (Toledo)
      [-83.30, 41.69],
      [-83.07, 41.59],
      [-82.94, 41.51], // Port Clinton
      [-82.71, 41.45], // Sandusky
      [-82.55, 41.39],
      [-82.18, 41.47], // Lorain
      [-81.97, 41.50],
      [-81.69, 41.50], // Cleveland
      [-81.45, 41.66],
      [-81.27, 41.76], // Fairport Harbor
      [-80.79, 41.90], // Ashtabula
      [-80.519, 41.977], // Pennsylvania line at the lake
      [-80.519, 40.638], // East Liverpool (Ohio River)
      [-80.61, 40.36], // Steubenville
      [-80.73, 40.07], // Wheeling
      [-80.87, 39.76],
      [-81.12, 39.47],
      [-81.45, 39.41], // Marietta
      [-81.56, 39.27],
      [-81.75, 39.18],
      [-81.81, 39.08],
      [-82.03, 39.03], // Pomeroy
      [-82.13, 38.84],
      [-82.20, 38.78], // Gallipolis
      [-82.31, 38.58],
      [-82.58, 38.42], // Huntington area
      [-82.68, 38.53], // Ironton
      [-82.86, 38.62],
      [-82.99, 38.73], // Portsmouth
      [-83.30, 38.62],
      [-83.61, 38.66], // Manchester
      [-83.84, 38.75], // Ripley
      [-84.06, 38.78],
      [-84.29, 38.99], // New Richmond
      [-84.51, 39.10], // Cincinnati
      [-84.82, 39.105], // Indiana line at the river
      [-84.81, 40.0],
      [-84.806, 41.696],
    ],
    landmarks: [
      { name: "Cleveland", at: [-81.69, 41.50] },
      { name: "Toledo", at: [-83.55, 41.65] },
      { name: "Columbus", at: [-82.999, 39.961] },
      { name: "Cincinnati", at: [-84.51, 39.10] },
      { name: "Dayton", at: [-84.19, 39.76] },
      { name: "Akron", at: [-81.52, 41.08] },
    ],
  },
};

export const STATE_CODES = Object.keys(STATES);

export interface Projection {
  width: number;
  height: number;
  project: (p: LngLat) => [number, number];
  /** Pixels per mile (for radius rings). */
  pxPerMile: number;
  /** true when the point is inside the outline. */
  contains: (p: LngLat) => boolean;
}

/**
 * Fits the state into a box (simple equirectangular projection, longitude shrunk by
 * cos(latitude) so the shape isn't stretched). Accurate enough for one state.
 */
export function fitState(state: StateShape, maxW: number, maxH: number, pad = 8): Projection {
  const lngs = state.outline.map((p) => p[0]);
  const lats = state.outline.map((p) => p[1]);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanX = (maxLng - minLng) * k;
  const spanY = maxLat - minLat;
  const scale = Math.min((maxW - 2 * pad) / spanX, (maxH - 2 * pad) / spanY);
  const width = spanX * scale + 2 * pad;
  const height = spanY * scale + 2 * pad;
  const project = ([lng, lat]: LngLat): [number, number] => [pad + (lng - minLng) * k * scale, pad + (maxLat - lat) * scale];
  return { width, height, project, pxPerMile: scale / 69, contains: (p) => insidePolygon(p, state.outline) };
}

export function outlinePath(state: StateShape, proj: Projection): string {
  return state.outline.map((p, i) => `${i ? "L" : "M"}${proj.project(p).map((v) => v.toFixed(1)).join(",")}`).join(" ") + " Z";
}

/** Ray-casting point-in-polygon. */
export function insidePolygon([x, y]: LngLat, poly: LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
