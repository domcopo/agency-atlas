// SEO Watcher sample: FICTIONAL businesses in real US cities, made-up rankings and
// search volumes. Used only for the "Preview with sample data" screens; never mixed with
// or attached to a real client. Every figure's source is "sample".
//
// The numbers are generated from a fixed seed, so the preview looks the same every time.

import type { OpportunityInput, RankCheck, VolumeMonth, WatchClient, WatchData, WatchKeyword, WatchMarket } from "@/lib/watch/compute";

/** The sample's "today" (a fixed date so the preview never changes). */
export const WATCH_SAMPLE_TODAY = "2026-11-23";
const WEEKS = 26;

/** Small seeded random number generator (mulberry32): same numbers every run. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isoDaysBefore(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
}

interface ClientSeed {
  client: WatchClient;
  markets: Omit<WatchMarket, "clientId">[];
  keywords: { keyword: string; money: boolean; base: number; start: number }[];
  /** Positions gained per week (negative = slipping). */
  drift: number;
  competitors: { domain: string; start: number; drift: number }[];
  /** Busy months (Jan = 0) multiply search volume. */
  season: number[];
}

const SEEDS: ClientSeed[] = [
  {
    client: {
      id: "w-plumb",
      name: "Sample Plumbing Co (fictional)",
      domain: "samplepipes.example",
      niche: "Plumbing",
      services: ["Local SEO"],
      nextServices: ["Google Ads management", "Website rebuild"],
      startedOn: "2025-09-15",
      health: "good",
      openComplaint: false,
      lastMood: "positive",
      lastUpsellSentOn: "2026-10-01",
    },
    markets: [
      { id: "m-columbus", city: "Columbus", state: "OH", lat: 39.96, lng: -83.0 },
      { id: "m-dublin", city: "Dublin", state: "OH", lat: 40.1, lng: -83.11 },
    ],
    keywords: [
      { keyword: "plumber near me", money: true, base: 2400, start: 14 },
      { keyword: "emergency plumber", money: true, base: 880, start: 18 },
      { keyword: "water heater repair", money: true, base: 590, start: 11 },
      { keyword: "drain cleaning", money: false, base: 480, start: 9 },
      { keyword: "sewer line repair", money: false, base: 210, start: 24 },
    ],
    drift: 0.45,
    competitors: [
      { domain: "rapidrooter.example", start: 3, drift: 0 },
      { domain: "pipeline-pros.example", start: 5, drift: -0.05 },
      { domain: "buckeyedrains.example", start: 8, drift: 0.02 },
    ],
    season: [1.25, 1.2, 1.05, 0.95, 0.9, 0.9, 0.9, 0.9, 0.95, 1.0, 1.05, 1.2],
  },
  {
    client: {
      id: "w-roof",
      name: "Example Roofing (fictional)",
      domain: "exampleroofs.example",
      niche: "Roofing",
      services: ["Local SEO", "Website care"],
      nextServices: ["Google Ads management"],
      startedOn: "2024-04-01",
      health: "at_risk",
      openComplaint: true,
      lastMood: "negative",
      lastUpsellSentOn: null,
    },
    markets: [
      { id: "m-akron", city: "Akron", state: "OH", lat: 41.08, lng: -81.52 },
      { id: "m-canton", city: "Canton", state: "OH", lat: 40.8, lng: -81.38 },
    ],
    keywords: [
      { keyword: "roofing contractor", money: true, base: 1300, start: 4 },
      { keyword: "roof repair", money: true, base: 1000, start: 3 },
      { keyword: "roof replacement cost", money: false, base: 720, start: 7 },
      { keyword: "storm damage roof", money: true, base: 260, start: 5 },
      { keyword: "metal roofing", money: false, base: 390, start: 12 },
    ],
    drift: -0.32,
    competitors: [
      { domain: "summit-shingle.example", start: 16, drift: 0.55 },
      { domain: "topline-roofs.example", start: 2, drift: 0 },
      { domain: "lakeshore-exteriors.example", start: 9, drift: -0.03 },
    ],
    season: [0.6, 0.65, 0.9, 1.25, 1.35, 1.25, 1.1, 1.05, 1.1, 1.15, 0.9, 0.7],
  },
  {
    client: {
      id: "w-hvac",
      name: "Demo HVAC Pros (fictional)",
      domain: "demohvac.example",
      niche: "HVAC",
      services: ["Local SEO", "Google Ads management"],
      nextServices: ["Website rebuild"],
      startedOn: "2026-09-20",
      health: "good",
      openComplaint: false,
      lastMood: "neutral",
      lastUpsellSentOn: null,
    },
    markets: [
      { id: "m-pittsburgh", city: "Pittsburgh", state: "PA", lat: 40.44, lng: -79.99 },
      { id: "m-cranberry", city: "Cranberry Township", state: "PA", lat: 40.68, lng: -80.1 },
    ],
    keywords: [
      { keyword: "furnace repair", money: true, base: 1600, start: 8 },
      { keyword: "ac repair", money: true, base: 1900, start: 10 },
      { keyword: "hvac company", money: false, base: 720, start: 6 },
      { keyword: "heat pump installation", money: true, base: 320, start: 15 },
    ],
    drift: 0.04,
    competitors: [
      { domain: "three-rivers-air.example", start: 2, drift: 0 },
      { domain: "steelcity-comfort.example", start: 4, drift: 0.01 },
      { domain: "allegheny-hvac.example", start: 7, drift: 0.12 },
    ],
    season: [1.4, 1.3, 0.9, 0.7, 0.85, 1.3, 1.45, 1.35, 0.9, 0.8, 1.05, 1.35],
  },
  {
    client: {
      id: "w-elec",
      name: "Sample Electric (fictional)",
      domain: "sampleelectric.example",
      niche: "Electrician",
      services: ["Local SEO"],
      nextServices: ["Google Ads management", "Second-market SEO"],
      startedOn: "2025-06-01",
      health: "good",
      openComplaint: false,
      lastMood: "positive",
      lastUpsellSentOn: null,
    },
    markets: [
      { id: "m-indy", city: "Indianapolis", state: "IN", lat: 39.77, lng: -86.16 },
      { id: "m-carmel", city: "Carmel", state: "IN", lat: 39.98, lng: -86.13 },
    ],
    keywords: [
      { keyword: "electrician near me", money: true, base: 2900, start: 6 },
      { keyword: "panel upgrade", money: true, base: 390, start: 7 },
      { keyword: "ev charger installation", money: true, base: 480, start: 9 },
      { keyword: "generator installation", money: false, base: 320, start: 5 },
      { keyword: "electrical repair", money: false, base: 590, start: 4 },
    ],
    drift: 0.22,
    competitors: [
      { domain: "circle-city-electric.example", start: 3, drift: -0.04 },
      { domain: "hoosier-wiring.example", start: 6, drift: 0 },
      { domain: "brightline-electric.example", start: 10, drift: 0.02 },
    ],
    season: [0.95, 0.9, 1.0, 1.05, 1.05, 1.1, 1.1, 1.05, 1.0, 0.95, 0.9, 0.95],
  },
  {
    client: {
      id: "w-lawn",
      name: "Example Landscaping (fictional)",
      domain: "examplelawns.example",
      niche: "Landscaping",
      services: ["Local SEO"],
      nextServices: ["Google Business Profile care"],
      startedOn: "2026-02-10",
      health: "watch",
      openComplaint: false,
      lastMood: "neutral",
      lastUpsellSentOn: null,
    },
    markets: [{ id: "m-louisville", city: "Louisville", state: "KY", lat: 38.25, lng: -85.76 }],
    keywords: [
      { keyword: "landscaping company", money: true, base: 1000, start: 13 },
      { keyword: "lawn care service", money: true, base: 1300, start: 17 },
      { keyword: "hardscaping", money: false, base: 260, start: 21 },
      { keyword: "mulch delivery", money: false, base: 390, start: 26 },
    ],
    drift: 0.12,
    competitors: [
      { domain: "bluegrass-green.example", start: 2, drift: 0 },
      { domain: "derby-lawns.example", start: 4, drift: 0.02 },
      { domain: "riverbend-yards.example", start: 6, drift: -0.08 },
    ],
    season: [0.35, 0.45, 0.95, 1.6, 1.7, 1.5, 1.3, 1.15, 1.0, 0.85, 0.6, 0.4],
  },
  {
    client: {
      id: "w-dental",
      name: "Demo Dental Studio (fictional)",
      domain: "demodental.example",
      niche: "Dentist",
      services: ["Local SEO", "Website care"],
      nextServices: ["Google Ads management"],
      startedOn: "2025-11-01",
      health: "good",
      openComplaint: false,
      lastMood: "neutral",
      lastUpsellSentOn: "2026-09-10",
    },
    markets: [
      { id: "m-charlotte", city: "Charlotte", state: "NC", lat: 35.23, lng: -80.84 },
      { id: "m-matthews", city: "Matthews", state: "NC", lat: 35.12, lng: -80.72 },
    ],
    keywords: [
      { keyword: "dentist near me", money: true, base: 4400, start: 12 },
      { keyword: "teeth whitening", money: false, base: 880, start: 9 },
      { keyword: "dental implants", money: true, base: 720, start: 15 },
      { keyword: "emergency dentist", money: true, base: 590, start: 8 },
    ],
    drift: -0.02,
    competitors: [
      { domain: "queen-city-smiles.example", start: 3, drift: 0.01 },
      { domain: "carolina-family-dental.example", start: 5, drift: -0.02 },
      { domain: "southpark-dentistry.example", start: 7, drift: 0.18 },
    ],
    season: [1.15, 1.05, 1.0, 1.0, 0.95, 0.95, 1.0, 1.05, 1.0, 0.95, 0.9, 0.95],
  },
];

