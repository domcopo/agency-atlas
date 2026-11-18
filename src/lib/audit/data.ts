// SEO audit: the shape of the collected data (what the data adapters will return in a
// later phase, and what the sample fixture holds today).
//
// Rule: every figure is a `Fig` that carries its source and retrieval date. A missing
// figure has value null and every page shows "not found" for it, never a guess.

import type { AuditConfig } from "./config";

export type SourceId = "dataforseo" | "leadsnap" | "semrush" | "google" | "config" | "model" | "sample";

export const SOURCE_LABELS: Record<SourceId, string> = {
  dataforseo: "DataForSEO",
  leadsnap: "LeadSnap",
  semrush: "Semrush",
  google: "Google (live check)",
  config: "Audit settings",
  model: "Model (calculated)",
  sample: "Sample (fictional)",
};

/** One sourced figure. `value: null` = looked for and not found. */
export interface Fig<T = number> {
  value: T | null;
  source: SourceId;
  /** YYYY-MM-DD the figure was retrieved. */
  retrieved: string;
  /** A claim we could not confirm, printed next to the figure (e.g. "not surfaced in Maps"). */
  unverified?: string;
}

export interface KeywordRow {
  keyword: string;
  cluster: string;
  volume: Fig;
  cpcUsd: Fig;
  difficulty: Fig;
  /** Organic position per domain (client + competitors). null = not in the top 100. */
  positions: Record<string, number | null>;
  positionsSource: SourceId;
  positionsRetrieved: string;
  /** Marks the keywords shown on the "money terms" table. */
  money?: boolean;
  /** false = positions were not looked up for this keyword (shows "not checked", never "nobody ranks"). */
  positionsChecked?: boolean;
}

export interface SiteMetrics {
  domain: string;
  gbpRating: Fig;
  gbpReviews: Fig;
  gbpPhotos: Fig;
  /** Position in the local 3-pack on the live check: 1–3, 0 = checked and NOT in the pack, null = not checked/not found. */
  packPosition: Fig;
  organicKeywords: Fig;
  organicVisits: Fig;
  packVisits: Fig;
  trafficValueUsd: Fig;
  backlinkRank: Fig;
  referringDomains: Fig;
  /** Semrush's own visit estimate, shown beside DataForSEO when Semrush is on. */
  semrushVisits?: Fig;
  /** Market ids where this site holds a page-1 or page-2 ranking page. */
  footprint: string[];
}

export interface GeoGrid {
  term: string;
  /** Grid size (7 = 7×7 = 49 points). */
  size: number;
  spacingMiles: number;
  /**
   * "maps" (default) = Google Maps rank at evenly spaced points (LeadSnap-style), null = not in top 20.
   * "pack" = the Google local 3-pack as seen from each city: 1–3, 0 = checked and NOT in the pack,
   *          null = no pack shown / city not available.
   */
  kind?: "maps" | "pack";
  /** Rows top→bottom (north→south), each left→right (west→east). */
  ranks: (number | null)[][];
  /** Optional name for each cell (pack checks: the city). */
  cellLabels?: (string | null)[][];
  source: SourceId;
  retrieved: string;
}

export type Grade = "gap" | "partial" | "good";

export interface ScorecardRow {
  signal: string;
  competitors: string;
  client: string;
  grade: Grade;
  source: SourceId;
}

export interface DemandRow {
  marketId: string;
  searches: Fig;
}

/** Words written by a person or (later) the AI, from the computed numbers only. */
export interface AuditNarrative {
  source: SourceId;
  headline: string;
  pageNotes: Partial<Record<"rankings" | "footprint" | "competitors" | "keywords" | "revenue", string>>;
  fixes: { title: string; detail: string }[];
}

export interface AuditData {
  /** Main retrieval date for the footer. */
  retrieved: string;
  sourcesUsed: SourceId[];
  /** Current search visits/month for the client (start of the growth chart). */
  demand: DemandRow[];
  /** "Near me" style searches not tied to a town. */
  nearMeSearches: Fig;
  keywords: KeywordRow[];
  /** "national" = visit estimates are each site's US-wide total, so they are not drawn next to the local model. */
  visitsScope?: "local" | "national";
  /** How deep organic positions were checked (default 100): "—" means "not in the top N". */
  organicDepth?: number;
  sites: SiteMetrics[];
  grids: GeoGrid[];
  scorecard: ScorecardRow[];
  narrative: AuditNarrative;
  /** What this run cost, per source (dry run = all zero). */
  costLedger: { source: SourceId; calls: number; costUsd: number }[];
}

export interface AuditBundle {
  id: string;
  /** true = fictional business made up to show the template. */
  sample: boolean;
  config: AuditConfig;
  data: AuditData;
}
