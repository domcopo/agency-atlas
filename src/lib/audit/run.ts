// "Run audit" planning and assembly (docs/AUDIT_RUN_PLAN.md, Phase E1). Pure: no database,
// no network, no AI. Decides which read-only DataForSEO lookups an audit needs, the
// worst-case cost, and turns the (untrusted) answers into the same ATLAS-RESULTS v1 block
// that pasted results use, so everything passes the same checker (src/lib/audit/results.ts)
// before it is saved or drawn. Never invents a number: anything not found stays null.

import type { AdsIntake, AdsSectionId } from "./ads";
import { stateName } from "./geo";
import { normalizeDomain, type AuditIntake } from "./intake";
import { auditMarkets, buildUniverse, DEPTH_RULES, groupOf, PACK_CTR, isLocal, localPattern, onTopic, marketOf, modelSite, nearbyMarkets, readInspection, readRanked, readSuggestions, topicOf, topicPattern, type Market } from "./depth";

/**
 * The places around an audit, looked up by the caller (the place list is server data and
 * stays out of this file so pages can import it): towns within ~30 miles of the home town,
 * and every place name in the state. Left out = only the audit's own markets.
 */
export interface SeoArea {
  nearby?: string[];
  others?: readonly string[];
}

function areaOf(intake: AuditIntake, area?: SeoArea): { own: Market[]; all: Market[]; others: ReadonlySet<string> } {
  const own = auditMarkets(intake.hqTown, intake.cities, intake.state);
  const near = nearbyMarkets(area?.nearby ?? [], own, intake.state);
  return { own, all: [...own, ...near], others: new Set((area?.others ?? []).map((x) => x.toLowerCase())) };
}
import { placeState } from "./places";
import type { AuditSectionId } from "./sections";
import type { DfsAnswer, DfsPath } from "./sources/dataforseo";

/** Worst-case price per lookup in dollars (DataForSEO reports the real cost; these are deliberately high). */
export const DFS_PRICE: Record<DfsPath, number> = {
  "/v3/keywords_data/google_ads/search_volume/live": 0.1,
  "/v3/serp/google/organic/live/advanced": 0.01,
  "/v3/serp/google/maps/live/advanced": 0.01,
  "/v3/dataforseo_labs/google/domain_rank_overview/live": 0.03,
  "/v3/dataforseo_labs/google/bulk_keyword_difficulty/live": 0.05,
  "/v3/on_page/lighthouse/live/json": 0.02,
  "/v3/dataforseo_labs/google/keyword_suggestions/live": 0.07, // $0.01 + $0.0001 per row (500)
  "/v3/dataforseo_labs/google/ranked_keywords/live": 0.12, // $0.01 + $0.0001 per row (1,000)
  "/v3/on_page/instant_pages": 0.01,
};

export const RUN_RULES = {
  /** Money searches checked live (ranks, local pack, ads). */
  moneyTerms: 6,
  adsTerms: 5,
  /** Competitors looked up (rank overview, Google profile). */
  competitors: 5,
  /** Cities whose local 3-pack is checked for the heat map. */
  packCities: 12,
  serpDepth: 20,
  /** Big directories are never "competitors". */
  directories: ["yelp.com", "angi.com", "angieslist.com", "homeadvisor.com", "thumbtack.com", "bbb.org", "yellowpages.com", "facebook.com", "nextdoor.com", "houzz.com", "reddit.com", "google.com", "zillow.com", "realtor.com", "porch.com", "mapquest.com", "manta.com", "instagram.com", "linkedin.com", "youtube.com", "wikipedia.org", "indeed.com", "craigslist.org", "expertise.com", "bark.com", "trustpilot.com", "x.com", "twitter.com", "tiktok.com", "homelight.com", "opendoor.com", "offerpad.com", "redfin.com", "trulia.com", "homes.com", "homeguide.com", "fixr.com", "forbes.com", "bankrate.com", "investopedia.com", "nerdwallet.com", "quora.com", "apartments.com", "biggerpockets.com", "yahoo.com", "bing.com", "expedia.com", "kayak.com", "priceline.com", "booking.com", "tripadvisor.com", "orbitz.com", "travelocity.com", "hotwire.com", "cheaptickets.com", "momondo.com", "skyscanner.com", "rentalcars.com", "carrentals.com", "discovercars.com", "easyterra.com", "autoslash.com", "turo.com", "getaround.com", "costcotravel.com", "realestatebees.com", "fastexpert.com", "clever.com"],
  /** A run that started this long ago and never finished is treated as stopped. */
  staleMinutes: 10,
} as const;

export interface Lookup {
  id: string;
  /** The progress step it belongs to. */
  step: string;
  path: DfsPath;
  task: Record<string, unknown>;
}

const US = 2840;
/** DataForSEO's location for a town: "Sharon, PA" is looked up in Pennsylvania, plain names in the audit's state. */
const cityLocation = (city: string, state: string) => {
  const where = placeState(city, state);
  return `${where.name},${stateName(where.state)},United States`;
};
/** The town as people search it: "plumber sharon", never "plumber sharon, pa". */
const searchName = (city: string, state: string) => placeState(city, state).name;
const stateLocation = (state: string) => `${stateName(state)},United States`;
const lower = (s: string) => s.trim().toLowerCase();

/**
 * The one search used for the map pack (heat map, pack visits, Google Maps competitors): the
 * business type ("car rental") when a service is just a kind of it ("daily car rental", a
 * narrow search with a thin pack); otherwise the first service ("we buy houses" beats
 * "real estate investor", which sellers don't type).
 */
