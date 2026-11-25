// What a rep types to start an audit ("intake"), the strict check for it, and how it
// becomes full audit settings (AuditConfig) plus an empty data set ("not pulled yet").
//
// Rules: every money figure and rate stays "assumption" unless the rep says the client
// confirmed it; plan prices come only from the owner's audit settings; no personal
// contact details (emails, phone numbers) are accepted anywhere.
// Pure: no database, no network, no AI.

import { AUDIT_DEFAULTS, type AuditConfig, type AuditPlan, type RoadmapPhase } from "./config";
import type { AuditData, Fig, SiteMetrics } from "./data";
import { stateName, US_STATES } from "./geo";
import { cleanPlaces, splitPlace, unknownPlaceMessage, type PlaceBook } from "./places";

export interface IntakeCompetitor {
  name: string;
  domain: string;
  town?: string;
}

export interface AuditIntake {
  company: string;
  /** Bare domain, e.g. "example.com". */
  domain: string;
  gbpUrl?: string;
  niche: string;
  hqTown: string;
  /** Two-letter US state code. */
  state: string;
  /** Other cities they serve (besides the home town). */
  cities: string[];
  services: string[];
  avgJobUsd: number;
  /** true = the client gave this number; false = our assumption. */
  avgJobConfirmed: boolean;
  /** Share of search visits that become jobs, 0.005–0.10. */
  visitToJobRate: number;
  competitors: IntakeCompetitor[];
  modules: { dataforseo: boolean; leadsnap: boolean; semrush: boolean };
  /** Asked for a Google Ads audit too (its own plan; recorded now, built later). */
  wantsAds: boolean;
  notes?: string;
}

export const INTAKE_LIMITS = {
  text: 80,
  notes: 500,
  cities: 12,
  services: 8,
  competitors: 5,
  avgJobMin: 50,
  avgJobMax: 1_000_000,
  rateMin: 0.005,
  rateMax: 0.1,
} as const;

export const INTAKE_DEFAULTS = { visitToJobRate: 0.03, ringsMiles: [25, 50], goalMonths: 12 } as const;

/** Reused from saved results for this long; after that a refresh is offered (Phase B). */
export const AUDIT_REUSE_DAYS = 30;

export type IntakeResult = { ok: true; intake: AuditIntake } | { ok: false; errors: string[] };

const DOMAIN = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/;
const PHONE = /(^|[^0-9])\(?[0-9]{3}\)?[-. ]?[0-9]{3}[-. ][0-9]{4}([^0-9]|$)/;

/** "email address" / "phone number" when the text holds one (no personal contact details anywhere). */
export function contactDetailIn(text: string): string | null {
  return EMAIL.test(text) ? "email address" : PHONE.test(text) ? "phone number" : null;
}

