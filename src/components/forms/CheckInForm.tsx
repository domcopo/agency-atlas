"use client";

// "Log check-in" on a client's page. Saves to YOUR database only (never GoHighLevel).
// "How are they doing?" is optional; the latest answer moves the health score:
// worse -20, better +10, same no change.

import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { useActionState, useState } from "react";
import { logCheckIn } from "@/app/actions";
import { cn } from "@/lib/format";
import type { CheckInMood } from "@/lib/types";

const moods: { id: CheckInMood; label: string; icon: typeof ArrowRight; on: string }[] = [
  { id: "better", label: "Better", icon: ArrowUpRight, on: "border-lime/60 bg-lime/15 text-lime" },
  { id: "same", label: "Same", icon: ArrowRight, on: "border-line bg-white/10 text-ink" },
  { id: "worse", label: "Worse", icon: ArrowDownRight, on: "border-rose/60 bg-rose/15 text-rose" },
];

export function CheckInForm({ clientId, slug, today }: { clientId: string; slug: string; today: string }) {
  const [state, action, pending] = useActionState(logCheckIn, undefined);
  const [mood, setMood] = useState<CheckInMood | "">("");
  return (
    <form action={action} onSubmit={() => setTimeout(() => setMood(""), 0)} className="space-y-2.5">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="mood" value={mood} />
      <fieldset>
        <legend className="text-xs text-muted">How are they doing? (optional)</legend>
        <div className="mt-1 grid grid-cols-3 gap-2">
          {moods.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={mood === m.id}
              onClick={() => setMood(mood === m.id ? "" : m.id)}
              className={cn(
                "pressable flex min-h-11 items-center justify-center gap-1 rounded-xl border text-sm font-semibold",
                mood === m.id ? m.on : "border-line bg-white/5 text-muted",
              )}
            >
              <m.icon aria-hidden className="size-4" />
              {m.label}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="block text-xs text-muted">
        Date
        <input name="date" type="date" defaultValue={today} max={today} required className="mt-1 min-h-11 w-full rounded-xl border border-line bg-white/5 px-3 text-sm text-ink" />
      </label>
      <label className="block text-xs text-muted">
        Note (optional)
        <input name="note" maxLength={500} placeholder="What did you talk about?" className="mt-1 min-h-11 w-full rounded-xl border border-line bg-white/5 px-3 text-sm text-ink" />
      </label>
      <button type="submit" disabled={pending} className="pressable min-h-11 w-full rounded-xl bg-violet-deep text-sm font-semibold disabled:opacity-60">
        {pending ? "Saving…" : "Log check-in"}
      </button>
      {state?.ok && <p role="status" className="text-xs text-lime">Saved. Health and reminders updated.</p>}
      {state?.error && <p role="alert" className="text-xs text-rose">{state.error}</p>}
    </form>
  );
}
