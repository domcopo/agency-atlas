// SAMPLE DATA — a made-up plumbing company placed in real Ohio cities, used to show the
// SEO audit template and to run it in dry-run mode at $0. Every BUSINESS is fictional,
// every website ends in ".example", and no figure comes from a real business. Only the
// city names and their map positions are real.
// Not based on any client's audit: different niche, places, competitors and numbers.

import type { AuditConfig } from "@/lib/audit/config";
import type { AuditData, Fig, GeoGrid, KeywordRow, SiteMetrics, SourceId } from "@/lib/audit/data";

const ON = "2026-11-17";

const f = (value: number | null, source: SourceId = "sample", unverified?: string): Fig => ({ value, source, retrieved: ON, ...(unverified ? { unverified } : {}) });

const CLIENT = "riverbend-plumbing.example";
const C1 = "copperline-plumbing.example";
const C2 = "bluewater-drains.example";
const C3 = "harbor-rooter.example";
const C4 = "summit-pipe-pros.example";
const C5 = "oakdale-plumbing.example";

export const sampleAuditConfig: AuditConfig = {
  kind: "seo",
  agency: { name: "Your Agency (sample)", website: "agency.example.com", phone: "555-0142", email: "hello@agency.example.com" },
  company: {
    name: "Riverbend Plumbing (sample)",
    domain: CLIENT,
    gbpUrl: "https://maps.example.com/riverbend-plumbing-sample",
    niche: "Residential plumbing",
    hqTown: "Columbus",
    region: "Ohio",
  },
  map: { state: "OH", ringsMiles: [40, 80] },
  markets: [
    { id: "columbus", name: "Columbus", kind: "town", lat: 39.961, lng: -82.999, hq: true },
    { id: "dayton", name: "Dayton", kind: "town", lat: 39.759, lng: -84.192 },
    { id: "cleveland", name: "Cleveland", kind: "town", lat: 41.48, lng: -81.69 },
    { id: "akron", name: "Akron", kind: "town", lat: 41.081, lng: -81.519 },
    { id: "cincinnati", name: "Cincinnati", kind: "town", lat: 39.14, lng: -84.51 },
    { id: "toledo", name: "Toledo", kind: "town", lat: 41.63, lng: -83.56 },
    { id: "ohio", name: "Statewide (Ohio terms)", kind: "state" },
  ],
  services: [
    { name: "Drain cleaning & repairs", mixShare: 0.65, jobValueUsd: { value: 450, basis: "assumption" } },
    { name: "Water heater replacement", mixShare: 0.25, jobValueUsd: { value: 2800, basis: "assumption" } },
    { name: "Repiping", mixShare: 0.1, jobValueUsd: { value: 9000, basis: "assumption" } },
  ],
  competitors: [
    { name: "Copperline Plumbing (fictional)", domain: C1, town: "Columbus" },
    { name: "Bluewater Drains (fictional)", domain: C2, town: "Dayton" },
    { name: "Harbor Rooter (fictional)", domain: C3, town: "Cleveland" },
    { name: "Summit Pipe Pros (fictional)", domain: C4, town: "Columbus" },
    { name: "Oakdale Plumbing (fictional)", domain: C5, town: "Cincinnati" },
  ],
  funnel: { leadRate: { value: 0.05, basis: "assumption" }, closeRate: { value: 0.3, basis: "assumption" } },
  scenarios: [
    { name: "Conservative", demandCaptured: 0.025 },
    { name: "Baseline", demandCaptured: 0.05 },
    { name: "Stronger", demandCaptured: 0.08 },
  ],
  baselineScenario: "Baseline",
  plans: [
    { name: "Foundation", hoursPerMonth: 10, priceUsd: 300, summary: "Technical upkeep, Google profile, reviews, 1 page a month" },
    { name: "Growth", hoursPerMonth: 25, priceUsd: 750, summary: "The full roadmap on this page", recommended: true },
    { name: "Competitive Growth", hoursPerMonth: 40, priceUsd: 1200, summary: "Growth plus faster link building and conversion work" },
  ],
  roadmap: [
    {
      label: "Months 1–3",
      name: "Foundation",
      focus: "Technical + Google profile + tracking",
      tasks: [
        { task: "Call tracking and analytics baseline", hours: 3 },
        { task: "Title, heading and speed fixes", hours: 6 },
        { task: "Google profile photos, posts and services", hours: 4 },
        { task: "Review request system", hours: 3 },
        { task: "First 3 service pages", hours: 9 },
      ],
    },
    {
      label: "Months 3–6",
      name: "Local build-out",
      focus: "City pages + citations + links",
      tasks: [
        { task: "5 city pages", hours: 10 },
        { task: "Water heater + repiping guides", hours: 5 },
        { task: "40+ local citations", hours: 5 },
        { task: "Local link outreach", hours: 5 },
      ],
    },
    {
      label: "Months 6–12",
      name: "Compound",
      focus: "Close gaps + Maps + conversion",
      tasks: [
        { task: "Keyword expansion and seasonal content", hours: 8 },
        { task: "Authority links", hours: 7 },
        { task: "East-side Maps push", hours: 5 },
        { task: "Landing page conversion tests + monthly rescans", hours: 5 },
      ],
    },
  ],
  modules: { dataforseo: true, leadsnap: true, semrush: true },
  budgetCapUsd: 5,
  dryRun: true,
  preparedOn: ON,
};

