"use client";

// Work order board: one column per status. On a computer, drag a card to another column;
// on a phone, tap "Move to" on the card. Both post to the same server action as every other
// status change (the server and the database check who may do what). No extra packages:
// the browser's own drag-and-drop.

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { updateAction } from "@/app/actions";
import { cn } from "@/lib/format";
import { DEADLINE_STYLE, STATUS_WORD, type DeadlineColor } from "@/lib/work-orders";

export interface BoardCard {
  id: string;
  title: string;
  client: string | null;
  owner: string | null;
  status: "open" | "in_progress" | "waiting" | "blocked" | "review" | "done";
  color: DeadlineColor;
  deadline: string;
  urgent: boolean;
}

const COLUMNS: BoardCard["status"][] = ["open", "in_progress", "waiting", "blocked", "review", "done"];

function move(id: string, status: BoardCard["status"]) {
  const fd = new FormData();
  fd.set("actionId", id);
  fd.set("op", "status");
  fd.set("status", status);
  return updateAction(fd);
}

export function WorkOrderBoard({ cards }: { cards: BoardCard[] }) {
  const [, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(cards, (state, change: { id: string; status: BoardCard["status"] }) => state.map((c) => (c.id === change.id ? { ...c, status: change.status } : c)));
  const go = (id: string, status: BoardCard["status"]) =>
    startTransition(async () => {
      setShown({ id, status });
      await move(id, status);
    });

  return (
    <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2" aria-label="Work order board">
      {COLUMNS.map((col) => {
        const items = shown.filter((c) => c.status === col);
        return (
          <section
            key={col}
            aria-label={STATUS_WORD[col]}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain");
              if (id && shown.some((c) => c.id === id && c.status !== col)) go(id, col);
            }}
            className="glass w-64 shrink-0 snap-start rounded-3xl p-2.5"
          >
            <h3 className="mb-2 flex items-baseline justify-between px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
              {STATUS_WORD[col]}
              <span className="text-faint">{items.length}</span>
            </h3>
            <ul className="min-h-16 space-y-2">
              {items.map((c) => (
                <li
                  key={c.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)}
                  className="rounded-2xl border border-line bg-white/[0.04] p-2.5"
                >
                  <Link href={`/work/orders/${c.id}`} className="block">
                    <span className="flex items-start gap-1.5">
                      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", DEADLINE_STYLE[c.color].dot)} aria-hidden />
                      <span className="text-sm font-semibold leading-snug">
                        {c.urgent && <span className="text-rose">Urgent · </span>}
                        {c.title}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted">
                      {c.client ?? "No client"} · {c.owner ?? "No one"}
                    </span>
                    <span className={cn("block text-[11px]", DEADLINE_STYLE[c.color].text)}>{c.deadline}</span>
                  </Link>
                  <label className="mt-1.5 block">
                    <span className="sr-only">Move “{c.title}” to</span>
                    <select
                      value=""
                      onChange={(e) => e.target.value && go(c.id, e.target.value as BoardCard["status"])}
                      className="min-h-9 w-full rounded-lg border border-line bg-white/5 px-2 text-xs text-muted"
                    >
                      <option value="">Move to…</option>
                      {COLUMNS.filter((s) => s !== c.status).map((s) => (
                        <option key={s} value={s}>
                          {STATUS_WORD[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
