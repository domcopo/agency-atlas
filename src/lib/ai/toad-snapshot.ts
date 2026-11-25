// BizToad (0030, docs/BIZTOAD_PLAN.md section 10): what the AI is given for one question,
// and how its answer is checked. Pure functions: no network, no database, no billing.
// Tested in tests/toad.test.ts.
//
// The facts come in already coded (clients C7, team T2) and already limited to what the
// asker's login can read (the database decides that). This module adds three more locks:
// money fields are removed, emails/phone numbers in free text are blanked, and the whole
// thing is trimmed to a size limit.

import { contactSummary, type ClientContactDates } from "@/lib/ops";
import { isHot, lastTouchByLead, nyDay, targetProgress, touchesOn, type LeadFollowUp, type LeadTouch, type SalesLead, type SalesPipeline } from "@/lib/sales";
import type { MemberRole } from "@/lib/roles";
import { isOpenProspect, type Prospect, type ScoutVisit } from "@/lib/scout";
import type { ClientAction } from "@/lib/types";
import { redact, redactStaff, restoreWithStaff, type Codebook, type StaffBook } from "./snapshot";

export const TOAD_LIMITS = {
  questionChars: 1000,
  /** Earlier back-and-forths sent along (each one = a question + an answer). */
  historyTurns: 6,
  historyChars: 1500,
  /** About 15,000 tokens of facts. */
  factsChars: 45_000,
  maxOutputTokens: 1200,
  /** Owner/managers: room for one work order draft too. */
  draftOutputTokens: 1800,
} as const;

export type ToadScreen = { label: string; path: string };

/** Screens each kind of login can open, for "where do I…?" answers and links. No billing. */
export const TOAD_SCREENS: Record<"full" | "sales" | "developer", ToadScreen[]> = {
  full: [
    { label: "Home (today's briefing)", path: "/" },
    { label: "Clients", path: "/clients" },
    { label: "Work orders", path: "/work/orders" },
    { label: "Work", path: "/work" },
    { label: "Sales", path: "/sales" },
    { label: "Scout (prospects)", path: "/sales/scout" },
    { label: "Audits", path: "/audits" },
    { label: "Growth", path: "/growth" },
    { label: "Kit (docs and tools)", path: "/kit" },
    { label: "Notifications", path: "/notifications" },
    { label: "Data Safety (AI budget)", path: "/safety" },
    { label: "Account (password, BizToad)", path: "/account" },
  ],
  sales: [
    { label: "Home", path: "/" },
    { label: "Sales", path: "/sales" },
    { label: "Scout (prospects)", path: "/sales/scout" },
    { label: "Audits", path: "/audits" },
    { label: "Kit (docs and tools)", path: "/kit" },
    { label: "Account (password, BizToad)", path: "/account" },
  ],
  developer: [
    { label: "Home", path: "/" },
    { label: "Your work", path: "/work" },
    { label: "Kit (docs and tools)", path: "/kit" },
    { label: "Account (password, BizToad)", path: "/account" },
  ],
};

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;

// Dollar amounts typed into notes, reasons or titles ("$750/mo", "$1.2K", "USD 300").
// Also bare "750/mo" or "1.2K per month" with no dollar sign.
const DOLLARS =
  /(?:\$|\bUSD\s?)\s?\d[\d,]*(?:\.\d+)?\s?(?:[kKmM]\b)?(?:\s?(?:\/\s?(?:mo|month|yr|year)\b|(?:a|per)\s(?:month|year)))?|\b\d[\d,]*(?:\.\d+)?\s?[kK]?\s?(?:\/\s?(?:mo|month)\b|per\smonth\b)/g;

/** Emails and phone numbers in free text are blanked before anything is sent. */
export function scrubContacts(text: string): string {
  return text.replace(EMAIL, "[email removed]").replace(PHONE, "[phone removed]");
}

