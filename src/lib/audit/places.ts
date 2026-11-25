// Place names for audits: how a rep's typing becomes names Google and DataForSEO know.
// Pure: no database, no network. Rules:
// - one place per entry: "Westminster & Thornton", "Arvada / Golden", "Warren and Niles"
//   become separate places;
// - counties keep "County": "Trumbull and Columbiana County" → Trumbull County, Columbiana
//   County ("Counties" works too);
// - a trailing state ("Warren, OH", "Warren Ohio") is dropped (the audit's state is used);
// - all-lowercase or ALL-CAPS typing is put in Title Case; anything else is kept as typed.

import { stateName } from "./geo";

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

/** One typed entry → one or more clean place names. */
export function splitPlace(entry: string, state: string): string[] {
  const raw = dropState(entry.replace(/\s+/g, " ").trim(), state);
  if (!raw) return [];
  const parts = raw.split(SPLIT).map((p) => p.trim()).filter(Boolean);
  const countyAtEnd = /\s+count(?:y|ies)$/i.test(parts[parts.length - 1] ?? "");
  return parts.map((p) => {
    let name = titleCase(dropState(p, state)).replace(/\s+count(?:y|ies)$/i, " County");
    if (countyAtEnd && !/\s+County$/.test(name)) name = `${name} County`;
    return name;
  });
}

/** Every typed entry cleaned and split, duplicates removed (case-insensitive), order kept. */
export function cleanPlaces(entries: string[], state: string): string[] {
  const out: string[] = [];
  for (const e of entries) for (const p of splitPlace(e, state)) if (!out.some((o) => o.toLowerCase() === p.toLowerCase())) out.push(p);
  return out;
}
