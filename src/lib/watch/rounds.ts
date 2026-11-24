// SEO Watcher rounds (Phase B, docs/SEO_WATCHER_PLAN.md): what a round of checks costs,
// the copy-only prompt for Claude Code, and the strict checker for the results file.
//
// A round runs in Claude Code (where DataForSEO is connected), not in the app. The prompt
// carries only websites, keywords, cities and ids, never client names, staff or money.
// The results file is UNTRUSTED data: every field is checked, sizes are capped, unknown
// fields are dropped, and ids must match this round. Pure: no database, no network.

import { CHECK_COST_USD } from "./compute";

/** One Google Ads search-volume task covers one city (DataForSEO, ~$0.06). */
export const VOLUME_TASK_USD = 0.06;
/** Extra room in the estimate for retries and small price changes. */
export const ESTIMATE_BUFFER = 1.15;
export const WATCH_RESULTS_MAX_BYTES = 2_000_000;
export const WATCH_RESULTS_MAX_ROWS = 20_000;

/** Estimated cost of a round, rounded up to the cent (at least 5 cents). */
export function roundEstimate(pairs: number, volumeCities: number): number {
  const raw = (Math.max(0, pairs) * CHECK_COST_USD + Math.max(0, volumeCities) * VOLUME_TASK_USD) * ESTIMATE_BUFFER;
  return Math.max(0.05, Math.ceil(raw * 100) / 100);
}

/** Today's date in New York (the agency's time zone), YYYY-MM-DD. */
export function nyToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Search volumes only change monthly at Google: fetch them when last month isn't stored yet. */
export function volumesDue(latestStoredMonth: string | null, today: string): boolean {
  const [y, m] = today.split("-").map(Number) as [number, number];
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  return latestStoredMonth === null || latestStoredMonth < prev;
}

// ---------------------------------------------------------------- the prompt

export interface RoundClient {
  domain: string;
  niche: string;
  keywords: { id: string; keyword: string }[];
  markets: { id: string; city: string; state: string; hasPosition: boolean }[];
  competitors: string[];
}

export function buildWatchPrompt(run: { id: string; budgetUsd: number; volumes: boolean; clients: RoundClient[] }): string {
  const lists = run.clients
    .map((c, i) => {
      const kws = c.keywords.map((k) => `    - ${k.id} | ${k.keyword}`).join("\n");
      const mks = c.markets.map((m) => `    - ${m.id} | ${m.city}, ${m.state}${m.hasPosition ? "" : " | NEEDS lat/lng"}`).join("\n");
      return `Site ${i + 1}: ${c.domain} (${c.niche})
  Competitors to note: ${c.competitors.length ? c.competitors.join(", ") : "none listed; note whoever ranks"}
  Keywords (id | keyword):
${kws || "    (none)"}
  Cities (id | city):
${mks || "    (none)"}`;
    })
    .join("\n\n");
  return `You are running one round of SEO Watcher checks for Agency Atlas (a small SEO agency's internal tool). Use the DataForSEO tools. Read-only research: never contact, message, book or sign up for anything.

ROUND
- Round id: ${run.id}
- BUDGET: stop before DataForSEO spend reaches $${run.budgetUsd.toFixed(2)}. Use the cheapest options (standard queue where possible, depth 30). Skip checks rather than go over.
- Search volumes this round: ${run.volumes ? "YES (last full month, Google Ads search volume, one task per city)" : "NO (skip them)"}

STEPS (for every keyword × city pair below)
1. Google organic results for the keyword in that city (location = the city, language English, top 30). Record the site's position (null if not in the top 30), the page that ranks, and the positions of up to 10 other sites (domain + position), including the listed competitors when they appear.
2. Google Maps / local pack for the same search and city: the site's spot 1–3, or 0 if checked and not in the top 3, or null if you could not check.
${run.volumes ? "3. Google Ads search volume for each keyword in each city: the most recent full month, monthly searches and cost per click. null when not found.\n" : ""}- For any city marked "NEEDS lat/lng", include its latitude/longitude (city centre) and the DataForSEO location code you used.
- Never guess or invent a number. If something could not be checked, use null. Do not collect phone numbers, emails or anyone's name.

SITES
${lists}

OUTPUT: one JSON file named watch-${run.id.slice(0, 8)}.json, exactly this shape and nothing else:
{
  "kind": "atlas-watch-results",
  "version": 1,
  "runId": "${run.id}",
  "checkedOn": "YYYY-MM-DD",
  "costUsd": 0.00,
  "markets": [ { "marketId": "…", "lat": 41.5, "lng": -81.7, "locationCode": 1234567 } ],
  "ranks": [
    { "keywordId": "…", "marketId": "…", "organic": 4, "pack": 1, "url": "https://…", "others": [ { "domain": "competitor.com", "position": 2 } ] }
  ],
  "volumes": [ { "keywordId": "…", "marketId": "…", "month": "YYYY-MM", "volume": 1300, "cpcUsd": 12.5 } ]
}
Use the exact ids above. Put the real total DataForSEO cost in costUsd. Then I will attach the file in Atlas (Growth → SEO Watcher → this round → Attach results).`;
}

