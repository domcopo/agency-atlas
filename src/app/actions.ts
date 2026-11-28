"use server";

// Every change the app can make lives in this one file. Each action:
//   1. checks who is signed in (verified by Supabase, never trusted from the browser)
//   2. checks the input strictly (dates, lengths, allowed values)
//   3. writes AS that person, so the database's row-level security has the final say.
// Nothing here can delete anything. The GoHighLevel sync only READS from GHL
// (through the GET-only module) and writes copies into this app's own database.

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { askAi, CARE_DRAFT_SCHEMA, CARE_DRAFT_TASK, CARE_MOVES_SCHEMA, CARE_MOVES_TASK, isAiConfigured, textRequestWorstCase, TOAD_DRAFT_SCHEMA, TOAD_DRAFT_TASK, TOAD_SCHEMA, TOAD_TASK, OPS_BRIEFING_SCHEMA, OPS_BRIEFING_TASK, PROFILE_SCHEMA, PROFILE_TASK, WORK_ORDERS_SCHEMA, WORK_ORDERS_TASK, WORK_PROMPT_SCHEMA, WORK_PROMPT_TASK, QUICK_ADD_SCHEMA, QUICK_ADD_TASK, type AiResult } from "@/lib/ai/client";
import { buildDeveloperToadFacts, buildNameBook, buildSalesToadFacts, buildToadFacts, cleanHistory, cleanQuestion, pipelineCounts, restoreToadAnswer, TOAD_LIMITS, TOAD_SCREENS, toadModeFor, type NameBook, type ToadAnswer, type ToadScreen } from "@/lib/ai/toad-snapshot";
import { buildCodebook, buildStaffBook, clientFacts, codebookFor, opsClientFacts, pipelineFacts, redact, redactStaff, restore, restoreClients, restoreOpsBriefing, restoreProfile, restoreQuickAdd, restoreWorkOrderDrafts, restoreWorkPrompt, type Codebook, type StaffBook } from "@/lib/ai/snapshot";
import { byImportance, EST_OPTIONS, isImportant, needsReview, parseSteps } from "@/lib/ops";
import { buildOwnerSummary, findLeaks } from "@/lib/owner-summary";
import type { RosterClient, WorkOrderDraft, WorkOrderDrafts } from "@/lib/types";
import { findSecrets } from "@/lib/kit";
import { asGuideRole, canEditGuide, GUIDE_LIMITS } from "@/lib/role-guides";
import { asIdeaStatus, checkGoal, checkIdea, IDEA_RULES } from "@/lib/ideas";
import { matchClient } from "@/lib/billing";
import {
  getAuditResultsBlock,
  getAiStatus,
  getAuditSettings,
  getAtlasQuestions,
  getCheckInHistory,
  getClientCareInfo,
  getJourneys,
  getActions,
  getClientHealth,
  getGhlSummary,
  getOps,
  getOwnerSummaryInput,
  getPreview,
  getRecentCheckInsByClient,
  getTeam,
  getRoster,
  getToday,
  getScout,
  getAiBudgetLeft,
  getDeveloperActions,
  getLatestAuditRun,
  getSavedAudit,
  type SavedAudit,
  getLeaderboard,
  getMyClientContacts,
  getSales,
  getUpcomingAppointments,
  getToadStatus,
  usesDatabase,
  getWatch,
  getWatchAuditImport,
  WATCH_SETUP,
} from "@/lib/data-source";
import { loadPrivateRoster, loadPrivateTeam } from "@/lib/private-data";
import {
  GhlError,
  isGhlBillingConfigured,
  isGhlConfigured,
  readBilling,
  readAppointments,
  readContactActivity,
  readLocationName,
  readOpportunities,
  readUsers,
  searchContacts,
  type GhlAppointment,
  type GhlContactActivity,
  type GhlOpportunity,
  type GhlUser,
} from "@/lib/ghl/client";
import { canPreview, PREVIEW_COOKIE, PREVIEW_MINUTES, previewTarget } from "@/lib/preview";
import { asHomeLayout, HOME_LAYOUT_COOKIE } from "@/lib/home-layouts";
import { AGENCY_SLUG } from "@/lib/agency";
import { isPdf, MAX_PDF_BYTES, MAX_UPLOAD_TOTAL_BYTES } from "@/lib/uploads";
import { checkDraftDue, cleanLinks, contactDetailsIn, hoursToMinutes, personLoads } from "@/lib/work-orders";
import { asTrashKind, deleteConfirmed, DELETE_CONFIRM } from "@/lib/trash";
import { SUGGESTION_RULES } from "@/lib/work-hub";
import { asTouchKind, checkTouchNote, nyDay, refreshAllowed, refreshDue, SALES_RULES } from "@/lib/sales";
import { canCare, isLead } from "@/lib/roles";
import { asIntakeKey, asStatusReason, asTouchChannel, CHECK_IN_KIND, JOURNEY_STAGES, RESTART_PER_DAY, restartSchedule, STATUS_REASONS, touchByStep } from "@/lib/journey";
import { asOutcome, asVisitKind, runEstimate, SCOUT_KINDS, SCOUT_RULES, scoreBusiness, scoutLeft } from "@/lib/scout";
import { parseScoutResults, SCOUT_RESULTS_MAX_BYTES } from "@/lib/scout-intake";
import { autoSyncDue, CARE_RULES, parseCarePlan, parseMonthly, similarClients, uniqueSlug } from "@/lib/care";
import { parseAuditConfig } from "@/lib/audit/config";
import { cleanCity, cleanDomain, cleanKeyword, cleanNiche, cleanPosition } from "@/lib/watch/lists";
import { buildRoundScope, nyToday, parseWatchResults, roundEstimate, volumesDue, WATCH_RESULTS_MAX_BYTES } from "@/lib/watch/rounds";
import { buildAuditConfig, INTAKE_DEFAULTS, INTAKE_LIMITS, parseIntake, parsePlans, splitList } from "@/lib/audit/intake";
import { parseSections } from "@/lib/audit/sections";
import { parseAdsIntake, parseAdsPlans, parseAdsSections } from "@/lib/audit/ads";
import { checkPlaces, nearbyTowns, placeBookFor, statePlaces, type NearbyTown, type PlaceCheck } from "@/lib/audit/places-list";
import { extractResultsBlock, parseAdsResults, parseSeoResults, type ResultsSummary } from "@/lib/audit/results";
import { adsMoneyTerms, buildAdsBlock, buildSeoBlock, DFS_PRICE, findCompetitors, mapTermOf, planAdsRun, planSeoRun, readBidders, readMaps, readPlace, readSerp, RUN_RULES, seoMoneyTerms, seoUniverse, whoRanksMissing, type Lookup } from "@/lib/audit/run";
import { DfsError, dfsLookup, isDataForSeoConfigured, type DfsAnswer } from "@/lib/audit/sources/dataforseo";
import { heatmapBlock, heatmapId, heatPendingOf, heatShape, LEADSNAP_RULES, planGrid, readHeatmap, readLeaders, reusableHeatmap, withHeatmap } from "@/lib/audit/leadsnap";
import { createHeatmap, getHeatmap, getHeatmapCompetitors, isLeadSnapConfigured, LeadSnapError, listRecentHeatmaps } from "@/lib/audit/sources/leadsnap";
import { applyWords, AUDIT_WORDS_SCHEMA, AUDIT_WORDS_TASK, wordsInput } from "@/lib/audit/words";
import { nyDate } from "@/lib/audit/spend";
import { COOKIE_OPTIONS, createDatabaseClient, getCurrentMember, isDatabaseConfigured } from "@/lib/supabase/server";
import { readAllRows } from "@/lib/paging";

const SERVICES = ["SEO", "Ads", "Website"] as const;

function text(form: FormData, key: string, max: number): string {
  const v = form.get(key);
  return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";
}

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A real calendar date, not in the future, not before 2020. */
function pastDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return null;
  return value >= "2020-01-01" && value <= localToday() ? value : null;
}

/** A real calendar date for a due date (past allowed, so overdue items can be logged). */
function anyDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return null;
  return value >= "2020-01-02" && value <= "2100-01-01" ? value : null;
}

const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const PRIORITIES = ["critical", "high", "normal", "low"] as const;
const STATUSES = ["open", "in_progress", "waiting", "blocked", "review", "done"] as const;
const CONTACT_KINDS = ["check_in", "call", "message", "email", "meeting", "note"] as const;
const oneOf = <T extends string>(list: readonly T[], v: string): T | null => (list.includes(v as T) ? (v as T) : null);
const MISSING_TABLE = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);
/** A column added by a later setup step isn't there yet. */
const MISSING_COLUMN = new Set(["42703", "PGRST204"]);

// ---------------------------------------------------------------------------
// Sign in / out
// ---------------------------------------------------------------------------

export async function signIn(_prev: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  if (!isDatabaseConfigured()) return { error: "The database isn't connected yet." };
  const email = text(form, "email", 200);
  const password = typeof form.get("password") === "string" ? (form.get("password") as string) : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || password.length > 200) {
    return { error: "Check your email and password." };
  }
  const db = await createDatabaseClient();
  const { error } = await db.auth.signInWithPassword({ email, password });
  // Same message for every failure, so it doesn't reveal which emails exist.
  // The server log (this Mac only) gets the reason code, never the email or password.
  if (error) {
    console.warn(`Sign-in refused: ${error.code ?? "no code"} (status ${error.status ?? "?"})`);
    return { error: "Sign-in failed. Check your email and password, or wait a minute and try again." };
  }
  redirect("/");
}

// ---------------------------------------------------------------------------
// Preview as developer (docs/DEVELOPER_VIEW_PLAN.md). LOOK ONLY: every other action
// in this file starts with notWhilePreviewing() (a guardrail test checks each one), so
// nothing saves under the owner's or manager's name while they look at a developer's screens.
// ---------------------------------------------------------------------------

async function notWhilePreviewing(): Promise<void> {
  if (await getPreview()) throw new Error("You're previewing a developer's view. Exit the preview to make changes.");
}

/** Owner or manager: show the app as one team member's developer view, for up to an hour. */
export async function startPreview(form: FormData) {
  const me = await getCurrentMember();
  if (!me || !canPreview(me.role)) return;
  const target = previewTarget(text(form, "staffId", 40));
  if (!target || !(await getTeam()).members.some((m) => m.id === target)) return;
  (await cookies()).set(PREVIEW_COOKIE, target, { ...COOKIE_OPTIONS, sameSite: "strict", maxAge: PREVIEW_MINUTES * 60 });
  redirect("/work");
}

/** Leave the preview. */
export async function stopPreview() {
  (await cookies()).delete(PREVIEW_COOKIE);
  redirect("/work");
}

/**
 * Owner/managers: which Home layout this device opens on (docs/ROLE_HOME_PLAN.md).
 * Only the four layout names; it arranges Home and changes no permissions.
 */
export async function setHomeLayout(form: FormData) {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || (me.role !== "owner" && me.role !== "manager")) return;
  const layout = asHomeLayout(text(form, "layout", 20));
  if (!layout) return;
  (await cookies()).set(HOME_LAYOUT_COOKIE, layout, { ...COOKIE_OPTIONS, maxAge: 365 * 86_400 });
  redirect("/");
}

export async function signOut() {
  (await cookies()).delete(PREVIEW_COOKIE);
  if (isDatabaseConfigured()) {
    const db = await createDatabaseClient();
    await db.auth.signOut();
  }
  redirect("/login");
}

/** Change your own password (signed in with two-factor). The new password is never logged. */
export async function changePassword(_prev: { error?: string; ok?: boolean } | undefined, form: FormData) {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me) return { error: "Please sign in again." };
  const next = form.get("password");
  const confirm = form.get("confirm");
  if (typeof next !== "string" || typeof confirm !== "string") return { error: "Type the new password twice." };
  if (next.length < 12) return { error: "Use at least 12 characters (a short sentence works well)." };
  if (next.length > 72) return { error: "Use 72 characters or fewer." };
  if (next !== confirm) return { error: "The two passwords don't match." };
  const db = await createDatabaseClient();
  const { data } = await db.auth.getClaims();
  if (data?.claims?.aal !== "aal2") return { error: "Sign in with your two-factor code first." };
  const { error } = await db.auth.updateUser({ password: next });
  if (error) {
    console.warn(`Password change refused: ${error.code ?? error.status}`);
    if (error.code === "same_password") return { error: "That's your current password. Pick a new one." };
    if (error.code === "weak_password") return { error: "That password is too easy to guess. Try a longer one." };
    if (error.code === "reauthentication_needed") return { error: "For safety, sign out and back in, then change it right away." };
    return { error: "Couldn't change the password. Try again." };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Two-factor sign-in (authenticator app, 6-digit codes)
// ---------------------------------------------------------------------------

/** Starts authenticator setup. Returns the QR code and the typed-in key, shown once. */
export async function startTwoFactor(): Promise<{ error?: string; qr?: string; secret?: string }> {
  await notWhilePreviewing();
  if (!isDatabaseConfigured()) return { error: "The database isn't connected yet." };
  const db = await createDatabaseClient();
  const { data: claims } = await db.auth.getClaims();
  if (!claims?.claims?.sub) return { error: "Sign in first." };
  const { data: list } = await db.auth.mfa.listFactors();
  if (list?.totp.length) return { error: "Two-factor is already set up. Enter a code from your app." };
  // Clear any half-finished setup so the new QR code is the only one that works.
  for (const f of list?.all ?? []) {
    if (f.factor_type === "totp" && f.status === "unverified") await db.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await db.auth.mfa.enroll({ factorType: "totp", friendlyName: "Agency Atlas", issuer: "Agency Atlas" });
  if (error || !data) {
    console.warn(`Two-factor setup refused: ${error?.code ?? "no code"}`);
    return { error: "Couldn't start setup. Try again in a minute." };
  }
  return { qr: data.totp.qr_code, secret: data.totp.secret };
}

/** Checks a 6-digit code. Finishes setup the first time; afterwards it's the second sign-in step. */
export async function verifyTwoFactor(_prev: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  await notWhilePreviewing();
  if (!isDatabaseConfigured()) return { error: "The database isn't connected yet." };
  const code = text(form, "code", 12).replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return { error: "Enter the 6-digit code from your authenticator app." };
  const db = await createDatabaseClient();
  const { data: list } = await db.auth.mfa.listFactors();
  // The factor is chosen on the server from the signed-in person's own list, never from the form.
  const factor = list?.totp[0] ?? list?.all.find((f) => f.factor_type === "totp" && f.status === "unverified");
  if (!factor) return { error: "Set up two-factor first." };
  const { error } = await db.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) {
    console.warn(`Two-factor code refused: ${error.code ?? "no code"} (status ${error.status ?? "?"})`);
    return { error: "That code didn't work. Codes change every 30 seconds, so use the newest one." };
  }
  redirect("/");
}

// ---------------------------------------------------------------------------
// Check-ins
// ---------------------------------------------------------------------------

export async function logCheckIn(_prev: { error?: string; ok?: boolean } | undefined, form: FormData) {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || !canCare(me.role)) return { error: "Only the owner, a manager or a VA can log check-ins." };
  const clientId = text(form, "clientId", 40);
  const slug = text(form, "slug", 90);
  const day = pastDate(text(form, "date", 10));
  const note = text(form, "note", 500);
  const mood = text(form, "mood", 10);
  const kind = oneOf(CONTACT_KINDS, text(form, "kind", 12)) ?? "check_in";
  const nextTitle = text(form, "nextTitle", 120);
  const nextDue = text(form, "nextDue", 10);
  if (!/^[0-9a-f-]{36}$/.test(clientId)) return { error: "Unknown client." };
  if (nextDue && !anyDate(nextDue)) return { error: "Pick a real due date for the next action." };
  if (!day) return { error: "Pick a date that isn't in the future." };
  if (mood && mood !== "better" && mood !== "same" && mood !== "worse") return { error: "Pick better, same or worse." };
  const db = await createDatabaseClient();
  const { error } = await db.from("check_ins").insert({
    client_id: clientId,
    happened_on: day,
    note: note || null,
    ...(mood ? { mood } : {}),
    ...(kind !== "check_in" ? { kind } : {}),
  });
  if (error) {
    console.warn(`Check-in refused: ${error.code}`);
    // 42703 / PGRST204 = the mood column doesn't exist yet (0004 not run).
    if (mood && (error.code === "42703" || error.code === "PGRST204")) return { error: "Saving how they're doing needs one more setup step (0004 SQL). Try again without picking one, or run it first." };
    if (kind !== "check_in" && MISSING_TABLE.has(error.code ?? "")) return { error: "Saving the contact type needs one more setup step (0006 SQL). Pick \"Check-in\" or run it first." };
    return { error: "Couldn't save the check-in." };
  }
  // A commitment from this conversation becomes a next action (same owner as the client).
  if (nextTitle) {
    const { data: client } = await db.from("clients").select("owner_staff_id").eq("id", clientId).maybeSingle();
    const saved = await saveAction(db, {
      client_id: clientId,
      kind: "follow_up",
      title: nextTitle,
      owner_staff_id: (client as { owner_staff_id?: string | null } | null)?.owner_staff_id ?? null,
      due_on: nextDue ? anyDate(nextDue) : null,
      priority: "normal",
    });
    if (saved.error) return { error: `Contact saved, but the next action wasn't: ${saved.error}` };
  }
  revalidatePath(`/clients/${slug}`);
  revalidatePath("/clients");
  revalidatePath("/");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Owners and next actions (0006). Owner and managers work actions; only the
// owner sets who owns a client. Every change is also written to the activity
// history (insert-only) so each client has a timeline.
// ---------------------------------------------------------------------------

type Db = Awaited<ReturnType<typeof createDatabaseClient>>;

async function staffExists(db: Db, id: string): Promise<string | null> {
  if (!isUuid(id)) return null;
  const { data } = await db.from("staff").select("name").eq("id", id).maybeSingle();
  return (data as { name?: string } | null)?.name ?? null;
}

async function logActivity(db: Db, row: { client_id: string | null; lead_ghl_id?: string | null; action_id?: string | null; kind: string; summary: string }) {
  const { error } = await db.from("activity").insert({ ...row, summary: row.summary.slice(0, 200) });
  if (error) console.warn(`Activity not logged: ${error.code}`);
}

async function saveAction(
  db: Db,
  row: {
    client_id?: string;
    lead_ghl_id?: string;
    kind: "follow_up" | "issue" | "work_order";
    title: string;
    notes?: string | null;
    owner_staff_id: string | null;
    priority: string;
    due_on: string | null;
    promised_on?: string;
    steps?: string | null;
    source_link?: string | null;
    source_note?: string | null;
    est_minutes?: number | null;
    ai_suggested?: boolean;
    internal?: boolean;
  },
  log = true,
): Promise<{ error?: string }> {
  const { data, error } = await db.from("actions").insert(row).select("id").single();
  if (error || !data) {
    console.warn(`Action refused: ${error?.code}`);
    // 23514 = a check rule refused it: before 0010 that's the new "work_order" kind.
    // Internal work (0022): before it's run the column is missing, or the old "client or lead" rule refuses it.
    if (row.internal && (error?.code === "23514" || MISSING_COLUMN.has(error?.code ?? ""))) return { error: "Our agency work orders need one setup step first (0022 SQL)." };
    if (row.kind === "work_order" && (error?.code === "23514" || MISSING_COLUMN.has(error?.code ?? ""))) return { error: "Work orders need one setup step first (0010 SQL)." };
    if (row.promised_on && MISSING_COLUMN.has(error?.code ?? "")) return { error: "Promise dates need one setup step first (0009 SQL)." };
    return { error: MISSING_TABLE.has(error?.code ?? "") ? "Next actions need one setup step first (0006 SQL)." : "Couldn't save it." };
  }
  // The history (activity) is owner/manager only; salespeople's items skip it.
  if (log) await logActivity(db, { client_id: row.client_id ?? null, lead_ghl_id: row.lead_ghl_id ?? null, action_id: data.id, kind: "action_created", summary: `${row.kind === "issue" ? "Issue opened" : row.kind === "work_order" ? `Work order added${row.ai_suggested ? " (from AI draft)" : ""}` : "Next action added"}: ${row.title}` });
  return {};
}

function refreshOps(slug?: string) {
  if (slug && /^[a-z0-9-]{1,90}$/.test(slug)) revalidatePath(`/clients/${slug}`);
  revalidatePath("/", "layout");
}

/** A pasted conversation link: https only, no spaces or odd characters, no logins in it. */
function httpsLink(raw: string): string | null {
  if (!raw) return null;
  if (raw.length > 500 || /[\s<>"]/.test(raw)) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && !u.username && !u.password && u.hostname.includes(".") ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Steps typed one per line → a clean list (max 20 lines of 200 characters). */
function cleanSteps(raw: string): string | null {
  const lines = parseSteps(raw).map((l) => l.slice(0, 200));
  return lines.length ? lines.join("\n").slice(0, 2000) : null;
}

const EST_CHOICES = EST_OPTIONS.map(([v]) => v);

/**
 * Add a work order (0010). Owner and managers only. Also used for "Add" on an AI
 * draft: the person reviews and edits it first; the AI never adds anything itself.
 */
export async function createWorkOrder(_prev: { error?: string; ok?: boolean } | undefined, form: FormData) {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || (me.role !== "owner" && me.role !== "manager")) return { error: "Only the owner or a manager can add work orders." };
  const slug = text(form, "slug", 90);
  const title = text(form, "title", 120);
  const steps = cleanSteps(typeof form.get("steps") === "string" ? String(form.get("steps")).slice(0, 4000) : "");
  const notes = text(form, "notes", 500);
  const priority = oneOf(PRIORITIES, text(form, "priority", 10)) ?? "normal";
  const ownerRaw = text(form, "ownerId", 40);
  const dueRaw = text(form, "due", 10);
  const promisedRaw = text(form, "promised", 10);
  const linkRaw = text(form, "link", 500);
  const linkNote = text(form, "linkNote", 200);
  const estRaw = Number(text(form, "est", 5));
  const fromDraft = text(form, "fromDraft", 1) === "1";
  if (!title) return { error: "Say what needs to be done." };
  const contact = contactDetailsIn([title, steps ?? "", notes].join("\n"));
  if (contact.length) return { error: `That looks like ${contact.join(" and ")}. Keep contact details in the client record, not in work orders.` };
  // "Our agency" (0022) = internal work with no client. Otherwise look the client up on
  // the server; never trust ids from the page.
  const internal = slug === AGENCY_SLUG;
  const client = internal ? null : (await getRoster()).find((c) => c.id === slug);
  if (!internal && !client?.dbId) return { error: "Pick a client (or Our agency)." };
  const due = dueRaw ? anyDate(dueRaw) : null;
  if (dueRaw && !due) return { error: "Pick a real due date." };
  const promised = promisedRaw ? anyDate(promisedRaw) : null;
  if (promisedRaw && !promised) return { error: "Pick a real promise date." };
  const link = httpsLink(linkRaw);
  if (linkRaw && !link) return { error: "The link must be a full https:// address (copy it from GoHighLevel)." };
  const est = (EST_CHOICES as number[]).includes(estRaw) ? estRaw : null;
  const db = await createDatabaseClient();
  if (ownerRaw && !(await staffExists(db, ownerRaw))) return { error: "Pick someone from the team." };
  const saved = await saveAction(db, {
    ...(internal ? { internal: true } : { client_id: client!.dbId! }),
    kind: "work_order",
    title,
    notes: notes || null,
    owner_staff_id: ownerRaw || null,
    priority,
    due_on: due,
    ...(promised ? { promised_on: promised } : {}),
    steps,
    source_link: link,
    source_note: linkNote || null,
    est_minutes: est,
    ai_suggested: fromDraft,
  });
  if (saved.error) return { error: saved.error };
  refreshOps(slug);
  return { ok: true };
}

/** Add a follow-up or an issue to a client. */
export async function createAction(_prev: { error?: string; ok?: boolean } | undefined, form: FormData) {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || (me.role !== "owner" && me.role !== "manager")) return { error: "Only the owner or a manager can add next actions." };
  const clientId = text(form, "clientId", 40);
  const slug = text(form, "slug", 90);
  const kind = text(form, "kind", 10) === "issue" ? "issue" : "follow_up";
  const title = text(form, "title", 120);
  const notes = text(form, "notes", 500);
  const priority = oneOf(PRIORITIES, text(form, "priority", 10)) ?? "normal";
  const dueRaw = text(form, "due", 10);
  const promisedRaw = text(form, "promised", 10);
  const ownerRaw = text(form, "ownerId", 40);
  if (!isUuid(clientId)) return { error: "Unknown client." };
  if (!title) return { error: "Say what needs to happen." };
  const due = dueRaw ? anyDate(dueRaw) : null;
  if (dueRaw && !due) return { error: "Pick a real due date." };
  const promised = promisedRaw ? anyDate(promisedRaw) : null;
  if (promisedRaw && !promised) return { error: "Pick a real promise date." };
  const db = await createDatabaseClient();
  if (ownerRaw && !(await staffExists(db, ownerRaw))) return { error: "Pick someone from the team." };
  const saved = await saveAction(db, { client_id: clientId, kind, title, notes: notes || null, owner_staff_id: ownerRaw || null, priority, due_on: due, ...(promised ? { promised_on: promised } : {}) });
  if (saved.error) return { error: saved.error };
  refreshOps(slug);
  return { ok: true };
}

/** A follow-up on a GoHighLevel deal. Stored ONLY in this app; GoHighLevel is never changed. */
export async function createLeadAction(_prev: { error?: string; ok?: boolean } | undefined, form: FormData) {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || (!isLead(me.role) && me.role !== "sales")) return { error: "Only the owner, managers and salespeople can add lead follow-ups." };
  const leadId = text(form, "leadId", 40);
  const title = text(form, "title", 120);
  const priority = oneOf(PRIORITIES, text(form, "priority", 10)) ?? "normal";
  const dueRaw = text(form, "due", 10);
  const ownerRaw = text(form, "ownerId", 40);
  if (!/^[A-Za-z0-9]{6,40}$/.test(leadId)) return { error: "Pick a deal." };
  if (!title) return { error: "Say what needs to happen." };
  const due = dueRaw ? anyDate(dueRaw) : null;
  if (dueRaw && !due) return { error: "Pick a real due date." };
  const db = await createDatabaseClient();
  // The deal must exist in this app's read-only copy.
  const { data: deal } = await db.from("ghl_opportunities").select("ghl_id").eq("ghl_id", leadId).maybeSingle();
  if (!deal) return { error: "That deal isn't in the last sync." };
  // Salespeople can't read the team list: their follow-ups are theirs (the database allows lead follow-ups only).
  const sales = me.role === "sales";
  if (!sales && ownerRaw && !(await staffExists(db, ownerRaw))) return { error: "Pick someone from the team." };
  const saved = await saveAction(db, { lead_ghl_id: leadId, kind: "follow_up", title, owner_staff_id: sales ? me.staffId : ownerRaw || null, priority, due_on: due }, !sales);
  if (saved.error) return { error: saved.error };
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * "Done" on an automatic reminder from Today's priorities. It records what happened,
 * so the reminder clears on its own:
 * - contact reminders (check in, reply, first-month check-in): logs a contact today;
 * - your imported follow-up note: saves it as a completed action.
 * Both also go into the client's history (activity).
 */
export async function completeReminder(form: FormData) {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || (me.role !== "owner" && me.role !== "manager")) return;
  const slug = text(form, "slug", 90);
  const kind = text(form, "kind", 10);
  const title = text(form, "title", 120);
  if (kind !== "contact" && kind !== "note") return;
  const client = (await getRoster()).find((c) => c.id === slug);
  if (!client?.dbId) return;
  const db = await createDatabaseClient();
  if (kind === "contact") {
    const { error } = await db.from("check_ins").insert({ client_id: client.dbId, happened_on: localToday(), note: `Done from Today's priorities: ${title}`.slice(0, 500) });
    if (error) {
      console.warn(`Reminder done refused: ${error.code}`);
      return;
    }
    await logActivity(db, { client_id: client.dbId, kind: "action_done", summary: `Done: ${title}` });
  } else {
    if (!client.followUp) return;
    const { data, error } = await db
      .from("actions")
      .insert({ client_id: client.dbId, kind: "follow_up", title: client.followUp.slice(0, 120), owner_staff_id: client.ownerId ?? null, status: "done", done_at: new Date().toISOString() })
      .select("id")
      .single();
    if (error || !data) {
      console.warn(`Note done refused: ${error?.code}`);
      return;
    }
    await logActivity(db, { client_id: client.dbId, action_id: data.id, kind: "action_done", summary: `Done: ${client.followUp}` });
  }
  refreshOps(slug);
}

/** "Make it a next action" from an AI suggestion: a person taps it; the AI never does. */
export async function addSuggestedAction(form: FormData) {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || (me.role !== "owner" && me.role !== "manager")) return;
  const slug = text(form, "slug", 90);
  const title = text(form, "title", 120);
  const when = text(form, "when", 10);
  const priority = oneOf(PRIORITIES, text(form, "priority", 10)) ?? "normal";
  if (!title) return;
  // Look the client up on the server; never trust ids from the page.
  const client = (await getRoster()).find((c) => c.id === slug);
  if (!client?.dbId) return;
  const d = new Date(`${localToday()}T00:00:00Z`);
  if (when === "this_week") d.setUTCDate(d.getUTCDate() + 7);
  const db = await createDatabaseClient();
  const saved = await saveAction(db, {
    client_id: client.dbId,
    kind: "follow_up",
    title,
    owner_staff_id: client.ownerId ?? null,
    priority,
    due_on: d.toISOString().slice(0, 10),
  });
  if (!saved.error) refreshOps(slug);
}

/** Done / reopen / reschedule / assign / status / priority on one action. */
export async function updateAction(form: FormData) {
  await notWhilePreviewing();
  await applyUpdate(form);
}

