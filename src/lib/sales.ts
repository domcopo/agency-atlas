// Sales (0020, docs/SALES_PLAN.md): pure rules, no database, no network. Tested in
// tests/sales.test.ts. Plain rules, free, and every pick says why. Nothing here sends
// anything or nags anyone: the plan is shown when a salesperson opens the app.

import { contactDetailsIn } from "@/lib/work-orders";

/** Tune the numbers here. */
export const SALES_RULES = {
  /** A lead with no reach-out for this many days counts as stuck. */
  stuckDays: 7,
  /** A lead created within this many days with no reach-out counts as new. */
  newDays: 14,
  /** Daily reach-outs when the owner hasn't set a number. */
  defaultTarget: 15,
  /** How many leads Today's plan lists. */
  planSize: 12,
  /** Opening Sales refreshes the leads when the copy is older than this. */
  autoRefreshMinutes: 60,
  /** The database allows one refresh this often, for everyone together. */
  refreshLimitMinutes: 10,
  /** How far back reach-outs are read. */
  touchDays: 30,
} as const;

export const TOUCH_KINDS = [
  { kind: "call", label: "Called" },
  { kind: "text", label: "Texted" },
  { kind: "email", label: "Emailed" },
  { kind: "meeting", label: "Met" },
  { kind: "walk_in", label: "Walk-in" },
  { kind: "other", label: "Other" },
] as const;
export type TouchKind = (typeof TOUCH_KINDS)[number]["kind"];

export function asTouchKind(v: string): TouchKind | null {
  return TOUCH_KINDS.some((k) => k.kind === v) ? (v as TouchKind) : null;
}

export function touchLabel(kind: string): string {
  return TOUCH_KINDS.find((k) => k.kind === kind)?.label ?? "Reached out";
}

export interface SalesPipeline {
  id: string;
  name: string | null;
  hotStages: string[];
  active: boolean;
}

export interface SalesLead {
  ghlId: string;
  name: string;
  pipelineId: string | null;
  pipelineName: string | null;
  stage: string | null;
  status: "open" | "won" | "lost" | "abandoned";
  value: number | null;
  source: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  statusChangedAt: string | null;
  assignedUserId: string | null;
}

export interface LeadTouch {
  leadId: string;
  kind: string;
  at: string;
  /** The login (user id) who logged it. */
  by: string;
}

/** A lead follow-up (an Atlas item tied to a GoHighLevel lead). */
export interface LeadFollowUp {
  id: string;
  leadId: string;
  title: string;
  dueOn: string | null;
  status: string;
  ownerStaffId: string | null;
}

// ---------------------------------------------------------------------------
// Days (New York time, like the rest of the agency's day)
// ---------------------------------------------------------------------------

const NY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });

/** The New York calendar day of a timestamp, "YYYY-MM-DD". */
export function nyDay(iso: string): string {
  return NY.format(new Date(iso));
}

