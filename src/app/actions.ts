"use server";

// Every change the app can make lives in this one file. Each action:
//   1. checks who is signed in (verified by Supabase, never trusted from the browser)
//   2. checks the input strictly (dates, lengths, allowed values)
//   3. writes AS that person, so the database's row-level security has the final say.
// Nothing here can delete anything. The GoHighLevel sync only READS from GHL
// (through the GET-only module) and writes copies into this app's own database.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { askAi, isAiConfigured, OPS_BRIEFING_SCHEMA, OPS_BRIEFING_TASK, PROFILE_SCHEMA, PROFILE_TASK, type AiResult } from "@/lib/ai/client";
import { buildCodebook, buildStaffBook, clientFacts, opsClientFacts, pipelineFacts, redact, restoreOpsBriefing, restoreProfile } from "@/lib/ai/snapshot";
import {
  getAiStatus,
  getAtlasQuestions,
  getCheckInHistory,
  getActions,
  getClientHealth,
  getGhlSummary,
  getOps,
  getRecentCheckInsByClient,
  getTeam,
  getRoster,
  getToday,
} from "@/lib/data-source";
import { loadPrivateRoster, loadPrivateTeam } from "@/lib/private-data";
import {
  GhlError,
  isGhlConfigured,
  readAppointments,
  readContactActivity,
  readLocationName,
  readOpportunities,
  searchContacts,
  type GhlAppointment,
  type GhlContactActivity,
  type GhlOpportunity,
} from "@/lib/ghl/client";
import { createDatabaseClient, getCurrentMember, isDatabaseConfigured } from "@/lib/supabase/server";

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
const STATUSES = ["open", "in_progress", "waiting", "blocked", "done"] as const;
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

export async function signOut() {
  if (isDatabaseConfigured()) {
    const db = await createDatabaseClient();
    await db.auth.signOut();
  }
  redirect("/login");
}

/** Change your own password (signed in with two-factor). The new password is never logged. */
export async function changePassword(_prev: { error?: string; ok?: boolean } | undefined, form: FormData) {
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
  const me = await getCurrentMember();
  if (!me || (me.role !== "owner" && me.role !== "manager")) return { error: "Only the owner or a manager can log check-ins." };
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
  row: { client_id?: string; lead_ghl_id?: string; kind: "follow_up" | "issue"; title: string; notes?: string | null; owner_staff_id: string | null; priority: string; due_on: string | null; promised_on?: string },
): Promise<{ error?: string }> {
  const { data, error } = await db.from("actions").insert(row).select("id").single();
  if (error || !data) {
    console.warn(`Action refused: ${error?.code}`);
    if (row.promised_on && MISSING_COLUMN.has(error?.code ?? "")) return { error: "Promise dates need one setup step first (0009 SQL)." };
    return { error: MISSING_TABLE.has(error?.code ?? "") ? "Next actions need one setup step first (0006 SQL)." : "Couldn't save it." };
  }
  await logActivity(db, { client_id: row.client_id ?? null, lead_ghl_id: row.lead_ghl_id ?? null, action_id: data.id, kind: "action_created", summary: `${row.kind === "issue" ? "Issue opened" : "Next action added"}: ${row.title}` });
  return {};
}

function refreshOps(slug?: string) {
  if (slug && /^[a-z0-9-]{1,90}$/.test(slug)) revalidatePath(`/clients/${slug}`);
  revalidatePath("/", "layout");
}

