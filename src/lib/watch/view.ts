// SEO Watcher: turns stored data into what the screens show. Pure, no network.
// All math lives in compute.ts; this file only picks, names and orders.

import {
  checkDates,
  competitorRisers,
  movers,
  opportunityScore,
  pctChange,
  spotTrends,
  toIndex,
  trendOf,
  upsellDue,
  upsellFacts,
  visibilitySeries,
  volumeChange,
  type Mover,
  type OpportunityInput,
  type OpportunityScore,
  type RankCheck,
  type Spotted,
  type Trend,
  type UpsellDecision,
  type VolumeChange,
  type WatchClient,
  type WatchData,
} from "./compute";

/** Weeks compared for "biggest movers" and ticker changes. */
export const MOVER_WEEKS = 4;
/** Weeks looked back for "competitors on the rise". */
export const RISER_WEEKS = 12;

export interface Ticker {
  client: WatchClient;
  visits: number;
  changePct: number | null;
  spark: number[];
  trend: Trend;
  top3: number;
  inPack: number;
  pairs: number;
}

export interface NamedMover extends Mover {
  clientName: string;
  marketName: string;
}

export interface BoardView {
  dates: string[];
  agencyIndex: (number | null)[];
  agencyChangePct: number | null;
  tickers: Ticker[];
  movers: { up: NamedMover[]; down: NamedMover[]; from: string | null; to: string | null };
  risers: { domain: string; visitsChange: number; clientNames: string[]; gains: number }[];
  risersFrom: string | null;
  spotted: (Spotted & { clientName: string })[];
}

export function marketNamer(data: WatchData) {
  const names = new Map(data.markets.map((m) => [m.id, `${m.city}, ${m.state}`]));
  return (id: string) => names.get(id) ?? "unknown market";
}

function clientNamer(data: WatchData) {
  const names = new Map(data.clients.map((c) => [c.id, c.name]));
  return (id: string) => names.get(id) ?? "unknown client";
}

function latestByPair(checks: RankCheck[], date: string | undefined) {
  return date ? checks.filter((c) => c.date === date) : [];
}

export function buildBoard(data: WatchData): BoardView {
  const dates = checkDates(data.checks);
  const last = dates.at(-1);
  const from = dates.at(-1 - MOVER_WEEKS) ?? dates[0] ?? null;
  const risersFrom = dates.at(-1 - RISER_WEEKS) ?? dates[0] ?? null;
  const marketName = marketNamer(data);
  const clientName = clientNamer(data);

  const agency = visibilitySeries(data, null);
  const agencyIndex = toIndex(agency.map((p) => p.visits));
  const fromIdx = agency.findIndex((p) => p.date === from);

  const tickers: Ticker[] = data.clients.map((client) => {
    const series = visibilitySeries(data, client.id);
    const kws = new Set(data.keywords.filter((k) => k.clientId === client.id).map((k) => k.id));
    const now = latestByPair(data.checks, last).filter((c) => kws.has(c.keywordId));
    const startPoint = series.find((p) => p.date === from);
    return {
      client,
      visits: series.at(-1)?.visits ?? 0,
      changePct: pctChange(startPoint?.visits, series.at(-1)?.visits),
      spark: series.map((p) => p.visits),
      trend: trendOf(series.map((p) => p.visits)),
      top3: now.filter((c) => c.organic !== null && c.organic <= 3).length,
      inPack: now.filter((c) => c.pack !== null && c.pack >= 1).length,
      pairs: now.length,
    };
  });
  tickers.sort((a, b) => (b.changePct ?? -Infinity) - (a.changePct ?? -Infinity) || a.client.name.localeCompare(b.client.name));

  const name = (m: Mover): NamedMover => ({ ...m, clientName: clientName(m.clientId), marketName: marketName(m.marketId) });
  const mv = from && last && from !== last ? movers(data, from, last) : { up: [], down: [] };
  const rs = risersFrom && last && risersFrom !== last ? competitorRisers(data, risersFrom, last) : [];

  return {
    dates,
    agencyIndex,
    agencyChangePct: fromIdx >= 0 ? pctChange(agency[fromIdx]!.visits, agency.at(-1)?.visits) : null,
    tickers,
    movers: { up: mv.up.map(name), down: mv.down.map(name), from, to: last ?? null },
    risers: rs.map((r) => ({ domain: r.domain, visitsChange: r.visitsChange, clientNames: r.clientIds.map(clientName), gains: r.gains })),
    risersFrom,
    spotted: spotTrends(data, marketName).map((s) => ({ ...s, clientName: clientName(s.clientId) })),
  };
}

// ---------------------------------------------------------------- one client

export interface KeywordRowView {
  keyword: string;
  money: boolean;
  marketName: string;
  now: number | null;
  last: number | null;
  weeksAgo: number | null;
  best: number | null;
  pack: number | null;
  series: (number | null)[];
  volume: number | null;
}

