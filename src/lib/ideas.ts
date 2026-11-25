// Ideas inbox and personal goals (0036, docs/ROLE_GUIDES_PLAN.md). Pure, tested.
// Anyone sends an idea (saved under their own login); only the owner reads everyone's.
// Nothing here is ever sent anywhere or given to the AI.

import { findSecrets } from "@/lib/kit";

export type IdeaKind = "feature" | "easier" | "broken";
export type IdeaStatus = "new" | "reviewing" | "planned" | "done" | "not_now";

export const IDEA_KINDS: { kind: IdeaKind; label: string }[] = [
  { kind: "feature", label: "A new feature" },
  { kind: "easier", label: "Make something easier" },
  { kind: "broken", label: "Something's broken" },
];
export const IDEA_STATUSES: { status: IdeaStatus; label: string }[] = [
  { status: "new", label: "New" },
  { status: "reviewing", label: "Looking at it" },
  { status: "planned", label: "Planned" },
  { status: "done", label: "Done" },
  { status: "not_now", label: "Not now" },
];
export const ideaKindLabel = (k: IdeaKind) => IDEA_KINDS.find((x) => x.kind === k)?.label ?? k;
export const ideaStatusLabel = (s: IdeaStatus) => IDEA_STATUSES.find((x) => x.status === s)?.label ?? s;
export const asIdeaKind = (v: unknown): IdeaKind | null => (IDEA_KINDS.some((x) => x.kind === v) ? (v as IdeaKind) : null);
export const asIdeaStatus = (v: unknown): IdeaStatus | null => (IDEA_STATUSES.some((x) => x.status === v) ? (v as IdeaStatus) : null);

/** Same numbers as the database (0036). */
export const IDEA_RULES = { title: 120, details: 4000, reply: 500, perDay: 10 } as const;

export interface Idea {
  id: string;
  kind: IdeaKind;
  title: string;
  details: string;
  status: IdeaStatus;
  reply: string | null;
  createdAt: string;
  /** Sender's name: filled in only for the owner's inbox. */
  from: string | null;
  mine: boolean;
}

export interface PersonGoal {
  id: string;
  userId: string;
  goal: string;
  dueOn: string | null;
  doneAt: string | null;
}

const clean = (s: string, max: number) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);

/** Checks a new idea. Returns the cleaned idea or a plain-English reason. */
export function checkIdea(input: { kind: unknown; title: unknown; details: unknown }): { ok: true; idea: { kind: IdeaKind; title: string; details: string } } | { ok: false; error: string } {
  const kind = asIdeaKind(input.kind);
  if (!kind) return { ok: false, error: "Pick what kind of idea it is." };
  const title = clean(typeof input.title === "string" ? input.title.replace(/\s+/g, " ") : "", IDEA_RULES.title);
  if (!title) return { ok: false, error: "Give it a short title." };
  const details = clean(typeof input.details === "string" ? input.details.replace(/\r\n?/g, "\n") : "", IDEA_RULES.details);
  const secret = findSecrets(`${title}\n${details}`);
  if (secret) return { ok: false, error: secret };
  return { ok: true, idea: { kind, title, details } };
}

/** Checks a goal's text and optional date (YYYY-MM-DD). */
export function checkGoal(goalRaw: unknown, dueRaw: unknown): { ok: true; goal: string; dueOn: string | null } | { ok: false; error: string } {
  const goal = clean(typeof goalRaw === "string" ? goalRaw.replace(/\s+/g, " ") : "", 300);
  if (!goal) return { ok: false, error: "Write the goal." };
  const secret = findSecrets(goal);
  if (secret) return { ok: false, error: secret };
  const due = typeof dueRaw === "string" ? dueRaw.trim() : "";
  if (due && !(/^\d{4}-\d{2}-\d{2}$/.test(due) && !Number.isNaN(Date.parse(`${due}T00:00:00Z`)))) return { ok: false, error: "That date doesn't look right." };
  return { ok: true, goal, dueOn: due || null };
}

/** Open goals first (soonest date first), then done ones (most recent first). */
export function sortGoals(goals: readonly PersonGoal[]): PersonGoal[] {
  return [...goals].sort((a, b) => {
    if (!a.doneAt !== !b.doneAt) return a.doneAt ? 1 : -1;
    if (a.doneAt && b.doneAt) return b.doneAt.localeCompare(a.doneAt);
    return (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999") || a.goal.localeCompare(b.goal);
  });
}
