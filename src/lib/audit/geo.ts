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
  CA: {
    code: "CA",
    name: "California",
    outline: [
      [-124.21, 41.998], // Oregon line at the coast
      [-120.0, 41.998], // Oregon / Nevada corner
      [-120.0, 39.0], // Lake Tahoe
      [-114.63, 35.0], // Colorado River near Needles
      [-114.57, 34.8],
      [-114.13, 34.3],
      [-114.43, 34.08],
      [-114.53, 33.93],
      [-114.5, 33.62],
      [-114.72, 33.41],
      [-114.71, 33.09],
      [-114.72, 32.72], // Yuma
      [-117.12, 32.53], // Mexico line at the coast
      [-117.25, 32.7], // San Diego
      [-117.28, 33.0],
      [-117.4, 33.2],
      [-117.88, 33.6],
      [-118.15, 33.75], // Long Beach
      [-118.42, 33.75],
      [-118.4, 33.9],
      [-118.52, 34.03], // Santa Monica
      [-118.8, 34.0],
      [-119.2, 34.15],
      [-119.7, 34.4], // Santa Barbara
      [-120.47, 34.45], // Point Conception
      [-120.62, 34.75],
      [-120.64, 35.15],
      [-120.9, 35.45],
      [-121.3, 35.7],
      [-121.9, 36.3],
      [-121.95, 36.6], // Monterey
      [-121.8, 36.85],
      [-122.05, 36.95], // Santa Cruz
      [-122.4, 37.2],
      [-122.51, 37.78], // San Francisco
      [-123.0, 38.0],
      [-123.75, 38.95],
      [-123.83, 39.8],
      [-124.4, 40.44], // Cape Mendocino
      [-124.1, 40.9],
      [-124.21, 41.75],
      [-124.21, 41.998],
    ],
    landmarks: [
      { name: "San Francisco", at: [-122.42, 37.77] },
      { name: "Los Angeles", at: [-118.24, 34.05] },
      { name: "San Diego", at: [-117.16, 32.72] },
      { name: "Fresno", at: [-119.79, 36.74] },
      { name: "Sacramento", at: [-121.49, 38.58] },
      { name: "Stockton", at: [-121.29, 37.96] },
      { name: "Reno, NV", at: [-119.81, 39.53] },
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

export interface Bounds {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
}

export function boundsOf(points: LngLat[]): Bounds {
  const lngs = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  return { minLng: Math.min(...lngs), maxLng: Math.max(...lngs), minLat: Math.min(...lats), maxLat: Math.max(...lats) };
}

/** Grows bounds by a distance in miles on every side (1° latitude ≈ 69 miles). */
export function padBounds(b: Bounds, miles: number): Bounds {
  const dLat = miles / 69;
  const dLng = miles / (69 * Math.cos((((b.minLat + b.maxLat) / 2) * Math.PI) / 180));
  return { minLng: b.minLng - dLng, maxLng: b.maxLng + dLng, minLat: b.minLat - dLat, maxLat: b.maxLat + dLat };
}

/**
 * Fits an area into a box (simple equirectangular projection, longitude shrunk by
 * cos(latitude) so shapes aren't stretched). Accurate enough for one state or metro.
 */
export function fitBounds(b: Bounds, maxW: number, maxH: number, pad = 8): Omit<Projection, "contains"> {
  const k = Math.cos((((b.minLat + b.maxLat) / 2) * Math.PI) / 180);
  const spanX = (b.maxLng - b.minLng) * k;
  const spanY = b.maxLat - b.minLat;
  const scale = Math.min((maxW - 2 * pad) / spanX, (maxH - 2 * pad) / spanY);
  const width = spanX * scale + 2 * pad;
  const height = spanY * scale + 2 * pad;
  const project = ([lng, lat]: LngLat): [number, number] => [pad + (lng - b.minLng) * k * scale, pad + (b.maxLat - lat) * scale];
  return { width, height, project, pxPerMile: scale / 69 };
}

/** Fits the whole state into a box. */
export function fitState(state: StateShape, maxW: number, maxH: number, pad = 8): Projection {
  return { ...fitBounds(boundsOf(state.outline), maxW, maxH, pad), contains: (p) => insidePolygon(p, state.outline) };
}

export function outlinePath(state: StateShape, proj: Pick<Projection, "project">): string {
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
