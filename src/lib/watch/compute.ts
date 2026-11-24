// SEO Watcher: all the math. Pure functions, no network, no database, easy to test.
// Plan: docs/SEO_WATCHER_PLAN.md.
//
// Rules:
// - Positions: 1 = top. null = checked and NOT in the top `WATCH_RULES.depth` (30).
// - Maps (local pack): 1–3 = in the pack, 0 = checked and not in it, null = not checked.
// - Search volumes: null = not found. A keyword without a volume adds nothing to
//   visibility (never a guess) and is counted as "volume not found".
// - "Visits" are a MODEL: monthly searches × the usual share of clicks for that position
//   (`WATCH_RULES.ctr`). Screens label them that way.
// - Trends and "easy to rank" scores are inferences; each one carries its evidence.

import type { SourceId } from "@/lib/audit/data";

// ---------------------------------------------------------------- tunable numbers

export const WATCH_RULES = {
  /** How deep each organic check looks. Deeper = more cost. */
  depth: 30,
  /** Share of searchers who click organic result #1, #2 … #10 (published industry averages, rounded). */
  ctr: [0.28, 0.15, 0.11, 0.08, 0.06, 0.045, 0.035, 0.03, 0.025, 0.02] as readonly number[],
  /** Click share for positions 11–20 and 21–30 (page 2 and 3). */
  ctrPage2: 0.01,
  ctrPage3: 0.004,
  /** Click share for Maps pack spots 1, 2, 3. */
  packCtr: [0.16, 0.11, 0.08] as readonly number[],
  /** One keyword never gets more than this share of its searches as visits. */
  maxShare: 0.5,
  /** A trend needs at least this many checks. */
  minTrendPoints: 4,
  /** "Rising N checks in a row" needs at least this many. */
  streakMin: 4,
  /** Slope (share of the average per check) under which a line counts as flat. */
  flatSlope: 0.01,
  /** Search-volume change worth a line on the board (vs the same month last year). */
  volumeYoyPct: 30,
  /** …only for keywords with at least this many searches a month. */
  volumeMin: 100,
  /** Per watched client (owner-approved 2026-11-24). */
  limits: { keywords: 25, markets: 5, competitors: 5 },
  /** Ask the owner for more room at this share of the cap or a list limit. */
  askAtPct: 80,
} as const;

export const OPPORTUNITY_RULES = {
  /** Searches a month at which demand earns full points. */
  demandFull: 2000,
  demandPoints: 35,
  /** Maps top-3 average reviews: at or under `reviewsEasy` = full points, at or over `reviewsHard` = none. */
  reviewsEasy: 20,
  reviewsHard: 150,
  reviewsPoints: 15,
  /** Points for each Maps top-3 business without a real website (max 3). */
  noWebsitePoints: 10 / 3,
  /** Keyword difficulty 0–100: lower = easier. */
  difficultyPoints: 15,
  /** Distance from the office: full points within `nearMiles`, none beyond `farMiles`. */
  nearMiles: 15,
  farMiles: 90,
  distancePoints: 15,
  /** Points for each of our clients within `farMiles` (proof we can show), up to 2. */
  nearbyClientPoints: 5,
} as const;

/** When a monthly report may show the "next step to grow" section (owner-approved 2026-11-24). */
export const UPSELL_RULES = {
  minMonths: 3,
  gapDays: 90,
  newTop3Money: 3,
  newTop3Days: 60,
  visibilityUpPct: 20,
  ceilingPct: 60,
} as const;

// ---------------------------------------------------------------- shapes

export interface WatchClient {
  id: string;
  name: string;
  domain: string;
  niche: string;
  /** Services they buy from us now. */
  services: string[];
  /** Services we could add (the upsell menu for this client). */
  nextServices: string[];
  startedOn: string; // YYYY-MM-DD
  health: "good" | "watch" | "at_risk";
  openComplaint: boolean;
  lastMood: "positive" | "neutral" | "negative" | null;
  /** Last report sent WITH an upsell section (YYYY-MM-DD), null = never. */
  lastUpsellSentOn: string | null;
}

export interface WatchMarket {
  id: string;
  clientId: string | null;
  city: string;
  state: string;
  lat: number;
  lng: number;
}

export interface WatchKeyword {
  id: string;
  clientId: string;
  keyword: string;
  money: boolean;
}