/** Every status, date, owner, priority and detail change. Returns a problem in plain words, or null when saved. */
async function applyUpdate(form: FormData): Promise<string | null | undefined> {
  const me = await getCurrentMember();
  if (!me) return "Please sign in again.";
  const id = text(form, "actionId", 40);
  const op = text(form, "op", 12);
  if (!isUuid(id)) return "Couldn't save. Reload and try again.";
  // Developers may only change the status of their own items, and say why it's blocked (the database enforces this too).
  if (me.role === "developer" && op !== "done" && op !== "status") return "Ask a manager to change this.";
  // Salespeople: their lead follow-ups' status and dates only (the database allows lead follow-ups only).
  const SALES_OPS = ["done", "reopen", "reschedule", "status", "priority"];
  if (me.role === "sales" && !SALES_OPS.includes(op)) return;
  const db = await createDatabaseClient();
  const { data: current } = await db.from("actions").select("id, client_id, lead_ghl_id, kind, title, status").eq("id", id).maybeSingle();
  if (!current) return "That item isn't there any more."; // not found, or not allowed to see it
  const a = current as { id: string; client_id: string | null; lead_ghl_id: string | null; kind: "follow_up" | "issue" | "work_order"; title: string; status: string };
  const manager = me.role === "owner" || me.role === "manager";
  // A developer's "done" on a work order or issue means "ready for review" (0011): a manager approves it.
  const devToReview = me.role === "developer" && needsReview(a);

  let patch: Record<string, unknown> | null = null;
  let summary = "";
  let kind = "action_status";
  if (op === "done" && devToReview) {
    patch = { status: "review", done_at: null };
    summary = `Ready for review: ${a.title}`;
  } else if (op === "done") {
    patch = { status: "done", done_at: new Date().toISOString() };
    summary = `Done: ${a.title}`;
    kind = "action_done";
  } else if (op === "approve") {
    if (!manager || a.status !== "review") return "Only a manager can review this, while it's in review.";
    patch = { status: "done", done_at: new Date().toISOString(), review_note: null };
    summary = `Approved as done: ${a.title}`;
    kind = "action_done";
  } else if (op === "sendback") {
    if (!manager || a.status !== "review") return "Only a manager can review this, while it's in review.";
    const note = text(form, "note", 200);
    patch = { status: "open", done_at: null, review_note: note || null };
    summary = `Sent back${note ? ` (${note})` : ""}: ${a.title}`;
  } else if (op === "cancel") {
    // Owner only (0013; the database refuses anyone else too). Kept, never deleted.
    if (me.role !== "owner" || a.status === "canceled") return "Only the owner can cancel work.";
    const note = text(form, "note", 200);
    patch = { status: "canceled", cancel_note: note || null };
    summary = `Canceled${note ? ` (${note})` : ""}: ${a.title}`;
    kind = "action_status"; // the history table's existing kinds; the summary says "Canceled"
  } else if (op === "restore") {
    if (me.role !== "owner" || a.status !== "canceled") return "Only the owner can restore canceled work.";
    patch = { status: "open", done_at: null };
    summary = `Restored: ${a.title}`;
    kind = "action_reopened";
  } else if (op === "reopen") {
    patch = { status: "open", done_at: null };
    summary = `Reopened: ${a.title}`;
    kind = "action_reopened";
  } else if (op === "reschedule") {
    const preset = text(form, "preset", 8);
    const base = localToday();
    const shift = (days: number) => {
      const d = new Date(`${base}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString().slice(0, 10);
    };
    const due = preset === "tomorrow" ? shift(1) : preset === "week" ? shift(7) : anyDate(text(form, "due", 10));
    if (!due) return "That date doesn't look right.";
    patch = { due_on: due };
    summary = `Rescheduled to ${due}: ${a.title}`;
    kind = "action_rescheduled";
  } else if (op === "assign") {
    const ownerId = text(form, "ownerId", 40);
    const name = ownerId ? await staffExists(db, ownerId) : null;
    if (ownerId && !name) return "That person isn't on the team.";
    patch = { owner_staff_id: ownerId || null };
    summary = name ? `Assigned to ${name}: ${a.title}` : `Unassigned: ${a.title}`;
    kind = "action_assigned";
  } else if (op === "status") {
    const picked = oneOf(STATUSES, text(form, "status", 12));
    if (!picked) return "Pick a status.";
    const status = picked === "done" && devToReview ? "review" : picked;
    patch = status === "done" ? { status, done_at: new Date().toISOString() } : { status, done_at: null };
    // Blocked: keep a short reason. Other statuses clear it.
    const reason = text(form, "reason", 200);
    patch.blocked_reason = status === "blocked" ? reason || null : null;
    summary = `${status === "in_progress" ? "In progress" : status === "waiting" ? "Waiting on client" : status === "blocked" ? "Blocked" : status === "review" ? "Ready for review" : status === "done" ? "Done" : "Open"}: ${a.title}`;
    kind = status === "done" ? "action_done" : "action_status";
  } else if (op === "promise") {
    if (me.role === "developer") return "Ask a manager to change this.";
    const raw = text(form, "promised", 10);
    const promised = raw ? anyDate(raw) : null;
    if (raw && !promised) return "That date doesn't look right.";
    patch = { promised_on: promised };
    summary = promised ? `Promised to client by ${promised}: ${a.title}` : `Promise date removed: ${a.title}`;
    kind = "action_rescheduled";
  } else if (op === "details") {
    if (me.role === "developer") return "Ask a manager to change this.";
    const linkRaw = text(form, "link", 500);
    const link = httpsLink(linkRaw);
    if (linkRaw && !link) return "Links must start with https:// (no logins inside them).";
    const estRaw = Number(text(form, "est", 5));
    patch = {
      steps: cleanSteps(typeof form.get("steps") === "string" ? String(form.get("steps")).slice(0, 4000) : ""),
      source_link: link,
      source_note: text(form, "linkNote", 200) || null,
      est_minutes: (EST_CHOICES as number[]).includes(estRaw) ? estRaw : null,
    };
    summary = `Details updated: ${a.title}`;
  } else if (op === "est" || op === "steps" || op === "ghl") {
    // One detail at a time (the Work hub drawer saves each field on its own).
    if (me.role === "developer") return "Ask a manager to change this.";
    if (op === "est") {
      const raw = text(form, "est", 5);
      const est = Number(raw);
      if (raw && !(EST_CHOICES as number[]).includes(est)) return "Pick a time from the list.";
      patch = { est_minutes: raw ? est : null };
    } else if (op === "steps") {
      patch = { steps: cleanSteps(typeof form.get("steps") === "string" ? String(form.get("steps")).slice(0, 4000) : "") };
    } else {
      const linkRaw = text(form, "link", 500);
      const link = httpsLink(linkRaw);
      if (linkRaw && !link) return "Links must start with https:// (no logins inside them).";
      patch = { source_link: link, source_note: text(form, "linkNote", 200) || null };
    }
    summary = `Details updated: ${a.title}`;
  } else if (op === "done_when") {
    // "Done when" (0038): owner and managers only; the database refuses everyone else too.
    if (me.role !== "owner" && me.role !== "manager") return "Ask a manager to change this.";
    const doneWhen = text(form, "doneWhen", 500);
    const contact = contactDetailsIn(doneWhen);
    if (contact.length) return `That looks like ${contact.join(" and ")}. Keep contact details in the client record.`;
    patch = { done_when: doneWhen || null };
    summary = `Done when updated: ${a.title}`;
  } else if (op === "priority") {
    const priority = oneOf(PRIORITIES, text(form, "priority", 10));
    if (!priority) return "Pick a priority.";
    patch = { priority };
    summary = `Priority ${priority}: ${a.title}`;
  }
  if (!patch) return "Couldn't save. Reload and try again.";
  let { error } = await db.from("actions").update(patch).eq("id", id);
  // Before 0011 there's no "review" status (a check rule refuses it): the old way, straight to done.
  if (error?.code === "23514" && patch.status === "review") {
    patch = { ...patch, status: "done", done_at: new Date().toISOString() };
    summary = `Done: ${a.title}`;
    kind = "action_done";
    ({ error } = await db.from("actions").update(patch).eq("id", id));
  }
  // Before 0009 there's no blocked_reason column: save the status change without it.
  if (error && MISSING_COLUMN.has(error.code ?? "") && "blocked_reason" in patch) {
    const { blocked_reason: _skip, ...rest } = patch;
    void _skip;
    ({ error } = await db.from("actions").update(rest).eq("id", id));
  }
  if (error && MISSING_COLUMN.has(error.code ?? "") && "done_when" in patch) return "Needs one setup step (0038 SQL).";
  if (error) {
    console.warn(`Action update refused: ${error.code}`);
    return "Couldn't save. You may not be allowed to change this.";
  }
  if (me.role !== "sales") await logActivity(db, { client_id: a.client_id, lead_ghl_id: a.lead_ghl_id, action_id: a.id, kind, summary });
  refreshOps(text(form, "slug", 90));
  return null;
}

/**
 * The same change as updateAction, but says whether it worked, so a field can show
 * "Saved" or the problem (the Work hub's drawer saves fields on its own; WORK_HUB_PLAN.md).
 */
export async function saveActionField(_prev: { error?: string; ok?: boolean } | undefined, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  await notWhilePreviewing();
  const problem = await applyUpdate(form);
  // null = saved; a message = why not; nothing = refused without a reason (salespeople outside their lead work).
  return problem === null ? { ok: true } : { error: problem ?? "You can't change this." };
}

/**
 * Dismiss one Work hub suggestion (0038, owner and managers). It stays hidden while its
 * reason is the same; the database stamps who and when, and allows no edits or deletes.
 */
export async function dismissSuggestion(_prev: { error?: string; ok?: boolean } | undefined, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || (me.role !== "owner" && me.role !== "manager")) return { error: "Only the owner or a manager can dismiss suggestions." };
  const slug = text(form, "slug", 90);
  const rule = oneOf(SUGGESTION_RULES, text(form, "rule", 12));
  const reason = text(form, "reason", 300);
  if (!rule || !reason) return { error: "Couldn't dismiss this one. Reload and try again." };
  const client = (await getRoster()).find((c) => c.id === slug);
  if (!client?.dbId) return { error: "Only suggestions for a client can be dismissed." };
  const db = await createDatabaseClient();
  const { error } = await db.from("work_suggestion_dismissals").insert({ client_id: client.dbId, rule, reason });
  if (error && error.code !== "23505") {
    if (MISSING_TABLE.has(error.code ?? "")) return { error: "Dismiss needs one setup step (0038 SQL)." };
    console.warn(`Dismiss refused: ${error.code}`);
    return { error: "Couldn't dismiss it. You may not be allowed to." };
  }
  refreshOps();
  return { ok: true };
}

/**
 * Fix an item's title and notes (owner and managers; docs/EDIT_FIX_PLAN.md). The database
 * already refuses developers (guard), and records work order title changes in history (0021).
 */
export async function editActionText(_prev: { error?: string; ok?: boolean } | undefined, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || !isLead(me.role)) return { error: "Only the owner or a manager can change this." };
  const id = text(form, "actionId", 40);
  const title = text(form, "title", 120);
  const notes = text(form, "notes", 500);
  if (!isUuid(id)) return { error: "Something went wrong. Reload and try again." };
  if (!title) return { error: "The title can't be empty." };
  const db = await createDatabaseClient();
  const { data: current } = await db.from("actions").select("id, client_id, lead_ghl_id, kind, title, notes").eq("id", id).maybeSingle();
  if (!current) return { error: "That item isn't there any more." };
  const a = current as { id: string; client_id: string | null; lead_ghl_id: string | null; kind: string; title: string; notes: string | null };
  if (a.kind === "work_order") {
    const contact = contactDetailsIn(`${title}\n${notes}`);
    if (contact.length) return { error: `That looks like ${contact.join(" and ")}. Keep contact details in the client record, not in work orders.` };
  }
  if (title === a.title && (notes || null) === a.notes) return { ok: true };
  const { error } = await db.from("actions").update({ title, notes: notes || null }).eq("id", id);
  if (error) {
    console.warn(`Title edit refused: ${error.code}`);
    return { error: "Couldn't save." };
  }
  const summary = title !== a.title ? `Renamed: ${a.title} → ${title}` : `Notes updated: ${title}`;
  await logActivity(db, { client_id: a.client_id, lead_ghl_id: a.lead_ghl_id, action_id: a.id, kind: "action_edited", summary });
  revalidatePath(`/work/orders/${id}`);
  refreshOps(text(form, "slug", 90));
  return { ok: true };
}

/** 0021 isn't run yet: no permission to change check-ins, or the new columns are missing. */
const CHECK_IN_SETUP = new Set(["42501", ...MISSING_COLUMN]);

/** Fix a logged check-in's date, type, mood or note (owner and managers; the database keeps the old values). */
export async function editCheckIn(_prev: { error?: string; ok?: boolean } | undefined, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || !isLead(me.role)) return { error: "Only the owner or a manager can fix check-ins." };
  const id = text(form, "checkInId", 40);
  const day = pastDate(text(form, "date", 10));
  const note = text(form, "note", 500);
  const moodRaw = text(form, "mood", 10);
  const kind = oneOf(CONTACT_KINDS, text(form, "kind", 12));
  if (!isUuid(id)) return { error: "Something went wrong. Reload and try again." };
  if (!day) return { error: "Pick a date that isn't in the future." };
  if (!kind) return { error: "Pick a type." };
  const mood = moodRaw ? oneOf(["better", "same", "worse"] as const, moodRaw) : null;
  if (moodRaw && !mood) return { error: "Pick better, same or worse." };
  const db = await createDatabaseClient();
  const { data, error } = await db.from("check_ins").update({ happened_on: day, note: note || null, mood, kind }).eq("id", id).select("id");
  if (error) {
    console.warn(`Check-in edit refused: ${error.code}`);
    if (CHECK_IN_SETUP.has(error.code ?? "")) return { error: "Fixing check-ins needs one setup step first (0021 SQL)." };
    if (error.code === "23514") return { error: "That check-in is removed. Restore it first, and keep the date in the past." };
    return { error: "Couldn't save." };
  }
  if (!data?.length) return { error: "That check-in isn't there any more." };
  refreshOps(text(form, "slug", 90));
  return { ok: true };
}

/** Remove (hide) or restore a check-in. Removing: owner and managers. Restoring: owner only (the database checks both). */
export async function setCheckInRemoved(form: FormData) {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || !isLead(me.role)) return;
  const id = text(form, "checkInId", 40);
  const op = text(form, "op", 10);
  if (!isUuid(id) || (op !== "remove" && op !== "restore")) return;
  if (op === "restore" && me.role !== "owner") return;
  const db = await createDatabaseClient();
  // The database replaces this time with its own clock and records who did it.
  const { error } = await db.from("check_ins").update({ removed_at: op === "remove" ? new Date().toISOString() : null }).eq("id", id);
  if (error) console.warn(`Check-in ${op} refused: ${error.code}`);
  refreshOps(text(form, "slug", 90));
}

/**
 * Tick or untick one step of a work order (0016). Developers on their own items (the
 * database checks it: RLS + the developer guard allow only status and steps_done);
 * owner and managers on any. Step numbers start at 1 and must exist (the database
 * checks that too). Not written to the history: ticks are progress, not events.
 */
export async function toggleStep(form: FormData) {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me) return;
  const id = text(form, "actionId", 40);
  const step = Number(text(form, "step", 2));
  const on = text(form, "on", 1) === "1";
  if (!isUuid(id) || !Number.isInteger(step) || step < 1 || step > 20) return;
  const db = await createDatabaseClient();
  const { data, error: readError } = await db.from("actions").select("id, status, steps, steps_done").eq("id", id).maybeSingle();
  if (readError || !data) return; // not found, not allowed, or before 0016
  const row = data as { status: string; steps: string | null; steps_done: number[] | null };
  if (row.status === "done" || row.status === "canceled" || step > parseSteps(row.steps).length) return;
  const current = new Set((row.steps_done ?? []).map(Number));
  if (on) current.add(step);
  else current.delete(step);
  const next = [...current].filter((n) => Number.isInteger(n) && n >= 1 && n <= 20).sort((a, b) => a - b);
  const { error } = await db.from("actions").update({ steps_done: next }).eq("id", id);
  if (error) {
    console.warn(`Step tick refused: ${error.code}`);
    return;
  }
  refreshOps();
}

// ---------------------------------------------------------------------------
// Work Orders phase 1 (0017). History and notices are written by the database itself.
// ---------------------------------------------------------------------------

function refreshWorkOrder(id: string) {
  revalidatePath(`/work/orders/${id}`);
  refreshOps();
}

/** Add a comment. Owner/managers on any work order; developers on their current ones (the database checks). */
export async function addWorkOrderComment(_prev: { error?: string; ok?: boolean } | undefined, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me) return { error: "Please sign in again." };
  const id = text(form, "actionId", 40);
  const raw = typeof form.get("body") === "string" ? String(form.get("body")).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").trim() : "";
  if (!isUuid(id)) return { error: "Something went wrong. Reload and try again." };
  if (!raw) return { error: "Write something first." };
  if (raw.length > 2000) return { error: "Keep it under 2,000 characters." };
  const found = contactDetailsIn(raw);
  if (found.length) return { error: `That looks like ${found.join(" and ")}. Leave contact details in the client record, not in work orders.` };
  const db = await createDatabaseClient();
  const { error } = await db.from("work_order_comments").insert({ action_id: id, body: raw });
  if (error) {
    console.warn(`Comment refused: ${error.code}`);
    if (MISSING_TABLE.has(error.code ?? "")) return { error: "Comments need one setup step first (0017 SQL)." };
    if (error.code === "23514") return { error: "That looks like contact details. Remove them and try again." };
    return { error: "You can't comment on this work order." };
  }
  refreshWorkOrder(id);
  return { ok: true };
}

/** Owner/managers: start date and links. */
export async function saveWorkOrderInfo(_prev: { error?: string; ok?: boolean } | undefined, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || (me.role !== "owner" && me.role !== "manager")) return { error: "Only the owner or a manager can change this." };
  const id = text(form, "actionId", 40);
  if (!isUuid(id)) return { error: "Something went wrong. Reload and try again." };
  const startRaw = text(form, "start", 10);
  const start = startRaw ? anyDate(startRaw) : null;
  if (startRaw && !start) return { error: "That start date doesn't look right." };
  const { links, rejected } = cleanLinks(typeof form.get("links") === "string" ? String(form.get("links")).slice(0, 3000) : "");
  if (rejected) return { error: "Links must start with https:// (up to 5, no logins inside them)." };
  const db = await createDatabaseClient();
  const { error } = await db.from("actions").update({ start_on: start, links }).eq("id", id);
  if (error) {
    console.warn(`Work order info refused: ${error.code}`);
    if (MISSING_COLUMN.has(error.code ?? "")) return { error: "This needs one setup step first (0017 SQL)." };
    if (error.code === "23514") return { error: "The start date can't be after the due date." };
    return { error: "Couldn't save." };
  }
  refreshWorkOrder(id);
  return { ok: true };
}

/** Actual time spent. Developers on their own items, owner/managers on any (the database checks). */
export async function saveActualHours(_prev: { error?: string; ok?: boolean } | undefined, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me) return { error: "Please sign in again." };
  const id = text(form, "actionId", 40);
  const minutes = hoursToMinutes(text(form, "hours", 8));
  if (!isUuid(id) || minutes === undefined) return { error: "Enter hours as a number, like 1.5" };
  const db = await createDatabaseClient();
  const { data, error } = await db.from("actions").update({ actual_minutes: minutes }).eq("id", id).select("id");
  if (error || !data?.length) {
    if (error) console.warn(`Hours refused: ${error.code}`);
    return { error: error && MISSING_COLUMN.has(error.code ?? "") ? "This needs one setup step first (0017 SQL)." : "Couldn't save the hours." };
  }
  refreshWorkOrder(id);
  return { ok: true };
}

/** Developer: "Needs reassignment" on their own work order, with a reason. The owner is notified by the database. */
export async function requestReassignment(_prev: { error?: string; ok?: boolean } | undefined, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || me.role !== "developer") return { error: "Only the assigned developer can ask for this." };
  const id = text(form, "actionId", 40);
  const reason = text(form, "reason", 200);
  if (!isUuid(id)) return { error: "Something went wrong. Reload and try again." };
  if (!reason) return { error: "Say why, so the owner can decide." };
  if (contactDetailsIn(reason).length) return { error: "Leave contact details out of the reason." };
  const db = await createDatabaseClient();
  const { data, error } = await db.from("actions").update({ reassign_reason: reason }).eq("id", id).select("id");
  if (error || !data?.length) {
    if (error) console.warn(`Reassignment request refused: ${error.code}`);
    return { error: "Couldn't send the request." };
  }
  refreshWorkOrder(id);
  return { ok: true };
}

/** Owner/managers: close a reassignment request without reassigning. (Reassigning closes it too.) */
export async function closeReassignRequest(form: FormData) {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || (me.role !== "owner" && me.role !== "manager")) return;
  const id = text(form, "actionId", 40);
  if (!isUuid(id)) return;
  const db = await createDatabaseClient();
  const { error } = await db.from("actions").update({ reassign_reason: null }).eq("id", id);
  if (error) console.warn(`Close request refused: ${error.code}`);
  refreshWorkOrder(id);
}

/** Owner only: archive finished or canceled work, or take it back out. Never deleted. */
export async function archiveWorkOrder(form: FormData) {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || me.role !== "owner") return;
  const id = text(form, "actionId", 40);
  const restore = text(form, "op", 10) === "restore";
  if (!isUuid(id)) return;
  const db = await createDatabaseClient();
  const { error } = await db.from("actions").update({ archived_at: restore ? null : new Date().toISOString() }).eq("id", id);
  if (error) console.warn(`Archive refused: ${error.code}`);
  refreshWorkOrder(id);
}

// ---------------------------------------------------------------------------
// Trash (0019, docs/TRASH_PLAN.md). Owner and managers move things to Trash and restore
// them; only the owner deletes forever, only from Trash. The database enforces all of it
// (it stamps who/when, refuses developers, refuses deletes outside Trash and non-owners).
// Nothing here touches GoHighLevel.
// ---------------------------------------------------------------------------

/** Move a client or an item (work order, follow-up, issue) to Trash. */
export async function moveToTrash(form: FormData) {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || (me.role !== "owner" && me.role !== "manager")) return;
  const kind = asTrashKind(text(form, "kind", 10));
  const id = text(form, "id", 40);
  if (!kind || !isUuid(id)) return;
  const db = await createDatabaseClient();
  // The database replaces this time with its own clock and records who did it.
  const { error } = await db.from(kind === "client" ? "clients" : "actions").update({ trashed_at: new Date().toISOString() }).eq("id", id);
  if (error) {
    console.warn(`Trash refused: ${error.code}`);
    redirect(`/trash?refused=${error.code === "23514" ? "billing" : "1"}`);
  }
  refreshOps();
  revalidatePath("/trash");
  redirect("/trash?moved=1");
}

/** Take a client or an item back out of Trash, exactly as it was. */
export async function restoreFromTrash(form: FormData) {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || (me.role !== "owner" && me.role !== "manager")) return;
  const kind = asTrashKind(text(form, "kind", 10));
  const id = text(form, "id", 40);
  if (!kind || !isUuid(id)) return;
  const db = await createDatabaseClient();
  const { error } = await db.from(kind === "client" ? "clients" : "actions").update({ trashed_at: null }).eq("id", id);
  if (error) console.warn(`Restore refused: ${error.code}`);
  refreshOps();
  revalidatePath("/trash");
}

/**
 * Owner only: delete something in Trash FOREVER (with everything attached). The owner
 * types DELETE to confirm. The database refuses it for anyone else, or outside Trash.
 * The ONLY delete in Atlas (guardrail test).
 */
export async function deleteForever(_prev: { error?: string; ok?: boolean } | undefined, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || me.role !== "owner") return { error: "Only the owner can delete things forever." };
  const kind = asTrashKind(text(form, "kind", 10));
  const id = text(form, "id", 40);
  if (!kind || !isUuid(id)) return { error: "That item wasn't found." };
  if (!deleteConfirmed(text(form, "confirm", 20))) return { error: `Type ${DELETE_CONFIRM} to confirm.` };
  const db = await createDatabaseClient();
  const { data, error } = await db.from(kind === "client" ? "clients" : "actions").delete().eq("id", id).not("trashed_at", "is", null).select("id");
  if (error) {
    console.warn(`Delete refused: ${error.code}`);
    return { error: error.code === "23503" ? "It has billing records attached, so it can't be deleted." : "Couldn't delete it. Nothing was changed." };
  }
  if (!data?.length) return { error: "It isn't in Trash any more (or was already deleted)." };
  refreshOps();
  revalidatePath("/trash");
  return { ok: true };
}

/** Mark all my notices read (the database lets each person change only their own). */
export async function markNoticesRead() {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me) return;
  const db = await createDatabaseClient();
  const { error } = await db.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  if (error) console.warn(`Mark read refused: ${error.code}`);
  revalidatePath("/", "layout");
}

const NOTICE_KIND_SET = new Set(["assigned", "unassigned", "due_changed", "comment", "reassign_request", "due_tomorrow"]);

/** Which notice kinds I've muted (my own settings only; the database checks it's me). */
export async function saveNoticeMutes(_prev: { error?: string; ok?: boolean } | undefined, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me) return { error: "Please sign in again." };
  const muted = form.getAll("muted").map(String).filter((k) => NOTICE_KIND_SET.has(k));
  const db = await createDatabaseClient();
  const upd = await db.from("notification_settings").update({ muted, updated_at: new Date().toISOString() }).eq("user_id", me.userId).select("user_id");
  let error = upd.error;
  if (!error && !upd.data?.length) ({ error } = await db.from("notification_settings").insert({ muted }));
  if (error) {
    console.warn(`Mute settings refused: ${error.code}`);
    return { error: MISSING_TABLE.has(error.code ?? "") ? "This needs one setup step first (0017 SQL)." : "Couldn't save." };
  }
  revalidatePath("/notifications");
  return { ok: true };
}

/** "Set up clients" screen: owner and plan for one client in one save (owner only). */
type CareState = { error?: string; ok?: boolean } | undefined;
const SERVICE_NAMES: Record<string, string> = { SEO: "SEO", Ads: "Google Ads", Website: "Website build" };

/** Is 0025 (client care) run? Checked with a column only it adds. */
async function careReady(db: Db): Promise<boolean> {
  const { error } = await db.from("clients").select("vip").limit(1);
  return !error;
}

/** Update a row if it exists, else add it (no upsert: the app may not change key columns). */
async function updateOrInsert(db: Db, table: "client_plans" | "client_money", keys: Record<string, string>, values: Record<string, unknown>): Promise<string | null> {
  let q = db.from(table).update(values);
  for (const [k, v] of Object.entries(keys)) q = q.eq(k, v);
  const { data, error } = await q.select(Object.keys(keys)[0]!);
  if (error) return error.code ?? "?";
  if (data && data.length) return null;
  const ins = await db.from(table).insert({ ...keys, ...values });
  return ins.error ? (ins.error.code ?? "?") : null;
}

/**
 * Owner only: a client's main person, backup, services, tier per service, VIP and monthly
 * amount. Only the fields the form sends are changed. The database enforces owner-only too.
 * Amounts are never written to the history (managers can read it).
 */
export async function saveClientCare(_prev: CareState, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || me.role !== "owner") return { error: "Only the owner can change a client's plan." };
  const clientId = text(form, "clientId", 40);
  if (!isUuid(clientId)) return { error: "Unknown client." };
  const db = await createDatabaseClient();
  const ready = await careReady(db);
  const { data: before } = await db.from("clients").select(ready ? "owner_staff_id, backup_staff_id, vip, services" : "owner_staff_id, services").eq("id", clientId).maybeSingle();
  const prev = before as { owner_staff_id: string | null; backup_staff_id?: string | null; vip?: boolean; services: string[] | null } | null;
  if (!prev) return { error: "Client not found." };

  const update: Record<string, unknown> = {};
  const history: string[] = [];
  let ownerName: string | null = null;
  if (form.has("ownerId")) {
    const ownerId = text(form, "ownerId", 40);
    ownerName = ownerId ? await staffExists(db, ownerId) : null;
    if (ownerId && !ownerName) return { error: "Pick someone from the team." };
    if ((prev.owner_staff_id ?? "") !== ownerId) {
      update.owner_staff_id = ownerId || null;
      history.push(ownerName ? `Main person set to ${ownerName}` : "Main person removed");
    }
  }
  const mainId = (update.owner_staff_id as string | null | undefined) ?? prev.owner_staff_id ?? "";
  if (ready && form.has("backupId")) {
    const backupId = text(form, "backupId", 40);
    const backupName = backupId ? await staffExists(db, backupId) : null;
    if (backupId && !backupName) return { error: "Pick a backup from the team." };
    if (backupId && backupId === mainId) return { error: "Pick a backup who isn't the main person." };
    if ((prev.backup_staff_id ?? "") !== backupId) {
      update.backup_staff_id = backupId || null;
      history.push(backupName ? `Backup set to ${backupName}` : "Backup removed");
    }
  }
  let services = (prev.services ?? []) as string[];
  if (form.has("servicesSent")) services = SERVICES.filter((sv) => form.getAll("services").includes(sv));

  // Tiers: each must be a tier of that service. Picking a tier also ticks the service.
  const tierPicks: { service: string; planId: string | null }[] = [];
  if (ready) {
    for (const sv of SERVICES) if (form.has(`tier_${sv}`)) tierPicks.push({ service: sv, planId: text(form, `tier_${sv}`, 40) || null });
  }
  const current = ready ? ((await db.from("client_plans").select("service, plan_id").eq("client_id", clientId)).data ?? []) as { service: string; plan_id: string | null }[] : [];
  const ids = tierPicks.map((t) => t.planId).filter((x): x is string => Boolean(x));
  if (ids.some((id) => !isUuid(id))) return { error: "Unknown plan tier." };
  const tierRows = ids.length ? (((await db.from("care_plans").select("id, service, name, archived").in("id", ids)).data ?? []) as { id: string; service: string; name: string; archived: boolean }[]) : [];
  const changedTiers: { service: string; planId: string | null }[] = [];
  for (const t of tierPicks) {
    const was = current.find((c) => c.service === t.service)?.plan_id ?? null;
    if (t.planId) {
      const plan = tierRows.find((r) => r.id === t.planId);
      if (!plan || plan.service !== t.service) return { error: "That tier doesn't belong to that service." };
      if (plan.archived && plan.id !== was) return { error: `${plan.name} is archived. Pick another tier.` };
      if (!services.includes(t.service)) services = [...services, t.service];
    }
    if (was !== t.planId) changedTiers.push(t);
  }
  const servicesChanged = [...(prev.services ?? [])].sort().join() !== [...services].sort().join();
  if (servicesChanged) update.services = services;
  if (ready && form.has("vipSent")) {
    const vip = form.get("vip") === "on";
    if (Boolean(prev.vip) !== vip) {
      update.vip = vip;
      history.push(vip ? "Marked VIP" : "VIP removed");
    }
  }
  let monthly: number | null = null;
  if (form.has("monthly")) {
    monthly = parseMonthly(text(form, "monthly", 16));
    if (Number.isNaN(monthly)) return { error: "Monthly amount should be a number like 500 or 499.99." };
    if (monthly !== null && !ready) return { error: "Amounts move to their own owner-only table in setup step 0025. Run it first." };
  }

  if (Object.keys(update).length) {
    const { error } = await db.from("clients").update(update).eq("id", clientId);
    if (error) {
      console.warn(`Client care change refused: ${error.code}`);
      return { error: "Couldn't save that change." };
    }
  }
  for (const t of changedTiers) {
    const code = await updateOrInsert(db, "client_plans", { client_id: clientId, service: t.service }, { plan_id: t.planId });
    if (code) {
      console.warn(`Tier change refused: ${code}`);
      return { error: "Saved the client, but the tier didn't save. Try again." };
    }
  }
  if (monthly !== null) {
    const code = await updateOrInsert(db, "client_money", { client_id: clientId }, { monthly_usd: monthly });
    if (code) {
      console.warn(`Amount change refused: ${code}`);
      return { error: "Saved the rest, but the amount didn't save." };
    }
  }
  if (servicesChanged || changedTiers.length) {
    const tiers = new Map(current.map((c) => [c.service, c.plan_id]));
    for (const t of changedTiers) tiers.set(t.service, t.planId);
    const name = (id: string | null | undefined) => (id ? (tierRows.find((r) => r.id === id)?.name ?? null) : null);
    const label = services.map((sv) => [SERVICE_NAMES[sv], name(tiers.get(sv))].filter(Boolean).join(" ")).join(" + ");
    history.push(`Plan set to: ${label || "no services"}`);
  }
  for (const summary of history) await logActivity(db, { client_id: clientId, kind: "owner_changed", summary });
  refreshOps(text(form, "slug", 90));
  return { ok: true };
}

/** Owner only: add or edit a plan tier (0025). Never deleted; see setCarePlanArchived. */
export async function saveCarePlan(_prev: CareState, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || me.role !== "owner") return { error: "Only the owner can change plan tiers." };
  const id = text(form, "id", 40);
  if (id && !isUuid(id)) return { error: "Unknown tier." };
  const parsed = parseCarePlan({
    service: text(form, "service", 10),
    name: text(form, "name", 60),
    rank: text(form, "rank", 4),
    hours: text(form, "hours", 8),
    includes: typeof form.get("includes") === "string" ? (form.get("includes") as string).slice(0, 2000) : "",
    heatMaps: text(form, "heatMaps", 4),
    reportEveryDays: text(form, "reportEveryDays", 4),
    midMonth: form.get("midMonth") === "on",
    competitorReviewMonths: text(form, "competitorReviewMonths", 4),
    topTier: form.get("topTier") === "on",
  });
  if (!parsed.ok) return { error: parsed.error };
  const secret = findSecrets(parsed.plan.includes.join("\n"));
  if (secret) return { error: secret };
  const p = parsed.plan;
  const row = {
    name: p.name,
    rank: p.rank,
    hours_per_month: p.hoursPerMonth,
    includes: p.includes,
    heat_maps_per_month: p.heatMapsPerMonth,
    report_every_days: p.reportEveryDays,
    mid_month_check_in: p.midMonthCheckIn,
    competitor_review_months: p.competitorReviewMonths,
    top_tier: p.topTier,
  };
  const db = await createDatabaseClient();
  if (!id) {
    const { count } = await db.from("care_plans").select("id", { count: "exact", head: true }).eq("service", p.service).eq("archived", false);
    if ((count ?? 0) >= CARE_RULES.maxTiersPerService) return { error: `Up to ${CARE_RULES.maxTiersPerService} ${p.service} tiers. Archive one first.` };
  }
  const { error } = id ? await db.from("care_plans").update(row).eq("id", id) : await db.from("care_plans").insert({ ...row, service: p.service });
  if (error) {
    console.warn(`Tier not saved: ${error.code}`);
    return {
      error: MISSING_TABLE.has(error.code ?? "") ? "Plan tiers need one setup step first (0025 SQL)." : error.code === "23505" ? `There's already a ${p.service} tier called ${p.name}.` : "Couldn't save the tier.",
    };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Owner only: archive a tier (clients already on it keep it) or bring it back. */
export async function setCarePlanArchived(form: FormData) {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || me.role !== "owner") return;
  const id = text(form, "id", 40);
  if (!isUuid(id)) return;
  const db = await createDatabaseClient();
  const { error } = await db.from("care_plans").update({ archived: form.get("archived") === "true" }).eq("id", id);
  if (error) console.warn(`Tier archive refused: ${error.code}`);
  revalidatePath("/", "layout");
}

type AddClientResult = { error?: string; similar?: { name: string; slug: string }[]; values?: Record<string, string | string[]> };

/**
 * Owner or manager: add a client GoHighLevel didn't bring in. Managers can't set VIP or an
 * amount (the database refuses it too). Warns about a similar existing name first.
 * On a problem, the typed values come back so the form doesn't empty itself.
 */
export async function addClient(_prev: AddClientResult | undefined, form: FormData): Promise<AddClientResult> {
  await notWhilePreviewing();
  const result = await addClientNow(form);
  const values: Record<string, string | string[]> = { services: form.getAll("services").filter((v): v is string => typeof v === "string").slice(0, 3) };
  for (const k of ["name", "startDate", "ownerId", "backupId", "monthly", "vip", "tier_SEO", "tier_Ads", "tier_Website"]) values[k] = text(form, k, 100);
  return { ...result, values };
}

async function addClientNow(form: FormData): Promise<AddClientResult> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || !isLead(me.role)) return { error: "Only the owner or a manager can add clients." };
  const isOwner = me.role === "owner";
  const name = text(form, "name", 100).replace(/\s+/g, " ");
  if (!name || name.length > 80) return { error: "Type the client's business name (up to 80 characters)." };
  if (contactDetailsIn(name).length) return { error: "Just the business name, please: no emails or phone numbers." };
  const startDate = anyDate(text(form, "startDate", 10));
  if (!startDate) return { error: "Pick the day they started." };
  const services = SERVICES.filter((sv) => form.getAll("services").includes(sv));
  if (!services.length) return { error: "Tick at least one service." };
  const ownerId = text(form, "ownerId", 40);
  const backupId = text(form, "backupId", 40);
  if (backupId && backupId === ownerId) return { error: "Pick a backup who isn't the main person." };
  const monthly = isOwner ? parseMonthly(text(form, "monthly", 16)) : null;
  if (Number.isNaN(monthly)) return { error: "Monthly amount should be a number like 500 or 499.99." };
  const vip = isOwner && form.get("vip") === "on";

  const db = await createDatabaseClient();
  const ready = await careReady(db);
  if (!ready && !isOwner) return { error: "Adding clients needs one setup step first (0025 SQL). Ask the owner." };
  if (ownerId && !(await staffExists(db, ownerId))) return { error: "Pick a main person from the team." };
  if (backupId && !(await staffExists(db, backupId))) return { error: "Pick a backup from the team." };

  // A tier is required for each ticked service that has tiers.
  const tierRows = ready ? (((await db.from("care_plans").select("id, service, name, archived")).data ?? []) as { id: string; service: string; name: string; archived: boolean }[]) : [];
  const tiers: { service: string; planId: string; name: string }[] = [];
  for (const sv of services) {
    const options = tierRows.filter((r) => r.service === sv && !r.archived);
    const picked = text(form, `tier_${sv}`, 40);
    if (!picked) {
      if (options.length) return { error: `Pick a ${SERVICE_NAMES[sv]} tier.` };
      continue;
    }
    const plan = options.find((r) => r.id === picked);
    if (!plan) return { error: `Pick a ${SERVICE_NAMES[sv]} tier from the list.` };
    tiers.push({ service: sv, planId: plan.id, name: plan.name });
  }

  // Same client twice? Show the look-alikes until the person ticks "it's a different client".
  const { data: all } = await db.from("clients").select("slug, name").limit(5000);
  const existing = (all ?? []) as { slug: string; name: string }[];
  const similar = similarClients(name, existing);
  if (similar.length && form.get("notDuplicate") !== "on") {
    return { error: "This looks like a client you already have. Open it, or tick \"It's a different client\" and add again.", similar: similar.slice(0, 5) };
  }

  let slug = uniqueSlug(name, existing.map((c) => c.slug));
  const row: Record<string, unknown> = { name, start_date: startDate, status: "active", services, owner_staff_id: ownerId || null };
  if (ready) Object.assign(row, { backup_staff_id: backupId || null, vip, care_started_on: startDate });
  else row.monthly_usd = monthly ?? 0; // before 0025 the amount still lives on the client row
  let added = await db.from("clients").insert({ ...row, slug }).select("id").single();
  if (added.error?.code === "23505") {
    // Someone added the same address a moment ago: try the next free one.
    slug = uniqueSlug(name, [...existing.map((c) => c.slug), slug]);
    added = await db.from("clients").insert({ ...row, slug }).select("id").single();
  }
  if (added.error || !added.data) {
    console.warn(`Client not added: ${added.error?.code}`);
    return { error: "Couldn't add the client." };
  }
  const clientId = (added.data as { id: string }).id;
  const problems: string[] = [];
  for (const t of tiers) {
    const { error } = await db.from("client_plans").insert({ client_id: clientId, service: t.service, plan_id: t.planId, started_on: startDate });
    if (error) problems.push("tier");
  }
  if (ready && isOwner && monthly !== null) {
    const { error } = await db.from("client_money").insert({ client_id: clientId, monthly_usd: monthly });
    if (error) problems.push("amount");
  }
  const label = services.map((sv) => [SERVICE_NAMES[sv], tiers.find((t) => t.service === sv)?.name].filter(Boolean).join(" ")).join(" + ");
  await logActivity(db, { client_id: clientId, kind: "owner_changed", summary: `Added by hand. Plan: ${label}` });
  revalidatePath("/", "layout");
  if (problems.length) return { error: `Client added, but the ${problems.join(" and ")} didn't save. Open the client to fix it.`, similar: [{ name, slug }] };
  redirect(`/clients/${slug}`);
}