// ---------------------------------------------------------------- the results checker

export interface RoundScope {
  runId: string;
  /** keyword id → its client and words */
  keywords: Map<string, { clientId: string; keyword: string }>;
  /** city id → its client */
  markets: Map<string, string>;
  /** Today in New York (YYYY-MM-DD): nothing may be dated later. */
  today: string;
}

/** The keywords and cities a round may report on: active entries of the round's clients. */
export function buildRoundScope(
  runId: string,
  clientIds: string[],
  keywords: { id: string; clientId: string; keyword: string; active: boolean }[],
  markets: { id: string; clientId: string; active: boolean }[],
  today: string,
): RoundScope {
  const ids = new Set(clientIds);
  return {
    runId,
    keywords: new Map(keywords.filter((k) => k.active && ids.has(k.clientId)).map((k) => [k.id, { clientId: k.clientId, keyword: k.keyword }])),
    markets: new Map(markets.filter((m) => m.active && ids.has(m.clientId)).map((m) => [m.id, m.clientId])),
    today,
  };
}

export interface RankRow {
  clientId: string;
  keywordId: string;
  marketId: string;
  organic: number | null;
  pack: number | null;
  url: string | null;
  others: { domain: string; position: number }[];
}

export interface VolumeRow {
  clientId: string;
  marketId: string;
  keyword: string;
  month: string; // YYYY-MM-01
  volume: number | null;
  cpcUsd: number | null;
}

export interface MarketFix {
  marketId: string;
  lat: number;
  lng: number;
  locationCode: number | null;
}

export interface WatchResults {
  checkedOn: string;
  costUsd: number | null;
  ranks: RankRow[];
  volumes: VolumeRow[];
  markets: MarketFix[];
  /** Rows left out, with why (shown as plain text). */
  skipped: number;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DOMAIN = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

const intIn = (v: unknown, min: number, max: number): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null;
const numIn = (v: unknown, min: number, max: number): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null;

/** A bare, lower-case domain from "https://www.x.com/page" or "x.com"; null if it isn't one. */
export function bareDomain(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  if (!t || t.length > 200) return null;
  try {
    const u = new URL(/^https?:\/\//.test(t) ? t : `https://${t}`);
    if (u.username || u.password || u.port) return null;
    const host = u.hostname.replace(/^www\./, "");
    return DOMAIN.test(host) && host.length <= 120 ? host : null;
  } catch {
    return null;
  }
}

function webUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t || t.length > 300 || /[\s<>"]/.test(t)) return null;
  try {
    const u = new URL(t);
    if ((u.protocol !== "https:" && u.protocol !== "http:") || u.username || u.password) return null;
    return t;
  } catch {
    return null;
  }
}

function validDay(v: unknown): string | null {
  return typeof v === "string" && DAY.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? v : null;
}

/** Nullable field: null stays null, anything else must pass `read` or the row is refused. */
function nullable<T>(v: unknown, read: (x: unknown) => T | null): { ok: true; value: T | null } | { ok: false } {
  if (v === null || v === undefined) return { ok: true, value: null };
  const r = read(v);
  return r === null ? { ok: false } : { ok: true, value: r };
}

export function parseWatchResults(raw: string, scope: RoundScope): { ok: true; results: WatchResults } | { ok: false; error: string } {
  if (raw.length > WATCH_RESULTS_MAX_BYTES) return { ok: false, error: "That's too big (over 2 MB)." };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: "That isn't a results file (it isn't valid JSON)." };
  }
  if (!isObj(json) || json.kind !== "atlas-watch-results" || json.version !== 1) return { ok: false, error: "That isn't a Watcher results file." };
  if (json.runId !== scope.runId) return { ok: false, error: "That results file is for a different round." };
  const checkedOn = validDay(json.checkedOn);
  if (!checkedOn) return { ok: false, error: "The results file has no valid checkedOn date." };
  if (checkedOn > scope.today) return { ok: false, error: "The results are dated in the future." };
  const cost = json.costUsd === null || json.costUsd === undefined ? null : numIn(json.costUsd, 0, 100);
  if (json.costUsd !== null && json.costUsd !== undefined && cost === null) return { ok: false, error: "costUsd must be a dollar amount between 0 and 100." };
  const lists = [json.ranks, json.volumes, json.markets];
  if (lists.some((l) => l !== undefined && !Array.isArray(l))) return { ok: false, error: "ranks, volumes and markets must be lists." };
  const rankIn = (json.ranks as unknown[] | undefined) ?? [];
  const volIn = (json.volumes as unknown[] | undefined) ?? [];
  const mktIn = (json.markets as unknown[] | undefined) ?? [];
  if (rankIn.length + volIn.length + mktIn.length > WATCH_RESULTS_MAX_ROWS) return { ok: false, error: "Too many rows in one results file." };

