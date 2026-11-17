// SEO audit: per-client settings ("config") and the check that every config must pass.
//
// Everything a person types about the business lives here: company, markets, services,
// competitors, job values, funnel rates, plans and prices. Nothing in the template is
// hardcoded per client. Money figures and rates carry a "basis": they stay marked
// "assumption" on every page until the client gives real numbers ("client_supplied").
//
// Pure: no database, no network, no AI.

import { insidePolygon, STATES, STATE_CODES } from "./geo";

export type Basis = "assumption" | "client_supplied";

/** A number someone typed, with whether it is our guess or the client's real figure. */
export interface Assumed {
  value: number;
  basis: Basis;
}

export type MarketKind = "town" | "county" | "region" | "state";

export interface AuditMarket {
  /** Short id used to join data to this market (letters, digits, dashes). */
  id: string;
  name: string;
  kind: MarketKind;
  /** Where the market sits on the state map (optional: region-wide terms have none). */
  lat?: number;
  lng?: number;
  /** The client's home base (the map draws radius rings around it). */
  hq?: boolean;
}

export interface AuditService {
  name: string;
  /** Share of the client's jobs, 0–1. All services together add up to 1. */
  mixShare: number;
  /** Average ticket: what one job of this service brings in. */
  jobValueUsd: Assumed;
}

export interface AuditCompetitor {
  name: string;
  /** Bare domain, e.g. "example.com" (no https://, no path). */
  domain: string;
  town: string;
}

export interface AuditScenario {
  name: string;
  /** Share of local demand the client could win, 0–1 (e.g. 0.05 = 5%). */
  demandCaptured: number;
}

export interface AuditPlan {
  name: string;
  hoursPerMonth: number;
  priceUsd: number;
  summary: string;
  recommended?: boolean;
}

export interface RoadmapPhase {
  label: string; // "Months 1–3"
  name: string; // "Foundation"
  focus: string;
  tasks: { task: string; hours: number }[];
}

export interface AuditConfig {
  kind: "seo";
  /** Who prepared it: shown on every page. */
  agency: { name: string; website?: string; phone?: string; email?: string };
  company: {
    name: string;
    domain: string;
    /** Google Business Profile link, if known (https only). */
    gbpUrl?: string;
    niche: string;
    hqTown: string;
    region: string;
  };
  /** Region map: which state outline to draw, and radius rings around the home base. */
  map: { state: string; ringsMiles: number[] };
  markets: AuditMarket[];
  services: AuditService[];
  competitors: AuditCompetitor[];
  funnel: { leadRate: Assumed; closeRate: Assumed };
  scenarios: AuditScenario[];
  /** Which scenario is the "baseline" used on the cover page. */
  baselineScenario: string;
  plans: AuditPlan[];
  roadmap: RoadmapPhase[];
  modules: { dataforseo: boolean; leadsnap: boolean; semrush: boolean };
  /** The most one run may spend on data, in dollars. */
  budgetCapUsd: number;
  /** true = sample data only, costs $0, nothing is fetched. */
  dryRun: boolean;
  preparedOn: string; // YYYY-MM-DD
}

export const AUDIT_LIMITS = {
  markets: 20,
  services: 12,
  competitors: 8,
  scenarios: 4,
  plans: 4,
  roadmapPhases: 6,
  tasksPerPhase: 10,
  text: 200,
  budgetCapUsdMax: 50,
} as const;

/** Defaults for a new audit. Semrush is off unless someone turns it on. */
export const AUDIT_DEFAULTS = {
  modules: { dataforseo: true, leadsnap: true, semrush: false },
  budgetCapUsd: 5,
  funnel: {
    leadRate: { value: 0.05, basis: "assumption" as Basis },
    closeRate: { value: 0.3, basis: "assumption" as Basis },
  },
  scenarios: [
    { name: "Conservative", demandCaptured: 0.025 },
    { name: "Baseline", demandCaptured: 0.05 },
    { name: "Stronger", demandCaptured: 0.08 },
  ],
};

export type ConfigResult = { ok: true; config: AuditConfig } | { ok: false; errors: string[] };

const DOMAIN = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const ID = /^[a-z0-9-]{1,40}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Checks a config from anywhere (a form, a file) and returns either a clean copy or a
 * list of plain-English problems. Unknown fields are dropped, not trusted.
 */
