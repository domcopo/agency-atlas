// Scout (docs/SCOUT_PLAN.md, approved 2026-11-24): pure rules for the local prospect
// finder. Scores each business from public signals with plain reasons, orders a walk-in
// route, builds Google Maps links, matches names, and does the cap math. No database, no
// network, no AI. Tested in tests/scout.test.ts. Tune the numbers in SCOUT_RULES / SCOUT_POINTS.

/** The area and limits. The owner's office is the home base. */
export const SCOUT_RULES = {
  base: { label: "Austintown, OH", lat: 41.1017, lng: -80.7645 },
  counties: ["Mahoning", "Trumbull", "Columbiana"],
  radiusMiles: 30,
  /** Most businesses in one run. */
  maxRunSize: 200,
  defaultRunSize: 100,
  /** Rough DataForSEO cost per business (listing + 2 searches + one speed check) and per run. Tune after the first run. */
  costPerBusinessUsd: 0.04,
  costPerRunUsd: 0.25,
  /** Caps (the database enforces the same, 0024). */
  monthlyUsd: 25,
  perRepMonthlyUsd: 10,
  /** "Not interested" can be tried again after this many days. */
  revisitDays: 180,
  /** A mobile page slower than this counts against an ad's landing page. */
  slowMobileSeconds: 4,
  /** Reviews below this share of the top 3's average count as a reviews gap. */
  reviewsGapShare: 0.3,
  /** Google Maps directions links take up to 9 stops after the start. */
  maxRouteStops: 9,
  /** "Walk-ins today" on a salesperson's Home. */
  walkInsPerDay: 6,
  /** Prospects not worked for this long are archived (privacy review). */
  archiveAfterDays: 365,
} as const;

/** Points per signal; a score is capped at 100. */
export const SCOUT_POINTS = {
  runsAds: 25,
  paidTraffic: 5,
  adToHomePage: 8,
  slowAdPage: 10,
  notTop3: 15,
  notTop10: 5,
  reviewsGap: 10,
  noWebsite: 20,
  siteDown: 15,
  storefront: 5,
  near: 5,
  veryNear: 5,
  targetKind: 5,
} as const;

/** Starting kinds of business (owner, 2026-11-24): construction and home services. */
export const SCOUT_KINDS = [
  "general contractor",
  "home builder",
  "remodeler",
  "roofing contractor",
  "siding contractor",
  "concrete contractor",
  "paving contractor",
  "excavating contractor",
  "plumber",
  "hvac contractor",
  "electrician",
  "landscaper",
  "lawn care service",
  "tree service",
  "painter",
  "flooring contractor",
  "garage door service",
  "pest control service",
  "cleaning service",
  "handyman",
] as const;

export const VISIT_OUTCOMES = [
  { outcome: "not_in", label: "Not in / closed" },
  { outcome: "staff", label: "Talked to staff" },
  { outcome: "owner", label: "Talked to the owner" },
  { outcome: "not_interested", label: "Not interested" },
  { outcome: "interested", label: "Interested" },
  { outcome: "wants_audit", label: "Wants an audit" },
  { outcome: "no_soliciting", label: "No soliciting sign" },
  { outcome: "do_not_contact", label: "Do not contact" },
] as const;
export type VisitOutcome = (typeof VISIT_OUTCOMES)[number]["outcome"];
export const VISIT_KINDS = ["walk_in", "call"] as const;
export type VisitKind = (typeof VISIT_KINDS)[number];

export const PROSPECT_STATUSES = ["new", "visited", "interested", "audit", "not_interested", "skipped", "do_not_contact", "in_ghl", "won", "lost"] as const;
export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];

export const STATUS_LABEL: Record<ProspectStatus, string> = {
  new: "Not visited yet",
  visited: "Visited",
  interested: "Interested",
  audit: "Wants an audit",
  not_interested: "Not interested",
  skipped: "Skipped",
  do_not_contact: "Do not contact",
  in_ghl: "In GoHighLevel",
  won: "Won",
  lost: "Lost",
};

