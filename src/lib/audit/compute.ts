// SEO audit math. Code computes EVERY number on the pages; the AI (later) only writes
// words around them. Pure functions: no database, no network, no AI. Tested.
//
// Missing inputs give null (shown as "not found"), never zero and never a guess.

import type { AuditConfig } from "./config";
import type { AuditData, Fig, GeoGrid, KeywordRow, SiteMetrics } from "./data";

/** Average job value across the service mix (mix share × average ticket). */
export function blendedJobValue(config: AuditConfig): number {
  return config.services.reduce((s, x) => s + x.mixShare * x.jobValueUsd.value, 0);
}

/** true when any money/rate input is still our guess rather than the client's figure. */
export function usesAssumptions(config: AuditConfig): boolean {
  return (
    config.funnel.leadRate.basis === "assumption" ||
    config.funnel.closeRate.basis === "assumption" ||
    config.services.some((s) => s.jobValueUsd.basis === "assumption")
  );
}

/** Sum of the figures that were found; null when none were. */
export function sumFound(figs: Fig[]): number | null {
  const found = figs.filter((f) => f.value !== null);
  return found.length ? found.reduce((s, f) => s + (f.value as number), 0) : null;
}

/** Local searches/month: "near me" + every market's own searches. */
export function localDemand(data: AuditData): number | null {
  return sumFound([data.nearMeSearches, ...data.demand.map((d) => d.searches)]);
}

/** Cost per click weighted by search volume (keywords missing either figure are skipped). */
export function weightedCpc(keywords: KeywordRow[]): number | null {
  let vol = 0;
  let spend = 0;
  for (const k of keywords) {
    if (k.volume.value === null || k.cpcUsd.value === null) continue;
    vol += k.volume.value;
    spend += k.volume.value * k.cpcUsd.value;
  }
  return vol > 0 ? spend / vol : null;
}

export interface ScenarioRow {
  name: string;
  demandCaptured: number;
  visits: number;
  leads: number;
  jobs: number;
  revenueMo: number;
  revenueYr: number;
  baseline: boolean;
}

/** visits = demand × share captured; leads = visits × lead rate; jobs = leads × close rate; revenue = jobs × blended job value. */
export function revenueScenarios(config: AuditConfig, demand: number | null): ScenarioRow[] | null {
  if (demand === null) return null;
  const job = blendedJobValue(config);
  return config.scenarios.map((s) => {
    const visits = demand * s.demandCaptured;
    const leads = visits * config.funnel.leadRate.value;
    const jobs = leads * config.funnel.closeRate.value;
    const revenueMo = jobs * job;
    return { name: s.name, demandCaptured: s.demandCaptured, visits, leads, jobs, revenueMo, revenueYr: revenueMo * 12, baseline: s.name === config.baselineScenario };
  });
}

/** What extra visits per month would be worth, through the same funnel. */
export function prizeFor(config: AuditConfig, extraVisits: number) {
  const leads = extraVisits * config.funnel.leadRate.value;
  const jobs = leads * config.funnel.closeRate.value;
  const revenueMo = jobs * blendedJobValue(config);
  return { extraVisits, leads, jobs, revenueMo, revenueYr: revenueMo * 12 };
}

/** What buying the same clicks in Google Ads would cost per month. */
export function adsEquivalent(visits: number | null, cpc: number | null): number | null {
  return visits === null || cpc === null ? null : visits * cpc;
}

export interface GridStats {
  points: number;
  found: number;
  avg: number | null;
  /** Share of ALL grid points where the client is in the top 3. */
  top3Share: number;
}

export function gridStats(g: GeoGrid): GridStats {
  const all = g.ranks.flat();
  // A 0 means "checked, not in the pack": it counts as a point but has no rank to average.
  const found = all.filter((r): r is number => r !== null && r > 0);
  return {
    points: all.length,
    found: found.length,
    avg: found.length ? found.reduce((s, r) => s + r, 0) / found.length : null,
    top3Share: all.length ? found.filter((r) => r <= 3).length / all.length : 0,
  };
}

/** Average of each grid's average rank (grids with no ranks found are left out). */
export function avgMapsRank(grids: GeoGrid[]): number | null {
  const avgs = grids.filter((g) => (g.kind ?? "maps") === "maps").map((g) => gridStats(g).avg).filter((a): a is number => a !== null);
  return avgs.length ? avgs.reduce((s, a) => s + a, 0) / avgs.length : null;
}

/** Local-pack checks: how many city checks show the client in the 3-pack, out of those checked. */
export function packPresence(grids: GeoGrid[]): { inPack: number; checked: number } {
  const cells = grids.filter((g) => g.kind === "pack").flatMap((g) => g.ranks.flat()).filter((r): r is number => r !== null);
  return { inPack: cells.filter((r) => r >= 1 && r <= 3).length, checked: cells.length };
}

/** Cities (cells) where the client is in the 3-pack for at least one term, out of cities checked. */
export function packCityPresence(grids: GeoGrid[]): { inPack: number; checked: number } {
  const packs = grids.filter((g) => g.kind === "pack").map((g) => g.ranks.flat());
  const n = Math.max(0, ...packs.map((p) => p.length));
  let inPack = 0;
  let checked = 0;
  for (let i = 0; i < n; i++) {
    const cell = packs.map((p) => p[i]).filter((r): r is number => r !== null && r !== undefined);
    if (!cell.length) continue;
    checked++;
    if (cell.some((r) => r >= 1 && r <= 3)) inPack++;
  }
  return { inPack, checked };
}

