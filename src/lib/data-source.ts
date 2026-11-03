// The ONE place screens get their data from.
//
// Two kinds of data, always labeled on screen:
//  - REAL: your client list and team, read from private-data/ on this Mac
//    (Git-ignored). Falls back to a fictional roster when the folder is missing.
//  - SAMPLE: prospects, conversations, work orders, client-result numbers and
//    case studies. Fictional until GoHighLevel/Supabase are connected (Phase 2+).
//    Sample records are never attached to a real client or team member.
//
// Rule: screens never import fixtures or private files directly — always go through here.
// This module reads files with node:fs, so it only runs on the server.

import { businesses } from "@/fixtures/businesses";
import { demoRosterRaw, demoTeam } from "@/fixtures/demo-roster";
import { caseStudyHistory, surveyQuestions, surveyResponses, trends } from "@/fixtures/growth";
import { insights } from "@/fixtures/insights";
import { missionControl } from "@/fixtures/mission-control";
import { agencySalesKpis, conversations, prospects } from "@/fixtures/prospects";
import { safetyStatus } from "@/fixtures/safety";
import { developerLoads, sampleDevelopers, workOrders, workRules } from "@/fixtures/work";
import { daysBetween, fingerprint, monthsBetween } from "@/lib/format";
import { loadPrivateRoster, loadPrivateTeam, parseRoster } from "@/lib/private-data";
import type {
  Alert,
  ActivityItem,
  Business,
  ClientTier,
  Conversation,
  DataMode,
  Insight,
  MissionControlData,
  MonthlyPoint,
  Prospect,
  CheckIn,
  ClientHealth,
  Detection,
  RosterClient,
  RosterSource,
  RosterSummary,
  SafetyStatus,
  SubscriptionStatus,
  SurveyQuestion,
  SurveyResponse,
  TeamMember,
  Trend,
  WorkOrder,
} from "@/lib/types";

/** GoHighLevel/database connections: still none. */
export const DATA_MODE: DataMode = "mock";

const TODAY = missionControl.today;

// ---------------------------------------------------------------------------
// Client roster
// ---------------------------------------------------------------------------

function loadRoster(): { source: RosterSource; clients: RosterClient[]; skipped: number } {
  const real = loadPrivateRoster();
  if (real) return { source: "private_file", ...real };
  // The fictional roster goes through the same checks as the real one.
  const demo = parseRoster(demoRosterRaw) ?? { clients: [], skipped: 0 };
  return { source: "demo", ...demo };
}

let rosterCache: ReturnType<typeof loadRoster> | null = null;
function roster() {
  rosterCache ??= loadRoster();
  return rosterCache;
}

export function getRosterSource(): RosterSource {
  return roster().source;
}

const statusOrder: Record<SubscriptionStatus, number> = { active: 0, paused: 1, canceled: 2, incomplete_expired: 3 };

/** Active first, then by monthly amount (highest first). */
export function getRoster(): RosterClient[] {
  return [...roster().clients].sort(
    (a, b) => statusOrder[a.status] - statusOrder[b.status] || b.monthlyUsd - a.monthlyUsd || a.name.localeCompare(b.name),
  );
}

export function getRosterClient(id: string): RosterClient | undefined {
  return roster().clients.find((c) => c.id === id);
}

export function tierOf(monthlyUsd: number): ClientTier {
  if (monthlyUsd >= 500) return "high";
  if (monthlyUsd >= 150) return "mid";
  return "low";
}

export function getRosterSummary(): RosterSummary {
  const { clients, source, skipped } = roster();
  const sum = (xs: RosterClient[]) => Math.round(xs.reduce((n, c) => n + c.monthlyUsd, 0) * 100) / 100;
  const by = (s: SubscriptionStatus) => clients.filter((c) => c.status === s);
  const active = by("active");
  const tiers = { high: { count: 0, mrr: 0 }, mid: { count: 0, mrr: 0 }, low: { count: 0, mrr: 0 } };
  for (const c of active) {
    const t = tiers[tierOf(c.monthlyUsd)];
    t.count++;
    t.mrr = Math.round((t.mrr + c.monthlyUsd) * 100) / 100;
  }
  const months = active.map((c) => monthsBetween(c.startDate, TODAY));
  return {
    source,
    total: clients.length,
    activeCount: active.length,
    activeMrr: sum(active),
    pausedCount: by("paused").length,
    pausedMrr: sum(by("paused")),
    canceledCount: by("canceled").length,
    canceledMrr: sum(by("canceled")),
    expiredCount: by("incomplete_expired").length,
    needsCheck: clients.filter((c) => c.check).length,
    skipped,
    tiers,
    avgMonthsActive: months.length ? Math.round((months.reduce((a, b) => a + b, 0) / months.length) * 10) / 10 : 0,
  };
}

