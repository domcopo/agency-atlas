// Audit spending caps: pure math for "how much is left" (the database enforces the same
// caps in 0023 when a spend row is added, so this is for showing it and for checking
// before any paid call). Weeks run Monday–Sunday and months by calendar, New York time.
// Pure: no database, no network.

export interface AuditCaps {
  perAuditUsd: number;
  weeklyUsd: number;
  monthlyUsd: number;
}

export const AUDIT_CAP_DEFAULTS: AuditCaps = { perAuditUsd: 5, weeklyUsd: 10, monthlyUsd: 50 };

export interface SpendRow {
  auditId: string;
  userId: string;
  usd: number;
  at: string; // ISO time
}

/** "YYYY-MM-DD" of a moment, in New York. */
export function nyDate(at: Date): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  return p; // en-CA formats as YYYY-MM-DD
}

/** Monday of the New York week that `at` falls in, as YYYY-MM-DD. */
export function nyWeekStart(at: Date): string {
  const day = nyDate(at);
  const d = new Date(`${day}T12:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

export function nyMonthStart(at: Date): string {
  return `${nyDate(at).slice(0, 7)}-01`;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface SpendSummary {
  weekUsed: number;
  weekCap: number;
  /** All spend this month the viewer can see (everyone, for the owner and managers). */
  monthUsed: number;
  monthCap: number;
  perAuditCap: number;
  /** The most the next pull may cost for this person (lowest cap wins). */
  leftForMe: number;
}

/**
 * `rows` are the spend rows the database lets the viewer read (their own for a
 * salesperson; everyone's for the owner and managers). `myWeeklyCap` overrides the
 * weekly cap when the owner set one for this person.
 */
export function spendSummary(input: { rows: SpendRow[]; me: string; caps: AuditCaps; myWeeklyCap?: number | null; now: Date }): SpendSummary {
  const week = nyWeekStart(input.now);
  const month = nyMonthStart(input.now);
  const day = (iso: string) => nyDate(new Date(iso));
  const weekUsed = round2(input.rows.filter((r) => r.userId === input.me && day(r.at) >= week).reduce((s, r) => s + r.usd, 0));
  const monthUsed = round2(input.rows.filter((r) => day(r.at) >= month).reduce((s, r) => s + r.usd, 0));
  const weekCap = input.myWeeklyCap ?? input.caps.weeklyUsd;
  const leftForMe = round2(Math.max(0, Math.min(input.caps.perAuditUsd, weekCap - weekUsed, input.caps.monthlyUsd - monthUsed)));
  return { weekUsed, weekCap, monthUsed, monthCap: input.caps.monthlyUsd, perAuditCap: input.caps.perAuditUsd, leftForMe };
}

/** null = fine; otherwise the plain-English reason a pull of `estimateUsd` would be refused. */
export function spendBlocker(s: SpendSummary, estimateUsd: number, usedOnThisAudit = 0): string | null {
  if (usedOnThisAudit + estimateUsd > s.perAuditCap) return `This audit would go over the $${s.perAuditCap.toFixed(2)} per-audit cap.`;
  if (s.weekUsed + estimateUsd > s.weekCap) return `That would go over your $${s.weekCap.toFixed(2)} weekly cap.`;
  if (s.monthUsed + estimateUsd > s.monthCap) return `That would go over the $${s.monthCap.toFixed(2)} monthly cap for all audits.`;
  return null;
}
