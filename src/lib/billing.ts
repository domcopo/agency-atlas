// Billing (0015): READ-ONLY copy of GoHighLevel invoices and payments, OWNER ONLY.
// Pure functions (no database, no network), tested in tests/fixtures.test.ts.
//
// Rules (docs/BILLING_PLAN.md):
// - Blank is not zero: when billing isn't connected, isn't set up, the last refresh
//   failed, or the data is too old, every total is null ("Unknown"), never 0.
// - No guessing: a record belongs to a client only through a GoHighLevel contact ID
//   the owner confirmed. Everything else is "unmatched".
// - GoHighLevel has no "overdue" status: an invoice is overdue when money is still due
//   and the due date has passed.
// - Unknown provider statuses are skipped and counted, never guessed as paid or failed.
// - Only USD is added up. Other currencies are counted separately, never converted.

export type BillingStatus = "paid" | "open" | "overdue" | "failed" | "refunded";
export type BillingKind = "invoice" | "payment";

export const BILLING_RULES = {
  /** Totals become "Unknown" when the last good refresh is older than this. */
  staleDays: 3,
  /** "Due soon" = an open invoice due within this many days. */
  dueSoonDays: 7,
  /** Overdue this long (or a failed payment) = an owner-only "at risk" alert. */
  atRiskOverdueDays: 7,
  /** Overdue longer than this (or a failed payment this month) = urgent. */
  urgentOverdueDays: 30,
  /** A refresh at most this often (the database enforces it too). */
  refreshEveryMinutes: 10,
  /** Payments are read back this far. */
  paymentsLookbackDays: 400,
} as const;

export interface BillingRecord {
  kind: BillingKind;
  providerId: string;
  contactId: string | null;
  /** Atlas client database id; null = unmatched. */
  clientDbId: string | null;
  /** Name on the invoice, only while unmatched. */
  unmatchedLabel: string | null;
  amountCents: number;
  amountDueCents: number | null;
  currency: string;
  status: BillingStatus;
  issuedOn: string | null;
  dueOn: string | null;
  paidOn: string | null;
  syncedAt: string;
}

export interface BillingSync {
  startedAt: string;
  finishedAt: string | null;
  ok: boolean | null;
  invoicesRead: number | null;
  paymentsRead: number | null;
  unmatched: number | null;
  errorCode: string | null;
}

const day = (iso: string) => iso.slice(0, 10);
const daysFrom = (from: string, to: string) => Math.round((Date.parse(day(to)) - Date.parse(day(from))) / 86_400_000);

// ---------------------------------------------------------------------------
// Provider statuses -> Atlas statuses (null = skip)
// ---------------------------------------------------------------------------

/**
 * A GoHighLevel invoice status. Drafts and voided invoices are skipped (not owed).
 * Unknown words are skipped too ("unknown"), never guessed.
 */
export function invoiceStatus(raw: string | null, dueCents: number | null, dueOn: string | null, today: string): BillingStatus | "skip" | "unknown" {
  const s = (raw ?? "").toLowerCase();
  if (s === "draft" || s === "void") return "skip";
  if (s === "paid") return "paid";
  if (s === "sent" || s === "partially_paid" || s === "payment_processing" || s === "viewed" || s === "overdue") {
    if (dueCents === 0) return "paid";
    return dueOn && dueOn < today ? "overdue" : "open";
  }
  return "unknown";
}

/** A GoHighLevel payment (transaction) status. */
export function paymentStatus(raw: string | null, refundedCents: number): BillingStatus | "skip" | "unknown" {
  const s = (raw ?? "").toLowerCase();
  if (refundedCents > 0 || s === "refunded" || s === "partially_refunded") return "refunded";
  if (s === "succeeded" || s === "success" || s === "paid" || s === "completed") return "paid";
  if (s === "failed" || s === "declined") return "failed";
  if (s === "pending" || s === "processing" || s === "requires_action" || s === "canceled" || s === "cancelled" || s === "void") return "skip";
  return "unknown";
}

