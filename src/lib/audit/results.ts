// Attach audit results (docs/AUDIT_RESULTS_PLAN.md, Phase B1): finds the "ATLAS-RESULTS v1"
// block in whatever a rep pastes (Claude's reply, a .md or .json file) and checks it field
// by field before anything is saved or drawn. Pure: no database, no network, no AI.
//
// The pasted text is UNTRUSTED. It is never run, never treated as instructions, and every
// piece of text is shown as plain text. Rules (same as every audit page):
// - every figure ends up with a source and a retrieval date (a bare number uses the block's
//   own "source" and "retrieved"); missing = null = "not found";
// - sources: DataForSEO, Semrush, LeadSnap or a live Google check (never "sample"/"model");
// - dates real and not in the future; values inside sensible ranges;
// - the website must be this audit's website; competitors must be real-looking domains;
// - no email addresses or phone numbers anywhere; no prices (prices come from settings);
// - size limited; unknown fields dropped.

import type { AdsData, AdsIntake } from "./ads";
import type { AuditCompetitor } from "./config";
import type { AuditData, AuditNarrative, Fig, GeoGrid, Grade, KeywordRow, ScorecardRow, SiteMetrics, SourceId } from "./data";
import { contactDetailIn, normalizeDomain, type AuditIntake } from "./intake";

export const RESULTS_MARKER = "ATLAS-RESULTS v1";
export const RESULTS_LIMITS = { bytes: 400_000, keywords: 200, sites: 6, cities: 25, heatmaps: 6, gridSize: 9, scorecard: 12, fixes: 8, competitors: 5, adsKeywords: 100, bidders: 10, text: 300, headline: 400 } as const;

/** The only sources results may name (never "sample", "model", "config" or "pending"). */
type ResultSource = Extract<SourceId, "dataforseo" | "semrush" | "leadsnap" | "google">;

const DOMAIN = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

// ---------------------------------------------------------------------------
// Finding the block
// ---------------------------------------------------------------------------

export type Extracted = { ok: true; block: Record<string, unknown> } | { ok: false; error: string };

/**
 * Finds the results block: the JSON object after the "ATLAS-RESULTS v1" line (inside a
 * ```json fence or not), or a pasted JSON object that says "atlas": "results-v1".
 */
export function extractResultsBlock(text: string): Extracted {
  if (typeof text !== "string" || !text.trim()) return { ok: false, error: "Paste Claude's reply (or pick the file it made) first." };
  if (new TextEncoder().encode(text).length > RESULTS_LIMITS.bytes) return { ok: false, error: "That's too big to be one audit's results (max 400 KB)." };
  const at = text.lastIndexOf(RESULTS_MARKER);
  const from = at >= 0 ? at + RESULTS_MARKER.length : 0;
  const start = text.indexOf("{", from);
  if (start < 0) return { ok: false, error: `Couldn't find the results block. Claude's reply should end with "${RESULTS_MARKER}" and a block of data in curly brackets.` };
  const end = matchingBrace(text, start);
  if (end < 0) return { ok: false, error: "The results block is cut off (the closing bracket is missing). Ask Claude to send the whole block again." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return { ok: false, error: "The results block isn't valid data (a comma or quote is off). Ask Claude to send it again, exactly in the template's format." };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, error: "The results block must be one object in curly brackets." };
  const block = parsed as Record<string, unknown>;
  if (block.atlas !== "results-v1") return { ok: false, error: 'This isn\'t an Atlas results block (it should say "atlas": "results-v1").' };
  // The prompt itself (its blank template) pasted back instead of Claude's answer.
  if (block.retrieved === "YYYY-MM-DD") {
    return { ok: false, error: "This is the prompt's blank template, not Claude's answer. Paste the prompt into Claude (with DataForSEO connected), let it run, then paste Claude's reply here. Or use Run audit above." };
  }
  return { ok: true, block };
}

