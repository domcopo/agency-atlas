// Google Ads audit (docs/AUDITS_HUB_ADS_LEADERBOARD_PLAN.md Phase 3): checkpoints, what a rep
// types (intake) and its strict check, the owner's ad-management plans, the shape of the
// collected data, and the money math. Pure: no database, no network, no AI.
//
// Same rules as the SEO audit: every figure is a sourced `Fig` (null = "not found"); money
// is a labeled model with its inputs shown; rates stay "assumption" until the client
// confirms them; plan prices come only from the owner's settings; no emails or phone
// numbers anywhere. The database keeps the checkpoint ids in a check rule
// (supabase/migrations/0029_ads_audits.sql); a test makes sure they match.

import type { Fig, SourceId } from "./data";
import { parseIntake, type AuditIntake } from "./intake";

// ---------------------------------------------------------------------------
// Checkpoints
// ---------------------------------------------------------------------------

export const ADS_SECTION_IDS = ["ads_market", "ads_cpc", "ads_calculator", "ads_bidders", "ads_spend", "ads_running", "ads_landing", "ads_lsa", "ads_plan"] as const;
export type AdsSectionId = (typeof ADS_SECTION_IDS)[number];

export interface AdsSection {
  id: AdsSectionId;
  label: string;
  detail: string;
  always?: boolean;
  defaultOn: boolean;
}

export const ADS_SECTIONS: readonly AdsSection[] = [
  { id: "ads_market", label: "Market size", detail: "Searches a month for their services in their area, and the headline: what a budget could bring in.", always: true, defaultOn: true },
  { id: "ads_cpc", label: "Cost per click", detail: "Low and high price per click for each money keyword, and how crowded each one is.", defaultOn: true },
  { id: "ads_calculator", label: "Budget calculator", detail: "For each budget: clicks → leads (1 in 10) → jobs (close rate) → revenue and return per $1.", defaultOn: true },
  { id: "ads_bidders", label: "Who's bidding", detail: "Which competitors show ads on their key searches, and what the ads say.", defaultOn: true },
  { id: "ads_spend", label: "Competitor ad spend", detail: "Estimated monthly paid clicks and spend per competitor (third-party estimate).", defaultOn: true },
  { id: "ads_running", label: "Are they running ads now?", detail: "Whether the business shows up in ads today, and which page the ad opens.", defaultOn: true },
  { id: "ads_landing", label: "Landing page check", detail: "Does the ad's page load fast on phones, with a call button and a form.", defaultOn: false },
  { id: "ads_lsa", label: "Local Services Ads", detail: "Whether the \"Google Guaranteed\" spots show for their trade in their town.", defaultOn: false },
  { id: "ads_plan", label: "Plan + investment", detail: "Ad budget plus our management fee, and the ramp-up timeline.", defaultOn: true },
];

export const ADS_PRESETS: readonly { id: string; label: string; sections: readonly AdsSectionId[] }[] = [
  { id: "quick", label: "Quick look", sections: ["ads_market", "ads_cpc", "ads_calculator", "ads_plan"] },
  { id: "full", label: "Full Google Ads", sections: ADS_SECTION_IDS },
  { id: "competitors", label: "Competitor focus", sections: ["ads_market", "ads_bidders", "ads_spend", "ads_running", "ads_plan"] },
];

export const DEFAULT_ADS_SECTIONS: AdsSectionId[] = ADS_SECTIONS.filter((s) => s.defaultOn).map((s) => s.id);

const VALID = new Set<string>(ADS_SECTION_IDS);

/** Known ids only, in the standard order, the cover always in. */
export function parseAdsSections(raw: unknown): AdsSectionId[] {
  const list = Array.isArray(raw) ? raw : [];
  const picked = new Set(list.filter((v): v is string => typeof v === "string" && VALID.has(v)));
  picked.add("ads_market");
  return ADS_SECTION_IDS.filter((id) => picked.has(id));
}

/** Deck pages in order. Bidders + spend share a page; running + landing + LSA share one. */
export type AdsPageKey = "market" | "cpc" | "calculator" | "competitors" | "today" | "plan";

