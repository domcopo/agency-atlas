// Simple, explainable operations rules: client health states, flags and
// "Today's priorities". Pure functions (no database, no network), tested in
// tests/fixtures.test.ts. Change a number in OPS_RULES to tune them.

import { daysBetween, monthsBetween } from "@/lib/format";
import type {
  ActionPriority,
  CheckIn,
  ClientAction,
  HealthSummary,
  PriorityItem,
  RosterClient,
} from "@/lib/types";

export const OPS_RULES = {
  /** A gap this many times the client's check-in rhythm counts as "at risk". */
  longGapMultiple: 2,
  /** Two or more open issues on one client = at risk. */
  issuesForRisk: 2,
  /** New clients get extra care for this many days. */
  newClientDays: 30,
  /** Upsell ideas only after this many months together. */
  upsellAfterMonths: 3,
  /** How many priorities Home shows before "Show all". */
  homeLimit: 5,
  /** A client who reached out (GoHighLevel) and got no reply for this many days needs attention; double = at risk. */
  replyWithinDays: 2,
  /** This many of our messages in a row with no reply: suggest a call. */
  unansweredForCall: 3,
} as const;

export const PRIORITY_RANK: Record<ActionPriority, number> = { critical: 0, high: 1, normal: 2, low: 3 };
const WHEN_RANK = { overdue: 0, today: 1, upcoming: 2, none: 3 } as const;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

/** Days a client has been waiting for our reply in GoHighLevel (null = not waiting). */
export function waitingDays(c: RosterClient, today: string): number | null {
  const g = c.ghl;
  if (!g?.lastInboundAt) return null;
  if (g.lastOutboundAt && g.lastOutboundAt > g.lastInboundAt) return null;
  return daysBetween(g.lastInboundAt.slice(0, 10), today);
}

export function openActions(actions: ClientAction[], clientDbId: string | undefined): ClientAction[] {
  return clientDbId ? actions.filter((a) => a.client?.dbId === clientDbId && a.status !== "done") : [];
}

/** When an action is due, relative to today. */
export function dueWhen(dueOn: string | null, today: string): PriorityItem["when"] {
  if (!dueOn) return "none";
  return dueOn < today ? "overdue" : dueOn === today ? "today" : "upcoming";
}

export function dueLabel(dueOn: string | null, today: string): string {
  if (!dueOn) return "No due date";
  if (dueOn < today) return `Overdue by ${plural(daysBetween(dueOn, today), "day")}`;
  if (dueOn === today) return "Due today";
  const d = daysBetween(today, dueOn);
  return d === 1 ? "Due tomorrow" : `Due in ${d} days`;
}

/** Upsell / referral ideas for one client (plain rules). */
export function opportunities(c: RosterClient, today: string): string[] {
  if (c.status !== "active") return [];
  const months = monthsBetween(c.startDate, today);
  if (months < OPS_RULES.upsellAfterMonths) return [];
  const out: string[] = [];
  if (c.monthlyUsd < 150 && !c.services.includes("SEO"))
    out.push(`SEO upsell: pays ${usd(c.monthlyUsd)}/mo, with you ${months} months`);
  if (c.services.includes("SEO") && !c.services.includes("Ads")) out.push("Ads upsell: already trusts you with SEO");
  if (months >= 6 && c.lastMood?.mood === "better") out.push("Referral ask: long-term client who's doing better");
  return out;
}

/**
 * One health word per client, with reasons. At risk > Needs attention > Opportunity > Healthy.
 * Missing owner / next action are shown as separate flags, not health, so health stays meaningful.
 */
