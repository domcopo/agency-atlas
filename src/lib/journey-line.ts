// The Clients page Journey Line and action cards (docs/CLIENTS_JOURNEY_LINE_PLAN.md).
// Pure and tested (tests/journey-line.test.ts): layout, dot states, card picking and the
// full-pipeline grouping. No database, no React. All names in tests are fictional.

import { GROW_STAGE, JOURNEY_STAGES, touchByStep, type JourneyState, type JourneySteps, type TouchChannel } from "@/lib/journey";
import { nameKey } from "@/lib/scout";
import type { GhlContactTimes, HealthLevel, Service } from "@/lib/types";

/** Tick slots the Grow segment takes up (it has no numbered touches). */
export const GROW_SLOTS = 3;
/** "Reached out" only counts if the client's call or message is this recent. */
export const REACHED_OUT_DAYS = 14;
/** Action cards shown before "Show more". */
export const CARDS_SHOWN = 5;

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export interface LineSegment {
  stage: number;
  label: string;
  /** Left edge and width, in % of the line. */
  from: number;
  width: number;
}
export interface LineTick {
  step: number;
  stage: number;
  /** Centre, in % of the line. */
  x: number;
}

/**
 * The 27 touches sit evenly spaced (by day, touches 5 and 6 would sit on top of each other),
 * so each stage is as wide as its number of touches; Grow gets GROW_SLOTS.
 */
export function lineLayout(steps: JourneySteps): { segments: LineSegment[]; ticks: LineTick[]; growX: number } {
  const slots = steps.touches.length + GROW_SLOTS;
  const pct = (n: number) => Math.round((n / slots) * 100_000) / 1000;
  const ticks = steps.touches.map((t, i) => ({ step: t.step, stage: t.stage, x: pct(i + 0.5) }));
  const segments: LineSegment[] = JOURNEY_STAGES.map((label, stage) => {
    if (stage === GROW_STAGE) return { stage, label, from: pct(steps.touches.length), width: pct(GROW_SLOTS) };
    const idx = steps.touches.map((t, i) => (t.stage === stage ? i : -1)).filter((i) => i >= 0);
    const first = idx[0] ?? 0;
    const last = idx[idx.length - 1] ?? first - 1;
    return { stage, label, from: pct(first), width: pct(last - first + 1) };
  });
  return { segments, ticks, growX: pct(steps.touches.length + GROW_SLOTS / 2) };
}

// ---------------------------------------------------------------------------
// Dots
// ---------------------------------------------------------------------------

export type DotTiming = "overdue" | "today" | "later";

export interface LineClient {
  slug: string;
  name: string;
  services: Service[];
  ownerId?: string;
  ownerName?: string;
  backupId?: string;
  vip?: boolean;
  health?: HealthLevel;
  ghl?: GhlContactTimes;
  /** Newest contact the team logged in Atlas. */
  lastLogged?: string;
  /** Day they became a client (places Grow clients on the long-term line). */
  startDate?: string;
}

export interface LineDot {
  slug: string;
  name: string;
  initials: string;
  stage: number;
  step: number;
  touchTitle: string;
  due: string;
  timing: DotTiming;
  reachedOut: boolean;
}

export interface DotCluster {
  /** Tick step, or "grow". */
  key: string;
  x: number;
  stage: number;
  dots: LineDot[];
}

/** "Sample Plumbing (fictional)" → "SP". */
export function dotInitials(name: string): string {
  const words = name.replace(/\([^)]*\)/g, " ").replace(/[^\p{L}\p{N} ]+/gu, " ").trim().split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  return letters || "?";
}

export function dotTiming(next: { due: string; overdue: boolean }, today: string): DotTiming {
  return next.overdue || next.due < today ? "overdue" : next.due === today ? "today" : "later";
}

/**
 * The client called or messaged (GoHighLevel TIMES only, never the words) and nobody on the
 * team has been in touch since: no outgoing contact in GoHighLevel and nothing logged in Atlas
 * on or after that day. Only for the last REACHED_OUT_DAYS days.
 */
export function reachedOut(ghl: GhlContactTimes | undefined, lastLogged: string | undefined, today: string): { at: string } | null {
  const inbound = ghl?.lastInboundAt;
  if (!inbound) return null;
  const day = inbound.slice(0, 10);
  if (day > today) return null;
  const ageDays = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000;
  if (ageDays > REACHED_OUT_DAYS) return null;
  if (ghl.lastOutboundAt && ghl.lastOutboundAt >= inbound) return null;
  if (lastLogged && lastLogged >= day) return null;
  return { at: day };
}

