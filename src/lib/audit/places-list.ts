// Google's US place names per state (cities, townships, counties), from DataForSEO's free
// locations file (2026-11-02), built by scripts/build-us-places.py. Public names only.
// Imported by server code only, so the ~300 KB list never goes to the browser whole;
// the builder asks for one state's names at a time (getStatePlaces in actions.ts).

import { US_STATES } from "./geo";
import { placeBook, type PlaceBook } from "./places";
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
