// GET /api/owner-summary: the owner's personal dashboard reads Atlas's latest saved
// summary (totals only). Read-only: it triggers nothing (no GoHighLevel sync, no AI).
//
// Access: "Authorization: Bearer <key>". Atlas stores only the key's SHA-256
// fingerprint (OWNER_SUMMARY_TOKEN_SHA256), compared in constant time. The database
// checks the fingerprint again, rate-limits and records each read.
//   404 = feature off (no fingerprint set) · 401 = missing/wrong key
//   429 = too many reads · 503 = nothing published yet, or the database is unreachable

import { bearerKey, expectedFingerprint, keyMatches, overLimit } from "@/lib/owner-summary-access";
import { readOwnerSummary } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Content-Type": "application/json; charset=utf-8" };
const reply = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...extra } });

export async function GET(request: Request): Promise<Response> {
  const expected = expectedFingerprint();
  if (!expected) return reply(404, { error: "not found" });
  if (overLimit()) return reply(429, { error: "too many requests" }, { "Retry-After": "600" });

  const key = bearerKey(request.headers.get("authorization"));
  if (!key || !keyMatches(key, expected)) {
    console.warn("Owner summary: missing or wrong key"); // never logs the key
    return reply(401, { error: "unauthorized" }, { "WWW-Authenticate": "Bearer" });
  }

  const result = await readOwnerSummary(key);
  if (result === "error") return reply(503, { error: "unavailable" });
  if (result === null) return reply(401, { error: "unauthorized" }, { "WWW-Authenticate": "Bearer" });
  if (result.status !== "ok") {
    return result.status === "limited" ? reply(429, { error: "too many requests" }, { "Retry-After": "600" }) : reply(503, { error: "nothing published yet" });
  }
  return reply(200, result.content, { "Last-Modified": new Date(result.publishedAt).toUTCString() });
}