function kw(keyword: string, cluster: string, volume: number | null, cpc: number | null, kd: number | null, positions: Record<string, number | null>, money = false): KeywordRow {
  return { keyword, cluster, volume: f(volume), cpcUsd: f(cpc), difficulty: f(kd), positions, positionsSource: "sample", positionsRetrieved: ON, money };
}

const keywords: KeywordRow[] = [
  kw("plumber near me", "General / near me", 2400, 24.1, 18, { [CLIENT]: null, [C1]: 6, [C2]: null, [C3]: null, [C4]: 9, [C5]: null }),
  kw("emergency plumber near me", "General / near me", 880, 31.5, 15, { [CLIENT]: null, [C1]: 8, [C2]: 12, [C3]: null, [C4]: null, [C5]: null }),
  kw("plumber columbus", "City pages", 210, 19.8, 12, { [CLIENT]: 14, [C1]: 1, [C2]: null, [C3]: null, [C4]: 3, [C5]: null }, true),
  kw("plumbing company columbus", "City pages", 90, 17.2, 8, { [CLIENT]: 22, [C1]: 2, [C2]: null, [C3]: null, [C4]: 1, [C5]: null }, true),
  kw("plumber dayton", "City pages", 140, 18.4, 9, { [CLIENT]: null, [C1]: 11, [C2]: 1, [C3]: null, [C4]: null, [C5]: null }, true),
  kw("plumber akron", "City pages", 70, null, 6, { [CLIENT]: null, [C1]: null, [C2]: null, [C3]: null, [C4]: null, [C5]: 2 }, true),
  kw("drain cleaning columbus", "Drain cleaning", 170, 14.6, 10, { [CLIENT]: 31, [C1]: 4, [C2]: 7, [C3]: 2, [C4]: null, [C5]: null }, true),
  kw("clogged drain repair", "Drain cleaning", 320, 12.9, 14, { [CLIENT]: null, [C1]: null, [C2]: 9, [C3]: 5, [C4]: null, [C5]: null }),
  kw("water heater replacement columbus", "Water heaters", 110, 22.7, 7, { [CLIENT]: 19, [C1]: 3, [C2]: null, [C3]: null, [C4]: 6, [C5]: null }, true),
  kw("tankless water heater install", "Water heaters", 260, 26.3, 21, { [CLIENT]: null, [C1]: 15, [C2]: null, [C3]: null, [C4]: null, [C5]: null }),
  kw("whole house repipe cost", "Repiping", 90, 9.4, 11, { [CLIENT]: null, [C1]: null, [C2]: null, [C3]: null, [C4]: null, [C5]: null }),
  kw("sewer line repair", "Sewer", 210, null, null, { [CLIENT]: null, [C1]: 18, [C2]: null, [C3]: 4, [C4]: null, [C5]: null }),
];

