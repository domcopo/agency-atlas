// Google's US place names per state (cities, townships, counties), from DataForSEO's free
// locations file (2026-11-02), built by scripts/build-us-places.py, and a map position for
// most of them from the US Census Bureau's 2024 Gazetteer (scripts/build-us-place-coords.py).
// Public names and positions only.
// Imported by server code only, so the ~300 KB list never goes to the browser whole;
// the builder asks for one state's names at a time (getStatePlaces in actions.ts).

import { US_STATES } from "./geo";
import { milesBetween, NEARBY_MILES, placeBook, placeKey, placeLabel, placeState, splitPlace, joinStateTokens, type NearbyTown, type PlaceBook, type PlaceCheck } from "./places";
export type { NearbyTown, PlaceCheck } from "./places";
import coordsData from "./us-place-coords.json";
import popData from "./us-county-pop.json";
import data from "./us-places.json";

type StatePlaces = { c: string[]; k: string[] };
const DATA = data as Record<string, StatePlaces>;
const books = new Map<string, PlaceBook>();

/** Every place name in a state (cities and townships first, then counties). */
export function statePlaces(state: string): string[] {
  const s = DATA[state.toUpperCase()];
  return s ? [...s.c, ...s.k] : [];
}

/** Lookup for one state, or null when there's no list for it (then names aren't checked). */
export function placeBookFor(state: string): PlaceBook | null {
  const code = state.toUpperCase();
  if (!US_STATES[code] || !DATA[code]) return null;
  let b = books.get(code);
  if (!b) {
    b = placeBook(statePlaces(code));
    books.set(code, b);
  }
  return b;
}

/** The places in a saved audit that Google doesn't know (shown as "fix these" on the audit page). */
export function unknownPlaces(state: string, names: string[]): { name: string; suggest: string[] }[] {
  const book = placeBookFor(state);
  if (!book) return [];
  return names.filter((n) => n && !book.canonical(n)).map((name) => ({ name, suggest: book.suggest(name) }));
}

const COORDS = coordsData as unknown as Record<string, Record<string, [number, number]>>;

/** A place's map position, or null (about 6% of Google's places have none). */
export function placePosition(state: string, name: string): [number, number] | null {
  return COORDS[state.toUpperCase()]?.[name] ?? null;
}


/**
 * Towns within NEARBY_MILES of the home town, closest first, across state lines. Counties are
 * left out; a township is left out when the town of the same name is already listed.
 */
