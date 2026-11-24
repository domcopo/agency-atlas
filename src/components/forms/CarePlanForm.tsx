"use client";

// Owner only: add or edit a plan tier (name, order, hours, what's included, rhythm).
// No prices here: each client's amount is set on the client.

import { useActionState } from "react";
import { saveCarePlan } from "@/app/actions";
import type { CarePlan, Service } from "@/lib/types";

const field = "mt-1 min-h-11 w-full rounded-xl border border-line bg-white/5 px-3 text-sm text-ink";

export function CarePlanForm({ plan, service, nextRank }: { plan?: CarePlan; service: Service; nextRank: number }) {
  const [state, action, pending] = useActionState(saveCarePlan, undefined);
  return (
    <form action={action} className="space-y-2.5">
      {plan && <input type="hidden" name="id" value={plan.id} />}
      <input type="hidden" name="service" value={plan?.service ?? service} />
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-2">
        <label className="block text-xs text-muted">
          Tier name
          <input name="name" required maxLength={40} defaultValue={plan?.name} placeholder="e.g. Growth" className={field} />
        </label>
        <label className="block text-xs text-muted">
          Order
          <input name="rank" inputMode="numeric" required maxLength={2} defaultValue={plan?.rank ?? nextRank} className={field} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs text-muted">
          Hours a month (cap)
          <input name="hours" inputMode="decimal" maxLength={5} defaultValue={plan?.hoursPerMonth ?? ""} placeholder="e.g. 10" className={field} />
        </label>
        <label className="block text-xs text-muted">
          Heat maps a month
          <input name="heatMaps" inputMode="numeric" maxLength={1} defaultValue={plan?.heatMapsPerMonth ?? ""} placeholder="e.g. 2" className={field} />
        </label>
        <label className="block text-xs text-muted">
          Report every (days)
          <input name="reportEveryDays" inputMode="numeric" required maxLength={3} defaultValue={plan?.reportEveryDays ?? 30} className={field} />
        </label>
        <label className="block text-xs text-muted">
          Competitor review every (months)
          <input name="competitorReviewMonths" inputMode="numeric" maxLength={2} defaultValue={plan?.competitorReviewMonths ?? 0} className={field} />
          <span className="mt-0.5 block text-[11px] text-faint">0 = never, 3 = quarterly</span>
        </label>
      </div>
      <label className="block text-xs text-muted">
        What&apos;s included (one per line)
        <textarea
          name="includes"
          rows={4}
          maxLength={1300}
          defaultValue={plan?.includes.join("\n") ?? ""}
          placeholder={"Up to 10 hours of SEO work a month\nMonthly SEO report"}
          className="mt-1 w-full rounded-xl border border-line bg-white/5 px-3 py-2 text-sm text-ink"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex min-h-10 items-center gap-2 text-xs text-muted">
          <input type="checkbox" name="midMonth" defaultChecked={plan?.midMonthCheckIn ?? true} className="size-4 accent-violet-500" /> Mid-month check-in
        </label>
        <label className="inline-flex min-h-10 items-center gap-2 text-xs text-muted">
          <input type="checkbox" name="topTier" defaultChecked={plan?.topTier} className="size-4 accent-violet-500" /> Top tier (counts as important)
        </label>
      </div>
      <button type="submit" disabled={pending} className="pressable min-h-11 w-full rounded-xl bg-violet-deep text-sm font-semibold disabled:opacity-60">
        {pending ? "Saving…" : plan ? "Save tier" : "Add tier"}
      </button>
      {state?.error && (
        <p role="alert" className="text-xs text-rose">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="text-xs text-lime">
          Saved.
        </p>
      )}
    </form>
  );
}
