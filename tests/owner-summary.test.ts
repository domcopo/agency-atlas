// Owner summary (0012): the route's locks, the summary's shape, "blank is not zero",
// New York Monday weeks, and proof that no contact details or record-level data leak.
// All data here is fictional.

import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientAction, Detection, RosterClient } from "@/lib/types";

// The database read is replaced with a fake for route tests (no network).
const readOwnerSummary = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ readOwnerSummary: (key: string) => readOwnerSummary(key) }));

const KEY = "test-key-0123456789abcdef0123456789abcdef";
const FINGERPRINT = createHash("sha256").update(KEY).digest("hex");

async function call(headers: Record<string, string> = {}) {
  const { GET } = await import("@/app/api/owner-summary/route");
  return GET(new Request("https://atlas.example/api/owner-summary", { headers }));
}

describe("GET /api/owner-summary", () => {
  beforeEach(async () => {
    (await import("@/lib/owner-summary-access")).resetLimit();
    readOwnerSummary.mockReset();
    process.env.OWNER_SUMMARY_TOKEN_SHA256 = FINGERPRINT;
  });
  afterEach(() => {
    delete process.env.OWNER_SUMMARY_TOKEN_SHA256;
  });

  it("is off (404) when no fingerprint is set, without touching the database", async () => {
    delete process.env.OWNER_SUMMARY_TOKEN_SHA256;
    const r = await call({ authorization: `Bearer ${KEY}` });
    expect(r.status).toBe(404);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(readOwnerSummary).not.toHaveBeenCalled();
  });

  it("is off (404) when the fingerprint isn't a real SHA-256", async () => {
    process.env.OWNER_SUMMARY_TOKEN_SHA256 = "not-a-fingerprint";
    expect((await call({ authorization: `Bearer ${KEY}` })).status).toBe(404);
  });

  it("refuses a missing, malformed or wrong key (401) without touching the database", async () => {
    for (const headers of [{} as Record<string, string>, { authorization: KEY }, { authorization: "Bearer short" }, { authorization: `Basic ${KEY}` }, { authorization: `Bearer ${KEY}x` }, { authorization: `Bearer wrong-key-0123456789abcdef0123456789abcdef` }]) {
      const r = await call(headers);
      expect(r.status, JSON.stringify(headers)).toBe(401);
      expect(r.headers.get("cache-control")).toBe("no-store");
      expect(await r.json()).toEqual({ error: "unauthorized" });
    }
    expect(readOwnerSummary).not.toHaveBeenCalled();
  });

  it("returns the saved summary for the right key, never cached", async () => {
    readOwnerSummary.mockResolvedValue({ status: "ok", publishedAt: "2026-11-08T15:00:00Z", content: { schema: "owner-summary/v1", metrics: [] } });
    const r = await call({ authorization: `Bearer ${KEY}` });
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("content-type")).toMatch(/application\/json/);
    expect(await r.json()).toEqual({ schema: "owner-summary/v1", metrics: [] });
    expect(readOwnerSummary).toHaveBeenCalledWith(KEY);
  });

  it("passes on the database's answers: wrong fingerprint there, rate limit, nothing published, unreachable", async () => {
    readOwnerSummary.mockResolvedValueOnce(null);
    expect((await call({ authorization: `Bearer ${KEY}` })).status).toBe(401);
    readOwnerSummary.mockResolvedValueOnce({ status: "limited" });
    expect((await call({ authorization: `Bearer ${KEY}` })).status).toBe(429);
    readOwnerSummary.mockResolvedValueOnce({ status: "no_snapshot" });
    expect((await call({ authorization: `Bearer ${KEY}` })).status).toBe(503);
    readOwnerSummary.mockResolvedValueOnce("error");
    expect((await call({ authorization: `Bearer ${KEY}` })).status).toBe(503);
  });

  it("has a simple rate limit, even for wrong keys", async () => {
    const { MAX_PER_WINDOW } = await import("@/lib/owner-summary-access");
    for (let i = 0; i < MAX_PER_WINDOW; i++) expect((await call({ authorization: "Bearer wrong-key-0123456789abcdef0123456789abcdef" })).status).toBe(401);
    const r = await call({ authorization: `Bearer ${KEY}` });
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBe("600");
    expect(readOwnerSummary).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The summary itself
// ---------------------------------------------------------------------------

const NOW = new Date("2026-11-09T03:00:00Z"); // Sunday Nov 8, 10pm in New York

const client = (over: Partial<RosterClient> = {}): RosterClient => ({
  id: "pat-example",
  dbId: "00000000-0000-0000-0000-0000000000c1",
  name: "Pat Example (fictional)",
  monthlyUsd: 500,
  startDate: "2026-01-05",
  status: "active",
  listedIn: [],
  services: ["SEO"],
  lastContact: "2026-10-20",
  ...over,
});

const action = (over: Partial<ClientAction> = {}): ClientAction => ({
  id: "00000000-0000-0000-0000-00000000ac01",
  kind: "issue",
  title: "Fix the form",
  notes: null,
  priority: "normal",
  status: "open",
  dueOn: "2026-11-01",
  doneAt: null,
  createdAt: "2026-11-03T14:00:00Z",
  ownerId: "s1",
  ownerName: "Dev (test)",
  client: { slug: "pat-example", dbId: "00000000-0000-0000-0000-0000000000c1", name: "Pat Example (fictional)" },
  leadGhlId: null,
  ...over,
});

const detection = (id: string, kind: Detection["kind"]): Detection => ({ id, kind, title: "x", why: "x", closeness: 0.5, confidence: 0.5, href: "/", isSynthetic: false });

async function build(over: Partial<import("@/lib/owner-summary").OwnerSummaryInput> = {}) {
  const { buildOwnerSummary } = await import("@/lib/owner-summary");
  return buildOwnerSummary({
    now: NOW,
    clients: [
      client(),
      client({ id: "new-ads", dbId: "db2", name: "New Ads Co (fictional)", monthlyUsd: 750, startDate: "2026-11-04", services: ["Ads", "Website"] }),
      client({ id: "gone", dbId: "db3", name: "Gone Co (fictional)", monthlyUsd: 300, startDate: "2026-03-01", status: "canceled", endDate: "2026-10-28" }),
      client({ id: "paused", dbId: "db4", name: "Paused Co (fictional)", monthlyUsd: 400, startDate: "2026-02-01", status: "paused", endDate: "2026-10-01" }),
    ],
    actions: [action(), action({ id: "a2", status: "done", doneAt: "2026-11-06T16:00:00Z", createdAt: "2026-11-04T10:00:00Z" }), action({ id: "a3", kind: "work_order", status: "blocked", dueOn: null, ownerId: null, ownerName: null })],
    opportunities: [{ createdAt: "2026-11-03T15:00:00Z" }, { createdAt: "2026-11-09T02:00:00Z" }, { createdAt: "2026-10-27T12:00:00Z" }, { createdAt: null }],
    latestHealth: [{ slug: "pat-example", score: 42, level: "at_risk", day: "2026-11-08" }, { slug: "new-ads", score: 90, level: "healthy", day: "2026-11-08" }],
    trends: new Map([["pat-example", -15]]),
    detections: [detection("d_at_risk_pat-example", "problem"), detection("d_needs_attention_x", "attention"), detection("d_opp_x", "opportunity"), { ...detection("d_wo_1", "problem"), isSynthetic: true }],
    staff: [{ id: "s1", name: "Dev (test)" }],
    ai: { configured: true, tablesReady: true, blocked: false, spentUsd: 1.234, lastRuns: { briefing: { at: "2026-11-08T12:00:00Z", outcome: "ok" }, client_profile: { at: "2026-11-01T12:00:00Z", outcome: "error" } } },
    ...over,
  });
}

describe("owner summary", () => {
  it("has the agreed shape", async () => {
    const s = await build();
    expect(Object.keys(s)).toEqual(["schema", "source", "business", "generated_at", "metrics", "lists", "alerts", "bots"]);
    expect(s).toMatchObject({ schema: "owner-summary/v1", source: "agency-atlas", business: "yo-marketing-co", generated_at: NOW.toISOString() });
    for (const m of s.metrics) {
      expect(Object.keys(m).every((k) => ["key", "period", "period_start", "value", "unit", "note"].includes(k))).toBe(true);
      expect(m.value === null || typeof m.value === "number").toBe(true);
      expect(["usd", "count"]).toContain(m.unit);
      expect(m.period_start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    const weekly = ["leads", "sales_ads", "sales_seo", "sales_web", "sales_value_monthly", "sales_value_onetime", "onboarded", "clients_lost", "lost_value_monthly", "mrr", "clients_with_leads", "problems_opened", "problems_solved"];
    for (const key of weekly) expect(s.metrics.filter((m) => m.key === key && m.period === "week"), key).toHaveLength(12);
    expect(s.metrics.find((m) => m.key === "profit")).toMatchObject({ period: "month", value: null });
    expect(s.metrics.find((m) => m.key === "ai_spend")).toMatchObject({ period: "month", period_start: "2026-11-01", value: 1.23 });
    for (const l of s.lists) for (const item of l.items) expect(Object.keys(item).sort()).toEqual(["detail", "name"]);
    for (const a of s.alerts) expect(["info", "watch", "urgent"]).toContain(a.severity);
    expect(s.bots.map((b) => b.name)).toEqual(["Ops Briefing", "Client Profile", "Work Order Drafts"]);
    expect(s.bots[0]).toEqual({ name: "Ops Briefing", status: "active", last_run_at: "2026-11-08T12:00:00Z", last_result: "ok" });
    expect(s.bots[1]?.last_result).toBe("error");
    expect(s.bots[2]).toMatchObject({ last_run_at: null, last_result: "unknown" });
  });

  it("uses New York Monday weeks: 12 of them, oldest first, current week last", async () => {
    const { lastWeeks, nyDate, mondayOf } = await import("@/lib/owner-summary");
    expect(nyDate(NOW)).toBe("2026-11-08"); // still Sunday in New York
    expect(mondayOf("2026-11-08")).toBe("2026-11-02");
    expect(mondayOf("2026-11-09")).toBe("2026-11-09");
    const w = lastWeeks(NOW);
    expect(w).toHaveLength(12);
    expect(w[11]).toEqual({ start: "2026-11-02", end: "2026-11-08", current: true });
    expect(w[0]?.start).toBe("2026-08-17");
    expect(w.every((x) => new Date(`${x.start}T00:00:00Z`).getUTCDay() === 1)).toBe(true);
  });

  it("counts each week from the records", async () => {
    const s = await build();
    const v = (key: string, start = "2026-11-02") => s.metrics.find((m) => m.key === key && m.period_start === start)?.value;
    expect(v("leads")).toBe(2); // Nov 3, plus Nov 8 at 9pm New York (Nov 9 in UTC)
    expect(v("leads", "2026-10-26")).toBe(1);
    expect([v("onboarded"), v("sales_ads"), v("sales_web"), v("sales_seo"), v("sales_value_monthly")]).toEqual([1, 1, 1, 0, 750]);
    expect([v("clients_lost", "2026-10-26"), v("lost_value_monthly", "2026-10-26")]).toEqual([1, 300]);
    expect(v("mrr")).toBe(1250); // two active clients
    expect(v("mrr", "2026-10-26")).toBe(500); // the canceled client ended Oct 28, so not active at that week's end
    expect(v("mrr", "2026-09-28")).toBe(800); // the paused client stopped Oct 1, inside that week
    expect(v("mrr", "2026-09-21")).toBe(1200); // all three were active then
    expect([v("problems_opened"), v("problems_solved")]).toEqual([2, 1]);
  });

  it("blank is not zero: unknown or untracked values are null, never 0", async () => {
    const s = await build({ opportunities: null, actions: null, latestHealth: null, ai: { configured: false, tablesReady: false, blocked: false, spentUsd: 0, lastRuns: {} } });
    const all = (key: string) => s.metrics.filter((m) => m.key === key).map((m) => m.value);
    for (const key of ["leads", "problems_opened", "problems_solved", "clients_with_leads", "sales_value_onetime", "profit", "ai_spend"]) expect(new Set(all(key)), key).toEqual(new Set([null]));
    expect(s.lists.find((l) => l.key === "at_risk_clients")).toMatchObject({ items: [], note: "daily health scores not set up yet" });
    expect(s.bots.every((b) => b.status === "off")).toBe(true);
    // Issues weren't tracked before the first saved item: those weeks are null, later ones are counts.
    const tracked = await build();
    const opened = tracked.metrics.filter((m) => m.key === "problems_opened");
    expect(opened.slice(0, 11).every((m) => m.value === null)).toBe(true);
    expect(opened[11]?.value).toBe(2);
  });

  it("lists: at-risk with numbers only, win-back, and counts by person", async () => {
    const s = await build();
    expect(s.lists.find((l) => l.key === "at_risk_clients")?.items).toEqual([{ name: "Pat Example (fictional)", detail: "health 42 (-15 this week), no contact 19 days, $500/mo" }]);
    expect(s.lists.find((l) => l.key === "win_back")?.items).toEqual([{ name: "Paused Co (fictional)", detail: "$400/mo plan, paused since 2026-10-01" }]);
    expect(s.lists.find((l) => l.key === "overdue_or_blocked_by_owner")?.items).toEqual([
      { name: "Dev (test)", detail: "1 overdue, 0 blocked" },
      { name: "No owner", detail: "0 overdue, 1 blocked" },
    ]);
    expect(s.alerts).toEqual([
      { severity: "urgent", title: "Clients at risk", count: 1 },
      { severity: "watch", title: "Clients needing attention", count: 1 },
      { severity: "info", title: "Upsell or referral ideas", count: 1 },
    ]);
  });

  it("never leaks contact details, notes, titles or record ids, even when the records contain them", async () => {
    const dirty = "Call Pat at 555-010-1234 or pat@example.com, 12 Main Street";
    const s = await build({
      clients: [
        client({ followUp: dirty, check: dirty, lastContact: "2026-11-01", ghl: { lastInboundAt: "2026-11-05T12:00:00Z", lastOutboundAt: "2026-11-01T12:00:00Z", lastCallAt: null, lastCallSeconds: null, lastChannel: "text", lastDirection: "inbound", unansweredOutbound: 0 } as unknown as RosterClient["ghl"] }),
        client({ id: "paused", dbId: "db4", name: "Paused Co (fictional)", status: "paused", endDate: "2026-10-01" }),
      ],
      actions: [action({ title: dirty, notes: dirty, steps: dirty, sourceNote: dirty, sourceLink: "https://example.com/c/1", blockedReason: dirty, reviewNote: dirty, status: "blocked" })],
      detections: [{ ...detection("d_at_risk_pat-example", "problem"), title: dirty, why: dirty }],
    });
    const { findLeaks } = await import("@/lib/owner-summary");
    const text = JSON.stringify(s);
    expect(findLeaks(s)).toEqual([]);
    expect(text).not.toMatch(/@/);
    expect(text).not.toMatch(/555/);
    expect(text).not.toMatch(/Main Street/);
    expect(text).not.toContain("example.com");
    expect(text).not.toContain("Call Pat");
    // No record-level data: no database ids, no client slugs, no item titles.
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
    expect(text).not.toMatch(/"pat-example"|"paused"[^,]*slug|d_at_risk/);
    expect(s.lists.find((l) => l.key === "at_risk_clients")?.items[0]?.detail).toBe("health 42 (-15 this week), no contact 7 days, waiting 3 days for our reply, $500/mo");
  });

  it("the leak scan catches emails, phone numbers and street addresses", async () => {
    const { findLeaks } = await import("@/lib/owner-summary");
    expect(findLeaks({ a: "pat@example.com" })).toEqual(["email address"]);
    expect(findLeaks({ a: "(555) 010-1234" })).toEqual(["phone number"]);
    expect(findLeaks({ a: "555.010.1234" })).toEqual(["phone number"]);
    expect(findLeaks({ a: "+1 555 0101" })).toEqual(["phone number"]);
    expect(findLeaks({ a: "12 Main Street" })).toEqual(["street address"]);
    expect(findLeaks({ a: "450 Oak Ave" })).toEqual(["street address"]);
    // Normal summary values are fine.
    expect(findLeaks({ t: "2026-11-08T15:04:05.123Z", v: 1234567, d: "health 42, no contact 19 days, $1,500/mo", n: "Gone Co (fictional)" })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Billing (0015) in the summary: owner-only totals, blank is not zero, unmatched never named.
// ---------------------------------------------------------------------------

describe("owner summary: billing (0015)", () => {
  const AS_OF = "2026-11-08T20:00:00Z";
  const rec = (over: Partial<import("@/lib/billing").BillingRecord>): import("@/lib/billing").BillingRecord => ({
    kind: "payment",
    providerId: `p${Math.random()}`,
    contactId: "ct1",
    clientDbId: "00000000-0000-0000-0000-0000000000c1",
    unmatchedLabel: null,
    amountCents: 0,
    amountDueCents: null,
    currency: "USD",
    status: "paid",
    issuedOn: null,
    dueOn: null,
    paidOn: null,
    syncedAt: AS_OF,
    ...over,
  });
  const records = [
    rec({ amountCents: 30_000, paidOn: "2026-11-03", issuedOn: "2026-11-03" }),
    rec({ amountCents: 20_000, paidOn: "2026-10-28", issuedOn: "2026-10-28" }),
    rec({ amountCents: 10_000, paidOn: "2026-11-01", issuedOn: "2026-11-01" }),
    rec({ amountCents: 99_900, paidOn: "2026-11-05", syncedAt: "2026-11-01T10:00:00Z" }), // gone from GoHighLevel: ignored
    rec({ kind: "invoice", clientDbId: "db2", contactId: "ct2", status: "overdue", amountCents: 120_000, amountDueCents: 120_000, dueOn: "2026-10-21" }),
    rec({ kind: "invoice", clientDbId: "db4", contactId: "ct4", status: "open", amountCents: 40_000, amountDueCents: 40_000, dueOn: "2026-11-20" }),
    rec({ kind: "invoice", clientDbId: null, contactId: "ct9", unmatchedLabel: "Someone Private (fictional)", status: "overdue", amountCents: 25_000, amountDueCents: 25_000, dueOn: "2026-09-30" }),
    rec({ status: "failed", amountCents: 50_000, issuedOn: "2026-11-05" }),
    rec({ clientDbId: null, contactId: "ct8", unmatchedLabel: "Another Person (fictional)", status: "failed", amountCents: 9_900, issuedOn: "2026-11-06" }),
  ];
  const known = { state: { known: true as const, asOf: AS_OF }, records };
  const metric = (s: import("@/lib/owner-summary").OwnerSummary, key: string, start?: string) => s.metrics.find((m) => m.key === key && (!start || m.period_start === start));

  it("adds collected per week and this month, plus open, overdue and failed totals", async () => {
    const s = await build({ billing: known });
    expect(s.metrics.filter((m) => m.key === "collected_revenue" && m.period === "week")).toHaveLength(12);
    expect(metric(s, "collected_revenue", "2026-11-02")?.value).toBe(300);
    expect(metric(s, "collected_revenue", "2026-10-26")?.value).toBe(300); // Oct 28 + Nov 1 (Sunday)
    expect(metric(s, "collected_revenue", "2026-08-17")?.value).toBe(0); // known, nothing paid that week
    expect(s.metrics.find((m) => m.key === "collected_revenue" && m.period === "month")).toMatchObject({ period_start: "2026-11-01", value: 400, unit: "usd" });
    expect(metric(s, "open_invoices_usd")).toMatchObject({ period: "month", value: 1850, unit: "usd" });
    expect(metric(s, "overdue_invoices_usd")?.value).toBe(1450);
    expect(metric(s, "overdue_invoices_count")).toMatchObject({ value: 2, unit: "count" });
    expect(metric(s, "failed_payments_count")).toMatchObject({ value: 2, unit: "count" });
  });

  it("lists overdue clients by name; unmatched invoices are counted, never named", async () => {
    const s = await build({ billing: known });
    expect(s.lists.find((l) => l.key === "overdue_clients")?.items).toEqual([
      { name: "New Ads Co (fictional)", detail: "1 invoice, $1,200, 18 days late" },
      { name: "Unmatched (1)", detail: "1 invoice, $250, 39 days late, not matched to a client yet" },
    ]);
    // Urgent: a matched client's failed payment, the unmatched invoice over 30 days late, the unmatched failed payment.
    expect(s.alerts).toContainEqual({ severity: "urgent", title: "Payments need attention", count: 3 });
    const text = JSON.stringify(s);
    expect(text).not.toContain("Someone Private");
    expect(text).not.toContain("Another Person");
    expect(text).not.toMatch(/ct[0-9]/); // no GoHighLevel contact ids
    const { findLeaks } = await import("@/lib/owner-summary");
    expect(findLeaks(s)).toEqual([]);
  });

  it("blank is not zero: not set up, not connected, failed or stale billing gives null everywhere", async () => {
    const keys = ["collected_revenue", "open_invoices_usd", "overdue_invoices_usd", "overdue_invoices_count", "failed_payments_count"];
    const cases = [
      { billing: undefined, note: "billing not set up" },
      { billing: null, note: "billing not set up" },
      { billing: { state: { known: false as const, reason: "not_connected" as const, asOf: null }, records }, note: "isn't connected" },
      { billing: { state: { known: false as const, reason: "last_failed" as const, asOf: AS_OF }, records }, note: "last refresh failed" },
      { billing: { state: { known: false as const, reason: "stale" as const, asOf: AS_OF }, records }, note: "Not refreshed" },
    ];
    for (const c of cases) {
      const s = await build({ billing: c.billing });
      for (const key of keys) {
        const ms = s.metrics.filter((m) => m.key === key);
        expect(ms.length, key).toBeGreaterThan(0);
        expect(new Set(ms.map((m) => m.value)), `${key} ${c.note}`).toEqual(new Set([null]));
        expect(ms.every((m) => m.note?.includes(c.note)), `${key} note`).toBe(true);
      }
      const list = s.lists.find((l) => l.key === "overdue_clients");
      expect(list?.items).toEqual([]);
      expect(list?.note).toContain(c.note);
      expect(s.alerts.find((a) => a.title === "Payments need attention")).toBeUndefined();
    }
  });

  it("a failed payment followed by a successful one is no longer urgent", async () => {
    const s = await build({
      billing: { state: { known: true, asOf: AS_OF }, records: [rec({ status: "failed", amountCents: 50_000, issuedOn: "2026-11-02" }), rec({ amountCents: 50_000, paidOn: "2026-11-04", issuedOn: "2026-11-04" })] },
    });
    expect(metric(s, "failed_payments_count")?.value).toBe(1); // still counted this month
    expect(s.alerts.find((a) => a.title === "Payments need attention")).toBeUndefined();
  });
});