// ---------------------------------------------------------------------------
// Client journey + status (0028, docs/CLIENT_CARE_PLAN.md Step 1B). Owner and managers.
// Nothing is deleted and nothing is sent: status changes and touches are add-only logs.
// ---------------------------------------------------------------------------

type JourneyFormState = { error?: string; ok?: boolean } | undefined;
const STATUS_WORDS = { active: "Back to active", paused: "Paused", canceled: "Marked lost" } as const;

/**
 * Pause, mark lost, or bring back a client. The reason is written to the status log FIRST;
 * the database refuses a manager's status change that isn't in the log. Nothing is deleted.
 */
export async function setClientStatus(_prev: JourneyFormState, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || !isLead(me.role)) return { error: "Only the owner or a manager can change a client's status." };
  const clientId = text(form, "clientId", 40);
  if (!isUuid(clientId)) return { error: "Unknown client." };
  const pick = text(form, "to", 10);
  const to = pick === "lost" ? "canceled" : pick === "paused" ? "paused" : pick === "active" ? "active" : null;
  if (!to) return { error: "Pick Active, Paused or Lost." };
  const reason = to === "active" ? "back" : asStatusReason(text(form, "reason", 20));
  if (!reason) return { error: "Pick a reason." };
  const note = text(form, "note", 300);
  const dayRaw = text(form, "date", 10);
  const day = dayRaw ? anyDate(dayRaw) : localToday();
  if (!day || day > localToday()) return { error: "Pick today or an earlier day." };
  const db = await createDatabaseClient();
  const { data: before } = await db.from("clients").select("status").eq("id", clientId).maybeSingle();
  const from = (before as { status?: string } | null)?.status;
  if (!from) return { error: "Client not found." };
  if (from === to) return { error: "The client already has that status." };
  const logged = await db.from("client_status_changes").insert({ client_id: clientId, from_status: from, to_status: to, reason, note: note || null });
  if (logged.error) {
    console.warn(`Status log refused: ${logged.error.code}`);
    return { error: MISSING_TABLE.has(logged.error.code ?? "") ? "Status changes need one setup step first (0028 SQL). Ask the owner." : "Couldn't save the status change." };
  }
  const { error } = await db.from("clients").update({ status: to, end_date: to === "active" ? null : day }).eq("id", clientId);
  if (error) {
    console.warn(`Status change refused: ${error.code}`);
    return { error: "The reason was saved, but the status didn't change. Try again." };
  }
  const why = STATUS_REASONS.find(([k]) => k === reason)?.[1];
  await logActivity(db, { client_id: clientId, kind: "owner_changed", summary: `${STATUS_WORDS[to]}${why ? ` (${why})` : ""}` });
  refreshOps(text(form, "slug", 90));
  return { ok: true };
}

/** How a touch happened, as picked on the Done form. "call_noanswer" keeps the touch open (0031). */
const TOUCH_HOW = {
  call_talked: { status: "done", channel: "call", outcome: "talked" },
  call_noanswer: { status: "attempt", channel: "call", outcome: "voicemail" },
  video: { status: "done", channel: "video", outcome: "talked" },
  text: { status: "done", channel: "text", outcome: null },
  email: { status: "done", channel: "email", outcome: null },
} as const;

/**
 * Log a journey touch:
 * - Done (talked, text or email) also logs a check-in, so health and "last contact" stay right;
 * - No answer (voicemail + text) keeps the touch open for the next working day (0031);
 * - Skip needs a reason.
 */
export async function logTouch(_prev: JourneyFormState, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || !canCare(me.role)) return { error: "Only the client care team can log touches." };
  const clientId = text(form, "clientId", 40);
  if (!isUuid(clientId)) return { error: "Unknown client." };
  const touch = touchByStep(Number(text(form, "step", 4)));
  if (!touch) return { error: "Unknown touch." };
  const skip = text(form, "op", 6) === "skip";
  const howKey = text(form, "how", 16) as keyof typeof TOUCH_HOW;
  const how = skip ? null : (Object.prototype.hasOwnProperty.call(TOUCH_HOW, howKey) ? TOUCH_HOW[howKey] : null);
  if (!skip && !how) return { error: "How did it go? Pick talked, no answer, text, email or video." };
  const note = text(form, "note", 300);
  if (skip && !note) return { error: "Say why you're skipping it." };
  const mood = text(form, "mood", 10);
  if (mood && mood !== "better" && mood !== "same" && mood !== "worse") return { error: "Pick better, same or worse." };
  const secret = findSecrets(note);
  if (secret) return { error: secret };
  const day = localToday();
  const db = await createDatabaseClient();
  // A text or email on a touch planned as a call = "text instead" (the call didn't happen).
  const outcome = how && how.outcome === null && touch.channel === "call" ? "text_instead" : (how?.outcome ?? null);
  const row: Record<string, string | number | null> = { client_id: clientId, step: touch.step, status: skip ? "skipped" : how!.status, happened_on: day, channel: how?.channel ?? null, note: note || null };
  let { error } = await db.from("care_touches").insert(outcome ? { ...row, outcome } : row);
  // Before 0031 there's no outcome column (and no "no answer"): save the plain touch.
  if (error && MISSING_COLUMN.has(error.code) && row.status !== "attempt") ({ error } = await db.from("care_touches").insert(row));
  if (error) {
    console.warn(`Touch not logged: ${error.code}`);
    if (row.status === "attempt") return { error: "\"No answer\" needs one setup step first (0031 SQL). Ask the owner." };
    return { error: MISSING_TABLE.has(error.code ?? "") ? "The journey needs one setup step first (0028 SQL). Ask the owner." : "Couldn't save that." };
  }
  if (how && how.status === "done") {
    // Done = we reached them: a check-in, so health and "last contact" stay right.
    const { error: ci } = await db.from("check_ins").insert({
      client_id: clientId,
      happened_on: day,
      note: `${touch.title}${note ? `: ${note}` : ""}`.slice(0, 500),
      kind: CHECK_IN_KIND[how.channel],
      ...(mood ? { mood } : {}),
    });
    if (ci) console.warn(`Touch check-in not logged: ${ci.code}`);
  }
  refreshOps(text(form, "slug", 90));
  return { ok: true };
}

/** Start (or restart) the 27-touch journey from today. Touches before today stop counting. */
export async function startOnboarding(form: FormData) {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || !isLead(me.role)) return;
  const clientId = text(form, "clientId", 40);
  if (!isUuid(clientId)) return;
  const db = await createDatabaseClient();
  const { error } = await db.from("clients").update({ care_started_on: localToday() }).eq("id", clientId);
  if (error) {
    console.warn(`Journey start refused: ${error.code}`);
    return;
  }
  await logActivity(db, { client_id: clientId, kind: "owner_changed", summary: "Journey started: touch 1 of 27" });
  refreshOps(text(form, "slug", 90));
}

/** Client memory: goal, tone, next ask. Short notes only; no contact details or passwords. */
export async function saveClientMemory(_prev: JourneyFormState, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || !canCare(me.role)) return { error: "Only the client care team can edit client memory." };
  const clientId = text(form, "clientId", 40);
  if (!isUuid(clientId)) return { error: "Unknown client." };
  const goal = text(form, "goal", 120);
  const tone = text(form, "tone", 120);
  const nextAsk = text(form, "nextAsk", 120);
  const all = `${goal}\n${tone}\n${nextAsk}`;
  if (contactDetailsIn(all).length) return { error: "Leave out emails and phone numbers (they live in GoHighLevel)." };
  const secret = findSecrets(all);
  if (secret) return { error: secret };
  const db = await createDatabaseClient();
  const { error } = await db.from("clients").update({ memory_goal: goal || null, memory_tone: tone || null, memory_next_ask: nextAsk || null }).eq("id", clientId);
  if (error) {
    console.warn(`Client memory refused: ${error.code}`);
    return { error: MISSING_TABLE.has(error.code ?? "") ? "Client memory needs one setup step first (0028 SQL). Ask the owner." : "Couldn't save it." };
  }
  refreshOps(text(form, "slug", 90));
  return { ok: true };
}

/**
 * Owner only: restart every active client's journey, a few kickoffs per working day, most
 * important first (VIP, top tier, biggest). Old touches stay in history; nothing is deleted.
 * The screen shows the same schedule as a preview before this runs.
 */
export async function restartAllJourneys(form: FormData) {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || me.role !== "owner") return;
  const from = anyDate(text(form, "from", 10)) ?? localToday();
  const perDay = Math.min(10, Math.max(1, Number(text(form, "perDay", 2)) || RESTART_PER_DAY));
  const clients = (await getRoster()).filter((c) => c.status === "active" && c.dbId).sort(byImportance);
  const db = await createDatabaseClient();
  for (const { client, start } of restartSchedule(clients, from, perDay)) {
    const { error } = await db.from("clients").update({ care_started_on: start }).eq("id", client.dbId!);
    if (error) {
      console.warn(`Journey restart refused: ${error.code}`);
      continue;
    }
    await logActivity(db, { client_id: client.dbId!, kind: "owner_changed", summary: `Journey restarted: touch 1 on ${start}` });
  }
  revalidatePath("/", "layout");
  redirect("/clients");
}

/** Owner only: one person's daily goal in points (0031). */
export async function saveCareTarget(form: FormData) {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || me.role !== "owner") return;
  const userId = text(form, "userId", 40);
  const points = Number(text(form, "points", 4));
  if (!isUuid(userId) || !Number.isInteger(points) || points < 1 || points > 200) return;
  const db = await createDatabaseClient();
  const upd = await db.from("care_targets").update({ daily_points: points }).eq("user_id", userId).select("user_id");
  if (upd.error) {
    console.warn(`Goal refused: ${upd.error.code}`);
    return;
  }
  if (!upd.data?.length) {
    const ins = await db.from("care_targets").insert({ user_id: userId, daily_points: points });
    if (ins.error) console.warn(`Goal refused: ${ins.error.code}`);
  }
  revalidatePath("/", "layout");
}

type CareAiState = { error?: string; moves?: { slug: string; name: string; why: string; leadWith: string }[]; draft?: string; cost?: string } | undefined;

/**
 * AI helper: up to 5 clients to contact first today, with why and what to lead with.
 * Built only from facts in Atlas (journey, health, mood, client memory); names become codes.
 * Suggestions only: nothing is saved or sent.
 */
export async function suggestNextMoves(_prev: CareAiState): Promise<{ error?: string; moves?: { slug: string; name: string; why: string; leadWith: string }[]; cost?: string }> {
  await notWhilePreviewing();
  void _prev; // useActionState passes the last result; a new run doesn't need it
  const pre = await aiPreflight();
  if ("error" in pre) return pre;
  const [roster, journeys, { actions }, team] = await Promise.all([getRoster(), getJourneys(), getActions(), getTeam()]);
  if (!journeys.ready) return { error: "The journey needs one setup step first (0028 SQL)." };
  const today = getToday();
  const soon = new Date(Date.parse(`${today}T00:00:00Z`) + 2 * 86_400_000).toISOString().slice(0, 10);
  const book = buildCodebook(roster);
  const staff = buildStaffBook(team.members.map((m) => ({ id: m.id, name: m.name })));
  const clean = (t: string | null | undefined) => (t ? redactStaff(redact(t, book), staff).slice(0, 120) : null);
  const due = roster
    .filter((c) => c.status === "active" && journeys.bySlug.get(c.id)?.next && journeys.bySlug.get(c.id)!.next!.due <= soon)
    .sort((a, b) => journeys.bySlug.get(a.id)!.next!.due.localeCompare(journeys.bySlug.get(b.id)!.next!.due) || byImportance(a, b))
    .slice(0, 25);
  if (!due.length) return { moves: [] };
  const data = {
    today,
    clients: due.map((c) => {
      const j = journeys.bySlug.get(c.id)!;
      const h = getClientHealth(c, actions);
      return {
        code: book.codeOf.get(c.id),
        stage: JOURNEY_STAGES[j.stage],
        next_touch: j.next!.title,
        due: j.next!.due,
        overdue: j.next!.overdue,
        unanswered_calls: j.next!.attempts,
        important: isImportant(c),
        tier: c.plans?.map((p) => `${p.service} ${p.name}`).join(", ") || null,
        health: h ? { level: h.level, score: h.score } : null,
        last_mood: c.lastMood?.mood ?? null,
        days_since_contact: c.lastContact ? Math.round((Date.parse(today) - Date.parse(c.lastContact)) / 86_400_000) : null,
        goal: clean(c.memory?.goal),
        tone: clean(c.memory?.tone),
        next_ask: clean(c.memory?.nextAsk),
      };
    }),
  };
  const result = await askAi({ task: CARE_MOVES_TASK, data, schema: CARE_MOVES_SCHEMA, maxOutputTokens: 1500, remainingUsd: pre.remaining });
  const db = await createDatabaseClient();
  await logAiUsage(db, "care_suggestions", result);
  if (!result.ok) return { error: result.message };
  const raw = (result.data as { moves?: { client?: unknown; why?: unknown; lead_with?: unknown }[] }).moves ?? [];
  const moves: { slug: string; name: string; why: string; leadWith: string }[] = [];
  for (const m of raw.slice(0, 5)) {
    const hit = restoreClients([m.client], book)[0];
    if (!hit || moves.some((x) => x.slug === hit.slug)) continue;
    moves.push({ slug: hit.slug, name: hit.name, why: restore(String(m.why ?? ""), book).slice(0, 240), leadWith: restore(String(m.lead_with ?? ""), book).slice(0, 240) });
  }
  return { moves, cost: `$${result.costUsd.toFixed(3)}` };
}

/**
 * AI helper: rewrite one touch's message using the client memory. The business name goes in
 * as a code and is put back after. Copy-only: nothing is saved or sent.
 */
export async function draftTouchMessage(_prev: CareAiState, form: FormData): Promise<{ error?: string; draft?: string; cost?: string }> {
  await notWhilePreviewing();
  const pre = await aiPreflight();
  if ("error" in pre) return pre;
  const slug = text(form, "slug", 90);
  const touch = touchByStep(Number(text(form, "step", 4)));
  if (!touch) return { error: "Unknown touch." };
  const [roster, team, careInfo] = await Promise.all([getRoster(), getTeam(), getClientCareInfo()]);
  const client = roster.find((c) => c.id === slug);
  if (!client) return { error: "Unknown client." };
  // They replied STOP (0032): a text touch is written as an email instead.
  const noTexts = Boolean(client.dbId && careInfo.byClient.get(client.dbId)?.noTexts);
  // Only this client gets a code (C1); every other client and staff name is swapped out of notes.
  const book = buildCodebook([client, ...roster.filter((c) => c.id !== client.id)]);
  const staff = buildStaffBook(team.members.map((m) => ({ id: m.id, name: m.name })));
  const clean = (t: string | null | undefined) => (t ? redactStaff(redact(t, book), staff).slice(0, 120) : null);
  const data = {
    touch: { title: touch.title, how: noTexts && touch.channel === "text" ? "Email (they asked not to be texted)" : touch.how, purpose: touch.say, ask_for: touch.ask ?? null, template: touch.template ? touch.template.replaceAll("[Business]", "[C1]") : null },
    client: { code: "C1", tier: client.plans?.map((p) => `${p.service} ${p.name}`).join(", ") || null, goal: clean(client.memory?.goal), tone: clean(client.memory?.tone), next_ask: clean(client.memory?.nextAsk), last_mood: client.lastMood?.mood ?? null },
  };
  const result = await askAi({ task: CARE_DRAFT_TASK, data, schema: CARE_DRAFT_SCHEMA, maxOutputTokens: 800, remainingUsd: pre.remaining });
  const db = await createDatabaseClient();
  await logAiUsage(db, "care_draft", result);
  if (!result.ok) return { error: result.message };
  const draft = restore(String((result.data as { message?: unknown }).message ?? ""), book).slice(0, 1200);
  return { draft, cost: `$${result.costUsd.toFixed(3)}` };
}

// ---------------------------------------------------------------------------
// Client care extras (0032): contact preferences, week-1 intake, "Needs the owner".
// ---------------------------------------------------------------------------

/** Read a client's care row (or null), then update it, or add it if there is none yet. */
async function saveClientCareRow(db: Db, clientId: string, change: (row: { intake: Record<string, string> }) => Record<string, unknown>): Promise<string | null> {
  const { data, error } = await db.from("client_care").select("intake").eq("client_id", clientId).maybeSingle();
  if (error) return error.code ?? "?";
  const intake = ((data as { intake?: Record<string, string> } | null)?.intake ?? {}) as Record<string, string>;
  const values = change({ intake });
  if (data) {
    const upd = await db.from("client_care").update(values).eq("client_id", clientId);
    return upd.error ? (upd.error.code ?? "?") : null;
  }
  const ins = await db.from("client_care").insert({ client_id: clientId, ...values });
  return ins.error ? (ins.error.code ?? "?") : null;
}

/** "No texts" (they replied STOP), preferred channel and best times. Owner or manager. */
export async function saveCareContact(_prev: JourneyFormState, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || !canCare(me.role)) return { error: "Only the client care team can change this." };
  const clientId = text(form, "clientId", 40);
  if (!isUuid(clientId)) return { error: "Unknown client." };
  const noTexts = form.get("noTexts") === "on";
  const channelRaw = text(form, "channel", 6);
  const channel = channelRaw ? asTouchChannel(channelRaw) : null;
  if (channelRaw && !channel) return { error: "Pick call, text, email or video." };
  if (noTexts && channel === "text") return { error: "\"No texts\" is on, so pick another preferred channel." };
  const bestTimes = text(form, "bestTimes", 80);
  if (contactDetailsIn(bestTimes).length) return { error: "Just the times, please (no phone numbers or emails)." };
  const db = await createDatabaseClient();
  const { data: before } = await db.from("client_care").select("no_texts").eq("client_id", clientId).maybeSingle();
  const code = await saveClientCareRow(db, clientId, () => ({ no_texts: noTexts, preferred_channel: channel, best_times: bestTimes || null }));
  if (code) {
    console.warn(`Contact preferences refused: ${code}`);
    return { error: MISSING_TABLE.has(code) ? "This needs one setup step first (0032 SQL). Ask the owner." : "Couldn't save that." };
  }
  const was = Boolean((before as { no_texts?: boolean } | null)?.no_texts);
  if (was !== noTexts) await logActivity(db, { client_id: clientId, kind: "owner_changed", summary: noTexts ? "No texts: client asked not to be texted (use email)" : "Texts allowed again" });
  refreshOps(text(form, "slug", 90));
  return { ok: true };
}

/** Tick or untick one week-1 intake item ("received", with today's date). Owner or manager. */
export async function setIntakeItem(form: FormData) {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || !canCare(me.role)) return;
  const clientId = text(form, "clientId", 40);
  const key = asIntakeKey(text(form, "item", 20));
  if (!isUuid(clientId) || !key) return;
  const on = form.get("on") === "true";
  const db = await createDatabaseClient();
  const code = await saveClientCareRow(db, clientId, ({ intake }) => {
    const next = { ...intake };
    if (on) next[key] = localToday();
    else delete next[key];
    return { intake: next };
  });
  if (code) console.warn(`Intake refused: ${code}`);
  refreshOps(text(form, "slug", 90));
}

/** "Needs the owner": a one-line reason; the owner gets a notice (the database sends it). */
export async function raiseEscalation(_prev: JourneyFormState, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || !canCare(me.role)) return { error: "Only the client care team can do this." };
  const clientId = text(form, "clientId", 40);
  if (!isUuid(clientId)) return { error: "Unknown client." };
  const reason = text(form, "reason", 200);
  if (!reason) return { error: "Say in one line what's going on." };
  const secret = findSecrets(reason);
  if (secret) return { error: secret };
  const db = await createDatabaseClient();
  const { error } = await db.from("care_escalations").insert({ client_id: clientId, reason });
  if (error) {
    console.warn(`Escalation refused: ${error.code}`);
    return { error: MISSING_TABLE.has(error.code ?? "") ? "This needs one setup step first (0032 SQL). Ask the owner." : "Couldn't send that." };
  }
  await logActivity(db, { client_id: clientId, kind: "owner_changed", summary: "Flagged for the owner" });
  refreshOps(text(form, "slug", 90));
  return { ok: true };
}

/** Owner only: mark a "Needs the owner" item resolved. */
export async function resolveEscalation(form: FormData) {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || me.role !== "owner") return;
  const id = text(form, "id", 40);
  if (!isUuid(id)) return;
  const db = await createDatabaseClient();
  const { error } = await db.from("care_escalations").update({ resolved_at: new Date().toISOString() }).eq("id", id);
  if (error) console.warn(`Resolve refused: ${error.code}`);
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// VA requests (0033): a VA ASKS to pause, mark lost or bring back a client; an owner or
// manager approves (the change is made as them, logged as usual) or turns it down.
// ---------------------------------------------------------------------------

