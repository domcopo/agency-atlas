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
import { buildPriorities, healthScore, healthSummary, isSalesStage, opportunities, ownershipGaps } from "@/lib/ops";
import { AI_MODEL, budgetState, monthStartIso } from "@/lib/ai/budget";
import { isAiConfigured } from "@/lib/ai/client";
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

/** Reads clients as the signed-in person. Row-level security decides what comes back. */
async function loadDatabaseRoster(): Promise<Roster> {
  const db = await createDatabaseClient();
  const cols = "id, slug, name, monthly_usd, start_date, status, services, listed_in, check_note, follow_up, end_date";
  const [withOwner, checkIns, staff, ghlTimes] = await Promise.all([
    db.from("clients").select(`${cols}, owner_staff_id`),
    readCheckIns(db),
    db.from("staff").select("id, name"),
    // Call/message times from GoHighLevel (0008). Missing table = none yet.
    db
      .from("ghl_contact_stats")
      .select("client_id, last_inbound_at, last_outbound_at, last_call_at, last_call_seconds, last_channel, last_direction, unanswered_outbound, synced_at"),
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

/** All actions (open and done), read as the signed-in person. ready=false before 0006 is run. */
export const getActions = cache(async (): Promise<{ ready: boolean; actions: ClientAction[] }> => {
  if (!usesDatabase()) return { ready: false, actions: [] };
  const db = await createDatabaseClient();
  const [res, team] = await Promise.all([
    db.from("actions").select(ACTION_COLS).order("created_at", { ascending: false }).limit(2000),
    getTeam(),
  ]);
  if (res.error) return { ready: false, actions: [] };
  const byDbId = new Map((await roster()).clients.map((c) => [c.dbId, c]));
  const staffName = new Map(team.members.map((m) => [m.id, m.name]));
  return {
    ready: true,
    actions: (res.data ?? []).map((r) => {
      const c = r.client_id ? byDbId.get(r.client_id) : undefined;
      return {
        id: r.id,
        kind: r.kind,
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
      } as ClientAction;
    }),
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

/** Health, flags and priorities for everyone, computed once per request. */
export const getOps = cache(async () => {
  const [{ clients }, { ready, actions }, allDeals] = await Promise.all([roster(), getActions(), getOpenDeals()]);
  const t = today();
  const checkIns = new Map(clients.map((c) => [c.id, getCheckIn(c)]));
  const health = new Map<string, HealthSummary | null>(clients.map((c) => [c.id, healthSummary(c, checkIns.get(c.id)!, actions, t)]));
  const deals = ready ? allDeals : [];
  const leadNames = new Map(deals.map((d) => [d.ghlId, d.name]));
  const withAction = new Set(actions.filter((a) => a.leadGhlId).map((a) => a.leadGhlId));
  const weekAgo = new Date(Date.parse(t) - 7 * 86_400_000).toISOString().slice(0, 10);
  // Only deals in selling stages count as leads (onboarding/delivery deals don't).
  const newLeads = deals.filter((d) => isSalesStage(d.stage) && (d.createdAt ?? "").slice(0, 10) >= weekAgo && !withAction.has(d.ghlId));
  const priorities: PriorityItem[] = ready
    ? buildPriorities({ clients, actions, health, checkIns, today: t, leadNames, newLeadsWithoutAction: newLeads.length })
    : [];
  const counts = { at_risk: 0, needs_attention: 0, opportunity: 0, healthy: 0 };
  for (const h of health.values()) if (h) counts[h.state]++;
  return { ready, clients, actions, health, checkIns, priorities, counts, gaps: ownershipGaps(clients, actions), today: t, deals, leadNames, newLeads };
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
 */
export const getDeveloperWork = cache(async (): Promise<PriorityItem[]> => {
  if (!usesDatabase()) return [];
  const db = await createDatabaseClient();
  const { data, error } = await db
    .from("my_work")
    .select("id, kind, title, notes, priority, status, due_on, done_at, created_at, client_slug, client_name")
    .order("due_on", { ascending: true, nullsFirst: false });
  if (error || !Array.isArray(data)) return [];
  const t = today();
  const me = await getMember();
  return (data as Record<string, unknown>[])
    .filter((r) => r.status !== "done")
    .map((r) => {
      const action: ClientAction = {
        id: String(r.id),
        kind: r.kind === "issue" ? "issue" : "follow_up",
        title: String(r.title ?? ""),
        notes: (r.notes as string | null) ?? null,
        priority: (["critical", "high", "normal", "low"].includes(String(r.priority)) ? r.priority : "normal") as ClientAction["priority"],
        status: (["open", "in_progress", "waiting", "done"].includes(String(r.status)) ? r.status : "open") as ClientAction["status"],
        dueOn: (r.due_on as string | null) ?? null,
        doneAt: (r.done_at as string | null) ?? null,
        createdAt: String(r.created_at ?? ""),
        ownerId: me?.staffId ?? null,
        ownerName: me?.name ?? null,
        client: null,
        leadGhlId: null,
      };
      const when = !action.dueOn ? "none" : action.dueOn < t ? "overdue" : action.dueOn === t ? "today" : "upcoming";
      const due = !action.dueOn ? "No due date" : when === "overdue" ? `Overdue (was due ${action.dueOn})` : when === "today" ? "Due today" : `Due ${action.dueOn}`;
      const status = action.status === "waiting" ? " · waiting on client" : action.status === "in_progress" ? " · in progress" : "";
      return {
        id: `a_${action.id}`,
        title: r.client_name ? `${String(r.client_name)}: ${action.title}` : action.title,
        reason: `${action.kind === "issue" ? "Issue" : "Follow-up"} · ${due}${status}`,
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
  const [{ clients }, { actions }] = await Promise.all([roster(), getActions()]);
  const byDbId = new Map(clients.map((c) => [c.dbId, c]));
  const actionOwner = new Map(actions.map((a) => [a.id, a.ownerId]));
  return (data ?? []).map((r) => {
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
    s.spentUsd += Number(u.cost_usd);
    s.inputTokens += u.input_tokens + u.cache_read_tokens + u.cache_write_tokens;
    s.outputTokens += u.output_tokens;
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
    costUsd: Number(u.cost_usd),
    outcome: u.outcome,
    tokens: u.input_tokens + u.output_tokens + u.cache_read_tokens + u.cache_write_tokens,
  }));
  return s;
});

/** The latest saved briefing, if any. */
export const getLatestBriefing = cache(async (): Promise<{ createdAt: string; content: Briefing | OpsBriefing } | null> => {
  if (!usesDatabase()) return null;
  const db = await createDatabaseClient();
  const { data, error } = await db.from("ai_briefings").select("created_at, content").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  return { createdAt: data.created_at, content: data.content as Briefing | OpsBriefing };
});

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
