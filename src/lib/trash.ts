// Trash (0019, docs/TRASH_PLAN.md): words and checks for the Trash screen. Pure: no
// database, no network. The real locks live in the database (owner-only delete, only
// from Trash; tested in supabase/tests).

/** What can go to Trash. */
export type TrashKind = "client" | "item";

export function asTrashKind(v: string): TrashKind | null {
  return v === "client" || v === "item" ? v : null;
}

/** The word the owner types to delete forever. */
export const DELETE_CONFIRM = "DELETE";

export function deleteConfirmed(typed: string): boolean {
  return typed.trim() === DELETE_CONFIRM;
}

const ITEM_WORD: Record<string, string> = { work_order: "Work order", follow_up: "Follow-up", issue: "Issue" };

export function itemWord(kind: string): string {
  return ITEM_WORD[kind] ?? "Item";
}

export interface DeletionCount {
  kind: string;
  withClient: boolean;
}

/** "2 clients, 5 work orders, 1 follow-up" from the deletion record (no names in it). */
export function deletionSummary(rows: DeletionCount[]): string {
  const order = ["client", "work_order", "follow_up", "issue"];
  const words: Record<string, [string, string]> = {
    client: ["client", "clients"],
    work_order: ["work order", "work orders"],
    follow_up: ["follow-up", "follow-ups"],
    issue: ["issue", "issues"],
  };
  const parts: string[] = [];
  for (const k of order) {
    const n = rows.filter((r) => r.kind === k).length;
    if (n) parts.push(`${n} ${words[k]![n === 1 ? 0 : 1]}`);
  }
  return parts.join(", ") || "nothing";
}