function site(domain: string, v: Partial<Record<keyof Omit<SiteMetrics, "domain" | "footprint">, Fig>>, footprint: string[]): SiteMetrics {
  const nf = f(null);
  return {
    domain,
    gbpRating: v.gbpRating ?? nf,
    gbpReviews: v.gbpReviews ?? nf,
    gbpPhotos: v.gbpPhotos ?? nf,
    packPosition: v.packPosition ?? nf,
    organicKeywords: v.organicKeywords ?? nf,
    organicVisits: v.organicVisits ?? nf,
    packVisits: v.packVisits ?? nf,
    trafficValueUsd: v.trafficValueUsd ?? nf,
    backlinkRank: v.backlinkRank ?? nf,
    referringDomains: v.referringDomains ?? nf,
    semrushVisits: v.semrushVisits,
    footprint,
  };
}

const sites: SiteMetrics[] = [
  site(CLIENT, { gbpRating: f(4.8), gbpReviews: f(64), gbpPhotos: f(18), packPosition: f(0, "sample", "not surfaced in Maps for city terms"), organicKeywords: f(11), organicVisits: f(38), packVisits: f(96), trafficValueUsd: f(410), backlinkRank: f(58), referringDomains: f(31), semrushVisits: f(22) }, ["columbus"]),
  site(C1, { gbpRating: f(4.7), gbpReviews: f(412), gbpPhotos: f(240), packPosition: f(1), organicKeywords: f(58), organicVisits: f(310), packVisits: f(140), trafficValueUsd: f(3900), backlinkRank: f(204), referringDomains: f(150), semrushVisits: f(268) }, ["columbus", "dayton", "cincinnati", "toledo"]),
  site(C2, { gbpRating: f(4.9), gbpReviews: f(188), gbpPhotos: f(96), packPosition: f(2), organicKeywords: f(34), organicVisits: f(140), packVisits: f(85), trafficValueUsd: f(1700), backlinkRank: f(150), referringDomains: f(null), semrushVisits: f(155) }, ["dayton", "cincinnati", "ohio"]),
  site(C3, { gbpRating: f(4.6), gbpReviews: f(530), gbpPhotos: f(310), packPosition: f(3), organicKeywords: f(41), organicVisits: f(120), packVisits: f(60), trafficValueUsd: f(1250), backlinkRank: f(171), referringDomains: f(88), semrushVisits: f(null) }, ["cleveland", "akron"]),
  site(C4, { gbpRating: f(5.0), gbpReviews: f(97), gbpPhotos: f(40), packPosition: f(0), organicKeywords: f(22), organicVisits: f(95), packVisits: f(0), trafficValueUsd: f(880), backlinkRank: f(112), referringDomains: f(40), semrushVisits: f(71) }, ["columbus", "akron"]),
  site(C5, { gbpRating: f(4.8), gbpReviews: f(150), gbpPhotos: f(null), packPosition: f(0), organicKeywords: f(9), organicVisits: f(44), packVisits: f(30), trafficValueUsd: f(null), backlinkRank: f(80), referringDomains: f(19), semrushVisits: f(38) }, ["cincinnati"]),
];

