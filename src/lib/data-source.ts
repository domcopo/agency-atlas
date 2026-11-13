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
import type { OwnerSummaryInput } from "@/lib/owner-summary";
import { buildRecentRuns, isAiFeature, RECENT_RUNS_DAYS, RECENT_RUNS_MAX, type RunLogRow } from "@/lib/bot-runs";
import type { KitDoc, KitTool, KitVersion, TeamTool } from "@/lib/kit";
import {
  buildPriorities,
  developerClientScope,
  developerWorkScope,
  healthScore,
  healthSummary,
  isSalesStage,
  kindLabel,
  opportunities,
  ownershipGaps,
  riskAlerts,
  scoreTrend,
  statusNote,
  type ClientContactDates,
} from "@/lib/ops";
import { canPreview, PREVIEW_COOKIE, previewTarget } from "@/lib/preview";
import { needsAttentionCount, type HistoryEntry } from "@/lib/work-orders";
import { chooseHomeLayout, HOME_LAYOUT_COOKIE, type HomeLayout, type SalesAppointment } from "@/lib/home-layouts";
import { AI_MODEL, budgetState, monthStartIso } from "@/lib/ai/budget";
import { isAiConfigured } from "@/lib/ai/client";
import { isGhlBillingConfigured, isGhlConfigured } from "@/lib/ghl/client";
import { billingState, billingTotals, clientBilling, paymentAlerts, planVsCollected, unmatchedGroups, type BillingRecord, type BillingState, type BillingSync, type BillingTotals, type ClientBilling, type PaymentAlert } from "@/lib/billing";
import { loadPrivateRoster, loadPrivateTeam, parseRoster } from "@/lib/private-data";
import { createDatabaseClient, getCurrentMember, getTwoFactorState, isDatabaseConfigured } from "@/lib/supabase/server";
import { cookies } from "next/headers";
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
  ClientAction,
  ClientHealth,
  ContactKind,
  GhlContactTimes,
  HealthSummary,
  OpsBriefing,
  PriorityItem,
  Detection,
  RosterClient,
  RosterSource,
  RosterSummary,
  SafetyStatus,
  GhlSummary,
  AiStatus,
  Briefing,
  ClientProfile,
  SubscriptionStatus,
  SurveyQuestion,
  SurveyResponse,
  TeamMember,
  Trend,
  WorkOrder,
  WorkOrderDrafts,
} from "@/lib/types";

/** GoHighLevel: still not connected (Phase 3). */
export const DATA_MODE: DataMode = "mock";

/** True when Supabase settings are present: sign-in required, data from the database. */
export function usesDatabase(): boolean {
  return isDatabaseConfigured();
}

/**
 * Sample (made-up) records are only for the demo, when no database is connected.
 * Once your real database is connected, every sample getter below returns nothing,
 * so screens show real data or say plainly that something isn't connected yet.
 */
export function showsSamples(): boolean {
  return !usesDatabase();
}