export interface RankCheck {
  keywordId: string;
  marketId: string;
  date: string; // YYYY-MM-DD
  organic: number | null;
  pack: number | null;
  /** Other sites seen in the results, with their position. */
  others: { domain: string; position: number }[];
  source: SourceId;
}

export interface VolumeMonth {
  keyword: string;
  marketId: string;
  month: string; // YYYY-MM
  volume: number | null;
  source: SourceId;
}

export interface WatchData {
  clients: WatchClient[];
  markets: WatchMarket[];
  keywords: WatchKeyword[];
  checks: RankCheck[];
  volumes: VolumeMonth[];
  competitors: { clientId: string; domain: string }[];
}

// ---------------------------------------------------------------- small helpers

/** Share of searches that turn into clicks at an organic position (model). */
export function ctrFor(position: number | null): number {
  if (position === null || !Number.isFinite(position) || position < 1) return 0;
  const p = Math.floor(position);
  if (p <= WATCH_RULES.ctr.length) return WATCH_RULES.ctr[p - 1]!;
  if (p <= 20) return WATCH_RULES.ctrPage2;
  if (p <= WATCH_RULES.depth) return WATCH_RULES.ctrPage3;
  return 0;
}

/** Share of searches that turn into clicks from a Maps pack spot (model). */
export function packCtrFor(pack: number | null): number {
  if (pack === null || pack < 1 || pack > WATCH_RULES.packCtr.length) return 0;
  return WATCH_RULES.packCtr[Math.floor(pack) - 1]!;
}

/** Estimated monthly visits for one keyword in one market (model). null volume = null. */
export function visitsFor(volume: number | null, organic: number | null, pack: number | null): number | null {
  if (volume === null || volume < 0) return null;
  const share = Math.min(WATCH_RULES.maxShare, ctrFor(organic) + packCtrFor(pack));
  return volume * share;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** "Up" means a better (smaller) position. Not in the top 30 counts as depth + 1. */
export function positionGain(from: number | null, to: number | null): number {
  const f = from ?? WATCH_RULES.depth + 1;
  const t = to ?? WATCH_RULES.depth + 1;
  return f - t;
}

/** Sorted distinct check dates. */
export function checkDates(checks: RankCheck[]): string[] {
  return [...new Set(checks.map((c) => c.date))].sort();
}

/** The latest month on record at or before a date, for a keyword in a market. */
export function volumeAt(volumes: VolumeMonth[], keyword: string, marketId: string, date: string): number | null {
  const month = date.slice(0, 7);
  let best: VolumeMonth | null = null;
  for (const v of volumes) {
    if (v.keyword !== keyword || v.marketId !== marketId || v.month > month) continue;
    if (!best || v.month > best.month) best = v;
  }
  return best ? best.volume : null;
}

function keywordIndex(data: WatchData) {
  return new Map(data.keywords.map((k) => [k.id, k]));
}

// ---------------------------------------------------------------- visibility over time

export interface VisibilityPoint {
  date: string;
  /** Estimated monthly visits from tracked keywords (model). */
  visits: number;
  /** Keywords that had no search volume (left out, not guessed). */
  volumeMissing: number;
  checks: number;
}

/** One point per check date: summed modeled visits for a client (or all clients when clientId is null). */
export function visibilitySeries(data: WatchData, clientId: string | null): VisibilityPoint[] {
  const kw = keywordIndex(data);
  const byDate = new Map<string, VisibilityPoint>();
  for (const c of data.checks) {
    const k = kw.get(c.keywordId);
    if (!k || (clientId !== null && k.clientId !== clientId)) continue;
    const point = byDate.get(c.date) ?? { date: c.date, visits: 0, volumeMissing: 0, checks: 0 };
    const v = visitsFor(volumeAt(data.volumes, k.keyword, c.marketId, c.date), c.organic, c.pack);
    point.checks += 1;
    if (v === null) point.volumeMissing += 1;
    else point.visits += v;
    byDate.set(c.date, point);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).map((p) => ({ ...p, visits: round1(p.visits) }));
}

/** Turns a series into an index: 100 = the first point above zero. Points before it are null. */
export function toIndex(values: number[]): (number | null)[] {
  const base = values.find((v) => v > 0);
  if (base === undefined) return values.map(() => null);
  let started = false;
  return values.map((v) => {
    if (!started && v > 0) started = true;
    return started ? round1((v / base) * 100) : null;
  });
}

/** Percent change from the first to the last value (null when it can't be worked out). */
export function pctChange(from: number | null | undefined, to: number | null | undefined): number | null {
  if (from === null || from === undefined || to === null || to === undefined || from === 0) return null;
  return round1(((to - from) / from) * 100);
}

// ---------------------------------------------------------------- trends

export type TrendDirection = "rising" | "falling" | "flat" | "not_enough_data";

export interface Trend {
  direction: TrendDirection;
  /** Change per check, as a share of the average (0.05 = +5% of the average per check). */
  slope: number;
  points: number;
  /** Checks in a row (ending at the latest) that went the same way as the direction. */
  streak: number;
}

/**
 * Least-squares line through the values (higher = better). Nulls are skipped.
 * Needs `WATCH_RULES.minTrendPoints` values, so one noisy check can't make a trend.
 */
export function trendOf(values: (number | null)[]): Trend {
  const pts = values.flatMap((v, i) => (v === null || !Number.isFinite(v) ? [] : [[i, v] as const]));
  if (pts.length < WATCH_RULES.minTrendPoints) return { direction: "not_enough_data", slope: 0, points: pts.length, streak: 0 };
  const n = pts.length;
  const mx = pts.reduce((s, [x]) => s + x, 0) / n;
  const my = pts.reduce((s, [, y]) => s + y, 0) / n;
  const sxx = pts.reduce((s, [x]) => s + (x - mx) ** 2, 0);
  const sxy = pts.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0);
  const raw = sxx === 0 ? 0 : sxy / sxx;
  const slope = my === 0 ? 0 : Math.round((raw / Math.abs(my)) * 1000) / 1000;
  const direction: TrendDirection = Math.abs(slope) < WATCH_RULES.flatSlope ? "flat" : slope > 0 ? "rising" : "falling";
  let streak = 0;
  if (direction !== "flat") {
    for (let i = pts.length - 1; i > 0; i--) {
      const d = pts[i]![1] - pts[i - 1]![1];
      if ((direction === "rising" && d > 0) || (direction === "falling" && d < 0)) streak++;
      else break;
    }
  }
  return { direction, slope, points: n, streak };
}

