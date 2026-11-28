// Run audit, D1 "data depth" (docs/AUDIT_DEPTH_PLAN.md). Pure: no network, no database.
// Turns DataForSEO answers (untrusted; every field optional) into:
// - a keyword universe: the rep's short seed searches + DataForSEO's suggestions that name
//   one of this audit's towns, the state or "near me", grouped by town;
// - a LOCAL click-through model per site from its real rankings on those searches
//   (visits, "positioned for", top 3 / top 10, the towns it ranks in, the pages it built);
// - a homepage check for the business (title, H1, description, basic problems).
// Search counts always come from Google Ads for the state (DataForSEO keyword data);
// DataForSEO Labs is US-wide, so it is used to FIND searches and rankings, not to count them.

import { stateName, US_STATES } from "./geo";
import { contactDetailIn, normalizeDomain } from "./intake";
import { isHomeBuyer } from "./home-buyer";
import { placeState } from "./places";

/** A DataForSEO answer (same shape as the source module's; kept local so only run.ts imports that module). */
export interface DfsAnswer {
  result: unknown[];
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown, max = 200): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export const DEPTH_RULES = {
  /** Seed searches used for discovery (the first few short services). */
  seeds: 5,
  /** Suggestions asked for per seed. */
  suggestionsPerSeed: 500,
  /** Keywords kept in the universe (by Google Ads volume). */
  universe: 600,
  /** Ranked keywords read per site. */
  rankedPerSite: 1000,
  /** "What they built": pages listed per competitor. */
  pagesPerSite: 6,
} as const;

/** Share of searchers who click each Google position (a common industry curve; a model). */
export const CTR: Record<number, number> = { 1: 0.28, 2: 0.15, 3: 0.1, 4: 0.07, 5: 0.05, 6: 0.04, 7: 0.03, 8: 0.025, 9: 0.02, 10: 0.02 };
/** Share of searchers who click each spot in the Google map pack (#1–3; a cautious model). */
export const PACK_CTR: Record<number, number> = { 1: 0.15, 2: 0.1, 3: 0.08 };

export function ctr(position: number): number {
  if (!Number.isInteger(position) || position < 1) return 0;
  if (position <= 10) return CTR[position] ?? 0;
  if (position <= 20) return 0.01;
  return 0;
}

// ---------------------------------------------------------------------------
// Markets (towns, counties, state) and matching a search to a market
// ---------------------------------------------------------------------------

export interface Market {
  /** As written in the audit ("Warren", "Sharon, PA"). */
  label: string;
  /** How people type it in a search ("warren", "sharon"). */
  term: string;
  /** A town near the home town that isn't one of the audit's own markets (searches only). */
  nearby?: boolean;
}

const termOf = (label: string, state: string) => placeState(label, state).name.toLowerCase().replace(/\s+county$/, " county");

export function auditMarkets(hqTown: string, cities: string[], state: string): Market[] {
  return [hqTown, ...cities].map((label) => ({ label, term: termOf(label, state) }));
}

/** Towns within ~30 miles of the home town (from the place list), minus the audit's own markets. */
export function nearbyMarkets(labels: string[], own: Market[], state: string): Market[] {
  const taken = new Set(own.map((m) => m.term));
  const out: Market[] = [];
  for (const label of labels) {
    const term = termOf(label, state);
    if (term.length < 3 || taken.has(term)) continue;
    taken.add(term);
    out.push({ label, term, nearby: true });
  }
  return out;
}

/**
 * The wider area searched for an audit: its markets (+ nearby towns), the state, and every
 * other place name in that state (so "we buy houses columbus ohio" isn't counted for a
 * Youngstown audit just because it says "ohio").
 */
