// Work hub (docs/WORK_HUB_PLAN.md): the owner and managers' one Work screen.
// Pure, tested rules: reading the filters from the web address, the stat chip counts,
// the Overdue / Today / This week / Later groups, and the "Nov 20 · 5d late" wording.
// The same items as everywhere else (ops.actions); nothing here reads or writes data.

import { dueWhen, PRIORITY_RANK, promiseMissed } from "@/lib/ops";
import { CAPACITY_MINUTES_PER_DAY, DEFAULT_ESTIMATE_MINUTES } from "@/lib/work-orders";
import type { ActionKind, ActionPriority, ClientAction } from "@/lib/types";

export type HubView = "list" | "board" | "team";
export type HubChip = "overdue" | "today" | "upcoming" | "waiting" | "blocked" | "unassigned" | "review";
/** "now" = overdue or due today (the "My work today" saved view); not shown as a chip. */
export type HubChipValue = HubChip | "now";
export type HubGroup = "overdue" | "today" | "week" | "later";

export const HUB_CHIPS: { id: HubChip; label: string }[] = [
  { id: "overdue", label: "Overdue" },
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "waiting", label: "Waiting" },
  { id: "blocked", label: "Blocked" },
  { id: "unassigned", label: "Unassigned" },
  { id: "review", label: "In review" },
];

export const HUB_GROUPS: { id: HubGroup; label: string }[] = [
  { id: "overdue", label: "Overdue" },
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "later", label: "Later" },
];

export const HUB_TYPES: { id: ActionKind; label: string }[] = [
  { id: "work_order", label: "Work orders" },
  { id: "issue", label: "Issues" },
  { id: "follow_up", label: "Follow-ups" },
];

const PRIORITIES: ActionPriority[] = ["critical", "high", "normal", "low"];
const CHIP_VALUES: HubChipValue[] = [...HUB_CHIPS.map((c) => c.id), "now"];

export interface HubFilters {
  view: HubView;
  /** Search words (title, client, notes, steps), lower-cased when matching. */
  q: string;
  chip?: HubChipValue;
  /** undefined = everyone, null = no one assigned, or one person's id. */
  who?: string | null;
  client?: string;
  type?: ActionKind;
  prio?: ActionPriority;
  /** The item open in the drawer (Phase 2), by id. */
  open?: string;
}