/** One dot per tracked client, grouped by where they sit (a tick, or Grow). Left to right. */
export function placeDots(clients: LineClient[], journeys: Map<string, JourneyState>, steps: JourneySteps, today: string): DotCluster[] {
  const { ticks, growX } = lineLayout(steps);
  const xOf = new Map(ticks.map((t) => [t.step, t.x]));
  const clusters = new Map<string, DotCluster>();
  for (const c of clients) {
    const j = journeys.get(c.slug);
    if (!j?.next) continue;
    const grow = j.mode === "grow";
    const key = grow ? "grow" : String(j.next.step);
    const cluster = clusters.get(key) ?? { key, x: grow ? growX : (xOf.get(j.next.step) ?? 0), stage: grow ? GROW_STAGE : j.stage, dots: [] };
    cluster.dots.push({
      slug: c.slug,
      name: c.name,
      initials: dotInitials(c.name),
      stage: cluster.stage,
      step: j.next.step,
      touchTitle: j.next.title,
      due: j.next.due,
      timing: dotTiming(j.next, today),
      reachedOut: Boolean(reachedOut(c.ghl, c.lastLogged, today)),
    });
    clusters.set(key, cluster);
  }
  const rank: Record<DotTiming, number> = { overdue: 0, today: 1, later: 2 };
  for (const cl of clusters.values()) cl.dots.sort((a, b) => rank[a.timing] - rank[b.timing] || Number(b.reachedOut) - Number(a.reachedOut) || a.name.localeCompare(b.name));
  return [...clusters.values()].sort((a, b) => a.x - b.x);
}

/** Per stage: clients, overdue, due today. */
export function stageCounts(clusters: DotCluster[]): { total: number; overdue: number; today: number }[] {
  const out = JOURNEY_STAGES.map(() => ({ total: 0, overdue: 0, today: 0 }));
  for (const cl of clusters)
    for (const d of cl.dots) {
      const s = out[cl.stage]!;
      s.total += 1;
      if (d.timing === "overdue") s.overdue += 1;
      if (d.timing === "today") s.today += 1;
    }
  return out;
}

/** The worst state in a cluster (what its dot shows). */
export function clusterTiming(cl: DotCluster): DotTiming {
  return cl.dots.some((d) => d.timing === "overdue") ? "overdue" : cl.dots.some((d) => d.timing === "today") ? "today" : "later";
}

// ---------------------------------------------------------------------------
// Long-term line (full pipeline): the 27 touches, then Grow carries on by months as a client
// ---------------------------------------------------------------------------

/** Month marks after the first 90 days: monthly to a year, quarterly in year 2, then "2+ years". */
export const LONG_MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 18, 21, 24] as const;
/** Segments after the 90-day wrap. Index 5 is Grow, so stage numbers 5–8 are all Grow. */
export const LONG_STAGES = ["Months 4–6", "Months 7–12", "Year 2", "2+ years"] as const;
/** Key of the last mark (past 24 months). */
export const LONG_END = "m25";
const LONG_END_SLOTS = 2;

export interface LongMark {
  key: string;
  /** Months as a client (25 = "more than 24"). */
  month: number;
  stage: number;
  x: number;
  label: string;
}

/** Which long segment a month mark belongs to (5–8). */
function longStage(month: number): number {
  return month <= 6 ? 5 : month <= 12 ? 6 : month <= 24 ? 7 : 8;
}