export interface Area {
  markets: Market[];
  state: string;
  /** Lower-case place names in the state (cities, townships, counties). */
  others?: ReadonlySet<string>;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Words that turn a town's name into ANOTHER place when they come right before it
// ("winston salem" is Winston-Salem NC, not Salem OH; "north canton" isn't Canton).
const PLACE_PREFIXES = new Set(["winston", "new", "north", "south", "east", "west", "old", "port", "fort", "mount", "mt", "lake", "san", "santa", "st", "saint", "upper", "lower", "little", "great", "glen"]);

/**
 * Does the search name this town (whole words), and not a bigger place whose name ends with it?
 * A market whose own name already starts with the word ("north canton" as a market) still matches.
 */
export function namesTown(keyword: string, term: string): boolean {
  const k = ` ${keyword.toLowerCase().replace(/\s+/g, " ").trim()} `;
  const t = ` ${term} `;
  for (let i = k.indexOf(t); i !== -1; i = k.indexOf(t, i + 1)) {
    const before = k.slice(0, i).trim().split(" ").pop() ?? "";
    if (!PLACE_PREFIXES.has(before)) return true;
  }
  return false;
}

/** The market a search names (longest name first, whole words), or null. */
export function marketOf(keyword: string, markets: Market[]): Market | null {
  let best: Market | null = null;
  for (const m of markets) {
    if (namesTown(keyword, m.term) && (!best || m.term.length > best.term.length)) best = m;
  }
  return best;
}

/** What makes a search "local" here: a town/county of this audit, the state's name, or "near me". */
export function localPattern(markets: Market[], state: string): string {
  const names = [...new Set([...markets.map((m) => m.term), stateName(state).toLowerCase(), "near me"])];
  return names.map(escape).join("|");
}

/** Does the search name a place in the state that isn't one of these markets? */
export function namesOtherPlace(keyword: string, markets: Market[], others: ReadonlySet<string> | undefined): boolean {
  if (!others?.size) return false;
  const words = keyword.toLowerCase().split(/\s+/).filter(Boolean);
  const own = new Set(markets.map((m) => m.term));
  for (let n = 1; n <= 3; n++)
    for (let i = 0; i + n <= words.length; i++) {
      const g = words.slice(i, i + n).join(" ");
      if (others.has(g) && !own.has(g)) return true;
    }
  return false;
}

// Two-letter codes that are also everyday words at the end of a search ("near me", "rent a car
// co") are not read as a state.
const CODE_WORDS = new Set(["me", "in", "or", "hi", "ok", "co"]);

/**
 * Does the search name ANOTHER state ("car rental brooklyn ny", "lakewood new jersey")? Many
 * towns share a name with a bigger place elsewhere (Brooklyn OH / NY, Lakewood OH / NJ), so a
 * search that names another state is never counted for this audit's town of the same name.
 */
export function namesOtherState(keyword: string, state: string, markets: Market[] = []): boolean {
  const k = ` ${keyword.toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim()} `;
  const own = markets.map((m) => m.term);
  for (const [code, name] of Object.entries(US_STATES)) {
    if (code === state.toUpperCase()) continue;
    const n = name.toLowerCase();
    if (k.includes(` ${n} `) && !own.some((t) => t.includes(n))) return true;
  }
  const last = k.trim().split(" ").pop() ?? "";
  return last.length === 2 && !CODE_WORDS.has(last) && last.toUpperCase() !== state.toUpperCase() && last.toUpperCase() in US_STATES && k.trim().split(" ").length > 1;
}

export function isLocal(keyword: string, markets: Market[], state: string, others?: ReadonlySet<string>): boolean {
  const k = ` ${keyword.toLowerCase()} `;
  if (namesOtherState(keyword, state, markets)) return false;
  if (markets.some((m) => namesTown(keyword, m.term)) || k.includes(" near me ")) return true;
  // The state's name alone counts only when no other town of the state is named.
  return k.includes(` ${stateName(state).toLowerCase()} `) && !namesOtherPlace(keyword, markets, others);
}

// ---------------------------------------------------------------------------
// What the business sells: a search must be about it to count for anyone
// ---------------------------------------------------------------------------

const STOP = new Set(["a", "an", "the", "for", "my", "we", "our", "your", "and", "of", "to", "in", "near", "me", "best", "top", "cheap", "local", "service", "services", "company", "companies"]);
const stem = (w: string) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);

export interface Topic {
  /** Word stems of the business type and services ("car", "rental", "daily"…), towns left out. */
  words: string[];
  /** How many of those words a search must contain: 2, or 1 when a seed is a single word ("plumber"). */
  need: number;
  /** Searches already judged relevant (the audit's keyword universe) always count. */
  known?: ReadonlySet<string>;
}

export function topicOf(phrases: string[], markets: Market[]): Topic {
  const towns = new Set(markets.flatMap((m) => m.term.split(" ")));
  const per = phrases.map((p) => [...new Set(p.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w) && !towns.has(w)).map(stem))]).filter((w) => w.length);
  const words = [...new Set(per.flat())].slice(0, 30);
  return { words, need: Math.max(1, Math.min(2, ...per.map((w) => w.length))) };
}

/**
 * Google Ads gives word-order variants the SAME count ("car rental near me", "near me car
 * rental", "car rental in near me" are one group of searches). One key per group, so a total
 * never counts the same searches three times.
 */