export function mapTermOf(intake: { niche: string; services: string[] }): string {
  const niche = searchPhrase(intake.niche);
  const services = intake.services.map(searchPhrase).filter((s): s is string => !!s);
  if (niche && services.some((s) => ` ${s} `.includes(` ${niche} `))) return niche;
  return services[0] ?? niche ?? lower(intake.niche).slice(0, 60);
}

/**
 * A phrase Google Ads accepts: letters, numbers, spaces, apostrophes and dashes only ("&" →
 * "and"), at most 10 words and 80 characters. Longer phrases are skipped (null), never cut
 * mid-word: one bad phrase makes DataForSEO refuse the whole batch.
 */
export function searchPhrase(raw: string): string | null {
  const k = lower(raw)
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9' -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!k || k.length > 80 || k.split(" ").length > 10) return null;
  return k;
}

/** "service city" for every service and city, plus "service near me" (deduplicated, ≤ 300). */
export function moneyKeywords(services: string[], cities: string[], state = ""): { keyword: string; service: string; city: string | null }[] {
  const out: { keyword: string; service: string; city: string | null }[] = [];
  const seen = new Set<string>();
  const add = (keyword: string, service: string, city: string | null) => {
    const k = searchPhrase(keyword);
    if (k && !seen.has(k) && out.length < 300) {
      seen.add(k);
      out.push({ keyword: k, service, city });
    }
  };
  for (const s of services) for (const c of cities) add(`${s} ${searchName(c, state)}`, s, c);
  for (const s of services) add(`${s} near me`, s, null);
  return out;
}

const isDirectory = (d: string) => RUN_RULES.directories.some((x) => d === x || d.endsWith(`.${x}`));

// ---------------------------------------------------------------------------
// SEO: the plan
// ---------------------------------------------------------------------------

export interface SeoPlan {
  /** Discovery (seed suggestions) and the live Google checks. */
  first: Lookup[];
  /** Once the keyword universe is known: Google Ads counts for the state (+ difficulty). */
  second: (universe: string[]) => Lookup[];
  /** Per site, once competitors are known: its local rankings, its Google profile (+ the homepage check for the business). */
  perSite: (domain: string, name: string | null, business: boolean) => Lookup[];
  /** How often each business is searched by name (US). */
  brand: (names: string[]) => Lookup | null;
  /** Once rankings are in: state counts for local searches the sites rank for that weren't counted yet. */
  rankedVolume: (answers: Map<string, DfsAnswer>, domains: string[], universe: string[]) => Lookup | null;
  seeds: string[];
  sitesWorstCase: number;
  estimateUsd: number;
}

/** Short seed searches: the first few services as people type them ("we buy houses"). */
export function seedSearches(intake: { services: string[]; niche: string }): string[] {
  // The business type first ("car rental"): it is usually the most-searched term, and the
  // services alone ("daily car rental") miss it.
  const list = [intake.niche, ...intake.services].map(searchPhrase).filter((t): t is string => !!t && t.split(" ").length <= 6);
  return [...new Set(list)].slice(0, DEPTH_RULES.seeds);
}

