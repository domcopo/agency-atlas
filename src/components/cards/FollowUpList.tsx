"use client";

// Follow-up checklist. Checking an item only changes this screen — nothing is
// saved or sent anywhere (Phase 1 has no database, and GHL is never written to).

import { Check, PartyPopper } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn, formatShortDate } from "@/lib/format";
import type { FollowUp } from "@/lib/types";
import { Pill } from "@/components/labels/labels";

const priorityColor = { high: "rose", medium: "amber", low: "neutral" } as const;

export function FollowUpList({
  items,
  clientNames,
}: {
  items: FollowUp[];
  clientNames: Record<string, string>;
}) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const allDone = items.length > 0 && done.size === items.length;

  function toggle(id: string) {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="glass overflow-hidden rounded-3xl">
      <div className="flex items-center justify-between px-4 pt-3.5">
        <p className="text-xs text-muted" aria-live="polite">
          {done.size} of {items.length} done
        </p>
        <div
          className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-label="Follow-ups completed"
          aria-valuemin={0}
          aria-valuemax={items.length}
          aria-valuenow={done.size}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet to-teal transition-[width] duration-500"
            style={{ width: `${items.length ? (done.size / items.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      <ul className="divide-y divide-line">
        {items.map((item) => {
          const isDone = done.has(item.id);
          return (
            <li key={item.id} className="flex items-center gap-3 px-4 py-3">
              <button
                type="button"
                onClick={() => toggle(item.id)}
                aria-pressed={isDone}
                aria-label={`${isDone ? "Mark not done" : "Mark done"}: ${item.title}`}
                className={cn(
                  "pressable flex size-8 shrink-0 items-center justify-center rounded-full border-2",
                  isDone
                    ? "border-transparent bg-gradient-to-br from-lime to-teal text-bg"
                    : "border-white/20 hover:border-violet",
                )}
              >
                {isDone && <Check key="on" aria-hidden className="animate-check-pop size-4" strokeWidth={3} />}
              </button>
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm font-medium transition-colors", isDone && "text-faint line-through")}>
                  {item.title}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  <Link href={`/clients/${item.clientId}`} className="hover:text-ink">
                    {clientNames[item.clientId] ?? "Unknown client"}
                  </Link>{" "}
                  · due {formatShortDate(item.due)}
                </p>
              </div>
              <Pill color={priorityColor[item.priority]} className="capitalize">
                {item.priority}
              </Pill>
            </li>
          );
        })}
      </ul>

      {allDone && (
        <p className="animate-rise-in flex items-center justify-center gap-2 border-t border-line px-4 py-3 text-sm font-semibold text-lime">
          <PartyPopper aria-hidden className="size-4" />
          All caught up — nice work.
        </p>
      )}
      <p className="border-t border-line px-4 py-2 text-[11px] text-faint">
        Demo only: checkmarks reset when you reload. Nothing is saved or sent.
      </p>
    </div>
  );
}
