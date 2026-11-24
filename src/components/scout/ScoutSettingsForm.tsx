"use client";

// Owner: the Scout caps. The database enforces the same numbers (0024).

import { useActionState } from "react";
import { saveScoutSettings } from "@/app/actions";

const field = "mt-1 min-h-11 w-full rounded-xl border border-line bg-white/5 px-3 text-sm text-ink";

export function ScoutSettingsForm({ monthlyUsd, perRepMonthlyUsd, revisitDays }: { monthlyUsd: number; perRepMonthlyUsd: number; revisitDays: number }) {
  const [state, action, pending] = useActionState(saveScoutSettings, undefined);
  return (
    <form action={action} className="space-y-2.5">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <label className="block text-xs text-muted">
          Everyone, per month ($)
          <input name="monthlyUsd" type="number" min={0} max={1000} step="0.01" defaultValue={monthlyUsd} className={field} />
        </label>
        <label className="block text-xs text-muted">
          Each salesperson, per month ($)
          <input name="perRepMonthlyUsd" type="number" min={0} max={1000} step="0.01" defaultValue={perRepMonthlyUsd} className={field} />
        </label>
        <label className="block text-xs text-muted">
          &quot;Not interested&quot; can be tried again after (days)
          <input name="revisitDays" type="number" min={7} max={730} defaultValue={revisitDays} className={field} />
        </label>
      </div>
      <button type="submit" disabled={pending} className="pressable min-h-11 w-full rounded-xl bg-violet-deep text-sm font-semibold disabled:opacity-60">
        {pending ? "Saving…" : "Save caps"}
      </button>
      {state?.ok && <p role="status" className="text-xs text-lime">Saved.</p>}
      {state?.error && <p role="alert" className="text-xs text-rose">{state.error}</p>}
    </form>
  );
}