export function adsDeckPages(sections: readonly AdsSectionId[]): AdsPageKey[] {
  const on = new Set(sections);
  const pages: AdsPageKey[] = ["market"];
  if (on.has("ads_cpc")) pages.push("cpc");
  if (on.has("ads_calculator")) pages.push("calculator");
  if (on.has("ads_bidders") || on.has("ads_spend")) pages.push("competitors");
  if (on.has("ads_running") || on.has("ads_landing") || on.has("ads_lsa")) pages.push("today");
  if (on.has("ads_plan")) pages.push("plan");
  return pages;
}

export const ADS_PAGE_LABEL: Record<AdsPageKey, string> = {
  market: "Market size",
  cpc: "Cost per click",
  calculator: "Budget calculator",
  competitors: "Who's bidding",
  today: "Their ads today",
  plan: "Plan + investment",
};

// ---------------------------------------------------------------------------
// Intake
// ---------------------------------------------------------------------------

export interface AdsIntake extends Omit<AuditIntake, "visitToJobRate" | "wantsAds" | "modules"> {
  /** Share of ad clicks that become leads (calls / forms), 0.01–0.5. Default 10% ("1 in 10"). */
  clickToLeadRate: number;
  /** Share of leads that become jobs, 0.05–1. Default 30%. */
  leadToJobRate: number;
  /** Monthly ad budgets to compare (1–3, ascending), $100–$100,000 each. */
  budgetsUsd: number[];
  modules: { dataforseo: boolean; semrush: boolean };
}

export const ADS_LIMITS = { clickMin: 0.01, clickMax: 0.5, closeMin: 0.05, closeMax: 1, budgetMin: 100, budgetMax: 100_000, budgets: 3 } as const;
export const ADS_DEFAULTS = { clickToLeadRate: 0.1, leadToJobRate: 0.3, budgetsUsd: [1500, 3000, 5000] } as const;

export type AdsIntakeResult = { ok: true; intake: AdsIntake } | { ok: false; errors: string[] };

/** "10" (a percent from the form) → 0.1; a number from the database stays as is. */
function share(v: unknown, fallback: number): number {
  if (v === undefined || v === null || v === "") return fallback;
  if (typeof v === "string") return Number(v.replace(/[%\s]/g, "")) / 100;
  return typeof v === "number" ? v : NaN;
}

/**
 * Checks Ads intake from anywhere (the form, the database). The business, area, money and
 * competitor fields use the SEO audit's own check (same rules: no emails or phones, real
 * domains, US state); the Ads-only fields are checked here. Unknown fields are dropped.
 */
export function parseAdsIntake(raw: unknown): AdsIntakeResult {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!r) return { ok: false, errors: ["Intake must be an object."] };
  const mo = r.modules && typeof r.modules === "object" ? (r.modules as Record<string, unknown>) : {};
  const on = (v: unknown, dflt: boolean) => (v === undefined ? dflt : v === true || v === "on");
  const base = parseIntake({ ...r, visitToJobRate: 0.03, wantsAds: false, modules: { dataforseo: true, leadsnap: false, semrush: false } });
  const errors = base.ok ? [] : [...base.errors];

  const rate = (v: unknown, fallback: number, label: string, min: number, max: number) => {
    const n = share(v, fallback);
    if (!Number.isFinite(n)) errors.push(`${label} must be a number.`);
    else if (n < min || n > max) errors.push(`${label} must be between ${Math.round(min * 100)}% and ${Math.round(max * 100)}%.`);
    return Math.round((Number.isFinite(n) ? n : fallback) * 10000) / 10000;
  };
  const clickToLeadRate = rate(r.clickToLeadRate, ADS_DEFAULTS.clickToLeadRate, "Clicks that become leads", ADS_LIMITS.clickMin, ADS_LIMITS.clickMax);
  const leadToJobRate = rate(r.leadToJobRate, ADS_DEFAULTS.leadToJobRate, "Leads that become jobs", ADS_LIMITS.closeMin, ADS_LIMITS.closeMax);

  const budgetsRaw = Array.isArray(r.budgetsUsd) ? r.budgetsUsd : [...ADS_DEFAULTS.budgetsUsd];
  const budgets: number[] = [];
  for (const b of budgetsRaw.slice(0, ADS_LIMITS.budgets + 2)) {
    if (b === "" || b === null || b === undefined) continue;
    const n = typeof b === "number" ? b : typeof b === "string" ? Number(b.replace(/[$,\s]/g, "")) : NaN;
    if (!Number.isFinite(n) || n < ADS_LIMITS.budgetMin || n > ADS_LIMITS.budgetMax) {
      errors.push(`Each monthly budget must be $${ADS_LIMITS.budgetMin}–$${ADS_LIMITS.budgetMax.toLocaleString("en-US")}.`);
      continue;
    }
    const rounded = Math.round(n);
    if (!budgets.includes(rounded)) budgets.push(rounded);
  }
  if (budgets.length > ADS_LIMITS.budgets) errors.push(`Compare at most ${ADS_LIMITS.budgets} budgets.`);
  if (!budgets.length) errors.push("Add at least one monthly ad budget to compare.");

  if (errors.length || !base.ok) return { ok: false, errors: [...new Set(errors)] };
  const b = base.intake;
  return {
    ok: true,
    intake: {
      company: b.company,
      domain: b.domain,
      ...(b.gbpUrl ? { gbpUrl: b.gbpUrl } : {}),
      niche: b.niche,
      hqTown: b.hqTown,
      state: b.state,
      cities: b.cities,
      services: b.services,
      avgJobUsd: b.avgJobUsd,
      avgJobConfirmed: b.avgJobConfirmed,
      competitors: b.competitors,
      ...(b.notes ? { notes: b.notes } : {}),
      clickToLeadRate,
      leadToJobRate,
      budgetsUsd: budgets.slice(0, ADS_LIMITS.budgets).sort((a, b) => a - b),
      modules: { dataforseo: on(mo.dataforseo, true), semrush: on(mo.semrush, false) },
    },
  };
}