export function asOutcome(v: string): VisitOutcome | null {
  return VISIT_OUTCOMES.some((o) => o.outcome === v) ? (v as VisitOutcome) : null;
}
export function asVisitKind(v: string): VisitKind | null {
  return (VISIT_KINDS as readonly string[]).includes(v) ? (v as VisitKind) : null;
}
export function outcomeLabel(v: string): string {
  return VISIT_OUTCOMES.find((o) => o.outcome === v)?.label ?? "Visited";
}

// ---------------------------------------------------------------------------
// Signals: every one carries where it came from and when; value null = "not found".
// ---------------------------------------------------------------------------

export interface Signal<T> {
  value: T | null;
  source: string;
  date: string; // YYYY-MM-DD
}

export interface ScoutSignals {
  /** Seen as a paid ad on "[service] near [town]" searches; the searches where it showed. */
  adsSeen?: Signal<boolean> & { keywords?: string[] };
  /** Estimated paid search clicks a month to their website. */
  paidTraffic?: Signal<number>;
  /** The ad points at the plain home page. */
  adToHomePage?: Signal<boolean>;
  /** Seconds until the ad's page is usable on a phone (Lighthouse). */
  adPageMobileSeconds?: Signal<number>;
  /** Google Maps position for their main service in their own town (null = not in the top 20). */
  mapsRank?: Signal<number> & { keyword?: string };
  /** Average review count of the top 3 in Maps for that search. */
  top3Reviews?: Signal<number>;
  /** Their website loads. */
  siteLoads?: Signal<boolean>;
  /** A real storefront address (not "service area only"). */
  storefront?: Signal<boolean>;
}

export interface ScoutBusiness {
  name: string;
  website: string | null;
  category: string | null;
  address: string | null;
  town: string | null;
  lat: number | null;
  lng: number | null;
  mapsUrl: string | null;
  rating: number | null;
  reviews: number | null;
  signals: ScoutSignals;
}

export interface ScoredBusiness extends ScoutBusiness {
  key: string;
  nameKey: string;
  miles: number | null;
  score: number;
  /** Most important first. */
  reasons: string[];
  /** The main pitch: "ads", "seo" or "website". */
  angle: "ads" | "seo" | "website";
}

/** Straight-line miles between two points. */
export function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

const one = (n: number) => Math.round(n * 10) / 10;

/** Is this one of the kinds we're targeting (construction / home services)? */
export function isTargetKind(category: string | null): boolean {
  if (!category) return false;
  const c = category.toLowerCase();
  return SCOUT_KINDS.some((k) => c.includes(k)) || /contractor|construction|roof|plumb|hvac|heating|electric|landscap|remodel|paving|concrete|excavat|siding|gutter|handyman|lawn|tree/.test(c);
}

/**
 * Score out of 100 with plain reasons. Only signals that were actually found count;
 * "not found" never adds or takes away points. Ad "not optimized" points are signs,
 * not proof (we can't see their account), and only count when they run ads.
 */
