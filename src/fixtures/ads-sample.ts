// SAMPLE DATA — the same made-up plumbing company as the SEO sample, used to show the
// Google Ads audit template at $0. Every BUSINESS is fictional, every website ends in
// ".example", and no figure comes from a real business or a real Google Ads account.
// Only the city names are real.

import type { AdsData, AdsIntake, AdsPlan } from "@/lib/audit/ads";
import type { Fig, SourceId } from "@/lib/audit/data";

const ON = "2026-11-24";
const f = <T = number>(value: T | null, source: SourceId = "sample"): Fig<T> => ({ value, source, retrieved: ON });

export const sampleAdsIntake: AdsIntake = {
  company: "Riverbend Plumbing (sample)",
  domain: "riverbend-plumbing.example",
  niche: "Residential plumbing",
  hqTown: "Columbus",
  state: "OH",
  cities: ["Dublin", "Westerville", "Grove City"],
  services: ["Water heater installation", "Plumber", "Drain cleaning"],
  avgJobUsd: 1800,
  avgJobConfirmed: false,
  clickToLeadRate: 0.1,
  leadToJobRate: 0.3,
  budgetsUsd: [1500, 3000, 5000],
  competitors: [
    { name: "Copperline Plumbing (sample)", domain: "copperline-plumbing.example", town: "Columbus" },
    { name: "Bluewater Drains (sample)", domain: "bluewater-drains.example", town: "Dublin" },
    { name: "Harbor Rooter (sample)", domain: "harbor-rooter.example", town: "Westerville" },
  ],
  modules: { dataforseo: true, semrush: false },
};

export const sampleAdsPlans: AdsPlan[] = [
  { name: "Launch (sample)", feeUsd: 500, summary: "Setup, tracking and one campaign" },
  { name: "Grow (sample)", feeUsd: 900, summary: "Weekly tuning, ad tests, landing page advice", recommended: true },
  { name: "Dominate (sample)", feeUsd: 1500, summary: "Every service and town, Local Services Ads too" },
];

const kw = (keyword: string, searches: number, lo: number, hi: number, comp: number) => ({ keyword, searches: f(searches), cpcLowUsd: f(lo), cpcHighUsd: f(hi), competition: f(comp) });

export const sampleAdsData: AdsData = {
  retrieved: ON,
  sourcesUsed: ["sample"],
  searchesChecked: 5,
  keywords: [
    kw("plumber columbus", 4400, 18.5, 52.0, 81),
    kw("plumber near me", 3600, 21.0, 58.5, 86),
    kw("water heater installation columbus", 880, 14.25, 39.0, 64),
    kw("drain cleaning columbus", 720, 11.0, 31.5, 58),
    kw("emergency plumber columbus", 590, 24.0, 66.0, 79),
    kw("plumber dublin oh", 320, 16.0, 44.0, 61),
    kw("plumber westerville", 260, 15.5, 41.0, 57),
  ],
  bidders: [
    { name: "Copperline Plumbing (sample)", domain: "copperline-plumbing.example", adsSeen: f(5), paidClicks: f(1900), spendUsd: f(41000) },
    { name: "Bluewater Drains (sample)", domain: "bluewater-drains.example", adsSeen: f(3), paidClicks: f(620), spendUsd: f(12500) },
    { name: "Harbor Rooter (sample)", domain: "harbor-rooter.example", adsSeen: f(4), paidClicks: f(1100), spendUsd: f(23800) },
  ],
  client: {
    runningAds: f<boolean>(false),
    adPage: f<string>(null),
    mobileSpeed: f(38),
    callButton: f<boolean>(false),
    form: f<boolean>(true),
    lsaShown: f<boolean>(true),
  },
};
