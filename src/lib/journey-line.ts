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
// Action cards
// ---------------------------------------------------------------------------

export type CardKind = "overdue" | "reached_out" | "today" | "risk" | "request";
const KIND_ORDER: Record<CardKind, number> = { overdue: 0, reached_out: 1, today: 2, risk: 3, request: 4 };
export const CARD_TAG: Record<CardKind, string> = {
  overdue: "Overdue",
  reached_out: "Reached out",
  today: "Due today",
  risk: "At risk",
  request: "Needs a decision",
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
}): ActionCard[] {
  const { journeys, steps, today, formatDay } = input;
  const order = new Map(input.clients.map((c, i) => [c.slug, i]));
  const byClient = new Map<string, { kind: CardKind; due: string; card: Omit<ActionCard, "kind" | "also"> }[]>();
  const add = (slug: string, kind: CardKind, due: string, card: Omit<ActionCard, "kind" | "also">) => {
    const list = byClient.get(slug) ?? [];
    list.push({ kind, due, card });
    byClient.set(slug, list);
  };
  const base = (c: LineClient) => ({ slug: c.slug, name: c.name, vip: Boolean(c.vip), ownerId: c.ownerId ?? null, ownerName: c.ownerName ?? null });

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
      (a.kind === "overdue" ? a.due.localeCompare(b.due) : 0) ||
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

export function pipelineGroups(clients: LineClient[], journeys: Map<string, JourneyState>, steps: JourneySteps, today: string, f: PipelineFilters): PipelineStage[] {
  const keep = clients.filter(
    (c) =>
      (!f.service || c.services.includes(f.service)) &&
      (!f.owner || c.ownerId === f.owner || (f.owner === "none" && !c.ownerId)) &&
      (!f.health || c.health === f.health),
  );
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