/** VA only: ask for a status change. Nothing changes until an owner or manager approves. */
export async function requestStatusChange(_prev: JourneyFormState, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || me.role !== "va") return { error: "Only VAs send requests; you can change the status directly." };
  const clientId = text(form, "clientId", 40);
  if (!isUuid(clientId)) return { error: "Unknown client." };
  const pick = text(form, "to", 10);
  const to = pick === "lost" ? "canceled" : pick === "paused" ? "paused" : pick === "active" ? "active" : null;
  if (!to) return { error: "Pick Active, Paused or Lost." };
  const reason = to === "active" ? "back" : asStatusReason(text(form, "reason", 20));
  if (!reason) return { error: "Pick a reason." };
  const note = text(form, "note", 300);
  const secret = findSecrets(note);
  if (secret) return { error: secret };
  const db = await createDatabaseClient();
  const { error } = await db.from("va_requests").insert({ client_id: clientId, to_status: to, reason, note: note || null });
  if (error) {
    console.warn(`VA request refused: ${error.code}`);
    return { error: MISSING_TABLE.has(error.code ?? "") ? "Requests need one setup step first (0033 SQL). Ask the owner." : "Couldn't send the request." };
  }
  refreshOps(text(form, "slug", 90));
  return { ok: true };
}

/**
 * Owner or manager: approve or turn down a VA's request. Approving makes the change as the
 * approver, with the reason in the status log first (the database checks that), then marks
 * the request decided. A request is decided once.
 */
export async function decideVaRequest(form: FormData) {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || !isLead(me.role)) return;
  const id = text(form, "id", 40);
  const approve = text(form, "decision", 10) === "approve";
  if (!isUuid(id)) return;
  const db = await createDatabaseClient();
  const { data: req } = await db.from("va_requests").select("client_id, to_status, reason, note, status").eq("id", id).maybeSingle();
  const r = req as { client_id: string; to_status: string; reason: string; note: string | null; status: string } | null;
  if (!r || r.status !== "waiting") return;
  if (approve) {
    const { data: before } = await db.from("clients").select("status").eq("id", r.client_id).maybeSingle();
    const from = (before as { status?: string } | null)?.status;
    if (from && from !== r.to_status) {
      const logged = await db.from("client_status_changes").insert({ client_id: r.client_id, from_status: from, to_status: r.to_status, reason: r.reason, note: r.note ? `VA request: ${r.note}`.slice(0, 300) : "VA request" });
      if (logged.error) {
        console.warn(`Status log refused: ${logged.error.code}`);
        return;
      }
      const { error } = await db.from("clients").update({ status: r.to_status, end_date: r.to_status === "active" ? null : localToday() }).eq("id", r.client_id);
      if (error) {
        console.warn(`Status change refused: ${error.code}`);
        return;
      }
      const why = STATUS_REASONS.find(([k]) => k === r.reason)?.[1];
      await logActivity(db, { client_id: r.client_id, kind: "owner_changed", summary: `${STATUS_WORDS[r.to_status as keyof typeof STATUS_WORDS]}${why ? ` (${why})` : ""}, as a VA asked` });
    }
  }
  const { error } = await db.from("va_requests").update({ status: approve ? "approved" : "declined" }).eq("id", id);
  if (error) console.warn(`Request decision refused: ${error.code}`);
  revalidatePath("/", "layout");
}

/** Who owns a client (owner only; the database enforces this too). */
export async function setClientOwner(form: FormData) {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || me.role !== "owner") return;
  const clientId = text(form, "clientId", 40);
  const ownerId = text(form, "ownerId", 40);
  if (!isUuid(clientId)) return;
  const db = await createDatabaseClient();
  const name = ownerId ? await staffExists(db, ownerId) : null;
  if (ownerId && !name) return;
  const { error } = await db.from("clients").update({ owner_staff_id: ownerId || null }).eq("id", clientId);
  if (error) {
    console.warn(`Owner change refused: ${error.code}`);
    return;
  }
  await logActivity(db, { client_id: clientId, kind: "owner_changed", summary: name ? `Owner set to ${name}` : "Owner removed" });
  refreshOps(text(form, "slug", 90));
}

// ---------------------------------------------------------------------------
// Atlas asks
// ---------------------------------------------------------------------------

export async function answerQuestion(form: FormData) {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || (me.role !== "owner" && me.role !== "manager")) return;
  const key = text(form, "key", 120);
  const status = text(form, "status", 10);
  if (status !== "answered" && status !== "skipped" && status !== "later") return;

  // Only accept questions the server itself would ask this person right now.
  const question = (await getAtlasQuestions(50)).find((q) => q.key === key);
  if (!question) return;

  const db = await createDatabaseClient();
  let answer: string | null = null;

  if (status === "answered") {
    switch (question.type) {
      case "services": {
        const picked = form.getAll("services").filter((v): v is (typeof SERVICES)[number] => SERVICES.includes(v as never));
        if (picked.length === 0) return;
        const { error } = await db.from("clients").update({ services: picked }).eq("id", question.clientDbId);
        if (error) return;
        answer = picked.join(", ");
        break;
      }
      case "also_seo": {
        const yes = text(form, "choice", 3) === "yes";
        if (yes) {
          const { error } = await db.from("clients").update({ services: [...question.services, "SEO"] }).eq("id", question.clientDbId);
          if (error) return;
        }
        answer = yes ? "yes" : "no";
        break;
      }
      case "end_date": {
        const day = pastDate(text(form, "date", 10));
        if (!day) return;
        const { error } = await db.from("clients").update({ end_date: day }).eq("id", question.clientDbId);
        if (error) return;
        answer = day;
        break;
      }
      case "last_contact": {
        const day = pastDate(text(form, "date", 10));
        if (!day) return;
        const { error } = await db.from("check_ins").insert({ client_id: question.clientDbId, happened_on: day, note: "Logged from Atlas asks" });
        if (error) return;
        answer = day;
        break;
      }
      case "check": {
        const ok = text(form, "choice", 3) === "ok";
        const note = text(form, "note", 300);
        if (!ok && !note) return;
        const { error } = await db.from("clients").update({ check_note: ok ? null : note }).eq("id", question.clientDbId);
        if (error) return;
        answer = ok ? "Confirmed correct" : note;
        break;
      }
    }
  }

  await db.from("atlas_answers").insert({ question_key: key, client_id: question.clientDbId, status, answer });
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// One-time import: private file on this Mac → database (owner only)
// ---------------------------------------------------------------------------

export async function importPrivateData(): Promise<{ error?: string; message?: string }> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || me.role !== "owner") return { error: "Only the owner can import." };
  const roster = loadPrivateRoster();
  if (!roster) return { error: "No private client file found on this Mac." };
  const db = await createDatabaseClient();

  // After 0025 amounts live in client_money (owner only), not on the client row.
  const ready = await careReady(db);
  const rows = roster.clients.map((c) => ({
    slug: c.id,
    name: c.name,
    ...(ready ? {} : { monthly_usd: c.monthlyUsd ?? 0 }),
    start_date: c.startDate,
    status: c.status,
    services: c.services,
    listed_in: c.listedIn,
    check_note: c.check ?? null,
    follow_up: c.followUp ?? null,
    end_date: c.endDate ?? null,
  }));
  // Matching by slug means running it twice updates instead of duplicating.
  const { error } = await db.from("clients").upsert(rows, { onConflict: "slug" });
  if (error) {
    // Code + short message only (this Mac's log). Never the details, which can contain client data.
    console.warn(`Import refused: ${error.code} ${error.message}`);
    return { error: `Import failed and nothing was saved (code ${error.code ?? "?"}).` };
  }
  if (ready) {
    const { data: ids } = await db.from("clients").select("id, slug");
    const idBySlug = new Map(((ids ?? []) as { id: string; slug: string }[]).map((r) => [r.slug, r.id]));
    for (const c of roster.clients) {
      const id = idBySlug.get(c.id);
      if (id) await updateOrInsert(db, "client_money", { client_id: id }, { monthly_usd: c.monthlyUsd ?? 0 });
    }
  }

  const team = loadPrivateTeam() ?? [];
  if (team.length) {
    const { error: teamError } = await db
      .from("staff")
      .upsert(team.map((m) => ({ name: m.name, role: m.role, handles: m.handles })), { onConflict: "name" });
    if (teamError) {
      console.warn(`Team import refused: ${teamError.code} ${teamError.message}`);
      return { error: `Clients imported, but the team list failed (code ${teamError.code ?? "?"}).` };
    }
  }

  const { count } = await db.from("clients").select("id", { count: "exact", head: true });
  revalidatePath("/", "layout");
  return {
    message: `Imported ${rows.length} clients${roster.skipped ? ` (${roster.skipped} skipped by checks)` : ""} and ${team.length} team members. The database now has ${count ?? "?"} clients.`,
  };
}

// ---------------------------------------------------------------------------
// GoHighLevel sync (owner only): READS from GHL, writes copies into OUR database.
// Nothing is ever sent to GoHighLevel; src/lib/ghl/client.ts can only send GETs.
// ---------------------------------------------------------------------------

export async function syncFromGhl(): Promise<{ error?: string; message?: string }> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || me.role !== "owner") return { error: "Only the owner can sync." };
  if (!isGhlConfigured()) return { error: "GoHighLevel isn't set up on this Mac yet." };
  const db = await createDatabaseClient();
  const result = await runGhlSync(db, await getRoster());
  if (result.error) return result;
  // Billing (0015): refreshed along with the sync when connected (the 10-minute limit still applies).
  const billing = isGhlBillingConfigured() ? await syncBilling() : null;
  const billingNote = billing ? ` Billing: ${billing.error ?? billing.message}` : "";
  revalidatePath("/", "layout");
  return { message: `${result.message}${billingNote} Nothing in GoHighLevel was changed.` };
}

/**
 * Owner's Home: if the last GoHighLevel sync is over a day old, run one in the background
 * after the page is sent (read-only, same allowlisted GETs as the Sync button; no billing).
 * The next visit shows the fresh call/message times. Nobody has to press Sync.
 */
export async function autoSyncGhl(): Promise<void> {
  await notWhilePreviewing(); // callers catch this; a preview never syncs anything
  const me = await getCurrentMember();
  if (!me || me.role !== "owner" || !isGhlConfigured()) return;
  const db = await createDatabaseClient();
  const { data, error } = await db.from("ghl_syncs").select("ran_at").order("ran_at", { ascending: false }).limit(1);
  if (error || !autoSyncDue((data?.[0]?.ran_at as string | undefined) ?? null, new Date())) return;
  // Read everything that needs this request (sign-in, client list) now; after() can't.
  const clients = await getRoster();
  after(async () => {
    const result = await runGhlSync(db, clients).catch(() => ({ error: "stopped" }));
    if (result.error) console.warn("Daily GoHighLevel sync stopped; the Sync button still works.");
  });
}

/** Reads from GoHighLevel and saves copies. No cookies or page refresh, so it can run after a page is sent. */
async function runGhlSync(db: Db, clients: RosterClient[]): Promise<{ error?: string; message?: string }> {
  let locationName: string | null;
  let opportunities: GhlOpportunity[];
  let appointments: GhlAppointment[];
  try {
    // The sub-account name is a nice-to-have (needs the optional locations.readonly scope).
    locationName = await readLocationName().catch(() => null);
    opportunities = await readOpportunities();
    appointments = await readAppointments();
  } catch (err) {
    const message = err instanceof GhlError ? err.message : "Couldn't read from GoHighLevel.";
    console.warn(`GHL sync stopped: ${err instanceof GhlError ? err.status : "unknown"}`);
    return { error: `${message} Nothing was changed.` };
  }

  const now = new Date().toISOString();
  const saved = await saveOpportunities(db, opportunities, now);
  if (saved) return { error: `Read from GoHighLevel, but saving failed (code ${saved}).` };
  // Sales (0020): who each lead is assigned to. Needs users.readonly; a problem here never undoes the sync.
  const usersNote = await syncGhlUsers(db);
  if (appointments.length) {
    const { error } = await db.from("ghl_appointments").upsert(
      appointments.map((a) => ({
        ghl_id: a.ghlId,
        calendar_name: a.calendarName,
        status: a.status,
        starts_at: a.startsAt,
        ends_at: a.endsAt,
        ghl_created_at: a.createdAt,
        synced_at: now,
      })),
      { onConflict: "ghl_id" },
    );
    if (error) {
      console.warn(`GHL appointments save refused: ${error.code} ${error.message}`);
      return { error: `Opportunities saved, but appointments failed (code ${error.code ?? "?"}).` };
    }
  }
  await db.from("ghl_syncs").insert({ location_name: locationName, opportunities: opportunities.length, appointments: appointments.length });
  // Phase 6: call/message TIMES for clients. A problem here never undoes the pipeline sync.
  const times = await syncContactTimes(db, clients);
  return {
    message: `Read ${opportunities.length} opportunities and ${appointments.length} appointments${locationName ? ` from ${locationName}` : ""}. ${times}${usersNote}`,
  };
}

// ---------------------------------------------------------------------------
// Sales (0020, docs/SALES_PLAN.md). GoHighLevel stays read-only: these read from it
// and write copies, reach-outs, targets and settings into OUR database only.
// ---------------------------------------------------------------------------

/**
 * Saves opportunity copies. Returns an error code, or null. Before 0020, saves without
 * pipeline/assignee. onlyNew: add leads that aren't in the copy yet, leave existing ones.
 */
async function saveOpportunities(db: Db, opportunities: GhlOpportunity[], now: string, onlyNew = false): Promise<string | null> {
  if (!opportunities.length) return null;
  const rows = opportunities.map((o) => ({
    ghl_id: o.ghlId,
    name: o.name,
    pipeline_id: o.pipelineId,
    pipeline_name: o.pipelineName,
    stage_name: o.stageName,
    status: o.status,
    monetary_value: o.monetaryValue,
    source: o.source,
    ghl_created_at: o.createdAt,
    ghl_updated_at: o.updatedAt,
    status_changed_at: o.statusChangedAt,
    assigned_user_id: o.assignedUserId,
    synced_at: now,
  }));
  const options = { onConflict: "ghl_id", ignoreDuplicates: onlyNew };
  let { error } = await db.from("ghl_opportunities").upsert(rows, options);
  if (error && MISSING_COLUMN.has(error.code ?? "")) {
    const older = rows.map((r) => {
      const { pipeline_id: _p, assigned_user_id: _a, ...rest } = r;
      void _p;
      void _a;
      return rest;
    });
    ({ error } = await db.from("ghl_opportunities").upsert(older, options));
  }
  if (error) {
    console.warn(`GHL opportunities save refused: ${error.code} ${error.message}`);
    return error.code ?? "?";
  }
  return null;
}

/** GoHighLevel users' ids + names. Returns a short note for the Sync message. */
async function syncGhlUsers(db: Db): Promise<string> {
  let users: GhlUser[];
  try {
    users = await readUsers();
  } catch (err) {
    const status = err instanceof GhlError ? err.status : 0;
    return status === 403 ? " Lead owners: add the View Users (users.readonly) permission to turn them on." : " Lead owners: couldn't read GoHighLevel users this time.";
  }
  if (!users.length) return "";
  const { error } = await db.from("ghl_users").upsert(
    users.map((u) => ({ ghl_user_id: u.ghlUserId, name: u.name, synced_at: new Date().toISOString() })),
    { onConflict: "ghl_user_id" },
  );
  if (error) return MISSING_TABLE.has(error.code ?? "") ? " Lead owners: run the 0020 setup step to turn them on." : "";
  return ` Read ${users.length} GoHighLevel user name${users.length === 1 ? "" : "s"}.`;
}

/**
 * "Refresh leads": owner, managers and salespeople. Reads ONLY the sales pipelines from
 * GoHighLevel (GET only) and updates our copies. One refresh every 10 minutes for
 * everyone together (the database enforces it too).
 */
export async function refreshLeads(): Promise<{ error?: string; message?: string }> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || (!isLead(me.role) && me.role !== "sales")) return { error: "Only the owner, managers and salespeople can refresh leads." };
  const r = await runLeadRefresh(me.role, await createDatabaseClient());
  revalidatePath("/", "layout");
  return r;
}

/**
 * Called when someone opens Home or Sales: if the copy is over an hour old, refreshes it in the
 * background AFTER the page is sent (like autoSyncGhl), so nobody waits for GoHighLevel.
 * The next visit shows the result.
 */
export async function autoRefreshLeads(): Promise<void> {
  await notWhilePreviewing(); // callers catch this; a preview never refreshes anything
  const me = await getCurrentMember();
  if (!me || (!isLead(me.role) && me.role !== "sales")) return;
  const db = await createDatabaseClient();
  const [last, sync] = await Promise.all([
    db.from("lead_refreshes").select("ran_at").order("ran_at", { ascending: false }).limit(1),
    db.from("ghl_syncs").select("ran_at").order("ran_at", { ascending: false }).limit(1),
  ]);
  if (last.error) return; // before 0020
  const newest = [last.data?.[0]?.ran_at, sync.data?.[0]?.ran_at].filter((x): x is string => Boolean(x)).sort().pop() ?? null;
  if (!refreshDue(newest, new Date()) || !isGhlConfigured()) return;
  // Sign-in and role are read now; after() can't read cookies from a page.
  const role = me.role;
  after(async () => {
    const result = await runLeadRefresh(role, db).catch(() => ({ error: "stopped" }));
    if (result.error) console.warn("Background lead refresh skipped; the Refresh button still works.");
  });
}

/** Reads the sales pipelines from GoHighLevel and saves copies. No cookies, so it can run after a page is sent. */
async function runLeadRefresh(role: string, db: Db): Promise<{ error?: string; message?: string }> {
  if (!isGhlConfigured()) return { error: "GoHighLevel isn't connected yet." };
  const [pl, last] = await Promise.all([
    db.from("sales_pipelines").select("pipeline_id").eq("active", true),
    db.from("lead_refreshes").select("ran_at").order("ran_at", { ascending: false }).limit(1),
  ]);
  if (pl.error || last.error) return { error: "Sales needs one setup step first (0020 SQL)." };
  const ids = (pl.data ?? []).map((r) => r.pipeline_id as string);
  if (!ids.length) return { error: role === "owner" ? "Pick your sales pipelines first (Sales setup)." : "The owner hasn't picked the sales pipelines yet." };
  if (!refreshAllowed(last.data?.[0]?.ran_at ?? null, new Date())) return { error: `Leads were refreshed in the last ${SALES_RULES.refreshLimitMinutes} minutes. Try again shortly.` };
  let opportunities: GhlOpportunity[];
  try {
    opportunities = await readOpportunities(ids);
  } catch (err) {
    console.warn(`Lead refresh stopped: ${err instanceof GhlError ? err.status : "unknown"}`);
    return { error: `${err instanceof GhlError ? err.message : "Couldn't read from GoHighLevel."} Nothing was changed.` };
  }
  // Claim the refresh first: the database refuses a second one within 10 minutes.
  const claim = await db.from("lead_refreshes").insert({ leads: opportunities.length });
  if (claim.error) return { error: claim.error.code === "23514" ? "Someone just refreshed the leads. Try again in a few minutes." : "Couldn't refresh right now." };
  const now = new Date().toISOString();
  let closedNote = "";
  if (role === "sales") {
    // Salespeople only ever see OPEN leads, so the database lets them save open leads only
    // (tested in section 7q). Leads that closed in GoHighLevel are updated by the next
    // owner or manager refresh, or the owner's Sync.
    const { data: seen } = await readAllRows(
      (from, to, withCount) => db.from("ghl_opportunities").select("ghl_id", { count: withCount ? "exact" : undefined }).in("pipeline_id", ids).order("ghl_id").range(from, to),
      5000,
    );
    const visible = new Set((seen ?? []).map((r) => r.ghl_id as string));
    const open = opportunities.filter((o) => o.status === "open");
    const saved =
      (await saveOpportunities(db, open.filter((o) => visible.has(o.ghlId)), now)) ??
      (await saveOpportunities(db, open.filter((o) => !visible.has(o.ghlId)), now, true));
    if (saved) return { error: `Read the leads, but saving failed (code ${saved}).` };
    const closed = opportunities.filter((o) => o.status !== "open" && visible.has(o.ghlId)).length;
    if (closed) closedNote = ` ${closed} lead${closed === 1 ? "" : "s"} closed in GoHighLevel will drop off after the owner or a manager refreshes.`;
  } else {
    const saved = await saveOpportunities(db, opportunities, now);
    if (saved) return { error: `Read the leads, but saving failed (code ${saved}).` };
  }
  const usersNote = await syncGhlUsers(db);
  return { message: `Refreshed ${opportunities.length} lead${opportunities.length === 1 ? "" : "s"} from your sales pipelines.${closedNote}${usersNote} Nothing in GoHighLevel was changed.` };
}