/** Clients signed per month (from REAL start dates), last `count` months, oldest first. */
export function getSignupsByMonth(count = 6): { month: string; signed: number; mrrAdded: number }[] {
  const [y, m] = TODAY.split("-").map(Number) as [number, number];
  const out: { month: string; signed: number; mrrAdded: number }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const key = d.toISOString().slice(0, 7);
    const signed = roster().clients.filter((c) => c.startDate.startsWith(key));
    out.push({
      month: key,
      signed: signed.length,
      mrrAdded: Math.round(signed.reduce((n, c) => n + c.monthlyUsd, 0) * 100) / 100,
    });
  }
  return out;
}

export interface WinLossMonth {
  month: string;
  won: number;
  wonMrr: number;
  lost: number;
  lostMrr: number;
}

/**
 * Clients won (by start date) and lost (by end date) per month, last `count` months.
 * "Lost" = canceled or expired. Lost clients without an end date can't be placed
 * in a month yet, so they are counted separately instead of guessed.
 */
export function getWinLoss(count = 6) {
  const clients = roster().clients;
  const isLost = (c: RosterClient) => c.status === "canceled" || c.status === "incomplete_expired";
  const lost = clients.filter(isLost);
  const money = (xs: RosterClient[]) => Math.round(xs.reduce((n, c) => n + c.monthlyUsd, 0) * 100) / 100;
  const months: WinLossMonth[] = getSignupsByMonth(count).map((m) => {
    const out = lost.filter((c) => c.endDate?.startsWith(m.month));
    return { month: m.month, won: m.signed, wonMrr: m.mrrAdded, lost: out.length, lostMrr: money(out) };
  });
  const undated = lost.filter((c) => !c.endDate);
  const paused = clients.filter((c) => c.status === "paused");
  const everSigned = clients.length;
  return {
    months,
    lostTotal: lost.length,
    lostTotalMrr: money(lost),
    lostWithoutDate: undated.length,
    pausedCount: paused.length,
    pausedMrr: money(paused),
    /** Share of every client ever signed who has canceled or expired. */
    lifetimeChurnPct: everSigned ? Math.round((lost.length / everSigned) * 100) : 0,
  };
}

// ---------------------------------------------------------------------------
// Check-ins, client health and win-backs. Plain rules, easy to change here.
// ---------------------------------------------------------------------------

/** Days between check-ins. A client with several services uses the shortest. */
export const CHECK_IN_DAYS = { Ads: 14, SEO: 30, Website: 60, unknown: 30 } as const;
/** "Due soon" starts this many days before the due date. */
const DUE_SOON_DAYS = 5;

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function getCheckIn(c: RosterClient): CheckIn {
  const cadenceDays = Math.min(...(c.services.length ? c.services.map((s) => CHECK_IN_DAYS[s]) : [CHECK_IN_DAYS.unknown]));
  if (!c.lastContact) return { cadenceDays, state: "never_logged" };
  const due = addDays(c.lastContact, cadenceDays);
  const left = daysBetween(TODAY, due);
  return { cadenceDays, last: c.lastContact, due, state: due < TODAY ? "overdue" : left <= DUE_SOON_DAYS ? "due_soon" : "on_track" };
}