const clampPos = (p: number) => Math.max(1, Math.round(p));
const orNull = (p: number) => (p > 30 ? null : p);

function build(): WatchData {
  const rnd = seeded(20261123);
  const clients: WatchClient[] = [];
  const markets: WatchMarket[] = [];
  const keywords: WatchKeyword[] = [];
  const checks: RankCheck[] = [];
  const volumes: VolumeMonth[] = [];
  const competitors: { clientId: string; domain: string }[] = [];
  const dates = Array.from({ length: WEEKS }, (_, i) => isoDaysBefore(WATCH_SAMPLE_TODAY, (WEEKS - 1 - i) * 7));
  const lastMonth = WATCH_SAMPLE_TODAY.slice(0, 7);

  for (const s of SEEDS) {
    clients.push(s.client);
    for (const m of s.markets) markets.push({ ...m, clientId: s.client.id });
    for (const c of s.competitors) competitors.push({ clientId: s.client.id, domain: c.domain });
    s.keywords.forEach((k, ki) => {
      const id = `${s.client.id}-k${ki + 1}`;
      keywords.push({ id, clientId: s.client.id, keyword: k.keyword, money: k.money });
      s.markets.forEach((m, mi) => {
        const marketShift = mi * 3; // second market starts a little further back
        const scale = mi === 0 ? 1 : 0.35; // and is smaller
        // 24 months of search volume, seasonal, ~8% yearly growth, a little noise.
        for (let back = 23; back >= 0; back--) {
          const [y, mo] = lastMonth.split("-").map(Number) as [number, number];
          const total = y * 12 + (mo - 1) - back;
          const month = `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
          const growth = 1 + 0.08 * ((24 - back) / 12 - 1);
          const noise = 0.92 + rnd() * 0.16;
          const vol = Math.round((k.base * scale * s.season[total % 12]! * growth * noise) / 10) * 10;
          volumes.push({ keyword: k.keyword, marketId: m.id, month, volume: vol, source: "sample" });
        }
        dates.forEach((date, t) => {
          const raw = k.start + marketShift - s.drift * t + (rnd() - 0.5) * 2.4;
          const organic = orNull(clampPos(raw));
          const pack = organic !== null && organic <= 3 ? Math.min(3, organic) : organic !== null && organic <= 6 && rnd() < 0.4 ? 3 : 0;
          const others = s.competitors.map((c, ci) => ({
            domain: c.domain,
            position: clampPos(c.start + ki % 3 + mi * 2 - c.drift * t + (rnd() - 0.5) * 2 + ci * 0.1),
          }));
          checks.push({ keywordId: id, marketId: m.id, date, organic, pack, others, source: "sample" });
        });
      });
    });
  }
  return { clients, markets, keywords, checks, volumes, competitors };
}

export const watchSample: WatchData = build();

/** Opportunity markets for the preview: fictional figures for real cities. */
export interface SampleOpportunity {
  id: string;
  niche: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  input: OpportunityInput;
}

export const watchSampleOpportunities: SampleOpportunity[] = [
  { id: "o1", niche: "Roofing", city: "Mansfield", state: "OH", lat: 40.76, lng: -82.52, input: { demand: 1900, packReviewsAvg: 23, packNoWebsite: 2, difficulty: 18, milesFromBase: 25, nearbyClients: 1, conflict: false } },
  { id: "o2", niche: "HVAC", city: "Erie", state: "PA", lat: 42.13, lng: -80.09, input: { demand: 2600, packReviewsAvg: 64, packNoWebsite: 1, difficulty: 27, milesFromBase: 70, nearbyClients: 0, conflict: false } },
  { id: "o3", niche: "Plumbing", city: "Lima", state: "OH", lat: 40.74, lng: -84.11, input: { demand: 880, packReviewsAvg: 41, packNoWebsite: 0, difficulty: 22, milesFromBase: 40, nearbyClients: 1, conflict: false } },
  { id: "o4", niche: "Electrician", city: "Wheeling", state: "WV", lat: 40.06, lng: -80.72, input: { demand: 720, packReviewsAvg: 12, packNoWebsite: 2, difficulty: 15, milesFromBase: 55, nearbyClients: 1, conflict: false } },
  { id: "o5", niche: "Landscaping", city: "Zanesville", state: "OH", lat: 39.94, lng: -82.01, input: { demand: 480, packReviewsAvg: 9, packNoWebsite: 3, difficulty: null, milesFromBase: 60, nearbyClients: 0, conflict: false } },
  { id: "o6", niche: "Dentist", city: "Fort Wayne", state: "IN", lat: 41.08, lng: -85.14, input: { demand: 5400, packReviewsAvg: 310, packNoWebsite: 0, difficulty: 48, milesFromBase: 85, nearbyClients: 0, conflict: false } },
  { id: "o7", niche: "Roofing", city: "Lexington", state: "KY", lat: 38.04, lng: -84.5, input: { demand: 2400, packReviewsAvg: 120, packNoWebsite: 0, difficulty: 35, milesFromBase: null, nearbyClients: 1, conflict: false } },
  { id: "o8", niche: "Roofing", city: "Canton", state: "OH", lat: 40.8, lng: -81.38, input: { demand: 1000, packReviewsAvg: 30, packNoWebsite: 1, difficulty: 20, milesFromBase: 20, nearbyClients: 2, conflict: true } },
];

/** Made-up spending for the preview's "room" notices. */
export const watchSampleRoom = { spentUsd: 16.4, capUsd: 20, keywordsUsed: 23, keywordsMax: 25 };
