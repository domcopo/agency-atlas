// "Run audit" planning and assembly (docs/AUDIT_RUN_PLAN.md, Phase E1). Pure: no database,
// no network, no AI. Decides which read-only DataForSEO lookups an audit needs, the
// worst-case cost, and turns the (untrusted) answers into the same ATLAS-RESULTS v1 block
// that pasted results use, so everything passes the same checker (src/lib/audit/results.ts)
// before it is saved or drawn. Never invents a number: anything not found stays null.

import type { AdsIntake, AdsSectionId } from "./ads";
import { stateName } from "./geo";
import { normalizeDomain, type AuditIntake } from "./intake";
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

/** "service city" for every service and city, plus "service near me" (deduplicated, ≤ 300). */
export function moneyKeywords(services: string[], cities: string[], state = ""): { keyword: string; service: string; city: string | null }[] {
  const out: { keyword: string; service: string; city: string | null }[] = [];
  const seen = new Set<string>();
  const add = (keyword: string, service: string, city: string | null) => {
    const k = lower(keyword).replace(/\s+/g, " ").slice(0, 80);
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
  first: Lookup[];
  /** Per competitor/site, added once competitors are known (worst case counted up front). */
  perSite: (domain: string, name: string | null) => Lookup[];
  sitesWorstCase: number;
  estimateUsd: number;
}

export function planSeoRun(intake: AuditIntake, sections: readonly AuditSectionId[]): SeoPlan {
  const on = new Set(sections);
  const cities = [intake.hqTown, ...intake.cities];
  const kws = moneyKeywords(intake.services, cities, intake.state);
  const first: Lookup[] = [
    { id: "volume", step: "Searches per city", path: "/v3/keywords_data/google_ads/search_volume/live", task: { keywords: kws.map((k) => k.keyword), location_name: stateLocation(intake.state), language_code: "en" } },
  ];
  if (on.has("keywords")) first.push({ id: "difficulty", step: "Keyword difficulty", path: "/v3/dataforseo_labs/google/bulk_keyword_difficulty/live", task: { keywords: kws.slice(0, 200).map((k) => k.keyword), location_code: US, language_code: "en" } });
  seoMoneyTerms(intake).forEach((keyword, i) => first.push({ id: `serp:${i}`, step: "Who ranks", path: "/v3/serp/google/organic/live/advanced", task: { keyword, location_name: cityLocation(intake.hqTown, intake.state), language_code: "en", depth: RUN_RULES.serpDepth } }));
  if (on.has("heatmap")) {
    const term = lower(intake.services[0] ?? intake.niche);
    cities.slice(0, RUN_RULES.packCities).forEach((city, i) => first.push({ id: `pack:${i}`, step: "Local 3-pack by city", path: "/v3/serp/google/organic/live/advanced", task: { keyword: term, location_name: cityLocation(city, intake.state), language_code: "en", depth: RUN_RULES.serpDepth } }));
  }
  const perSite = (domain: string, name: string | null): Lookup[] => [
    { id: `site:${domain}`, step: "Competitors", path: "/v3/dataforseo_labs/google/domain_rank_overview/live", task: { target: domain, location_code: US, language_code: "en" } },
    { id: `maps:${domain}`, step: "Google profiles", path: "/v3/serp/google/maps/live/advanced", task: { keyword: `${name ?? domain} ${intake.hqTown}`.slice(0, 80), location_name: cityLocation(intake.hqTown, intake.state), language_code: "en", depth: 10 } },
  ];
  const sitesWorstCase = 1 + RUN_RULES.competitors;
  const estimateUsd = round2(first.reduce((s, l) => s + DFS_PRICE[l.path], 0) + sitesWorstCase * (DFS_PRICE["/v3/dataforseo_labs/google/domain_rank_overview/live"] + DFS_PRICE["/v3/serp/google/maps/live/advanced"]));
  return { first, perSite, sitesWorstCase, estimateUsd };
}

/** The money searches checked live from the home town: each service + home town, then "near me". */
export function seoMoneyTerms(intake: { services: string[]; hqTown: string; niche: string }): string[] {
  const svc = intake.services.length ? intake.services : [intake.niche];
  const terms = [...svc.map((s) => `${s} ${intake.hqTown}`), ...svc.map((s) => `${s} near me`)].map(lower);
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
}

export function buildSeoBlock(intake: AuditIntake, sections: readonly AuditSectionId[], run: SeoAnswers): Record<string, unknown> {
  const on = new Set(sections);
  const cities = [intake.hqTown, ...intake.cities];
  const kws = moneyKeywords(intake.services, cities, intake.state);
  const volume = readVolume(run.answers.get("volume"));
  const difficulty = readDifficulty(run.answers.get("difficulty"));
  const money = seoMoneyTerms(intake);
  const serps = money.map((_, i) => readSerp(run.answers.get(`serp:${i}`)));
  const sites = [intake.domain, ...run.competitors.map((c) => c.domain)];

  const demand = cities.map((city) => {
    const rows = kws.filter((k) => k.city === city).map((k) => volume.get(k.keyword)?.searches);
    const known = rows.filter((v): v is number => typeof v === "number");
    return { city, searches: known.length ? known.reduce((s, v) => s + v, 0) : null };
  });
  const nearRows = kws.filter((k) => k.city === null).map((k) => volume.get(k.keyword)?.searches).filter((v): v is number => typeof v === "number");

  const keywords = kws.slice(0, 200).map((k) => {
    const v = volume.get(k.keyword);
    const at = money.indexOf(k.keyword);
    const serp = at >= 0 ? serps[at] : null;
    const row: Record<string, unknown> = {
      keyword: k.keyword,
      group: k.service,
      money: at >= 0,
      searches: v?.searches ?? null,
      cpcUsd: v?.cpc ?? null,
      difficulty: difficulty.get(k.keyword) ?? null,
    };
    if (serp) row.ranks = Object.fromEntries(sites.map((d) => [d, serp.organic.find((o) => o.domain === d)?.rank ?? null]));
    return row;
  });

  // Local 3-pack by city (heat map) and, from the same searches, where each site ranks.
  const packs = on.has("heatmap") ? cities.slice(0, RUN_RULES.packCities).map((city, i) => ({ city, serp: readSerp(run.answers.get(`pack:${i}`)) })) : [];
  const hqSerp = serps[0] ?? null;

  const siteRows = sites.map((d) => {
    const ov = readOverview(run.answers.get(`site:${d}`));
    const prof = readProfile(run.answers.get(`maps:${d}`), d);
    const packRow = hqSerp?.pack.find((p) => p.domain === d);
    return {
      website: d,
      googleRating: prof?.rating ?? packRow?.rating ?? null,
      googleReviews: prof?.reviews ?? packRow?.reviews ?? null,
      googlePhotos: prof?.photos ?? null,
      localPackPosition: hqSerp ? (packRow?.rank ?? (hqSerp.hasPack ? 0 : null)) : null,
      organicKeywords: ov?.organicKeywords ?? null,
      organicVisits: ov?.organicVisits ?? null,
      localPackVisits: null,
      trafficValueUsd: ov?.organicValueUsd ?? null,
      backlinkRank: null,
      referringDomains: null,
      rankingPagesIn: packs.filter((p) => p.serp?.organic.some((o) => o.domain === d && o.rank <= RUN_RULES.serpDepth) || p.serp?.pack.some((x) => x.domain === d)).map((p) => p.city),
    };
  });

  const heatTerm = lower(intake.services[0] ?? intake.niche);
  const heatmaps = packs.some((p) => p.serp)
    ? [{ term: heatTerm, kind: "pack", cities: packs.map((p) => ({ city: p.city, position: p.serp ? (p.serp.pack.find((x) => x.domain === intake.domain)?.rank ?? (p.serp.hasPack ? 0 : null)) : null })) }]
    : [];

  return {
    atlas: "results-v1",
    kind: "seo",
    website: intake.domain,
    source: "dataforseo",
    retrieved: run.retrieved,
    sources: ["dataforseo"],
    competitors: run.competitors.map((c) => ({ name: c.name, website: c.domain, town: c.town })),
    demand,
    nearMeSearches: nearRows.length ? nearRows.reduce((s, v) => s + v, 0) : null,
    // Visit numbers come from DataForSEO Labs, which estimates US-wide (not local) traffic.
    visitsScope: "national",
    keywords,
    sites: siteRows,
    heatmaps,
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
  return [...new Set([...svc.map((s) => `${s} ${intake.hqTown}`), ...svc.map((s) => `${s} near me`)].map(lower))].slice(0, RUN_RULES.adsTerms);
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
