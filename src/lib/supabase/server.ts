// The ONLY place that reads the Supabase settings and creates a database client.
//
// - Server only. Settings have no NEXT_PUBLIC_ prefix, so they never reach the browser.
// - Uses the PUBLISHABLE key plus the signed-in person's session. That means every
//   query runs AS that person, and the database's row-level security decides what
//   they can see. There is no admin ("secret"/service-role) key anywhere in this app.
// - When the settings are missing, the app stays in local mode (private file or demo).

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

let warned = false;
/** Logs (this Mac only) why the settings were refused. Never logs the values. */
function refuse(reason: string): null {
  if (!warned) console.warn(`Database settings refused: ${reason}`);
  warned = true;
  return null;
}

function settings(): { url: string; key: string } | null {
  // Supabase pages sometimes copy the address with extras ("/" or "/rest/v1/").
  // Keep only the project's base address; anything else is refused below.
  const url = process.env.SUPABASE_URL?.trim()
    .replace(/\/+$/, "")
    .replace(/\/(rest|auth)\/v1$/, "");
  const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url && !key) return null; // not set up: local mode, nothing to report
  if (!url) return refuse("SUPABASE_URL line is missing or empty");
  if (!key) return refuse("SUPABASE_PUBLISHABLE_KEY line is missing or empty");
  // Only accept a Supabase project address (or a local one for development).
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) && !/^http:\/\/127\.0\.0\.1:\d+$/.test(url)) {
    const hint = /^["']/.test(url) ? "has quote marks" : url.endsWith("/") ? "ends with a slash" : !url.startsWith("https://") ? "doesn't start with https://" : "isn't in the form https://<id>.supabase.co";
    return refuse(`SUPABASE_URL ${hint}`);
  }
  // Refuse admin keys outright, even if someone pastes one by mistake.
  if (key.startsWith("sb_secret_")) return refuse("that's the SECRET key; use the publishable key");
  // Older-style keys are tokens that name their role inside; only "anon" is allowed.
  if (key.startsWith("eyJ")) {
    try {
      const role = JSON.parse(Buffer.from(key.split(".")[1] ?? "", "base64url").toString("utf8")).role;
      if (role !== "anon") return refuse("that's an admin key; use the publishable key");
    } catch {
      return refuse("the key couldn't be read");
    }
  } else if (!key.startsWith("sb_publishable_")) {
    return refuse(/^["']/.test(key) ? "SUPABASE_PUBLISHABLE_KEY has quote marks" : "SUPABASE_PUBLISHABLE_KEY doesn't start with sb_publishable_");
  }
  return { url, key };
}

export function isDatabaseConfigured(): boolean {
  return settings() !== null;
}

/** Settings for the sign-in check in src/proxy.ts (which can't use next/headers). */
export function databaseSettings() {
  return settings();
}

/** A database client acting as the signed-in person. Call once per request. */
export async function createDatabaseClient() {
  const s = settings();
  if (!s) throw new Error("Database is not configured");
  const cookieStore = await cookies();
  return createServerClient(s.url, s.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Pages can't set cookies; src/proxy.ts refreshes the session instead.
        }
      },
    },
  });
}

/**
 * Two-factor status for the signed-in person: "enabled" (an authenticator app is set
 * up), "pending" (setup started, not confirmed) or "none".
 */
export async function getTwoFactorState(): Promise<"enabled" | "pending" | "none"> {
  if (!isDatabaseConfigured()) return "none";
  const db = await createDatabaseClient();
  const { data } = await db.auth.mfa.listFactors();
  if (data?.totp.length) return "enabled";
  return data?.all.some((f) => f.factor_type === "totp") ? "pending" : "none";
}

/** The signed-in person's id and role, or null. Verified by the database, not trusted from the browser. */
export async function getCurrentMember(): Promise<{ userId: string; name: string; role: "owner" | "manager" | "developer" } | null> {
  if (!isDatabaseConfigured()) return null;
  const db = await createDatabaseClient();
  const { data: claims } = await db.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;
  const { data } = await db.from("team_members").select("display_name, role").eq("user_id", userId).maybeSingle();
  if (!data) return null;
  return { userId, name: data.display_name as string, role: data.role as "owner" | "manager" | "developer" };
}
