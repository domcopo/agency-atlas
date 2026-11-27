// LeadSnap heat maps for "Run audit": the grid Atlas asks for and how LeadSnap's (untrusted)
// answers become a "maps" heat map in the results block. Pure: no network (the calls are in
// src/lib/audit/sources/leadsnap.ts). Nothing is guessed: a point LeadSnap didn't rank stays
// "not in the top 20", a heat map that isn't finished is never drawn.

export const LEADSNAP_RULES = {
  /** 7×7 = 49 points, 2 miles apart: a 12-mile square around the business. */
  gridSize: 7,
  spacingMiles: 2,
  /** A heat map of the same listing and search made this recently is reused (no new credits). */
  reuseDays: 7,
  /** How long a run waits for LeadSnap to finish (from the run's start), and how often it looks. */
  waitUntilMs: 150_000,
  pollEveryMs: 10_000,
  /** Businesses shown under the grid as the ones most often in the top 3. */
  leaders: 3,
} as const;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
/** LeadSnap sends some numbers as text ("32.62566790", "655"). */
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

const MILES_PER_DEGREE_LAT = 69.0;
const degLng = (lat: number) => MILES_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180);
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** The grid's points, north→south rows, each west→east, centred on the business. */
export function planGrid(lat: number, lng: number, size: number = LEADSNAP_RULES.gridSize, spacingMiles: number = LEADSNAP_RULES.spacingMiles): { lat: number; lng: number }[] {
  const half = (size - 1) / 2;
  const dLat = spacingMiles / MILES_PER_DEGREE_LAT;
  const dLng = spacingMiles / degLng(lat);
  const out: { lat: number; lng: number }[] = [];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) out.push({ lat: round6(lat + (half - r) * dLat), lng: round6(lng + (c - half) * dLng) });
  return out;
}

/** A heat map record, wherever LeadSnap put it ({...}, [{...}] or {data: ...}). */
function record(body: unknown): Obj | null {
  const o = obj(body);
  if (num(o.id)) return o;
  const d = o.data;
  if (num(obj(d).id)) return obj(d);
  for (const x of [...arr(body), ...arr(d)]) if (num(obj(x).id)) return obj(x);
  return null;
}

/** The id of a heat map LeadSnap just queued (or null). */
export function heatmapId(body: unknown): number | null {
  const id = num(record(body)?.id);
  return id && Number.isInteger(id) && id > 0 ? id : null;
}

/** A reusable heat map from the "recent" list: same size, not failed, made in the last 7 days. */
export function reusableHeatmap(body: unknown, now: Date): number | null {
  const rows = arr(obj(body).data).map(obj);
  for (const r of rows) {
    const id = num(r.id);
    const status = String(r.status ?? "").toLowerCase();
    const made = typeof r.created_at === "string" ? Date.parse(r.created_at) : NaN;
    if (!id || status === "failed" || num(r.grid_size) !== LEADSNAP_RULES.gridSize) continue;
    if (!Number.isFinite(made) || now.getTime() - made > LEADSNAP_RULES.reuseDays * 86_400_000) continue;
    return id;
  }
  return null;
}

export interface HeatRead {
  status: "waiting" | "ready" | "failed";
  size: number;
  spacingMiles: number;
  /** Rows north→south, each west→east: Maps rank 1–20, null = not in the top 20 (or not checked). */
  ranks: (number | null)[][];
  placeId: string | null;
}

const toMiles = (v: number, unit: string) => (unit === "km" ? v / 1.609344 : unit === "m" ? v / 1609.344 : v);

