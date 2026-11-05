"use client";

// "Log a contact" on a client's page (check-in, call, message, email, meeting, note).
// Optionally turns a commitment from the conversation into a next action. Saves to YOUR database only (never GoHighLevel).
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
      <div className="grid grid-cols-2 gap-2">
      <label className="block text-xs text-muted">
        Type
        <select name="kind" defaultValue="check_in" className="mt-1 min-h-11 w-full rounded-xl border border-line bg-white/5 px-3 text-sm text-ink">
          <option value="check_in">Check-in</option>
          <option value="call">Call</option>
          <option value="message">Message</option>
          <option value="email">Email</option>
          <option value="meeting">Meeting</option>
          <option value="note">Note</option>
        </select>
      </label>
      <label className="block text-xs text-muted">
        Date
        <input name="date" type="date" defaultValue={today} max={today} required className="mt-1 min-h-11 w-full rounded-xl border border-line bg-white/5 px-3 text-sm text-ink" />
      </label>
      </div>
      <label className="block text-xs text-muted">
        Note (optional)
        <input name="note" maxLength={500} placeholder="What did you talk about?" className="mt-1 min-h-11 w-full rounded-xl border border-line bg-white/5 px-3 text-sm text-ink" />
      </label>
      <details className="rounded-xl border border-line bg-white/[0.03] px-3 py-1">
        <summary className="pressable flex min-h-10 cursor-pointer list-none items-center text-xs font-semibold text-violet">
          + Did they ask for something? Add a next action
        </summary>
        <div className="grid grid-cols-[1fr_auto] gap-2 pb-2">
          <input name="nextTitle" maxLength={120} placeholder="e.g. Check landing page tracking" aria-label="Next action" className="min-h-11 rounded-xl border border-line bg-white/5 px-3 text-sm text-ink" />
          <input name="nextDue" type="date" aria-label="Next action due date" className="min-h-11 rounded-xl border border-line bg-white/5 px-2 text-sm text-ink" />
        </div>
      </details>
      <button type="submit" disabled={pending} className="pressable min-h-11 w-full rounded-xl bg-violet-deep text-sm font-semibold disabled:opacity-60">
        {pending ? "Saving…" : "Log contact"}
      </button>
      {state?.ok && <p role="status" className="text-xs text-lime">Saved. Health, reminders and next actions updated.</p>}
      {state?.error && <p role="alert" className="text-xs text-rose">{state.error}</p>}
    </form>
  );
}