export function planSeoRun(intake: AuditIntake, sections: readonly AuditSectionId[], area?: SeoArea): SeoPlan {
  const on = new Set(sections);
  const cities = [intake.hqTown, ...intake.cities];
  const markets = areaOf(intake, area).all;
  const seeds = seedSearches(intake);
  const first: Lookup[] = seeds.map((keyword, i) => ({
    id: `suggest:${i}`,
    step: "Finding the searches",
    path: "/v3/dataforseo_labs/google/keyword_suggestions/live",
    task: { keyword, location_code: US, language_code: "en", limit: DEPTH_RULES.suggestionsPerSeed, filters: [["keyword_info.search_volume", ">", 0]], order_by: ["keyword_info.search_volume,desc"] },
  }));
  seoMoneyTerms(intake).forEach((keyword, i) => first.push({ id: `serp:${i}`, step: "Who ranks", path: "/v3/serp/google/organic/live/advanced", task: { keyword, location_name: cityLocation(intake.hqTown, intake.state), language_code: "en", depth: RUN_RULES.serpDepth } }));
  // Google Maps from the home town: the local businesses WITH their websites and reviews (the
  // map pack in normal results no longer lists websites), so real local rivals are found first.
  const mapTerm = mapTermOf(intake);
  first.push({ id: "maps:area", step: "Who ranks", path: "/v3/serp/google/maps/live/advanced", task: { keyword: mapTerm, location_name: cityLocation(intake.hqTown, intake.state), language_code: "en", depth: 20 } });
  if (on.has("heatmap")) {
    const term = mapTerm;
    cities.slice(0, RUN_RULES.packCities).forEach((city, i) => first.push({ id: `pack:${i}`, step: "Local 3-pack by city", path: "/v3/serp/google/organic/live/advanced", task: { keyword: term, location_name: cityLocation(city, intake.state), language_code: "en", depth: RUN_RULES.serpDepth } }));
  }
  const second = (universe: string[]): Lookup[] => {
    const list: Lookup[] = [{ id: "volume", step: "Searches per city", path: "/v3/keywords_data/google_ads/search_volume/live", task: { keywords: universe.slice(0, 1000), location_name: stateLocation(intake.state), language_code: "en" } }];
    // "near me" searches counted for the home town, not the whole state (a state-wide figure
    // counted 400,000 "car rental near me" searches for one Cleveland business). Plain searches
    // that name no place ("we buy houses") are counted there too: in a small market most people
    // type just that, and the map pack answers it, so a state figure would be wrong and leaving
    // them out showed a #1 map-pack business with 0 visits.
    const near = [...new Set([mapTerm, ...universe.filter((k) => ` ${k} `.includes(" near me ") || groupOf(k, markets, intake.state) === "General")])].slice(0, 1000);
    if (near.length) list.push({ id: "volume:near", step: "Searches per city", path: "/v3/keywords_data/google_ads/search_volume/live", task: { keywords: near, location_name: cityLocation(intake.hqTown, intake.state), language_code: "en" } });
    if (on.has("keywords")) list.push({ id: "difficulty", step: "Keyword difficulty", path: "/v3/dataforseo_labs/google/bulk_keyword_difficulty/live", task: { keywords: universe.slice(0, 1000), location_code: US, language_code: "en" } });
    return list;
  };
  const pattern = localPattern(markets, intake.state);
  // Only searches about this business (a topic word) and not "near me" (left out of the model):
  // big brands rank for thousands of local searches, most about something else.
  const topic = topicPattern(topicOf([intake.niche, ...intake.services], markets));
  const rankedFilters: unknown[] = [["keyword_data.keyword", "regex", pattern], "and", ["keyword_data.keyword", "not_regex", "near me"]];
  if (topic) rankedFilters.push("and", ["keyword_data.keyword", "regex", topic]);
  const perSite = (domain: string, name: string | null, business: boolean): Lookup[] => [
    {
      id: `ranked:${domain}`,
      step: "Competitors",
      path: "/v3/dataforseo_labs/google/ranked_keywords/live",
      task: { target: domain, location_code: US, language_code: "en", limit: DEPTH_RULES.rankedPerSite, filters: rankedFilters, order_by: ["keyword_data.keyword_info.search_volume,desc"] },
    },
    { id: `maps:${domain}`, step: "Google profiles", path: "/v3/serp/google/maps/live/advanced", task: { keyword: `${name ?? domain} ${intake.hqTown}`.slice(0, 80), location_name: cityLocation(intake.hqTown, intake.state), language_code: "en", depth: 10 } },
    ...(business ? [{ id: `instant:${domain}`, step: "Checking their website", path: "/v3/on_page/instant_pages" as const, task: { url: `https://${domain}`, enable_javascript: false } }] : []),
  ];
  const brand = (names: string[]): Lookup | null => {
    const phrases = [...new Set(names.map((n) => searchPhrase(n.replace(/\s*\([^)]*\)/g, ""))).filter((t): t is string => !!t))].slice(0, 10);
    return phrases.length ? { id: "brand", step: "Brand searches", path: "/v3/keywords_data/google_ads/search_volume/live", task: { keywords: phrases, location_code: US, language_code: "en" } } : null;
  };
  // Competitors rank for local searches the universe doesn't have ("car rental parma"). Their
  // visits must use THIS state's counts, not DataForSEO's US-wide figure (which, for "car rental
  // brooklyn", is New York's demand), so those searches are counted for the state too.
  const rankedVolume = (answers: Map<string, DfsAnswer>, domains: string[], universe: string[]): Lookup | null => {
    const known = new Set(universe);
    const t = { ...topicOf([intake.niche, ...intake.services], markets), known };
    const best = new Map<string, number>();
    for (const d of domains)
      for (const r of readRanked(answers.get(`ranked:${d}`), d))
        if (!known.has(r.keyword) && !` ${r.keyword} `.includes(" near me ") && isLocal(r.keyword, markets, intake.state) && onTopic(r.keyword, t)) best.set(r.keyword, Math.max(best.get(r.keyword) ?? 0, r.usVolume ?? 0));
    const keywords = [...best].sort((a, b) => b[1] - a[1]).slice(0, 1000).map(([k]) => k);
    return keywords.length ? { id: "volume:ranked", step: "Competitors", path: "/v3/keywords_data/google_ads/search_volume/live", task: { keywords, location_name: stateLocation(intake.state), language_code: "en" } } : null;
  };
  const sitesWorstCase = 1 + RUN_RULES.competitors;
  const estimateUsd = round2(
    first.reduce((sum, l) => sum + DFS_PRICE[l.path], 0) +
      DFS_PRICE["/v3/keywords_data/google_ads/search_volume/live"] * 4 + // state counts, home-town near me, ranked searches, brand searches
      (on.has("keywords") ? DFS_PRICE["/v3/dataforseo_labs/google/bulk_keyword_difficulty/live"] : 0) +
      sitesWorstCase * (DFS_PRICE["/v3/dataforseo_labs/google/ranked_keywords/live"] + DFS_PRICE["/v3/serp/google/maps/live/advanced"]) +
      DFS_PRICE["/v3/on_page/instant_pages"],
  );
  return { first, second, perSite, brand, rankedVolume, seeds, sitesWorstCase, estimateUsd };
}

/** The money searches checked live from the home town: each service + home town, then "near me". */
export function seoMoneyTerms(intake: { services: string[]; hqTown: string; niche: string }): string[] {
  // The business type first ("car rental cleveland"): the search most people type.
  const svc = [intake.niche, ...intake.services];
  const terms = [...svc.map((s) => `${s} ${intake.hqTown}`), ...svc.map((s) => `${s} near me`)].map(searchPhrase).filter((t): t is string => !!t);
  return [...new Set(terms)].slice(0, RUN_RULES.moneyTerms);
}