/** Dollar amounts in free text are blanked too: BizToad never sees or repeats money. */
export function scrubMoney(text: string): string {
  return text.replace(DOLLARS, "[amount removed]");
}

/** The asker's question: hidden characters out, length capped, names → codes, contacts blanked. */
export function cleanQuestion(raw: unknown, book: Codebook, staff: StaffBook, extra: NameBook[] = []): string {
  const t = typeof raw === "string" ? raw.replace(CONTROL, " ").trim().slice(0, TOAD_LIMITS.questionChars) : "";
  return scrubMoney(scrubContacts(redactAll(redactStaff(redact(t, book), staff), extra)));
}

export type ToadTurn = { q: string; a: string };

/**
 * Earlier turns come back from the browser, so they're untrusted too: same cleaning, last
 * 6 only, each side capped. (Faking them can only affect the asker's own answer.)
 */
export function cleanHistory(raw: unknown, book: Codebook, staff: StaffBook, extra: NameBook[] = []): ToadTurn[] {
  if (!Array.isArray(raw)) return [];
  const one = (v: unknown) =>
    typeof v === "string" ? scrubMoney(scrubContacts(redactAll(redactStaff(redact(v.replace(CONTROL, " ").trim().slice(0, TOAD_LIMITS.historyChars), book), staff), extra))) : "";
  return raw
    .slice(-TOAD_LIMITS.historyTurns)
    .map((t) => (typeof t === "object" && t !== null ? { q: one((t as ToadTurn).q), a: one((t as ToadTurn).a) } : { q: "", a: "" }))
    .filter((t) => t.q);
}

/** Key names that could carry money. Removed at any depth, whatever fed the facts. */
export const MONEY_KEY = /usd|amount|price|revenue|invoice|payment|monetary|billing|money|dollar|mrr/i;

/** A copy with every money-looking field removed and every string scrubbed of contacts. */
export function stripMoney(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripMoney);
  if (typeof value === "string") return scrubMoney(scrubContacts(value));
  if (typeof value !== "object" || value === null) return value;
  const out: Record<string, unknown> = {};
  // { count, value } pairs (deals, stages) carry a money total in "value".
  const counted = "count" in value;
  for (const [k, v] of Object.entries(value)) {
    if (MONEY_KEY.test(k) || (counted && k === "value")) continue;
    out[k] = stripMoney(v);
  }
  return out;
}

type Counted = { count: number; value?: number };

/** The sales pipeline as COUNTS only (deal values are money and stay out). */
export function pipelineCounts(p: {
  synced_at: string;
  open_deals: Counted;
  by_stage: { stage: string; count: number }[];
  new_this_month: number;
  won_this_month: Counted;
  lost_this_month: number;
  appointments_next_7_days: number;
  showed_last_30_days: number;
  no_shows_last_30_days: number;
} | null) {
  if (!p) return null;
  return {
    synced_at: p.synced_at,
    open_deals: p.open_deals.count,
    deals_by_stage: p.by_stage.map((b) => ({ stage: b.stage, deals: b.count })),
    new_this_month: p.new_this_month,
    won_this_month: p.won_this_month.count,
    lost_this_month: p.lost_this_month,
    appointments_next_7_days: p.appointments_next_7_days,
    showed_last_30_days: p.showed_last_30_days,
    no_shows_last_30_days: p.no_shows_last_30_days,
  };
}

export interface ToadFactsInput {
  today: string;
  askerRole: string;
  /** The asker's own team code, if they're on the team list (so "my work" works). */
  askerCode: string | null;
  screens: ToadScreen[];
  clients: Record<string, unknown>[];
  workOrders: Record<string, unknown>[];
  team: Record<string, unknown>[];
  rankedPlan: Record<string, unknown>[];
  riskAlerts: Record<string, unknown>[];
  pipeline: Record<string, unknown> | null;
}

const size = (v: unknown) => JSON.stringify(v).length;

