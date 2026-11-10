// Home layouts by job (approved 2026-11-10, docs/ROLE_HOME_PLAN.md).
// Same permissions for everyone: a layout only chooses what Home shows FIRST, using data
// the signed-in person can already read. Pure functions (no database, no network), tested
// in tests/fixtures.test.ts.

import { daysBetween } from "@/lib/format";
import { isSalesStage, promiseMissed, reviewQueue, waitingDays } from "@/lib/ops";
import type { CheckIn, ClientAction, HealthSummary, PriorityItem, RosterClient, TeamRole } from "@/lib/types";

export const HOME_LAYOUTS = ["everything", "client_care", "work_lead", "sales"] as const;
export type HomeLayout = (typeof HOME_LAYOUTS)[number];
export const HOME_LAYOUT_COOKIE = "atlas_home";

export const HOME_LAYOUT_LABEL: Record<HomeLayout, string> = {
  everything: "Everything",
  client_care: "Client care",
  work_lead: "Work lead",
  sales: "Sales",
};

/** A saved choice: only the four names, anything else is ignored. */
export function asHomeLayout(v: string | null | undefined): HomeLayout | null {
  return HOME_LAYOUTS.includes(v as HomeLayout) ? (v as HomeLayout) : null;
}

/** Where each job starts. Unknown or unlinked people get Everything. */
export function defaultHomeLayout(teamRole: TeamRole | null | undefined): HomeLayout {
  if (teamRole === "client_manager") return "client_care";
  if (teamRole === "client_comms") return "work_lead";
  return "everything";
}

/** The person's own pick wins; otherwise their job's default. */
export function chooseHomeLayout(saved: string | null | undefined, teamRole: TeamRole | null | undefined): HomeLayout {
  return asHomeLayout(saved) ?? defaultHomeLayout(teamRole);
}

const open = (a: ClientAction) => a.status !== "done" && a.status !== "canceled";
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Client care: "my" clients (owned by my team profile; everyone's when not linked).
// ---------------------------------------------------------------------------

export interface ClientCareView {
  mine: RosterClient[];
  /** At risk first, then needs attention, with the first reason. */
  attention: { client: RosterClient; state: "at_risk" | "needs_attention"; reason: string }[];
  replyWaiting: { client: RosterClient; days: number }[];
  checkInsOverdue: number;
  /** Client promises missed or due within 7 days, soonest first. */
  promises: ClientAction[];
  priorities: PriorityItem[];
}

export function clientCareView(input: {
  clients: RosterClient[];
  health: Map<string, HealthSummary | null>;
  checkIns: Map<string, CheckIn>;
  actions: ClientAction[];
  priorities: PriorityItem[];
  staffId: string | null;
  today: string;
}): ClientCareView {
  const { clients, health, checkIns, actions, priorities, staffId, today } = input;
  const current = clients.filter((c) => c.status === "active" || c.status === "paused");
  const mine = staffId ? current.filter((c) => c.ownerId === staffId) : current;
  const slugs = new Set(mine.map((c) => c.id));
  const attention = mine
    .flatMap((c) => {
      const h = health.get(c.id);
      return h && (h.state === "at_risk" || h.state === "needs_attention") ? [{ client: c, state: h.state, reason: h.reasons[0] ?? "" }] : [];
    })
    .sort((a, b) => Number(b.state === "at_risk") - Number(a.state === "at_risk") || b.client.monthlyUsd - a.client.monthlyUsd);
  const replyWaiting = mine
    .flatMap((c) => {
      const d = waitingDays(c, today);
      return d !== null && d >= 1 ? [{ client: c, days: d }] : [];
    })
    .sort((a, b) => b.days - a.days);
  const soon = addDays(today, 7);
  const promises = actions
    .filter((a) => open(a) && a.promisedOn && a.client && slugs.has(a.client.slug) && (promiseMissed(a, today) || a.promisedOn <= soon))
    .sort((a, b) => a.promisedOn!.localeCompare(b.promisedOn!));
  return {
    mine,
    attention,
    replyWaiting,
    checkInsOverdue: mine.filter((c) => c.status === "active" && checkIns.get(c.id)?.state === "overdue").length,
    promises,
    // My items, or items about my clients that nobody owns yet.
    priorities: priorities.filter((p) => (staffId ? p.ownerId === staffId || (!p.ownerId && p.clientSlug && slugs.has(p.clientSlug)) : true)),
  };
}

// ---------------------------------------------------------------------------
// Work lead: review queue, stuck, overdue, unassigned (work orders and issues).
// ---------------------------------------------------------------------------

export interface WorkLeadView {
  review: ClientAction[];
  avgWaitMinutes: number | null;
  blocked: ClientAction[];
  overdue: ClientAction[];
  unassigned: ClientAction[];
}

export function workLeadView(actions: ClientAction[], today: string): WorkLeadView {
  const work = actions.filter((a) => a.kind === "work_order" || a.kind === "issue");
  const q = reviewQueue(work, today);
  const live = work.filter((a) => open(a) && a.status !== "review");
  return {
    review: q.waiting,
    avgWaitMinutes: q.avgWaitMinutes,
    blocked: live.filter((a) => a.status === "blocked"),
    overdue: live.filter((a) => a.dueOn !== null && a.dueOn < today).sort((a, b) => a.dueOn!.localeCompare(b.dueOn!)),
    unassigned: live.filter((a) => !a.ownerId),
  };
}

// ---------------------------------------------------------------------------
// Sales: lead follow-ups (app-only), newest leads, appointments. GoHighLevel stays read-only.
// ---------------------------------------------------------------------------

export interface SalesDeal {
  ghlId: string;
  name: string;
  stage: string;
  value: number;
  createdAt: string | null;
}
export interface SalesAppointment {
  startsAt: string;
  calendar: string | null;
  status: string | null;
}

export interface SalesView {
  /** Open lead follow-ups, overdue first, then by due date. */
  followUps: ClientAction[];
  followUpsDue: number;
  newLeads: SalesDeal[];
  appointmentsToday: SalesAppointment[];
  appointmentsWeek: SalesAppointment[];
  openValue: number;
}

export function salesView(input: { actions: ClientAction[]; deals: SalesDeal[]; appointments: SalesAppointment[]; today: string; now: Date; tzDay: (iso: string) => string }): SalesView {
  const { actions, deals, appointments, today, now, tzDay } = input;
  const followUps = actions
    .filter((a) => open(a) && a.leadGhlId)
    .sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"));
  const weekAgo = addDays(today, -7);
  const live = appointments
    .filter((a) => {
      const s = (a.status ?? "").toLowerCase();
      return s !== "cancelled" && s !== "invalid" && Date.parse(a.startsAt) >= now.getTime() - 60 * 60_000;
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const weekEnd = addDays(today, 7);
  return {
    followUps,
    followUpsDue: followUps.filter((a) => a.dueOn !== null && a.dueOn <= today).length,
    newLeads: deals
      .filter((d) => isSalesStage(d.stage) && (d.createdAt ?? "").slice(0, 10) >= weekAgo)
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")),
    appointmentsToday: live.filter((a) => tzDay(a.startsAt) === today),
    appointmentsWeek: live.filter((a) => tzDay(a.startsAt) > today && tzDay(a.startsAt) <= weekEnd),
    openValue: deals.reduce((n, d) => n + d.value, 0),
  };
}

/** "3 days" / "today" for a due date. */
export function lateBy(dueOn: string | null, today: string): string | null {
  if (!dueOn || dueOn >= today) return null;
  const d = daysBetween(dueOn, today);
  return `${d} day${d === 1 ? "" : "s"} late`;
}
