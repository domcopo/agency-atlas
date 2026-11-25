// "Run audit" planning and assembly (docs/AUDIT_RUN_PLAN.md, Phase E1). Pure: no database,
// no network, no AI. Decides which read-only DataForSEO lookups an audit needs, the
// worst-case cost, and turns the (untrusted) answers into the same ATLAS-RESULTS v1 block
// that pasted results use, so everything passes the same checker (src/lib/audit/results.ts)
// before it is saved or drawn. Never invents a number: anything not found stays null.

import type { AdsIntake, AdsSectionId } from "./ads";
import { stateName } from "./geo";
import { normalizeDomain, type AuditIntake } from "./intake";
import { auditMarkets, buildUniverse, DEPTH_RULES, groupOf, localPattern, marketOf, modelSite, readInspection, readRanked, readSuggestions } from "./depth";
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
  "/v3/dataforseo_labs/google/keyword_suggestions/live": 0.05,
  "/v3/dataforseo_labs/google/ranked_keywords/live": 0.07,
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
  directories: ["yelp.com", "angi.com", "angieslist.com", "homeadvisor.com", "thumbtack.com", "bbb.org", "yellowpages.com", "facebook.com", "nextdoor.com", "houzz.com", "reddit.com", "google.com", "zillow.com", "realtor.com", "porch.com", "mapquest.com", "manta.com", "instagram.com", "linkedin.com", "youtube.com", "wikipedia.org", "indeed.com", "craigslist.org", "expertise.com", "bark.com", "trustpilot.com", "x.com", "twitter.com", "tiktok.com"],
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
  seeds: string[];
  sitesWorstCase: number;
  estimateUsd: number;
}

/** Short seed searches: the first few services as people type them ("we buy houses"). */
export function seedSearches(intake: { services: string[]; niche: string }): string[] {
  const list = (intake.services.length ? intake.services : [intake.niche]).map(searchPhrase).filter((t): t is string => !!t && t.split(" ").length <= 6);
  return [...new Set(list)].slice(0, DEPTH_RULES.seeds);
}

export function planSeoRun(intake: AuditIntake, sections: readonly AuditSectionId[]): SeoPlan {
  const on = new Set(sections);
  const cities = [intake.hqTown, ...intake.cities];
  const markets = auditMarkets(intake.hqTown, intake.cities, intake.state);
  const seeds = seedSearches(intake);
  const first: Lookup[] = seeds.map((keyword, i) => ({
    id: `suggest:${i}`,
    step: "Finding the searches",
    path: "/v3/dataforseo_labs/google/keyword_suggestions/live",
    task: { keyword, location_code: US, language_code: "en", limit: DEPTH_RULES.suggestionsPerSeed, filters: [["keyword_info.search_volume", ">", 0]], order_by: ["keyword_info.search_volume,desc"] },
  }));
  seoMoneyTerms(intake).forEach((keyword, i) => first.push({ id: `serp:${i}`, step: "Who ranks", path: "/v3/serp/google/organic/live/advanced", task: { keyword, location_name: cityLocation(intake.hqTown, intake.state), language_code: "en", depth: RUN_RULES.serpDepth } }));
  if (on.has("heatmap")) {
    const term = searchPhrase(intake.services[0] ?? intake.niche) ?? lower(intake.niche).slice(0, 60);
    cities.slice(0, RUN_RULES.packCities).forEach((city, i) => first.push({ id: `pack:${i}`, step: "Local 3-pack by city", path: "/v3/serp/google/organic/live/advanced", task: { keyword: term, location_name: cityLocation(city, intake.state), language_code: "en", depth: RUN_RULES.serpDepth } }));
  }
  const second = (universe: string[]): Lookup[] => {
    const list: Lookup[] = [{ id: "volume", step: "Searches per city", path: "/v3/keywords_data/google_ads/search_volume/live", task: { keywords: universe.slice(0, 1000), location_name: stateLocation(intake.state), language_code: "en" } }];
    if (on.has("keywords")) list.push({ id: "difficulty", step: "Keyword difficulty", path: "/v3/dataforseo_labs/google/bulk_keyword_difficulty/live", task: { keywords: universe.slice(0, 1000), location_code: US, language_code: "en" } });
    return list;
  };
  const pattern = localPattern(markets, intake.state);
  const perSite = (domain: string, name: string | null, business: boolean): Lookup[] => [
    {
      id: `ranked:${domain}`,
      step: "Competitors",
      path: "/v3/dataforseo_labs/google/ranked_keywords/live",
      task: { target: domain, location_code: US, language_code: "en", limit: DEPTH_RULES.rankedPerSite, filters: [["keyword_data.keyword", "regex", pattern]], order_by: ["keyword_data.keyword_info.search_volume,desc"] },
    },
    { id: `maps:${domain}`, step: "Google profiles", path: "/v3/serp/google/maps/live/advanced", task: { keyword: `${name ?? domain} ${intake.hqTown}`.slice(0, 80), location_name: cityLocation(intake.hqTown, intake.state), language_code: "en", depth: 10 } },
    ...(business ? [{ id: `instant:${domain}`, step: "Checking their website", path: "/v3/on_page/instant_pages" as const, task: { url: `https://${domain}`, enable_javascript: false } }] : []),
  ];
  const brand = (names: string[]): Lookup | null => {
    const phrases = [...new Set(names.map((n) => searchPhrase(n.replace(/\s*\([^)]*\)/g, ""))).filter((t): t is string => !!t))].slice(0, 10);
    return phrases.length ? { id: "brand", step: "Brand searches", path: "/v3/keywords_data/google_ads/search_volume/live", task: { keywords: phrases, location_code: US, language_code: "en" } } : null;
  };
  const sitesWorstCase = 1 + RUN_RULES.competitors;
  const estimateUsd = round2(
    first.reduce((sum, l) => sum + DFS_PRICE[l.path], 0) +
      DFS_PRICE["/v3/keywords_data/google_ads/search_volume/live"] * 2 + // state counts + brand searches
      (on.has("keywords") ? DFS_PRICE["/v3/dataforseo_labs/google/bulk_keyword_difficulty/live"] : 0) +
      sitesWorstCase * (DFS_PRICE["/v3/dataforseo_labs/google/ranked_keywords/live"] + DFS_PRICE["/v3/serp/google/maps/live/advanced"]) +
      DFS_PRICE["/v3/on_page/instant_pages"],
  );
  return { first, second, perSite, brand, seeds, sitesWorstCase, estimateUsd };
}