// ---------------------------------------------------------------------------
// Reading DataForSEO answers (untrusted: every field optional, wrong types → null)
// ---------------------------------------------------------------------------

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown, max = 200): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const domainOf = (v: unknown): string | null => {
  const d = typeof v === "string" ? normalizeDomain(v) : "";
  return /^[a-z0-9.-]+\.[a-z]{2,63}$/.test(d) ? d : null;
};
const round2 = (n: number) => Math.round(n * 100) / 100;
const isGoogle = (d: string | null) => !!d && /(^|\.)google\.[a-z.]+$/.test(d);

/**
 * The real website of a search result. Since late 2026 DataForSEO often gives "google.com" and
 * a Google redirect link instead; the site then only shows in the breadcrumb
 * ("https://example.com › page"). Nothing usable = null (never "google.com").
 */
export function siteDomain(it: Record<string, unknown>): string | null {
  for (const v of [it.domain, it.url, typeof it.breadcrumb === "string" ? it.breadcrumb.split(/\s/)[0] : null]) {
    const d = domainOf(v);
    if (d && !isGoogle(d)) return d;
  }
  return null;
}

/** "Mahoning Home Buyer (fictional)" → "mahoning home buyer" (for matching map-pack names). */
export function nameKey(name: string | null | undefined): string {
  return (name ?? "").toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
}

/** Is this map-pack entry that business (by website, or by its Google name when the pack has no website)? */
export function samePlace(entry: { domain: string | null; title: string | null }, domain: string, name: string | null): boolean {
  if (entry.domain) return entry.domain === domain;
  const k = nameKey(name);
  const t = nameKey(entry.title);
  return k.length >= 6 && (t === k || t.startsWith(`${k} `));
}

export interface SerpRead {
  organic: { domain: string; rank: number; url: string | null; name?: string | null }[];
  pack: { domain: string | null; title: string | null; rank: number; rating: number | null; reviews: number | null }[];
  hasPack: boolean;
  paid: { domain: string; title: string | null; url: string | null }[];
  lsa: boolean;
}

export function readSerp(a: DfsAnswer | undefined): SerpRead | null {
  if (!a) return null;
  const items = arr(obj(a.result[0]).items).map(obj);
  const out: SerpRead = { organic: [], pack: [], hasPack: false, paid: [], lsa: false };
  for (const it of items) {
    const type = str(it.type, 40) ?? "";
    if (type === "organic") {
      const d = siteDomain(it);
      const rank = num(it.rank_group);
      if (d && rank && rank >= 1 && rank <= 100 && !out.organic.some((o) => o.domain === d)) out.organic.push({ domain: d, rank, url: str(it.url), name: str(it.website_name, 80) });
    } else if (type === "local_pack") {
      out.hasPack = true;
      const rating = obj(it.rating);
      const rank = num(it.rank_group);
      if (rank && rank >= 1 && rank <= 3) out.pack.push({ domain: siteDomain(it), title: str(it.title, 80), rank, rating: num(rating.value), reviews: num(rating.votes_count) });
    } else if (type === "paid") {
      const d = siteDomain(it);
      if (d) out.paid.push({ domain: d, title: str(it.title, 120), url: str(it.url) });
    } else if (type.startsWith("local_services")) out.lsa = true;
  }
  return out;
}

export interface VolumeRow {
  keyword: string;
  searches: number | null;
  cpc: number | null;
  low: number | null;
  high: number | null;
  competition: number | null;
  /**
   * Google Ads lumps close variants together and gives each the same figures: "car rental
   * near me", "rental cars near me" and "rent a car near me" all came back as 2,400 with the
   * same 12-month history. Rows with the same twin key are one search, counted once. null =
   * too little to tell (under 50 searches or under 6 months of history).
   */
  twin: string | null;
}

/** Month-by-month counts as one string ("" when missing); accepts DataForSEO's list form. */
function monthly(v: unknown): string {
  const rows = arr(v).map(obj);
  const counts = rows.map((m) => `${num(m.year) ?? ""}-${num(m.month) ?? ""}:${num(m.search_volume) ?? ""}`);
  return counts.length >= 6 ? counts.join(",") : "";
}

export function readVolume(a: DfsAnswer | undefined): Map<string, VolumeRow> {
  const out = new Map<string, VolumeRow>();
  for (const r of a?.result ?? []) {
    const o = obj(r);
    const k = str(o.keyword, 80);
    if (!k) continue;
    const row = { keyword: lower(k), searches: num(o.search_volume), cpc: num(o.cpc), low: num(o.low_top_of_page_bid), high: num(o.high_top_of_page_bid), competition: num(o.competition_index) };
    const history = monthly(o.monthly_searches);
    const twin = history && (row.searches ?? 0) >= 50 ? [row.searches, row.cpc, row.low, row.high, row.competition, history].join("|") : null;
    out.set(lower(k), { ...row, twin });
  }
  return out;
}

export function readDifficulty(a: DfsAnswer | undefined): Map<string, number> {
  const out = new Map<string, number>();
  for (const it of arr(obj(a?.result[0]).items)) {
    const o = obj(it);
    const k = str(o.keyword, 80);
    const d = num(o.keyword_difficulty);
    if (k && d !== null && d >= 0 && d <= 100) out.set(lower(k), d);
  }
  return out;
}

export interface SiteOverview {
  organicKeywords: number | null;
  organicVisits: number | null;
  organicValueUsd: number | null;
  paidVisits: number | null;
  paidCostUsd: number | null;
}

