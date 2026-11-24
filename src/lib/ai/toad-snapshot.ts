// BizToad (0029, docs/BIZTOAD_PLAN.md section 10): what the AI is given for one question,
// and how its answer is checked. Pure functions: no network, no database, no billing.
// Tested in tests/toad.test.ts.
//
// The facts come in already coded (clients C7, team T2) and already limited to what the
// asker's login can read (the database decides that). This module adds three more locks:
// money fields are removed, emails/phone numbers in free text are blanked, and the whole
// thing is trimmed to a size limit.

import { redact, redactStaff, restoreWithStaff, type Codebook, type StaffBook } from "./snapshot";

export const TOAD_LIMITS = {
  questionChars: 1000,
  /** Earlier back-and-forths sent along (each one = a question + an answer). */
  historyTurns: 6,
  historyChars: 1500,
  /** About 15,000 tokens of facts. */
  factsChars: 45_000,
  maxOutputTokens: 1200,
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

/** Emails and phone numbers in free text are blanked before anything is sent. */
export function scrubContacts(text: string): string {
  return text.replace(EMAIL, "[email removed]").replace(PHONE, "[phone removed]");
}

/** The asker's question: hidden characters out, length capped, names → codes, contacts blanked. */
export function cleanQuestion(raw: unknown, book: Codebook, staff: StaffBook): string {
  const t = typeof raw === "string" ? raw.replace(CONTROL, " ").trim().slice(0, TOAD_LIMITS.questionChars) : "";
  return scrubContacts(redactStaff(redact(t, book), staff));
}

export type ToadTurn = { q: string; a: string };

/**
 * Earlier turns come back from the browser, so they're untrusted too: same cleaning, last
 * 6 only, each side capped. (Faking them can only affect the asker's own answer.)
 */
export function cleanHistory(raw: unknown, book: Codebook, staff: StaffBook): ToadTurn[] {
  if (!Array.isArray(raw)) return [];
  const one = (v: unknown) =>
    typeof v === "string" ? scrubContacts(redactStaff(redact(v.replace(CONTROL, " ").trim().slice(0, TOAD_LIMITS.historyChars), book), staff)) : "";
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
  if (typeof value === "string") return scrubContacts(value);
  if (typeof value !== "object" || value === null) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (MONEY_KEY.test(k)) continue;
    out[k] = stripMoney(v);
  }
  return out;
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
export function restoreToadAnswer(raw: unknown, book: Codebook, staff: StaffBook, screens: ToadScreen[]): ToadAnswer {
  const r = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const t = (v: unknown, max: number) =>
    restoreWithStaff(typeof v === "string" ? v.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim().slice(0, max) : "", book, staff);
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