/** Today's date. Real date with the database; a fixed date for the sample/demo data. */
function today(): string {
  if (!usesDatabase()) return missionControl.today;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The signed-in team member (once per request), or null. */
export const getMember = cache(getCurrentMember);

/**
 * "Preview as developer": the team member the owner or a manager is previewing, or null.
 * Re-checked on every request: owner/manager only, and the person must exist. The cookie
 * only ever shows LESS; it never grants anything (src/lib/preview.ts).
 */
export const getPreview = cache(async (): Promise<{ staffId: string; name: string } | null> => {
  if (!usesDatabase()) return null;
  const me = await getMember();
  if (!me || !canPreview(me.role)) return null;
  const target = previewTarget((await cookies()).get(PREVIEW_COOKIE)?.value);
  if (!target) return null;
  const person = (await getTeam()).members.find((m) => m.id === target);
  return person ? { staffId: person.id, name: person.name } : null;
});

/** Who the developer screens are for: a signed-in developer, or the person being previewed. null = not a developer view. */
export interface DeveloperViewer {
  staffId: string | null;
  name: string;
  preview: boolean;
}
export const getDeveloperViewer = cache(async (): Promise<DeveloperViewer | null> => {
  if (!usesDatabase()) return null;
  const me = await getMember();
  if (!me) return null;
  if (me.role === "developer") return { staffId: me.staffId, name: me.name, preview: false };
  const p = await getPreview();
  return p ? { staffId: p.staffId, name: p.name, preview: true } : null;
});

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

const KINDS: ContactKind[] = ["check_in", "call", "message", "email", "meeting", "note"];
const asKind = (v: unknown): ContactKind => (KINDS.includes(v as ContactKind) ? (v as ContactKind) : "check_in");

type CheckInRow = { client_id: string; happened_on: string; note: string | null; mood: CheckInMood | null; kind: ContactKind };

/** All check-ins, newest first. Works before and after the 0004 "mood" and 0006 "kind" columns exist. */
const readCheckIns = cache(async (db: DbClient): Promise<CheckInRow[]> => {
  const order = { ascending: false } as const;
  const full = await db.from("check_ins").select("client_id, happened_on, note, mood, kind").order("happened_on", order).order("created_at", order);
  if (!full.error) return (full.data ?? []).map((r) => ({ ...r, mood: asMood(r.mood), kind: asKind(r.kind) }));
  const withMood = await db.from("check_ins").select("client_id, happened_on, note, mood").order("happened_on", order).order("created_at", order);
  if (!withMood.error) return (withMood.data ?? []).map((r) => ({ ...r, mood: asMood(r.mood), kind: "check_in" as const }));
  const plain = await db.from("check_ins").select("client_id, happened_on, note").order("happened_on", order).order("created_at", order);
  return (plain.data ?? []).map((r) => ({ ...r, mood: null, kind: "check_in" as const }));
});

/** The latest check-ins for one client (database mode only). */
export async function getCheckInHistory(clientDbId: string | undefined, limit = 6): Promise<CheckInEntry[]> {
  if (!usesDatabase() || !clientDbId || !/^[0-9a-f-]{36}$/.test(clientDbId)) return [];
  const db = await createDatabaseClient();
  return (await readCheckIns(db))
    .filter((r) => r.client_id === clientDbId)
    .slice(0, limit)
    .map((r) => ({ date: r.happened_on, note: r.note, mood: r.mood, kind: r.kind }));
}

/**
 * Trash (0019): ids of trashed clients and trashed items. Everything in Atlas leaves these
 * out; only the Trash screen shows them. Empty (ready=false) before 0019 is run.
 */
export const getTrashedIds = cache(async (): Promise<{ ready: boolean; clients: Set<string>; actions: Set<string> }> => {
  const none = { ready: false, clients: new Set<string>(), actions: new Set<string>() };
  if (!usesDatabase()) return none;
  const db = await createDatabaseClient();
  const [c, a] = await Promise.all([
    db.from("clients").select("id").not("trashed_at", "is", null).limit(5000),
    db.from("actions").select("id").not("trashed_at", "is", null).limit(5000),
  ]);
  if (c.error || a.error) return none;
  return { ready: true, clients: new Set((c.data ?? []).map((r) => r.id as string)), actions: new Set((a.data ?? []).map((r) => r.id as string)) };
});

/** Reads clients as the signed-in person. Row-level security decides what comes back. */
async function loadDatabaseRoster(): Promise<Roster> {
  const db = await createDatabaseClient();
  const cols = "id, slug, name, monthly_usd, start_date, status, services, listed_in, check_note, follow_up, end_date";
  const [withOwner, checkIns, staff, ghlTimes, trashed] = await Promise.all([
    db.from("clients").select(`${cols}, owner_staff_id`),
    readCheckIns(db),
    db.from("staff").select("id, name"),
    // Call/message times from GoHighLevel (0008). Missing table = none yet.
    db
      .from("ghl_contact_stats")
      .select("client_id, last_inbound_at, last_outbound_at, last_call_at, last_call_seconds, last_channel, last_direction, unanswered_outbound, synced_at"),
    getTrashedIds(),
  ]);
  const timesByClient = new Map(
    (ghlTimes.error ? [] : (ghlTimes.data ?? [])).map((t) => [
      t.client_id as string,
      {
        lastInboundAt: t.last_inbound_at,
        lastOutboundAt: t.last_outbound_at,
        lastCallAt: t.last_call_at,
        lastCallSeconds: t.last_call_seconds,
        lastChannel: t.last_channel,
        lastDirection: t.last_direction,
        unansweredOutbound: Number(t.unanswered_outbound ?? 0),
        syncedAt: t.synced_at,
      } as GhlContactTimes,
    ]),
  );
  /** Newest of: a logged contact, or a GoHighLevel call/message either way. */
  const newest = (logged: string | undefined, t: GhlContactTimes | undefined) =>
    [logged, t?.lastInboundAt?.slice(0, 10), t?.lastOutboundAt?.slice(0, 10)].filter((d): d is string => Boolean(d)).sort().pop();
  // Before 0006 there is no owner column: read without it.
  const clients = withOwner.error
    ? await db.from("clients").select(cols).then((r) => ({ ...r, data: r.data?.map((c) => ({ ...c, owner_staff_id: null as string | null })) ?? null }))
    : withOwner;
  const staffName = new Map((staff.data ?? []).map((m) => [m.id as string, m.name as string]));
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
    // Trashed clients (0019) are left out of everything.
    clients: clients.data.filter((r) => !trashed.clients.has(r.id)).map((r) => ({
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
      lastContact: newest(lastContact.get(r.id), timesByClient.get(r.id)),
      lastLogged: lastContact.get(r.id),
      ghl: timesByClient.get(r.id),
      lastMood: lastMood.get(r.id),
      ownerId: r.owner_staff_id ?? undefined,
      ownerName: r.owner_staff_id ? staffName.get(r.owner_staff_id) : undefined,
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
/** The 0–100 score (rules in ops.ts). Pass the open actions so issues and overdue items count. */
export function getClientHealth(c: RosterClient, actions: ClientAction[] = []): ClientHealth | null {
  return healthScore(c, getCheckIn(c), actions, today());
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

export const getTeam = cache(async (): Promise<{ source: RosterSource; members: TeamMember[] }> => {
  if (usesDatabase()) {
    const db = await createDatabaseClient();
    const { data } = await db.from("staff").select("id, name, role, handles").order("created_at");
    const members = (data ?? []).map((m) => ({ id: m.id, name: m.name, role: m.role as TeamMember["role"], handles: m.handles ?? [] }));
    return { source: "database", members };
  }
  const real = loadPrivateTeam();
  return real ? { source: "private_file", members: real } : { source: "demo", members: demoTeam };
});

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

  const samples = showsSamples();
  return {
    ...missionControl,
    today: today(),
    clientResults: samples ? missionControl.clientResults : [],
    followUps: samples ? missionControl.followUps : [],
    alerts: [...realAlerts, ...(samples ? missionControl.alerts : [])],
    activity: [...realActivity, ...(samples ? missionControl.activity : [])].sort((a, b) => b.at.localeCompare(a.at)),
  };
}

// ---------------------------------------------------------------------------
// Owners, next actions and issues (0006). Rules live in src/lib/ops.ts.
// ---------------------------------------------------------------------------

const ACTION_COLS = "id, client_id, lead_ghl_id, kind, title, notes, owner_staff_id, priority, status, due_on, done_at, created_at";
const PROMISE_COLS = "blocked_reason, promised_on"; // 0009
const ORDER_COLS = "steps, source_link, source_note, est_minutes, ai_suggested"; // 0010
const REVIEW_COLS = "submitted_at, sent_back_count, review_note"; // 0011
const CANCEL_COLS = "canceled_at, cancel_note"; // 0013
const STEPS_DONE_COL = "steps_done"; // 0016
const V2_COLS = "start_on, actual_minutes, links, reassign_reason, reassign_requested_at"; // 0017 (also in my_work)

/** Item kind from the database (unknown values read as follow-ups). */
const asActionKind = (v: unknown): ClientAction["kind"] => (v === "issue" || v === "work_order" ? v : "follow_up");
/** Work order details shared by the owner/manager list and the developer view. */
function orderDetails(r: Record<string, unknown>) {
  const est = Number(r.est_minutes);
  return {
    steps: typeof r.steps === "string" && r.steps.trim() ? r.steps : null,
    sourceLink: typeof r.source_link === "string" && r.source_link.startsWith("https://") ? r.source_link : null,
    sourceNote: typeof r.source_note === "string" && r.source_note ? r.source_note : null,
    estMinutes: Number.isFinite(est) && est > 0 ? est : null,
    aiSuggested: r.ai_suggested === true,
    submittedAt: typeof r.submitted_at === "string" ? r.submitted_at : null,
    sentBackCount: Number(r.sent_back_count ?? 0) || 0,
    reviewNote: typeof r.review_note === "string" && r.review_note ? r.review_note : null,
    startOn: typeof r.start_on === "string" ? r.start_on : null,
    actualMinutes: Number.isFinite(Number(r.actual_minutes)) && r.actual_minutes !== null && r.actual_minutes !== undefined ? Number(r.actual_minutes) : null,
    links: Array.isArray(r.links) ? (r.links as unknown[]).filter((l): l is string => typeof l === "string" && l.startsWith("https://")).slice(0, 5) : [],
    archivedAt: typeof r.archived_at === "string" ? r.archived_at : null,
    reassignReason: typeof r.reassign_reason === "string" && r.reassign_reason ? r.reassign_reason : null,
    reassignRequestedAt: typeof r.reassign_requested_at === "string" ? r.reassign_requested_at : null,
    stepsDone: Array.isArray(r.steps_done) ? (r.steps_done as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 20) : [],
  };
}

/**
 * All actions (open and done), read as the signed-in person. ready=false before 0006 is run.
 * promises=false before 0009 (no blocked reason / promise date yet): reads still work.
 */
export const getActions = cache(async (): Promise<{ ready: boolean; promises: boolean; orders: boolean; review: boolean; cancel: boolean; actions: ClientAction[]; canceled: ClientAction[] }> => {
  const none = { ready: false, promises: false, orders: false, review: false, cancel: false, actions: [] as ClientAction[], canceled: [] as ClientAction[] };
  if (!usesDatabase()) return none;
  const db = await createDatabaseClient();
  const read = (cols: string) => db.from("actions").select(cols).order("created_at", { ascending: false }).limit(2000);
  // Newest setup level first; step down if a later setup step hasn't been run yet.
  const levels = [
    { cols: `${ACTION_COLS}, ${PROMISE_COLS}, ${ORDER_COLS}, ${REVIEW_COLS}, ${CANCEL_COLS}, ${STEPS_DONE_COL}, ${V2_COLS}, archived_at`, promises: true, orders: true, review: true, cancel: true }, // 0017
    { cols: `${ACTION_COLS}, ${PROMISE_COLS}, ${ORDER_COLS}, ${REVIEW_COLS}, ${CANCEL_COLS}, ${STEPS_DONE_COL}`, promises: true, orders: true, review: true, cancel: true }, // 0016
    { cols: `${ACTION_COLS}, ${PROMISE_COLS}, ${ORDER_COLS}, ${REVIEW_COLS}, ${CANCEL_COLS}`, promises: true, orders: true, review: true, cancel: true }, // 0013
    { cols: `${ACTION_COLS}, ${PROMISE_COLS}, ${ORDER_COLS}, ${REVIEW_COLS}`, promises: true, orders: true, review: true, cancel: false }, // 0011
    { cols: `${ACTION_COLS}, ${PROMISE_COLS}, ${ORDER_COLS}`, promises: true, orders: true, review: false, cancel: false }, // 0010
    { cols: `${ACTION_COLS}, ${PROMISE_COLS}`, promises: true, orders: false, review: false, cancel: false }, // 0009
    { cols: ACTION_COLS, promises: false, orders: false, review: false, cancel: false }, // 0006
  ];
  const [first, team, trashed] = await Promise.all([read(levels[0]!.cols), getTeam(), getTrashedIds()]);
  let res = first;
  let level = levels[0]!;
  for (const next of levels.slice(1)) {
    if (!res.error) break;
    res = await read(next.cols);
    level = next;
  }
  if (res.error) return none;
  const { promises, orders, review, cancel } = level;
  const byDbId = new Map((await roster()).clients.map((c) => [c.dbId, c]));
  const staffName = new Map(team.members.map((m) => [m.id, m.name]));
  // Trash (0019): trashed items, and every item of a trashed client, are left out.
  const kept = ((res.data ?? []) as unknown as Record<string, string | null>[]).filter(
    (r) => !trashed.actions.has(r.id!) && !(r.client_id && trashed.clients.has(r.client_id)),
  );
  const all = kept.map((r) => {
      const c = r.client_id ? byDbId.get(r.client_id) : undefined;
      return {
        ...orderDetails(r),
        id: r.id,
        kind: asActionKind(r.kind),
        title: r.title,
        notes: r.notes,
        priority: r.priority,
        status: r.status,
        dueOn: r.due_on,
        doneAt: r.done_at,
        createdAt: r.created_at,
        ownerId: r.owner_staff_id,
        ownerName: r.owner_staff_id ? (staffName.get(r.owner_staff_id) ?? null) : null,
        client: c?.dbId ? { slug: c.id, dbId: c.dbId, name: c.name } : null,
        leadGhlId: r.lead_ghl_id,
        blockedReason: r.blocked_reason ?? null,
        promisedOn: r.promised_on ?? null,
        canceledAt: r.canceled_at ?? null,
        cancelNote: r.cancel_note ?? null,
      } as ClientAction;
    });
  // Canceled work (0013) is kept but left out of every list, count and rule; the owner sees it apart.
  return {
    ready: true,
    promises,
    orders,
    review,
    cancel,
    actions: all.filter((a) => a.status !== "canceled"),
    canceled: all.filter((a) => a.status === "canceled").sort((x, y) => (y.canceledAt ?? "").localeCompare(x.canceledAt ?? "")),
  };
});

export interface OpenDeal {
  ghlId: string;
  name: string;
  stage: string;
  value: number;
  createdAt: string | null;
  updatedAt: string | null;
}

/** Open GoHighLevel deals (read-only copies), most recently active first. */
export const getOpenDeals = cache(async (): Promise<OpenDeal[]> => {
  if (!usesDatabase()) return [];
  const db = await createDatabaseClient();
  const { data, error } = await db
    .from("ghl_opportunities")
    .select("ghl_id, name, stage_name, monetary_value, ghl_created_at, ghl_updated_at")
    .eq("status", "open")
    .order("ghl_updated_at", { ascending: false, nullsFirst: false })
    .limit(1000);
  if (error) return [];
  return (data ?? [])
    // Lead follow-ups can only point at plain ids (the actions table's rule).
    .filter((r) => /^[A-Za-z0-9]{6,40}$/.test(r.ghl_id))
    .map((r) => ({
      ghlId: r.ghl_id,
      name: r.name || "Unnamed deal",
      stage: r.stage_name || "No stage",
      value: Number(r.monetary_value ?? 0),
      createdAt: r.ghl_created_at,
      updatedAt: r.ghl_updated_at,
    }));
});

/** Daily health scores, last 21 days, per client database id. ready=false before 0009. */
export const getHealthHistory = cache(async (): Promise<{ ready: boolean; byClient: Map<string, { day: string; score: number; level: string }[]> }> => {
  const byClient = new Map<string, { day: string; score: number; level: string }[]>();
  if (!usesDatabase()) return { ready: false, byClient };
  const db = await createDatabaseClient();
  const since = new Date(Date.parse(today()) - 21 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await db.from("client_health_daily").select("client_id, day, score, level").gte("day", since).limit(5000);
  if (error) return { ready: false, byClient };
  for (const r of data ?? []) {
    const list = byClient.get(r.client_id) ?? [];
    list.push({ day: r.day, score: r.score, level: r.level });
    byClient.set(r.client_id, list);
  }
  return { ready: true, byClient };
});

/** Health, flags and priorities for everyone, computed once per request. */
export const getOps = cache(async () => {
  const [{ clients }, { ready, promises, orders, review, cancel, actions, canceled }, allDeals, history] = await Promise.all([roster(), getActions(), getOpenDeals(), getHealthHistory()]);
  const t = today();
  const checkIns = new Map(clients.map((c) => [c.id, getCheckIn(c)]));
  const health = new Map<string, HealthSummary | null>(clients.map((c) => [c.id, healthSummary(c, checkIns.get(c.id)!, actions, t)]));
  // 0–100 scores, week-over-week change, and one risk alert per client that may cancel.
  const scores = new Map(clients.map((c) => [c.id, healthScore(c, checkIns.get(c.id)!, actions, t)]));
  const trends = new Map(
    clients.map((c) => {
      const sc = scores.get(c.id);
      return [c.id, sc && c.dbId ? scoreTrend(history.byClient.get(c.dbId) ?? [], sc.score, t) : null] as const;
    }),
  );
  const drops = new Map<string, number>();
  for (const [slug, tr] of trends) if (tr && tr.change < 0) drops.set(slug, -tr.change);
  const risks = riskAlerts({ clients, scores, health, history: history.byClient, today: t });
  const deals = ready ? allDeals : [];
  const leadNames = new Map(deals.map((d) => [d.ghlId, d.name]));
  const withAction = new Set(actions.filter((a) => a.leadGhlId).map((a) => a.leadGhlId));
  const weekAgo = new Date(Date.parse(t) - 7 * 86_400_000).toISOString().slice(0, 10);
  // Only deals in selling stages count as leads (onboarding/delivery deals don't).
  const newLeads = deals.filter((d) => isSalesStage(d.stage) && (d.createdAt ?? "").slice(0, 10) >= weekAgo && !withAction.has(d.ghlId));
  const priorities: PriorityItem[] = ready
    ? buildPriorities({ clients, actions, health, checkIns, today: t, leadNames, newLeadsWithoutAction: newLeads.length, drops })
    : [];
  const counts = { at_risk: 0, needs_attention: 0, opportunity: 0, healthy: 0 };
  for (const h of health.values()) if (h) counts[h.state]++;
  return { orders, review, cancel, canceled, ready, promises, historyReady: history.ready, clients, actions, health, checkIns, scores, trends, risks, priorities, counts, gaps: ownershipGaps(clients, actions), today: t, deals, leadNames, newLeads };
});

/** One client's health word + reasons, and its open and recent items. */
export async function getClientOps(slug: string) {
  const ops = await getOps();
  const c = ops.clients.find((x) => x.id === slug);
  if (!c) return null;
  const mine = ops.actions.filter((a) => a.client?.slug === slug);
  return {
    ready: ops.ready,
    health: ops.health.get(slug) ?? null,
    trend: ops.trends.get(slug) ?? null,
    open: mine.filter((a) => a.status !== "done"),
    done: mine.filter((a) => a.status === "done").slice(0, 5),
    priorities: ops.priorities.filter((p) => p.clientSlug === slug || p.action?.client?.slug === slug),
  };
}

export interface TimelineEntry {
  at: string; // ISO date or timestamp
  kind: "contact" | "action" | "account";
  title: string;
  detail: string | null;
  tone: "neutral" | "good" | "bad" | "info";
}

/**
 * One client's history, newest first: contacts (check-ins, calls, messages...),
 * next actions and issues opened/done/reassigned, owner changes, and the start/end
 * of the account. Read as the signed-in person (security rules apply).
 */
export async function getClientTimeline(slug: string, limit = 15): Promise<TimelineEntry[]> {
  const c = (await roster()).clients.find((x) => x.id === slug);
  if (!c?.dbId || !usesDatabase()) return [];
  const db = await createDatabaseClient();
  const words: Record<ContactKind, string> = { check_in: "Check-in", call: "Call", message: "Message", email: "Email", meeting: "Meeting", note: "Note" };
  const out: TimelineEntry[] = [];
  for (const r of (await readCheckIns(db)).filter((x) => x.client_id === c.dbId)) {
    const mood = r.mood === "better" ? " · doing better" : r.mood === "worse" ? " · got worse" : r.mood === "same" ? " · holding steady" : "";
    out.push({ at: r.happened_on, kind: "contact", title: `${words[r.kind]} logged${mood}`, detail: r.note, tone: r.mood === "worse" ? "bad" : r.mood === "better" ? "good" : "neutral" });
  }
  const act = await db.from("activity").select("at, kind, summary").eq("client_id", c.dbId).order("at", { ascending: false }).limit(50);
  for (const r of act.data ?? []) {
    out.push({ at: r.at, kind: "action", title: r.summary, detail: null, tone: r.kind === "action_done" ? "good" : r.kind === "action_created" && /^Issue/.test(r.summary) ? "bad" : "info" });
  }
  if (c.ghl?.lastInboundAt) out.push({ at: c.ghl.lastInboundAt, kind: "contact", title: "Client reached out (GoHighLevel)", detail: null, tone: "info" });
  if (c.ghl?.lastOutboundAt) out.push({ at: c.ghl.lastOutboundAt, kind: "contact", title: `We reached out (GoHighLevel${c.ghl.lastDirection === "outbound" && c.ghl.lastChannel ? `, ${c.ghl.lastChannel}` : ""})`, detail: null, tone: "neutral" });
  if (c.ghl?.lastCallAt) out.push({ at: c.ghl.lastCallAt, kind: "contact", title: `Call (GoHighLevel${c.ghl.lastCallSeconds ? `, ${Math.max(1, Math.round(c.ghl.lastCallSeconds / 60))} min` : ""})`, detail: null, tone: "neutral" });
  out.push({ at: c.startDate, kind: "account", title: "Became a client", detail: null, tone: "good" });
  if (c.endDate) out.push({ at: c.endDate, kind: "account", title: c.status === "paused" ? "Paused" : "Ended", detail: null, tone: "bad" });
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

/**
 * A developer's own items (0007). Uses the public.my_work view, which returns only their
 * items and each client's name: never revenue or other clients. [] before 0007.
 * Preview as developer: the same items, from the owner's/manager's normal read, through
 * the same rules as the view (developerWorkScope; the break-in tests keep them in step).
 */
export const getDeveloperWork = cache(async (): Promise<PriorityItem[]> => {
  const t = today();
  return (await getDeveloperActions())
    .filter((a) => a.status !== "done" && a.status !== "canceled")
    .sort((x, y) => (x.dueOn ?? "9999").localeCompare(y.dueOn ?? "9999"))
    .map((action) => {
      const when = !action.dueOn ? "none" : action.dueOn < t ? "overdue" : action.dueOn === t ? "today" : "upcoming";
      const due = !action.dueOn ? "No due date" : when === "overdue" ? `Overdue (was due ${action.dueOn})` : when === "today" ? "Due today" : `Due ${action.dueOn}`;
      return {
        id: `a_${action.id}`,
        title: action.client ? `${action.client.name}: ${action.title}` : action.title,
        reason: `${kindLabel(action.kind)} · ${due}${statusNote(action, t)}`,
        href: "/work#my-work",
        ownerName: action.ownerName,
        ownerId: action.ownerId,
        dueOn: action.dueOn,
        when,
        priority: action.priority,
        action,
      } as PriorityItem;
    });
});

/** Everything on the developer's list (including items finished in the last 14 days). */
export const getDeveloperActions = cache(async (): Promise<ClientAction[]> => {
  if (!usesDatabase()) return [];
  const viewer = await getDeveloperViewer();
  if (!viewer) return [];
  let mine: ClientAction[];
  if (viewer.preview) {
    if (!viewer.staffId) return [];
    const { actions } = await getActions();
    mine = developerWorkScope(actions, { id: viewer.staffId, name: viewer.name }, new Date());
  } else {
    const db = await createDatabaseClient();
    const base = "id, kind, title, notes, priority, status, due_on, done_at, created_at, client_slug, client_name";
    const read = (cols: string) => db.from("my_work").select(cols).order("due_on", { ascending: true, nullsFirst: false });
    let { data, error } = await read(`${base}, ${PROMISE_COLS}, steps, source_link, source_note, est_minutes, ${REVIEW_COLS}, ${STEPS_DONE_COL}, ${V2_COLS}`);
    if (error) ({ data, error } = await read(`${base}, ${PROMISE_COLS}, steps, source_link, source_note, est_minutes, ${REVIEW_COLS}, ${STEPS_DONE_COL}`)); // before 0017
    if (error) ({ data, error } = await read(`${base}, ${PROMISE_COLS}, steps, source_link, source_note, est_minutes, ${REVIEW_COLS}`)); // before 0016
    if (error) ({ data, error } = await read(`${base}, ${PROMISE_COLS}, steps, source_link, source_note, est_minutes`)); // before 0011
    if (error) ({ data, error } = await read(`${base}, ${PROMISE_COLS}`)); // before 0010
    if (error) ({ data, error } = await read(base)); // before 0009
    if (error || !Array.isArray(data)) return [];
    mine = (data as unknown as Record<string, unknown>[]).map((r) => ({
      ...orderDetails(r),
      aiSuggested: false,
      id: String(r.id),
      kind: asActionKind(r.kind),
      title: String(r.title ?? ""),
      notes: (r.notes as string | null) ?? null,
      priority: (["critical", "high", "normal", "low"].includes(String(r.priority)) ? r.priority : "normal") as ClientAction["priority"],
      status: (["open", "in_progress", "waiting", "blocked", "review", "done"].includes(String(r.status)) ? r.status : "open") as ClientAction["status"],
      dueOn: (r.due_on as string | null) ?? null,
      doneAt: (r.done_at as string | null) ?? null,
      createdAt: String(r.created_at ?? ""),
      ownerId: viewer.staffId,
      ownerName: viewer.name,
      // Name only (from the my_work view); developers can't open client pages.
      client: r.client_slug && r.client_name ? { slug: String(r.client_slug), dbId: "", name: String(r.client_name) } : null,
      leadGhlId: null,
      blockedReason: (r.blocked_reason as string | null) ?? null,
      promisedOn: (r.promised_on as string | null) ?? null,
    }));
  }
  return mine;
});

/**
 * One work order with its comments and history (0017), for its own page. Read as the
 * signed-in person: developers (and a preview of one) only reach their current items;
 * the database's rules decide comments and history too. null = not found / not theirs.
 */
export interface TrashEntry {
  kind: "client" | "item";
  id: string;
  /** Client name, or the item's title. */
  name: string;
  /** For items: work_order / follow_up / issue. For clients: how many items go with it. */
  itemKind: string | null;
  attached: number;
  clientName: string | null;
  trashedAt: string;
  byMe: boolean;
}

/**
 * The Trash screen (0019): owner and managers. Newest first. Deletions (owner only) are
 * the name-free record of what was deleted forever in the last 30 days.
 */
export const getTrash = cache(async (): Promise<{ ready: boolean; canDelete: boolean; entries: TrashEntry[]; deletions: { kind: string; withClient: boolean; at: string }[] }> => {
  const none = { ready: false, canDelete: false, entries: [] as TrashEntry[], deletions: [] as { kind: string; withClient: boolean; at: string }[] };
  const me = await getMember();
  if (!usesDatabase() || !me || (me.role !== "owner" && me.role !== "manager")) return none;
  const db = await createDatabaseClient();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [c, a, log] = await Promise.all([
    db.from("clients").select("id, name, trashed_at, trashed_by").not("trashed_at", "is", null).order("trashed_at", { ascending: false }).limit(500),
    db.from("actions").select("id, kind, title, client_id, trashed_at, trashed_by").order("created_at", { ascending: false }).limit(5000),
    me.role === "owner" ? db.from("deletion_log").select("kind, with_client, deleted_at").gte("deleted_at", since).order("deleted_at", { ascending: false }).limit(500) : null,
  ]);
  if (c.error || a.error) return none;
  const clientName = new Map<string, string>();
  const allClients = await db.from("clients").select("id, name");
  for (const r of allClients.data ?? []) clientName.set(r.id as string, r.name as string);
  const attached = new Map<string, number>();
  for (const r of a.data ?? []) if (r.client_id) attached.set(r.client_id as string, (attached.get(r.client_id as string) ?? 0) + 1);
  const entries: TrashEntry[] = [
    ...(c.data ?? []).map((r) => ({
      kind: "client" as const,
      id: r.id as string,
      name: r.name as string,
      itemKind: null,
      attached: attached.get(r.id as string) ?? 0,
      clientName: null,
      trashedAt: r.trashed_at as string,
      byMe: r.trashed_by === me.userId,
    })),
    ...(a.data ?? [])
      .filter((r) => r.trashed_at)
      .map((r) => ({
        kind: "item" as const,
        id: r.id as string,
        name: r.title as string,
        itemKind: r.kind as string,
        attached: 0,
        clientName: r.client_id ? (clientName.get(r.client_id as string) ?? null) : null,
        trashedAt: r.trashed_at as string,
        byMe: r.trashed_by === me.userId,
      })),
  ].sort((x, y) => y.trashedAt.localeCompare(x.trashedAt));
  return {
    ready: true,
    canDelete: me.role === "owner",
    entries,
    deletions: log && !log.error ? (log.data ?? []).map((r) => ({ kind: r.kind as string, withClient: r.with_client === true, at: r.deleted_at as string })) : [],
  };
});

export const getWorkOrderDetail = cache(async (id: string) => {
  if (!usesDatabase() || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const viewer = await getDeveloperViewer();
  const me = await getMember();
  let action: ClientAction | undefined;
  if (viewer) action = (await getDeveloperActions()).find((a) => a.id === id);
  else if (me && (me.role === "owner" || me.role === "manager")) {
    const all = await getActions();
    action = [...all.actions, ...all.canceled].find((a) => a.id === id);
  }
  if (!action || action.kind !== "work_order") return null;
  const db = await createDatabaseClient();
  const [c, h] = await Promise.all([
    db.from("work_order_comments").select("id, author, author_name, body, created_at").eq("action_id", id).order("created_at").limit(500),
    db.from("work_order_history").select("at, actor_name, field, old_value, new_value").eq("action_id", id).order("at").limit(500),
  ]);
  return {
    action,
    ready: !c.error && !h.error,
    comments: (c.data ?? []).map((r) => ({ id: r.id as string, mine: r.author === me?.userId, authorName: (r.author_name as string | null) ?? "Teammate", body: String(r.body), at: String(r.created_at) })),
    history: (h.data ?? []).map((r) => ({ at: String(r.at), actorName: (r.actor_name as string | null) ?? null, field: r.field as HistoryEntry["field"], oldValue: (r.old_value as string | null) ?? null, newValue: (r.new_value as string | null) ?? null })),
  };
});

/** In-app notices (0017). Written only by the database; each person reads only their own. */
export interface Notice {
  id: string;
  kind: "assigned" | "unassigned" | "due_changed" | "comment" | "reassign_request" | "due_tomorrow";
  title: string;
  actionId: string | null;
  at: string;
  read: boolean;
}
export const NOTICE_KINDS: { kind: Notice["kind"]; label: string; who: "developer" | "owner" | "everyone" }[] = [
  { kind: "assigned", label: "Assigned to me", who: "everyone" },
  { kind: "unassigned", label: "Reassigned away from me", who: "everyone" },
  { kind: "due_changed", label: "Due date changed", who: "everyone" },
  { kind: "comment", label: "New comments", who: "everyone" },
  { kind: "due_tomorrow", label: "Due tomorrow (shown when I open Atlas)", who: "everyone" },
  { kind: "reassign_request", label: "A developer asks to be reassigned", who: "owner" },
];

/**
 * My notices, newest first, plus "due tomorrow" for my own open work orders (worked out
 * when the page loads: nothing is scheduled or sent). null = not set up, or previewing.
 */
export const getNotices = cache(async (): Promise<{ items: Notice[]; unread: number; muted: string[] } | null> => {
  if (!usesDatabase()) return null;
  const viewer = await getDeveloperViewer();
  if (viewer?.preview) return null;
  const me = await getMember();
  if (!me) return null;
  const db = await createDatabaseClient();
  const [n, st] = await Promise.all([
    db.from("notifications").select("id, kind, title, action_id, created_at, read_at").order("created_at", { ascending: false }).limit(40),
    db.from("notification_settings").select("muted").maybeSingle(),
  ]);
  if (n.error) return null; // before 0017
  const muted = Array.isArray(st.data?.muted) ? (st.data!.muted as string[]) : [];
  const items: Notice[] = (n.data ?? []).map((r) => ({ id: r.id, kind: r.kind, title: r.title, actionId: r.action_id, at: r.created_at, read: Boolean(r.read_at) }));
  const tomorrow = new Date(Date.parse(`${today()}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  if (!muted.includes("due_tomorrow") && me.staffId) {
    const mine = viewer ? await getDeveloperActions() : (await getActions()).actions.filter((a) => a.ownerId === me.staffId);
    for (const a of mine.filter((x) => x.kind === "work_order" && x.dueOn === tomorrow && x.status !== "done" && x.status !== "canceled" && x.status !== "review"))
      items.unshift({ id: `due-${a.id}`, kind: "due_tomorrow", title: a.title, actionId: a.id, at: `${tomorrow}T00:00:00Z`, read: false });
  }
  // "Due tomorrow" lines are reminders on the list, not counted (no nagging badge).
  return { items, unread: items.filter((i) => !i.read && i.kind !== "due_tomorrow").length, muted };
});

/** The floating Work Orders button's count: overdue or urgent open work orders (yours, if you're a developer). */
export const getWorkOrderBadge = cache(async (): Promise<number | null> => {
  if (!usesDatabase()) return null;
  const viewer = await getDeveloperViewer();
  if (viewer) return needsAttentionCount(await getDeveloperActions(), today());
  const me = await getMember();
  if (!me || (me.role !== "owner" && me.role !== "manager")) return null;
  return needsAttentionCount((await getActions()).actions, today());
});

/**
 * Which Home layout to show (owner and managers; docs/ROLE_HOME_PLAN.md). The person's
 * own pick (a cookie on this device) wins, else their team profile's job. A layout only
 * arranges what they can already read; it never changes permissions. null = not offered.
 */
export const getHomeLayout = cache(async (): Promise<{ layout: HomeLayout; staffId: string | null } | null> => {
  if (!usesDatabase()) return null;
  const me = await getMember();
  if (!me || (me.role !== "owner" && me.role !== "manager")) return null;
  const role = me.staffId ? ((await getTeam()).members.find((m) => m.id === me.staffId)?.role ?? null) : null;
  return { layout: chooseHomeLayout((await cookies()).get(HOME_LAYOUT_COOKIE)?.value, role), staffId: me.staffId };
});

/** Upcoming GoHighLevel appointments (synced copies): start time, calendar name and status only. */
export const getUpcomingAppointments = cache(async (): Promise<SalesAppointment[]> => {
  if (!usesDatabase()) return [];
  const db = await createDatabaseClient();
  const from = new Date(Date.now() - 60 * 60_000).toISOString();
  const to = new Date(Date.now() + 8 * 86_400_000).toISOString();
  const { data, error } = await db.from("ghl_appointments").select("starts_at, calendar_name, status").gte("starts_at", from).lte("starts_at", to).order("starts_at").limit(200);
  if (error) return [];
  return (data ?? []).filter((r) => typeof r.starts_at === "string").map((r) => ({ startsAt: r.starts_at as string, calendar: (r.calendar_name as string | null) ?? null, status: (r.status as string | null) ?? null }));
});

/** Step tick boxes (0016) are set up. Developers check their own view; everyone else the table. */
export const getStepsReady = cache(async (): Promise<boolean> => {
  if (!usesDatabase()) return false;
  const viewer = await getDeveloperViewer();
  const db = await createDatabaseClient();
  const { error } = await db.from(viewer && !viewer.preview ? "my_work" : "actions").select("steps_done").limit(1);
  return !error;
});

export interface Completion {
  at: string;
  summary: string;
  client: { slug: string; name: string } | null;
  /** Credited to the item's owner, or for reminders, the client's owner. */
  ownerId: string | null;
}

/** Everything marked done in the last 7 days (from the insert-only history), newest first. */
export const getCompletions = cache(async (): Promise<Completion[]> => {
  if (!usesDatabase()) return [];
  const db = await createDatabaseClient();
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data, error } = await db
    .from("activity")
    .select("at, summary, client_id, action_id")
    .eq("kind", "action_done")
    .gte("at", since)
    .order("at", { ascending: false })
    .limit(500);
  if (error) return [];
  const [{ clients }, { actions }, trashed] = await Promise.all([roster(), getActions(), getTrashedIds()]);
  const byDbId = new Map(clients.map((c) => [c.dbId, c]));
  const actionOwner = new Map(actions.map((a) => [a.id, a.ownerId]));
  const inTrash = (r: { client_id: string | null; action_id: string | null }) => Boolean((r.client_id && trashed.clients.has(r.client_id)) || (r.action_id && trashed.actions.has(r.action_id)));
  return (data ?? []).filter((r) => !inTrash(r)).map((r) => {
    const c = r.client_id ? byDbId.get(r.client_id) : undefined;
    return {
      at: r.at,
      summary: String(r.summary ?? "").replace(/^Done: /, ""),
      client: c ? { slug: c.id, name: c.name } : null,
      ownerId: (r.action_id ? actionOwner.get(r.action_id) : undefined) ?? c?.ownerId ?? null,
    };
  });
});

/** Owner's matching screen: each current client with its GoHighLevel contact match or suggestions. */
export async function getContactMatches() {
  if (!usesDatabase()) return { ready: false, rows: [] as { client: RosterClient; confirmed: { id: string; name: string | null } | null; suggestions: { id: string; name: string | null }[] }[] };
  const db = await createDatabaseClient();
  const { data, error } = await db.from("ghl_contact_links").select("client_id, ghl_contact_id, contact_name, status");
  if (error) return { ready: false, rows: [] };
  const clients = (await roster()).clients.filter((c) => (c.status === "active" || c.status === "paused") && c.dbId);
  const links = (data ?? []) as { client_id: string; ghl_contact_id: string; contact_name: string | null; status: string }[];
  const rows = clients.map((c) => {
    const mine = links.filter((l) => l.client_id === c.dbId);
    const conf = mine.find((l) => l.status === "confirmed");
    return {
      client: c,
      confirmed: conf ? { id: conf.ghl_contact_id, name: conf.contact_name } : null,
      suggestions: conf ? [] : mine.filter((l) => l.status === "suggested").map((l) => ({ id: l.ghl_contact_id, name: l.contact_name })),
    };
  });
  // Clients needing a decision first, then unmatched, then done.
  const rank = (r: (typeof rows)[number]) => (r.confirmed ? 2 : r.suggestions.length ? 0 : 1);
  return { ready: true, rows: rows.sort((a, b) => rank(a) - rank(b) || b.client.monthlyUsd - a.client.monthlyUsd) };
}

/** Recent contacts across all clients (calls, messages, check-ins...), newest first. */
export async function getContactLog(days = 14, limit = 6) {
  if (!usesDatabase()) return { count: 0, recent: [] as { date: string; kind: ContactKind; note: string | null; client: { slug: string; name: string } | null }[] };
  const db = await createDatabaseClient();
  const byDbId = new Map((await roster()).clients.map((c) => [c.dbId, c]));
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const rows = (await readCheckIns(db)).filter((r) => r.happened_on >= since);
  return {
    count: rows.length,
    recent: rows.slice(0, limit).map((r) => {
      const c = byDbId.get(r.client_id);
      return { date: r.happened_on, kind: r.kind, note: r.note, client: c ? { slug: c.id, name: c.name } : null };
    }),
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

  // One blip per client, by its health word (red = at risk, amber = needs attention).
  const ops = await getOps();
  for (const c of clients) {
    const h = ops.health.get(c.id);
    if (!h || h.state === "healthy" || h.state === "opportunity") continue;
    const risk = h.state === "at_risk";
    out.push({
      id: `d_${h.state}_${c.id}`,
      kind: risk ? "problem" : "attention",
      title: `${risk ? "At risk" : "Needs attention"}: ${c.name}`,
      why: h.reasons.slice(0, 3).join(". ") + ".",
      // More reasons and more money = closer to the center.
      closeness: clamp((risk ? 0.6 : 0.3) + h.reasons.length * 0.08 + Math.min(c.monthlyUsd, 1000) / 5000),
      confidence: risk ? 0.85 : 0.7,
      href: `/clients/${c.id}`,
      isSynthetic: !real,
    });
  }
  // Opportunities (green): any active client with an upsell or referral idea.
  for (const c of clients) {
    const ideas = opportunities(c, today());
    if (!ideas.length) continue;
    out.push({ id: `d_opp_${c.id}`, kind: "opportunity", title: `Opportunity: ${c.name}`, why: ideas.join(". ") + ".", closeness: clamp(0.25 + monthsBetween(c.startDate, today()) / 24), confidence: 0.45, href: `/clients/${c.id}`, isSynthetic: !real });
  }
  if ((await roster()).skipped > 0)
    out.push({ id: "d_skip", kind: "problem", title: `${(await roster()).skipped} client records couldn't be read`, why: "They were left out. Check the private client file.", closeness: 0.95, confidence: 1, href: "/safety", isSynthetic: false });

  // Sample work orders: urgent = red, overdue = amber.
  for (const w of getWorkOrders().filter((x) => x.status !== "done")) {
    if (w.priority === "urgent")
      out.push({ id: `d_wo_${w.id}`, kind: "problem", title: w.title, why: `${w.clientLabel}. Urgent work order.`, closeness: 0.9, confidence: 0.8, href: `/work/${w.id}`, isSynthetic: true });
    else if (w.due < today())
      out.push({ id: `d_wo_${w.id}`, kind: "attention", title: w.title, why: `${w.clientLabel}. Overdue work order.`, closeness: clamp(0.5 + daysBetween(w.due, today()) / 14), confidence: 0.75, href: `/work/${w.id}`, isSynthetic: true });
  }
  // Sample prospects graded A: green opportunities.
  for (const p of getProspects().filter((x) => x.grade.letter === "A" && x.stage !== "won" && x.stage !== "lost")) {
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
  const replies = getConversations().filter((c) => c.needsReply);
  const work = getWorkOrders().filter((w) => w.status !== "done" && (w.priority === "urgent" || w.due < today()));
  const clientItems = clients.filter((c) => {
    const h = getClientHealth(c);
    return c.check || (c.followUp && h) || h?.level === "at_risk" || h?.checkIn.state === "overdue";
  });
  if (!showsSamples()) {
    // Real data: glow only for work that is due or overdue, and for new leads with no follow-up.
    const ops = await getOps();
    const due = ops.priorities.filter((p) => p.action && (p.when === "overdue" || p.when === "today"));
    const leadDue = [...due.filter((p) => p.action?.leadGhlId).map((p) => p.id), ...ops.newLeads.map((d) => `new_${d.ghlId}`)];
    const workDue = due.filter((p) => !p.action?.leadGhlId).map((p) => p.id);
    return {
      radar: hint("radar", worth.map((d) => d.id), `${worth.length} worth checking`),
      leads: hint("leads", leadDue, `${leadDue.length} lead follow-ups due`),
      chats: hint("chats", [], ""),
      tabs: {
        "/clients": hint("clients", clientItems.map((c) => c.id), "At-risk clients, check-ins and records to check"),
        "/sales": hint("sales", leadDue, "Lead follow-ups due, or new leads with no follow-up"),
        "/work": hint("work", workDue, "Follow-ups and issues due today or overdue"),
      } as Record<string, CoachHint>,
    };
  }
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
  if (!showsSamples()) return [];
  return [...prospects].sort((a, b) => b.grade.score - a.grade.score);
}

export function getProspect(id: string): Prospect | undefined {
  return getProspects().find((p) => p.id === id);
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
  return showsSamples() ? agencySalesKpis : [];
}

/** Newest first. */
export function getConversations(): Conversation[] {
  if (!showsSamples()) return [];
  return [...conversations].sort((a, b) => b.at.localeCompare(a.at));
}

// ---------------------------------------------------------------------------
// Work (sample work orders + your real rules)
// ---------------------------------------------------------------------------

const priorityRank = { urgent: 0, high: 1, normal: 2, low: 3 } as const;

/** Open work first, then by priority, then by due date. */
export function getWorkOrders(): WorkOrder[] {
  if (!showsSamples()) return [];
  return [...workOrders].sort(
    (a, b) =>
      Number(a.status === "done") - Number(b.status === "done") ||
      priorityRank[a.priority] - priorityRank[b.priority] ||
      a.due.localeCompare(b.due),
  );
}

export function getWorkOrder(id: string): WorkOrder | undefined {
  return getWorkOrders().find((w) => w.id === id);
}

export function getSampleDevelopers() {
  if (!showsSamples()) return [];
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
  if (!showsSamples()) return [];
  return [...businesses].sort((a, b) => a.dexNumber - b.dexNumber);
}

export function getBusiness(id: string): Business | undefined {
  return getBusinesses().find((b) => b.id === id);
}

export function getCaseStudyHistory(id: string): MonthlyPoint[] {
  return showsSamples() ? (caseStudyHistory[id] ?? []) : [];
}

export function getTrends(): Trend[] {
  return showsSamples() ? trends : [];
}

export function getSurveyQuestions(): SurveyQuestion[] {
  return surveyQuestions;
}

export function getSurveyResponses(businessId?: string): SurveyResponse[] {
  if (!showsSamples()) return [];
  return businessId ? surveyResponses.filter((r) => r.businessId === businessId) : surveyResponses;
}

export function getInsights(): Insight[] {
  return showsSamples() ? insights : [];
}

/** Tags shared by two or more businesses, most common first. */
export function getPatterns(): { tag: string; businessIds: string[] }[] {
  const byTag = new Map<string, string[]>();
  for (const b of getBusinesses()) {
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

// ---------------------------------------------------------------------------
// AI (Phase 4): budget meter, saved briefings and client profiles
// ---------------------------------------------------------------------------

const emptyAi = (configured: boolean, tablesReady: boolean): AiStatus => ({
  configured,
  tablesReady,
  model: AI_MODEL,
  budgetUsd: 10,
  spentUsd: 0,
  remainingUsd: 10,
  pct: 0,
  level: "ok",
  inputTokens: 0,
  outputTokens: 0,
  requests: 0,
  recent: [],
});

/** This month's AI usage and budget. Read as the signed-in person (security rules apply). */
export const getAiStatus = cache(async (): Promise<AiStatus> => {
  const configured = isAiConfigured();
  if (!usesDatabase()) return emptyAi(configured, false);
  const db = await createDatabaseClient();
  const [settings, usage] = await Promise.all([
    db.from("ai_settings").select("monthly_budget_usd").eq("id", 1).maybeSingle(),
    db
      .from("ai_usage")
      .select("created_at, feature, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, outcome")
      .gte("created_at", monthStartIso())
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);
  if (settings.error || usage.error) return emptyAi(configured, false);
  const s = emptyAi(configured, true);
  s.budgetUsd = Number(settings.data?.monthly_budget_usd ?? 10);
  for (const u of usage.data ?? []) {
    // 0018: a failed run with no bill has blank (unknown) cost and tokens: added as nothing.
    s.spentUsd += Number(u.cost_usd ?? 0);
    s.inputTokens += (u.input_tokens ?? 0) + (u.cache_read_tokens ?? 0) + (u.cache_write_tokens ?? 0);
    s.outputTokens += u.output_tokens ?? 0;
    s.requests++;
  }
  s.spentUsd = Math.round(s.spentUsd * 10_000) / 10_000;
  const b = budgetState(s.spentUsd, s.budgetUsd);
  s.pct = b.pct;
  s.level = b.level;
  s.remainingUsd = b.remaining;
  s.recent = (usage.data ?? []).slice(0, 8).map((u) => ({
    at: u.created_at,
    feature: u.feature,
    costUsd: u.cost_usd === null ? null : Number(u.cost_usd),
    outcome: u.outcome,
    tokens: (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_read_tokens ?? 0) + (u.cache_write_tokens ?? 0),
  }));
  return s;
});

/** The latest saved briefing, if any. */
export const getLatestBriefing = cache(async (): Promise<{ createdAt: string; content: Briefing | OpsBriefing } | null> => {
  if (!usesDatabase()) return null;
  const db = await createDatabaseClient();
  const { data, error } = await db.from("ai_briefings").select("created_at, content").eq("kind", "daily").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  return { createdAt: data.created_at, content: data.content as Briefing | OpsBriefing };
});

/** The latest AI work order drafts (0010), if any from the last 14 days. Owner/manager only (database rule). */
export const getWorkOrderDrafts = cache(async (): Promise<{ createdAt: string; content: WorkOrderDrafts } | null> => {
  if (!usesDatabase()) return null;
  const db = await createDatabaseClient();
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const { data, error } = await db
    .from("ai_briefings")
    .select("created_at, content")
    .eq("kind", "work_orders")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data || (data.content as { version?: number })?.version !== 1) return null;
  return { createdAt: data.created_at, content: data.content as WorkOrderDrafts };
});

/**
 * Developers: contact DATES for the clients they work on (0010 view public.my_client_contacts).
 * Names and dates only: no notes, no message text, no revenue. [] before 0010 or for others.
 */
export const getMyClientContacts = cache(async (): Promise<ClientContactDates[]> => {
  if (!usesDatabase()) return [];
  const viewer = await getDeveloperViewer();
  if (!viewer) return [];
  if (viewer.preview) {
    // Same rules as the my_client_contacts view (developerClientScope; tested against it).
    if (!viewer.staffId) return [];
    const [{ actions }, r] = await Promise.all([getActions(), roster()]);
    return developerClientScope(r.clients, actions, viewer.staffId, new Date());
  }
  const db = await createDatabaseClient();
  const { data, error } = await db
    .from("my_client_contacts")
    .select("client_slug, client_name, last_logged_on, last_inbound_at, last_outbound_at, last_call_at, unanswered_outbound")
    .order("client_name");
  if (error || !Array.isArray(data)) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    slug: String(r.client_slug ?? ""),
    name: String(r.client_name ?? ""),
    lastLoggedOn: (r.last_logged_on as string | null) ?? null,
    lastInboundAt: (r.last_inbound_at as string | null) ?? null,
    lastOutboundAt: (r.last_outbound_at as string | null) ?? null,
    lastCallAt: (r.last_call_at as string | null) ?? null,
    unanswered: Number(r.unanswered_outbound ?? 0) || 0,
  }));
});

/**
 * Everything the owner summary needs (0012), read AS the signed-in owner (normal
 * security rules apply). The summary itself is built by src/lib/owner-summary.ts.
 */
export async function getOwnerSummaryInput(): Promise<OwnerSummaryInput | null> {
  if (!usesDatabase()) return null;
  const db = await createDatabaseClient();
  const runsSince = new Date(Date.now() - RECENT_RUNS_DAYS * 86_400_000).toISOString();
  const [ops, team, ai, detections, opps, runs, recent, billing] = await Promise.all([
    getOps(),
    getTeam(),
    getAiStatus(),
    getDetections(),
    db.from("ghl_opportunities").select("ghl_created_at").limit(5000),
    db.from("ai_usage").select("created_at, feature, outcome").order("created_at", { ascending: false }).limit(300),
    // 0018: the run log for "recent_runs". Only these columns: no prompts or answers exist here.
    db
      .from("ai_usage")
      .select("run_ref, feature, created_at, started_at, cost_usd, outcome")
      .gte("created_at", runsSince)
      .order("created_at", { ascending: false })
      .limit(RECENT_RUNS_MAX),
    getBilling(), // owner only (null for anyone else, and the database returns nothing to them)
  ]);
  const lastRuns: OwnerSummaryInput["ai"]["lastRuns"] = {};
  for (const r of runs.data ?? []) {
    if (isAiFeature(r.feature) && !lastRuns[r.feature]) lastRuns[r.feature] = { at: r.created_at, outcome: r.outcome };
  }
  const recentRuns = recent.error ? null : buildRecentRuns((recent.data ?? []) as RunLogRow[], new Date()); // null before 0018
  const synced = !opps.error && (opps.data?.length ?? 0) > 0;
  let latestHealth: OwnerSummaryInput["latestHealth"] = null;
  if (ops.historyReady) {
    const history = await getHealthHistory();
    const slugOf = new Map(ops.clients.filter((c) => c.dbId).map((c) => [c.dbId!, c.id]));
    latestHealth = [];
    for (const [dbId, rows] of history.byClient) {
      const slug = slugOf.get(dbId);
      const last = [...rows].sort((a, b) => b.day.localeCompare(a.day))[0];
      if (slug && last) latestHealth.push({ slug, score: last.score, level: last.level, day: last.day });
    }
  }
  return {
    now: new Date(),
    clients: ops.clients,
    actions: ops.ready ? ops.actions : null,
    opportunities: synced ? (opps.data ?? []).map((o) => ({ createdAt: o.ghl_created_at })) : null,
    latestHealth,
    trends: new Map([...ops.trends.entries()].map(([slug, t]) => [slug, t?.change ?? null])),
    detections,
    staff: team.members.map((m) => ({ id: m.id, name: m.name })),
    ai: { configured: ai.configured, tablesReady: ai.tablesReady, blocked: ai.level === "blocked", spentUsd: ai.spentUsd, lastRuns },
    recentRuns,
    billing: billing ? { state: billing.state, records: billing.records } : null,
    workOrderStatusSince: await workOrderStatusSince(db),
  };
}

/** When each work order's status last changed, from the database's own history (0017). null before 0017. */
async function workOrderStatusSince(db: DbClient): Promise<Map<string, string> | null> {
  const { data, error } = await db.from("work_order_history").select("action_id, at").in("field", ["status", "created"]).order("at", { ascending: true }).limit(20000);
  if (error) return null;
  const out = new Map<string, string>();
  for (const r of data ?? []) out.set(r.action_id as string, r.at as string); // later rows win
  return out;
}

/** Owner summary status for the Data Safety screen: last published, last dashboard read. null before 0012 or for non-owners. */
export async function getOwnerSummaryStatus(): Promise<{ publishedAt: string | null; lastReadAt: string | null; readsThisWeek: number; limitedThisWeek: number } | null> {
  if (!usesDatabase()) return null;
  const db = await createDatabaseClient();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [snap, calls] = await Promise.all([
    db.from("owner_summary_snapshots").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("owner_summary_calls").select("at, outcome").gte("at", weekAgo).order("at", { ascending: false }).limit(1000),
  ]);
  if (snap.error || calls.error) return null;
  const rows = calls.data ?? [];
  return {
    publishedAt: snap.data?.created_at ?? null,
    lastReadAt: rows.find((r) => r.outcome === "ok")?.at ?? null,
    readsThisWeek: rows.filter((r) => r.outcome === "ok").length,
    limitedThisWeek: rows.filter((r) => r.outcome === "limited").length,
  };
}

/** The latest AI profile draft for one client, if any. */
export async function getClientProfile(clientDbId: string | undefined): Promise<{ id: string; createdAt: string; reviewedAt: string | null; content: ClientProfile } | null> {
  if (!usesDatabase() || !clientDbId || !/^[0-9a-f-]{36}$/.test(clientDbId)) return null;
  const db = await createDatabaseClient();
  const { data, error } = await db
    .from("ai_client_profiles")
    .select("id, created_at, reviewed_at, content")
    .eq("client_id", clientDbId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return { id: data.id, createdAt: data.created_at, reviewedAt: data.reviewed_at, content: data.content as ClientProfile };
}

/** Recent check-in notes for every client, keyed by database id (newest first). */
export async function getRecentCheckInsByClient(perClient = 3): Promise<Map<string, CheckInEntry[]>> {
  const out = new Map<string, CheckInEntry[]>();
  if (!usesDatabase()) return out;
  const db = await createDatabaseClient();
  for (const r of await readCheckIns(db)) {
    const list = out.get(r.client_id) ?? [];
    if (list.length < perClient) list.push({ date: r.happened_on, note: r.note, mood: r.mood, kind: r.kind });
    out.set(r.client_id, list);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Kit (0014): handbook pages and the tools list. Read as the signed-in person: the
// database decides what each role sees (developers: pages for them + team_tools).
// ready=false before 0014 is run.
// ---------------------------------------------------------------------------

const KIT_KIND_SET = new Set(["readme", "sop", "faq", "template"]);

function kitDocFrom(r: Record<string, unknown>): KitDoc {
  return {
    id: String(r.id),
    kind: (KIT_KIND_SET.has(String(r.kind)) ? r.kind : "sop") as KitDoc["kind"],
    title: String(r.title ?? ""),
    category: typeof r.category === "string" && r.category ? r.category : null,
    body: String(r.body ?? ""),
    audience: (Array.isArray(r.audience) ? r.audience : []).filter((a): a is KitDoc["audience"][number] => a === "manager" || a === "developer"),
    reviewedOn: typeof r.reviewed_on === "string" ? r.reviewed_on : null,
    archived: r.archived === true,
    updatedAt: String(r.updated_at ?? ""),
  };
}

export const getKit = cache(async (): Promise<{ ready: boolean; docs: KitDoc[]; tools: KitTool[]; teamTools: TeamTool[] }> => {
  const none = { ready: false, docs: [], tools: [], teamTools: [] };
  if (!usesDatabase()) return none;
  const db = await createDatabaseClient();
  const docs = await db.from("kit_docs").select("id, kind, title, category, body, audience, reviewed_on, archived, updated_at").order("title").limit(1000);
  if (docs.error) return none;
  const member = await getMember();
  const viewer = await getDeveloperViewer();
  if (viewer?.preview) {
    // Preview as developer: only what the developer's database rules allow (developer
    // pages that aren't archived; tools marked for developers, with the team_tools fields).
    const { data } = await db.from("kit_tools").select("id, name, purpose, url, login_where, for_developers, archived").order("name").limit(500);
    const teamTools = (data ?? [])
      .filter((t) => t.for_developers === true && t.archived !== true)
      .map((t) => ({ id: t.id, name: t.name, purpose: t.purpose, url: typeof t.url === "string" && t.url.startsWith("https://") ? t.url : null, loginWhere: t.login_where }));
    const devDocs = (docs.data ?? []).map((r) => kitDocFrom(r as Record<string, unknown>)).filter((d) => d.audience.includes("developer") && !d.archived);
    return { ready: true, docs: devDocs, tools: [], teamTools };
  }
  const manager = member?.role === "owner" || member?.role === "manager";
  let tools: KitTool[] = [];
  let teamTools: TeamTool[] = [];
  if (manager) {
    const { data } = await db
      .from("kit_tools")
      .select("id, name, purpose, url, login_where, manager_staff_id, access_note, monthly_usd, renews_on, for_developers, archived")
      .order("name")
      .limit(500);
    tools = (data ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      purpose: t.purpose,
      url: typeof t.url === "string" && t.url.startsWith("https://") ? t.url : null,
      loginWhere: t.login_where,
      managerId: t.manager_staff_id,
      accessNote: t.access_note,
      monthlyUsd: t.monthly_usd === null ? null : Number(t.monthly_usd),
      renewsOn: t.renews_on,
      forDevelopers: t.for_developers === true,
      archived: t.archived === true,
    }));
  } else {
    const { data } = await db.from("team_tools").select("id, name, purpose, url, login_where").order("name").limit(500);
    teamTools = (data ?? []).map((t) => ({ id: t.id, name: t.name, purpose: t.purpose, url: typeof t.url === "string" && t.url.startsWith("https://") ? t.url : null, loginWhere: t.login_where }));
  }
  return { ready: true, docs: (docs.data ?? []).map((r) => kitDocFrom(r as Record<string, unknown>)), tools, teamTools };
});

/** One page and (owner/managers only; the database decides) its saved versions, newest first. */
export async function getKitDoc(id: string): Promise<{ doc: KitDoc; versions: KitVersion[] } | null> {
  if (!usesDatabase() || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const db = await createDatabaseClient();
  const { data } = await db.from("kit_docs").select("id, kind, title, category, body, audience, reviewed_on, archived, updated_at").eq("id", id).maybeSingle();
  if (!data) return null;
  if ((await getDeveloperViewer())?.preview) {
    // Preview as developer: developer pages only, and no version history (developers can't read it).
    const doc = kitDocFrom(data as Record<string, unknown>);
    return doc.audience.includes("developer") && !doc.archived ? { doc, versions: [] } : null;
  }
  const { data: v } = await db.from("kit_doc_versions").select("id, title, body, saved_at, saved_by").eq("doc_id", id).order("saved_at", { ascending: false }).limit(50);
  // Who saved each version (team_members names; whatever the database lets this person read).
  const ids = [...new Set((v ?? []).map((r) => r.saved_by).filter(Boolean))];
  const { data: people } = ids.length ? await db.from("team_members").select("user_id, display_name").in("user_id", ids) : { data: [] };
  const names = new Map((people ?? []).map((m) => [m.user_id as string, m.display_name as string]));
  return {
    doc: kitDocFrom(data as Record<string, unknown>),
    versions: (v ?? []).map((r) => ({ id: r.id, title: r.title, body: r.body, savedAt: r.saved_at, savedBy: r.saved_by ? (names.get(r.saved_by) ?? "A teammate") : "Setup" })),
  };
}

// ---------------------------------------------------------------------------
// Billing (0015): OWNER ONLY, read-only copy of GoHighLevel invoices and payments.
// Non-owners get null here, and the database returns them nothing anyway.
// Blank is not zero: totals are null whenever billing isn't trustworthy.
// ---------------------------------------------------------------------------

export interface BillingView {
  configured: boolean;
  tablesReady: boolean;
  state: BillingState;
  totals: BillingTotals;
  plan: { plan: number; collected: number | null; gap: number | null };
  /** Per client slug. */
  byClient: Map<string, ClientBilling>;
  alerts: (PaymentAlert & { slug: string; name: string })[];
  overdueClients: { slug: string; name: string; detail: string; daysLate: number; amountUsd: number }[];
  unmatched: { contactId: string | null; label: string | null; count: number; amountUsd: number }[];
  syncs: BillingSync[];
  records: BillingRecord[];
}

export const getBilling = cache(async (): Promise<BillingView | null> => {
  if (!usesDatabase()) return null;
  const me = await getMember();
  if (!me || me.role !== "owner") return null;
  const db = await createDatabaseClient();
  const configured = isGhlBillingConfigured();
  const [syncRes, recRes, summary] = await Promise.all([
    db.from("billing_syncs").select("started_at, finished_at, ok, invoices_read, payments_read, unmatched, error_code").order("started_at", { ascending: false }).limit(10),
    db.from("billing_records").select("kind, provider_id, provider_contact_id, client_id, unmatched_label, amount_cents, amount_due_cents, currency, status, issued_on, due_on, paid_on, synced_at").limit(5000),
    getRosterSummary(),
  ]);
  const tablesReady = !syncRes.error && !recRes.error;
  const syncs: BillingSync[] = (syncRes.data ?? []).map((r) => ({
    startedAt: r.started_at, finishedAt: r.finished_at, ok: r.ok, invoicesRead: r.invoices_read, paymentsRead: r.payments_read, unmatched: r.unmatched, errorCode: r.error_code,
  }));
  const records: BillingRecord[] = (recRes.data ?? []).map((r) => ({
    kind: r.kind, providerId: r.provider_id, contactId: r.provider_contact_id, clientDbId: r.client_id, unmatchedLabel: r.unmatched_label,
    amountCents: Number(r.amount_cents), amountDueCents: r.amount_due_cents === null ? null : Number(r.amount_due_cents), currency: r.currency,
    status: r.status, issuedOn: r.issued_on, dueOn: r.due_on, paidOn: r.paid_on, syncedAt: r.synced_at,
  }));
  const state = billingState({ configured, tablesReady, syncs, now: new Date() });
  const t = today();
  const totals = billingTotals(records, state, t);
  const byDb = clientBilling(records, state, t);
  const clients = (await roster()).clients;
  const byClient = new Map<string, ClientBilling>();
  const nameOf = new Map<string, { slug: string; name: string }>();
  for (const c of clients) {
    if (!c.dbId) continue;
    nameOf.set(c.dbId, { slug: c.id, name: c.name });
    const b = byDb.get(c.dbId);
    if (b) byClient.set(c.id, b);
  }
  const alerts = paymentAlerts(byDb).flatMap((a) => {
    const c = nameOf.get(a.clientDbId);
    return c ? [{ ...a, ...c }] : [];
  });
  const overdueClients = [...byDb.values()]
    .filter((b) => b.overdueCount > 0)
    .sort((a, b) => b.daysLate - a.daysLate || b.overdueUsd - a.overdueUsd)
    .flatMap((b) => {
      const c = nameOf.get(b.clientDbId);
      return c && b.detail ? [{ ...c, detail: b.detail, daysLate: b.daysLate, amountUsd: b.overdueUsd }] : [];
    });
  return {
    configured,
    tablesReady,
    state,
    totals,
    plan: planVsCollected(summary.activeMrr, totals.collectedThisMonthUsd),
    byClient,
    alerts,
    overdueClients,
    unmatched: unmatchedGroups(records, state),
    syncs,
    records,
  };
});