// ---------------------------------------------------------------------------
// Owner's ad-management plans (audit_settings.ads_plans, 0029)
// ---------------------------------------------------------------------------

export interface AdsPlan {
  name: string;
  /** Our monthly management fee. The ad budget itself is paid to Google, separately. */
  feeUsd: number;
  summary: string;
  recommended?: boolean;
}

/** Plans from the database or the form, checked; anything odd is dropped. */
export function parseAdsPlans(raw: unknown): AdsPlan[] {
  if (!Array.isArray(raw)) return [];
  const out: AdsPlan[] = [];
  for (const p of raw.slice(0, 4)) {
    const o = p && typeof p === "object" ? (p as Record<string, unknown>) : null;
    if (!o) continue;
    const name = typeof o.name === "string" ? o.name.trim().slice(0, 40) : "";
    const fee = typeof o.feeUsd === "number" ? o.feeUsd : NaN;
    if (!name || !Number.isFinite(fee) || fee < 0 || fee > 100_000) continue;
    const plan: AdsPlan = { name, feeUsd: Math.round(fee), summary: (typeof o.summary === "string" ? o.summary.trim().slice(0, 120) : "") || "Google Ads management" };
    if (o.recommended === true && !out.some((x) => x.recommended)) plan.recommended = true;
    out.push(plan);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Collected data (what the custom prompt's run returns; "not pulled yet" until then)
// ---------------------------------------------------------------------------

export interface AdsKeyword {
  keyword: string;
  searches: Fig;
  cpcLowUsd: Fig;
  cpcHighUsd: Fig;
  /** Google's competition index, 0–100. */
  competition: Fig;
}

export interface AdsBidder {
  name: string;
  domain: string;
  /** On how many of the checked searches they showed an ad. */
  adsSeen: Fig;
  /** Third-party estimates, labeled "estimate" on the page. */
  paidClicks: Fig;
  spendUsd: Fig;
}

export interface AdsData {
  retrieved: string;
  sourcesUsed: SourceId[];
  /** How many money searches were checked live for ads. */
  searchesChecked: number;
  keywords: AdsKeyword[];
  bidders: AdsBidder[];
  client: {
    runningAds: Fig<boolean>;
    adPage: Fig<string>;
    mobileSpeed: Fig;
    callButton: Fig<boolean>;
    form: Fig<boolean>;
    lsaShown: Fig<boolean>;
  };
}

export interface AdsBundle {
  id: string;
  sample: boolean;
  agencyName: string;
  agencyWebsite: string | null;
  intake: AdsIntake;
  plans: AdsPlan[];
  data: AdsData;
}

const pending = <T = number>(retrieved: string): Fig<T> => ({ value: null, source: "pending", retrieved });

/** Every figure "not found" (not pulled yet): the keywords the run will price, the named competitors. */
export function emptyAdsData(intake: AdsIntake, retrieved: string): AdsData {
  const words = intake.services.slice(0, 6).map((s) => `${s.toLowerCase()} ${intake.hqTown.toLowerCase()}`);
  return {
    retrieved,
    sourcesUsed: [],
    searchesChecked: 0,
    keywords: words.map((keyword) => ({ keyword, searches: pending(retrieved), cpcLowUsd: pending(retrieved), cpcHighUsd: pending(retrieved), competition: pending(retrieved) })),
    bidders: intake.competitors.map((c) => ({ name: c.name, domain: c.domain, adsSeen: pending(retrieved), paidClicks: pending(retrieved), spendUsd: pending(retrieved) })),
    client: {
      runningAds: pending<boolean>(retrieved),
      adPage: pending<string>(retrieved),
      mobileSpeed: pending(retrieved),
      callButton: pending<boolean>(retrieved),
      form: pending<boolean>(retrieved),
      lsaShown: pending<boolean>(retrieved),
    },
  };
}

// ---------------------------------------------------------------------------
// Money math (always a model; every input is printed next to it)
// ---------------------------------------------------------------------------

export interface AdsMarket {
  /** Searches a month across the priced keywords (null = none found yet). */
  searches: number | null;
  /** Search-weighted typical cost per click: the middle of each keyword's low–high range. */
  cpcUsd: number | null;
  keywordsPriced: number;
}

/** The middle of a keyword's price range (or whichever end was found). */
export function midCpc(k: AdsKeyword): number | null {
  const lo = k.cpcLowUsd.value;
  const hi = k.cpcHighUsd.value;
  if (lo !== null && hi !== null) return (lo + hi) / 2;
  return lo ?? hi ?? null;
}

export function adsMarket(data: AdsData): AdsMarket {
  let searches = 0;
  let anySearches = false;
  let weight = 0;
  let weighted = 0;
  let priced = 0;
  for (const k of data.keywords) {
    const s = k.searches.value;
    if (s !== null && s >= 0) {
      searches += s;
      anySearches = true;
    }
    const c = midCpc(k);
    if (c !== null && c > 0) {
      priced += 1;
      const w = s !== null && s > 0 ? s : 1;
      weight += w;
      weighted += c * w;
    }
  }
  return { searches: anySearches ? searches : null, cpcUsd: weight > 0 ? Math.round((weighted / weight) * 100) / 100 : null, keywordsPriced: priced };
}

export interface BudgetRow {
  budgetUsd: number;
  clicks: number | null;
  leads: number | null;
  jobs: number | null;
  revenueUsd: number | null;
  /** Modeled job revenue per $1 of ad budget (management fee not included). */
  returnPerDollar: number | null;
  costPerLeadUsd: number | null;
  /** The budget buys more clicks than the market has searches. */
  overMarket: boolean;
}

/** budget ÷ cost per click = clicks → × click-to-lead → leads → × lead-to-job → jobs → × average job. */
export function budgetRows(intake: AdsIntake, market: AdsMarket): BudgetRow[] {
  return intake.budgetsUsd.map((budgetUsd) => {
    if (market.cpcUsd === null || market.cpcUsd <= 0) {
      return { budgetUsd, clicks: null, leads: null, jobs: null, revenueUsd: null, returnPerDollar: null, costPerLeadUsd: null, overMarket: false };
    }
    const clicks = budgetUsd / market.cpcUsd;
    const leads = clicks * intake.clickToLeadRate;
    const jobs = leads * intake.leadToJobRate;
    const revenueUsd = jobs * intake.avgJobUsd;
    return {
      budgetUsd,
      clicks: Math.round(clicks),
      leads: Math.round(leads * 10) / 10,
      jobs: Math.round(jobs * 10) / 10,
      revenueUsd: Math.round(revenueUsd),
      returnPerDollar: Math.round((revenueUsd / budgetUsd) * 10) / 10,
      costPerLeadUsd: leads > 0 ? Math.round(budgetUsd / leads) : null,
      overMarket: market.searches !== null && clicks > market.searches,
    };
  });
}

/** The middle budget is the headline on the cover. */
export function headlineBudget(rows: BudgetRow[]): BudgetRow | null {
  return rows[Math.floor((rows.length - 1) / 2)] ?? null;
}