/** Dollars (as GoHighLevel sends them) to whole cents. null for anything odd. */
export function toCents(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1_000_000) return null;
  return Math.round(v * 100);
}

/** A name to keep for an unmatched invoice: no emails or phone numbers, max 80 characters. */
export function safeLabel(v: string | null): string | null {
  if (!v) return null;
  const t = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!t || /[^\s@]+@[^\s@]+\.[^\s@]+/.test(t) || /\d[\d\s().-]{6,}\d/.test(t)) return null;
  return t;
}

/** Client for a contact: only a match the owner confirmed. */
export function matchClient(contactId: string | null, confirmed: Map<string, string>): string | null {
  return contactId ? (confirmed.get(contactId) ?? null) : null;
}

// ---------------------------------------------------------------------------
// Is the data good enough to show numbers?
// ---------------------------------------------------------------------------

export type BillingState =
  | { known: true; asOf: string }
  | { known: false; reason: "not_connected" | "not_set_up" | "never_synced" | "last_failed" | "stale"; asOf: string | null };

export function billingState(input: { configured: boolean; tablesReady: boolean; syncs: BillingSync[]; now: Date }): BillingState {
  if (!input.tablesReady) return { known: false, reason: "not_set_up", asOf: null };
  if (!input.configured) return { known: false, reason: "not_connected", asOf: null };
  const sorted = [...input.syncs].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const lastGood = sorted.find((s) => s.ok === true);
  const latestDone = sorted.find((s) => s.ok !== null);
  if (!lastGood) return { known: false, reason: latestDone ? "last_failed" : "never_synced", asOf: null };
  if (latestDone && latestDone.ok === false && latestDone.startedAt > lastGood.startedAt) return { known: false, reason: "last_failed", asOf: lastGood.startedAt };
  const ageDays = (input.now.getTime() - Date.parse(lastGood.startedAt)) / 86_400_000;
  if (ageDays > BILLING_RULES.staleDays) return { known: false, reason: "stale", asOf: lastGood.startedAt };
  return { known: true, asOf: lastGood.startedAt };
}

export function stateNote(s: BillingState): string {
  if (s.known) return "From GoHighLevel (read-only)";
  return {
    not_set_up: "Billing isn't set up yet (run 0015 in Supabase).",
    not_connected: "Billing isn't connected (no billing token in Vercel).",
    never_synced: "Not refreshed yet. Press Refresh billing.",
    last_failed: "The last refresh failed, so these numbers are unknown.",
    stale: `Not refreshed in over ${BILLING_RULES.staleDays} days, so these numbers are unknown.`,
  }[s.reason];
}

/** Records seen in the latest good refresh. Older ones (voided or removed in GoHighLevel) are ignored. */
export function liveRecords(records: BillingRecord[], state: BillingState): BillingRecord[] {
  if (!state.known) return [];
  return records.filter((r) => r.syncedAt >= state.asOf);
}

// ---------------------------------------------------------------------------
// Totals (null = unknown)
// ---------------------------------------------------------------------------

export interface BillingTotals {
  collectedThisMonthUsd: number | null;
  openUsd: number | null;
  overdueUsd: number | null;
  overdueCount: number | null;
  failedThisMonth: number | null;
  /** Records in other currencies (not added up). */
  otherCurrency: number;
  unmatched: number | null;
}

const usd = (cents: number) => Math.round(cents) / 100;
const dueCents = (r: BillingRecord) => r.amountDueCents ?? r.amountCents;

/** Collected (paid payments, USD) between two dates, inclusive. null when unknown. */
export function collectedBetween(records: BillingRecord[], state: BillingState, from: string, to: string): number | null {
  if (!state.known) return null;
  const cents = liveRecords(records, state)
    .filter((r) => r.kind === "payment" && r.status === "paid" && r.currency === "USD" && r.paidOn && r.paidOn >= from && r.paidOn <= to)
    .reduce((n, r) => n + r.amountCents, 0);
  return usd(cents);
}

