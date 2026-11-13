// Owner summary (0012): agency TOTALS for the owner's personal dashboard ("AI CEO").
// Pure functions: no database, no network. Built while the owner is signed in, saved
// as a snapshot, and served read-only by GET /api/owner-summary.
//
// Rules:
// - Totals and counts only. No record-level data: no ids, no notes, no message text,
//   no work order titles, no emails, phones or addresses. Names: client names and
//   team member names only (owner-approved).
// - Blank is not zero: value null = Atlas doesn't know or doesn't track it.
// - Weeks start Monday, America/New_York.

import {
  BILLING_RULES,
  type BillingRecord,
  type BillingState,
  billingTotals,
  clientBilling,
  collectedBetween,
  liveRecords,
  overdueDetail,
  paymentAlerts,
  stateNote,
} from "@/lib/billing";
import { AI_BOTS, type AiFeature, type SummaryRun } from "@/lib/bot-runs";
import { daysBetween } from "@/lib/format";
import { dueWhen, promiseMissed } from "@/lib/ops";
import type { ClientAction, Detection, RosterClient } from "@/lib/types";

export const OWNER_SUMMARY_SCHEMA = "owner-summary/v1";
export const OWNER_SUMMARY_WEEKS = 12;
const TZ = "America/New_York";

export interface SummaryMetric {
  key: string;
  period: "week" | "month";
  period_start: string;
  value: number | null;
  unit: "usd" | "count";
  note?: string;
}
export interface SummaryList {
  key: string;
  label: string;
  items: { name: string; detail: string }[];
  note?: string;
}
export interface SummaryAlert {
  severity: "info" | "watch" | "urgent";
  title: string;
  count: number;
}
export interface SummaryBot {
  name: string;
  status: "active" | "paused" | "off";
  last_run_at: string | null;
  last_result: "ok" | "error" | "unknown";
}
export interface OwnerSummary {
  schema: typeof OWNER_SUMMARY_SCHEMA;
  source: "agency-atlas";
  business: "yo-marketing-co";
  generated_at: string;
  metrics: SummaryMetric[];
  lists: SummaryList[];
  alerts: SummaryAlert[];
  bots: SummaryBot[];
  /**
   * Last 100 AI runs of the past 7 days, newest first (0018, docs/BOT_RUNS_PLAN.md).
   * [] = no runs; null = the run log can't be read (or 0018 not run yet).
   */
  recent_runs: SummaryRun[] | null;
}

export interface OwnerSummaryInput {
  now: Date;
  clients: RosterClient[];
  /** Follow-ups, issues and work orders; null = not set up (0006 not run). */
  actions: ClientAction[] | null;
  /** GoHighLevel opportunity creation times; null = never synced. */
  opportunities: { createdAt: string | null }[] | null;
  /** Latest saved daily health score per client (client_health_daily); null = not set up (0009). */
  latestHealth: { slug: string; score: number; level: string; day: string }[] | null;
  /** Score change over about a week, per client slug. */
  trends: Map<string, number | null>;
  detections: Detection[];
  staff: { id: string; name: string }[];
  ai: {
    configured: boolean;
    tablesReady: boolean;
    blocked: boolean;
    spentUsd: number;
    lastRuns: Partial<Record<AiFeature, { at: string; outcome: string }>>;
  };
  /** Already built by buildRecentRuns (fixed words only). null/missing = not readable. */
  recentRuns?: SummaryRun[] | null;
  /**
   * Billing (0015), owner only: read-only copy of GoHighLevel invoices and payments.
   * null/missing = not set up or not readable. When the state isn't known (not connected,
   * last refresh failed, too old), every billing value is null, never 0.
   */
  billing?: { state: BillingState; records: BillingRecord[] } | null;
  /**
   * Work orders (0017): when each one's status last changed (from the database's own
   * history), by work order id. null/missing = history not set up yet.
   */
  workOrderStatusSince?: Map<string, string> | null;
}

/** First name only, for the owner's dashboard. */
export function firstName(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] || "No one";
}

// ---------------------------------------------------------------------------
// Dates: New York calendar days, Monday weeks.
// ---------------------------------------------------------------------------