/** Add a follow-up or an issue to a client. */
export async function createAction(_prev: { error?: string; ok?: boolean } | undefined, form: FormData) {
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
  const me = await getCurrentMember();
  if (!me || (me.role !== "owner" && me.role !== "manager")) return { error: "Only the owner or a manager can add lead follow-ups." };
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
  if (ownerRaw && !(await staffExists(db, ownerRaw))) return { error: "Pick someone from the team." };
  const saved = await saveAction(db, { lead_ghl_id: leadId, kind: "follow_up", title, owner_staff_id: ownerRaw || null, priority, due_on: due });
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
  const me = await getCurrentMember();
  if (!me) return;
  const id = text(form, "actionId", 40);
  const op = text(form, "op", 12);
  if (!isUuid(id)) return;
  // Developers may only change the status of their own items, and say why it's blocked (the database enforces this too).
  if (me.role === "developer" && op !== "done" && op !== "status") return;
  const db = await createDatabaseClient();
  const { data: current } = await db.from("actions").select("id, client_id, lead_ghl_id, title, status").eq("id", id).maybeSingle();
  if (!current) return; // not found, or not allowed to see it
  const a = current as { id: string; client_id: string | null; lead_ghl_id: string | null; title: string; status: string };

  let patch: Record<string, unknown> | null = null;
  let summary = "";
  let kind = "action_status";
  if (op === "done") {
    patch = { status: "done", done_at: new Date().toISOString() };
    summary = `Done: ${a.title}`;
    kind = "action_done";
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
    if (!due) return;
    patch = { due_on: due };
    summary = `Rescheduled to ${due}: ${a.title}`;
    kind = "action_rescheduled";
  } else if (op === "assign") {
    const ownerId = text(form, "ownerId", 40);
    const name = ownerId ? await staffExists(db, ownerId) : null;
    if (ownerId && !name) return;
    patch = { owner_staff_id: ownerId || null };
    summary = name ? `Assigned to ${name}: ${a.title}` : `Unassigned: ${a.title}`;
    kind = "action_assigned";
  } else if (op === "status") {
    const status = oneOf(STATUSES, text(form, "status", 12));
    if (!status) return;
    patch = status === "done" ? { status, done_at: new Date().toISOString() } : { status, done_at: null };
    // Blocked: keep a short reason. Other statuses clear it.
    const reason = text(form, "reason", 200);
    patch.blocked_reason = status === "blocked" ? reason || null : null;
    summary = `${status === "in_progress" ? "In progress" : status === "waiting" ? "Waiting on client" : status === "blocked" ? "Blocked" : status === "done" ? "Done" : "Open"}: ${a.title}`;
    kind = status === "done" ? "action_done" : "action_status";
  } else if (op === "promise") {
    if (me.role === "developer") return;
    const raw = text(form, "promised", 10);
    const promised = raw ? anyDate(raw) : null;
    if (raw && !promised) return;
    patch = { promised_on: promised };
    summary = promised ? `Promised to client by ${promised}: ${a.title}` : `Promise date removed: ${a.title}`;
    kind = "action_rescheduled";
  } else if (op === "priority") {
    const priority = oneOf(PRIORITIES, text(form, "priority", 10));
    if (!priority) return;
    patch = { priority };
    summary = `Priority ${priority}: ${a.title}`;
  }
  if (!patch) return;
  let { error } = await db.from("actions").update(patch).eq("id", id);
  // Before 0009 there's no blocked_reason column: save the status change without it.
  if (error && MISSING_COLUMN.has(error.code ?? "") && "blocked_reason" in patch) {
    const { blocked_reason: _skip, ...rest } = patch;
    void _skip;
    ({ error } = await db.from("actions").update(rest).eq("id", id));
  }
  if (error) {
    console.warn(`Action update refused: ${error.code}`);
    return;
  }
  await logActivity(db, { client_id: a.client_id, lead_ghl_id: a.lead_ghl_id, action_id: a.id, kind, summary });
  refreshOps(text(form, "slug", 90));
}

/** "Set up clients" screen: owner and plan for one client in one save (owner only). */
export async function saveClientSetup(form: FormData) {
  const me = await getCurrentMember();
  if (!me || me.role !== "owner") return;
  const clientId = text(form, "clientId", 40);
  const ownerId = text(form, "ownerId", 40);
  if (!isUuid(clientId)) return;
  const db = await createDatabaseClient();
  const ownerName = ownerId ? await staffExists(db, ownerId) : null;
  if (ownerId && !ownerName) return;
  const picked = SERVICES.filter((sv) => form.getAll("services").includes(sv));
  const { data: before } = await db.from("clients").select("owner_staff_id, services").eq("id", clientId).maybeSingle();
  const prev = before as { owner_staff_id: string | null; services: string[] | null } | null;
  if (!prev) return;
  const { error } = await db.from("clients").update({ owner_staff_id: ownerId || null, services: picked }).eq("id", clientId);
  if (error) {
    console.warn(`Client setup refused: ${error.code}`);
    return;
  }
  const names: Record<string, string> = { SEO: "SEO", Ads: "Google Ads", Website: "Website build" };
  if ((prev.owner_staff_id ?? "") !== (ownerId || ""))
    await logActivity(db, { client_id: clientId, kind: "owner_changed", summary: ownerName ? `Owner set to ${ownerName}` : "Owner removed" });
  if ([...(prev.services ?? [])].sort().join() !== [...picked].sort().join())
    await logActivity(db, { client_id: clientId, kind: "owner_changed", summary: `Plan set to: ${picked.map((p) => names[p]).join(" + ") || "no services"}` });
  revalidatePath("/", "layout");
}