// ---------------------------------------------------------------- movers

export interface Mover {
  clientId: string;
  keywordId: string;
  keyword: string;
  marketId: string;
  from: number | null;
  to: number | null;
  /** Positions gained (+) or lost (−); "not in top 30" counts as 31. */
  gain: number;
  /** Change in modeled monthly visits; null when the search volume wasn't found. */
  visitsChange: number | null;
  volume: number | null;
}

/**
 * Biggest movers between two check dates, weighted by search volume: the change in
 * modeled visits decides the order (14 → 4 on a busy keyword beats 50 → 30 on a quiet one).
 * Keywords without a volume sort after those with one, by positions gained.
 */
export function movers(data: WatchData, fromDate: string, toDate: string, limit = 5): { up: Mover[]; down: Mover[] } {
  const kw = keywordIndex(data);
  const key = (c: RankCheck) => `${c.keywordId}|${c.marketId}`;
  const before = new Map(data.checks.filter((c) => c.date === fromDate).map((c) => [key(c), c]));
  const list: Mover[] = [];
  for (const c of data.checks) {
    if (c.date !== toDate) continue;
    const b = before.get(key(c));
    const k = kw.get(c.keywordId);
    if (!b || !k) continue;
    const gain = positionGain(b.organic, c.organic);
    if (gain === 0) continue;
    const volume = volumeAt(data.volumes, k.keyword, c.marketId, toDate);
    const was = visitsFor(volume, b.organic, b.pack);
    const now = visitsFor(volume, c.organic, c.pack);
    list.push({
      clientId: k.clientId,
      keywordId: k.id,
      keyword: k.keyword,
      marketId: c.marketId,
      from: b.organic,
      to: c.organic,
      gain,
      visitsChange: was === null || now === null ? null : round1(now - was),
      volume,
    });
  }
  const weight = (m: Mover) => m.visitsChange ?? 0;
  const byWeight = (dir: 1 | -1) => (a: Mover, b: Mover) => {
    const hasA = a.visitsChange !== null ? 1 : 0;
    const hasB = b.visitsChange !== null ? 1 : 0;
    if (hasA !== hasB) return hasB - hasA;
    return dir * (weight(b) - weight(a)) || dir * (b.gain - a.gain) || a.keyword.localeCompare(b.keyword);
  };
  return {
    up: list.filter((m) => m.gain > 0).sort(byWeight(1)).slice(0, limit),
    down: list.filter((m) => m.gain < 0).sort(byWeight(-1)).slice(0, limit),
  };
}