export function parseAuditConfig(raw: unknown): ConfigResult {
  const errors: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["Settings must be an object."] };

  const text = (v: unknown, label: string, optional = false): string | undefined => {
    if (v === undefined || v === null || v === "") {
      if (!optional) errors.push(`${label} is required.`);
      return undefined;
    }
    if (typeof v !== "string") return void errors.push(`${label} must be text.`);
    const t = v.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
    if (!t && !optional) errors.push(`${label} is required.`);
    if (t.length > AUDIT_LIMITS.text) errors.push(`${label} is too long (max ${AUDIT_LIMITS.text}).`);
    return t || undefined;
  };
  const num = (v: unknown, label: string, min: number, max: number): number => {
    if (typeof v !== "number" || !Number.isFinite(v)) {
      errors.push(`${label} must be a number.`);
      return min;
    }
    if (v < min || v > max) errors.push(`${label} must be between ${min} and ${max}.`);
    return v;
  };
  const assumed = (v: unknown, label: string, min: number, max: number): Assumed => {
    const o = obj(v);
    if (!o) {
      errors.push(`${label} is required.`);
      return { value: min, basis: "assumption" };
    }
    const basis = o.basis === "client_supplied" ? "client_supplied" : "assumption";
    if (o.basis !== undefined && o.basis !== "assumption" && o.basis !== "client_supplied") {
      errors.push(`${label}: basis must be "assumption" or "client_supplied".`);
    }
    return { value: num(o.value, label, min, max), basis };
  };
  const domain = (v: unknown, label: string): string => {
    const d = (text(v, label) ?? "").toLowerCase();
    if (d && !DOMAIN.test(d)) errors.push(`${label} must be a bare domain like example.com (no https:// or path).`);
    return d;
  };
  const list = (v: unknown, label: string, max: number, min = 1): unknown[] => {
    if (!Array.isArray(v)) {
      errors.push(`${label} must be a list.`);
      return [];
    }
    if (v.length < min) errors.push(`${label} needs at least ${min}.`);
    if (v.length > max) errors.push(`${label} can have at most ${max}.`);
    return v.slice(0, max);
  };

  if (r.kind !== "seo") errors.push('Audit kind must be "seo".');

  const ag = obj(r.agency) ?? {};
  const agency = {
    name: text(ag.name, "Agency name") ?? "",
    website: text(ag.website, "Agency website", true),
    phone: text(ag.phone, "Agency phone", true),
    email: text(ag.email, "Agency email", true),
  };

  const co = obj(r.company) ?? {};
  const gbpUrl = text(co.gbpUrl, "Google Business Profile link", true);
  if (gbpUrl && !/^https:\/\/[^\s]+$/.test(gbpUrl)) errors.push("Google Business Profile link must start with https://.");
  const company = {
    name: text(co.name, "Company name") ?? "",
    domain: domain(co.domain, "Company website"),
    gbpUrl,
    niche: text(co.niche, "Niche") ?? "",
    hqTown: text(co.hqTown, "Home town") ?? "",
    region: text(co.region, "Region") ?? "",
  };

  const mp = obj(r.map) ?? {};
  const mapState = typeof mp.state === "string" ? mp.state.toUpperCase() : "";
  if (!STATES[mapState]) errors.push(`Map state must be one of: ${STATE_CODES.join(", ")}.`);
  const ringsMiles = (Array.isArray(mp.ringsMiles) ? mp.ringsMiles : []).slice(0, 3).map((v, i) => num(v, `Map ring ${i + 1} (miles)`, 1, 300));
  const map = { state: mapState, ringsMiles };

  const markets = list(r.markets, "Markets", AUDIT_LIMITS.markets).map((m, i): AuditMarket => {
    const o = obj(m) ?? {};
    const id = text(o.id, `Market ${i + 1} id`) ?? "";
    if (id && !ID.test(id)) errors.push(`Market ${i + 1} id may only use a-z, 0-9 and dashes.`);
    const kind = (["town", "county", "region", "state"] as const).find((k) => k === o.kind);
    if (!kind) errors.push(`Market ${i + 1} kind must be town, county, region or state.`);
    const out: AuditMarket = { id, name: text(o.name, `Market ${i + 1} name`) ?? "", kind: kind ?? "town" };
    if ((o.lat === undefined) !== (o.lng === undefined)) errors.push(`Market ${i + 1} needs both latitude and longitude, or neither.`);
    if (o.lat !== undefined && o.lng !== undefined) {
      out.lat = num(o.lat, `Market ${i + 1} latitude`, -90, 90);
      out.lng = num(o.lng, `Market ${i + 1} longitude`, -180, 180);
      const st = STATES[mapState];
      if (st && !insidePolygon([out.lng, out.lat], st.outline)) errors.push(`Market ${i + 1} (${out.name || out.id}) is outside ${st.name} on the map.`);
    }
    if (o.hq === true) out.hq = true;
    return out;
  });
  dupes(markets.map((m) => m.id), "Market ids", errors);
  if (markets.filter((m) => m.hq).length > 1) errors.push("Only one market can be the home base.");

  const services = list(r.services, "Services", AUDIT_LIMITS.services).map((s, i): AuditService => {
    const o = obj(s) ?? {};
    return {
      name: text(o.name, `Service ${i + 1} name`) ?? "",
      mixShare: num(o.mixShare, `Service ${i + 1} share of jobs`, 0, 1),
      jobValueUsd: assumed(o.jobValueUsd, `Service ${i + 1} average ticket`, 0, 10_000_000),
    };
  });
  const mix = services.reduce((s, x) => s + x.mixShare, 0);
  if (services.length && Math.abs(mix - 1) > 0.001) errors.push(`Service shares must add up to 100% (now ${Math.round(mix * 100)}%).`);
  dupes(services.map((s) => s.name.toLowerCase()), "Service names", errors);

  const competitors = list(r.competitors, "Competitors", AUDIT_LIMITS.competitors, 0).map((c, i): AuditCompetitor => {
    const o = obj(c) ?? {};
    return {
      name: text(o.name, `Competitor ${i + 1} name`) ?? "",
      domain: domain(o.domain, `Competitor ${i + 1} website`),
      town: text(o.town, `Competitor ${i + 1} town`) ?? "",
    };
  });
  dupes([company.domain, ...competitors.map((c) => c.domain)], "Websites", errors);

  const fu = obj(r.funnel) ?? {};
  const funnel = {
    leadRate: assumed(fu.leadRate, "Lead rate", 0, 1),
    closeRate: assumed(fu.closeRate, "Close rate", 0, 1),
  };

  const scenarios = list(r.scenarios, "Scenarios", AUDIT_LIMITS.scenarios).map((s, i): AuditScenario => {
    const o = obj(s) ?? {};
    return { name: text(o.name, `Scenario ${i + 1} name`) ?? "", demandCaptured: num(o.demandCaptured, `Scenario ${i + 1} share captured`, 0, 1) };
  });
  dupes(scenarios.map((s) => s.name), "Scenario names", errors);
  const baselineScenario = text(r.baselineScenario, "Baseline scenario") ?? "";
  if (baselineScenario && !scenarios.some((s) => s.name === baselineScenario)) errors.push("Baseline scenario must be one of the scenarios.");

  const plans = list(r.plans, "Plans", AUDIT_LIMITS.plans).map((p, i): AuditPlan => {
    const o = obj(p) ?? {};
    const out: AuditPlan = {
      name: text(o.name, `Plan ${i + 1} name`) ?? "",
      hoursPerMonth: num(o.hoursPerMonth, `Plan ${i + 1} hours`, 1, 400),
      priceUsd: num(o.priceUsd, `Plan ${i + 1} price`, 0, 100_000),
      summary: text(o.summary, `Plan ${i + 1} summary`) ?? "",
    };
    if (o.recommended === true) out.recommended = true;
    return out;
  });
  if (plans.filter((p) => p.recommended).length > 1) errors.push("Only one plan can be recommended.");

  const roadmap = list(r.roadmap, "Roadmap", AUDIT_LIMITS.roadmapPhases, 0).map((p, i): RoadmapPhase => {
    const o = obj(p) ?? {};
    return {
      label: text(o.label, `Roadmap phase ${i + 1} label`) ?? "",
      name: text(o.name, `Roadmap phase ${i + 1} name`) ?? "",
      focus: text(o.focus, `Roadmap phase ${i + 1} focus`) ?? "",
      tasks: list(o.tasks, `Roadmap phase ${i + 1} tasks`, AUDIT_LIMITS.tasksPerPhase).map((t, j) => {
        const to = obj(t) ?? {};
        return { task: text(to.task, `Phase ${i + 1} task ${j + 1}`) ?? "", hours: num(to.hours, `Phase ${i + 1} task ${j + 1} hours`, 0, 400) };
      }),
    };
  });
  const rec = plans.find((p) => p.recommended);
  for (const p of roadmap) {
    const h = p.tasks.reduce((s, t) => s + t.hours, 0);
    if (rec && h > rec.hoursPerMonth) errors.push(`${p.label} plans ${h} hrs/month, more than the recommended plan's ${rec.hoursPerMonth}.`);
  }

  const mo = obj(r.modules) ?? {};
  const modules = {
    dataforseo: mo.dataforseo !== false,
    leadsnap: mo.leadsnap !== false,
    semrush: mo.semrush === true, // off unless turned on
  };

  const budgetCapUsd = num(r.budgetCapUsd ?? AUDIT_DEFAULTS.budgetCapUsd, "Budget cap", 0, AUDIT_LIMITS.budgetCapUsdMax);
  const dryRun = r.dryRun !== false;
  const preparedOn = text(r.preparedOn, "Prepared on") ?? "";
  if (preparedOn && !DATE.test(preparedOn)) errors.push("Prepared on must be a date like 2026-11-17.");

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    config: {
      kind: "seo",
      agency,
      company,
      map,
      markets,
      services,
      competitors,
      funnel,
      scenarios,
      baselineScenario,
      plans,
      roadmap,
      modules,
      budgetCapUsd,
      dryRun,
      preparedOn,
    },
  };
}

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function dupes(values: string[], label: string, errors: string[]) {
  const seen = new Set<string>();
  for (const v of values) {
    if (!v) continue;
    if (seen.has(v)) errors.push(`${label} must be unique ("${v}" appears twice).`);
    seen.add(v);
  }
}