/** Index of the "}" that closes the "{" at `start`, skipping brackets inside strings. */
function matchingBrace(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Shared field checks
// ---------------------------------------------------------------------------

interface Ctx {
  errors: string[];
  warnings: string[];
  source: ResultSource;
  retrieved: string;
  today: string;
}

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function isDate(v: unknown, today: string): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v && v >= "2020-01-01" && v <= today;
}

function asSource(v: unknown): ResultSource | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase().replace(/[^a-z]/g, "");
  if (s === "dataforseo") return "dataforseo";
  if (s === "semrush") return "semrush";
  if (s === "leadsnap") return "leadsnap";
  if (s === "google" || s === "googlelivecheck" || s === "livegoogle") return "google";
  return null;
}

/** Plain text: control characters out, spaces squeezed, length capped, no contact details. */
function text(c: Ctx, v: unknown, label: string, max: number = RESULTS_LIMITS.text): string {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string") {
    c.errors.push(`${label} must be text.`);
    return "";
  }
  const t = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  const found = contactDetailIn(t);
  if (found) c.errors.push(`${label}: leave out the ${found}.`);
  if (/\$\s?\d/.test(t) && /\b(per month|\/mo|a month|monthly)\b/i.test(t) && /\b(our(?:\s+[\w-]+){0,3}\s+(?:plans?|packages?|fees?|prices?|programs?)|we charge|retainer)\b/i.test(t)) c.errors.push(`${label}: prices come from Atlas settings, not from the results.`);
  return t.slice(0, max);
}

function domainOf(c: Ctx, v: unknown, label: string): string | null {
  const d = typeof v === "string" ? normalizeDomain(v) : "";
  if (!d || !DOMAIN.test(d)) {
    c.errors.push(`${label} must be a website like example.com.`);
    return null;
  }
  return d;
}

/**
 * One figure: { value, source, retrieved, note? }, or a bare value/null (then the block's
 * own source and date apply). `kind` decides what a value may be.
 */
function fig(c: Ctx, v: unknown, label: string, range: [number, number]): Fig {
  return figOf<number>(c, v, label, (x) => {
    if (typeof x !== "number" || !Number.isFinite(x)) return { error: `${label} must be a number or null.` };
    if (x < range[0] || x > range[1]) return { error: `${label} is ${x}, outside ${range[0].toLocaleString("en-US")}–${range[1].toLocaleString("en-US")}.` };
    return { value: Math.round(x * 100) / 100 };
  });
}

function boolFig(c: Ctx, v: unknown, label: string): Fig<boolean> {
  return figOf<boolean>(c, v, label, (x) => (typeof x === "boolean" ? { value: x } : { error: `${label} must be true, false or null.` }));
}