export function billingTotals(records: BillingRecord[], state: BillingState, today: string): BillingTotals {
  if (!state.known) return { collectedThisMonthUsd: null, openUsd: null, overdueUsd: null, overdueCount: null, failedThisMonth: null, otherCurrency: 0, unmatched: null };
  const live = liveRecords(records, state);
  const month = today.slice(0, 7);
  const usdOnly = live.filter((r) => r.currency === "USD");
  const owed = usdOnly.filter((r) => r.kind === "invoice" && (r.status === "open" || r.status === "overdue") && dueCents(r) > 0);
  const overdue = owed.filter((r) => r.dueOn !== null && r.dueOn < today);
  return {
    collectedThisMonthUsd: collectedBetween(records, state, `${month}-01`, today),
    openUsd: usd(owed.reduce((n, r) => n + dueCents(r), 0)),
    overdueUsd: usd(overdue.reduce((n, r) => n + dueCents(r), 0)),
    overdueCount: overdue.length,
    failedThisMonth: live.filter((r) => r.kind === "payment" && r.status === "failed" && (r.issuedOn ?? "").startsWith(month)).length,
    otherCurrency: live.length - usdOnly.length,
    unmatched: live.filter((r) => r.clientDbId === null).length,
  };
}

/** "Plan MRR vs collected": the gap is null when collected is unknown. */
export function planVsCollected(planMrrUsd: number, collectedUsd: number | null): { plan: number; collected: number | null; gap: number | null } {
  return { plan: planMrrUsd, collected: collectedUsd, gap: collectedUsd === null ? null : Math.round((planMrrUsd - collectedUsd) * 100) / 100 };
}

// ---------------------------------------------------------------------------
// Per client: chip, overdue detail, alerts
// ---------------------------------------------------------------------------

export type BillingChip = "paid" | "due_soon" | "overdue" | "failed";
export const CHIP_LABEL: Record<BillingChip, string> = { paid: "Paid", due_soon: "Due soon", overdue: "Overdue", failed: "Payment failed" };

export interface ClientBilling {
  clientDbId: string;
  chip: BillingChip | null;
  overdueCount: number;
  overdueUsd: number;
  daysLate: number;
  failedThisMonth: number;
  /** e.g. "2 invoices, $1,200, 18 days late" */
  detail: string | null;
}

const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);

export function overdueDetail(count: number, amountUsd: number, daysLate: number): string {
  return `${count} invoice${count === 1 ? "" : "s"}, ${money(amountUsd)}, ${daysLate} day${daysLate === 1 ? "" : "s"} late`;
}

/** One summary per matched client (only clients with billing records). Empty when unknown. */
export function clientBilling(records: BillingRecord[], state: BillingState, today: string): Map<string, ClientBilling> {
  const out = new Map<string, ClientBilling>();
  const month = today.slice(0, 7);
  const byClient = new Map<string, BillingRecord[]>();
  for (const r of liveRecords(records, state)) {
    if (!r.clientDbId) continue;
    byClient.set(r.clientDbId, [...(byClient.get(r.clientDbId) ?? []), r]);
  }
  for (const [clientDbId, rs] of byClient) {
    const owed = rs.filter((r) => r.kind === "invoice" && (r.status === "open" || r.status === "overdue") && dueCents(r) > 0);
    const overdue = owed.filter((r) => r.dueOn !== null && r.dueOn < today);
    const dueSoon = owed.filter((r) => r.dueOn !== null && r.dueOn >= today && daysFrom(today, r.dueOn) <= BILLING_RULES.dueSoonDays);
    const failed = rs.filter((r) => r.kind === "payment" && r.status === "failed" && (r.issuedOn ?? "").startsWith(month));
    // A failure that was followed by a successful payment is no longer a problem.
    const lastPaid = rs.filter((r) => r.kind === "payment" && r.status === "paid" && r.paidOn).map((r) => r.paidOn!).sort().at(-1) ?? "";
    const openFailures = failed.filter((r) => (r.issuedOn ?? "") >= lastPaid);
    const daysLate = overdue.reduce((m, r) => Math.max(m, daysFrom(r.dueOn!, today)), 0);
    const overdueUsd = usd(overdue.filter((r) => r.currency === "USD").reduce((n, r) => n + dueCents(r), 0));
    const anyPaid = rs.some((r) => r.status === "paid");
    const chip: BillingChip | null = openFailures.length ? "failed" : overdue.length ? "overdue" : dueSoon.length ? "due_soon" : owed.length === 0 && anyPaid ? "paid" : null;
    out.set(clientDbId, {
      clientDbId,
      chip,
      overdueCount: overdue.length,
      overdueUsd,
      daysLate,
      failedThisMonth: openFailures.length,
      detail: overdue.length ? overdueDetail(overdue.length, overdueUsd, daysLate) : openFailures.length ? `${openFailures.length} failed payment${openFailures.length === 1 ? "" : "s"} this month` : null,
    });
  }
  return out;
}