export function readOverview(a: DfsAnswer | undefined): SiteOverview | null {
  if (!a) return null;
  const m = obj(obj(arr(obj(a.result[0]).items)[0]).metrics);
  const org = obj(m.organic);
  const paid = obj(m.paid);
  return { organicKeywords: num(org.count), organicVisits: num(org.etv), organicValueUsd: num(org.estimated_paid_traffic_cost), paidVisits: num(paid.etv), paidCostUsd: num(paid.estimated_paid_traffic_cost) };
}

export interface ProfileRead {
  rating: number | null;
  reviews: number | null;
  photos: number | null;
}

/** The Google profile whose website matches `domain` in a Maps search (never a look-alike). */
export function readProfile(a: DfsAnswer | undefined, domain: string): ProfileRead | null {
  for (const it of arr(obj(a?.result[0]).items)) {
    const o = obj(it);
    if (domainOf(o.domain) !== domain) continue;
    const rating = obj(o.rating);
    return { rating: num(rating.value), reviews: num(rating.votes_count), photos: num(o.total_photos) };
  }
  return null;
}

export function readSpeed(a: DfsAnswer | undefined): number | null {
  const score = num(obj(obj(obj(a?.result[0]).categories).performance).score);
  return score === null || score < 0 || score > 1 ? null : Math.round(score * 100);
}

// ---------------------------------------------------------------------------
// SEO: answers → results block
// ---------------------------------------------------------------------------

/** Competitors from the live searches when the rep named none: most often seen, not directories. */
export interface MapPlace {
  domain: string | null;
  title: string | null;
  rank: number;
  rating: number | null;
  reviews: number | null;
}

/** Google Maps results (top 20) from the home town. */
export function readMaps(a: DfsAnswer | undefined): MapPlace[] {
  const out: MapPlace[] = [];
  for (const it of arr(obj(a?.result[0]).items)) {
    const o = obj(it);
    const rank = num(o.rank_group);
    if (!rank || rank < 1 || rank > 20) continue;
    const rating = obj(o.rating);
    out.push({ domain: siteDomain(o), title: str(o.title, 80), rank, rating: num(rating.value), reviews: num(rating.votes_count) });
  }
  return out;
}

/** "Sell My House Fast Ohio | As Is Cash Buyers" → "Sell My House Fast Ohio". */
const shortName = (n: string | null | undefined) => (n ? n.split(/\s[|–—-]\s/)[0]!.trim().slice(0, 60) || null : null);

/**
 * Competitors: Google Maps from the home town counts most (top 3 = 4 points, top 10 = 2),
 * then the map pack (3) and page-1 results (1) of the live searches. Directories and national
 * marketplaces are skipped.
 */
export function findCompetitors(serps: (SerpRead | null)[], business: string, limit: number = RUN_RULES.competitors, maps: MapPlace[] = []): { domain: string; name: string | null }[] {
  const score = new Map<string, { n: number; name: string | null }>();
  for (const m of maps) {
    if (!m.domain || m.domain === business || isDirectory(m.domain)) continue;
    score.set(m.domain, { n: (score.get(m.domain)?.n ?? 0) + (m.rank <= 3 ? 4 : m.rank <= 10 ? 2 : 1), name: score.get(m.domain)?.name ?? shortName(m.title) });
  }
  for (const s of serps) {
    if (!s) continue;
    for (const p of s.pack) if (p.domain && p.domain !== business && !isDirectory(p.domain)) score.set(p.domain, { n: (score.get(p.domain)?.n ?? 0) + 3, name: p.title ?? score.get(p.domain)?.name ?? null });
    for (const o of s.organic.filter((x) => x.rank <= 10)) if (o.domain !== business && !isDirectory(o.domain)) score.set(o.domain, { n: (score.get(o.domain)?.n ?? 0) + 1, name: score.get(o.domain)?.name ?? o.name ?? null });
  }
  // A business with a Google Maps listing or a map-pack spot here comes first; sites seen only in
  // plain results (booking sites, guides) fill leftover places (a car rental audit got Expedia
  // and a directory as "competitors" over local rental counters).
  const local = new Set<string>([...maps.map((m) => m.domain ?? ""), ...serps.flatMap((s) => (s ? s.pack.map((p) => p.domain ?? "") : []))]);
  return [...score.entries()]
    .sort((a, b) => Number(local.has(b[0])) - Number(local.has(a[0])) || b[1].n - a[1].n || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([domain, v]) => ({ domain, name: shortName(v.name) }));
}

export interface SeoAnswers {
  answers: Map<string, DfsAnswer>;
  /** Competitors used (rep's, else found). */
  competitors: { domain: string; name: string; town: string }[];
  retrieved: string;
  costUsd: number;
  calls: number;
  /** The searches this audit is about (D1); left out = the plain service × town list. */
  universe?: string[];
  /** Nearby towns and the state's place names (same as given to planSeoRun / seoUniverse). */
  area?: SeoArea;
}

/** Seeds + suggestions that name a town, the state or "near me" (the D1 keyword universe). */
export function seoUniverse(intake: AuditIntake, answers: Map<string, DfsAnswer>, seedCount: number, area?: SeoArea): string[] {
  const { all: markets, others } = areaOf(intake, area);
  const seeds = seedSearches(intake);
  const suggestions = Array.from({ length: seedCount }, (_, i) => readSuggestions(answers.get(`suggest:${i}`))).flat();
  const plain = moneyKeywords(intake.services, [intake.hqTown, ...intake.cities], intake.state).map((k) => k.keyword);
  return buildUniverse(seeds, markets, intake.state, suggestions, plain, others);
}