export function longLineLayout(steps: JourneySteps): { segments: LineSegment[]; ticks: LineTick[]; marks: LongMark[] } {
  const n = steps.touches.length;
  const slots = n + LONG_MONTHS.length + LONG_END_SLOTS;
  const pct = (v: number) => Math.round((v / slots) * 100_000) / 1000;
  const ticks = steps.touches.map((t, i) => ({ step: t.step, stage: t.stage, x: pct(i + 0.5) }));
  const marks: LongMark[] = [
    ...LONG_MONTHS.map((m, i) => ({ key: `m${m}`, month: m, stage: longStage(m), x: pct(n + i + 0.5), label: `Month ${m}` })),
    { key: LONG_END, month: 25, stage: 8, x: pct(n + LONG_MONTHS.length + LONG_END_SLOTS / 2), label: "2+ years" },
  ];
  const first: LineSegment[] = JOURNEY_STAGES.slice(0, GROW_STAGE).map((label, stage) => {
    const idx = steps.touches.map((t, i) => (t.stage === stage ? i : -1)).filter((i) => i >= 0);
    const a = idx[0] ?? 0;
    const b = idx[idx.length - 1] ?? a - 1;
    return { stage, label, from: pct(a), width: pct(b - a + 1) };
  });
  const long: LineSegment[] = LONG_STAGES.map((label, i) => {
    const stage = GROW_STAGE + i;
    const idx = LONG_MONTHS.map((m, j) => (longStage(m) === stage ? j : -1)).filter((j) => j >= 0);
    if (stage === 8) return { stage, label, from: pct(n + LONG_MONTHS.length), width: pct(LONG_END_SLOTS) };
    return { stage, label, from: pct(n + idx[0]!), width: pct(idx.length) };
  });
  return { segments: [...first, ...long], ticks, marks };
}

/** Whole months between two days (a month = 30.44 days). */
export function monthsBetween(from: string, to: string): number {
  return Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / (30.44 * 86_400_000));
}

/** The mark a Grow client sits on: the last mark they have reached (at least month 4). */
export function longMarkFor(startDate: string | undefined, today: string): string {
  if (!startDate) return "m4";
  const months = monthsBetween(startDate, today);
  if (months > 24) return LONG_END;
  let key = "m4";
  for (const m of LONG_MONTHS) if (months >= m) key = `m${m}`;
  return key;
}

/** Dots for the long-term line: first-90-day clients on their touch, Grow clients by months as a client. */
export function placeLongDots(clients: LineClient[], journeys: Map<string, JourneyState>, steps: JourneySteps, today: string): DotCluster[] {
  const { ticks, marks } = longLineLayout(steps);
  const markBy = new Map(marks.map((m) => [m.key, m]));
  const growKeys = new Map(clients.map((c) => [c.slug, longMarkFor(c.startDate, today)]));
  const base = placeDots(clients, journeys, steps, today);
  const out: DotCluster[] = [];
  const longClusters = new Map<string, DotCluster>();
  for (const cl of base) {
    if (cl.key !== "grow") {
      const t = ticks.find((x) => String(x.step) === cl.key);
      out.push({ ...cl, x: t?.x ?? cl.x });
      continue;
    }
    for (const d of cl.dots) {
      const m = markBy.get(growKeys.get(d.slug) ?? "m4")!;
      const c = longClusters.get(m.key) ?? { key: m.key, x: m.x, stage: m.stage, dots: [] };
      c.dots.push({ ...d, stage: m.stage });
      longClusters.set(m.key, c);
    }
  }
  return [...out, ...longClusters.values()].sort((a, b) => a.x - b.x);
}

/** Per segment (stages 0–8 on the long line): clients, overdue, due today. */
export function longStageCounts(clusters: DotCluster[]): { total: number; overdue: number; today: number }[] {
  const out = Array.from({ length: GROW_STAGE + LONG_STAGES.length }, () => ({ total: 0, overdue: 0, today: 0 }));
  for (const cl of clusters)
    for (const d of cl.dots) {
      const s = out[cl.stage]!;
      s.total += 1;
      if (d.timing === "overdue") s.overdue += 1;
      if (d.timing === "today") s.today += 1;
    }
  return out;
}

// ---------------------------------------------------------------------------
// Action cards
// ---------------------------------------------------------------------------

export type CardKind = "overdue" | "reached_out" | "today" | "risk" | "request" | "upcoming";
const KIND_ORDER: Record<CardKind, number> = { overdue: 0, reached_out: 1, today: 2, risk: 3, request: 4, upcoming: 5 };
export const CARD_TAG: Record<CardKind, string> = {
  overdue: "Overdue",
  reached_out: "Reached out",
  today: "Due today",
  risk: "At risk",
  request: "Needs a decision",
  upcoming: "Coming up",
};

export interface ActionCard {
  id: string;
  slug: string;
  name: string;
  kind: CardKind;
  /** Other reasons for the same client (shown as small tags). */
  also: CardKind[];
  step: number | null;
  touchTitle: string | null;
  /** Journey stage of the client's next touch (0–4 first 90 days, 5 Grow); null when unknown. */
  stage: number | null;
  context: string;
  /**
   * The one main button:
   * - mark_sent: a text or email touch (records it in Atlas; nothing is sent);
   * - log_call: a call or video touch (opens the client to pick talked / no answer);
   * - open: open the client; review: the owner/manager decides a VA request.
   */
  button: "mark_sent" | "log_call" | "open" | "review";
  channel: TouchChannel | null;
  vip: boolean;
  ownerId: string | null;
  ownerName: string | null;
}