  let skipped = 0;
  const ranks = new Map<string, RankRow>();
  for (const r of rankIn) {
    if (!isObj(r) || typeof r.keywordId !== "string" || typeof r.marketId !== "string" || !UUID.test(r.keywordId) || !UUID.test(r.marketId)) {
      skipped++;
      continue;
    }
    const kw = scope.keywords.get(r.keywordId);
    const mc = scope.markets.get(r.marketId);
    const organic = nullable(r.organic, (v) => intIn(v, 1, 100));
    const pack = nullable(r.pack, (v) => intIn(v, 0, 3));
    const url = nullable(r.url, webUrl);
    if (!kw || !mc || kw.clientId !== mc || !organic.ok || !pack.ok || !url.ok) {
      skipped++;
      continue;
    }
    const others: { domain: string; position: number }[] = [];
    if (Array.isArray(r.others)) {
      for (const o of r.others.slice(0, 20)) {
        if (!isObj(o)) continue;
        const domain = bareDomain(o.domain);
        const position = intIn(o.position, 1, 100);
        if (domain && position !== null && !others.some((x) => x.domain === domain)) others.push({ domain, position });
      }
    }
    // One row per keyword × city (the last one in the file wins).
    ranks.set(`${r.keywordId}|${r.marketId}`, { clientId: mc, keywordId: r.keywordId, marketId: r.marketId, organic: organic.value, pack: pack.value, url: url.value, others });
  }

  const volumes = new Map<string, VolumeRow>();
  const thisMonth = scope.today.slice(0, 7);
  for (const v of volIn) {
    if (!isObj(v) || typeof v.keywordId !== "string" || typeof v.marketId !== "string" || typeof v.month !== "string" || !MONTH.test(v.month)) {
      skipped++;
      continue;
    }
    const kw = scope.keywords.get(v.keywordId);
    const mc = scope.markets.get(v.marketId);
    const volume = nullable(v.volume, (x) => intIn(x, 0, 100_000_000));
    const cpc = nullable(v.cpcUsd, (x) => numIn(x, 0, 10_000));
    const month = v.month;
    const mm = Number(month.slice(5, 7));
    if (!kw || !mc || kw.clientId !== mc || !volume.ok || !cpc.ok || mm < 1 || mm > 12 || month > thisMonth || month < "2018-01") {
      skipped++;
      continue;
    }
    volumes.set(`${v.marketId}|${kw.keyword}|${month}`, {
      clientId: mc,
      marketId: v.marketId,
      keyword: kw.keyword,
      month: `${month}-01`,
      volume: volume.value,
      cpcUsd: cpc.value === null ? null : Math.round(cpc.value * 100) / 100,
    });
  }

  const markets = new Map<string, MarketFix>();
  for (const m of mktIn) {
    if (!isObj(m) || typeof m.marketId !== "string" || !scope.markets.has(m.marketId)) {
      skipped++;
      continue;
    }
    const lat = numIn(m.lat, 17, 72);
    const lng = numIn(m.lng, -180, -64);
    const code = nullable(m.locationCode, (x) => intIn(x, 1, 99_999_999));
    if (lat === null || lng === null || !code.ok) {
      skipped++;
      continue;
    }
    markets.set(m.marketId, { marketId: m.marketId, lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5, locationCode: code.value });
  }

  if (ranks.size + volumes.size + markets.size === 0) return { ok: false, error: "Nothing in that file matches this round's keywords and cities." };
  return {
    ok: true,
    results: { checkedOn, costUsd: cost === null ? null : Math.round(cost * 10_000) / 10_000, ranks: [...ranks.values()], volumes: [...volumes.values()], markets: [...markets.values()], skipped },
  };
}