export function healthSummary(c: RosterClient, checkIn: CheckIn, actions: ClientAction[], today: string): HealthSummary | null {
  if (c.status === "canceled" || c.status === "incomplete_expired") return null;
  const mine = openActions(actions, c.dbId);
  const issues = mine.filter((a) => a.kind === "issue");
  const daysSince = c.lastContact ? daysBetween(c.lastContact, today) : null;
  const waiting = waitingDays(c, today);

  const risk: string[] = [];
  if (c.status === "paused") risk.push(`Paused: ${usd(c.monthlyUsd)}/mo on hold`);
  if (c.lastMood?.mood === "worse") risk.push(`Last check-in (${c.lastMood.date}): things got worse`);
  if (daysSince !== null && daysSince > checkIn.cadenceDays * OPS_RULES.longGapMultiple)
    risk.push(`No contact in ${daysSince} days (check in every ${checkIn.cadenceDays})`);
  if (waiting !== null && waiting >= OPS_RULES.replyWithinDays * 2) risk.push(`Client reached out ${waiting} days ago; no reply yet`);
  if (issues.length >= OPS_RULES.issuesForRisk) risk.push(`${issues.length} open issues`);
  for (const i of issues.filter((x) => x.priority === "critical")) risk.push(`Critical issue: ${i.title}`);
  for (const i of issues.filter((x) => x.priority !== "critical" && x.dueOn && x.dueOn < today))
    risk.push(`Issue overdue: ${i.title}`);
  if (risk.length) return { state: "at_risk", reasons: risk };

  const attention: string[] = [];
  const isNew = daysBetween(c.startDate, today) <= OPS_RULES.newClientDays && c.startDate <= today;
  if (waiting !== null && waiting >= OPS_RULES.replyWithinDays && waiting < OPS_RULES.replyWithinDays * 2)
    attention.push(`Client reached out ${waiting} days ago; no reply yet`);
  if (c.ghl && c.ghl.unansweredOutbound >= OPS_RULES.unansweredForCall)
    attention.push(`${c.ghl.unansweredOutbound} messages from us with no reply: try a call`);
  if (isNew && !c.lastContact) attention.push("New client: first-month check-in not done");
  else if (!c.lastContact) attention.push("No contact logged yet");
  else if (checkIn.state === "overdue") attention.push(`Check-in overdue: last contact ${daysSince} days ago`);
  for (const a of mine.filter((x) => x.kind === "follow_up" && x.dueOn && x.dueOn < today))
    attention.push(`Follow-up overdue: ${a.title}`);
  for (const i of issues) attention.push(`Open issue: ${i.title}`);
  if (mine.some((a) => a.status === "waiting")) attention.push("Waiting on the client");
  if (c.followUp) attention.push(`Your note: ${c.followUp}`);
  if (c.check) attention.push("Record needs checking");
  if (attention.length) return { state: "needs_attention", reasons: attention };

  const opps = opportunities(c, today);
  if (opps.length) return { state: "opportunity", reasons: opps };
  return { state: "healthy", reasons: c.lastContact ? [`Last contact ${c.lastContact}`] : [] };
}

/** Flags about missing ownership. Shown once, as an item, never repeated per client. */
export function ownershipGaps(clients: RosterClient[], actions: ClientAction[]) {
  const active = clients.filter((c) => c.status === "active");
  return {
    noOwner: active.filter((c) => !c.ownerId),
    noNextAction: active.filter((c) => openActions(actions, c.dbId).length === 0),
    actionsNoOwner: actions.filter((a) => a.status !== "done" && !a.ownerId),
  };
}

/**
 * Everything that needs a person, most urgent first. Saved actions come first in
 * their slot; a client only gets a rule-based flag when it has no open action.
 */