export interface CardRisk {
  slug: string;
  problem: string;
  severity: "critical" | "high" | "medium";
}
export interface CardRequest {
  id: string;
  slug: string | null;
  to: "active" | "paused" | "canceled";
  reasonLabel: string;
}

const REQUEST_WORDS = { active: "bring back", paused: "pause", canceled: "mark lost" } as const;

/**
 * Cards for clients that need action now, one per client (the most urgent reason wins; the
 * rest become tags). Order: overdue (oldest first), reached out, due today, risk, request;
 * then the order the clients came in (pass them sorted by importance: VIP, top tier…).
 */
export function actionCards(input: {
  clients: LineClient[];
  journeys: Map<string, JourneyState>;
  steps: JourneySteps;
  risks: CardRisk[];
  requests: CardRequest[];
  today: string;
  formatDay: (d: string) => string;
  /** Also list every other client's next touch as "Coming up" (soonest first). */
  upcoming?: boolean;
}): ActionCard[] {
  const { journeys, steps, today, formatDay } = input;
  const order = new Map(input.clients.map((c, i) => [c.slug, i]));
  const byClient = new Map<string, { kind: CardKind; due: string; card: Omit<ActionCard, "kind" | "also"> }[]>();
  const add = (slug: string, kind: CardKind, due: string, card: Omit<ActionCard, "kind" | "also">) => {
    const list = byClient.get(slug) ?? [];
    list.push({ kind, due, card });
    byClient.set(slug, list);
  };
  const base = (c: LineClient) => ({ slug: c.slug, name: c.name, vip: Boolean(c.vip), ownerId: c.ownerId ?? null, ownerName: c.ownerName ?? null, stage: journeys.get(c.slug)?.stage ?? null });

  for (const c of input.clients) {
    const j = journeys.get(c.slug);
    const n = j?.next;
    if (n && n.due <= today) {
      const t = touchByStep(n.step, steps);
      const channel = t?.channel ?? null;
      const overdue = dotTiming(n, today) === "overdue";
      const how = t?.how ?? "";
      add(c.slug, overdue ? "overdue" : "today", n.due, {
        ...base(c),
        id: `touch-${c.slug}`,
        step: n.step,
        touchTitle: n.title,
        context: `${overdue ? `Overdue since ${formatDay(n.due)}` : "Due today"}${how ? ` · ${how}` : ""}${n.attempts ? ` · ${n.attempts} unanswered call${n.attempts === 1 ? "" : "s"}` : ""}`,
        button: channel === "text" || channel === "email" ? "mark_sent" : "log_call",
        channel,
      });
    }
    const out = reachedOut(c.ghl, c.lastLogged, today);
    if (out) {
      const how = c.ghl?.lastChannel === "call" ? "called" : "sent a message";
      add(c.slug, "reached_out", out.at, {
        ...base(c),
        id: `reached-${c.slug}`,
        step: null,
        touchTitle: null,
        context: `The client ${how} on ${formatDay(out.at)} (GoHighLevel time) · no team contact since`,
        button: "open",
        channel: null,
      });
    }
  }
  const bySlug = new Map(input.clients.map((c) => [c.slug, c]));
  for (const r of input.risks) {
    const c = bySlug.get(r.slug);
    if (!c) continue;
    add(c.slug, "risk", today, { ...base(c), id: `risk-${c.slug}`, step: null, touchTitle: null, context: r.problem, button: "open", channel: null });
  }
  for (const r of input.requests) {
    const c = r.slug ? bySlug.get(r.slug) : undefined;
    if (!c) continue;
    add(c.slug, "request", today, {
      ...base(c),
      id: `request-${r.id}`,
      step: null,
      touchTitle: null,
      context: `VA asked to ${REQUEST_WORDS[r.to]}: ${r.reasonLabel}`,
      button: "review",
      channel: null,
    });
  }

  // Everyone else: their next touch, so the list covers every client on the journey.
  if (input.upcoming) {
    for (const c of input.clients) {
      const n = journeys.get(c.slug)?.next;
      if (byClient.has(c.slug) || !n) continue;
      const t = touchByStep(n.step, steps);
      const channel = t?.channel ?? null;
      add(c.slug, "upcoming", n.due, {
        ...base(c),
        id: `next-${c.slug}`,
        step: n.step,
        touchTitle: n.title,
        context: `Due ${formatDay(n.due)}${t?.how ? ` · ${t.how}` : ""}`,
        button: channel === "text" || channel === "email" ? "mark_sent" : "log_call",
        channel,
      });
    }
  }

  const cards: (ActionCard & { due: string })[] = [];
  for (const list of byClient.values()) {
    list.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
    const top = list[0]!;
    // A touch due/overdue keeps its touch number and button even when "reached out" is also true.
    const also = [...new Set(list.slice(1).map((l) => l.kind))].filter((k) => k !== top.kind);
    cards.push({ ...top.card, kind: top.kind, also, due: top.due });
  }
  cards.sort(
    (a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      (a.kind === "overdue" || a.kind === "upcoming" ? a.due.localeCompare(b.due) : 0) ||
      (order.get(a.slug) ?? 1e9) - (order.get(b.slug) ?? 1e9) ||
      a.name.localeCompare(b.name),
  );
  return cards.map((c) => {
    const out: ActionCard & { due?: string } = { ...c };
    delete out.due;
    return out;
  });
}

// ---------------------------------------------------------------------------
// Full pipeline: every client by stage, then touch, with filters
// ---------------------------------------------------------------------------

export interface PipelineFilters {
  service: Service | null;
  owner: string | null;
  health: HealthLevel | null;
  overdueOnly: boolean;
}

export function parsePipelineFilters(p: Record<string, string | undefined>): PipelineFilters {
  const service = p.service === "SEO" || p.service === "Ads" || p.service === "Website" ? p.service : null;
  const health = p.health === "healthy" || p.health === "watch" || p.health === "at_risk" ? p.health : null;
  const owner = typeof p.owner === "string" && /^[A-Za-z0-9-]{1,40}$/.test(p.owner) ? p.owner : null;
  return { service, owner, health, overdueOnly: p.overdue === "1" };
}

export interface PipelineStage {
  stage: number;
  label: string;
  touches: { step: number; title: string; clients: (LineDot & { ownerName: string | null; health: HealthLevel | null })[] }[];
  count: number;
}

/** Clients that match the pipeline's service, main person and health filters. */
export function filterClients(clients: LineClient[], f: PipelineFilters): LineClient[] {
  return clients.filter(
    (c) =>
      (!f.service || c.services.includes(f.service)) &&
      (!f.owner || c.ownerId === f.owner || (f.owner === "none" && !c.ownerId)) &&
      (!f.health || c.health === f.health),
  );
}

export function pipelineGroups(clients: LineClient[], journeys: Map<string, JourneyState>, steps: JourneySteps, today: string, f: PipelineFilters): PipelineStage[] {
  const keep = filterClients(clients, f);
  const info = new Map(keep.map((c) => [c.slug, c]));
  const stages: PipelineStage[] = JOURNEY_STAGES.map((label, stage) => ({ stage, label, touches: [], count: 0 }));
  for (const cl of placeDots(keep, journeys, steps, today)) {
    for (const d of cl.dots) {
      if (f.overdueOnly && d.timing !== "overdue") continue;
      const s = stages[cl.stage]!;
      let group = s.touches.find((t) => t.step === d.step);
      if (!group) {
        group = { step: d.step, title: d.touchTitle, clients: [] };
        s.touches.push(group);
      }
      const c = info.get(d.slug);
      group.clients.push({ ...d, ownerName: c?.ownerName ?? null, health: c?.health ?? null });
      s.count += 1;
    }
  }
  for (const s of stages) s.touches.sort((a, b) => a.step - b.step);
  return stages;
}

// ---------------------------------------------------------------------------
// Latest audit for a client. Saved audits belong to sales LEADS, not clients, so the only
// honest link is the same business name (nameKey, the rule Scout uses to skip clients).
// ---------------------------------------------------------------------------

export function auditForClient<T extends { title: string; company?: string | null; createdAt: string; archived: boolean }>(clientName: string, audits: T[]): T | null {
  const key = nameKey(clientName.replace(/\([^)]*\)/g, " "));
  if (!key) return null;
  const hits = audits.filter((a) => !a.archived && (nameKey(a.company ?? "") === key || nameKey(a.title) === key));
  return hits.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}