/** "Called / Texted / Emailed / Met / Walk-in" on a lead. Add-only; the database stamps who and when. */
export async function logLeadTouch(_prev: { error?: string; ok?: boolean } | undefined, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || (!isLead(me.role) && me.role !== "sales")) return { error: "Only the owner, managers and salespeople can log reach-outs." };
  const leadId = text(form, "leadId", 64);
  const kind = asTouchKind(text(form, "kind", 10));
  const raw = typeof form.get("note") === "string" ? String(form.get("note")).slice(0, 400) : "";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(leadId)) return { error: "Unknown lead." };
  if (!kind) return { error: "Pick what you did." };
  const checked = checkTouchNote(raw);
  if (checked.error) return { error: checked.error };
  const db = await createDatabaseClient();
  const { error } = await db.from("lead_touches").insert({ lead_ghl_id: leadId, kind, note: checked.note });
  if (error) {
    console.warn(`Reach-out refused: ${error.code}`);
    return { error: MISSING_TABLE.has(error.code ?? "") ? "Sales needs one setup step first (0020 SQL)." : error.code === "42501" ? "That lead isn't in a sales pipeline." : "Couldn't save it." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Owner: tick a pipeline as Sales (or turn it off) and mark its hot stages. */
export async function saveSalesPipeline(_prev: { error?: string; ok?: boolean } | undefined, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || me.role !== "owner") return { error: "Only the owner can pick sales pipelines." };
  const id = text(form, "pipelineId", 64);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return { error: "Unknown pipeline." };
  const db = await createDatabaseClient();
  // The name and stages must come from our own copy, not from the form.
  const { data } = await readAllRows(
    (from, to, withCount) => db.from("ghl_opportunities").select("pipeline_name, stage_name", { count: withCount ? "exact" : undefined }).eq("pipeline_id", id).order("ghl_id").range(from, to),
    5000,
  );
  if (!data?.length) return { error: "That pipeline isn't in the last sync." };
  const stages = new Set(data.map((r) => r.stage_name as string | null).filter((x): x is string => Boolean(x)));
  const hot = form.getAll("hot").filter((v): v is string => typeof v === "string" && stages.has(v)).slice(0, 30);
  const row = {
    pipeline_id: id,
    pipeline_name: (data[0]!.pipeline_name as string | null)?.slice(0, 100) ?? null,
    hot_stages: hot,
    active: form.get("active") === "on",
    updated_by: me.userId,
    updated_at: new Date().toISOString(),
  };
  const { error } = await db.from("sales_pipelines").upsert(row, { onConflict: "pipeline_id" });
  if (error) {
    console.warn(`Sales pipeline refused: ${error.code}`);
    return { error: MISSING_TABLE.has(error.code ?? "") ? "Sales needs one setup step first (0020 SQL)." : "Couldn't save it." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Owner: which GoHighLevel user a login is (for "Mine" and lead owners). Blank unlinks. */
export async function linkGhlUser(form: FormData) {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || me.role !== "owner") return;
  const userId = text(form, "userId", 40);
  const ghlUserId = text(form, "ghlUserId", 40);
  if (!isUuid(userId)) return;
  if (ghlUserId && !/^[A-Za-z0-9]{6,40}$/.test(ghlUserId)) return;
  const db = await createDatabaseClient();
  if (ghlUserId) {
    const { data } = await db.from("ghl_users").select("ghl_user_id").eq("ghl_user_id", ghlUserId).maybeSingle();
    if (!data) return;
    // One login per GoHighLevel user: unlink it from anyone else first.
    await db.from("team_members").update({ ghl_user_id: null }).eq("ghl_user_id", ghlUserId).neq("user_id", userId);
  }
  const { error } = await db.from("team_members").update({ ghl_user_id: ghlUserId || null }).eq("user_id", userId);
  if (error) console.warn(`GoHighLevel link refused: ${error.code}`);
  revalidatePath("/", "layout");
}

/** Owner: a salesperson's daily reach-out target (weekdays). */
export async function saveSalesTarget(form: FormData) {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || me.role !== "owner") return;
  const userId = text(form, "userId", 40);
  const n = Number(text(form, "target", 4));
  if (!isUuid(userId) || !Number.isInteger(n) || n < 0 || n > 200) return;
  const db = await createDatabaseClient();
  const { error } = await db
    .from("sales_targets")
    .upsert({ user_id: userId, daily_target: n, updated_by: me.userId, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) console.warn(`Sales target refused: ${error.code}`);
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// Phase 6: call and message TIMES (never message text). Owner only.
// ---------------------------------------------------------------------------

const GHL_ID = /^[A-Za-z0-9]{6,40}$/;

function statsRow(clientId: string, contactId: string, a: GhlContactActivity) {
  return {
    client_id: clientId,
    ghl_contact_id: contactId,
    last_inbound_at: a.lastInboundAt,
    last_outbound_at: a.lastOutboundAt,
    last_call_at: a.lastCallAt,
    last_call_seconds: a.lastCallSeconds,
    last_channel: a.lastChannel,
    last_direction: a.lastDirection,
    unanswered_outbound: a.unansweredOutbound,
    synced_at: new Date().toISOString(),
  };
}

/** Name variants to search GoHighLevel with: the full name, then its first word. */
function nameQueries(name: string): string[] {
  const clean = name.replace(/\(.*?\)/g, " ").replace(/\s+/g, " ").trim();
  const first = clean.split(" ")[0] ?? "";
  return [...new Set([clean, first.length >= 3 ? first : ""].filter(Boolean))];
}

/** Reads times for confirmed matches and suggests matches for the rest. Returns a short summary. */
async function syncContactTimes(db: Db, roster: RosterClient[]): Promise<string> {
  const links = await db.from("ghl_contact_links").select("client_id, ghl_contact_id, status");
  if (links.error) return "Call/message times: run the 0008 setup step to turn them on.";
  const clients = roster.filter((c) => (c.status === "active" || c.status === "paused") && c.dbId);
  const rows = (links.data ?? []) as { client_id: string; ghl_contact_id: string; status: string }[];
  let read = 0;
  let suggested = 0;
  try {
    for (const c of clients) {
      const mine = rows.filter((r) => r.client_id === c.dbId);
      const confirmed = mine.find((r) => r.status === "confirmed");
      if (confirmed) {
        const a = await readContactActivity(confirmed.ghl_contact_id);
        if (!a) continue;
        const { error } = await db.from("ghl_contact_stats").upsert(statsRow(c.dbId!, confirmed.ghl_contact_id, a), { onConflict: "client_id" });
        if (!error) read++;
        else console.warn(`Contact times save refused: ${error.code}`);
      } else if (!mine.some((r) => r.status === "suggested")) {
        // Suggest up to 3 contacts by name. Previously rejected ones are skipped.
        const rejected = new Set(mine.map((r) => r.ghl_contact_id));
        const seen = new Map<string, string | null>();
        for (const q of nameQueries(c.name)) {
          for (const cand of await searchContacts(q)) if (!rejected.has(cand.contactId)) seen.set(cand.contactId, cand.name);
          if (seen.size) break;
        }
        const add = [...seen.entries()].slice(0, 3).map(([id, name]) => ({ client_id: c.dbId!, ghl_contact_id: id, contact_name: name, status: "suggested" }));
        if (add.length) {
          const { error } = await db.from("ghl_contact_links").upsert(add, { onConflict: "client_id,ghl_contact_id", ignoreDuplicates: true });
          if (!error) suggested += add.length;
        }
      }
    }
  } catch (err) {
    console.warn(`Contact times stopped: ${err instanceof GhlError ? err.status : "unknown"}`);
    const why = err instanceof GhlError && err.status === 403 ? "the integration needs View Conversations + View Conversation Messages." : "GoHighLevel stopped answering; try again later.";
    return `Call/message times: read ${read} clients, then stopped (${why})`;
  }
  return `Call/message times: read ${read} matched client${read === 1 ? "" : "s"}; ${suggested} new match suggestion${suggested === 1 ? "" : "s"} to review.`;
}

/** Confirm or reject a suggested GoHighLevel contact for a client, or link one by its id. */
export async function decideContactMatch(form: FormData) {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || me.role !== "owner") return;
  const clientId = text(form, "clientId", 40);
  const contactId = text(form, "contactId", 40);
  const decision = text(form, "decision", 10);
  if (!isUuid(clientId) || !GHL_ID.test(contactId)) return;
  if (decision !== "confirm" && decision !== "reject" && decision !== "link") return;
  const db = await createDatabaseClient();
  const now = new Date().toISOString();
  if (decision === "reject") {
    await db.from("ghl_contact_links").update({ status: "rejected", updated_at: now, updated_by: me.userId }).eq("client_id", clientId).eq("ghl_contact_id", contactId);
  } else {
    // Only one confirmed contact per client: the previous one (if any) becomes rejected.
    await db.from("ghl_contact_links").update({ status: "rejected", updated_at: now, updated_by: me.userId }).eq("client_id", clientId).eq("status", "confirmed");
    // Add the row if it's new (never rewrites ids), then mark it confirmed.
    await db
      .from("ghl_contact_links")
      .upsert({ client_id: clientId, ghl_contact_id: contactId, status: "suggested", updated_by: me.userId }, { onConflict: "client_id,ghl_contact_id", ignoreDuplicates: true });
    const { error } = await db
      .from("ghl_contact_links")
      .update({ status: "confirmed", updated_at: now, updated_by: me.userId })
      .eq("client_id", clientId)
      .eq("ghl_contact_id", contactId);
    if (error) {
      console.warn(`Match refused: ${error.code}`);
      return;
    }
    // Read this client's times right away (read-only).
    try {
      const a = await readContactActivity(contactId);
      if (a) await db.from("ghl_contact_stats").upsert(statsRow(clientId, contactId, a), { onConflict: "client_id" });
    } catch {
      // The next Sync will try again.
    }
  }
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// AI (Phase 4). The AI only returns text; these actions check the budget first,
// log every request's exact cost, and save the answer for people to review.
// ---------------------------------------------------------------------------

async function logAiUsage(db: Awaited<ReturnType<typeof createDatabaseClient>>, feature: "briefing" | "client_profile" | "work_orders" | "work_prompt" | "quick_add" | "ask_toad" | "care_suggestions" | "care_draft" | "audit_words", r: AiResult) {
  if (!r.startedAt) return; // never sent (budget stop, not set up): not a run, nothing charged
  const known = r.usage !== undefined && r.costUsd !== undefined;
  const row = {
    feature,
    model: r.model,
    // 0018: a sent request that failed without a bill is logged with cost UNKNOWN (null), never 0.
    input_tokens: known ? r.usage!.inputTokens : null,
    output_tokens: known ? r.usage!.outputTokens : null,
    cache_read_tokens: known ? r.usage!.cacheReadTokens : null,
    cache_write_tokens: known ? r.usage!.cacheWriteTokens : null,
    cost_usd: known ? r.costUsd! : null,
    outcome: r.ok ? "ok" : r.reason === "refused" ? "refused" : "error",
  };
  let { error } = await db.from("ai_usage").insert({ ...row, started_at: r.startedAt });
  // Before 0018: no start time column, and unknown costs can't be stored (skip those).
  if (error && MISSING_COLUMN.has(error.code) && known) ({ error } = await db.from("ai_usage").insert(row));
  if (error) console.warn(`AI usage log refused: ${error.code}`);
}

async function aiPreflight(): Promise<{ error: string } | { remaining: number }> {
  const me = await getCurrentMember();
  if (!me || (me.role !== "owner" && me.role !== "manager")) return { error: "Only the owner or a manager can use the AI." };
  if (!isAiConfigured()) return { error: "The AI isn't set up on this Mac yet." };
  const status = await getAiStatus();
  if (!status.tablesReady) return { error: "The AI needs one setup step first (run 0005 in Supabase)." };
  if (status.level === "blocked") return { error: `This month's AI budget ($${status.budgetUsd.toFixed(2)}) is used up. It resets on the 1st.` };
  return { remaining: status.remainingUsd };
}

// ---------------------------------------------------------------------------
// BizToad (0030, docs/BIZTOAD_PLAN.md section 10). One question, answered from what the
// asker's login can read. The worst-case cost is reserved in the database first (it
// refuses past the caps, the AI budget or the rate limit). Nothing is saved but the cost.
// ---------------------------------------------------------------------------

/** Lists for the "Review and add" card (owner and managers only, who can read them anyway). */
export type ToadDraftPickers = { clients: { slug: string; name: string }[]; staff: { id: string; name: string }[]; today: string; myStaffId: string | null };
export type ToadReply = { error?: string; answer?: ToadAnswer; costUsd?: number; draft?: WorkOrderDraft; pickers?: ToadDraftPickers };

/** The database's refusal → plain words. */
function toadRefusal(message: string | undefined, code: string | undefined): string {
  const m = message ?? "";
  if (m.includes("toad: too fast")) return "One moment, please: ask again in a few seconds.";
  if (m.includes("toad: hourly limit")) return "That's 30 questions this hour. Take a breather and try again a bit later.";
  if (m.includes("toad: over your monthly cap")) return "You've used your BizToad allowance for this month. It resets on the 1st.";
  if (m.includes("toad: over the monthly total")) return "The team's BizToad allowance for this month is used up. It resets on the 1st.";
  if (m.includes("toad: over the AI budget")) return "This month's AI budget is used up. It resets on the 1st.";
  if (m.includes("toad: off")) return "BizToad is switched off right now.";
  if (code === "42501") return "Asking BizToad isn't switched on for your role.";
  if (MISSING_TABLE.has(code ?? "")) return "Asking BizToad needs database update 0030 first.";
  return "BizToad couldn't check the budget just now. Nothing was spent. Try again in a minute.";
}

type ToadPrepared = {
  data: Record<string, unknown>;
  book: Codebook;
  staff: StaffBook;
  extra: NameBook[];
  screens: ToadScreen[];
  /** Owner/managers only: what a work order draft needs to be checked and shown. */
  drafts?: { loads: ReturnType<typeof personLoads>; pickers: ToadDraftPickers };
};

export async function askToad(question: unknown, history: unknown): Promise<ToadReply> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me) return { error: "Please sign in again." };
  const status = await getToadStatus();
  if (!status.ready) return { error: "Asking BizToad needs database update 0030 first." };
  if (!status.enabled) return { error: "BizToad is switched off right now." };
  if (!status.roles.includes(me.role)) return { error: "Asking BizToad isn't switched on for your role yet." };
  if (!isAiConfigured()) return { error: "The AI isn't set up yet." };

  // Which facts: from the role stored in the database, never from anything the browser sends.
  // Each builder reads as the signed-in person, so the database decides what's included.
  const mode = toadModeFor(me.role);
  if (!mode) return { error: "Asking BizToad isn't available for your role." };
  const prepared = mode === "full" ? await toadLeadFacts(me, question, history) : mode === "developer" ? await toadDeveloperFacts(me, question, history) : await toadSalesFacts(me, question, history);
  if ("error" in prepared) return prepared;
  const { data, book, staff, extra, screens, drafts } = prepared;

  const task = drafts ? TOAD_DRAFT_TASK : TOAD_TASK;
  const schema = drafts ? TOAD_DRAFT_SCHEMA : TOAD_SCHEMA;
  const maxOutputTokens = drafts ? TOAD_LIMITS.draftOutputTokens : TOAD_LIMITS.maxOutputTokens;
  const worst = Math.min(1, Math.max(0.01, Math.ceil(textRequestWorstCase({ task, data, maxOutputTokens }) * 10_000) / 10_000));
  const db = await createDatabaseClient();
  const reserve = await db.from("toad_spend").insert({ usd: worst });
  if (reserve.error) return { error: toadRefusal(reserve.error.message, reserve.error.code) };

  const result = await askAi({ task, data, schema, maxOutputTokens, remainingUsd: worst });
  await logAiUsage(db, "ask_toad", result);
  if (!result.ok) return { error: result.message };
  const reply: ToadReply = { answer: restoreToadAnswer(result.data, book, staff, screens, extra), costUsd: result.costUsd };

  // A work order draft (owner/managers): checked like Smart add, NEVER saved here. The
  // "Review and add" card saves it only when a person taps Confirm (the normal add action).
  if (drafts) {
    const raw = (result.data ?? {}) as { work_order_drafts?: unknown };
    const d = restoreQuickAdd({ orders: Array.isArray(raw.work_order_drafts) ? raw.work_order_drafts.slice(0, 1) : [] }, book, staff).orders[0];
    if (d) {
      const checked = checkDraftDue({ today: drafts.pickers.today, aiDays: d.aiDueDays, priority: d.priority, estMinutes: d.estMinutes, load: d.assigneeId ? (drafts.loads.get(d.assigneeId) ?? null) : null });
      d.dueOn = checked.dueOn;
      d.dueNote = checked.moved;
      d.contactWarning = contactDetailsIn([d.title, ...d.steps, d.why].join("\n")).length > 0;
      reply.draft = d;
      reply.pickers = drafts.pickers;
    }
  }
  return reply;
}

type ToadAsker = NonNullable<Awaited<ReturnType<typeof getCurrentMember>>>;

/** Owner and managers (Phase 2): clients, work orders, team load, the plan, risks, pipeline counts. */
async function toadLeadFacts(me: ToadAsker, question: unknown, history: unknown): Promise<ToadPrepared | { error: string }> {
  const ops = await getOps();
  const today = ops.today;
  const current = ops.clients.filter((c) => c.status === "active" || c.status === "paused");
  // Most worrying first, so trimming keeps what matters.
  current.sort((a, b) => (ops.scores.get(a.id)?.score ?? 101) - (ops.scores.get(b.id)?.score ?? 101));
  const book = buildCodebook(current);
  const team = (await getTeam()).members;
  const staff = buildStaffBook(team.map((m) => ({ id: m.id, name: m.name })));

  const q = cleanQuestion(question, book, staff);
  if (!q) return { error: "Type a question first." };
  const conversation = cleanHistory(history, book, staff);

  const notes = await getRecentCheckInsByClient(2);
  const open = ops.actions.filter((a) => a.status !== "done" && a.status !== "canceled" && !a.archivedAt);
  const byUrgency = [...open].sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"));
  const loads = personLoads(ops.actions, team.map((m) => m.id), today);
  const ghl = pipelineFacts(await getGhlSummary());

  const facts = buildToadFacts({
    today,
    askerRole: me.role,
    askerCode: me.staffId ? (staff.codeOf.get(me.staffId) ?? null) : null,
    screens: TOAD_SCREENS.full,
    clients: current.map((c) =>
      opsClientFacts({
        c,
        health: ops.health.get(c.id) ?? null,
        checkIn: ops.checkIns.get(c.id)!,
        open: open.filter((a) => a.client?.slug === c.id),
        notes: (c.dbId && notes.get(c.dbId)) || [],
        book,
        staff,
        today,
        score: ops.scores.get(c.id) ? { value: ops.scores.get(c.id)!.score, change: ops.trends.get(c.id)?.change ?? null } : null,
      }),
    ),
    workOrders: byUrgency.map((a) => ({
      type: a.kind,
      title: redactStaff(redact(a.title.slice(0, 120), book), staff),
      client: a.internal ? "AGENCY" : a.client ? (book.codeOf.get(a.client.slug) ?? "other") : a.leadGhlId ? "sales lead" : "none",
      owner: a.ownerId ? (staff.codeOf.get(a.ownerId) ?? "unknown") : "none",
      priority: a.priority,
      status: a.status,
      due: a.dueOn,
      overdue: a.dueOn !== null && a.dueOn < today,
    })),
    team: team.map((m) => {
      const l = loads.get(m.id)!;
      return { code: staff.codeOf.get(m.id), role: m.role, open_items: l.openItems, open_hours: Math.round(l.openMinutes / 6) / 10, overdue: l.overdue, due_next_7_days: l.dueNext7 };
    }),
    rankedPlan: ops.priorities.slice(0, 12).map((p, i) => {
      const slug = p.clientSlug ?? p.action?.client?.slug;
      return { rank: i + 1, why: p.why ?? [], client: slug ? (book.codeOf.get(slug) ?? null) : null, item: redactStaff(redact(p.action ? p.action.title : p.title, book), staff) };
    }),
    riskAlerts: ops.risks.slice(0, 8).map((r) => ({ client: book.codeOf.get(r.client.slug) ?? null, severity: r.severity, score: r.score, problem: redact(r.problem, book) })),
    // Counts only: deal values are money and stay out.
    pipeline: pipelineCounts(ghl),
  });

  return {
    data: { question: q, conversation, facts },
    book,
    staff,
    extra: [],
    screens: TOAD_SCREENS.full,
    // Drafts need the 0013 setup (cancel + quick add), like Smart add.
    drafts: ops.cancel
      ? { loads, pickers: { clients: current.map((c) => ({ slug: c.id, name: c.name })), staff: team.map((m) => ({ id: m.id, name: m.name })), today, myStaffId: me.staffId } }
      : undefined,
  };
}

/** Developers (Phase 3): their own work (my_work) and their clients' contact dates only. */
async function toadDeveloperFacts(me: ToadAsker, question: unknown, history: unknown): Promise<ToadPrepared | { error: string }> {
  const [work, contacts] = await Promise.all([getDeveloperActions(), getMyClientContacts()]);
  // Codes for the clients on their own list only (they can't read the client list).
  const seen = new Map<string, string>();
  for (const a of work) if (a.client) seen.set(a.client.slug, a.client.name);
  for (const c of contacts) seen.set(c.slug, c.name);
  const book = codebookFor([...seen].map(([id, name]) => ({ id, name })));
  // They can't read the team list either: only their own name gets a code.
  const staff = buildStaffBook(me.staffId ? [{ id: me.staffId, name: me.name }] : []);
  const q = cleanQuestion(question, book, staff);
  if (!q) return { error: "Type a question first." };
  const facts = buildDeveloperToadFacts({ today: getToday(), askerCode: me.staffId ? (staff.codeOf.get(me.staffId) ?? null) : null, work, contacts, book, staff });
  return { data: { question: q, conversation: cleanHistory(history, book, staff), facts }, book, staff, extra: [], screens: TOAD_SCREENS.developer };
}

/** Salespeople (Phase 3): their own leads, follow-ups, target, appointments, Scout, deal counts. */
async function toadSalesFacts(me: ToadAsker, question: unknown, history: unknown): Promise<ToadPrepared | { error: string }> {
  const [sales, appointments, scout, board] = await Promise.all([getSales(), getUpcomingAppointments(), getScout(), getLeaderboard()]);
  // Every lead and prospect they can read gets a code (so names typed in a question are
  // swapped too), but only their own leads become facts.
  const leadBook = buildNameBook("L", sales.leads.map((l) => ({ id: l.ghlId, name: l.name })));
  const prospectBook = buildNameBook("P", scout.prospects.map((p) => ({ id: p.id, name: p.name })));
  const extra = [leadBook, prospectBook];
  const book = codebookFor([]);
  const staff = buildStaffBook(me.staffId ? [{ id: me.staffId, name: me.name }] : []);
  const q = cleanQuestion(question, book, staff, extra);
  if (!q) return { error: "Type a question first." };
  const facts = buildSalesToadFacts({
    today: nyDay(new Date().toISOString()),
    askerCode: me.staffId ? (staff.codeOf.get(me.staffId) ?? null) : null,
    me: { userId: me.userId, ghlUserId: me.ghlUserId },
    pipelines: sales.pipelines,
    leads: sales.leads,
    touches: sales.touches,
    followUps: sales.followUps,
    myTarget: sales.myTarget,
    appointments,
    prospects: scout.prospects,
    visits: scout.visits,
    // Deal counts only: the builder never copies names or dollar totals.
    board: board.ready && !board.sample ? board.rows.map((r) => ({ isMe: r.isMe, linked: r.linked, wonDeals: r.wonDeals })) : null,
    leadBook,
    prospectBook,
  });
  return { data: { question: q, conversation: cleanHistory(history, book, staff, extra), facts }, book, staff, extra, screens: TOAD_SCREENS.sales };
}

/** Owner only: BizToad on/off for everyone, who may ask, and the two monthly caps (the database checks too). */
export async function setToadSettings(_prev: { error?: string; ok?: boolean } | undefined, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (me?.role !== "owner") return { error: "Only the owner can change BizToad's settings." };
  const monthly = Number(form.get("monthly_usd"));
  const perPerson = Number(form.get("per_person_usd"));
  if (!Number.isFinite(monthly) || monthly < 0 || monthly > 200) return { error: "The team total must be between $0 and $200." };
  if (!Number.isFinite(perPerson) || perPerson < 0 || perPerson > 50) return { error: "The per-person cap must be between $0 and $50." };
  // Which roles may ask: only known roles; the owner is always included (the database checks the names too).
  const picked = form.getAll("roles").map((r) => String(r));
  const roles = ["owner", ...(["manager", "developer", "sales"] as const).filter((r) => picked.includes(r))];
  const db = await createDatabaseClient();
  const { data, error } = await db
    .from("toad_settings")
    .update({ enabled: form.get("enabled") === "on", roles, monthly_usd: Math.round(monthly * 100) / 100, per_person_usd: Math.round(perPerson * 100) / 100 })
    .eq("id", true)
    .select("id");
  if (error && MISSING_TABLE.has(error.code ?? "")) return { error: "This needs database update 0030 first." };
  if (error || !data?.length) return { error: "Couldn't save. Nothing changed." };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function generateBriefing(): Promise<{ error?: string; message?: string }> {
  await notWhilePreviewing();
  const pre = await aiPreflight();
  if ("error" in pre) return pre;

  const ops = await getOps();
  const today = ops.today;
  const current = ops.clients.filter((c) => c.status === "active" || c.status === "paused");
  const book = buildCodebook(current);
  const staff = buildStaffBook((await getTeam()).members.map((m) => ({ id: m.id, name: m.name })));
  const notes = await getRecentCheckInsByClient(3);
  const open = ops.actions.filter((a) => a.status !== "done");
  const data = {
    today,
    clients: current.map((c) =>
      opsClientFacts({
        c,
        health: ops.health.get(c.id) ?? null,
        checkIn: ops.checkIns.get(c.id)!,
        open: open.filter((a) => a.client?.slug === c.id),
        notes: (c.dbId && notes.get(c.dbId)) || [],
        book,
        staff,
        today,
        score: ops.scores.get(c.id) ? { value: ops.scores.get(c.id)!.score, change: ops.trends.get(c.id)?.change ?? null } : null,
      }),
    ),
    // The order computed by fixed rules (urgency, money, client risk, promises). The AI keeps it.
    ranked_plan: ops.priorities.slice(0, 12).map((p, i) => {
      const slug = p.clientSlug ?? p.action?.client?.slug;
      return {
        rank: i + 1,
        score: p.score ?? 0,
        why: p.why ?? [],
        client: slug ? (book.codeOf.get(slug) ?? null) : null,
        // Saved items: just their title. Lead items never include the deal (person) name.
        item: redact(p.action ? p.action.title : p.title, book),
        type: p.action ? (p.action.leadGhlId ? "lead_follow_up" : p.action.kind) : "reminder",
        owner: p.ownerId ? (staff.codeOf.get(p.ownerId) ?? "unknown") : "none",
      };
    }),
    risk_alerts: ops.risks.slice(0, 8).map((r) => ({
      client: book.codeOf.get(r.client.slug) ?? null,
      severity: r.severity,
      score: r.score,
      change: r.trend?.change ?? null,
      problem: redact(r.problem, book),
    })),
    team: [...staff.codeOf.entries()].map(([id, code]) => ({
      code,
      open_items: open.filter((a) => a.ownerId === id).length,
      overdue_items: open.filter((a) => a.ownerId === id && a.dueOn !== null && a.dueOn < today).length,
      clients_owned: current.filter((c) => c.status === "active" && c.ownerId === id).length,
    })),
    unowned: { active_clients: ops.gaps.noOwner.length, open_items: ops.gaps.actionsNoOwner.length, active_clients_without_next_action: ops.gaps.noNextAction.length },
    pipeline: pipelineFacts(await getGhlSummary()),
  };

  const result = await askAi({ task: OPS_BRIEFING_TASK, data, schema: OPS_BRIEFING_SCHEMA, maxOutputTokens: 6000, remainingUsd: pre.remaining });
  const db = await createDatabaseClient();
  await logAiUsage(db, "briefing", result);
  if (!result.ok) {
    revalidatePath("/", "layout");
    return { error: result.message };
  }
  const { error } = await db.from("ai_briefings").insert({ kind: "daily", content: restoreOpsBriefing(result.data, book, staff) });
  revalidatePath("/", "layout");
  if (error) return { error: "The briefing was written but couldn't be saved." };
  return { message: `Briefing ready. Cost: $${result.costUsd.toFixed(3)}.` };
}

/**
 * AI-drafted work orders (0010). Sends coded facts (no names), saves the drafts as a
 * list for review. Nothing becomes a work order until a person taps "Add".
 */
export async function generateWorkOrderDrafts(): Promise<{ error?: string; message?: string }> {
  await notWhilePreviewing();
  const pre = await aiPreflight();
  if ("error" in pre) return pre;
  const ops = await getOps();
  if (!ops.orders) return { error: "Work orders need one setup step first (0010 SQL)." };
  const today = ops.today;
  const team = (await getTeam()).members;
  const current = ops.clients.filter((c) => c.status === "active" || c.status === "paused");
  const book = buildCodebook(current);
  const staff = buildStaffBook(team.map((m) => ({ id: m.id, name: m.name })));
  const notes = await getRecentCheckInsByClient(2);
  const open = ops.actions.filter((a) => a.status !== "done");
  const work = open.filter((a) => a.kind !== "follow_up");
  const data = {
    today,
    team: team.map((m) => {
      const mine = open.filter((a) => a.ownerId === m.id);
      return {
        code: staff.codeOf.get(m.id),
        role: m.role,
        open_work: mine.length,
        overdue: mine.filter((a) => a.dueOn !== null && a.dueOn < today).length,
        est_hours_open: Math.round(mine.reduce((n, a) => n + (a.estMinutes ?? 0), 0) / 6) / 10,
        clients_owned: current.filter((c) => c.status === "active" && c.ownerId === m.id).length,
      };
    }),
    clients: current
      .filter((c) => c.status === "active")
      .map((c) =>
        opsClientFacts({
          c,
          health: ops.health.get(c.id) ?? null,
          checkIn: ops.checkIns.get(c.id)!,
          open: open.filter((a) => a.client?.slug === c.id),
          notes: (c.dbId && notes.get(c.dbId)) || [],
          book,
          staff,
          today,
          score: ops.scores.get(c.id) ? { value: ops.scores.get(c.id)!.score, change: ops.trends.get(c.id)?.change ?? null } : null,
        }),
      ),
    risk_alerts: ops.risks.slice(0, 8).map((r) => ({ client: book.codeOf.get(r.client.slug) ?? null, severity: r.severity, problem: redact(r.problem, book), suggested: redact(r.action, book) })),
    ranked_plan: ops.priorities.slice(0, 10).map((p, i) => {
      const slug = p.clientSlug ?? p.action?.client?.slug;
      return { rank: i + 1, client: slug ? (book.codeOf.get(slug) ?? null) : null, item: redact(p.action ? p.action.title : p.title, book), why: p.why ?? [] };
    }),
    open_work: work.slice(0, 60).map((a) => ({
      client: a.client ? (book.codeOf.get(a.client.slug) ?? null) : null,
      title: redact(a.title, book),
      owner: a.ownerId ? (staff.codeOf.get(a.ownerId) ?? "unknown") : "none",
      status: a.status,
      due: a.dueOn,
    })),
  };
  const result = await askAi({ task: WORK_ORDERS_TASK, data, schema: WORK_ORDERS_SCHEMA, maxOutputTokens: 6000, remainingUsd: pre.remaining });
  const db = await createDatabaseClient();
  await logAiUsage(db, "work_orders", result);
  if (!result.ok) {
    revalidatePath("/", "layout");
    return { error: result.message };
  }
  const drafts = restoreWorkOrderDrafts(result.data, book, staff);
  const { error } = await db.from("ai_briefings").insert({ kind: "work_orders", content: drafts });
  revalidatePath("/", "layout");
  if (error) return { error: "The drafts were written but couldn't be saved." };
  return { message: `${drafts.orders.length} drafts ready to review. Cost: $${result.costUsd.toFixed(3)}.` };
}

/** A picture's real type from its first bytes (the name and the browser's label can lie). */
function imageType(b: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

const MAX_PHOTO_BYTES = 1_500_000;
const MAX_PHOTOS = 3;

export type QuickAddState = { error?: string; drafts?: WorkOrderDrafts; costUsd?: number; hadPhoto?: boolean; hadPdf?: boolean };

/**
 * Quick add (0013): the owner or a manager types or dictates a note and/or adds photos or one PDF;
 * the AI outlines draft work orders. Names in the note are swapped for codes first; a
 * photo can't be, so the screen warns about it. Nothing is saved: the drafts come back
 * once for review, and a person taps Add on each. The photo is never stored. Cost logged.
 */
export async function quickAddWorkOrders(_prev: QuickAddState | undefined, form: FormData): Promise<QuickAddState> {
  await notWhilePreviewing();
  const pre = await aiPreflight();
  if ("error" in pre) return pre;
  const note = typeof form.get("note") === "string" ? String(form.get("note")).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").trim().slice(0, 3000) : "";
  // Up to 3 pictures (Smart add), each shrunk on the phone first, checked by its real file type, never saved.
  const files = form.getAll("image").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_PHOTOS) return { error: `Up to ${MAX_PHOTOS} pictures at a time.` };
  // One PDF (a brief, proposal or audit), checked by its first bytes, sent once, never saved.
  const pdfs = form.getAll("pdf").filter((f): f is File => f instanceof File && f.size > 0);
  if (pdfs.length > 1) return { error: "One PDF at a time." };
  const pdfFile = pdfs[0] ?? null;
  if (pdfFile && pdfFile.size > MAX_PDF_BYTES) return { error: "That PDF is too big (3.5 MB at most). Split it, or screenshot the key pages." };
  if ([...files, ...pdfs].reduce((n, f) => n + f.size, 0) > MAX_UPLOAD_TOTAL_BYTES) return { error: "Those files are too big together. Try fewer pictures, or a smaller PDF." };
  let pdf: { base64: string } | undefined;
  if (pdfFile) {
    const bytes = new Uint8Array(await pdfFile.arrayBuffer());
    if (!isPdf(bytes)) return { error: "That file isn't a PDF." };
    pdf = { base64: Buffer.from(bytes).toString("base64") };
  }
  const images: { mediaType: "image/jpeg" | "image/png" | "image/webp"; base64: string }[] = [];
  for (const file of files) {
    if (file.size > MAX_PHOTO_BYTES) return { error: "That photo is too big. Try a screenshot or a smaller photo." };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mediaType = imageType(bytes);
    if (!mediaType) return { error: "Only photos and screenshots (JPEG, PNG or WebP) work here." };
    images.push({ mediaType, base64: Buffer.from(bytes).toString("base64") });
  }
  const image = images.length > 0;
  if (!note && !image && !pdf) return { error: "Type or say what needs doing, or add a photo or a PDF." };
  const me = await getCurrentMember();
  if (!me || (me.role !== "owner" && me.role !== "manager")) return { error: "Only the owner or a manager can add work orders." };
  const ops = await getOps();
  // Before 0013 the cost log can't record this feature, so don't spend anything.
  if (!ops.cancel) return { error: "Quick add needs one setup step first (0013 SQL)." };
  const team = (await getTeam()).members;
  const current = ops.clients.filter((c) => c.status === "active" || c.status === "paused");
  const book = buildCodebook(current);
  const staff = buildStaffBook(team.map((m) => ({ id: m.id, name: m.name })));
  // Who's free, in plain numbers (open hours from estimates, overdue, due in the next 7 days).
  const loads = personLoads(ops.actions, team.map((m) => m.id), ops.today);
  const data = {
    today: ops.today,
    note: note ? redactStaff(redact(note, book), staff) : null,
    pictures_attached: images.length,
    pdf_attached: Boolean(pdf),
    clients: current.map((c) => ({ code: book.codeOf.get(c.id), status: c.status, services: c.services.length ? c.services : ["not recorded"], owner: c.ownerId ? (staff.codeOf.get(c.ownerId) ?? "unknown") : "none" })),
    team: team.map((m) => {
      const l = loads.get(m.id)!;
      return { code: staff.codeOf.get(m.id), role: m.role, open_items: l.openItems, open_hours: Math.round(l.openMinutes / 6) / 10, items_without_estimate: l.withoutEstimate, overdue: l.overdue, due_next_7_days: l.dueNext7 };
    }),
  };
  const result = await askAi({ task: QUICK_ADD_TASK, data, schema: QUICK_ADD_SCHEMA, maxOutputTokens: 4000, remainingUsd: pre.remaining, images, pdf });
  const db = await createDatabaseClient();
  await logAiUsage(db, "quick_add", result);
  revalidatePath("/", "layout");
  if (!result.ok) return { error: result.message };
  const drafts = restoreQuickAdd(result.data, book, staff);
  // The AI suggests a date; plain rules check it against the person's real load.
  for (const d of drafts.orders) {
    const checked = checkDraftDue({ today: ops.today, aiDays: d.aiDueDays, priority: d.priority, estMinutes: d.estMinutes, load: d.assigneeId ? (loads.get(d.assigneeId) ?? null) : null });
    d.dueOn = checked.dueOn;
    d.dueNote = checked.moved;
    // A draft that still carries contact details can't be confirmed in one tap.
    d.contactWarning = contactDetailsIn([d.title, ...d.steps, d.why].join("\n")).length > 0;
  }
  return { drafts, costUsd: result.costUsd, hadPhoto: image, hadPdf: Boolean(pdf) };
}

/**
 * Prompt helper (0010): instructions and a ready-to-paste prompt for one work order.
 * Shown once to copy by hand; not saved, never sent anywhere. Cost is logged.
 */
export async function generateWorkPrompt(
  _prev: { error?: string; result?: { summary: string; steps: string[]; prompt: string; checks: string[]; costUsd: number } } | undefined,
  form: FormData,
): Promise<{ error?: string; result?: { summary: string; steps: string[]; prompt: string; checks: string[]; costUsd: number } }> {
  await notWhilePreviewing();
  const pre = await aiPreflight();
  if ("error" in pre) return pre;
  const id = text(form, "actionId", 40);
  if (!isUuid(id)) return { error: "Unknown work order." };
  const { actions, orders } = await getActions();
  // Before 0010 the cost log can't record this feature, so don't spend anything.
  if (!orders) return { error: "The prompt helper needs one setup step first (0010 SQL)." };
  const a = actions.find((x) => x.id === id);
  if (!a) return { error: "Unknown work order." };
  const roster = await getRoster();
  const book = buildCodebook(roster);
  const client = a.client ? roster.find((c) => c.id === a.client!.slug) : undefined;
  const data = {
    work_order: {
      type: a.kind,
      title: redact(a.title, book),
      notes: a.notes ? redact(a.notes, book) : null,
      steps: parseSteps(a.steps).map((x) => redact(x, book)),
      where_it_came_from: a.sourceNote ? redact(a.sourceNote, book) : null,
      priority: a.priority,
      due: a.dueOn,
      estimate_minutes: a.estMinutes ?? null,
    },
    client: client ? { code: book.codeOf.get(client.id), services: client.services, started: client.startDate } : null,
  };
  const result = await askAi({ task: WORK_PROMPT_TASK, data, schema: WORK_PROMPT_SCHEMA, maxOutputTokens: 3000, remainingUsd: pre.remaining });
  const db = await createDatabaseClient();
  await logAiUsage(db, "work_prompt", result);
  revalidatePath("/", "layout");
  if (!result.ok) return { error: result.message };
  return { result: { ...restoreWorkPrompt(result.data, book), costUsd: result.costUsd } };
}

export async function generateClientProfile(_prev: { error?: string; message?: string } | undefined, form: FormData): Promise<{ error?: string; message?: string }> {
  await notWhilePreviewing();
  const pre = await aiPreflight();
  if ("error" in pre) return pre;
  const slug = text(form, "slug", 90);
  const roster = await getRoster();
  const client = roster.find((c) => c.id === slug);
  if (!client?.dbId) return { error: "Unknown client." };

  const today = getToday();
  const book = buildCodebook(roster);
  const history = await getCheckInHistory(client.dbId, 20);
  const data = { today, client: clientFacts(client, getClientHealth(client, (await getActions()).actions), history, book, today), pipeline: pipelineFacts(await getGhlSummary()) };

  const result = await askAi({ task: PROFILE_TASK, data, schema: PROFILE_SCHEMA, maxOutputTokens: 4000, remainingUsd: pre.remaining });
  const db = await createDatabaseClient();
  await logAiUsage(db, "client_profile", result);
  if (!result.ok) {
    revalidatePath("/", "layout");
    return { error: result.message };
  }
  const { error } = await db.from("ai_client_profiles").insert({ client_id: client.dbId, content: restoreProfile(result.data, book) });
  revalidatePath("/", "layout");
  if (error) return { error: "The profile was written but couldn't be saved." };
  return { message: `Profile drafted. Cost: $${result.costUsd.toFixed(3)}.` };
}

export async function markProfileReviewed(form: FormData) {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || me.role !== "owner") return;
  const id = text(form, "profileId", 40);
  if (!/^[0-9a-f-]{36}$/.test(id)) return;
  const db = await createDatabaseClient();
  await db.from("ai_client_profiles").update({ reviewed_at: new Date().toISOString(), reviewed_by: me.userId }).eq("id", id);
  revalidatePath("/", "layout");
}

export async function setAiBudget(_prev: { error?: string; ok?: boolean } | undefined, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || me.role !== "owner") return { error: "Only the owner can change the AI budget." };
  const value = Number(text(form, "budget", 8));
  if (!Number.isFinite(value) || value < 0 || value > 100) return { error: "Pick a monthly budget between $0 and $100." };
  const db = await createDatabaseClient();
  const { error } = await db
    .from("ai_settings")
    .update({ monthly_budget_usd: Math.round(value * 100) / 100, updated_at: new Date().toISOString(), updated_by: me.userId })
    .eq("id", 1);
  if (error) return { error: "Couldn't save the budget." };
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Saves today's 0–100 health score for every current client, once a day (later calls
 * that day change nothing). Run when the owner or a manager opens Home. Takes no input:
 * the scores are worked out here on the server from the database. Quietly does nothing
 * before 0009 is run. The database only accepts today's rows (history can't be faked).
 */
