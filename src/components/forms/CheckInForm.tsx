"use client";

// "Log check-in" on a client's page. Saves to YOUR database only (never GoHighLevel).

import { useActionState } from "react";
import { logCheckIn } from "@/app/actions";

export function CheckInForm({ clientId, slug, today }: { clientId: string; slug: string; today: string }) {
  const [state, action, pending] = useActionState(logCheckIn, undefined);
  return (
    <form action={action} className="space-y-2.5">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="slug" value={slug} />
      <div className="flex gap-2">
        <label className="flex-1 text-xs text-muted">
          Date
          <input name="date" type="date" defaultValue={today} max={today} required className="mt-1 min-h-11 w-full rounded-xl border border-line bg-white/5 px-3 text-sm text-ink" />
        </label>
      </div>
      <label className="block text-xs text-muted">
        Note (optional)
        <input name="note" maxLength={500} placeholder="How are they doing?" className="mt-1 min-h-11 w-full rounded-xl border border-line bg-white/5 px-3 text-sm text-ink" />
      </label>
      <button type="submit" disabled={pending} className="pressable min-h-11 w-full rounded-xl bg-violet-deep text-sm font-semibold disabled:opacity-60">
        {pending ? "Saving…" : "Log check-in"}
      </button>
      {state?.ok && <p role="status" className="text-xs text-lime">Saved. Reminders updated.</p>}
      {state?.error && <p role="alert" className="text-xs text-rose">{state.error}</p>}
    </form>
  );
}