/** Deterministic made-up grid: strong near the middle, weaker toward the east edge. */
function sampleGrid(term: string, base: number, eastPenalty: number, holes: [number, number][] = []): GeoGrid {
  const size = 7;
  const ranks = Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => {
      if (holes.some(([hr, hc]) => hr === r && hc === c)) return null;
      const dist = Math.abs(r - 3) + Math.abs(c - 2);
      const v = Math.round(base + dist * 0.9 + Math.max(0, c - 4) * eastPenalty + ((r * 7 + c * 3) % 3) - 1);
      return Math.max(1, Math.min(20, v));
    }),
  );
  return { term, size, spacingMiles: 1, ranks, source: "sample", retrieved: ON };
}

export const sampleAuditData: AuditData = {
  retrieved: ON,
  sourcesUsed: ["sample"],
  nearMeSearches: f(3070),
  demand: [
    { marketId: "columbus", searches: f(640) },
    { marketId: "dayton", searches: f(310) },
    { marketId: "cleveland", searches: f(150) },
    { marketId: "akron", searches: f(120) },
    { marketId: "cincinnati", searches: f(null) },
    { marketId: "toledo", searches: f(90) },
    { marketId: "ohio", searches: f(210) },
  ],
  keywords,
  sites,
  grids: [
    sampleGrid("plumber near me", 1.6, 3.2),
    sampleGrid("drain cleaning", 2.4, 3.6, [[6, 6]]),
    sampleGrid("water heater replacement", 3.6, 4.1, [[0, 6], [6, 5], [6, 6]]),
  ],
  scorecard: [
    { signal: "City pages", competitors: "Copperline: 4 city pages; Bluewater: Dayton page", client: "None: one page targets every town", grade: "gap", source: "sample" },
    { signal: "Review volume", competitors: "Top three in the map pack: 412 / 188 / 530", client: "64 (4.8★): good rating, slow growth", grade: "gap", source: "sample" },
    { signal: "Link authority", competitors: "Copperline: 150 referring domains", client: "31 referring domains", grade: "gap", source: "sample" },
    { signal: "Page titles", competitors: "\"Plumber in Columbus\" style titles", client: "Brand name only", grade: "partial", source: "sample" },
    { signal: "Technical health", competitors: "Varies", client: "Fast, HTTPS, mobile-friendly", grade: "good", source: "sample" },
    { signal: "Google profile content", competitors: "Harbor Rooter: 310 photos", client: "18 photos; services listed", grade: "partial", source: "sample" },
  ],
  narrative: {
    source: "sample",
    headline:
      "Riverbend is trusted in Columbus but nearly invisible beyond it: competitors with city pages and 3–8× the reviews take the searches in Dayton, Akron and Cincinnati.",
    pageNotes: {
      rankings: "Most money terms have no Riverbend page in the top 10. City-named searches are won by websites with a page for that city.",
      footprint: "Strong in central Columbus; ranks fade toward the east side, where two competitors are based.",
      competitors: "Riverbend's map-pack visits are close to the leaders. The website, not the Google profile, is the gap.",
      keywords: "Water heater searches cost the most per click, and only one competitor ranks in the top 3 for them: room for a strong local page.",
      revenue: "Even the conservative case pays for the recommended plan several times over, if the assumptions hold.",
    },
    fixes: [
      { title: "Build city × service pages", detail: "Columbus, Dayton, Akron, Cleveland, Cincinnati, Toledo: drains, water heaters, repiping." },
      { title: "Review program", detail: "Ask after every job; aim to pass 150 reviews within two quarters." },
      { title: "Close the east-side gap", detail: "East Columbus page, reviews from east-side jobs, east-side photos on the Google profile." },
      { title: "Authority and citations", detail: "31 → 80+ clean local referring domains (suppliers, associations, local news)." },
      { title: "On-page tune-up", detail: "Town-first title tags, one H1 per page, call tracking and analytics baseline." },
    ],
  },
  costLedger: [
    { source: "dataforseo", calls: 0, costUsd: 0 },
    { source: "leadsnap", calls: 0, costUsd: 0 },
    { source: "semrush", calls: 0, costUsd: 0 },
  ],
};
