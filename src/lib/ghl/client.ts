// THE ONLY code in this app that talks to GoHighLevel (GHL). Read-only by design:
//
// 1. Every request is a GET. There is no way to pass another method.
// 2. Only addresses on the short ALLOWED list below can be requested; anything else
//    throws before a request is made.
// 3. The token is a Private Integration token you create in ONE sub-account with
//    only ".readonly" scopes, so GHL itself would refuse a change even if this
//    code were wrong.
// 4. Server only: the settings have no NEXT_PUBLIC_ prefix and this file is only
//    imported by server code. The token is never logged or returned.
// 5. Everything GHL returns is untrusted data: it's checked, trimmed, and treated
//    as plain text. It can never control what the app does.
//
// guardrails.test.ts fails if any other file contacts GHL or makes network calls.

const BASE = "https://services.leadconnectorhq.com";

/** Every address this app may read, with the API version GHL expects for it. */
const ALLOWED: { pattern: RegExp; version: string }[] = [
  { pattern: /^\/locations\/[A-Za-z0-9]+$/, version: "2021-07-28" },
  { pattern: /^\/opportunities\/pipelines$/, version: "2021-07-28" },
  { pattern: /^\/opportunities\/search$/, version: "2021-07-28" },
  { pattern: /^\/calendars\/$/, version: "2021-04-15" },
  { pattern: /^\/calendars\/events$/, version: "2021-04-15" },
];

const MAX_PAGES = 20; // 20 x 100 = 2,000 opportunities, plenty for one agency pipeline
const TIMEOUT_MS = 15_000;

export class GhlError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function settings(): { token: string; locationId: string } | null {
  const token = process.env.GHL_READONLY_TOKEN?.trim();
  const locationId = process.env.GHL_LOCATION_ID?.trim();
  if (!token || !locationId) return null;
  // Private Integration tokens look like "pit-" + an ID. Anything else is refused.
  if (!/^pit-[0-9a-f-]{20,60}$/i.test(token)) return null;
  if (!/^[A-Za-z0-9]{8,40}$/.test(locationId)) return null;
  return { token, locationId };
}

export function isGhlConfigured(): boolean {
  return settings() !== null;
}

