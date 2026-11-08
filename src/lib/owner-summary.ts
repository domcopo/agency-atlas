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
    lastRuns: Partial<Record<"briefing" | "client_profile" | "work_orders", { at: string; outcome: string }>>;
  };
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
    add("problems_solved", w, known ? issues.filter((a) => a.status === "done" && a.doneAt && inWeek(nyDate(a.doneAt), w)).length : null, "count", known ? "client issues finished" : "not tracked yet");
  }
  const month = `${today.slice(0, 7)}-01`;
  metrics.push({ key: "profit", period: "month", period_start: month, value: null, unit: "usd", note: "no cost data in Atlas" });
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

  // --- Alerts: the detection rules, as counts ------------------------------------
  const real = detections.filter((d) => !d.isSynthetic);
  const alerts: SummaryAlert[] = [];
  const count = (f: (d: Detection) => boolean) => real.filter(f).length;
  const atRiskCount = count((d) => d.id.startsWith("d_at_risk_"));
  const attention = count((d) => d.id.startsWith("d_needs_attention_"));
  const ideas = count((d) => d.kind === "opportunity");
  const unreadable = real.find((d) => d.id === "d_skip");
  if (atRiskCount) alerts.push({ severity: "urgent", title: "Clients at risk", count: atRiskCount });
  if (unreadable) alerts.push({ severity: "urgent", title: "Client records couldn't be read", count: 1 });
  if (attention) alerts.push({ severity: "watch", title: "Clients needing attention", count: attention });
  if (ideas) alerts.push({ severity: "info", title: "Upsell or referral ideas", count: ideas });

  // --- Bots ------------------------------------------------------------------
  const status: SummaryBot["status"] = !ai.configured || !ai.tablesReady ? "off" : ai.blocked ? "paused" : "active";
  const bot = (name: string, feature: "briefing" | "client_profile" | "work_orders"): SummaryBot => {
    const r = ai.lastRuns[feature];
    return { name, status, last_run_at: r?.at ?? null, last_result: !r ? "unknown" : r.outcome === "ok" ? "ok" : "error" };
  };

  return {
    schema: OWNER_SUMMARY_SCHEMA,
    source: "agency-atlas",
    business: "yo-marketing-co",
    generated_at: now.toISOString(),
    metrics,
    lists: [atRisk, winBack, byOwner],
    alerts,
    bots: [bot("Ops Briefing", "briefing"), bot("Client Profile", "client_profile"), bot("Work Order Drafts", "work_orders")],
  };
}