export async function recordHealthSnapshot(): Promise<void> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || (me.role !== "owner" && me.role !== "manager")) return;
  const ops = await getOps();
  if (!ops.historyReady) return;
  const day = getToday();
  const missing = new Set(ops.clients.filter((c) => c.dbId && ops.scores.get(c.id)).map((c) => c.dbId!));
  // Skip clients that already have today's row (no write at all on most page loads).
  const { data: done } = await (await createDatabaseClient()).from("client_health_daily").select("client_id").eq("day", day);
  for (const r of done ?? []) missing.delete(r.client_id);
  const rows = ops.clients
    .filter((c) => c.dbId && missing.has(c.dbId))
    .map((c) => {
      const sc = ops.scores.get(c.id)!;
      return { client_id: c.dbId!, day, score: sc.score, level: sc.level, recorded_by: me.userId };
    });
  if (!rows.length) return;
  const db = await createDatabaseClient();
  const { error } = await db.from("client_health_daily").upsert(rows, { onConflict: "client_id,day", ignoreDuplicates: true });
  if (error) console.warn(`Health history not saved: ${error.code}`);
}

// ---------------------------------------------------------------------------
// Owner summary (0012): totals for the owner's personal dashboard. Built here,
// while the owner is signed in, with the app's own rules; saved as a snapshot that
// GET /api/owner-summary serves read-only. Owner only. Nothing is sent anywhere.
// ---------------------------------------------------------------------------

const OWNER_SUMMARY_EVERY_MS = 60 * 60_000;

async function publishOwnerSummary(force: boolean): Promise<{ error?: string; message?: string }> {
  const me = await getCurrentMember();
  if (!me || me.role !== "owner") return { error: "Only the owner can publish the summary." };
  const db = await createDatabaseClient();
  if (!force) {
    // At most once an hour (one small read on most page loads).
    const { data, error } = await db.from("owner_summary_snapshots").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) return {}; // before 0012: quietly nothing
    if (data && Date.now() - Date.parse(data.created_at) < OWNER_SUMMARY_EVERY_MS) return {};
  }
  const input = await getOwnerSummaryInput();
  if (!input) return { error: "The summary needs the database." };
  const summary = buildOwnerSummary(input);
  // Safety net before saving (the database checks again).
  const leaks = findLeaks(summary);
  if (leaks.length) {
    console.warn(`Owner summary not published: it looked like it contained ${leaks.join(", ")}`);
    return { error: `Not published: it looked like it contained ${[...new Set(leaks)].join(" and ")}. Check client names for contact details.` };
  }
  const { error } = await db.from("owner_summary_snapshots").insert({ content: summary });
  if (error) {
    console.warn(`Owner summary refused: ${error.code}`);
    if (MISSING_TABLE.has(error.code ?? "")) return { error: "The owner summary needs one setup step first (0012 SQL)." };
    if (error.code === "23514") return { error: "The database's safety check refused it (it looked like it had contact details)." };
    return { error: "Couldn't publish the summary." };
  }
  revalidatePath("/safety");
  return { message: `Published ${input.now.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })} (New York time).` };
}

/** Called when the owner opens Home: publishes a fresh summary at most once an hour. */
export async function autoPublishOwnerSummary(): Promise<void> {
  await notWhilePreviewing();
  await publishOwnerSummary(false);
}

/** "Publish now" on the Data Safety screen. */
export async function publishOwnerSummaryNow(_prev: { error?: string; message?: string } | undefined): Promise<{ error?: string; message?: string }> {
  await notWhilePreviewing();
  void _prev;
  return publishOwnerSummary(true);
}

// ---------------------------------------------------------------------------
// Kit (0014): handbook pages and the tools list. Owner and managers write; the database
// enforces it, keeps every page version itself, and refuses passwords/keys. No deletes.
// ---------------------------------------------------------------------------

const KIT_KINDS = ["readme", "sop", "faq", "template"] as const;

async function kitEditor(): Promise<boolean> {
  const me = await getCurrentMember();
  return Boolean(me && (me.role === "owner" || me.role === "manager"));
}

/** Add or edit a page. Returns the page id so the screen can open it. */
export async function saveKitDoc(_prev: { error?: string; ok?: boolean; id?: string } | undefined, form: FormData): Promise<{ error?: string; ok?: boolean; id?: string }> {
  await notWhilePreviewing();
  if (!(await kitEditor())) return { error: "Only the owner or a manager can edit Kit." };
  const id = text(form, "id", 40);
  const kind = oneOf(KIT_KINDS, text(form, "kind", 10));
  const title = text(form, "title", 120);
  const category = text(form, "category", 40);
  const rawBody = form.get("body");
  const body = typeof rawBody === "string" ? rawBody.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, 20000) : "";
  const audience = ["manager", "developer", "sales", "va"].filter((a) => form.get(`aud_${a}`) === "on");
  if (!kind) return { error: "Pick what kind of page it is." };
  if (!title) return { error: "Give it a title." };
  const secret = findSecrets(`${title}\n${body}`);
  if (secret) return { error: secret };
  if (id && !isUuid(id)) return { error: "Unknown page." };
  const db = await createDatabaseClient();
  const row = { kind, title, category: category || null, body, audience };
  if (id) {
    const { data, error } = await db.from("kit_docs").update(row).eq("id", id).select("id").maybeSingle();
    if (error || !data) {
      console.warn(`Kit page not saved: ${error?.code}`);
      return { error: error?.code === "23514" ? "That text was refused (it may look like a password or key)." : "Couldn't save it." };
    }
  } else {
    const me = await getCurrentMember();
    const { data, error } = await db.from("kit_docs").insert({ ...row, updated_by: me!.userId }).select("id").single();
    if (error || !data) {
      console.warn(`Kit page not added: ${error?.code}`);
      return { error: MISSING_TABLE.has(error?.code ?? "") ? "Kit needs one setup step first (0014 SQL)." : error?.code === "23514" ? "That text was refused (it may look like a password or key)." : "Couldn't save it." };
    }
    revalidatePath("/kit", "layout");
    return { ok: true, id: data.id };
  }
  revalidatePath("/kit", "layout");
  return { ok: true, id };
}

/** Mark reviewed today, archive or bring back a page. */
export async function kitDocOp(form: FormData) {
  await notWhilePreviewing();
  if (!(await kitEditor())) return;
  const id = text(form, "id", 40);
  const op = text(form, "op", 12);
  if (!isUuid(id)) return;
  const patch = op === "reviewed" ? { reviewed_on: localToday() } : op === "archive" ? { archived: true } : op === "unarchive" ? { archived: false } : null;
  if (!patch) return;
  const db = await createDatabaseClient();
  const { error } = await db.from("kit_docs").update(patch).eq("id", id);
  if (error) console.warn(`Kit page change refused: ${error.code}`);
  revalidatePath("/kit", "layout");
}

/** Add or edit a tool. Never a password: only where the login is kept. */
export async function saveKitTool(_prev: { error?: string; ok?: boolean } | undefined, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  await notWhilePreviewing();
  if (!(await kitEditor())) return { error: "Only the owner or a manager can edit the tools list." };
  const id = text(form, "id", 40);
  const name = text(form, "name", 80);
  const purpose = text(form, "purpose", 200);
  const urlRaw = text(form, "url", 300);
  const loginWhere = text(form, "loginWhere", 120);
  const accessNote = text(form, "accessNote", 200);
  const managerId = text(form, "managerId", 40);
  const costRaw = text(form, "monthly", 12);
  const renewRaw = text(form, "renews", 10);
  if (!name) return { error: "Name the tool." };
  if (id && !isUuid(id)) return { error: "Unknown tool." };
  const secret = findSecrets(`${purpose}\n${loginWhere}\n${accessNote}`);
  if (secret) return { error: secret };
  const url = httpsLink(urlRaw);
  if (urlRaw && !url) return { error: "The link must be a full https:// address." };
  const monthly = costRaw ? Number(costRaw.replace(/[$,\s]/g, "")) : null;
  if (monthly !== null && !(Number.isFinite(monthly) && monthly >= 0 && monthly < 100000)) return { error: "Monthly cost should be a number like 49 or 49.99." };
  const renews = renewRaw ? anyDate(renewRaw) : null;
  if (renewRaw && !renews) return { error: "Pick a real renewal date." };
  const db = await createDatabaseClient();
  if (managerId && !(await staffExists(db, managerId))) return { error: "Pick someone from the team." };
  const row = {
    name,
    purpose: purpose || null,
    url,
    login_where: loginWhere || null,
    access_note: accessNote || null,
    manager_staff_id: managerId || null,
    monthly_usd: monthly === null ? null : Math.round(monthly * 100) / 100,
    renews_on: renews,
    for_developers: form.get("forDevelopers") === "on",
  };
  const { error } = id ? await db.from("kit_tools").update(row).eq("id", id) : await db.from("kit_tools").insert(row);
  if (error) {
    console.warn(`Kit tool not saved: ${error.code}`);
    return { error: MISSING_TABLE.has(error.code ?? "") ? "Kit needs one setup step first (0014 SQL)." : error.code === "23514" ? "That was refused (it may look like a password, or the link isn't https)." : "Couldn't save it." };
  }
  revalidatePath("/kit", "layout");
  return { ok: true };
}

export async function kitToolOp(form: FormData) {
  await notWhilePreviewing();
  if (!(await kitEditor())) return;
  const id = text(form, "id", 40);
  const op = text(form, "op", 12);
  if (!isUuid(id) || (op !== "archive" && op !== "unarchive")) return;
  const db = await createDatabaseClient();
  const { error } = await db.from("kit_tools").update({ archived: op === "archive" }).eq("id", id);
  if (error) console.warn(`Kit tool change refused: ${error.code}`);
  revalidatePath("/kit", "layout");
}

// ---------------------------------------------------------------------------
// Billing (0015): READ-ONLY copy of GoHighLevel invoices and payments. OWNER ONLY.
// Atlas never creates, edits, voids or sends invoices, never charges or refunds, and
// never sends reminders. The database also refuses anyone but the owner.
// ---------------------------------------------------------------------------

const errorCode = (s: string) => s.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 40) || "unknown";

/** Refresh billing from GoHighLevel (read-only). At most every 10 minutes (the database enforces it). */
export async function syncBilling(): Promise<{ error?: string; message?: string }> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || me.role !== "owner") return { error: "Only the owner can refresh billing." };
  if (!isGhlBillingConfigured()) return { error: "Billing isn't connected yet (add the billing token in Vercel)." };
  const db = await createDatabaseClient();

  // 1. Claim a refresh slot first: the database refuses one within 10 minutes of the last.
  const started = await db.from("billing_syncs").insert({}).select("id, started_at").single();
  if (started.error) {
    if (started.error.code === "23514") return { error: "Billing was refreshed less than 10 minutes ago. Try again in a few minutes." };
    if (started.error.code === "42P01" || started.error.code === "PGRST205") return { error: "Billing isn't set up yet: run 0015_billing_read_only.sql in Supabase." };
    console.warn(`Billing refresh refused: ${started.error.code}`);
    return { error: `Couldn't start a billing refresh (code ${started.error.code ?? "?"}).` };
  }
  const syncId = (started.data as { id: string }).id;
  const syncedAt = (started.data as { started_at: string }).started_at;
  const fail = async (code: string, message: string) => {
    await db.from("billing_syncs").update({ finished_at: new Date().toISOString(), ok: false, error_code: errorCode(code) }).eq("id", syncId);
    await logActivity(db, { client_id: null, kind: "billing_sync", summary: `Billing refresh failed (${errorCode(code)}). Nothing was changed.` });
    revalidatePath("/", "layout");
    return { error: `${message} Nothing was changed.` };
  };

  // 2. Read (GET only). Any problem: the last good data stays, and totals show Unknown.
  let read: Awaited<ReturnType<typeof readBilling>>;
  try {
    read = await readBilling(getToday());
  } catch (err) {
    console.warn(`Billing read stopped: ${err instanceof GhlError ? err.status : "unknown"}`);
    return fail(err instanceof GhlError && err.status ? `ghl_${err.status}` : "ghl_unreachable", err instanceof GhlError ? err.message : "Couldn't read billing from GoHighLevel.");
  }

  // 3. Match only through contacts the owner confirmed (by hand here, or in Phase 6).
  const [matches, links] = await Promise.all([
    db.from("billing_contact_matches").select("provider_contact_id, client_id"),
    db.from("ghl_contact_links").select("ghl_contact_id, client_id").eq("status", "confirmed"),
  ]);
  const confirmed = new Map<string, string>();
  for (const l of (links.data ?? []) as { ghl_contact_id: string; client_id: string }[]) confirmed.set(l.ghl_contact_id, l.client_id);
  for (const m of (matches.data ?? []) as { provider_contact_id: string; client_id: string }[]) confirmed.set(m.provider_contact_id, m.client_id);

  // 4. Save the minimum. Every record seen in this refresh gets this refresh's time, so
  //    anything voided or removed in GoHighLevel drops out of the totals.
  const rows = read.rows.map((r) => {
    const clientId = matchClient(r.contactId, confirmed);
    return {
      provider: "ghl",
      kind: r.kind,
      provider_id: r.providerId,
      provider_contact_id: r.contactId,
      client_id: clientId,
      unmatched_label: clientId ? null : r.label,
      amount_cents: r.amountCents,
      amount_due_cents: r.amountDueCents,
      currency: r.currency,
      status: r.status,
      issued_on: r.issuedOn,
      due_on: r.dueOn,
      paid_on: r.paidOn,
      synced_at: syncedAt,
    };
  });
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await db.from("billing_records").upsert(rows.slice(i, i + 200), { onConflict: "provider,kind,provider_id" });
    if (error) {
      console.warn(`Billing save refused: ${error.code}`);
      return fail(`save_${error.code ?? "unknown"}`, `Read billing, but saving failed (code ${error.code ?? "?"}).`);
    }
  }
  const unmatched = rows.filter((r) => !r.client_id).length;
  await db
    .from("billing_syncs")
    .update({ finished_at: new Date().toISOString(), ok: true, invoices_read: read.invoicesRead, payments_read: read.paymentsRead, unmatched })
    .eq("id", syncId);
  // History line: counts only, never money (managers can read the history).
  await logActivity(db, { client_id: null, kind: "billing_sync", summary: `Billing refreshed: ${rows.length} records read, ${unmatched} unmatched${read.unknown ? `, ${read.unknown} skipped (unrecognised)` : ""}` });
  revalidatePath("/", "layout");
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  return { message: `Read ${plural(read.invoicesRead, "invoice")} and ${plural(read.paymentsRead, "payment")}. ${unmatched} unmatched${read.unknown ? `, ${read.unknown} skipped because Atlas didn't recognise their status` : ""}. Nothing in GoHighLevel was changed.` };
}

/** Match a GoHighLevel billing contact to a client, by hand. Owner only. */
export async function matchBillingContact(_prev: { error?: string; message?: string } | undefined, form: FormData): Promise<{ error?: string; message?: string }> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || me.role !== "owner") return { error: "Only the owner can match billing." };
  const contactId = String(form.get("contact_id") ?? "");
  const slug = String(form.get("client") ?? "");
  if (!/^[A-Za-z0-9]{6,40}$/.test(contactId)) return { error: "That billing contact isn't valid." };
  const client = (await getRoster()).find((c) => c.id === slug && c.dbId);
  if (!client?.dbId) return { error: "Pick a client." };
  const db = await createDatabaseClient();
  const added = await db.from("billing_contact_matches").insert({ provider_contact_id: contactId, client_id: client.dbId });
  if (added.error) {
    if (added.error.code !== "23505") return { error: `Couldn't save the match (code ${added.error.code ?? "?"}).` };
    const moved = await db.from("billing_contact_matches").update({ client_id: client.dbId }).eq("provider_contact_id", contactId);
    if (moved.error) return { error: `Couldn't change the match (code ${moved.error.code ?? "?"}).` };
  }
  // Attach this contact's records now; the name on the invoice is cleared once matched.
  const { error } = await db.from("billing_records").update({ client_id: client.dbId, unmatched_label: null }).eq("provider_contact_id", contactId);
  if (error) return { error: `Matched, but the records didn't update (code ${error.code ?? "?"}). Refresh billing to finish.` };
  revalidatePath("/", "layout");
  return { message: `Matched to ${client.name}.` };
}

// ---------------------------------------------------------------------------
// Saved audits (0023, docs/AUDIT_BUILDER_PLAN.md Phase A). Owner, managers and
// salespeople save audits; the database decides who reads which. Nothing here fetches
// data or costs money: an audit is its intake + checkpoints until results are attached.
// ---------------------------------------------------------------------------

export type AuditFormState = { error?: string; errors?: string[]; ok?: boolean } | undefined;

const AUDITS_SETUP = "Saving audits needs one setup step first (0023 SQL).";

export async function saveAudit(_prev: AuditFormState, form: FormData): Promise<AuditFormState> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || (!isLead(me.role) && me.role !== "sales")) return { error: "Only the owner, managers and salespeople can save audits." };
  const id = text(form, "id", 40);
  if (id && !isUuid(id)) return { error: "Unknown audit." };
  const leadId = text(form, "leadId", 64);
  if (leadId && !/^[A-Za-z0-9_-]{1,64}$/.test(leadId)) return { error: "Unknown lead." };
  const competitors = [0, 1, 2, 3, 4].map((i) => ({ name: text(form, `comp_name_${i}`, 120), domain: text(form, `comp_domain_${i}`, 200), town: text(form, `comp_town_${i}`, 120) }));
  const checked = parseIntake({
    company: text(form, "company", 120),
    domain: text(form, "domain", 300),
    gbpUrl: text(form, "gbpUrl", 300),
    niche: text(form, "niche", 120),
    hqTown: text(form, "hqTown", 120),
    state: text(form, "state", 2),
    cities: text(form, "cities", 1200),
    services: text(form, "services", 800),
    avgJobUsd: text(form, "avgJobUsd", 20),
    avgJobConfirmed: form.get("avgJobConfirmed") === "on",
    visitToJobRate: text(form, "visitToJobRate", 10),
    radiusMiles: text(form, "radiusMiles", 4),
    competitors,
    modules: { dataforseo: form.get("mod_dataforseo") === "on", leadsnap: form.get("mod_leadsnap") === "on", semrush: form.get("mod_semrush") === "on" },
    wantsAds: form.get("wantsAds") === "on",
    notes: typeof form.get("notes") === "string" ? String(form.get("notes")).slice(0, INTAKE_LIMITS.notes + 50) : "",
  }, { places: placeBookFor });
  if (!checked.ok) return { errors: checked.errors.slice(0, 8) };
  const intake = checked.intake;
  const sections = parseSections(form.getAll("section"));
  // The pages must build from these settings before anything is saved.
  const settings = await getAuditSettings();
  const built = parseAuditConfig(buildAuditConfig(intake, settings.agency, localToday()));
  if (!built.ok) return { errors: built.errors.slice(0, 8) };
  const title = `${intake.company} SEO audit`.slice(0, 120);
  const db = await createDatabaseClient();
  let savedId = id;
  if (id) {
    const { data, error } = await db.from("audits").update({ title, intake, sections }).eq("id", id).select("id").maybeSingle();
    if (error || !data) {
      console.warn(`Audit not saved: ${error?.code ?? "no row"}`);
      return { error: MISSING_TABLE.has(error?.code ?? "") ? AUDITS_SETUP : "Couldn't save it (it may be archived, or not yours)." };
    }
  } else {
    const { data, error } = await db
      .from("audits")
      .insert({ title, intake, sections, lead_ghl_id: leadId || null, created_by: me.userId })
      .select("id")
      .single();
    if (error || !data) {
      console.warn(`Audit not added: ${error?.code}`);
      return {
        error: MISSING_TABLE.has(error?.code ?? "") ? AUDITS_SETUP : error?.code === "42501" ? "That lead isn't an open lead in a sales pipeline." : error?.code === "23514" ? "Something in the form was refused. Check for email addresses or phone numbers." : "Couldn't save it.",
      };
    }
    savedId = data.id as string;
  }
  revalidatePath("/sales", "layout");
  revalidatePath("/growth/audits");
  revalidatePath("/audits", "layout");
  redirect(`/audits/${savedId}`);
}

const ADS_SETUP = "Saving Google Ads audits needs one setup step first (0029 SQL).";

/** Save a Google Ads audit (new or edited). Same rules as saveAudit; checked by parseAdsIntake. */
export async function saveAdsAudit(_prev: AuditFormState, form: FormData): Promise<AuditFormState> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || (!isLead(me.role) && me.role !== "sales")) return { error: "Only the owner, managers and salespeople can save audits." };
  const id = text(form, "id", 40);
  if (id && !isUuid(id)) return { error: "Unknown audit." };
  const leadId = text(form, "leadId", 64);
  if (leadId && !/^[A-Za-z0-9_-]{1,64}$/.test(leadId)) return { error: "Unknown lead." };
  const competitors = [0, 1, 2, 3, 4].map((i) => ({ name: text(form, `comp_name_${i}`, 120), domain: text(form, `comp_domain_${i}`, 200), town: text(form, `comp_town_${i}`, 120) }));
  const checked = parseAdsIntake({
    company: text(form, "company", 120),
    domain: text(form, "domain", 300),
    niche: text(form, "niche", 120),
    hqTown: text(form, "hqTown", 120),
    state: text(form, "state", 2),
    cities: text(form, "cities", 1200),
    services: text(form, "services", 800),
    avgJobUsd: text(form, "avgJobUsd", 20),
    avgJobConfirmed: form.get("avgJobConfirmed") === "on",
    clickToLeadRate: text(form, "clickToLeadRate", 10),
    leadToJobRate: text(form, "leadToJobRate", 10),
    budgetsUsd: [0, 1, 2].map((i) => text(form, `budget_${i}`, 12)),
    competitors,
    modules: { dataforseo: form.get("mod_dataforseo") === "on", semrush: form.get("mod_semrush") === "on" },
    notes: typeof form.get("notes") === "string" ? String(form.get("notes")).slice(0, INTAKE_LIMITS.notes + 50) : "",
  }, { places: placeBookFor });
  if (!checked.ok) return { errors: checked.errors.slice(0, 8) };
  const intake = checked.intake;
  const sections = parseAdsSections(form.getAll("section"));
  const title = `${intake.company} Google Ads audit`.slice(0, 120);
  const db = await createDatabaseClient();
  let savedId = id;
  if (id) {
    const { data, error } = await db.from("audits").update({ title, intake, sections }).eq("id", id).eq("kind", "ads").select("id").maybeSingle();
    if (error || !data) {
      console.warn(`Ads audit not saved: ${error?.code ?? "no row"}`);
      return { error: MISSING_TABLE.has(error?.code ?? "") ? AUDITS_SETUP : error?.code === "23514" ? ADS_SETUP : "Couldn't save it (it may be archived, or not yours)." };
    }
  } else {
    const { data, error } = await db
      .from("audits")
      .insert({ title, kind: "ads", intake, sections, lead_ghl_id: leadId || null, created_by: me.userId })
      .select("id")
      .single();
    if (error || !data) {
      console.warn(`Ads audit not added: ${error?.code}`);
      // 23514 here almost always means 0029 hasn't been run (the old rule refuses "ads_" checkpoints).
      return { error: MISSING_TABLE.has(error?.code ?? "") ? AUDITS_SETUP : error?.code === "42501" ? "That lead isn't an open lead in a sales pipeline." : error?.code === "23514" ? ADS_SETUP : "Couldn't save it." };
    }
    savedId = data.id as string;
  }
  revalidatePath("/sales", "layout");
  revalidatePath("/audits", "layout");
  redirect(`/audits/${savedId}`);
}

/** Owner: the Google Ads management plans (audit_settings.ads_plans, 0029). */
export async function saveAdsPlans(_prev: { error?: string; ok?: boolean } | undefined, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || me.role !== "owner") return { error: "Only the owner can set Google Ads prices." };
  const rec = text(form, "recommended", 2);
  const rawPlans = [0, 1, 2, 3]
    .map((i) => ({
      name: text(form, `ads_name_${i}`, 40),
      feeUsd: Number(text(form, `ads_fee_${i}`, 10).replace(/[$,\s]/g, "")),
      summary: text(form, `ads_summary_${i}`, 120),
      recommended: rec === String(i),
    }))
    .filter((p) => p.name);
  const found = contactDetailsIn(rawPlans.map((p) => `${p.name} ${p.summary}`).join(" "));
  if (found.length) return { error: `Leave out ${found.join(" and ")}.` };
  const plans = parseAdsPlans(rawPlans);
  if (plans.length !== rawPlans.length) return { error: "Each plan needs a name and a monthly fee of $0–$100,000." };
  const db = await createDatabaseClient();
  const { error } = await db.from("audit_settings").update({ ads_plans: plans, updated_by: me.userId, updated_at: new Date().toISOString() }).eq("id", true);
  if (error) {
    console.warn(`Ads plans refused: ${error.code}`);
    return { error: MISSING_TABLE.has(error.code ?? "") ? "Google Ads prices need one setup step first (0029 SQL)." : "Couldn't save the prices." };
  }
  revalidatePath("/audits", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Run audit (docs/AUDIT_RUN_PLAN.md, Phase E1, 0035). Atlas asks DataForSEO directly
// (read-only lookups, src/lib/audit/sources/dataforseo.ts), Claude writes only the SEO
// words from the finished numbers (no tools, coded names), and the result goes through the
// same checker as pasted results. Real money: the worst-case estimate goes into
// audit_spend FIRST, so the database refuses a run over the per-audit, weekly or monthly cap.
// ---------------------------------------------------------------------------

export type RunState = { error?: string; started?: boolean } | undefined;

const RUN_SETUP = "Running audits needs one setup step first (0035 SQL).";
// The page allows 180 s (maxDuration); lookups stop at 120 s so the notes and saving still fit.
const RUN_DEADLINE_MS = 120_000;

export async function startAuditRun(_prev: RunState, form: FormData): Promise<RunState> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || (!isLead(me.role) && me.role !== "sales")) return { error: "Only the owner, managers and salespeople can run audits." };
  const id = text(form, "id", 40);
  if (!isUuid(id)) return { error: "Unknown audit." };
  const audit = await getSavedAudit(id);
  if (!audit) return { error: "Couldn't find that audit." };
  if (!isLead(me.role) && (audit.createdBy !== me.userId || audit.archived)) return { error: "You can run only your own audits that aren't archived." };
  if (!isDataForSeoConfigured()) return { error: "DataForSEO isn't connected yet. The owner adds its login in Vercel's settings." };
  const latest = await getLatestAuditRun(id);
  if (!latest.ready) return { error: RUN_SETUP };
  if (latest.run?.status === "running" && !latest.run.stale) return { error: "This audit is already running. The page updates by itself." };

  let estimate: number;
  let steps: string[];
  if (audit.kind === "ads") {
    const intake = audit.ads?.intake;
    if (!intake) return { error: "Fix the audit's saved details first (Edit), then run it." };
    const plan = planAdsRun(intake, audit.ads?.sections ?? []);
    estimate = plan.estimateUsd;
    steps = [...new Set([...plan.first.map((l) => l.step), ...(audit.ads?.sections.includes("ads_spend") ? ["Competitor ad spend"] : []), ...(audit.ads?.sections.includes("ads_landing") ? ["Landing page speed"] : []), "Checking and saving"])];
  } else {
    if (!audit.intake) return { error: "Fix the audit's saved details first (Edit), then run it." };
    const plan = planSeoRun(audit.intake, audit.sections);
    estimate = plan.estimateUsd;
    steps = [...new Set([...plan.first.map((l) => l.step), "Searches per city", ...(audit.sections.includes("keywords") ? ["Keyword difficulty"] : []), "Competitors", "Google profiles", "Checking their website", "Brand searches", "Writing the notes", ...(wantsHeatMap(audit) ? [HEAT_STEP] : []), "Checking and saving"])];
  }

  const db = await createDatabaseClient();
  const { data: run, error: runError } = await db
    .from("audit_runs")
    .insert({ audit_id: id, est_usd: estimate, steps: steps.map((label) => ({ label, state: "waiting" })) })
    .select("id")
    .single();
  if (runError || !run) {
    console.warn(`Audit run not started: ${runError?.code}`);
    return { error: MISSING_TABLE.has(runError?.code ?? "") ? RUN_SETUP : "Couldn't start the run (the audit may be archived, or not yours)." };
  }
  const runId = run.id as string;
  // Money first: the database refuses this row if it would go over any cap.
  const { error: spendError } = await db.from("audit_spend").insert({ audit_id: id, provider: "dataforseo", usd: Math.max(0.01, estimate) });
  if (spendError) {
    const m = spendError.message ?? "";
    const reason = m.includes("per-audit") ? "the per-audit cap" : m.includes("weekly") ? "your weekly cap" : m.includes("monthly") ? "this month's cap for everyone" : null;
    const message = reason ? `Not run: about $${estimate.toFixed(2)} would go over ${reason}. The owner can change the caps in Audits → Settings.` : "Not run: the spending check refused it.";
    await db.from("audit_runs").update({ status: "failed", error: message, finished_at: new Date().toISOString() }).eq("id", runId);
    revalidatePath(`/audits/${id}`);
    return { error: message };
  }
  revalidatePath(`/audits/${id}`);
  // The lookups take a minute or two: they continue after this answer is sent.
  after(() => runAuditInBackground(runId, audit, steps).catch((e) => console.warn(`Audit run crashed: ${e instanceof Error ? e.name : "unknown"}`)));
  return { started: true };
}