export function buildSeoBlock(intake: AuditIntake, sections: readonly AuditSectionId[], run: SeoAnswers): Record<string, unknown> {
  const on = new Set(sections);
  const cities = [intake.hqTown, ...intake.cities];
  const { all: markets, others } = areaOf(intake, run.area);
  const universe = run.universe ?? moneyKeywords(intake.services, cities, intake.state).map((k) => k.keyword);
  // State counts: the universe, plus the searches competitors rank for (counted after rankings).
  const volume = new Map([...readVolume(run.answers.get("volume:ranked")), ...readVolume(run.answers.get("volume"))]);
  const nearVolume = readVolume(run.answers.get("volume:near"));
  const difficulty = readDifficulty(run.answers.get("difficulty"));
  const money = seoMoneyTerms(intake);
  const serps = money.map((_, i) => readSerp(run.answers.get(`serp:${i}`)));
  const sites = [intake.domain, ...run.competitors.map((c) => c.domain)];
  const searches = (k: string) => volume.get(k)?.searches ?? null;
  const cpc = (k: string) => volume.get(k)?.cpc ?? null;

  // Each site's local rankings → the click-through model (D1). No answer = numbers "not found".
  const topic = { ...topicOf([intake.niche, ...intake.services], markets), known: new Set(universe) };
  // Once state counts exist, a search Google reports no count for gets 0 visits, never the US figure.
  const counted = (k: string) => (volume.size ? (volume.get(k)?.searches ?? 0) : null);
  const models = new Map(sites.filter((d) => run.answers.has(`ranked:${d}`)).map((d) => [d, modelSite(readRanked(run.answers.get(`ranked:${d}`), d), counted, cpc, markets, intake.state, others, topic, (k) => volume.get(k)?.twin ?? null)]));

  // Shown counts: "near me" and plain searches ("we buy houses") use the home town's figure (the
  // state's would dwarf every town). Plain rows fall back to the state only if that lookup failed.
  const isNear = (k: string) => ` ${k} `.includes(" near me ");
  const isPlain = (k: string) => groupOf(k, markets, intake.state) === "General";
  const fromHome = (k: string) => isNear(k) || (isPlain(k) && nearVolume.size > 0);
  const shown = (k: string) => (fromHome(k) ? (nearVolume.get(k)?.searches ?? null) : searches(k));
  // Close variants Google lumps together (same figures, same history) are one search: one row
  // and one count each (a car rental audit added the same 2,400 "near me" searches six times).
  // The row kept is a money term if there is one, else the shortest wording.
  const twinKey = (k: string) => {
    const t = (fromHome(k) ? nearVolume : volume).get(k)?.twin;
    return t ? `${fromHome(k) ? "home" : "state"}|${t}` : null;
  };
  const pick = (a: string, b: string) => (money.includes(a) !== money.includes(b) ? (money.includes(a) ? a : b) : a.length !== b.length ? (a.length < b.length ? a : b) : a < b ? a : b);
  const keep = new Map<string, string>();
  for (const k of universe) {
    const t = twinKey(k);
    if (t) keep.set(t, keep.has(t) ? pick(keep.get(t)!, k) : k);
  }
  const kept = new Set(keep.values());
  const twinsOf = new Map<string, string[]>();
  for (const k of universe) {
    const t = twinKey(k);
    const r = t ? keep.get(t)! : k;
    twinsOf.set(r, [...(twinsOf.get(r) ?? []), k]);
  }
  const once = universe.filter((k) => !twinKey(k) || kept.has(k));

  const demand = cities.map((city) => {
    const known = once.filter((k) => marketOf(k, markets)?.label === city).map(searches).filter((v): v is number => typeof v === "number");
    return { city, searches: known.length ? known.reduce((a, v) => a + v, 0) : null };
  });
  const nearRows = once.filter((k) => groupOf(k, markets, intake.state) === "Near me").map((k) => nearVolume.get(k)?.searches ?? null).filter((v): v is number => typeof v === "number");

  const plainRows = nearVolume.size ? once.filter(isPlain).map((k) => nearVolume.get(k)?.searches ?? null).filter((v): v is number => typeof v === "number") : [];
  const ranked = [...once].sort((a, b) => (shown(b) ?? -1) - (shown(a) ?? -1)).slice(0, 200);
  // Positions exist only for the live money searches and the local searches rankings were read
  // for (towns or the state, not "near me"); anything else is "not checked", never "not ranking".
  const checkable = (k: string) => money.includes(k) || (!` ${k} `.includes(" near me ") && isLocal(k, markets, intake.state, others));
  const moneySet = new Set([...money, ...ranked.filter(checkable).slice(0, 8)]);
  const keywords = ranked.map((k) => {
    const v = volume.get(k);
    const at = money.indexOf(k);
    const serp = at >= 0 ? serps[at] : null;
    const row: Record<string, unknown> = {
      keyword: k,
      group: groupOf(k, markets, intake.state),
      money: moneySet.has(k),
      searches: shown(k),
      cpcUsd: (fromHome(k) ? nearVolume.get(k)?.cpc : v?.cpc) ?? v?.cpc ?? null,
      difficulty: difficulty.get(k) ?? null,
    };
    if ((models.size && checkable(k)) || serp) {
      // A kept row shows the best position among the wordings it stands for.
      const best = (d: string) => {
        const at = (twinsOf.get(k) ?? [k]).map((w) => models.get(d)?.positions.get(w)).filter((p): p is number => typeof p === "number");
        return at.length ? Math.min(...at) : null;
      };
      row.ranks = Object.fromEntries(sites.map((d) => [d, best(d) ?? serp?.organic.find((o) => o.domain === d)?.rank ?? null]));
    }
    return row;
  });

  // Local 3-pack by city (heat map) and, from the same searches, where each site shows up.
  const packs = on.has("heatmap") ? cities.slice(0, RUN_RULES.packCities).map((city, i) => ({ city, serp: readSerp(run.answers.get(`pack:${i}`)) })) : [];
  // The home-town search; if it failed, the home town's map-pack search (same town) stands in.
  const hqSerp = serps[0] ?? packs[0]?.serp ?? null;
  // The "Pack" column uses the same home-town map search as the heat map and pack visits when
  // that search showed a pack (two different searches made a Denver audit say "not in the pack"
  // next to pack visits for the same businesses).
  const packSerp = packs[0]?.serp?.hasPack ? packs[0].serp : hqSerp;
  const brand = readVolume(run.answers.get("brand"));
  const brandFor = (name: string) => {
    const phrase = searchPhrase(name.replace(/\s*\([^)]*\)/g, ""));
    return phrase ? (brand.get(phrase)?.searches ?? null) : null;
  };

  // Map-pack visits: the home town's plain searches for the map term × the click share of the
  // spot each site holds in the home town's pack (a model). Not in the pack = 0; no count = unknown.
  const mapTerm = mapTermOf(intake);
  const mapSearches = nearVolume.size ? (nearVolume.get(mapTerm)?.searches ?? 0) : null;
  const homePack = packs[0]?.serp ?? null;
  const packSpot = (d: string): number | null => {
    if (homePack) return homePack.pack.find(isSite(d))?.rank ?? 0;
    const placed = readMaps(run.answers.get("maps:area"));
    return placed.length ? (placed.find((p) => samePlace(p, d, names.get(d) ?? null) && p.rank <= 3)?.rank ?? 0) : null;
  };
  const packVisits = (d: string): number | null => {
    const spot = packSpot(d);
    return mapSearches === null || spot === null ? null : Math.round(mapSearches * (PACK_CTR[spot] ?? 0));
  };

  const names = new Map([[intake.domain, intake.company], ...run.competitors.map((c) => [c.domain, c.name] as [string, string])]);
  const mapPlaces = readMaps(run.answers.get("maps:area"));
  const isSite = (d: string) => (x: { domain: string | null; title: string | null }) => samePlace(x, d, names.get(d) ?? null);
  const siteRows = sites.map((d) => {
    const m = models.get(d);
    const prof = readProfile(run.answers.get(`maps:${d}`), d);
    const packRow = packSerp?.pack.find(isSite(d));
    const anyPackRow = packRow ?? hqSerp?.pack.find(isSite(d));
    const onMap = mapPlaces.find((m) => m.domain === d);
    const fromPacks = packs.filter((p) => p.serp?.organic.some((o) => o.domain === d && o.rank <= RUN_RULES.serpDepth) || p.serp?.pack.some(isSite(d))).map((p) => p.city);
    const row: Record<string, unknown> = {
      website: d,
      googleRating: prof?.rating ?? anyPackRow?.rating ?? onMap?.rating ?? null,
      googleReviews: prof?.reviews ?? anyPackRow?.reviews ?? onMap?.reviews ?? null,
      googlePhotos: prof?.photos ?? null,
      localPackPosition: packSerp ? (packRow?.rank ?? (packSerp.hasPack ? 0 : null)) : null,
      organicKeywords: m?.keywords ?? null,
      organicVisits: m?.visits ?? null,
      localPackVisits: packVisits(d),
      trafficValueUsd: m?.valueUsd ?? null,
      backlinkRank: null,
      referringDomains: null,
      rankingPagesIn: [...new Set([...(m?.markets ?? []), ...fromPacks])],
      top3: m?.top3 ?? null,
      top10: m?.top10 ?? null,
      positionedFor: m?.positionedFor ?? null,
      brandSearches: brandFor(names.get(d) ?? d),
    };
    if (m?.pages.length && d !== intake.domain) row.pagesBuilt = m.pages;
    return row;
  });

  const heatTerm = mapTermOf(intake);
  const heatmaps = packs.some((p) => p.serp)
    ? [{ term: heatTerm, kind: "pack", cities: packs.map((p) => ({ city: p.city, position: p.serp ? (p.serp.pack.find(isSite(intake.domain))?.rank ?? (p.serp.hasPack ? 0 : null)) : null })) }]
    : [];
  const inspection = readInspection(run.answers.get(`instant:${intake.domain}`), intake.hqTown);

  return {
    atlas: "results-v1",
    kind: "seo",
    website: intake.domain,
    source: "dataforseo",
    retrieved: run.retrieved,
    sources: ["dataforseo"],
    competitors: run.competitors.map((c) => ({ name: c.name, website: c.domain, town: c.town })),
    demand,
    nearMeSearches: nearRows.length ? nearRows.reduce((a, v) => a + v, 0) : null,
    // Searches from the home town that name no place ("we buy houses"): counted once, there.
    homeTownSearches: plainRows.length ? plainRows.reduce((a, v) => a + v, 0) : null,
    // Visits are modeled from each site's LOCAL rankings × state search counts (D1).
    visitsScope: "local",
    keywords,
    sites: siteRows,
    heatmaps,
    ...(inspection ? { inspection } : {}),
    scorecard: [],
    headline: "",
    pageNotes: {},
    fixes: [],
    cost: [{ source: "dataforseo", calls: run.calls, costUsd: Math.min(50, round2(run.costUsd)) }],
  };
}

