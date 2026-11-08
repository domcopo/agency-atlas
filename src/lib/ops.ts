// Simple, explainable operations rules: client health states, flags and
// "Today's priorities". Pure functions (no database, no network), tested in
// tests/fixtures.test.ts. Change a number in OPS_RULES to tune them.

import { daysBetween, monthsBetween } from "@/lib/format";
import type {
  ActionPriority,
  CheckIn,
  ClientAction,
  ClientHealth,
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

/** "SEO + Google Ads · $750/mo" (services + the client's total monthly). */
export function planLabel(c: RosterClient): string {
  const names: Record<string, string> = { SEO: "SEO", Ads: "Google Ads", Website: "Website build" };
  const services = c.services.length ? c.services.map((s) => names[s] ?? s).join(" + ") : "Services not set";
  return `${services} · $${c.monthlyUsd.toLocaleString("en-US")}/mo`;
}

/** True when the client's imported follow-up note was already marked done (saved as a completed action). */
export function noteDone(c: RosterClient, actions: ClientAction[]): boolean {
  return Boolean(c.followUp && actions.some((a) => a.client?.dbId === c.dbId && a.status === "done" && a.title === c.followUp));
}

/** Days a client has been waiting for our reply in GoHighLevel (null = not waiting). */
export function waitingDays(c: RosterClient, today: string): number | null {
  const g = c.ghl;
  if (!g?.lastInboundAt) return null;
  if (g.lastOutboundAt && g.lastOutboundAt > g.lastInboundAt) return null;
  // The team logged a contact on or after the day they reached out: answered.
  if (c.lastLogged && c.lastLogged >= g.lastInboundAt.slice(0, 10)) return null;
  return daysBetween(g.lastInboundAt.slice(0, 10), today);
}

export function openActions(actions: ClientAction[], clientDbId: string | undefined): ClientAction[] {
  return clientDbId ? actions.filter((a) => a.client?.dbId === clientDbId && a.status !== "done") : [];
}

/** When an action is due, relative to today. */
/** "Work order" / "Issue" / "Follow-up". */
export function kindLabel(kind: ClientAction["kind"]): string {
  return kind === "work_order" ? "Work order" : kind === "issue" ? "Issue" : "Follow-up";
}

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

const shortDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Was a promise to the client missed (date passed, not done)? */
export function promiseMissed(a: ClientAction, today: string): boolean {
  return Boolean(a.promisedOn && a.status !== "done" && a.promisedOn < today);
}

/** " · blocked: needs logins · promised by Nov 8" etc. Empty when nothing to add. */
export function statusNote(a: ClientAction, today: string): string {
  let out = "";
  if (a.status === "waiting") out += " · waiting on client";
  else if (a.status === "in_progress") out += " · in progress";
  else if (a.status === "blocked") out += a.blockedReason ? ` · blocked: ${a.blockedReason}` : " · blocked";
  if (a.promisedOn && a.status !== "done")
    out += promiseMissed(a, today) ? ` · promise missed (was ${shortDay(a.promisedOn)})` : ` · promised by ${shortDay(a.promisedOn)}`;
  return out;
}

/**
 * Points for the ranked daily list (0–100). Higher = do it first. Change a number to tune.
 * Every point added shows as a plain "why" on screen. All inputs are recorded facts.
 */
export const PRIORITY_POINTS = {
  overdue: 40,
  overduePerDay: 2,
  overdueDayMax: 10,
  today: 30,
  upcoming: 12,
  none: 6,
  critical: 25,
  high: 15,
  normal: 6,
  low: 0,
  promiseMissed: 15,
  promiseSoon: 8, // promised within promiseSoonDays
  promiseSoonDays: 3,
  moneyPer: 60, // +1 point per $60/mo the client pays...
  moneyMax: 12, // ...up to this
  clientAtRisk: 12,
  clientNeedsAttention: 5,
  scoreDrop: 8, // health score fell by scoreDropPoints or more in 7 days
  scoreDropPoints: 15,
  blocked: 5, // someone needs to unblock it
} as const;

/** Score one item and say why. ctx = facts about the client the item is for. */
export function scorePriority(
  item: Pick<PriorityItem, "when" | "priority" | "dueOn" | "action">,
  ctx: { today: string; monthlyUsd?: number; health?: HealthSummary | null; drop?: number | null },
): { score: number; why: string[] } {
  const P = PRIORITY_POINTS;
  const why: string[] = [];
  let n = 0;
  if (item.when === "overdue") {
    const days = item.dueOn ? Math.max(0, daysBetween(item.dueOn, ctx.today)) : 0;
    n += P.overdue + Math.min(P.overdueDayMax, days * P.overduePerDay);
    why.push(days ? `overdue ${plural(days, "day")}` : "overdue");
  } else if (item.when === "today") {
    n += P.today;
    why.push("due today");
  } else n += item.when === "upcoming" ? P.upcoming : P.none;
  n += P[item.priority];
  if (item.priority === "critical" || item.priority === "high") why.push(`${item.priority} priority`);
  const a = item.action;
  if (a && promiseMissed(a, ctx.today)) {
    n += P.promiseMissed;
    why.push("promise to client missed");
  } else if (a?.promisedOn && a.status !== "done" && daysBetween(ctx.today, a.promisedOn) <= P.promiseSoonDays) {
    n += P.promiseSoon;
    why.push(`promised by ${shortDay(a.promisedOn)}`);
  }
  if (a?.status === "blocked") {
    n += P.blocked;
    why.push("blocked: needs unblocking");
  }
  if (ctx.monthlyUsd) {
    const m = Math.min(P.moneyMax, Math.round(ctx.monthlyUsd / P.moneyPer));
    if (m > 0) {
      n += m;
      if (m >= 5) why.push(`${usd(ctx.monthlyUsd)}/mo client`);
    }
  }
  if (ctx.health?.state === "at_risk") {
    n += P.clientAtRisk;
    why.push("client at risk");
  } else if (ctx.health?.state === "needs_attention") n += P.clientNeedsAttention;
  if (ctx.drop !== null && ctx.drop !== undefined && ctx.drop >= P.scoreDropPoints) {
    n += P.scoreDrop;
    why.push(`health down ${ctx.drop} pts this week`);
  }
  return { score: Math.min(100, n), why };
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
  if (c.followUp && !noteDone(c, actions)) attention.push(`Your note: ${c.followUp}`);
  if (c.check) attention.push("Record needs checking");
  if (attention.length) return { state: "needs_attention", reasons: attention };

  const opps = opportunities(c, today);
  if (opps.length) return { state: "opportunity", reasons: opps };
  return { state: "healthy", reasons: c.lastContact ? [`Last contact ${c.lastContact}`] : [] };
}

/**
 * Points for the 0–100 health score. Starts at 100; each fact takes points off
 * (or adds a few). Change a number here to tune it. Every factor shows on the
 * client page with where the fact came from.
 */
export const HEALTH_POINTS = {
  paused: -50,
  checkInOverdue: -25,
  longGap: -15, // extra, when the gap is longGapMultiple x the check-in rhythm
  neverLogged: -10,
  newClient: -10, // first 2 months
  newClientMonths: 2,
  openNote: -10,
  recordCheck: -5,
  moodWorse: -20,
  moodBetter: 10,
  replyWaiting: -15, // client reached out, no reply for replyWithinDays
  replyWaitingLong: -25, // ... for twice that
  unanswered: -10, // unansweredForCall of our messages in a row, no reply
  openIssue: -8,
  openIssueMax: -24,
  criticalIssue: -15,
  overdueItem: -5,
  overdueItemMax: -15,
  promiseMissed: -15, // each, up to promiseMissedMax
  promiseMissedMax: -30,
  /** Score bands: at or above healthy = healthy, at or above watch = watch, else at risk. */
  healthy: 75,
  watch: 50,
} as const;

export type HealthSource = "Client list" | "Logged in app" | "GoHighLevel (times)" | "Not connected";

/**
 * The 0–100 score, from the same facts as the health word. Pure function.
 * All factors are confirmed facts (no AI); the source says where each came from.
 */
export function healthScore(c: RosterClient, checkIn: CheckIn, actions: ClientAction[], today: string): ClientHealth | null {
  if (c.status === "canceled" || c.status === "incomplete_expired") return null;
  const P = HEALTH_POINTS;
  const f: ClientHealth["factors"] = [];
  const add = (label: string, impact: number, source: HealthSource) => f.push({ label, impact, source });

  if (c.status === "paused") add("Paused: not paying right now", P.paused, "Client list");
  if (checkIn.state === "overdue") add(`Check-in overdue (every ${checkIn.cadenceDays} days)`, P.checkInOverdue, "Logged in app");
  if (checkIn.state === "never_logged") add("No check-in logged yet", P.neverLogged, "Logged in app");
  const gap = c.lastContact ? daysBetween(c.lastContact, today) : null;
  if (gap !== null && gap > checkIn.cadenceDays * OPS_RULES.longGapMultiple)
    add(`No contact in ${gap} days`, P.longGap, "Logged in app");
  const months = monthsBetween(c.startDate, today);
  if (months < P.newClientMonths) add("New client: the first 2 months need extra care", P.newClient, "Client list");
  if (c.followUp && !noteDone(c, actions)) add(`Open follow-up: ${c.followUp}`, P.openNote, "Client list");
  if (c.check) add("Record needs checking", P.recordCheck, "Client list");
  if (c.lastMood?.mood === "worse") add(`Last check-in (${c.lastMood.date}): things got worse`, P.moodWorse, "Logged in app");
  if (c.lastMood?.mood === "better") add(`Last check-in (${c.lastMood.date}): things are getting better`, P.moodBetter, "Logged in app");
  if (c.lastMood?.mood === "same") add(`Last check-in (${c.lastMood.date}): holding steady`, 0, "Logged in app");

  const wait = waitingDays(c, today);
  if (wait !== null && wait >= OPS_RULES.replyWithinDays * 2) add(`Client reached out ${wait} days ago; no reply yet`, P.replyWaitingLong, "GoHighLevel (times)");
  else if (wait !== null && wait >= OPS_RULES.replyWithinDays) add(`Client reached out ${wait} days ago; no reply yet`, P.replyWaiting, "GoHighLevel (times)");
  if (c.ghl && c.ghl.unansweredOutbound >= OPS_RULES.unansweredForCall)
    add(`${c.ghl.unansweredOutbound} of our messages in a row with no reply`, P.unanswered, "GoHighLevel (times)");

  const mine = openActions(actions, c.dbId);
  const issues = mine.filter((a) => a.kind === "issue");
  if (issues.length) add(plural(issues.length, "open issue"), Math.max(P.openIssueMax, issues.length * P.openIssue), "Logged in app");
  for (const i of issues.filter((x) => x.priority === "critical")) add(`Critical issue: ${i.title}`, P.criticalIssue, "Logged in app");
  const overdue = mine.filter((a) => a.dueOn !== null && a.dueOn < today);
  if (overdue.length) add(`${plural(overdue.length, "item")} past due`, Math.max(P.overdueItemMax, overdue.length * P.overdueItem), "Logged in app");
  const missed = mine.filter((a) => promiseMissed(a, today));
  for (const [i, a] of missed.entries())
    add(`Promise missed: ${a.title} (was ${shortDay(a.promisedOn!)})`, (i + 1) * P.promiseMissed >= P.promiseMissedMax ? P.promiseMissed : 0, "Logged in app");

  if (months >= 12) add(`Long-term client (${months} months)`, 0, "Client list");
  add("SEO, ads and website results: not connected yet", 0, "Not connected");

  const score = Math.min(100, Math.max(0, 100 + f.reduce((n, x) => n + x.impact, 0)));
  return { score, level: score >= P.healthy ? "healthy" : score >= P.watch ? "watch" : "at_risk", factors: f, checkIn };
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
  /** Health score points lost in the last 7 days, per client slug (from the daily history). */
  drops?: Map<string, number>;
}): PriorityItem[] {
  const { clients, actions, health, checkIns, today, leadNames, newLeadsWithoutAction, drops } = input;
  const items: PriorityItem[] = [];
  const planOf = new Map(clients.map((c) => [c.id, planLabel(c)]));

  for (const a of actions.filter((x) => x.status !== "done")) {
    // A missed promise is overdue even if the internal due date isn't.
    const due = dueWhen(a.dueOn, today);
    const when = promiseMissed(a, today) ? "overdue" : due;
    const label = kindLabel(a.kind);
    const status = statusNote(a, today);
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
      plan: a.client ? planOf.get(a.client.slug) : undefined,
    });
  }

  for (const c of clients.filter((x) => x.status === "active")) {
    if (openActions(actions, c.dbId).length) continue; // its own action already covers it
    const h = health.get(c.id);
    const ci = checkIns.get(c.id);
    const base = { href: `/clients/${c.id}`, ownerName: c.ownerName ?? null, ownerId: c.ownerId ?? null, dueOn: null, clientSlug: c.id, plan: planLabel(c), flagKind: "contact" as const };
    // Contacted in the last week: an at-risk reason like "paused" isn't a new to-do every day.
    const recentlyContacted = Boolean(c.lastContact && daysBetween(c.lastContact, today) < 7);
    const isNew = daysBetween(c.startDate, today) <= OPS_RULES.newClientDays && c.startDate <= today;
    const wait = waitingDays(c, today);
    if (wait !== null && wait >= OPS_RULES.replyWithinDays) {
      items.push({ ...base, id: `f_reply_${c.id}`, title: `Reply to ${c.name}`, reason: `They reached out ${wait} days ago; no reply yet`, when: "overdue", priority: "high" });
    } else if (h?.state === "at_risk" && !recentlyContacted) {
      items.push({ ...base, id: `f_risk_${c.id}`, title: `Check on ${c.name}`, reason: `At risk: ${h.reasons[0]}`, when: "today", priority: "high" });
    } else if (isNew && !c.lastContact) {
      items.push({ ...base, id: `f_new_${c.id}`, title: `First-month check-in: ${c.name}`, reason: `Started ${c.startDate}; no contact logged yet`, when: "today", priority: "high" });
    } else if (c.followUp && !noteDone(c, actions)) {
      items.push({ ...base, flagKind: "note", id: `f_note_${c.id}`, title: `Follow up: ${c.name}`, reason: `Your note: ${c.followUp}`, when: "today", priority: "normal" });
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

  // Rank: priority score (urgency, money, client risk, promises), then the old tie-breakers.
  const byClient = new Map(clients.map((c) => [c.id, c]));
  for (const i of items) {
    const slug = i.clientSlug ?? i.action?.client?.slug;
    const c = slug ? byClient.get(slug) : undefined;
    const r = scorePriority(i, { today, monthlyUsd: c?.monthlyUsd, health: slug ? health.get(slug) : null, drop: slug ? (drops?.get(slug) ?? null) : null });
    i.score = r.score;
    i.why = r.why;
  }
  return items.sort(
    (a, b) =>
      (b.score ?? 0) - (a.score ?? 0) ||
      WHEN_RANK[a.when] - WHEN_RANK[b.when] ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      Number(!a.action) - Number(!b.action) ||
      (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"),
  );
}

export type WorkBucket = "overdue" | "today" | "upcoming" | "waiting" | "blocked";

/** One person's queue (or everyone's when ownerId is undefined; null = unowned). */
export function myWork(items: PriorityItem[], ownerId: string | null | undefined) {
  const mine = items.filter((i) => !i.id.startsWith("g_") && (ownerId === undefined || (i.ownerId ?? null) === ownerId));
  const buckets: Record<WorkBucket, PriorityItem[]> = { overdue: [], today: [], upcoming: [], waiting: [], blocked: [] };
  for (const i of mine) {
    if (i.action?.status === "blocked") buckets.blocked.push(i);
    else if (i.action?.status === "waiting") buckets.waiting.push(i);
    else if (i.when === "overdue") buckets.overdue.push(i);
    else if (i.when === "today") buckets.today.push(i);
    else buckets.upcoming.push(i);
  }
  return buckets;
}

/** Per-person load for managers: open items, overdue, clients owned. */
export function teamLoad(
  staff: { id: string; name: string }[],
  clients: RosterClient[],
  actions: ClientAction[],
  today: string,
  /** Things marked done in the last 7 days, credited to an owner (null = no owner). */
  done: { ownerId: string | null }[] = [],
) {
  const open = actions.filter((a) => a.status !== "done");
  const row = (ownerId: string | null) => {
    const mine = open.filter((a) => (a.ownerId ?? null) === ownerId);
    return {
      open: mine.length,
      overdue: mine.filter((a) => a.dueOn !== null && a.dueOn < today).length,
      clients: ownerId ? clients.filter((c) => c.status === "active" && c.ownerId === ownerId).length : clients.filter((c) => c.status === "active" && !c.ownerId).length,
      done7: done.filter((d) => (d.ownerId ?? null) === ownerId).length,
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

export type BoardColumn = "open" | "in_progress" | "waiting" | "blocked" | "done";

/**
 * Work board columns from the saved follow-ups and issues (same status as everywhere
 * else, so the board and lists always agree). ownerId: undefined = everyone, null = no owner.
 * Done shows only the last 7 days. Each column: overdue first, then by due date.
 */
export function boardColumns(actions: ClientAction[], ownerId: string | null | undefined, today: string): Record<BoardColumn, ClientAction[]> {
  const weekAgo = new Date(Date.parse(`${today}T00:00:00Z`) - 7 * 86_400_000).toISOString();
  const cols: Record<BoardColumn, ClientAction[]> = { open: [], in_progress: [], waiting: [], blocked: [], done: [] };
  for (const a of actions) {
    if (ownerId !== undefined && (a.ownerId ?? null) !== ownerId) continue;
    if (a.status === "done") {
      if (a.doneAt && a.doneAt >= weekAgo) cols.done.push(a);
    } else cols[a.status].push(a);
  }
  const byDue = (x: ClientAction, y: ClientAction) =>
    PRIORITY_RANK[x.priority] - PRIORITY_RANK[y.priority] || (x.dueOn ?? "9999").localeCompare(y.dueOn ?? "9999");
  for (const k of ["open", "in_progress", "waiting", "blocked"] as const)
    cols[k].sort((x, y) => Number(dueWhen(y.dueOn, today) === "overdue") - Number(dueWhen(x.dueOn, today) === "overdue") || byDue(x, y));
  cols.done.sort((x, y) => (y.doneAt ?? "").localeCompare(x.doneAt ?? ""));
  return cols;
}


/** Health score change vs. about a week ago, from the saved daily history (null = not enough history yet). */
export function scoreTrend(history: { day: string; score: number }[], todayScore: number, today: string): { change: number; since: string } | null {
  const past = history.filter((h) => h.day < today && daysBetween(h.day, today) >= 2).sort((a, b) => b.day.localeCompare(a.day));
  if (!past.length) return null;
  // Prefer the newest row at least 7 days old; otherwise the oldest we have (2+ days old).
  const base = past.find((h) => daysBetween(h.day, today) >= 7) ?? past[past.length - 1]!;
  return { change: todayScore - base.score, since: base.day };
}

export interface RiskAlert {
  id: string;
  severity: "critical" | "high" | "medium";
  client: { slug: string; name: string; monthlyUsd: number; ownerName: string | null };
  problem: string;
  /** The recorded facts behind it (each with its source). */
  evidence: { label: string; impact: number; source?: string }[];
  /** Every alert here is built from records, never an AI guess. */
  confidence: "Confirmed facts";
  action: string;
  score: number;
  trend: { change: number; since: string } | null;
  /** First day the score history shows this client in the at-risk band (today if no history). */
  detectedOn: string;
  href: string;
}

/** What to do first, from the biggest problem. Plain rules; edit freely. */
function riskAction(top: string): string {
  if (/promise missed/i.test(top)) return "Deliver it or call the client today with a new date";
  if (/reached out|no reply/i.test(top)) return "Reply today; call if messages go unanswered";
  if (/messages in a row/i.test(top)) return "Try a phone call instead of another message";
  if (/paused/i.test(top)) return "Win-back call: ask what would bring them back";
  if (/got worse/i.test(top)) return "Call to ask what changed and agree a fix";
  if (/issue/i.test(top)) return "Fix or update the client on the open issues";
  if (/check-in|contact/i.test(top)) return "Call to check in this week";
  if (/past due/i.test(top)) return "Clear the overdue items or reset dates with the client";
  return "Review the account and add a next action";
}

/**
 * One alert per client that may cancel: at-risk health word, at-risk score band, or a
 * score drop of PRIORITY_POINTS.scoreDropPoints+ in a week. Never duplicated.
 */
export function riskAlerts(input: {
  clients: RosterClient[];
  scores: Map<string, ClientHealth | null>;
  health: Map<string, HealthSummary | null>;
  history: Map<string, { day: string; score: number; level: string }[]>;
  today: string;
}): RiskAlert[] {
  const { clients, scores, health, history, today } = input;
  const out: RiskAlert[] = [];
  for (const c of clients.filter((x) => x.status === "active" || x.status === "paused")) {
    const sc = scores.get(c.id);
    if (!sc) continue;
    const h = health.get(c.id);
    const hist = c.dbId ? (history.get(c.dbId) ?? []) : [];
    const trend = scoreTrend(hist, sc.score, today);
    const dropped = trend !== null && -trend.change >= PRIORITY_POINTS.scoreDropPoints;
    if (h?.state !== "at_risk" && sc.level !== "at_risk" && !dropped) continue;
    const evidence = sc.factors.filter((f) => f.impact < 0).sort((a, b) => a.impact - b.impact);
    const problem: string = h?.state === "at_risk" && h.reasons[0] ? h.reasons[0] : dropped ? `Health score down ${-trend!.change} points since ${shortDay(trend!.since)}` : (evidence[0]?.label ?? "Low health score");
    // Paused clients already stopped paying: a win-back, never above "high". Active clients come first.
    const severity =
      c.status !== "paused" && (sc.score < 40 || (h?.state === "at_risk" && c.monthlyUsd >= 500))
        ? "critical"
        : h?.state === "at_risk" || sc.level === "at_risk"
          ? "high"
          : "medium";
    // Detected: start of the latest unbroken run of at-risk days in the history.
    let detectedOn = today;
    for (const r of [...hist].sort((a, b) => b.day.localeCompare(a.day))) {
      if (r.level !== "at_risk") break;
      detectedOn = r.day;
    }
    out.push({
      id: `risk_${c.id}`,
      severity,
      client: { slug: c.id, name: c.name, monthlyUsd: c.monthlyUsd, ownerName: c.ownerName ?? null },
      problem,
      evidence,
      confidence: "Confirmed facts",
      action: riskAction(problem),
      score: sc.score,
      trend,
      detectedOn,
      href: `/clients/${c.id}`,
    });
  }
  const sev = { critical: 0, high: 1, medium: 2 } as const;
  const paused = new Set(clients.filter((c) => c.status === "paused").map((c) => c.id));
  return out.sort((a, b) => Number(paused.has(a.client.slug)) - Number(paused.has(b.client.slug)) || sev[a.severity] - sev[b.severity] || b.client.monthlyUsd - a.client.monthlyUsd || a.score - b.score);
}


// ---------------------------------------------------------------------------
// Work orders (0010): one list of the work to do, grouped by person, with a simple
// breakdown per person. Uses the same items as everywhere else (no second list).
// ---------------------------------------------------------------------------

export type WorkOrderShow = "work" | "all";

/** Time estimate choices (minutes). The server accepts only these. */
export const EST_OPTIONS = [
  [15, "15 min"],
  [30, "30 min"],
  [60, "1 hour"],
  [120, "2 hours"],
  [240, "Half a day"],
  [480, "A day"],
  [960, "Two days"],
] as const;
export type WorkOrderStatusFilter = "open" | "blocked" | "overdue" | "done";

/** "1h 30m", "45m", "6h". */
export function minutesLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
}

/** Steps typed one per line ("- ", "1. " and "[ ] " prefixes are dropped). At most 20. */
export function parseSteps(steps: string | null | undefined): string[] {
  if (!steps) return [];
  return steps
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d{1,2}[.)]|\[[ xX]?\])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 20);
}

export interface WorkOrderStats {
  open: number;
  dueThisWeek: number;
  overdue: number;
  blocked: number;
  /** Sum of time estimates on open items (items without one aren't counted). */
  estMinutesOpen: number;
  /** Open items without a time estimate. */
  noEstimate: number;
  /** Finished in the last 7 days, and how many of those after their due date. */
  done7: number;
  doneLate7: number;
}

export interface WorkOrderGroup {
  ownerId: string | null;
  ownerName: string;
  stats: WorkOrderStats;
  items: ClientAction[];
}

/** Late = finished after the due date (or after the date promised to the client). */
export function finishedLate(a: ClientAction): boolean {
  if (a.status !== "done" || !a.doneAt) return false;
  const day = a.doneAt.slice(0, 10);
  return Boolean((a.dueOn && day > a.dueOn) || (a.promisedOn && day > a.promisedOn));
}

function emptyStats(): WorkOrderStats {
  return { open: 0, dueThisWeek: 0, overdue: 0, blocked: 0, estMinutesOpen: 0, noEstimate: 0, done7: 0, doneLate7: 0 };
}

/**
 * Work orders grouped by person (people with the most overdue first, "No owner" last).
 * - show "work": work orders and issues (the delivery work); "all" adds follow-ups.
 * - who: undefined = everyone, null = no owner, or one person's id.
 * - client: a client slug, or undefined for all clients.
 * - status: what to list. The breakdown numbers always count everything for that person.
 */
export function workOrderGroups(input: {
  actions: ClientAction[];
  staff: { id: string; name: string }[];
  today: string;
  show?: WorkOrderShow;
  who?: string | null;
  client?: string;
  status?: WorkOrderStatusFilter;
}): WorkOrderGroup[] {
  const { actions, staff, today, show = "work", who, client, status = "open" } = input;
  const weekAgo = new Date(Date.parse(`${today}T00:00:00Z`) - 7 * 86_400_000).toISOString();
  const weekAhead = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
  const twoWeeksAgo = new Date(Date.parse(`${today}T00:00:00Z`) - 14 * 86_400_000).toISOString();
  const nameOf = new Map(staff.map((m) => [m.id, m.name]));
  const groups = new Map<string, WorkOrderGroup>();
  const groupFor = (ownerId: string | null) => {
    const key = ownerId ?? "none";
    let g = groups.get(key);
    if (!g) {
      g = { ownerId, ownerName: ownerId ? (nameOf.get(ownerId) ?? "Former teammate") : "No owner", stats: emptyStats(), items: [] };
      groups.set(key, g);
    }
    return g;
  };
  for (const a of actions) {
    if (show === "work" && a.kind === "follow_up") continue;
    if (who !== undefined && (a.ownerId ?? null) !== who) continue;
    if (client && a.client?.slug !== client) continue;
    const g = groupFor(a.ownerId ?? null);
    const s = g.stats;
    const overdue = promiseMissed(a, today) || dueWhen(a.dueOn, today) === "overdue";
    if (a.status === "done") {
      if (a.doneAt && a.doneAt >= weekAgo) {
        s.done7++;
        if (finishedLate(a)) s.doneLate7++;
      }
    } else {
      s.open++;
      if (overdue) s.overdue++;
      else if (a.dueOn && a.dueOn <= weekAhead) s.dueThisWeek++;
      if (a.status === "blocked") s.blocked++;
      if (a.estMinutes) s.estMinutesOpen += a.estMinutes;
      else s.noEstimate++;
    }
    const listed =
      status === "done"
        ? a.status === "done" && Boolean(a.doneAt && a.doneAt >= twoWeeksAgo)
        : a.status !== "done" && (status === "open" || (status === "blocked" ? a.status === "blocked" : overdue));
    if (listed) g.items.push(a);
  }
  const rank = (a: ClientAction) => (promiseMissed(a, today) || dueWhen(a.dueOn, today) === "overdue" ? 0 : a.status === "blocked" ? 1 : 2);
  for (const g of groups.values())
    g.items.sort((x, y) =>
      status === "done"
        ? (y.doneAt ?? "").localeCompare(x.doneAt ?? "")
        : rank(x) - rank(y) || PRIORITY_RANK[x.priority] - PRIORITY_RANK[y.priority] || (x.dueOn ?? "9999").localeCompare(y.dueOn ?? "9999"),
    );
  return [...groups.values()]
    .filter((g) => g.items.length || g.stats.open || g.stats.done7)
    .sort((x, y) => Number(x.ownerId === null) - Number(y.ownerId === null) || y.stats.overdue - x.stats.overdue || y.stats.open - x.stats.open || x.ownerName.localeCompare(y.ownerName));
}

/**
 * Plain text of work orders, to paste into a GoHighLevel task or message by hand.
 * The app never sends it anywhere. Includes no money and no health details.
 */
export function workOrdersAsText(groups: WorkOrderGroup[], today: string): string {
  const lines: string[] = [];
  for (const g of groups) {
    if (!g.items.length) continue;
    lines.push(`${g.ownerName}: ${g.items.length} item${g.items.length === 1 ? "" : "s"}`);
    for (const a of g.items) {
      const bits = [a.client?.name, kindLabel(a.kind), a.status === "done" ? "Done" : dueLabel(a.dueOn, today)].filter(Boolean);
      lines.push(`- [${a.priority.toUpperCase()}] ${a.title} (${bits.join(" · ")}${a.status !== "done" ? statusNote(a, today) : ""})`);
      if (a.estMinutes) lines.push(`  Time: about ${minutesLabel(a.estMinutes)}`);
      for (const step of parseSteps(a.steps)) lines.push(`  [ ] ${step}`);
      if (a.sourceLink) lines.push(`  From: ${a.sourceNote ? `${a.sourceNote} ` : ""}${a.sourceLink}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

/** Contact dates for a developer's client (no notes, no message text). */
export interface ClientContactDates {
  slug: string;
  name: string;
  lastLoggedOn: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  lastCallAt: string | null;
  unanswered: number;
}

/** Last contact (newest of logged, GoHighLevel in/out, call) and plain flags, for the developer view. */
export function contactSummary(c: ClientContactDates, today: string): { lastContact: string | null; daysSince: number | null; flags: string[] } {
  const dates = [c.lastLoggedOn, c.lastInboundAt?.slice(0, 10), c.lastOutboundAt?.slice(0, 10), c.lastCallAt?.slice(0, 10)].filter((d): d is string => Boolean(d));
  const lastContact = dates.sort().at(-1) ?? null;
  const flags: string[] = [];
  if (c.lastInboundAt && (!c.lastOutboundAt || c.lastInboundAt > c.lastOutboundAt)) {
    const wait = daysBetween(c.lastInboundAt.slice(0, 10), today);
    if (wait >= OPS_RULES.replyWithinDays) flags.push(`Client reached out ${plural(wait, "day")} ago; no reply yet`);
  }
  if (c.unanswered >= OPS_RULES.unansweredForCall) flags.push(`${c.unanswered} of our messages unanswered: a call may work better`);
  return { lastContact, daysSince: lastContact ? daysBetween(lastContact, today) : null, flags };
}

/** An AI-drafted work order already added (same client + same title, any status). */
export function draftAdded(draft: { clientSlug: string | null; title: string }, actions: ClientAction[]): boolean {
  const t = draft.title.trim().toLowerCase();
  return actions.some((a) => (a.client?.slug ?? null) === draft.clientSlug && a.title.trim().toLowerCase() === t);
}
