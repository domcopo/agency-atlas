// Client care rules (docs/CLIENT_CARE_PLAN.md, Step 1A). Pure functions, tested in
// tests/care.test.ts. Tune numbers in CARE_RULES.

import type { CarePlan, RosterClient, Service } from "@/lib/types";

export const CARE_RULES = {
  /** Most tiers per service (Starter, Growth, Pro… plus a few spares). */
  maxTiersPerService: 8,
  /** "What's included": at most this many lines, each at most lineMax characters. */
  includesMax: 12,
  lineMax: 100,
  /** Automatic GoHighLevel times sync: when the last sync is older than this (hours). */
  autoSyncHours: 24,
} as const;

export const CARE_SERVICES: readonly Service[] = ["SEO", "Ads", "Website"];

export function asService(v: unknown): Service | null {
  return CARE_SERVICES.includes(v as Service) ? (v as Service) : null;
}

// ---------------------------------------------------------------------------
// Plan tiers
// ---------------------------------------------------------------------------

export type CarePlanInput = Omit<CarePlan, "id" | "archived">;

/** Checks the plan tier form. Returns the cleaned tier, or a plain-English error. */
export function parseCarePlan(raw: {
  service: string;
  name: string;
  rank: string;
  hours: string;
  includes: string;
  heatMaps: string;
  reportEveryDays: string;
  midMonth: boolean;
  competitorReviewMonths: string;
  topTier: boolean;
}): { ok: true; plan: CarePlanInput } | { ok: false; error: string } {
  const service = asService(raw.service);
  if (!service) return { ok: false, error: "Pick SEO, Ads or Website." };
  const name = raw.name.replace(/\s+/g, " ").trim();
  if (!name || name.length > 40) return { ok: false, error: "Give the tier a name (up to 40 characters)." };
  const rank = whole(raw.rank, 1, 20);
  if (rank === null) return { ok: false, error: "Order must be a number from 1 (entry tier) to 20." };
  const hours = raw.hours.trim() ? Number(raw.hours.trim()) : null;
  if (hours !== null && !(Number.isFinite(hours) && hours > 0 && hours <= 300)) return { ok: false, error: "Hours a month should be a number like 10 or 30 (or leave it blank)." };
  const lines = raw.includes
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-•*\s]+/, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (lines.length > CARE_RULES.includesMax) return { ok: false, error: `Keep "What's included" to ${CARE_RULES.includesMax} lines.` };
  if (lines.some((l) => l.length > CARE_RULES.lineMax)) return { ok: false, error: `Keep each "What's included" line under ${CARE_RULES.lineMax} characters.` };
  const heatMaps = raw.heatMaps.trim() ? whole(raw.heatMaps, 0, 8) : null;
  if (raw.heatMaps.trim() && heatMaps === null) return { ok: false, error: "Heat maps a month should be 0 to 8 (or blank)." };
  const report = whole(raw.reportEveryDays, 7, 120);
  if (report === null) return { ok: false, error: "Report rhythm should be 7 to 120 days (30 = monthly)." };
  const review = whole(raw.competitorReviewMonths || "0", 0, 24);
  if (review === null) return { ok: false, error: "Competitor review should be every 0 to 24 months (0 = never)." };
  return {
    ok: true,
    plan: {
      service,
      name,
      rank,
      hoursPerMonth: hours === null ? null : Math.round(hours * 10) / 10,
      includes: lines,
      heatMapsPerMonth: heatMaps,
      reportEveryDays: report,
      midMonthCheckIn: raw.midMonth,
      competitorReviewMonths: review,
      topTier: raw.topTier,
    },
  };
}

function whole(v: string, min: number, max: number): number | null {
  const t = v.trim();
  if (!/^\d{1,3}$/.test(t)) return null;
  const n = Number(t);
  return n >= min && n <= max ? n : null;
}

