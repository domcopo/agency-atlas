"use client";

// Owner only: audit spending caps, the agency name on the pages, and the plan prices used
// by the Investment section. Prices are never made up: empty plans = "prices not set".

import { useActionState } from "react";
import { saveAuditSettings } from "@/app/actions";
import type { AuditPlan } from "@/lib/audit/config";

const field = "mt-1 min-h-11 w-full rounded-xl border border-line bg-white/5 px-3 text-sm text-ink placeholder:text-faint";
const label = "block text-xs text-muted";

export function AuditSettingsForm({ caps, agencyName, agencyWebsite, plans }: { caps: { perAuditUsd: number; weeklyUsd: number; monthlyUsd: number }; agencyName: string | null; agencyWebsite: string | null; plans: AuditPlan[] }) {
  const [state, action, pending] = useActionState(saveAuditSettings, undefined);
  const recIndex = plans.findIndex((p) => p.recommended);
  return (
    <form action={action} className="space-y-4">
      <fieldset>
        <legend className="text-sm font-semibold">Spending caps</legend>
        <p className="text-[11px] text-faint">The lowest one wins. The database enforces them, separate from the AI budget.</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <label className={label}>
            Per audit ($)
            <input name="perAuditUsd" inputMode="decimal" defaultValue={caps.perAuditUsd} className={field} />
          </label>
          <label className={label}>
            Per rep / week ($)
            <input name="weeklyUsd" inputMode="decimal" defaultValue={caps.weeklyUsd} className={field} />
          </label>
          <label className={label}>
            All / month ($)
            <input name="monthlyUsd" inputMode="decimal" defaultValue={caps.monthlyUsd} className={field} />
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-sm font-semibold">On every audit page</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className={label}>
            Agency name
            <input name="agencyName" maxLength={80} defaultValue={agencyName ?? ""} placeholder="Shown in each page footer" className={field} />
          </label>
          <label className={label}>
            Agency website <span className="text-faint">(optional)</span>
            <input name="agencyWebsite" maxLength={120} autoCapitalize="none" spellCheck={false} defaultValue={agencyWebsite ?? ""} placeholder="youragency.com" className={field} />
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-sm font-semibold">Plans for the Investment page</legend>
        <p className="text-[11px] text-faint">Leave a name blank to drop that plan. Hours size the 12-month roadmap.</p>
        <div className="mt-2 space-y-2">
          {[0, 1, 2, 3].map((i) => {
            const p = plans[i];
            return (
              <div key={i} className="grid grid-cols-2 gap-2 rounded-2xl bg-white/[0.03] p-2 sm:grid-cols-[1.2fr_5rem_6rem_2fr_auto] sm:items-end">
                <label className={label}>
                  Plan {i + 1}
                  <input name={`plan_name_${i}`} maxLength={40} defaultValue={p?.name ?? ""} placeholder="Name" className={field} />
                </label>
                <label className={label}>
                  Hrs / mo
                  <input name={`plan_hours_${i}`} inputMode="numeric" defaultValue={p?.hoursPerMonth ?? ""} className={field} />
                </label>
                <label className={label}>
                  $ / month
                  <input name={`plan_price_${i}`} inputMode="numeric" defaultValue={p?.priceUsd ?? ""} className={field} />
                </label>
                <label className={label}>
                  One line
                  <input name={`plan_summary_${i}`} maxLength={120} defaultValue={p?.summary ?? ""} className={field} />
                </label>
                <label className="col-span-2 flex min-h-11 items-center gap-2 text-xs text-muted sm:col-span-1">
                  <input type="radio" name="recommended" value={i} defaultChecked={recIndex === i} className="size-5 accent-violet" /> Recommended
                </label>
              </div>
            );
          })}
        </div>
      </fieldset>
      <button type="submit" disabled={pending} className="pressable min-h-11 w-full rounded-xl bg-violet-deep text-sm font-semibold disabled:opacity-60">
        {pending ? "Saving…" : "Save settings"}
      </button>
      {state?.ok && <p role="status" className="text-xs text-lime">Saved.</p>}
      {state?.error && <p role="alert" className="text-xs text-rose">{state.error}</p>}
    </form>
  );
}