const FILLER = new Set(["a", "an", "the", "in", "on", "at", "for", "of", "to", "near", "me"]);
export function variantKey(keyword: string): string {
  const words = keyword.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !FILLER.has(w)).map(stem);
  const near = ` ${keyword.toLowerCase()} `.includes(" near me ") ? ["@near"] : [];
  return [...new Set([...words, ...near])].sort().join(" ");
}

/**
 * Like variantKey, but a search that names one of the audit's towns also drops the state
 * ("sell my house fast denver", "... denver co", "... denver colorado" are ONE group to Google,
 * which reports the same count for each; adding them up tripled Denver's demand). A search
 * naming only the state ("we buy houses colorado") keeps it: that is a different search.
 */
export function searchGroup(keyword: string, markets: Market[], state: string): string {
  const key = variantKey(keyword);
  const m = marketOf(keyword, markets);
  if (!m) return key;
  const keep = new Set(m.term.split(" ").map(stem));
  const drop = new Set([state.toLowerCase(), ...stateName(state).toLowerCase().split(/\s+/)].map(stem).filter((w) => !keep.has(w)));
  return key.split(" ").filter((w) => !drop.has(w)).join(" ");
}

/** Does a page address belong to another state ("/car-rental-lakewood-nj.html", "/newyork/brooklyn")? */
export function pathOtherState(path: string, state: string): boolean {
  const tokens = path.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const own = state.toUpperCase();
  return tokens.some((t) => {
    if (t.length === 2) return !CODE_WORDS.has(t) && t.toUpperCase() !== own && t.toUpperCase() in US_STATES;
    return Object.entries(US_STATES).some(([code, name]) => code !== own && name.length > 4 && t === name.toLowerCase().replace(/\s+/g, ""));
  });
}

/** Is the search about what this business sells? ("hotels cleveland" isn't, for a car rental.) */
export function onTopic(keyword: string, topic: Topic): boolean {
  if (!topic.words.length || topic.known?.has(keyword.toLowerCase())) return true;
  const have = new Set(keyword.toLowerCase().split(/[^a-z0-9]+/).map(stem));
  return topic.words.filter((w) => have.has(w)).length >= topic.need;
}

/** A loose filter for DataForSEO (any one topic word); onTopic() makes the exact call afterwards. */
export function topicPattern(topic: Topic): string {
  return topic.words.filter((w) => w.length >= 3).map(escape).join("|");
}

// ---------------------------------------------------------------------------
// Keyword universe
// ---------------------------------------------------------------------------

export interface Suggestion {
  keyword: string;
  usVolume: number | null;
  difficulty: number | null;
  intent: string | null;
}

/** DataForSEO Labs keyword suggestions → plain rows (wrong types dropped). */
export function readSuggestions(a: DfsAnswer | undefined): Suggestion[] {
  const out: Suggestion[] = [];
  for (const it of arr(obj(a?.result[0]).items)) {
    const o = obj(it);
    const keyword = str(o.keyword, 80)?.toLowerCase();
    if (!keyword) continue;
    out.push({ keyword, usVolume: num(obj(o.keyword_info).search_volume), difficulty: num(obj(o.keyword_properties).keyword_difficulty), intent: str(obj(o.search_intent_info).main_intent, 20) });
  }
  return out;
}

/**
 * The searches this audit is about: every seed, each seed with each town / county ("we buy
 * houses warren"), plus suggestions that name a town, the state or "near me" (most searched
 * first). Informational-only searches ("how to …") are left out.
 */
export function buildUniverse(seeds: string[], markets: Market[], state: string, suggestions: Suggestion[], extra: string[] = [], others?: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (k: string) => {
    const key = k.trim().toLowerCase().replace(/\s+/g, " ");
    const group = searchGroup(key, markets, state);
    if (key && key.length <= 80 && key.split(" ").length <= 10 && !seen.has(key) && !seen.has(group) && out.length < DEPTH_RULES.universe) {
      seen.add(key);
      seen.add(group);
      out.push(key);
    }
  };
  for (const s of seeds) add(s);
  for (const k of extra) add(k);
  for (const s of seeds) for (const m of markets) add(`${s} ${m.term}`);
  const local = suggestions
    .filter((g) => isLocal(g.keyword, markets, state, others) && !/^(how|what|why|when|is|can|does|do)\b/.test(g.keyword) && g.intent !== "navigational")
    .sort((a, b) => (b.usVolume ?? 0) - (a.usVolume ?? 0));
  for (const g of local) add(g.keyword);
  return out;
}

/**
 * Home buyers ("we buy houses", "sell my house fast", "cash home buyers"): sellers also search
 * their situation ("sell inherited house", "avoid foreclosure"). The agency's own audits count
 * these as demand; they name no town, so they are counted from the home town.
 */