export type HubParams = Partial<Record<"view" | "q" | "chip" | "who" | "client" | "type" | "prio" | "open", string>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reads the filters from the address. Anything unknown is ignored (never trusted). */
export function parseHubFilters(sp: HubParams, known: { staffIds: string[]; clientSlugs: string[] }): HubFilters {
  const view: HubView = sp.view === "board" || sp.view === "team" ? sp.view : "list";
  const q = (sp.q ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const chip = CHIP_VALUES.includes(sp.chip as HubChipValue) ? (sp.chip as HubChipValue) : undefined;
  const who = sp.who === "none" ? null : sp.who && known.staffIds.includes(sp.who) ? sp.who : undefined;
  const client = sp.client && known.clientSlugs.includes(sp.client) ? sp.client : undefined;
  const type = HUB_TYPES.some((t) => t.id === sp.type) ? (sp.type as ActionKind) : undefined;
  const prio = PRIORITIES.includes(sp.prio as ActionPriority) ? (sp.prio as ActionPriority) : undefined;
  const open = sp.open && UUID.test(sp.open) ? sp.open.toLowerCase() : undefined;
  return { view, q, chip, who, client, type, prio, open };
}

/** The address for these filters with some changed (undefined removes one). */
export function hubHref(f: HubFilters, over: Partial<Record<keyof HubFilters, string | null | undefined>> = {}): string {
  const base: Record<string, string | undefined> = {
    view: f.view === "list" ? undefined : f.view,
    q: f.q || undefined,
    chip: f.chip,
    who: f.who === null ? "none" : f.who,
    client: f.client,
    type: f.type,
    prio: f.prio,
    open: f.open,
  };
  for (const [k, v] of Object.entries(over)) base[k] = v === null ? (k === "who" ? "none" : undefined) : v || undefined;
  if (base.view === "list") base.view = undefined;
  const q = new URLSearchParams();
  for (const k of ["view", "q", "chip", "who", "client", "type", "prio", "open"]) if (base[k]) q.set(k, base[k]!);
  const s = q.toString();
  return `/work${s ? `?${s}` : ""}`;
}

/**
 * Old Work orders addresses (/work/orders?status=…&due=…) as Work hub addresses,
 * so bookmarks and links keep working. Person, client and board view carry over.
 */
export function legacyOrdersHref(sp: Record<string, string | undefined>): string {
  const chip = sp.status === "blocked" ? "blocked" : sp.status === "review" ? "review" : sp.status === "overdue" || sp.due === "overdue" ? "overdue" : undefined;
  const q = new URLSearchParams();
  if (sp.view === "board") q.set("view", "board");
  if (chip) q.set("chip", chip);
  if (sp.who && /^(none|[0-9a-f-]{36})$/i.test(sp.who)) q.set("who", sp.who);
  if (sp.client && /^[a-z0-9-]{1,90}$/.test(sp.client)) q.set("client", sp.client);
  // "Add" and "Suggestions" links open their pop-ups (Phase 3).
  if (sp.new === "1") q.set("new", "1");
  if (sp.suggest === "1") q.set("suggest", "1");
  const s = q.toString();
  return `/work${s ? `?${s}` : ""}`;
}

/** Not finished: everything still on someone's plate. */
export function isOpen(a: Pick<ClientAction, "status">): boolean {
  return a.status !== "done" && a.status !== "canceled";
}

/** Overdue = past its due date, or past the date promised to the client. */
export function isOverdue(a: ClientAction, today: string): boolean {
  return isOpen(a) && (dueWhen(a.dueOn, today) === "overdue" || promiseMissed(a, today));
}

export function matchesChip(a: ClientAction, chip: HubChipValue, today: string): boolean {
  if (!isOpen(a)) return false;
  switch (chip) {
    case "overdue":
      return isOverdue(a, today);
    case "today":
      return a.dueOn === today;
    case "now":
      return isOverdue(a, today) || a.dueOn === today;
    case "upcoming":
      return Boolean(a.dueOn && a.dueOn > today) && !isOverdue(a, today);
    case "waiting":
      return a.status === "waiting";
    case "blocked":
      return a.status === "blocked";
    case "unassigned":
      return !a.ownerId;
    case "review":
      return a.status === "review";
  }
}

/** Search text for an item: title, client, notes and steps (no contact details are stored here). */
function haystack(a: ClientAction, extra: string | undefined): string {
  return [a.title, a.client?.name, extra, a.notes, a.steps, a.blockedReason].filter(Boolean).join(" ").toLowerCase();
}

/**
 * The items in view before the chip: person, client, type, priority and search.
 * Chip counts are worked out on these, so they always match the current person.
 * extraLabel: e.g. a lead's name, so search finds lead follow-ups too.
 */
export function inScope(actions: ClientAction[], f: HubFilters, extraLabel: (a: ClientAction) => string | undefined = () => undefined): ClientAction[] {
  const words = f.q.toLowerCase().split(" ").filter(Boolean);
  return actions.filter((a) => {
    if (a.archivedAt || a.status === "canceled") return false;
    if (f.who !== undefined && (a.ownerId ?? null) !== f.who) return false;
    if (f.client && a.client?.slug !== f.client) return false;
    if (f.type && a.kind !== f.type) return false;
    if (f.prio && a.priority !== f.prio) return false;
    if (words.length) {
      const h = haystack(a, extraLabel(a));
      if (!words.every((w) => h.includes(w))) return false;
    }
    return true;
  });
}

export function chipCounts(scope: ClientAction[], today: string): Record<HubChip, number> {
  const out = Object.fromEntries(HUB_CHIPS.map((c) => [c.id, 0])) as Record<HubChip, number>;
  for (const a of scope) for (const c of HUB_CHIPS) if (matchesChip(a, c.id, today)) out[c.id]++;
  return out;
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Which list group an open item goes in. "This week" = the next 6 days; no date = Later. */
export function hubGroup(a: ClientAction, today: string): HubGroup {
  if (isOverdue(a, today)) return "overdue";
  if (a.dueOn === today) return "today";
  if (a.dueOn && a.dueOn <= addDays(today, 6)) return "week";
  return "later";
}

/** Open items in the four groups. Within a group: urgent first, then by due date, then title. */
export function groupForList(items: ClientAction[], today: string): Record<HubGroup, ClientAction[]> {
  const out: Record<HubGroup, ClientAction[]> = { overdue: [], today: [], week: [], later: [] };
  for (const a of items) if (isOpen(a)) out[hubGroup(a, today)].push(a);
  for (const list of Object.values(out))
    list.sort((x, y) => PRIORITY_RANK[x.priority] - PRIORITY_RANK[y.priority] || (x.dueOn ?? "9999").localeCompare(y.dueOn ?? "9999") || x.title.localeCompare(y.title));
  return out;
}

/** Done in the last 7 days, newest first (for the folded "Done this week" group). */
export function doneThisWeek(items: ClientAction[], today: string): ClientAction[] {
  const weekAgo = `${addDays(today, -7)}T00:00:00.000Z`;
  return items.filter((a) => a.status === "done" && (a.doneAt ?? "") >= weekAgo).sort((x, y) => (y.doneAt ?? "").localeCompare(x.doneAt ?? ""));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Nov 20" (the year too when it isn't this year). */
export function shortDate(day: string, today: string): string {
  const [y = 0, m = 1, d = 1] = day.split("-").map(Number);
  const label = `${MONTHS[m - 1] ?? ""} ${d}`;
  return day.slice(0, 4) === today.slice(0, 4) ? label : `${label}, ${y}`;
}

/** The real due date with a short hint: "Nov 20 · 5d late", "Today", "Tomorrow", "Nov 28 · in 3d", "No date". */
export function dueHint(dueOn: string | null | undefined, today: string): { text: string; tone: "late" | "today" | "soon" | "later" | "none" } {
  if (!dueOn) return { text: "No date", tone: "none" };
  const days = Math.round((Date.parse(`${dueOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days < 0) return { text: `${shortDate(dueOn, today)} · ${-days}d late`, tone: "late" };
  if (days === 0) return { text: "Today", tone: "today" };
  if (days === 1) return { text: "Tomorrow", tone: "soon" };
  return { text: `${shortDate(dueOn, today)} · in ${days}d`, tone: days <= 6 ? "soon" : "later" };
}

/** Up to two initials for an owner circle ("Unassigned" is shown as a pill instead). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0] ?? "";
  const last = parts[parts.length - 1] ?? "";
  return (parts.length === 1 ? first.slice(0, 2) : `${first.charAt(0)}${last.charAt(0)}`).toUpperCase();
}

/** Saved views: fixed shortcuts (no database). "My work today" needs your login linked to your team profile. */
export function savedViews(myStaffId: string | null | undefined): { id: string; label: string; set: Partial<Record<keyof HubFilters, string | null | undefined>> }[] {
  return [
    ...(myStaffId ? [{ id: "mine", label: "My work today", set: { who: myStaffId, chip: "now" } }] : []),
    { id: "overdue", label: "Overdue", set: { who: undefined, chip: "overdue" } },
    { id: "unassigned", label: "Unassigned", set: { who: undefined, chip: "unassigned" } },
    { id: "blocked", label: "Blocked", set: { who: undefined, chip: "blocked" } },
  ];
}

// ---------------------------------------------------------------------------
// Suggestions (Phase 3): dismissed ones stay hidden while their reason is the same (0038).
// ---------------------------------------------------------------------------

/** Free rule suggestions (ops.ts) plus "ai" for the saved AI drafts. Must match 0038's check. */
export const SUGGESTION_RULES = ["risk", "onboarding", "routine", "ai"] as const;
export type SuggestionRule = (typeof SUGGESTION_RULES)[number];

/** One suggestion's identity: client + rule + reason. A new reason = a new suggestion. */
export function suggestionKey(clientSlug: string, rule: SuggestionRule, reason: string): string {
  return `${clientSlug}|${rule}|${reason.trim().slice(0, 300)}`;
}

/** Leaves out the suggestions that were dismissed for the same reason. */
export function withoutDismissed<T extends { clientSlug: string | null; why: string }>(items: T[], rule: (item: T) => SuggestionRule, dismissed: ReadonlySet<string>): T[] {
  return items.filter((s) => !s.clientSlug || !dismissed.has(suggestionKey(s.clientSlug, rule(s), s.why)));
}

// ---------------------------------------------------------------------------
// Team view (Phase 4): hours due in the next 7 days against weekly capacity.
// ---------------------------------------------------------------------------

/** Weekly hours for everyone, from the shared daily number (5 workdays). Tune in work-orders.ts. */
export const WEEKLY_CAPACITY_MINUTES = CAPACITY_MINUTES_PER_DAY * 5;
/** Load bar: green below `amber`, amber up to `red`, red above it (percent of capacity). */
export const TEAM_LOAD_RULES = { amber: 80, red: 100 } as const;

export interface TeamLoadRow {
  staffId: string;
  name: string;
  /** The founder isn't counted as available unless switched on. */
  counted: boolean;
  /** Open work due in the next 7 days, overdue included (no estimate = DEFAULT_ESTIMATE_MINUTES). */
  weekMinutes: number;
  /** All open work, any date. */
  openMinutes: number;
  openItems: number;
  overdue: number;
  withoutEstimate: number;
  capacityMinutes: number;
  /** weekMinutes as a percent of capacity (rounded). */
  percent: number;
  tone: "green" | "amber" | "red";
}

export function loadTone(percent: number): TeamLoadRow["tone"] {
  return percent > TEAM_LOAD_RULES.red ? "red" : percent >= TEAM_LOAD_RULES.amber ? "amber" : "green";
}

/**
 * Each person's load for the Team view. Open = not done, canceled, archived or waiting for
 * review (same rule as personLoads). People are matched by id and role, never by name.
 */
export function teamLoad(input: { actions: ClientAction[]; team: { id: string; name: string; role: string }[]; today: string; includeFounder: boolean }): { rows: TeamLoadRow[]; totals: { weekMinutes: number; capacityMinutes: number; percent: number; tone: TeamLoadRow["tone"]; unassignedMinutes: number } } {
  const { actions, team, today, includeFounder } = input;
  const weekEnd = new Date(Date.parse(`${today}T00:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10);
  const blank = (m: { id: string; name: string; role: string }): TeamLoadRow => ({
    staffId: m.id,
    name: m.name,
    counted: includeFounder || m.role !== "founder",
    weekMinutes: 0,
    openMinutes: 0,
    openItems: 0,
    overdue: 0,
    withoutEstimate: 0,
    capacityMinutes: WEEKLY_CAPACITY_MINUTES,
    percent: 0,
    tone: "green",
  });
  const byId = new Map(team.map((m) => [m.id, blank(m)]));
  let unassignedMinutes = 0;
  for (const a of actions) {
    if (a.status === "done" || a.status === "canceled" || a.status === "review" || a.archivedAt) continue;
    const minutes = a.estMinutes ?? DEFAULT_ESTIMATE_MINUTES;
    const thisWeek = Boolean(a.dueOn && a.dueOn <= weekEnd);
    const row = a.ownerId ? byId.get(a.ownerId) : undefined;
    if (!row) {
      if (!a.ownerId && thisWeek) unassignedMinutes += minutes;
      continue;
    }
    row.openItems++;
    row.openMinutes += minutes;
    if (!a.estMinutes) row.withoutEstimate++;
    if (a.dueOn && a.dueOn < today) row.overdue++;
    if (thisWeek) row.weekMinutes += minutes;
  }
  const rows = [...byId.values()].map((r) => {
    const percent = Math.round((r.weekMinutes / r.capacityMinutes) * 100);
    return { ...r, percent, tone: loadTone(percent) };
  });
  rows.sort((x, y) => Number(y.counted) - Number(x.counted) || y.percent - x.percent || x.name.localeCompare(y.name));
  const counted = rows.filter((r) => r.counted);
  const weekMinutes = counted.reduce((n, r) => n + r.weekMinutes, 0);
  const capacityMinutes = counted.reduce((n, r) => n + r.capacityMinutes, 0);
  const percent = capacityMinutes ? Math.round((weekMinutes / capacityMinutes) * 100) : 0;
  return { rows, totals: { weekMinutes, capacityMinutes, percent, tone: loadTone(percent), unassignedMinutes } };
}