/** One heat map → its grid. Each point is placed by its position around the centre. */
export function readHeatmap(body: unknown): HeatRead | null {
  const r = record(body);
  if (!r) return null;
  const code = num(r.status_code);
  const s = String(r.status ?? "").toLowerCase();
  const status: HeatRead["status"] = s === "failed" || code === 4 ? "failed" : s === "completed" || s === "incomplete" || code === 2 || code === 3 ? "ready" : "waiting";
  const size = num(r.grid_size);
  const lat0 = num(r.grid_center_lat);
  const lng0 = num(r.grid_center_lng);
  const dist = num(r.grid_point_distance_row) ?? num(r.grid_point_distance);
  const unit = String(r.grid_distance_measure ?? "m").toLowerCase();
  if (!size || !Number.isInteger(size) || size < 3 || size > 9 || lat0 === null || lng0 === null || !dist || dist <= 0) return null;
  const spacingMiles = Math.round(toMiles(dist, unit) * 100) / 100;
  if (!(spacingMiles > 0 && spacingMiles <= 20)) return null;
  const ranks: (number | null)[][] = Array.from({ length: size }, () => Array<number | null>(size).fill(null));
  const half = (size - 1) / 2;
  const dLat = spacingMiles / MILES_PER_DEGREE_LAT;
  const dLng = spacingMiles / degLng(lat0);
  for (const p of arr(r.points).map(obj)) {
    const lat = num(p.lat);
    const lng = num(p.lng);
    if (lat === null || lng === null) continue;
    const row = half - (lat - lat0) / dLat;
    const col = half + (lng - lng0) / dLng;
    const ri = Math.round(row);
    const ci = Math.round(col);
    // Off the grid, or far from any grid spot: not ours to draw.
    if (ri < 0 || ri >= size || ci < 0 || ci >= size || Math.abs(row - ri) > 0.25 || Math.abs(col - ci) > 0.25) continue;
    const rank = num(p.rank);
    ranks[ri]![ci] = rank !== null && Number.isInteger(rank) && rank >= 1 && rank <= 20 ? rank : null;
  }
  const placeId = str(r.business_place_id, 200) ?? str(obj(r.place).google_place_id, 200);
  return { status, size, spacingMiles, ranks, placeId };
}

export interface HeatLeader {
  name: string;
  /** Points (of the grid) where this business is in the top 3. */
  top3: number;
  points: number;
}

/** The businesses most often in the top 3 across the grid (not the audited business). */
export function readLeaders(body: unknown, ownPlaceId: string | null): HeatLeader[] {
  const rows = [...arr(body), ...arr(obj(body).data)].map(obj);
  const out: HeatLeader[] = [];
  for (const r of rows) {
    const place = obj(r.place);
    if (ownPlaceId && place.google_place_id === ownPlaceId) continue;
    // Names only: never an address, phone or website (LeadSnap sends them; they stay here).
    const name = str(place.name, 60)?.replace(/[^\p{L}\p{N} &'.,()-]/gu, "").trim();
    const top3 = num(r.top_3_points);
    const points = num(r.total_points);
    if (!name || top3 === null || !points || top3 < 0 || top3 > points || !Number.isInteger(top3) || !Number.isInteger(points)) continue;
    out.push({ name, top3, points });
  }
  return out
    .filter((l) => l.top3 > 0)
    .sort((a, b) => b.top3 - a.top3 || a.name.localeCompare(b.name))
    .slice(0, LEADSNAP_RULES.leaders);
}

/** The results-block heat map (checked again by results.ts before it is saved or drawn). */
export function heatmapBlock(read: HeatRead, term: string, retrieved: string, leaders: HeatLeader[]): Obj {
  return { term, kind: "maps", source: "leadsnap", retrieved, spacingMiles: read.spacingMiles, ranks: read.ranks, ...(leaders.length ? { leaders } : {}) };
}

/** Puts a LeadSnap heat map first in a results block (replacing an older LeadSnap one). */
export function withHeatmap(block: Obj, heat: Obj): Obj {
  const rest = arr(block.heatmaps).filter((h) => obj(h).source !== "leadsnap");
  const sources = [...new Set([...arr(block.sources).filter((s): s is string => typeof s === "string"), "leadsnap"])];
  const clean: Obj = { ...block, sources, heatmaps: [heat, ...rest] };
  delete clean.leadsnapPending;
  return clean;
}

/** A heat map a run left unfinished (saved in the results block), or null. */
export function heatPendingOf(block: unknown): { id: number; term: string } | null {
  const p = obj(obj(block).leadsnapPending);
  const id = num(p.id);
  const term = str(p.term, 80);
  return id && Number.isInteger(id) && id > 0 && term ? { id, term } : null;
}
