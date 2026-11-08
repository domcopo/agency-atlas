// The owner summary route's key check and simple rate limit (server only).
// The key is compared by its SHA-256 fingerprint, in constant time; the key itself is
// never stored or logged.

import { createHash, timingSafeEqual } from "node:crypto";

/** The fingerprint from OWNER_SUMMARY_TOKEN_SHA256, or null when the feature is off. */
export function expectedFingerprint(): string | null {
  const v = process.env.OWNER_SUMMARY_TOKEN_SHA256?.trim().toLowerCase() ?? "";
  return /^[0-9a-f]{64}$/.test(v) ? v : null;
}

/** The key from "Authorization: Bearer <key>" (32–200 visible characters), or null. */
export function bearerKey(header: string | null): string | null {
  return /^Bearer ([\x21-\x7e]{32,200})$/.exec(header ?? "")?.[1] ?? null;
}

/** Constant-time comparison of the key's fingerprint with the expected one. */
export function keyMatches(key: string, expectedHex: string): boolean {
  const got = createHash("sha256").update(key, "utf8").digest();
  const want = Buffer.from(expectedHex, "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}

// Per-server limit (wrong keys never reach the database, which has its own limit).
const WINDOW_MS = 10 * 60_000;
export const MAX_PER_WINDOW = 60;
let windowStart = 0;
let hits = 0;

export function overLimit(now = Date.now()): boolean {
  if (now - windowStart > WINDOW_MS) {
    windowStart = now;
    hits = 0;
  }
  hits++;
  return hits > MAX_PER_WINDOW;
}

/** Tests only: start a fresh window. */
export function resetLimit() {
  windowStart = 0;
  hits = 0;
}