// ---------------------------------------------------------------------------
// Google Ads: plan and answers → results block
// ---------------------------------------------------------------------------

export interface AdsPlanRun {
  first: Lookup[];
  perBidder: (domain: string) => Lookup;
  speed: (url: string) => Lookup;
  estimateUsd: number;
}

export function adsMoneyTerms(intake: { services: string[]; hqTown: string; niche: string }): string[] {
  const svc = intake.services.length ? intake.services : [intake.niche];
  return [...new Set([...svc.map((s) => `${s} ${intake.hqTown}`), ...svc.map((s) => `${s} near me`)].map(searchPhrase).filter((t): t is string => !!t))].slice(0, RUN_RULES.adsTerms);
}

export function planAdsRun(intake: AdsIntake, sections: readonly AdsSectionId[]): AdsPlanRun {
  const on = new Set(sections);
  const kws = moneyKeywords(intake.services, [intake.hqTown, ...intake.cities], intake.state);
  const first: Lookup[] = [{ id: "volume", step: "Searches and cost per click", path: "/v3/keywords_data/google_ads/search_volume/live", task: { keywords: kws.slice(0, 100).map((k) => k.keyword), location_name: stateLocation(intake.state), language_code: "en" } }];
  const needSerp = on.has("ads_bidders") || on.has("ads_running") || on.has("ads_lsa") || on.has("ads_spend") || on.has("ads_landing");
  if (needSerp) adsMoneyTerms(intake).forEach((keyword, i) => first.push({ id: `serp:${i}`, step: "Who shows ads", path: "/v3/serp/google/organic/live/advanced", task: { keyword, location_name: cityLocation(intake.hqTown, intake.state), language_code: "en", depth: 10 } }));
  const perBidder = (domain: string): Lookup => ({ id: `site:${domain}`, step: "Competitor ad spend", path: "/v3/dataforseo_labs/google/domain_rank_overview/live", task: { target: domain, location_code: US, language_code: "en" } });
  const speed = (url: string): Lookup => ({ id: "speed", step: "Landing page speed", path: "/v3/on_page/lighthouse/live/json", task: { url, for_mobile: true } });
  const bidders = on.has("ads_spend") ? RUN_RULES.competitors : 0;
  const estimateUsd = round2(first.reduce((s, l) => s + DFS_PRICE[l.path], 0) + bidders * DFS_PRICE["/v3/dataforseo_labs/google/domain_rank_overview/live"] + (on.has("ads_landing") ? DFS_PRICE["/v3/on_page/lighthouse/live/json"] : 0));
  return { first, perBidder, speed, estimateUsd };
}

