// SEO Watcher lists (Phase B): checking what a person types into the keyword, city and
// competitor lists, and turning a saved SEO audit into a starting point. Pure, tested.

import type { AuditConfig } from "@/lib/audit/config";
import { contactDetailsIn } from "@/lib/work-orders";
import { bareDomain } from "./rounds";

export const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD",
  "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
] as const;

/** A keyword as stored: lower case, single spaces, 2–80 characters, no contact details. */
export function cleanKeyword(v: string): { ok: true; keyword: string } | { ok: false; error: string } {
  const k = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  if (k.length < 2 || k.length > 80) return { ok: false, error: "Keywords are 2 to 80 characters." };
  if (/[<>{}\\]/.test(k)) return { ok: false, error: "Leave out < > { } and backslashes." };
  if (contactDetailsIn(k).length) return { ok: false, error: "Leave phone numbers and emails out of keywords." };
  return { ok: true, keyword: k };
}

/** A city + two-letter state. "Cleveland, OH" in one box also works. */
export function cleanCity(cityIn: string, stateIn: string): { ok: true; city: string; state: string } | { ok: false; error: string } {
  let city = cityIn.replace(/\s+/g, " ").trim();
  let state = stateIn.trim().toUpperCase();
  const comma = /^(.+),\s*([A-Za-z]{2})$/.exec(city);
  if (comma && !state) {
    city = comma[1]!.trim();
    state = comma[2]!.toUpperCase();
  }
  if (city.length < 2 || city.length > 60 || /[<>{}\\0-9@]/.test(city)) return { ok: false, error: "City names are 2 to 60 letters." };
  if (!(US_STATES as readonly string[]).includes(state)) return { ok: false, error: "Pick the state (two letters, e.g. OH)." };
  return { ok: true, city, state };
}

/** Optional latitude/longitude typed by a person; both or neither, inside the USA. */
export function cleanPosition(latIn: string, lngIn: string): { ok: true; lat: number | null; lng: number | null } | { ok: false; error: string } {
  if (!latIn.trim() && !lngIn.trim()) return { ok: true, lat: null, lng: null };
  const lat = Number(latIn);
  const lng = Number(lngIn);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 17 || lat > 72 || lng < -180 || lng > -64) {
    return { ok: false, error: "Map position must be a US latitude and longitude (e.g. 41.50, -81.69), or leave both empty." };
  }
  return { ok: true, lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 };
}

export function cleanDomain(v: string): { ok: true; domain: string } | { ok: false; error: string } {
  const d = bareDomain(v);
  return d ? { ok: true, domain: d } : { ok: false, error: "Type a website like example.com." };
}

export function cleanNiche(v: string): { ok: true; niche: string } | { ok: false; error: string } {
  const n = v.replace(/\s+/g, " ").trim();
  if (n.length < 1 || n.length > 60) return { ok: false, error: "Say what they do in up to 60 characters (e.g. Plumbing)." };
  if (contactDetailsIn(n).length) return { ok: false, error: "Leave phone numbers and emails out." };
  return { ok: true, niche: n };
}

// ---------------------------------------------------------------- import from a saved audit

export interface AuditImport {
  domain: string | null;
  niche: string | null;
  markets: { city: string; state: string; lat: number | null; lng: number | null; hq: boolean }[];
  competitors: string[];
  keywords: { keyword: string; money: boolean }[];
  /** Starting positions for the client's own site (region-wide in the audit → put on the home city). */
  baseline: { keyword: string; organic: number | null }[];
  /** When the audit's data was pulled (YYYY-MM-DD), null if it has no results yet. */
  retrieved: string | null;
}

/**
 * What a saved audit can give the Watcher: its towns (with map positions), competitors,
 * and, if results were attached, its keywords and the client's starting positions.
 * Only towns are used (not counties or regions). Limits are applied by the caller.
 */
export function fromAudit(config: AuditConfig, data: unknown): AuditImport {
  const state = (config.map?.state ?? "").toUpperCase();
  const okState = (US_STATES as readonly string[]).includes(state);
  const markets = okState
    ? config.markets
        .filter((m) => m.kind === "town")
        .flatMap((m) => {
          const c = cleanCity(m.name.replace(/,\s*[A-Za-z]{2}$/, ""), state);
          if (!c.ok) return [];
          const pos = m.lat !== undefined && m.lng !== undefined ? cleanPosition(String(m.lat), String(m.lng)) : { ok: true as const, lat: null, lng: null };
          return [{ city: c.city, state: c.state, lat: pos.ok ? pos.lat : null, lng: pos.ok ? pos.lng : null, hq: Boolean(m.hq) }];
        })
        .sort((a, b) => Number(b.hq) - Number(a.hq))
    : [];
  const own = bareDomain(config.company.domain);
  const competitors = [...new Set(config.competitors.map((c) => bareDomain(c.domain)).filter((d): d is string => d !== null && d !== own))];
  const keywords: AuditImport["keywords"] = [];
  const baseline: AuditImport["baseline"] = [];
  // Saved audit results are stored JSON: read field by field, never trusted as a shape.
  const d = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  const rows = d && Array.isArray(d.keywords) ? d.keywords.filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object" && !Array.isArray(r)).slice(0, 500) : [];
  const vol = (r: Record<string, unknown>) => {
    const v = r.volume && typeof r.volume === "object" ? (r.volume as { value?: unknown }).value : null;
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  };
  for (const r of [...rows].sort((a, b) => Number(b.money === true) - Number(a.money === true) || vol(b) - vol(a))) {
    if (typeof r.keyword !== "string") continue;
    const k = cleanKeyword(r.keyword);
    if (!k.ok || keywords.some((x) => x.keyword === k.keyword)) continue;
    keywords.push({ keyword: k.keyword, money: r.money === true });
    const positions = r.positions && typeof r.positions === "object" && !Array.isArray(r.positions) ? (r.positions as Record<string, unknown>) : null;
    if (r.positionsChecked !== false && own && positions) {
      const p = positions[own] ?? positions[config.company.domain] ?? null;
      baseline.push({ keyword: k.keyword, organic: typeof p === "number" && Number.isInteger(p) && p >= 1 && p <= 100 ? p : null });
    }
  }
  const niche = cleanNiche(config.company.niche);
  const retrieved = d && typeof d.retrieved === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.retrieved) ? d.retrieved : null;
  return { domain: own, niche: niche.ok ? niche.niche : null, markets, competitors, keywords, baseline, retrieved: keywords.length ? retrieved : null };
}