export function scoreBusiness(b: ScoutBusiness, base: { lat: number; lng: number } = SCOUT_RULES.base): ScoredBusiness {
  const s = b.signals;
  const parts: { pts: number; why: string }[] = [];
  const add = (pts: number, why: string) => parts.push({ pts, why });
  const ads = s.adsSeen?.value === true;
  if (ads) add(SCOUT_POINTS.runsAds, `Running Google Ads${s.adsSeen?.keywords?.length ? ` on "${s.adsSeen.keywords[0]}"` : ""}`);
  if (ads && (s.paidTraffic?.value ?? 0) > 0) add(SCOUT_POINTS.paidTraffic, `About ${Math.round(s.paidTraffic!.value!)} paid clicks a month (estimate)`);
  if (ads && s.adToHomePage?.value === true) add(SCOUT_POINTS.adToHomePage, "Ad sends people to the plain home page");
  if (ads && s.adPageMobileSeconds?.value != null && s.adPageMobileSeconds.value > SCOUT_RULES.slowMobileSeconds)
    add(SCOUT_POINTS.slowAdPage, `Ad page takes ${one(s.adPageMobileSeconds.value)} s on phones`);
  const hasSite = Boolean(b.website);
  if (!hasSite) add(SCOUT_POINTS.noWebsite, "No website");
  else if (s.siteLoads?.value === false) add(SCOUT_POINTS.siteDown, "Website doesn't load");
  if (s.mapsRank && s.mapsRank.source) {
    const r = s.mapsRank.value;
    const kw = s.mapsRank.keyword ? ` for "${s.mapsRank.keyword}"` : "";
    if (r === null || r > 3) add(SCOUT_POINTS.notTop3, r === null ? `Not in the Google Maps top 20${kw}` : `#${r} in Google Maps${kw} (not top 3)`);
    if (r === null || r > 10) add(SCOUT_POINTS.notTop10, "Hard to find in Maps");
  }
  const top = s.top3Reviews?.value;
  if (b.reviews !== null && top != null && top > 0 && b.reviews < top * SCOUT_RULES.reviewsGapShare)
    add(SCOUT_POINTS.reviewsGap, `${b.reviews} reviews vs about ${Math.round(top)} for the top 3`);
  const miles = b.lat !== null && b.lng !== null ? one(milesBetween(base, { lat: b.lat, lng: b.lng })) : null;
  if (s.storefront?.value === true) add(SCOUT_POINTS.storefront, `Storefront${miles !== null ? `, ${miles} mi away` : ""}`);
  if (miles !== null && miles <= SCOUT_RULES.radiusMiles) add(SCOUT_POINTS.near, "Inside our area");
  if (miles !== null && miles <= 10) add(SCOUT_POINTS.veryNear, "Within 10 miles");
  if (isTargetKind(b.category)) add(SCOUT_POINTS.targetKind, "Construction / home services");
  parts.sort((a, c) => c.pts - a.pts);
  const score = Math.min(100, parts.reduce((n, p) => n + p.pts, 0));
  const angle = ads ? "ads" : !hasSite || s.siteLoads?.value === false ? "website" : "seo";
  return { ...b, key: businessKey(b), nameKey: nameKey(b.name), miles, score, reasons: parts.map((p) => p.why).slice(0, 8), angle };
}

// ---------------------------------------------------------------------------
// Matching: the same business across runs, and businesses we already have.
// ---------------------------------------------------------------------------

