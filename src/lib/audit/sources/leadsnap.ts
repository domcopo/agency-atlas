// LeadSnap heat maps for "Run audit" (approved by the owner 2026-11-27).
//
// This is the ONLY file that talks to LeadSnap. It may do exactly four things, all about
// heat maps (see ALLOWED): list recent heat maps (to reuse one instead of spending credits
// twice), create one, read one, and read its competitors. Everything else in LeadSnap's API
// (Google profile posts, review replies, listing edits, contacts, calls, companies) is refused
// here, whatever the token would allow. Creating a heat map spends LeadSnap credits and adds a
// record to the LeadSnap account; it changes nothing on Google or anywhere else.
//
// The token (LEADSNAP_API_KEY) lives in the server's environment (Vercel, "Sensitive"), is
// only read here, and is never logged, returned or sent to the browser. Answers are untrusted
// data: src/lib/audit/leadsnap.ts and the results checker read them field by field. Only a
// prospect's public Google listing ID, one search phrase and map points are ever sent.

const BASE = "https://app.leadsnap.com";
const TIMEOUT_MS = 20_000;
// A 13×13 heat map with its places runs well under 1 MB.
const MAX_BYTES = 3_000_000;

/** The only requests this app may make (method + exact address shape). */
const ALLOWED: readonly (readonly ["GET" | "POST", RegExp])[] = [
  ["GET", /^\/public\/api\/v1\/heatmaps$/],
  ["POST", /^\/public\/api\/v1\/heatmaps$/],
  ["GET", /^\/public\/api\/v1\/heatmaps\/\d{1,12}$/],
  ["GET", /^\/public\/api\/v1\/heatmaps\/\d{1,12}\/competitors$/],
];

export class LeadSnapError extends Error {
  /** retryable: trying again later may work (their server was busy or slow). */
  constructor(message: string, readonly retryable = false) {
    super(message);
  }
}

function token(): string | null {
  const t = process.env.LEADSNAP_API_KEY?.trim();
  if (!t || t.length < 10 || t.length > 2000 || /\s/.test(t)) return null;
  return t;
}

/** true when the LeadSnap token is set on the server (never says what it is). */
export function isLeadSnapConfigured(): boolean {
  return token() !== null;
}

async function call(method: "GET" | "POST", path: string, query: Record<string, string> | null, body: Record<string, unknown> | null): Promise<unknown> {
  if (!ALLOWED.some(([m, re]) => m === method && re.test(path))) throw new LeadSnapError("Blocked: that LeadSnap request isn't on the allowed list.");
  const t = token();
  if (!t) throw new LeadSnapError("LeadSnap isn't connected yet (the token isn't set on the server).");
  const url = new URL(path, BASE);
  if (url.origin !== BASE) throw new LeadSnapError("Blocked: unexpected address.");
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${t}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new LeadSnapError("Couldn't reach LeadSnap (no answer in 20 seconds).", true);
  }
  const text = await res.text();
  if (!res.ok) {
    const credits = /credit/i.test(text.slice(0, 2000));
    throw new LeadSnapError(
      res.status === 401
        ? "LeadSnap refused the token. Check LEADSNAP_API_KEY in Vercel's settings."
        : res.status === 403
          ? "LeadSnap says the token isn't allowed to do that."
          : credits
            ? "LeadSnap says there aren't enough heat map credits."
            : res.status === 429
              ? "LeadSnap says too many requests. Try again in a minute."
              : `LeadSnap returned an error (${res.status}).`,
      res.status >= 500 || res.status === 429,
    );
  }
  if (text.length > MAX_BYTES) throw new LeadSnapError("LeadSnap's answer was unexpectedly large; skipped.");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new LeadSnapError("LeadSnap's answer wasn't readable.");
  }
}

const PLACE_ID = /^[A-Za-z0-9_-]{10,200}$/;
const KEYWORD = /^[a-z0-9][a-z0-9' -]{1,79}$/;
const okId = (id: number) => Number.isInteger(id) && id > 0 && id < 1e12;

/** Heat maps made in the last 7 days for this listing and search (to reuse, not pay twice). */
export function listRecentHeatmaps(placeId: string, keyword: string): Promise<unknown> {
  if (!PLACE_ID.test(placeId) || !KEYWORD.test(keyword)) throw new LeadSnapError("Blocked: unexpected listing or search.");
  return call("GET", "/public/api/v1/heatmaps", { "filter[google_place_id]": placeId, "filter[keyword]": keyword, "filter[search_type]": "google_maps", "filter[created_at][date]": "last_7_days", sort: "-created_at", per_page: "5" }, null);
}

export interface HeatmapRequest {
  placeId: string;
  keyword: string;
  /** Grid centre. */
  lat: number;
  lng: number;
  /** Points per side (7 = 49 points) and miles between points. */
  size: number;
  spacingMiles: number;
  points: { lat: number; lng: number }[];
}

/** Starts ONE Google Maps heat map (spends LeadSnap credits). LeadSnap finishes it in a few minutes. */
export function createHeatmap(r: HeatmapRequest): Promise<unknown> {
  const okCoord = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  if (!PLACE_ID.test(r.placeId) || !KEYWORD.test(r.keyword)) throw new LeadSnapError("Blocked: unexpected listing or search.");
  if (!Number.isInteger(r.size) || r.size < 3 || r.size > 9 || r.points.length !== r.size * r.size) throw new LeadSnapError("Blocked: unexpected grid size.");
  if (!(r.spacingMiles > 0 && r.spacingMiles <= 10) || !okCoord(r.lat, r.lng) || !r.points.every((p) => okCoord(p.lat, p.lng))) throw new LeadSnapError("Blocked: unexpected grid.");
  return call(
    "POST",
    "/public/api/v1/heatmaps",
    null,
    {
      keyword: [r.keyword],
      search_type: ["google_maps"],
      place_id: r.placeId,
      grid_size: r.size,
      grid_radius: r.spacingMiles,
      distanceType: "mi",
      lat: r.lat,
      lng: r.lng,
      points: r.points.map((p) => ({ lat: p.lat, lng: p.lng })),
    },
  );
}

export function getHeatmap(id: number): Promise<unknown> {
  if (!okId(id)) throw new LeadSnapError("Blocked: unexpected heat map.");
  return call("GET", `/public/api/v1/heatmaps/${id}`, null, null);
}

export function getHeatmapCompetitors(id: number): Promise<unknown> {
  if (!okId(id)) throw new LeadSnapError("Blocked: unexpected heat map.");
  return call("GET", `/public/api/v1/heatmaps/${id}/competitors`, null, null);
}
