// Scout results checker (docs/SCOUT_PLAN.md, S1). A Scout run happens in Claude Code
// (where DataForSEO is connected) and produces a JSON results file; a person pastes or
// uploads it here. Everything in it is UNTRUSTED data: checked field by field, sizes
// capped, unknown fields dropped, never treated as instructions. Businesses that carry
// contact details (emails, phone numbers) are refused, so none reach the database.
// Pure: no database, no network.

import { contactDetailsIn } from "@/lib/work-orders";
import { SCOUT_RULES, type ScoutBusiness, type ScoutSignals, type Signal } from "@/lib/scout";

export const SCOUT_RESULTS_MAX_BYTES = 1_500_000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface ScoutResults {
  runId: string;
  retrievedOn: string;
  costUsd: number | null;
  businesses: ScoutBusiness[];
  /** Businesses left out, with why (name shown as plain text). */
  refused: { name: string; why: string }[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}
function num(v: unknown, min: number, max: number): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null;
}
function webUrl(v: unknown): string | null {
  const t = str(v, 200);
  if (!t) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password) return null;
    const out = `${u.protocol}//${u.host}${u.pathname === "/" ? "" : u.pathname}`.slice(0, 200);
    // The database refuses "@" or spaces in a web address; drop the address, keep the business.
    return /[\s@]/.test(out) ? null : out;
  } catch {
    return null;
  }
}
function validDay(v: unknown): string | null {
  return typeof v === "string" && DAY.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? v : null;
}

/** One signal: {value, source, date}. Missing source or date → the signal is dropped. */
function signal<T>(v: unknown, read: (x: unknown) => T | null): Signal<T> | undefined {
  if (!isObj(v)) return undefined;
  const source = str(v.source, 80);
  const date = validDay(v.date);
  if (!source || !date) return undefined;
  const value = v.value === null ? null : read(v.value);
  if (v.value !== null && value === null) return undefined;
  return { value, source, date };
}
const bool = (x: unknown) => (typeof x === "boolean" ? x : null);

function signals(v: unknown): ScoutSignals {
  if (!isObj(v)) return {};
  const out: ScoutSignals = {};
  const ads = signal(v.adsSeen, bool);
  if (ads) {
    const kws = isObj(v.adsSeen) && Array.isArray(v.adsSeen.keywords) ? v.adsSeen.keywords.map((k) => str(k, 60)).filter((k): k is string => Boolean(k)).slice(0, 5) : [];
    out.adsSeen = { ...ads, keywords: kws };
  }
  const paid = signal(v.paidTraffic, (x) => num(x, 0, 10_000_000));
  if (paid) out.paidTraffic = paid;
  const home = signal(v.adToHomePage, bool);
  if (home) out.adToHomePage = home;
  const speed = signal(v.adPageMobileSeconds, (x) => num(x, 0, 120));
  if (speed) out.adPageMobileSeconds = speed;
  const rank = signal(v.mapsRank, (x) => num(x, 1, 100));
  if (rank) out.mapsRank = { ...rank, keyword: isObj(v.mapsRank) ? (str(v.mapsRank.keyword, 60) ?? undefined) : undefined };
  const top = signal(v.top3Reviews, (x) => num(x, 0, 100_000));
  if (top) out.top3Reviews = top;
  const loads = signal(v.siteLoads, bool);
  if (loads) out.siteLoads = loads;
  const store = signal(v.storefront, bool);
  if (store) out.storefront = store;
  return out;
}

/**
 * Contact details in the text we KEEP (name, category, address, town, ad keywords).
 * Any other field (e.g. a "phone" a listing came with) is simply dropped, never stored.
 * Also catches 10–11 digits written together ("3305550100"), which the shared check doesn't.
 */
function contactIn(kept: string[]): string[] {
  const found = new Set(kept.flatMap((t) => contactDetailsIn(t)));
  if (kept.some((t) => /(^|[^0-9])\+?1?[0-9]{10}([^0-9]|$)/.test(t))) found.add("a phone number");
  return [...found];
}

/** Checks a results file. Returns an error message for anything that isn't a Scout results file for this run. */
export function parseScoutResults(raw: string, expectRunId: string): { ok: true; results: ScoutResults } | { ok: false; error: string } {
  if (new TextEncoder().encode(raw).length > SCOUT_RESULTS_MAX_BYTES) return { ok: false, error: "That file is too big (over 1.5 MB)." };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: "That isn't a Scout results file (not valid JSON)." };
  }
  if (!isObj(data) || data.kind !== "atlas-scout-results" || data.version !== 1) return { ok: false, error: "That isn't a Scout results file (wrong kind or version)." };
  const runId = typeof data.runId === "string" && UUID.test(data.runId) ? data.runId : null;
  if (!runId || runId !== expectRunId) return { ok: false, error: "These results are for a different run." };
  const retrievedOn = validDay(data.retrievedOn);
  if (!retrievedOn) return { ok: false, error: "The results need a retrieval date (YYYY-MM-DD)." };
  if (!Array.isArray(data.businesses)) return { ok: false, error: "The results have no business list." };
  if (data.businesses.length > SCOUT_RULES.maxRunSize) return { ok: false, error: `Too many businesses (most ${SCOUT_RULES.maxRunSize} per run).` };
  const businesses: ScoutBusiness[] = [];
  const refused: { name: string; why: string }[] = [];
  for (const raw of data.businesses) {
    if (!isObj(raw)) continue;
    const name = str(raw.name, 120);
    if (!name) {
      refused.push({ name: "(no name)", why: "no name" });
      continue;
    }
    const sig = signals(raw.signals);
    const kept = [name, str(raw.category, 80), str(raw.address, 200), str(raw.town, 80), ...(sig.adsSeen?.keywords ?? []), sig.mapsRank?.keyword].filter((t): t is string => Boolean(t));
    const found = contactIn(kept);
    if (found.length) {
      refused.push({ name: contactIn([name]).length ? "(name hidden)" : name, why: `a field had ${found.join(" and ")}` });
      continue;
    }
    const lat = num(raw.lat, -90, 90);
    const lng = num(raw.lng, -180, 180);
    businesses.push({
      name,
      website: webUrl(raw.website),
      category: str(raw.category, 80),
      address: str(raw.address, 200),
      town: str(raw.town, 80),
      lat: lat !== null && lng !== null ? lat : null,
      lng: lat !== null && lng !== null ? lng : null,
      mapsUrl: typeof raw.mapsUrl === "string" && raw.mapsUrl.startsWith("https://") ? raw.mapsUrl.slice(0, 500) : null,
      rating: num(raw.rating, 0, 5),
      reviews: num(raw.reviews, 0, 1_000_000) === null ? null : Math.round(raw.reviews as number),
      signals: sig,
    });
  }
  return { ok: true, results: { runId, retrievedOn, costUsd: num(data.costUsd, 0, 1000), businesses, refused } };
}