/** The New York calendar date (YYYY-MM-DD) of a moment. */
export function nyDate(at: Date | string): string {
  const d = typeof at === "string" ? new Date(at) : at;
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Monday (YYYY-MM-DD) of the week containing a calendar date. */
export function mondayOf(day: string): string {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(day, -((dow + 6) % 7));
}

/** The last n Monday-start weeks, oldest first; the last one is the current (partial) week. */
export function lastWeeks(now: Date, n = OWNER_SUMMARY_WEEKS): { start: string; end: string; current: boolean }[] {
  const thisMonday = mondayOf(nyDate(now));
  return Array.from({ length: n }, (_, i) => {
    const start = addDays(thisMonday, -7 * (n - 1 - i));
    return { start, end: addDays(start, 6), current: i === n - 1 };
  });
}

const inWeek = (day: string | null | undefined, w: { start: string; end: string }) => Boolean(day && day >= w.start && day <= w.end);

// ---------------------------------------------------------------------------
// Safety scan (also enforced by the database when saving).
// ---------------------------------------------------------------------------

export const LEAK_PATTERNS: { what: string; re: RegExp }[] = [
  { what: "email address", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/ },
  { what: "phone number", re: /(^|[^0-9])\(?[0-9]{3}\)?[-. ][0-9]{3}[-. ][0-9]{4}([^0-9]|$)/ },
  { what: "phone number", re: /\+1[-. ]?\(?[0-9]{3}\)?/ },
  { what: "street address", re: /\b\d{1,6}\s+(?:[A-Z][a-z]+\s+){1,3}(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Ct|Court|Way|Pl|Place|Pkwy|Parkway|Hwy|Highway)\b\.?/ },
];

/** Names of what looks like contact details in the summary (empty = clean). */
export function findLeaks(summary: unknown): string[] {
  const text = JSON.stringify(summary);
  return LEAK_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.what);
}

