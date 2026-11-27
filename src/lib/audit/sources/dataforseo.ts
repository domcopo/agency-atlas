// DataForSEO, READ-ONLY lookups for "Run audit" (docs/AUDIT_RUN_PLAN.md, Phase E1).
//
// This is the ONLY file that talks to DataForSEO. Approved exception (owner, 2026-11-25):
// DataForSEO's API uses POST even to READ data, so this module sends POST, but only to the
// fixed host below and only to the allowlisted "live" lookups in ALLOWED. None of them can
// change anything anywhere; they return search data and cost a few cents each.
//
// The login (DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD) lives in the server's environment
// (Vercel, "Sensitive"), is only read here, is never logged, returned or sent to the
// browser. Answers are untrusted data: the caller checks every field (src/lib/audit/run.ts
// and the results checker) before anything is saved or drawn. Nothing about our clients is
// ever sent: only a prospect's public website, town, services and competitor websites.

const BASE = "https://api.dataforseo.com";
const TIMEOUT_MS = 30_000;
// 1,000 ranking rows run ~4 MB (each row carries keyword facts); 3 MB threw big brands away.
const MAX_BYTES = 8_000_000;

/** The only lookups this app may ask for (all read-only "live" endpoints). */
const ALLOWED = [
  "/v3/keywords_data/google_ads/search_volume/live",
  "/v3/serp/google/organic/live/advanced",
  "/v3/serp/google/maps/live/advanced",
  "/v3/dataforseo_labs/google/domain_rank_overview/live",
  "/v3/dataforseo_labs/google/bulk_keyword_difficulty/live",
  "/v3/on_page/lighthouse/live/json",
  // D1 (approved 2026-11-25, docs/AUDIT_DEPTH_PLAN.md): finding searches, each site's
  // rankings, and a one-page check of the business's homepage. All read-only.
  "/v3/dataforseo_labs/google/keyword_suggestions/live",
  "/v3/dataforseo_labs/google/ranked_keywords/live",
  "/v3/on_page/instant_pages",
] as const;
export type DfsPath = (typeof ALLOWED)[number];

export class DfsError extends Error {
  /**
   * retryable: trying once more may work (their server hiccuped, timed out or was busy).
   * mayBeCharged: only a lookup that got no answer at all (timeout) might still be billed;
   * DataForSEO doesn't charge for a refused request or a failed task.
   */
  constructor(message: string, readonly retryable = false, readonly mayBeCharged = false) {
    super(message);
  }
}

function login(): string | null {
  const user = process.env.DATAFORSEO_LOGIN?.trim();
  const pass = process.env.DATAFORSEO_PASSWORD?.trim();
  if (!user || !pass || user.length > 200 || pass.length > 200) return null;
  return Buffer.from(`${user}:${pass}`).toString("base64");
}

/** true when the DataForSEO login is set on the server (never says what it is). */
export function isDataForSeoConfigured(): boolean {
  return login() !== null;
}

export interface DfsAnswer {
  /** tasks[0].result: the lookup's answer (untrusted). */
  result: unknown[];
  /** What DataForSEO says this lookup cost, in dollars (null = not reported). */
  costUsd: number | null;
}

/** One read-only lookup: one task, one answer. Throws DfsError with a plain-English reason. */
export async function dfsLookup(path: DfsPath, task: Record<string, unknown>): Promise<DfsAnswer> {
  if (!ALLOWED.includes(path)) throw new DfsError("Blocked: that DataForSEO address isn't on the read-only list.");
  const auth = login();
  if (!auth) throw new DfsError("DataForSEO isn't connected yet (the login isn't set on the server).");
  const url = new URL(path, BASE);
  if (url.origin !== BASE) throw new DfsError("Blocked: unexpected address.");

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify([task]),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new DfsError("Couldn't reach DataForSEO (no answer in 30 seconds). Try again in a minute.", true, true);
  }
  if (!res.ok) {
    throw new DfsError(res.status === 401 ? "DataForSEO refused the login. Check it in Vercel's settings." : res.status === 402 ? "DataForSEO says the account is out of credit." : res.status === 429 ? "DataForSEO says too many requests. Wait a minute." : `DataForSEO returned an error (${res.status}).`, res.status >= 500 || res.status === 429);
  }
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new DfsError("DataForSEO's answer was unexpectedly large; skipped.");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new DfsError("DataForSEO's answer wasn't readable.");
  }
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const tasks = Array.isArray(o.tasks) ? o.tasks : [];
  const t = tasks[0] && typeof tasks[0] === "object" ? (tasks[0] as Record<string, unknown>) : null;
  if (!t) throw new DfsError("DataForSEO's answer had no result.");
  const code = typeof t.status_code === "number" ? t.status_code : 0;
  const cost = typeof t.cost === "number" && Number.isFinite(t.cost) && t.cost >= 0 && t.cost < 50 ? t.cost : typeof o.cost === "number" && o.cost >= 0 && o.cost < 50 ? o.cost : null;
  // 40106 = "completed with partial results; you have not been charged": keep what came back.
  if (code === 40106 && Array.isArray(t.result) && t.result.length) return { result: t.result, costUsd: cost };
  if (code !== 20000) {
    // e.g. 40501 = unknown location. The message is DataForSEO's own short text, cut short.
    const msg = typeof t.status_message === "string" ? t.status_message.replace(/[^\w .,:'()-]/g, "").slice(0, 120) : "unknown problem";
    // 40101-40103 ("internal SE server error" and similar) and 5xxxx are their side: worth one more try.
    throw new DfsError(`DataForSEO couldn't do that lookup (${code}: ${msg}).`, (code >= 40100 && code <= 40106) || code >= 50000);
  }
  return { result: Array.isArray(t.result) ? t.result : [], costUsd: cost };
}