export const SELLER_SITUATIONS = [
  "sell inherited house",
  "sell house as is",
  "sell house in foreclosure",
  "avoid foreclosure",
  "sell house during divorce",
  "sell house with tenants",
  "sell house that needs repairs",
  "sell fire damaged house",
  "sell house behind on mortgage",
  "cash offer for house",
  "sell probate house",
  "sell house with code violations",
] as const;
const SITUATION = /\b(inherit\w*|foreclos\w*|divorce|probate|as is|tenants?|needs repairs|fire damage\w*|water damage\w*|behind on (mortgage|payments)|code violations?|tax liens?|bankruptcy|cash offer)\b/;

/** Situation searches worth adding for this business (none unless it buys houses). */
export function situationSearches(niche: string, services: string[]): string[] {
  return isHomeBuyer(niche, services) ? [...SELLER_SITUATIONS] : [];
}


/** The group a search is shown under: its town, "Near me", the state, "Seller situations" or "General". */
export function groupOf(keyword: string, markets: Market[], state: string): string {
  const m = marketOf(keyword, markets);
  if (m) return m.label;
  if (` ${keyword} `.includes(" near me ")) return "Near me";
  if (` ${keyword} `.includes(` ${stateName(state).toLowerCase()} `)) return stateName(state);
  // Foreclosure, inheritance and probate are about a property on their own; the rest ("as is",
  // "tenants", "cash offer") only with a house in the search.
  if (/\b(foreclos\w*|inherit\w*|probate)\b/.test(keyword) || (/\b(house|home|property)\b/.test(keyword) && SITUATION.test(keyword))) return "Seller situations";
  return "General";
}

// ---------------------------------------------------------------------------
// A site's local rankings → the click-through model
// ---------------------------------------------------------------------------

export interface Ranked {
  keyword: string;
  position: number;
  /** Path of the ranking page ("/sell-my-house-fast-warren/"), when given. */
  path: string | null;
  usVolume: number | null;
  /** US cost per click for the search (used when the state's figure is missing). */
  cpc: number | null;
}

export function readRanked(a: DfsAnswer | undefined, domain: string): Ranked[] {
  const out: Ranked[] = [];
  for (const it of arr(obj(a?.result[0]).items)) {
    const o = obj(it);
    const kd = obj(o.keyword_data);
    const item = obj(obj(o.ranked_serp_element).serp_item);
    const keyword = str(kd.keyword, 80)?.toLowerCase();
    const position = num(item.rank_group);
    const itemDomain = typeof item.domain === "string" ? normalizeDomain(item.domain) : domain;
    if (!keyword || position === null || position < 1 || position > 100 || itemDomain !== domain) continue;
    const rel = str(item.relative_url, 160);
    out.push({ keyword, position: Math.round(position), path: rel && rel.startsWith("/") ? rel.replace(/[^A-Za-z0-9/_.~%-]/g, "") : null, usVolume: num(obj(kd.keyword_info).search_volume), cpc: num(obj(kd.keyword_info).cpc) });
  }
  return out;
}

export interface SiteModel {
  /** Local searches it ranks for at all. */
  keywords: number;
  top3: number;
  top10: number;
  /** Monthly searches on terms where it holds a top-10 spot. */
  positionedFor: number;
  /** Click-through-modeled monthly visits from local searches. */
  visits: number;
  /** What those visits would cost as ads (visits × cost per click). */
  valueUsd: number;
  /** The audit's own towns where it ranks in the top 20 (nearby towns left out). */
  markets: string[];
  /** Best position per search (for the ranking tables). */
  positions: Map<string, number>;
  /** Pages ranking for town searches (paths), most valuable first. */
  pages: string[];
}

/**
 * Local model for one site: each local search it ranks for × the search count (Google Ads
 * for the state when known, else DataForSEO's US figure for that town-named search) × the
 * click share of its position.
 */
