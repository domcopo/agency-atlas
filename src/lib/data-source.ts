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
import { sampleAuditConfig, sampleAuditData } from "@/fixtures/audit-sample";
import { sampleAdsData, sampleAdsIntake, sampleAdsPlans } from "@/fixtures/ads-sample";
import { WATCH_SAMPLE_TODAY, watchSample, watchSampleOpportunities, watchSampleRoom, type SampleOpportunity } from "@/fixtures/watch-sample";
import { WATCH_RULES, type RankCheck, type VolumeMonth, type WatchClient, type WatchData, type WatchMarket } from "@/lib/watch/compute";
import { fromAudit, type AuditImport } from "@/lib/watch/lists";
import { parseAuditConfig } from "@/lib/audit/config";
import type { AuditBundle } from "@/lib/audit/data";
import { buildAuditConfig, emptyAuditData, parseIntake, parsePlans, type AuditAgencySettings, type AuditIntake } from "@/lib/audit/intake";
import { deckPages, parseSections, type AuditSectionId } from "@/lib/audit/sections";
import { adsDeckPages, emptyAdsData, parseAdsIntake, parseAdsPlans, parseAdsSections, type AdsBundle, type AdsIntake, type AdsPlan, type AdsSectionId } from "@/lib/audit/ads";
import { AUDIT_CAP_DEFAULTS, spendSummary, type AuditCaps, type SpendSummary } from "@/lib/audit/spend";
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
import { SALES_RULES, type LeadFollowUp, type LeadTouch, type SalesLead, type SalesPerson, type SalesPipeline } from "@/lib/sales";
import { isLead } from "@/lib/roles";
import { asOutcome, asVisitKind, PROSPECT_STATUSES, SCOUT_RULES, type Prospect as ScoutProspect, type ProspectStatus, type ScoutSignals, type ScoutSpendRow, type ScoutVisit } from "@/lib/scout";
import {
  buildPriorities,
  byImportance,
  developerClientScope,
  developerWorkScope,
  healthScore,
  healthSummary,
  isImportant,
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
import { journeyState, type JourneyState, type TouchLog } from "@/lib/journey";
import type { BoardRow } from "@/lib/leaderboard";
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
  CarePlan,
  ClientPlanRef,
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
  EditableCheckIn,
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
  Service,
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

type CheckInRow = { id: string; client_id: string; happened_on: string; note: string | null; mood: CheckInMood | null; kind: ContactKind; removed: boolean };

/**
 * All check-ins, newest first, INCLUDING removed ones (0021). Works before and after the
 * 0004 "mood", 0006 "kind" and 0021 "removed_at" columns exist.
 */
const readAllCheckIns = cache(async (db: DbClient): Promise<CheckInRow[]> => {
  const order = { ascending: false } as const;
  const read = (cols: string) => db.from("check_ins").select(cols).order("happened_on", order).order("created_at", order);
  type Raw = { id: string; client_id: string; happened_on: string; note: string | null; mood?: unknown; kind?: unknown; removed_at?: string | null };
  const map = (rows: unknown) => ((rows ?? []) as Raw[]).map((r) => ({ id: r.id, client_id: r.client_id, happened_on: r.happened_on, note: r.note, mood: asMood(r.mood), kind: asKind(r.kind), removed: Boolean(r.removed_at) }));
  for (const cols of ["id, client_id, happened_on, note, mood, kind, removed_at", "id, client_id, happened_on, note, mood, kind", "id, client_id, happened_on, note, mood", "id, client_id, happened_on, note"]) {
    const res = await read(cols);
    if (!res.error) return map(res.data);
  }
  return [];
});

/** Check-ins that count: removed ones (0021) are left out of health, last contact, AI and history. */
const readCheckIns = cache(async (db: DbClient): Promise<CheckInRow[]> => (await readAllCheckIns(db)).filter((r) => !r.removed));

/** The latest check-ins for one client (database mode only). */
export async function getCheckInHistory(clientDbId: string | undefined, limit = 6): Promise<CheckInEntry[]> {
  if (!usesDatabase() || !clientDbId || !/^[0-9a-f-]{36}$/.test(clientDbId)) return [];
  const db = await createDatabaseClient();
  return (await readCheckIns(db))
    .filter((r) => r.client_id === clientDbId)
    .slice(0, limit)
    .map((r) => ({ date: r.happened_on, note: r.note, mood: r.mood, kind: r.kind }));
}

/** Owner only: one client's removed check-ins (0021), newest first, so they can be restored. */
export async function getRemovedCheckIns(clientDbId: string | undefined): Promise<EditableCheckIn[]> {
  if (!usesDatabase() || !clientDbId || !/^[0-9a-f-]{36}$/.test(clientDbId)) return [];
  if ((await getCurrentMember())?.role !== "owner") return [];
  const db = await createDatabaseClient();
  return (await readAllCheckIns(db))
    .filter((r) => r.removed && r.client_id === clientDbId)
    .map((r) => ({ id: r.id, date: r.happened_on, note: r.note, mood: r.mood, kind: r.kind }));
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

/** Columns every client read uses. Never monthly_usd: from 0025 that is locked (client_money). */
const CLIENT_COLS = "id, slug, name, start_date, status, services, listed_in, check_note, follow_up, end_date";
const CARE_PLAN_COLS = "id, service, name, rank, hours_per_month, includes, heat_maps_per_month, report_every_days, mid_month_check_in, competitor_review_months, top_tier, archived";

type ClientRow = {
  id: string;
  slug: string;
  name: string;
  start_date: string;
  status: string;
  services: string[] | null;
  listed_in: string[] | null;
  check_note: string | null;
  follow_up: string | null;
  end_date: string | null;
  owner_staff_id: string | null;
  vip?: boolean | null;
  backup_staff_id?: string | null;
  care_started_on?: string | null;
  memory_goal?: string | null;
  memory_tone?: string | null;
  memory_next_ask?: string | null;
  monthly_usd?: number | string | null;
};

function toCarePlan(r: Record<string, unknown>): CarePlan {
  return {
    id: r.id as string,
    service: r.service as Service,
    name: r.name as string,
    rank: Number(r.rank),
    hoursPerMonth: r.hours_per_month === null ? null : Number(r.hours_per_month),
    includes: (r.includes as string[] | null) ?? [],
    heatMapsPerMonth: r.heat_maps_per_month === null ? null : Number(r.heat_maps_per_month),
    reportEveryDays: Number(r.report_every_days),
    midMonthCheckIn: Boolean(r.mid_month_check_in),
    competitorReviewMonths: Number(r.competitor_review_months),
    topTier: Boolean(r.top_tier),
    archived: Boolean(r.archived),
  };
}

/**
 * Client rows, newest database shape first. Before 0025 there are no care columns (and
 * monthly_usd is still readable); before 0006 there is no owner column.
 */
async function readClientRows(db: DbClient): Promise<{ data: ClientRow[] | null; careReady: boolean }> {
  // 0028 adds client memory; before it, read without.
  const journey = await db.from("clients").select(`${CLIENT_COLS}, owner_staff_id, vip, backup_staff_id, care_started_on, memory_goal, memory_tone, memory_next_ask`);
  if (!journey.error) return { data: (journey.data ?? []) as ClientRow[], careReady: true };
  const care = await db.from("clients").select(`${CLIENT_COLS}, owner_staff_id, vip, backup_staff_id, care_started_on`);
  if (!care.error) return { data: (care.data ?? []) as ClientRow[], careReady: true };
  const withOwner = await db.from("clients").select(`${CLIENT_COLS}, monthly_usd, owner_staff_id`);
  if (!withOwner.error) return { data: (withOwner.data ?? []) as ClientRow[], careReady: false };
  const bare = await db.from("clients").select(`${CLIENT_COLS}, monthly_usd`);
  return { data: bare.error ? null : ((bare.data ?? []) as ClientRow[]).map((r) => ({ ...r, owner_staff_id: null })), careReady: false };
}

/**
 * Monthly amounts by client id. OWNER ONLY: everyone else gets null (hidden), even before
 * 0025 when the database would still allow it. After 0025 they live in client_money.
 */
async function readClientMoney(db: DbClient, rows: ClientRow[], careReady: boolean, isOwner: boolean): Promise<Map<string, number> | null> {
  if (!isOwner) return null;
  if (!careReady) return new Map(rows.map((r) => [r.id, Number(r.monthly_usd ?? 0)]));
  const { data, error } = await db.from("client_money").select("client_id, monthly_usd").limit(5000);
  if (error) return new Map();
  return new Map((data ?? []).map((m) => [m.client_id as string, Number(m.monthly_usd)]));
}

/** Journey touches (0028), by client database id, newest first. ready=false before 0028. */
export const getCareTouches = cache(async (): Promise<{ ready: boolean; byClient: Map<string, TouchLog[]> }> => {
  const byClient = new Map<string, TouchLog[]>();
  if (!usesDatabase()) return { ready: false, byClient };
  const db = await createDatabaseClient();
  const { data, error } = await db.from("care_touches").select("client_id, step, status, happened_on").order("created_at", { ascending: false }).limit(10000);
  if (error) return { ready: false, byClient };
  for (const r of data ?? []) {
    const list = byClient.get(r.client_id as string) ?? [];
    list.push({ step: Number(r.step), status: r.status === "skipped" ? "skipped" : "done", happenedOn: r.happened_on as string });
    byClient.set(r.client_id as string, list);
  }
  return { ready: true, byClient };
});

/**
 * Where each current client is on the journey (0028), by slug. Rhythm comes from the
 * client's SEO tier (else their first tier, else monthly + mid-month check-in).
 */
export const getJourneys = cache(async (): Promise<{ ready: boolean; bySlug: Map<string, JourneyState> }> => {
  const [clients, touches, care] = await Promise.all([getRoster(), getCareTouches(), getCarePlans()]);
  const bySlug = new Map<string, JourneyState>();
  if (!touches.ready) return { ready: false, bySlug };
  const planById = new Map(care.plans.map((p) => [p.id, p]));
  for (const c of clients) {
    if (c.status !== "active" || !c.dbId) continue;
    const ref = c.plans?.find((p) => p.service === "SEO") ?? c.plans?.[0];
    const plan = ref ? planById.get(ref.planId) : undefined;
    bySlug.set(
      c.id,
      journeyState({ startedOn: c.careStartedOn ?? null, touches: touches.byClient.get(c.dbId) ?? [], plan: plan ?? null, lastContact: c.lastContact ?? null, today: today() }),
    );
  }
  return { ready: true, bySlug };
});

export interface StatusChange {
  at: string;
  from: string;
  to: string;
  reason: string | null;
  note: string | null;
}

/** One client's status log (0028), newest first. Empty before 0028. */
export async function getStatusLog(clientDbId: string | undefined): Promise<StatusChange[]> {
  if (!usesDatabase() || !clientDbId || !/^[0-9a-f-]{36}$/.test(clientDbId)) return [];
  const db = await createDatabaseClient();
  const { data, error } = await db
    .from("client_status_changes")
    .select("created_at, from_status, to_status, reason, note")
    .eq("client_id", clientDbId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) return [];
  return (data ?? []).map((r) => ({ at: r.created_at as string, from: r.from_status as string, to: r.to_status as string, reason: (r.reason as string | null) ?? null, note: (r.note as string | null) ?? null }));
}

/** Plan tiers (0025), archived ones included so old assignments still have a name. Empty before 0025. */
export const getCarePlans = cache(async (): Promise<{ ready: boolean; plans: CarePlan[] }> => {
  if (!usesDatabase()) return { ready: false, plans: [] };
  const db = await createDatabaseClient();
  const { data, error } = await db.from("care_plans").select(CARE_PLAN_COLS).order("service").order("rank");
  if (error) return { ready: false, plans: [] };
  return { ready: true, plans: (data ?? []).map((r) => toCarePlan(r)) };
});

/** Reads clients as the signed-in person. Row-level security decides what comes back. */
async function loadDatabaseRoster(): Promise<Roster> {
  const db = await createDatabaseClient();
  const [clients, checkIns, staff, ghlTimes, trashed, me, planRead, carePlans] = await Promise.all([
    readClientRows(db),
    readCheckIns(db),
    db.from("staff").select("id, name"),
    // Call/message times from GoHighLevel (0008). Missing table = none yet.
    db
      .from("ghl_contact_stats")
      .select("client_id, last_inbound_at, last_outbound_at, last_call_at, last_call_seconds, last_channel, last_direction, unanswered_outbound, synced_at"),
    getTrashedIds(),
    getMember(),
    db.from("client_plans").select("client_id, service, plan_id"),
    getCarePlans(),
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
  const staffName = new Map((staff.data ?? []).map((m) => [m.id as string, m.name as string]));
  if (!clients.data) return { source: "database", clients: [], skipped: 0 };
  const money = await readClientMoney(db, clients.data, clients.careReady, me?.role === "owner");
  const planById = new Map(carePlans.plans.map((p) => [p.id, p]));
  const plansByClient = new Map<string, ClientPlanRef[]>();
  for (const r of planRead.error ? [] : (planRead.data ?? [])) {
    const p = r.plan_id ? planById.get(r.plan_id as string) : undefined;
    if (!p) continue;
    const list = plansByClient.get(r.client_id as string) ?? [];
    list.push({ service: p.service, planId: p.id, name: p.name, rank: p.rank, topTier: p.topTier });
    plansByClient.set(r.client_id as string, list);
  }
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
      monthlyUsd: money ? (money.get(r.id) ?? 0) : null,
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
      vip: Boolean(r.vip),
      backupId: r.backup_staff_id ?? undefined,
      backupName: r.backup_staff_id ? staffName.get(r.backup_staff_id) : undefined,
      careStartedOn: r.care_started_on ?? undefined,
      plans: (plansByClient.get(r.id) ?? []).sort((a, b) => a.service.localeCompare(b.service)),
      memory: { goal: r.memory_goal ?? null, tone: r.memory_tone ?? null, nextAsk: r.memory_next_ask ?? null },
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
    (a, b) => statusOrder[a.status] - statusOrder[b.status] || byImportance(a, b) || a.name.localeCompare(b.name),
  );
}

export async function getRosterClient(id: string): Promise<RosterClient | undefined> {
  return (await roster()).clients.find((c) => c.id === id);
}

/** Price band from the amount (owner only). Everyone else gets null: show the plan tier instead. */
export function tierOf(monthlyUsd: number | null): ClientTier | null {
  if (monthlyUsd === null) return null;
  if (monthlyUsd >= 500) return "high";
  if (monthlyUsd >= 150) return "mid";
  return "low";
}

export async function getRosterSummary(): Promise<RosterSummary> {
  const { clients, source, skipped } = await roster();
  const sum = (xs: RosterClient[]) => Math.round(xs.reduce((n, c) => n + (c.monthlyUsd ?? 0), 0) * 100) / 100;
  const by = (s: SubscriptionStatus) => clients.filter((c) => c.status === s);
  // Amounts are owner-only (null for everyone else); then every money field is 0 and hidden.
  const moneyShown = clients.length > 0 && clients.every((c) => c.monthlyUsd !== null);
  const active = by("active");
  const tiers = { high: { count: 0, mrr: 0 }, mid: { count: 0, mrr: 0 }, low: { count: 0, mrr: 0 } };
  for (const c of active) {
    const band = tierOf(c.monthlyUsd);
    if (!band) continue;
    const t = tiers[band];
    t.count++;
    t.mrr = Math.round((t.mrr + (c.monthlyUsd ?? 0)) * 100) / 100;
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
    moneyShown,
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
      mrrAdded: Math.round(signed.reduce((n, c) => n + (c.monthlyUsd ?? 0), 0) * 100) / 100,
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
  const money = (xs: RosterClient[]) => Math.round(xs.reduce((n, c) => n + (c.monthlyUsd ?? 0), 0) * 100) / 100;
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
    /** False for everyone but the owner: the *Mrr numbers above are 0 and must not be shown. */
    moneyShown: clients.length > 0 && clients.every((c) => c.monthlyUsd !== null),
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
    .sort(byImportance)
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
    realAlerts.push({ id: "al_paused", isSynthetic: false, href: "/clients#paused", severity: "warning", title: `${s.pausedCount} clients paused${label}`, detail: s.moneyShown ? `$${s.pausedMrr.toLocaleString("en-US")}/mo on hold. Worth a check-in call to win them back.` : "Worth a check-in call to win them back." });
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
      title: c.monthlyUsd === null ? `Signed: ${c.name}` : `Signed: ${c.name} · $${c.monthlyUsd.toLocaleString("en-US")}/mo`,
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
    { cols: `${ACTION_COLS}, ${PROMISE_COLS}, ${ORDER_COLS}, ${REVIEW_COLS}, ${CANCEL_COLS}, ${STEPS_DONE_COL}, ${V2_COLS}, archived_at, internal`, promises: true, orders: true, review: true, cancel: true }, // 0022
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
        internal: (r as Record<string, unknown>).internal === true,
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
  /** A logged check-in (owner/managers can fix or remove it, 0021). */
  checkIn?: EditableCheckIn;
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
    out.push({
      at: r.happened_on,
      kind: "contact",
      title: `${words[r.kind]} logged${mood}`,
      detail: r.note,
      tone: r.mood === "worse" ? "bad" : r.mood === "better" ? "good" : "neutral",
      checkIn: { id: r.id, date: r.happened_on, note: r.note, mood: r.mood, kind: r.kind },
    });
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
    let { data, error } = await read(`${base}, ${PROMISE_COLS}, steps, source_link, source_note, est_minutes, ${REVIEW_COLS}, ${STEPS_DONE_COL}, ${V2_COLS}, internal`);
    if (error) ({ data, error } = await read(`${base}, ${PROMISE_COLS}, steps, source_link, source_note, est_minutes, ${REVIEW_COLS}, ${STEPS_DONE_COL}, ${V2_COLS}`)); // before 0022
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
      internal: r.internal === true,
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
  kind: "assigned" | "unassigned" | "due_changed" | "comment" | "reassign_request" | "due_tomorrow" | "client_lost";
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
  { kind: "client_lost", label: "A manager marks a client lost (0028)", who: "owner" },
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
  return { ready: true, rows: rows.sort((a, b) => rank(a) - rank(b) || byImportance(a.client, b.client)) };
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
      closeness: clamp((risk ? 0.6 : 0.3) + h.reasons.length * 0.08 + Math.min(c.monthlyUsd ?? (isImportant(c) ? 1000 : 0), 1000) / 5000),
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

  const byValue = [...clients].sort(byImportance);
  const base = (c: RosterClient) => ({ clientDbId: c.dbId ?? "", clientSlug: c.id, clientName: c.name, services: c.services });
  const out: AtlasQuestion[] = [];
  const current = (c: RosterClient) => c.status === "active" || c.status === "paused";

  for (const c of byValue.filter((x) => current(x) && x.services.length === 1 && x.services[0] === "Ads" && (x.monthlyUsd ?? 0) >= 150))
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
// Sales (0020): leads in the sales pipelines, reach-outs, targets. Read as the signed-in
// person: salespeople get only open sales-pipeline leads and their own target (the
// database decides); the owner and managers see everything in the sales pipelines.
// ---------------------------------------------------------------------------

const LEAD_STATUSES = ["open", "won", "lost", "abandoned"] as const;

export interface SalesData {
  /** false before 0020, or for roles that don't use Sales. */
  ready: boolean;
  pipelines: SalesPipeline[];
  leads: SalesLead[];
  touches: LeadTouch[];
  followUps: LeadFollowUp[];
  /** GoHighLevel user id → name. */
  users: Map<string, string>;
  /** Newest lead refresh or owner Sync this person can see. */
  lastRefresh: string | null;
  myTarget: number;
  /** Owner only: salespeople with their targets (others can't read the team list). */
  people: SalesPerson[];
}

export const getSales = cache(async (): Promise<SalesData> => {
  const none: SalesData = { ready: false, pipelines: [], leads: [], touches: [], followUps: [], users: new Map(), lastRefresh: null, myTarget: SALES_RULES.defaultTarget, people: [] };
  if (!usesDatabase()) return none;
  const me = await getMember();
  if (!me || (!isLead(me.role) && me.role !== "sales")) return none;
  const db = await createDatabaseClient();
  const pl = await db.from("sales_pipelines").select("pipeline_id, pipeline_name, hot_stages, active").order("pipeline_name");
  if (pl.error) return none; // before 0020
  const pipelines: SalesPipeline[] = (pl.data ?? []).map((r) => ({
    id: r.pipeline_id,
    name: r.pipeline_name,
    hotStages: Array.isArray(r.hot_stages) ? (r.hot_stages as string[]) : [],
    active: r.active === true,
  }));
  const activeIds = pipelines.filter((p) => p.active).map((p) => p.id);
  const since = new Date(Date.now() - SALES_RULES.touchDays * 86_400_000).toISOString();
  const [opps, touches, users, refreshes, syncs, target, actions] = await Promise.all([
    activeIds.length
      ? db
          .from("ghl_opportunities")
          .select("ghl_id, name, pipeline_id, pipeline_name, stage_name, status, monetary_value, source, ghl_created_at, ghl_updated_at, status_changed_at, assigned_user_id")
          .in("pipeline_id", activeIds)
          .order("ghl_created_at", { ascending: false, nullsFirst: false })
          .limit(3000)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    db.from("lead_touches").select("lead_ghl_id, kind, touched_at, touched_by").gte("touched_at", since).order("touched_at", { ascending: false }).limit(5000),
    db.from("ghl_users").select("ghl_user_id, name").limit(500),
    db.from("lead_refreshes").select("ran_at").order("ran_at", { ascending: false }).limit(1),
    // Salespeople can't read the owner's Sync log (the database returns nothing); that's fine.
    db.from("ghl_syncs").select("ran_at").order("ran_at", { ascending: false }).limit(1),
    db.from("sales_targets").select("daily_target").eq("user_id", me.userId).maybeSingle(),
    getActions(),
  ]);
  const leads: SalesLead[] = ((opps.data ?? []) as Record<string, unknown>[]).map((r) => ({
    ghlId: String(r.ghl_id),
    name: (r.name as string | null) || "Unnamed lead",
    pipelineId: (r.pipeline_id as string | null) ?? null,
    pipelineName: (r.pipeline_name as string | null) ?? null,
    stage: (r.stage_name as string | null) ?? null,
    status: LEAD_STATUSES.find((x) => x === r.status) ?? "open",
    value: r.monetary_value === null || r.monetary_value === undefined ? null : Number(r.monetary_value),
    source: (r.source as string | null) ?? null,
    createdAt: (r.ghl_created_at as string | null) ?? null,
    updatedAt: (r.ghl_updated_at as string | null) ?? null,
    statusChangedAt: (r.status_changed_at as string | null) ?? null,
    assignedUserId: (r.assigned_user_id as string | null) ?? null,
  }));
  const leadIds = new Set(leads.map((l) => l.ghlId));
  const latest = [refreshes.data?.[0]?.ran_at, syncs.data?.[0]?.ran_at].filter((x): x is string => Boolean(x)).sort().pop() ?? null;
  let people: SalesPerson[] = [];
  if (me.role === "owner") {
    const [tm, targets] = await Promise.all([
      db.from("team_members").select("user_id, display_name, role, staff_id, ghl_user_id").eq("role", "sales"),
      db.from("sales_targets").select("user_id, daily_target"),
    ]);
    const byUser = new Map((targets.data ?? []).map((t) => [t.user_id as string, Number(t.daily_target)]));
    people = (tm.data ?? []).map((r) => ({
      userId: r.user_id as string,
      name: r.display_name as string,
      ghlUserId: (r.ghl_user_id as string | null) ?? null,
      staffId: (r.staff_id as string | null) ?? null,
      target: byUser.get(r.user_id as string) ?? SALES_RULES.defaultTarget,
    }));
  }
  return {
    ready: true,
    pipelines,
    leads,
    touches: (touches.data ?? []).map((t) => ({ leadId: t.lead_ghl_id, kind: t.kind, at: t.touched_at, by: t.touched_by })),
    followUps: actions.actions
      .filter((a) => a.leadGhlId && a.kind === "follow_up" && leadIds.has(a.leadGhlId))
      .map((a) => ({ id: a.id, leadId: a.leadGhlId!, title: a.title, dueOn: a.dueOn, status: a.status, ownerStaffId: a.ownerId })),
    users: new Map((users.data ?? []).map((u) => [u.ghl_user_id as string, u.name as string])),
    lastRefresh: latest,
    myTarget: target.data ? Number(target.data.daily_target) : SALES_RULES.defaultTarget,
    people,
  };
});

export interface SalesSetup {
  ready: boolean;
  /** Every pipeline in the synced copy, with its stages, for ticking. */
  available: { id: string; name: string; stages: string[]; leads: number }[];
  /** Logins (owner reads all), for linking to GoHighLevel users. */
  logins: { userId: string; name: string; role: string; ghlUserId: string | null }[];
  ghlUsers: { id: string; name: string }[];
}

/** The owner's Sales setup screen. null for everyone else. */
export async function getSalesSetup(): Promise<SalesSetup | null> {
  if (!usesDatabase()) return null;
  const me = await getMember();
  if (me?.role !== "owner") return null;
  const db = await createDatabaseClient();
  const [opps, tm, users] = await Promise.all([
    db.from("ghl_opportunities").select("pipeline_id, pipeline_name, stage_name").not("pipeline_id", "is", null).limit(10000),
    db.from("team_members").select("user_id, display_name, role, ghl_user_id").order("display_name"),
    db.from("ghl_users").select("ghl_user_id, name").order("name").limit(500),
  ]);
  if (opps.error || tm.error) return { ready: false, available: [], logins: [], ghlUsers: [] };
  const byId = new Map<string, { id: string; name: string; stages: Map<string, number>; leads: number }>();
  for (const r of opps.data ?? []) {
    const id = r.pipeline_id as string;
    const p = byId.get(id) ?? { id, name: (r.pipeline_name as string | null) || "Unnamed pipeline", stages: new Map(), leads: 0 };
    p.leads++;
    if (r.stage_name) p.stages.set(r.stage_name as string, (p.stages.get(r.stage_name as string) ?? 0) + 1);
    byId.set(id, p);
  }
  return {
    ready: true,
    available: [...byId.values()].map((p) => ({ id: p.id, name: p.name, leads: p.leads, stages: [...p.stages.keys()].sort() })).sort((a, b) => a.name.localeCompare(b.name)),
    logins: (tm.data ?? []).map((r) => ({ userId: r.user_id as string, name: r.display_name as string, role: r.role as string, ghlUserId: (r.ghl_user_id as string | null) ?? null })),
    ghlUsers: (users.data ?? []).map((u) => ({ id: u.ghl_user_id as string, name: u.name as string })),
  };
}

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
    activeMrr: active.reduce((n, c) => n + (c.monthlyUsd ?? 0), 0),
    moneyShown: clients.every((c) => c.monthlyUsd !== null),
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
    audience: (Array.isArray(r.audience) ? r.audience : []).filter((a): a is KitDoc["audience"][number] => a === "manager" || a === "developer" || a === "sales"),
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

// ---------------------------------------------------------------------------
// SEO audits. The template preview is a fictional business shown with "SAMPLE" on every
// page (a dry run at $0); it is not client data, so it shows even with the database on.
// Saved audits (0023) are read AS the signed-in person: the database decides which come
// back (owner/managers: all; a salesperson: only their own; developers: none).

export const SAMPLE_AUDIT_ID = "sample";

export function getAuditPreview(id: string): AuditBundle | null {
  if (id !== SAMPLE_AUDIT_ID) return null;
  return { id: SAMPLE_AUDIT_ID, sample: true, config: sampleAuditConfig, data: sampleAuditData };
}

/** The fictional Google Ads audit template (made-up business and numbers, labeled sample). */
export const SAMPLE_ADS_AUDIT_ID = "sample-ads";

export function getAdsPreview(id: string): AdsBundle | null {
  if (id !== SAMPLE_ADS_AUDIT_ID) return null;
  return { id: SAMPLE_ADS_AUDIT_ID, sample: true, agencyName: "Your Agency (sample)", agencyWebsite: "agency.example.com", intake: sampleAdsIntake, plans: sampleAdsPlans, data: sampleAdsData };
}


export interface AuditSettingsView {
  /** false = 0023 not run yet (or no database). */
  ready: boolean;
  caps: AuditCaps;
  agency: AuditAgencySettings;
  /** false = 0029 not run yet: Google Ads audits can't be saved and Ads prices can't be set. */
  adsReady: boolean;
  /** The owner's Google Ads management plans (0029). */
  adsPlans: AdsPlan[];
  /** The owner's weekly cap for the signed-in person, when one is set. */
  myWeeklyCap: number | null;
  /** Owner only: per-salesperson weekly caps, by login. */
  userCaps: Map<string, number>;
}

const NO_AUDIT_SETTINGS: AuditSettingsView = {
  ready: false,
  caps: AUDIT_CAP_DEFAULTS,
  agency: { agencyName: null, agencyWebsite: null, plans: [], perAuditUsd: AUDIT_CAP_DEFAULTS.perAuditUsd },
  adsReady: false,
  adsPlans: [],
  myWeeklyCap: null,
  userCaps: new Map(),
};

export const getAuditSettings = cache(async (): Promise<AuditSettingsView> => {
  if (!usesDatabase()) return NO_AUDIT_SETTINGS;
  const me = await getMember();
  if (!me || (!isLead(me.role) && me.role !== "sales")) return NO_AUDIT_SETTINGS;
  const db = await createDatabaseClient();
  const SETTINGS_COLUMNS = "per_audit_usd, weekly_usd, monthly_usd, agency_name, agency_website, plans";
  const [withAds, limits] = await Promise.all([
    db.from("audit_settings").select(`${SETTINGS_COLUMNS}, ads_plans`).maybeSingle(),
    db.from("audit_user_limits").select("user_id, weekly_usd"),
  ]);
  // Before 0029 the ads_plans column doesn't exist yet: read the rest and say "needs 0029".
  const adsReady = !withAds.error;
  const settings = adsReady ? withAds : await db.from("audit_settings").select(SETTINGS_COLUMNS).maybeSingle();
  if (settings.error || !settings.data) return NO_AUDIT_SETTINGS;
  const r = settings.data as Record<string, unknown>;
  const caps = { perAuditUsd: Number(r.per_audit_usd), weeklyUsd: Number(r.weekly_usd), monthlyUsd: Number(r.monthly_usd) };
  const userCaps = new Map((limits.data ?? []).map((l) => [l.user_id as string, Number(l.weekly_usd)]));
  return {
    ready: true,
    caps,
    agency: { agencyName: (r.agency_name as string | null) ?? null, agencyWebsite: (r.agency_website as string | null) ?? null, plans: parsePlans(r.plans), perAuditUsd: caps.perAuditUsd },
    adsReady,
    adsPlans: adsReady ? parseAdsPlans(r.ads_plans) : [],
    myWeeklyCap: userCaps.get(me.userId) ?? null,
    userCaps,
  };
});

export interface SavedAudit {
  id: string;
  title: string;
  kind: "seo" | "ads";
  leadGhlId: string | null;
  createdBy: string;
  /** Who made it ("you", or a name for the owner and managers). */
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  /** SEO audits: the checkpoints (empty for a Google Ads audit). */
  sections: AuditSectionId[];
  /** SEO audits: null = the saved intake no longer passes the check ("needs fixing"). Always null for Google Ads audits. */
  intake: AuditIntake | null;
  /** Google Ads audits only (0029): their own intake check and checkpoints. */
  ads: { intake: AdsIntake | null; sections: AdsSectionId[] } | null;
  /** What every list shows, from either kind (null = needs fixing). */
  base: { company: string; domain: string; hqTown: string; state: string; competitors: number } | null;
  /** Pages in its deck. */
  pageCount: number;
  rawIntake: Record<string, unknown>;
  hasResults: boolean;
  dataRetrieved: string | null;
}

const AUDIT_COLUMNS = "id, title, kind, lead_ghl_id, created_by, created_at, updated_at, archived_at, sections, intake, data_retrieved";

function toSavedAudit(r: Record<string, unknown>, me: string, names: Map<string, string>): SavedAudit {
  const raw = r.intake && typeof r.intake === "object" && !Array.isArray(r.intake) ? (r.intake as Record<string, unknown>) : {};
  const kind = r.kind === "ads" ? "ads" : "seo";
  const parsed = kind === "seo" ? parseIntake(raw) : null;
  const adsParsed = kind === "ads" ? parseAdsIntake(raw) : null;
  const seoIntake = parsed?.ok ? parsed.intake : null;
  const adsIntake = adsParsed?.ok ? adsParsed.intake : null;
  const adsSections = kind === "ads" ? parseAdsSections(r.sections) : [];
  const seoSections = kind === "seo" ? parseSections(r.sections) : [];
  const shared = seoIntake ?? adsIntake;
  const by = r.created_by as string;
  return {
    id: r.id as string,
    title: r.title as string,
    kind,
    leadGhlId: (r.lead_ghl_id as string | null) ?? null,
    createdBy: by,
    createdByName: by === me ? "you" : (names.get(by) ?? null),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    archived: Boolean(r.archived_at),
    sections: seoSections,
    intake: seoIntake,
    ads: kind === "ads" ? { intake: adsIntake, sections: adsSections } : null,
    base: shared ? { company: shared.company, domain: shared.domain, hqTown: shared.hqTown, state: shared.state, competitors: shared.competitors.length } : null,
    pageCount: kind === "ads" ? adsDeckPages(adsSections).length : deckPages(seoSections).length,
    rawIntake: raw,
    hasResults: Boolean(r.data_retrieved),
    dataRetrieved: (r.data_retrieved as string | null) ?? null,
  };
}

/** Saved audits the signed-in person may see, newest first (archived ones last). */
export const getAudits = cache(async (): Promise<{ ready: boolean; audits: SavedAudit[] }> => {
  if (!usesDatabase()) return { ready: false, audits: [] };
  const me = await getMember();
  if (!me || (!isLead(me.role) && me.role !== "sales")) return { ready: false, audits: [] };
  const db = await createDatabaseClient();
  const [rows, team] = await Promise.all([
    db.from("audits").select(AUDIT_COLUMNS).order("created_at", { ascending: false }).limit(300),
    isLead(me.role) ? db.from("team_members").select("user_id, display_name") : Promise.resolve({ data: [] as { user_id: string; display_name: string }[] }),
  ]);
  if (rows.error) return { ready: false, audits: [] };
  const names = new Map((team.data ?? []).map((t) => [t.user_id as string, t.display_name as string]));
  const audits = (rows.data ?? []).map((r) => toSavedAudit(r, me.userId, names));
  return { ready: true, audits: [...audits.filter((a) => !a.archived), ...audits.filter((a) => a.archived)] };
});

/**
 * Sales leaderboard (0026 view): names + this month's Won totals only. The database decides
 * who may read it (owner, managers, sales, with two-factor) and adds up the deals; a
 * salesperson never gets the deals themselves. Before 0026 is run: ready false.
 * Demo mode: three fictional reps, labeled as samples.
 */
export const getLeaderboard = cache(async (): Promise<{ ready: boolean; sample: boolean; scope: "sales" | "all"; rows: BoardRow[] }> => {
  if (!usesDatabase()) {
    if (!showsSamples()) return { ready: false, sample: false, scope: "all", rows: [] };
    return {
      ready: true,
      sample: true,
      scope: "sales",
      rows: [
        { name: "Avery Sample (sample)", isMe: true, linked: true, wonUsd: 12400, wonDeals: 3 },
        { name: "Blake Sample (sample)", isMe: false, linked: true, wonUsd: 4800, wonDeals: 1 },
        { name: "Casey Sample (sample)", isMe: false, linked: true, wonUsd: 0, wonDeals: 0 },
      ],
    };
  }
  const none = { ready: false, sample: false, scope: "all" as const, rows: [] };
  const me = await getMember();
  if (!me || (!isLead(me.role) && me.role !== "sales")) return none;
  const db = await createDatabaseClient();
  const [board, pipes] = await Promise.all([
    db.from("sales_leaderboard").select("name, is_me, linked, won_usd, won_deals").limit(100),
    db.from("sales_pipelines").select("pipeline_id").eq("active", true).limit(1),
  ]);
  if (board.error) return none;
  return {
    ready: true,
    sample: false,
    scope: (pipes.data ?? []).length > 0 ? "sales" : "all",
    rows: (board.data ?? []).map((r) => ({
      name: String(r.name ?? ""),
      isMe: r.is_me === true,
      linked: r.linked === true,
      wonUsd: Number(r.won_usd ?? 0) || 0,
      wonDeals: Number(r.won_deals ?? 0) || 0,
    })),
  };
});

/** One saved audit (or null: not found, or not one the database lets this person read). */
export async function getSavedAudit(id: string): Promise<SavedAudit | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return null;
  return (await getAudits()).audits.find((a) => a.id === id) ?? null;
}

/**
 * The pages for a saved audit. Phase A: settings come from the intake + the owner's audit
 * settings, and every figure is "not found" (nothing is pulled yet). Attached results
 * come in Phase B, with their own strict check.
 */
export async function getSavedAuditBundle(audit: SavedAudit): Promise<AuditBundle | null> {
  if (!audit.intake) return null;
  const settings = await getAuditSettings();
  const day = audit.createdAt.slice(0, 10);
  const config = buildAuditConfig(audit.intake, settings.agency, day);
  return { id: audit.id, sample: false, config, data: emptyAuditData(config, day) };
}

/** The pages for a saved Google Ads audit: settings from the intake + owner's Ads plans, every figure "not pulled yet". */
export async function getSavedAdsBundle(audit: SavedAudit): Promise<AdsBundle | null> {
  const intake = audit.ads?.intake;
  if (!intake) return null;
  const settings = await getAuditSettings();
  const day = audit.createdAt.slice(0, 10);
  return {
    id: audit.id,
    sample: false,
    agencyName: settings.agency.agencyName || "Your agency",
    agencyWebsite: settings.agency.agencyWebsite,
    intake,
    plans: settings.adsPlans,
    data: emptyAdsData(intake, day),
  };
}

/** What the signed-in person has spent and has left (salespeople: their own week). */
export const getAuditSpend = cache(async (): Promise<SpendSummary | null> => {
  const settings = await getAuditSettings();
  if (!settings.ready) return null;
  const me = (await getMember())!;
  const db = await createDatabaseClient();
  const since = new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString();
  const { data, error } = await db.from("audit_spend").select("audit_id, user_id, usd, at").gte("at", since).limit(5000);
  if (error) return null;
  return spendSummary({
    rows: (data ?? []).map((r) => ({ auditId: r.audit_id as string, userId: r.user_id as string, usd: Number(r.usd), at: r.at as string })),
    me: me.userId,
    caps: settings.caps,
    myWeeklyCap: settings.myWeeklyCap,
    now: new Date(),
  });
});

/** Owner: salespeople, for setting a weekly cap per person. */
export async function getSalespeople(): Promise<{ userId: string; name: string }[]> {
  if (!usesDatabase()) return [];
  const me = await getMember();
  if (me?.role !== "owner") return [];
  const db = await createDatabaseClient();
  const { data } = await db.from("team_members").select("user_id, display_name, role").eq("role", "sales").order("display_name");
  return (data ?? []).map((r) => ({ userId: r.user_id as string, name: r.display_name as string }));
}

// ---------------------------------------------------------------- SEO Watcher (docs/SEO_WATCHER_PLAN.md)

export interface WatchPreview {
  sample: true;
  today: string;
  data: WatchData;
  opportunities: SampleOpportunity[];
  room: typeof watchSampleRoom;
}

/**
 * The Watcher's "Preview with sample data": fictional businesses only, always labeled,
 * never mixed with real clients (Phase A has no real Watcher data yet).
 */
export function getWatchPreview(): WatchPreview {
  return { sample: true, today: WATCH_SAMPLE_TODAY, data: watchSample, opportunities: watchSampleOpportunities, room: watchSampleRoom };
}

// ---------------------------------------------------------------------------
// Scout (0024, docs/SCOUT_PLAN.md): runs, prospects, visits, spend. Read as the signed-in
// person: the database gives a salesperson only their own prospects + the unclaimed pool,
// their own runs, visits and spend. Owner and managers read everything.
// ---------------------------------------------------------------------------

export interface ScoutRun {
  id: string;
  createdBy: string;
  mine: boolean;
  byName: string | null;
  area: string;
  kinds: string[];
  size: number;
  estUsd: number;
  status: "planned" | "attached";
  found: number | null;
  createdAt: string;
}

export interface ScoutData {
  /** false before 0024, or for roles that don't use Scout. */
  ready: boolean;
  me: string;
  role: string;
  settings: { monthlyUsd: number; perRepMonthlyUsd: number; revisitDays: number };
  /** My own cap: the owner's override, else the per-rep cap for salespeople, else none. */
  myCapUsd: number | null;
  runs: ScoutRun[];
  prospects: ScoutProspect[];
  visits: (ScoutVisit & { note: string | null })[];
  spend: ScoutSpendRow[];
  /** Owner only: salespeople to assign to (managers can't read the team list). */
  people: { userId: string; name: string }[];
  /** Owner only: user id → name, for "assigned to" and "found by". */
  names: Map<string, string>;
}

const PROSPECT_COLUMNS = "id, run_id, name, website, category, address, town, lat, lng, maps_url, rating, reviews, signals, score, reasons, angle, status, assigned_to, next_ok_on, created_at";

function toProspect(r: Record<string, unknown>): ScoutProspect {
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const angle = r.angle === "ads" || r.angle === "website" ? r.angle : "seo";
  return {
    id: String(r.id),
    runId: (r.run_id as string | null) ?? null,
    name: String(r.name),
    website: (r.website as string | null) ?? null,
    category: (r.category as string | null) ?? null,
    address: (r.address as string | null) ?? null,
    town: (r.town as string | null) ?? null,
    lat: num(r.lat),
    lng: num(r.lng),
    mapsUrl: (r.maps_url as string | null) ?? null,
    rating: num(r.rating),
    reviews: num(r.reviews),
    signals: (r.signals && typeof r.signals === "object" ? r.signals : {}) as ScoutSignals,
    score: Number(r.score) || 0,
    reasons: Array.isArray(r.reasons) ? (r.reasons as string[]) : [],
    angle,
    status: (PROSPECT_STATUSES as readonly string[]).includes(String(r.status)) ? (r.status as ProspectStatus) : "new",
    assignedTo: (r.assigned_to as string | null) ?? null,
    nextOkOn: (r.next_ok_on as string | null) ?? null,
    createdAt: String(r.created_at),
  };
}

export const getScout = cache(async (): Promise<ScoutData> => {
  const none: ScoutData = { ready: false, me: "", role: "", settings: { monthlyUsd: SCOUT_RULES.monthlyUsd, perRepMonthlyUsd: SCOUT_RULES.perRepMonthlyUsd, revisitDays: SCOUT_RULES.revisitDays }, myCapUsd: null, runs: [], prospects: [], visits: [], spend: [], people: [], names: new Map() };
  if (!usesDatabase()) return none;
  const me = await getMember();
  if (!me || (!isLead(me.role) && me.role !== "sales")) return none;
  const db = await createDatabaseClient();
  const settings = await db.from("scout_settings").select("monthly_usd, per_rep_monthly_usd, revisit_days").maybeSingle();
  if (settings.error || !settings.data) return { ...none, me: me.userId, role: me.role }; // before 0024
  const monthAgo = new Date(Date.now() - 40 * 86_400_000).toISOString();
  const [runs, prospects, visits, spend, limit, team] = await Promise.all([
    db.from("scout_runs").select("id, created_by, area, kinds, size, est_usd, status, found, created_at").order("created_at", { ascending: false }).limit(100),
    db.from("scout_prospects").select(PROSPECT_COLUMNS).is("archived_at", null).order("score", { ascending: false }).limit(2000),
    db.from("scout_visits").select("prospect_id, kind, outcome, note, at, user_id").order("at", { ascending: false }).limit(3000),
    db.from("scout_spend").select("user_id, usd, at").gte("at", monthAgo).limit(5000),
    db.from("scout_user_limits").select("monthly_usd").eq("user_id", me.userId).maybeSingle(),
    me.role === "owner" ? db.from("team_members").select("user_id, display_name, role") : Promise.resolve({ data: [] as { user_id: string; display_name: string; role: string }[] }),
  ]);
  const names = new Map((team.data ?? []).map((t) => [t.user_id as string, t.display_name as string]));
  const s = { monthlyUsd: Number(settings.data.monthly_usd), perRepMonthlyUsd: Number(settings.data.per_rep_monthly_usd), revisitDays: Number(settings.data.revisit_days) };
  const myCapUsd = limit.data ? Number(limit.data.monthly_usd) : me.role === "sales" ? s.perRepMonthlyUsd : null;
  return {
    ready: true,
    me: me.userId,
    role: me.role,
    settings: s,
    myCapUsd,
    runs: (runs.data ?? []).map((r) => ({
      id: r.id as string,
      createdBy: r.created_by as string,
      mine: r.created_by === me.userId,
      byName: names.get(r.created_by as string) ?? null,
      area: r.area as string,
      kinds: (r.kinds as string[]) ?? [],
      size: Number(r.size),
      estUsd: Number(r.est_usd),
      status: r.status === "attached" ? "attached" : "planned",
      found: r.found === null ? null : Number(r.found),
      createdAt: r.created_at as string,
    })),
    prospects: ((prospects.data ?? []) as Record<string, unknown>[]).map(toProspect),
    visits: (visits.data ?? []).flatMap((v) => {
      const kind = asVisitKind(String(v.kind));
      const outcome = asOutcome(String(v.outcome));
      return kind && outcome ? [{ prospectId: v.prospect_id as string, kind, outcome, note: (v.note as string | null) ?? null, at: v.at as string, by: v.user_id as string }] : [];
    }),
    spend: (spend.data ?? []).map((r) => ({ userId: r.user_id as string, usd: Number(r.usd), at: r.at as string })),
    people: (team.data ?? []).filter((t) => t.role === "sales").map((t) => ({ userId: t.user_id as string, name: t.display_name as string })),
    names,
  };
});

// ---------------------------------------------------------------- SEO Watcher, real data (0027, Phase B)

export const WATCH_SETUP = "The SEO Watcher needs one setup step first (0027 SQL).";

export interface WatchListKeyword { id: string; clientId: string; keyword: string; money: boolean; active: boolean }
export interface WatchListMarket { id: string; clientId: string; city: string; state: string; lat: number | null; lng: number | null; locationCode: number | null; active: boolean }
export interface WatchListCompetitor { id: string; clientId: string; domain: string; source: string; active: boolean }
export interface WatchedClient { id: string; slug: string; name: string; domain: string; niche: string; active: boolean; startedOn: string; services: string[] }
export interface WatchRun { id: string; clientIds: string[]; pairs: number; volumes: boolean; estUsd: number; actualUsd: number | null; status: "planned" | "attached"; checksSaved: number | null; createdAt: string; attachedAt: string | null }
export interface WatchSettings { capUsd: number; keywordsPerClient: number; marketsPerClient: number; competitorsPerClient: number }

export interface WatchLive {
  /** 0027 has been run and the signed-in person may use the Watcher. */
  ready: boolean;
  role: string;
  /** Owner and managers edit lists, start rounds, attach results and see costs. */
  canEdit: boolean;
  isOwner: boolean;
  clients: WatchedClient[];
  keywords: WatchListKeyword[];
  markets: WatchListMarket[];
  competitors: WatchListCompetitor[];
  /** For the math in src/lib/watch/ (active watched clients and active list entries only). */
  data: WatchData;
  /** Owner/managers only (developers never see costs). */
  settings: WatchSettings | null;
  runs: WatchRun[];
  /** Spent (real cost, or the estimate until results are in) this calendar month, New York time. */
  spentThisMonthUsd: number;
  /** Latest month with stored search volumes, YYYY-MM (null = none yet). */
  latestVolumeMonth: string | null;
}

const WATCH_EMPTY: WatchLive = {
  ready: false, role: "", canEdit: false, isOwner: false, clients: [], keywords: [], markets: [], competitors: [],
  data: { clients: [], markets: [], keywords: [], checks: [], volumes: [], competitors: [] },
  settings: null, runs: [], spentThisMonthUsd: 0, latestVolumeMonth: null,
};

function nyMonthStartIso(now = new Date()): string {
  const ym = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit" }).format(now).slice(0, 7);
  // Midnight New York on the 1st, close enough for a monthly total (the database enforces the cap exactly).
  return new Date(`${ym}-01T05:00:00Z`).toISOString();
}

/**
 * Everything the Watcher screens show, read as the signed-in person: the database decides
 * what each role gets (developers: only clients they work on, never costs).
 */
export const getWatch = cache(async (): Promise<WatchLive> => {
  if (!usesDatabase()) return WATCH_EMPTY;
  const me = await getMember();
  if (!me || (!isLead(me.role) && me.role !== "developer")) return WATCH_EMPTY;
  const db = await createDatabaseClient();
  const names = await db.from("watch_client_names").select("client_id, slug, name, start_date, services, domain, niche, active").order("name").limit(200);
  if (names.error) return { ...WATCH_EMPTY, role: me.role }; // before 0027
  const lead = isLead(me.role);
  const [kw, mk, cp, checks, vols, settings, runs] = await Promise.all([
    db.from("watch_keywords").select("id, client_id, keyword, money, active").order("created_at").limit(5000),
    db.from("watch_markets").select("id, client_id, city, state, lat, lng, location_code, active").order("created_at").limit(1000),
    db.from("watch_competitors").select("id, client_id, domain, source, active").order("created_at").limit(1000),
    db.from("watch_rank_checks").select("client_id, keyword_id, market_id, checked_on, organic, pack, others, source").gte("checked_on", new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10)).order("checked_on").limit(50000),
    db.from("watch_volumes").select("market_id, keyword, month, volume, source").gte("month", new Date(Date.now() - 800 * 86_400_000).toISOString().slice(0, 10)).order("month").limit(50000),
    lead ? db.from("watch_settings").select("monthly_usd, keywords_per_client, markets_per_client, competitors_per_client").maybeSingle() : Promise.resolve({ data: null }),
    lead ? db.from("watch_runs").select("id, client_ids, pairs, volumes, est_usd, actual_usd, status, checks_saved, created_at, attached_at").order("created_at", { ascending: false }).limit(100) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);
  const clients: WatchedClient[] = (names.data ?? []).map((r) => ({
    id: r.client_id as string,
    slug: r.slug as string,
    name: r.name as string,
    domain: r.domain as string,
    niche: r.niche as string,
    active: Boolean(r.active),
    startedOn: String(r.start_date ?? ""),
    services: (r.services as string[] | null) ?? [],
  }));
  const keywords: WatchListKeyword[] = (kw.data ?? []).map((r) => ({ id: r.id as string, clientId: r.client_id as string, keyword: r.keyword as string, money: Boolean(r.money), active: Boolean(r.active) }));
  const markets: WatchListMarket[] = (mk.data ?? []).map((r) => ({
    id: r.id as string, clientId: r.client_id as string, city: r.city as string, state: r.state as string,
    lat: r.lat === null ? null : Number(r.lat), lng: r.lng === null ? null : Number(r.lng),
    locationCode: r.location_code === null ? null : Number(r.location_code), active: Boolean(r.active),
  }));
  const competitors: WatchListCompetitor[] = (cp.data ?? []).map((r) => ({ id: r.id as string, clientId: r.client_id as string, domain: r.domain as string, source: r.source as string, active: Boolean(r.active) }));

  const live = new Set(clients.filter((c) => c.active).map((c) => c.id));
  const kwActive = keywords.filter((k) => k.active && live.has(k.clientId));
  const mkActive = markets.filter((m) => m.active && live.has(m.clientId));
  const kwIds = new Set(kwActive.map((k) => k.id));
  const mkIds = new Set(mkActive.map((m) => m.id));
  const kwText = new Set(kwActive.map((k) => `${k.clientId}|${k.keyword}`));
  const mkClient = new Map(mkActive.map((m) => [m.id, m.clientId]));
  const asOthers = (v: unknown) =>
    Array.isArray(v) ? v.flatMap((o) => (o && typeof o === "object" && typeof (o as { domain?: unknown }).domain === "string" && Number.isInteger((o as { position?: unknown }).position) ? [{ domain: (o as { domain: string }).domain, position: (o as { position: number }).position }] : [])) : [];
  const data: WatchData = {
    clients: clients.filter((c) => c.active).map((c): WatchClient => ({
      id: c.id, name: c.name, domain: c.domain, niche: c.niche, services: c.services, nextServices: [],
      startedOn: c.startedOn, health: "good", openComplaint: false, lastMood: null, lastUpsellSentOn: null,
    })),
    markets: mkActive.map((m): WatchMarket => ({ id: m.id, clientId: m.clientId, city: m.city, state: m.state, lat: m.lat ?? 0, lng: m.lng ?? 0 })),
    keywords: kwActive.map((k) => ({ id: k.id, clientId: k.clientId, keyword: k.keyword, money: k.money })),
    checks: (checks.data ?? []).flatMap((r): RankCheck[] =>
      kwIds.has(r.keyword_id as string) && mkIds.has(r.market_id as string)
        ? [{ keywordId: r.keyword_id as string, marketId: r.market_id as string, date: String(r.checked_on), organic: r.organic === null ? null : Number(r.organic), pack: r.pack === null ? null : Number(r.pack), others: asOthers(r.others), source: r.source === "audit" ? "audit" : "dataforseo" }]
        : [],
    ),
    volumes: (vols.data ?? []).flatMap((r): VolumeMonth[] => {
      const client = mkClient.get(r.market_id as string);
      return client && kwText.has(`${client}|${r.keyword as string}`)
        ? [{ keyword: r.keyword as string, marketId: r.market_id as string, month: String(r.month).slice(0, 7), volume: r.volume === null ? null : Number(r.volume), source: r.source === "audit" ? "audit" : "dataforseo" }]
        : [];
    }),
    competitors: competitors.filter((c) => c.active && live.has(c.clientId)).map((c) => ({ clientId: c.clientId, domain: c.domain })),
  };
  const s = settings.data as Record<string, unknown> | null;
  const runRows: WatchRun[] = ((runs.data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string, clientIds: (r.client_ids as string[]) ?? [], pairs: Number(r.pairs), volumes: Boolean(r.volumes),
    estUsd: Number(r.est_usd), actualUsd: r.actual_usd === null ? null : Number(r.actual_usd),
    status: r.status === "attached" ? "attached" : "planned", checksSaved: r.checks_saved === null ? null : Number(r.checks_saved),
    createdAt: r.created_at as string, attachedAt: (r.attached_at as string | null) ?? null,
  }));
  const monthStart = nyMonthStartIso();
  const spent = runRows.filter((r) => r.createdAt >= monthStart).reduce((t, r) => t + (r.actualUsd ?? r.estUsd), 0);
  const months = (vols.data ?? []).map((r) => String(r.month).slice(0, 7)).sort();
  return {
    ready: true,
    role: me.role,
    canEdit: lead,
    isOwner: me.role === "owner",
    clients,
    keywords,
    markets,
    competitors,
    data,
    settings: s
      ? { capUsd: Number(s.monthly_usd), keywordsPerClient: Number(s.keywords_per_client), marketsPerClient: Number(s.markets_per_client), competitorsPerClient: Number(s.competitors_per_client) }
      : lead ? { capUsd: 20, keywordsPerClient: WATCH_RULES.limits.keywords, marketsPerClient: WATCH_RULES.limits.markets, competitorsPerClient: WATCH_RULES.limits.competitors } : null,
    runs: runRows,
    spentThisMonthUsd: Math.round(spent * 100) / 100,
    latestVolumeMonth: months.at(-1) ?? null,
  };
});

/** Owner/managers: every current client, to pick which ones to watch. No money columns. */
export async function getWatchCandidates(): Promise<{ id: string; slug: string; name: string; status: string }[]> {
  if (!usesDatabase()) return [];
  const me = await getMember();
  if (!me || !isLead(me.role)) return [];
  const db = await createDatabaseClient();
  const { data } = await db.from("clients").select("id, slug, name, status").is("trashed_at", null).in("status", ["active", "paused"]).order("name").limit(500);
  return (data ?? []).map((r) => ({ id: r.id as string, slug: r.slug as string, name: r.name as string, status: r.status as string }));
}

/** Owner/managers: saved SEO audits that can seed a watched client's lists. */
export async function getWatchAuditChoices(): Promise<{ id: string; title: string; retrieved: string | null }[]> {
  if (!usesDatabase()) return [];
  const me = await getMember();
  if (!me || !isLead(me.role)) return [];
  const db = await createDatabaseClient();
  const { data, error } = await db.from("audits").select("id, title, data_retrieved").eq("kind", "seo").not("config", "is", null).is("archived_at", null).order("created_at", { ascending: false }).limit(100);
  if (error) return [];
  return (data ?? []).map((r) => ({ id: r.id as string, title: r.title as string, retrieved: (r.data_retrieved as string | null) ?? null }));
}

/** What a saved audit would add to the Watcher (read as the signed-in person; checked again on save). */
export async function getWatchAuditImport(auditId: string): Promise<AuditImport | null> {
  if (!usesDatabase() || !/^[0-9a-f-]{36}$/.test(auditId)) return null;
  const me = await getMember();
  if (!me || !isLead(me.role)) return null;
  const db = await createDatabaseClient();
  const { data, error } = await db.from("audits").select("config, data").eq("id", auditId).maybeSingle();
  if (error || !data?.config) return null;
  const config = parseAuditConfig(data.config);
  if (!config.ok) return null;
  return fromAudit(config.config, data.data ?? null);
}