/** "https://www.Example.com/contact" → "example.com". null when it isn't a web address. */
export function domainOf(url: string | null | undefined): string | null {
  if (!url) return null;
  const t = url.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "");
  const host = t.split(/[/?#]/)[0]!.replace(/:\d+$/, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
}

/**
 * A business name reduced for matching: lower case, "&" → "and", common endings
 * (LLC, Inc, Co…) and "the" dropped, only letters and digits. The database does the
 * same in private.scout_name_key (0024); a test keeps the word list in step.
 */
export const NAME_STOP_WORDS = ["the", "llc", "inc", "co", "company", "corp", "corporation", "ltd", "and sons", "services", "service"] as const;
export function nameKey(name: string): string {
  let t = ` ${name.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ")} `;
  for (const w of NAME_STOP_WORDS) t = t.split(` ${w} `).join(" ");
  return t.replace(/\s+/g, "");
}

/** One key per business: its website's domain, else name + town. */
export function businessKey(b: { name: string; website: string | null; town: string | null }): string {
  const d = domainOf(b.website);
  return d ? `d:${d}` : `n:${nameKey(b.name)}|${nameKey(b.town ?? "")}`;
}

// ---------------------------------------------------------------------------
// Runs and caps
// ---------------------------------------------------------------------------

/** What a run is likely to cost (shown before it starts; written to the capped ledger). */
export function runEstimate(size: number): number {
  const n = Math.max(1, Math.min(SCOUT_RULES.maxRunSize, Math.round(size)));
  return Math.round((SCOUT_RULES.costPerRunUsd + n * SCOUT_RULES.costPerBusinessUsd) * 100) / 100;
}

export interface ScoutSpendRow {
  userId: string;
  usd: number;
  at: string;
}

/** First day of the New York month, as YYYY-MM-DD. */
export function nyMonthStart(at: Date): string {
  return `${new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(at).slice(0, 7)}-01`;
}

/**
 * How much is left this month. `rows` are what the viewer may read (their own for a
 * salesperson). The per-person cap applies to salespeople (or anyone the owner set one
 * for); the monthly total applies to everyone. Lowest wins.
 */
export function scoutLeft(input: { rows: ScoutSpendRow[]; me: string; monthlyUsd: number; myCapUsd: number | null; now: Date }): { mine: number; myCap: number | null; total: number; totalCap: number; left: number } {
  const month = nyMonthStart(input.now);
  const inMonth = input.rows.filter((r) => nyMonthStart(new Date(r.at)) === month);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const mine = r2(inMonth.filter((r) => r.userId === input.me).reduce((n, r) => n + r.usd, 0));
  const total = r2(inMonth.reduce((n, r) => n + r.usd, 0));
  const left = r2(Math.max(0, Math.min(input.monthlyUsd - total, input.myCapUsd === null ? Infinity : input.myCapUsd - mine)));
  return { mine, myCap: input.myCapUsd, total, totalCap: input.monthlyUsd, left };
}

// ---------------------------------------------------------------------------
// Walk-in routes (Google Maps links; free, nothing is sent until a person taps)
// ---------------------------------------------------------------------------

export interface Stop {
  id: string;
  lat: number;
  lng: number;
}

/** Nearest stop next, starting from the base. Stops without a position are left out. */
export function routeOrder<T extends { id: string; lat: number | null; lng: number | null }>(stops: T[], start: { lat: number; lng: number } = SCOUT_RULES.base): T[] {
  const left = stops.filter((s) => s.lat !== null && s.lng !== null);
  const out: T[] = [];
  let at = start;
  while (left.length && out.length < SCOUT_RULES.maxRouteStops) {
    let best = 0;
    for (let i = 1; i < left.length; i++) {
      if (milesBetween(at, left[i] as { lat: number; lng: number }) < milesBetween(at, left[best] as { lat: number; lng: number })) best = i;
    }
    const next = left.splice(best, 1)[0]!;
    out.push(next);
    at = next as { lat: number; lng: number };
  }
  return out;
}

const coord = (p: { lat: number; lng: number }) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;

/** A normal Google Maps directions link: from the base through the stops, in order. Positions only, never names. */
export function mapsRouteUrl(stops: { lat: number | null; lng: number | null }[], start: { lat: number; lng: number } = SCOUT_RULES.base): string | null {
  const pts = stops.filter((s): s is { lat: number; lng: number } => s.lat !== null && s.lng !== null).slice(0, SCOUT_RULES.maxRouteStops);
  if (!pts.length) return null;
  const dest = pts[pts.length - 1]!;
  const via = pts.slice(0, -1).map(coord).join("|");
  const q = new URLSearchParams({ api: "1", origin: coord(start), destination: coord(dest), travelmode: "driving" });
  if (via) q.set("waypoints", via);
  return `https://www.google.com/maps/dir/?${q.toString()}`;
}

/** Only Google Maps links are ever shown as "Open in Google Maps". */
export function safeMapsUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const okHost = u.hostname === "www.google.com" || u.hostname === "google.com" || u.hostname === "maps.google.com" || u.hostname === "maps.app.goo.gl";
    if (u.protocol !== "https:" || !okHost) return null;
    if (u.hostname.endsWith("google.com") && !u.pathname.startsWith("/maps") && u.hostname !== "maps.google.com") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** A Maps search link for a business with no saved Maps link (name + town only). */
export function mapsSearchUrl(b: { name: string; town: string | null; lat: number | null; lng: number | null }): string {
  const q = new URLSearchParams({ api: "1", query: [b.name, b.town].filter(Boolean).join(", ") });
  return `https://www.google.com/maps/search/?${q.toString()}`;
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

export interface Prospect {
  id: string;
  name: string;
  website: string | null;
  category: string | null;
  address: string | null;
  town: string | null;
  lat: number | null;
  lng: number | null;
  mapsUrl: string | null;
  rating: number | null;
  reviews: number | null;
  signals: ScoutSignals;
  score: number;
  reasons: string[];
  angle: "ads" | "seo" | "website";
  status: ProspectStatus;
  assignedTo: string | null;
  nextOkOn: string | null;
  runId: string | null;
  createdAt: string;
}

export interface ScoutVisit {
  prospectId: string;
  kind: VisitKind;
  outcome: VisitOutcome;
  at: string;
  by: string;
}

export const SCOUT_FILTERS = ["all", "ads", "seo", "website", "walk_in", "pool"] as const;
export type ScoutFilter = (typeof SCOUT_FILTERS)[number];
export function asScoutFilter(v: string | undefined): ScoutFilter {
  return (SCOUT_FILTERS as readonly string[]).includes(v ?? "") ? (v as ScoutFilter) : "all";
}

/** Still worth working: not skipped, closed or do-not-contact. */
export function isOpenProspect(p: Prospect, today: string): boolean {
  if (p.status === "not_interested") return p.nextOkOn !== null && p.nextOkOn <= today;
  return p.status === "new" || p.status === "visited" || p.status === "interested" || p.status === "audit";
}

export function filterProspects(list: Prospect[], filter: ScoutFilter, today: string): Prospect[] {
  const open = list.filter((p) => isOpenProspect(p, today));
  const pick =
    filter === "ads" ? open.filter((p) => p.angle === "ads")
    : filter === "seo" ? open.filter((p) => p.angle === "seo")
    : filter === "website" ? open.filter((p) => p.angle === "website")
    : filter === "walk_in" ? open.filter((p) => p.signals.storefront?.value === true)
    : filter === "pool" ? open.filter((p) => p.assignedTo === null)
    : open;
  return [...pick].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

/**
 * "Walk-ins today" for one salesperson: their not-yet-visited storefront prospects (best
 * score first), then put in route order from the base.
 */
export function walkInsToday(list: Prospect[], me: string, limit: number = SCOUT_RULES.walkInsPerDay): Prospect[] {
  const mine = list
    .filter((p) => p.assignedTo === me && p.status === "new" && p.signals.storefront?.value !== false)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  const routed = routeOrder(mine);
  return [...routed, ...mine.filter((p) => !routed.includes(p))];
}

/** The funnel: how far prospects got. Counts are of prospects, never people. */
export function scoutFunnel(list: Prospect[], visits: ScoutVisit[]) {
  const visited = new Set(visits.map((v) => v.prospectId));
  const ownerTalk = new Set(visits.filter((v) => v.outcome === "owner" || v.outcome === "interested" || v.outcome === "wants_audit").map((v) => v.prospectId));
  return {
    scouted: list.length,
    assigned: list.filter((p) => p.assignedTo !== null).length,
    visited: list.filter((p) => visited.has(p.id) || p.status !== "new").filter((p) => p.status !== "skipped").length,
    talkedToOwner: ownerTalk.size,
    interested: list.filter((p) => p.status === "interested" || p.status === "audit" || p.status === "in_ghl" || p.status === "won").length,
    audit: list.filter((p) => p.status === "audit").length,
    won: list.filter((p) => p.status === "won").length,
    doNotContact: list.filter((p) => p.status === "do_not_contact").length,
  };
}