/** Organic + local-pack visits (null only when both are missing). */
export function totalVisits(s: SiteMetrics): number | null {
  return sumFound([s.organicVisits, s.packVisits]);
}

export interface LeaderRow {
  domain: string;
  name: string;
  isClient: boolean;
  visits: number | null;
  semrushVisits: number | null;
  trafficValueUsd: number | null;
  /** Modeled monthly job revenue (visits × visit-to-job rate × blended job value); null when not set or visits missing. */
  revenueMo: number | null;
}

/** Revenue a number of search visits would bring in, using the page-1 visit-to-job rate. */
export function revenueFromVisits(config: AuditConfig, visits: number | null): number | null {
  const rate = config.competitorRevenue?.visitToJobRate.value;
  return rate === undefined || visits === null ? null : visits * rate * blendedJobValue(config);
}

/** Sites ranked by estimated search visits (not found last). */
export function leaderboard(config: AuditConfig, data: AuditData): LeaderRow[] {
  const names = new Map([[config.company.domain, config.company.name], ...config.competitors.map((c) => [c.domain, c.name] as const)]);
  return data.sites
    .map((s) => ({
      domain: s.domain,
      name: names.get(s.domain) ?? s.domain,
      isClient: s.domain === config.company.domain,
      visits: totalVisits(s),
      semrushVisits: s.semrushVisits?.value ?? null,
      trafficValueUsd: s.trafficValueUsd.value,
      revenueMo: revenueFromVisits(config, totalVisits(s)),
    }))
    .sort((a, b) => (b.visits ?? -1) - (a.visits ?? -1));
}

export function clientSite(config: AuditConfig, data: AuditData): SiteMetrics | undefined {
  return data.sites.find((s) => s.domain === config.company.domain);
}

export interface ClusterRow {
  cluster: string;
  keywords: string[];
  volume: number | null;
  cpcMin: number | null;
  cpcMax: number | null;
  kdMax: number | null;
  /** Domain holding the best position across the cluster, if anyone ranks. */
  winner: string | null;
  /** true when at least one keyword in the cluster had positions looked up. */
  checked: boolean;
}

export function clusterRows(keywords: KeywordRow[]): ClusterRow[] {
  const by = new Map<string, KeywordRow[]>();
  for (const k of keywords) by.set(k.cluster, [...(by.get(k.cluster) ?? []), k]);
  return [...by.entries()]
    .map(([cluster, rows]) => {
      const cpcs = rows.map((r) => r.cpcUsd.value).filter((v): v is number => v !== null);
      const kds = rows.map((r) => r.difficulty.value).filter((v): v is number => v !== null);
      let winner: string | null = null;
      let best = Infinity;
      for (const r of rows.filter((x) => x.positionsChecked !== false))
        for (const [d, p] of Object.entries(r.positions))
          if (p !== null && p < best) {
            best = p;
            winner = d;
          }
      return {
        cluster,
        keywords: rows.map((r) => r.keyword),
        volume: sumFound(rows.map((r) => r.volume)),
        cpcMin: cpcs.length ? Math.min(...cpcs) : null,
        cpcMax: cpcs.length ? Math.max(...cpcs) : null,
        kdMax: kds.length ? Math.max(...kds) : null,
        winner,
        checked: rows.some((x) => x.positionsChecked !== false),
      };
    })
    .sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1));
}

/**
 * Modeled monthly visits over `months`: an S-curve from today's visits to the target
 * (slow start while pages are built, fastest mid-year, levelling off). A model, not data.
 */
export function growthCurve(start: number, target: number, months = 12): number[] {
  const k = 0.6;
  const mid = months / 2;
  const s = (t: number) => 1 / (1 + Math.exp(-k * (t - mid)));
  const s0 = s(0);
  const s1 = s(months);
  return Array.from({ length: months + 1 }, (_, t) => start + (target - start) * ((s(t) - s0) / (s1 - s0)));
}

/** Rounds money for display: nearest $100 at $1,000+, else whole dollars. */
export function roundMoney(v: number): number {
  return Math.abs(v) >= 1000 ? Math.round(v / 100) * 100 : Math.round(v);
}

/** Total of the cost ledger for this run. */
export function runCost(data: AuditData): number {
  return data.costLedger.reduce((s, c) => s + c.costUsd, 0);
}

/**
 * A site's best organic position on keywords that name this market (e.g. "plumber
 * cedar point" for Cedar Point). null = no ranking found for that market.
 */
export function bestPositionInMarket(keywords: KeywordRow[], domain: string, marketName: string): number | null {
  const name = marketName.toLowerCase().replace(/\s*\(.*\)\s*/g, "").trim();
  let best: number | null = null;
  for (const k of keywords) {
    if (!name || !k.keyword.toLowerCase().includes(name)) continue;
    const p = k.positions[domain];
    if (p !== null && p !== undefined && (best === null || p < best)) best = p;
  }
  return best;
}