/** The money searches checked live from the home town: each service + home town, then "near me". */
export function seoMoneyTerms(intake: { services: string[]; hqTown: string; niche: string }): string[] {
  const svc = intake.services.length ? intake.services : [intake.niche];
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

export interface SerpRead {
  organic: { domain: string; rank: number; url: string | null }[];
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
      const d = domainOf(it.domain);
      const rank = num(it.rank_group);
      if (d && rank && rank >= 1 && rank <= 100 && !out.organic.some((o) => o.domain === d)) out.organic.push({ domain: d, rank, url: str(it.url) });
    } else if (type === "local_pack") {
      out.hasPack = true;
      const rating = obj(it.rating);
      const rank = num(it.rank_group);
      if (rank && rank >= 1 && rank <= 3) out.pack.push({ domain: domainOf(it.domain), title: str(it.title, 80), rank, rating: num(rating.value), reviews: num(rating.votes_count) });
    } else if (type === "paid") {
      const d = domainOf(it.domain);
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
}

export function readVolume(a: DfsAnswer | undefined): Map<string, VolumeRow> {
  const out = new Map<string, VolumeRow>();
  for (const r of a?.result ?? []) {
    const o = obj(r);
    const k = str(o.keyword, 80);
    if (!k) continue;
    out.set(lower(k), { keyword: lower(k), searches: num(o.search_volume), cpc: num(o.cpc), low: num(o.low_top_of_page_bid), high: num(o.high_top_of_page_bid), competition: num(o.competition_index) });
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
export function findCompetitors(serps: (SerpRead | null)[], business: string, limit: number = RUN_RULES.competitors): { domain: string; name: string | null }[] {
  const score = new Map<string, { n: number; name: string | null }>();
  for (const s of serps) {
    if (!s) continue;
    for (const p of s.pack) if (p.domain && p.domain !== business && !isDirectory(p.domain)) score.set(p.domain, { n: (score.get(p.domain)?.n ?? 0) + 3, name: p.title ?? score.get(p.domain)?.name ?? null });
    for (const o of s.organic.filter((x) => x.rank <= 10)) if (o.domain !== business && !isDirectory(o.domain)) score.set(o.domain, { n: (score.get(o.domain)?.n ?? 0) + 1, name: score.get(o.domain)?.name ?? null });
  }
  return [...score.entries()]
    .sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([domain, v]) => ({ domain, name: v.name }));
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
}

/** Seeds + suggestions that name a town, the state or "near me" (the D1 keyword universe). */
export function seoUniverse(intake: AuditIntake, answers: Map<string, DfsAnswer>, seedCount: number): string[] {
  const markets = auditMarkets(intake.hqTown, intake.cities, intake.state);
  const seeds = seedSearches(intake);
  const suggestions = Array.from({ length: seedCount }, (_, i) => readSuggestions(answers.get(`suggest:${i}`))).flat();
  const plain = moneyKeywords(intake.services, [intake.hqTown, ...intake.cities], intake.state).map((k) => k.keyword);
  return buildUniverse(seeds, markets, intake.state, suggestions, plain);
}

export function buildSeoBlock(intake: AuditIntake, sections: readonly AuditSectionId[], run: SeoAnswers): Record<string, unknown> {
  const on = new Set(sections);
  const cities = [intake.hqTown, ...intake.cities];
  const markets = auditMarkets(intake.hqTown, intake.cities, intake.state);
  const universe = run.universe ?? moneyKeywords(intake.services, cities, intake.state).map((k) => k.keyword);
  const volume = readVolume(run.answers.get("volume"));
  const difficulty = readDifficulty(run.answers.get("difficulty"));
  const money = seoMoneyTerms(intake);
  const serps = money.map((_, i) => readSerp(run.answers.get(`serp:${i}`)));
  const sites = [intake.domain, ...run.competitors.map((c) => c.domain)];
  const searches = (k: string) => volume.get(k)?.searches ?? null;
  const cpc = (k: string) => volume.get(k)?.cpc ?? null;

  // Each site's local rankings → the click-through model (D1). No answer = numbers "not found".
  const models = new Map(sites.filter((d) => run.answers.has(`ranked:${d}`)).map((d) => [d, modelSite(readRanked(run.answers.get(`ranked:${d}`), d), searches, cpc, markets, intake.state)]));

  const demand = cities.map((city) => {
    const known = universe.filter((k) => marketOf(k, markets)?.label === city).map(searches).filter((v): v is number => typeof v === "number");
    return { city, searches: known.length ? known.reduce((a, v) => a + v, 0) : null };
  });
  const nearRows = universe.filter((k) => groupOf(k, markets, intake.state) === "Near me").map(searches).filter((v): v is number => typeof v === "number");

  const ranked = [...universe].sort((a, b) => (searches(b) ?? -1) - (searches(a) ?? -1)).slice(0, 200);
  const moneySet = new Set([...money, ...ranked.slice(0, 8)]);
  const keywords = ranked.map((k) => {
    const v = volume.get(k);
    const at = money.indexOf(k);
    const serp = at >= 0 ? serps[at] : null;
    const row: Record<string, unknown> = {
      keyword: k,
      group: groupOf(k, markets, intake.state),
      money: moneySet.has(k),
      searches: v?.searches ?? null,
      cpcUsd: v?.cpc ?? null,
      difficulty: difficulty.get(k) ?? null,
    };
    if (models.size || serp) {
      row.ranks = Object.fromEntries(sites.map((d) => [d, models.get(d)?.positions.get(k) ?? serp?.organic.find((o) => o.domain === d)?.rank ?? null]));
    }
    return row;
  });

  // Local 3-pack by city (heat map) and, from the same searches, where each site shows up.
  const packs = on.has("heatmap") ? cities.slice(0, RUN_RULES.packCities).map((city, i) => ({ city, serp: readSerp(run.answers.get(`pack:${i}`)) })) : [];
  const hqSerp = serps[0] ?? null;
  const brand = readVolume(run.answers.get("brand"));
  const brandFor = (name: string) => {
    const phrase = searchPhrase(name.replace(/\s*\([^)]*\)/g, ""));
    return phrase ? (brand.get(phrase)?.searches ?? null) : null;
  };
  const names = new Map([[intake.domain, intake.company], ...run.competitors.map((c) => [c.domain, c.name] as [string, string])]);

  const siteRows = sites.map((d) => {
    const m = models.get(d);
    const prof = readProfile(run.answers.get(`maps:${d}`), d);
    const packRow = hqSerp?.pack.find((p) => p.domain === d);
    const fromPacks = packs.filter((p) => p.serp?.organic.some((o) => o.domain === d && o.rank <= RUN_RULES.serpDepth) || p.serp?.pack.some((x) => x.domain === d)).map((p) => p.city);
    const row: Record<string, unknown> = {
      website: d,
      googleRating: prof?.rating ?? packRow?.rating ?? null,
      googleReviews: prof?.reviews ?? packRow?.reviews ?? null,
      googlePhotos: prof?.photos ?? null,
      localPackPosition: hqSerp ? (packRow?.rank ?? (hqSerp.hasPack ? 0 : null)) : null,
      organicKeywords: m?.keywords ?? null,
      organicVisits: m?.visits ?? null,
      localPackVisits: null,
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

  const heatTerm = searchPhrase(intake.services[0] ?? intake.niche) ?? lower(intake.niche).slice(0, 60);
  const heatmaps = packs.some((p) => p.serp)
    ? [{ term: heatTerm, kind: "pack", cities: packs.map((p) => ({ city: p.city, position: p.serp ? (p.serp.pack.find((x) => x.domain === intake.domain)?.rank ?? (p.serp.hasPack ? 0 : null)) : null })) }]
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
