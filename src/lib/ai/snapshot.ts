// Builds the trimmed data the AI reads, with client NAMES SWAPPED FOR CODES
// ("C1", "C2"...) so names never leave this Mac. The app swaps them back on screen.
// Pure functions: no network, no database. Tested in tests/fixtures.test.ts.

import type { Briefing, CheckIn, CheckInEntry, ClientAction, ClientHealth, ClientProfile, GhlSummary, HealthSummary, OpsBriefing, RosterClient } from "@/lib/types";

export interface Codebook {
  codeOf: Map<string, string>; // client slug -> "C3"
  clientOf: Map<string, { slug: string; name: string }>; // "C3" -> client
  names: { name: string; code: string }[]; // longest first, for redacting notes
}

export function buildCodebook(clients: RosterClient[]): Codebook {
  const codeOf = new Map<string, string>();
  const clientOf = new Map<string, { slug: string; name: string }>();
  clients.forEach((c, i) => {
    const code = `C${i + 1}`;
    codeOf.set(c.id, code);
    clientOf.set(code, { slug: c.id, name: c.name });
  });
  const names = clients.map((c) => ({ name: c.name, code: codeOf.get(c.id)! })).sort((a, b) => b.name.length - a.name.length);
  return { codeOf, clientOf, names };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Replaces every full client name in free text (notes) with its code. */
export function redact(text: string, book: Codebook): string {
  let out = text;
  for (const { name, code } of book.names) {
    if (name.trim().length < 3) continue;
    // Not inside a longer word on either side (works even when a name ends in ")" or ".").
    out = out.replace(new RegExp(`(?<![A-Za-z0-9])${escape(name)}(?![A-Za-z0-9])`, "gi"), `[${code}]`);
  }
  return out;
}

/** Turns "[C3]" back into the client's name for display. Unknown codes become a neutral label. */
export function restore(text: string, book: Codebook): string {
  return text.replace(/\[?\b(C\d{1,4})\b\]?/g, (whole, code: string) => book.clientOf.get(code)?.name ?? "[unknown client]");
}

/** Codes from the AI → client links. Unknown codes are dropped. */
export function restoreClients(codes: unknown, book: Codebook): { slug: string; name: string }[] {
  if (!Array.isArray(codes)) return [];
  const out: { slug: string; name: string }[] = [];
  for (const c of codes) {
    const code = typeof c === "string" ? c.replace(/[[\]\s]/g, "") : "";
    const hit = book.clientOf.get(code);
    if (hit && !out.some((o) => o.slug === hit.slug)) out.push(hit);
  }
  return out;
}

const clip = (s: string | null | undefined, max: number) => (s ? s.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max) : null);

/** One client's facts, coded. */
export function clientFacts(
  c: RosterClient,
  health: ClientHealth | null,
  notes: CheckInEntry[],
  book: Codebook,
  today: string,
) {
  return {
    code: book.codeOf.get(c.id),
    status: c.status,
    services: c.services.length ? c.services : ["not recorded"],
    monthly_usd: c.monthlyUsd,
    started: c.startDate,
    ended: c.endDate ?? null,
    health: health ? { score: health.score, level: health.level, reasons: health.factors.filter((f) => f.impact !== 0).map((f) => redact(f.label, book)) } : null,
    check_in: health ? { state: health.checkIn.state, every_days: health.checkIn.cadenceDays, last: health.checkIn.last ?? null, due: health.checkIn.due ?? null } : null,
    last_mood: c.lastMood ?? null,
    owner_follow_up: c.followUp ? redact(c.followUp, book) : null,
    record_to_check: c.check ? redact(c.check, book) : null,
    recent_check_in_notes: notes
      .filter((n) => n.note)
      .map((n) => ({ date: n.date, mood: n.mood, note: redact(clip(n.note, 300) ?? "", book) })),
    today,
  };
}

export function pipelineFacts(ghl: GhlSummary) {
  if (!ghl.lastSync) return null;
  return {
    synced_at: ghl.lastSync.ranAt,
    open_deals: ghl.open,
    by_stage: ghl.byStage,
    new_this_month: ghl.newThisMonth,
    won_this_month: ghl.wonThisMonth,
    lost_this_month: ghl.lostThisMonth,
    appointments_next_7_days: ghl.upcoming7,
    showed_last_30_days: ghl.showed30,
    no_shows_last_30_days: ghl.noShows30,
  };
}

// ---------------------------------------------------------------------------
// Checking and restoring the AI's answers (they're untrusted too)
// ---------------------------------------------------------------------------

type O = Record<string, unknown>;
const asObj = (v: unknown): O => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as O) : {});
const asArr = (v: unknown, max: number): O[] => (Array.isArray(v) ? v.slice(0, max).map(asObj) : []);
const txt = (v: unknown, max: number, book: Codebook) => restore(typeof v === "string" ? v.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim().slice(0, max) : "", book);
const txtList = (v: unknown, maxItems: number, maxLen: number, book: Codebook) =>
  (Array.isArray(v) ? v.slice(0, maxItems) : []).map((s) => txt(s, maxLen, book)).filter(Boolean);