/** Whole days from day a to day b (both "YYYY-MM-DD"). */
export function daysFrom(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function isWeekday(day: string): boolean {
  const d = new Date(`${day}T00:00:00Z`).getUTCDay();
  return d !== 0 && d !== 6;
}

const shortDate = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// ---------------------------------------------------------------------------
// Reach-outs
// ---------------------------------------------------------------------------

/** Newest reach-out per lead. */
export function lastTouchByLead(touches: LeadTouch[]): Map<string, LeadTouch> {
  const out = new Map<string, LeadTouch>();
  for (const t of touches) {
    const prev = out.get(t.leadId);
    if (!prev || t.at > prev.at) out.set(t.leadId, t);
  }
  return out;
}

/** Reach-outs one person logged on a day. */
export function touchesOn(touches: LeadTouch[], userId: string, day: string): number {
  return touches.filter((t) => t.by === userId && nyDay(t.at) === day).length;
}

/** "7 of 15 today". Weekends have no target. */
export function targetProgress(done: number, target: number, day: string): { done: number; target: number; weekday: boolean; met: boolean } {
  const weekday = isWeekday(day);
  const t = weekday ? Math.max(0, Math.round(target)) : 0;
  return { done, target: t, weekday, met: done >= t };
}

/** A reach-out note: short, and never an email address or phone number. */
export function checkTouchNote(raw: string): { note: string | null; error?: string } {
  const note = raw.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (!note) return { note: null };
  if (note.length > 200) return { note: null, error: "Keep the note under 200 characters." };
  const found = contactDetailsIn(note);
  if (found.length) return { note: null, error: `Leave out ${found.join(" and ")}; they stay in GoHighLevel.` };
  return { note };
}

// ---------------------------------------------------------------------------
// Today's plan (the sales coach)
// ---------------------------------------------------------------------------

export type PlanGroup = "follow_up" | "new" | "stuck";

export interface PlanItem {
  lead: SalesLead;
  group: PlanGroup;
  why: string;
  hot: boolean;
  followUpId: string | null;
}

/** Is this lead in one of its pipeline's hot stages? */
export function isHot(lead: SalesLead, pipelines: SalesPipeline[]): boolean {
  if (!lead.stage) return false;
  const p = pipelines.find((x) => x.id === lead.pipelineId);
  return Boolean(p?.hotStages.includes(lead.stage));
}

/** Days since anything happened on a lead: the newest of the last reach-out and the last change in GoHighLevel. */
function quietDays(lead: SalesLead, last: LeadTouch | undefined, today: string): number | null {
  const newest = [last?.at, lead.updatedAt, lead.createdAt].filter((x): x is string => Boolean(x)).sort().pop();
  return newest ? daysFrom(nyDay(newest), today) : null;
}

/**
 * Who to reach out to today, in this order:
 * 1. follow-ups due today or late (late first);
 * 2. new leads nobody has contacted yet (newest first);
 * 3. leads with no reach-out for 7+ days (quietest first).
 * Within each group, hot stages come first. Each lead appears once.
 * mine: the salesperson's GoHighLevel user id. Their leads and unassigned ones count;
 * null shows everyone's. myStaffId: their follow-ups count even on others' leads.
 */
export function todaysPlan(input: {
  leads: SalesLead[];
  touches: LeadTouch[];
  followUps: LeadFollowUp[];
  pipelines: SalesPipeline[];
  today: string;
  mine?: string | null;
  myStaffId?: string | null;
  limit?: number;
}): PlanItem[] {
  const { touches, pipelines, today } = input;
  const open = input.leads.filter((l) => l.status === "open");
  const inScope = (l: SalesLead) => !input.mine || l.assignedUserId === input.mine || l.assignedUserId === null;
  const byId = new Map(open.map((l) => [l.ghlId, l]));
  const last = lastTouchByLead(touches);
  const hotFirst = <T extends { hot: boolean }>(a: T, b: T) => Number(b.hot) - Number(a.hot);

  const followUps: (PlanItem & { due: string })[] = [];
  for (const f of input.followUps) {
    if (f.status === "done" || f.status === "canceled" || !f.dueOn || f.dueOn > today) continue;
    const lead = byId.get(f.leadId);
    if (!lead) continue;
    if (!inScope(lead) && !(input.myStaffId && f.ownerStaffId === input.myStaffId)) continue;
    const late = daysFrom(f.dueOn, today);
    followUps.push({
      lead,
      group: "follow_up",
      why: late > 0 ? `follow-up late (was due ${shortDate(f.dueOn)}): ${f.title}` : `follow-up due today: ${f.title}`,
      hot: isHot(lead, pipelines),
      followUpId: f.id,
      due: f.dueOn,
    });
  }
  followUps.sort((a, b) => hotFirst(a, b) || a.due.localeCompare(b.due));

  const fresh: (PlanItem & { created: string })[] = [];
  const stuck: (PlanItem & { quiet: number })[] = [];
  for (const lead of open.filter(inScope)) {
    const t = last.get(lead.ghlId);
    const age = lead.createdAt ? daysFrom(nyDay(lead.createdAt), today) : null;
    const hot = isHot(lead, pipelines);
    if (!t && age !== null && age <= SALES_RULES.newDays) {
      fresh.push({ lead, group: "new", hot, followUpId: null, created: lead.createdAt!, why: `new ${age === 0 ? "today" : age === 1 ? "yesterday" : `${age} days ago`}, no contact yet` });
      continue;
    }
    const quiet = quietDays(lead, t, today);
    if (quiet !== null && quiet >= SALES_RULES.stuckDays) {
      const where = lead.stage ? `in "${lead.stage}"` : "open";
      stuck.push({ lead, group: "stuck", hot, followUpId: null, quiet, why: `${where}, nothing for ${quiet} days${t ? ` (last: ${touchLabel(t.kind).toLowerCase()})` : ", no reach-out logged"}` });
    }
  }
  fresh.sort((a, b) => hotFirst(a, b) || b.created.localeCompare(a.created));
  stuck.sort((a, b) => hotFirst(a, b) || b.quiet - a.quiet);

  const seen = new Set<string>();
  const out: PlanItem[] = [];
  for (const item of [...followUps, ...fresh, ...stuck]) {
    if (seen.has(item.lead.ghlId)) continue;
    seen.add(item.lead.ghlId);
    out.push({ lead: item.lead, group: item.group, why: item.why, hot: item.hot, followUpId: item.followUpId });
  }
  return out.slice(0, input.limit ?? SALES_RULES.planSize);
}

// ---------------------------------------------------------------------------
// Pipeline health (owner and managers)
// ---------------------------------------------------------------------------

export interface PipelineHealthRow {
  pipelineId: string;
  name: string;
  open: number;
  newThisWeek: number;
  notContacted: number;
  stuck: number;
  touchesToday: number;
  touchesWeek: number;
  wonMonth: number;
  lostMonth: number;
}

/** One row per active sales pipeline. "Not contacted" = open with no reach-out logged in the last 30 days. */
export function pipelineHealth(input: { pipelines: SalesPipeline[]; leads: SalesLead[]; touches: LeadTouch[]; today: string }): PipelineHealthRow[] {
  const { today } = input;
  const last = lastTouchByLead(input.touches);
  const month = today.slice(0, 7);
  return input.pipelines
    .filter((p) => p.active)
    .map((p) => {
      const leads = input.leads.filter((l) => l.pipelineId === p.id);
      const open = leads.filter((l) => l.status === "open");
      const ids = new Set(leads.map((l) => l.ghlId));
      const touches = input.touches.filter((t) => ids.has(t.leadId));
      const changedThisMonth = (l: SalesLead) => Boolean(l.statusChangedAt) && nyDay(l.statusChangedAt!).slice(0, 7) === month;
      return {
        pipelineId: p.id,
        name: p.name ?? "Unnamed pipeline",
        open: open.length,
        newThisWeek: open.filter((l) => l.createdAt && daysFrom(nyDay(l.createdAt), today) < 7).length,
        notContacted: open.filter((l) => !last.has(l.ghlId)).length,
        stuck: open.filter((l) => {
          const q = quietDays(l, last.get(l.ghlId), today);
          return q !== null && q >= SALES_RULES.stuckDays;
        }).length,
        touchesToday: touches.filter((t) => nyDay(t.at) === today).length,
        touchesWeek: touches.filter((t) => daysFrom(nyDay(t.at), today) < 7).length,
        wonMonth: leads.filter((l) => l.status === "won" && changedThisMonth(l)).length,
        lostMonth: leads.filter((l) => l.status === "lost" && changedThisMonth(l)).length,
      };
    });
}

export interface SalesPerson {
  userId: string;
  name: string;
  ghlUserId: string | null;
  staffId: string | null;
  target: number;
}

export interface PersonRow {
  userId: string;
  name: string;
  touchesToday: number;
  target: number;
  weekday: boolean;
  leadsOwned: number | null;
  overdueFollowUps: number;
}

/** Per salesperson: reach-outs today vs target, open leads assigned to them, overdue follow-ups. */
export function personRows(input: { people: SalesPerson[]; leads: SalesLead[]; touches: LeadTouch[]; followUps: LeadFollowUp[]; today: string }): PersonRow[] {
  const { today } = input;
  return input.people.map((p) => {
    const progress = targetProgress(touchesOn(input.touches, p.userId, today), p.target, today);
    return {
      userId: p.userId,
      name: p.name,
      touchesToday: progress.done,
      target: progress.target,
      weekday: progress.weekday,
      leadsOwned: p.ghlUserId ? input.leads.filter((l) => l.status === "open" && l.assignedUserId === p.ghlUserId).length : null,
      overdueFollowUps: p.staffId
        ? input.followUps.filter((f) => f.ownerStaffId === p.staffId && f.status !== "done" && f.status !== "canceled" && f.dueOn !== null && f.dueOn < today).length
        : 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Refreshing the copy
// ---------------------------------------------------------------------------

/** Minutes since a timestamp, or null. */
export function minutesSince(iso: string | null, now: Date): number | null {
  return iso ? Math.floor((now.getTime() - Date.parse(iso)) / 60_000) : null;
}

/** Opening Sales refreshes the leads when the copy is over an hour old (or there's none yet). */
export function refreshDue(lastIso: string | null, now: Date): boolean {
  const m = minutesSince(lastIso, now);
  return m === null || m >= SALES_RULES.autoRefreshMinutes;
}

/** The 10-minute limit (the database enforces it too). */
export function refreshAllowed(lastIso: string | null, now: Date): boolean {
  const m = minutesSince(lastIso, now);
  return m === null || m >= SALES_RULES.refreshLimitMinutes;
}