// ---------------------------------------------------------------- competitors on the rise

export interface CompetitorRise {
  domain: string;
  /** Change in modeled monthly visits on our clients' keywords. */
  visitsChange: number;
  /** Clients whose keywords they gained on. */
  clientIds: string[];
  /** Keyword × market pairs where they moved up. */
  gains: number;
}

/** Other sites that gained the most modeled visits on our clients' keywords between two dates. */
export function competitorRisers(data: WatchData, fromDate: string, toDate: string, limit = 5): CompetitorRise[] {
  const kw = keywordIndex(data);
  const ours = new Set(data.clients.map((c) => c.domain.toLowerCase()));
  const key = (c: RankCheck) => `${c.keywordId}|${c.marketId}`;
  const before = new Map(data.checks.filter((c) => c.date === fromDate).map((c) => [key(c), c]));
  const acc = new Map<string, { visits: number; clients: Set<string>; gains: number }>();
  for (const c of data.checks) {
    if (c.date !== toDate) continue;
    const b = before.get(key(c));
    const k = kw.get(c.keywordId);
    if (!b || !k) continue;
    const volume = volumeAt(data.volumes, k.keyword, c.marketId, toDate);
    if (volume === null) continue;
    const domains = new Set([...b.others, ...c.others].map((o) => o.domain.toLowerCase()));
    for (const d of domains) {
      if (ours.has(d)) continue;
      const was = b.others.find((o) => o.domain.toLowerCase() === d)?.position ?? null;
      const now = c.others.find((o) => o.domain.toLowerCase() === d)?.position ?? null;
      const delta = volume * (ctrFor(now) - ctrFor(was));
      const row = acc.get(d) ?? { visits: 0, clients: new Set<string>(), gains: 0 };
      row.visits += delta;
      if (positionGain(was, now) > 0) {
        row.gains += 1;
        row.clients.add(k.clientId);
      }
      acc.set(d, row);
    }
  }
  return [...acc.entries()]
    .map(([domain, r]) => ({ domain, visitsChange: round1(r.visits), clientIds: [...r.clients].sort(), gains: r.gains }))
    .filter((r) => r.visitsChange > 0)
    .sort((a, b) => b.visitsChange - a.visitsChange || a.domain.localeCompare(b.domain))
    .slice(0, limit);
}

// ---------------------------------------------------------------- search demand

export interface VolumeChange {
  latest: number | null;
  month: string | null;
  /** vs the month before. */
  momPct: number | null;
  /** vs the same month last year. */
  yoyPct: number | null;
}

/** Month-over-month and year-over-year change for one keyword in one market. */
export function volumeChange(volumes: VolumeMonth[], keyword: string, marketId: string): VolumeChange {
  const rows = volumes.filter((v) => v.keyword === keyword && v.marketId === marketId).sort((a, b) => a.month.localeCompare(b.month));
  const last = rows.at(-1);
  if (!last) return { latest: null, month: null, momPct: null, yoyPct: null };
  const find = (m: string) => rows.find((r) => r.month === m)?.volume ?? null;
  return {
    latest: last.volume,
    month: last.month,
    momPct: pctChange(find(shiftMonth(last.month, -1)), last.volume),
    yoyPct: pctChange(find(shiftMonth(last.month, -12)), last.volume),
  };
}

/** "2026-01" shifted by n months. */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/**
 * Busy and quiet months: average searches per calendar month (Jan = 0), compared with
 * the overall average (1.0 = average). Months without data are null.
 */
export function seasonality(volumes: VolumeMonth[]): (number | null)[] {
  const sums = Array.from({ length: 12 }, () => ({ total: 0, n: 0 }));
  for (const v of volumes) {
    if (v.volume === null) continue;
    const m = Number(v.month.slice(5, 7)) - 1;
    if (m < 0 || m > 11) continue;
    sums[m]!.total += v.volume;
    sums[m]!.n += 1;
  }
  const avgs = sums.map((s) => (s.n ? s.total / s.n : null));
  const known = avgs.filter((a): a is number => a !== null);
  const overall = known.length ? known.reduce((s, a) => s + a, 0) / known.length : 0;
  return avgs.map((a) => (a === null || overall === 0 ? null : Math.round((a / overall) * 100) / 100));
}

