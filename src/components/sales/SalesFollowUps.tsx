// Lead follow-ups for salespeople: Done, or move it to tomorrow / next week.
// (Salespeople change their lead follow-ups only; the database refuses anything else.)

import { Check } from "lucide-react";
import Link from "next/link";
import { leadHref } from "@/components/sales/LeadRow";
import { updateAction } from "@/app/actions";
import { cn } from "@/lib/format";
import type { LeadFollowUp } from "@/lib/sales";

const btn = "pressable inline-flex min-h-10 items-center gap-1 rounded-xl border border-line bg-white/5 px-2.5 text-xs font-semibold";

export function SalesFollowUps({ items, leadNames, today, empty = "No open follow-ups. Add one below so no lead goes quiet." }: { items: LeadFollowUp[]; leadNames: Map<string, string>; today: string; empty?: string }) {
  const open = items
    .filter((f) => f.status !== "done" && f.status !== "canceled")
    .sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"));
  if (!open.length) return <p className="glass rounded-3xl px-4 py-4 text-sm text-muted">{empty}</p>;
  return (
    <div className="glass overflow-hidden rounded-3xl">
      <ol className="divide-y divide-line">
        {open.map((f) => {
          const late = f.dueOn !== null && f.dueOn < today;
          return (
            <li key={f.id} className="space-y-2 px-4 py-3">
              <div>
                <p className="text-sm font-semibold leading-snug">{f.title}</p>
                <p className={cn("text-xs", late ? "text-rose" : f.dueOn === today ? "text-amber" : "text-muted")}>
                  <Link href={leadHref(f.leadId)} className="font-semibold text-violet hover:underline">
                    {leadNames.get(f.leadId) ?? "Lead"}
                  </Link>{" "}
                  · {f.dueOn ? (late ? `late, was due ${f.dueOn}` : f.dueOn === today ? "due today" : `due ${f.dueOn}`) : "no date"}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <form action={updateAction}>
                  <input type="hidden" name="actionId" value={f.id} />
                  <input type="hidden" name="op" value="done" />
                  <button type="submit" className={cn(btn, "border-lime/40 text-lime")}>
                    <Check aria-hidden className="size-3.5" /> Done
                  </button>
                </form>
                {(["tomorrow", "week"] as const).map((p) => (
                  <form key={p} action={updateAction}>
                    <input type="hidden" name="actionId" value={f.id} />
                    <input type="hidden" name="op" value="reschedule" />
                    <input type="hidden" name="preset" value={p} />
                    <button type="submit" className={btn}>
                      {p === "tomorrow" ? "Tomorrow" : "Next week"}
                    </button>
                  </form>
                ))}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