/**
 * The facts for one question, money-free and within the size limit. Trimming drops the
 * least useful detail first: contact notes, then per-client item lists, then the tail of
 * the work order and client lists (callers pass both most-urgent first).
 */
export function buildToadFacts(input: ToadFactsInput, maxChars: number = TOAD_LIMITS.factsChars) {
  const facts = stripMoney({
    today: input.today,
    asker_role: input.askerRole,
    asker_code: input.askerCode,
    screens: input.screens,
    clients: input.clients,
    open_work_orders: input.workOrders.slice(0, 60),
    team_load: input.team,
    ranked_plan: input.rankedPlan.slice(0, 12),
    risk_alerts: input.riskAlerts.slice(0, 8),
    sales_pipeline: input.pipeline,
  }) as {
    clients: Record<string, unknown>[];
    open_work_orders: unknown[];
    ranked_plan: unknown[];
    [k: string]: unknown;
  };

  const steps: (() => boolean)[] = [
    () => dropKey(facts.clients, "recent_contact_notes"),
    () => dropKey(facts.clients, "open_items"),
    () => dropKey(facts.clients, "owner_note"),
    () => halve(facts, "open_work_orders", 10),
    () => halve(facts, "clients", 10),
    () => halve(facts, "ranked_plan", 3),
    () => halve(facts, "open_work_orders", 0),
    () => halve(facts, "clients", 0),
  ];
  for (const step of steps) {
    if (size(facts) <= maxChars) break;
    step();
  }
  return facts;
}

function dropKey(list: Record<string, unknown>[], key: string): boolean {
  let changed = false;
  for (const o of list) {
    if (key in o) {
      delete o[key];
      changed = true;
    }
  }
  return changed;
}

function halve(obj: Record<string, unknown>, key: string, floor: number): boolean {
  const list = obj[key];
  if (!Array.isArray(list) || list.length <= floor) return false;
  obj[key] = list.slice(0, Math.max(floor, Math.floor(list.length / 2)));
  return true;
}

export interface ToadAnswer {
  answer: string;
  points: { text: string; source: string }[];
  unknowns: string[];
  links: ToadScreen[];
}

/** Links survive only if they're exactly one of this person's screens (never an outside site). */
export function safeToadLinks(raw: unknown, screens: ToadScreen[]): ToadScreen[] {
  if (!Array.isArray(raw)) return [];
  const out: ToadScreen[] = [];
  for (const l of raw.slice(0, 3)) {
    const path = typeof l === "object" && l !== null && typeof (l as ToadScreen).path === "string" ? (l as ToadScreen).path.trim() : "";
    const hit = screens.find((s) => s.path === path);
    if (hit && !out.some((o) => o.path === hit.path)) out.push(hit);
  }
  return out;
}

/** The AI's answer → plain, length-limited text with names swapped back in. */
export function restoreToadAnswer(raw: unknown, book: Codebook, staff: StaffBook, screens: ToadScreen[], extra: NameBook[] = []): ToadAnswer {
  const r = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  // Second lock: any amount that still slipped in is blanked on the way out, too.
  const t = (v: unknown, max: number) =>
    scrubMoney(restoreAll(restoreWithStaff(typeof v === "string" ? v.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim().slice(0, max) : "", book, staff), extra));
  const list = (v: unknown, n: number) => (Array.isArray(v) ? v.slice(0, n) : []);
  return {
    answer: t(r.answer, 1200) || "Sorry, I couldn't put an answer together. Try asking another way.",
    points: list(r.points, 5)
      .map((p) => {
        const o = typeof p === "object" && p !== null ? (p as Record<string, unknown>) : {};
        return { text: t(o.text, 300), source: t(o.source, 60) };
      })
      .filter((p) => p.text),
    unknowns: list(r.unknowns, 3).map((u) => t(u, 200)).filter(Boolean),
    links: safeToadLinks(r.links, screens),
  };
}

