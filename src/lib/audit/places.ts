// Place names for audits: how a rep's typing becomes names Google and DataForSEO know.
// Pure: no database, no network. Rules:
// - one place per entry: "Westminster & Thornton", "Arvada / Golden", "Warren and Niles"
//   become separate places;
// - counties keep "County": "Trumbull and Columbiana County" → Trumbull County, Columbiana
//   County ("Counties" works too);
// - a trailing state ("Warren, OH", "Warren Ohio") is dropped (the audit's state is used);
// - all-lowercase or ALL-CAPS typing is put in Title Case; anything else is kept as typed.

import { stateName, US_STATES } from "./geo";

const SPLIT = /\s*(?:&|\+|\/|\band\b)\s*/i;

function titleCase(s: string): string {
  if (s !== s.toLowerCase() && s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase()).replace(/\bMc([a-z])/g, (_, c: string) => `Mc${c.toUpperCase()}`);
}

/** Drops a trailing ", OH" / " Ohio" for this audit's state. */
function dropState(s: string, state: string): string {
  const code = state.toUpperCase();
  const name = stateName(code);
  return s.replace(new RegExp(`[,\\s]+(?:${code}|${name.replace(/\s+/g, "\\s+")})\\.?$`, "i"), "").trim();
}

/** "Sharon, PA" / "Sharon, Pennsylvania" → { name: "Sharon", state: "PA" }; anything else → in the audit's state. */
export function placeState(entry: string, auditState: string): { name: string; state: string } {
  const m = entry.match(/^(.*?),\s*([A-Za-z][A-Za-z .]*)$/);
  if (m) {
    const tail = m[2]!.trim().replace(/\.$/, "");
    const code = US_STATES[tail.toUpperCase()] ? tail.toUpperCase() : Object.keys(US_STATES).find((c) => US_STATES[c]!.toLowerCase() === tail.toLowerCase());
    if (code) return { name: m[1]!.trim(), state: code };
  }
  return { name: entry, state: auditState.toUpperCase() };
}

/** How a place is written in an audit: "Warren" in the audit's state, "Sharon, PA" elsewhere. */
export function placeLabel(name: string, state: string, auditState: string): string {
  return state.toUpperCase() === auditState.toUpperCase() ? name : `${name}, ${state.toUpperCase()}`;
}

/** Straight-line miles between two map positions [lat, lng]. */
export function milesBetween(a: readonly [number, number], b: readonly [number, number]): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(b[0] - a[0]);
  const dLng = r(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Most audits are local: places farther than this from the home town get a "keep it?" note. */
export const NEARBY_MILES = 45;

/** One typed entry → one or more clean place names. */
export function splitPlace(entry: string, state: string): string[] {
  const raw = dropState(entry.replace(/\s+/g, " ").trim(), state);
  if (!raw) return [];
  const parts = raw.split(SPLIT).map((p) => p.trim()).filter(Boolean);
  const countyAtEnd = /\s+count(?:y|ies)$/i.test(parts[parts.length - 1] ?? "");
  return parts.map((p) => {
    // Another state written after a comma ("Sharon, PA") is kept as "Sharon, PA".
    const other = placeState(p, state);
    let name = titleCase(dropState(other.name, state)).replace(/\s+count(?:y|ies)$/i, " County");
    if (countyAtEnd && !/\s+County$/.test(name)) name = `${name} County`;
    return placeLabel(name, other.state, state);
  });
}

const isStateWord = (t: string) => !!US_STATES[t.trim().toUpperCase()] || Object.values(US_STATES).some((n) => n.toLowerCase() === t.trim().toLowerCase());

/** Commas split "Sharon, PA" into "Sharon" + "PA": put a lone state back on the town before it. */
export function joinStateTokens(entries: string[]): string[] {
  const out: string[] = [];
  for (const e of entries) {
    if (out.length && isStateWord(e)) out[out.length - 1] = `${out[out.length - 1]}, ${e.trim()}`;
    else out.push(e);
  }
  return out;
}

/** Every typed entry cleaned and split, duplicates removed (case-insensitive), order kept. */
export function cleanPlaces(entries: string[], state: string): string[] {
  const out: string[] = [];
  for (const e of joinStateTokens(entries)) for (const p of splitPlace(e, state)) if (!out.some((o) => o.toLowerCase() === p.toLowerCase())) out.push(p);
  return out;
}

// ---------------------------------------------------------------------------
// Checking names against Google's own list (DataForSEO's free locations file; the
// state lists live in us-places.json, read only on the server: src/lib/audit/places-list.ts)
// ---------------------------------------------------------------------------

/** Spelling-insensitive key: "St. Clairsville" = "Saint Clairsville", case and punctuation ignored. */
export function placeKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\bst\.?\s/g, "saint ")
    .replace(/\bmt\.?\s/g, "mount ")
    .replace(/\bft\.?\s/g, "fort ")
    .replace(/\btwp\.?$/g, "township")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 9;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length]!;
}

export interface PlaceBook {
  /** The exact name Google uses, or null if it isn't a place in this state. */
  canonical(name: string): string | null;
  /** Up to 3 close names (typos, "Trumbull" → "Trumbull County"). */
  suggest(name: string): string[];
}

/** A lookup over one state's places (cities, townships and counties). */
export function placeBook(names: readonly string[]): PlaceBook {
  const byKey = new Map(names.map((n) => [placeKey(n), n]));
  return {
    canonical: (name) => byKey.get(placeKey(name)) ?? byKey.get(placeKey(`${name} Township`)) ?? null,
    suggest: (name) => {
      const k = placeKey(name);
      if (!k) return [];
      const scored: [number, string][] = [];
      for (const [key, n] of byKey) {
        const d = key.startsWith(`${k} `) ? 0.5 : distance(k, key);
        if (d <= (k.length > 6 ? 2 : 1)) scored.push([d, n]);
      }
      return scored.sort((a, b) => a[0] - b[0] || a[1].length - b[1].length).slice(0, 3).map(([, n]) => n);
    },
  };
}

/** "isn't a place" message, starting with the field name (the builder jumps to that step). */
export function unknownPlaceMessage(label: string, name: string, state: string, suggestions: string[]): string {
  return `${label}: "${name}" isn't a place Google knows in ${stateName(state)}.${suggestions.length ? ` Did you mean ${suggestions.join(", ")}?` : " Use the town's own name (one per entry)."}`;
}

/** A town near the home town (builder chips). */
export interface NearbyTown {
  /** "Boardman", or "Sharon, PA" for another state. */
  label: string;
  miles: number;
}

/** One typed place as the builder shows it. */
export interface PlaceCheck {
  typed: string;
  /** Google's spelling ("Sharon, PA" for another state), or null if unknown. */
  label: string | null;
  /** Miles from the home town, when both have a position. */
  miles: number | null;
  suggest: string[];
}