/** Which services a client buys (owner only; the database enforces this too). */
export async function setClientServices(form: FormData) {
  const me = await getCurrentMember();
  if (!me || me.role !== "owner") return;
  const clientId = text(form, "clientId", 40);
  if (!isUuid(clientId)) return;
  const picked = SERVICES.filter((sv) => form.getAll("services").includes(sv));
  const db = await createDatabaseClient();
  const { error } = await db.from("clients").update({ services: picked }).eq("id", clientId);
  if (error) {
    console.warn(`Services change refused: ${error.code}`);
    return;
  }
  const names: Record<string, string> = { SEO: "SEO", Ads: "Google Ads", Website: "Website build" };
  await logActivity(db, { client_id: clientId, kind: "owner_changed", summary: `Plan set to: ${picked.map((p) => names[p]).join(" + ") || "no services"}` });
  refreshOps(text(form, "slug", 90));
}

/** Who owns a client (owner only; the database enforces this too). */
export async function setClientOwner(form: FormData) {
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
  const me = await getCurrentMember();
  if (!me || me.role !== "owner") return { error: "Only the owner can import." };
  const roster = loadPrivateRoster();
  if (!roster) return { error: "No private client file found on this Mac." };
  const db = await createDatabaseClient();

  const rows = roster.clients.map((c) => ({
    slug: c.id,
    name: c.name,
    monthly_usd: c.monthlyUsd,
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
  const me = await getCurrentMember();
  if (!me || me.role !== "owner") return { error: "Only the owner can sync." };
  if (!isGhlConfigured()) return { error: "GoHighLevel isn't set up on this Mac yet." };

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

  const db = await createDatabaseClient();
  const now = new Date().toISOString();
  if (opportunities.length) {
    const { error } = await db.from("ghl_opportunities").upsert(
      opportunities.map((o) => ({
        ghl_id: o.ghlId,
        name: o.name,
        pipeline_name: o.pipelineName,
        stage_name: o.stageName,
        status: o.status,
        monetary_value: o.monetaryValue,
        source: o.source,
        ghl_created_at: o.createdAt,
        ghl_updated_at: o.updatedAt,
        status_changed_at: o.statusChangedAt,
        synced_at: now,
      })),
      { onConflict: "ghl_id" },
    );
    if (error) {
      console.warn(`GHL opportunities save refused: ${error.code} ${error.message}`);
      return { error: `Read from GoHighLevel, but saving failed (code ${error.code ?? "?"}).` };
    }
  }
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
  const times = await syncContactTimes(db);
  revalidatePath("/", "layout");
  return {
    message: `Read ${opportunities.length} opportunities and ${appointments.length} appointments${locationName ? ` from ${locationName}` : ""}. ${times} Nothing in GoHighLevel was changed.`,
  };
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
async function syncContactTimes(db: Db): Promise<string> {
  const links = await db.from("ghl_contact_links").select("client_id, ghl_contact_id, status");
  if (links.error) return "Call/message times: run the 0008 setup step to turn them on.";
  const clients = (await getRoster()).filter((c) => (c.status === "active" || c.status === "paused") && c.dbId);
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

async function logAiUsage(db: Awaited<ReturnType<typeof createDatabaseClient>>, feature: "briefing" | "client_profile", r: AiResult) {
  if (!r.usage || r.costUsd === undefined) return; // nothing was sent, nothing was charged
  const { error } = await db.from("ai_usage").insert({
    feature,
    model: r.model,
    input_tokens: r.usage.inputTokens,
    output_tokens: r.usage.outputTokens,
    cache_read_tokens: r.usage.cacheReadTokens,
    cache_write_tokens: r.usage.cacheWriteTokens,
    cost_usd: r.costUsd,
    outcome: r.ok ? "ok" : r.reason === "refused" ? "refused" : "error",
  });
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

export async function generateBriefing(): Promise<{ error?: string; message?: string }> {
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

export async function generateClientProfile(_prev: { error?: string; message?: string } | undefined, form: FormData): Promise<{ error?: string; message?: string }> {
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
  const me = await getCurrentMember();
  if (!me || me.role !== "owner") return;
  const id = text(form, "profileId", 40);
  if (!/^[0-9a-f-]{36}$/.test(id)) return;
  const db = await createDatabaseClient();
  await db.from("ai_client_profiles").update({ reviewed_at: new Date().toISOString(), reviewed_by: me.userId }).eq("id", id);
  revalidatePath("/", "layout");
}

export async function setAiBudget(_prev: { error?: string; ok?: boolean } | undefined, form: FormData): Promise<{ error?: string; ok?: boolean }> {
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