// ---------------------------------------------------------------------------
// The summary.
// ---------------------------------------------------------------------------

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export function buildOwnerSummary(input: OwnerSummaryInput): OwnerSummary {
  const { now, clients, actions, opportunities, latestHealth, trends, detections, staff, ai } = input;
  const today = nyDate(now);
  const weeks = lastWeeks(now);
  const metrics: SummaryMetric[] = [];
  const add = (key: string, w: { start: string; current: boolean }, value: number | null, unit: "usd" | "count", note?: string) =>
    metrics.push({ key, period: "week", period_start: w.start, value, unit, ...(note || w.current ? { note: [note, w.current ? "week in progress" : ""].filter(Boolean).join("; ") } : {}) });

  // Issues were first tracked when the earliest item was saved: weeks before that are unknown.
  const trackedSince = actions && actions.length ? actions.map((a) => nyDate(a.createdAt)).sort()[0]! : null;
  const issues = (actions ?? []).filter((a) => a.kind === "issue");

  // Billing: one state for every billing value (blank is not zero).
  const billingStateNow = input.billing?.state ?? null;
  const billingRecords = input.billing?.records ?? [];
  const billingKnown = billingStateNow?.known === true;
  const billingNote = !billingStateNow ? "billing not set up" : billingKnown ? "paid card and invoice payments in USD, from GoHighLevel (read-only)" : stateNote(billingStateNow);

  for (const w of weeks) {
    const started = clients.filter((c) => inWeek(c.startDate, w));
    const ended = clients.filter((c) => inWeek(c.endDate, w));
    const asOf = w.current ? today : w.end;

    add("leads", w, opportunities ? opportunities.filter((o) => o.createdAt && inWeek(nyDate(o.createdAt), w)).length : null, "count", opportunities ? "new GoHighLevel opportunities (as of the last sync)" : "GoHighLevel not synced");
    for (const [key, svc] of [["sales_ads", "Ads"], ["sales_seo", "SEO"], ["sales_web", "Website"]] as const)
      add(key, w, started.filter((c) => c.services.includes(svc)).length, "count", `new clients with ${svc} (client start dates)`);
    add("sales_value_monthly", w, started.reduce((n, c) => n + c.monthlyUsd, 0), "usd", "monthly plans of new clients");
    add("sales_value_onetime", w, null, "usd", "one-time fees aren't tracked in Atlas");
    add("onboarded", w, started.length, "count");
    add("clients_lost", w, ended.length, "count", "clients with an end date this week");
    add("lost_value_monthly", w, ended.reduce((n, c) => n + c.monthlyUsd, 0), "usd");
    // MRR at the end of the week. Today's plan amounts (past prices aren't recorded);
    // paused clients without an end date are left out (when they stopped is unknown).
    const mrr = clients
      .filter((c) => c.startDate <= asOf && (c.endDate ? c.endDate > asOf : c.status === "active"))
      .reduce((n, c) => n + c.monthlyUsd, 0);
    add("mrr", w, Math.round(mrr * 100) / 100, "usd", "estimated from current plan amounts");
    add("clients_with_leads", w, null, "count", "Atlas doesn't know which leads belong to which client");
    const known = trackedSince !== null && w.end >= trackedSince;
    add("problems_opened", w, known ? issues.filter((a) => inWeek(nyDate(a.createdAt), w)).length : null, "count", known ? "client issues opened" : "not tracked yet");
    add("collected_revenue", w, billingKnown ? collectedBetween(billingRecords, billingStateNow!, w.start, w.current ? today : w.end) : null, "usd", billingNote);
    add("problems_solved", w, known ? issues.filter((a) => a.status === "done" && a.doneAt && inWeek(nyDate(a.doneAt), w)).length : null, "count", known ? "client issues finished" : "not tracked yet");
  }
  const month = `${today.slice(0, 7)}-01`;
  metrics.push({ key: "profit", period: "month", period_start: month, value: null, unit: "usd", note: "no cost data in Atlas" });
  const bt = billingKnown ? billingTotals(billingRecords, billingStateNow!, today) : null;
  const billingMonth = (key: string, value: number | null | undefined, unit: "usd" | "count", what: string) =>
    metrics.push({ key, period: "month", period_start: month, value: bt ? (value ?? null) : null, unit, note: bt ? what : billingNote });
  billingMonth("collected_revenue", bt?.collectedThisMonthUsd, "usd", "collected this month so far (paid, USD, from GoHighLevel)");
  billingMonth("open_invoices_usd", bt?.openUsd, "usd", "still owed on sent invoices right now (includes overdue)");
  billingMonth("overdue_invoices_usd", bt?.overdueUsd, "usd", "owed on invoices past their due date right now");
  billingMonth("overdue_invoices_count", bt?.overdueCount, "count", "invoices past their due date right now");
  billingMonth("failed_payments_count", bt?.failedThisMonth, "count", "failed card payments this month");
  // --- Work orders (totals right now; done per week) ------------------------------
  const work = actions ? actions.filter((a) => a.kind === "work_order" && a.status !== "canceled" && !a.archivedAt) : null;
  const openWork = work ? work.filter((a) => a.status !== "done") : null;
  const nextWeek = addDays(today, 6);
  const current = weeks[weeks.length - 1]!;
  const nowMetric = (key: string, value: number | null, note: string) =>
    metrics.push({ key, period: "week", period_start: current.start, value, unit: "count", note: value === null ? "work orders not set up yet" : note });
  nowMetric("work_orders_open", openWork ? openWork.length : null, "open right now");
  nowMetric("work_orders_overdue", openWork ? openWork.filter((a) => a.dueOn !== null && a.dueOn < today).length : null, "past their due date right now");
  nowMetric("work_orders_blocked", openWork ? openWork.filter((a) => a.status === "blocked").length : null, "marked blocked right now");
  nowMetric("work_orders_due_this_week", openWork ? openWork.filter((a) => a.dueOn !== null && a.dueOn >= today && a.dueOn <= nextWeek).length : null, "due in the next 7 days");
  for (const w of weeks)
    add("work_orders_done_this_week", w, work ? work.filter((a) => a.status === "done" && a.doneAt && inWeek(nyDate(a.doneAt), w)).length : null, "count", work ? "work orders finished" : "work orders not set up yet");
  metrics.push({ key: "ai_spend", period: "month", period_start: month, value: ai.tablesReady ? Math.round(ai.spentUsd * 100) / 100 : null, unit: "usd", note: "AI cost this month (exact, from the cost log)" });

  // --- Lists -----------------------------------------------------------------
  const bySlug = new Map(clients.map((c) => [c.id, c]));
  const atRisk: SummaryList = { key: "at_risk_clients", label: "Clients at risk", items: [] };
  if (!latestHealth) atRisk.note = "daily health scores not set up yet";
  else {
    const recent = latestHealth.filter((h) => h.level === "at_risk" && daysBetween(h.day, today) <= 3).sort((a, b) => a.score - b.score);
    for (const h of recent) {
      const c = bySlug.get(h.slug);
      if (!c) continue;
      const bits = [`health ${h.score}`];
      const change = trends.get(h.slug);
      if (change) bits[0] += ` (${change > 0 ? "+" : ""}${change} this week)`;
      if (c.lastContact) bits.push(`no contact ${daysBetween(c.lastContact, today)} days`);
      else bits.push("no contact logged");
      if (c.ghl?.lastInboundAt && (!c.ghl.lastOutboundAt || c.ghl.lastInboundAt > c.ghl.lastOutboundAt))
        bits.push(`waiting ${daysBetween(nyDate(c.ghl.lastInboundAt), today)} days for our reply`);
      bits.push(`${usd(c.monthlyUsd)}/mo`);
      atRisk.items.push({ name: c.name, detail: bits.join(", ") });
    }
  }
  const winBack: SummaryList = {
    key: "win_back",
    label: "Win-back list (paused clients)",
    items: clients
      .filter((c) => c.status === "paused")
      .sort((a, b) => b.monthlyUsd - a.monthlyUsd)
      .map((c) => ({ name: c.name, detail: `${usd(c.monthlyUsd)}/mo plan, paused${c.endDate ? ` since ${c.endDate}` : ""}` })),
  };
  const byOwner: SummaryList = { key: "overdue_or_blocked_by_owner", label: "Overdue or blocked work, by person", items: [] };
  if (!actions) byOwner.note = "work items not set up yet";
  else {
    const nameOf = new Map(staff.map((m) => [m.id, m.name]));
    const counts = new Map<string, { overdue: number; blocked: number; review: number }>();
    for (const a of actions.filter((x) => x.status !== "done")) {
      const overdue = promiseMissed(a, today) || dueWhen(a.dueOn, today) === "overdue";
      if (!overdue && a.status !== "blocked") continue;
      const who = a.ownerId ? (nameOf.get(a.ownerId) ?? "Former teammate") : "No owner";
      const n = counts.get(who) ?? { overdue: 0, blocked: 0, review: 0 };
      if (overdue) n.overdue++;
      if (a.status === "blocked") n.blocked++;
      if (a.status === "review") n.review++;
      counts.set(who, n);
    }
    byOwner.items = [...counts.entries()]
      .sort((x, y) => y[1].overdue + y[1].blocked - (x[1].overdue + x[1].blocked))
      .map(([name, n]) => ({ name, detail: [`${n.overdue} overdue`, `${n.blocked} blocked`, n.review ? `${n.review} waiting for review` : ""].filter(Boolean).join(", ") }));
  }

  // --- Work orders overdue or blocked: title, client, developer's first name, due, status.
  // No notes, steps or comments. A title that looks like contact details is hidden.
  const workList: SummaryList = { key: "work_orders_overdue_or_blocked", label: "Work orders overdue or blocked", items: [] };
  if (!openWork) workList.note = "work orders not set up yet";
  else {
    const STATUS = { open: "New", in_progress: "In progress", waiting: "Waiting on client", blocked: "Blocked", review: "In review", done: "Done", canceled: "Canceled" } as const;
    workList.items = openWork
      .filter((a) => a.status === "blocked" || (a.dueOn !== null && a.dueOn < today))
      .sort((x, y) => (x.dueOn ?? "9999").localeCompare(y.dueOn ?? "9999"))
      .slice(0, 25)
      .map((a) => {
        const label = a.title;
        const safe = LEAK_PATTERNS.some((p) => p.re.test(label)) ? "(title hidden: it looked like contact details)" : label.slice(0, 120);
        return { name: safe, detail: [a.client?.name ?? "No client", firstName(a.ownerName), a.dueOn ? `due ${a.dueOn}` : "no due date", STATUS[a.status]].join(" · ") };
      });
  }

  // --- Billing: overdue clients (names of matched clients only) -----------------
  const overdueClients: SummaryList = { key: "overdue_clients", label: "Clients with overdue invoices", items: [] };
  let urgentPayments = 0;
  if (!billingKnown) overdueClients.note = billingNote;
  else {
    const nameByDb = new Map(clients.filter((c) => c.dbId).map((c) => [c.dbId!, c.name]));
    const byClient = clientBilling(billingRecords, billingStateNow!, today);
    overdueClients.items = [...byClient.values()]
      .filter((b) => b.overdueCount > 0 && b.detail && nameByDb.has(b.clientDbId))
      .sort((a, b) => b.daysLate - a.daysLate || b.overdueUsd - a.overdueUsd)
      .map((b) => ({ name: nameByDb.get(b.clientDbId)!, detail: b.detail! }));
    urgentPayments = paymentAlerts(byClient).filter((a) => a.severity === "urgent" && nameByDb.has(a.clientDbId)).length;
    // Unmatched invoices are counted, never named (the name on them may not be a client).
    const live = liveRecords(billingRecords, billingStateNow!).filter((r) => r.clientDbId === null);
    const unmatchedOverdue = live.filter((r) => r.kind === "invoice" && (r.status === "open" || r.status === "overdue") && r.currency === "USD" && (r.amountDueCents ?? r.amountCents) > 0 && r.dueOn !== null && r.dueOn < today);
    if (unmatchedOverdue.length) {
      const cents = unmatchedOverdue.reduce((n, r) => n + (r.amountDueCents ?? r.amountCents), 0);
      const late = unmatchedOverdue.reduce((m, r) => Math.max(m, daysBetween(r.dueOn!, today)), 0);
      overdueClients.items.push({ name: `Unmatched (${unmatchedOverdue.length})`, detail: `${overdueDetail(unmatchedOverdue.length, cents / 100, late)}, not matched to a client yet` });
      if (late > BILLING_RULES.urgentOverdueDays) urgentPayments += 1;
    }
    const month7 = today.slice(0, 7);
    urgentPayments += live.filter((r) => r.kind === "payment" && r.status === "failed" && (r.issuedOn ?? "").startsWith(month7)).length;
  }

  // --- Alerts: the detection rules, as counts ------------------------------------
  const real = detections.filter((d) => !d.isSynthetic);
  const alerts: SummaryAlert[] = [];
  const count = (f: (d: Detection) => boolean) => real.filter(f).length;
  const atRiskCount = count((d) => d.id.startsWith("d_at_risk_"));
  const attention = count((d) => d.id.startsWith("d_needs_attention_"));
  const ideas = count((d) => d.kind === "opportunity");
  const unreadable = real.find((d) => d.id === "d_skip");
  if (atRiskCount) alerts.push({ severity: "urgent", title: "Clients at risk", count: atRiskCount });
  if (openWork) {
    const twoDaysAgo = addDays(today, -2);
    const late = openWork.filter((a) => a.dueOn !== null && a.dueOn <= twoDaysAgo).length;
    if (late) alerts.push({ severity: "urgent", title: "Work orders overdue by 2+ days", count: late });
    const since = input.workOrderStatusSince;
    if (since) {
      const cutoff = now.getTime() - 3 * 86_400_000;
      const stuck = openWork.filter((a) => (a.status === "blocked" || a.status === "waiting") && since.has(a.id) && Date.parse(since.get(a.id)!) <= cutoff).length;
      if (stuck) alerts.push({ severity: "watch", title: "Work orders blocked or waiting on the client for 3+ days", count: stuck });
    }
  }
  if (urgentPayments) alerts.push({ severity: "urgent", title: "Payments need attention", count: urgentPayments });
  if (unreadable) alerts.push({ severity: "urgent", title: "Client records couldn't be read", count: 1 });
  if (attention) alerts.push({ severity: "watch", title: "Clients needing attention", count: attention });
  if (ideas) alerts.push({ severity: "info", title: "Upsell or referral ideas", count: ideas });

  // --- Bots ------------------------------------------------------------------
  const status: SummaryBot["status"] = !ai.configured || !ai.tablesReady ? "off" : ai.blocked ? "paused" : "active";
  const bot = (feature: AiFeature): SummaryBot => {
    const r = ai.lastRuns[feature];
    return { name: AI_BOTS[feature].bot, status, last_run_at: r?.at ?? null, last_result: !r ? "unknown" : r.outcome === "ok" ? "ok" : "error" };
  };

  return {
    schema: OWNER_SUMMARY_SCHEMA,
    source: "agency-atlas",
    business: "yo-marketing-co",
    generated_at: now.toISOString(),
    metrics,
    lists: [atRisk, winBack, byOwner, overdueClients, workList],
    alerts,
    bots: [bot("briefing"), bot("client_profile"), bot("work_orders"), bot("quick_add"), bot("work_prompt")],
    recent_runs: input.recentRuns ?? null,
  };
}