/** Health for active and paused clients (null for past clients). Starts at 100; each risk takes points off. */
export function getClientHealth(c: RosterClient): ClientHealth | null {
  if (c.status === "canceled" || c.status === "incomplete_expired") return null;
  const checkIn = getCheckIn(c);
  const factors: { label: string; impact: number }[] = [];
  if (c.status === "paused") factors.push({ label: "Paused: not paying right now", impact: -50 });
  if (checkIn.state === "overdue") factors.push({ label: `Check-in overdue (every ${checkIn.cadenceDays} days)`, impact: -25 });
  if (checkIn.state === "never_logged") factors.push({ label: "No check-in logged yet", impact: -10 });
  const months = monthsBetween(c.startDate, TODAY);
  if (months < 2) factors.push({ label: "New client: the first 2 months need extra care", impact: -10 });
  if (c.followUp) factors.push({ label: `Open follow-up: ${c.followUp}`, impact: -10 });
  if (c.check) factors.push({ label: "Record needs checking", impact: -5 });
  if (months >= 12) factors.push({ label: `Long-term client (${months} months)`, impact: 0 });
  factors.push({ label: "Lead results: not connected yet (Phase 3)", impact: 0 });
  const score = Math.max(0, 100 + factors.reduce((n, f) => n + f.impact, 0));
  return { score, level: score >= 75 ? "healthy" : score >= 50 ? "watch" : "at_risk", factors, checkIn };
}

/** Paused clients, biggest first, with a copy-only message to start the conversation. */
export function getWinBackList() {
  return roster()
    .clients.filter((c) => c.status === "paused")
    .sort((a, b) => b.monthlyUsd - a.monthlyUsd)
    .map((c) => {
      const first = c.name.split(/\s+/)[0] ?? c.name;
      const service = c.services[0] ?? "marketing";
      return {
        client: c,
        script: `Hi ${first}, it's been a little while since we paused your ${service} work, and I wanted to check in. How's business going right now? If it would help, I can put together a quick update on where things stand and a simple plan to pick back up. No pressure either way.`,
      };
    });
}

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------