export function modelSite(ranked: Ranked[], volume: (k: string) => number | null, cpc: (k: string) => number | null, markets: Market[], state: string, others?: ReadonlySet<string>, topic?: Topic, twin?: (k: string) => string | null): SiteModel {
  const best = new Map<string, Ranked>();
  for (const r of ranked) {
    // "near me" results depend on where the searcher stands; a US-wide ranking says nothing
    // about this area, so those searches stay out of the model (they still count as demand).
    if (!isLocal(r.keyword, markets, state, others) || ` ${r.keyword} `.includes(" near me ")) continue;
    // A travel site ranking for "hotels cleveland" says nothing about car rentals.
    if (topic && !onTopic(r.keyword, topic)) continue;
    const cur = best.get(r.keyword);
    if (!cur || r.position < cur.position) best.set(r.keyword, r);
  }
  // Variants Google counts as one search ("… denver" / "… denver co", or wordings it gives the
  // same figures: `twin`) are modeled once, at the best position among them; the tables still
  // show each variant's own position.
  const groups = new Map<string, Ranked>();
  for (const r of best.values()) {
    const t = twin?.(r.keyword);
    const g = t ? `twin|${t}` : searchGroup(r.keyword, markets, state);
    const cur = groups.get(g);
    if (!cur || r.position < cur.position) groups.set(g, r);
  }
  let visits = 0;
  let valueUsd = 0;
  let positionedFor = 0;
  let top3 = 0;
  let top10 = 0;
  const marketSet = new Set<string>();
  const pageValue = new Map<string, number>();
  for (const r of groups.values()) {
    const v = volume(r.keyword) ?? r.usVolume ?? 0;
    const clicks = v * ctr(r.position);
    visits += clicks;
    valueUsd += clicks * (cpc(r.keyword) ?? r.cpc ?? 0);
    if (r.position <= 10) {
      positionedFor += v;
      top10++;
    }
    if (r.position <= 3) top3++;
    const m = marketOf(r.keyword, markets);
    if (m && r.position <= 20) {
      marketSet.add(m.label);
      if (r.path && r.path !== "/" && !pathOtherState(r.path, state)) pageValue.set(r.path, (pageValue.get(r.path) ?? 0) + clicks + 0.001);
    }
  }
  return {
    keywords: groups.size,
    top3,
    top10,
    positionedFor: Math.round(positionedFor),
    visits: Math.round(visits),
    valueUsd: Math.round(valueUsd),
    markets: markets.filter((m) => !m.nearby && marketSet.has(m.label)).map((m) => m.label),
    positions: new Map([...best].map(([k, r]) => [k, r.position])),
    pages: [...pageValue].sort((a, b) => b[1] - a[1]).slice(0, DEPTH_RULES.pagesPerSite).map(([p]) => p),
  };
}

// ---------------------------------------------------------------------------
// Homepage check (DataForSEO On-Page "instant pages")
// ---------------------------------------------------------------------------

export interface Inspection {
  title: string | null;
  h1: string | null;
  issues: string[];
  /** Does the title or H1 name the home town? */
  namesHomeTown: boolean | null;
}

const CHECKS: [string, string][] = [
  ["no_h1_tag", "No H1 heading on the homepage"],
  ["no_title", "No page title"],
  ["title_too_long", "Page title is too long (cut off in Google)"],
  ["title_too_short", "Page title is too short"],
  ["no_description", "No meta description (Google writes its own snippet)"],
  ["duplicate_title_tag", "More than one title tag"],
  ["no_image_alt", "Images without alt text"],
  ["is_broken", "The page returned an error"],
  ["is_4xx_code", "The page returned a 4xx error"],
  ["is_5xx_code", "The page returned a 5xx error"],
  ["has_render_blocking_resources", "Scripts or styles slow the first paint"],
  ["low_content_rate", "Very little text compared with code"],
];

export function readInspection(a: DfsAnswer | undefined, hqTown: string): Inspection | null {
  const page = obj(arr(obj(a?.result[0]).items)[0]);
  if (!Object.keys(page).length) return null;
  const meta = obj(page.meta);
  const checks = obj(page.checks);
  // Titles often carry a phone number; contact details never enter an audit, so those words go.
  const scrub = (t: string | null) => {
    if (!t) return null;
    let out = t.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/g, "").replace(/\(?[0-9]{3}\)?[-. ]?[0-9]{3}[-. ][0-9]{4}/g, "").replace(/\s+/g, " ").trim().replace(/\b(call|text)( us)?( now| today)?:?$/i, "").trim().replace(/\s*[|·–-]$/, "").trim();
    if (contactDetailIn(out)) out = "";
    return out || null;
  };
  const title = scrub(str(meta.title, 160));
  const h1 = scrub(str(arr(obj(meta.htags).h1)[0], 160));
  const issues = CHECKS.filter(([k]) => checks[k] === true).map(([, label]) => label);
  if (checks.is_https === false) issues.unshift("The site isn't on https");
  const town = hqTown.toLowerCase();
  const namesHomeTown = title || h1 ? `${title ?? ""} ${h1 ?? ""}`.toLowerCase().includes(town) : null;
  return { title, h1, issues: issues.slice(0, 8), namesHomeTown };
}
