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
// 6. Billing (0015, owner only) uses a SEPARATE token (GHL_BILLING_READONLY_TOKEN,
//    scopes invoices.readonly + payments/transactions.readonly), and only for the two
//    billing addresses below. The main token is never used for billing, and the billing
//    token is never used for anything else. Billing keeps only amounts, dates, statuses
//    and IDs: never card details, emails, phones, addresses, notes or line items.
//
// guardrails.test.ts fails if any other file contacts GHL or makes network calls.

import { BILLING_RULES, invoiceStatus, paymentStatus, safeLabel, toCents, type BillingKind, type BillingStatus } from "@/lib/billing";

const BASE = "https://services.leadconnectorhq.com";

/** Every address this app may read, with the API version GHL expects for it. */
const ALLOWED: { pattern: RegExp; version: string; token?: "billing" }[] = [
  { pattern: /^\/locations\/[A-Za-z0-9]+$/, version: "2021-07-28" },
  { pattern: /^\/opportunities\/pipelines$/, version: "2021-07-28" },
  { pattern: /^\/opportunities\/search$/, version: "2021-07-28" },
  { pattern: /^\/calendars\/$/, version: "2021-04-15" },
  { pattern: /^\/calendars\/events$/, version: "2021-04-15" },
  // Phase 6: conversation TIMES only (scopes conversations.readonly + conversations/message.readonly).
  { pattern: /^\/conversations\/search$/, version: "2021-04-15" },
  { pattern: /^\/conversations\/[A-Za-z0-9]{6,40}\/messages$/, version: "2021-04-15" },
  // Billing (0015): the billing token only. Version to confirm on the first live read.
  { pattern: /^\/invoices\/$/, version: "2021-07-28", token: "billing" },
  { pattern: /^\/payments\/transactions$/, version: "2021-07-28", token: "billing" },
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

let warned = false;
/** Logs (this Mac only) why the settings were refused. Never logs the values. */
function refuse(reason: string): null {
  if (!warned) console.warn(`GoHighLevel settings refused: ${reason}`);
  warned = true;
  return null;
}

function settings(): { token: string; locationId: string } | null {
  return checkSettings("GHL_READONLY_TOKEN", process.env.GHL_READONLY_TOKEN?.trim());
}

/** The billing token (owner-only billing). Separate, so billing can be switched off on its own. */
function billingSettings(): { token: string; locationId: string } | null {
  const token = process.env.GHL_BILLING_READONLY_TOKEN?.trim();
  if (!token) return null; // not connected: billing simply shows "Unknown"
  return checkSettings("GHL_BILLING_READONLY_TOKEN", token);
}

function checkSettings(name: string, token: string | undefined): { token: string; locationId: string } | null {
  const locationId = process.env.GHL_LOCATION_ID?.trim();
  if (!token && !locationId) return refuse(`neither ${name} nor GHL_LOCATION_ID is set`);
  if (!token) return refuse(`${name} is missing or empty`);
  if (!locationId) return refuse("GHL_LOCATION_ID is missing or empty");
  // Private Integration tokens look like "pit-" + an ID. Anything else is refused.
  if (!/^pit-[A-Za-z0-9_-]{20,120}$/.test(token)) {
    return refuse(/^["']/.test(token) ? "the token has quote marks" : !token.startsWith("pit-") ? "the token doesn't start with pit-" : `the token isn't in the expected format (${token.length} characters)`);
  }
  if (!/^[A-Za-z0-9]{8,40}$/.test(locationId)) {
    return refuse(/^["']/.test(locationId) ? "the location ID has quote marks" : `the location ID isn't letters and numbers only (${locationId.length} characters)`);
  }
  return { token, locationId };
}

export function isGhlConfigured(): boolean {
  return settings() !== null;
}

export function isGhlBillingConfigured(): boolean {
  return billingSettings() !== null;
}

/** The single function that sends requests. GET only, allowlisted paths only. */
async function get(path: string, query: Record<string, string>): Promise<unknown> {
  const rule = ALLOWED.find((r) => r.pattern.test(path));
  if (!rule) throw new GhlError("Blocked: that GoHighLevel address isn't on the read-only list.", 0);
  // Each address uses exactly one token: billing addresses the billing token, the rest the main one.
  const s = rule.token === "billing" ? billingSettings() : settings();
  if (!s) throw new GhlError(rule.token === "billing" ? "Billing isn't connected (no billing token)." : "GoHighLevel isn't set up on this Mac.", 0);

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

// ---------------------------------------------------------------------------
// Phase 6: when clients were last called / messaged. TIMES ONLY.
// GoHighLevel also sends message text, emails and phone numbers. This code never
// reads those fields: it picks out ids, a contact name (for matching), dates,
// direction, channel and call length, and drops everything else immediately.
// ---------------------------------------------------------------------------

export interface GhlContactCandidate {
  contactId: string;
  conversationId: string;
  name: string | null;
}

export interface GhlContactActivity {
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  lastCallAt: string | null;
  lastCallSeconds: number | null;
  lastChannel: string | null;
  lastDirection: "inbound" | "outbound" | null;
  /** Our messages/calls since the client last reached out (newest first, stops at their last one). */
  unansweredOutbound: number;
}

/** Conversation search results → contact candidates. Only ids and the contact's name are kept. */
export function parseConversationCandidates(raw: unknown[]): GhlContactCandidate[] {
  const out: GhlContactCandidate[] = [];
  for (const c of raw.filter(isObj)) {
    const contactId = typeof c.contactId === "string" && /^[A-Za-z0-9]{6,40}$/.test(c.contactId) ? c.contactId : null;
    const conversationId = typeof c.id === "string" && /^[A-Za-z0-9]{6,40}$/.test(c.id) ? c.id : null;
    if (!contactId || !conversationId) continue;
    out.push({ contactId, conversationId, name: cleanText(c.contactName, 120) ?? cleanText(c.fullName, 120) });
  }
  return out;
}

const AUTOMATED = new Set(["workflow", "campaign", "bulk_actions", "bulk_action", "trigger"]);

function channelOf(m: Obj): string | null {
  const t = `${typeof m.messageType === "string" ? m.messageType : ""}`.toUpperCase();
  if (!t || t.includes("ACTIVITY")) return null; // system notes, not real contact
  if (t.includes("CALL")) return "call";
  if (t.includes("SMS")) return "text";
  if (t.includes("EMAIL")) return "email";
  if (t.includes("WHATSAPP")) return "whatsapp";
  if (t.includes("FACEBOOK") || t.includes("INSTAGRAM") || t.includes("GMB") || t.includes("LIVE_CHAT") || t.includes("WEBCHAT")) return "chat";
  return "other";
}

/** Messages → times only. Message text is never read. Automated outbound messages don't count as contact. */
export function summarizeMessages(raw: unknown[]): GhlContactActivity {
  type Meta = { at: string; dir: "inbound" | "outbound"; channel: string; callSeconds: number | null };
  const metas: Meta[] = [];
  for (const m of raw.filter(isObj)) {
    const at = cleanTime(m.dateAdded);
    const dir = m.direction === "inbound" || m.direction === "outbound" ? m.direction : null;
    const channel = channelOf(m);
    if (!at || !dir || !channel) continue;
    if (dir === "outbound" && typeof m.source === "string" && AUTOMATED.has(m.source.toLowerCase())) continue;
    const meta = isObj(m.meta) ? m.meta : {};
    const d = typeof meta.callDuration === "number" && meta.callDuration >= 0 && meta.callDuration < 86_400 ? Math.round(meta.callDuration) : null;
    metas.push({ at, dir, channel, callSeconds: channel === "call" ? d : null });
  }
  metas.sort((a, b) => b.at.localeCompare(a.at));
  const lastIn = metas.find((m) => m.dir === "inbound");
  const lastOut = metas.find((m) => m.dir === "outbound");
  const lastCall = metas.find((m) => m.channel === "call");
  let unanswered = 0;
  for (const m of metas) {
    if (m.dir === "inbound") break;
    unanswered++;
  }
  return {
    lastInboundAt: lastIn?.at ?? null,
    lastOutboundAt: lastOut?.at ?? null,
    lastCallAt: lastCall?.at ?? null,
    lastCallSeconds: lastCall?.callSeconds ?? null,
    lastChannel: metas[0]?.channel ?? null,
    lastDirection: metas[0]?.dir ?? null,
    unansweredOutbound: Math.min(unanswered, 1000),
  };
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Up to 5 contacts whose conversations match a name (for match suggestions). */
export async function searchContacts(name: string): Promise<GhlContactCandidate[]> {
  const s = settings();
  const q = cleanText(name, 60);
  if (!s || !q) return [];
  await pause(150); // stay well under GoHighLevel's request limit
  const data = await get("/conversations/search", { locationId: s.locationId, query: q, limit: "5" });
  return parseConversationCandidates(list(isObj(data) ? data.conversations : null));
}

/** Times of the latest calls/messages with one contact (up to 3 conversations x 50 messages). */
export async function readContactActivity(contactId: string): Promise<GhlContactActivity | null> {
  const s = settings();
  if (!s || !/^[A-Za-z0-9]{6,40}$/.test(contactId)) return null;
  await pause(150);
  const found = await get("/conversations/search", { locationId: s.locationId, contactId, limit: "3" });
  const convos = parseConversationCandidates(list(isObj(found) ? found.conversations : null)).filter((c) => c.contactId === contactId);
  const all: unknown[] = [];
  for (const c of convos.slice(0, 3)) {
    await pause(150);
    const page = await get(`/conversations/${c.conversationId}/messages`, { limit: "50" });
    const box = isObj(page) && isObj(page.messages) ? page.messages : null;
    all.push(...list(box ? box.messages : null));
  }
  return summarizeMessages(all);
}

// ---------------------------------------------------------------------------
// Billing (0015): invoices and payments, minimum fields only. Owner only.
// Everything else in GoHighLevel's answer (contact details, card details, items,
// notes, business details) is never read.
// ---------------------------------------------------------------------------

export interface GhlBillingRow {
  kind: BillingKind;
  providerId: string;
  contactId: string | null;
  /** Name on the invoice/payment, kept only while unmatched (cleaned; no emails or phones). */
  label: string | null;
  amountCents: number;
  amountDueCents: number | null;
  currency: string;
  status: BillingStatus;
  issuedOn: string | null;
  dueOn: string | null;
  paidOn: string | null;
  /** Payments only: the invoice it paid, when GoHighLevel says so. */
  invoiceId: string | null;
}

export interface GhlBillingRead {
  rows: GhlBillingRow[];
  invoicesRead: number;
  paymentsRead: number;
  /** Records with a status or currency Atlas doesn't recognise (skipped, never guessed). */
  unknown: number;
}

const cleanDay = (v: unknown) => cleanTime(v)?.slice(0, 10) ?? null;
const cleanContact = (v: unknown) => (typeof v === "string" && /^[A-Za-z0-9]{6,40}$/.test(v) ? v : null);
const cleanCurrency = (v: unknown) => (typeof v === "string" && /^[A-Za-z]{3}$/.test(v) ? v.toUpperCase() : null);

/** Turns raw invoices into minimal records. Exported for tests. */
export function parseInvoices(raw: unknown[], today: string): { rows: GhlBillingRow[]; unknown: number } {
  const rows: GhlBillingRow[] = [];
  let unknown = 0;
  for (const inv of raw.filter(isObj)) {
    if (inv.liveMode === false) continue; // test-mode invoices aren't real money
    const id = cleanId(inv._id);
    const total = toCents(inv.total);
    const due = inv.amountDue === undefined ? null : toCents(inv.amountDue);
    const currency = cleanCurrency(inv.currency);
    const dueOn = cleanDay(inv.dueDate);
    const status = invoiceStatus(typeof inv.status === "string" ? inv.status : null, due, dueOn, today);
    if (status === "skip") continue;
    if (!id || total === null || !currency || status === "unknown") {
      unknown += 1;
      continue;
    }
    // Only the contact's ID and name are read from the contact block; nothing else in it.
    const who = isObj(inv.contactDetails) ? inv.contactDetails : null;
    rows.push({
      kind: "invoice",
      providerId: id,
      contactId: who ? cleanContact(who.id) : null,
      label: safeLabel(who ? cleanText(who.name, 80) : null),
      amountCents: total,
      amountDueCents: status === "paid" ? 0 : due,
      currency,
      status,
      issuedOn: cleanDay(inv.issueDate),
      dueOn,
      paidOn: null,
      invoiceId: null,
    });
  }
  return { rows, unknown };
}

/** Turns raw payment transactions into minimal records. Exported for tests. */
export function parsePayments(raw: unknown[]): { rows: GhlBillingRow[]; unknown: number } {
  const rows: GhlBillingRow[] = [];
  let unknown = 0;
  for (const t of raw.filter(isObj)) {
    if (t.liveMode === false) continue;
    const id = cleanId(t._id);
    const amount = toCents(t.amount);
    const refunded = toCents(t.amountRefunded) ?? 0;
    const currency = cleanCurrency(t.currency);
    const status = paymentStatus(typeof t.status === "string" ? t.status : null, refunded);
    if (status === "skip") continue;
    if (!id || amount === null || !currency || status === "unknown") {
      unknown += 1;
      continue;
    }
    const at = cleanDay(t.createdAt);
    rows.push({
      kind: "payment",
      providerId: id,
      contactId: cleanContact(t.contactId),
      label: safeLabel(cleanText(t.contactName, 80)),
      amountCents: amount,
      amountDueCents: null,
      currency,
      status,
      issuedOn: at,
      dueOn: null,
      paidOn: status === "paid" ? (cleanDay(t.fulfilledAt) ?? at) : null,
      invoiceId: t.entityType === "invoice" ? cleanId(t.entityId) : null,
    });
  }
  return { rows, unknown };
}

const BILLING_PAGE = 100;
const BILLING_MAX_PAGES = 10;

async function readPages(path: string, query: Record<string, string>, key: "invoices" | "data"): Promise<unknown[]> {
  const all: unknown[] = [];
  for (let page = 0; page < BILLING_MAX_PAGES; page++) {
    if (page > 0) await pause(150);
    const data = await get(path, { ...query, limit: String(BILLING_PAGE), offset: String(page * BILLING_PAGE) });
    const batch = list(isObj(data) ? data[key] : null);
    all.push(...batch);
    if (batch.length < BILLING_PAGE) return all;
  }
  // A partial read would make unseen invoices look settled, so stop instead.
  throw new GhlError("Too many billing records to read in one go. Nothing was changed.", 0);
}

/** Reads invoices and recent payments (read-only). Paid dates come from the linked payment. */
export async function readBilling(today: string): Promise<GhlBillingRead> {
  const s = billingSettings();
  if (!s) throw new GhlError("Billing isn't connected (no billing token).", 0);
  const base = { altId: s.locationId, altType: "location" };
  const invoicesRaw = await readPages("/invoices/", base, "invoices");
  const start = new Date(Date.parse(`${today}T00:00:00Z`) - BILLING_RULES.paymentsLookbackDays * 86_400_000).toISOString().slice(0, 10);
  const paymentsRaw = await readPages("/payments/transactions", { ...base, startAt: start, endAt: today }, "data");
  const inv = parseInvoices(invoicesRaw, today);
  const pay = parsePayments(paymentsRaw);
  const paidOn = new Map<string, string>();
  for (const p of pay.rows) {
    if (p.status === "paid" && p.invoiceId && p.paidOn && (paidOn.get(p.invoiceId) ?? "") < p.paidOn) paidOn.set(p.invoiceId, p.paidOn);
  }
  for (const r of inv.rows) if (r.status === "paid") r.paidOn = paidOn.get(r.providerId) ?? null;
  return { rows: [...inv.rows, ...pay.rows], invoicesRead: invoicesRaw.length, paymentsRead: paymentsRaw.length, unknown: inv.unknown + pay.unknown };
}