/** The single function that sends requests. GET only, allowlisted paths only. */
async function get(path: string, query: Record<string, string>): Promise<unknown> {
  const s = settings();
  if (!s) throw new GhlError("GoHighLevel isn't set up on this Mac.", 0);
  const rule = ALLOWED.find((r) => r.pattern.test(path));
  if (!rule) throw new GhlError("Blocked: that GoHighLevel address isn't on the read-only list.", 0);

  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  if (url.origin !== BASE) throw new GhlError("Blocked: unexpected address.", 0);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${s.token}`, Version: rule.version, Accept: "application/json" },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new GhlError("Couldn't reach GoHighLevel. Check the internet connection and try again.", 0);
  }
  if (!res.ok) {
    const hint =
      res.status === 401
        ? "the token was refused. Check it in .env.local."
        : res.status === 403
          ? "the token is missing a read-only permission (scope)."
          : res.status === 429
            ? "too many requests. Wait a minute."
            : "GoHighLevel returned an error.";
    throw new GhlError(`GoHighLevel said no (${res.status}): ${hint}`, res.status);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Small checks for untrusted data
// ---------------------------------------------------------------------------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const list = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObj) : []);

/** Plain text, control characters removed, capped. Null when empty or not a string. */
export function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
  return t || null;
}

function cleanId(v: unknown): string | null {
  return typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null;
}

/** ISO timestamp, or null. Accepts ISO strings and epoch milliseconds. */
export function cleanTime(v: unknown): string | null {
  const d = typeof v === "number" || typeof v === "string" ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) && d.getFullYear() >= 2000 && d.getFullYear() <= 2100 ? d.toISOString() : null;
}

// ---------------------------------------------------------------------------
// The reads
// ---------------------------------------------------------------------------

export interface GhlOpportunity {
  ghlId: string;
  name: string | null;
  pipelineName: string | null;
  stageName: string | null;
  status: "open" | "won" | "lost" | "abandoned";
  monetaryValue: number | null;
  source: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  statusChangedAt: string | null;
}

export interface GhlAppointment {
  ghlId: string;
  calendarName: string | null;
  status: string | null;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string | null;
}

const STATUSES = ["open", "won", "lost", "abandoned"] as const;

export async function readLocationName(): Promise<string | null> {
  const s = settings();
  if (!s) return null;
  const data = await get(`/locations/${s.locationId}`, {});
  return isObj(data) && isObj(data.location) ? cleanText(data.location.name, 100) : null;
}

/** Turns raw opportunity results into checked records. Exported for tests. */
export function parseOpportunities(raw: unknown[], pipelines: Map<string, { name: string | null; stages: Map<string, string | null> }>): GhlOpportunity[] {
  const out: GhlOpportunity[] = [];
  for (const o of raw.filter(isObj)) {
    const ghlId = cleanId(o.id);
    const status = STATUSES.find((s) => s === o.status);
    if (!ghlId || !status) continue; // skip anything that doesn't look right
    const pipeline = typeof o.pipelineId === "string" ? pipelines.get(o.pipelineId) : undefined;
    const value = typeof o.monetaryValue === "number" && Number.isFinite(o.monetaryValue) && o.monetaryValue >= 0 && o.monetaryValue < 1e9 ? Math.round(o.monetaryValue * 100) / 100 : null;
    out.push({
      ghlId,
      name: cleanText(o.name, 200),
      pipelineName: pipeline?.name ?? null,
      stageName: (typeof o.pipelineStageId === "string" ? pipeline?.stages.get(o.pipelineStageId) : null) ?? null,
      status,
      monetaryValue: value,
      source: cleanText(o.source, 100),
      createdAt: cleanTime(o.createdAt),
      updatedAt: cleanTime(o.updatedAt),
      statusChangedAt: cleanTime(o.lastStatusChangeAt),
    });
  }
  return out;
}

export async function readOpportunities(): Promise<GhlOpportunity[]> {
  const s = settings();
  if (!s) return [];

  const p = await get("/opportunities/pipelines", { locationId: s.locationId });
  const pipelines = new Map<string, { name: string | null; stages: Map<string, string | null> }>();
  for (const pl of list(isObj(p) ? p.pipelines : null)) {
    const id = cleanId(pl.id);
    if (!id) continue;
    const stages = new Map<string, string | null>();
    for (const st of list(pl.stages)) {
      const sid = cleanId(st.id);
      if (sid) stages.set(sid, cleanText(st.name, 100));
    }
    pipelines.set(id, { name: cleanText(pl.name, 100), stages });
  }

  const raw: unknown[] = [];
  let cursor: { startAfter: string; startAfterId: string } | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const query: Record<string, string> = { location_id: s.locationId, status: "all", limit: "100" };
    if (cursor) Object.assign(query, cursor);
    const data = await get("/opportunities/search", query);
    const batch = list(isObj(data) ? data.opportunities : null);
    raw.push(...batch);
    const meta = isObj(data) && isObj(data.meta) ? data.meta : null;
    const nextAfter = meta && (typeof meta.startAfter === "number" || typeof meta.startAfter === "string") ? String(meta.startAfter) : null;
    const nextId = meta ? cleanId(meta.startAfterId) : null;
    if (batch.length < 100 || !nextAfter || !nextId) break;
    cursor = { startAfter: nextAfter, startAfterId: nextId };
  }
  return parseOpportunities(raw, pipelines);
}

/** Turns raw calendar events into checked records. Exported for tests. */
export function parseAppointments(raw: unknown[], calendarName: string | null): GhlAppointment[] {
  const out: GhlAppointment[] = [];
  for (const e of raw.filter(isObj)) {
    const ghlId = cleanId(e.id);
    if (!ghlId) continue;
    out.push({
      ghlId,
      calendarName,
      status: cleanText(e.appointmentStatus, 20),
      startsAt: cleanTime(e.startTime),
      endsAt: cleanTime(e.endTime),
      createdAt: cleanTime(e.dateAdded),
    });
  }
  return out;
}

/** Appointments from 30 days ago to 30 days ahead, across the sub-account's calendars. */
export async function readAppointments(now = new Date()): Promise<GhlAppointment[]> {
  const s = settings();
  if (!s) return [];
  const data = await get("/calendars/", { locationId: s.locationId });
  const calendars = list(isObj(data) ? data.calendars : null).slice(0, 25);
  const day = 24 * 60 * 60 * 1000;
  const startTime = String(now.getTime() - 30 * day);
  const endTime = String(now.getTime() + 30 * day);
  const out: GhlAppointment[] = [];
  for (const c of calendars) {
    const calendarId = cleanId(c.id);
    if (!calendarId) continue;
    const ev = await get("/calendars/events", { locationId: s.locationId, calendarId, startTime, endTime });
    out.push(...parseAppointments(list(isObj(ev) ? ev.events : null), cleanText(c.name, 100)));
  }
  return out;
}
