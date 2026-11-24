"use client";

// Owner only: the Google Ads management plans shown on the Ads audit's plan page. Prices are
// never made up: no plans = "prices not set". The ad budget itself is paid to Google, so it
// isn't a plan price.

import { useActionState } from "react";
import { saveAdsPlans } from "@/app/actions";
import type { AdsPlan } from "@/lib/audit/ads";

const field = "mt-1 min-h-11 w-full rounded-xl border border-line bg-white/5 px-3 text-sm text-ink placeholder:text-faint";

export function AdsPlansForm({ plans, ready }: { plans: AdsPlan[]; ready: boolean }) {
  const [state, action, pending] = useActionState(saveAdsPlans, undefined);
  const recIndex = plans.findIndex((p) => p.recommended);
  if (!ready) return <p className="text-xs text-faint">Google Ads prices need one setup step first (0029 SQL).</p>;
  return (
    <form action={action} className="space-y-2">
      <p className="text-sm font-semibold">Google Ads management plans</p>
      <p className="text-[11px] text-faint">Your monthly fee for running their ads (the ad budget is paid to Google separately). Leave a row empty to skip it.</p>
      {[0, 1, 2, 3].map((n) => {
        const p = plans[n];
        return (
          <div key={n} className="grid grid-cols-[1fr_6.5rem] gap-2 rounded-2xl bg-white/[0.03] p-2 sm:grid-cols-[1fr_6.5rem_1.4fr_auto]">
            <input name={`ads_name_${n}`} aria-label={`Ads plan ${n + 1} name`} defaultValue={p?.name ?? ""} placeholder="Plan name" maxLength={40} className={field} />
            <input name={`ads_fee_${n}`} aria-label={`Ads plan ${n + 1} monthly fee`} inputMode="numeric" defaultValue={p?.feeUsd ?? ""} placeholder="$/month" className={field} />
            <input name={`ads_summary_${n}`} aria-label={`Ads plan ${n + 1} summary`} defaultValue={p?.summary ?? ""} placeholder="What's included" maxLength={120} className={`${field} col-span-2 sm:col-span-1`} />
            <label className="col-span-2 flex min-h-11 items-center gap-2 text-xs text-muted sm:col-span-1">
              <input type="radio" name="recommended" value={n} defaultChecked={recIndex === n} className="size-4 accent-violet" /> Recommended
            </label>
          </div>
        );
      })}
      {state?.error && <p role="alert" className="text-xs text-rose">{state.error}</p>}
      {state?.ok && <p className="text-xs text-lime">Saved.</p>}
      <button type="submit" disabled={pending} className="pressable min-h-11 rounded-xl bg-violet-deep px-4 text-sm font-semibold disabled:opacity-60">
        {pending ? "Saving…" : "Save Google Ads prices"}
      </button>
    </form>
  );
}
