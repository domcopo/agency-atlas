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
import { isGhlConfigured } from "@/lib/ghl/client";
import { loadPrivateRoster, loadPrivateTeam, parseRoster } from "@/lib/private-data";
import { createDatabaseClient, getCurrentMember, getTwoFactorState, isDatabaseConfigured } from "@/lib/supabase/server";
import { cache } from "react";
import type {
  AtlasQuestion,
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
  CheckInEntry,
  CheckInMood,
  ClientHealth,
  Detection,
  RosterClient,
  RosterSource,
  RosterSummary,
  SafetyStatus,
  GhlSummary,
  SubscriptionStatus,
  SurveyQuestion,
  SurveyResponse,
  TeamMember,
  Trend,
  WorkOrder,
} from "@/lib/types";

/** GoHighLevel: still not connected (Phase 3). */
export const DATA_MODE: DataMode = "mock";

/** True when Supabase settings are present: sign-in required, data from the database. */
export function usesDatabase(): boolean {
  return isDatabaseConfigured();
}

/** Today's date. Real date with the database; a fixed date for the sample/demo data. */
function today(): string {
  if (!usesDatabase()) return missionControl.today;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The signed-in team member (once per request), or null. */
export const getMember = cache(getCurrentMember);

/** Whether the signed-in person has an authenticator app set up. */
export const getTwoFactorStatus = cache(getTwoFactorState);

// ---------------------------------------------------------------------------
// Client roster
// ---------------------------------------------------------------------------

type Roster = { source: RosterSource; clients: RosterClient[]; skipped: number };

function loadLocalRoster(): Roster {
  const real = loadPrivateRoster();
  if (real) return { source: "private_file", ...real };
  // The fictional roster goes through the same checks as the real one.
  const demo = parseRoster(demoRosterRaw) ?? { clients: [], skipped: 0 };
  return { source: "demo", ...demo };
}

const MOODS: CheckInMood[] = ["better", "same", "worse"];
const asMood = (v: unknown): CheckInMood | null => (MOODS.includes(v as CheckInMood) ? (v as CheckInMood) : null);

type DbClient = Awaited<ReturnType<typeof createDatabaseClient>>;

/** All check-ins, newest first. Works before and after the 0004 "mood" column exists. */
async function readCheckIns(db: DbClient): Promise<{ client_id: string; happened_on: string; note: string | null; mood: CheckInMood | null }[]> {
  const order = { ascending: false } as const;
  const withMood = await db.from("check_ins").select("client_id, happened_on, note, mood").order("happened_on", order).order("created_at", order);
  if (!withMood.error) return (withMood.data ?? []).map((r) => ({ ...r, mood: asMood(r.mood) }));
  const plain = await db.from("check_ins").select("client_id, happened_on, note").order("happened_on", order).order("created_at", order);
  return (plain.data ?? []).map((r) => ({ ...r, mood: null }));
}

/** The latest check-ins for one client (database mode only). */
export async function getCheckInHistory(clientDbId: string | undefined, limit = 6): Promise<CheckInEntry[]> {
  if (!usesDatabase() || !clientDbId || !/^[0-9a-f-]{36}$/.test(clientDbId)) return [];
  const db = await createDatabaseClient();
  return (await readCheckIns(db))
    .filter((r) => r.client_id === clientDbId)
    .slice(0, limit)
    .map((r) => ({ date: r.happened_on, note: r.note, mood: r.mood }));
}

/** Reads clients as the signed-in person. Row-level security decides what comes back. */
async function loadDatabaseRoster(): Promise<Roster> {
  const db = await createDatabaseClient();
  const [clients, checkIns] = await Promise.all([
    db.from("clients").select("id, slug, name, monthly_usd, start_date, status, services, listed_in, check_note, follow_up, end_date"),
    readCheckIns(db),
  ]);
  if (clients.error || !clients.data) return { source: "database", clients: [], skipped: 0 };
  const lastContact = new Map<string, string>();
  const lastMood = new Map<string, { mood: CheckInMood; date: string }>();
  for (const c of checkIns) {
    if (!lastContact.has(c.client_id)) lastContact.set(c.client_id, c.happened_on);
    if (c.mood && !lastMood.has(c.client_id)) lastMood.set(c.client_id, { mood: c.mood, date: c.happened_on });
  }
  return {
    source: "database",
    skipped: 0,
    clients: clients.data.map((r) => ({
      id: r.slug,
      dbId: r.id,
      name: r.name,
      monthlyUsd: Number(r.monthly_usd),
      startDate: r.start_date,
      status: r.status as SubscriptionStatus,
      listedIn: r.listed_in ?? [],
      check: r.check_note ?? undefined,
      followUp: r.follow_up ?? undefined,
      endDate: r.end_date ?? undefined,
      lastContact: lastContact.get(r.id),
      lastMood: lastMood.get(r.id),
      services: (r.services ?? []) as RosterClient["services"],
    })),
  };
}

let localCache: Roster | null = null;
/** Once per request in database mode; once per server start for the local file. */
const roster = cache(async (): Promise<Roster> => {
  if (usesDatabase()) return loadDatabaseRoster();
  localCache ??= loadLocalRoster();
  return localCache;
});

export async function getRosterSource(): Promise<RosterSource> {
  return (await roster()).source;
}

const statusOrder: Record<SubscriptionStatus, number> = { active: 0, paused: 1, canceled: 2, incomplete_expired: 3 };

/** Active first, then by monthly amount (highest first). */
export async function getRoster(): Promise<RosterClient[]> {
  return [...(await roster()).clients].sort(
    (a, b) => statusOrder[a.status] - statusOrder[b.status] || b.monthlyUsd - a.monthlyUsd || a.name.localeCompare(b.name),
  );
}

export async function getRosterClient(id: string): Promise<RosterClient | undefined> {
  return (await roster()).clients.find((c) => c.id === id);
}

export function tierOf(monthlyUsd: number): ClientTier {
  if (monthlyUsd >= 500) return "high";
  if (monthlyUsd >= 150) return "mid";
  return "low";
}

export async function getRosterSummary(): Promise<RosterSummary> {
  const { clients, source, skipped } = await roster();
  const sum = (xs: RosterClient[]) => Math.round(xs.reduce((n, c) => n + c.monthlyUsd, 0) * 100) / 100;
  const by = (s: SubscriptionStatus) => clients.filter((c) => c.status === s);
  const active = by("active");
  const tiers = { high: { count: 0, mrr: 0 }, mid: { count: 0, mrr: 0 }, low: { count: 0, mrr: 0 } };
  for (const c of active) {
    const t = tiers[tierOf(c.monthlyUsd)];
    t.count++;
    t.mrr = Math.round((t.mrr + c.monthlyUsd) * 100) / 100;
  }
  const months = active.map((c) => monthsBetween(c.startDate, today()));
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
export async function getSignupsByMonth(count = 6): Promise<{ month: string; signed: number; mrrAdded: number }[]> {
  const [y, m] = today().split("-").map(Number) as [number, number];
  const out: { month: string; signed: number; mrrAdded: number }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const key = d.toISOString().slice(0, 7);
    const signed = (await roster()).clients.filter((c) => c.startDate.startsWith(key));
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
export async function getWinLoss(count = 6) {
  const clients = (await roster()).clients;
  const isLost = (c: RosterClient) => c.status === "canceled" || c.status === "incomplete_expired";
  const lost = clients.filter(isLost);
  const money = (xs: RosterClient[]) => Math.round(xs.reduce((n, c) => n + c.monthlyUsd, 0) * 100) / 100;
  const months: WinLossMonth[] = (await getSignupsByMonth(count)).map((m) => {
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
  const left = daysBetween(today(), due);
  return { cadenceDays, last: c.lastContact, due, state: due < today() ? "overdue" : left <= DUE_SOON_DAYS ? "due_soon" : "on_track" };
}

/** Health for active and paused clients (null for past clients). Starts at 100; each risk takes points off. */
export function getClientHealth(c: RosterClient): ClientHealth | null {
  if (c.status === "canceled" || c.status === "incomplete_expired") return null;
  const checkIn = getCheckIn(c);
  const factors: { label: string; impact: number }[] = [];
  if (c.status === "paused") factors.push({ label: "Paused: not paying right now", impact: -50 });
  if (checkIn.state === "overdue") factors.push({ label: `Check-in overdue (every ${checkIn.cadenceDays} days)`, impact: -25 });
  if (checkIn.state === "never_logged") factors.push({ label: "No check-in logged yet", impact: -10 });
  const months = monthsBetween(c.startDate, today());
  if (months < 2) factors.push({ label: "New client: the first 2 months need extra care", impact: -10 });
  if (c.followUp) factors.push({ label: `Open follow-up: ${c.followUp}`, impact: -10 });
  if (c.check) factors.push({ label: "Record needs checking", impact: -5 });
  if (c.lastMood?.mood === "worse") factors.push({ label: `Last check-in (${c.lastMood.date}): things got worse`, impact: -20 });
  if (c.lastMood?.mood === "better") factors.push({ label: `Last check-in (${c.lastMood.date}): things are getting better`, impact: 10 });
  if (c.lastMood?.mood === "same") factors.push({ label: `Last check-in (${c.lastMood.date}): holding steady`, impact: 0 });
  if (months >= 12) factors.push({ label: `Long-term client (${months} months)`, impact: 0 });
  factors.push({ label: "Lead results: not connected yet (client sub-accounts come later)", impact: 0 });
  const score = Math.min(100, Math.max(0, 100 + factors.reduce((n, f) => n + f.impact, 0)));
  return { score, level: score >= 75 ? "healthy" : score >= 50 ? "watch" : "at_risk", factors, checkIn };
}

/** Paused clients, biggest first, with a copy-only message to start the conversation. */
export async function getWinBackList() {
  return (await roster())
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

export async function getTeam(): Promise<{ source: RosterSource; members: TeamMember[] }> {
  if (usesDatabase()) {
    const db = await createDatabaseClient();
    const { data } = await db.from("staff").select("id, name, role, handles").order("created_at");
    const members = (data ?? []).map((m) => ({ id: m.id, name: m.name, role: m.role as TeamMember["role"], handles: m.handles ?? [] }));
    return { source: "database", members };
  }
  const real = loadPrivateTeam();
  return real ? { source: "private_file", members: real } : { source: "demo", members: demoTeam };
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

export async function getMissionControl(): Promise<MissionControlData> {
  const s = await getRosterSummary();
  const label = s.source !== "demo" ? "" : " (demo list)";
  const realAlerts: Alert[] = [];
  if (s.skipped > 0)
    realAlerts.push({ id: "al_skip", isSynthetic: false, href: "/safety", severity: "critical", title: `${s.skipped} client records couldn't be read`, detail: "Check the private client file. These were left out." });
  if (s.pausedCount > 0)
    realAlerts.push({ id: "al_paused", isSynthetic: false, href: "/clients#paused", severity: "warning", title: `${s.pausedCount} clients paused${label}`, detail: `$${s.pausedMrr.toLocaleString("en-US")}/mo on hold. Worth a check-in call to win them back.` });
  if (s.needsCheck > 0)
    realAlerts.push({ id: "al_check", isSynthetic: false, href: "/clients", severity: "info", title: `${s.needsCheck} client records need checking`, detail: "The two client lists disagreed on these. Confirm them once." });
  const recent = (await getRoster()).filter((c) => c.status === "active" && daysBetween(c.startDate, today()) <= 21);
  if (recent.length > 0)
    realAlerts.push({ id: "al_new", isSynthetic: false, href: "/clients", severity: "info", title: `${recent.length} new clients in the last 3 weeks`, detail: "Make sure onboarding and first work orders are moving." });

  const realActivity: ActivityItem[] = (await getRoster())
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
    today: today(),
    alerts: [...realAlerts, ...missionControl.alerts],
    activity: [...realActivity, ...missionControl.activity].sort((a, b) => b.at.localeCompare(a.at)),
  };
}

// ---------------------------------------------------------------------------
// Client detection radar — simple, explainable rules for now. Later an AI may
// suggest items too, but only as cited suggestions a person reviews.
// ---------------------------------------------------------------------------

const clamp = (n: number) => Math.min(1, Math.max(0, n));

export async function getDetections(): Promise<Detection[]> {
  const clients = (await roster()).clients;
  const real = (await roster()).source !== "demo";
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
    const months = monthsBetween(c.startDate, today());
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
    out.push({ id: "d_ci_unknown", kind: "attention", title: `${neverLogged} clients have no check-in logged`, why: "Log the last time you talked so reminders can start. Open a client, or answer Atlas asks.", closeness: 0.4, confidence: 0.9, href: "/clients#checkins", isSynthetic: !real });
  const onboarding = live.filter((c) => daysBetween(c.startDate, today()) <= 30).length;
  if (onboarding > 0)
    out.push({ id: "d_onboard", kind: "attention", title: `${onboarding} new clients in their first month`, why: "Make sure onboarding and the first work orders are moving.", closeness: 0.6, confidence: 0.7, href: "/clients", isSynthetic: !real });
  if ((await roster()).skipped > 0)
    out.push({ id: "d_skip", kind: "problem", title: `${(await roster()).skipped} client records couldn't be read`, why: "They were left out. Check the private client file.", closeness: 0.95, confidence: 1, href: "/safety", isSynthetic: false });

  // Sample work orders: urgent = red, overdue = amber.
  for (const w of workOrders.filter((x) => x.status !== "done")) {
    if (w.priority === "urgent")
      out.push({ id: `d_wo_${w.id}`, kind: "problem", title: w.title, why: `${w.clientLabel}. Urgent work order.`, closeness: 0.9, confidence: 0.8, href: `/work/${w.id}`, isSynthetic: true });
    else if (w.due < today())
      out.push({ id: `d_wo_${w.id}`, kind: "attention", title: w.title, why: `${w.clientLabel}. Overdue work order.`, closeness: clamp(0.5 + daysBetween(w.due, today()) / 14), confidence: 0.75, href: `/work/${w.id}`, isSynthetic: true });
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

export async function getCoachHints() {
  const clients = (await roster()).clients;
  const worth = (await getDetections()).filter((d) => d.closeness * d.confidence >= COACH_RULES.radarWorthScore);
  const toWork = getProspectsToWork();
  const replies = conversations.filter((c) => c.needsReply);
  const work = workOrders.filter((w) => w.status !== "done" && (w.priority === "urgent" || w.due < today()));
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
// Atlas asks (database mode only). Rules pick the most useful gaps to fill.
// Skipped questions come back after 14 days; "later" after 3 days.
// ---------------------------------------------------------------------------

export async function getAtlasQuestions(limit = 3): Promise<AtlasQuestion[]> {
  if (!usesDatabase()) return [];
  const me = await getMember();
  if (!me || me.role === "developer") return [];
  const { clients } = await roster();
  const db = await createDatabaseClient();
  const { data: history } = await db
    .from("atlas_answers")
    .select("question_key, status, created_at")
    .order("created_at", { ascending: false })
    .limit(1000);
  const latest = new Map<string, { status: string; day: string }>();
  for (const h of history ?? []) if (!latest.has(h.question_key)) latest.set(h.question_key, { status: h.status, day: h.created_at.slice(0, 10) });
  const hidden = (key: string) => {
    const h = latest.get(key);
    if (!h) return false;
    if (h.status === "answered") return true;
    return daysBetween(h.day, today()) < (h.status === "skipped" ? 14 : 3);
  };

  const byValue = [...clients].sort((a, b) => b.monthlyUsd - a.monthlyUsd);
  const base = (c: RosterClient) => ({ clientDbId: c.dbId ?? "", clientSlug: c.id, clientName: c.name, services: c.services });
  const out: AtlasQuestion[] = [];
  const current = (c: RosterClient) => c.status === "active" || c.status === "paused";

  for (const c of byValue.filter((x) => current(x) && x.services.length === 1 && x.services[0] === "Ads" && x.monthlyUsd >= 150))
    out.push({ ...base(c), key: `also_seo:${c.dbId}`, type: "also_seo", prompt: `Does ${c.name} also get SEO, or only Ads?`, why: "Sets their check-in rhythm and upsell suggestions." });
  for (const c of byValue.filter((x) => x.status === "active" && !x.lastContact))
    out.push({ ...base(c), key: `last_contact:${c.dbId}`, type: "last_contact", prompt: `When did you last talk to ${c.name}?`, why: "Starts their check-in reminders." });
  for (const c of byValue.filter((x) => (x.status === "canceled" || x.status === "incomplete_expired") && !x.endDate))
    out.push({ ...base(c), key: `end_date:${c.dbId}`, type: "end_date", prompt: `When did ${c.name} cancel?`, why: "Fills in your clients-lost chart." });
  for (const c of byValue.filter((x) => current(x) && x.services.length === 0))
    out.push({ ...base(c), key: `services:${c.dbId}`, type: "services", prompt: `What does ${c.name} buy from you?`, why: "Sets their check-in rhythm and upsell suggestions." });
  for (const c of byValue.filter((x) => x.check))
    out.push({ ...base(c), key: `check:${c.dbId}`, type: "check", prompt: `Is ${c.name}'s record right?`, why: "Your two client lists disagreed.", note: c.check });

  // Managers can log check-ins but can't edit client records.
  const allowed = me.role === "owner" ? out : out.filter((q) => q.type === "last_contact");
  // Mix question types so one session isn't all the same kind.
  const mixed: AtlasQuestion[] = [];
  const pools = new Map<string, AtlasQuestion[]>();
  for (const q of allowed.filter((q) => q.clientDbId && !hidden(q.key))) pools.set(q.type, [...(pools.get(q.type) ?? []), q]);
  while (mixed.length < limit && [...pools.values()].some((p) => p.length)) {
    for (const p of pools.values()) if (p.length && mixed.length < limit) mixed.push(p.shift()!);
  }
  return mixed;
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
  const overdue = open.filter((p) => p.nextFollowUp !== undefined && p.nextFollowUp < today());
  const dueToday = open.filter((p) => p.nextFollowUp === today());
  const uncontacted = open.filter((p) => p.stage === "new");
  const all = open.filter((p) => (p.nextFollowUp !== undefined && p.nextFollowUp <= today()) || p.stage === "new");
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
      overdue: mine.filter((w) => w.due < today()).length,
      untouchedToday: mine.filter((w) => w.lastTouched < today()).length,
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
  return today();
}

// ---------------------------------------------------------------------------
// GoHighLevel (read-only copies, Phase 3)
// ---------------------------------------------------------------------------

const emptyGhl = (configured: boolean, tablesReady: boolean): GhlSummary => ({
  configured,
  tablesReady,
  lastSync: null,
  open: { count: 0, value: 0 },
  byStage: [],
  wonThisMonth: { count: 0, value: 0 },
  lostThisMonth: 0,
  newThisMonth: 0,
  upcoming7: 0,
  showed30: 0,
  noShows30: 0,
});

/** Summary of the synced GHL copies. Read as the signed-in person (security rules apply). */
export const getGhlSummary = cache(async (now: Date = new Date()): Promise<GhlSummary> => {
  const configured = isGhlConfigured();
  if (!usesDatabase()) return emptyGhl(configured, false);
  const db = await createDatabaseClient();
  const [syncs, opps, appts] = await Promise.all([
    db.from("ghl_syncs").select("ran_at, location_name, opportunities, appointments").order("ran_at", { ascending: false }).limit(1),
    db.from("ghl_opportunities").select("status, stage_name, monetary_value, ghl_created_at, status_changed_at").limit(5000),
    db.from("ghl_appointments").select("status, starts_at").limit(5000),
  ]);
  if (syncs.error) return emptyGhl(configured, false); // tables not created yet
  const s = emptyGhl(configured, true);
  const last = syncs.data?.[0];
  if (last) s.lastSync = { ranAt: last.ran_at, locationName: last.location_name, opportunities: last.opportunities, appointments: last.appointments };

  const monthStart = `${today().slice(0, 7)}-01`;
  const stages = new Map<string, { count: number; value: number }>();
  for (const o of opps.data ?? []) {
    const value = Number(o.monetary_value ?? 0);
    if (o.status === "open") {
      s.open.count++;
      s.open.value += value;
      const key = o.stage_name ?? "No stage";
      const st = stages.get(key) ?? { count: 0, value: 0 };
      st.count++;
      st.value += value;
      stages.set(key, st);
    }
    const changed = (o.status_changed_at ?? "").slice(0, 10);
    if (o.status === "won" && changed >= monthStart) {
      s.wonThisMonth.count++;
      s.wonThisMonth.value += value;
    }
    if (o.status === "lost" && changed >= monthStart) s.lostThisMonth++;
    if ((o.ghl_created_at ?? "").slice(0, 10) >= monthStart) s.newThisMonth++;
  }
  s.byStage = [...stages.entries()].map(([stage, v]) => ({ stage, ...v })).sort((a, b) => b.count - a.count).slice(0, 6);

  const t = now.getTime();
  const day = 24 * 60 * 60 * 1000;
  for (const a of appts.data ?? []) {
    const at = a.starts_at ? Date.parse(a.starts_at) : NaN;
    if (Number.isNaN(at)) continue;
    const status = (a.status ?? "").toLowerCase();
    if (at >= t && at <= t + 7 * day && status !== "cancelled" && status !== "invalid") s.upcoming7++;
    if (at < t && at >= t - 30 * day) {
      if (status === "showed") s.showed30++;
      if (status === "noshow") s.noShows30++;
    }
  }
  return s;
});

// ---------------------------------------------------------------------------
// Service groups (Clients tab: SEO · Ads · Website)
// ---------------------------------------------------------------------------

export const SERVICE_GROUPS = [
  { slug: "seo", service: "SEO", title: "SEO clients" },
  { slug: "ads", service: "Ads", title: "Ads clients" },
  { slug: "website", service: "Website", title: "Website clients" },
  { slug: "none", service: null, title: "Service not set" },
] as const;
export type ServiceGroupSlug = (typeof SERVICE_GROUPS)[number]["slug"];

/** Current clients (active or paused) in one service group. Clients with two services appear in both. */
export async function getServiceGroup(slug: string) {
  const group = SERVICE_GROUPS.find((g) => g.slug === slug);
  if (!group) return null;
  const clients = (await roster()).clients.filter(
    (c) => (c.status === "active" || c.status === "paused") && (group.service ? c.services.includes(group.service) : c.services.length === 0),
  );
  const active = clients.filter((c) => c.status === "active");
  return {
    ...group,
    clients,
    activeCount: active.length,
    pausedCount: clients.length - active.length,
    activeMrr: active.reduce((n, c) => n + c.monthlyUsd, 0),
  };
}

export async function getServiceGroups() {
  return Promise.all(SERVICE_GROUPS.map(async (g) => (await getServiceGroup(g.slug))!));
}
