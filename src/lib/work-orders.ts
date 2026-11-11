// Work Orders phase 1 (docs/WORK_ORDERS_V2_PLAN.md): deadline colors, due filters, the
// floating button's count, links and the contact-details warning. Pure functions (no
// database, no network), tested in tests/fixtures.test.ts. No GoHighLevel, no AI.

import { daysBetween } from "@/lib/format";
import type { ClientAction } from "@/lib/types";

// ---------------------------------------------------------------------------
// Deadline colors: red = due today or late, orange = 1–2 days, yellow = 3–6 days,
// green = a week or more, or no date. Finished/canceled work has no color.
// ---------------------------------------------------------------------------

export type DeadlineColor = "red" | "orange" | "yellow" | "green" | "none";

export function deadlineColor(dueOn: string | null | undefined, today: string, status?: ClientAction["status"]): DeadlineColor {
  if (status === "done" || status === "canceled") return "none";
  if (!dueOn) return "green";
  const days = daysBetween(today, dueOn);
  if (days <= 0) return "red";
  if (days <= 2) return "orange";
  if (days <= 6) return "yellow";
  return "green";
}

export const DEADLINE_STYLE: Record<DeadlineColor, { dot: string; text: string; label: string }> = {
  red: { dot: "bg-rose", text: "text-rose", label: "Due or late" },
  orange: { dot: "bg-due-orange", text: "text-due-orange", label: "Due in 1–2 days" },
  yellow: { dot: "bg-due-yellow", text: "text-due-yellow", label: "Due in 3–6 days" },
  green: { dot: "bg-lime", text: "text-lime", label: "A week or more" },
  none: { dot: "bg-white/20", text: "text-faint", label: "Finished" },
};

/** "Due today", "2 days late", "Due in 3 days", "No due date". */
export function deadlineText(dueOn: string | null | undefined, today: string): string {
  if (!dueOn) return "No due date";
  const days = daysBetween(today, dueOn);
  if (days === 0) return "Due today";
  if (days < 0) return `${-days} day${days === -1 ? "" : "s"} late`;
  return `Due in ${days} day${days === 1 ? "" : "s"}`;
}

// ---------------------------------------------------------------------------
// Due filter: overdue / this week (today + 6 days) / later / no date.
// ---------------------------------------------------------------------------

export type DueFilter = "any" | "overdue" | "week" | "soon" | "later" | "none";
export const DUE_FILTERS: { value: DueFilter; label: string }[] = [
  { value: "any", label: "Any date" },
  { value: "soon", label: "Overdue + this week" },
  { value: "overdue", label: "Overdue" },
  { value: "week", label: "Due this week" },
  { value: "later", label: "Later" },
  { value: "none", label: "No due date" },
];

export function asDueFilter(v: string | undefined): DueFilter {
  return DUE_FILTERS.some((f) => f.value === v) ? (v as DueFilter) : "any";
}

export function matchesDue(a: Pick<ClientAction, "dueOn">, filter: DueFilter, today: string): boolean {
  if (filter === "any") return true;
  if (!a.dueOn) return filter === "none";
  const days = daysBetween(today, a.dueOn);
  if (filter === "overdue") return days < 0;
  if (filter === "week") return days >= 0 && days <= 6;
  if (filter === "soon") return days <= 6;
  if (filter === "later") return days > 6;
  return false;
}

// ---------------------------------------------------------------------------
// The floating button's badge: open work orders that are overdue or urgent.
// ---------------------------------------------------------------------------

export function needsAttentionCount(actions: ClientAction[], today: string): number {
  return actions.filter(
    (a) => a.kind === "work_order" && a.status !== "done" && a.status !== "canceled" && !a.archivedAt && ((a.dueOn !== null && a.dueOn < today) || a.priority === "critical"),
  ).length;
}

// ---------------------------------------------------------------------------
// Links: up to 5, https only, no logins inside them (the database checks the same).
// ---------------------------------------------------------------------------

export const MAX_LINKS = 5;

export function cleanLinks(raw: string): { links: string[]; rejected: number } {
  const parts = raw.split(/[\s,]+/).map((p) => p.trim()).filter(Boolean);
  const ok = parts.filter((l) => l.length >= 11 && l.length <= 500 && /^https:\/\/[^\s<>"]+$/.test(l) && !/^https:\/\/[^/]*@/.test(l));
  const unique = [...new Set(ok)].slice(0, MAX_LINKS);
  return { links: unique, rejected: parts.length - unique.length };
}

/** A short name for a link: "figma.com", "docs.google.com". */
export function linkLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}

// ---------------------------------------------------------------------------
// Contact details warning (emails and phone numbers don't belong in work orders).
// Same patterns the database uses for comments and the owner summary.
// ---------------------------------------------------------------------------

const CONTACT_PATTERNS: { what: string; re: RegExp }[] = [
  { what: "an email address", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/ },
  { what: "a phone number", re: /(^|[^0-9])\(?[0-9]{3}\)?[-. ][0-9]{3}[-. ][0-9]{4}([^0-9]|$)/ },
];

/** What looks like contact details in a piece of text (empty = fine). */
export function contactDetailsIn(text: string): string[] {
  return CONTACT_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.what);
}

// ---------------------------------------------------------------------------
// Hours
// ---------------------------------------------------------------------------

/** "1.5" → 90 minutes. Empty → null. Odd values → undefined (refuse). */
export function hoursToMinutes(raw: string): number | null | undefined {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 1000) return undefined;
  return Math.round(n * 60);
}

export function hoursLabel(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "–";
  const h = minutes / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
}

// ---------------------------------------------------------------------------
// History lines, in plain words.
// ---------------------------------------------------------------------------

export interface HistoryEntry {
  at: string;
  actorName: string | null;
  field: "created" | "owner" | "status" | "due_on" | "start_on" | "priority" | "archived" | "reassign_request";
  oldValue: string | null;
  newValue: string | null;
}

const STATUS_WORD: Record<string, string> = {
  open: "New",
  in_progress: "In progress",
  waiting: "Waiting on client",
  blocked: "Blocked",
  review: "In review",
  done: "Done",
  canceled: "Canceled",
};
const PRIORITY_WORD: Record<string, string> = { critical: "Urgent", high: "High", normal: "Normal", low: "Low" };

export function historyText(h: HistoryEntry): string {
  const v = (x: string | null, words?: Record<string, string>) => (x === null ? "none" : (words?.[x] ?? x));
  switch (h.field) {
    case "created":
      return "Created";
    case "owner":
      return h.oldValue === null ? `Assigned to ${v(h.newValue)}` : h.newValue === null ? `Unassigned (was ${h.oldValue})` : `Reassigned from ${h.oldValue} to ${h.newValue}`;
    case "status":
      return `Status: ${v(h.oldValue, STATUS_WORD)} → ${v(h.newValue, STATUS_WORD)}`;
    case "due_on":
      return `Due date: ${v(h.oldValue)} → ${v(h.newValue)}`;
    case "start_on":
      return `Start date: ${v(h.oldValue)} → ${v(h.newValue)}`;
    case "priority":
      return `Priority: ${v(h.oldValue, PRIORITY_WORD)} → ${v(h.newValue, PRIORITY_WORD)}`;
    case "archived":
      return h.newValue === "restored" ? "Taken out of the archive" : "Archived";
    case "reassign_request":
      return h.newValue ? `Asked to be reassigned: ${h.newValue}` : "Reassignment request closed";
  }
}

export { STATUS_WORD, PRIORITY_WORD };