async function runAuditInBackground(runId: string, audit: SavedAudit, stepLabels: string[]) {
  const db = await createDatabaseClient();
  const startedAt = Date.now();
  const deadline = startedAt + RUN_DEADLINE_MS;
  const state = new Map(stepLabels.map((l) => [l, "waiting" as "waiting" | "working" | "done" | "skipped"]));
  const answers = new Map<string, DfsAnswer>();
  const problems: string[] = [];
  let costUsd = 0;
  let calls = 0;
  let aiUsd: number | null = null;
  let wordsNote: string | null = null;
  let heatNote: string | null = null;
  // What this run may spend in total (its estimate, set aside before it started). A failed
  // lookup is retried once only while the spend stays inside it.
  let budgetUsd = 0;
  const saveSteps = () => db.from("audit_runs").update({ steps: [...state].map(([label, s]) => ({ label, state: s })) }).eq("id", runId);
  const finish = async (status: "done" | "failed", error: string | null) => {
    if (status === "done") state.set("Checking and saving", "done");
    for (const [l, s] of state) if (s !== "done") state.set(l, "skipped");
    await db
      .from("audit_runs")
      .update({ status, error: error ? error.slice(0, 300) : null, actual_usd: Math.min(50, Math.round(costUsd * 10000) / 10000), ai_usd: aiUsd, steps: [...state].map(([label, s]) => ({ label, state: s })), finished_at: new Date().toISOString() })
      .eq("id", runId);
  };
  /** Why a run stopped without saving: the audit keeps its last results. */
  const keptNote = () => `Nothing was saved, so the last results stay. ${problems[0] ?? "The main lookups didn't answer."} Check the DataForSEO credit and try again.`;
  /** Runs lookups a few at a time; a failed lookup leaves its numbers "not found". */
  const runLookups = async (list: Lookup[]) => {
    const byStep = new Map<string, Lookup[]>();
    for (const l of list) byStep.set(l.step, [...(byStep.get(l.step) ?? []), l]);
    for (const [step, group] of byStep) {
      if (Date.now() > deadline) break;
      state.set(step, "working");
      await saveSteps();
      for (let i = 0; i < group.length; i += 6) {
        if (Date.now() > deadline) break;
        await Promise.all(
          group.slice(i, i + 6).map(async (l) => {
            for (let attempt = 0; attempt < RUN_RULES.lookupTries; attempt++) {
              calls++;
              try {
                const a = await dfsLookup(l.path, l.task);
                answers.set(l.id, a);
                costUsd += a.costUsd ?? DFS_PRICE[l.path];
                return;
              } catch (e) {
                // Refused or failed lookups aren't billed; only a timeout might be.
                if (!(e instanceof DfsError) || e.mayBeCharged) costUsd += DFS_PRICE[l.path];
                // Their side hiccuped (e.g. 40101): try again after a growing pause, if the budget allows.
                if (attempt < RUN_RULES.lookupTries - 1 && e instanceof DfsError && e.retryable && costUsd + DFS_PRICE[l.path] <= budgetUsd && Date.now() < deadline) {
                  await new Promise((r) => setTimeout(r, RUN_RULES.retryPauseMs[attempt] ?? 5000));
                  continue;
                }
                if (problems.length < 3) problems.push(`${l.step}: ${e instanceof DfsError ? e.message : "a lookup failed."}`);
                return;
              }
            }
          }),
        );
      }
      state.set(step, "done");
      await saveSteps();
    }
  };
  const retrieved = nyDate(new Date());
  const today = retrieved;

  try {
    if (audit.kind === "ads") {
      const intake = audit.ads!.intake!;
      const sections = audit.ads!.sections;
      const plan = planAdsRun(intake, sections);
      budgetUsd = plan.estimateUsd;
      await runLookups(plan.first);
      if (answers.size === 0) return await finish("failed", keptNote());
      const serps = adsMoneyTerms(intake).map((_, i) => readSerp(answers.get(`serp:${i}`)));
      const extra: Lookup[] = [];
      if (sections.includes("ads_spend")) {
        const top = [...new Set([...readBidders(serps, intake.domain).map((b) => b.domain), ...intake.competitors.map((c) => c.domain)])].slice(0, RUN_RULES.competitors);
        extra.push(...top.map((d) => plan.perBidder(d)));
      }
      if (sections.includes("ads_landing")) {
        const own = serps.flatMap((s) => s?.paid ?? []).find((p) => p.domain === intake.domain)?.url;
        extra.push(plan.speed(own && /^https?:\/\//.test(own) ? own : `https://${intake.domain}`));
      }
      await runLookups(extra);
      state.set("Checking and saving", "working");
      const block = buildAdsBlock(intake, sections, { answers, retrieved });
      const checked = parseAdsResults(block, { intake, today });
      if (!checked.ok) return await finish("failed", `The data didn't pass the checks: ${checked.errors[0] ?? "unknown"}`);
      await saveRunResults(db, audit.id, block, {}, checked.summary.retrieved);
    } else {
      const intake = audit.intake!;
      // Towns within ~30 miles (people search "boardman", not "mahoning county") and the state's
      // other place names (so "… columbus ohio" isn't counted for a Youngstown audit).
      const area = { nearby: nearbyTowns(intake.state, intake.hqTown, RUN_RULES.nearbyTowns, intake.radiusMiles ?? INTAKE_DEFAULTS.radiusMiles).map((t) => t.label), others: statePlaces(intake.state) };
      const plan = planSeoRun(intake, audit.sections, area);
      budgetUsd = plan.estimateUsd;
      // LeadSnap heat map: started as soon as the business's Google listing is known (it takes
      // LeadSnap a few minutes), collected after the notes.
      const heatTerm = mapTermOf(intake);
      const heatOn = wantsHeatMap(audit);
      let heatStart: Promise<HeatStart> | null = null;
      const startHeat = (answer: DfsAnswer | undefined) => {
        const place = heatOn && !heatStart ? readPlace(answer, intake.domain) : null;
        if (place) heatStart = startLeadSnapHeat(place, heatTerm);
      };
      // 1) Find the searches (suggestions) and check Google live; 2) count them for the state;
      // 3) each site's local rankings, profile and (for the business) a homepage check; 4) brand searches.
      await runLookups(plan.first);
      if (answers.size === 0) return await finish("failed", keptNote());
      // Competitors are picked from Google's live results: if one of those didn't come back, the
      // pick would fall to weaker, often out-of-area sites (a Youngstown audit got a Milwaukee one).
      // Keep the last good pages instead.
      const missingWho = intake.competitors.length ? null : whoRanksMissing(intake, answers);
      if (missingWho) return await finish("failed", `Google's results for “${missingWho}” didn't come back from DataForSEO, so competitors couldn't be picked fairly. Nothing was saved, so the last results stay. Try again in a few minutes.`);
      startHeat(answers.get("maps:area"));
      const universe = seoUniverse(intake, answers, plan.seeds.length, area);
      await runLookups(plan.second(universe));
      const serps = seoMoneyTerms(intake).map((_, i) => readSerp(answers.get(`serp:${i}`)));
      // The town-by-town searches count too, so one failed search can't leave the audit with no competitors.
      const packSerps = plan.first.filter((l) => l.id.startsWith("pack:")).map((l) => readSerp(answers.get(l.id)));
      const competitors = intake.competitors.length
        ? intake.competitors.map((c) => ({ domain: c.domain, name: c.name, town: c.town ?? intake.hqTown }))
        : findCompetitors([...serps, ...packSerps], intake.domain, RUN_RULES.competitors, readMaps(answers.get("maps:area"))).map((c) => ({ domain: c.domain, name: c.name ?? c.domain, town: intake.hqTown }));
      const sites = [{ domain: intake.domain, name: intake.company }, ...competitors.map((c) => ({ domain: c.domain, name: c.name }))];
      const brandLookup = plan.brand(sites.map((x) => x.name));
      await runLookups([...sites.flatMap((x, n) => plan.perSite(x.domain, x.name, n === 0)), ...(brandLookup ? [brandLookup] : [])]);
      startHeat(answers.get(`maps:${intake.domain}`));
      const rankedVolume = plan.rankedVolume(answers, sites.map((x) => x.domain), universe);
      if (rankedVolume) await runLookups([rankedVolume]);
      // Without the search counts or any site's rankings the pages would be mostly "not found":
      // keep the last good results instead of replacing them (a run with no credit wiped one).
      if (!answers.has("volume") || !sites.some((x) => answers.has(`ranked:${x.domain}`))) return await finish("failed", keptNote());
      let block = buildSeoBlock(intake, audit.sections, { answers, competitors, retrieved, costUsd, calls, universe, area });
      // Words: Claude writes from the finished numbers only (no tools, coded names). Optional.
      state.set("Writing the notes", "working");
      await saveSteps();
      const left = isAiConfigured() ? await getAiBudgetLeft() : null;
      if (left !== null && left > 0.05 && Date.now() < deadline) {
        const input = wordsInput(block, intake.company, intake.niche, { averageJobUsd: intake.avgJobUsd, averageJobConfirmed: intake.avgJobConfirmed, visitsThatBecomeJobsPercent: Math.round(intake.visitToJobRate * 1000) / 10 });
        const result = await askAi({ task: AUDIT_WORDS_TASK, data: input.data, schema: AUDIT_WORDS_SCHEMA, maxOutputTokens: 8000, remainingUsd: left }); // thinking counts toward this, so leave room
        await logAiUsage(db, "audit_words", result);
        if (result.ok) {
          block = applyWords(block, result.data, input.codes);
          aiUsd = result.costUsd;
        } else wordsNote = `Claude's notes weren't written (${result.message})`;
      }
      state.set("Writing the notes", "done");
      if (heatOn) {
        state.set(HEAT_STEP, "working");
        await saveSteps();
        const got = heatStart ? await collectLeadSnapHeat(await heatStart, heatTerm, retrieved, startedAt + LEADSNAP_RULES.waitUntilMs) : { problem: "the business's Google listing wasn't found in Maps." };
        if ("heat" in got) {
          block = withHeatmap(block, got.heat);
          state.set(HEAT_STEP, "done");
        } else if ("pending" in got) {
          block = { ...block, leadsnapPending: { id: got.pending, term: heatTerm } };
          heatNote = "The LeadSnap heat map is still being made: tap “Get heat map” in a few minutes.";
        } else heatNote = `No heat map: ${got.problem}`;
      }
      state.set("Checking and saving", "working");
      const settings = await getAuditSettings();
      const config = buildAuditConfig(intake, settings.agency, audit.createdAt.slice(0, 10));
      let checked = parseSeoResults(block, { intake, markets: config.markets.map((m) => ({ id: m.id, name: m.name })), today });
      if (!checked.ok && block.headline) {
        // If Claude's words broke a rule (e.g. a price), keep the numbers without the words, and say why.
        wordsNote = `Claude's notes were left out (${checked.errors[0] ?? "they didn't pass the checks"}).`;
        block = { ...block, headline: "", pageNotes: {}, fixes: [], scorecard: [] };
        checked = parseSeoResults(block, { intake, markets: config.markets.map((m) => ({ id: m.id, name: m.name })), today });
      }
      if (!checked.ok) return await finish("failed", `The data didn't pass the checks: ${checked.errors[0] ?? "unknown"}`);
      await saveRunResults(db, audit.id, block, { competitors: checked.competitors }, checked.summary.retrieved);
    }
    const notes = [wordsNote, heatNote].filter(Boolean).join(" ") || null;
    await finish("done", answers.size === 0 ? "No lookup answered. Check the DataForSEO login and credit." : problems.length ? `Done, with gaps: ${problems.join(" ")}${notes ? ` ${notes}` : ""}` : notes);
  } catch (e) {
    await finish("failed", e instanceof Error && e.message.length < 200 ? e.message : "Something went wrong during the run.");
  }
}

// ---------------------------------------------------------------------------
// LeadSnap heat maps (approved 2026-11-27): one 7×7 Google Maps grid per run, through the
// heat-map-only module (src/lib/audit/sources/leadsnap.ts). Uses LeadSnap credits; a heat map
// of the same listing and search from the last 7 days is reused instead.
// ---------------------------------------------------------------------------

const HEAT_STEP = "Heat map (LeadSnap)";

function wantsHeatMap(audit: SavedAudit): boolean {
  return audit.kind !== "ads" && !!audit.intake?.modules.leadsnap && audit.sections.includes("heatmap") && isLeadSnapConfigured();
}

type HeatStart = { id: number } | { problem: string };

async function startLeadSnapHeat(place: { placeId: string; lat: number; lng: number }, term: string): Promise<HeatStart> {
  try {
    const recent = reusableHeatmap(await listRecentHeatmaps(place.placeId, term), new Date());
    if (recent) return { id: recent };
    const id = heatmapId(await createHeatmap({ placeId: place.placeId, keyword: term, lat: place.lat, lng: place.lng, size: LEADSNAP_RULES.gridSize, spacingMiles: LEADSNAP_RULES.spacingMiles, points: planGrid(place.lat, place.lng) }));
    return id ? { id } : { problem: "LeadSnap didn't say which heat map it started." };
  } catch (e) {
    return { problem: e instanceof LeadSnapError ? e.message : "LeadSnap couldn't start the heat map." };
  }
}

type HeatGot = { heat: Record<string, unknown> } | { pending: number } | { problem: string };

/** Looks every few seconds until the heat map is done or `until` (a time) passes. */
async function collectLeadSnapHeat(start: HeatStart, term: string, retrieved: string, until: number): Promise<HeatGot> {
  if ("problem" in start) return start;
  for (;;) {
    try {
      const body = await getHeatmap(start.id);
      const read = readHeatmap(body);
      if (!read) return { problem: `LeadSnap's heat map couldn't be read (${heatShape(body)}).` };
      if (read.status === "failed") return { problem: "LeadSnap couldn't finish the heat map." };
      if (read.status === "ready") {
        let leaders: ReturnType<typeof readLeaders> = [];
        try {
          leaders = readLeaders(await getHeatmapCompetitors(start.id), read.placeId);
        } catch {
          // The grid still counts without the list of leaders.
        }
        return { heat: heatmapBlock(read, term, retrieved, leaders) };
      }
    } catch (e) {
      if (!(e instanceof LeadSnapError && e.retryable)) return { problem: e instanceof LeadSnapError ? e.message : "LeadSnap's heat map couldn't be read." };
    }
    if (Date.now() + LEADSNAP_RULES.pollEveryMs > until) return { pending: start.id };
    await new Promise((r) => setTimeout(r, LEADSNAP_RULES.pollEveryMs));
  }
}

export type HeatFetchState = { error?: string; ok?: boolean; waiting?: boolean } | undefined;

/** "Get heat map": collects a LeadSnap heat map that wasn't finished when the run ended. */
export async function fetchAuditHeatmap(_prev: HeatFetchState, form: FormData): Promise<HeatFetchState> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || (!isLead(me.role) && me.role !== "sales")) return { error: "Only the owner, managers and salespeople can do that." };
  const id = text(form, "id", 40);
  if (!isUuid(id)) return { error: "Unknown audit." };
  const audit = await getSavedAudit(id);
  if (!audit?.intake || audit.kind === "ads") return { error: "Couldn't find that audit." };
  if (!isLead(me.role) && (audit.createdBy !== me.userId || audit.archived)) return { error: "You can do this only for your own audits that aren't archived." };
  if (!isLeadSnapConfigured()) return { error: "LeadSnap isn't connected (the token isn't set on the server)." };
  const block = await getAuditResultsBlock(id);
  const pending = heatPendingOf(block);
  if (!block || !pending) return { error: "There's no heat map waiting for this audit. Run the audit again to make one." };
  const got = await collectLeadSnapHeat({ id: pending.id }, pending.term, nyDate(new Date()), 0);
  if ("pending" in got) return { waiting: true };
  if ("problem" in got) return { error: `No heat map: ${got.problem}` };
  const next = withHeatmap(block as Record<string, unknown>, got.heat);
  const settings = await getAuditSettings();
  const config = buildAuditConfig(audit.intake, settings.agency, audit.createdAt.slice(0, 10));
  const checked = parseSeoResults(next, { intake: audit.intake, markets: config.markets.map((m) => ({ id: m.id, name: m.name })), today: nyDate(new Date()) });
  if (!checked.ok) return { error: `The heat map didn't pass the checks: ${checked.errors[0] ?? "unknown"}` };
  const db = await createDatabaseClient();
  try {
    await saveRunResults(db, id, next, { competitors: checked.competitors }, checked.summary.retrieved);
  } catch {
    return { error: "Couldn't save the heat map to the audit." };
  }
  revalidatePath(`/audits/${id}`);
  revalidatePath(`/audit/${id}`);
  return { ok: true };
}

async function saveRunResults(db: Awaited<ReturnType<typeof createDatabaseClient>>, auditId: string, block: Record<string, unknown>, config: Record<string, unknown>, retrieved: string) {
  const { error } = await db.from("audits").update({ data: { v: 1, block, by: "run" }, config, data_retrieved: retrieved }).eq("id", auditId);
  if (error) throw new Error("Couldn't save the results to the audit.");
}

/** The audit builders' place help: each typed town checked, miles from home, nearby towns (public data). */
export async function getPlaceHelp(state: string, home: string, cities: string): Promise<{ home: string | null; checks: PlaceCheck[]; nearby: NearbyTown[] }> {
  await notWhilePreviewing();
  const none = { home: null, checks: [], nearby: [] };
  if (!/^[A-Z]{2}$/.test(state) || home.length > 120 || cities.length > 2000) return none;
  if (usesDatabase()) {
    const me = await getCurrentMember();
    if (!me || (!isLead(me.role) && me.role !== "sales")) return none;
  }
  return checkPlaces(state, home, splitList(cities));
}

/** One state's place names for the audit builders' suggestions (owner, managers, sales). */
export async function getStatePlaces(state: string): Promise<string[]> {
  await notWhilePreviewing();
  if (!/^[A-Z]{2}$/.test(state)) return [];
  // Public place names only; demo mode (no database) shows them too, for trying the builder.
  if (!usesDatabase()) return statePlaces(state);
  const me = await getCurrentMember();
  if (!me || (!isLead(me.role) && me.role !== "sales")) return [];
  return statePlaces(state);
}

/** What "Attach results" shows: problems, or what was found (and whether it was saved). */
export type ResultsState = { error?: string; errors?: string[]; warnings?: string[]; summary?: ResultsSummary; saved?: boolean } | undefined;

/**
 * Attach results (docs/AUDIT_RESULTS_PLAN.md B1): "check" shows what the pasted results hold;
 * "save" checks them again (never trusting the browser) and stores them on the audit. The
 * pasted text is untrusted: only the ATLAS-RESULTS block is read, field by field.
 */
export async function attachAuditResults(_prev: ResultsState, form: FormData): Promise<ResultsState> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || (!isLead(me.role) && me.role !== "sales")) return { error: "Only the owner, managers and salespeople can attach results." };
  const id = text(form, "id", 40);
  if (!isUuid(id)) return { error: "Unknown audit." };
  const pasted = typeof form.get("results") === "string" ? String(form.get("results")) : "";
  // The database decides which audits this person can read (a salesperson: only their own).
  const audit = await getSavedAudit(id);
  if (!audit) return { error: "Couldn't find that audit." };
  if (!isLead(me.role) && (audit.createdBy !== me.userId || audit.archived)) return { error: "You can attach results only to your own audits that aren't archived." };
  const found = extractResultsBlock(pasted);
  if (!found.ok) return { error: found.error };
  const today = nyDate(new Date());
  let checked: { ok: true; warnings: string[]; summary: ResultsSummary; config: Record<string, unknown> } | { ok: false; errors: string[] };
  if (audit.kind === "ads") {
    const intake = audit.ads?.intake;
    if (!intake) return { error: "Fix the audit's saved details first (Edit), then attach results." };
    const r = parseAdsResults(found.block, { intake, today });
    checked = r.ok ? { ok: true, warnings: r.warnings, summary: r.summary, config: {} } : r;
  } else {
    if (!audit.intake) return { error: "Fix the audit's saved details first (Edit), then attach results." };
    const settings = await getAuditSettings();
    const config = buildAuditConfig(audit.intake, settings.agency, audit.createdAt.slice(0, 10));
    const r = parseSeoResults(found.block, { intake: audit.intake, markets: config.markets.map((m) => ({ id: m.id, name: m.name })), today });
    checked = r.ok ? { ok: true, warnings: r.warnings, summary: r.summary, config: { competitors: r.competitors } } : r;
  }
  if (!checked.ok) return { errors: checked.errors };
  if (form.get("mode") !== "save") return { warnings: checked.warnings, summary: checked.summary };
  // Store the checked block itself; every read checks it again before drawing a page.
  const db = await createDatabaseClient();
  const { data, error } = await db
    .from("audits")
    .update({ data: { v: 1, block: found.block }, config: checked.config, data_retrieved: checked.summary.retrieved })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    console.warn(`Audit results not saved: ${error?.code ?? "no row"}`);
    return { error: MISSING_TABLE.has(error?.code ?? "") ? AUDITS_SETUP : error?.code === "23514" ? "The results are too big to store. Ask Claude for fewer keywords." : "Couldn't save the results (the audit may be archived, or not yours)." };
  }
  revalidatePath("/audits", "layout");
  revalidatePath(`/audit/${id}`);
  return { warnings: checked.warnings, summary: checked.summary, saved: true };
}

/** Owner and managers: hide an audit (or bring it back). Never deleted. */
export async function archiveAudit(form: FormData) {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || !isLead(me.role)) return;
  const id = text(form, "id", 40);
  if (!isUuid(id)) return;
  const db = await createDatabaseClient();
  const { error } = await db.from("audits").update({ archived_at: form.get("restore") === "1" ? null : new Date().toISOString() }).eq("id", id);
  if (error) console.warn(`Audit archive refused: ${error.code}`);
  revalidatePath("/sales", "layout");
  revalidatePath("/growth/audits");
  revalidatePath("/audits", "layout");
}

/** Owner: spending caps, the agency name on the pages, and the plan prices. */
export async function saveAuditSettings(_prev: { error?: string; ok?: boolean } | undefined, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || me.role !== "owner") return { error: "Only the owner can change audit settings." };
  const money = (key: string, max: number): number | null => {
    const n = Number(text(form, key, 12).replace(/[$,\s]/g, ""));
    return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 100) / 100 : null;
  };
  const perAudit = money("perAuditUsd", 50);
  const weekly = money("weeklyUsd", 500);
  const monthly = money("monthlyUsd", 2000);
  if (perAudit === null) return { error: "Per-audit cap must be $0–$50." };
  if (weekly === null) return { error: "Weekly cap must be $0–$500." };
  if (monthly === null) return { error: "Monthly cap must be $0–$2,000." };
  const agencyName = text(form, "agencyName", 80);
  const agencyWebsite = text(form, "agencyWebsite", 120).replace(/^https?:\/\//i, "");
  if (agencyWebsite && /\s/.test(agencyWebsite)) return { error: "Agency website can't contain spaces." };
  const found = contactDetailsIn(`${agencyName} ${agencyWebsite}`);
  if (found.length) return { error: `Leave out ${found.join(" and ")}.` };
  const rec = text(form, "recommended", 2);
  const rawPlans = [0, 1, 2, 3]
    .map((i) => ({
      name: text(form, `plan_name_${i}`, 40),
      hoursPerMonth: Number(text(form, `plan_hours_${i}`, 6)),
      priceUsd: Number(text(form, `plan_price_${i}`, 10).replace(/[$,\s]/g, "")),
      summary: text(form, `plan_summary_${i}`, 120),
      recommended: rec === String(i),
    }))
    .filter((p) => p.name);
  const plans = parsePlans(rawPlans);
  if (plans.length !== rawPlans.length) return { error: "Each plan needs a name, 1–400 hours and a price of $0–$100,000." };
  const db = await createDatabaseClient();
  const { error } = await db
    .from("audit_settings")
    .update({ per_audit_usd: perAudit, weekly_usd: weekly, monthly_usd: monthly, agency_name: agencyName || null, agency_website: agencyWebsite || null, plans, updated_by: me.userId, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) {
    console.warn(`Audit settings refused: ${error.code}`);
    return { error: MISSING_TABLE.has(error.code ?? "") ? AUDITS_SETUP : "Couldn't save the settings." };
  }
  revalidatePath("/sales", "layout");
  return { ok: true };
}

/** Owner: a weekly cap for one salesperson (overrides the weekly cap for everyone). */
export async function saveAuditUserCap(form: FormData) {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || me.role !== "owner") return;
  const userId = text(form, "userId", 40);
  const n = Number(text(form, "weeklyUsd", 8).replace(/[$,\s]/g, ""));
  if (!isUuid(userId) || !Number.isFinite(n) || n < 0 || n > 500) return;
  const db = await createDatabaseClient();
  const { error } = await db
    .from("audit_user_limits")
    .upsert({ user_id: userId, weekly_usd: Math.round(n * 100) / 100, updated_by: me.userId, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) console.warn(`Audit cap refused: ${error.code}`);
  revalidatePath("/sales", "layout");
}

// ---------------------------------------------------------------------------
// Scout (0024, docs/SCOUT_PLAN.md S1). The run itself happens in Claude Code (where
// DataForSEO is connected); the app fetches nothing. Every write runs as the signed-in
// person; the database decides who may see, claim and log what, enforces the caps and
// refuses phone numbers and emails.
// ---------------------------------------------------------------------------

const SCOUT_SETUP = "Scout needs one setup step first (0024 SQL).";
export type ScoutFormState = { error?: string; ok?: boolean; message?: string; refused?: { name: string; why: string }[] } | undefined;

/** Start a run: checks the caps, saves the run and writes its estimate to the capped ledger BEFORE anything is spent. */
export async function startScoutRun(_prev: ScoutFormState, form: FormData): Promise<ScoutFormState> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || (!isLead(me.role) && me.role !== "sales")) return { error: "Only the owner, managers and salespeople can run Scout." };
  const area = text(form, "area", 200);
  if (!area) return { error: "Say where to look (towns, counties or a radius)." };
  if (contactDetailsIn(area).length) return { error: "Leave phone numbers and emails out of the area." };
  const picked = form.getAll("kind").filter((k): k is string => typeof k === "string" && (SCOUT_KINDS as readonly string[]).includes(k));
  const extra = text(form, "otherKind", 60);
  if (extra && contactDetailsIn(extra).length) return { error: "Leave phone numbers and emails out of the kinds of business." };
  const kinds = [...new Set([...picked, ...(extra ? [extra.toLowerCase()] : [])])].slice(0, 12);
  if (!kinds.length) return { error: "Pick at least one kind of business." };
  const size = Number(text(form, "size", 4));
  if (!Number.isInteger(size) || size < 1 || size > SCOUT_RULES.maxRunSize) return { error: `Pick 1 to ${SCOUT_RULES.maxRunSize} businesses.` };
  const est = runEstimate(size);
  const scout = await getScout();
  if (!scout.ready) return { error: SCOUT_SETUP };
  const left = scoutLeft({ rows: scout.spend, me: me.userId, monthlyUsd: scout.settings.monthlyUsd, myCapUsd: scout.myCapUsd, now: new Date() });
  if (est > left.left) return { error: `This run is estimated at $${est.toFixed(2)}, but only $${left.left.toFixed(2)} is left this month. Try fewer businesses.` };
  const db = await createDatabaseClient();
  const run = await db.from("scout_runs").insert({ area, kinds, size, est_usd: est, created_by: me.userId }).select("id").single();
  if (run.error || !run.data) {
    console.warn(`Scout run refused: ${run.error?.code}`);
    return { error: MISSING_TABLE.has(run.error?.code ?? "") ? SCOUT_SETUP : "Couldn't start the run." };
  }
  const spend = await db.from("scout_spend").insert({ run_id: run.data.id, provider: "dataforseo", usd: est, user_id: me.userId });
  if (spend.error) {
    console.warn(`Scout estimate refused: ${spend.error.code}`);
    return { error: spend.error.code === "23514" ? "That would go over a Scout cap this month, so the run won't go ahead." : "Couldn't record the estimate, so the run won't go ahead." };
  }
  revalidatePath("/sales", "layout");
  redirect(`/sales/scout/runs/${run.data.id}`);
}