function urlFig(c: Ctx, v: unknown, label: string): Fig<string> {
  return figOf<string>(c, v, label, (x) => {
    if (typeof x !== "string" || !/^https?:\/\/[^\s<>"']{3,200}$/.test(x.trim())) return { error: `${label} must be a web address (https://…) or null.` };
    if (contactDetailIn(x)) return { error: `${label}: leave out contact details.` };
    return { value: x.trim() };
  });
}

function figOf<T>(c: Ctx, v: unknown, label: string, check: (x: unknown) => { value: T } | { error: string }): Fig<T> {
  const o = obj(v);
  const raw = o ? o.value : v;
  let source: ResultSource = c.source;
  let retrieved = c.retrieved;
  if (o) {
    if (o.source !== undefined) {
      const s = asSource(o.source);
      if (!s) c.errors.push(`${label}: source must be DataForSEO, Semrush, LeadSnap or Google.`);
      else source = s;
    }
    if (o.retrieved !== undefined) {
      if (!isDate(o.retrieved, c.today)) c.errors.push(`${label}: date must be a real date (YYYY-MM-DD), not in the future.`);
      else retrieved = o.retrieved;
    }
  }
  const out: Fig<T> = { value: null, source, retrieved };
  if (raw !== null && raw !== undefined) {
    const r = check(raw);
    if ("error" in r) c.errors.push(r.error);
    else out.value = r.value;
  }
  const note = o ? text(c, o.note, `${label} note`, 120) : "";
  if (note) out.unverified = note;
  return out;
}

/** Top of every block: kind, website, source and date. */
function header(raw: Record<string, unknown>, kind: "seo" | "ads", domain: string, today: string): Ctx | { errors: string[] } {
  const errors: string[] = [];
  if (raw.kind !== kind) errors.push(kind === "seo" ? "These are Google Ads results, but this is an SEO audit." : "These are SEO results, but this is a Google Ads audit.");
  const site = typeof raw.website === "string" ? normalizeDomain(raw.website) : "";
  if (site !== domain) errors.push(`These results are for ${site || "an unknown website"}, but this audit is for ${domain}.`);
  const source = asSource(raw.source);
  if (!source) errors.push("The block's main source must be DataForSEO, Semrush, LeadSnap or Google.");
  if (!isDate(raw.retrieved, today)) errors.push("The block's date (retrieved) must be a real date (YYYY-MM-DD), not in the future.");
  if (errors.length || !source) return { errors };
  return { errors: [], warnings: [], source, retrieved: raw.retrieved as string, today };
}

function costLedger(c: Ctx, v: unknown): AuditData["costLedger"] {
  const out: AuditData["costLedger"] = [];
  for (const [i, row] of list(v).slice(0, 6).entries()) {
    const o = obj(row) ?? {};
    const source = asSource(o.source);
    const calls = typeof o.calls === "number" && o.calls >= 0 && o.calls <= 10_000 ? Math.round(o.calls) : 0;
    const costUsd = typeof o.costUsd === "number" && o.costUsd >= 0 && o.costUsd <= 50 ? Math.round(o.costUsd * 100) / 100 : null;
    if (!source || costUsd === null) c.warnings.push(`Cost row ${i + 1} skipped (needs a source and a cost of $0–$50).`);
    else out.push({ source, calls, costUsd });
  }
  return out;
}

function sourcesUsed(c: Ctx, raw: unknown): SourceId[] {
  const named = list(raw).map(asSource).filter((s): s is ResultSource => s !== null);
  return [...new Set<SourceId>([c.source, ...named])];
}

// ---------------------------------------------------------------------------
// SEO results
// ---------------------------------------------------------------------------

export interface SeoResultsContext {
  intake: AuditIntake;
  /** Market ids and names from the audit's settings (built from the intake). */
  markets: { id: string; name: string }[];
  /** "Today" in New York (YYYY-MM-DD): dates after it are refused. */
  today: string;
}

export interface ResultsSummary {
  retrieved: string;
  sources: SourceId[];
  counts: { label: string; n: number }[];
}

export type SeoResults = { ok: true; data: AuditData; competitors: AuditCompetitor[]; warnings: string[]; summary: ResultsSummary } | { ok: false; errors: string[] };

const GRADES: Grade[] = ["gap", "partial", "good"];

/** Competitors: the ones the rep named, then (when there's room) the ones the run found. */
function mergeCompetitors(c: Ctx, intake: AuditIntake, raw: unknown): AuditCompetitor[] {
  const out: AuditCompetitor[] = intake.competitors.map((x) => ({ name: x.name, domain: x.domain, town: x.town ?? intake.hqTown }));
  for (const [i, row] of list(raw).slice(0, 10).entries()) {
    const o = obj(row) ?? {};
    const domain = domainOf(c, o.website, `Competitor ${i + 1} website`);
    if (!domain || domain === intake.domain || out.some((x) => x.domain === domain)) continue;
    const name = text(c, o.name, `Competitor ${i + 1} name`, 80) || domain;
    if (out.length < RESULTS_LIMITS.competitors) out.push({ name, domain, town: text(c, o.town, `Competitor ${i + 1} town`, 80) || intake.hqTown });
  }
  return out;
}

export function parseSeoResults(raw: unknown, ctx: SeoResultsContext): SeoResults {
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["The results block must be one object."] };
  const h = header(r, "seo", ctx.intake.domain, ctx.today);
  if (!("source" in h)) return { ok: false, errors: h.errors };
  const c = h;

  const competitors = mergeCompetitors(c, ctx.intake, r.competitors);
  const known = new Set([ctx.intake.domain, ...competitors.map((x) => x.domain)]);
  const marketByName = new Map(ctx.markets.map((m) => [m.name.trim().toLowerCase(), m.id]));
  const marketId = (city: unknown) => (typeof city === "string" ? marketByName.get(city.trim().toLowerCase()) : undefined);

  // Demand per city served
  const demandRows = list(r.demand).slice(0, RESULTS_LIMITS.cities);
  const demand = ctx.markets.map((m) => ({ marketId: m.id, searches: { value: null, source: c.source, retrieved: c.retrieved } as Fig }));
  for (const [i, row] of demandRows.entries()) {
    const o = obj(row) ?? {};
    const id = marketId(o.city);
    if (!id) {
      c.warnings.push(`Searches for "${String(o.city ?? `row ${i + 1}`).slice(0, 40)}" skipped: not one of this audit's cities.`);
      continue;
    }
    const slot = demand.find((d) => d.marketId === id);
    if (slot) slot.searches = fig(c, o.searches, `Searches in ${String(o.city)}`, [0, 10_000_000]);
  }

  // Keywords
  const kwRaw = list(r.keywords);
  if (kwRaw.length > RESULTS_LIMITS.keywords) c.warnings.push(`Only the first ${RESULTS_LIMITS.keywords} keywords were kept.`);
  const keywords: KeywordRow[] = [];
  for (const [i, row] of kwRaw.slice(0, RESULTS_LIMITS.keywords).entries()) {
    const o = obj(row) ?? {};
    const keyword = text(c, o.keyword, `Keyword ${i + 1}`, 80).toLowerCase();
    if (!keyword) {
      c.errors.push(`Keyword ${i + 1} has no keyword text.`);
      continue;
    }
    const ranks = obj(o.ranks);
    const positions: Record<string, number | null> = {};
    for (const d of known) positions[d] = null;
    if (ranks) {
      for (const [site, p] of Object.entries(ranks)) {
        const d = normalizeDomain(site);
        if (!known.has(d)) continue;
        if (p === null) continue;
        if (typeof p !== "number" || !Number.isInteger(p) || p < 1 || p > 100) c.errors.push(`Rank for "${keyword}" on ${d} must be 1–100 or null.`);
        else positions[d] = p;
      }
    }
    const rs = o.ranksSource === undefined ? c.source : asSource(o.ranksSource);
    if (!rs) c.errors.push(`Ranks source for "${keyword}" must be DataForSEO, Semrush, LeadSnap or Google.`);
    const rd = o.ranksRetrieved === undefined ? c.retrieved : isDate(o.ranksRetrieved, c.today) ? (o.ranksRetrieved as string) : null;
    if (!rd) c.errors.push(`Ranks date for "${keyword}" must be a real date, not in the future.`);
    keywords.push({
      keyword,
      cluster: text(c, o.group, `Group for "${keyword}"`, 60) || "Other",
      volume: fig(c, o.searches, `Searches for "${keyword}"`, [0, 10_000_000]),
      cpcUsd: fig(c, o.cpcUsd, `Cost per click for "${keyword}"`, [0, 1000]),
      difficulty: fig(c, o.difficulty, `Difficulty for "${keyword}"`, [0, 100]),
      positions,
      positionsSource: rs ?? c.source,
      positionsRetrieved: rd ?? c.retrieved,
      money: o.money === true,
      positionsChecked: !!ranks,
    });
  }

  // Sites: the business first, then each competitor (missing ones stay "not found")
  const siteRows = new Map<string, Record<string, unknown>>();
  for (const [i, row] of list(r.sites).slice(0, RESULTS_LIMITS.sites + 4).entries()) {
    const o = obj(row) ?? {};
    const d = domainOf(c, o.website, `Site ${i + 1} website`);
    if (!d) continue;
    if (!known.has(d)) {
      c.warnings.push(`Numbers for ${d} skipped: not the business or one of its competitors.`);
      continue;
    }
    siteRows.set(d, o);
  }
  const sites: SiteMetrics[] = [ctx.intake.domain, ...competitors.map((x) => x.domain)].map((d) => {
    const o = siteRows.get(d) ?? {};
    const m: SiteMetrics = {
      domain: d,
      gbpRating: fig(c, o.googleRating, `${d} Google rating`, [0, 5]),
      gbpReviews: fig(c, o.googleReviews, `${d} Google reviews`, [0, 1_000_000]),
      gbpPhotos: fig(c, o.googlePhotos, `${d} Google photos`, [0, 1_000_000]),
      packPosition: fig(c, o.localPackPosition, `${d} local 3-pack position`, [0, 3]),
      organicKeywords: fig(c, o.organicKeywords, `${d} organic keywords`, [0, 10_000_000]),
      organicVisits: fig(c, o.organicVisits, `${d} organic visits`, [0, 100_000_000]),
      packVisits: fig(c, o.localPackVisits, `${d} local-pack visits`, [0, 100_000_000]),
      trafficValueUsd: fig(c, o.trafficValueUsd, `${d} traffic value`, [0, 100_000_000]),
      backlinkRank: fig(c, o.backlinkRank, `${d} backlink rank`, [0, 1000]),
      referringDomains: fig(c, o.referringDomains, `${d} referring domains`, [0, 10_000_000]),
      footprint: list(o.rankingPagesIn)
        .map((city) => marketId(city))
        .filter((id): id is string => !!id),
    };
    if (o.semrushVisits !== undefined) m.semrushVisits = fig(c, typeof o.semrushVisits === "number" ? { value: o.semrushVisits, source: "semrush" } : o.semrushVisits, `${d} Semrush visits`, [0, 100_000_000]);
    return m;
  });

  // Heat maps: local 3-pack by city, or a Maps grid
  const grids: GeoGrid[] = [];
  for (const [i, row] of list(r.heatmaps).slice(0, RESULTS_LIMITS.heatmaps).entries()) {
    const o = obj(row) ?? {};
    const term = text(c, o.term, `Heat map ${i + 1} search term`, 60);
    const gs = o.source === undefined ? c.source : asSource(o.source);
    const gd = o.retrieved === undefined ? c.retrieved : isDate(o.retrieved, c.today) ? (o.retrieved as string) : null;
    if (!term || !gs || !gd) {
      c.errors.push(`Heat map ${i + 1} needs a search term, a source and a real date.`);
      continue;
    }
    if (o.kind === "pack") {
      const cells = list(o.cities).slice(0, RESULTS_LIMITS.cities);
      const size = Math.max(1, Math.ceil(Math.sqrt(cells.length)));
      const ranks: (number | null)[][] = Array.from({ length: size }, () => Array<number | null>(size).fill(null));
      const labels: (string | null)[][] = Array.from({ length: size }, () => Array<string | null>(size).fill(null));
      cells.forEach((cell, n) => {
        const co = obj(cell) ?? {};
        const city = text(c, co.city, `Heat map "${term}" city`, 40);
        const p = co.position;
        if (p !== null && (typeof p !== "number" || !Number.isInteger(p) || p < 0 || p > 3)) c.errors.push(`Heat map "${term}": the 3-pack position for ${city || "a city"} must be 1–3, 0 (not in the pack) or null.`);
        ranks[Math.floor(n / size)]![n % size] = typeof p === "number" && p >= 0 && p <= 3 ? p : null;
        labels[Math.floor(n / size)]![n % size] = city || null;
      });
      if (cells.length) grids.push({ term, size, spacingMiles: 0, kind: "pack", ranks, cellLabels: labels, source: gs, retrieved: gd });
    } else if (o.kind === "maps") {
      const rows = list(o.ranks);
      const size = rows.length;
      if (size < 3 || size > RESULTS_LIMITS.gridSize || rows.some((row) => list(row).length !== size)) {
        c.errors.push(`Heat map "${term}": a Maps grid must be square, 3×3 to ${RESULTS_LIMITS.gridSize}×${RESULTS_LIMITS.gridSize}.`);
        continue;
      }
      const ranks = rows.map((row) =>
        list(row).map((p) => {
          if (p === null) return null;
          if (typeof p !== "number" || !Number.isInteger(p) || p < 1 || p > 20) {
            c.errors.push(`Heat map "${term}": every Maps rank must be 1–20 or null.`);
            return null;
          }
          return p;
        }),
      );
      const spacing = typeof o.spacingMiles === "number" && o.spacingMiles > 0 && o.spacingMiles <= 20 ? o.spacingMiles : 1;
      grids.push({ term, size, spacingMiles: spacing, kind: "maps", ranks, source: gs, retrieved: gd });
    } else c.errors.push(`Heat map ${i + 1}: kind must be "pack" or "maps".`);
  }

  // Scorecard and words
  const scorecard: ScorecardRow[] = list(r.scorecard)
    .slice(0, RESULTS_LIMITS.scorecard)
    .map((row, i) => {
      const o = obj(row) ?? {};
      const grade = GRADES.find((g) => g === o.grade);
      if (!grade) c.errors.push(`Scorecard row ${i + 1}: grade must be gap, partial or good.`);
      return { signal: text(c, o.signal, `Scorecard row ${i + 1}`, 60), competitors: text(c, o.competitors, `Scorecard row ${i + 1}`, 160), client: text(c, o.client, `Scorecard row ${i + 1}`, 160), grade: grade ?? "partial", source: asSource(o.source) ?? c.source };
    })
    .filter((x) => x.signal);
  const notes = obj(r.pageNotes) ?? {};
  const narrative: AuditNarrative = {
    source: c.source,
    headline: text(c, r.headline, "Headline", RESULTS_LIMITS.headline) || "Results attached: see each page for the numbers and their sources.",
    pageNotes: Object.fromEntries((["rankings", "footprint", "competitors", "keywords", "revenue"] as const).map((k) => [k, text(c, notes[k], `Page note (${k})`)]).filter(([, v]) => v)),
    fixes: list(r.fixes)
      .slice(0, RESULTS_LIMITS.fixes)
      .map((row, i) => {
        const o = obj(row) ?? {};
        return { title: text(c, o.title, `Fix ${i + 1} title`, 80), detail: text(c, o.detail, `Fix ${i + 1}`, 240) };
      })
      .filter((f) => f.title),
  };

  const nearMeSearches = fig(c, r.nearMeSearches, "Near-me searches", [0, 10_000_000]);
  if (c.errors.length) return { ok: false, errors: [...new Set(c.errors)].slice(0, 12) };
  const data: AuditData = {
    retrieved: c.retrieved,
    sourcesUsed: sourcesUsed(c, r.sources),
    demand,
    nearMeSearches,
    keywords,
    visitsScope: r.visitsScope === "national" ? "national" : "local",
    organicDepth: 100,
    sites,
    grids,
    scorecard,
    narrative,
    costLedger: costLedger(c, r.cost),
  };
  return {
    ok: true,
    data,
    competitors,
    warnings: c.warnings.slice(0, 12),
    summary: {
      retrieved: c.retrieved,
      sources: data.sourcesUsed,
      counts: [
        { label: "keywords", n: keywords.length },
        { label: "competitors", n: competitors.length },
        { label: "cities with searches", n: demand.filter((d) => d.searches.value !== null).length },
        { label: "heat maps", n: grids.length },
        { label: "scorecard rows", n: scorecard.length },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Google Ads results
// ---------------------------------------------------------------------------

export type AdsResults = { ok: true; data: AdsData; warnings: string[]; summary: ResultsSummary } | { ok: false; errors: string[] };

export function parseAdsResults(raw: unknown, ctx: { intake: AdsIntake; today: string }): AdsResults {
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["The results block must be one object."] };
  const h = header(r, "ads", ctx.intake.domain, ctx.today);
  if (!("source" in h)) return { ok: false, errors: h.errors };
  const c = h;

  const kwRaw = list(r.keywords);
  if (kwRaw.length > RESULTS_LIMITS.adsKeywords) c.warnings.push(`Only the first ${RESULTS_LIMITS.adsKeywords} keywords were kept.`);
  const keywords: AdsData["keywords"] = [];
  for (const [i, row] of kwRaw.slice(0, RESULTS_LIMITS.adsKeywords).entries()) {
    const o = obj(row) ?? {};
    const keyword = text(c, o.keyword, `Keyword ${i + 1}`, 80).toLowerCase();
    if (!keyword) {
      c.errors.push(`Keyword ${i + 1} has no keyword text.`);
      continue;
    }
    keywords.push({
      keyword,
      searches: fig(c, o.searches, `Searches for "${keyword}"`, [0, 10_000_000]),
      cpcLowUsd: fig(c, o.cpcLowUsd, `Low bid for "${keyword}"`, [0, 1000]),
      cpcHighUsd: fig(c, o.cpcHighUsd, `High bid for "${keyword}"`, [0, 1000]),
      competition: fig(c, o.competition, `Competition for "${keyword}"`, [0, 100]),
    });
  }

  const checked = typeof r.searchesChecked === "number" && Number.isInteger(r.searchesChecked) && r.searchesChecked >= 0 && r.searchesChecked <= 50 ? r.searchesChecked : 0;
  const bidders: AdsData["bidders"] = [];
  for (const [i, row] of list(r.bidders).slice(0, RESULTS_LIMITS.bidders).entries()) {
    const o = obj(row) ?? {};
    const domain = domainOf(c, o.website, `Bidder ${i + 1} website`);
    if (!domain || bidders.some((b) => b.domain === domain)) continue;
    bidders.push({
      name: text(c, o.name, `Bidder ${i + 1} name`, 80) || domain,
      domain,
      adsSeen: fig(c, o.adsSeen, `${domain} ads seen`, [0, checked || 50]),
      paidClicks: fig(c, o.paidClicks, `${domain} paid clicks`, [0, 100_000_000]),
      spendUsd: fig(c, o.spendUsd, `${domain} ad spend`, [0, 100_000_000]),
    });
  }

  const cl = obj(r.client) ?? {};
  const data: AdsData = {
    retrieved: c.retrieved,
    sourcesUsed: sourcesUsed(c, r.sources),
    searchesChecked: checked,
    keywords,
    bidders,
    client: {
      runningAds: boolFig(c, cl.runningAds, "Running ads now"),
      adPage: urlFig(c, cl.adPage, "Page their ad opens"),
      mobileSpeed: fig(c, cl.mobileSpeed, "Mobile speed score", [0, 100]),
      callButton: boolFig(c, cl.callButton, "Call button"),
      form: boolFig(c, cl.form, "Contact form"),
      lsaShown: boolFig(c, cl.lsaShown, "Local Services Ads shown"),
    },
  };
  if (c.errors.length) return { ok: false, errors: [...new Set(c.errors)].slice(0, 12) };
  return {
    ok: true,
    data,
    warnings: c.warnings.slice(0, 12),
    summary: {
      retrieved: c.retrieved,
      sources: data.sourcesUsed,
      counts: [
        { label: "keywords", n: keywords.length },
        { label: "competitors bidding", n: bidders.length },
        { label: "searches checked for ads", n: checked },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// The templates the prompts end with
// ---------------------------------------------------------------------------

const FIG_RULE =
  'Every number is either { "value": 123, "source": "dataforseo", "retrieved": "YYYY-MM-DD" } or just the number (then the block\'s own "source" and "retrieved" apply). Use null when you could not find it. Never guess. No email addresses, phone numbers or prices anywhere in the block.';

/** The end of the SEO prompt: the exact block to fill in, with this audit's website, cities and competitors. */
export function seoResultsTemplate(intake: AuditIntake, cities: string[]): string {
  const comps = intake.competitors.map((x) => x.domain);
  const ranks = Object.fromEntries([intake.domain, ...comps].map((d) => [d, null]));
  const site = (d: string) => ({ website: d, googleRating: null, googleReviews: null, googlePhotos: null, localPackPosition: null, organicKeywords: null, organicVisits: null, localPackVisits: null, trafficValueUsd: null, backlinkRank: null, referringDomains: null, rankingPagesIn: [] });
  const block = {
    atlas: "results-v1",
    kind: "seo",
    website: intake.domain,
    source: "dataforseo",
    retrieved: "YYYY-MM-DD",
    sources: ["dataforseo"],
    competitors: intake.competitors.length ? intake.competitors.map((x) => ({ name: x.name, website: x.domain, town: x.town ?? intake.hqTown })) : [{ name: "Competitor name", website: "competitor.com", town: intake.hqTown }],
    demand: cities.map((city) => ({ city, searches: null })),
    nearMeSearches: null,
    keywords: [{ keyword: `${(intake.services[0] ?? intake.niche).toLowerCase()} ${intake.hqTown.toLowerCase()}`, group: intake.services[0] ?? intake.niche, money: true, searches: null, cpcUsd: null, difficulty: null, ranks }],
    sites: [site(intake.domain), ...(comps.length ? comps : ["competitor.com"]).map(site)],
    heatmaps: [{ term: (intake.services[0] ?? intake.niche).toLowerCase(), kind: "pack", cities: cities.map((city) => ({ city, position: null })) }],
    scorecard: [{ signal: "City pages", competitors: "what the leaders do", client: "what this business does", grade: "gap" }],
    headline: "One sentence from the numbers above.",
    pageNotes: { rankings: "", footprint: "", competitors: "", keywords: "", revenue: "" },
    fixes: [{ title: "Fix", detail: "Why it matters, from the numbers." }],
    cost: [{ source: "dataforseo", calls: 0, costUsd: 0 }],
  };
  return [
    "## 6. Results for Agency Atlas (required, last)",
    `End your reply with the line ${RESULTS_MARKER} and then one \`\`\`json block, filled in exactly like this template. Keep every key and the order; add one keyword row per money keyword (up to 200), one site row per website, one heat map per search checked. Use only these city names for demand, ranks and heat maps: ${cities.join(", ")}.`,
    FIG_RULE,
    'Positions: "ranks" is each website\'s Google position (1–100, null = not in the top 100); "localPackPosition" is 1–3, or 0 when checked and not in the 3-pack; "rankingPagesIn" lists the cities where that site has a page ranking on page 1 or 2.',
    "",
    RESULTS_MARKER,
    "```json",
    JSON.stringify(block, null, 1),
    "```",
  ].join("\n");
}

/** The end of the Google Ads prompt. */
export function adsResultsTemplate(intake: AdsIntake): string {
  const bidders = intake.competitors.length ? intake.competitors.map((x) => ({ name: x.name, website: x.domain, adsSeen: null, paidClicks: null, spendUsd: null })) : [{ name: "Competitor name", website: "competitor.com", adsSeen: null, paidClicks: null, spendUsd: null }];
  const block = {
    atlas: "results-v1",
    kind: "ads",
    website: intake.domain,
    source: "dataforseo",
    retrieved: "YYYY-MM-DD",
    sources: ["dataforseo"],
    searchesChecked: 5,
    keywords: intake.services.slice(0, 3).map((s) => ({ keyword: `${s.toLowerCase()} ${intake.hqTown.toLowerCase()}`, searches: null, cpcLowUsd: null, cpcHighUsd: null, competition: null })),
    bidders,
    client: { runningAds: null, adPage: null, mobileSpeed: null, callButton: null, form: null, lsaShown: null },
    cost: [{ source: "dataforseo", calls: 0, costUsd: 0 }],
  };
  return [
    "## 6. Results for Agency Atlas (required, last)",
    `End your reply with the line ${RESULTS_MARKER} and then one \`\`\`json block, filled in exactly like this template. Keep every key; add one keyword row per money keyword (up to 100) and one bidder row per competitor seen in ads (up to 10). "adsSeen" is how many of the "searchesChecked" searches showed their ad; "paidClicks" and "spendUsd" are monthly third-party estimates; "client" true/false values are what you saw (null = not checked).`,
    FIG_RULE,
    "",
    RESULTS_MARKER,
    "```json",
    JSON.stringify(block, null, 1),
    "```",
  ].join("\n");
}