export function buildPriorities(input: {
  clients: RosterClient[];
  actions: ClientAction[];
  health: Map<string, HealthSummary | null>;
  checkIns: Map<string, CheckIn>;
  today: string;
  /** GoHighLevel deal id -> deal name, for lead follow-ups. */
  leadNames?: Map<string, string>;
  /** New deals (last 7 days) with no follow-up yet. */
  newLeadsWithoutAction?: number;
}): PriorityItem[] {
  const { clients, actions, health, checkIns, today, leadNames, newLeadsWithoutAction } = input;
  const items: PriorityItem[] = [];

  for (const a of actions.filter((x) => x.status !== "done")) {
    const when = dueWhen(a.dueOn, today);
    const label = a.kind === "issue" ? "Issue" : "Follow-up";
    const status = a.status === "waiting" ? " · waiting on client" : a.status === "in_progress" ? " · in progress" : "";
    items.push({
      id: `a_${a.id}`,
      title: a.client ? `${a.client.name}: ${a.title}` : a.leadGhlId ? `${leadNames?.get(a.leadGhlId) ?? "Lead"}: ${a.title}` : a.title,
      reason: `${label} · ${dueLabel(a.dueOn, today)}${status}`,
      href: a.client ? `/clients/${a.client.slug}` : "/sales#follow-ups",
      ownerName: a.ownerName,
      ownerId: a.ownerId,
      dueOn: a.dueOn,
      when,
      priority: a.priority,
      action: a,
    });
  }

  for (const c of clients.filter((x) => x.status === "active")) {
    if (openActions(actions, c.dbId).length) continue; // its own action already covers it
    const h = health.get(c.id);
    const ci = checkIns.get(c.id);
    const base = { href: `/clients/${c.id}`, ownerName: c.ownerName ?? null, ownerId: c.ownerId ?? null, dueOn: null, clientSlug: c.id };
    const isNew = daysBetween(c.startDate, today) <= OPS_RULES.newClientDays && c.startDate <= today;
    const wait = waitingDays(c, today);
    if (wait !== null && wait >= OPS_RULES.replyWithinDays) {
      items.push({ ...base, id: `f_reply_${c.id}`, title: `Reply to ${c.name}`, reason: `They reached out ${wait} days ago; no reply yet`, when: "overdue", priority: "high" });
    } else if (h?.state === "at_risk") {
      items.push({ ...base, id: `f_risk_${c.id}`, title: `Check on ${c.name}`, reason: `At risk: ${h.reasons[0]}`, when: "today", priority: "high" });
    } else if (isNew && !c.lastContact) {
      items.push({ ...base, id: `f_new_${c.id}`, title: `First-month check-in: ${c.name}`, reason: `Started ${c.startDate}; no contact logged yet`, when: "today", priority: "high" });
    } else if (c.followUp) {
      items.push({ ...base, id: `f_note_${c.id}`, title: `Follow up: ${c.name}`, reason: `Your note: ${c.followUp}`, when: "today", priority: "normal" });
    } else if (ci?.state === "overdue" && ci.last) {
      items.push({ ...base, id: `f_ci_${c.id}`, title: `Check in with ${c.name}`, reason: `Last contact ${daysBetween(ci.last, today)} days ago (every ${ci.cadenceDays} days)`, when: "overdue", priority: "normal" });
    }
  }

  // Group the rest into single lines so nothing is repeated 30 times.
  const flagged = new Set(items.map((i) => i.clientSlug).filter(Boolean));
  const neverLogged = clients.filter((c) => c.status === "active" && !c.lastContact && !flagged.has(c.id));
  if (neverLogged.length)
    items.push({ id: "g_never", title: `Log the last contact for ${plural(neverLogged.length, "client")}`, reason: "No contact logged, so check-in reminders can't start", href: "/clients#checkins", ownerName: null, dueOn: null, when: "none", priority: "normal" });
  if (newLeadsWithoutAction)
    items.push({ id: "g_leads", title: `${plural(newLeadsWithoutAction, "new lead")} this week with no follow-up`, reason: "New leads go cold fast. Add a follow-up and an owner", href: "/sales#follow-ups", ownerName: null, dueOn: null, when: "today", priority: "high" });
  const gaps = ownershipGaps(clients, actions);
  if (gaps.noOwner.length)
    items.push({ id: "g_owner", title: `Assign owners to ${plural(gaps.noOwner.length, "active client")}`, reason: "Nobody is responsible for them yet", href: "/clients#owners", ownerName: null, dueOn: null, when: "none", priority: "normal" });
  if (gaps.actionsNoOwner.length)
    items.push({ id: "g_action_owner", title: `${plural(gaps.actionsNoOwner.length, "open item")} without an owner`, reason: "Assign each one so it doesn't get lost", href: "/work", ownerName: null, dueOn: null, when: "none", priority: "normal" });
  if (gaps.noNextAction.length)
    items.push({ id: "g_next", title: `Add next actions for ${plural(gaps.noNextAction.length, "active client")}`, reason: "Every active client should have a next step", href: "/clients#owners", ownerName: null, dueOn: null, when: "none", priority: "low" });

  return items.sort(
    (a, b) =>
      WHEN_RANK[a.when] - WHEN_RANK[b.when] ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      Number(!a.action) - Number(!b.action) ||
      (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"),
  );
}

export type WorkBucket = "overdue" | "today" | "upcoming" | "waiting";

/** One person's queue (or everyone's when ownerId is undefined; null = unowned). */
export function myWork(items: PriorityItem[], ownerId: string | null | undefined) {
  const mine = items.filter((i) => !i.id.startsWith("g_") && (ownerId === undefined || (i.ownerId ?? null) === ownerId));
  const buckets: Record<WorkBucket, PriorityItem[]> = { overdue: [], today: [], upcoming: [], waiting: [] };
  for (const i of mine) {
    if (i.action?.status === "waiting") buckets.waiting.push(i);
    else if (i.when === "overdue") buckets.overdue.push(i);
    else if (i.when === "today") buckets.today.push(i);
    else buckets.upcoming.push(i);
  }
  return buckets;
}

/** Per-person load for managers: open items, overdue, clients owned. */
export function teamLoad(staff: { id: string; name: string }[], clients: RosterClient[], actions: ClientAction[], today: string) {
  const open = actions.filter((a) => a.status !== "done");
  const row = (ownerId: string | null) => {
    const mine = open.filter((a) => (a.ownerId ?? null) === ownerId);
    return {
      open: mine.length,
      overdue: mine.filter((a) => a.dueOn !== null && a.dueOn < today).length,
      clients: ownerId ? clients.filter((c) => c.status === "active" && c.ownerId === ownerId).length : clients.filter((c) => c.status === "active" && !c.ownerId).length,
    };
  };
  return { people: staff.map((m) => ({ ...m, ...row(m.id) })), unowned: row(null) };
}

/** A short next step for an opportunity idea (used by Growth's "Make it a next action"). */
export function opportunityAction(idea: string): string {
  if (idea.startsWith("SEO upsell")) return "Offer SEO";
  if (idea.startsWith("Ads upsell")) return "Offer Ads";
  if (idea.startsWith("Referral ask")) return "Ask for a referral";
  return "Discuss growth idea";
}

/**
 * Is this GoHighLevel stage part of SELLING (not onboarding or delivery)?
 * Matched by keywords, so renamed or new sales stages still count. Edit the lists to tune.
 */
const SALES_WORDS = /(lead|referr|refferal|reach ?out|sales|discovery|proposal|follow ?up|contacted|qualif)/i;
const NOT_SALES_WORDS = /(onboard|build|step ?up|review|complete|recurring|launch|live|won|lost|churn|cancel)/i;

export function isSalesStage(stage: string | null | undefined): boolean {
  if (!stage) return false;
  return SALES_WORDS.test(stage) && !NOT_SALES_WORDS.test(stage);
}