/** Attach a run's results file: checked strictly, scored, saved. Our clients, existing leads and do-not-contact businesses are skipped by the database. */
export async function attachScoutResults(_prev: ScoutFormState, form: FormData): Promise<ScoutFormState> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || (!isLead(me.role) && me.role !== "sales")) return { error: "Only the owner, managers and salespeople can attach Scout results." };
  const runId = text(form, "runId", 40);
  if (!isUuid(runId)) return { error: "Unknown run." };
  let raw = typeof form.get("results") === "string" ? String(form.get("results")) : "";
  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > SCOUT_RESULTS_MAX_BYTES) return { error: "That file is too big (over 1.5 MB)." };
    raw = await file.text();
  }
  if (!raw.trim()) return { error: "Paste the results, or pick the results file." };
  if (raw.length > SCOUT_RESULTS_MAX_BYTES) return { error: "That's too big (over 1.5 MB)." };
  const parsed = parseScoutResults(raw, runId);
  if (!parsed.ok) return { error: parsed.error };
  const db = await createDatabaseClient();
  const run = await db.from("scout_runs").select("id, status, created_by").eq("id", runId).maybeSingle();
  if (run.error || !run.data) return { error: MISSING_TABLE.has(run.error?.code ?? "") ? SCOUT_SETUP : "That run isn't one you can attach results to." };
  if (run.data.status === "attached") return { error: "Results are already attached to this run." };
  const paid = await db.from("scout_spend").select("id").eq("run_id", runId).limit(1);
  if (!paid.data?.length) return { error: "This run has no recorded estimate, so it can't take results. Start a new run." };
  // Salespeople's finds are theirs; the owner's and managers' go to the shared pool.
  const assigned = me.role === "sales" ? me.userId : null;
  const rows = parsed.results.businesses.map((b) => {
    const s = scoreBusiness(b);
    return {
      run_id: runId,
      created_by: me.userId,
      business_key: s.key,
      name: s.name,
      website: s.website,
      category: s.category,
      address: s.address,
      town: s.town,
      lat: s.lat,
      lng: s.lng,
      maps_url: s.mapsUrl,
      rating: s.rating,
      reviews: s.reviews,
      signals: s.signals,
      score: s.score,
      reasons: s.reasons,
      angle: s.angle,
      assigned_to: assigned,
    };
  });
  // One row per business even if the file repeats one.
  const unique = [...new Map(rows.map((r) => [r.business_key, r])).values()];
  let saved = 0;
  if (unique.length) {
    const ins = await db.from("scout_prospects").upsert(unique, { onConflict: "business_key", ignoreDuplicates: true }).select("id");
    if (ins.error) {
      console.warn(`Scout results refused: ${ins.error.code}`);
      return { error: ins.error.code === "23514" ? "Something in the results was refused (contact details or a bad value). Nothing was saved." : "Couldn't save the results." };
    }
    saved = ins.data?.length ?? 0;
  }
  const done = await db.from("scout_runs").update({ status: "attached", found: saved }).eq("id", runId);
  if (done.error) console.warn(`Scout run not marked attached: ${done.error.code}`);
  revalidatePath("/sales", "layout");
  const skipped = parsed.results.businesses.length - saved;
  return {
    ok: true,
    message: `Saved ${saved} prospect${saved === 1 ? "" : "s"}.${skipped > 0 ? ` ${skipped} skipped (already a client, already a lead, do not contact, or already found).` : ""}`,
    refused: parsed.results.refused.slice(0, 20),
  };
}

/** A salesperson takes an unclaimed prospect from the shared pool (the database allows only that). */
export async function claimProspect(form: FormData) {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || (!isLead(me.role) && me.role !== "sales")) return;
  const id = text(form, "prospectId", 40);
  if (!isUuid(id)) return;
  const db = await createDatabaseClient();
  const { error } = await db.from("scout_prospects").update({ assigned_to: me.userId }).eq("id", id).is("assigned_to", null);
  if (error) console.warn(`Claim refused: ${error.code}`);
  revalidatePath("/sales", "layout");
}

/** Owner: give prospects to a salesperson, or put them back in the pool. */
export async function assignProspects(form: FormData) {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || me.role !== "owner") return;
  const ids = form.getAll("prospectId").filter((v): v is string => typeof v === "string" && isUuid(v)).slice(0, 100);
  const to = text(form, "to", 40);
  if (!ids.length || (to && !isUuid(to))) return;
  const db = await createDatabaseClient();
  if (to) {
    const { data } = await db.from("team_members").select("user_id").eq("user_id", to).in("role", ["sales", "owner", "manager"]).maybeSingle();
    if (!data) return;
  }
  const { error } = await db.from("scout_prospects").update({ assigned_to: to || null }).in("id", ids);
  if (error) console.warn(`Assign refused: ${error.code}`);
  revalidatePath("/sales", "layout");
}

/** Owner/managers: hide a prospect (not a fit), with a short reason. */
export async function skipProspect(form: FormData) {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || !isLead(me.role)) return;
  const id = text(form, "prospectId", 40);
  const reason = text(form, "reason", 120);
  if (!isUuid(id) || contactDetailsIn(reason).length) return;
  const db = await createDatabaseClient();
  const { error } = await db.from("scout_prospects").update({ status: "skipped", skip_reason: reason || null }).eq("id", id);
  if (error) console.warn(`Skip refused: ${error.code}`);
  revalidatePath("/sales", "layout");
}

/** One tap after a walk-in or call. Add-only; the database stamps who/when and moves the status. */
export async function logScoutVisit(_prev: ScoutFormState, form: FormData): Promise<ScoutFormState> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || (!isLead(me.role) && me.role !== "sales")) return { error: "Only the owner, managers and salespeople can log visits." };
  const id = text(form, "prospectId", 40);
  const kind = asVisitKind(text(form, "kind", 10));
  const outcome = asOutcome(text(form, "outcome", 20));
  if (!isUuid(id)) return { error: "Unknown prospect." };
  if (!kind || !outcome) return { error: "Pick what happened." };
  const checked = checkTouchNote(typeof form.get("note") === "string" ? String(form.get("note")).slice(0, 400) : "");
  if (checked.error) return { error: checked.error };
  const db = await createDatabaseClient();
  const { error } = await db.from("scout_visits").insert({ prospect_id: id, kind, outcome, note: checked.note, user_id: me.userId });
  if (error) {
    console.warn(`Visit refused: ${error.code}`);
    return { error: MISSING_TABLE.has(error.code ?? "") ? SCOUT_SETUP : error.code === "42501" ? "That prospect isn't yours. Claim it first." : "Couldn't save it." };
  }
  revalidatePath("/sales", "layout");
  revalidatePath("/");
  return { ok: true };
}

/** Owner: the Scout caps (monthly total, default per salesperson, "not interested" wait). */
export async function saveScoutSettings(_prev: ScoutFormState, form: FormData): Promise<ScoutFormState> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || me.role !== "owner") return { error: "Only the owner changes the Scout caps." };
  const monthly = Number(text(form, "monthlyUsd", 10));
  const perRep = Number(text(form, "perRepMonthlyUsd", 10));
  const wait = Number(text(form, "revisitDays", 4));
  if (!(monthly >= 0 && monthly <= 1000) || !(perRep >= 0 && perRep <= 1000)) return { error: "Caps must be between $0 and $1,000." };
  if (!Number.isInteger(wait) || wait < 7 || wait > 730) return { error: "The wait must be 7 to 730 days." };
  const db = await createDatabaseClient();
  const { error } = await db
    .from("scout_settings")
    .update({ monthly_usd: Math.round(monthly * 100) / 100, per_rep_monthly_usd: Math.round(perRep * 100) / 100, revisit_days: wait, updated_by: me.userId, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) return { error: MISSING_TABLE.has(error.code ?? "") ? SCOUT_SETUP : "Couldn't save the caps." };
  revalidatePath("/sales", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------- SEO Watcher (0027, docs/SEO_WATCHER_PLAN.md Phase B)
// Owner and managers only. The database checks the same rules again (roles, list limits,
// the monthly cap, add-only history); these checks give a clear message first.

export type WatchFormState = { error?: string; ok?: boolean; message?: string } | undefined;

async function watchEditor(): Promise<{ userId: string; role: string } | { error: string }> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || !isLead(me.role)) return { error: "Only the owner and managers can change the SEO Watcher." };
  return me;
}

function watchFail(code: string | undefined, fallback: string): WatchFormState {
  if (MISSING_TABLE.has(code ?? "")) return { error: WATCH_SETUP };
  if (code === "23505") return { error: "That's already on the list." };
  if (code === "23514") return { error: "That was refused: the list may be full, or a value isn't allowed." };
  return { error: fallback };
}

function watchDone(message: string): WatchFormState {
  revalidatePath("/growth/watcher", "layout");
  return { ok: true, message };
}

/** Start (or resume) watching a client: website + what they do. */
export async function watchClient(_prev: WatchFormState, form: FormData): Promise<WatchFormState> {
  await notWhilePreviewing();
  const me = await watchEditor();
  if ("error" in me) return me;
  const clientId = text(form, "clientId", 40);
  if (!isUuid(clientId)) return { error: "Pick a client." };
  const domain = cleanDomain(text(form, "domain", 200));
  if (!domain.ok) return { error: domain.error };
  const niche = cleanNiche(text(form, "niche", 60));
  if (!niche.ok) return { error: niche.error };
  const db = await createDatabaseClient();
  const existing = await db.from("watch_clients").select("client_id").eq("client_id", clientId).maybeSingle();
  if (existing.error) return watchFail(existing.error.code, "Couldn't check the watch list.");
  const res = existing.data
    ? await db.from("watch_clients").update({ domain: domain.domain, niche: niche.niche, active: true }).eq("client_id", clientId)
    : await db.from("watch_clients").insert({ client_id: clientId, domain: domain.domain, niche: niche.niche, added_by: me.userId });
  if (res.error) return watchFail(res.error.code, "Couldn't start watching that client.");
  return watchDone("Watching. Add keywords and cities next.");
}

/** Pause or resume a watched client (nothing is deleted; history stays). */
export async function setWatchClientActive(form: FormData): Promise<void> {
  await notWhilePreviewing();
  const me = await watchEditor();
  if ("error" in me) return;
  const clientId = text(form, "clientId", 40);
  if (!isUuid(clientId)) return;
  const db = await createDatabaseClient();
  const { error } = await db.from("watch_clients").update({ active: text(form, "active", 5) === "true" }).eq("client_id", clientId);
  if (error) console.warn(`Watcher pause refused: ${error.code}`);
  revalidatePath("/growth/watcher", "layout");
}

export async function addWatchKeyword(_prev: WatchFormState, form: FormData): Promise<WatchFormState> {
  await notWhilePreviewing();
  const me = await watchEditor();
  if ("error" in me) return me;
  const clientId = text(form, "clientId", 40);
  if (!isUuid(clientId)) return { error: "Unknown client." };
  const words = text(form, "keywords", 2000).split(/[\n,]+/).map((k) => k.trim()).filter(Boolean);
  if (!words.length) return { error: "Type a keyword (one per line, or separated by commas)." };
  if (words.length > 25) return { error: "Add up to 25 at a time." };
  const cleaned: string[] = [];
  for (const w of words) {
    const k = cleanKeyword(w);
    if (!k.ok) return { error: `"${w.slice(0, 40)}": ${k.error}` };
    if (!cleaned.includes(k.keyword)) cleaned.push(k.keyword);
  }
  const money = text(form, "money", 5) === "on";
  const db = await createDatabaseClient();
  let added = 0;
  for (const keyword of cleaned) {
    const { error } = await db.from("watch_keywords").insert({ client_id: clientId, keyword, money });
    if (error && error.code !== "23505") {
      return added ? { ...watchFail(error.code, "Couldn't add the rest."), message: `${added} added before that.` } : watchFail(error.code, "Couldn't add that keyword.");
    }
    if (!error) added++;
  }
  return watchDone(added ? `${added} keyword${added === 1 ? "" : "s"} added.` : "Those are already on the list.");
}

/** Toggle a keyword's "money" mark or pause/resume it. */
export async function setWatchKeyword(form: FormData): Promise<void> {
  await notWhilePreviewing();
  const me = await watchEditor();
  if ("error" in me) return;
  const id = text(form, "id", 40);
  const field = text(form, "field", 10);
  if (!isUuid(id) || (field !== "money" && field !== "active")) return;
  const db = await createDatabaseClient();
  const { error } = await db.from("watch_keywords").update({ [field]: text(form, "value", 5) === "true" }).eq("id", id);
  if (error) console.warn(`Watcher keyword change refused: ${error.code}`);
  revalidatePath("/growth/watcher", "layout");
}

export async function addWatchMarket(_prev: WatchFormState, form: FormData): Promise<WatchFormState> {
  await notWhilePreviewing();
  const me = await watchEditor();
  if ("error" in me) return me;
  const clientId = text(form, "clientId", 40);
  if (!isUuid(clientId)) return { error: "Unknown client." };
  const city = cleanCity(text(form, "city", 80), text(form, "state", 4));
  if (!city.ok) return { error: city.error };
  const pos = cleanPosition(text(form, "lat", 20), text(form, "lng", 20));
  if (!pos.ok) return { error: pos.error };
  const db = await createDatabaseClient();
  const { error } = await db.from("watch_markets").insert({ client_id: clientId, city: city.city, state: city.state, lat: pos.lat, lng: pos.lng });
  if (error) return watchFail(error.code, "Couldn't add that city.");
  return watchDone(`${city.city}, ${city.state} added.`);
}

/** Pause/resume a city, or fill in its map position. */
export async function setWatchMarket(form: FormData): Promise<void> {
  await notWhilePreviewing();
  const me = await watchEditor();
  if ("error" in me) return;
  const id = text(form, "id", 40);
  if (!isUuid(id)) return;
  const db = await createDatabaseClient();
  const { error } = await db.from("watch_markets").update({ active: text(form, "active", 5) === "true" }).eq("id", id);
  if (error) console.warn(`Watcher city change refused: ${error.code}`);
  revalidatePath("/growth/watcher", "layout");
}

export async function addWatchCompetitor(_prev: WatchFormState, form: FormData): Promise<WatchFormState> {
  await notWhilePreviewing();
  const me = await watchEditor();
  if ("error" in me) return me;
  const clientId = text(form, "clientId", 40);
  if (!isUuid(clientId)) return { error: "Unknown client." };
  const domain = cleanDomain(text(form, "domain", 200));
  if (!domain.ok) return { error: domain.error };
  const db = await createDatabaseClient();
  const { error } = await db.from("watch_competitors").insert({ client_id: clientId, domain: domain.domain });
  if (error) return watchFail(error.code, "Couldn't add that competitor.");
  return watchDone(`${domain.domain} added.`);
}

export async function setWatchCompetitor(form: FormData): Promise<void> {
  await notWhilePreviewing();
  const me = await watchEditor();
  if ("error" in me) return;
  const id = text(form, "id", 40);
  if (!isUuid(id)) return;
  const db = await createDatabaseClient();
  const { error } = await db.from("watch_competitors").update({ active: text(form, "active", 5) === "true" }).eq("id", id);
  if (error) console.warn(`Watcher competitor change refused: ${error.code}`);
  revalidatePath("/growth/watcher", "layout");
}

/** Copy a saved audit's towns, competitors, keywords and starting positions into a watched client's lists. */
export async function importWatchFromAudit(_prev: WatchFormState, form: FormData): Promise<WatchFormState> {
  await notWhilePreviewing();
  const me = await watchEditor();
  if ("error" in me) return me;
  const clientId = text(form, "clientId", 40);
  const auditId = text(form, "auditId", 40);
  if (!isUuid(clientId) || !isUuid(auditId)) return { error: "Pick a saved audit." };
  const imp = await getWatchAuditImport(auditId);
  if (!imp) return { error: "That audit can't be read (or has no settings yet)." };
  const watch = await getWatch();
  if (!watch.ready || !watch.settings) return { error: WATCH_SETUP };
  if (!watch.clients.some((c) => c.id === clientId)) return { error: "Start watching this client first." };
  const lim = watch.settings;
  const room = (used: number, max: number) => Math.max(0, max - used);
  const kwUsed = watch.keywords.filter((k) => k.clientId === clientId && k.active);
  const mkUsed = watch.markets.filter((m) => m.clientId === clientId && m.active);
  const cpUsed = watch.competitors.filter((c) => c.clientId === clientId && c.active);
  const newMarkets = imp.markets.filter((m) => !mkUsed.some((x) => x.city.toLowerCase() === m.city.toLowerCase() && x.state === m.state)).slice(0, room(mkUsed.length, lim.marketsPerClient));
  const newComps = imp.competitors.filter((d) => !cpUsed.some((x) => x.domain === d)).slice(0, room(cpUsed.length, lim.competitorsPerClient));
  const newKws = imp.keywords.filter((k) => !kwUsed.some((x) => x.keyword === k.keyword)).slice(0, room(kwUsed.length, lim.keywordsPerClient));
  const db = await createDatabaseClient();
  const opts = { ignoreDuplicates: true } as const;
  if (newMarkets.length) {
    const r = await db.from("watch_markets").upsert(newMarkets.map((m) => ({ client_id: clientId, city: m.city, state: m.state, lat: m.lat, lng: m.lng })), { ...opts, onConflict: "client_id,city,state" });
    if (r.error) return watchFail(r.error.code, "Couldn't copy the audit's cities.");
  }
  if (newComps.length) {
    const r = await db.from("watch_competitors").upsert(newComps.map((d) => ({ client_id: clientId, domain: d, source: "audit" })), { ...opts, onConflict: "client_id,domain" });
    if (r.error) return watchFail(r.error.code, "Couldn't copy the audit's competitors.");
  }
  if (newKws.length) {
    const r = await db.from("watch_keywords").upsert(newKws.map((k) => ({ client_id: clientId, keyword: k.keyword, money: k.money })), { ...opts, onConflict: "client_id,keyword" });
    if (r.error) return watchFail(r.error.code, "Couldn't copy the audit's keywords.");
  }
  // Starting positions: the audit checked the whole region, so they go on the home city.
  let baseline = 0;
  if (imp.retrieved && imp.baseline.length && imp.markets[0]) {
    const home = imp.markets[0];
    const [mk, kw] = await Promise.all([
      db.from("watch_markets").select("id").eq("client_id", clientId).eq("city", home.city).eq("state", home.state).maybeSingle(),
      db.from("watch_keywords").select("id, keyword").eq("client_id", clientId).limit(500),
    ]);
    const ids = new Map((kw.data ?? []).map((k) => [k.keyword as string, k.id as string]));
    if (mk.data) {
      const rows = imp.baseline.flatMap((b) => {
        const id = ids.get(b.keyword);
        return id ? [{ client_id: clientId, keyword_id: id, market_id: mk.data!.id as string, checked_on: imp.retrieved!, organic: b.organic, source: "audit" }] : [];
      });
      if (rows.length) {
        const r = await db.from("watch_rank_checks").upsert(rows, { ...opts, onConflict: "keyword_id,market_id,checked_on" }).select("id");
        if (r.error) console.warn(`Watcher audit baseline refused: ${r.error.code}`);
        baseline = r.data?.length ?? 0;
      }
    }
  }
  const left = imp.markets.length - newMarkets.length + imp.keywords.length - newKws.length + imp.competitors.length - newComps.length;
  return watchDone(
    `Copied ${newKws.length} keywords, ${newMarkets.length} cities, ${newComps.length} competitors${baseline ? ` and ${baseline} starting positions` : ""}.${left > 0 ? " Some were already listed or didn't fit the list limits." : ""}`,
  );
}

/** Owner: the monthly cap and list limits. */
export async function saveWatchSettings(_prev: WatchFormState, form: FormData): Promise<WatchFormState> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || me.role !== "owner") return { error: "Only the owner sets the Watcher cap and limits." };
  const num = (k: string) => Number(text(form, k, 10));
  const monthly = num("capUsd");
  const kw = num("keywords");
  const mk = num("markets");
  const cp = num("competitors");
  if (!Number.isFinite(monthly) || monthly < 0 || monthly > 1000) return { error: "The monthly cap is $0 to $1,000." };
  if (![kw, mk, cp].every((n) => Number.isInteger(n) && n >= 1) || kw > 200 || mk > 50 || cp > 50) return { error: "Limits: 1–200 keywords, 1–50 cities, 1–50 competitors." };
  const db = await createDatabaseClient();
  const { error } = await db
    .from("watch_settings")
    .update({ monthly_usd: Math.round(monthly * 100) / 100, keywords_per_client: kw, markets_per_client: mk, competitors_per_client: cp, updated_by: me.userId, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) return watchFail(error.code, "Couldn't save the settings.");
  return watchDone("Saved.");
}

/** Start a round of checks: works out the pairs and the estimate, then records it under the cap. */
export async function startWatchRound(_prev: WatchFormState, form: FormData): Promise<WatchFormState> {
  await notWhilePreviewing();
  const me = await watchEditor();
  if ("error" in me) return me;
  const watch = await getWatch();
  if (!watch.ready || !watch.settings) return { error: WATCH_SETUP };
  const picked = form.getAll("clientId").filter((v): v is string => typeof v === "string" && isUuid(v));
  const clients = watch.clients.filter((c) => c.active && picked.includes(c.id));
  if (!clients.length) return { error: "Pick at least one watched client." };
  let pairs = 0;
  let cities = 0;
  for (const c of clients) {
    const k = watch.keywords.filter((x) => x.clientId === c.id && x.active).length;
    const m = watch.markets.filter((x) => x.clientId === c.id && x.active).length;
    pairs += k * m;
    cities += m;
  }
  if (!pairs) return { error: "Those clients need at least one keyword and one city first." };
  const volumes = volumesDue(watch.latestVolumeMonth, nyToday());
  const est = roundEstimate(pairs, volumes ? cities : 0);
  const left = Math.max(0, watch.settings.capUsd - watch.spentThisMonthUsd);
  if (est > left) {
    return { error: `This round is estimated at $${est.toFixed(2)}, but only $${left.toFixed(2)} of the $${watch.settings.capUsd.toFixed(2)} monthly cap is left. Pick fewer clients, or the owner can raise the cap.` };
  }
  const db = await createDatabaseClient();
  const run = await db.from("watch_runs").insert({ client_ids: clients.map((c) => c.id), pairs, volumes, est_usd: est, created_by: me.userId }).select("id").single();
  if (run.error || !run.data) {
    console.warn(`Watcher round refused: ${run.error?.code}`);
    return run.error?.code === "23514" ? { error: "That would go over the monthly Watcher cap, so the round won't go ahead." } : watchFail(run.error?.code, "Couldn't start the round.");
  }
  revalidatePath("/growth/watcher", "layout");
  redirect(`/growth/watcher/rounds/${run.data.id}`);
}

/** Attach a round's results file: checked strictly, then saved (history only grows). */
export async function attachWatchResults(_prev: WatchFormState, form: FormData): Promise<WatchFormState> {
  await notWhilePreviewing();
  const me = await watchEditor();
  if ("error" in me) return me;
  const runId = text(form, "runId", 40);
  if (!isUuid(runId)) return { error: "Unknown round." };
  let raw = typeof form.get("results") === "string" ? String(form.get("results")) : "";
  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > WATCH_RESULTS_MAX_BYTES) return { error: "That file is too big (over 2 MB)." };
    raw = await file.text();
  }
  if (!raw.trim()) return { error: "Paste the results, or pick the results file." };
  const watch = await getWatch();
  if (!watch.ready) return { error: WATCH_SETUP };
  const run = watch.runs.find((r) => r.id === runId);
  if (!run) return { error: "That round can't be found." };
  if (run.status === "attached") return { error: "Results are already attached to this round." };
  const parsed = parseWatchResults(raw, buildRoundScope(runId, run.clientIds, watch.keywords, watch.markets, nyToday()));
  if (!parsed.ok) return { error: parsed.error };
  const { results } = parsed;
  const db = await createDatabaseClient();
  const opts = { ignoreDuplicates: true } as const;
  let saved = 0;
  if (results.ranks.length) {
    const r = await db
      .from("watch_rank_checks")
      .upsert(
        results.ranks.map((x) => ({ run_id: runId, client_id: x.clientId, keyword_id: x.keywordId, market_id: x.marketId, checked_on: results.checkedOn, organic: x.organic, pack: x.pack, url: x.url, others: x.others, source: "dataforseo" })),
        { ...opts, onConflict: "keyword_id,market_id,checked_on" },
      )
      .select("id");
    if (r.error) {
      console.warn(`Watcher results refused: ${r.error.code}`);
      return watchFail(r.error.code, "Couldn't save the rank checks.");
    }
    saved += r.data?.length ?? 0;
  }
  if (results.volumes.length) {
    const r = await db
      .from("watch_volumes")
      .upsert(
        results.volumes.map((v) => ({ run_id: runId, client_id: v.clientId, market_id: v.marketId, keyword: v.keyword, month: v.month, volume: v.volume, cpc_usd: v.cpcUsd, source: "dataforseo" })),
        { ...opts, onConflict: "market_id,keyword,month" },
      )
      .select("id");
    if (r.error) {
      console.warn(`Watcher volumes refused: ${r.error.code}`);
      return watchFail(r.error.code, "Couldn't save the search volumes.");
    }
  }
  // Map positions: only fill in cities that don't have one yet.
  for (const m of results.markets) {
    const known = watch.markets.find((x) => x.id === m.marketId);
    if (!known || known.lat !== null) continue;
    const r = await db.from("watch_markets").update({ lat: m.lat, lng: m.lng, location_code: m.locationCode }).eq("id", m.marketId);
    if (r.error) console.warn(`Watcher map position refused: ${r.error.code}`);
  }
  const done = await db.from("watch_runs").update({ status: "attached", actual_usd: results.costUsd, checks_saved: saved }).eq("id", runId);
  if (done.error) console.warn(`Watcher round not marked attached: ${done.error.code}`);
  return watchDone(`Saved ${saved} rank checks and ${results.volumes.length} search volumes${results.skipped ? ` (${results.skipped} rows didn't match and were left out)` : ""}.`);
}

// ---------------------------------------------------------------------------
// Role guides, personal goals and ideas (docs/ROLE_GUIDES_PLAN.md, 0036). The database
// enforces every rule again (who edits which guide, own goals only, owner-only review).
// Nothing here is sent anywhere or given to the AI.
// ---------------------------------------------------------------------------

type GuideState = { error?: string; ok?: boolean } | undefined;
const NEEDS_0036 = "This needs one setup step first (run 0036 in Supabase).";

function cleanGuideBody(form: FormData): string {
  const raw = form.get("body");
  return typeof raw === "string" ? raw.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, GUIDE_LIMITS.body) : "";
}

/** Owner/managers: replace a starter part of a guide, or add/edit an added section. */
export async function saveGuidePart(_prev: GuideState, form: FormData): Promise<GuideState> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  const role = asGuideRole(text(form, "role", 12));
  if (!me || !role || !canEditGuide(me.role, role)) return { error: "Only the owner or a manager can edit this guide." };
  const part = oneOf(["duties", "goals", "how_to", "extra"] as const, text(form, "part", 10));
  if (!part) return { error: "Unknown part of the guide." };
  const id = text(form, "id", 40);
  if (id && !isUuid(id)) return { error: "Unknown section." };
  const title = part === "extra" ? text(form, "title", GUIDE_LIMITS.title) : null;
  if (part === "extra" && !title) return { error: "Give the section a title." };
  const body = cleanGuideBody(form);
  if (!body.trim()) return { error: "Write something first (or use Reset to go back to the starter text)." };
  const secret = findSecrets(`${title ?? ""}\n${body}`);
  if (secret) return { error: secret };
  const db = await createDatabaseClient();
  const res = id
    ? await db.from("role_guide_parts").update({ title, body }).eq("id", id).eq("role", role).select("id").maybeSingle()
    : await db.from("role_guide_parts").insert({ role, part, title, body }).select("id").single();
  if (res.error || !res.data) {
    console.warn(`Guide not saved: ${res.error?.code}`);
    if (MISSING_TABLE.has(res.error?.code ?? "")) return { error: NEEDS_0036 };
    if (res.error?.code === "23505") return { error: "Someone else just edited this part. Reload the page and try again." };
    if (res.error?.code === "23514") return { error: "That text was refused (it may look like a password or key)." };
    return { error: "Couldn't save it." };
  }
  revalidatePath("/kit", "layout");
  return { ok: true };
}

/** Owner/managers: Reset a part to the starter text, or remove an added section (archived, never deleted). */
export async function resetGuidePart(form: FormData) {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  const role = asGuideRole(text(form, "role", 12));
  const id = text(form, "id", 40);
  if (!me || !role || !canEditGuide(me.role, role) || !isUuid(id)) return;
  const db = await createDatabaseClient();
  const { error } = await db.from("role_guide_parts").update({ archived: true }).eq("id", id).eq("role", role);
  if (error) console.warn(`Guide reset refused: ${error.code}`);
  revalidatePath("/kit", "layout");
}

/** Owner/managers: give a teammate a goal. */
export async function addGoal(_prev: GuideState, form: FormData): Promise<GuideState> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me || !isLead(me.role)) return { error: "Only the owner or a manager can set goals." };
  const userId = text(form, "userId", 40);
  if (!isUuid(userId)) return { error: "Pick who the goal is for." };
  const checked = checkGoal(form.get("goal"), form.get("dueOn"));
  if (!checked.ok) return { error: checked.error };
  const db = await createDatabaseClient();
  const { error } = await db.from("person_goals").insert({ user_id: userId, goal: checked.goal, due_on: checked.dueOn });
  if (error) {
    console.warn(`Goal not added: ${error.code}`);
    return { error: MISSING_TABLE.has(error.code) ? NEEDS_0036 : error.code === "23514" ? "That text was refused (it may look like a password or key)." : "Couldn't add the goal." };
  }
  revalidatePath("/kit", "layout");
  return { ok: true };
}

/** Tick your own goal done (or undo). Owner/managers can also archive a goal. */
export async function goalOp(form: FormData) {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  const id = text(form, "id", 40);
  const op = text(form, "op", 10);
  if (!me || !isUuid(id)) return;
  const patch =
    op === "done" ? { done_at: new Date().toISOString() } : op === "undo" ? { done_at: null } : op === "archive" && isLead(me.role) ? { archived: true } : null;
  if (!patch) return;
  const db = await createDatabaseClient();
  // Non-leads can only touch their own rows (the database refuses the rest anyway).
  const q = db.from("person_goals").update(patch).eq("id", id);
  const { error } = isLead(me.role) ? await q : await q.eq("user_id", me.userId);
  if (error) console.warn(`Goal change refused: ${error.code}`);
  revalidatePath("/kit", "layout");
}

/** Anyone on the team: send an idea. Saved under your own login; nothing is sent anywhere. */
export async function sendIdea(_prev: GuideState, form: FormData): Promise<GuideState> {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (!me) return { error: "Sign in first." };
  const checked = checkIdea({ kind: form.get("kind"), title: form.get("title"), details: form.get("details") });
  if (!checked.ok) return { error: checked.error };
  const db = await createDatabaseClient();
  const { error } = await db.from("ideas").insert(checked.idea);
  if (error) {
    console.warn(`Idea not saved: ${error.code}`);
    if (MISSING_TABLE.has(error.code)) return { error: NEEDS_0036 };
    if (error.code === "23514") return { error: `That was refused: it may look like a password or key, or you've sent ${IDEA_RULES.perDay} ideas today already.` };
    return { error: "Couldn't save your idea." };
  }
  revalidatePath("/kit", "layout");
  return { ok: true };
}

/** Owner only: set an idea's status and an optional short reply the sender sees. */
export async function reviewIdea(form: FormData) {
  await notWhilePreviewing();
  const me = await getCurrentMember();
  if (me?.role !== "owner") return;
  const id = text(form, "id", 40);
  const status = asIdeaStatus(text(form, "status", 12));
  if (!isUuid(id) || !status) return;
  const reply = text(form, "reply", IDEA_RULES.reply);
  if (reply && findSecrets(reply)) return;
  const db = await createDatabaseClient();
  const { error } = await db.from("ideas").update({ status, reply: reply || null }).eq("id", id);
  if (error) console.warn(`Idea review refused: ${error.code}`);
  revalidatePath("/kit", "layout");
}