export interface ClientView {
  client: WatchClient;
  dates: string[];
  visits: number[];
  trend: Trend;
  changePct: number | null;
  rows: KeywordRowView[];
  competitors: { domain: string; avgNow: number | null; avgThen: number | null; seenOn: number }[];
  upsell: UpsellDecision;
}

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);

export function buildClient(data: WatchData, clientId: string, today: string): ClientView | null {
  const client = data.clients.find((c) => c.id === clientId);
  if (!client) return null;
  const marketName = marketNamer(data);
  const kws = data.keywords.filter((k) => k.clientId === clientId);
  const ids = new Set(kws.map((k) => k.id));
  const checks = data.checks.filter((c) => ids.has(c.keywordId));
  const dates = checkDates(checks);
  const last = dates.at(-1);
  const prev = dates.at(-2);
  const then = dates.at(-1 - MOVER_WEEKS) ?? dates[0];
  const series = visibilitySeries(data, clientId);

  const rows: KeywordRowView[] = [];
  for (const k of kws) {
    const marketIds = [...new Set(checks.filter((c) => c.keywordId === k.id).map((c) => c.marketId))];
    for (const m of marketIds) {
      const mine = checks.filter((c) => c.keywordId === k.id && c.marketId === m).sort((a, b) => a.date.localeCompare(b.date));
      const at = (d: string | undefined) => (d ? mine.find((c) => c.date === d) : undefined);
      const known = mine.map((c) => c.organic).filter((p): p is number => p !== null);
      rows.push({
        keyword: k.keyword,
        money: k.money,
        marketName: marketName(m),
        now: at(last)?.organic ?? null,
        last: at(prev)?.organic ?? null,
        weeksAgo: at(then)?.organic ?? null,
        best: known.length ? Math.min(...known) : null,
        pack: at(last)?.pack ?? null,
        series: mine.map((c) => c.organic),
        volume: volumeChange(data.volumes, k.keyword, m).latest,
      });
    }
  }
  rows.sort((a, b) => Number(b.money) - Number(a.money) || (b.volume ?? 0) - (a.volume ?? 0));

  const ours = client.domain.toLowerCase();
  const competitors = data.competitors
    .filter((c) => c.clientId === clientId && c.domain.toLowerCase() !== ours)
    .map((c) => {
      const pos = (d: string | undefined) =>
        checks.filter((x) => x.date === d).flatMap((x) => x.others.filter((o) => o.domain === c.domain).map((o) => o.position));
      const nowPos = pos(last);
      return { domain: c.domain, avgNow: avg(nowPos), avgThen: avg(pos(then)), seenOn: nowPos.length };
    });

  return {
    client,
    dates,
    visits: series.map((p) => p.visits),
    trend: trendOf(series.map((p) => p.visits)),
    changePct: pctChange(series.find((p) => p.date === then)?.visits, series.at(-1)?.visits),
    rows,
    competitors,
    upsell: upsellDue(client, upsellFacts(data, clientId), today),
  };
}

// ---------------------------------------------------------------- demand

export interface DemandRow {
  clientName: string;
  keyword: string;
  marketName: string;
  change: VolumeChange;
  last12: (number | null)[];
}

export function buildDemand(data: WatchData): DemandRow[] {
  const marketName = marketNamer(data);
  const clientName = clientNamer(data);
  const rows: DemandRow[] = [];
  for (const k of data.keywords) {
    const markets = [...new Set(data.volumes.filter((v) => v.keyword === k.keyword).map((v) => v.marketId))];
    const ownMarkets = new Set(data.markets.filter((m) => m.clientId === k.clientId).map((m) => m.id));
    for (const m of markets.filter((x) => ownMarkets.has(x))) {
      const months = data.volumes.filter((v) => v.keyword === k.keyword && v.marketId === m).sort((a, b) => a.month.localeCompare(b.month));
      rows.push({
        clientName: clientName(k.clientId),
        keyword: k.keyword,
        marketName: marketName(m),
        change: volumeChange(data.volumes, k.keyword, m),
        last12: months.slice(-12).map((v) => v.volume),
      });
    }
  }
  return rows.sort((a, b) => (b.change.latest ?? -1) - (a.change.latest ?? -1));
}

// ---------------------------------------------------------------- opportunities

export interface OpportunityView<T> {
  item: T;
  result: OpportunityScore;
}

export function rankOpportunities<T extends { input: OpportunityInput }>(items: T[]): OpportunityView<T>[] {
  return items
    .map((item) => ({ item, result: opportunityScore(item.input) }))
    .sort((a, b) => Number(a.result.blocked) - Number(b.result.blocked) || b.result.score - a.result.score);
}