export function getTeam(): { source: RosterSource; members: TeamMember[] } {
  const real = loadPrivateTeam();
  return real ? { source: "private_file", members: real } : { source: "demo", members: demoTeam };
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

export function getMissionControl(): MissionControlData {
  const s = getRosterSummary();
  const label = s.source === "private_file" ? "" : " (demo list)";
  const realAlerts: Alert[] = [];
  if (s.skipped > 0)
    realAlerts.push({ id: "al_skip", isSynthetic: false, href: "/safety", severity: "critical", title: `${s.skipped} client records couldn't be read`, detail: "Check the private client file. These were left out." });
  if (s.pausedCount > 0)
    realAlerts.push({ id: "al_paused", isSynthetic: false, href: "/clients#paused", severity: "warning", title: `${s.pausedCount} clients paused${label}`, detail: `$${s.pausedMrr.toLocaleString("en-US")}/mo on hold. Worth a check-in call to win them back.` });
  if (s.needsCheck > 0)
    realAlerts.push({ id: "al_check", isSynthetic: false, href: "/clients", severity: "info", title: `${s.needsCheck} client records need checking`, detail: "The two client lists disagreed on these. Confirm them once." });
  const recent = getRoster().filter((c) => c.status === "active" && daysBetween(c.startDate, TODAY) <= 21);
  if (recent.length > 0)
    realAlerts.push({ id: "al_new", isSynthetic: false, href: "/clients", severity: "info", title: `${recent.length} new clients in the last 3 weeks`, detail: "Make sure onboarding and first work orders are moving." });

  const realActivity: ActivityItem[] = getRoster()
    .filter((c) => c.status === "active")
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
    .slice(0, 4)
    .map((c) => ({
      id: `real_signed_${c.id}`,
      isSynthetic: false,
      href: `/clients/${c.id}`,
      kind: "client_signed" as const,
      title: `Signed: ${c.name} · $${c.monthlyUsd.toLocaleString("en-US")}/mo`,
      at: `${c.startDate}T12:00:00Z`,
    }));

  return {
    ...missionControl,
    alerts: [...realAlerts, ...missionControl.alerts],
    activity: [...realActivity, ...missionControl.activity].sort((a, b) => b.at.localeCompare(a.at)),
  };
}

// ---------------------------------------------------------------------------
// Client detection radar — simple, explainable rules for now. Later an AI may
// suggest items too, but only as cited suggestions a person reviews.
// ---------------------------------------------------------------------------

const clamp = (n: number) => Math.min(1, Math.max(0, n));

export function getDetections(): Detection[] {
  const clients = roster().clients;
  const real = roster().source === "private_file";
  const out: Detection[] = [];

  // Real list: owner's follow-up notes (amber).
  for (const c of clients.filter((x) => x.followUp && x.status !== "canceled")) {
    out.push({ id: `d_fu_${c.id}`, kind: "attention", title: `Follow up: ${c.name}`, why: c.followUp!, closeness: 0.85, confidence: 0.95, href: `/clients/${c.id}`, isSynthetic: !real });
  }
  // Real list: paused clients are money on hold (red).
  for (const c of clients.filter((x) => x.status === "paused")) {
    out.push({ id: `d_pause_${c.id}`, kind: "problem", title: `${c.name} is paused`, why: `$${c.monthlyUsd.toLocaleString("en-US")}/mo on hold. A check-in call could win them back.`, closeness: 0.7, confidence: 0.9, href: `/clients/${c.id}`, isSynthetic: !real });
  }
  // Real list: records the two lists disagreed on (amber, one blip).
  const toCheck = clients.filter((c) => c.check).length;
  if (toCheck > 0)
    out.push({ id: "d_check", kind: "attention", title: `${toCheck} client records need checking`, why: "Your two client lists disagreed on these. Confirm them once.", closeness: 0.35, confidence: 1, href: "/clients", isSynthetic: !real });
  // Real list: active clients under $150 with no SEO yet → SEO upsell (green).
  for (const c of clients.filter((x) => x.status === "active" && x.monthlyUsd < 150 && !x.services.includes("SEO"))) {
    const months = monthsBetween(c.startDate, TODAY);
    out.push({ id: `d_up_${c.id}`, kind: "opportunity", title: `SEO upsell: ${c.name}`, why: `Pays $${c.monthlyUsd.toLocaleString("en-US")}/mo; SEO plans start at $150. With you ${months} months, so trust is ${months >= 6 ? "built" : "still building"}.`, closeness: clamp(0.25 + months / 24), confidence: 0.45, href: `/clients/${c.id}`, isSynthetic: !real });
  }
  // Real list: SEO clients not running ads (green, one blip).
  const seoNoAds = clients.filter((c) => c.status === "active" && c.services.includes("SEO") && !c.services.includes("Ads")).length;
  if (seoNoAds > 0)
    out.push({ id: "d_ads", kind: "opportunity", title: `Ads upsell: ${seoNoAds} SEO clients`, why: "They already trust you with SEO and don't run ads with you yet.", closeness: 0.3, confidence: 0.35, href: "/clients", isSynthetic: !real });

  // Real list: health and check-ins.
  const live = clients.filter((c) => c.status === "active");
  for (const c of live) {
    const h = getClientHealth(c);
    if (h?.level === "at_risk")
      out.push({ id: `d_risk_${c.id}`, kind: "problem", title: `At risk: ${c.name}`, why: `Health ${h.score}/100. ${h.factors.filter((f) => f.impact < 0).map((f) => f.label).join(". ")}.`, closeness: 0.8, confidence: 0.7, href: `/clients/${c.id}`, isSynthetic: !real });
    if (h?.checkIn.state === "overdue")
      out.push({ id: `d_ci_${c.id}`, kind: "attention", title: `Check in: ${c.name}`, why: `Due ${h.checkIn.due}. Check in every ${h.checkIn.cadenceDays} days.`, closeness: 0.75, confidence: 0.9, href: `/clients/${c.id}`, isSynthetic: !real });
  }
  const neverLogged = live.filter((c) => !c.lastContact).length;
  if (neverLogged > 0)
    out.push({ id: "d_ci_unknown", kind: "attention", title: `${neverLogged} clients have no check-in logged`, why: "Log the last time you talked so reminders can start. Until the database is set up, tell Claude the dates.", closeness: 0.4, confidence: 0.9, href: "/clients#checkins", isSynthetic: !real });
  const onboarding = live.filter((c) => daysBetween(c.startDate, TODAY) <= 30).length;
  if (onboarding > 0)
    out.push({ id: "d_onboard", kind: "attention", title: `${onboarding} new clients in their first month`, why: "Make sure onboarding and the first work orders are moving.", closeness: 0.6, confidence: 0.7, href: "/clients", isSynthetic: !real });
  if (roster().skipped > 0)
    out.push({ id: "d_skip", kind: "problem", title: `${roster().skipped} client records couldn't be read`, why: "They were left out. Check the private client file.", closeness: 0.95, confidence: 1, href: "/safety", isSynthetic: false });

  // Sample work orders: urgent = red, overdue = amber.
  for (const w of workOrders.filter((x) => x.status !== "done")) {
    if (w.priority === "urgent")
      out.push({ id: `d_wo_${w.id}`, kind: "problem", title: w.title, why: `${w.clientLabel}. Urgent work order.`, closeness: 0.9, confidence: 0.8, href: `/work/${w.id}`, isSynthetic: true });
    else if (w.due < TODAY)
      out.push({ id: `d_wo_${w.id}`, kind: "attention", title: w.title, why: `${w.clientLabel}. Overdue work order.`, closeness: clamp(0.5 + daysBetween(w.due, TODAY) / 14), confidence: 0.75, href: `/work/${w.id}`, isSynthetic: true });
  }
  // Sample prospects graded A: green opportunities.
  for (const p of prospects.filter((x) => x.grade.letter === "A" && x.stage !== "won" && x.stage !== "lost")) {
    out.push({ id: `d_pr_${p.id}`, kind: "opportunity", title: `Hot prospect: ${p.name}`, why: `Grade A (${p.grade.score}/100). ${p.wants.join(" + ")}.`, closeness: p.grade.score / 100, confidence: 0.6, href: `/sales/${p.id}`, isSynthetic: true });
  }

  return out.sort((a, b) => b.closeness * b.confidence - a.closeness * a.confidence);
}

// ---------------------------------------------------------------------------
// Coaching: which buttons and tabs should glow because something is worth a look.
// Items "build up" quietly until an area reaches its minimum, then it glows.
// Raise a minimum to be notified less often. Later, smarter rules (or AI
// suggestions a person reviews) can feed the same shape.
// ---------------------------------------------------------------------------

export const COACH_RULES = {
  /** A radar blip is worth checking when closeness × confidence reaches this. */
  radarWorthScore: 0.45,
  /** How many items an area collects before it starts glowing. */
  minToNotify: { radar: 1, clients: 1, sales: 1, work: 1, leads: 1, chats: 1 },
} as const;

export interface CoachHint {
  count: number;
  /** Changes whenever the set of items changes; null = nothing to show. */
  signature: string | null;
  reason: string;
}

function hint(area: keyof typeof COACH_RULES.minToNotify, ids: string[], reason: string): CoachHint {
  const glow = ids.length >= COACH_RULES.minToNotify[area];
  return { count: ids.length, signature: glow ? fingerprint(ids) : null, reason };
}

export function getCoachHints() {
  const clients = roster().clients;
  const worth = getDetections().filter((d) => d.closeness * d.confidence >= COACH_RULES.radarWorthScore);
  const toWork = getProspectsToWork();
  const replies = conversations.filter((c) => c.needsReply);
  const work = workOrders.filter((w) => w.status !== "done" && (w.priority === "urgent" || w.due < TODAY));
  const clientItems = clients.filter((c) => {
    const h = getClientHealth(c);
    return c.check || (c.followUp && h) || h?.level === "at_risk" || h?.checkIn.state === "overdue";
  });
  return {
    radar: hint("radar", worth.map((d) => d.id), `${worth.length} worth checking`),
    leads: hint("leads", toWork.overdue.map((p) => p.id), `${toWork.overdue.length} overdue follow-ups`),
    chats: hint("chats", replies.map((c) => c.id), `${replies.length} need a reply`),
    tabs: {
      "/clients": hint("clients", clientItems.map((c) => c.id), "At-risk clients, check-ins and records to check"),
      "/sales": hint("sales", [...toWork.overdue.map((p) => p.id), ...replies.map((c) => c.id)], "Overdue follow-ups and replies"),
      "/work": hint("work", work.map((w) => w.id), "Urgent or overdue work orders"),
    } as Record<string, CoachHint>,
  };
}

// ---------------------------------------------------------------------------
// Agency sales (sample)
// ---------------------------------------------------------------------------

/** Best grade first. */
export function getProspects(): Prospect[] {
  return [...prospects].sort((a, b) => b.grade.score - a.grade.score);
}

export function getProspect(id: string): Prospect | undefined {
  return prospects.find((p) => p.id === id);
}

/** Open prospects someone should work today. */
export function getProspectsToWork() {
  const open = getProspects().filter((p) => p.stage !== "won" && p.stage !== "lost");
  const overdue = open.filter((p) => p.nextFollowUp !== undefined && p.nextFollowUp < TODAY);
  const dueToday = open.filter((p) => p.nextFollowUp === TODAY);
  const uncontacted = open.filter((p) => p.stage === "new");
  const all = open.filter((p) => (p.nextFollowUp !== undefined && p.nextFollowUp <= TODAY) || p.stage === "new");
  return { all, overdue, dueToday, uncontacted };
}

/** SAMPLE: how well the agency wins new clients. */
export function getAgencySalesKpis() {
  return agencySalesKpis;
}

/** Newest first. */
export function getConversations(): Conversation[] {
  return [...conversations].sort((a, b) => b.at.localeCompare(a.at));
}

// ---------------------------------------------------------------------------
// Work (sample work orders + your real rules)
// ---------------------------------------------------------------------------

const priorityRank = { urgent: 0, high: 1, normal: 2, low: 3 } as const;

/** Open work first, then by priority, then by due date. */
export function getWorkOrders(): WorkOrder[] {
  return [...workOrders].sort(
    (a, b) =>
      Number(a.status === "done") - Number(b.status === "done") ||
      priorityRank[a.priority] - priorityRank[b.priority] ||
      a.due.localeCompare(b.due),
  );
}

export function getWorkOrder(id: string): WorkOrder | undefined {
  return workOrders.find((w) => w.id === id);
}

export function getSampleDevelopers() {
  return sampleDevelopers.map((d) => {
    const load = developerLoads.find((l) => l.memberId === d.id);
    const mine = workOrders.filter((w) => w.assignee === d.id && w.status !== "done");
    return {
      ...d,
      load,
      openOrders: mine.length,
      overdue: mine.filter((w) => w.due < TODAY).length,
      untouchedToday: mine.filter((w) => w.lastTouched < TODAY).length,
    };
  });
}

export function getWorkRules() {
  return workRules;
}

// ---------------------------------------------------------------------------
// Growth Lab (sample case studies + real survey questions)
// ---------------------------------------------------------------------------

export function getBusinesses(): Business[] {
  return [...businesses].sort((a, b) => a.dexNumber - b.dexNumber);
}

export function getBusiness(id: string): Business | undefined {
  return businesses.find((b) => b.id === id);
}

export function getCaseStudyHistory(id: string): MonthlyPoint[] {
  return caseStudyHistory[id] ?? [];
}

export function getTrends(): Trend[] {
  return trends;
}

export function getSurveyQuestions(): SurveyQuestion[] {
  return surveyQuestions;
}

export function getSurveyResponses(businessId?: string): SurveyResponse[] {
  return businessId ? surveyResponses.filter((r) => r.businessId === businessId) : surveyResponses;
}

export function getInsights(): Insight[] {
  return insights;
}

/** Tags shared by two or more businesses, most common first. */
export function getPatterns(): { tag: string; businessIds: string[] }[] {
  const byTag = new Map<string, string[]>();
  for (const b of businesses) {
    for (const tag of b.patternTags) byTag.set(tag, [...(byTag.get(tag) ?? []), b.id]);
  }
  return [...byTag.entries()]
    .filter(([, ids]) => ids.length >= 2)
    .map(([tag, businessIds]) => ({ tag, businessIds }))
    .sort((a, b) => b.businessIds.length - a.businessIds.length || a.tag.localeCompare(b.tag));
}

export function getSafetyStatus(): SafetyStatus {
  return safetyStatus;
}

export function getToday(): string {
  return TODAY;
}