export function restoreBriefing(raw: unknown, book: Codebook): Briefing {
  const r = asObj(raw);
  const item = (o: O) => ({ title: txt(o.title, 160, book), why: txt(o.why, 400, book), clients: restoreClients(o.clients, book) });
  return {
    headline: txt(r.headline, 240, book),
    priorities: asArr(r.priorities, 6).map((o) => ({ ...item(o), when: o.when === "today" ? "today" : "this_week" })),
    risks: asArr(r.risks, 5).map(item),
    upsells: asArr(r.upsells, 4).map(item),
    questions: asArr(r.questions, 4).map((o) => ({ question: txt(o.question, 240, book), why: txt(o.why, 300, book), clients: restoreClients(o.clients, book) })),
    drafts: asArr(r.drafts, 3).map((o) => ({
      client: restoreClients([o.client], book)[0] ?? null,
      purpose: txt(o.purpose, 160, book),
      message: txt(o.message, 900, book),
    })),
  };
}

export function restoreProfile(raw: unknown, book: Codebook): ClientProfile {
  const r = asObj(raw);
  return {
    summary: txt(r.summary, 600, book),
    buys: txt(r.buys, 300, book),
    howTheyAreDoing: txt(r.how_they_are_doing, 500, book),
    caresAbout: txtList(r.cares_about, 4, 200, book),
    risks: txtList(r.risks, 4, 240, book),
    nextStep: txt(r.next_step, 300, book),
    questionsToAsk: txtList(r.questions_to_ask, 4, 240, book),
    draftCheckIn: txt(r.draft_check_in, 900, book),
  };
}

// ---------------------------------------------------------------------------
// Operations briefing (version 2). Team members are coded too ("T1", "T2"...),
// so neither client nor staff names leave this Mac.
// ---------------------------------------------------------------------------

export interface StaffBook {
  codeOf: Map<string, string>; // staff id -> "T2"
  nameOf: Map<string, string>; // "T2" -> name
}

export function buildStaffBook(staff: { id: string; name: string }[]): StaffBook {
  const codeOf = new Map<string, string>();
  const nameOf = new Map<string, string>();
  staff.forEach((m, i) => {
    codeOf.set(m.id, `T${i + 1}`);
    nameOf.set(`T${i + 1}`, m.name);
  });
  return { codeOf, nameOf };
}

/** Client codes back to names, then team codes back to names (unknown team codes become "a teammate"). */
export function restoreWithStaff(text: string, book: Codebook, staff: StaffBook): string {
  return restore(text, book).replace(/\[?\b(T\d{1,3})\b\]?/g, (_w, code: string) => staff.nameOf.get(code) ?? "a teammate");
}

/** One client's operational facts, coded. */
export function opsClientFacts(input: {
  c: RosterClient;
  health: HealthSummary | null;
  checkIn: CheckIn;
  open: ClientAction[];
  notes: CheckInEntry[];
  book: Codebook;
  staff: StaffBook;
  today: string;
}) {
  const { c, health, checkIn, open, notes, book, staff, today } = input;
  const days = c.lastContact ? Math.round((Date.parse(today) - Date.parse(c.lastContact)) / 86_400_000) : null;
  return {
    code: book.codeOf.get(c.id),
    status: c.status,
    services: c.services.length ? c.services : ["not recorded"],
    monthly_usd: c.monthlyUsd,
    started: c.startDate,
    owner: c.ownerId ? (staff.codeOf.get(c.ownerId) ?? "unknown") : "none",
    health: health ? { word: health.state, reasons: health.reasons.map((r) => redact(r, book)) } : null,
    days_since_contact: days,
    check_in_every_days: checkIn.cadenceDays,
    last_mood: c.lastMood ?? null,
    open_items: open.map((a) => ({
      type: a.kind,
      title: redact(clip(a.title, 120) ?? "", book),
      owner: a.ownerId ? (staff.codeOf.get(a.ownerId) ?? "unknown") : "none",
      priority: a.priority,
      status: a.status,
      due: a.dueOn,
    })),
    owner_note: c.followUp ? redact(c.followUp, book) : null,
    recent_contact_notes: notes.filter((n) => n.note).map((n) => ({ date: n.date, type: n.kind ?? "check_in", mood: n.mood, note: redact(clip(n.note, 300) ?? "", book) })),
  };
}

export function restoreOpsBriefing(raw: unknown, book: Codebook, staff: StaffBook): OpsBriefing {
  const r = asObj(raw);
  const t = (v: unknown, max: number) => restoreWithStaff(typeof v === "string" ? v.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim().slice(0, max) : "", book, staff);
  const one = (v: unknown) => restoreClients([v], book)[0] ?? null;
  return {
    version: 2,
    headline: t(r.headline, 200),
    priorities: asArr(r.priorities, 7).map((o) => ({
      client: one(o.client),
      reason: t(o.reason, 300),
      action: t(o.action, 120),
      when: o.when === "this_week" ? "this_week" : "today",
      priority: o.priority === "critical" ? "critical" : o.priority === "high" ? "high" : "normal",
    })),
    opportunities: asArr(r.opportunities, 3).map((o) => ({ client: one(o.client), idea: t(o.idea, 160), why: t(o.why, 300) })),
    team: (Array.isArray(r.team) ? r.team.slice(0, 3) : []).map((x) => t(x, 200)).filter(Boolean),
  };
}