/** "https://www.Example.com/about?x=1" → "example.com". Anything odd stays as typed so the check can refuse it. */
export function normalizeDomain(raw: string): string {
  let d = raw.trim().toLowerCase();
  d = d.replace(/^[a-z]+:\/\//, "").replace(/^www\./, "");
  d = d.split(/[/?#]/)[0] ?? "";
  return d.replace(/:\d+$/, "").replace(/\.$/, "");
}

/** Splits "Folsom, Roseville; Davis" into clean names. */
export function splitList(raw: string): string[] {
  return raw
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Checks intake from anywhere (the form, the database) and returns a clean copy or
 * plain-English problems. Unknown fields are dropped.
 */
export interface IntakeOptions {
  /**
   * Saving from the form only: check the home town and cities against Google's place list
   * (src/lib/audit/places-list.ts) and use Google's exact spelling. Left out when reading
   * saved audits, so an older audit never becomes unreadable.
   */
  places?: (state: string) => PlaceBook | null;
}

export function parseIntake(raw: unknown, opts: IntakeOptions = {}): IntakeResult {
  const errors: string[] = [];
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!r) return { ok: false, errors: ["Intake must be an object."] };

  const clean = (v: unknown) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() : "");
  const noContacts = (t: string, label: string) => {
    if (EMAIL.test(t)) errors.push(`${label}: leave out email addresses.`);
    else if (PHONE.test(t)) errors.push(`${label}: leave out phone numbers.`);
  };
  const text = (v: unknown, label: string, optional = false, max: number = INTAKE_LIMITS.text): string => {
    const t = clean(v);
    if (!t && !optional) errors.push(`${label} is required.`);
    if (t.length > max) errors.push(`${label} is too long (max ${max} characters).`);
    if (t) noContacts(t, label);
    return t.slice(0, max);
  };
  const domain = (v: unknown, label: string): string => {
    const d = normalizeDomain(clean(v));
    if (!d) errors.push(`${label} is required.`);
    else if (!DOMAIN.test(d)) errors.push(`${label} must be a website like example.com.`);
    return d;
  };
  const names = (v: unknown, label: string, max: number): string[] => {
    const list = (Array.isArray(v) ? v : typeof v === "string" ? splitList(v) : []).map(clean).filter(Boolean);
    if (list.length > max) errors.push(`${label}: at most ${max}.`);
    const out: string[] = [];
    for (const n of list.slice(0, max)) {
      if (n.length > INTAKE_LIMITS.text) errors.push(`${label}: "${n.slice(0, 20)}…" is too long. Keep each one under ${INTAKE_LIMITS.text} characters and put a comma between them.`);
      noContacts(n, label);
      if (!out.some((o) => o.toLowerCase() === n.toLowerCase())) out.push(n.slice(0, INTAKE_LIMITS.text));
    }
    return out;
  };
  const number = (v: unknown, label: string, min: number, max: number): number => {
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.replace(/[$,%\s]/g, "")) : NaN;
    if (!Number.isFinite(n)) {
      errors.push(`${label} must be a number.`);
      return min;
    }
    if (n < min || n > max) errors.push(`${label} must be between ${min.toLocaleString("en-US")} and ${max.toLocaleString("en-US")}.`);
    return n;
  };

  const company = text(r.company, "Business name");
  const site = domain(r.domain, "Website");
  const gbpRaw = clean(r.gbpUrl);
  if (gbpRaw && !/^https:\/\/[^\s]{4,180}$/.test(gbpRaw)) errors.push("Google Business Profile link must start with https://.");
  const niche = text(r.niche, "Type of business");
  const state = clean(r.state).toUpperCase();
  // One clean place name (e.g. "Warren, OH" → "Warren"); see src/lib/audit/places.ts.
  const hqTyped = text(r.hqTown, "Home town");
  let hqTown = US_STATES[state] && hqTyped ? (splitPlace(hqTyped, state)[0] ?? hqTyped) : hqTyped;
  const book = US_STATES[state] && opts.places ? opts.places(state) : null;
  if (book && hqTown) {
    const exact = book.canonical(hqTown);
    if (exact) hqTown = exact;
    else errors.push(unknownPlaceMessage("Home town", hqTown, state, book.suggest(hqTown)));
  }
  if (!US_STATES[state]) errors.push("Pick the state.");
  // "Westminster & Thornton", "Trumbull and Columbiana County" → one place per entry.
  const typedCities = names(r.cities, "Other cities", INTAKE_LIMITS.cities * 2);
  const cities = (US_STATES[state] ? cleanPlaces(typedCities, state) : typedCities)
    .map((c) => {
      if (!book) return c;
      const exact = book.canonical(c);
      if (!exact) errors.push(unknownPlaceMessage("Other cities", c, state, book.suggest(c)));
      return exact ?? c;
    })
    .filter((c, i, all) => c.toLowerCase() !== hqTown.toLowerCase() && all.findIndex((x) => x.toLowerCase() === c.toLowerCase()) === i);
  if (cities.length > INTAKE_LIMITS.cities) errors.push(`Other cities: at most ${INTAKE_LIMITS.cities} (after splitting combined entries).`);
  const servicesTyped = names(r.services, "Services", INTAKE_LIMITS.services);
  const services = servicesTyped.length ? servicesTyped : niche ? [niche] : [];
  const avgJobUsd = Math.round(number(r.avgJobUsd, "Average job", INTAKE_LIMITS.avgJobMin, INTAKE_LIMITS.avgJobMax));
  const avgJobConfirmed = r.avgJobConfirmed === true || r.avgJobConfirmed === "on";
  // The form sends a percent ("3"); the database keeps a share (0.03).
  const rateRaw = r.visitToJobRate ?? INTAKE_DEFAULTS.visitToJobRate;
  const rateNum = typeof rateRaw === "string" ? Number(rateRaw.replace(/[%\s]/g, "")) / 100 : rateRaw;
  const visitToJobRate = number(rateNum, "Visits that become jobs", INTAKE_LIMITS.rateMin, INTAKE_LIMITS.rateMax);

  const compsRaw = Array.isArray(r.competitors) ? r.competitors : [];
  if (compsRaw.length > INTAKE_LIMITS.competitors) errors.push(`Competitors: at most ${INTAKE_LIMITS.competitors}.`);
  const competitors: IntakeCompetitor[] = [];
  compsRaw.slice(0, INTAKE_LIMITS.competitors).forEach((c, i) => {
    const o = c && typeof c === "object" ? (c as Record<string, unknown>) : {};
    const nm = clean(o.name);
    const dm = clean(o.domain);
    if (!nm && !dm) return; // an empty row is simply skipped
    const comp: IntakeCompetitor = { name: text(o.name, `Competitor ${i + 1} name`), domain: domain(o.domain, `Competitor ${i + 1} website`) };
    const town = text(o.town, `Competitor ${i + 1} town`, true);
    if (town) comp.town = town;
    competitors.push(comp);
  });
  const sites = [site, ...competitors.map((c) => c.domain)].filter(Boolean);
  if (new Set(sites).size !== sites.length) errors.push("Each website can appear only once (the business and its competitors).");

  const mo = r.modules && typeof r.modules === "object" ? (r.modules as Record<string, unknown>) : {};
  const on = (v: unknown, dflt: boolean) => (v === undefined ? dflt : v === true || v === "on");
  const modules = { dataforseo: on(mo.dataforseo, true), leadsnap: on(mo.leadsnap, true), semrush: on(mo.semrush, false) };
  const wantsAds = r.wantsAds === true || r.wantsAds === "on";
  const notes = text(r.notes, "Notes", true, INTAKE_LIMITS.notes);

  if (errors.length) return { ok: false, errors: [...new Set(errors)] };
  return {
    ok: true,
    intake: {
      company,
      domain: site,
      ...(gbpRaw ? { gbpUrl: gbpRaw } : {}),
      niche,
      hqTown,
      state,
      cities,
      services,
      avgJobUsd,
      avgJobConfirmed,
      visitToJobRate: Math.round(visitToJobRate * 10000) / 10000,
      competitors,
      modules,
      wantsAds,
      ...(notes ? { notes } : {}),
    },
  };
}

/** The owner's audit settings that feed every audit (from audit_settings). */
export interface AuditAgencySettings {
  agencyName: string | null;
  agencyWebsite: string | null;
  plans: AuditPlan[];
  perAuditUsd: number;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36) || "market";

/**
 * A generic 12-month roadmap (no client data), sized to the recommended plan's monthly
 * hours so no phase plans more hours than the plan includes.
 */
export function defaultRoadmap(hoursPerMonth: number): RoadmapPhase[] {
  const h = Math.min(400, Math.round(hoursPerMonth));
  if (!(h >= 8)) return []; // too few hours to split into a roadmap
  const share = (parts: [string, number][]) => parts.map(([task, w]) => ({ task, hours: Math.max(1, Math.floor(h * w)) }));
  return [
    { label: "Months 1–3", name: "Foundation", focus: "Technical fixes, Google profile, tracking", tasks: share([["Call tracking and analytics baseline", 0.12], ["Title, heading and speed fixes", 0.24], ["Google profile clean-up and posts", 0.16], ["Review request system", 0.12], ["First service pages", 0.34]]) },
    { label: "Months 3–6", name: "Local build-out", focus: "City pages, citations, links", tasks: share([["City pages for the areas served", 0.4], ["Helpful guides for top services", 0.2], ["Local citations", 0.2], ["Local link outreach", 0.2]]) },
    { label: "Months 6–12", name: "Compound", focus: "Close gaps, Maps, conversion", tasks: share([["Keyword expansion and seasonal content", 0.32], ["Authority links", 0.28], ["Maps ranking work", 0.2], ["Conversion improvements", 0.2]]) },
  ];
}

/** Turns intake + the owner's settings into full audit settings that pass parseAuditConfig. */
export function buildAuditConfig(intake: AuditIntake, settings: AuditAgencySettings, preparedOn: string): AuditConfig {
  const used = new Set<string>();
  const marketId = (name: string) => {
    let id = slug(name);
    for (let n = 2; used.has(id); n++) id = `${slug(name).slice(0, 33)}-${n}`;
    used.add(id);
    return id;
  };
  const markets = [
    { id: marketId(intake.hqTown), name: intake.hqTown, kind: "town" as const, hq: true },
    ...intake.cities.map((c) => ({ id: marketId(c), name: c, kind: "town" as const })),
  ];
  // Equal share per service, rounded so the total is exactly 100%.
  const n = intake.services.length;
  const each = Math.floor(1000 / n) / 1000;
  const services = intake.services.map((name, i) => ({
    name,
    mixShare: i === n - 1 ? Math.round((1 - each * (n - 1)) * 1000) / 1000 : each,
    jobValueUsd: { value: intake.avgJobUsd, basis: intake.avgJobConfirmed ? ("client_supplied" as const) : ("assumption" as const) },
  }));
  const rec = settings.plans.find((p) => p.recommended) ?? settings.plans[0];
  const leadRate = 0.1;
  return {
    kind: "seo",
    agency: { name: settings.agencyName || "Your agency", ...(settings.agencyWebsite ? { website: settings.agencyWebsite } : {}) },
    company: {
      name: intake.company,
      domain: intake.domain,
      ...(intake.gbpUrl ? { gbpUrl: intake.gbpUrl } : {}),
      niche: intake.niche,
      hqTown: intake.hqTown,
      region: stateName(intake.state),
    },
    map: { state: intake.state, ringsMiles: [...INTAKE_DEFAULTS.ringsMiles] },
    markets,
    services,
    competitors: intake.competitors.map((c) => ({ name: c.name, domain: c.domain, town: c.town ?? intake.hqTown })),
    // visits → jobs = lead rate × close rate, kept equal to the rep's visit-to-job rate.
    funnel: {
      leadRate: { value: leadRate, basis: "assumption" },
      closeRate: { value: Math.round((intake.visitToJobRate / leadRate) * 10000) / 10000, basis: "assumption" },
    },
    scenarios: AUDIT_DEFAULTS.scenarios.map((s) => ({ ...s })),
    baselineScenario: "Baseline",
    competitorRevenue: { visitToJobRate: { value: intake.visitToJobRate, basis: "assumption" } },
    goal: { months: INTAKE_DEFAULTS.goalMonths },
    plans: settings.plans.map((p) => ({ ...p })),
    roadmap: defaultRoadmap(rec?.hoursPerMonth ?? 20),
    modules: { ...intake.modules },
    budgetCapUsd: Math.max(0, Math.min(50, settings.perAuditUsd)),
    dryRun: true,
    preparedOn,
  };
}

const pending = (retrieved: string): Fig => ({ value: null, source: "pending", retrieved });

/** Every figure "not found" (source: not pulled yet), so pages show the layout honestly. */
export function emptyAuditData(config: AuditConfig, retrieved: string): AuditData {
  const site = (domain: string): SiteMetrics => ({
    domain,
    gbpRating: pending(retrieved),
    gbpReviews: pending(retrieved),
    gbpPhotos: pending(retrieved),
    packPosition: pending(retrieved),
    organicKeywords: pending(retrieved),
    organicVisits: pending(retrieved),
    packVisits: pending(retrieved),
    trafficValueUsd: pending(retrieved),
    backlinkRank: pending(retrieved),
    referringDomains: pending(retrieved),
    footprint: [],
  });
  return {
    retrieved,
    sourcesUsed: [],
    demand: config.markets.map((m) => ({ marketId: m.id, searches: pending(retrieved) })),
    nearMeSearches: pending(retrieved),
    keywords: [],
    visitsScope: "local",
    sites: [site(config.company.domain), ...config.competitors.map((c) => site(c.domain))],
    grids: [],
    scorecard: [],
    narrative: { source: "config", headline: "Results not attached yet: every figure shows “not found” until the data is pulled.", pageNotes: {}, fixes: [] },
    costLedger: [],
  };
}

/** Plans from the database (audit_settings.plans), checked; anything odd is dropped. */
export function parsePlans(raw: unknown): AuditPlan[] {
  if (!Array.isArray(raw)) return [];
  const out: AuditPlan[] = [];
  for (const p of raw.slice(0, 4)) {
    const o = p && typeof p === "object" ? (p as Record<string, unknown>) : null;
    if (!o) continue;
    const name = typeof o.name === "string" ? o.name.trim().slice(0, 40) : "";
    const hours = typeof o.hoursPerMonth === "number" ? o.hoursPerMonth : NaN;
    const price = typeof o.priceUsd === "number" ? o.priceUsd : NaN;
    if (!name || !Number.isFinite(hours) || hours < 1 || hours > 400 || !Number.isFinite(price) || price < 0 || price > 100_000) continue;
    const plan: AuditPlan = { name, hoursPerMonth: Math.round(hours), priceUsd: Math.round(price), summary: (typeof o.summary === "string" ? o.summary.trim().slice(0, 120) : "") || `${Math.round(hours)} hours of SEO work a month` };
    if (o.recommended === true && !out.some((x) => x.recommended)) plan.recommended = true;
    out.push(plan);
  }
  return out;
}