/** Who showed ads on the checked searches, most often first (the business itself excluded). */
export function readBidders(serps: (SerpRead | null)[], business: string): { domain: string; title: string | null; seen: number }[] {
  const seen = new Map<string, { n: number; title: string | null }>();
  for (const s of serps) {
    if (!s) continue;
    for (const d of new Set(s.paid.map((p) => p.domain))) {
      if (d === business || isDirectory(d)) continue;
      seen.set(d, { n: (seen.get(d)?.n ?? 0) + 1, title: seen.get(d)?.title ?? s.paid.find((p) => p.domain === d)?.title ?? null });
    }
  }
  return [...seen.entries()].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0])).map(([domain, v]) => ({ domain, title: v.title, seen: v.n }));
}

export interface AdsAnswers {
  answers: Map<string, DfsAnswer>;
  retrieved: string;
}

export function buildAdsBlock(intake: AdsIntake, sections: readonly AdsSectionId[], run: AdsAnswers): Record<string, unknown> {
  const on = new Set(sections);
  const volume = readVolume(run.answers.get("volume"));
  const kws = moneyKeywords(intake.services, [intake.hqTown, ...intake.cities], intake.state).slice(0, 100);
  const serps = adsMoneyTerms(intake).map((_, i) => readSerp(run.answers.get(`serp:${i}`)));
  const checked = serps.filter((s) => s).length;
  const found = readBidders(serps, intake.domain);
  const named = intake.competitors.map((c) => c.domain);
  const order = [...new Set([...found.map((b) => b.domain), ...named])].slice(0, 10);
  const bidders = order.map((d) => {
    const ov = on.has("ads_spend") ? readOverview(run.answers.get(`site:${d}`)) : null;
    const name = intake.competitors.find((c) => c.domain === d)?.name ?? d;
    return { name, website: d, adsSeen: checked ? (found.find((b) => b.domain === d)?.seen ?? 0) : null, paidClicks: ov?.paidVisits ?? null, spendUsd: ov?.paidCostUsd ?? null };
  });
  const ownAd = serps.flatMap((s) => s?.paid ?? []).find((p) => p.domain === intake.domain);
  return {
    atlas: "results-v1",
    kind: "ads",
    website: intake.domain,
    source: "dataforseo",
    retrieved: run.retrieved,
    sources: ["dataforseo"],
    searchesChecked: checked,
    keywords: kws.map((k) => {
      const v = volume.get(k.keyword);
      return { keyword: k.keyword, searches: v?.searches ?? null, cpcLowUsd: v?.low ?? null, cpcHighUsd: v?.high ?? null, competition: v?.competition ?? null };
    }),
    bidders,
    client: {
      runningAds: checked ? Boolean(ownAd) : null,
      adPage: ownAd?.url && /^https?:\/\//.test(ownAd.url) ? ownAd.url : null,
      mobileSpeed: readSpeed(run.answers.get("speed")),
      callButton: null,
      form: null,
      lsaShown: checked ? serps.some((s) => s?.lsa) : null,
    },
    cost: [],
  };
}