/** "Up to 10 hours a month · report every 30 days · 2 heat maps a month". */
export function planRhythm(p: Pick<CarePlan, "hoursPerMonth" | "reportEveryDays" | "heatMapsPerMonth" | "midMonthCheckIn" | "competitorReviewMonths">): string {
  const bits: string[] = [];
  if (p.hoursPerMonth !== null) bits.push(`up to ${p.hoursPerMonth} hours a month`);
  bits.push(p.reportEveryDays === 30 ? "monthly report" : `report every ${p.reportEveryDays} days`);
  if (p.midMonthCheckIn) bits.push("mid-month check-in");
  if (p.heatMapsPerMonth) bits.push(`${p.heatMapsPerMonth} heat map${p.heatMapsPerMonth === 1 ? "" : "s"} a month`);
  if (p.competitorReviewMonths) bits.push(p.competitorReviewMonths === 3 ? "quarterly competitor review" : `competitor review every ${p.competitorReviewMonths} months`);
  const s = bits.join(" · ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Tiers for one service that can be picked for a client: not archived, lowest first. */
export function pickableTiers(plans: CarePlan[], service: Service, currentId?: string): CarePlan[] {
  return plans.filter((p) => p.service === service && (!p.archived || p.id === currentId)).sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Add client
// ---------------------------------------------------------------------------

/** Page address from a name: "Sam's Plumbing & Heat" → "sams-plumbing-heat". */
export function slugFromName(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return base || "client";
}

/** A free address: the slug, or the slug with -2, -3… when it's taken. */
export function uniqueSlug(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = slugFromName(name);
  if (!used.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const s = `${base}-${i}`;
    if (!used.has(s)) return s;
  }
  return `${base}-${Date.now() % 100000}`;
}

/** Words that don't tell two businesses apart. */
const FILLER = new Set(["the", "and", "of", "llc", "inc", "co", "company", "corp", "ltd", "services", "service", "group"]);

function words(name: string): string[] {
  return slugFromName(name)
    .split("-")
    .filter((w) => w && !FILLER.has(w));
}

/**
 * Existing clients whose name looks like this one ("Sams Plumbing" vs "Sam's Plumbing LLC"),
 * so nobody adds the same client twice. Same words, or one name's words all inside the other's.
 */
export function similarClients<T extends Pick<RosterClient, "name">>(name: string, clients: T[]): T[] {
  const mine = words(name);
  if (!mine.length) return [];
  const key = mine.join(" ");
  return clients.filter((c) => {
    const theirs = words(c.name);
    if (!theirs.length) return false;
    if (theirs.join(" ") === key) return true;
    const [short, long] = mine.length <= theirs.length ? [mine, new Set(theirs)] : [theirs, new Set(mine)];
    return short.length >= 1 && short.every((w) => long.has(w)) && short.join("").length >= 4;
  });
}

/** "500" or "1,250.50" (a dollar sign is fine) → number; blank → null; anything else → NaN. */
export function parseMonthly(raw: string): number | null {
  const t = raw.replace(/[$,\s]/g, "");
  if (!t) return null;
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(t)) return Number.NaN;
  const n = Number(t);
  return n <= 100000 ? Math.round(n * 100) / 100 : Number.NaN;
}

/**
 * Active clients at the end of each of the last `months` months (oldest first), for the small
 * growth line next to "Clients". Same rule as Clients won & lost: a client counts from their
 * start date until their end date. Canceled or paused clients without an end date are left out
 * of past months (when they stopped is unknown); the current month uses today's status.
 */
export function activeByMonth(clients: Pick<RosterClient, "startDate" | "endDate" | "status">[], today: string, months = 12): { month: string; active: number }[] {
  const [y, m] = today.split("-").map(Number) as [number, number];
  const out: { month: string; active: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const first = new Date(Date.UTC(y, m - 1 - i, 1));
    const month = first.toISOString().slice(0, 7);
    const end = i === 0 ? today : new Date(Date.UTC(y, m - i, 0)).toISOString().slice(0, 10);
    const active =
      i === 0
        ? clients.filter((c) => c.status === "active").length
        : clients.filter((c) => c.startDate <= end && (c.endDate ? c.endDate > end : c.status === "active")).length;
    out.push({ month, active });
  }
  return out;
}

/** Is a GoHighLevel times sync due? (Owner's view; runs in the background.) */
export function autoSyncDue(lastIso: string | null, now: Date): boolean {
  if (!lastIso) return true;
  const t = Date.parse(lastIso);
  if (!Number.isFinite(t)) return true;
  return now.getTime() - t >= CARE_RULES.autoSyncHours * 3_600_000;
}
