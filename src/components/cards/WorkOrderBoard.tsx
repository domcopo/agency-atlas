"use client";

// Work order board (Work hub Board view, docs/WORK_HUB_PLAN.md Phase 4): one column per
// status. On a computer, drag a card to another column; on a phone or with a keyboard, use
// "Move to" on the card. Both post to the same server action as every other status change
// (the server and the database check who may do what). No extra packages: the browser's
// own drag-and-drop. A card's title opens the side drawer.

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { updateAction } from "@/app/actions";
import { announceChange } from "@/components/work/UndoToast";
import { cn } from "@/lib/format";

export interface BoardCard {
  id: string;
  title: string;
  client: string | null;
  owner: string | null;
  ownerInitials: string | null;
  status: "open" | "in_progress" | "waiting" | "blocked" | "review" | "done";
  /** "Nov 20 · 5d late", "Today", … and how loud to show it (red only when late). */
  due: { text: string; tone: "late" | "today" | "soon" | "later" | "none" };
  urgent: boolean;
  /** Kept so Undo can put a blocked card back with its reason. */
  blockedReason?: string | null;
  /** Where the title goes (the Work hub drawer). */
  href: string;
}

const COLUMNS: { id: BoardCard["status"]; label: string; dot: string }[] = [
  { id: "open", label: "To do", dot: "bg-muted" },
  { id: "in_progress", label: "In progress", dot: "bg-sky" },
  { id: "waiting", label: "Waiting", dot: "bg-amber" },
  { id: "blocked", label: "Blocked", dot: "bg-rose" },
  { id: "review", label: "Review", dot: "bg-violet" },
  { id: "done", label: "Done", dot: "bg-lime" },
];

const DUE_TONE: Record<BoardCard["due"]["tone"], string> = {
  late: "text-rose font-semibold",
  today: "text-amber font-semibold",
  soon: "text-ink",
  later: "text-muted",
  none: "text-faint",
};

function move(id: string, status: BoardCard["status"]) {
  const fd = new FormData();
  fd.set("actionId", id);
  fd.set("op", "status");
  fd.set("status", status);
  return updateAction(fd);
}

export function WorkOrderBoard({ cards, openId }: { cards: BoardCard[]; openId?: string }) {
  const [, startTransition] = useTransition();
  const [over, setOver] = useState<BoardCard["status"] | null>(null);
  const [shown, setShown] = useOptimistic(cards, (state, change: { id: string; status: BoardCard["status"] }) => state.map((c) => (c.id === change.id ? { ...c, status: change.status } : c)));
  const go = (id: string, status: BoardCard["status"]) =>
    startTransition(async () => {
      const card = shown.find((c) => c.id === id);
      setShown({ id, status });
      await move(id, status);
      if (card) announceChange({ id, message: `Moved to ${COLUMNS.find((c) => c.id === status)?.label ?? status}: ${card.title}`, before: { status: card.status, reason: card.blockedReason } });
    });

  return (
    <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-2 lg:mx-0 lg:px-0" aria-label="Work order board">
      {COLUMNS.map((col) => {
        const items = shown.filter((c) => c.status === col.id);
        return (
          <section
            key={col.id}
            aria-label={col.label}
            onDragOver={(e) => {
              e.preventDefault();
              if (over !== col.id) setOver(col.id);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const id = e.dataTransfer.getData("text/plain");
              if (id && shown.some((c) => c.id === id && c.status !== col.id)) go(id, col.id);
            }}
            className={cn(
              "flex w-64 shrink-0 snap-start flex-col rounded-2xl border bg-white/[0.02] p-2 lg:w-auto lg:min-w-40 lg:flex-1",
              over === col.id ? "border-violet bg-violet/[0.08]" : "border-line",
            )}
          >
            <h3 className="mb-2 flex min-h-8 items-center gap-2 px-2 text-sm font-semibold">
              <span className={cn("size-2 rounded-full", col.dot)} aria-hidden />
              {col.label}
              <span className="ml-auto rounded-full bg-white/[0.07] px-2 text-xs tabular-nums text-muted">{items.length}</span>
            </h3>
            <ul className="min-h-24 flex-1 space-y-2">
              {items.map((c) => (
                <li
                  key={c.id}
                  data-hub-row
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", c.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  className={cn(
                    "group cursor-grab rounded-xl border bg-panel p-3 active:cursor-grabbing",
                    c.id === openId ? "border-violet shadow-[inset_3px_0_0_var(--color-violet)]" : "border-line hover:border-white/20",
                  )}
                >
                  <Link href={c.href} scroll={false} data-row-open className="block text-sm font-semibold leading-snug hover:underline">
                    {c.urgent && <span className="text-due-orange">Urgent · </span>}
                    {c.title}
                  </Link>
                  <p className="mt-1 truncate text-xs text-muted">{c.client ?? "No client"}</p>
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    {c.ownerInitials ? (
                      <span title={c.owner ?? undefined} className="flex size-6 shrink-0 items-center justify-center rounded-full bg-violet/20 text-[10px] font-bold text-ink">
                        {c.ownerInitials}
                        <span className="sr-only">Assigned to {c.owner}</span>
                      </span>
                    ) : (
                      <span className="rounded-full border border-amber/40 px-2 text-[11px] font-semibold text-amber">Unassigned</span>
                    )}
                    <span className={cn("ml-auto truncate", DUE_TONE[c.due.tone])}>{c.due.text}</span>
                  </div>
                  <label className="mt-2 block lg:sr-only lg:group-focus-within:not-sr-only lg:group-hover:not-sr-only">
                    <span className="sr-only">Move “{c.title}” to</span>
                    <select
                      value=""
                      onChange={(e) => e.target.value && go(c.id, e.target.value as BoardCard["status"])}
                      className="min-h-9 w-full rounded-lg border border-line bg-white/5 px-2 text-xs text-muted"
                    >
                      <option value="">Move to…</option>
                      {COLUMNS.filter((s) => s.id !== c.status).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </li>
              ))}
              {items.length === 0 && <li className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-xs text-faint">Drop here</li>}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