// ---------------------------------------------------------------------------
// Phase 3 (docs/BIZTOAD_PLAN.md section 12): developers and salespeople ask too.
// Each role gets its own fact builder. Each one copies ONLY the fields listed here (never a
// whole record), and everything still goes through stripMoney and the size limit.
// ---------------------------------------------------------------------------

export type ToadMode = "full" | "developer" | "sales";

/** Which facts a role gets. Always called with the role read from the database. */
export function toadModeFor(role: MemberRole): ToadMode {
  return role === "owner" || role === "manager" ? "full" : role;
}

/** Other names that get codes like clients do: sales leads (L3) and Scout prospects (P5). */
export interface NameBook {
  prefix: "L" | "P";
  codeOf: Map<string, string>; // id -> "L3"
  nameOf: Map<string, string>; // "L3" -> name
}

export function buildNameBook(prefix: NameBook["prefix"], items: { id: string; name: string }[]): NameBook {
  const codeOf = new Map<string, string>();
  const nameOf = new Map<string, string>();
  for (const it of items) {
    if (codeOf.has(it.id)) continue;
    const code = `${prefix}${codeOf.size + 1}`;
    codeOf.set(it.id, code);
    nameOf.set(code, it.name);
  }
  return { prefix, codeOf, nameOf };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Full names (3+ letters) in free text → their codes, longest first. */
export function redactNames(text: string, nb: NameBook): string {
  let out = text;
  const names = [...nb.nameOf.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [code, name] of names) {
    if (name.trim().length < 3) continue;
    out = out.replace(new RegExp(`(?<![A-Za-z0-9])${escapeRe(name.trim())}(?![A-Za-z0-9])`, "gi"), `[${code}]`);
  }
  return out;
}

/** "[L3]" back to the lead's name. Codes that aren't in the book are left as they are. */
export function restoreNames(text: string, nb: NameBook): string {
  return text.replace(new RegExp(`\\[?\\b(${nb.prefix}\\d{1,4})\\b\\]?`, "g"), (whole, code: string) => nb.nameOf.get(code) ?? whole);
}

const redactAll = (text: string, books: NameBook[]) => books.reduce((t, b) => redactNames(t, b), text);
const restoreAll = (text: string, books: NameBook[]) => books.reduce((t, b) => restoreNames(t, b), text);

const clipText = (v: string | null | undefined, max: number) => (v ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : null);

function finish<T extends Record<string, unknown>>(raw: T, trimOrder: [key: string, floor: number][], maxChars: number): T {
  const facts = stripMoney(raw) as T;
  for (const [key, floor] of trimOrder) {
    while (size(facts) > maxChars && halve(facts, key, floor)) {
      /* keep halving this list */
    }
    if (size(facts) <= maxChars) break;
  }
  return facts;
}

// --- Developers ------------------------------------------------------------

export interface ToadDeveloperInput {
  today: string;
  askerCode: string | null;
  /** Their own list (the my_work view: the database only returns their items). */
  work: ClientAction[];
  /** Contact dates for clients they work on (the my_client_contacts view). */
  contacts: ClientContactDates[];
  book: Codebook;
  staff: StaffBook;
}

const isOpenItem = (a: ClientAction) => a.status !== "done" && !a.canceledAt && !a.archivedAt;

/**
 * A developer's facts: their own work orders and steps, due dates, review notes, and
 * contact dates for their clients. No health, no team load, no sales, no money.
 */
export function buildDeveloperToadFacts(input: ToadDeveloperInput, maxChars: number = TOAD_LIMITS.factsChars) {
  const { book, staff, today } = input;
  const text = (v: string | null | undefined, max: number) => {
    const t = clipText(v, max);
    return t ? redactStaff(redact(t, book), staff) : null;
  };
  const clientOf = (a: ClientAction) => (a.internal ? "AGENCY" : a.client ? (book.codeOf.get(a.client.slug) ?? "other") : "none");
  const open = input.work.filter(isOpenItem).sort((x, y) => (x.dueOn ?? "9999").localeCompare(y.dueOn ?? "9999"));
  const steps = (a: ClientAction) => (a.steps ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
  const weekAgo = new Date(Date.parse(`${today}T12:00:00Z`) - 14 * 86_400_000).toISOString().slice(0, 10);
  const done = input.work.filter((a) => a.status === "done" && !a.canceledAt && (a.doneAt ?? "").slice(0, 10) >= weekAgo);
  return finish(
    {
      today,
      asker_role: "developer",
      asker_code: input.askerCode,
      screens: TOAD_SCREENS.developer,
      my_open_work: open.slice(0, 60).map((a) => ({
        type: a.kind,
        title: text(a.title, 120),
        client: clientOf(a),
        priority: a.priority,
        status: a.status,
        due: a.dueOn,
        overdue: a.dueOn !== null && a.dueOn < today,
        start_on: a.startOn ?? null,
        promised_to_client_on: a.promisedOn ?? null,
        steps: steps(a).slice(0, 12).map((x, i) => ({ step: text(x, 160), done: (a.stepsDone ?? []).includes(i + 1) })),
        estimate_minutes: a.estMinutes ?? null,
        blocked_reason: text(a.blockedReason, 200),
        sent_back_times: a.sentBackCount ?? 0,
        review_note: text(a.reviewNote, 300),
      })),
      my_done_last_14_days: { count: done.length, titles: done.slice(0, 10).map((a) => text(a.title, 100)) },
      my_client_contacts: input.contacts.slice(0, 40).map((c) => {
        const s = contactSummary(c, today);
        return { client: book.codeOf.get(c.slug) ?? "other", last_contact: s.lastContact, days_since: s.daysSince, flags: s.flags.map((f) => text(f, 160)) };
      }),
    },
    [
      ["my_client_contacts", 10],
      ["my_open_work", 15],
      ["my_client_contacts", 0],
      ["my_open_work", 0],
    ],
    maxChars,
  );
}

// --- Salespeople -----------------------------------------------------------

/** A salesperson's own leads: assigned to them, or to nobody yet. Not linked to a GoHighLevel user → unassigned only. */
export function mySalesLeads(leads: SalesLead[], ghlUserId: string | null): SalesLead[] {
  return leads.filter((l) => l.status === "open" && (l.assignedUserId === null || (ghlUserId !== null && l.assignedUserId === ghlUserId)));
}

export interface ToadSalesInput {
  today: string;
  askerCode: string | null;
  me: { userId: string; ghlUserId: string | null };
  pipelines: SalesPipeline[];
  leads: SalesLead[];
  touches: LeadTouch[];
  followUps: LeadFollowUp[];
  myTarget: number;
  appointments: { startsAt: string; calendar: string | null; status: string | null }[];
  prospects: Prospect[];
  visits: ScoutVisit[];
  /** The leaderboard rows (the app keeps only counts; names and dollars never go in). */
  board: { isMe: boolean; linked: boolean; wonDeals: number }[] | null;
  leadBook: NameBook;
  prospectBook: NameBook;
}

/**
 * A salesperson's facts: their own leads and follow-ups, their reach-outs against the daily
 * target, upcoming appointments, Scout prospects they can see (theirs + the shared pool) and
 * their place on the leaderboard by DEAL COUNT. No clients, work orders, team or money.
 */
export function buildSalesToadFacts(input: ToadSalesInput, maxChars: number = TOAD_LIMITS.factsChars) {
  const { today, me, leadBook, prospectBook } = input;
  const books = [leadBook, prospectBook];
  const text = (v: string | null | undefined, max: number) => {
    const t = clipText(v, max);
    return t ? redactAll(t, books) : null;
  };
  const mine = mySalesLeads(input.leads, me.ghlUserId);
  const mineIds = new Set(mine.map((l) => l.ghlId));
  const last = lastTouchByLead(input.touches);
  const ageDays = (iso: string | null | undefined) => (iso ? Math.max(0, Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${nyDay(iso)}T12:00:00Z`)) / 86_400_000)) : null);
  const sorted = [...mine].sort(
    (a, b) => Number(isHot(b, input.pipelines)) - Number(isHot(a, input.pipelines)) || (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
  );
  const myFollowUps = input.followUps.filter((f) => mineIds.has(f.leadId) && f.status !== "done" && f.status !== "canceled");
  const reached = touchesOn(input.touches, me.userId, today);
  const progress = targetProgress(reached, input.myTarget, today);
  const pool = input.prospects
    .filter((p) => isOpenProspect(p, today) && (p.assignedTo === null || p.assignedTo === me.userId))
    .sort((a, b) => b.score - a.score);
  const weekAgo = new Date(Date.parse(`${today}T12:00:00Z`) - 7 * 86_400_000).toISOString();
  const myVisits = input.visits.filter((v) => v.by === me.userId && v.at >= weekAgo);
  const outcomes: Record<string, number> = {};
  for (const v of myVisits) outcomes[v.outcome] = (outcomes[v.outcome] ?? 0) + 1;
  let board: Record<string, unknown> | null = null;
  const meRow = input.board?.find((r) => r.isMe);
  if (input.board && meRow) {
    const linked = input.board.filter((r) => r.linked);
    board = {
      my_won_deals: meRow.wonDeals,
      my_rank_by_deals: meRow.linked ? 1 + linked.filter((r) => r.wonDeals > meRow.wonDeals).length : null,
      people_ranked: linked.length,
    };
  }

  return finish(
    {
      today,
      asker_role: "sales",
      asker_code: input.askerCode,
      screens: TOAD_SCREENS.sales,
      linked_to_gohighlevel_user: me.ghlUserId !== null,
      reach_outs_today: { done: progress.done, target: progress.target, weekday: progress.weekday, met: progress.met },
      my_open_leads: sorted.slice(0, 80).map((l) => {
        const t = last.get(l.ghlId);
        return {
          lead: leadBook.codeOf.get(l.ghlId) ?? "lead",
          pipeline: text(l.pipelineName, 60),
          stage: text(l.stage, 60),
          hot: isHot(l, input.pipelines),
          assigned_to_me: l.assignedUserId !== null,
          created: l.createdAt ? nyDay(l.createdAt) : null,
          last_reach_out: t ? { kind: t.kind, day: nyDay(t.at), by_me: t.by === me.userId } : null,
          days_since_reach_out: t ? ageDays(t.at) : null,
        };
      }),
      my_follow_ups: myFollowUps
        .sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"))
        .slice(0, 40)
        .map((f) => ({ lead: leadBook.codeOf.get(f.leadId) ?? "lead", title: text(f.title, 120), due: f.dueOn, overdue: f.dueOn !== null && f.dueOn < today, status: f.status })),
      appointments_next_7_days: input.appointments.slice(0, 20).map((a) => ({ starts_at: a.startsAt, calendar: text(a.calendar, 60), status: a.status })),
      scout_prospects: pool.slice(0, 40).map((p) => ({
        prospect: prospectBook.codeOf.get(p.id) ?? "prospect",
        kind: text(p.category, 60),
        town: text(p.town, 60),
        score: p.score,
        why: p.reasons.slice(0, 3).map((r) => text(r, 120)),
        pitch: p.angle,
        status: p.status,
        claimed_by_me: p.assignedTo === me.userId,
      })),
      my_scout_visits_last_7_days: { count: myVisits.length, by_outcome: outcomes },
      leaderboard: board,
    },
    [
      ["scout_prospects", 10],
      ["my_open_leads", 20],
      ["my_follow_ups", 10],
      ["appointments_next_7_days", 5],
      ["my_open_leads", 0],
      ["scout_prospects", 0],
      ["my_follow_ups", 0],
    ],
    maxChars,
  );
}