// ---------------------------------------------------------------- "trends we spotted"

export interface Spotted {
  kind: "rising" | "falling" | "left_pack" | "joined_pack" | "demand_up" | "demand_down";
  clientId: string;
  text: string;
  /** Plain evidence: what the line is inferred from. */
  basis: string;
}

/** Plain-rule observations for the board. Each one says what it's inferred from. */
export function spotTrends(data: WatchData, marketName: (id: string) => string): Spotted[] {
  const out: Spotted[] = [];
  const dates = checkDates(data.checks);
  for (const client of data.clients) {
    const series = visibilitySeries(data, client.id);
    const t = trendOf(series.map((p) => p.visits));
    if (t.streak >= WATCH_RULES.streakMin && (t.direction === "rising" || t.direction === "falling")) {
      out.push({
        kind: t.direction,
        clientId: client.id,
        text: `${t.direction === "rising" ? "Visibility rising" : "Visibility falling"} ${t.streak} checks in a row`,
        basis: `inferred from ${t.points} weekly checks (model visits)`,
      });
    }
    // Maps pack: in vs out between the last two checks.
    const [prev, last] = dates.slice(-2);
    if (prev && last) {
      const kws = new Set(data.keywords.filter((k) => k.clientId === client.id).map((k) => k.id));
      const before = new Map(data.checks.filter((c) => c.date === prev && kws.has(c.keywordId)).map((c) => [`${c.keywordId}|${c.marketId}`, c]));
      const left = new Set<string>();
      const joined = new Set<string>();
      for (const c of data.checks) {
        if (c.date !== last || !kws.has(c.keywordId)) continue;
        const b = before.get(`${c.keywordId}|${c.marketId}`);
        if (!b || b.pack === null || c.pack === null) continue;
        if (b.pack >= 1 && c.pack === 0) left.add(c.marketId);
        if (b.pack === 0 && c.pack >= 1) joined.add(c.marketId);
      }
      if (left.size) {
        out.push({
          kind: "left_pack",
          clientId: client.id,
          text: `Dropped out of the Maps top 3 in ${[...left].map(marketName).join(", ")}`,
          basis: `last two checks (${prev} → ${last})`,
        });
      }
      if (joined.size) {
        out.push({
          kind: "joined_pack",
          clientId: client.id,
          text: `Made the Maps top 3 in ${[...joined].map(marketName).join(", ")}`,
          basis: `last two checks (${prev} → ${last})`,
        });
      }
    }
    // Demand vs last year, per keyword (first market with data).
    for (const k of data.keywords.filter((x) => x.clientId === client.id)) {
      const marketIds = [...new Set(data.volumes.filter((v) => v.keyword === k.keyword).map((v) => v.marketId))].sort();
      for (const m of marketIds) {
        const ch = volumeChange(data.volumes, k.keyword, m);
        if (ch.latest === null || ch.latest < WATCH_RULES.volumeMin || ch.yoyPct === null) continue;
        if (Math.abs(ch.yoyPct) < WATCH_RULES.volumeYoyPct) continue;
        const up = ch.yoyPct > 0;
        out.push({
          kind: up ? "demand_up" : "demand_down",
          clientId: client.id,
          text: `Searches for "${k.keyword}" in ${marketName(m)} ${up ? "up" : "down"} ${Math.abs(Math.round(ch.yoyPct))}% vs last year`,
          basis: `monthly search volume, ${ch.month} vs a year earlier`,
        });
        break;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- opportunity markets

export interface OpportunityInput {
  /** Monthly searches for the niche's main keywords in this market. */
  demand: number | null;
  /** Average review count of the Maps top 3. */
  packReviewsAvg: number | null;
  /** How many of the Maps top 3 have no real website (0–3). */
  packNoWebsite: number | null;
  /** Keyword difficulty, 0–100. */
  difficulty: number | null;
  milesFromBase: number | null;
  /** Our clients (any niche) within `farMiles`. */
  nearbyClients: number;
  /** A client of ours in the same niche already serves this market. */
  conflict: boolean;
}

export interface OpportunityScore {
  score: number;
  reasons: string[];
  /** Figures that were not found (each scored 0, never guessed). */
  missing: string[];
  blocked: boolean;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** 0–100 "how easy would this be to win and rank", with plain reasons. */
export function opportunityScore(o: OpportunityInput): OpportunityScore {
  const R = OPPORTUNITY_RULES;
  if (o.conflict) return { score: 0, reasons: ["A client of ours in this niche already serves this market"], missing: [], blocked: true };
  const reasons: string[] = [];
  const missing: string[] = [];
  let score = 0;

  if (o.demand === null) missing.push("search demand");
  else {
    // Log scale: 100 searches already counts for something; 2,000+ is full.
    const share = o.demand <= 0 ? 0 : clamp01(Math.log10(1 + o.demand) / Math.log10(1 + R.demandFull));
    score += share * R.demandPoints;
    reasons.push(`${o.demand.toLocaleString("en-US")} searches/month`);
  }
  if (o.packReviewsAvg === null) missing.push("Maps top-3 reviews");
  else {
    score += clamp01((R.reviewsHard - o.packReviewsAvg) / (R.reviewsHard - R.reviewsEasy)) * R.reviewsPoints;
    reasons.push(`Maps top 3 average ${Math.round(o.packReviewsAvg)} reviews`);
  }
  if (o.packNoWebsite === null) missing.push("competitor websites");
  else {
    const n = Math.max(0, Math.min(3, Math.floor(o.packNoWebsite)));
    score += n * R.noWebsitePoints;
    if (n > 0) reasons.push(`${n} of the Maps top 3 ${n === 1 ? "has" : "have"} no real website`);
  }
  if (o.difficulty === null) missing.push("keyword difficulty");
  else {
    score += clamp01((100 - o.difficulty) / 100) * R.difficultyPoints;
    reasons.push(`keyword difficulty ${Math.round(o.difficulty)}/100`);
  }
  if (o.milesFromBase === null) missing.push("distance");
  else {
    score += clamp01((R.farMiles - o.milesFromBase) / (R.farMiles - R.nearMiles)) * R.distancePoints;
    reasons.push(`${Math.round(o.milesFromBase)} mi from the office`);
  }
  const nearby = Math.max(0, Math.min(2, Math.floor(o.nearbyClients)));
  score += nearby * R.nearbyClientPoints;
  if (nearby > 0) reasons.push(`${o.nearbyClients} client${o.nearbyClients === 1 ? "" : "s"} of ours nearby`);

  return { score: Math.round(Math.max(0, Math.min(100, score))), reasons, missing, blocked: false };
}

// ---------------------------------------------------------------- "is it upsell time?"

export interface UpsellFacts {
  /** Money keywords that moved into the top 3 in the last `newTop3Days` days. */
  newTop3Money: number;
  /** Visibility change over the last 3 months, in percent (null = not enough data). */
  visibilityChange3mPct: number | null;
  /** Share of tracked keyword × market pairs in the top 3 now (0–100). */
  top3SharePct: number;
}

export interface UpsellCheck {
  label: string;
  ok: boolean;
}

export interface UpsellDecision {
  due: boolean;
  checks: UpsellCheck[];
  /** The one idea to show (only when due). */
  idea: string | null;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

function monthsBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number) as [number, number, number];
  const [by, bm, bd] = b.split("-").map(Number) as [number, number, number];
  return (by - ay) * 12 + (bm - am) - (bd < ad ? 1 : 0);
}

/**
 * The upsell section shows only when ALL checks pass (owner-approved rule, numbers in
 * UPSELL_RULES). A person can still switch it off or on per report.
 */
export function upsellDue(client: WatchClient, facts: UpsellFacts, today: string): UpsellDecision {
  const R = UPSELL_RULES;
  const months = monthsBetween(client.startedOn, today);
  const sinceLast = client.lastUpsellSentOn === null ? null : daysBetween(client.lastUpsellSentOn, today);
  const earned =
    facts.newTop3Money >= R.newTop3Money ||
    (facts.visibilityChange3mPct !== null && facts.visibilityChange3mPct >= R.visibilityUpPct) ||
    facts.top3SharePct >= R.ceilingPct;
  const nextStep = client.nextServices.find((s) => !client.services.includes(s)) ?? null;
  const checks: UpsellCheck[] = [
    { label: `Client for ${R.minMonths}+ months (now ${Math.max(0, months)})`, ok: months >= R.minMonths },
    {
      label: sinceLast === null ? "No upsell sent before" : `${R.gapDays}+ days since the last upsell (now ${sinceLast})`,
      ok: sinceLast === null || sinceLast >= R.gapDays,
    },
    {
      label: "Happy: not at risk, no open complaint, last check-in not negative",
      ok: client.health !== "at_risk" && !client.openComplaint && client.lastMood !== "negative",
    },
    {
      label: `Rankings clearly better (${R.newTop3Money}+ money keywords into the top 3, or visibility +${R.visibilityUpPct}% in 3 months, or top 3 on ${R.ceilingPct}%+ of keywords)`,
      ok: earned,
    },
    { label: nextStep ? `A specific next step: ${nextStep}` : "A specific next step (none set)", ok: nextStep !== null },
  ];
  const due = checks.every((c) => c.ok);
  return { due, checks, idea: due ? nextStep : null };
}

/** Upsell facts for a client from the stored checks (latest check vs earlier ones). */
export function upsellFacts(data: WatchData, clientId: string): UpsellFacts {
  const kws = data.keywords.filter((k) => k.clientId === clientId);
  const ids = new Set(kws.map((k) => k.id));
  const money = new Set(kws.filter((k) => k.money).map((k) => k.id));
  const checks = data.checks.filter((c) => ids.has(c.keywordId));
  const dates = checkDates(checks);
  const last = dates.at(-1);
  if (!last) return { newTop3Money: 0, visibilityChange3mPct: null, top3SharePct: 0 };
  const windowStart = new Date(Date.parse(`${last}T00:00:00Z`) - UPSELL_RULES.newTop3Days * 86_400_000).toISOString().slice(0, 10);
  const start = dates.find((d) => d >= windowStart) ?? last;
  const at = (d: string) => new Map(checks.filter((c) => c.date === d).map((c) => [`${c.keywordId}|${c.marketId}`, c]));
  const then = at(start);
  const now = at(last);
  let newTop3Money = 0;
  let top3 = 0;
  for (const [k, c] of now) {
    const inTop3 = c.organic !== null && c.organic <= 3;
    if (inTop3) top3++;
    const b = then.get(k);
    if (money.has(c.keywordId) && inTop3 && b && (b.organic === null || b.organic > 3)) newTop3Money++;
  }
  const series = visibilitySeries(data, clientId);
  const threeMonthsAgo = new Date(Date.parse(`${last}T00:00:00Z`) - 91 * 86_400_000).toISOString().slice(0, 10);
  const base = series.find((p) => p.date >= threeMonthsAgo);
  const visibilityChange3mPct = base && base.date !== last ? pctChange(base.visits, series.at(-1)!.visits) : null;
  return { newTop3Money, visibilityChange3mPct, top3SharePct: now.size ? Math.round((top3 / now.size) * 100) : 0 };
}

// ---------------------------------------------------------------- "ask the owner for more room"

export interface RoomNotice {
  level: "ok" | "ask" | "full";
  pct: number;
  text: string;
}

/**
 * The app never raises a cap or a limit itself. At `askAtPct` it asks the owner,
 * showing what's used; at 100% the next paid check waits until the owner decides.
 */
export function roomNotice(what: string, used: number, max: number, unit: "usd" | "count" = "count"): RoomNotice {
  const pct = max <= 0 ? 100 : Math.min(100, Math.round((used / max) * 100));
  const fmt = (n: number) => (unit === "usd" ? `$${n.toFixed(2)}` : String(n));
  if (pct >= 100) return { level: "full", pct, text: `${what}: ${fmt(used)} of ${fmt(max)} used. Nothing more runs until you decide.` };
  if (pct >= WATCH_RULES.askAtPct) return { level: "ask", pct, text: `${what}: ${fmt(used)} of ${fmt(max)} used (${pct}%). Want to give it more room?` };
  return { level: "ok", pct, text: `${what}: ${fmt(used)} of ${fmt(max)} used` };
}

/** Rank-check cost for one round (model; real prices are shown before every run). */
export const CHECK_COST_USD = 0.0024;

export function roundCostUsd(keywordMarketPairs: number): number {
  return Math.round(keywordMarketPairs * CHECK_COST_USD * 100) / 100;
}
