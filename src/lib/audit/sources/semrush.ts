// Semrush for "Run audit" (approved by the owner 2026-11-28, Phase B).
//
// This is the ONLY file that talks to Semrush. It may do exactly one thing: read a website's
// whole-site summary (Semrush's "domain_rank" report: ranking keywords, estimated organic
// visits and their value, US database). Semrush's Analytics API is read-only; this module also
// refuses every other report type, so nothing else in the account is ever touched. Each lookup
// costs Semrush API units (10 per website); RUN's cap is SEMRUSH_RULES.maxUnitsPerRun.
//
// The key (SEMRUSH_API_KEY) lives in the server's environment (Vercel, "Sensitive"), is only
// read here, and is never logged, returned or sent to the browser. Semrush puts the key in the
// address, so addresses are never logged either. Answers are untrusted text, read field by
// field. Only a public website address is ever sent.

const BASE = "https://api.semrush.com";
const TIMEOUT_MS = 20_000;
const MAX_BYTES = 20_000;

export const SEMRUSH_RULES = {
  /** Units one website's summary costs (Semrush price list, checked 2026-11-28). */
  unitsPerSite: 10,
  /** The most units one audit run may use. */
  maxUnitsPerRun: 200,
} as const;

/** The only report this app may ask for. */
const ALLOWED_TYPES = new Set(["domain_rank"]);

export class SemrushError extends Error {
  /** retryable: trying again later may work (their server was busy or slow). */
  constructor(message: string, readonly retryable = false) {
    super(message);
  }
}

function key(): string | null {
  const k = process.env.SEMRUSH_API_KEY?.trim();
  if (!k || k.length < 10 || k.length > 200 || /[^A-Za-z0-9]/.test(k)) return null;
  return k;
}

/** true when the Semrush key is set on the server (never says what it is). */
export function isSemrushConfigured(): boolean {
  return key() !== null;
}

const DOMAIN = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

async function call(type: string, params: Record<string, string>): Promise<string> {
  if (!ALLOWED_TYPES.has(type)) throw new SemrushError("Blocked: that Semrush report isn't on the allowed list.");
  const k = key();
  if (!k) throw new SemrushError("Semrush isn't connected yet (the key isn't set on the server).");
  const url = new URL("/", BASE);
  if (url.origin !== BASE) throw new SemrushError("Blocked: unexpected address.");
  url.searchParams.set("type", type);
  for (const [name, v] of Object.entries(params)) url.searchParams.set(name, v);
  url.searchParams.set("key", k);
  let res: Response;
  try {
    res = await fetch(url, { method: "GET", headers: { Accept: "text/csv" }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new SemrushError("Couldn't reach Semrush (no answer in 20 seconds).", true);
  }
  const text = await res.text();
  if (!res.ok) throw new SemrushError(res.status === 429 ? "Semrush says too many requests. Try again in a minute." : `Semrush returned an error (${res.status}).`, res.status >= 500 || res.status === 429);
  if (text.length > MAX_BYTES) throw new SemrushError("Semrush's answer was unexpectedly large; skipped.");
  return text;
}

export interface SemrushSite {
  domain: string;
  /** Keywords the whole site ranks for in Google's top 100 (US). */
  keywords: number | null;
  /** Semrush's estimate of monthly organic visits to the whole site (US, all keywords). */
  visits: number | null;
  /** Those visits priced as Google Ads clicks (US dollars). */
  valueUsd: number | null;
}

const int = (v: string | undefined): number | null => (v !== undefined && /^\d{1,12}$/.test(v.trim()) ? Number(v.trim()) : null);

/**
 * Reads Semrush's CSV answer ("Domain;Rank;Organic Keywords;Organic Traffic;Organic Cost").
 * "ERROR 50 :: NOTHING FOUND" = Semrush has no data for the site (all null, not a failure).
 */
export function readDomainRank(domain: string, text: string): SemrushSite {
  const empty = { domain, keywords: null, visits: null, valueUsd: null };
  const t = text.trim();
  if (/^ERROR 50\b/.test(t)) return empty;
  if (/^ERROR\b/.test(t)) {
    const code = Number(/^ERROR (\d+)/.exec(t)?.[1] ?? 0);
    throw new SemrushError(
      code === 120 || code === 130 || code === 131
        ? "Semrush refused the key. Check SEMRUSH_API_KEY in Vercel's settings."
        : code === 132 || code === 133 || code === 134
          ? "Semrush says the account has no API units left."
          : `Semrush couldn't do that lookup (error ${code || "unknown"}).`,
    );
  }
  const [head, row] = t.split(/\r?\n/);
  if (!head || !row) return empty;
  const cols = head.split(";").map((c) => c.trim().toLowerCase());
  const vals = row.split(";");
  const at = (name: string) => vals[cols.indexOf(name)];
  return { domain, keywords: int(at("organic keywords")), visits: int(at("organic traffic")), valueUsd: int(at("organic cost")) };
}

/** One website's whole-site summary (10 units). */
export async function domainRank(domain: string): Promise<SemrushSite> {
  const d = domain.trim().toLowerCase();
  if (!DOMAIN.test(d)) throw new SemrushError("Blocked: unexpected website.");
  const text = await call("domain_rank", { domain: d, database: "us", export_columns: "Dn,Rk,Or,Ot,Oc" });
  return readDomainRank(d, text);
}