export function nearbyTowns(state: string, home: string, limit = 24, radius = NEARBY_MILES): NearbyTown[] {
  const at = placePosition(state, home);
  if (!at) return [];
  const out: (NearbyTown & { name: string })[] = [];
  for (const [st, places] of Object.entries(COORDS)) {
    for (const [name, pos] of Object.entries(places)) {
      if (/ County$/.test(name) || (st === state && name === home)) continue;
      if (Math.abs(pos[0] - at[0]) > radius / 69 + 0.05) continue; // quick skip: too far north/south (~69 miles a degree)
      const miles = milesBetween(at, pos);
      if (miles <= radius) out.push({ name, label: placeLabel(name, st, state), miles: Math.round(miles) });
    }
  }
  const names = new Set(out.map((o) => o.label));
  return out
    .filter((o) => !(/ Township$/.test(o.name) && names.has(o.label.replace(" Township", ""))))
    .sort((a, b) => a.miles - b.miles || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map(({ label, miles }) => ({ label, miles }));
}


/** Towns named exactly `name` in any state within NEARBY_MILES of `at`, closest first ("Sharon, PA"). */
function sameNameNearby(name: string, at: [number, number], auditState: string): string[] {
  const k = placeKey(name);
  const hits: { label: string; miles: number }[] = [];
  for (const [st, places] of Object.entries(COORDS)) {
    for (const [n, pos] of Object.entries(places)) {
      if (placeKey(n) !== k) continue;
      const miles = milesBetween(at, pos);
      if (miles <= NEARBY_MILES) hits.push({ label: placeLabel(n, st, auditState), miles });
    }
  }
  return hits.sort((a, b) => a.miles - b.miles).map((h) => h.label);
}

/**
 * What the builder shows under "Other cities": each entry as Google knows it, how far it is
 * from the home town, and "did you mean" (a same-name town nearby in another state counts).
 */
export function checkPlaces(state: string, home: string, typed: string[]): { home: string | null; checks: PlaceCheck[]; nearby: NearbyTown[] } {
  const own = placeBookFor(state);
  if (!own) return { home: null, checks: [], nearby: [] };
  const homeName = own.canonical(splitPlace(home, state)[0] ?? home) ?? null;
  const homeAt = homeName ? placePosition(state, homeName) : null;
  const nearby = homeName ? nearbyTowns(state, homeName) : [];
  const entries = [...new Set(joinStateTokens(typed).flatMap((t) => splitPlace(t, state)))].slice(0, 30);
  const checks = entries.map((entry): PlaceCheck => {
    const where = placeState(entry, state);
    const book = where.state === state ? own : placeBookFor(where.state);
    const exact = book?.canonical(where.name) ?? null;
    if (exact) {
      const pos = placePosition(where.state, exact);
      return { typed: entry, label: placeLabel(exact, where.state, state), miles: homeAt && pos ? Math.round(milesBetween(homeAt, pos)) : null, suggest: [] };
    }
    // Not in this state: a town of exactly that name within 30 miles, across the line ("Sharon" → "Sharon, PA")?
    const across = homeAt ? sameNameNearby(where.name, homeAt, state) : [];
    return { typed: entry, label: null, miles: null, suggest: [...across, ...(book?.suggest(where.name) ?? []).map((n) => placeLabel(n, where.state, state))].slice(0, 3) };
  });
  return { home: homeName, checks, nearby };
}


// Town names that are also everyday words in business names ("Steel Valley Homes"): never
// treated as a town in a web address.
const NOT_A_TOWN_IN_ADDRESSES = new Set(["valley", "hometown", "homestead", "homeland", "liberty", "freedom", "harmony", "fairview", "summit", "pleasant", "victory", "success", "commerce", "property", "capital", "premier", "eureka", "paradise", "friendship", "progress", "lakeside", "riverside", "hillside", "parkside", "westside", "eastside", "southside", "northside", "midway", "central", "national", "united", "american", "superior", "reliance", "security", "advance", "triumph", "accord", "concord", "economy", "fortune", "golden", "monroe", "lincoln", "franklin", "washington", "jefferson", "madison", "jackson", "clinton", "hamilton", "marion", "warren"]);

let placeIndex: Map<string, [number, number][]> | null = null;

/** Every US place name (6+ letters, counties and "Township" dropped) → its map positions. */
function placesByKey(): Map<string, [number, number][]> {
  if (placeIndex) return placeIndex;
  placeIndex = new Map();
  for (const places of Object.values(COORDS))
    for (const [name, pos] of Object.entries(places)) {
      if (/ County$/.test(name)) continue;
      const key = name.replace(/ Township$/, "").toLowerCase().replace(/[^a-z]/g, "");
      if (key.length < 6 || NOT_A_TOWN_IN_ADDRESSES.has(key)) continue;
      placeIndex.set(key, [...(placeIndex.get(key) ?? []), pos]);
    }
  return placeIndex;
}

/**
 * The far-away town a web address (or business name) is named after, or null: "homebuyersmetairie.com" →
 * "metairie" for a Youngstown audit (every Metairie is beyond the audit's radius), while
 * "youngstownhomebuyer.com" or "warrencashbuyers.com" → null. Only used for sites seen in plain
 * results; a business with a Maps listing or 3-pack spot nearby is never dropped by its name.
 */
export function farTownInDomain(domain: string, state: string, home: string, radiusMiles: number): string | null {
  const at = placePosition(state, home);
  if (!at) return null;
  // A web address loses its ending (".com"); a business name is used whole.
  const parts = domain.toLowerCase().split(".");
  const text = (/\s/.test(domain) || parts.length < 2 ? parts : parts.slice(0, -1)).join("").replace(/[^a-z]/g, "");
  let found: string | null = null;
  for (const [key, spots] of placesByKey()) {
    if (!text.includes(key)) continue;
    // A name with a spot inside the area is local ("warren" OH), whatever else shares it.
    if (spots.some((p) => milesBetween(at, p) <= radiusMiles)) return null;
    if (!found || key.length > found.length) found = key;
  }
  return found;
}

const POP = popData as unknown as Record<string, Record<string, number>>;

export interface AreaShare {
  /** People living in the counties whose centre is within the radius (Census, July 2024). */
  population: number;
  /** That population ÷ the US population (0–1). */
  share: number;
  counties: number;
  miles: number;
}

/**
 * The audit area's share of the US population, for turning US-wide searches that name no place
 * ("we buy houses", "… near me") into an approximate local count: the counties whose centre is
 * within `radius` miles of the home town (the home town's nearest county at least). Census
 * Vintage 2024 estimates (scripts/build-us-county-pop.py). null when the home town or the
 * county data is missing (then only Google's own home-town figures are used).
 */
export function areaShare(state: string, home: string, radius: number): AreaShare | null {
  const at = placePosition(state, home);
  const total = POP.US?.total;
  if (!at || !total) return null;
  let population = 0;
  let counties = 0;
  let nearest: { pop: number; miles: number } | null = null;
  for (const [st, byCounty] of Object.entries(POP)) {
    if (st === "US") continue;
    for (const [name, pop] of Object.entries(byCounty)) {
      const pos = COORDS[st]?.[name];
      if (!pos || Math.abs(pos[0] - at[0]) > radius / 69 + 1) continue;
      const miles = milesBetween(at, pos);
      if (miles <= radius) {
        population += pop;
        counties++;
      }
      if (!nearest || miles < nearest.miles) nearest = { pop, miles };
    }
  }
  if (!counties && nearest) {
    population = nearest.pop;
    counties = 1;
  }
  if (!population) return null;
  return { population, share: Math.round((population / total) * 1e6) / 1e6, counties, miles: radius };
}
