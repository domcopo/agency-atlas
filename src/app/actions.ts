"use server";

// Every change the app can make lives in this one file. Each action:
//   1. checks who is signed in (verified by Supabase, never trusted from the browser)
//   2. checks the input strictly (dates, lengths, allowed values)
//   3. writes AS that person, so the database's row-level security has the final say.
// Nothing here can delete anything, and nothing here talks to GoHighLevel.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAtlasQuestions } from "@/lib/data-source";
import { loadPrivateRoster, loadPrivateTeam } from "@/lib/private-data";
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
  if (!/^[0-9a-f-]{36}$/.test(clientId)) return { error: "Unknown client." };
  if (!day) return { error: "Pick a date that isn't in the future." };
  const db = await createDatabaseClient();
  const { error } = await db.from("check_ins").insert({ client_id: clientId, happened_on: day, note: note || null });
  if (error) return { error: "Couldn't save the check-in." };
  revalidatePath(`/clients/${slug}`);
  revalidatePath("/clients");
  revalidatePath("/");
  return { ok: true };
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