export interface PaymentAlert {
  clientDbId: string;
  severity: "urgent" | "watch";
  problem: string;
}

/**
 * Owner-only payment alerts: overdue 7+ days, or a failed payment this month.
 * Urgent when over 30 days late or a payment failed. Never added to the shared health
 * score or to anything saved (managers can read those).
 */
export function paymentAlerts(byClient: Map<string, ClientBilling>): PaymentAlert[] {
  const out: PaymentAlert[] = [];
  for (const b of byClient.values()) {
    const late = b.overdueCount > 0 && b.daysLate >= BILLING_RULES.atRiskOverdueDays;
    if (!late && b.failedThisMonth === 0) continue;
    const urgent = b.failedThisMonth > 0 || b.daysLate > BILLING_RULES.urgentOverdueDays;
    const parts = [late ? overdueDetail(b.overdueCount, b.overdueUsd, b.daysLate) : null, b.failedThisMonth ? `${b.failedThisMonth} failed payment${b.failedThisMonth === 1 ? "" : "s"}` : null].filter(Boolean);
    out.push({ clientDbId: b.clientDbId, severity: urgent ? "urgent" : "watch", problem: `Payment: ${parts.join(" · ")}` });
  }
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "urgent" ? -1 : 1));
}

/** Unmatched records grouped by contact, for matching by hand (largest amount first). */
export function unmatchedGroups(records: BillingRecord[], state: BillingState): { contactId: string | null; label: string | null; count: number; amountUsd: number }[] {
  const groups = new Map<string, { contactId: string | null; label: string | null; count: number; cents: number }>();
  for (const r of liveRecords(records, state).filter((x) => x.clientDbId === null)) {
    const key = r.contactId ?? `none:${r.providerId}`;
    const g = groups.get(key) ?? { contactId: r.contactId, label: r.unmatchedLabel, count: 0, cents: 0 };
    g.count += 1;
    g.cents += r.currency === "USD" ? r.amountCents : 0;
    g.label ??= r.unmatchedLabel;
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => ({ contactId: g.contactId, label: g.label, count: g.count, amountUsd: usd(g.cents) })).sort((a, b) => b.amountUsd - a.amountUsd);
}

// ---------------------------------------------------------------------------
// Match suggestions (shown only; the owner confirms each one with a tap)
// ---------------------------------------------------------------------------

/** Lowercase, no accents, letters and digits only, single spaces. */
export function normalizeName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * A client whose name is EXACTLY the name on the invoice (ignoring capitals, accents and
 * punctuation), and only when exactly one client has that name. Anything less certain
 * ("John" vs "Jack", a business name vs a person) gets no suggestion. Nothing is saved
 * until the owner taps to confirm.
 */
export function suggestBillingMatch<T extends { slug: string; name: string }>(label: string | null, clients: T[]): T | null {
  if (!label) return null;
  const want = normalizeName(label);
  if (want.length < 4 || !want.includes(" ")) return null; // a single word is too vague
  const hits = clients.filter((c) => normalizeName(c.name) === want);
  return hits.length === 1 ? hits[0]! : null;
}
