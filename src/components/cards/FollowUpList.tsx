"use client";

// Today's top follow-ups with prospects, ranked: red (overdue) and gold (hot) first.
// Checking an item only changes this screen — nothing is saved or sent anywhere
// (no database yet, and GoHighLevel is never written to).

import { Check, Crown, PartyPopper, Siren } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn, describeDue } from "@/lib/format";
import type { FollowUp, Grade } from "@/lib/types";
import { GradeBadge } from "@/components/labels/labels";

const urgencyStyle = {
  red: { row: "bg-gradient-to-r from-rose/15 to-transparent", bar: "bg-rose", word: "Overdue", icon: Siren, iconColor: "text-rose" },
  gold: { row: "bg-gradient-to-r from-amber/15 to-transparent", bar: "bg-amber", word: "Hot prospect", icon: Crown, iconColor: "text-amber" },
  normal: { row: "", bar: "bg-transparent", word: "", icon: null, iconColor: "" },
} as const;

const rank = { red: 0, gold: 1, normal: 2 } as const;

export function FollowUpList({
  items,
  prospects,
  today,
}: {
  items: FollowUp[];
  /** Name and grade for each prospect id. */
  prospects: Record<string, { name: string; grade: Grade }>;
  today: string;
}) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const sorted = [...items].sort((a, b) => rank[a.urgency] - rank[b.urgency] || a.due.localeCompare(b.due));
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
        <p className="flex items-center gap-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <span aria-hidden className="size-2 rounded-full bg-rose" /> Overdue
          </span>
          <span className="inline-flex items-center gap-1">
            <span aria-hidden className="size-2 rounded-full bg-amber" /> Hot
          </span>
        </p>
        <p className="text-xs text-muted" aria-live="polite">
          {done.size} of {items.length} done
        </p>
      </div>

      <ul className="mt-2 divide-y divide-line">
        {sorted.map((item) => {
          const isDone = done.has(item.id);
          const style = urgencyStyle[item.urgency];
          const p = prospects[item.prospectId];
          const Icon = style.icon;
          return (
            <li key={item.id} className={cn("relative flex items-center gap-3 px-4 py-3", !isDone && style.row)}>
              <span aria-hidden className={cn("absolute inset-y-2 left-0 w-1 rounded-r-full", !isDone && style.bar)} />
              <button
                type="button"
                onClick={() => toggle(item.id)}
                aria-pressed={isDone}
                aria-label={`${isDone ? "Mark not done" : "Mark done"}: ${item.title}`}
                className={cn(
                  "pressable flex size-8 shrink-0 items-center justify-center rounded-full border-2",
                  isDone ? "border-transparent bg-gradient-to-br from-lime to-teal text-bg" : "border-white/20 hover:border-violet",
                )}
              >
                {isDone && <Check key="on" aria-hidden className="animate-check-pop size-4" strokeWidth={3} />}
              </button>
              <div className="min-w-0 flex-1">
                <p className={cn("flex items-center gap-1.5 text-sm font-semibold", isDone && "text-faint line-through")}>
                  {Icon && !isDone && <Icon aria-hidden className={cn("size-3.5 shrink-0", style.iconColor)} />}
                  {style.word && <span className="sr-only">{style.word}: </span>}
                  <span className="truncate">{item.title}</span>
                </p>
                <p className="mt-0.5 truncate text-xs text-muted">
                  <span className={cn(item.due < today && !isDone && "font-semibold text-rose")}>
                    {describeDue(item.due, today)}
                  </span>{" "}
                  ·{" "}
                  <Link href={`/sales/${item.prospectId}`} className="font-medium text-ink/80 hover:text-ink">
                    {p?.name ?? "Unknown prospect"}
                  </Link>
                </p>
                <p className="mt-0.5 truncate text-[11px] text-faint">{item.why}</p>
              </div>
              {p && <GradeBadge grade={p.grade} />}
            </li>
          );
        })}
      </ul>

      {allDone && (
        <p className="animate-rise-in flex items-center justify-center gap-2 border-t border-line px-4 py-3 text-sm font-semibold text-lime">
          <PartyPopper aria-hidden className="size-4" />
          All caught up. Nice work.
        </p>
      )}
      <p className="border-t border-line px-4 py-2 text-[11px] text-faint">
        Sample prospects. Grades are hand-set for now and always show their reasons. Checkmarks reset
        on reload; nothing is saved or sent.
      </p>
    </div>
  );
}
